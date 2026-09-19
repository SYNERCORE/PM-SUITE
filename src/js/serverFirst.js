// ── ProMaster Server-First engine ───────────────────────────────────
// Makes the LAN Postgres server (deploy/) the PRIMARY live backend so a whole
// workday of reads and writes runs over the local network at ZERO internet
// cost. Built for sites with limited/expensive internet and several users.
//
//   • Writes  — every save streams the records that actually changed up to the
//               server (debounced). The local copy always saves first, so a
//               server hiccup never blocks the user; unsent changes retry on
//               the next cycle.
//   • Reads   — a light DELTA pull ("what changed since last time") on boot and
//               every few minutes, merged into the local copy by id. Never a
//               wholesale replace, so a local edit in flight is never dropped.
//   • Backup  — SharePoint drops to a once-a-day offsite backup (the per-edit
//               SP push and the SP remote-poll are gated off in sync.js while
//               this is on). The server's own nightly pg_dump remains the
//               primary DR path.
//
// Opt-in PER DEVICE via Settings → Local Server → "Server-First mode"; OFF by
// default so enabling it is always a deliberate act, never a surprise upgrade.
// New/empty devices should still do a one-time "Pull" (Settings → Local Server)
// to seed local data; this engine then keeps them converged with light deltas.
(function () {
  const ENTITIES = [
    'projects','tasks','resources','warehouseItems','procurement','costs','qaqc',
    'risks','actions','documents','stockTransactions','resourceAllocations',
    'resourceUsageLogs','manpower','procurementLogs','issuanceRequests','equipment',
    'tools','vehicles','consumables','materials','warehouseLocations','thirdParty',
    'trades','businessUnits','projectTeam','dailyMeetingLogs','progress','kpiData',
    'calendar','assetHistory','assetUtilization','libraryDocs'
  ];
  const REFRESH_MS       = 3 * 60 * 1000;   // LAN delta pull cadence
  const PUSH_DEBOUNCE_MS = 1500;            // coalesce rapid saves into one push
  const SP_BACKUP_MS     = 24 * 60 * 60 * 1000; // throttle SharePoint to daily
  const PAGE             = 500;             // server list page size
  const PUSH_PACE_MS     = 60;              // gap between record PUTs so a big dirty batch can't flood the server
  const LS_LAST_SP       = 'pm_sf_last_sp_backup';
  const LS_DEVICE_ID     = 'pm_sf_device_id';
  const _sfSleep = ms => new Promise(r => setTimeout(r, ms));

  // ── SharePoint reconciler (distributed, admin-coordinated via a server lease) ──
  // Any admin device that is on the LAN and has internet keeps Postgres and the
  // SharePoint mirror converged so off-site (SP-reading) users see fresh data.
  // A single-row server lease (deploy/sql/010-sync-lease.sql) guarantees exactly
  // one device reconciles at a time, with automatic failover when a holder goes
  // away. See /api/sync-lease/* in deploy/server/server.js.
  const RECONCILE_MS   = 5 * 60 * 1000;     // reconcile SP at most this often (last_sync_at is global)
  const LEASE_TTL_SEC  = 90;                // how long the server grants the lease
  const LEASE_RENEW_MS = 30 * 1000;         // renew mid-sync so a long push can't outlive the lease
  let _reconciling = false;                 // this device is mid-reconcile
  let _leaseHeld = false;                    // this device currently holds the lease
  let _leaseRenewTimer = null;

  // Stable per-device id so the server can tell "still me (renew)" from "someone else".
  function _deviceId() {
    try {
      let id = localStorage.getItem(LS_DEVICE_ID);
      if (!id) { id = 'dev-' + Math.random().toString(36).slice(2) + '-' + Date.now().toString(36); localStorage.setItem(LS_DEVICE_ID, id); }
      return id;
    } catch (e) { return 'dev-ephemeral'; }
  }

  let _sig      = Object.create(null);  // entity -> Map(id -> JSON signature of last-known-synced record)
  let _lastPull = Object.create(null);  // entity -> ISO string of last successful delta pull
  let _pushTimer = null, _refreshTimer = null, _readyTimer = null, _rerenderTimer = null;
  let _busy = false, _started = false;

  function on()       { try { return !!(getDeviceSettings().serverFirst); } catch (e) { return false; } }
  function _apiReady(){ return typeof Api !== 'undefined' && Api.enabled && Api.enabled(); }
  // Api.enabled() only checks that a baseUrl + getToken fn are configured — NOT that a
  // token can actually be obtained. Firing pulls before sign-in wires the account sends
  // header-less requests the server 401s ("missing bearer token"). This resolves a real
  // token so we can gate on genuine readiness and kick a cycle the moment one appears.
  async function _hasToken() {
    try { return !!(Api._tokenNow ? await Api._tokenNow() : true); } catch (e) { return false; }
  }
  let _hadToken = false;
  function _editing() { try { return typeof _isUserActivelyEditing === 'function' && _isUserActivelyEditing(); } catch (e) { return false; } }
  // sync.js reads this to gate the per-edit SP push and the SP remote poll.
  window._serverFirstOn = on;

  function _snap(entity) {
    const m = new Map();
    (AppState.data[entity] || []).forEach(r => { if (r && r.id != null) m.set(String(r.id), JSON.stringify(r)); });
    return m;
  }

  // Mass-delete circuit breaker. Server-First replicates "was synced, now gone" as a
  // server delete — correct for real edits, catastrophic if a device's local cache is
  // lost (corruption, cleared site data, a failed load): that would tell the server to
  // wipe everyone's data. So when local has lost the bulk of its records at once, we
  // SUPPRESS all deletions for that cycle and keep the server's copy. Adds and updates
  // still flow; only destructive deletes are held back until local looks intact again.
  const DELETE_GUARD_MIN_PREV = 20;   // ignore the guard on tiny datasets
  const DELETE_GUARD_MIN_RATIO = 0.25; // trip if <25% of the previously-synced set remains

  // ── Writes: push only the records whose JSON changed since last sync ──
  async function _pushEntity(ent, allowDeletes) {
    const arr = AppState.data[ent] || [];
    const prev = _sig[ent] || new Map();
    const cur = new Map();
    let ok = true, n = 0;
    for (const r of arr) {
      if (!r || r.id == null) continue;
      const id = String(r.id), s = JSON.stringify(r);
      cur.set(id, s);
      if (prev.get(id) !== s) {
        try { await Api.put(ent, r.id, r); n++; await _sfSleep(PUSH_PACE_MS); }
        catch (e) { ok = false; cur.set(id, prev.get(id)); if (/\b429\b/.test(e.message || '')) await _sfSleep(2500); } // keep old sig → retried next cycle
      }
    }
    // ── Per-entity delete guard ─────────────────────────────────────────
    // The cycle-wide guard in pushDirty() sums ALL entities, so a single entity
    // collapsing to empty (e.g. projects 62→0 from a bad load) hides inside a
    // still-large global total and slips through — that is exactly how the whole
    // projects table got deleted while every other table stayed intact. Re-check
    // THIS entity on its own: if a previously-synced set has lost the bulk of its
    // rows, or collapsed to zero, suppress deletes for this entity too. Adds and
    // updates already flowed above; only the destructive deletes are held.
    const prevN = prev.size;
    const liveN = cur.size; // ids present locally this cycle (recorded in the loop above)
    let entAllowDeletes = allowDeletes;
    if (entAllowDeletes &&
        ((liveN === 0 && prevN >= 5) ||
         (prevN >= DELETE_GUARD_MIN_PREV && liveN < prevN * DELETE_GUARD_MIN_RATIO))) {
      entAllowDeletes = false;
      try { console.warn(`[Server-First] Per-entity delete guard TRIPPED for "${ent}" — local holds ${liveN} of ${prevN} previously-synced rows. Keeping the server's rows (looks like a local load failure, not real deletes).`); } catch (e) {}
    }
    // Deletions: ids we had synced before that are no longer present locally.
    for (const id of prev.keys()) {
      if (!cur.has(id)) {
        if (!entAllowDeletes) { cur.set(id, prev.get(id)); continue; } // guard tripped — keep the server row, remember it
        try { await Api.remove(ent, id); n++; await _sfSleep(PUSH_PACE_MS); }
        catch (e) { ok = false; cur.set(id, prev.get(id)); if (/\b429\b/.test(e.message || '')) await _sfSleep(2500); }
      }
    }
    _sig[ent] = cur;
    return { ok, n };
  }

  async function pushDirty() {
    if (!on() || !_apiReady()) return { pushed: 0, failed: [] };
    // Never fight an in-progress bulk migration — it paces itself; our push would
    // collide on the rate limit and cause 429 storms.
    if (typeof Store !== 'undefined' && Store.migrating && Store.migrating()) return { pushed: 0, failed: [] };
    // Decide once, across ALL entities, whether deletions are safe this cycle. A near-total
    // disappearance of previously-synced records is almost certainly a local data loss, not
    // 30+ entities' worth of simultaneous user deletes — so hold deletes back and protect the server.
    let totalPrev = 0, totalLive = 0;
    for (const ent of ENTITIES) {
      totalPrev += (_sig[ent] ? _sig[ent].size : 0);
      totalLive += (AppState.data[ent] || []).filter(r => r && r.id != null).length;
    }
    const allowDeletes = !(totalPrev >= DELETE_GUARD_MIN_PREV && totalLive < totalPrev * DELETE_GUARD_MIN_RATIO);
    if (!allowDeletes) {
      try { console.warn(`[Server-First] Delete guard TRIPPED — local holds ${totalLive} of ${totalPrev} previously-synced records. Suppressing all deletions this cycle to protect the server (likely a local data loss, not real deletes). Pull from the server to restore this device.`); } catch (e) {}
      if (typeof showToast === 'function') { try { showToast('Sync paused deletions — this device lost local data. Your server copy is safe; use Settings → Local Server → Pull everything to restore.', 'warning', 8000); } catch (e) {} }
    }
    let pushed = 0; const failed = [];
    for (const ent of ENTITIES) {
      try { const r = await _pushEntity(ent, allowDeletes); pushed += r.n; if (!r.ok) failed.push(ent); }
      catch (e) { failed.push(ent); }
    }
    return { pushed, failed };
  }

  // ── Reads: merge the server's delta into local by id (never a full replace) ──
  async function _pullEntityDelta(ent, sinceISO) {
    let offset = 0, merged = 0, applied = false;
    const arr = AppState.data[ent] || (AppState.data[ent] = []);
    const byId = new Map(arr.map((r, i) => [String(r && r.id), i]));
    for (;;) {
      const params = { limit: PAGE, offset };
      if (sinceISO) params.since = sinceISO;
      const items = await Api.list(ent, params);   // rejects → caller keeps old _lastPull, retries
      if (!items || !items.length) break;
      for (const it of items) {
        const rec = it && it.data ? Object.assign({}, it.data, { id: it.id, _mAt: it.updated_at }) : it;
        const id = String(rec.id);
        const idx = byId.get(id);
        if (idx == null) { arr.push(rec); byId.set(id, arr.length - 1); }
        else { arr[idx] = rec; }
        _sig[ent] = _sig[ent] || new Map();
        _sig[ent].set(id, JSON.stringify(rec)); // so we don't echo a just-pulled row back up
        merged++; applied = true;
      }
      if (items.length < PAGE) break;
      offset += PAGE;
    }
    return { merged, applied };
  }

  // One full cycle: push local first, then pull everyone's deltas.
  async function cycle() {
    if (!on() || !_apiReady() || _busy) return;
    _busy = true;
    const cycleStart = new Date().toISOString();
    let touched = false;
    try {
      await pushDirty();                 // send local changes up first
      if (_editing()) return;            // don't pull/re-render over an open form; next cycle will
      for (const ent of ENTITIES) {
        try {
          const r = await _pullEntityDelta(ent, _lastPull[ent]);
          _lastPull[ent] = cycleStart;   // advance the watermark only on success
          if (r.applied) touched = true;
        } catch (e) { /* leave _lastPull as-is → this entity retries next cycle */ }
      }
      if (touched) { AppState.save(); _scheduleRerender(); }
      _maybeReconcile().catch(() => {}); // fire-and-forget; has its own reentrancy + lease guard
    } finally { _busy = false; }
  }

  // ── SharePoint reconciler: lease-coordinated, admins only ────────────────
  // Eligible = Server-First ON + Api ready + this user is an Admin + online +
  // SharePoint is set up here. Server-side, the lease endpoints ALSO enforce
  // admin, so a non-admin client can never reconcile even if this check is wrong.
  function _reconcilerEligible() {
    if (!on() || !_apiReady()) return false;
    if (typeof spPushData !== 'function') return false;
    if (typeof _spConnected === 'undefined' || !_spConnected) return false; // SP must be set up here
    try { if (typeof navigator !== 'undefined' && navigator.onLine === false) return false; } catch (e) {}
    try { return typeof isAdminUser === 'function' && isAdminUser(); } catch (e) { return false; }
  }

  async function _leaseAcquire() {
    // Endpoint may not exist yet (server not migrated) → _fetch throws → treat as "no lease".
    try { return await Api.post('/api/sync-lease/acquire', { deviceId: _deviceId(), ttlSeconds: LEASE_TTL_SEC }); }
    catch (e) { return null; }
  }
  async function _leaseRelease() {
    clearInterval(_leaseRenewTimer); _leaseRenewTimer = null;
    if (!_leaseHeld) return;
    _leaseHeld = false;
    try { await Api.post('/api/sync-lease/release', { deviceId: _deviceId() }); } catch (e) {}
  }

  // Runs at the tail of each LAN cycle (~3 min). Grabs the lease; if a reconcile
  // is actually due (>= RECONCILE_MS since ANY admin last completed one), runs the
  // paced two-way SharePoint sync (v2.14.13) and stamps completion server-side.
  async function _maybeReconcile() {
    if (!_reconcilerEligible()) { if (_leaseHeld) await _leaseRelease(); return; }
    if (_reconciling) return;              // already working
    if (_editing()) return;                // never reconcile over an open form

    // Never reconcile from an EMPTY local. A device that hasn't seeded yet (or
    // lost its cache) has nothing useful to push, and pushing empty risks blanking
    // SharePoint's small settings blob. Server-First seeds local from the server
    // first; until it has, sit this out — don't even take the lease, so a genuinely
    // populated admin device elsewhere can do the reconcile instead. (Bulk data is
    // protected regardless by the spPushData catastrophe guard.)
    let _localCount = 1;
    try { _localCount = (typeof _dataRecordCount === 'function') ? _dataRecordCount(AppState.data) : 1; } catch (e) {}
    if (_localCount === 0) { if (_leaseHeld) await _leaseRelease(); return; }

    const got = await _leaseAcquire();
    if (!got || !got.granted) return;      // another admin holds it, or no lease endpoint
    _leaseHeld = true;

    // Due? last_sync_at is global — another admin's recent completion counts.
    const last = got.lastSyncAt ? Date.parse(got.lastSyncAt) : 0;
    if (last && (Date.now() - last) < RECONCILE_MS) { await _leaseRelease(); return; }

    _reconciling = true;
    // Renew mid-sync so a long push (thousands of records) can't let the lease expire.
    clearInterval(_leaseRenewTimer);
    _leaseRenewTimer = setInterval(() => { _leaseAcquire().catch(() => {}); }, LEASE_RENEW_MS);
    try {
      await Promise.resolve(spPushData(true, true)); // silent, paced, FORCE two-way: always pull SharePoint (incl. online users' edits) down before pushing, then Server-First carries them to the server
      try { await Api.post('/api/sync-lease/synced', { deviceId: _deviceId() }); } catch (e) {}
      try { localStorage.setItem(LS_LAST_SP, String(Date.now())); } catch (e) {}
    } catch (e) {
      try { console.warn('[Server-First] SharePoint reconcile failed:', e && e.message); } catch (e2) {}
    } finally {
      _reconciling = false;
      await _leaseRelease();
    }
  }

  // Manual "Sync with SharePoint now" (Settings button) — a deliberate admin
  // action that bypasses the lease and the due-gate. forcePull=true makes it a
  // full TWO-WAY sync: pull the latest from SharePoint (incl. online users' edits)
  // down into local AND push local up — so clicking it actually brings online
  // changes to the LAN, not just uploads. Returns the promise so the caller can
  // report success/failure (spPushData resolves false if a sync is already
  // running, e.g. the auto-reconciler holds it).
  function backupToSharePointNow() {
    if (typeof spPushData !== 'function') { if (typeof showToast === 'function') showToast('SharePoint not available', 'error'); return Promise.resolve(false); }
    try { localStorage.setItem(LS_LAST_SP, String(Date.now())); } catch (e) {}
    return Promise.resolve(spPushData(false, true)).catch(() => false);
  }

  function _scheduleRerender() {
    clearTimeout(_rerenderTimer);
    _rerenderTimer = setTimeout(() => {
      if (_editing()) return;
      try { if (typeof renderPage === 'function') renderPage(AppState.currentPage || 'dashboard'); } catch (e) {}
    }, 250);
  }

  // ── Lifecycle ────────────────────────────────────────────────────────
  function start() {
    if (_started || !on() || !_apiReady()) return;
    _started = true;
    // Watermark decides delta vs. full pull on the first cycle:
    //   • entity has local rows  → watermark to now, pull only what changed since (light delta)
    //   • entity is EMPTY locally → leave watermark unset so the first cycle FULL-pulls it.
    // This auto-seeds a fresh/empty device (or one whose local cache didn't survive a reload)
    // straight from the server on boot — no manual "Pull everything" needed. Server is the
    // source of truth in Server-First mode, so refilling from it is always safe.
    let seeding = 0;
    ENTITIES.forEach(e => {
      _sig[e] = _snap(e);
      const hasLocal = (AppState.data[e] || []).some(r => r && r.id != null);
      if (hasLocal) { if (!_lastPull[e]) _lastPull[e] = new Date().toISOString(); }
      else { _lastPull[e] = null; seeding++; } // empty → first cycle full-pulls to seed
    });
    clearInterval(_refreshTimer);
    _refreshTimer = setInterval(() => { cycle().catch(() => {}); }, REFRESH_MS);
    cycle().catch(() => {}); // first pass now (seeds empty entities, pushes any pending diffs)
    if (typeof showToast === 'function') {
      showToast(seeding >= ENTITIES.length
        ? 'Server-First mode — loading your data from the local network…'
        : 'Server-First mode active — syncing over the local network', 'success', 3000);
    }
  }
  function stop() {
    _started = false;
    clearInterval(_refreshTimer); _refreshTimer = null;
    clearTimeout(_pushTimer); _pushTimer = null;
    // Don't squat on the reconciler lease while stopped.
    _leaseRelease().catch(() => {});
  }

  // Best-effort lease release when the tab/laptop goes away, so the next eligible
  // admin needn't wait out the TTL. This is only a fast-path nicety — if it doesn't
  // land (unload aborts the request), the lease still frees itself when the TTL
  // expires, so correctness never depends on it.
  function _releaseLeaseOnUnload() {
    if (!_leaseHeld) return;
    _leaseHeld = false;
    clearInterval(_leaseRenewTimer); _leaseRenewTimer = null;
    try { Api.post('/api/sync-lease/release', { deviceId: _deviceId() }).catch(() => {}); } catch (e) {}
  }
  try { window.addEventListener('pagehide', _releaseLeaseOnUnload); window.addEventListener('beforeunload', _releaseLeaseOnUnload); } catch (e) {}
  function cycleNow() { return cycle(); }

  // Save hook: schedule a debounced push whenever the app persists data.
  const _origSave = AppState.save.bind(AppState);
  AppState.save = function () {
    _origSave();
    if (on() && _apiReady()) {
      clearTimeout(_pushTimer);
      _pushTimer = setTimeout(() => { pushDirty().catch(() => {}); }, PUSH_DEBOUNCE_MS);
    }
  };

  // Readiness watcher: Api is configured only after login, and the toggle can
  // flip at runtime — this starts/stops the engine to match, cheaply.
  _readyTimer = setInterval(() => {
    if (on() && _apiReady()) {
      if (!_started) start();
      // Recover promptly after sign-in: the moment a token first becomes obtainable
      // (account wired), pull once so the app hydrates without waiting for the 3-min tick.
      _hasToken().then(has => {
        if (has && !_hadToken) { _hadToken = true; cycle().catch(() => {}); }
        else if (!has) { _hadToken = false; }
      });
    }
    else if (_started) stop();
  }, 5000);

  window.ServerFirst = {
    start, stop, cycleNow, pushDirty, backupToSharePointNow,
    isOn: on,
    status() {
      let last = 0; try { last = +localStorage.getItem(LS_LAST_SP) || 0; } catch (e) {}
      return {
        on: on(), apiReady: _apiReady(), started: _started,
        lastSharePointBackup: last ? new Date(last).toISOString() : null,
        reconciler: {
          eligible: _reconcilerEligible(), holdingLease: _leaseHeld, reconciling: _reconciling, deviceId: _deviceId(),
          localRecords: (() => { try { return (typeof _dataRecordCount === 'function') ? _dataRecordCount(AppState.data) : null; } catch (e) { return null; } })(),
          spHwm: (() => { try { return +localStorage.getItem('shic_sp_local_hwm') || 0; } catch (e) { return null; } })()
        }
      };
    }
  };
})();
