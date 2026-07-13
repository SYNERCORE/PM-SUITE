// ── Storage Abstraction Layer (Store) ─────────────────────
// Thin facade over AppState.data.<entity>. Every module SHOULD read and write
// through this API instead of touching AppState.data directly. Behind the
// interface, the current localStorage + SharePoint hybrid stays unchanged.
//
// Why this exists:
//   Future ERP work will add a local SQL server as a second backend. When it
//   arrives, Store swaps its implementation for a router that picks between
//   localStorage/SP and the local server per entity. NOTHING in the views
//   needs to change — every read and write already flows through here.
//
// This is stage 1 of the ERP prep plan (#1 in docs). It ships as a NEW
// non-breaking module. Existing direct access to AppState.data still works;
// individual views can migrate to Store at their own pace.
//
// Public API:
//   Store.list(entity, {filter, sort, limit, includeDeleted}) → Record[]
//   Store.get(entity, id)                                     → Record | null
//   Store.put(entity, record)                                 → Record
//   Store.remove(entity, id)                                  → boolean
//   Store.subscribe(entity, fn)                               → unsubscribe fn
//   Store.tx(fn)                                              → returns fn's result; batches notifies + one save

const Store = (function () {
  const _subscribers = new Map(); // entity → Set<fn>
  let _txDepth = 0;
  const _txDirtyEntities = new Set();

  // Entities that should be soft-deleted (_deleted:true) instead of removed.
  // Matches the existing filter-out pattern used by 60+ call sites elsewhere.
  const _SOFT_DELETE_ENTITIES = new Set([
    'projects', 'tasks', 'costs', 'risks', 'actions', 'documents',
    'qaqc', 'manpower', 'procurement', 'procurementLogs',
    'warehouseItems', 'stockTransactions', 'issuanceRequests',
    'resources', 'equipment', 'tools', 'vehicles', 'consumables',
    'materials', 'thirdParty', 'workflowDefs', 'assetHistory',
    'utilizationLog', 'resourceAllocations', 'resourceUsageLogs',
  ]);

  const _ID_PREFIX = {
    projects: 'JO', tasks: 'TSK', costs: 'CST', risks: 'RSK',
    actions: 'ACT', documents: 'DOC', qaqc: 'QC', manpower: 'MP',
    procurement: 'PO', warehouseItems: 'WH', resources: 'RES',
    equipment: 'EQ', tools: 'TL', vehicles: 'VH', consumables: 'CN',
    materials: 'MT', stockTransactions: 'SX', issuanceRequests: 'IR',
    workflowDefs: 'WF', thirdParty: 'TP',
  };

  function _arr(entity) {
    if (!AppState.data) AppState.data = (typeof getDefaultData === 'function') ? getDefaultData() : {};
    if (!Array.isArray(AppState.data[entity])) AppState.data[entity] = [];
    return AppState.data[entity];
  }

  function _notify(entity) {
    if (_txDepth > 0) { _txDirtyEntities.add(entity); return; }
    const subs = _subscribers.get(entity);
    if (!subs) return;
    subs.forEach(fn => { try { fn(entity); } catch (e) { console.error('[Store] subscriber error:', e); } });
  }

  function _generateId(entity) {
    const prefix = _ID_PREFIX[entity] || entity.slice(0, 3).toUpperCase();
    // 5-digit rolling number + 2-digit random tail keeps IDs sortable and
    // very-low collision under concurrent creates.
    const n = (Date.now() % 100000).toString().padStart(5, '0');
    const tail = Math.floor(Math.random() * 100).toString().padStart(2, '0');
    return prefix + '-' + n + tail;
  }

  // ── list ────────────────────────────────────────────────
  function list(entity, opts) {
    opts = opts || {};
    let arr = _arr(entity).slice();
    if (!opts.includeDeleted) arr = arr.filter(r => r && !r._deleted);
    if (typeof opts.filter === 'function') arr = arr.filter(opts.filter);
    else if (opts.filter && typeof opts.filter === 'object') {
      const pairs = Object.entries(opts.filter);
      arr = arr.filter(r => pairs.every(([k, v]) => r && r[k] === v));
    }
    if (typeof opts.sort === 'function') arr = arr.sort(opts.sort);
    else if (typeof opts.sort === 'string') {
      const key = opts.sort.replace(/^-/, '');
      const dir = opts.sort.startsWith('-') ? -1 : 1;
      arr = arr.sort((a, b) => (a[key] > b[key] ? dir : a[key] < b[key] ? -dir : 0));
    }
    if (typeof opts.limit === 'number') arr = arr.slice(opts.offset || 0, (opts.offset || 0) + opts.limit);
    return arr;
  }

  // ── get ─────────────────────────────────────────────────
  function get(entity, id) {
    if (!id) return null;
    return _arr(entity).find(r => r && r.id === id) || null;
  }

  // ── put ─────────────────────────────────────────────────
  // Insert-or-update. If record has no id, one is generated. Merges with the
  // existing record via shallow spread so partial updates are safe.
  function put(entity, record) {
    if (!record || typeof record !== 'object') throw new Error('Store.put: record must be an object');
    const arr = _arr(entity);
    const now = new Date().toISOString();
    if (!record.id) record.id = _generateId(entity);
    const idx = arr.findIndex(r => r && r.id === record.id);
    if (idx >= 0) {
      // Shallow-merge: caller-supplied fields override, other fields survive
      arr[idx] = Object.assign({}, arr[idx], record, { _mAt: now });
    } else {
      if (!record._createdAt) record._createdAt = now;
      arr.push(Object.assign({}, record, { _mAt: now }));
    }
    if (_txDepth === 0) AppState.save();
    _notify(entity);
    return arr[idx >= 0 ? idx : arr.length - 1];
  }

  // ── remove ──────────────────────────────────────────────
  // Soft delete (sets _deleted:true) for entities in _SOFT_DELETE_ENTITIES,
  // hard delete (splice) for everything else. Matches the app's existing
  // filter-by-!_deleted pattern.
  function remove(entity, id) {
    const arr = _arr(entity);
    const idx = arr.findIndex(r => r && r.id === id);
    if (idx < 0) return false;
    if (_SOFT_DELETE_ENTITIES.has(entity)) {
      arr[idx] = Object.assign({}, arr[idx], {
        _deleted: true,
        _deletedAt: new Date().toISOString(),
      });
    } else {
      arr.splice(idx, 1);
    }
    if (_txDepth === 0) AppState.save();
    _notify(entity);
    return true;
  }

  // ── subscribe ───────────────────────────────────────────
  function subscribe(entity, fn) {
    if (typeof fn !== 'function') throw new Error('Store.subscribe: fn must be a function');
    if (!_subscribers.has(entity)) _subscribers.set(entity, new Set());
    _subscribers.get(entity).add(fn);
    return function unsubscribe() {
      const s = _subscribers.get(entity);
      if (s) s.delete(fn);
    };
  }

  // ── tx ──────────────────────────────────────────────────
  // Batches saves + notifications inside a callback. On success: single save,
  // one notify-per-dirty-entity. On throw: rethrows (caller decides rollback).
  // Nested tx() calls fold into the outermost transaction.
  function tx(fn) {
    _txDepth++;
    try {
      const result = fn();
      _txDepth--;
      if (_txDepth === 0) {
        AppState.save();
        const dirty = [..._txDirtyEntities];
        _txDirtyEntities.clear();
        dirty.forEach(e => {
          const subs = _subscribers.get(e);
          if (!subs) return;
          subs.forEach(f => { try { f(e); } catch (err) { console.error('[Store] tx subscriber error:', err); } });
        });
      }
      return result;
    } catch (e) {
      _txDepth--;
      if (_txDepth === 0) _txDirtyEntities.clear();
      throw e;
    }
  }

  return { list, get, put, remove, subscribe, tx, _generateId };
})();

// Dual export: browser global (Store) + CommonJS/ESM for unit tests.
if (typeof module !== 'undefined' && module.exports) module.exports = Store;
