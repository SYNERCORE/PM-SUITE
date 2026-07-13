// ── Merge Library ─────────────────────────────────────────
// Pure, side-effect-free functions used by the SharePoint sync layer to
// combine a local snapshot with a remote one. Extracted from sync.js so:
//
//   1. Unit tests can exercise the REAL production code instead of an
//      in-sync copy. See tests/unit/merge.test.js.
//   2. The upcoming local-SQL-server backend can reuse the same rules
//      without dragging in sync.js's SharePoint I/O.
//   3. Regressions in the merge semantics (there have been several —
//      commits ebd6899, 4de3011, 21367fc) fail a test in <1 second
//      instead of surfacing as data loss weeks later.
//
// Each function is documented with the semantic it upholds. sync.js keeps
// its existing function names as thin wrappers so no other module needs to
// know these moved.

const Merge = (function () {

  // ── Project period-overlap rule ─────────────────────────
  // Used by every period-scoped view (Dashboard filter tabs, KPI Analytics,
  // Advanced Analytics, Reports). A project is in scope for the period when
  // its execution window overlaps the range: start <= period_end AND
  // (completedDate || endDate || period_end) >= period_start.
  //
  // Guards against three past bugs:
  //   - The dashboard used to require startDate >= cutoff, which excluded
  //     projects that crossed year boundaries (commit 2725a4d fix).
  //   - The KPI page treated missing endDate as "excluded"; now falls back
  //     to period_end so an active project without an end still counts.
  //   - Undefined-date projects return false rather than crashing.
  function projectOverlapsRange(p, rangeStart, rangeEnd) {
    if (!p || !rangeStart || !rangeEnd) return false;
    const startStr = p.startDate || p._createdAt;
    if (!startStr) return false;
    const s = new Date(('' + startStr).length > 10 ? startStr : (startStr + 'T00:00:00'));
    if (isNaN(s)) return false;
    const endStr = p.completedDate || p.endDate;
    const e = endStr
      ? new Date(('' + endStr).length > 10 ? endStr : (endStr + 'T00:00:00'))
      : rangeEnd;
    if (isNaN(e)) return false;
    return s <= rangeEnd && e >= rangeStart;
  }

  // ── Append-only sub-array union ─────────────────────────
  // updates, comments, attachments, notes, wfActions — each entry is
  // immutable once added and carries an .at timestamp. Merging simply
  // unions the two sets by .at so no history entry is lost when both
  // sides added entries between syncs.
  function appendArrays(base, donor) {
    if (!donor) return base;
    const APPEND_FIELDS = ['updates', 'comments', 'attachments', 'notes', 'wfActions'];
    let merged = base;
    APPEND_FIELDS.forEach(field => {
      const baseArr = Array.isArray(base[field]) ? base[field] : [];
      const donorArr = Array.isArray(donor[field]) ? donor[field] : [];
      if (donorArr.length === 0) return;
      const baseAts = new Set(baseArr.map(u => u && u.at).filter(Boolean));
      const extra = donorArr.filter(u => u && u.at && !baseAts.has(u.at));
      if (extra.length > 0) {
        merged = Object.assign({}, merged, {
          [field]: [...baseArr, ...extra].sort((a, b) => ((a && a.at || '') < (b && b.at || '') ? -1 : 1))
        });
      }
    });
    return merged;
  }

  // ── Array-of-records merge (the SP sync workhorse) ──────
  // opts:
  //   wasDeleted: (id) => bool     — filters out records deleted locally
  //   onConflict: ({id, label}) => void — called when remote wins over a
  //     locally-edited record (used by sync.js to surface a conflict badge)
  // Semantics:
  //   - Records present in both sides: whichever carries the newer _mAt
  //     wins the field values. Missing _mAt on one side means the other
  //     wins. Both missing → localEdited flag breaks the tie.
  //   - Append-only sub-arrays are unioned regardless of winner via
  //     appendArrays.
  //   - Records only on one side survive as-is (subject to wasDeleted).
  function arrays(localArr, remoteArr, localEdited, opts) {
    opts = opts || {};
    const wasDeleted = typeof opts.wasDeleted === 'function' ? opts.wasDeleted : () => false;
    const onConflict = typeof opts.onConflict === 'function' ? opts.onConflict : () => {};
    if (!remoteArr.length && !localArr.length) return [];
    const remoteMap = new Map(remoteArr.map(r => [r.id, r]));
    const localMap = new Map(localArr.map(r => [r.id, r]));
    const result = [];
    remoteArr.forEach(remoteRec => {
      if (wasDeleted(remoteRec.id)) return;
      const localRec = localMap.get(remoteRec.id);
      if (localRec) {
        let localWins;
        if (localRec._mAt && remoteRec._mAt) localWins = localRec._mAt > remoteRec._mAt;
        else if (localRec._mAt && !remoteRec._mAt) localWins = true;
        else if (!localRec._mAt && remoteRec._mAt) localWins = false;
        else localWins = !!localEdited;
        if (!localWins && localRec._mAt && remoteRec._mAt && localRec._mAt !== remoteRec._mAt) {
          onConflict({
            id: remoteRec.id,
            label: remoteRec.name || remoteRec.description || remoteRec.title || remoteRec.id,
          });
        }
        result.push(localWins
          ? appendArrays(localRec, remoteRec)
          : appendArrays(remoteRec, localRec));
      } else {
        result.push(remoteRec);
      }
    });
    localArr.forEach(localRec => {
      if (!remoteMap.has(localRec.id) && !wasDeleted(localRec.id)) {
        result.push(localRec);
      }
    });
    return result;
  }

  // ── Settings merge: the "we have local edits" branch ───
  // Called by _spApplyRemote and by pre-push merge. Object.assign lets
  // local settings win overall, but admin-pushed dropdowns from a NEWER
  // remote take priority so a real admin push replaces stale local copies.
  //
  // Bug repro captured in tests:
  //   - Commit ebd6899: local admin edits with a bumped _adminPushedAt
  //     survive the merge instead of being wiped by an older remote copy.
  function settingsWithLocalEdits(remoteSettings, localSettings) {
    const rSet = remoteSettings || {};
    const lSet = localSettings || {};
    const merged = Object.assign({}, rSet, lSet);
    const rPushedAt = rSet.dropdowns && rSet.dropdowns._adminPushedAt || 0;
    const lPushedAt = lSet.dropdowns && lSet.dropdowns._adminPushedAt || 0;
    if (rPushedAt > lPushedAt) {
      merged.dropdowns = Object.assign({}, rSet.dropdowns || {});
    }
    return merged;
  }

  // ── Settings merge: the "no local edits" branch ────────
  // Runs after a successful push cleared the offline-queue flag. The
  // classic wipeout path — before commit 4de3011, a stale remote could
  // replace fresh local dropdowns wholesale here. Now local dropdowns
  // survive when their _adminPushedAt is at least as fresh.
  function settingsNoLocalEdits(remoteData, localData) {
    const merged = Object.assign({}, remoteData);
    const rDrop = remoteData.settings && remoteData.settings.dropdowns || {};
    const lDrop = localData && localData.settings && localData.settings.dropdowns || {};
    const rPushedAt = rDrop._adminPushedAt || 0;
    const lPushedAt = lDrop._adminPushedAt || 0;
    if (lPushedAt >= rPushedAt && Object.keys(lDrop).length > 0) {
      merged.settings = Object.assign({}, merged.settings || {}, { dropdowns: lDrop });
    }
    return merged;
  }

  return {
    projectOverlapsRange,
    appendArrays,
    arrays,
    settingsWithLocalEdits,
    settingsNoLocalEdits,
  };
})();

// Dual export: browser global + CommonJS/ESM for unit tests.
if (typeof module !== 'undefined' && module.exports) module.exports = Merge;
