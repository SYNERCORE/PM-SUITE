// ── SHIC namespace ─────────────────────────────────────────────
// Umbrella object for app-owned modules. Two jobs:
//
//   1. Devtools ergonomics — type `SHIC.` in the console for
//      autocomplete of every registered module (Store, Audit, Api,
//      Deletions, Files, Merge). Handy for support and debugging.
//
//   2. Collision defense — SHIC.register(name, obj) refuses to
//      overwrite an already-registered slot. The historical
//      `function auditLog(...)` collision that shipped for weeks
//      would have been caught at load time with this in place.
//
// This file is deliberately non-invasive: it does NOT rename any
// existing global. Everything stays in place. New modules should
// call SHIC.register(name, ...) instead of assigning to window
// directly, so the collision guard actually helps.
//
// Public API:
//   SHIC.register(name, obj)  → adds to SHIC, throws on collision
//   SHIC.list()               → array of registered module names
//   SHIC.version              → APP_VERSION when available

(function () {
  if (typeof window === 'undefined') return;
  const ns = window.SHIC = window.SHIC || {};

  Object.defineProperty(ns, 'register', {
    value: function (name, obj) {
      if (!name || typeof name !== 'string')
        throw new Error('SHIC.register: name required');
      if (Object.prototype.hasOwnProperty.call(ns, name) && ns[name] !== obj) {
        const msg = 'SHIC.register: "' + name + '" already registered. Rename your module or extend the existing one.';
        console.error('[SHIC]', msg);
        throw new Error(msg);
      }
      ns[name] = obj;
      return obj;
    },
    writable: false,
    enumerable: false,
    configurable: false,
  });

  Object.defineProperty(ns, 'list', {
    value: function () {
      return Object.keys(ns).filter(k => k !== 'register' && k !== 'list' && k !== 'version').sort();
    },
    writable: false,
    enumerable: false,
    configurable: false,
  });

  // Adopt already-loaded lib modules — load-order-safe because
  // this file bundles AFTER them (see src/bundle.json).
  const _adopt = (name, ref) => { if (typeof ref !== 'undefined' && ref) ns[name] = ref; };
  _adopt('Store',     typeof Store     !== 'undefined' ? Store     : null);
  _adopt('Merge',     typeof Merge     !== 'undefined' ? Merge     : null);
  _adopt('Deletions', typeof Deletions !== 'undefined' ? Deletions : null);
  _adopt('Files',     typeof Files     !== 'undefined' ? Files     : null);
  _adopt('Audit',     typeof Audit     !== 'undefined' ? Audit     : null);
  _adopt('Api',       typeof Api       !== 'undefined' ? Api       : null);

  if (typeof APP_VERSION !== 'undefined') ns.version = APP_VERSION;
})();
