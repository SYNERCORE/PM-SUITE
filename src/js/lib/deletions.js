// ── Deletions tombstone facade ────────────────────────────────
// First-class deletion tracking. Replaces the loose _spDeletedIds map
// with a typed { entity, id, at, by, restoredAt? } shape.
//
// Storage: same localStorage key `shic_sp_deleted_ids` for zero-migration
// upgrade. Legacy entries stored as `number` (timestamp only) are read
// transparently and normalized on next write.
//
// Public API:
//   Deletions.track(entity, id, by?)   → record a tombstone
//   Deletions.was(entity, id)          → boolean, ignores restored entries
//   Deletions.get(entity, id)          → { at, by, restoredAt? } | null
//   Deletions.list(entity)             → array of live tombstone ids
//   Deletions.forget(entity, id)       → remove tombstone entirely
//   Deletions.restore(entity, id, by?) → mark restoredAt, keeps history
//   Deletions.mergeRemote(remoteMap)   → union tombstones from SP push
//   Deletions.prune(maxAgeMs)          → drop entries older than cutoff
//   Deletions.raw()                    → underlying map (SP push serializes it)

const Deletions = (function () {
  const KEY = 'shic_sp_deleted_ids';
  let _map = {};
  try { _map = JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch (e) { _map = {}; }

  function _persist() {
    try { localStorage.setItem(KEY, JSON.stringify(_map)); } catch (e) {}
  }

  function _normalize(entry) {
    if (entry == null) return null;
    if (typeof entry === 'number') return { at: entry, by: 'unknown' };
    if (typeof entry === 'object' && typeof entry.at === 'number') return entry;
    return null;
  }

  function track(entity, id, by) {
    if (!entity || !id) return;
    if (!_map[entity]) _map[entity] = {};
    const existing = _normalize(_map[entity][id]);
    _map[entity][id] = {
      at: Date.now(),
      by: by || (existing && existing.by) || 'unknown',
    };
    _persist();
  }

  function get(entity, id) {
    if (!_map[entity]) return null;
    return _normalize(_map[entity][id]);
  }

  function was(entity, id) {
    const e = get(entity, id);
    return !!(e && !e.restoredAt);
  }

  function list(entity) {
    if (!_map[entity]) return [];
    return Object.keys(_map[entity]).filter(id => was(entity, id));
  }

  function forget(entity, id) {
    if (_map[entity] && _map[entity][id]) {
      delete _map[entity][id];
      _persist();
    }
  }

  function restore(entity, id, by) {
    const e = get(entity, id);
    if (!e) return false;
    e.restoredAt = Date.now();
    e.restoredBy = by || 'unknown';
    _map[entity][id] = e;
    _persist();
    return true;
  }

  function mergeRemote(remoteMap) {
    if (!remoteMap || typeof remoteMap !== 'object') return;
    Object.keys(remoteMap).forEach(entity => {
      if (!_map[entity]) _map[entity] = {};
      const remoteEntity = remoteMap[entity] || {};
      Object.keys(remoteEntity).forEach(id => {
        const incoming = _normalize(remoteEntity[id]);
        const current  = _normalize(_map[entity][id]);
        if (!incoming) return;
        if (!current || incoming.at > current.at) _map[entity][id] = incoming;
      });
    });
    _persist();
  }

  function prune(maxAgeMs) {
    const cutoff = Date.now() - (maxAgeMs || 7 * 24 * 60 * 60 * 1000);
    Object.keys(_map).forEach(entity => {
      Object.keys(_map[entity]).forEach(id => {
        const e = _normalize(_map[entity][id]);
        if (!e || e.at < cutoff) delete _map[entity][id];
      });
      if (Object.keys(_map[entity]).length === 0) delete _map[entity];
    });
    _persist();
  }

  function raw() { return _map; }

  return { track, get, was, list, forget, restore, mergeRemote, prune, raw };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = Deletions;
