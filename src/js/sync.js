// -- SYNC STATE MACHINE ----------------------------------------
class SyncStateMachine {
  constructor() {
    this._state = 'IDLE';
    this._editing = false;
    this._lastError = null;
    this._lastSyncTs = null;
    this._listeners = [];
  }

  get state() { return this._state; }
  get isEditing() { return this._editing; }
  get lastError() { return this._lastError; }
  get lastSyncTs() { return this._lastSyncTs; }

  // Valid transitions
  static TRANSITIONS = {
    IDLE:    ['PUSHING', 'PULLING', 'SYNCED', 'ERROR'],
    PUSHING: ['SYNCED', 'ERROR', 'IDLE'],
    PULLING: ['SYNCED', 'ERROR', 'IDLE'],
    SYNCED:  ['IDLE', 'PUSHING', 'PULLING', 'ERROR', 'SYNCED'],
    ERROR:   ['IDLE', 'PUSHING', 'PULLING', 'SYNCED'],
  };

  transition(newState, opts = {}) {
    // Same-state is a silent no-op (e.g. SYNCED->SYNCED on rapid auto-sync)
    if (this._state === newState) { if (newState === 'SYNCED') this._lastSyncTs = Date.now(); return true; }
    const allowed = SyncStateMachine.TRANSITIONS[this._state] || [];
    if (!allowed.includes(newState)) {
      console.warn(`[SSM] Invalid transition: ${this._state} ? ${newState}`);
      return false;
    }
    // PUSHING is blocked while editing to prevent wipe-on-sync bug
    if (newState === 'PUSHING' && this._editing) {
      // Auto-clear if editing flag is stale (> 30 min) — guards against unclosed modals
      if (this._editingSetAt && (Date.now() - this._editingSetAt) > 1800000) { this._editing = false; } else {
      return false; // silently skip — auto-sync retries every 30s
      }
    }
    const prev = this._state;
    this._state = newState;
    if (newState === 'ERROR') this._lastError = opts.error || null;
    if (newState === 'SYNCED') { this._lastError = null; this._lastSyncTs = Date.now(); }
    this._listeners.forEach(fn => { try { fn(newState, prev, opts); } catch(e) {} });
    return true;
  }

  startEdit()  { this._editing = true; this._editingSetAt = Date.now(); }
  endEdit()    { this._editing = false; this._editingSetAt = null; }

  onChange(fn) { this._listeners.push(fn); }

  // -- Backward-compat getters/setters for old flag names ------
  get connected()    { return this._state !== 'ERROR' && this._state !== 'IDLE' || this._lastSyncTs !== null; }
  get syncing()      { return this._state === 'PUSHING' || this._state === 'PULLING'; }
  get pushing()      { return this._state === 'PUSHING'; }
  get pulling()      { return this._state === 'PULLING'; }
  get hasError()     { return this._state === 'ERROR'; }
}

// Singleton � one state machine for the whole app
const _ssm = new SyncStateMachine();

// -- TEST MODE -------------------------------------------------
// When active, all list operations use SHIC_TEST_ prefix instead of SHIC_
// Activated by localStorage flag � safe, never touches production lists
const _SHIC_TEST_MODE = localStorage.getItem('shic_test_mode') === '1';
if (_SHIC_TEST_MODE) console.warn('[SHIC] TEST MODE ACTIVE � using SHIC_TEST_ lists');

function _testListName(name) {
  if (!_SHIC_TEST_MODE) return name;
  return name.replace(/^SHIC_/, 'SHIC_TEST_');
}

// Backward-compat shims � read-only mirrors of _ssm state
Object.defineProperty(window, '_spConnected', { get: () => _ssm.connected, configurable: true });
Object.defineProperty(window, '_spSyncing',   { get: () => _ssm.syncing,   configurable: true });
// ── SYNC STATUS BUTTON + ID COLLISION DETECTION ───────────
// ═══════════════════════════════════════════════════════════

let _syncState = 'synced'; // synced | pending | syncing | error | offline
let _syncLastTs = null;
let _syncLastPushed = 0;
let _syncLastPulled = 0;
let _syncLastRenamed = 0;
let _syncLastError = '';

// Update the button visual state
function updateSyncStatusButton() {
  const btn = document.getElementById('syncStatusBtn');
  const dot = document.getElementById('syncStatusDot');
  const label = document.getElementById('syncStatusLabel');
  if (!btn || !dot || !label) return;

  // Disabled state if SP not connected
  if (!_spConnected) _syncState = 'offline';
  // Otherwise determine if there are pending changes
  else if (_syncState !== 'syncing' && _syncState !== 'error') {
    const pending = _computePendingChanges();
    _syncState = pending > 0 ? 'pending' : 'synced';
  }

  const states = {
    synced: {
      bg: 'rgba(63,185,80,.12)', border: 'rgba(63,185,80,.4)', color: '#3fb950',
      dotBg: '#3fb950', dotAnim: 'syncPulse 2s ease-in-out infinite',
      label: 'Synced', icon: null,
      tooltip: 'All data is in sync with SharePoint' + (_syncLastTs ? ' · Last sync ' + _formatRelativeTime(_syncLastTs) : '') + ' · Click to refresh'
    },
    pending: {
      bg: 'rgba(240,164,80,.15)', border: 'rgba(240,164,80,.5)', color: '#f0a450',
      dotBg: '#f0a450', dotAnim: 'syncPulse 1s ease-in-out infinite',
      label: (_computePendingChanges() || 1) + ' changes pending', icon: null,
      tooltip: 'You have unsynced changes · Click to sync now'
    },
    syncing: {
      bg: 'rgba(56,139,253,.15)', border: 'rgba(56,139,253,.5)', color: '#388bfd',
      dotBg: '#388bfd', dotAnim: 'syncSpin 1s linear infinite',
      label: 'Syncing...', icon: 'fa-circle-notch',
      tooltip: 'Syncing with SharePoint'
    },
    error: {
      bg: 'rgba(248,81,73,.15)', border: 'rgba(248,81,73,.5)', color: '#f85149',
      dotBg: '#f85149', dotAnim: 'syncPulse 0.8s ease-in-out infinite',
      label: 'Sync error', icon: 'fa-triangle-exclamation',
      tooltip: 'Last sync failed: ' + (_syncLastError || 'Unknown error') + ' · Click to retry'
    },
    offline: {
      bg: 'rgba(139,148,158,.12)', border: 'rgba(139,148,158,.3)', color: '#8b949e',
      dotBg: '#8b949e', dotAnim: 'none',
      label: 'Offline', icon: 'fa-wifi',
      tooltip: 'Not connected to SharePoint · Sign in to enable sync'
    },
  };
  const s = states[_syncState] || states.synced;
  btn.style.background = s.bg;
  btn.style.borderColor = s.border;
  btn.style.color = s.color;
  btn.title = s.tooltip;
  if (s.icon) {
    dot.style.display = 'none';
    let iconEl = document.getElementById('syncStatusIcon');
    if (!iconEl) {
      iconEl = document.createElement('i');
      iconEl.id = 'syncStatusIcon';
      iconEl.className = 'fas ' + s.icon;
      iconEl.style.fontSize = '10px';
      btn.insertBefore(iconEl, label);
    } else {
      iconEl.className = 'fas ' + s.icon;
      iconEl.style.display = '';
    }
    iconEl.style.animation = s.dotAnim;
  } else {
    const iconEl = document.getElementById('syncStatusIcon');
    if (iconEl) iconEl.style.display = 'none';
    dot.style.display = '';
    dot.style.background = s.dotBg;
    dot.style.animation = s.dotAnim;
  }
  label.textContent = s.label;
}

function _formatRelativeTime(ts) {
  const diff = Date.now() - ts;
  if (diff < 60000) return 'just now';
  if (diff < 3600000) return Math.floor(diff / 60000) + ' min ago';
  if (diff < 86400000) return Math.floor(diff / 3600000) + ' hr ago';
  return new Date(ts).toLocaleDateString();
}

// ── Compute number of records that differ from last-known remote state ──
function _computePendingChanges() {
  try {
    // Always count records with _newlyCreated flag (truth source)
    const items = _countChangedRecords();
    return items.length;
  } catch(e) { return 0; }
}

// Returns the actual pending items for display
function _getPendingItems() {
  try { return _countChangedRecords(); } catch(e) { return []; }
}

function _normalizeDataForHash(data) {
  const copy = { ...data };
  // Strip volatile fields that change without "real" edits
  delete copy._ts; delete copy._by; delete copy._deletedIds;
  return copy;
}


// ── Track when data was last in sync with remote ──
// _lastSyncedSnapshot stores JSON hashes per array so we can detect modifications
// to existing records (not just _newlyCreated)
let _lastSyncedSnapshot = {}; // { dataKey: hashByRecordId }

function _captureSyncedSnapshot() {
  _lastSyncedSnapshot = {};
  const arrays = [
    'projects','tasks','costs','qaqc','risks','actions','documents','libraryDocs',
    'resourceAllocations','resourceUsageLogs','dailyMeetingLogs','procurement','procurementLogs',
    'materials','manpower','equipment','tools','vehicles','consumables','thirdParty',
    'assetHistory','assetUtilization','idChangeRequests','notifications','projectIdHistory',
    'warehouseItems','stockTransactions','issuanceRequests'
  ];
  arrays.forEach(k => {
    const list = AppState.data[k] || [];
    _lastSyncedSnapshot[k] = {};
    list.forEach(r => {
      if (r && r.id) {
        // Hash the record content (exclude transient flags)
        const clean = { ...r };
        delete clean._newlyCreated;
        delete clean._localCreatedAt;
        _lastSyncedSnapshot[k][r.id] = _quickHash(JSON.stringify(clean));
      }
    });
  });
}

// Returns array of [dataKey, recordId, type] for records that differ from last sync
function _detectContentChanges() {
  const changes = [];
  const arrays = Object.keys(_lastSyncedSnapshot);
  arrays.forEach(k => {
    const snap = _lastSyncedSnapshot[k] || {};
    const list = AppState.data[k] || [];
    const localById = {};
    list.forEach(r => { if (r && r.id) localById[r.id] = r; });

    // Modified or new records
    Object.entries(localById).forEach(([id, r]) => {
      if (r._deleted) return; // soft-deleted counted separately
      if (r._newlyCreated) {
        changes.push({ dataKey: k, recordId: id, type: 'new', label: r.description||r.name||r.title||id });
        return;
      }
      const clean = { ...r };
      delete clean._newlyCreated;
      delete clean._localCreatedAt;
      const hash = _quickHash(JSON.stringify(clean));
      if (snap[id] && snap[id] !== hash) {
        changes.push({ dataKey: k, recordId: id, type: 'modified', label: r.description||r.name||r.title||id });
      } else if (!snap[id]) {
        // Not in last snapshot — treat as new
        changes.push({ dataKey: k, recordId: id, type: 'new', label: r.description||r.name||r.title||id });
      }
    });

    // Soft-deleted records — only mark pending if NOT yet captured in snapshot
    // (otherwise they show as "pending" forever after they've been pushed)
    list.filter(r => r && r._deleted).forEach(r => {
      const clean = { ...r };
      delete clean._newlyCreated;
      delete clean._localCreatedAt;
      const hash = _quickHash(JSON.stringify(clean));
      if (snap[r.id] !== hash) {
        changes.push({ dataKey: k, recordId: r.id, type: 'deleted', label: r.description||r.name||r.title||r.id });
      }
    });
  });
  return changes;
}

function _countChangedRecords() {
  // Returns array of pending items so we can show details
  // Uses BOTH the _newlyCreated flag (for new records) AND content-diff (for edits)
  const items = [];

  // First, get content-based changes (modified existing records + new)
  if (Object.keys(_lastSyncedSnapshot||{}).length > 0) {
    const changes = _detectContentChanges();
    changes.forEach(c => {
      const labelMap = {
        projects:'Project',tasks:'Task',costs:'Cost',qaqc:'QA/QC',risks:'Risk',actions:'Action',
        documents:'Document',libraryDocs:'Library Doc',resourceAllocations:'Allocation',
        resourceUsageLogs:'Usage Log',dailyMeetingLogs:'Daily Log',procurement:'Procurement',
        procurementLogs:'Proc. Log',materials:'Material',manpower:'Manpower',equipment:'Equipment',
        tools:'Tool',vehicles:'Vehicle',consumables:'Consumable',thirdParty:'Third Party',
        assetHistory:'Asset History',assetUtilization:'Asset Util.',idChangeRequests:'ID Change Req',
        notifications:'Notification',projectIdHistory:'Project ID Hist'
      };
      items.push({
        arrayKey: c.dataKey,
        type: labelMap[c.dataKey] || c.dataKey,
        id: c.recordId,
        label: c.label + (c.type==='modified' ? ' (modified)' : c.type==='deleted' ? ' (deleted)' : ''),
        createdAt: new Date().toISOString(),
        createdBy: _currentUserProfile?.name || 'You',
      });
    });
    return items;
  }

  // Fallback: original flag-based detection (when no snapshot yet)
  const arrays = [
    { k: 'projects', label: 'Project' },
    { k: 'tasks', label: 'Task' },
    { k: 'costs', label: 'Cost' },
    { k: 'qaqc', label: 'QA/QC' },
    { k: 'risks', label: 'Risk' },
    { k: 'actions', label: 'Action' },
    { k: 'documents', label: 'Document' },
    { k: 'libraryDocs', label: 'Library Doc' },
    { k: 'resourceAllocations', label: 'Allocation' },
    { k: 'resourceUsageLogs', label: 'Usage Log' },
    { k: 'dailyMeetingLogs', label: 'Daily Log' },
    { k: 'procurement', label: 'Procurement' },
    { k: 'procurementLogs', label: 'Proc. Log' },
    { k: 'materials', label: 'Material' },
    { k: 'manpower', label: 'Manpower' },
    { k: 'equipment', label: 'Equipment' },
    { k: 'tools', label: 'Tool' },
    { k: 'vehicles', label: 'Vehicle' },
    { k: 'consumables', label: 'Consumable' },
    { k: 'thirdParty', label: 'Third Party' },
    { k: 'assetHistory', label: 'Asset History' },
    { k: 'assetUtilization', label: 'Asset Util.' },
    { k: 'idChangeRequests', label: 'ID Change Req' },
  ];
  arrays.forEach(cfg => {
    (AppState.data[cfg.k] || []).forEach(r => {
      if (r && r._newlyCreated) {
        items.push({
          arrayKey: cfg.k,
          type: cfg.label,
          id: r.id || '',
          label: r.description || r.name || r.title || r.id || '(unnamed)',
          createdAt: r._localCreatedAt || r.createdAt || '',
          createdBy: r.createdBy || r.uploadedBy || _currentUserProfile?.name || '',
        });
      }
    });
  });
  return items;
}

// ── Click handler: bi-directional sync ────────────────────
async function syncStatusClick() {
  if (_syncState === 'syncing') return;
  if (!_spConnected) {
    showToast('Not connected to SharePoint — please sign in', 'warning', 4000);
    return;
  }
  // If pending, show details modal first with options to sync or review
  if (_syncState === 'pending') {
    const items = _getPendingItems();
    if (items.length > 0) {
      showPendingDetails(items);
      return;
    }
  }
  // No pending → just sync to verify
  await _doFullSync();
}


// ── Show what's pending sync ──────────────────────────────
function showPendingDetails(items) {
  if (!items || items.length === 0) {
    // Nothing actually pending — start sync directly
    _doFullSync();
    return;
  }
  // Group by type for clean display
  const byType = {};
  items.forEach(it => {
    if (!byType[it.type]) byType[it.type] = [];
    byType[it.type].push(it);
  });

  $('#genericModalTitle').textContent = 'Pending Sync — ' + items.length + ' item' + (items.length !== 1 ? 's' : '');
  $('#genericModalBody').innerHTML = `
    <div style="padding:10px 12px;background:rgba(240,164,80,.08);border:1px solid rgba(240,164,80,.25);border-radius:8px;margin-bottom:14px">
      <div style="font-weight:700;color:var(--accent-amber);margin-bottom:4px"><i class="fas fa-cloud-upload-alt" style="margin-right:5px"></i>${items.length} record${items.length !== 1 ? 's' : ''} not yet synced to SharePoint</div>
      <div style="font-size:11px;color:var(--text-secondary)">These items were created/changed locally and will be pushed when you sync.</div>
    </div>
    <div style="max-height:380px;overflow-y:auto">
      ${Object.entries(byType).map(([type, list]) => `
        <div style="margin-bottom:14px">
          <div style="font-size:10px;font-weight:700;color:var(--text-muted);letter-spacing:1px;margin-bottom:6px;padding:0 4px">${type.toUpperCase()} <span style="color:var(--accent-amber)">(${list.length})</span></div>
          ${list.map(it => `
            <div style="padding:8px 12px;border:1px solid var(--border);border-radius:7px;margin-bottom:5px;font-size:11px;display:flex;align-items:center;gap:10px">
              <i class="fas fa-circle" style="color:var(--accent-amber);font-size:6px;flex-shrink:0"></i>
              <div style="flex:1;min-width:0">
                <div style="font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">
                  ${it.id ? `<span style="font-family:var(--font-mono);color:var(--accent-blue);margin-right:6px">${it.id}</span>` : ''}${it.label}
                </div>
                <div style="font-size:9px;color:var(--text-muted);margin-top:2px">
                  ${it.createdBy ? '👤 ' + it.createdBy + ' · ' : ''}${it.createdAt ? '📅 ' + new Date(it.createdAt).toLocaleString() : 'just now'}
                </div>
              </div>
            </div>
          `).join('')}
        </div>
      `).join('')}
    </div>
  `;
  $('#genericModalFooter').innerHTML = `
    <button class="btn btn-secondary" onclick="closeModal('genericModal')">Cancel</button>
    <button class="btn btn-secondary" onclick="_discardPendingChanges()" style="color:var(--accent-red);border-color:rgba(248,81,73,.3)" title="Discard all unsynced changes"><i class="fas fa-trash"></i> Discard</button>
    <button class="btn btn-primary" onclick="closeModal('genericModal');_doFullSync()"><i class="fas fa-cloud-upload-alt"></i> Sync Now</button>
  `;
  openModal('genericModal');
}

// ── Confirm + discard all pending changes ─────────────────
function _discardPendingChanges() {
  if (!confirm('Discard ALL unsynced changes?\n\nThis will REMOVE records that have not been pushed to SharePoint. This action cannot be undone.')) return;
  const arrays = ['projects','tasks','costs','qaqc','risks','actions','documents','libraryDocs',
    'resourceAllocations','resourceUsageLogs','dailyMeetingLogs','procurement','procurementLogs',
    'materials','manpower','equipment','tools','vehicles','consumables','thirdParty',
    'assetHistory','assetUtilization','idChangeRequests','notifications','activities','projectIdHistory',
    'warehouseItems','stockTransactions','issuanceRequests'];
  let removed = 0;
  arrays.forEach(k => {
    if (!AppState.data[k]) return;
    const before = AppState.data[k].length;
    AppState.data[k] = AppState.data[k].filter(r => !(r && r._newlyCreated));
    removed += before - AppState.data[k].length;
  });
  AppState.save();
  closeModal('genericModal');
  try { updateSyncStatusButton(); } catch(e) {}
  showToast('Discarded ' + removed + ' unsynced record(s)', 'warning', 4000);
  // Re-render whatever page we're on
  try { const cur = AppState.currentPage; if (cur && typeof navigate === 'function') navigate(cur); } catch(e) {}
}

// ── Do the actual sync (extracted from syncStatusClick) ────
async function _doFullSync() {
  _syncState = 'syncing';
  updateSyncStatusButton();
  try {
    // ── STEP 1: PUSH FIRST ──────────────────────────────
    // Push local changes BEFORE pulling — protects against losing in-progress edits.
    // The push uses the latest local state; subsequent pull merges remote into local
    // without overwriting what we just pushed.
    await spPushData(true);

    // ── STEP 2: DETECT ID COLLISIONS ──────────────
    // After push, see if anyone else created the same IDs in parallel
    const renamed = await _detectAndResolveIdCollisions();
    _syncLastRenamed = renamed.length;
    if (renamed.length > 0) {
      // Push again with renumbered IDs
      await spPushData(true);
    }

    // ── STEP 3: PULL LATEST FROM REMOTE ──────────
    // Now safe to pull — our changes are already in SharePoint.
    // Smart-merge will preserve any in-progress edits via _editingRecords.
    await _spPollRemote();

    _clearNewlyCreatedFlags();
    _captureSyncedSnapshot(); // remember current state as the synced baseline
    _syncLastTs = Date.now();
    _syncState = 'synced';
    _syncLastError = '';
    if (renamed.length > 0) {
      _showIdRenameSummary(renamed);
    } else {
      showToast('Sync complete · all data in sync', 'success', 3000);
    }
  } catch(e) {
    console.error('[Sync] Failed:', e);
    _syncState = 'error';
    _syncLastError = e.message || 'Unknown error';
    showToast('Sync failed: ' + _syncLastError, 'error', 5000);
  }
  updateSyncStatusButton();
}


// ═══════════════════════════════════════════════════════════
// ── ID COLLISION DETECTION (first-to-sync wins) ───────────
// ═══════════════════════════════════════════════════════════

// Data arrays that use auto-incremented IDs
const _COLLISION_CHECKED_ARRAYS = [
  { key: 'actions', prefix: 'ACT', refs: [] },
  { key: 'tasks', prefix: 'TSK', refs: [] },
  { key: 'costs', prefix: 'COST', refs: [] },
  { key: 'qaqc', prefix: 'QA', refs: [] },
  { key: 'risks', prefix: 'RSK', refs: [] },
  { key: 'documents', prefix: 'DOC', refs: [] },
  { key: 'libraryDocs', prefix: 'LIB', refs: [] },
  { key: 'resourceAllocations', prefix: 'ALC', refs: [] },
  { key: 'resourceUsageLogs', prefix: 'USE', refs: [] },
  { key: 'dailyMeetingLogs', prefix: 'LOG', refs: [] },
  { key: 'procurement', prefix: 'PROC', refs: [] },
  { key: 'materials', prefix: 'MAT', refs: [] },
  { key: 'assetHistory', prefix: 'AH', refs: ['assetId'] },
  { key: 'notifications', prefix: 'NOTIF', refs: [] },
  { key: 'idChangeRequests', prefix: 'IDC', refs: [] },
];

// After pulling latest, check if any of OUR newly-created local records
// have IDs that now exist remotely as DIFFERENT records → renumber locally
async function _detectAndResolveIdCollisions() {
  const renamed = []; // [{ arrayKey, oldId, newId, label }]
  const remoteSnapshot = AppState.data; // After pull, this has SP state merged

  for (const cfg of _COLLISION_CHECKED_ARRAYS) {
    const list = AppState.data[cfg.key] || [];
    // Find our newly created items
    const newlyCreated = list.filter(r => r && r._newlyCreated);
    if (newlyCreated.length === 0) continue;

    // Build a set of all known IDs in this array (from remote-merged data)
    const knownIds = new Set(list.map(r => r.id).filter(Boolean));

    for (const localItem of newlyCreated) {
      // Check if anyone else has used this ID since we created it locally
      const sameIdItems = list.filter(r => r && r.id === localItem.id);
      if (sameIdItems.length <= 1) continue; // only ours, no collision

      // Identify which one is "ours" (has _newlyCreated and matches our user/timestamp)
      // Our item is the one with _newlyCreated=true; the other is from SP
      const ourItem = sameIdItems.find(r => r._newlyCreated === true && r._localCreatedAt === localItem._localCreatedAt);
      const otherItem = sameIdItems.find(r => r !== ourItem);
      if (!ourItem || !otherItem) continue;

      // Are they actually different records?
      // Compare key signature fields (description/title, createdBy, createdAt)
      const sig = r => (r.description||r.title||r.name||'') + '|' + (r.createdBy||r.uploadedBy||'') + '|' + (r._localCreatedAt||r.createdAt||r.uploadedAt||'');
      if (sig(ourItem) === sig(otherItem)) continue; // same record — keep one (the SP one), drop ours

      // COLLISION — renumber ours to next free ID
      const newId = _nextFreeId(cfg.prefix, knownIds);
      knownIds.add(newId);

      // Update references (e.g., assetHistory has assetId reference)
      const oldId = ourItem.id;
      ourItem.id = newId;

      // For actions: update any project's actions[].updates that reference this action
      // For tasks: nothing to update internally
      // For others: skip — references are usually one-way

      // Track the renumber
      renamed.push({
        arrayKey: cfg.key, oldId, newId,
        label: ourItem.description || ourItem.title || ourItem.name || ourItem.id,
        otherLabel: otherItem.description || otherItem.title || otherItem.name || otherItem.id,
        otherBy: otherItem.createdBy || otherItem.uploadedBy || 'another user',
      });

      // Activity log
      if (!AppState.data.activities) AppState.data.activities = [];
      AppState.data.activities.unshift({
        id: 'ACTV-' + Date.now().toString(36).toUpperCase() + '-' + Math.random().toString(36).slice(2,6),
        type: 'id_renumber',
        message: 'Renumbered ' + cfg.key + ' ' + oldId + ' → ' + newId + ' (collision with another user)',
        at: new Date().toISOString(),
        user: _currentUserProfile?.name || 'system',
      });
    }
  }

  if (renamed.length > 0) {
    AppState.save();
  }
  return renamed;
}

function _nextFreeId(prefix, knownIds) {
  // Find max existing number with this prefix, then increment
  let maxN = 0;
  knownIds.forEach(id => {
    if (typeof id !== 'string') return;
    const m = id.match(new RegExp('^' + prefix + '-(\\d+)$'));
    if (m) {
      const n = parseInt(m[1], 10);
      if (n > maxN) maxN = n;
    }
  });
  // Use padding consistent with prefix
  const pad = prefix === 'TSK' ? 5 : prefix === 'AH' ? 4 : 3;
  return prefix + '-' + String(maxN + 1).padStart(pad, '0');
}

function _clearNewlyCreatedFlags() {
  _COLLISION_CHECKED_ARRAYS.forEach(cfg => {
    (AppState.data[cfg.key] || []).forEach(r => {
      if (r && r._newlyCreated) {
        delete r._newlyCreated;
        delete r._localCreatedAt;
      }
    });
  });
}

// ── Show summary modal of renumbered IDs ──────────────────
function _showIdRenameSummary(renamed) {
  $('#genericModalTitle').textContent = 'ID Conflicts Resolved';
  $('#genericModalBody').innerHTML = `
    <div style="padding:10px 12px;background:rgba(240,164,80,.1);border:1px solid rgba(240,164,80,.3);border-radius:8px;margin-bottom:14px">
      <div style="font-weight:700;color:var(--accent-amber);margin-bottom:4px"><i class="fas fa-shuffle" style="margin-right:5px"></i>${renamed.length} of your record${renamed.length!==1?'s':''} ${renamed.length===1?'was':'were'} renumbered</div>
      <div style="font-size:11px;color:var(--text-secondary)">
        While you were offline, other users created records with the same IDs. To preserve everyone's data, your local records were assigned new IDs.
      </div>
    </div>
    <div style="max-height:280px;overflow-y:auto">
      ${renamed.map(r => `
        <div style="padding:10px 12px;border:1px solid var(--border);border-radius:7px;margin-bottom:7px;font-size:11px">
          <div style="display:flex;align-items:center;gap:8px;font-family:var(--font-mono);font-weight:700;margin-bottom:4px">
            <span style="color:var(--text-muted);text-decoration:line-through">${r.oldId}</span>
            <i class="fas fa-arrow-right" style="color:var(--accent-amber);font-size:9px"></i>
            <span style="color:var(--accent-green)">${r.newId}</span>
            <span style="font-size:9px;color:var(--text-muted);font-family:var(--font-primary);margin-left:auto">${r.arrayKey}</span>
          </div>
          <div style="color:var(--text-primary);font-size:11px"><strong>Yours:</strong> ${r.label}</div>
          <div style="color:var(--text-muted);font-size:10px;margin-top:2px"><strong>Other (${r.otherBy}):</strong> ${r.otherLabel}</div>
        </div>
      `).join('')}
    </div>
  `;
  $('#genericModalFooter').innerHTML = `<button class="btn btn-primary" onclick="closeModal('genericModal')">OK · Got it</button>`;
  openModal('genericModal');
}

// ── Hook: mark new records as "newly created" so collision detection knows ──
(function hookAppStateForNewlyCreated() {
  // Override AppState.save to refresh sync status indicator
  if (AppState && typeof AppState.save === 'function' && !AppState._syncIndicatorHooked) {
    AppState._syncIndicatorHooked = true;
    const origSave = AppState.save.bind(AppState);
    AppState.save = function() {
      const r = origSave();
      // Mark recently-pushed records — anything without an _newlyCreated flag yet
      // and that was just added in the last second
      // We do this by hooking into push points (saveProject, saveTask, etc.) via the wrapper below
      try { updateSyncStatusButton(); } catch(e) {}
      return r;
    };
  }
})();

// ── Helper: call this when creating a new record so it's tracked ──
function _markNewlyCreated(record) {
  if (!record) return record;
  record._newlyCreated = true;
  record._localCreatedAt = new Date().toISOString();
  return record;
}

// ── Periodic refresh of button state ──
setInterval(() => {
  try { updateSyncStatusButton(); } catch(e) {}
}, 5000);

// Initial state after page load
setTimeout(() => {
  try { updateSyncStatusButton(); } catch(e) {}
}, 800);

// Hook to a successful push: mark synced
(function hookSpPushSuccess() {
  if (typeof spPushData !== 'function' || spPushData._syncHooked) return;
  spPushData._syncHooked = true;
  const orig = spPushData;
  window.spPushData = async function(...args) {
    try {
      const result = await orig.apply(this, args);
      _syncLastTs = Date.now();
      _syncState = 'synced';
      _clearNewlyCreatedFlags();
      // ALWAYS recapture snapshot after push — even if push had nothing to do,
      // this clears any stale "pending" state from before
      try { _captureSyncedSnapshot(); } catch(e) {}
      try { updateSyncStatusButton(); } catch(e) {}
      // Auto-backup: export JSON to Downloads at most once per day, if enabled in Settings
      try { _maybeAutoBackup(); } catch(e) {}
      return result;
    } catch(e) {
      _syncState = 'error';
      _syncLastError = e.message || String(e);
      try { updateSyncStatusButton(); } catch(e2) {}
      throw e;
    }
  };
})();

// ── SharePoint Audit Log ──────────────────────────────────────
// Writes immutable audit events to SHIC_AuditLog SP list.
// Non-blocking (fire-and-forget). Creates the list on first write if absent.
let _auditListId = null;

async function spWriteAuditLog(action, entityType, entityId, entityName, details) {
  if (!_spConnected || !_spSiteId) return;
  try {
    const token = await getSpToken();
    if (!token) return;
    // Resolve list ID once
    if (!_auditListId) {
      const lr = await fetch(
        `https://graph.microsoft.com/v1.0/sites/${_spSiteId}/lists?$filter=displayName eq 'SHIC_AuditLog'&$select=id`,
        { headers: { Authorization: 'Bearer ' + token } }
      );
      const ld = await lr.json();
      if (ld.value?.length > 0) {
        _auditListId = ld.value[0].id;
      } else {
        // Create list
        const cr = await fetch(`https://graph.microsoft.com/v1.0/sites/${_spSiteId}/lists`, {
          method: 'POST',
          headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            displayName: 'SHIC_AuditLog',
            list: { template: 'genericList' },
          })
        });
        const cd = await cr.json();
        _auditListId = cd.id;
      }
    }
    // Append audit record
    await fetch(`https://graph.microsoft.com/v1.0/sites/${_spSiteId}/lists/${_auditListId}/items`, {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
      body: JSON.stringify({ fields: {
        Title: action,
        EntityType: String(entityType || ''),
        EntityId: String(entityId || ''),
        EntityName: String(entityName || '').substring(0, 255),
        UserName: String(_currentUserProfile?.name || ''),
        UserEmail: String(_currentUserProfile?.email || ''),
        Details: typeof details === 'object' ? JSON.stringify(details).substring(0, 2000) : String(details || ''),
      }})
    });
  } catch(e) {
    console.warn('[SHIC Audit] Write skipped:', e.message);
  }
}

// ── Read audit log from SharePoint (admin UI) ─────────────────
async function spReadAuditLog(limit) {
  if (!_spConnected || !_spSiteId) return [];
  try {
    const token = await getSpToken();
    if (!token) return [];
    if (!_auditListId) await spWriteAuditLog('_ping', '', '', '', {}); // ensure list exists
    if (!_auditListId) return [];
    const res = await fetch(
      `https://graph.microsoft.com/v1.0/sites/${_spSiteId}/lists/${_auditListId}/items?$expand=fields&$orderby=createdDateTime desc&$top=${limit||100}`,
      { headers: { Authorization: 'Bearer ' + token } }
    );
    const data = await res.json();
    return (data.value || []).map(i => ({
      action: i.fields?.Title || '',
      entityType: i.fields?.EntityType || '',
      entityId: i.fields?.EntityId || '',
      entityName: i.fields?.EntityName || '',
      userName: i.fields?.UserName || '',
      userEmail: i.fields?.UserEmail || '',
      details: i.fields?.Details || '',
      timestamp: i.createdDateTime || '',
    }));
  } catch(e) {
    console.warn('[SHIC Audit] Read failed:', e.message);
    return [];
  }
}

// ── Auto-backup helper ────────────────────────────────────────
function _maybeAutoBackup() {
  if (!AppState.data?.settings?.autoBackup) return;
  const today = new Date().toISOString().slice(0, 10);
  const lastKey = 'shic_autobackup_last';
  if (localStorage.getItem(lastKey) === today) return; // already ran today
  localStorage.setItem(lastKey, today);
  try {
    const backup = {
      version: typeof APP_VERSION !== 'undefined' ? APP_VERSION : '?',
      exportedAt: new Date().toISOString(),
      autoBackup: true,
      data: AppState.data,
    };
    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `shic_autobackup_${today}.json`;
    a.click();
    console.log('[SHIC] Auto-backup saved for', today);
  } catch(e) { console.warn('[SHIC] Auto-backup failed:', e.message); }
}

// ── 3. SAVE INDICATOR ───────────────────────────────────────
let _saveIndicatorTimer = null;
function showSaveIndicator(state) {
  const el = document.getElementById('saveIndicator');
  const icon = document.getElementById('saveIndicatorIcon');
  const text = document.getElementById('saveIndicatorText');
  if (!el || !icon || !text) return;
  clearTimeout(_saveIndicatorTimer);
  el.style.opacity = '1';
  if (state === 'saving') {
    icon.className = 'fas fa-circle-notch fa-spin';
    icon.style.color = 'var(--accent-amber)';
    text.textContent = 'Saving...';
  } else if (state === 'synced') {
    icon.className = 'fas fa-cloud-upload-alt';
    icon.style.color = 'var(--accent-green)';
    text.textContent = 'Synced to SharePoint';
    _saveIndicatorTimer = setTimeout(() => { el.style.opacity = '0'; }, 2500);
  } else if (state === 'offline') {
    icon.className = 'fas fa-wifi';
    icon.style.color = 'var(--accent-red)';
    text.textContent = 'Offline — queued';
    _saveIndicatorTimer = setTimeout(() => { el.style.opacity = '0'; }, 4000);
  } else { // saved
    icon.className = 'fas fa-check-circle';
    icon.style.color = 'var(--accent-green)';
    text.textContent = 'Saved';
    _saveIndicatorTimer = setTimeout(() => { el.style.opacity = '0'; }, 2000);
  }
}

// Hook into AppState.save
(function() {
  if (AppState && typeof AppState.save === 'function' && !AppState._saveIndicatorHooked) {
    AppState._saveIndicatorHooked = true;
    const origSave = AppState.save.bind(AppState);
    AppState.save = function() {
      showSaveIndicator('saving');
      const result = origSave();
      setTimeout(() => showSaveIndicator(navigator.onLine ? 'saved' : 'offline'), 300);
      return result;
    };
  }
})();

// ── 4. KEYBOARD SHORTCUTS ───────────────────────────────────
const KBD_SHORTCUTS = [
  { keys: 'Ctrl/Cmd + K', desc: 'Open command palette' },
  { keys: 'Ctrl/Cmd + S', desc: 'Force save & sync to SharePoint' },
  { keys: 'Ctrl/Cmd + /', desc: 'Show keyboard shortcuts' },
  { keys: '?', desc: 'Show keyboard shortcuts' },
  { keys: 'G then D', desc: 'Go to Dashboard' },
  { keys: 'G then P', desc: 'Go to Projects' },
  { keys: 'G then T', desc: 'Go to Tasks' },
  { keys: 'G then M', desc: 'Go to Daily Meeting' },
  { keys: 'G then S', desc: 'Go to Settings' },
  { keys: 'Esc', desc: 'Close modal / palette' },
];

function showKbdHelp() {
  const helpEl = document.getElementById('kbdHelp');
  const listEl = document.getElementById('kbdHelpList');
  if (!helpEl || !listEl) return;
  listEl.innerHTML = KBD_SHORTCUTS.map(s => `
    <div style="display:flex;justify-content:space-between;align-items:center;padding:6px 0;border-bottom:1px solid var(--border)">
      <span style="color:var(--text-secondary)">${s.desc}</span>
      <kbd style="font-size:11px;padding:3px 8px;background:var(--bg-hover);border:1px solid var(--border);border-radius:5px;font-family:var(--font-mono)">${s.keys}</kbd>
    </div>
  `).join('');
  helpEl.style.display = 'block';
}

// G-then-X navigation state
let _gPressed = false;
let _gTimer = null;

document.addEventListener('keydown', function(e) {
  // Guard: skip synthetic events that don't have a key (IME, autofill, etc.)
  if (typeof e.key !== 'string') return;

  const inInput = ['INPUT','TEXTAREA','SELECT'].includes(document.activeElement?.tagName) ||
    document.activeElement?.isContentEditable;

  // Cmd/Ctrl+K — command palette (works everywhere)
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
    e.preventDefault();
    openCmdPalette();
    return;
  }

  // Cmd/Ctrl+S — force save & sync
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') {
    e.preventDefault();
    AppState.save();
    if (typeof spPushData === 'function' && _spConnected) {
      showSaveIndicator('saving');
      spPushData(false).then(() => showSaveIndicator('synced')).catch(() => showSaveIndicator('offline'));
    }
    return;
  }

  // Cmd/Ctrl+/ — keyboard help
  if ((e.metaKey || e.ctrlKey) && e.key === '/') {
    e.preventDefault();
    showKbdHelp();
    return;
  }

  // Skip remaining single-key shortcuts when typing
  if (inInput) return;

  // ? — keyboard help
  if (e.key === '?') {
    e.preventDefault();
    showKbdHelp();
    return;
  }

  // Guard against synthetic events with no key (IME, autofill, extensions)
  if (typeof e.key !== 'string') return;

  // G-then-X navigation
  if (e.key.toLowerCase() === 'g' && !_gPressed) {
    _gPressed = true;
    clearTimeout(_gTimer);
    _gTimer = setTimeout(() => { _gPressed = false; }, 1200);
    return;
  }
  if (_gPressed) {
    _gPressed = false;
    clearTimeout(_gTimer);
    const gMap = { d: 'dashboard', p: 'projects', t: 'tasks', m: 'dailymeeting', s: 'settings', r: 'reports', c: 'calendar', k: 'kpi' };
    const target = gMap[e.key.toLowerCase()];
    if (target) { e.preventDefault(); navigate(target); }
    return;
  }
});

// ── 5. PWA INSTALL PROMPT ───────────────────────────────────
let _deferredInstallPrompt = null;

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  _deferredInstallPrompt = e;
  _showInstallBanner();
});

function _showInstallBanner() {
  // Don't show if dismissed recently
  const dismissed = localStorage.getItem('shic_install_dismissed');
  if (dismissed && Date.now() - parseInt(dismissed) < 7 * 86400000) return;
  // Don't show if already installed
  if (window.matchMedia('(display-mode: standalone)').matches) return;

  const banner = document.createElement('div');
  banner.id = 'installBanner';
  banner.style.cssText = 'position:fixed;bottom:20px;right:20px;z-index:9999;background:var(--bg-card);border:1px solid var(--border);border-radius:12px;padding:14px 16px;box-shadow:0 8px 32px rgba(0,0,0,.4);max-width:320px;display:flex;align-items:center;gap:12px';
  banner.innerHTML = `
    <div style="width:40px;height:40px;background:linear-gradient(135deg,#f59e0b,#d97706);border-radius:10px;display:flex;align-items:center;justify-content:center;font-size:18px;font-weight:900;color:#fff;flex-shrink:0">S</div>
    <div style="flex:1">
      <div style="font-size:13px;font-weight:700">Install SHIC PM Suite</div>
      <div style="font-size:11px;color:var(--text-muted);margin-top:2px">Run as a desktop app — faster access, works offline</div>
    </div>
    <div style="display:flex;flex-direction:column;gap:5px">
      <button onclick="_installPWA()" class="btn btn-primary btn-sm" style="font-size:11px;white-space:nowrap">Install</button>
      <button onclick="_dismissInstall()" style="background:none;border:none;color:var(--text-muted);font-size:10px;cursor:pointer">Not now</button>
    </div>
  `;
  document.body.appendChild(banner);
}

function _installPWA() {
  const banner = document.getElementById('installBanner');
  if (banner) banner.remove();
  if (!_deferredInstallPrompt) { showToast('Install not available — use browser menu → "Install app"', 'info', 5000); return; }
  _deferredInstallPrompt.prompt();
  _deferredInstallPrompt.userChoice.then(choice => {
    if (choice.outcome === 'accepted') {
      showToast('SHIC PM Suite installed! Check your Start menu / desktop.', 'success', 5000);
    }
    _deferredInstallPrompt = null;
  });
}

function _dismissInstall() {
  const banner = document.getElementById('installBanner');
  if (banner) banner.remove();
  localStorage.setItem('shic_install_dismissed', String(Date.now()));
}

// ── 6. ONLINE/OFFLINE INDICATOR ─────────────────────────────
window.addEventListener('online', () => {
  showToast('Back online — syncing...', 'success', 2000);
  showSaveIndicator('saving');
  if (typeof spPushData === 'function' && _spConnected && _spOfflineQueue) {
    spPushData(true).then(() => showSaveIndicator('synced')).catch(() => {});
  } else {
    setTimeout(() => showSaveIndicator('saved'), 1000);
  }
});

window.addEventListener('offline', () => {
  showToast('You are offline — changes will be saved locally and synced when reconnected', 'warning', 5000);
  showSaveIndicator('offline');
});

console.log('[SHIC] Wave 1 Desktop UX loaded — Cmd+K palette, shortcuts, save indicator, install prompt');

document.addEventListener('keydown',e=>{
if(e.key==='/'&&!['INPUT','TEXTAREA'].includes(e.target.tagName)){e.preventDefault();$('#globalSearch').focus();}
if(e.key==='Escape'){$$('.modal-overlay.open').forEach(m=>m.classList.remove('open'));$('#notifPanel').classList.remove('open');closeCmdPalette();const kh=document.getElementById('kbdHelp');if(kh)kh.style.display='none';}
if(e.ctrlKey&&e.key==='n'){e.preventDefault();showQuickAdd();}});

$('#globalSearch').addEventListener('input',function(){
const v=this.value.toLowerCase();if(!v||v.length<2)return;
const r=[];
(AppState.data.projects||[]).forEach(p=>{if(p.name.toLowerCase().includes(v)||p.id.toLowerCase().includes(v))r.push('Project: '+p.name);});
(AppState.data.tasks||[]).forEach(t=>{if(t.name.toLowerCase().includes(v))r.push('Task: '+t.name);});
if(r.length)showToast(`Found ${r.length} match${r.length>1?'es':''} for "${v}"  — try navigating to the module`,'info');});

// ── OFFLINE / PWA SUPPORT ─────────────────────────────────
let _isOnline=navigator.onLine;
let _offlineQueue=[];   // changes queued while offline
let _syncPending=false;
// (declared at top)

// ── PWA Manifest: served from real ./manifest.json file ──
// (blob manifests are rejected by browsers for install — real file required)

// ── Service Worker Registration ───────────────────────────
function registerServiceWorker(){
  if(!('serviceWorker' in navigator))return;
  // Register the REAL ./sw.js file (must exist next to promaster.html in the repo).
  // Blob-based SWs are rejected by browsers — a real file is required for
  // offline caching and the PWA install prompt to work.
  navigator.serviceWorker.register('./sw.js',{scope:'./'})
    .then(reg=>{
      console.log('[PWA] Service worker registered — offline caching active');
      // Check for updates periodically
      setInterval(()=>{ try{ reg.update(); }catch(e){} }, 60*60*1000);
    })
    .catch(e=>{
      console.warn('[PWA] sw.js not found or failed to register:', e.message);
      console.warn('[PWA] Upload sw.js to the repo next to promaster.html to enable offline mode and install prompt.');
    });
}

// ── Offline Queue ─────────────────────────────────────────
function loadOfflineQueue(){
  try{_offlineQueue=JSON.parse(localStorage.getItem(OFFLINE_QUEUE_KEY)||'[]');}catch{_offlineQueue=[];}
}
function saveOfflineQueue(){
  try{localStorage.setItem(OFFLINE_QUEUE_KEY,JSON.stringify(_offlineQueue));}catch{}
}
function clearOfflineQueue(){
  _offlineQueue=[];
  localStorage.removeItem(OFFLINE_QUEUE_KEY);
}

// Queue a save event when offline
function queueOfflineSave(){
  const entry={data:JSON.stringify(AppState.data),ts:Date.now()};
  // Keep only the latest snapshot (no need to replay individual changes)
  _offlineQueue=[entry];
  saveOfflineQueue();
  // Also save to offline data key as backup
  try{localStorage.setItem(OFFLINE_DATA_KEY,JSON.stringify(AppState.data));}catch{}
}

// ── Sync when back online ─────────────────────────────────
async function syncOfflineQueue(){
  if(!_offlineQueue.length)return;
  if(!_spConnected||!_spAccount){
    // Still no sync connection — keep queued
    updateSyncBar('warning','Changes queued — reconnect SharePoint to sync');
    return;
  }
  _syncPending=true;
  updateSyncBar('syncing',`Syncing ${_offlineQueue.length} offline change(s)...`);
  try{
    await spPushData(true);
    clearOfflineQueue();
    _syncPending=false;
    updateSyncBar('online','All changes synced');
    showToast('Offline changes synced to team!','success',3000);
  }catch(e){
    _syncPending=false;
    updateSyncBar('error','Sync failed: '+e.message);
  }
}

// ── Online / Offline Detection ────────────────────────────
function handleOnline(){
  _isOnline=true;
  updateSyncBar('online','Back online');
  showToast('Connection restored','success',2000);
  // Sync any queued offline changes after a brief delay
  setTimeout(()=>{
    if(_offlineQueue.length>0){
      syncOfflineQueue();
    }else{
      updateSyncBar('online','Online');
    }
    // ── If SharePoint had queued changes, retry now ──
    if(_spConnected && _spAccount && _spOfflineQueue){
      showToast('Internet restored — syncing queued SharePoint changes...','info',3000);
      setTimeout(_spRetryPush, 2000);
    }
    // ── If OneDrive had queued changes and SP is NOT active, retry now ──
    if(_odAccount && !(_spConnected&&_spAccount) && _odAutoSync){
      clearTimeout(_odSyncTimer);
      _odSyncTimer = setTimeout(()=>syncToOneDrive(true), 3000);
    }
  },1500);
}

function handleOffline(){
  _isOnline=false;
  updateSyncBar('offline','Working offline — changes saved locally');
  showToast('No internet — working offline. Changes will sync when restored.','warning',4000);
  // ── Stop SP polling while offline to avoid noisy errors ──
  if(_spPollingTimer){ clearInterval(_spPollingTimer); _spPollingTimer=null; }
  // Mark SP as unavailable so save hook queues changes
  if(_spConnected && _spAccount){ _spAvailable=false; _spOfflineQueue=true; }
}

// ── Sync Status Bar ───────────────────────────────────────
function createSyncBar(){
  if(document.getElementById('syncStatusBar'))return;
  const bar=document.createElement('div');
  bar.id='syncStatusBar';
  bar.style.cssText='position:fixed;bottom:0;left:0;right:0;z-index:8000;height:24px;display:flex;align-items:center;justify-content:center;gap:8px;font-size:10px;font-weight:600;transition:all .3s;pointer-events:none;letter-spacing:.2px';
  document.body.appendChild(bar);
}

function updateSyncBar(state,msg){
  createSyncBar();
  const bar=document.getElementById('syncStatusBar');
  if(!bar)return;
  const styles={
    online:{bg:'transparent',color:'transparent',icon:''},
    offline:{bg:'rgba(240,164,80,.95)',color:'#1a0f00',icon:'fa-wifi-slash'},
    syncing:{bg:'rgba(56,139,253,.9)',color:'#fff',icon:'fa-sync fa-spin'},
    warning:{bg:'rgba(240,164,80,.9)',color:'#1a0f00',icon:'fa-exclamation-triangle'},
    error:{bg:'rgba(248,81,73,.9)',color:'#fff',icon:'fa-times-circle'},
  };
  const s=styles[state]||styles.online;
  bar.style.background=s.bg;
  bar.style.color=s.color;
  bar.style.pointerEvents=state==='online'?'none':'auto';
  bar.innerHTML=state==='online'?'':`<i class="fas ${s.icon}" style="font-size:11px"></i>${msg}`;

  // Show pending badge in header
  updateOfflineBadge(state==='offline'||state==='warning');
}

function updateOfflineBadge(show){
  let badge=document.getElementById('offlineBadge');
  const reallyOffline=show;

  if(!badge&&reallyOffline){
    badge=document.createElement('div');
    badge.id='offlineBadge';
    badge.style.cssText='position:fixed;top:8px;left:50%;transform:translateX(-50%);z-index:9999;background:rgba(240,164,80,.95);color:#1a0f00;font-size:10px;font-weight:700;padding:3px 12px;border-radius:20px;cursor:pointer;display:flex;align-items:center;gap:5px';
    badge.title='Click to attempt sync';
    badge.onclick=function(){if(typeof syncOfflineQueue==='function')syncOfflineQueue();};
    badge.innerHTML='<i class="fas fa-wifi-slash"></i> OFFLINE — Changes saved locally';
    document.body.appendChild(badge);
  }else if(badge&&!reallyOffline){
    badge.remove();
  }else if(badge&&reallyOffline){
    // Update message based on queue
    const q=_offlineQueue?_offlineQueue.length:0;
    badge.innerHTML=q>0
      ?'<i class="fas fa-wifi-slash"></i> OFFLINE — '+q+' change(s) pending sync'
      :'<i class="fas fa-wifi-slash"></i> OFFLINE — Changes saved locally';
  }
}

// ── Patch AppState.save for offline queueing ──────────────
const _origSaveForOffline=AppState.save.bind(AppState);
AppState.save=function(){
  _origSaveForOffline();
  if(!_isOnline){
    queueOfflineSave();
    updateSyncBar('offline','Working offline — changes saved locally');
  }
};

// ── Test Connection ────────────────────────────────────────
async function testConnection(){
  showToast('Testing connection...','info',2000);
  const results=[];

  // Test 1: Browser online
  results.push({
    label:'Browser Network',
    ok:navigator.onLine,
    detail:navigator.onLine?'Online':'Offline (navigator.onLine = false)'
  });

  // Test 2: M365 / SharePoint connected
  results.push({
    label:'Microsoft 365 Login',
    ok:!!_m365LoggedIn&&!!_m365Account,
    detail:_m365Account?'Signed in as '+(_m365Account.username||_m365Account.name):'Not signed in'
  });

  // Test 3: SharePoint sync
  results.push({
    label:'SharePoint Sync',
    ok:!!_spConnected&&!!_spAccount,
    detail:_spConnected?'Connected as '+(_spAccount?.username||''):'Not connected'
  });

  // Show results modal
  document.getElementById('genericModalTitle').textContent='Connection Test Results';
  document.getElementById('genericModalBody').innerHTML=`
  <div style="display:flex;flex-direction:column;gap:10px">
    ${results.map(r=>`
    <div style="display:flex;align-items:center;gap:12px;padding:12px 14px;background:${r.ok?'rgba(63,185,80,.08)':'rgba(248,81,73,.08)'};border:1px solid ${r.ok?'rgba(63,185,80,.25)':'rgba(248,81,73,.25)'};border-radius:8px">
      <div style="width:32px;height:32px;border-radius:50%;background:${r.ok?'rgba(63,185,80,.2)':'rgba(248,81,73,.2)'};display:flex;align-items:center;justify-content:center;flex-shrink:0">
        <i class="fas ${r.ok?'fa-check':'fa-times'}" style="color:${r.ok?'var(--accent-green)':'var(--accent-red)'}"></i>
      </div>
      <div>
        <div style="font-size:12px;font-weight:700;color:${r.ok?'var(--accent-green)':'var(--accent-red)'}">${r.label}</div>
        <div style="font-size:11px;color:var(--text-secondary)">${r.detail}</div>
      </div>
      <div style="margin-left:auto;font-size:11px;font-weight:700;color:${r.ok?'var(--accent-green)':'var(--accent-red)'}">${r.ok?'PASS':'FAIL'}</div>
    </div>`).join('')}
    <div style="margin-top:6px;padding:12px;background:var(--bg-hover);border-radius:8px;font-size:11px;color:var(--text-secondary)">
      <strong>What each test means:</strong><br>
      • <strong>Browser Network</strong> — basic internet check<br>
      • <strong>Microsoft 365 Login</strong> — your M365 auth session<br>
      • <strong>SharePoint Sync</strong> — your team data sync connection
    </div>
  </div>`;
  document.getElementById('genericModalFooter').innerHTML=`
    <div style="font-size:11px;color:var(--text-secondary)">
      ${results.every(r=>r.ok)?'<i class="fas fa-check-circle" style="color:var(--accent-green);margin-right:5px"></i>All tests passed — fully connected':'<i class="fas fa-exclamation-triangle" style="color:var(--accent-amber);margin-right:5px"></i>Some tests failed — check SharePoint settings'}
    </div>
    <div style="flex:1"></div>
    <button class="btn btn-secondary" onclick="closeModal('genericModal')">Close</button>`;
  openModal('genericModal');
}

// ── Settings page refresh with offline status ─────────────
function getOfflineStatusHTML(){
  const queued=_offlineQueue.length;
  return`
  <div class="card" style="margin-bottom:16px;border:1px solid ${_isOnline?'rgba(63,185,80,.25)':'rgba(240,164,80,.4)'}">
    <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px">
      <div style="display:flex;align-items:center;gap:12px">
        <div style="width:40px;height:40px;background:${_isOnline?'rgba(63,185,80,.15)':'rgba(240,164,80,.15)'};border-radius:10px;display:flex;align-items:center;justify-content:center;flex-shrink:0">
          <i class="fas ${_isOnline?'fa-wifi':'fa-wifi-slash'}" style="color:${_isOnline?'var(--accent-green)':'var(--accent-amber)'};font-size:18px"></i>
        </div>
        <div>
          <div style="font-size:15px;font-weight:700">${_isOnline?'Online':'Offline Mode'}</div>
          <div style="font-size:11px;color:var(--text-secondary)">${_isOnline?'Connected to internet — all syncing active':'No internet connection — changes saved locally'}</div>
        </div>
      </div>
      <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
        ${queued>0?`<span class="badge badge-amber"><i class="fas fa-clock" style="margin-right:4px"></i>${queued} pending</span>`:''}
        ${queued>0?`<button class="btn btn-primary btn-sm" onclick="syncOfflineQueue()"><i class="fas fa-sync"></i> Sync Now</button>`:''}
        <button class="btn btn-secondary btn-sm" onclick="testConnection()"><i class="fas fa-plug"></i> Test Connection</button>
      </div>
    </div>
    <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-top:14px">
      <div style="padding:10px;background:var(--bg-hover);border-radius:7px;text-align:center">
        <div style="font-size:10px;color:var(--text-secondary);margin-bottom:3px">Internet Status</div>
        <div style="font-size:12px;font-weight:700;color:${_isOnline?'var(--accent-green)':'var(--accent-amber)'}">${_isOnline?'Online':'Offline'}</div>
      </div>
      <div style="padding:10px;background:var(--bg-hover);border-radius:7px;text-align:center">
        <div style="font-size:10px;color:var(--text-secondary);margin-bottom:3px">Offline Changes</div>
        <div style="font-size:12px;font-weight:700;color:${queued>0?'var(--accent-amber)':'var(--accent-green)'}">${queued>0?queued+' queued':'All synced'}</div>
      </div>
    </div>
    <div style="margin-top:12px;padding:10px;background:var(--bg-hover);border-radius:7px;font-size:10px;color:var(--text-secondary);line-height:1.8">
      <strong>How offline mode works:</strong><br>
      • All changes you make while offline are saved to your device automatically<br>
      • When internet is restored, changes sync to SharePoint and all teammates automatically<br>
      • The app is fully functional offline — projects, tasks, resources, everything<br>
      • A yellow banner appears when offline so you always know your sync status
    </div>
  </div>`;
}

// ── Initialize ────────────────────────────────────────────
function initOfflineSupport(){
  loadOfflineQueue();
  createSyncBar();
  window.addEventListener('online', handleOnline);
  window.addEventListener('offline', handleOffline);
  registerServiceWorker();
  // Set initial status
  if(!_isOnline){
    handleOffline();
  }else{
    updateSyncBar('online','');
  }
  // Check if there are queued changes from a previous offline session
  if(_offlineQueue.length>0){
    updateSyncBar('warning',_offlineQueue.length+' offline change(s) pending — will sync when connection restores');
  }
}





function stringToColor(str){
  let hash=0;for(let i=0;i<str.length;i++)hash=str.charCodeAt(i)+((hash<<5)-hash);
  const h=Math.abs(hash)%360;return`hsl(${h},65%,50%)`;
}

let _pendingEdits = false;

// ── ONEDRIVE SYNC ─────────────────────────────────────────
// msal vars declared at top
// declared at top
// declared at top
// declared at top
// declared at top
// declared at top

// (declared at top)

function initMSAL(){
  if(!_odClientId)return false;
  try{
    const cfg={
      auth:{
        clientId:_odClientId,
        authority:'https://login.microsoftonline.com/common',
        redirectUri:window.location.href.split('#')[0].split('?')[0],
      },
      cache:{cacheLocation:'localStorage',storeAuthStateInCookie:false},
    };
    _msalApp=new msal.PublicClientApplication(cfg);
    // MSAL 3.x requires initialize() before use
    if(_msalApp.initialize)_msalApp.initialize().catch(()=>{});
    // Restore previous account
    const accounts=_msalApp.getAllAccounts?_msalApp.getAllAccounts():[];
    if(accounts.length>0){
      _odAccount=accounts[0];
      _odLastSync=localStorage.getItem('pm_od_lastsync')||null;
      _odAutoSync=localStorage.getItem('pm_od_autosync')==='true';
    }
    return true;
  }catch(e){console.error('MSAL init error:',e);return false;}
}

async function connectOneDrive(){
  if(!_odClientId){showToast('Enter your Azure Client ID first','error');return;}
  if(!initMSAL()){showToast('MSAL init failed — check Client ID','error');return;}
  try{
    odSetStatus('connecting','Connecting to Microsoft...');
    // MSAL 3.x: must await initialize() before calling loginPopup
    if(_msalApp.initialize)await _msalApp.initialize();
    const resp=await _msalApp.loginPopup({scopes:OD_SCOPES,prompt:'select_account'});
    _odAccount=resp.account;
    localStorage.setItem('pm_od_autosync','true');
    _odAutoSync=true;
    odSetStatus('connected','Connected as '+_odAccount.username);
    showToast('Connected to OneDrive as '+_odAccount.username,'success');
    renderSettings();
  }catch(e){
    if(e.errorCode==='user_cancelled'){odSetStatus('idle','');showToast('Sign-in cancelled','warning');}
    else{odSetStatus('error','Sign-in failed: '+(e.message||e.errorCode));showToast('Sign-in failed: '+(e.message||''),'error');}
  }
}

async function disconnectOneDrive(){
  if(!confirm('Disconnect OneDrive sync? Your local data will remain.'))return;
  if(_msalApp&&_odAccount){
    try{await _msalApp.logoutPopup({account:_odAccount});}catch(e){}
  }
  _odAccount=null;_msalApp=null;
  localStorage.removeItem('pm_od_autosync');
  localStorage.removeItem('pm_od_lastsync');
  _odLastSync=null;_odAutoSync=false;
  renderSettings();
  showToast('Disconnected from OneDrive','warning');
}

async function getOdToken(){
  if(!_msalApp||!_odAccount)return null;
  try{
    const res=await _msalApp.acquireTokenSilent({scopes:OD_SCOPES,account:_odAccount});
    return res.accessToken;
  }catch(e){
    try{
      const res=await _msalApp.acquireTokenPopup({scopes:OD_SCOPES,account:_odAccount});
      return res.accessToken;
    }catch(e2){return null;}
  }
}

async function syncToOneDrive(silent=false){
  if(_odSyncing)return;
  if(!_odAccount){if(!silent)showToast('Not connected to OneDrive','error');return;}
  _odSyncing=true;
  odSetStatus('syncing','Uploading to OneDrive...');
  try{
    const token=await getOdToken();
    if(!token)throw new Error('Could not acquire token');
    const json=JSON.stringify(AppState.data,null,2);
    const res=await fetch(`https://graph.microsoft.com/v1.0/me/drive/root:/${OD_FILE}:/content`,{
      method:'PUT',
      headers:{'Authorization':'Bearer '+token,'Content-Type':'application/json'},
      body:json
    });
    if(!res.ok)throw new Error('Upload failed: '+res.status+' '+res.statusText);
    _odLastSync=new Date().toISOString();
    localStorage.setItem('pm_od_lastsync',_odLastSync);
    odSetStatus('connected','Last sync: '+fmtSyncTime(_odLastSync));
    if(!silent)showToast('Synced to OneDrive','success');
    odUpdateSyncInfo();
  }catch(e){
    odSetStatus('error','Sync failed: '+e.message);
    if(!silent)showToast('OneDrive sync failed: '+e.message,'error');
  }finally{_odSyncing=false;}
}

async function syncFromOneDrive(){
  if(_odSyncing)return;
  if(!_odAccount){showToast('Not connected to OneDrive','error');return;}
  if(!confirm('Download data from OneDrive? This will REPLACE your current local data.'))return;
  _odSyncing=true;
  odSetStatus('syncing','Downloading from OneDrive...');
  try{
    const token=await getOdToken();
    if(!token)throw new Error('Could not acquire token');
    const res=await fetch(`https://graph.microsoft.com/v1.0/me/drive/root:/${OD_FILE}:/content`,{
      headers:{'Authorization':'Bearer '+token}
    });
    if(res.status===404){
      odSetStatus('connected','No backup found on OneDrive yet');
      showToast('No SHIC data found on OneDrive — upload first','warning');
      _odSyncing=false;return;
    }
    if(!res.ok)throw new Error('Download failed: '+res.status);
    const data=await res.json();
    AppState.data={...getDefaultData(),...data};
    migrateData();
    _odLastSync=new Date().toISOString();
    localStorage.setItem('pm_od_lastsync',_odLastSync);
    odSetStatus('connected','Last sync: '+fmtSyncTime(_odLastSync));
    navigate('dashboard');buildSidebar();renderNotifPanel();
    showToast('Data restored from OneDrive successfully','success');
    odUpdateSyncInfo();
  }catch(e){
    odSetStatus('error','Download failed: '+e.message);
    showToast('OneDrive download failed: '+e.message,'error');
  }finally{_odSyncing=false;}
}

function odAutoSyncToggle(val){
  _odAutoSync=val;
  localStorage.setItem('pm_od_autosync',val?'true':'false');
  showToast('Auto-sync '+(val?'enabled':'disabled'),'info');
}

function odSaveClientId(){
  const id=($('#odClientId')||{}).value||'';
  if(!id){showToast('Enter a Client ID','error');return;}
  _odClientId=id.trim();
  localStorage.setItem('pm_od_clientid',_odClientId);
  _msalApp=null;
  showToast('Client ID saved — click Connect','success');
  renderSettings();
}

// Patch AppState.save to trigger auto-sync
const _origSave=AppState.save.bind(AppState);
AppState.save=function(){
  _origSave();
  // ── If SharePoint is connected, skip OneDrive auto-sync ──
  // Only one sync system should be active to prevent data conflicts.
  if(_spConnected&&_spAccount)return;
  if(_odAutoSync&&_odAccount&&!_odSyncing){
    clearTimeout(_odSyncTimer);
    _odSyncTimer=setTimeout(()=>syncToOneDrive(true),5000);
  }
};

function odSetStatus(state,msg){
  const el=$('#odStatusMsg');if(!el)return;
  const colors={connecting:'var(--accent-amber)',connected:'var(--accent-green)',syncing:'var(--accent-blue)',error:'var(--accent-red)',idle:'var(--text-muted)'};
  const icons={connecting:'fa-spinner fa-spin',connected:'fa-check-circle',syncing:'fa-sync fa-spin',error:'fa-exclamation-triangle',idle:'fa-circle'};
  el.innerHTML=`<i class="fas ${icons[state]||'fa-circle'}" style="margin-right:5px;color:${colors[state]||'var(--text-muted)'}"></i><span style="color:${colors[state]||'var(--text-secondary)'}">${msg}</span>`;
}

function odUpdateSyncInfo(){
  const el=$('#odSyncInfo');if(!el)return;
  el.textContent=_odLastSync?'Last synced: '+fmtSyncTime(_odLastSync):'Never synced';
}

function fmtSyncTime(iso){
  if(!iso)return'Never';
  const d=new Date(iso);
  const now=new Date();
  const diff=Math.round((now-d)/1000);
  if(diff<60)return'Just now';
  if(diff<3600)return Math.round(diff/60)+'m ago';
  if(diff<86400)return Math.round(diff/3600)+'h ago';
  return d.toLocaleDateString();
}

// ── SHAREPOINT / MICROSOFT 365 SYNC ──────────────────────
// Uses Microsoft Graph API + SharePoint List as database
// Requires: Azure AD App Registration with Sites.ReadWrite.All or
//           SharePoint access via delegated permissions (Files.ReadWrite, Sites.ReadWrite.All)

let _spMsalApp = null;
let _spAccount = null;
let _spSyncing = false;
let _spConnected = false;
let _spAutoSync = localStorage.getItem('shic_sp_autosync') === 'true';
let _spLastSync = localStorage.getItem('shic_sp_lastsync') || null;
let _spClientId = localStorage.getItem('shic_sp_clientid') || '';
let _spTenantId = localStorage.getItem('shic_sp_tenantid') || 'common';
let _spSiteUrl  = localStorage.getItem('shic_sp_siteurl') || '';
let _spListName = localStorage.getItem('shic_sp_listname') || 'SHIC_AppData';
let _spItemId   = localStorage.getItem('shic_sp_itemid') || '';
let _spSyncTimer = null;
let _spSiteId   = localStorage.getItem('shic_sp_siteid') || '';
let _spListId   = localStorage.getItem('shic_sp_listid') || '';
// ── Conflict-safe sync state ──────────────────────────────
let _spLastWriteTs = parseInt(localStorage.getItem('shic_sp_lastwritets')||'0'); // persisted across reloads
let _spDataHash = '';         // hash of last known remote data
let _spPendingRemote = null;  // stashed remote snapshot while user has unsaved edits
let _spPollingTimer = null;   // polling interval for remote changes
let _spOfflineQueue = !!localStorage.getItem('shic_sp_offlinequeue'); // persisted — survives page reload
let _spAvailable = true;      // tracks whether SharePoint is reachable
let _spRetryTimer = null;     // retry timer when SP is unavailable
// Track deletions so they survive merges (deleted records won't get re-added by returning users)
let _spDeletedIds = JSON.parse(localStorage.getItem('shic_sp_deleted_ids') || '{}');
// Format: { 'projects': ['PRJ-001', 'PRJ-002'], 'tasks': ['TSK-001'] }
const SP_DELETED_MAX_AGE = 7 * 24 * 60 * 60 * 1000; // keep deletion records for 7 days

const SP_SCOPES = ['https://graph.microsoft.com/Sites.ReadWrite.All', 'User.Read'];

// ── Init MSAL for SharePoint ──────────────────────────────
function initSpMSAL() {
  if (!_spClientId) return false;
  try {
    // Use 'organizations' to allow users from ANY Microsoft 365 tenant
    // (not just your own tenant) — required for multi-domain teams
    // Individual tenant ID is only needed if you want to restrict to one org
    const authority = _spTenantId && _spTenantId !== 'common'
      ? 'https://login.microsoftonline.com/' + _spTenantId
      : 'https://login.microsoftonline.com/organizations';
    const cfg = {
      auth: {
        clientId: _spClientId,
        authority: authority,
        redirectUri: window.location.href.split('#')[0].split('?')[0],
      },
      cache: { cacheLocation: 'localStorage', storeAuthStateInCookie: false },
    };
    _spMsalApp = new msal.PublicClientApplication(cfg);
    // MSAL 3.x requires initialize() before use
    if (_spMsalApp.initialize) _spMsalApp.initialize().catch(()=>{});
    const accounts = _spMsalApp.getAllAccounts ? _spMsalApp.getAllAccounts() : [];
    if (accounts.length > 0) {
      _spAccount = accounts[0];
      _spConnected = true;
    }
    return true;
  } catch (e) { console.error('[SP] MSAL init error:', e); return false; }
}

// ── Get Graph API token ───────────────────────────────────

// ═══════════════════════════════════════════════════════════
// ── SHAREPOINT DOCUMENT LIBRARY — FILE STORAGE ───────────
// ═══════════════════════════════════════════════════════════
const SHIC_DOCS_LIBRARY = 'SHIC_Documents';
let _spDocsLibraryId = null; // cached drive ID

// ── Get/create SharePoint Document Library drive ID ─────────
async function _spGetDocsLibrary(token) {
  if (_spDocsLibraryId) return _spDocsLibraryId;
  if (!_spSiteId) await spResolveSiteAndList(token);
  if (!_spSiteId) throw new Error('SharePoint site not connected');

  // List all drives (document libraries) on the site
  const res = await fetch(
    `https://graph.microsoft.com/v1.0/sites/${_spSiteId}/drives?$top=100`,
    { headers: { Authorization: 'Bearer ' + token } }
  );
  if (!res.ok) throw new Error('Could not list document libraries: ' + res.status);
  const data = await res.json();
  const found = (data.value || []).find(d =>
    d.name === SHIC_DOCS_LIBRARY || d.name === SHIC_DOCS_LIBRARY.toLowerCase()
  );
  if (found) {
    _spDocsLibraryId = found.id;
    return _spDocsLibraryId;
  }
  // Try to create the library via Lists API (template:documentLibrary)
  try {
    const createRes = await fetch(
      `https://graph.microsoft.com/v1.0/sites/${_spSiteId}/lists`,
      {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          displayName: SHIC_DOCS_LIBRARY,
          list: { template: 'documentLibrary' }
        })
      }
    );
    if (createRes.ok || createRes.status === 409) {
      // Created or already exists — fetch the drive again
      const retry = await fetch(
        `https://graph.microsoft.com/v1.0/sites/${_spSiteId}/drives?$top=100`,
        { headers: { Authorization: 'Bearer ' + token } }
      );
      const retryData = await retry.json();
      const retryFound = (retryData.value || []).find(d => d.name === SHIC_DOCS_LIBRARY);
      if (retryFound) {
        _spDocsLibraryId = retryFound.id;
        return _spDocsLibraryId;
      }
    }
    const errText = await createRes.text().catch(() => '');
    throw new Error('Library auto-create failed. Please create it manually in SharePoint (Site Contents → New → Document Library → Name: ' + SHIC_DOCS_LIBRARY + ')');
  } catch (e) {
    throw new Error('SHIC_Documents library not found. ' + e.message);
  }
}

// ── Upload file to SP Document Library ─────────────────────
// Returns { url, webUrl, id, name, size }
async function spUploadFile(file, projectId) {
  if (!file) throw new Error('No file provided');
  if (!_spConnected) throw new Error('SharePoint not connected — cannot upload file');
  const token = await getSpToken();
  if (!token) throw new Error('Could not get SharePoint token');
  const driveId = await _spGetDocsLibrary(token);
  // Sanitize filename and build folder path
  const safeName = file.name.replace(/[<>:"/\\|?*]/g, '_');
  const folder = projectId ? (projectId.replace(/[<>:"/\\|?*]/g, '_')) : 'General';
  const timestamp = Date.now().toString(36);
  const finalName = timestamp + '_' + safeName;
  const filePath = folder + '/' + finalName;
  // For files <= 4 MB use simple upload
  if (file.size <= 4 * 1024 * 1024) {
    const uploadRes = await fetch(
      `https://graph.microsoft.com/v1.0/drives/${driveId}/root:/${encodeURIComponent(filePath)}:/content`,
      {
        method: 'PUT',
        headers: { Authorization: 'Bearer ' + token, 'Content-Type': file.type || 'application/octet-stream' },
        body: file,
      }
    );
    if (!uploadRes.ok) {
      const err = await uploadRes.text().catch(() => '');
      throw new Error('Upload failed: ' + uploadRes.status + ' ' + err.slice(0, 200));
    }
    const result = await uploadRes.json();
    return {
      url: result['@microsoft.graph.downloadUrl'] || result.webUrl,
      webUrl: result.webUrl,
      id: result.id,
      name: file.name,
      size: file.size,
      driveId: driveId,
      itemId: result.id,
    };
  }
  // For larger files use resumable upload session
  const sessionRes = await fetch(
    `https://graph.microsoft.com/v1.0/drives/${driveId}/root:/${encodeURIComponent(filePath)}:/createUploadSession`,
    {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
      body: JSON.stringify({ item: { '@microsoft.graph.conflictBehavior': 'rename' } }),
    }
  );
  if (!sessionRes.ok) throw new Error('Could not create upload session: ' + sessionRes.status);
  const session = await sessionRes.json();
  const uploadUrl = session.uploadUrl;
  // Upload in chunks of 5 MB
  const CHUNK_SIZE = 5 * 1024 * 1024;
  let offset = 0;
  let lastResult = null;
  while (offset < file.size) {
    const chunkEnd = Math.min(offset + CHUNK_SIZE, file.size);
    const chunk = file.slice(offset, chunkEnd);
    const chunkRes = await fetch(uploadUrl, {
      method: 'PUT',
      headers: {
        'Content-Length': String(chunk.size),
        'Content-Range': `bytes ${offset}-${chunkEnd - 1}/${file.size}`,
      },
      body: chunk,
    });
    if (chunkRes.status === 201 || chunkRes.status === 200) {
      lastResult = await chunkRes.json();
      break;
    }
    if (chunkRes.status === 202) {
      // continue uploading
      offset = chunkEnd;
      continue;
    }
    throw new Error('Chunk upload failed: ' + chunkRes.status);
  }
  if (!lastResult) throw new Error('Upload completed but no response received');
  return {
    url: lastResult['@microsoft.graph.downloadUrl'] || lastResult.webUrl,
    webUrl: lastResult.webUrl,
    id: lastResult.id,
    name: file.name,
    size: file.size,
    driveId: driveId,
    itemId: lastResult.id,
  };
}

// ── Get a fresh download URL for a stored file ─────────────
async function spGetFileDownloadUrl(driveId, itemId) {
  if (!driveId || !itemId) return null;
  const token = await getSpToken();
  if (!token) return null;
  try {
    const res = await fetch(
      `https://graph.microsoft.com/v1.0/drives/${driveId}/items/${itemId}?$select=@microsoft.graph.downloadUrl,webUrl`,
      { headers: { Authorization: 'Bearer ' + token } }
    );
    if (!res.ok) return null;
    const data = await res.json();
    return data['@microsoft.graph.downloadUrl'] || data.webUrl || null;
  } catch (e) { return null; }
}

// ── Delete file from SP Document Library ───────────────────
async function spDeleteFile(driveId, itemId) {
  if (!driveId || !itemId) return false;
  const token = await getSpToken();
  if (!token) return false;
  try {
    const res = await fetch(
      `https://graph.microsoft.com/v1.0/drives/${driveId}/items/${itemId}`,
      { method: 'DELETE', headers: { Authorization: 'Bearer ' + token } }
    );
    return res.ok || res.status === 404;
  } catch (e) { return false; }
}

// ── Format file size helper ────────────────────────────────
function _formatFileSize(bytes) {
  if (!bytes) return '0 KB';
  if (bytes >= 1048576) return (bytes / 1048576).toFixed(1) + ' MB';
  return (bytes / 1024).toFixed(0) + ' KB';
}

async function getSpToken() {
  if (!_spMsalApp || !_spAccount) {
    // If M365 auth is active, use the auth MSAL app as fallback
    if (_m365AuthMsal && _m365Account) {
      _spMsalApp = _m365AuthMsal;
      _spAccount = _m365Account;
    } else {
      return null;
    }
  }
  try {
    // MSAL 3.x: ensure initialized before token calls
    if (_spMsalApp && _spMsalApp.initialize) {
      try { await _spMsalApp.initialize(); } catch(ie) {}
    }
    const res = await _spMsalApp.acquireTokenSilent({ scopes: SP_SCOPES, account: _spAccount });
    return res.accessToken;
  } catch (e) {
    try {
      if (_spMsalApp.initialize) {
        try { await _spMsalApp.initialize(); } catch(ie) {}
      }
      const res = await _spMsalApp.acquireTokenPopup({ scopes: SP_SCOPES, account: _spAccount });
      return res.accessToken;
    } catch (e2) {
      console.error('[SP] Token error:', e2.message || e2);
      return null;
    }
  }
}

// ── Resolve Site ID and List ID ───────────────────────────
async function spResolveSiteAndList(token) {
  // Parse hostname and path from the SharePoint site URL
  // e.g. https://contoso.sharepoint.com/sites/mysite
  let siteUrl = (_spSiteUrl || '').trim().replace(/\/$/, '');
  if (!siteUrl) throw new Error('SharePoint Site URL is not configured');

  if (!_spSiteId) {
    // Extract hostname and path: graph.microsoft.com/v1.0/sites/{hostname}:/{path}
    const url = new URL(siteUrl);
    const hostname = url.hostname;
    const path = url.pathname; // e.g. /sites/shic
    const siteRes = await fetch(
      `https://graph.microsoft.com/v1.0/sites/${hostname}:${path}`,
      { headers: { Authorization: 'Bearer ' + token } }
    );
    if (!siteRes.ok) {
      const err = await siteRes.json().catch(() => ({}));
      throw new Error('Could not find SharePoint site: ' + (err.error?.message || siteRes.status));
    }
    const siteData = await siteRes.json();
    _spSiteId = siteData.id;
    localStorage.setItem('shic_sp_siteid', _spSiteId);
  }

  if (!_spListId) {
    // Fetch all lists and match by name — $filter causes 400 on some SharePoint configs
    const listRes = await fetch(
      `https://graph.microsoft.com/v1.0/sites/${_spSiteId}/lists?$top=100`,
      { headers: { Authorization: 'Bearer ' + token } }
    );
    const listData = await listRes.json();
    const foundList = (listData.value||[]).find(l =>
      l.displayName === _spListName || l.name === _spListName
    );
    if (foundList) {
      _spListId = foundList.id;
    } else {
      // Create the list if it doesn't exist
      const createRes = await fetch(
        `https://graph.microsoft.com/v1.0/sites/${_spSiteId}/lists`,
        {
          method: 'POST',
          headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            displayName: _spListName,
            list: { template: 'genericList' },
            columns: [
              { name: 'DataKey',  text: {} },
              { name: 'DataBlob', text: { allowMultipleLines: true, maxLength: 0 } },
              { name: 'UpdatedBy', text: {} },
              { name: 'UpdatedAt', dateTime: {} },
            ]
          })
        }
      );
      if (!createRes.ok) {
        if (createRes.status === 409) {
          // List already exists (concurrent creation) — find it
          console.log('[SP] List creation conflict (409) — fetching existing list');
          const retryRes = await fetch(
            `https://graph.microsoft.com/v1.0/sites/${_spSiteId}/lists?$top=100`,
            { headers: { Authorization: 'Bearer ' + token } }
          );
          const retryData = await retryRes.json();
          const retryFound = (retryData.value||[]).find(l =>
            l.displayName === _spListName || l.name === _spListName
          );
          if (retryFound) {
            _spListId = retryFound.id;
            localStorage.setItem('shic_sp_listid', _spListId);
            return { siteId: _spSiteId, listId: _spListId };
          }
        }
        const err = await createRes.json().catch(() => ({}));
        throw new Error('Could not create SharePoint list: ' + (err.error?.message || createRes.status));
      }
      const created = await createRes.json();
      _spListId = created.id;
    }
    localStorage.setItem('shic_sp_listid', _spListId);
  }
  return { siteId: _spSiteId, listId: _spListId };
}

// ── Connect to SharePoint ─────────────────────────────────
async function connectSharePoint() {
  if (!_spClientId) { showToast('Enter your Azure App Client ID first', 'error'); return; }
  if (!_spSiteUrl)  { showToast('Enter your SharePoint Site URL first', 'error'); return; }
  if (!initSpMSAL()) { showToast('MSAL init failed — check Client ID', 'error'); return; }
  try {
    spSetStatus('connecting', 'Signing in to Microsoft 365...');
    // MSAL 3.x: must await initialize() before calling loginPopup
    if (_spMsalApp.initialize) await _spMsalApp.initialize();
    const resp = await _spMsalApp.loginPopup({ scopes: SP_SCOPES, prompt: 'select_account' });
    _spAccount = resp.account;
    _spConnected = true;
    _ssm.transition('SYNCED');
    localStorage.setItem('shic_sp_autosync', 'true');
    _spAutoSync = true;
    // Test by resolving the site
    const token = await getSpToken();
    if (!token) throw new Error('Could not get access token');
    spSetStatus('connecting', 'Verifying SharePoint site...');
    await spResolveSiteAndList(token);
    spSetStatus('connected', 'Connected as ' + _spAccount.username);
    showToast('Connected to SharePoint as ' + _spAccount.username, 'success');
    // Preserve local queued changes — push before any pull/merge decision
    const hadQueuedOnConnect = _spHasLocalEdits();
    _pendingEdits = false;
    _spLastSavedHash = _spHash(AppState.data);
    if (hadQueuedOnConnect) {
      try {
        console.log('[SP] Connect: pushing queued local changes first');
        await spPushData(true);
      } catch (pe) {
        console.warn('[SP] Connect-time push failed:', pe.message);
      }
    }
    // ── On connect: pull from SharePoint and merge safely ────────
    spSetStatus('syncing', 'Loading data from SharePoint...');
    try {
      const token2 = await getSpToken();
      if (token2) {
        const { siteId: sid, listId: lid } = await spResolveSiteAndList(token2);
        const remote = await _spFetchRemote(token2, sid, lid);
        if (!remote || !remote._ts) {
          // SharePoint is empty — ask user what to do instead of auto-pushing
          spSetStatus('connected', 'SharePoint list is empty');
          const isAdminUser = (typeof _currentUserProfile !== 'undefined' && _currentUserProfile?.isAdmin) ||
            (typeof _currentUser !== 'undefined' && typeof isAdminEmail === 'function' && isAdminEmail(_currentUser?.email || ''));
          if (isAdminUser) {
            // Only admin gets the option to push initial data
            const pushFirst = confirm(
              'SharePoint has no data yet.\n\n' +
              'Click OK to push your current local data as the initial dataset.\n' +
              'Click Cancel to start fresh (recommended if others have already used the app).'
            );
            if (pushFirst) {
              console.log('[SP] Admin chose to push local data as initial dataset');
              await spPushData(true);
            } else {
              showToast('SharePoint connected — no data pushed. Use "Push My Changes" when ready.', 'info', 5000);
            }
          } else {
            // Non-admin: never auto-push, just notify
            showToast('SharePoint is empty — waiting for admin to push initial data.', 'warning', 6000);
            console.log('[SP] Non-admin connect: SP empty, skipping push');
          }
        } else {
          // SharePoint has data — merge if local edits exist, else pull remote
          console.log('[SP] Pulling from SharePoint on connect — remote _ts:', remote._ts);
          const { _ts, _by, _deletedIds: rd, ...cleanData } = remote;
          if (rd) {
            Object.keys(rd).forEach(k => {
              if (!_spDeletedIds[k]) _spDeletedIds[k] = {};
              Object.assign(_spDeletedIds[k], rd[k]);
            });
            localStorage.setItem('shic_sp_deleted_ids', JSON.stringify(_spDeletedIds));
          }
          if (_spHasLocalEdits()) {
            // Never wipe local unsaved work on connect — merge then push
            _spApplyRemote(cleanData, _ts, _by);
            await spPushData(true);
            showToast('Merged and synced your local changes with SharePoint ✓', 'success');
          } else if (remote._ts > _spLastWriteTs) {
            // Remote is newer — safe full replace
            _spLastWriteTs = _ts;
            localStorage.setItem('shic_sp_lastwritets', String(_spLastWriteTs));
            _spDataHash = _spHash(cleanData) + _ts;
            AppState.data = Object.assign(getDefaultData(), cleanData);
            if (typeof migrateData === 'function') migrateData();
            AppState.save();
            _spOfflineQueue = false;
            localStorage.removeItem('shic_sp_offlinequeue');
            setTimeout(() => {
              try { renderPage(AppState.currentPage || 'dashboard'); } catch(e) {}
              try { buildSidebar(); } catch(e) {}
            }, 400);
            showToast('Data loaded from SharePoint' + (_by ? ' (by ' + _by + ')' : '') + ' ✓', 'success');
          } else {
            // Local is current — no pull needed
            _spDataHash = _spHash(cleanData) + _ts;
            spSetStatus('connected', 'Connected — local data is current');
            showToast('Connected — your local data is up to date', 'info', 3000);
          }
        }
      }
    } catch(ce) {
      console.warn('[SP] Connect-time sync check failed:', ce.message);
      spSetStatus('connected', 'Connected — sync check failed, use Pull Latest');
    }
    spStartPolling();
    renderSettings();
  } catch (e) {
    _spConnected = false;
    if (e.errorCode === 'user_cancelled') { spSetStatus('idle', ''); showToast('Sign-in cancelled', 'warning'); }
    else { spSetStatus('error', e.message || 'Sign-in failed'); showToast('SharePoint connect failed: ' + e.message, 'error'); }
  }
}

// ── Disconnect ────────────────────────────────────────────
async function disconnectSharePoint() {
  if (!confirm('Disconnect SharePoint sync? Your local data will remain.')) return;
  // Push pending changes before disconnect so nothing is lost
  if (_spConnected && _spAccount && _spHasLocalEdits()) {
    clearTimeout(_spSyncTimer);
    try {
      showToast('Syncing changes to SharePoint before disconnect...', 'info', 2500);
      await spPushData(true);
    } catch (e) {
      console.warn('[SP] Pre-disconnect push failed:', e.message);
      showToast('Could not sync before disconnect — changes kept locally and will retry on reconnect', 'warning', 5000);
    }
  }
  if (_spMsalApp && _spAccount) { try { await _spMsalApp.logoutPopup({ account: _spAccount }); } catch (e) {} }
  spStopPolling();
  _spAccount = null; _spMsalApp = null; _spConnected = false;
  localStorage.removeItem('shic_sp_autosync'); localStorage.removeItem('shic_sp_lastsync');
  localStorage.removeItem('shic_sp_itemid'); localStorage.removeItem('shic_sp_siteid'); localStorage.removeItem('shic_sp_listid');
  // NOTE: keep shic_sp_lastwritets and shic_sp_deleted_ids — needed to prevent data loss on reconnect
  localStorage.removeItem('shic_sp_offlinequeue');
  _spLastSync = null; _spAutoSync = false; _spItemId = ''; _spSiteId = ''; _spListId = '';
  // Keep _spLastWriteTs and _spDataHash — they protect against re-pulling old data on reconnect
  _spPendingRemote = null; _spOfflineQueue = false;
  renderSettings(); showToast('Disconnected from SharePoint', 'warning');
}

// ── Compute a hash of data for change detection ──────────
// Uses lengths + sample of IDs from key arrays to catch same-length-different-content changes
function _spHash(data) {
  const sample = (arr) => {
    if (!arr || !arr.length) return '0';
    // Take first, middle, last id + length
    const a = arr[0]?.id || '';
    const b = arr[Math.floor(arr.length/2)]?.id || '';
    const c = arr[arr.length-1]?.id || '';
    return arr.length + a + b + c;
  };
  return sample(data.projects) + sample(data.tasks) + sample(data.procurement)
    + sample(data.resourceAllocations) + sample(data.costs)
    + sample(data.equipment) + sample(data.manpower) + sample(data.materials);
}

// ── Fetch the raw item from SharePoint (no side effects) ──
async function _spFetchRemote(token, siteId, listId) {
  // Strategy 1: fetch by cached item ID directly (fastest, no filter needed)
  if (_spItemId) {
    const res = await fetch(
      `https://graph.microsoft.com/v1.0/sites/${siteId}/lists/${listId}/items/${_spItemId}?$expand=fields`,
      { headers: { Authorization: 'Bearer ' + token } }
    );
    if (res.ok) {
      const item = await res.json();
      const raw = item.fields?.DataBlob || '';
      if (!raw) return null;
      return JSON.parse(raw);
    }
    if (res.status === 404) {
      // Item was deleted — clear cache and fall through to search
      _spItemId = ''; localStorage.removeItem('shic_sp_itemid');
    } else {
      throw new Error('Fetch failed: ' + res.status);
    }
  }
  // Strategy 2: fetch all items (list should only have 1 item) — no filter needed
  const res = await fetch(
    `https://graph.microsoft.com/v1.0/sites/${siteId}/lists/${listId}/items?$expand=fields&$top=10`,
    { headers: { Authorization: 'Bearer ' + token } }
  );
  if (!res.ok) throw new Error('Fetch failed: ' + res.status);
  const result = await res.json();
  if (!result.value || result.value.length === 0) return null;
  // Sort by UpdatedAt descending — pick the newest, auto-delete any duplicates
  const allItems = result.value.filter(i => i.fields?.Title === 'SHIC_Main' || i.fields?.DataKey === 'main');
  allItems.sort((a, b) => new Date(b.fields?.UpdatedAt || 0) - new Date(a.fields?.UpdatedAt || 0));
  const item = allItems[0];
  if (allItems.length > 1) {
    // Delete the older duplicates silently
    for (let di = 1; di < allItems.length; di++) {
      fetch(`https://graph.microsoft.com/v1.0/sites/${siteId}/lists/${listId}/items/${allItems[di].id}`,
        { method: 'DELETE', headers: { Authorization: 'Bearer ' + token } }).catch(() => {});
    }
    console.warn('[SP] Auto-deleted ' + (allItems.length - 1) + ' duplicate SHIC_Main row(s)');
  }
  if (item.id) { _spItemId = item.id; localStorage.setItem('shic_sp_itemid', _spItemId); }
  const raw = item.fields?.DataBlob || '';
  if (!raw) return null;
  const parsed = JSON.parse(raw);

  // ── PHASE 2: Fetch offloaded high-volume data from sub-lists ──
  // These were stripped from the main blob to keep it small.
  // Fetch them and merge back into the data structure for the app.
  try {
    const subResults = await _spFetchAllSubLists(token);
    Object.entries(subResults).forEach(([dataKey, records]) => {
      // Only override if sub-list had data (null = list unavailable, keep existing)
      if (records !== null) {
        parsed[dataKey] = records;
      }
    });
  } catch(e) {
    console.warn('[SP] Could not fetch sub-lists (using main blob data):', e.message);
  }

  return parsed;
}

// ── Write payload to SharePoint (upsert with 429 backoff) ─
async function _spWriteRemote(token, siteId, listId, payload, attempt = 0) {
  const body = JSON.stringify({
    fields: {
      Title: 'SHIC_Main', DataKey: 'main',
      DataBlob: JSON.stringify(payload),
      UpdatedBy: _spAccount.username,
      UpdatedAt: new Date().toISOString(),
    }
  });

  // Always resolve the canonical SHIC_Main item from SP before writing.
  // Fetch up to 50 items so we catch any duplicates regardless of who created them.
  try {
    const existing = await fetch(
      `https://graph.microsoft.com/v1.0/sites/${siteId}/lists/${listId}/items?$expand=fields&$top=50`,
      { headers: { Authorization: 'Bearer ' + token } }
    );
    if (existing.ok) {
      const exData = await existing.json();
      const matches = (exData.value || []).filter(i => i.fields?.Title === 'SHIC_Main' || i.fields?.DataKey === 'main');
      if (matches.length > 0) {
        // Sort newest first — keep the latest, delete the rest
        matches.sort((a, b) => new Date(b.fields?.UpdatedAt || 0) - new Date(a.fields?.UpdatedAt || 0));
        _spItemId = matches[0].id;
        localStorage.setItem('shic_sp_itemid', _spItemId);
        // Silently delete any duplicates
        for (let di = 1; di < matches.length; di++) {
          fetch(`https://graph.microsoft.com/v1.0/sites/${siteId}/lists/${listId}/items/${matches[di].id}`,
            { method: 'DELETE', headers: { Authorization: 'Bearer ' + token } }).catch(() => {});
        }
        if (matches.length > 1) {
          console.warn('[SP] _spWriteRemote: removed ' + (matches.length - 1) + ' duplicate SHIC_Main row(s)');
        }
      } else {
        // No existing main item — clear cached id so we POST fresh
        _spItemId = ''; localStorage.removeItem('shic_sp_itemid');
      }
    }
  } catch(e) { /* non-fatal — fall through to cached _spItemId */ }

  let res;
  if (!_spItemId) {
    res = await fetch(
      `https://graph.microsoft.com/v1.0/sites/${siteId}/lists/${listId}/items`,
      { method: 'POST', headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' }, body }
    );
    if (res && res.ok) {
      const created = await res.json();
      _spItemId = created.id; localStorage.setItem('shic_sp_itemid', _spItemId);
    }
  } else {
    res = await fetch(
      `https://graph.microsoft.com/v1.0/sites/${siteId}/lists/${listId}/items/${_spItemId}`,
      { method: 'PATCH', headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' }, body }
    );
    if (res && res.status === 404) { _spItemId = ''; localStorage.removeItem('shic_sp_itemid'); }
  }
  // ── Handle 429 Too Many Requests (throttling) ──────────
  if (res && res.status === 429) {
    if (attempt >= 4) throw new Error('SharePoint is throttling — too many requests. Try again in a minute.');
    const retryAfter = parseInt(res.headers.get('Retry-After') || '10');
    const backoff = Math.max(retryAfter, Math.pow(2, attempt) * 5 + Math.random() * 5) * 1000;
    console.warn(`[SP] 429 throttled — retrying in ${Math.round(backoff/1000)}s (attempt ${attempt+1})`);
    spSetStatus('syncing', `Throttled by SharePoint — retrying in ${Math.round(backoff/1000)}s...`);
    await new Promise(r => setTimeout(r, backoff));
    // Refresh token before retry
    token = await getSpToken() || token;
    return _spWriteRemote(token, siteId, listId, payload, attempt + 1);
  }
  if (res && !res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error?.message || 'Write failed: ' + res.status);
  }
}

// ── Record a deletion so it survives future merges ───────
function _spTrackDeletion(arrayKey, id) {
  if (!_spDeletedIds[arrayKey]) _spDeletedIds[arrayKey] = {};
  _spDeletedIds[arrayKey][id] = Date.now();
  // Prune old entries (> 7 days)
  const cutoff = Date.now() - SP_DELETED_MAX_AGE;
  Object.keys(_spDeletedIds).forEach(k => {
    Object.keys(_spDeletedIds[k]).forEach(did => {
      if (_spDeletedIds[k][did] < cutoff) delete _spDeletedIds[k][did];
    });
  });
  localStorage.setItem('shic_sp_deleted_ids', JSON.stringify(_spDeletedIds));
}

// ── Check if a record was locally deleted ─────────────────
function _spWasDeleted(arrayKey, id) {
  return !!(_spDeletedIds[arrayKey] && _spDeletedIds[arrayKey][id]);
}

// ── Merge helper: union of remote + local arrays ─────────
// Remote wins for records that exist in BOTH (authoritative)
// Local wins only for records added locally that aren't in remote yet
// Local FIELD edits to existing records are preserved if remote record unchanged
// Deletions tracked in _spDeletedIds are respected — deleted records NOT re-added
function _spMergeArrays(localArr, remoteArr, localEdited, arrayKey) {
  if (!remoteArr.length && !localArr.length) return [];
  const remoteMap = new Map(remoteArr.map(r => [r.id, r]));
  const localMap  = new Map(localArr.map(r => [r.id, r]));
  const result = [];
  // Start with remote as the base, skipping records we deleted locally
  remoteArr.forEach(remoteRec => {
    if (arrayKey && _spWasDeleted(arrayKey, remoteRec.id)) return;
    const localRec = localMap.get(remoteRec.id);
    if (localRec && localEdited) {
      // Local field edits win — but also union append-only sub-arrays from remote
      // so that updates logged by OTHER users are not lost
      result.push(_spMergeAppendArrays(localRec, remoteRec));
    } else if (localRec) {
      // Remote wins for fields — but union append-only sub-arrays from local
      // so that updates logged by THIS user are not lost
      result.push(_spMergeAppendArrays(remoteRec, localRec));
    } else {
      result.push(remoteRec);
    }
  });
  // Add records that only exist locally (newly added, not deleted)
  localArr.forEach(localRec => {
    if (!remoteMap.has(localRec.id) && !(arrayKey && _spWasDeleted(arrayKey, localRec.id))) {
      result.push(localRec);
    }
  });
  return result;
}

// Union append-only sub-arrays (updates, comments, attachments) from donor into base.
// Deduplicates by 'at' timestamp — safe for arrays where each entry is immutable once added.
function _spMergeAppendArrays(base, donor) {
  if (!donor) return base;
  const APPEND_FIELDS = ['updates','comments','attachments','notes'];
  let merged = base;
  APPEND_FIELDS.forEach(field => {
    const baseArr = Array.isArray(base[field]) ? base[field] : [];
    const donorArr = Array.isArray(donor[field]) ? donor[field] : [];
    if (donorArr.length === 0) return;
    const baseAts = new Set(baseArr.map(u => u && u.at).filter(Boolean));
    const extra = donorArr.filter(u => u && u.at && !baseAts.has(u.at));
    if (extra.length > 0) {
      merged = Object.assign({}, merged, {
        [field]: [...baseArr, ...extra].sort((a,b)=>((a&&a.at||'')<(b&&b.at||'')?-1:1))
      });
    }
  });
  return merged;
}

// ── True when local changes haven't been confirmed on SharePoint ──
function _spHasLocalEdits() {
  return !!_spOfflineQueue || (typeof _pendingEdits !== 'undefined' && _pendingEdits);
}

// ── Apply a remote snapshot safely ───────────────────────
function _spApplyRemote(data, _ts, _by) {
  const hash = _spHash(data) + _ts;
  if (hash === _spDataHash) return; // no change
  _spDataHash = hash;
  _spLastWriteTs = _ts || Date.now();
  localStorage.setItem('shic_sp_lastwritets', String(_spLastWriteTs));

  // ── Determine if user has local unsaved edits ──────────
  const hasLocalEdits = _spHasLocalEdits();

  if (hasLocalEdits) {
    // User has local changes — merge instead of replace
    // This preserves local additions and field edits.
    // Derive array keys from SHIC_LIST_CONFIG (offloaded) + legacy non-offloaded arrays
    // so this list never falls out of sync when new lists are added to SHIC_LIST_CONFIG.
    const ARRAY_KEYS = [
      ...(SHIC_OFFLOADED_KEYS || []),
      'resources','progress','kpiData','thirdParties','projectTeam','calendar','trades',
    ];
    const merged = Object.assign({}, data);
    ARRAY_KEYS.forEach(key => {
      merged[key] = _spMergeArrays(
        AppState.data[key] || [],
        data[key] || [],
        true, // preserve local field edits
        key   // deletion tracking
      );
    });
    {
      const _rSet2 = data.settings || {};
      const _lSet2 = AppState.data.settings || {};
      merged.settings = Object.assign({}, _rSet2, _lSet2);
      const _rPA2 = _rSet2.dropdowns?._adminPushedAt || 0;
      const _lPA2 = _lSet2.dropdowns?._adminPushedAt || 0;
      if (_rPA2 > _lPA2) {
        merged.settings.dropdowns = Object.assign({}, _rSet2.dropdowns || {});
        showToast('Admin dropdown settings applied from SharePoint', 'info', 3500);
      }
    }
    AppState.data = Object.assign(getDefaultData(), merged);
    if (typeof migrateData === 'function') migrateData();
    AppState.save();
    setTimeout(() => {
      try { renderPage(AppState.currentPage || 'dashboard'); } catch(e) {}
      try { buildSidebar(); } catch(e) {}
      if (_by && _by !== _spAccount?.username)
        showToast('↓ Merged remote changes from ' + _by + ' — your local edits preserved', 'info', 4000);
    }, 400);
  } else {
    // No local edits — apply main-blob remote data
    // NOTE: Sub-list data (projects, tasks, etc.) is handled separately by the sub-list pull.
    // The main blob now only carries settings, businessUnits, trades after the multi-list migration.
    // So we only compare counts of NON-OFFLOADED arrays for the safety check.
    const offloadedKeys = new Set(SHIC_OFFLOADED_KEYS || []);
    const countNonOffloaded = (d) => {
      if (!d) return 0;
      return (SHIC_DATA_ARRAY_KEYS||[]).reduce((s,k) => {
        if (offloadedKeys.has(k)) return s; // skip — these come from sub-lists
        return s + (Array.isArray(d[k]) ? d[k].length : 0);
      }, 0);
    };
    const localCount = countNonOffloaded(AppState.data);
    const remoteCount = countNonOffloaded(data);
    // Always apply main-blob data when no local edits — sub-lists handle bulk arrays separately.
    // The "skip if local has more" check no longer makes sense after multi-list migration.
    // We only skip if the main blob would clearly cause an obvious regression (e.g., 50+ records vs 0).
    if (remoteCount === 0 && localCount > 5) {
      console.log('[SP] Skipped remote main-blob replace — remote main blob is empty but local has ' + localCount + ' non-offloaded records');
    } else {
      // Merge main blob fields (settings, businessUnits, trades) but preserve sub-list arrays
      const merged = Object.assign({}, data);
      offloadedKeys.forEach(k => {
        // Keep local sub-list data (it was already merged from sub-list pull)
        if (Array.isArray(AppState.data[k])) merged[k] = AppState.data[k];
      });
      AppState.data = Object.assign(getDefaultData(), merged);
    }
    if (typeof migrateData === 'function') migrateData();
    AppState.save();
    setTimeout(() => {
      try { renderPage(AppState.currentPage || 'dashboard'); } catch(e) {}
      try { buildSidebar(); } catch(e) {}
      if (_by && _by !== _spAccount?.username)
        showToast('↓ SharePoint synced — data updated by ' + _by, 'info', 3000);
    }, 400);
  }

  _spPendingRemote = null;
}

// ── Push data to SharePoint (conflict-safe) ───────────────

// ═══════════════════════════════════════════════════════════
// ── MULTI-LIST SYNC ENGINE ───────────────────────────────────
// ═══════════════════════════════════════════════════════════

// ── Resolve any SharePoint list ID by name ──────────────────
async function _spResolveListId(token, listName) {
  if (_spListIds[listName]) return _spListIds[listName];
  if (!_spSiteId) await spResolveSiteAndList(token);
  const res = await fetch(
    `https://graph.microsoft.com/v1.0/sites/${_spSiteId}/lists?$top=100`,
    { headers: { Authorization: 'Bearer ' + token } }
  );
  if (!res.ok) throw new Error('Could not list SharePoint lists: ' + res.status);
  const data = await res.json();
  const found = (data.value || []).find(l => l.displayName === listName || l.name === listName);
  if (!found) throw new Error('List not found: ' + listName + ' — please create it in SharePoint');
  _spListIds[listName] = found.id;
  return found.id;
}

// ── Fetch all items from a sub-list (paginated) ─────────────
async function _spFetchListItems(token, listName) {
  const listId = await _spResolveListId(token, listName);
  const items = [];
  let url = `https://graph.microsoft.com/v1.0/sites/${_spSiteId}/lists/${listId}/items?$expand=fields&$top=500`;
  let pageCount = 0;
  while (url && pageCount < 60) { // safety cap: 60 pages = 30,000 items
    const res = await fetch(url, { headers: { Authorization: 'Bearer ' + token } });
    if (!res.ok) throw new Error('Fetch ' + listName + ' failed: ' + res.status);
    const data = await res.json();
    if (data.value) items.push(...data.value);
    url = data['@odata.nextLink'] || null;
    pageCount++;
  }
  return { listId, items };
}

// ── Parse sub-list items into a data array ──────────────────
function _spParseListItems(items, idField) {
  const result = [];
  const idMap = {}; // record.id -> sp item id (for updates)
  items.forEach(item => {
    try {
      const raw = item.fields?.DataBlob;
      if (!raw) return;
      const record = JSON.parse(raw);
      if (record && record.id) {
        result.push(record);
        idMap[record.id] = item.id;
      }
    } catch(e) { console.warn('[SP] Parse error in list item:', e); }
  });
  return { records: result, idMap };
}

// ── Push records to a sub-list (smart upsert) ───────────────
// Compares with existing items, only writes changes
async function _spPushListData(token, listName, records, prevIdMap) {
  const config = Object.entries(SHIC_LIST_CONFIG).find(([n]) => n === listName);
  if (!config) throw new Error('Unknown list: ' + listName);
  const [, cfg] = config;
  // Ensure index columns exist (no-op after first call per list per session)
  await _spEnsureIndexColumns(token, listName).catch(() => {});
  const listId = await _spResolveListId(token, listName);
  const idField = cfg.idField;
  const localIds = new Set(records.map(r => r.id));
  const remoteIdsToDelete = Object.keys(prevIdMap).filter(id => !localIds.has(id));
  const username = _spAccount?.username || _m365Account?.username || 'system';
  let added = 0, updated = 0, deleted = 0;

  // Build hash map of records by id for change detection (compare with prev push hash)
  for (const record of records) {
    const recordJson = JSON.stringify(record);
    const existingItemId = prevIdMap[record.id];
    const recordHash = _quickHash(recordJson);
    // Skip if unchanged (cached hash matches)
    if (_spListRecordHashes[listName] && _spListRecordHashes[listName][record.id] === recordHash) {
      continue;
    }

    const body = {
      fields: {
        Title: String(record.name || record.id || '').slice(0, 250),
        [idField]: String(record.id || '').slice(0, 250),
        DataBlob: recordJson,
        UpdatedBy: username,
        UpdatedAt: new Date().toISOString(),
      }
    };
    // ProjectId index column for all project-scoped lists
    if (cfg.hasProject) {
      body.fields.ProjectId = String(record.projectId || '').slice(0, 250);
    }
    // Write all declared indexCols from SHIC_LIST_CONFIG
    if (cfg.indexCols) {
      for (const col of cfg.indexCols) {
        const val = record[col.field];
        if (val === undefined || val === null) continue;
        if (col.spType === 'Boolean') {
          body.fields[col.spCol] = Boolean(val);
        } else if (col.spType === 'DateTime') {
          body.fields[col.spCol] = val ? String(val).slice(0, 50) : null;
        } else {
          body.fields[col.spCol] = String(val).slice(0, 250);
        }
      }
    }

    try {
      if (existingItemId) {
        const r = await fetch(
          `https://graph.microsoft.com/v1.0/sites/${_spSiteId}/lists/${listId}/items/${existingItemId}`,
          { method: 'PATCH', headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' }, body: JSON.stringify(body) }
        );
        if (r.ok) updated++;
        else if (r.status === 404) {
          // Item was deleted remotely — re-create
          const c = await fetch(
            `https://graph.microsoft.com/v1.0/sites/${_spSiteId}/lists/${listId}/items`,
            { method: 'POST', headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' }, body: JSON.stringify(body) }
          );
          if (c.ok) { const created = await c.json(); prevIdMap[record.id] = created.id; added++; }
        }
      } else {
        const r = await fetch(
          `https://graph.microsoft.com/v1.0/sites/${_spSiteId}/lists/${listId}/items`,
          { method: 'POST', headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' }, body: JSON.stringify(body) }
        );
        if (r.ok) { const created = await r.json(); prevIdMap[record.id] = created.id; added++; }
        else if (r.status === 429) {
          await new Promise(r => setTimeout(r, 3000));
          // simple retry once
          const r2 = await fetch(
            `https://graph.microsoft.com/v1.0/sites/${_spSiteId}/lists/${listId}/items`,
            { method: 'POST', headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' }, body: JSON.stringify(body) }
          );
          if (r2.ok) { const created = await r2.json(); prevIdMap[record.id] = created.id; added++; }
        }
      }
      // Update hash cache
      if (!_spListRecordHashes[listName]) _spListRecordHashes[listName] = {};
      _spListRecordHashes[listName][record.id] = recordHash;
    } catch(e) { console.warn('[SP] Write error for', record.id, ':', e.message); }
  }

  // Delete remote items — but ONLY ones we intentionally deleted locally
  // (tracked in _spDeletedIds[dataKey]). NEVER delete records just because they're
  // missing from our local data — they may have been added by another user.
  const deletedForThisList = (typeof _spDeletedIds !== 'undefined' && _spDeletedIds && cfg.dataKey)
    ? Object.keys(_spDeletedIds[cfg.dataKey] || {})
    : [];
  for (const idToDelete of remoteIdsToDelete) {
    // Skip unless this ID was explicitly deleted by THIS user in this list
    if (!deletedForThisList.includes(idToDelete)) {
      // Not intentional → another user may have added it or it's a stale map.
      // Drop from local idMap so we re-discover it on next pull, but DON'T delete from SP.
      delete prevIdMap[idToDelete];
      continue;
    }
    try {
      const res = await fetch(
        `https://graph.microsoft.com/v1.0/sites/${_spSiteId}/lists/${listId}/items/${prevIdMap[idToDelete]}`,
        { method: 'DELETE', headers: { Authorization: 'Bearer ' + token } }
      );
      // 404 = already gone, treat as success (clean up local map)
      if (res.ok || res.status === 404) {
        delete prevIdMap[idToDelete];
        if (_spListRecordHashes[listName]) delete _spListRecordHashes[listName][idToDelete];
        deleted++;
      }
    } catch(e) { /* silent — non-critical */ }
  }

  return { added, updated, deleted };
}

// ── Quick hash for change detection ─────────────────────────
function _quickHash(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) { h = ((h << 5) - h + s.charCodeAt(i)) | 0; }
  return h.toString(36);
}

// ── Ensure index columns exist on a SP list (creates missing ones) ──
// Called once per list on first push. Silently skips columns that already exist.
const _spEnsuredCols = new Set(); // tracks which lists have been ensured this session
async function _spEnsureIndexColumns(token, listName) {
  if (_spEnsuredCols.has(listName)) return;
  const cfg = SHIC_LIST_CONFIG[listName];
  if (!cfg) return;

  // Build the full column set this list needs
  const needed = [];
  if (cfg.hasProject) needed.push({ spCol: 'ProjectId', spType: 'Text' });
  if (cfg.indexCols) needed.push(...cfg.indexCols);
  if (!needed.length) { _spEnsuredCols.add(listName); return; }

  const listId = await _spResolveListId(token, listName);
  const baseUrl = `https://graph.microsoft.com/v1.0/sites/${_spSiteId}/lists/${listId}/columns`;

  // Fetch existing columns
  let existingNames = new Set();
  try {
    const res = await fetch(baseUrl, { headers: { Authorization: 'Bearer ' + token } });
    if (res.ok) {
      const data = await res.json();
      (data.value || []).forEach(c => existingNames.add(c.name));
    }
  } catch(e) { return; } // non-fatal

  // Create any missing columns
  for (const col of needed) {
    if (existingNames.has(col.spCol)) continue;
    const colDef = { name: col.spCol, enforceUniqueValues: false, hidden: false };
    if (col.spType === 'DateTime') {
      colDef.dateTime = { format: 'dateTime' };
    } else if (col.spType === 'Boolean') {
      colDef.boolean = {};
    } else {
      colDef.text = { allowMultipleLines: false, maxLength: 255 };
    }
    try {
      await fetch(baseUrl, {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
        body: JSON.stringify(colDef),
      });
    } catch(e) { /* non-fatal — push will still work via DataBlob */ }
  }
  _spEnsuredCols.add(listName);
}

// ── Hash cache for sub-lists (avoids re-pushing unchanged records) ──
const _spListRecordHashes = {}; // { 'SHIC_Tasks': { 'TSK-001': 'hash', ... } }
// ID maps for each list (record.id -> SP item id)
const _spListIdMaps = {};       // { 'SHIC_Tasks': { 'TSK-001': 'sp-item-id', ... } }

// ── Fetch all sub-lists in parallel and merge into AppState.data ──
async function _spFetchAllSubLists(token) {
  const results = {};
  const tasks = Object.entries(SHIC_LIST_CONFIG).map(async ([listName, cfg]) => {
    try {
      const { items } = await _spFetchListItems(token, listName);
      const { records, idMap } = _spParseListItems(items, cfg.idField);
      _spListIdMaps[listName] = idMap;
      results[cfg.dataKey] = records;
      // Update hash cache
      _spListRecordHashes[listName] = {};
      items.forEach(item => {
        try {
          const raw = item.fields?.DataBlob;
          if (!raw) return;
          const rec = JSON.parse(raw);
          if (rec && rec.id) {
            _spListRecordHashes[listName][rec.id] = _quickHash(raw);
          }
        } catch(e) {}
      });
      console.log('[SP] Fetched ' + listName + ': ' + records.length + ' records');
    } catch(e) {
      console.warn('[SP] Could not fetch ' + listName + ':', e.message);
      results[cfg.dataKey] = null; // signal: not available
    }
  });
  await Promise.all(tasks);
  return results;
}

// ── Push all sub-lists in parallel ──────────────────────────
async function _spPushAllSubLists(token) {
  const summary = { added: 0, updated: 0, deleted: 0, dupesRemoved: 0 };
  const tasks = Object.entries(SHIC_LIST_CONFIG).map(async ([listName, cfg]) => {
    try {
      const records = AppState.data[cfg.dataKey] || [];
      // ── CRITICAL: Always refresh idMap from SP before pushing ──
      // Without this, the push doesn't see existing rows and creates duplicates.
      // We also detect & remove any existing duplicates as a self-healing step.
      if (!_spListIdMaps[listName] || Object.keys(_spListIdMaps[listName]).length === 0) {
        try {
          const { items } = await _spFetchListItems(token, listName);
          const dupCleanup = await _spRebuildIdMapAndCleanDupes(token, listName, items, cfg.idField);
          _spListIdMaps[listName] = dupCleanup.idMap;
          summary.dupesRemoved += dupCleanup.removed;
          // Refresh hash cache too
          _spListRecordHashes[listName] = dupCleanup.hashes;
          if (dupCleanup.removed > 0) {
            console.log('[SP] ' + listName + ': cleaned ' + dupCleanup.removed + ' duplicate row(s)');
          }
        } catch(e) {
          // Could not resolve existing SP rows — abort push for this list to avoid mass duplicates.
          // The list will be retried on the next push cycle once SP is reachable.
          console.warn('[SP] Skipping push for ' + listName + ' — could not fetch existing items:', e.message);
          return; // skip this list entirely
        }
      }
      const r = await _spPushListData(token, listName, records, _spListIdMaps[listName]);
      summary.added += r.added; summary.updated += r.updated; summary.deleted += r.deleted;
      if (r.added || r.updated || r.deleted) {
        console.log('[SP] ' + listName + ': +' + r.added + ' ~' + r.updated + ' -' + r.deleted);
      }
      if (typeof _markListSyncSuccess === 'function') _markListSyncSuccess(listName);
    } catch(e) {
      console.warn('[SP] Push ' + listName + ' failed:', e.message);
      if (typeof _markListSyncFail === 'function') _markListSyncFail(listName, e.message);
    }
  });
  await Promise.all(tasks);
  return summary;
}

// ── Rebuild idMap from SP items AND remove duplicate rows ──
// Keeps the most recently updated row for each record ID, deletes the rest.
async function _spRebuildIdMapAndCleanDupes(token, listName, items, idField) {
  const idMap = {};
  const hashes = {};
  const listId = _spListIds[listName];
  // Group items by record.id (from DataBlob)
  const groupedById = {};
  items.forEach(item => {
    try {
      const raw = item.fields?.DataBlob;
      if (!raw) return;
      const rec = JSON.parse(raw);
      if (!rec || !rec.id) return;
      if (!groupedById[rec.id]) groupedById[rec.id] = [];
      groupedById[rec.id].push({ spId: item.id, raw, updatedAt: item.fields?.UpdatedAt || item.lastModifiedDateTime || '' });
    } catch(e) {}
  });
  let removed = 0;
  // For each id, keep newest (by UpdatedAt), delete rest
  for (const [recId, list] of Object.entries(groupedById)) {
    list.sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''));
    const keep = list[0];
    idMap[recId] = keep.spId;
    hashes[recId] = _quickHash(keep.raw);
    // Delete the duplicates (everything after the first)
    for (let i = 1; i < list.length; i++) {
      try {
        await fetch(
          `https://graph.microsoft.com/v1.0/sites/${_spSiteId}/lists/${listId}/items/${list[i].spId}`,
          { method: 'DELETE', headers: { Authorization: 'Bearer ' + token } }
        );
        removed++;
      } catch(e) { /* ignore */ }
    }
  }
  return { idMap, hashes, removed };
}



// ═══════════════════════════════════════════════════════════
// ── SHAREPOINT LIST SETUP WIZARD ──────────────────────────
// Auto-creates all required SP lists with proper columns
// ═══════════════════════════════════════════════════════════

async function showSpListWizard() {
  if (!_spConnected) { showToast('Connect to SharePoint first', 'error'); return; }

  $('#genericModalTitle').textContent = 'SharePoint List Setup Wizard';
  $('#genericModalBody').innerHTML = `
    <div style="padding:12px;background:rgba(188,140,255,.08);border:1px solid rgba(188,140,255,.2);border-radius:8px;margin-bottom:14px">
      <div style="font-size:13px;font-weight:700;margin-bottom:6px;color:#bc8cff"><i class="fas fa-magic" style="margin-right:6px"></i>Auto-Setup All Required SharePoint Lists</div>
      <div style="font-size:11px;color:var(--text-secondary);line-height:1.6">
        This wizard checks for required SharePoint lists and creates any that are missing — automatically and with the right columns.<br>
        Safe to run multiple times. Existing lists are never modified.<br><br>
        <strong>Required lists:</strong> ${Object.keys(SHIC_LIST_CONFIG).length} module lists + SHIC_AppData + SHIC_Users + SHIC_FormTemplates + SHIC_Documents library
      </div>
    </div>
    <div id="wizardStatus" style="display:none;padding:10px;background:var(--bg-hover);border-radius:7px;margin-bottom:10px;font-size:11px"></div>
    <div id="wizardList" style="max-height:400px;overflow-y:auto;border:1px solid var(--border);border-radius:7px"><div style="padding:20px;text-align:center;color:var(--text-muted)"><i class="fas fa-spinner fa-spin" style="margin-right:5px"></i>Scanning SharePoint...</div></div>
  `;
  $('#genericModalFooter').innerHTML = `
    <button class="btn btn-secondary" onclick="closeModal('genericModal')">Close</button>
    <button class="btn btn-secondary" onclick="_scanSpLists()"><i class="fas fa-redo"></i> Re-Scan</button>
    <button class="btn btn-primary" id="wizardCreateBtn" onclick="_createMissingLists()" style="display:none"><i class="fas fa-bolt"></i> Auto-Create Missing Lists</button>
    <button class="btn btn-success" id="wizardMigrateBtn" onclick="_migrateToNewLists()" style="display:none"><i class="fas fa-cloud-upload-alt"></i> Migrate Data Now</button>
    <button class="btn btn-secondary" onclick="showSpTestListWizard()" style="border-color:var(--accent-purple);color:var(--accent-purple)"><i class="fas fa-flask" style="margin-right:5px"></i>Create Test Lists</button>
  `;
  openModal('genericModal');
  await _scanSpLists();
}

// ── Build the master list of all required lists ───────────
function _getAllRequiredLists() {
  const lists = Object.entries(SHIC_LIST_CONFIG).map(([name, cfg]) => ({
    name,
    role: 'data',
    cfg,
    columns: ['ProjectId', 'DataBlob', 'UpdatedBy', 'UpdatedAt'],
    addColumns: cfg.hasProject
      ? [cfg.idField, 'ProjectId', 'DataBlob', 'UpdatedBy', 'UpdatedAt']
      : [cfg.idField, 'DataBlob', 'UpdatedBy', 'UpdatedAt'],
  }));
  // Projects also gets Name + Status columns for SP-side filtering
  const projItem = lists.find(l => l.name === 'SHIC_Projects');
  if (projItem) projItem.addColumns = ['ProjectId', 'Name', 'Status', 'DataBlob', 'UpdatedBy', 'UpdatedAt'];
  // DailyLogs gets LogDate
  const dlItem = lists.find(l => l.name === 'SHIC_DailyLogs');
  if (dlItem) dlItem.addColumns = ['LogId', 'ProjectId', 'LogDate', 'DataBlob', 'UpdatedBy', 'UpdatedAt'];
  // AssetHistory/AssetUtilization get AssetId
  const ahItem = lists.find(l => l.name === 'SHIC_AssetHistory');
  if (ahItem) ahItem.addColumns = ['EventId', 'AssetId', 'DataBlob', 'UpdatedBy', 'UpdatedAt'];
  const auItem = lists.find(l => l.name === 'SHIC_AssetUtilization');
  if (auItem) auItem.addColumns = ['UtilId', 'AssetId', 'DataBlob', 'UpdatedBy', 'UpdatedAt'];
  // Add SHIC_FormTemplates — managed separately from SHIC_LIST_CONFIG (uses its own SP CRUD)
  lists.push({
    name: SHIC_FORMS_LIST,
    role: 'data',
    cfg: { name: 'Form Templates' },
    addColumns: ['FormId','FormName','CompanyName','CompanySub','DocControlNo','RevisionNo','EffectiveDate','LogoDataUrl'],
  });
  // Add SHIC_AuditLog
  lists.push({
    name: SHIC_AUDIT_LIST,
    role: 'data',
    cfg: { name: 'Audit Log' },
    addColumns: ['Action','Entity','EntityId','Module','UserEmail','Before','After','Notes'],
  });
  return lists;
}

// ── Scan SP to see which lists exist ───────────────────────
async function _scanSpLists() {
  const wizListEl = document.getElementById('wizardList');
  const wizStatusEl = document.getElementById('wizardStatus');
  if (!wizListEl) return;
  wizListEl.innerHTML = '<div style="padding:20px;text-align:center;color:var(--text-muted)"><i class="fas fa-spinner fa-spin" style="margin-right:5px"></i>Scanning SharePoint...</div>';
  try {
    const token = await getSpToken();
    if (!token) throw new Error('Could not get SP token');
    if (!_spSiteId) await spResolveSiteAndList(token);
    // Fetch all lists from SP
    const res = await fetch(
      `https://graph.microsoft.com/v1.0/sites/${_spSiteId}/lists?$top=200&$select=id,displayName,name`,
      { headers: { Authorization: 'Bearer ' + token } }
    );
    if (!res.ok) throw new Error('Could not list SharePoint lists: ' + res.status);
    const data = await res.json();
    const existingNames = new Set((data.value || []).map(l => l.displayName));
    // Also remember IDs for known lists
    (data.value || []).forEach(l => {
      if (SHIC_LIST_CONFIG[l.displayName]) _spListIds[l.displayName] = l.id;
    });

    const required = _getAllRequiredLists();
    const missing = required.filter(l => !existingNames.has(l.name));
    const existing = required.filter(l => existingNames.has(l.name));

    let html = '';
    if (existing.length) {
      html += '<div style="padding:8px 12px;background:rgba(63,185,80,.06);border-bottom:1px solid var(--border);font-size:11px;font-weight:700;color:var(--accent-green)">✅ EXISTING (' + existing.length + ')</div>';
      existing.forEach(l => {
        html += `<div style="padding:8px 12px;display:flex;align-items:center;gap:8px;border-bottom:1px solid var(--border);font-size:11px">
          <i class="fas fa-check-circle" style="color:var(--accent-green)"></i>
          <span style="flex:1;font-family:var(--font-mono)">${l.name}</span>
          <span style="color:var(--text-muted);font-size:10px">${l.cfg.name}</span>
        </div>`;
      });
    }
    if (missing.length) {
      html += '<div style="padding:8px 12px;background:rgba(240,164,80,.06);border-bottom:1px solid var(--border);font-size:11px;font-weight:700;color:var(--accent-amber)">⚠ MISSING (' + missing.length + ')</div>';
      missing.forEach(l => {
        html += `<div style="padding:8px 12px;display:flex;align-items:center;gap:8px;border-bottom:1px solid var(--border);font-size:11px">
          <i class="fas fa-circle-xmark" style="color:var(--accent-amber)"></i>
          <span style="flex:1;font-family:var(--font-mono)">${l.name}</span>
          <span style="color:var(--text-muted);font-size:10px">${l.cfg.name}</span>
          <span id="wzStatus_${l.name}" style="font-size:10px;color:var(--text-muted)">pending</span>
        </div>`;
      });
    }
    wizListEl.innerHTML = html;

    wizStatusEl.style.display = 'block';
    wizStatusEl.innerHTML = `<strong>Status:</strong> ${existing.length} existing, ${missing.length} missing.`;

    const createBtn = document.getElementById('wizardCreateBtn');
    const migrateBtn = document.getElementById('wizardMigrateBtn');
    if (createBtn) createBtn.style.display = missing.length > 0 ? '' : 'none';
    if (migrateBtn) migrateBtn.style.display = missing.length === 0 ? '' : 'none';

    // Store for later
    window._wizardMissing = missing;
    window._wizardExisting = existing;
  } catch (e) {
    wizListEl.innerHTML = `<div style="padding:14px;color:var(--accent-red);font-size:12px"><i class="fas fa-exclamation-triangle" style="margin-right:5px"></i>Scan failed: ${e.message}</div>`;
  }
}

// ── Auto-create all missing lists ─────────────────────────
async function _createMissingLists() {
  const missing = window._wizardMissing || [];
  if (!missing.length) { showToast('No missing lists', 'info'); return; }

  const wizStatusEl = document.getElementById('wizardStatus');
  const createBtn = document.getElementById('wizardCreateBtn');
  if (createBtn) createBtn.disabled = true;

  try {
    const token = await getSpToken();
    if (!token) throw new Error('Could not get SP token');
    if (!_spSiteId) await spResolveSiteAndList(token);

    let createdCount = 0;
    let failedCount = 0;
    const errors = [];

    for (const l of missing) {
      const statusEl = document.getElementById('wzStatus_' + l.name);
      if (statusEl) { statusEl.textContent = 'creating...'; statusEl.style.color = 'var(--accent-blue)'; }
      try {
        const multilineFields = new Set(['DataBlob', 'LogoDataUrl']);
        const cols = l.addColumns.filter(c => c !== 'Title' && c !== 'DataBlob' && c !== 'LogoDataUrl' && c !== 'UpdatedAt')
          .map(c => ({ name: c, text: { allowMultipleLines: false } }));
        // Multi-line text fields
        multilineFields.forEach(f => { if (l.addColumns.includes(f)) cols.push({ name: f, text: { allowMultipleLines: true } }); });
        // UpdatedAt is datetime
        if (l.addColumns.includes('UpdatedAt')) cols.push({ name: 'UpdatedAt', dateTime: {} });

        const createRes = await fetch(
          `https://graph.microsoft.com/v1.0/sites/${_spSiteId}/lists`,
          {
            method: 'POST',
            headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
            body: JSON.stringify({
              displayName: l.name,
              list: { template: 'genericList' },
              columns: cols,
            })
          }
        );
        if (createRes.ok) {
          const created = await createRes.json();
          _spListIds[l.name] = created.id;
          if (statusEl) { statusEl.innerHTML = '<i class="fas fa-check" style="margin-right:3px"></i>created'; statusEl.style.color = 'var(--accent-green)'; }
          createdCount++;
        } else if (createRes.status === 409) {
          if (statusEl) { statusEl.textContent = 'already exists'; statusEl.style.color = 'var(--text-muted)'; }
          createdCount++;
        } else {
          const errData = await createRes.json().catch(() => ({}));
          const errMsg = errData.error?.message || 'HTTP ' + createRes.status;
          if (statusEl) { statusEl.innerHTML = '<i class="fas fa-times" style="margin-right:3px"></i>failed'; statusEl.style.color = 'var(--accent-red)'; statusEl.title = errMsg; }
          errors.push(l.name + ': ' + errMsg);
          failedCount++;
        }
      } catch (e) {
        if (statusEl) { statusEl.textContent = 'error: ' + e.message.slice(0,40); statusEl.style.color = 'var(--accent-red)'; }
        errors.push(l.name + ': ' + e.message);
        failedCount++;
      }
      await new Promise(r => setTimeout(r, 250)); // throttle to avoid 429
    }

    if (wizStatusEl) {
      wizStatusEl.innerHTML = `<strong>Setup complete:</strong> ${createdCount} created, ${failedCount} failed.` +
        (errors.length ? `<br><span style="font-size:10px;color:var(--accent-red)">${errors.slice(0,3).join(' · ')}</span>` : '');
    }
    if (createBtn) createBtn.disabled = false;
    showToast(createdCount + ' list(s) created' + (failedCount ? ', ' + failedCount + ' failed' : ''), failedCount ? 'warning' : 'success', 5000);

    // Auto re-scan to refresh state
    setTimeout(() => _scanSpLists(), 1500);
  } catch (e) {
    if (wizStatusEl) wizStatusEl.innerHTML = `<span style="color:var(--accent-red)">Setup failed: ${e.message}</span>`;
    if (createBtn) createBtn.disabled = false;
    showToast('Setup failed: ' + e.message, 'error', 6000);
  }
}


// -- TEST LIST WIZARD ------------------------------------------
// Creates SHIC_TEST_ prefixed copies of all production lists
// Safe: never touches production SHIC_ lists
async function showSpTestListWizard() {
  if (!_spConnected) { showToast('Connect to SharePoint first', 'error'); return; }

  $('#genericModalTitle').textContent = 'Create Test Environment Lists';
  $('#genericModalBody').innerHTML = `
    <div style="padding:12px;background:rgba(188,140,255,.08);border:1px solid rgba(188,140,255,.2);border-radius:8px;margin-bottom:14px">
      <div style="font-size:13px;font-weight:700;margin-bottom:6px;color:#bc8cff"><i class="fas fa-flask" style="margin-right:6px"></i>Test Environment Setup</div>
      <div style="font-size:11px;color:var(--text-secondary);line-height:1.6">
        Creates <strong>SHIC_TEST_</strong> prefixed copies of all ${Object.keys(SHIC_LIST_CONFIG).length} lists on the same SharePoint site.<br>
        Production data is <strong>never touched</strong>. Test lists are empty and safe to wipe anytime.<br><br>
        To activate test mode: open browser console and run <code style="background:var(--bg-card);padding:1px 5px;border-radius:3px">localStorage.setItem('shic_test_mode','1'); location.reload()</code>
      </div>
    </div>
    <div id="testWizardStatus" style="display:none;padding:10px;background:var(--bg-hover);border-radius:7px;margin-bottom:10px;font-size:11px"></div>
    <div id="testWizardList" style="max-height:380px;overflow-y:auto;border:1px solid var(--border);border-radius:7px">
      <div style="padding:20px;text-align:center;color:var(--text-muted)"><i class="fas fa-spinner fa-spin" style="margin-right:5px"></i>Checking test lists...</div>
    </div>
  `;
  $('#genericModalFooter').innerHTML = `
    <button class="btn btn-secondary" onclick="closeModal('genericModal')">Close</button>
    <button class="btn btn-primary" id="testWizardCreateBtn" onclick="_createTestLists()" style="display:none"><i class="fas fa-bolt"></i> Create Missing Test Lists</button>
    <button class="btn btn-danger btn-sm" id="testWizardDeleteBtn" onclick="_deleteTestLists()" style="display:none;margin-left:auto"><i class="fas fa-trash"></i> Delete All Test Lists</button>
  `;
  openModal('genericModal');
  await _scanTestLists();
}

async function _scanTestLists() {
  const listEl = document.getElementById('testWizardList');
  const statusEl = document.getElementById('testWizardStatus');
  if (!listEl) return;
  try {
    const token = await getSpToken();
    if (!_spSiteId) await spResolveSiteAndList(token);
    const res = await fetch(
      `https://graph.microsoft.com/v1.0/sites/${_spSiteId}/lists?$top=200&$select=id,displayName`,
      { headers: { Authorization: 'Bearer ' + token } }
    );
    const data = await res.json();
    const existingNames = new Set((data.value || []).map(l => l.displayName));
    const required = Object.keys(SHIC_LIST_CONFIG).map(n => 'SHIC_TEST_' + n.replace('SHIC_',''));
    const missing  = required.filter(n => !existingNames.has(n));
    const existing = required.filter(n =>  existingNames.has(n));

    let html = '';
    if (existing.length) {
      html += `<div style="padding:8px 12px;background:rgba(63,185,80,.06);border-bottom:1px solid var(--border);font-size:11px;font-weight:700;color:var(--accent-green)">? EXISTS (${existing.length})</div>`;
      existing.forEach(n => { html += `<div style="padding:7px 12px;display:flex;align-items:center;gap:8px;border-bottom:1px solid var(--border);font-size:11px"><i class="fas fa-check-circle" style="color:var(--accent-green)"></i><span style="font-family:var(--font-mono)">${n}</span></div>`; });
    }
    if (missing.length) {
      html += `<div style="padding:8px 12px;background:rgba(240,164,80,.06);border-bottom:1px solid var(--border);font-size:11px;font-weight:700;color:var(--accent-amber)">? MISSING (${missing.length})</div>`;
      missing.forEach(n => { html += `<div style="padding:7px 12px;display:flex;align-items:center;gap:8px;border-bottom:1px solid var(--border);font-size:11px"><i class="fas fa-circle-xmark" style="color:var(--accent-amber)"></i><span style="font-family:var(--font-mono)">${n}</span><span id="tws_${n}" style="margin-left:auto;font-size:10px;color:var(--text-muted)">pending</span></div>`; });
    }
    listEl.innerHTML = html || '<div style="padding:14px;text-align:center;color:var(--text-muted)">No lists found</div>';
    if (statusEl) { statusEl.style.display='block'; statusEl.innerHTML=`<strong>Status:</strong> ${existing.length} test lists exist, ${missing.length} missing.`; }
    window._testWizardMissing = missing;
    const createBtn = document.getElementById('testWizardCreateBtn');
    const deleteBtn = document.getElementById('testWizardDeleteBtn');
    if (createBtn) createBtn.style.display = missing.length > 0 ? '' : 'none';
    if (deleteBtn) deleteBtn.style.display = existing.length > 0 ? '' : 'none';
  } catch(e) {
    listEl.innerHTML = `<div style="padding:14px;color:var(--accent-red);font-size:12px"><i class="fas fa-exclamation-triangle" style="margin-right:5px"></i>${e.message}</div>`;
  }
}

async function _createTestLists() {
  const missing = window._testWizardMissing || [];
  if (!missing.length) { showToast('All test lists already exist', 'info'); return; }
  const btn = document.getElementById('testWizardCreateBtn');
  if (btn) btn.disabled = true;
  const token = await getSpToken();
  if (!_spSiteId) await spResolveSiteAndList(token);
  let ok = 0, fail = 0;
  for (const listName of missing) {
    const statusEl = document.getElementById('tws_' + listName);
    if (statusEl) { statusEl.textContent = 'creating...'; statusEl.style.color = 'var(--accent-blue)'; }
    try {
      const cols = [
        { name: 'DataBlob', text: { allowMultipleLines: true } },
        { name: 'UpdatedBy', text: {} },
        { name: 'UpdatedAt', dateTime: {} },
      ];
      const r = await fetch(`https://graph.microsoft.com/v1.0/sites/${_spSiteId}/lists`, {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
        body: JSON.stringify({ displayName: listName, list: { template: 'genericList' }, columns: cols })
      });
      if (r.ok || r.status === 409) {
        ok++;
        if (statusEl) { statusEl.innerHTML = '<i class="fas fa-check"></i> created'; statusEl.style.color = 'var(--accent-green)'; }
      } else { throw new Error('HTTP ' + r.status); }
    } catch(e) {
      fail++;
      if (statusEl) { statusEl.innerHTML = 'failed'; statusEl.style.color = 'var(--accent-red)'; }
    }
    await new Promise(r => setTimeout(r, 250));
  }
  showToast(`Test lists: ${ok} created${fail ? ', ' + fail + ' failed' : ''}`, fail ? 'warning' : 'success', 5000);
  if (btn) btn.disabled = false;
  setTimeout(() => _scanTestLists(), 1500);
}

async function _deleteTestLists() {
  if (!confirm('Delete ALL SHIC_TEST_ lists and their data?\n\nProduction lists are NOT affected.')) return;
  const token = await getSpToken();
  if (!_spSiteId) await spResolveSiteAndList(token);
  const res = await fetch(`https://graph.microsoft.com/v1.0/sites/${_spSiteId}/lists?$top=200&$select=id,displayName`, { headers:{ Authorization:'Bearer '+token } });
  const data = await res.json();
  const testLists = (data.value||[]).filter(l => l.displayName.startsWith('SHIC_TEST_'));
  let ok = 0;
  for (const l of testLists) {
    const r = await fetch(`https://graph.microsoft.com/v1.0/sites/${_spSiteId}/lists/${l.id}`, { method:'DELETE', headers:{ Authorization:'Bearer '+token } });
    if (r.ok || r.status === 404) ok++;
    await new Promise(r => setTimeout(r, 200));
  }
  showToast(`Deleted ${ok} test list(s)`, 'success', 4000);
  setTimeout(() => _scanTestLists(), 1500);
}

// ── Migrate existing data from main blob to sub-lists ─────
async function _migrateToNewLists() {
  if (!confirm('Migrate all data from SHIC_AppData blob to dedicated sub-lists?\n\nThis pushes your current data into the new lists. Safe to repeat.')) return;
  const migrateBtn = document.getElementById('wizardMigrateBtn');
  if (migrateBtn) migrateBtn.disabled = true;
  const wizStatusEl = document.getElementById('wizardStatus');
  if (wizStatusEl) wizStatusEl.innerHTML = '<i class="fas fa-spinner fa-spin" style="margin-right:5px"></i>Migrating data — this may take a minute...';

  try {
    // Force a full push — this strips offloaded keys from main blob and pushes them to sub-lists
    SHIC_OFFLOADED_KEYS_REFRESH(); // re-read from config since we just expanded it
    await spPushData(true);
    if (wizStatusEl) wizStatusEl.innerHTML = '<span style="color:var(--accent-green)"><i class="fas fa-check-circle" style="margin-right:5px"></i>Migration complete. Main blob is now lean and all data lives in dedicated lists.</span>';
    showToast('Data migrated to dedicated lists successfully', 'success', 5000);
  } catch (e) {
    if (wizStatusEl) wizStatusEl.innerHTML = `<span style="color:var(--accent-red)">Migration failed: ${e.message}</span>`;
    showToast('Migration failed: ' + e.message, 'error', 6000);
  } finally {
    if (migrateBtn) migrateBtn.disabled = false;
  }
}

// Helper to refresh offloaded keys after config change
function SHIC_OFFLOADED_KEYS_REFRESH() {
  // SHIC_OFFLOADED_KEYS is a const declared at top-level so we can't reassign;
  // but we can rebuild via a function call site. Since our config is fixed
  // at script load, this is just a guard for clarity.
  return Object.values(SHIC_LIST_CONFIG).map(c => c.dataKey);
}

async function spPushData(silent = false) {
  if (_spSyncing) return false;
  if (!_spConnected || !_spAccount) { if (!silent) showToast('Not connected to SharePoint', 'error'); return false; }
  _spSyncing = true;
  _ssm.transition('PUSHING');
  spSetStatus('syncing', 'Checking for remote changes...');
  try {
    const token = await getSpToken();
    if (!token) throw new Error('Could not acquire token');
    const { siteId, listId } = await spResolveSiteAndList(token);

    // ── Step 1: Fetch remote first to detect conflicts ────
    const remote = await _spFetchRemote(token, siteId, listId);
    if (remote && remote._ts && remote._ts > _spLastWriteTs) {
      // Remote is newer — merge remote arrays into local before pushing
      // Strategy: remote wins for records that exist in remote but not local
      // Local wins for records added locally since last sync
      const { _ts, _by, ...remoteData } = remote;
      const merged = Object.assign({}, remoteData);
      const ARRAY_KEYS = ['projects','tasks','resources','equipment','tools','vehicles',
        'consumables','materials','manpower','procurement','procurementLogs',
        'resourceAllocations','resourceUsageLogs','costs','qaqc','risks',
        'actions','documents','progress','kpiData','assetHistory',
        'thirdParties','thirdParty','projectTeam','calendar','activities','notifications','trades',
        'warehouseItems','stockTransactions','issuanceRequests'];
      ARRAY_KEYS.forEach(key => {
        merged[key] = _spMergeArrays(
          AppState.data[key] || [],
          remoteData[key] || [],
          true, // local edits win for existing records
          key   // deletion tracking
        );
      });
      // Merge settings — local wins, EXCEPT admin-pushed dropdowns take priority
      const _rSet = remoteData.settings || {};
      const _lSet = AppState.data.settings || {};
      merged.settings = Object.assign({}, _rSet, _lSet);
      const _rPushedAt = _rSet.dropdowns?._adminPushedAt || 0;
      const _lPushedAt = _lSet.dropdowns?._adminPushedAt || 0;
      if (_rPushedAt > _lPushedAt) {
        merged.settings.dropdowns = Object.assign({}, _rSet.dropdowns || {});
      }
      AppState.data = Object.assign(getDefaultData(), merged);
      _spLastWriteTs = _ts;
      _spDataHash = _spHash(remoteData) + _ts;
      if (!silent) showToast('Merged remote changes before push', 'info', 2500);
    }

    // ── Step 2: Push merged data ──────────────────────────
    spSetStatus('syncing', 'Uploading to SharePoint...');
    const nowTs = Date.now();

    // ── PHASE 2a: Push sub-lists FIRST ──────────────────────
    // Push high-volume arrays to their dedicated SP lists before stripping them
    // from the main blob. This ensures that if the main blob write later fails,
    // the sub-lists are already up to date and no data is lost.
    spSetStatus('syncing', 'Syncing tasks & logs to sub-lists...');
    let subListsOk = false;
    try {
      const subResult = await _spPushAllSubLists(token);
      subListsOk = true;
      if (subResult.added || subResult.updated || subResult.deleted) {
        console.log('[SP] Sub-lists synced: +' + subResult.added + ' ~' + subResult.updated + ' -' + subResult.deleted);
      }
    } catch(subErr) {
      console.warn('[SP] Sub-list push had errors (continuing):', subErr.message);
    }

    // ── PHASE 2b: Build and push main blob ──────────────────
    spSetStatus('syncing', 'Uploading to SharePoint...');
    // Prune large arrays to keep blob under 5MB SP limit
    const dataForPush = { ...AppState.data };
    if ((dataForPush.activities || []).length > 200)
      dataForPush.activities = dataForPush.activities.slice(-200);
    if ((dataForPush.notifications || []).length > 100)
      dataForPush.notifications = dataForPush.notifications.slice(-100);
    // ── ALWAYS strip embedded base64 file data from documents ──────
    if (dataForPush.documents && dataForPush.documents.length) {
      dataForPush.documents = dataForPush.documents.map(d => {
        const copy = { ...d };
        if (copy.fileData) delete copy.fileData;
        return copy;
      });
    }

    // Strip offloaded arrays from main blob ONLY after sub-lists were pushed successfully.
    // If sub-lists failed, keep the arrays in the main blob as a fallback so SP has the data.
    if (subListsOk) {
      SHIC_OFFLOADED_KEYS.forEach(key => { dataForPush[key] = []; });
    }

    // Safety: check the final payload size before pushing
    const payloadStr = JSON.stringify(dataForPush);
    if (payloadStr.length > 4 * 1024 * 1024) {
      console.warn('[SP] Payload size:', (payloadStr.length / 1024 / 1024).toFixed(2) + ' MB — may hit SP limits');
    }
    // Include deletion tracking
    dataForPush._deletedIds = _spDeletedIds;
    const payload = { ...dataForPush, _ts: nowTs, _by: _spAccount.username };
    await _spWriteRemote(token, siteId, listId, payload);
    _spLastWriteTs = nowTs;
    localStorage.setItem('shic_sp_lastwritets', String(_spLastWriteTs));
    _spDataHash = _spHash(AppState.data) + nowTs;
    _spLastSync = new Date().toISOString();
    localStorage.setItem('shic_sp_lastsync', _spLastSync);
    spSetStatus('connected', 'Last sync: ' + fmtSyncTime(_spLastSync));
    if (!silent) showToast('Data pushed to SharePoint ✓', 'success');
    spUpdateSyncInfo();
    // Push succeeded — local is now in sync with SharePoint
    _spOfflineQueue = false;
    localStorage.removeItem('shic_sp_offlinequeue');
    if (typeof _pendingEdits !== 'undefined') _pendingEdits = false;
    _spLastSavedHash = _spHash(AppState.data);
    // Apply any pending remote that arrived while we were editing
    if (_spPendingRemote) {
      const { data, _ts, _by } = _spPendingRemote;
      if (_ts > _spLastWriteTs) _spApplyRemote(data, _ts, _by);
      else _spPendingRemote = null;
    }
    _ssm.transition('SYNCED');
    return true;
  } catch (e) {
    // ── SharePoint unavailable — queue the push for retry ──
    _spAvailable = false;
    _spOfflineQueue = true;
    localStorage.setItem('shic_sp_offlinequeue', '1');
    spSetStatus('error', 'SharePoint unavailable — changes queued locally');
    if (!silent) showToast('SharePoint unreachable — changes saved locally and will sync when restored', 'warning', 5000);
    console.warn('[SP] Push failed, queuing for retry:', e.message);
    // Schedule retry in 60 seconds
    clearTimeout(_spRetryTimer);
    _spRetryTimer = setTimeout(() => _spRetryPush(), 60000);
    _ssm.transition('ERROR', { error: e.message });
    return false;
  } finally { _spSyncing = false; }
}

// ── Retry push when SharePoint becomes available again ───
async function _spRetryPush() {
  if (!_spConnected || !_spAccount || !_spOfflineQueue) return;
  if (_spSyncing) { _spRetryTimer = setTimeout(_spRetryPush, 30000); return; }
  console.log('[SP] Retrying queued push...');
  spSetStatus('syncing', 'Retrying sync...');
  try {
    // Re-init MSAL if needed (handles page reload where _spMsalApp was lost)
    if (!_spMsalApp && _spClientId) {
      console.log('[SP] Re-initializing MSAL for retry...');
      initSpMSAL();
      if (_spMsalApp && _spMsalApp.initialize) {
        await _spMsalApp.initialize().catch(()=>{});
      }
    }
    const token = await getSpToken();
    if (!token) throw new Error('No token — please reconnect SharePoint in Settings');
    // Test connectivity with a lightweight request
    const { siteId, listId } = await spResolveSiteAndList(token);
    _spAvailable = true;
    // Now do a full merge push — only clear queue if push succeeds
    await spPushData(true);
    // spPushData succeeded (no exception thrown) — safe to clear queue
    _spOfflineQueue = false;
    localStorage.removeItem('shic_sp_offlinequeue');
    showToast('SharePoint reconnected — queued changes synced ✓', 'success', 4000);
  } catch (e) {
    console.warn('[SP] Retry failed, will try again in 60s:', e.message);
    // Keep _spOfflineQueue = true so we retry again
    _spRetryTimer = setTimeout(_spRetryPush, 60000);
  }
}

// ── Pull data from SharePoint (with conflict warning) ────
async function spPullData() {
  if (_spSyncing) return;
  if (!_spConnected || !_spAccount) { showToast('Not connected to SharePoint', 'error'); return; }
  const hasLocalEdits = _spHasLocalEdits();
  const msg = hasLocalEdits
    ? '⚠ You have LOCAL UNSAVED CHANGES that will be LOST if you pull now.\n\nPull anyway and discard your changes?\n\n(Click Cancel to push your changes first instead.)'
    : 'Download latest data from SharePoint? This will replace your current local data.';
  if (!confirm(msg)) return;
  _spSyncing = true;
  _ssm.transition('PULLING');
  spSetStatus('syncing', 'Downloading from SharePoint...');
  try {
    const token = await getSpToken();
    if (!token) throw new Error('Could not acquire token');
    const { siteId, listId } = await spResolveSiteAndList(token);
    const remote = await _spFetchRemote(token, siteId, listId);
    if (!remote) {
      showToast('No SHIC data found on SharePoint yet — push first', 'warning');
      spSetStatus('connected', _spLastSync ? 'Last sync: ' + fmtSyncTime(_spLastSync) : 'Connected');
      return;
    }
    const { _ts, _by, _deletedIds: remoteDeleted, ...cleanData } = remote;
    // Merge remote deletion records into local
    if (remoteDeleted) {
      Object.keys(remoteDeleted).forEach(k => {
        if (!_spDeletedIds[k]) _spDeletedIds[k] = {};
        Object.assign(_spDeletedIds[k], remoteDeleted[k]);
      });
      localStorage.setItem('shic_sp_deleted_ids', JSON.stringify(_spDeletedIds));
    }
    _spApplyRemote(cleanData, _ts, _by);

    // ── CRITICAL: Also fetch all sub-lists (Tasks, Projects, etc.) ──
    // The main blob only has settings/business units now — actual data lives in sub-lists.
    let subListReport = '';
    try {
      spSetStatus('syncing', 'Downloading sub-lists from SharePoint...');
      const subListResults = await _spFetchAllSubLists(token);
      const summary = [];
      Object.entries(SHIC_LIST_CONFIG).forEach(([listName, cfg]) => {
        const remoteList = subListResults[cfg.dataKey];
        if (!Array.isArray(remoteList)) return;
        AppState.data[cfg.dataKey] = remoteList;
        if (remoteList.length > 0) summary.push(remoteList.length + ' ' + cfg.name.toLowerCase());
      });
      if (summary.length > 0) subListReport = ' · ' + summary.join(', ');
      AppState.save();
    } catch(e) {
      console.warn('[SP] Sub-list pull during manual Pull failed:', e.message);
    }

    _spLastSync = new Date().toISOString();
    localStorage.setItem('shic_sp_lastsync', _spLastSync);
    spSetStatus('connected', 'Last sync: ' + fmtSyncTime(_spLastSync));
    // Pull succeeded — clear any queued offline changes (remote is now authoritative)
    _spOfflineQueue = false;
    localStorage.removeItem('shic_sp_offlinequeue');
    clearTimeout(_spRetryTimer);
    showToast('Data loaded from SharePoint' + (_by ? ' (by ' + _by + ')' : '') + subListReport + ' ✓', 'success', 5000);
    // Refresh whatever page user is on
    if (typeof _refreshCurrentView === 'function') _refreshCurrentView();
    spUpdateSyncInfo();
    _ssm.transition('SYNCED');
  } catch (e) {
    spSetStatus('error', 'Pull failed: ' + e.message);
    showToast('SharePoint pull failed: ' + e.message, 'error');
    _ssm.transition('ERROR', { error: e.message });
  } finally { _spSyncing = false; }
}

// ── Poll SharePoint every 2 minutes for remote changes ───
// ── Active editing detection (Fix #1: prevents polling from wiping typing) ──
let _activeEditingTs = 0;
let _activeEditingFocus = null;
(function setupEditingDetection() {
  if (window._editingDetectionHooked) return;
  window._editingDetectionHooked = true;
  document.addEventListener('focusin', e => {
    const t = e.target;
    if (!t) return;
    if (['INPUT','TEXTAREA','SELECT'].includes(t.tagName) || t.isContentEditable) {
      _activeEditingTs = Date.now();
      _activeEditingFocus = t;
    }
  }, true);
  document.addEventListener('input', e => {
    const t = e.target;
    if (t && (['INPUT','TEXTAREA','SELECT'].includes(t.tagName) || t.isContentEditable)) {
      _activeEditingTs = Date.now();
    }
  }, true);
  document.addEventListener('focusout', e => {
    _activeEditingFocus = null;
  }, true);
})();

// Returns true if user is actively editing (focused input OR typed within last 60s OR a modal is open)
function _isUserActivelyEditing() {
  if (_activeEditingFocus) return true;
  if (_activeEditingTs && (Date.now() - _activeEditingTs) < 60000) return true;
  // Also block if any modal overlay is open
  if (document.querySelector('.modal-overlay.open')) return true;
  return false;
}


// ── Refresh the currently visible page after remote data updates ──
function _refreshCurrentView() {
  try {
    const cur = AppState.currentPage || 'dashboard';
    const renderFn = {
      'dashboard': typeof renderDashboard === 'function' ? renderDashboard : null,
      'projects': typeof renderProjects === 'function' ? renderProjects : null,
      'tasks': typeof renderTasks === 'function' ? renderTasks : null,
      'actions': typeof renderActions === 'function' ? renderActions : null,
      'risks': typeof renderRisks === 'function' ? renderRisks : null,
      'qaqc': typeof renderQAQC === 'function' ? renderQAQC : null,
      'documents': typeof renderDocuments === 'function' ? renderDocuments : null,
      'dailymeeting': typeof renderDailyMeeting === 'function' ? renderDailyMeeting : null,
      'reports': typeof renderReports === 'function' ? renderReports : null,
      'calendar': typeof renderCalendar === 'function' ? renderCalendar : null,
      'masterlist': typeof renderMlTab === 'function' ? renderMlTab : null,
    }[cur];
    if (renderFn) renderFn();
    if (typeof buildSidebar === 'function') buildSidebar();
    if (typeof updateSyncStatusButton === 'function') updateSyncStatusButton();
  } catch(e) { console.warn('[SP] Refresh view error:', e.message); }
}


// ── Track records currently being edited (per data array) ──
// Prevents background polling from wiping in-progress field edits.
let _editingRecords = {}; // { dataKey: { recordId: { startedAt, originalSnapshot } } }

function markRecordEditing(dataKey, recordId) {
  if (!_editingRecords[dataKey]) _editingRecords[dataKey] = {};
  if (!_editingRecords[dataKey][recordId]) {
    const r = (AppState.data[dataKey]||[]).find(x => x && x.id === recordId);
    _editingRecords[dataKey][recordId] = {
      startedAt: Date.now(),
      originalSnapshot: r ? JSON.parse(JSON.stringify(r)) : null,
    };
  } else {
    _editingRecords[dataKey][recordId].startedAt = Date.now(); // refresh timestamp
  }
}

function unmarkRecordEditing(dataKey, recordId) {
  if (_editingRecords[dataKey]) delete _editingRecords[dataKey][recordId];
}

// Returns set of recordIds currently being edited in this array (within last 15 minutes)
function getEditingRecordIds(dataKey) {
  const m = _editingRecords[dataKey] || {};
  const cutoff = Date.now() - (15 * 60 * 1000); // forget edits older than 15 min
  const ids = new Set();
  Object.entries(m).forEach(([id, info]) => {
    if (info.startedAt > cutoff) ids.add(id);
    else delete m[id];
  });
  return ids;
}

async function _spPollRemote() {
  if (!_spConnected || !_spAccount || _spSyncing) return;
  // Fix #1: skip if user is actively editing — prevents wiping typed text
  if (_isUserActivelyEditing()) {
    console.log('[SP] Poll deferred — user is editing');
    return;
  }
  try {
    const token = await getSpToken();
    if (!token) return;
    const { siteId, listId } = await spResolveSiteAndList(token);
    const remote = await _spFetchRemote(token, siteId, listId);

    // ── SharePoint is reachable ──
    if (!_spAvailable) {
      // SP just came back online
      _spAvailable = true;
      console.log('[SP] SharePoint is back online');
      if (_spOfflineQueue) {
        // We have queued changes — push them now (merge will handle conflicts)
        showToast('SharePoint reconnected — syncing queued changes...', 'info', 3000);
        setTimeout(() => spPushData(true), 1000);
        return; // skip applying remote for now — push will handle merge
      }
    }

    if (!remote || !remote._ts) return;
    const mainBlobIsNewer = remote._ts > _spLastWriteTs;
    const { _ts, _by, ...data } = remote;
    const hash = _spHash(data) + _ts;
    const mainBlobChanged = hash !== _spDataHash;

    // ── CRITICAL: Always pull and SMART-MERGE sub-lists ──
    // Other users may have updated SHIC_Tasks, SHIC_Projects, SHIC_Actions etc.
    // without touching the main blob (since those data arrays live in dedicated lists).
    // Smart merge preserves local _newlyCreated (unsynced) and _deleted (soft-delete) markers.
    let subListsChanged = false;
    try {
      const subListResults = await _spFetchAllSubLists(token);
      Object.entries(SHIC_LIST_CONFIG).forEach(([listName, cfg]) => {
        const remoteList = subListResults[cfg.dataKey];
        if (!Array.isArray(remoteList)) return; // fetch failed or list missing
        const localList = AppState.data[cfg.dataKey] || [];

        const localById = {};
        localList.forEach(r => { if (r && r.id) localById[r.id] = r; });
        const remoteById = {};
        remoteList.forEach(r => { if (r && r.id) remoteById[r.id] = r; });

        const merged = [];
        const seen = new Set();

        // Get IDs of records currently being edited — preserve these
        const editingIds = (typeof getEditingRecordIds === 'function') ? getEditingRecordIds(cfg.dataKey) : new Set();

        // 1. Keep all local records that are NOT to be replaced:
        //    - _newlyCreated (user created locally, not yet pushed)
        //    - _deleted (user soft-deleted locally, not yet propagated)
        //    - currently being edited (active form has changes the user hasn't saved)
        localList.forEach(r => {
          if (!r || !r.id) return;
          if (r._newlyCreated) {
            merged.push(r);
            seen.add(r.id);
            return;
          }
          if (r._deleted) {
            merged.push(r);
            seen.add(r.id);
            return;
          }
          if (editingIds.has(r.id)) {
            // User has this record open in an edit form — preserve their in-progress state
            merged.push(r);
            seen.add(r.id);
            console.log('[SP] Preserved local edit on ' + cfg.dataKey + '/' + r.id);
            return;
          }
        });

        // 2. Add ALL remote records that aren't preserved locally.
        //    For records that exist both locally AND remotely, union any append-only
        //    sub-arrays (updates, comments, attachments) so neither side loses entries.
        remoteList.forEach(r => {
          if (!r || !r.id || seen.has(r.id)) return;
          const local = localById[r.id];
          if (local) {
            // Merge append-only arrays: combine local + remote, dedupe by 'at' timestamp
            const appendArrays = ['updates','comments','attachments','notes'];
            appendArrays.forEach(field => {
              const remArr = Array.isArray(r[field]) ? r[field] : [];
              const locArr = Array.isArray(local[field]) ? local[field] : [];
              if (locArr.length === 0) return; // nothing local to preserve
              // Build a set of remote timestamps to detect missing local entries
              const remoteAts = new Set(remArr.map(u => u && u.at).filter(Boolean));
              const localOnly = locArr.filter(u => u && u.at && !remoteAts.has(u.at));
              if (localOnly.length > 0) {
                // Local has entries the remote doesn't — union and sort by time
                r = Object.assign({}, r, {
                  [field]: [...remArr, ...localOnly].sort((a,b)=>((a&&a.at||'') < (b&&b.at||'') ? -1 : 1))
                });
              }
            });
          }
          merged.push(r);
          seen.add(r.id);
        });

        // 3. Detect if merged differs from current local — if yes, apply
        const currentJSON = JSON.stringify(localList);
        const mergedJSON = JSON.stringify(merged);
        if (currentJSON !== mergedJSON) {
          subListsChanged = true;
          AppState.data[cfg.dataKey] = merged;
          const added = merged.length - localList.filter(r => r && (r._newlyCreated || r._deleted)).length - (localList.length - localList.filter(r => r && (r._newlyCreated || r._deleted)).length);
          console.log('[SP] Sub-list ' + listName + ' merged: local=' + localList.length + ' remote=' + remoteList.length + ' merged=' + merged.length);
        }
      });
    } catch(e) {
      console.warn('[SP] Sub-list pull failed:', e.message);
    }

    // ── Apply changes ──
    if (!mainBlobChanged && !subListsChanged) return; // truly nothing new

    // Save merged sub-lists immediately (they preserved local unsynced + deleted markers)
    if (subListsChanged) {
      AppState.save();
      // Only re-render if the user is not mid-form — prevents wiping typed text
      if (!_isUserActivelyEditing()) _refreshCurrentView();
    }

    // Main blob is more cautious: only apply if user has no local edits
    if (mainBlobChanged && _spHasLocalEdits()) {
      _spPendingRemote = { data, _ts, _by };
      if (_by && _by !== _spAccount?.username)
        showToast('⚠ ' + _by + ' updated SharePoint while you have unsaved changes', 'warning', 5000);
      return;
    }

    if (mainBlobChanged) {
      _spApplyRemote(data, _ts, _by);
    } else if (subListsChanged) {
      // Only sub-lists changed — save + refresh view without touching main blob
      AppState.save();
      _refreshCurrentView();
      if (_by && _by !== _spAccount?.username) {
        showToast('📥 New data from ' + (_by.split('@')[0] || 'team'), 'info', 3000);
      }
    }
  } catch (e) {
    // SharePoint unreachable
    if (_spAvailable) {
      _spAvailable = false;
      _spOfflineQueue = true;
      spSetStatus('error', 'SharePoint unreachable — working locally');
      console.warn('[SP] Poll error — SP marked unavailable:', e.message);
    }
  }
}

// ── Proactive token refresh — refresh 5 min before expiry ──
let _spTokenExpiry = 0;
async function _spRefreshTokenIfNeeded() {
  if (!_spMsalApp || !_spAccount) return;
  const fiveMinFromNow = Date.now() + 5 * 60 * 1000;
  if (_spTokenExpiry > fiveMinFromNow) return; // still fresh
  try {
    if (_spMsalApp.initialize) await _spMsalApp.initialize().catch(()=>{});
    const res = await _spMsalApp.acquireTokenSilent({ scopes: SP_SCOPES, account: _spAccount });
    // Parse expiry from token
    try {
      const payload = JSON.parse(atob(res.accessToken.split('.')[1]));
      _spTokenExpiry = payload.exp * 1000;
    } catch(e) { _spTokenExpiry = Date.now() + 55 * 60 * 1000; } // assume 55min if can't parse
  } catch(e) {
    console.warn('[SP] Proactive token refresh failed:', e.message);
  }
}
// Check token every 10 minutes
setInterval(_spRefreshTokenIfNeeded, 10 * 60 * 1000);

function spStartPolling() {
  if (_spPollingTimer) clearInterval(_spPollingTimer);
  // Use 90s base + 0-60s random jitter per user to stagger 10 concurrent pollers
  // Without jitter: 10 users fire simultaneously → 10 SP requests at same second
  // With jitter: requests spread across 2min window → max 1-2 requests/10s
  const baseInterval = 90000;
  const jitter = Math.floor(Math.random() * 60000);
  const pollInterval = baseInterval + jitter;
  _spPollingTimer = setInterval(() => {
    if (!_isOnline) return;
    _spPollRemote();
  }, pollInterval);
  console.log(`[SP] Polling started — interval: ${Math.round(pollInterval/1000)}s (with jitter)`);
  // First poll after random delay (3-15s) to stagger startup polls
  setTimeout(_spPollRemote, 3000 + Math.floor(Math.random() * 12000));
}

function spStopPolling() {
  if (_spPollingTimer) { clearInterval(_spPollingTimer); _spPollingTimer = null; }
}

// ── Hook AppState.save to auto-sync ──────────────────────
let _spLastSavedHash = ''; // track actual data changes to avoid idle-timer storms
let _spPrevData = null;    // previous data snapshot for deletion detection

// ── Detect and record deletions by comparing snapshots ───
function _spDetectDeletions(prevData, newData) {
  if (!prevData || !_spConnected) return;
  const ARRAY_KEYS = ['projects','tasks','resources','equipment','tools','vehicles',
    'consumables','materials','manpower','procurement','resourceAllocations',
    'costs','qaqc','risks','actions','documents','thirdParties','thirdParty'];
  ARRAY_KEYS.forEach(key => {
    const prev = prevData[key] || [];
    const next = newData[key] || [];
    if (prev.length <= next.length) return; // no deletions
    // Skip tracking during cascade (ID rename, not deletion)
    if (window._suppressDeletionTracking) return;
    const nextIds = new Set(next.map(r => r.id));
    prev.forEach(r => {
      if (r.id && !nextIds.has(r.id)) {
        _spTrackDeletion(key, r.id);
      }
    });
  });
}
const _origSaveForSp = AppState.save.bind(AppState);
AppState.save = function () {
  _origSaveForSp();
  if (!_spConnected || !_spAccount) return;

  // Only trigger sync if data actually changed (prevents 30s auto-save storms)
  const currentHash = _spHash(AppState.data);
  if (currentHash === _spLastSavedHash) return; // no real change
  // Detect and record any deletions before updating hash
  _spDetectDeletions(_spPrevData, AppState.data);
  _spPrevData = JSON.parse(JSON.stringify(AppState.data)); // snapshot for next comparison
  _spLastSavedHash = currentHash;

  // Mark that we have unsaved changes regardless of availability
  _spOfflineQueue = true;
  localStorage.setItem('shic_sp_offlinequeue', '1');
  if (typeof _pendingEdits !== 'undefined') _pendingEdits = true;
  if (!_spAutoSync || _spSyncing) return;
  if (!_spAvailable || !_isOnline) {
    spSetStatus('error', 'Offline — changes queued locally');
    clearTimeout(_spRetryTimer);
    _spRetryTimer = setTimeout(_spRetryPush, 5000);
    return;
  }
  // Add per-user jitter (0-5s) to spread out pushes from concurrent users
  const jitter = Math.floor(Math.random() * 5000);
  clearTimeout(_spSyncTimer);
  _spSyncTimer = setTimeout(() => spPushData(true), 3000 + jitter);
};

// ── UI helpers ────────────────────────────────────────────
function spSetStatus(state, msg) {
  const el = $('#spStatusMsg'); if (!el) return;
  const colors = { connecting: 'var(--accent-amber)', connected: 'var(--accent-green)', syncing: 'var(--accent-blue)', error: 'var(--accent-red)', idle: 'var(--text-muted)' };
  const icons  = { connecting: 'fa-spinner fa-spin', connected: 'fa-check-circle', syncing: 'fa-sync fa-spin', error: 'fa-exclamation-triangle', idle: 'fa-circle' };
  el.innerHTML = `<i class="fas ${icons[state]||'fa-circle'}" style="margin-right:5px;color:${colors[state]||'var(--text-muted)'}"></i><span style="color:${colors[state]||'var(--text-secondary)'}">${msg}</span>`;
}

function spUpdateSyncInfo() {
  const el = $('#spSyncInfo'); if (!el) return;
  el.textContent = _spLastSync ? 'Last synced: ' + fmtSyncTime(_spLastSync) : 'Never synced';
}

function spSaveSettings() {
  const cid = ($('#spClientId') || {}).value || '';
  const tid = ($('#spTenantId') || {}).value || '';
  const url = ($('#spSiteUrl') || {}).value || '';
  const lst = ($('#spListName') || {}).value || 'SHIC_AppData';
  if (!cid) { showToast('Client ID is required', 'error'); return; }
  if (!url) { showToast('SharePoint Site URL is required', 'error'); return; }
  _spClientId = cid.trim(); _spTenantId = (tid || 'common').trim();
  _spSiteUrl = url.trim().replace(/\/$/, ''); _spListName = lst.trim() || 'SHIC_AppData';
  localStorage.setItem('shic_sp_clientid', _spClientId);
  localStorage.setItem('shic_sp_tenantid', _spTenantId);
  localStorage.setItem('shic_sp_siteurl', _spSiteUrl);
  localStorage.setItem('shic_sp_listname', _spListName);
  // Reset cached IDs when settings change
  _spSiteId = ''; _spListId = ''; _spItemId = '';
  localStorage.removeItem('shic_sp_siteid'); localStorage.removeItem('shic_sp_listid'); localStorage.removeItem('shic_sp_itemid');
  _spMsalApp = null;
  showToast('SharePoint settings saved — click Connect', 'success');
  renderSettings();
}

function spAutoSyncToggle(val) {
  _spAutoSync = val;
  localStorage.setItem('shic_sp_autosync', val ? 'true' : 'false');
  showToast('SharePoint auto-sync ' + (val ? 'enabled' : 'disabled'), 'info');
}

// ── Render SharePoint settings panel HTML ─────────────────
function renderSpPanel() {
  return `
  <div class="card" style="margin-bottom:16px;border:1px solid rgba(0,114,198,.3)">
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px;flex-wrap:wrap;gap:10px">
      <div style="display:flex;align-items:center;gap:12px">
        <div style="width:40px;height:40px;background:linear-gradient(135deg,#0078d4,#004e8c);border-radius:10px;display:flex;align-items:center;justify-content:center;flex-shrink:0">
          <i class="fab fa-microsoft" style="color:#fff;font-size:18px"></i>
        </div>
        <div>
          <div style="font-size:15px;font-weight:700">SharePoint / Microsoft 365 Sync</div>
          <div style="font-size:11px;color:var(--text-secondary)">Store &amp; sync data using your M365 Business Basic SharePoint</div>
        </div>
      </div>
      <div style="display:flex;align-items:center;gap:8px">
        <div style="font-size:12px;display:flex;align-items:center">
          ${_spConnected
            ? `<i class="fas fa-circle" style="color:var(--accent-green);font-size:8px;margin-right:6px"></i><span style="color:var(--accent-green);font-weight:600">Connected as ${_spAccount?.username||''}</span>`
            : `<i class="fas fa-circle" style="color:var(--text-muted);font-size:8px;margin-right:6px"></i><span style="color:var(--text-muted)">Not connected</span>`}
        </div>
        ${_spConnected ? `<button class="btn btn-danger btn-sm" onclick="disconnectSharePoint()"><i class="fas fa-unlink"></i> Disconnect</button>` : ''}
      </div>
    </div>

    ${_spConnected ? `
    <!-- Connected state -->
    <div style="padding:12px;background:rgba(0,120,212,.08);border-radius:8px;border-left:3px solid #0078d4;margin-bottom:14px">
      <div style="font-size:12px;font-weight:600;margin-bottom:8px"><i class="fas fa-database" style="color:#0078d4;margin-right:6px"></i>SharePoint List: <span style="font-family:var(--font-mono);color:#0078d4">${_spListName}</span></div>
      <div style="font-size:11px;color:var(--text-secondary)">Site: <span style="font-family:var(--font-mono)">${_spSiteUrl}</span></div>
      ${_spItemId ? `<div style="font-size:10px;color:var(--text-muted);margin-top:4px">Item ID: <span style="font-family:var(--font-mono)">${_spItemId}</span></div>` : ''}
    </div>
    <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:14px">
      <button class="btn btn-primary" onclick="spPushData()"><i class="fas fa-cloud-upload-alt"></i> Push My Changes</button>
      <button class="btn btn-secondary" onclick="spPullData()"><i class="fas fa-cloud-download-alt"></i> Pull Latest</button>
      <button class="btn btn-secondary" onclick="_spPollRemote().then(()=>showToast('Checked for updates','info',2000))"><i class="fas fa-sync"></i> Check Now</button>
      <button class="btn btn-secondary" onclick="showSpListWizard()" style="background:rgba(188,140,255,.12);border-color:rgba(188,140,255,.4);color:#bc8cff"><i class="fas fa-magic"></i> List Setup Wizard</button>
      <div style="display:flex;align-items:center;gap:8px;margin-left:auto">
        <span style="font-size:11px;color:var(--text-secondary)">Auto-sync:</span>
        <label class="toggle"><input type="checkbox" ${_spAutoSync ? 'checked' : ''} onchange="spAutoSyncToggle(this.checked)"><span class="toggle-slider"></span></label>
      </div>
    </div>
    <div style="padding:8px 12px;background:rgba(63,185,80,.08);border-radius:6px;font-size:11px;margin-bottom:10px;border-left:3px solid var(--accent-green)">
      <i class="fas fa-shield-alt" style="color:var(--accent-green);margin-right:6px"></i>
      <strong>Conflict-safe sync enabled</strong> — changes from multiple users are merged automatically. Remote changes are checked every 2 minutes.
    </div>
    <div id="spStatusMsg" style="font-size:11px;margin-bottom:6px"></div>
    <div id="spSyncInfo" style="font-size:10px;color:var(--text-muted)">${_spLastSync ? 'Last synced: ' + fmtSyncTime(_spLastSync) : 'Never synced'}</div>
    ` : `
    <!-- Setup state -->
    <div style="padding:14px;background:rgba(0,120,212,.06);border-radius:8px;border-left:3px solid #0078d4;margin-bottom:14px">
      <div style="font-size:13px;font-weight:600;margin-bottom:10px"><i class="fas fa-tools" style="color:#0078d4;margin-right:7px"></i>Setup — Azure App Registration (One-time)</div>
      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-bottom:14px">
        <div style="padding:12px;background:var(--bg-hover);border-radius:8px">
          <div style="width:24px;height:24px;border-radius:50%;background:#0078d4;color:#fff;font-size:12px;font-weight:700;display:flex;align-items:center;justify-content:center;margin-bottom:8px">1</div>
          <div style="font-size:12px;font-weight:600;margin-bottom:5px">Register Azure App</div>
          <div style="font-size:10px;color:var(--text-secondary);line-height:1.8">
            1. Go to <a href="#" onclick="window.open('https://portal.azure.com/#blade/Microsoft_AAD_RegisteredApps/ApplicationsListBlade');return false" style="color:#0078d4">portal.azure.com</a><br>
            2. <strong>App registrations → New registration</strong><br>
            3. Name: <em>SHIC App</em>, Account type: <em>Accounts in this org only</em><br>
            4. Redirect URI: <code style="background:var(--bg-primary);padding:1px 4px;border-radius:3px;font-size:9px">Single-page app (SPA)</code> → this page URL<br>
            5. Click <strong>Register</strong> — copy the <strong>Application (client) ID</strong>
          </div>
        </div>
        <div style="padding:12px;background:var(--bg-hover);border-radius:8px">
          <div style="width:24px;height:24px;border-radius:50%;background:#0078d4;color:#fff;font-size:12px;font-weight:700;display:flex;align-items:center;justify-content:center;margin-bottom:8px">2</div>
          <div style="font-size:12px;font-weight:600;margin-bottom:5px">Add API Permissions</div>
          <div style="font-size:10px;color:var(--text-secondary);line-height:1.8">
            1. In your app → <strong>API permissions → Add a permission</strong><br>
            2. Choose <strong>Microsoft Graph → Delegated</strong><br>
            3. Add: <code style="background:var(--bg-primary);padding:1px 4px;border-radius:3px;font-size:9px">Sites.ReadWrite.All</code> and <code style="background:var(--bg-primary);padding:1px 4px;border-radius:3px;font-size:9px">User.Read</code><br>
            4. Click <strong>Grant admin consent</strong> (requires admin)<br>
            5. Status should show green ✔ Granted
          </div>
        </div>
        <div style="padding:12px;background:var(--bg-hover);border-radius:8px">
          <div style="width:24px;height:24px;border-radius:50%;background:#0078d4;color:#fff;font-size:12px;font-weight:700;display:flex;align-items:center;justify-content:center;margin-bottom:8px">3</div>
          <div style="font-size:12px;font-weight:600;margin-bottom:5px">Get Your SharePoint URL</div>
          <div style="font-size:10px;color:var(--text-secondary);line-height:1.8">
            1. Open <a href="#" onclick="window.open('https://'+(_spSiteUrl?new URL(_spSiteUrl).hostname:'yourtenant.sharepoint.com'));return false" style="color:#0078d4">SharePoint</a> in your M365<br>
            2. Navigate to the site you want to use<br>
            3. Copy the URL, e.g.: <code style="background:var(--bg-primary);padding:1px 4px;border-radius:3px;font-size:9px">https://contoso.sharepoint.com/sites/projects</code><br>
            4. A new List called <em>SHIC_AppData</em> will be auto-created<br>
            5. No manual list setup needed — app handles it
          </div>
        </div>
      </div>
      <div class="form-grid" style="margin-bottom:10px">
        <div class="form-group">
          <label class="form-label">Application (Client) ID *</label>
          <input class="form-input" id="spClientId" value="${_spClientId}" placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx">
        </div>
        <div class="form-group">
          <label class="form-label">Tenant ID <span style="color:var(--text-muted)">(leave blank to allow all Microsoft 365 users)</span></label>
          <input class="form-input" id="spTenantId" value="${_spTenantId === 'common' ? '' : _spTenantId}" placeholder="Leave blank for multi-domain access">
          <div style="font-size:10px;color:var(--accent-amber);margin-top:3px"><i class="fas fa-info-circle"></i> Filling this in restricts login to your org only. Leave blank for users from other domains.</div>
        </div>
        <div class="form-group" style="grid-column:1/-1">
          <label class="form-label">SharePoint Site URL *</label>
          <input class="form-input" id="spSiteUrl" value="${_spSiteUrl}" placeholder="https://yourcompany.sharepoint.com/sites/yoursite">
        </div>
        <div class="form-group">
          <label class="form-label">List Name <span style="color:var(--text-muted)">(auto-created if missing)</span></label>
          <input class="form-input" id="spListName" value="${_spListName}" placeholder="SHIC_AppData">
        </div>
      </div>
      <div style="display:flex;gap:8px">
        <button class="btn btn-secondary" onclick="spSaveSettings()"><i class="fas fa-save"></i> Save Settings</button>
        <button class="btn btn-primary" style="background:linear-gradient(135deg,#0078d4,#004e8c)" onclick="spSaveSettings();connectSharePoint()"><i class="fab fa-microsoft"></i> Save &amp; Connect</button>
      </div>
    </div>
    <div id="spStatusMsg" style="font-size:11px;margin-top:6px"></div>
    `}

    <div style="margin-top:10px;padding:8px 12px;background:var(--bg-hover);border-radius:6px;font-size:10px;color:var(--text-muted)">
      <i class="fas fa-info-circle" style="margin-right:5px;color:#0078d4"></i>
      Data is stored as a single JSON blob in a SharePoint List item. Works on <strong>M365 Business Basic</strong> and above. 
      All data stays within your Microsoft 365 tenant. 
    </div>
  </div>`;
}

// ── spAutoInit: called AFTER login, not at page load ─────
// LOCAL-FIRST: never overwrite richer local data with empty/stale SharePoint data
async function spAutoInit() {
  if (!_spClientId || !_spSiteUrl) return;
  if (!initSpMSAL() || !_spAccount) return;

  _spConnected = true;
  if (!_spAutoSync) {
    _spAutoSync = true;
    localStorage.setItem('shic_sp_autosync', 'true');
  }
  console.log('[SP] Auto-connected as', _spAccount.username);

  // ── CRITICAL: reload from localStorage/backup BEFORE any SharePoint pull ──
  const localCount = _restoreLocalData();
  console.log('[SP] Auto-init local records:', localCount);

  const hadQueuedChanges = _spHasLocalEdits();
  _pendingEdits = false;
  _spLastSavedHash = _spHash(AppState.data);

  await new Promise(r => setTimeout(r, 800));

  try {
    // Push queued changes from prior session first
    if (hadQueuedChanges) {
      console.log('[SP] Auto-init: pushing queued changes');
      await spPushData(true);
    }

    const token = await getSpToken();
    if (!token) { spStartPolling(); return; }
    const { siteId, listId } = await spResolveSiteAndList(token);
    const remote = await _spFetchRemote(token, siteId, listId);

    if (!remote || !remote._ts) {
      if (localCount > 0) {
        await spPushData(true);
        showToast('Local data pushed to SharePoint (SharePoint was empty)', 'info', 4000);
      } else {
        spSetStatus('connected', 'SharePoint empty — add data in the app');
      }
      spStartPolling();
      return;
    }

    const { _ts, _by, _deletedIds: rd, ...remoteData } = remote;
    if (rd) {
      Object.keys(rd).forEach(k => {
        if (!_spDeletedIds[k]) _spDeletedIds[k] = {};
        Object.assign(_spDeletedIds[k], rd[k]);
      });
      localStorage.setItem('shic_sp_deleted_ids', JSON.stringify(_spDeletedIds));
    }

    const remoteCount = _dataRecordCount(remoteData);
    console.log('[SP] Auto-init: local=' + localCount + ', remote=' + remoteCount);

    if (localCount >= remoteCount) {
      // Local is equal or richer — keep local, ensure SP is updated
      _spDataHash = _spHash(remoteData) + _ts;
      if (localCount > remoteCount) {
        await spPushData(true);
        showToast('Local data pushed to SharePoint (' + localCount + ' records)', 'info', 3000);
      } else {
        spSetStatus('connected', 'Connected — data is current');
      }
    } else {
      // Remote has more records — merge (never full replace)
      const merged = Object.assign({}, remoteData);
      SHIC_DATA_ARRAY_KEYS.forEach(key => {
        merged[key] = _spMergeArrays(
          AppState.data[key] || [],
          remoteData[key] || [],
          true, // preserve local field edits
          key
        );
      });
      merged.settings = Object.assign({}, remoteData.settings || {}, AppState.data.settings || {});
      _spLastWriteTs = _ts;
      localStorage.setItem('shic_sp_lastwritets', String(_spLastWriteTs));
      _spDataHash = _spHash(remoteData) + _ts;
      AppState.data = Object.assign(getDefaultData(), merged);
      if (typeof migrateData === 'function') migrateData();
      AppState.save();
      _spOfflineQueue = false;
      localStorage.removeItem('shic_sp_offlinequeue');
      setTimeout(() => {
        try { renderPage(AppState.currentPage || 'dashboard'); } catch(e) {}
        try { buildSidebar(); } catch(e) {}
      }, 400);
      const totalMerged = _dataRecordCount(merged);
      spSetStatus('connected', 'Synced with SharePoint (' + totalMerged + ' records)');
      if (_by) showToast('Merged SharePoint data — ' + totalMerged + ' total records', 'info', 3000);
    }
  } catch(e) {
    console.warn('[SP] Auto-init sync failed:', e.message);
    spSetStatus('connected', 'Connected — using local data (sync failed)');
    showToast('SharePoint sync failed — your local data is safe', 'warning', 4000);
  }

  spStartPolling();
}
// NOTE: spAutoInit() is called from handleAuthStateChange after login

// ── AUTH SYSTEM ──────────────────────────────────────────
// auth vars declared at top
// (declared at top)

function getAdminEmails(){
  try{return JSON.parse(localStorage.getItem(ADMIN_EMAILS_KEY)||'[]');}catch{return[];}
}
function isAdminEmail(email){
  const admins=getAdminEmails();
  return admins.includes((email||'').toLowerCase());
}

// ── UI helpers ────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════
// ── M365 / MICROSOFT 365 AUTHENTICATION ENGINE ────────────
// ═══════════════════════════════════════════════════════════

// ── Initialize MSAL for auth (uses same clientId as SP sync) ──
function initM365AuthMsal() {
  const clientId = _spClientId || localStorage.getItem('shic_sp_clientid') || '';
  if (!clientId) return null;
  if (_m365AuthMsal) return _m365AuthMsal;
  try {
    const authority = _spTenantId && _spTenantId !== 'common'
      ? 'https://login.microsoftonline.com/' + _spTenantId
      : 'https://login.microsoftonline.com/organizations';
    _m365AuthMsal = new msal.PublicClientApplication({
      auth: {
        clientId,
        authority,
        redirectUri: window.location.href.split('#')[0].split('?')[0],
      },
      cache: { cacheLocation: 'localStorage', storeAuthStateInCookie: false },
    });
    if (_m365AuthMsal.initialize) _m365AuthMsal.initialize().catch(()=>{});
    return _m365AuthMsal;
  } catch(e) { console.error('[M365 Auth] MSAL init error:', e); return null; }
}

// ── Get auth token for Graph API ────────────────────────────
async function getM365AuthToken() {
  const msalApp = initM365AuthMsal();
  if (!msalApp || !_m365Account) return null;
  try {
    if (msalApp.initialize) await msalApp.initialize().catch(()=>{});
    const res = await msalApp.acquireTokenSilent({ scopes: M365_AUTH_SCOPES, account: _m365Account });
    return res.accessToken;
  } catch(e) {
    try {
      if (msalApp.initialize) await msalApp.initialize().catch(()=>{});
      const res = await msalApp.acquireTokenPopup({ scopes: M365_AUTH_SCOPES, account: _m365Account });
      return res.accessToken;
    } catch(e2) { return null; }
  }
}

// ── Ensure SHIC_Users list exists in SharePoint ─────────────
async function ensureUsersListExists(token, siteId) {
  // Try to find the list
  const listRes = await fetch(
    `https://graph.microsoft.com/v1.0/sites/${siteId}/lists?$top=100`,
    { headers: { Authorization: 'Bearer ' + token } }
  );
  const listData = await listRes.json();
  const found = (listData.value||[]).find(l => l.displayName === SHIC_USERS_LIST || l.name === SHIC_USERS_LIST);
  if (found) return found.id;
  // Create the list
  const createRes = await fetch(
    `https://graph.microsoft.com/v1.0/sites/${siteId}/lists`,
    {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        displayName: SHIC_USERS_LIST,
        list: { template: 'genericList' },
        columns: [
          { name: 'UserEmail', text: {} },
          { name: 'UserUID', text: {} },
          { name: 'Status', text: {} },
          { name: 'IsAdmin', text: {} },
          { name: 'Role', text: {} },
          { name: 'Department', text: {} },
          { name: 'RegisteredAt', dateTime: {} },
          { name: 'ApprovedBy', text: {} },
          { name: 'LastLogin', dateTime: {} },
        ]
      })
    }
  );
  if (!createRes.ok && createRes.status !== 409) {
    const err = await createRes.json().catch(()=>({}));
    // List creation failed — likely permissions issue
    // Show helpful error message instead of crashing login
    const errMsg = err.error?.message || createRes.status;
    if (String(errMsg).toLowerCase().includes('access') || createRes.status === 403) {
      throw new Error(
        'The SHIC_Users list does not exist and could not be created automatically (Access Denied).\n\n' +
        'Please create it manually in SharePoint:\n' +
        '1. Go to your SharePoint site\n' +
        '2. Click New → List\n' +
        '3. Name it: SHIC_Users\n' +
        '4. Add columns: UserEmail, UserUID, Status, IsAdmin, Role, Department, RegisteredAt, ApprovedBy, LastLogin\n\n' +
        'Then try signing in again.'
      );
    }
    throw new Error('Could not create SHIC_Users list: ' + errMsg);
  }
  if (createRes.status === 409) {
    // Already exists — fetch again
    const retry = await fetch(`https://graph.microsoft.com/v1.0/sites/${siteId}/lists?$top=100`, { headers: { Authorization: 'Bearer ' + token } });
    const retryData = await retry.json();
    const retryFound = (retryData.value||[]).find(l => l.displayName === SHIC_USERS_LIST);
    return retryFound?.id;
  }
  const created = await createRes.json();
  return created.id;
}

// ── Get user profile from SharePoint ────────────────────────
async function m365GetUserProfile(token, siteId, email) {
  const { listId } = await _getOrCreateUsersListId(token, siteId);
  const res = await fetch(
    `https://graph.microsoft.com/v1.0/sites/${siteId}/lists/${listId}/items?$expand=fields&$top=999`,
    { headers: { Authorization: 'Bearer ' + token } }
  );
  if (!res.ok) return null;
  const data = await res.json();
  return (data.value||[]).find(i => (i.fields?.UserEmail||'').toLowerCase() === email.toLowerCase()) || null;
}

// ── Save/update user profile in SharePoint ───────────────────
async function m365SaveUserProfile(token, siteId, profile, itemId) {
  const { listId } = await _getOrCreateUsersListId(token, siteId);
  const body = JSON.stringify({
    fields: {
      Title: profile.name || profile.email,
      UserEmail: profile.email,
      UserUID: profile.uid,
      Status: profile.status,
      IsAdmin: String(profile.isAdmin || false),
      Role: profile.role || 'User',
      Department: profile.department || '',
      RegisteredAt: profile.registeredAt || new Date().toISOString(),
      ApprovedBy: profile.approvedBy || '',
      LastLogin: new Date().toISOString(),
    }
  });

  // Helper: silent fetch with one auto-retry on transient errors (504, 503, 429)
  const _silentFetch = async (url, options, isLastLoginOnly) => {
    try {
      const res = await fetch(url, options);
      if (!res.ok && [502, 503, 504, 429].includes(res.status)) {
        // Transient — wait then retry once
        await new Promise(r => setTimeout(r, 1500));
        const retry = await fetch(url, options);
        if (!retry.ok && isLastLoginOnly) {
          // Non-critical: this is just a LastLogin timestamp update
          console.log('[Profile] LastLogin update skipped (SP returned ' + retry.status + ') — non-critical');
        }
        return retry;
      }
      return res;
    } catch(e) {
      if (isLastLoginOnly) {
        console.log('[Profile] LastLogin update skipped (' + e.message + ') — non-critical');
        return { ok: false };
      }
      throw e;
    }
  };

  if (itemId) {
    // Updating an existing profile (mostly just LastLogin) — make this resilient + silent
    await _silentFetch(
      `https://graph.microsoft.com/v1.0/sites/${siteId}/lists/${listId}/items/${itemId}`,
      { method: 'PATCH', headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' }, body },
      true // isLastLoginOnly — failures are non-critical
    );
  } else {
    // Creating a new profile — this matters, retry but surface failure
    const res = await _silentFetch(
      `https://graph.microsoft.com/v1.0/sites/${siteId}/lists/${listId}/items`,
      { method: 'POST', headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' }, body },
      false
    );
    return res.ok ? (await res.json()).id : null;
  }
}

let _usersListId = null;
async function _getOrCreateUsersListId(token, siteId) {
  if (!_usersListId) {
    _usersListId = await ensureUsersListExists(token, siteId);
  }
  return { listId: _usersListId };
}

// ── Get all users (for admin panel) ────────────────────────
async function m365GetAllUsers() {
  try {
    const token = await getM365AuthToken();
    if (!token) return [];
    const { siteId } = await spResolveSiteAndList(token);
    const { listId } = await _getOrCreateUsersListId(token, siteId);
    const res = await fetch(
      `https://graph.microsoft.com/v1.0/sites/${siteId}/lists/${listId}/items?$expand=fields&$top=999`,
      { headers: { Authorization: 'Bearer ' + token } }
    );
    if (!res.ok) return [];
    const data = await res.json();
    return (data.value||[]).map(i => ({
      uid: i.fields?.UserUID || i.id,
      itemId: i.id,
      name: i.fields?.Title || i.fields?.UserEmail || '',
      email: i.fields?.UserEmail || '',
      status: i.fields?.Status || 'pending',
      isAdmin: i.fields?.IsAdmin === 'true',
      role: i.fields?.Role || 'User',
      department: i.fields?.Department || '',
      registeredAt: i.fields?.RegisteredAt || '',
      approvedBy: i.fields?.ApprovedBy || '',
      lastLogin: i.fields?.LastLogin || '',
    }));
  } catch(e) { console.error('[M365 Auth] getAllUsers error:', e); return []; }
}

// ── Approve/Reject user (admin action) ─────────────────────
async function m365ApproveUser(uid, approve) {
  try {
    const token = await getM365AuthToken();
    if (!token) { showToast('Could not get auth token', 'error'); return; }
    const { siteId } = await spResolveSiteAndList(token);
    const { listId } = await _getOrCreateUsersListId(token, siteId);
    const res = await fetch(
      `https://graph.microsoft.com/v1.0/sites/${siteId}/lists/${listId}/items?$expand=fields&$top=999`,
      { headers: { Authorization: 'Bearer ' + token } }
    );
    const data = await res.json();
    const item = (data.value||[]).find(i => i.fields?.UserUID === uid);
    if (!item) { showToast('User not found', 'error'); return; }
    const adminName = _currentUserProfile?.name || _m365Account?.name || 'Admin';
    await fetch(
      `https://graph.microsoft.com/v1.0/sites/${siteId}/lists/${listId}/items/${item.id}`,
      {
        method: 'PATCH',
        headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
        body: JSON.stringify({ fields: {
          Status: approve ? 'approved' : 'rejected',
          IsAdmin: item.fields?.IsAdmin || 'false',
          ApprovedBy: approve ? adminName : '',
        }})
      }
    );
    showToast((approve ? 'User approved' : 'User rejected') + ' successfully', approve ? 'success' : 'warning');
    renderSettings();
  } catch(e) { showToast('Action failed: ' + e.message, 'error'); }
}

// ── Set admin status ────────────────────────────────────────
async function m365SetAdmin(uid, isAdmin) {
  try {
    const token = await getM365AuthToken();
    if (!token) return;
    const { siteId } = await spResolveSiteAndList(token);
    const { listId } = await _getOrCreateUsersListId(token, siteId);
    const res = await fetch(
      `https://graph.microsoft.com/v1.0/sites/${siteId}/lists/${listId}/items?$expand=fields&$top=999`,
      { headers: { Authorization: 'Bearer ' + token } }
    );
    const data = await res.json();
    const item = (data.value||[]).find(i => i.fields?.UserUID === uid);
    if (!item) return;
    await fetch(
      `https://graph.microsoft.com/v1.0/sites/${siteId}/lists/${listId}/items/${item.id}`,
      { method: 'PATCH', headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
        body: JSON.stringify({ fields: { IsAdmin: String(isAdmin) }}) }
    );
    showToast('Admin status updated', 'success');
    renderSettings();
  } catch(e) { showToast('Failed: ' + e.message, 'error'); }
}

// ── Audit Log SP CRUD ────────────────────────────────────────
const SHIC_AUDIT_LIST = 'SHIC_AuditLog';
// _auditListId declared at top of file (line ~690)
let _auditQueue = []; // buffer entries while SP not ready
let _auditFlushing = false;

async function _getOrCreateAuditListId(token, siteId) {
  if (_auditListId) return _auditListId;
  try {
    const res = await fetch(`https://graph.microsoft.com/v1.0/sites/${siteId}/lists?$filter=displayName eq '${SHIC_AUDIT_LIST}'&$select=id`, { headers: { Authorization: 'Bearer ' + token } });
    const data = await res.json();
    if (data.value?.length) { _auditListId = data.value[0].id; return _auditListId; }
    // Create list
    const cr = await fetch(`https://graph.microsoft.com/v1.0/sites/${siteId}/lists`, {
      method: 'POST', headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
      body: JSON.stringify({ displayName: SHIC_AUDIT_LIST, list: { template: 'genericList' } })
    });
    const created = await cr.json();
    _auditListId = created.id;
    // Add columns: Action, Entity, EntityId, Module, UserEmail, Before, After
    const cols = ['Action','Entity','EntityId','Module','UserEmail'];
    for (const col of cols) {
      await fetch(`https://graph.microsoft.com/v1.0/sites/${siteId}/lists/${_auditListId}/columns`, {
        method: 'POST', headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: col, text: { allowMultipleLines: false } })
      });
    }
    for (const col of ['Before','After','Notes']) {
      await fetch(`https://graph.microsoft.com/v1.0/sites/${siteId}/lists/${_auditListId}/columns`, {
        method: 'POST', headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: col, text: { allowMultipleLines: true } })
      });
    }
    return _auditListId;
  } catch(e) { console.warn('[Audit] List init failed:', e.message); return null; }
}

async function _flushAuditQueue() {
  if (_auditFlushing || !_auditQueue.length) return;
  _auditFlushing = true;
  try {
    const token = await getM365AuthToken();
    const siteId = await getSharePointSiteId(token);
    const listId = await _getOrCreateAuditListId(token, siteId);
    if (!listId) { _auditFlushing = false; return; }
    while (_auditQueue.length) {
      const entry = _auditQueue.shift();
      try {
        await fetch(`https://graph.microsoft.com/v1.0/sites/${siteId}/lists/${listId}/items`, {
          method: 'POST', headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
          body: JSON.stringify({ fields: {
            Title: entry.ts,
            Action: entry.action,
            Entity: entry.entity,
            EntityId: String(entry.entityId||'').slice(0,255),
            Module: entry.module||'',
            UserEmail: entry.userEmail||'',
            Before: entry.before ? JSON.stringify(entry.before).slice(0,5000) : '',
            After: entry.after ? JSON.stringify(entry.after).slice(0,5000) : '',
            Notes: entry.notes||'',
          }})
        });
      } catch(e) { console.warn('[Audit] Write failed:', e.message); }
    }
  } catch(e) { console.warn('[Audit] Flush failed:', e.message); }
  finally { _auditFlushing = false; }
}

// Public function — call this everywhere you want to log
function auditLog(action, module, entity, entityId, before, after, notes) {
  const entry = {
    ts: new Date().toISOString(),
    action, // 'CREATE' | 'UPDATE' | 'DELETE'
    module, // 'Warehouse' | 'Procurement' | 'Projects' etc
    entity, // 'StockTransaction' | 'WarehouseItem' | 'IssuanceRequest' etc
    entityId: entityId||'',
    userEmail: AppState.currentUser?.email || _currentUser?.email || '',
    before: before||null,
    after: after||null,
    notes: notes||'',
  };
  _auditQueue.push(entry);
  // Flush async — don't block the UI
  if (_spConnected) setTimeout(_flushAuditQueue, 500);
}

// Audit Log viewer for admin panel
async function showAuditLog() {
  $('#genericModalTitle').textContent = 'Audit Log';
  $('#genericModalBody').innerHTML = `<div style="text-align:center;padding:20px"><i class="fas fa-spinner fa-spin"></i> Loading...</div>`;
  $('#genericModalFooter').innerHTML = `<button class="btn btn-secondary" onclick="closeModal('genericModal')">Close</button>`;
  openModal('genericModal');
  try {
    const token = await getM365AuthToken();
    const siteId = await getSharePointSiteId(token);
    const listId = await _getOrCreateAuditListId(token, siteId);
    if (!listId) { $('#genericModalBody').innerHTML = `<div class="empty-state">Audit log list not available</div>`; return; }
    const res = await fetch(`https://graph.microsoft.com/v1.0/sites/${siteId}/lists/${listId}/items?$expand=fields&$orderby=fields/Title desc&$top=100`, { headers: { Authorization: 'Bearer ' + token } });
    const data = await res.json();
    const items = data.value||[];
    if (!items.length) { $('#genericModalBody').innerHTML = `<div class="empty-state"><i class="fas fa-clipboard-list"></i><p>No audit records yet</p></div>`; return; }
    const rows = items.map(i => {
      const f = i.fields||{};
      const ts = f.Title ? new Date(f.Title).toLocaleString() : '—';
      const actionColor = f.Action==='DELETE'?'var(--accent-red)':f.Action==='CREATE'?'var(--accent-green)':'var(--accent-amber)';
      return `<tr>
        <td style="font-size:10px;color:var(--text-secondary);white-space:nowrap">${ts}</td>
        <td><span style="font-size:10px;font-weight:700;color:${actionColor};background:${actionColor}22;padding:1px 6px;border-radius:4px">${f.Action||'—'}</span></td>
        <td style="font-size:11px">${f.Module||'—'}</td>
        <td style="font-size:11px">${f.Entity||'—'}</td>
        <td style="font-size:10px;font-family:var(--font-mono);color:var(--text-secondary)">${(f.EntityId||'').slice(0,20)}</td>
        <td style="font-size:11px">${f.UserEmail||'—'}</td>
      </tr>`;
    }).join('');
    $('#genericModalBody').innerHTML = `
      <div style="max-height:500px;overflow-y:auto">
      <table><thead><tr><th>TIME</th><th>ACTION</th><th>MODULE</th><th>ENTITY</th><th>ID</th><th>USER</th></tr></thead>
      <tbody>${rows}</tbody></table></div>`;
  } catch(e) { $('#genericModalBody').innerHTML = `<div class="empty-state">Failed to load audit log: ${e.message}</div>`; }
}

// ── Form Templates SP CRUD ──────────────────────────────────
let _formsListId = null;
async function _getOrCreateFormsListId(token, siteId) {
  if (_formsListId) return _formsListId;
  const res = await fetch(`https://graph.microsoft.com/v1.0/sites/${siteId}/lists?$top=100`, { headers: { Authorization: 'Bearer ' + token } });
  const data = await res.json();
  const found = (data.value||[]).find(l => l.displayName === SHIC_FORMS_LIST);
  if (found) { _formsListId = found.id; return _formsListId; }
  const createRes = await fetch(`https://graph.microsoft.com/v1.0/sites/${siteId}/lists`, {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      displayName: SHIC_FORMS_LIST,
      list: { template: 'genericList' },
      columns: [
        { name: 'FormId', text: {} },
        { name: 'FormName', text: {} },
        { name: 'CompanyName', text: {} },
        { name: 'CompanySub', text: {} },
        { name: 'DocControlNo', text: {} },
        { name: 'RevisionNo', text: {} },
        { name: 'EffectiveDate', text: {} },
        { name: 'LogoDataUrl', text: { allowMultipleLines: true, textType: 'plain' } },
      ]
    })
  });
  if (createRes.ok || createRes.status === 409) {
    const retry = await fetch(`https://graph.microsoft.com/v1.0/sites/${siteId}/lists?$top=100`, { headers: { Authorization: 'Bearer ' + token } });
    const retryData = await retry.json();
    _formsListId = (retryData.value||[]).find(l => l.displayName === SHIC_FORMS_LIST)?.id;
    return _formsListId;
  }
  throw new Error('Could not create form templates list');
}

async function spGetFormTemplates() {
  try {
    const token = await getM365AuthToken();
    if (!token) return null;
    const { siteId } = await spResolveSiteAndList(token);
    const listId = await _getOrCreateFormsListId(token, siteId);
    const res = await fetch(`https://graph.microsoft.com/v1.0/sites/${siteId}/lists/${listId}/items?$expand=fields&$top=999`, { headers: { Authorization: 'Bearer ' + token } });
    if (!res.ok) return null;
    const data = await res.json();
    return (data.value||[]).map(i => ({
      _spId: i.id,
      id: i.fields?.FormId || i.id,
      name: i.fields?.FormName || '',
      companyName: i.fields?.CompanyName || '',
      companySub: i.fields?.CompanySub || '',
      docControlNo: i.fields?.DocControlNo || '',
      revisionNo: i.fields?.RevisionNo || '',
      effectiveDate: i.fields?.EffectiveDate || '',
      logoDataUrl: i.fields?.LogoDataUrl || '',
    }));
  } catch(e) { console.warn('[Forms] Load failed:', e.message); return null; }
}

async function spSaveFormTemplate(form) {
  try {
    const token = await getM365AuthToken();
    const { siteId } = await spResolveSiteAndList(token);
    const listId = await _getOrCreateFormsListId(token, siteId);
    const fields = {
      Title: form.name,
      FormId: form.id,
      FormName: form.name,
      CompanyName: form.companyName,
      CompanySub: form.companySub,
      DocControlNo: form.docControlNo,
      RevisionNo: form.revisionNo,
      EffectiveDate: form.effectiveDate,
      LogoDataUrl: form.logoDataUrl || '',
    };
    if (form._spId) {
      await fetch(`https://graph.microsoft.com/v1.0/sites/${siteId}/lists/${listId}/items/${form._spId}`, {
        method: 'PATCH', headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
        body: JSON.stringify({ fields })
      });
    } else {
      const res = await fetch(`https://graph.microsoft.com/v1.0/sites/${siteId}/lists/${listId}/items`, {
        method: 'POST', headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
        body: JSON.stringify({ fields })
      });
      if (res.ok) { const d = await res.json(); form._spId = d.id; }
    }
  } catch(e) { console.warn('[Forms] Save failed:', e.message); throw e; }
}

async function spDeleteFormTemplate(spId) {
  try {
    const token = await getM365AuthToken();
    const { siteId } = await spResolveSiteAndList(token);
    const listId = await _getOrCreateFormsListId(token, siteId);
    await fetch(`https://graph.microsoft.com/v1.0/sites/${siteId}/lists/${listId}/items/${spId}`, {
      method: 'DELETE', headers: { Authorization: 'Bearer ' + token }
    });
  } catch(e) { console.warn('[Forms] Delete failed:', e.message); throw e; }
}

// ── Main M365 Login function ────────────────────────────────
