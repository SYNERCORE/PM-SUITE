// ── API client for the local ProMaster server ─────────────────
// Talks to the Fastify server shipped in deploy/. The app can run
// with any combination of the two backends (SharePoint + local
// server); a feature flag on each entity decides which one wins.
//
// Contract mirrors Store: list / get / put / remove / health.
// Every request carries the MSAL access token in Authorization.
//
// Public API:
//   Api.configure({ baseUrl, getToken })
//   Api.enabled()               → boolean; true only after configure + healthy
//   Api.health()                → { status, db, version } or throws
//   Api.list(entity, params?)   → array of records (unwraps { items })
//   Api.get(entity, id)         → record or null
//   Api.put(entity, id, data)   → { ok, id }
//   Api.remove(entity, id)      → { ok, changed }

const Api = (function () {
  let _cfg = { baseUrl: '', getToken: null };
  let _lastHealthy = 0;

  function configure(cfg) {
    _cfg = Object.assign({}, _cfg, cfg || {});
    // Strip trailing slash for cleanliness
    if (_cfg.baseUrl) _cfg.baseUrl = _cfg.baseUrl.replace(/\/+$/, '');
  }

  function enabled() {
    return !!(_cfg.baseUrl && typeof _cfg.getToken === 'function');
  }

  function _entityToPath(entity) {
    // camelCase → kebab-case for the URL, matching Fastify route conventions.
    return entity.replace(/[A-Z]/g, m => '-' + m.toLowerCase());
  }

  async function _fetch(path, init = {}) {
    if (!_cfg.baseUrl) throw new Error('Api not configured — call Api.configure first');
    const token = typeof _cfg.getToken === 'function' ? await _cfg.getToken() : null;
    const headers = Object.assign(
      { 'Content-Type': 'application/json' },
      init.headers || {},
      token ? { Authorization: 'Bearer ' + token } : {}
    );
    let res;
    try {
      res = await fetch(_cfg.baseUrl + path, Object.assign({}, init, { headers }));
    } catch (e) {
      // Network/DNS/offline — surface as a clear error so callers can fall back
      throw new Error('Api unreachable: ' + e.message);
    }
    if (!res.ok) {
      let body = '';
      try { body = await res.text(); } catch (e) {}
      throw new Error(`Api ${res.status} ${res.statusText}${body ? ': ' + body.slice(0, 200) : ''}`);
    }
    if (res.status === 204) return null;
    return res.json();
  }

  async function health() {
    // Health endpoint is public — no auth header needed
    const res = await fetch(_cfg.baseUrl + '/health');
    if (!res.ok) throw new Error('Api health failed: ' + res.status);
    const body = await res.json();
    _lastHealthy = Date.now();
    return body;
  }

  async function list(entity, params) {
    const qs = params
      ? '?' + Object.entries(params).filter(([, v]) => v != null).map(([k, v]) => encodeURIComponent(k) + '=' + encodeURIComponent(v)).join('&')
      : '';
    const body = await _fetch('/api/' + _entityToPath(entity) + qs);
    // Server wraps in { items, limit, offset } — hand back the array
    return body && Array.isArray(body.items) ? body.items : body;
  }

  async function get(entity, id) {
    try {
      return await _fetch('/api/' + _entityToPath(entity) + '/' + encodeURIComponent(id));
    } catch (e) {
      if (String(e.message).includes(' 404 ')) return null;
      throw e;
    }
  }

  async function put(entity, id, data) {
    return _fetch('/api/' + _entityToPath(entity) + '/' + encodeURIComponent(id), {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  async function remove(entity, id) {
    return _fetch('/api/' + _entityToPath(entity) + '/' + encodeURIComponent(id), {
      method: 'DELETE',
    });
  }

  function lastHealthyAt() { return _lastHealthy; }

  return { configure, enabled, health, list, get, put, remove, lastHealthyAt };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = Api;
