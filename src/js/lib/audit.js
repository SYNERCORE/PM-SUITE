// ── Audit facade ───────────────────────────────────────────────
// Unifies the two legacy `auditLog` signatures that used to collide:
//
//   Family A  auditLog(category, message, details)          — masterlist.js
//   Family B  auditLog(action, module, entity, entityId,    — sync.js
//                       before, after, notes)
//
// Detection: if the second arg is a string AND there are ≥ 4 args
// (or the 3rd arg looks like an entity name), treat as Family B.
// Otherwise Family A.
//
// Sinks:
//   • localStorage `shic_audit_log` (canonical, always written, capped)
//   • SharePoint AuditLog list via _auditQueue + _flushAuditQueue
//     (best-effort — only when SP is connected)
//
// Public API:
//   Audit.record(...args)  → normalize + persist
//   Audit.all()            → array of recent entries (newest last)
//   Audit.clear()          → wipe local log
//   Audit.errorCount()     → count of entries with category='error'

const Audit = (function () {
  const KEY = 'shic_audit_log';
  const MAX = 500;
  let _log = [];
  try { _log = JSON.parse(localStorage.getItem(KEY) || '[]'); } catch (e) { _log = []; }

  function _persist() {
    try {
      if (_log.length > MAX) _log = _log.slice(-MAX);
      localStorage.setItem(KEY, JSON.stringify(_log));
    } catch (e) {
      _log = _log.slice(-Math.floor(MAX / 2));
      try { localStorage.setItem(KEY, JSON.stringify(_log)); } catch (e2) {}
    }
  }

  function _who() {
    try {
      if (typeof _currentUserProfile !== 'undefined' && _currentUserProfile?.email) return _currentUserProfile.email;
      if (typeof _currentUser !== 'undefined' && _currentUser?.email) return _currentUser.email;
    } catch (e) {}
    return 'unknown';
  }

  function _normalize(args) {
    // Family B: (action, module, entity, entityId, before, after, notes)
    if (args.length >= 4 && typeof args[1] === 'string' && typeof args[2] === 'string') {
      const [action, module, entity, entityId, before, after, notes] = args;
      return {
        category: String(action).toLowerCase(),
        message: `${module} · ${entity} ${entityId || ''}`.trim(),
        details: { module, entity, entityId, before, after, notes },
      };
    }
    // Family A: (category, message, details)
    const [category, message, details] = args;
    return {
      category: String(category || 'info'),
      message: String(message || ''),
      details: details || null,
    };
  }

  function record(...args) {
    const { category, message, details } = _normalize(args);
    const entry = {
      ts: Date.now(),
      iso: new Date().toISOString(),
      category, message, details,
      user: _who(),
      page: (typeof AppState !== 'undefined' && AppState.currentPage) || '',
      version: (typeof HARDENING_VERSION !== 'undefined') ? HARDENING_VERSION : '',
    };
    _log.push(entry);
    _persist();

    if (category === 'error') console.error('[Audit]', message, details);
    else if (category === 'conflict' || category === 'collision') console.warn('[Audit]', message, details);
    else console.log('[Audit]', message);

    // Best-effort SP mirror — only when the SP audit queue exists and is connected.
    try {
      if (typeof _auditQueue !== 'undefined' && typeof _spConnected !== 'undefined' && _spConnected) {
        _auditQueue.push({
          ts: entry.iso,
          action: entry.category.toUpperCase(),
          module: details?.module || entry.page || '',
          entity: details?.entity || '',
          entityId: details?.entityId || '',
          userEmail: entry.user,
          before: details?.before || null,
          after: details?.after || details || null,
          notes: details?.notes || message,
        });
        if (typeof _flushAuditQueue === 'function') setTimeout(_flushAuditQueue, 500);
      }
    } catch (e) { /* SP mirror best-effort */ }
  }

  function all()          { return _log.slice(); }
  function clear()        { _log = []; _persist(); }
  function errorCount()   { return _log.filter(e => e.category === 'error').length; }
  function conflictCount(){ return _log.filter(e => e.category === 'conflict' || e.category === 'collision').length; }

  return { record, all, clear, errorCount, conflictCount };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = Audit;
