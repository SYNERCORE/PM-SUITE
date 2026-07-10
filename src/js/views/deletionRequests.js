// Active tab state for deletion requests view
let _delReqTab = 'pending';

function renderDeletionRequests(tab) {
  if (tab) _delReqTab = tab;
  const isAdmin = isAdminUser();
  const all = AppState.data.deletionRequests || [];
  const myRequests = all.filter(r => r.requestedByEmail === (_currentUserProfile?.email||''));
  const pending = all.filter(r => r.status === 'pending');
  const pendingCount = isAdmin ? pending.length : myRequests.filter(r=>r.status==='pending').length;

  // Filter by active tab
  const allSource = isAdmin ? all : myRequests;
  const reqs = _delReqTab === 'history'
    ? allSource.filter(r => r.status !== 'pending')
    : allSource.filter(r => r.status === 'pending');

  reqs.sort((a,b) => (b.requestedAt||'').localeCompare(a.requestedAt||''));

  // Collect edit audit trail from all data arrays (records with _updatedBy set)
  const editAudit = [];
  if (isAdmin && _delReqTab === 'history') {
    const arrays = ['projects','tasks','resources','equipment','tools','vehicles',
      'consumables','materials','thirdParty','risks','actions','procurements'];
    arrays.forEach(key => {
      (AppState.data[key]||[]).forEach(r => {
        if (r._updatedBy && r._updatedAt) {
          editAudit.push({
            id: r.id, name: r.name||r.title||r.id,
            arrayKey: key, updatedBy: r._updatedBy, updatedAt: r._updatedAt,
          });
        }
      });
    });
    editAudit.sort((a,b)=>(b.updatedAt||'').localeCompare(a.updatedAt||''));
  }

  const tabStyle = (t) => `style="padding:6px 14px;border-radius:6px;font-size:12px;font-weight:600;cursor:pointer;border:none;${_delReqTab===t?'background:var(--accent-amber);color:#000':'background:var(--bg-hover);color:var(--text-secondary)'}"`;

  $('#deletionRequests').innerHTML = `
    <div class="section-header" style="margin-bottom:14px">
      <div>
        <div class="section-title"><i class="fas fa-clipboard-check" style="color:var(--accent-amber);margin-right:8px"></i>Deletion Requests</div>
        <div class="section-sub">${isAdmin ? 'All requests' : 'Your requests'} · ${pendingCount} pending</div>
      </div>
      <div style="display:flex;gap:6px">
        <button ${tabStyle('pending')} onclick="renderDeletionRequests('pending')"><i class="fas fa-clock" style="margin-right:5px"></i>Pending (${pendingCount})</button>
        <button ${tabStyle('history')} onclick="renderDeletionRequests('history')"><i class="fas fa-history" style="margin-right:5px"></i>History</button>
      </div>
    </div>
    ${reqs.length === 0 && (_delReqTab!=='history'||editAudit.length===0) ? `
      <div class="empty-state"><i class="fas fa-clipboard"></i><p>${_delReqTab==='pending'?(isAdmin?'No pending deletion requests':'You have no pending requests'):'No reviewed requests yet'}</p></div>
    ` : `
      <div style="display:flex;flex-direction:column;gap:8px">
        ${reqs.map(r => {
          const statusColor = r.status === 'pending' ? '#f0a450' : r.status === 'approved' ? '#3fb950' : '#f85149';
          return `<div class="card" style="padding:12px 14px;border-left:3px solid ${statusColor}">
            <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:10px;margin-bottom:8px">
              <div style="flex:1;min-width:0">
                <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:4px">
                  <span style="font-family:var(--font-mono);font-size:10px;color:var(--accent-blue);font-weight:700">${r.id}</span>
                  <span style="font-size:9px;padding:2px 8px;border-radius:8px;background:${statusColor}22;color:${statusColor};font-weight:700;text-transform:uppercase">${r.status}</span>
                  <span style="font-size:10px;color:var(--text-muted)">${r.recordType}</span>
                </div>
                <div style="font-weight:600;font-size:13px;line-height:1.3">${r.recordLabel}</div>
                <div style="font-family:var(--font-mono);font-size:10px;color:var(--text-muted);margin-top:2px">${r.recordId}</div>
                ${r.reason ? `<div style="margin-top:6px;padding:6px 9px;background:var(--bg-hover);border-radius:5px;font-size:11px;color:var(--text-secondary);font-style:italic">"${r.reason}"</div>` : ''}
                <div style="font-size:10px;color:var(--text-muted);margin-top:5px">
                  <i class="fas fa-user" style="margin-right:3px"></i>${r.requestedBy} · <i class="fas fa-clock" style="margin:0 3px"></i>${new Date(r.requestedAt).toLocaleString()}
                  ${r.reviewedBy ? '· <i class="fas fa-gavel" style="margin:0 3px"></i>Reviewed by ' + r.reviewedBy : ''}
                </div>
                ${r.rejectionReason ? `<div style="margin-top:5px;padding:6px 9px;background:rgba(248,81,73,.08);border-radius:5px;font-size:11px;color:var(--accent-red)"><strong>Rejected:</strong> ${r.rejectionReason}</div>` : ''}
              </div>
              ${(r.wfRoute && r.status === 'pending' && typeof wfActionButtonsHTML === 'function') ? `
                <div style="display:flex;gap:5px;flex-shrink:0;flex-direction:column;align-items:flex-end">
                  ${typeof wfBadge === 'function' ? wfBadge(r) : ''}
                  <div style="display:flex;gap:5px">${wfActionButtonsHTML('deletionRequest', r)}</div>
                </div>
              ` : (isAdmin && r.status === 'pending') ? `
                <div style="display:flex;gap:5px;flex-shrink:0">
                  <button class="btn btn-success btn-sm" onclick="approveDeletionRequest('${r.id}')"><i class="fas fa-check"></i> Approve</button>
                  <button class="btn btn-danger btn-sm" onclick="rejectDeletionRequest('${r.id}')"><i class="fas fa-times"></i> Reject</button>
                </div>
              ` : ''}
              ${(!isAdmin && r.status === 'pending') ? `
                <button class="btn btn-secondary btn-sm" onclick="cancelDeletionRequest('${r.id}')" title="Cancel my request"><i class="fas fa-trash"></i></button>
              ` : ''}
            </div>
          </div>`;
        }).join('')}
      </div>
    `}
    ${(_delReqTab === 'history' && isAdmin && editAudit.length > 0) ? `
      <div style="margin-top:20px">
        <div style="font-size:13px;font-weight:700;margin-bottom:10px;display:flex;align-items:center;gap:8px">
          <i class="fas fa-pencil-alt" style="color:var(--accent-blue)"></i>
          Edit Audit Trail
          <span class="badge badge-blue" style="font-size:10px">${editAudit.length} record${editAudit.length!==1?'s':''} with edits</span>
        </div>
        <div class="table-wrap"><table>
          <thead><tr>
            <th>Record</th><th>Type</th><th>Last Edited By</th><th>Last Edited At</th>
          </tr></thead>
          <tbody>
            ${editAudit.slice(0,100).map(e=>`<tr>
              <td style="font-size:12px;font-weight:500">${e.name}</td>
              <td><span class="badge badge-gray" style="font-size:9px">${e.arrayKey}</span></td>
              <td style="font-size:11px"><i class="fas fa-user" style="margin-right:4px;color:var(--accent-blue)"></i>${e.updatedBy}</td>
              <td style="font-size:11px;font-family:var(--font-mono);color:var(--text-muted)">${new Date(e.updatedAt).toLocaleString()}</td>
            </tr>`).join('')}
            ${editAudit.length>100?`<tr><td colspan="4" style="text-align:center;color:var(--text-muted);font-size:11px">Showing 100 of ${editAudit.length} records</td></tr>`:''}
          </tbody>
        </table></div>
      </div>
    ` : ''}
  `;
}

// ── Approve a deletion request (admin) ────────────────────
function approveDeletionRequest(reqId) {
  const req = (AppState.data.deletionRequests||[]).find(r => r.id === reqId);
  if (!req) return;
  if (!isAdminUser()) { showToast('Admins only', 'error'); return; }
  if (!confirm('Approve deletion of ' + req.recordType + ' "' + req.recordLabel + '"?\n\nIt will be moved to Trash and can still be restored within ' + SOFT_DELETE_RETENTION_DAYS + ' days.')) return;
  // Soft-delete the record
  if (typeof softDelete === 'function') softDelete(req.arrayKey, req.recordId);
  req.status = 'approved';
  req.reviewedBy = _currentUserProfile?.name || 'admin';
  req.reviewedAt = new Date().toISOString();
  AppState.save();
  if (typeof spWriteAuditLog === 'function') spWriteAuditLog('delete_approved', req.recordType, req.recordId, req.recordLabel, { requestId: reqId, requester: req.requestedBy });
  showToast(req.recordType + ' moved to Trash', 'success');
  renderDeletionRequests();
}

// ── Reject a deletion request (admin) ─────────────────────
function rejectDeletionRequest(reqId) {
  const req = (AppState.data.deletionRequests||[]).find(r => r.id === reqId);
  if (!req) return;
  if (!isAdminUser()) { showToast('Admins only', 'error'); return; }
  const reason = prompt('Reason for rejecting this request?\n\nThis will be visible to the requester.', '');
  if (reason === null) return; // user cancelled
  req.status = 'rejected';
  req.reviewedBy = _currentUserProfile?.name || 'admin';
  req.reviewedAt = new Date().toISOString();
  req.rejectionReason = (reason || '').trim() || 'No reason provided';
  AppState.save();
  if (typeof spWriteAuditLog === 'function') spWriteAuditLog('delete_rejected', req.recordType, req.recordId, req.recordLabel, { requestId: reqId, requester: req.requestedBy, reason: req.rejectionReason });
  showToast('Request rejected', 'warning');
  renderDeletionRequests();
}

// ── Cancel my own pending request ─────────────────────────
function cancelDeletionRequest(reqId) {
  if (!confirm('Cancel this deletion request?')) return;
  AppState.data.deletionRequests = (AppState.data.deletionRequests||[]).filter(r => r.id !== reqId);
  AppState.save();
  showToast('Request cancelled', 'info');
  renderDeletionRequests();
}

// ── Check if a record has a pending deletion request ──────
function hasPendingDeletionRequest(arrayKey, id) {
  return (AppState.data.deletionRequests||[]).some(r =>
    r.arrayKey === arrayKey && r.recordId === id && r.status === 'pending'
  );
}



// Update deletion request badge in sidebar
function updateDeletionRequestBadge() {
  try {
    const badge = document.getElementById('delReqBadge');
    if (!badge) return;
    const isAdmin = (typeof isAdminUser === 'function') && isAdminUser();
    const all = AppState.data.deletionRequests || [];
    const count = isAdmin
      ? all.filter(r => r.status === 'pending').length
      : all.filter(r => r.requestedByEmail === (_currentUserProfile?.email||'') && r.status === 'pending').length;
    if (count > 0) {
      badge.textContent = count;
      badge.style.display = '';
    } else {
      badge.style.display = 'none';
    }
  } catch(e) {}
}
// Auto-update badge every 10 seconds
setInterval(updateDeletionRequestBadge, 10000);
setTimeout(updateDeletionRequestBadge, 1500);

// ── PROJECT STATUS LOCK (admin override) ──────────────────
// Flow: prospect → planned → active → completed → archived
// Side state: on-hold (Active ↔ On Hold for users)
// Admins can transition anywhere.
// ═══════════════════════════════════════════════════════════

const STATUS_CHAIN = ['prospect', 'planned', 'active', 'completed', 'archived'];

// Returns true if the current user is an admin
function isAdminUser() {
  if (typeof _currentUserProfile === 'undefined' || !_currentUserProfile) return false;
  return _currentUserProfile.isAdmin === true ||
         _currentUserProfile.role === 'admin' ||
         _currentUserProfile.role === 'Admin';
}

// Returns true if user can move project from oldStatus to newStatus
function canChangeStatus(oldStatus, newStatus) {
  if (oldStatus === newStatus) return true; // no-op
  if (isAdminUser()) return true; // admins can do anything
  // Special case: on-hold transitions
  if (oldStatus === 'active' && newStatus === 'on-hold') return true;
  if (oldStatus === 'on-hold' && newStatus === 'active') return true;
  // Otherwise — forward only in the main chain
  const oldIdx = STATUS_CHAIN.indexOf(oldStatus);
  const newIdx = STATUS_CHAIN.indexOf(newStatus);
  if (oldIdx === -1 || newIdx === -1) return false;
  return newIdx > oldIdx; // strictly forward
}

// Returns array of statuses the user can transition to from current
function getAllowedStatusTransitions(currentStatus) {
  if (isAdminUser()) {
    return ['prospect', 'planned', 'active', 'on-hold', 'completed', 'archived'];
  }
  const allowed = [currentStatus];
  const idx = STATUS_CHAIN.indexOf(currentStatus);
  if (idx >= 0) {
    // All statuses ahead in the chain
    for (let i = idx + 1; i < STATUS_CHAIN.length; i++) allowed.push(STATUS_CHAIN[i]);
  }
  if (currentStatus === 'active') allowed.push('on-hold');
  if (currentStatus === 'on-hold') allowed.push('active');
  return [...new Set(allowed)]; // dedupe
}

// Wrap status changes: returns true if allowed, shows toast + returns false if not
function validateStatusChange(oldStatus, newStatus, recordLabel) {
  if (canChangeStatus(oldStatus, newStatus)) return true;
  const msg = isAdminUser()
    ? 'Status change blocked unexpectedly'
    : 'Only an admin can change status from "' + oldStatus + '" to "' + newStatus + '". You can only move forward in: ' + STATUS_CHAIN.join(' → ');
  showToast(msg, 'warning', 5000);
  if (typeof auditLog === 'function') auditLog('status_lock', 'Blocked status change', { from: oldStatus, to: newStatus, record: recordLabel });
  return false;
}


function convertProspectToProject(id){
  const p = (AppState.data.projects||[]).find(x => x.id === id);
  if (!p) return;
  // Safety: ensure no stale _deleted flag
  delete p._deleted; delete p._deletedAt; delete p._deletedBy;
  const newIdRaw = prompt('Convert prospect "' + p.name + '" to a real project.\n\nEnter the new Project ID (e.g., JO-033-SW-PGPC-26-0129):', p.id.startsWith('PROSPECT-') ? '' : p.id);
  if (!newIdRaw) return;
  const newId = newIdRaw.trim();
  if (!newId) { showToast('ID required', 'error'); return; }
  // Uniqueness check
  if ((AppState.data.projects||[]).some(x => x.id === newId && x.id !== id)) {
    showToast('ID already exists', 'error'); return;
  }
  // Update status to planned + cascade ID change
  const oldId = p.id;
  if (oldId !== newId) {
    _cascadeUpdateProjectId(oldId, newId, _currentUserProfile?.name || 'User', 'Converted from prospect');
  }
  const proj = (AppState.data.projects||[]).find(x => x.id === newId);
  if (proj) proj.status = 'planned';
  AppState.save();
  window._suppressDeletionTracking = false; // re-enable normal deletion tracking
  showToast('Prospect converted to planned project: ' + newId, 'success');
  if (typeof auditLog === 'function') auditLog('convert', 'Prospect ' + oldId + ' converted to ' + newId);
  navigate('projects');
}

// ═══════════════════════════════════════════════════════════
// ── PROJECT ID CASCADE UPDATE ─────────────────────────────
// ═══════════════════════════════════════════════════════════

// Atomically update a project ID and all references to it
function _cascadeUpdateProjectId(oldId, newId, changedBy, reason) {
  if (oldId === newId) return;
  console.log('[ID Change] Cascading update:', oldId, '->', newId);
  // Suppress save-hook deletion tracking during cascade — old ID is being renamed, not deleted
  window._suppressDeletionTracking = true;
  const data = AppState.data;
  let updatedCount = { project: 0, tasks: 0, costs: 0, qaqc: 0, risks: 0, actions: 0,
    documents: 0, allocations: 0, usageLogs: 0, dailyLogs: 0, procurement: 0,
    materials: 0, manpower: 0, equipment: 0, tools: 0, vehicles: 0, consumables: 0 };

  // Update project itself
  const proj = (data.projects||[]).find(p => p.id === oldId);
  if (proj) { proj.id = newId; updatedCount.project = 1; }

  // Update all references in arrays
  const arrays = ['tasks','costs','qaqc','risks','actions','documents','resourceAllocations',
    'resourceUsageLogs','dailyMeetingLogs','procurement','procurementLogs','materials',
    'manpower','equipment','tools','vehicles','consumables'];
  arrays.forEach(arrKey => {
    (data[arrKey]||[]).forEach(item => {
      if (item.projectId === oldId) {
        item.projectId = newId;
        const countKey = arrKey === 'resourceAllocations' ? 'allocations'
          : arrKey === 'resourceUsageLogs' ? 'usageLogs'
          : arrKey === 'dailyMeetingLogs' ? 'dailyLogs'
          : arrKey;
        if (updatedCount[countKey] !== undefined) updatedCount[countKey]++;
      }
    });
  });

  // Clear any stale deletion tracking for the old ID (it was renamed, not deleted)
  if (typeof _spDeletedIds !== 'undefined' && _spDeletedIds) {
    Object.keys(_spDeletedIds).forEach(k => {
      if (_spDeletedIds[k] && _spDeletedIds[k][oldId]) delete _spDeletedIds[k][oldId];
    });
    try { localStorage.setItem('shic_sp_deleted_ids', JSON.stringify(_spDeletedIds)); } catch(e) {}
  }
  // Update history
  if (!data.projectIdHistory) data.projectIdHistory = [];
  data.projectIdHistory.push({
    projectId: newId, // current id is now newId
    oldId,
    newId,
    changedBy,
    changedAt: new Date().toISOString(),
    reason: reason || '',
    counts: updatedCount,
  });

  // Save
  AppState.save();
  const total = Object.values(updatedCount).reduce((s,n) => s+n, 0);
  console.log('[ID Change] Updated ' + total + ' record(s):', updatedCount);
  return updatedCount;
}

// ── Open the Change ID modal ──────────────────────────────
function showChangeProjectId(id) {
  const p = (AppState.data.projects||[]).find(x => x.id === id);
  if (!p) return;
  const isAdmin = (_currentUserProfile && _currentUserProfile.isAdmin) || false;
  const status = p.status;
  const isLocked = status === 'completed' || status === 'archived';
  const isInstant = status === 'prospect' || (isAdmin && (status === 'active' || status === 'planned' || status === 'on-hold'));
  const requiresApproval = !isAdmin && (status === 'active' || status === 'planned' || status === 'on-hold');

  if (isLocked) {
    showToast('Cannot change ID — project is ' + status, 'error');
    return;
  }

  // Count impacted records
  const counts = _countProjectReferences(id);
  const totalRefs = Object.values(counts).reduce((s,n) => s+n, 0);

  $('#genericModalTitle').textContent = 'Change Project ID';
  $('#genericModalBody').innerHTML = `
    <div style="margin-bottom:12px">
      <div style="font-size:11px;color:var(--text-muted)">CURRENT ID</div>
      <div style="font-family:var(--font-mono);font-size:18px;font-weight:700;color:var(--accent-blue)">${p.id}</div>
      <div style="font-size:12px;color:var(--text-secondary);margin-top:3px">${esc(p.name)}</div>
      <div style="margin-top:6px"><span class="badge" style="background:rgba(240,164,80,.15);color:var(--accent-amber)">Status: ${status}</span></div>
    </div>
    <div class="form-group" style="margin-bottom:12px">
      <label class="form-label">New Project ID *</label>
      <input class="form-input" id="newProjId" placeholder="e.g., JO-033-SW-PGPC-26-0129" autofocus>
    </div>
    ${requiresApproval ? `
      <div class="form-group">
        <label class="form-label">Reason for change *</label>
        <textarea class="form-textarea" id="idChangeReason" placeholder="Why does this project need a new ID?" rows="3"></textarea>
      </div>` : ''}
    <div style="padding:10px;background:rgba(56,139,253,.08);border:1px solid rgba(56,139,253,.2);border-radius:7px;font-size:11px;color:var(--accent-blue);margin-top:10px">
      <i class="fas fa-info-circle" style="margin-right:5px"></i>
      <strong>This change affects ${totalRefs} record(s):</strong><br>
      ${Object.entries(counts).filter(([,n])=>n>0).map(([k,n])=>`${n} ${k}`).join(', ') || 'no related records'}
      ${requiresApproval ? '<br><br><strong style="color:var(--accent-amber)"><i class="fas fa-shield-alt" style="margin-right:4px"></i>This change requires admin approval. The request will be submitted for review.</strong>' : ''}
      ${isInstant && !requiresApproval ? '<br><br><strong style="color:var(--accent-green)"><i class="fas fa-bolt" style="margin-right:4px"></i>You can change this ID instantly (you are admin or this is a prospect).</strong>' : ''}
    </div>
  `;
  $('#genericModalFooter').innerHTML = `
    <button class="btn btn-secondary" onclick="closeModal('genericModal')">Cancel</button>
    <button class="btn btn-primary" onclick="submitProjectIdChange('${id}')">
      <i class="fas ${requiresApproval ? 'fa-paper-plane' : 'fa-check'}" style="margin-right:5px"></i>
      ${requiresApproval ? 'Submit for Approval' : 'Change ID'}
    </button>
  `;
  openModal('genericModal');
}

function _countProjectReferences(projectId) {
  const data = AppState.data;
  return {
    tasks: (data.tasks||[]).filter(x => x.projectId === projectId).length,
    costs: (data.costs||[]).filter(x => x.projectId === projectId).length,
    documents: (data.documents||[]).filter(x => x.projectId === projectId).length,
    'qa/qc': (data.qaqc||[]).filter(x => x.projectId === projectId).length,
    risks: (data.risks||[]).filter(x => x.projectId === projectId).length,
    actions: (data.actions||[]).filter(x => x.projectId === projectId).length,
    'usage logs': (data.resourceUsageLogs||[]).filter(x => x.projectId === projectId).length,
    'daily logs': (data.dailyMeetingLogs||[]).filter(x => x.projectId === projectId).length,
    materials: (data.materials||[]).filter(x => x.projectId === projectId).length,
    procurement: (data.procurement||[]).filter(x => x.projectId === projectId).length,
  };
}

function submitProjectIdChange(id) {
  const p = (AppState.data.projects||[]).find(x => x.id === id);
  if (!p) return;
  const newId = ($('#newProjId').value || '').trim();
  if (!newId) { showToast('New ID required', 'error'); return; }
  if (newId === id) { showToast('New ID is the same as current', 'warning'); return; }
  if ((AppState.data.projects||[]).some(x => x.id === newId)) {
    showToast('ID ' + newId + ' already exists', 'error'); return;
  }
  const isAdmin = (_currentUserProfile && _currentUserProfile.isAdmin) || false;
  const status = p.status;
  const requiresApproval = !isAdmin && (status === 'active' || status === 'planned' || status === 'on-hold');
  const user = _currentUserProfile?.name || _currentUser?.email || 'User';

  if (requiresApproval) {
    const reason = ($('#idChangeReason').value || '').trim();
    if (!reason) { showToast('Reason required for approval request', 'error'); return; }
    if (!AppState.data.idChangeRequests) AppState.data.idChangeRequests = [];
    const reqId = 'IDC-' + Date.now().toString(36).toUpperCase();
    AppState.data.idChangeRequests.push({
      id: reqId, projectId: id, oldId: id, newId, requestedBy: user,
      requestedAt: new Date().toISOString(), reason, status: 'pending',
    });
    // Notify admin
    if (!AppState.data.notifications) AppState.data.notifications = [];
    AppState.data.notifications.unshift({
      id: 'NOTIF-' + Date.now().toString(36).toUpperCase(),
      type: 'id_change_request',
      title: 'Project ID change request',
      message: user + ' requests ' + id + ' → ' + newId + ': ' + reason,
      createdAt: new Date().toISOString(),
      read: false, forAdmin: true,
    });
    AppState.save();
    closeModal('genericModal');
    showToast('ID change request submitted to admin', 'success', 4000);
  } else {
    // Instant change (admin or prospect)
    _cascadeUpdateProjectId(id, newId, user, 'Direct change');
    closeModal('genericModal');
    showToast('Project ID changed: ' + id + ' → ' + newId, 'success');
    // Refresh wherever we are
    if (AppState.currentPage === 'prospects') renderProspects();
    else if (AppState.currentPage === 'projects') renderProjects();
    else if (AppState.currentPage === 'detail') showProjectDetail(newId);
  }
}

// ── Admin approves an ID change request ────────────────────
function approveIdChange(requestId) {
  const isAdmin = (_currentUserProfile && _currentUserProfile.isAdmin) || false;
  if (!isAdmin) { showToast('Admin only', 'error'); return; }
  const req = (AppState.data.idChangeRequests||[]).find(r => r.id === requestId);
  if (!req || req.status !== 'pending') return;
  if (!confirm('Approve ID change: ' + req.oldId + ' → ' + req.newId + '?\n\nRequested by: ' + req.requestedBy + '\nReason: ' + req.reason)) return;
  // Verify the new ID is still unique
  if ((AppState.data.projects||[]).some(p => p.id === req.newId)) {
    showToast('Cannot approve — new ID ' + req.newId + ' is now taken', 'error');
    return;
  }
  _cascadeUpdateProjectId(req.oldId, req.newId, _currentUserProfile?.name || 'Admin',
    'Approved request from ' + req.requestedBy + ': ' + req.reason);
  req.status = 'approved';
  req.approvedBy = _currentUserProfile?.name || 'Admin';
  req.approvedAt = new Date().toISOString();
  AppState.save();
  showToast('ID change approved and applied', 'success');
  renderProspects();
}

function rejectIdChange(requestId) {
  const isAdmin = (_currentUserProfile && _currentUserProfile.isAdmin) || false;
  if (!isAdmin) { showToast('Admin only', 'error'); return; }
  const req = (AppState.data.idChangeRequests||[]).find(r => r.id === requestId);
  if (!req || req.status !== 'pending') return;
  const reason = prompt('Reason for rejection (optional):', '');
  if (reason === null) return;
  req.status = 'rejected';
  req.rejectedBy = _currentUserProfile?.name || 'Admin';
  req.rejectedAt = new Date().toISOString();
  req.rejectionReason = reason || '';
  AppState.save();
  showToast('ID change rejected', 'warning');
  renderProspects();
}

function cancelIdChangeRequest(requestId) {
  const req = (AppState.data.idChangeRequests||[]).find(r => r.id === requestId);
  if (!req || req.status !== 'pending') return;
  if (!confirm('Cancel this ID change request?')) return;
  AppState.data.idChangeRequests = (AppState.data.idChangeRequests||[]).filter(r => r.id !== requestId);
  AppState.save();
  showToast('Request cancelled', 'info');
  renderProspects();
}



let taskView='kanban',taskProjectFilter='all';