function renderProspects(){
  AppState.ensureData();
  const all = (AppState.data.projects || []).filter(p => p.status === 'prospect');
  let ps = all;
  if (prospectBUFilter !== 'all') {
    ps = ps.filter(p => (p.businessUnit||'') === (prospectBUFilter||''));
  }
  if (prospectSearch) {
    const q = prospectSearch.toLowerCase();
    ps = ps.filter(p => (p.name||'').toLowerCase().includes(q) || (p.client||'').toLowerCase().includes(q) || p.id.toLowerCase().includes(q));
  }
  // Pending ID change requests (admin sees them)
  const isAdmin = (_currentUserProfile && _currentUserProfile.isAdmin) || false;
  const pendingRequests = (AppState.data.idChangeRequests || []).filter(r => r.status === 'pending');
  const myRequests = pendingRequests.filter(r => r.requestedBy === (_currentUserProfile?.name || _currentUser?.email));

  const totalBudget = all.reduce((s,p) => s + (p.budget||0), 0);
  const totalProspects = all.length;
  const fmt = (AppState.data.settings?.currency||'PHP') + ' ' + totalBudget.toLocaleString();

  $('#prospects').innerHTML = `
  <div class="section-header" style="margin-bottom:14px">
    <div>
      <div class="section-title"><i class="fas fa-search-dollar" style="color:var(--accent-amber);margin-right:8px"></i>Prospects</div>
      <div class="section-sub">${totalProspects} prospect${totalProspects!==1?'s':''} · Pipeline value: ${fmt}</div>
    </div>
    <div style="display:flex;gap:7px;align-items:center">
      <button class="btn btn-secondary btn-sm" onclick="exportCSV((AppState.data.projects||[]).filter(p=>p.status==='prospect').map(p=>[p.id,p.name,p.client,p.location,p.budget,p.startDate,p.endDate,p.discipline,p.priority]),['ID','Name','Client','Location','Budget','Start','End','Discipline','Priority'],'prospects.csv')"><i class="fas fa-download"></i> Export</button>
      <button class="btn btn-primary btn-sm" onclick="showProspectForm()"><i class="fas fa-plus"></i> New Prospect</button>
    </div>
  </div>

  ${(isAdmin && pendingRequests.length > 0) ? `
    <div class="card" style="margin-bottom:14px;border-left:3px solid var(--accent-amber)">
      <div class="card-title" style="color:var(--accent-amber)"><i class="fas fa-exclamation-circle" style="margin-right:6px"></i>Pending Project ID Change Requests (${pendingRequests.length})</div>
      <div class="table-wrap"><table>
        <thead><tr><th>Old ID</th><th>New ID</th><th>Project</th><th>Requested By</th><th>Reason</th><th>When</th><th>Actions</th></tr></thead>
        <tbody>${pendingRequests.map(r => {
          const proj = (AppState.data.projects||[]).find(p => p.id === r.projectId);
          return `<tr>
            <td style="font-family:var(--font-mono);font-size:11px"><s>${r.oldId}</s></td>
            <td style="font-family:var(--font-mono);font-size:11px;color:var(--accent-green);font-weight:700">${r.newId}</td>
            <td>${proj?.name || '<em>(project not found)</em>'}</td>
            <td style="font-size:11px">${r.requestedBy}</td>
            <td style="font-size:11px;max-width:200px">${r.reason || '<em>no reason</em>'}</td>
            <td style="font-size:10px;color:var(--text-muted)">${new Date(r.requestedAt).toLocaleString()}</td>
            <td><div style="display:flex;gap:4px">
              <button class="btn btn-success btn-sm btn-icon" onclick="approveIdChange('${r.id}')" title="Approve"><i class="fas fa-check"></i></button>
              <button class="btn btn-danger btn-sm btn-icon" onclick="rejectIdChange('${r.id}')" title="Reject"><i class="fas fa-times"></i></button>
            </div></td>
          </tr>`;
        }).join('')}</tbody>
      </table></div>
    </div>` : ''}

  ${(!isAdmin && myRequests.length > 0) ? `
    <div class="card" style="margin-bottom:14px;border-left:3px solid var(--accent-blue)">
      <div class="card-title" style="color:var(--accent-blue)"><i class="fas fa-hourglass-half" style="margin-right:6px"></i>Your Pending ID Change Requests (${myRequests.length})</div>
      ${myRequests.map(r => `
        <div style="padding:8px;border-bottom:1px solid var(--border);font-size:12px">
          <span style="font-family:var(--font-mono)"><s>${r.oldId}</s> → <strong style="color:var(--accent-green)">${r.newId}</strong></span>
          <span style="margin-left:8px;color:var(--text-muted)">·</span>
          <span style="margin-left:8px">${r.reason || 'no reason'}</span>
          <button class="btn btn-secondary btn-sm" style="float:right;font-size:10px" onclick="cancelIdChangeRequest('${r.id}')">Cancel</button>
        </div>
      `).join('')}
    </div>` : ''}

  <div class="filters-bar">
    <select class="form-select" style="height:30px;width:160px" onchange="prospectBUFilter=this.value;renderProspects()">
      <option value="all" ${prospectBUFilter==='all'?'selected':''}>All Business Units</option>
      <option value="" ${prospectBUFilter===''?'selected':''}>Main Company</option>
      ${(AppState.data.businessUnits||[]).map(bu=>`<option value="${bu.id}" ${prospectBUFilter===bu.id?'selected':''}>${bu.name}</option>`).join('')}
    </select>
    <div class="search-bar" style="margin-left:auto"><i class="fas fa-search"></i><input type="text" placeholder="Search prospects..." value="${prospectSearch}" oninput="prospectSearch=this.value;renderProspects()"></div>
  </div>

  ${ps.length === 0 ? `<div class="empty-state"><i class="fas fa-search-dollar"></i><p>No prospects yet</p><button class="btn btn-primary btn-sm" onclick="showProspectForm()" style="margin-top:8px"><i class="fas fa-plus"></i> Add Your First Prospect</button></div>` :
  `<div class="grid grid-3">${ps.map(p => {
    const bu = (AppState.data.businessUnits||[]).find(b => b.id === p.businessUnit);
    const buBadge = bu ? `<span class="badge" style="background:${bu.color}22;color:${bu.color};border:1px solid ${bu.color}55">${bu.name}</span>` : '';
    const priColor = {critical:'#f85149',high:'#fb8f44',medium:'#f0a450',low:'#3fb950'}[p.priority]||'#8b949e';
    return `
    <div class="card" style="cursor:pointer;position:relative" onclick="showProjectDetail('${p.id}')">
      <div style="position:absolute;top:8px;right:8px"><span class="badge" style="background:rgba(240,164,80,.15);color:var(--accent-amber);border:1px solid var(--accent-amber);font-size:9px;letter-spacing:1px">PROSPECT</span></div>
      <div style="font-family:var(--font-mono);font-size:11px;color:var(--accent-amber);font-weight:700">${p.id}</div>
      <div style="font-weight:700;font-size:14px;margin-top:4px;line-height:1.3;padding-right:80px">${esc(p.name)}</div>
      <div style="font-size:11px;color:var(--text-secondary);margin-top:3px">${p.client || '— no client —'}</div>
      <div style="margin-top:10px;display:flex;gap:6px;flex-wrap:wrap">
        ${buBadge}
        ${p.priority ? `<span class="badge" style="background:${priColor}22;color:${priColor}">${p.priority}</span>` : ''}
        ${p.discipline ? `<span class="badge badge-secondary">${p.discipline}</span>` : ''}
      </div>
      <div style="margin-top:12px;display:grid;grid-template-columns:repeat(2,1fr);gap:8px;font-size:11px">
        <div><div style="color:var(--text-muted);font-size:9px">BUDGET</div><div style="font-family:var(--font-mono);font-weight:700">${(AppState.data.settings?.currency||'PHP')} ${(p.budget||0).toLocaleString()}</div></div>
        <div><div style="color:var(--text-muted);font-size:9px">DURATION</div><div style="font-size:11px">${p.startDate || '—'} → ${p.endDate || '—'}</div></div>
      </div>
      <div style="margin-top:10px;display:flex;gap:5px" onclick="event.stopPropagation()">
        <button class="btn btn-secondary btn-sm" style="flex:1" onclick="showProspectForm('${p.id}')"><i class="fas fa-edit"></i> Edit</button>
        <button class="btn btn-success btn-sm" style="flex:1" onclick="convertProspectToProject('${p.id}')" title="Convert to Project"><i class="fas fa-arrow-right"></i> Convert</button>
        <button class="btn btn-danger btn-sm btn-icon" onclick="if(confirm('Delete prospect?')){deleteProject('${p.id}');renderProspects();}"><i class="fas fa-trash"></i></button>
      </div>
    </div>`;
  }).join('')}</div>`}
  `;
}

function showProspectForm(id=null){
  // Reuse the project form, but pre-set status to prospect
  if (!id) {
    showProjectForm(null);
    setTimeout(() => {
      const status = document.getElementById('pStatus');
      const idField = document.getElementById('pId');
      if (status) status.value = 'prospect';
      if (idField) {
        idField.value = 'PROSPECT-' + ((AppState.data.projects||[]).filter(p=>p.status==='prospect').length + 1).toString().padStart(3,'0');
      }
    }, 100);
  } else {
    showProjectForm(id);
  }
}


// ═══════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════
// ── DELETE PERMISSION + REQUEST SYSTEM (Phase 3) ─────────
// Admins delete directly; users submit deletion requests.
// Approved requests → soft-delete (Trash); admin can purge.
// ═══════════════════════════════════════════════════════════

// Generate a unique deletion request ID
function _genDelReqId() {
  const list = AppState.data.deletionRequests || [];
  let maxN = 0;
  list.forEach(r => {
    const m = (r.id||'').match(/^DEL-(\d+)$/);
    if (m) { const n = parseInt(m[1], 10); if (n > maxN) maxN = n; }
  });
  return 'DEL-' + String(maxN + 1).padStart(4, '0');
}

// Friendly label for a record type
const _DEL_TYPE_LABELS = {
  projects: 'Project', tasks: 'Task', actions: 'Action Item', risks: 'Risk',
  qaqc: 'QA/QC Item', costs: 'Cost Item', documents: 'Document',
  libraryDocs: 'Library Document', resourceAllocations: 'Resource Allocation',
  resourceUsageLogs: 'Usage Log', dailyMeetingLogs: 'Daily Log',
  procurement: 'Procurement Item', materials: 'Material',
  manpower: 'Manpower', equipment: 'Equipment', tools: 'Tool',
  vehicles: 'Vehicle', consumables: 'Consumable', thirdParty: 'Third Party',
  assetHistory: 'Asset History', assetUtilization: 'Asset Utilization',
};

// Get record label for display
function _getRecordLabel(arrayKey, id) {
  const list = AppState.data[arrayKey] || [];
  const r = list.find(x => x && x.id === id);
  if (!r) return id;
  return r.name || r.description || r.title || id;
}

// ── Unified delete entry point ─────────────────────────────
// Called from all "delete" buttons. Admins delete directly;
// users see a "Request Deletion" form.
function requestOrDelete(arrayKey, id, customConfirmText) {
  if (isAdminUser()) {
    // Admins: direct soft-delete (Trash safety net)
    const recordLabel = _getRecordLabel(arrayKey, id);
    const typeLabel = _DEL_TYPE_LABELS[arrayKey] || arrayKey;
    const msg = customConfirmText || ('Delete this ' + typeLabel + '?\n\n' + recordLabel + '\n\nIt will be moved to Trash and can be restored within ' + SOFT_DELETE_RETENTION_DAYS + ' days.');
    if (!confirm(msg)) return false;
    if (typeof softDelete === 'function' && softDelete(arrayKey, id)) {
      AppState.save();
      if (typeof auditLog === 'function') auditLog('delete', 'Admin soft-deleted ' + typeLabel + ' ' + id, { recordLabel });
      showToast(typeLabel + ' moved to Trash', 'warning');
      // Trigger re-render
      try { if (AppState.currentPage && typeof navigate === 'function') {
        const cur = AppState.currentPage;
        setTimeout(() => navigate(cur), 100);
      } } catch(e) {}
      return true;
    }
    return false;
  }
  // Non-admin: open request modal
  showDeletionRequestModal(arrayKey, id);
  return false;
}

// ── Deletion request modal ─────────────────────────────────
function showDeletionRequestModal(arrayKey, id) {
  const recordLabel = _getRecordLabel(arrayKey, id);
  const typeLabel = _DEL_TYPE_LABELS[arrayKey] || arrayKey;
  // Check for existing pending request
  const existing = (AppState.data.deletionRequests||[]).find(r =>
    r.arrayKey === arrayKey && r.recordId === id && r.status === 'pending'
  );
  if (existing) {
    showToast('Deletion already requested · awaiting admin review', 'info', 4000);
    return;
  }

  $('#genericModalTitle').textContent = 'Request Deletion';
  $('#genericModalBody').innerHTML = `
    <div style="padding:11px 13px;background:rgba(240,164,80,.08);border:1px solid rgba(240,164,80,.25);border-radius:8px;margin-bottom:14px">
      <div style="font-weight:700;color:var(--accent-amber);margin-bottom:4px"><i class="fas fa-clipboard-check" style="margin-right:5px"></i>Admin approval required</div>
      <div style="font-size:11px;color:var(--text-secondary)">Only admins can delete. Submit a request and an admin will review it.</div>
    </div>
    <div class="form-group">
      <label class="form-label">Record</label>
      <div style="padding:9px 12px;background:var(--bg-hover);border-radius:6px;font-size:11px">
        <span style="font-size:9px;color:var(--text-muted);text-transform:uppercase;letter-spacing:.5px">${typeLabel}</span><br>
        <strong>${id}</strong> — ${recordLabel}
      </div>
    </div>
    <div class="form-group">
      <label class="form-label">Reason for deletion <span style="font-weight:400;color:var(--text-muted);font-size:10px">· optional but recommended</span></label>
      <textarea class="form-input" id="delReqReason" rows="3" placeholder="e.g., Duplicate record, created in error, no longer relevant..."></textarea>
    </div>
  `;
  $('#genericModalFooter').innerHTML = `
    <button class="btn btn-secondary" onclick="closeModal('genericModal')">Cancel</button>
    <button class="btn btn-primary" onclick="submitDeletionRequest('${arrayKey}','${id}')"><i class="fas fa-paper-plane"></i> Submit Request</button>
  `;
  openModal('genericModal');
}

// ── Submit a deletion request ─────────────────────────────
function submitDeletionRequest(arrayKey, id) {
  const reason = ($('#delReqReason')?.value || '').trim();
  const recordLabel = _getRecordLabel(arrayKey, id);
  if (!AppState.data.deletionRequests) AppState.data.deletionRequests = [];
  const req = {
    id: _genDelReqId(),
    arrayKey,
    recordId: id,
    recordType: _DEL_TYPE_LABELS[arrayKey] || arrayKey,
    recordLabel,
    requestedBy: _currentUserProfile?.name || _currentUserProfile?.email || 'unknown',
    requestedByEmail: _currentUserProfile?.email || '',
    requestedAt: new Date().toISOString(),
    reason,
    status: 'pending',
    reviewedBy: '',
    reviewedAt: '',
    rejectionReason: '',
    _newlyCreated: true,
  };
  AppState.data.deletionRequests.push(req);
  if (typeof wfStart === 'function') wfStart('deletionRequest', req); // route via workflow if one is active
  AppState.save();
  if (typeof auditLog === 'function') auditLog('delete_request', 'Deletion requested: ' + req.recordType + ' ' + id, { reason, recordLabel });
  closeModal('genericModal');
  showToast('Deletion request submitted · awaiting admin review', 'success', 4000);
}

// ── Render the Deletion Requests page ─────────────────────