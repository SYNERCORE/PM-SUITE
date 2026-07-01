function renderActions(){
const actions=(AppState.data.actions||[]).filter(a=>!a._deleted);
$('#actions').innerHTML=`<div class="section-header" style="margin-bottom:14px">
<div class="section-title">Action Items Tracker</div>
<button class="btn btn-primary btn-sm" onclick="showAddAction(detailProjectId)"><i class="fas fa-plus"></i> New Action</button></div>
<div class="grid grid-4" style="margin-bottom:14px">
${sc('fas fa-clipboard-list','Total Actions',actions.length,'All items','#388bfd','rgba(56,139,253,.15)')}
${sc('fas fa-exclamation-circle','Overdue',actions.filter(a=>a.status==='overdue').length,'Past due','#f85149','rgba(248,81,73,.15)')}
${sc('fas fa-spinner','In Progress',actions.filter(a=>a.status==='inprogress').length,'Being worked on','#f0a450','rgba(240,164,80,.15)')}
${sc('fas fa-check','Completed',actions.filter(a=>a.status==='closed').length,'Resolved','#3fb950','rgba(63,185,80,.15)')}
</div>
<div class="card"><div class="table-wrap"><table>
<thead><tr><th>ID</th><th>Project</th><th>Action</th><th>Assignee</th><th>Source</th><th>Due Date</th><th>Priority</th><th>Status</th><th></th></tr></thead>
<tbody>${_pgSlice("actions",actions).map(a=>`<tr>
<td style="font-size:10px;font-family:var(--font-mono)">${a.id}</td>
<td><span class="badge badge-blue">${a.projectId}</span></td>
<td style="font-size:12px;font-weight:500;max-width:200px">${a.description}</td>
<td><div style="display:flex;align-items:center;gap:5px">${avatarH(a.assignee)}<span style="font-size:11px">${a.assignee.split(' ')[0]}</span></div></td>
<td><span class="badge badge-gray">${a.source}</span></td>
<td style="font-size:11px;font-family:var(--font-mono);color:${a.status==='overdue'?'var(--accent-red)':isOverdue(a.dueDate)?'var(--accent-amber)':'inherit'}">${a.dueDate}</td>
<td>${pBadge(a.priority)}</td><td>${sBadge(a.status)}</td>
<td><button class="btn btn-success btn-sm btn-icon" onclick="closeAction('${a.id}')" title="Mark closed"><i class="fas fa-check"></i></button></td>
</tr>`).join('')}</tbody></table>${_pgNav("actions",actions,typeof renderActions==="function"?renderActions:null)}</div></div>`;}

function showAddAction(pid){
if(!pid && typeof detailProjectId !== 'undefined') pid = detailProjectId;
$('#genericModalTitle').textContent='New Action Item';
$('#genericModalBody').innerHTML=`<div class="form-grid">
<div class="form-group"><label class="form-label">Project</label><select class="form-select" id="gProj">${(AppState.data.projects||[]).map(p=>`<option value="${p.id}" ${p.id===pid?'selected':''}>${p.id}${p.name?' — '+p.name.substring(0,30):''}</option>`).join('')}</select></div>
<div class="form-group"><label class="form-label">Source</label><input class="form-input" id="gSrc" placeholder="e.g., Review Meeting"></div>
<div class="form-group" style="grid-column:1/-1"><label class="form-label">Description *</label><input class="form-input" id="gDesc" placeholder="Action description"></div>
<div class="form-group"><label class="form-label">Assigned To</label><input class="form-input" id="gAss" placeholder="Person name"></div>
<div class="form-group"><label class="form-label">Due Date</label><input class="form-input" type="date" id="gDate"></div>
<div class="form-group"><label class="form-label">Priority</label><select class="form-select" id="gPri">${_getDropdown('action_priority').map(p=>`<option>${p}</option>`).join('')}</select></div>
</div>`;
$('#genericModalFooter').innerHTML=`<button class="btn btn-secondary" onclick="closeModal('genericModal')">Cancel</button><button class="btn btn-primary" onclick="saveAction()">Create</button>`;
openModal('genericModal');}

function saveAction(){
if(!_req(['gDesc','gAss','gDate'])){showToast('Fill in required fields','error');return;}
const a={id:'ACT-'+((AppState.data.actions||[]).length+1).toString().padStart(3,'0'),projectId:$('#gProj').value,description:$('#gDesc').value,assignee:$('#gAss').value,source:$('#gSrc').value,dueDate:$('#gDate').value,priority:$('#gPri').value,status:'open'};
AppState.data.actions.push(a);AppState.save();closeModal('genericModal');renderActions();showToast('Action created','success');buildSidebar();}

function closeAction(id){const a=(AppState.data.actions||[]).find(a=>a.id===id);if(a){a.status='closed';AppState.save();renderActions();showToast('Action closed','success');buildSidebar();}}
function deleteAction(id){ return requestOrDelete('actions', id); }
function deleteRisk(id){ return requestOrDelete('risks', id); }

// ── DOCUMENTS MODULE ─────────────────────────────────────


// ═══════════════════════════════════════════════════════════
// ── REFERENCE LIBRARY — company-wide documents ────────────
// ── (Work Methodology, ITP, SOW, Procedures, etc.) ────────
// ═══════════════════════════════════════════════════════════

const LIB_CATEGORIES = [
  { id: 'Work Methodology', icon: 'fa-diagram-project', color: '#388bfd' },
  { id: 'ITP', icon: 'fa-clipboard-check', color: '#3fb950', full: 'Inspection Test Plan' },
  { id: 'Scope of Works', icon: 'fa-list-check', color: '#f0a450' },
  { id: 'Procedure', icon: 'fa-route', color: '#bc8cff' },
  { id: 'Template', icon: 'fa-file-lines', color: '#39d3f2' },
  { id: 'Standard', icon: 'fa-certificate', color: '#fb8f44' },
  { id: 'Policy', icon: 'fa-scale-balanced', color: '#f85149' },
  { id: 'Manual', icon: 'fa-book-open', color: '#8b949e' },
  { id: 'Form', icon: 'fa-file-pen', color: '#d97706' },
  { id: 'Other', icon: 'fa-file', color: '#6e7681' },
];
let _libFilter = 'all';
let _libSearch = '';
let _libShowSuperseded = false;
