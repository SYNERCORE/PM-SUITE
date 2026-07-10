/**
 * Unit tests for the pure merge / overlap logic that has produced repeated
 * silent-data-loss bugs in production. Runs with Node's built-in test runner.
 *
 *   npm run test:unit
 *
 * The functions below are IN-SYNC copies of the pure logic in
 *   src/js/core.js  → _projectOverlapsRange
 *   src/js/sync.js  → _spMergeArrays, _spMergeAppendArrays, settings-merge
 *
 * When you edit the source functions, edit these copies too — the tests are
 * the contract, not the implementation.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

// ── Copies-of-record ────────────────────────────────────────────────────────

function _projectOverlapsRange(p, rangeStart, rangeEnd) {
  if (!p || !rangeStart || !rangeEnd) return false;
  const startStr = p.startDate || p._createdAt;
  if (!startStr) return false;
  const s = new Date(('' + startStr).length > 10 ? startStr : (startStr + 'T00:00:00'));
  if (isNaN(s)) return false;
  const endStr = p.completedDate || p.endDate;
  const e = endStr ? new Date(('' + endStr).length > 10 ? endStr : (endStr + 'T00:00:00')) : rangeEnd;
  if (isNaN(e)) return false;
  return s <= rangeEnd && e >= rangeStart;
}

function _spMergeAppendArrays(base, donor) {
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

// Simplified merge that accepts a deletion-check callback so the pure logic
// is testable without touching global state.
function _spMergeArrays(localArr, remoteArr, localEdited, wasDeleted = () => false) {
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
      result.push(localWins
        ? _spMergeAppendArrays(localRec, remoteRec)
        : _spMergeAppendArrays(remoteRec, localRec));
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

// The settings-merge branch in _spApplyRemote's "has local edits" path.
function _settingsMergeHasLocalEdits(remoteSettings, localSettings) {
  const merged = Object.assign({}, remoteSettings, localSettings);
  const rPA = remoteSettings.dropdowns?._adminPushedAt || 0;
  const lPA = localSettings.dropdowns?._adminPushedAt || 0;
  if (rPA > lPA) {
    merged.dropdowns = Object.assign({}, remoteSettings.dropdowns || {});
  }
  return merged;
}

// The no-local-edits branch (fixed in commit 4de3011 — was wiping local
// dropdowns wholesale before this guard was added).
function _settingsMergeNoLocalEdits(remoteData, localData) {
  const merged = Object.assign({}, remoteData);
  const rDrop = remoteData.settings?.dropdowns || {};
  const lDrop = localData.settings?.dropdowns || {};
  const rPA = rDrop._adminPushedAt || 0;
  const lPA = lDrop._adminPushedAt || 0;
  if (lPA >= rPA && Object.keys(lDrop).length > 0) {
    merged.settings = Object.assign({}, merged.settings || {}, { dropdowns: lDrop });
  }
  return merged;
}

// ── Tests: _projectOverlapsRange ────────────────────────────────────────────

test('_projectOverlapsRange: current-year project matches', () => {
  const range = { start: new Date('2026-01-01T00:00:00'), end: new Date('2026-12-31T23:59:59') };
  const p = { startDate: '2026-03-01', endDate: '2026-12-31' };
  assert.equal(_projectOverlapsRange(p, range.start, range.end), true);
});

test('_projectOverlapsRange: cross-year completed project (dashboard bug repro)', () => {
  // Regression: dashboard used to exclude these; commit 2725a4d fixed it.
  const range = { start: new Date('2026-01-01T00:00:00'), end: new Date('2026-12-31T23:59:59') };
  const p = { startDate: '2025-12-28', endDate: '2026-01-03', completedDate: '2026-01-03', status: 'completed' };
  assert.equal(_projectOverlapsRange(p, range.start, range.end), true);
});

test('_projectOverlapsRange: future-starting planned project inside period', () => {
  const range = { start: new Date('2026-01-01T00:00:00'), end: new Date('2026-12-31T23:59:59') };
  const p = { startDate: '2026-08-01', endDate: '2026-12-31', status: 'planned' };
  assert.equal(_projectOverlapsRange(p, range.start, range.end), true);
});

test('_projectOverlapsRange: fully past project is excluded', () => {
  const range = { start: new Date('2026-01-01T00:00:00'), end: new Date('2026-12-31T23:59:59') };
  const p = { startDate: '2024-01-01', endDate: '2024-12-31', completedDate: '2024-12-31' };
  assert.equal(_projectOverlapsRange(p, range.start, range.end), false);
});

test('_projectOverlapsRange: project without startDate returns false', () => {
  const range = { start: new Date('2026-01-01T00:00:00'), end: new Date('2026-12-31T23:59:59') };
  assert.equal(_projectOverlapsRange({ name: 'no dates' }, range.start, range.end), false);
});

test('_projectOverlapsRange: monthly filter includes long-running project', () => {
  const range = { start: new Date('2026-07-01T00:00:00'), end: new Date('2026-07-31T23:59:59') };
  const p = { startDate: '2026-03-01', endDate: '2026-12-31' };
  assert.equal(_projectOverlapsRange(p, range.start, range.end), true);
});

test('_projectOverlapsRange: monthly filter excludes project that ends before period', () => {
  const range = { start: new Date('2026-07-01T00:00:00'), end: new Date('2026-07-31T23:59:59') };
  const p = { startDate: '2026-01-01', endDate: '2026-06-30' };
  assert.equal(_projectOverlapsRange(p, range.start, range.end), false);
});

test('_projectOverlapsRange: falls back to _createdAt when no startDate', () => {
  const range = { start: new Date('2026-01-01T00:00:00'), end: new Date('2026-12-31T23:59:59') };
  const p = { _createdAt: '2026-06-01', endDate: '2026-08-01' };
  assert.equal(_projectOverlapsRange(p, range.start, range.end), true);
});

// ── Tests: settings dropdown merge ──────────────────────────────────────────

test('settings merge (has local edits): local dropdowns win when both have equal _adminPushedAt', () => {
  const remote = { dropdowns: { doc_status: ['draft', 'approved'], _adminPushedAt: 1000 } };
  const local = { dropdowns: { doc_status: ['draft', 'approved', 'MyEdit'], _adminPushedAt: 1000 } };
  const merged = _settingsMergeHasLocalEdits(remote, local);
  assert.deepEqual(merged.dropdowns.doc_status, ['draft', 'approved', 'MyEdit']);
});

test('settings merge (has local edits): remote dropdowns win when remote _adminPushedAt is newer', () => {
  const remote = { dropdowns: { doc_status: ['draft', 'approved'], _adminPushedAt: 2000 } };
  const local = { dropdowns: { doc_status: ['MyStale'], _adminPushedAt: 1000 } };
  const merged = _settingsMergeHasLocalEdits(remote, local);
  assert.deepEqual(merged.dropdowns.doc_status, ['draft', 'approved']);
});

test('settings merge (has local edits): local dropdowns win with newer _adminPushedAt (admin edit bug repro)', () => {
  // Regression: commit ebd6899 fixed this — _adminPushedAt bump on _setDropdown
  const remote = { dropdowns: { doc_status: ['draft', 'approved'], _adminPushedAt: 1000 } };
  const local = { dropdowns: { doc_status: ['draft', 'approved', 'JustTyped'], _adminPushedAt: 2000 } };
  const merged = _settingsMergeHasLocalEdits(remote, local);
  assert.deepEqual(merged.dropdowns.doc_status, ['draft', 'approved', 'JustTyped']);
});

test('settings merge (no local edits): local dropdowns preserved when local _adminPushedAt is newer', () => {
  // Regression: commit 4de3011 added this guard — the branch used to do a
  // wholesale replace regardless of timestamps.
  const remote = { settings: { dropdowns: { doc_status: ['draft', 'approved'], _adminPushedAt: 1000 } } };
  const local  = { settings: { dropdowns: { doc_status: ['draft', 'approved', 'JustTyped'], _adminPushedAt: 2000 } } };
  const merged = _settingsMergeNoLocalEdits(remote, local);
  assert.deepEqual(merged.settings.dropdowns.doc_status, ['draft', 'approved', 'JustTyped']);
});

test('settings merge (no local edits): remote wins when remote _adminPushedAt is strictly newer', () => {
  const remote = { settings: { dropdowns: { doc_status: ['fresh'], _adminPushedAt: 3000 } } };
  const local  = { settings: { dropdowns: { doc_status: ['old'], _adminPushedAt: 1000 } } };
  const merged = _settingsMergeNoLocalEdits(remote, local);
  assert.deepEqual(merged.settings.dropdowns.doc_status, ['fresh']);
});

// ── Tests: _spMergeArrays ───────────────────────────────────────────────────

test('_spMergeArrays: empty local + empty remote → empty', () => {
  assert.deepEqual(_spMergeArrays([], [], false), []);
});

test('_spMergeArrays: remote-only record survives', () => {
  const result = _spMergeArrays([], [{ id: 'R1', name: 'Remote' }], false);
  assert.deepEqual(result, [{ id: 'R1', name: 'Remote' }]);
});

test('_spMergeArrays: local-only record survives', () => {
  const result = _spMergeArrays([{ id: 'L1', name: 'Local' }], [], true);
  assert.deepEqual(result, [{ id: 'L1', name: 'Local' }]);
});

test('_spMergeArrays: newer _mAt wins the field values', () => {
  const local = [{ id: 'X', name: 'Local newer', _mAt: '2026-07-08T10:00:00' }];
  const remote = [{ id: 'X', name: 'Remote older', _mAt: '2026-07-07T09:00:00' }];
  const result = _spMergeArrays(local, remote, false);
  assert.equal(result[0].name, 'Local newer');
});

test('_spMergeArrays: remote wins when remote _mAt is newer even with localEdited=true', () => {
  const local = [{ id: 'X', name: 'Local stale', _mAt: '2026-07-01' }];
  const remote = [{ id: 'X', name: 'Remote fresh', _mAt: '2026-07-08' }];
  const result = _spMergeArrays(local, remote, true);
  assert.equal(result[0].name, 'Remote fresh');
});

test('_spMergeArrays: falls back to localEdited flag when both records lack _mAt', () => {
  const local = [{ id: 'X', name: 'Local no ts' }];
  const remote = [{ id: 'X', name: 'Remote no ts' }];
  assert.equal(_spMergeArrays(local, remote, true)[0].name, 'Local no ts');
  assert.equal(_spMergeArrays(local, remote, false)[0].name, 'Remote no ts');
});

test('_spMergeArrays: locally deleted records are dropped from remote result', () => {
  const wasDeleted = id => id === 'GONE';
  const result = _spMergeArrays(
    [],
    [{ id: 'GONE', name: 'Deleted' }, { id: 'KEEP', name: 'Kept' }],
    false,
    wasDeleted
  );
  assert.equal(result.length, 1);
  assert.equal(result[0].id, 'KEEP');
});

test('_spMergeArrays: append-only sub-arrays (updates) union without duplicates', () => {
  const local = [{
    id: 'T1', name: 'Task',
    updates: [{ at: '2026-07-01', text: 'first' }, { at: '2026-07-03', text: 'third' }],
    _mAt: '2026-07-08'
  }];
  const remote = [{
    id: 'T1', name: 'Task',
    updates: [{ at: '2026-07-01', text: 'first' }, { at: '2026-07-02', text: 'second' }],
    _mAt: '2026-07-07'
  }];
  const result = _spMergeArrays(local, remote, false);
  assert.equal(result[0].updates.length, 3);
  assert.deepEqual(result[0].updates.map(u => u.at), ['2026-07-01', '2026-07-02', '2026-07-03']);
});

test('_spMergeAppendArrays: donor with no append fields returns base unchanged', () => {
  const base = { id: 'X', name: 'Base' };
  const donor = { id: 'X', name: 'Donor' };
  const result = _spMergeAppendArrays(base, donor);
  assert.equal(result, base);
});
