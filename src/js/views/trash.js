function renderTrash() {
  const arrays = [
    { k: 'projects', label: 'Projects', icon: 'fa-briefcase' },
    { k: 'tasks', label: 'Tasks', icon: 'fa-tasks' },
    { k: 'actions', label: 'Action Items', icon: 'fa-bolt' },
    { k: 'risks', label: 'Risks', icon: 'fa-shield-halved' },
    { k: 'qaqc', label: 'QA/QC', icon: 'fa-clipboard-check' },
    { k: 'costs', label: 'Costs', icon: 'fa-money-bill' },
    { k: 'documents', label: 'Documents', icon: 'fa-file' },
    { k: 'libraryDocs', label: 'Library Docs', icon: 'fa-book' },
    { k: 'procurement', label: 'Procurement', icon: 'fa-cart-shopping' },
    { k: 'materials', label: 'Materials', icon: 'fa-cubes' },
    { k: 'equipment', label: 'Equipment', icon: 'fa-cogs' },
    { k: 'tools', label: 'Tools', icon: 'fa-wrench' },
    { k: 'vehicles', label: 'Vehicles', icon: 'fa-truck' },
    { k: 'consumables', label: 'Consumables', icon: 'fa-box' },
    { k: 'thirdParty', label: 'Third Party', icon: 'fa-handshake' },
    { k: 'manpower', label: 'Manpower', icon: 'fa-users' },
    { k: 'resourceAllocations', label: 'Allocations', icon: 'fa-share-nodes' },
    { k: 'dailyMeetingLogs', label: 'Daily Logs', icon: 'fa-clipboard' },
  ];
  // Count per type
  const counts = arrays.map(a => ({ ...a, count: getTrashed(a.k).length }));
  const totalTrashed = counts.reduce((s, x) => s + x.count, 0);

  $('#trash').innerHTML = `
    <div class="section-header" style="margin-bottom:14px">
      <div>
        <div class="section-title"><i class="fas fa-trash" style="color:var(--accent-amber);margin-right:8px"></i>Trash</div>
        <div class="section-sub">Deleted records · auto-purged after ${SOFT_DELETE_RETENTION_DAYS} days · ${totalTrashed} item${totalTrashed!==1?'s':''}</div>
      </div>
      <div style="display:flex;gap:7px;flex-wrap:wrap">
        ${totalTrashed > 0 ? `<button class="btn btn-danger btn-sm" onclick="purgeAllTrash()"><i class="fas fa-skull"></i> Purge All</button>` : ''}
      </div>
    </div>
    ${totalTrashed === 0 ? `
      <div class="empty-state" style="padding:40px">
        <i class="fas fa-trash" style="font-size:48px;opacity:.3"></i>
        <p style="margin-top:10px;font-size:14px;color:var(--text-muted)">Trash is empty</p>
        <p style="font-size:11px;color:var(--text-muted)">Deleted records appear here and can be restored within ${SOFT_DELETE_RETENTION_DAYS} days</p>
      </div>` : `
      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:12px">
        ${counts.filter(c => c.count > 0).map(c => `
          <div class="card" style="padding:12px;cursor:pointer" onclick="showTrashFor('${c.k}','${c.label}')">
            <div style="display:flex;align-items:center;gap:10px">
              <div style="width:36px;height:36px;background:rgba(248,81,73,.15);border-radius:8px;display:flex;align-items:center;justify-content:center">
                <i class="fas ${c.icon}" style="color:var(--accent-red);font-size:14px"></i>
              </div>
              <div style="flex:1">
                <div style="font-size:13px;font-weight:600">${c.label}</div>
                <div style="font-size:11px;color:var(--text-muted)">${c.count} deleted</div>
              </div>
              <i class="fas fa-chevron-right" style="color:var(--text-muted);font-size:11px"></i>
            </div>
          </div>
        `).join('')}
      </div>`}
  `;
}

function showTrashFor(arrayKey, label) {
  let items = getTrashed(arrayKey);
  if (typeof isAdminUser === 'function' && !isAdminUser()) {
    const me = (_currentUserProfile?.email||_currentUserProfile?.name||'').toLowerCase();
    items = items.filter(r => (r._deletedBy||'').toLowerCase().includes(me));
  }
  items.sort((a,b) => (b._deletedAt||'').localeCompare(a._deletedAt||''));
  window._trashKey = arrayKey; window._trashLabel = label;
  const isAdm = typeof isAdminUser === 'function' && isAdminUser();
  $('#genericModalTitle').textContent = 'Trash · ' + label;
  $('#genericModalBody').innerHTML = `
    ${items.length > 1 ? `<div style="display:flex;align-items:center;gap:8px;margin-bottom:10px;padding:8px 10px;background:var(--bg-hover);border-radius:7px">
      <input type="checkbox" id="trashSelectAll" onchange="_trashToggleAll(this.checked)" style="width:15px;height:15px;cursor:pointer">
      <label for="trashSelectAll" style="font-size:12px;cursor:pointer;flex:1">Select All (${items.length})</label>
      <button class="btn btn-success btn-sm" onclick="_trashBatchRestore()" style="display:none" id="trashBatchRestoreBtn"><i class="fas fa-undo"></i> Restore Selected</button>
      ${isAdm?`<button class="btn btn-danger btn-sm" onclick="_trashBatchPurge()" style="display:none" id="trashBatchPurgeBtn"><i class="fas fa-skull"></i> Purge Selected</button>`:''}
    </div>` : ''}
    <div style="max-height:55vh;overflow-y:auto" id="trashItemsList">
      ${items.length === 0 ? '<div class="empty-state">No items</div>' :
      items.map(r => {
        const daysOld = Math.floor((Date.now() - new Date(r._deletedAt||0).getTime()) / (24*60*60*1000));
        const daysLeft = SOFT_DELETE_RETENTION_DAYS - daysOld;
        const name = r.name || r.description || r.title || r.id || '(unnamed)';
        return `<div style="padding:10px 12px;border:1px solid var(--border);border-radius:7px;margin-bottom:6px;display:flex;align-items:center;gap:10px">
          <input type="checkbox" class="trash-chk" data-id="${r.id}" onchange="_trashChkChange()" style="width:15px;height:15px;cursor:pointer;flex-shrink:0">
          <div style="flex:1;min-width:0">
            <div style="font-family:var(--font-mono);font-size:10px;color:var(--accent-blue)">${r.id||'-'}</div>
            <div style="font-size:12px;font-weight:600;line-height:1.3;margin-top:2px">${name}</div>
            <div style="font-size:10px;color:var(--text-muted);margin-top:3px">
              Deleted by ${r._deletedBy||'unknown'} · ${daysOld} day${daysOld!==1?'s':''} ago
              ${daysLeft <= 7 ? `<span style="color:var(--accent-amber);font-weight:600;margin-left:5px">⚠ ${daysLeft}d left</span>` : ''}
            </div>
          </div>
          <button class="btn btn-success btn-sm" onclick="_restoreItem('${arrayKey}','${r.id}','${label.replace(/'/g,"&#39;")}')"><i class="fas fa-undo"></i></button>
          ${isAdm?`<button class="btn btn-danger btn-sm btn-icon" onclick="_purgeItem('${arrayKey}','${r.id}','${label.replace(/'/g,"&#39;")}')" title="Permanently delete"><i class="fas fa-times"></i></button>`:''}
        </div>`;
      }).join('')}
    </div>
  `;
  $('#genericModalFooter').innerHTML = `<button class="btn btn-secondary" onclick="closeModal('genericModal')">Close</button>`;
  openModal('genericModal');
}

function _trashToggleAll(checked){
  document.querySelectorAll('.trash-chk').forEach(c=>c.checked=checked);
  _trashChkChange();
}

function _trashChkChange(){
  const selected=document.querySelectorAll('.trash-chk:checked').length;
  const rb=$('#trashBatchRestoreBtn'),pb=$('#trashBatchPurgeBtn');
  if(rb)rb.style.display=selected>0?'':'none';
  if(pb)pb.style.display=selected>0?'':'none';
  if(rb)rb.innerHTML=`<i class="fas fa-undo"></i> Restore (${selected})`;
  if(pb)pb.innerHTML=`<i class="fas fa-skull"></i> Purge (${selected})`;
}

function _trashBatchRestore(){
  const ids=[...document.querySelectorAll('.trash-chk:checked')].map(c=>c.dataset.id);
  if(!ids.length)return;
  let count=0;
  ids.forEach(id=>{if(restoreFromTrash(window._trashKey,id))count++;});
  AppState.save();
  showToast(`Restored ${count} item${count!==1?'s':''}`, 'success');
  closeModal('genericModal');
  if(AppState.currentPage==='trash')renderTrash();
}

function _trashBatchPurge(){
  if(typeof isAdminUser==='function'&&!isAdminUser()){showToast('Admins only','warning');return;}
  const ids=[...document.querySelectorAll('.trash-chk:checked')].map(c=>c.dataset.id);
  if(!ids.length)return;
  if(!confirm(`Permanently delete ${ids.length} item${ids.length!==1?'s':''}?\n\nThis CANNOT be undone.`))return;
  let count=0;
  ids.forEach(id=>{if(purgeFromTrash(window._trashKey,id)){count++;_auditPurge(window._trashKey,id,'');}});
  AppState.save();
  showToast(`Purged ${count} item${count!==1?'s':''}`, 'warning');
  showTrashFor(window._trashKey, window._trashLabel);
}

function _restoreItem(arrayKey, id, label) {
  if (restoreFromTrash(arrayKey, id)) {
    AppState.save();
    showToast('Restored from trash', 'success');
    closeModal('genericModal');
    if (typeof renderTrash === 'function' && AppState.currentPage === 'trash') renderTrash();
  }
}

// Write an immutable audit entry for every permanent purge (who/what/when)
function _auditPurge(arrayKey, id, label) {
  try {
    if (typeof spWriteAuditLog === 'function')
      spWriteAuditLog('purge', arrayKey, id, label || id, { by: _currentUserProfile?.name || _currentUserProfile?.email || 'unknown', at: new Date().toISOString() });
  } catch(e) {}
}

function _purgeItem(arrayKey, id, label) {
  if (typeof isAdminUser === 'function' && !isAdminUser()) {
    showToast('Only admins can permanently delete records', 'warning', 4000);
    return;
  }
  if (!confirm('Permanently delete this ' + label + '?\n\nThis CANNOT be undone.')) return;
  if (purgeFromTrash(arrayKey, id)) {
    _auditPurge(arrayKey, id, label);
    AppState.save();
    showToast('Permanently deleted', 'warning');
    showTrashFor(arrayKey, label); // refresh
  }
}

function purgeAllTrash() {
  if (typeof isAdminUser === 'function' && !isAdminUser()) {
    showToast('Only admins can permanently delete records', 'warning', 4000);
    return;
  }
  const arrays = ['projects','tasks','costs','qaqc','risks','actions','documents','libraryDocs',
    'resourceAllocations','resourceUsageLogs','dailyMeetingLogs','procurement','procurementLogs',
    'materials','manpower','equipment','tools','vehicles','consumables','thirdParty',
    'assetHistory','assetUtilization'];
  // Build a per-type breakdown so the admin sees exactly what will be destroyed
  const breakdown = arrays
    .map(k => ({ k, n: (AppState.data[k]||[]).filter(r => r && r._deleted && !r._purged).length }))
    .filter(x => x.n > 0);
  if (!breakdown.length) { showToast('Trash is empty', 'info'); return; }
  const summary = breakdown.map(x => `  ${x.k}: ${x.n}`).join('\n');
  if (!confirm('Permanently delete ALL items in trash?\n\n' + summary + '\n\nThis CANNOT be undone.')) return;
  let purged = 0;
  const now = new Date().toISOString();
  arrays.forEach(k => {
    if (!AppState.data[k]) return;
    AppState.data[k].forEach(r => {
      if (!r || !r._deleted || r._purged) return;
      r._purged = true; r._purgedAt = now; purged++;
      _auditPurge(k, r.id, r.description || r.name || r.title || r.id);
    });
  });
  AppState.save();
  showToast('Purged ' + purged + ' item(s)', 'warning', 4000);
  renderTrash();
}


// ═══════════════════════════════════════════════════════════
// ── PRIORITY 2 & 3 FIXES ──────────────────────────────────
// ═══════════════════════════════════════════════════════════

// ─────────────────────────────────────────────────────────
// FIX #10: UPDATE AVAILABLE BANNER
// Detects newer service worker version, shows reload prompt
// ─────────────────────────────────────────────────────────
(function setupUpdateBanner() {
  if (!('serviceWorker' in navigator)) return;
  navigator.serviceWorker.ready.then(reg => {
    reg.addEventListener('updatefound', () => {
      const newSW = reg.installing;
      if (!newSW) return;
      newSW.addEventListener('statechange', () => {
        if (newSW.state === 'installed' && navigator.serviceWorker.controller) {
          // A new version is waiting
          showUpdateAvailableBanner(newSW);
        }
      });
    });
  });
})();

function showUpdateAvailableBanner(newSW) {
  // Don't show if already visible
  if (document.getElementById('updateAvailableBanner')) return;
  const banner = document.createElement('div');
  banner.id = 'updateAvailableBanner';
  banner.style.cssText = 'position:fixed;bottom:20px;left:50%;transform:translateX(-50%);background:linear-gradient(135deg,#388bfd,#1f6feb);color:#fff;padding:14px 20px;border-radius:12px;box-shadow:0 8px 28px rgba(0,0,0,.4);display:flex;align-items:center;gap:14px;z-index:9999;font-size:13px;font-weight:600;animation:slideUp .3s ease-out;max-width:90vw';
  banner.innerHTML = `
    <i class="fas fa-sync-alt" style="font-size:18px"></i>
    <div>
      <div style="font-weight:700">New version available</div>
      <div style="font-size:11px;opacity:.9;font-weight:400">Click reload to get the latest fixes and features</div>
    </div>
    <button onclick="document.getElementById('updateAvailableBanner').remove()" style="background:rgba(255,255,255,.2);border:none;color:#fff;padding:6px 10px;border-radius:6px;cursor:pointer;font-size:11px">Later</button>
    <button onclick="_applyUpdateAndReload()" style="background:#fff;border:none;color:#1f6feb;padding:8px 16px;border-radius:6px;cursor:pointer;font-weight:700;font-size:12px"><i class="fas fa-sync" style="margin-right:5px"></i>Reload</button>
  `;
  document.body.appendChild(banner);
  window._pendingSW = newSW;
}

function _applyUpdateAndReload() {
  if (window._pendingSW) {
    window._pendingSW.postMessage('skipWaiting');
  }
  setTimeout(() => location.reload(), 300);
}

// ─────────────────────────────────────────────────────────
// FIX #16: PARTIAL SYNC FAILURE DETECTION
// Tracks per-list success/fail, shows amber on partial failures
// ─────────────────────────────────────────────────────────
let _spListSyncStatus = {}; // { listName: { lastSuccess: ts, lastError: msg, failedAt: ts } }

function _markListSyncSuccess(listName) {
  _spListSyncStatus[listName] = { lastSuccess: Date.now(), lastError: null, failedAt: null };
}

function _markListSyncFail(listName, errMsg) {
  if (!_spListSyncStatus[listName]) _spListSyncStatus[listName] = {};
  _spListSyncStatus[listName].lastError = errMsg;
  _spListSyncStatus[listName].failedAt = Date.now();
}

function _hasPartialSyncFailure() {
  const cutoff = Date.now() - (10 * 60 * 1000); // last 10 min
  return Object.values(_spListSyncStatus).some(s => s.failedAt && s.failedAt > cutoff && (!s.lastSuccess || s.lastSuccess < s.failedAt));
}

function _getFailedLists() {
  const cutoff = Date.now() - (10 * 60 * 1000);
  return Object.entries(_spListSyncStatus)
    .filter(([n, s]) => s.failedAt && s.failedAt > cutoff && (!s.lastSuccess || s.lastSuccess < s.failedAt))
    .map(([n, s]) => ({ list: n, error: s.lastError, failedAt: s.failedAt }));
}

// ─────────────────────────────────────────────────────────
// FIX #7: ORPHANED FILE CLEANUP
// Tracks pending file uploads; warns if records didn't sync
// ─────────────────────────────────────────────────────────
let _pendingFileUploads = JSON.parse(localStorage.getItem('shic_pending_uploads') || '[]');

function _trackFileUpload(spDriveId, spItemId, recordRef) {
  _pendingFileUploads.push({
    spDriveId, spItemId, recordRef,
    uploadedAt: Date.now(),
  });
  localStorage.setItem('shic_pending_uploads', JSON.stringify(_pendingFileUploads));
}

function _confirmFileUpload(spItemId) {
  _pendingFileUploads = _pendingFileUploads.filter(p => p.spItemId !== spItemId);
  localStorage.setItem('shic_pending_uploads', JSON.stringify(_pendingFileUploads));
}

async function _checkForOrphanedFiles() {
  // Files uploaded more than 30 min ago without successful record push
  const orphans = _pendingFileUploads.filter(p => (Date.now() - p.uploadedAt) > (30 * 60 * 1000));
  if (orphans.length === 0) return [];
  // Could ping admins or show in admin panel; for now log
  console.warn('[Sync] ' + orphans.length + ' file(s) may be orphaned in SharePoint:', orphans);
  return orphans;
}

// ─────────────────────────────────────────────────────────
// FIX #1b: AUTO-SAVE DRAFTS TO LOCALSTORAGE EVERY 30s
// Captures in-progress textarea/input values for crash recovery
// ─────────────────────────────────────────────────────────
let _draftAutoSaveTimer = null;

function _captureFormDrafts() {
  const inputs = document.querySelectorAll('input[id], textarea[id], select[id]');
  const drafts = {};
  inputs.forEach(el => {
    if (!el.id || !el.value || el.type === 'password' || el.type === 'file') return;
    if (el.closest('.modal-overlay.active') || el.closest('.page.active')) {
      drafts[el.id] = el.value;
    }
  });
  if (Object.keys(drafts).length > 0) {
    localStorage.setItem('shic_form_drafts', JSON.stringify({ drafts, savedAt: Date.now() }));
  }
}

function _restoreFormDrafts() {
  try {
    const stored = JSON.parse(localStorage.getItem('shic_form_drafts') || '{}');
    if (!stored.drafts) return;
    const age = Date.now() - (stored.savedAt || 0);
    if (age > 60 * 60 * 1000) {
      // Drafts older than 1 hour are too stale — discard
      localStorage.removeItem('shic_form_drafts');
      return;
    }
    // Wait a moment then offer recovery if there's stuff
    setTimeout(() => {
      const recoverable = Object.entries(stored.drafts).filter(([id, val]) => {
        const el = document.getElementById(id);
        return el && !el.value && val;
      });
      if (recoverable.length > 0) {
        if (confirm('Found ' + recoverable.length + ' unsaved form field(s) from your last session. Restore them?')) {
          recoverable.forEach(([id, val]) => {
            const el = document.getElementById(id);
            if (el) el.value = val;
          });
          showToast('Restored ' + recoverable.length + ' field(s) from auto-save', 'success', 4000);
        }
        localStorage.removeItem('shic_form_drafts');
      }
    }, 2000);
  } catch (e) {}
}

// Start auto-save when there are open modals
function _startDraftAutoSave() {
  if (_draftAutoSaveTimer) return;
  _draftAutoSaveTimer = setInterval(() => {
    try {
      const hasActiveModal = document.querySelector('.modal-overlay.active');
      if (hasActiveModal) _captureFormDrafts();
    } catch(e) {}
  }, 30000);
}
_startDraftAutoSave();

// Clear drafts after successful save
function _clearFormDrafts() {
  localStorage.removeItem('shic_form_drafts');
}

// ─────────────────────────────────────────────────────────
// FIX #2b: EXTEND CONFLICT DETECTION TO MORE FORMS
// Adds snapshot helpers for Risk, Action, QA-QC, Cost, Task, Document edit
// ─────────────────────────────────────────────────────────
function _genericSnapshotForEdit(modalKey, dataKey, id) {
  if (!id) return;
  const record = (AppState.data[dataKey] || []).find(r => r && r.id === id);
  if (record) _snapshotRecord(modalKey, record);
}

async function _genericCheckConflict(modalKey, dataKey, id) {
  if (!id) return true;
  return await _checkConflictBeforeSave(modalKey, id, dataKey);
}

// ─────────────────────────────────────────────────────────
// FIX #16b: ENHANCE SYNC INDICATOR FOR PARTIAL FAILURE
// Update sync status button to amber when partial failure
// ─────────────────────────────────────────────────────────
(function enhanceSyncStatus() {
  if (typeof updateSyncStatusButton !== 'function') return;
  const origUpdate = updateSyncStatusButton;
  window.updateSyncStatusButton = function() {
    try { origUpdate(); } catch(e) {}
    // Override to amber if partial failure detected
    if (_hasPartialSyncFailure() && _syncState === 'synced') {
      const btn = document.getElementById('syncStatusBtn');
      const dot = document.getElementById('syncStatusDot');
      const label = document.getElementById('syncStatusLabel');
      if (btn && dot && label) {
        btn.style.background = 'rgba(240,164,80,.15)';
        btn.style.borderColor = 'rgba(240,164,80,.5)';
        btn.style.color = '#f0a450';
        dot.style.background = '#f0a450';
        const failed = _getFailedLists();
        label.textContent = failed.length + ' list' + (failed.length !== 1 ? 's' : '') + ' failed';
        btn.title = 'Partial sync failure: ' + failed.map(f => f.list).join(', ') + ' · Click to retry';
      }
    }
  };
})();

// ─────────────────────────────────────────────────────────
// FIX #15b: BULK OPERATION PRE-FLIGHT CHECK
// Confirms before allowing >5 deletes at once
// ─────────────────────────────────────────────────────────
function preFlightBulkDelete(arrayKey, ids, label) {
  const count = ids.length;
  if (count <= 5) return true;
  return confirm(
    '⚠ BULK DELETE WARNING\n\n' +
    'You are about to delete ' + count + ' ' + label + ' record(s).\n\n' +
    'They will be moved to Trash and recoverable for ' + SOFT_DELETE_RETENTION_DAYS + ' days.\n\n' +
    'Are you sure you want to proceed?'
  );
}

// Restore drafts when app first loads
setTimeout(() => { try { _restoreFormDrafts(); } catch(e) {} }, 3000);

// logAssetHistoryAuto kept for compatibility but no longer called automatically
function logAssetHistoryAuto(assetId,assetName,assetType,action,field,oldVal,newVal,projectId){
  // Reserved — history is now driven from Asset History tab, not tracking edits
}

function exportHistoryCSV(){
  exportCSV((AppState.data.assetHistory||[]).map(h=>[h.id,h.date,h.assetId,h.assetName,h.assetType,h.action,h.detail,h.beforeValue||'',h.afterValue||'',h.projectId||'',h.performedBy]),
  ['ID','Date','Asset ID','Asset Name','Asset Type','Action','Detail','Before','After','Project','Performed By'],'asset_history.csv');
}


// ── EXPORTS ───────────────────────────────────────────────
function exportMasterlistCSV(){
  // Master export: one row per asset, all types. For type-specific re-import, use each tab's Export button.
  const d=AppState.data;
  const rows=[['ID','Name','AssetType','Category','Make','Model','SerialNo','Status','ProjectID','Location','DailyRate','NextMaint','NextCal','CertExpiry','Notes']];
  const pushAsset=(arr,type)=>(arr||[]).forEach(r=>rows.push([r.id,r.name,type,r.category||r.dept||'',r.make||'',r.model||'',r.serialNo||r.regNo||'',r.status||r.availability||'',r.projectId||'N/A',r.location||r.dept||'',r.dailyRate||Math.round((r.hourlyRate||0)*8)||0,r.nextMaint||'N/A',r.nextCal||'N/A',r.certExpiry||r.accreditationExpiry||'N/A',r.notes||'']));
  pushAsset(d.resources,'Personnel');pushAsset(d.equipment,'Equipment');pushAsset(d.tools,'Tool');pushAsset(d.vehicles,'Vehicle');
  (d.consumables||[]).forEach(c=>rows.push([c.id,c.name,'Consumable',c.category||'','','',c.unit,c.qtyOnHand<=c.minStock?'low-stock':'in-stock',c.projectId||'N/A','Store',c.unitCost||0,'N/A','N/A','N/A',c.notes||'']));
  (d.materials||[]).forEach(m=>rows.push([m.id,m.name,'Material','Materials','','',m.unit,m.status,m.projectId||'','Warehouse',m.unitCost||0,'N/A','N/A','N/A',m.critical?'Critical':'']));
  (d.thirdParty||[]).forEach(t=>rows.push([t.id,t.name,'Third Party',t.category||'',t.contactPerson||'','',t.contactNo||'',t.status,t.projectId||'N/A','External',Math.round((t.monthlyRate||0)/30),'N/A',t.accreditationExpiry||'N/A',t.accreditationExpiry||'N/A',t.service||'']));
  exportCSV(rows.slice(1),rows[0],'asset_masterlist_'+new Date().toISOString().split('T')[0]+'.csv');
  showToast('Full masterlist exported — '+( rows.length-1)+' assets','success');
}

function exportMlCSV(type){
  const d=AppState.data;
  const cfg={
    // Headers match importExcel fieldMap keys exactly so export→reimport works perfectly
    equipment:[[d.equipment||[]],
      ['ID','Name','Category','Make','Model','SerialNo','Status','ProjectID','Location','LastMaint','NextMaint','MainInterval','LastCal','NextCal','CalBody','Certification','CertBody','CertExpiry','DailyRate','Notes'],
      r=>[r.id,r.name,r.category||'',r.make||'',r.model||'',r.serialNo||'',r.status||'available',r.projectId||'N/A',r.location||'',r.lastMaint||'N/A',r.nextMaint||'N/A',r.maintInterval||'N/A',r.lastCal||'N/A',r.nextCal||'N/A',r.calBody||'N/A',r.cert||'N/A',r.certBody||'N/A',r.certExpiry||'N/A',r.dailyRate||0,r.notes||'']],
    tools:[[d.tools||[]],
      ['ID','Name','Category','Make','Model','SerialNo','Status','ProjectID','Location','LastCal','NextCal','CalBody','Certification','CertExpiry','DailyRate','Notes'],
      r=>[r.id,r.name,r.category||'',r.make||'',r.model||'',r.serialNo||'',r.status||'available',r.projectId||'N/A',r.location||'',r.lastCal||'N/A',r.nextCal||'N/A',r.calBody||'N/A',r.cert||'N/A',r.certExpiry||'N/A',r.dailyRate||0,r.notes||'']],
    vehicles:[[d.vehicles||[]],
      ['ID','Name','Category','Make','Model','RegNo','Status','ProjectID','Location','LastMaint','NextMaint','MaintInterval','Certification','CertBody','CertExpiry','DailyRate','Notes'],
      r=>[r.id,r.name,r.category||'',r.make||'',r.model||'',r.regNo||'',r.status||'available',r.projectId||'N/A',r.location||'',r.lastMaint||'N/A',r.nextMaint||'N/A',r.maintInterval||'N/A',r.cert||'N/A',r.certBody||'N/A',r.certExpiry||'N/A',r.dailyRate||0,r.notes||'']],
    consumables:[[d.consumables||[]],
      ['ID','Name','Category','Unit','QtyOnHand','MinStock','ReorderQty','UnitCost','ProjectID','Supplier','Notes'],
      c=>[c.id,c.name,c.category||'',c.unit||'',c.qtyOnHand||0,c.minStock||0,c.reorderQty||0,c.unitCost||0,c.projectId||'N/A',c.supplier||'',c.notes||'']],
    materials:[[d.materials||[]],
      ['ID','Name','ProjectID','Qty','Unit','UnitCost','Supplier','DeliveryDate','Status','Critical'],
      m=>[m.id,m.name,m.projectId||'',m.qty||0,m.unit||'',m.unitCost||0,m.supplier||'',m.deliveryDate||'',m.status||'pending',m.critical?'Yes':'No']],
    thirdparty:[[d.thirdParty||[]],
      ['ID','Name','Category','Service','ContactPerson','ContactNo','ProjectID','ContractStart','ContractEnd','MonthlyRate','Accreditation','AccreditationExpiry','Status','Notes'],
      t=>[t.id,t.name,t.category||'',t.service||'',t.contactPerson||'',t.contactNo||'',t.projectId||'N/A',t.contractStart||'',t.contractEnd||'',t.monthlyRate||0,t.accreditation||'N/A',t.accreditationExpiry||'N/A',t.status||'active',t.notes||'']],
    personnel:[[d.resources||[]],
      ['ID','Name','Role','Department','HourlyRate','Utilization','Availability','Skills','Certifications','Notes'],
      r=>[r.id,r.name,r.role||'',r.dept||'',(r.hourlyRate||0),r.utilization||0,r.availability||'available',(r.skills||[]).join('; '),(r.certifications||[]).join('; '),r.notes||'']],
  };
  if(!cfg[type])return;
  const [arrWrap,headers,mapper]=cfg[type];
  exportCSV(arrWrap[0].map(mapper),headers,`${type}_register.csv`);
}

window.addEventListener('load',init);

// Push pending edits on page unload (browser close, tab close, navigation)
window.addEventListener('beforeunload', function(e){
  // Always persist to localStorage on close
  try {
    AppState.save();
  } catch (e2) {}
  // ── SP: flush pending changes using keepalive fetch (survives tab close) ──
  if (_spConnected && _spAccount && _spOfflineQueue && !_spSyncing) {
    try {
      getSpToken().then(token => {
        if (!token) return;
        return spResolveSiteAndList(token).then(({ siteId, listId }) => {
          const body = JSON.stringify({ fields: {
            Title: 'SHIC_Main', DataKey: 'main',
            DataBlob: JSON.stringify({ ...AppState.data, _ts: Date.now(), _by: _spAccount.username }),
            UpdatedBy: _spAccount.username, UpdatedAt: new Date().toISOString(),
          }});
          const url = _spItemId
            ? `https://graph.microsoft.com/v1.0/sites/${siteId}/lists/${listId}/items/${_spItemId}`
            : `https://graph.microsoft.com/v1.0/sites/${siteId}/lists/${listId}/items`;
          return fetch(url, {
            method: _spItemId ? 'PATCH' : 'POST',
            headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
            body, keepalive: true
          });
        });
      }).then(() => {
        _spOfflineQueue = false;
        localStorage.removeItem('shic_sp_offlinequeue');
      }).catch(() => {});
    } catch(e2) {}
    // Show warning dialog so user knows to wait a moment
    const spMsg = 'You have unsaved changes not yet synced to SharePoint. Please wait a moment before closing.';
    e.preventDefault(); e.returnValue = spMsg; return spMsg;
  }
  if(_pendingEdits && !(_spConnected&&_spAccount)){
    const msg = 'You have unsaved changes that may not be synced yet.';
    e.preventDefault(); e.returnValue = msg; return msg;
  }
});

// Push when tab is hidden (switching apps, minimizing) — beforeunload alone is unreliable
document.addEventListener('visibilitychange', function() {
  if (document.visibilityState !== 'hidden') return;
  try {
    AppState.save();
  } catch (e) {}
  if (_spConnected && _spAccount && _spHasLocalEdits() && !_spSyncing) {
    clearTimeout(_spSyncTimer);
    spPushData(true).catch(() => {});
  }
});
