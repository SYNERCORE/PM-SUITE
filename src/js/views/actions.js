function _actRowHTML(a){
const updates=a.updates||[];
const last=updates[updates.length-1];
const lastText=last?`<div style="font-size:11px;color:var(--text-primary);line-height:1.5;white-space:pre-line">${last.text.length>120?last.text.substring(0,120)+'…':last.text}</div><div style="font-size:10px;color:var(--text-secondary);margin-top:2px">${last.by||'—'} · ${last.at?last.at.slice(0,10):'—'}</div>`:`<span style="font-size:11px;color:var(--text-muted)">No updates yet</span>`;
return`<tr>
<td style="font-size:10px;font-family:var(--font-mono)">${a.id}</td>
<td style="font-size:12px;font-weight:500;max-width:180px">${a.description}</td>
<td><div style="display:flex;align-items:center;gap:5px">${avatarH(a.assignee)}<span style="font-size:11px">${a.assignee.split(' ')[0]}</span></div></td>
<td style="font-size:11px;font-family:var(--font-mono);color:${a.status==='overdue'?'var(--accent-red)':isOverdue(a.dueDate)?'var(--accent-amber)':'inherit'}">${a.dueDate}</td>
<td>${pBadge(a.priority)}</td><td>${sBadge(a.status)}</td>
<td style="max-width:220px">${lastText}</td>
<td><div style="display:flex;gap:4px">
  <button class="btn btn-secondary btn-sm btn-icon" onclick="showActionUpdates('${a.id}')" title="Updates (${updates.length})" style="position:relative">
    <i class="fas fa-comments"></i>${updates.length?`<span style="position:absolute;top:-4px;right:-4px;background:var(--accent-blue);color:#fff;font-size:8px;padding:1px 4px;border-radius:6px;font-weight:700">${updates.length}</span>`:''}
  </button>
  <button class="btn btn-success btn-sm btn-icon" onclick="closeAction('${a.id}')" title="Mark closed"><i class="fas fa-check"></i></button>
</div></td>
</tr>`;}

const _actThead=`<thead><tr><th>ID</th><th>Action</th><th>Assignee</th><th>Due Date</th><th>Priority</th><th>Status</th><th>Latest Update</th><th></th></tr></thead>`;

function renderActions(){
const actions=(AppState.data.actions||[]).filter(a=>!a._deleted);
// Group by project
const groups={};
actions.forEach(a=>{const k=a.projectId||'—';if(!groups[k])groups[k]=[];groups[k].push(a);});
const projectMap=Object.fromEntries((AppState.data.projects||[]).map(p=>[p.id,p]));
const groupHTML=Object.entries(groups).map(([pid,grp])=>{
const proj=projectMap[pid];
const projName=proj?`${pid} — ${proj.name||''}`:pid;
const open=grp.filter(a=>a.status!=='closed').length;
const closed=grp.filter(a=>a.status==='closed').length;
const overdue=grp.filter(a=>a.status==='overdue'||isOverdue(a.dueDate)).length;
return`<div class="card" style="margin-bottom:12px">
<div style="display:flex;align-items:center;justify-content:space-between;padding:10px 14px;border-bottom:1px solid var(--border);background:linear-gradient(90deg,rgba(56,139,253,.08),transparent);cursor:pointer" onclick="this.nextElementSibling.style.display=this.nextElementSibling.style.display==='none'?'':'none';this.querySelector('.act-chevron').style.transform=this.nextElementSibling.style.display===''?'':'rotate(-90deg)'">
  <div style="display:flex;align-items:center;gap:10px">
    <i class="fas fa-chevron-down act-chevron" style="font-size:10px;color:var(--accent-blue);transition:.2s"></i>
    <span style="font-size:12px;font-weight:700;color:var(--accent-blue)">${projName}</span>
  </div>
  <div style="display:flex;gap:6px;align-items:center">
    <span class="badge badge-blue" style="font-size:10px">${grp.length} action${grp.length!==1?'s':''}</span>
    ${open?`<span class="badge badge-amber" style="font-size:10px">${open} open</span>`:''}
    ${overdue?`<span class="badge badge-red" style="font-size:10px">${overdue} overdue</span>`:''}
    ${closed?`<span class="badge badge-green" style="font-size:10px">${closed} closed</span>`:''}
    <button class="btn btn-primary btn-sm" style="font-size:10px;padding:2px 8px" onclick="event.stopPropagation();showAddAction('${pid}')"><i class="fas fa-plus"></i> Add</button>
  </div>
</div>
<div><div class="table-wrap"><table>${_actThead}<tbody>${grp.map(a=>_actRowHTML(a)).join('')}</tbody></table></div></div>
</div>`;}).join('');
$('#actions').innerHTML=`<div class="section-header" style="margin-bottom:14px">
<div class="section-title">Action Items Tracker</div>
<button class="btn btn-primary btn-sm" onclick="showAddAction(detailProjectId)"><i class="fas fa-plus"></i> New Action</button></div>
<div class="grid grid-4" style="margin-bottom:14px">
${sc('fas fa-clipboard-list','Total Actions',actions.length,'All items','#388bfd','rgba(56,139,253,.15)')}
${sc('fas fa-exclamation-circle','Overdue',actions.filter(a=>a.status==='overdue').length,'Past due','#f85149','rgba(248,81,73,.15)')}
${sc('fas fa-spinner','In Progress',actions.filter(a=>a.status==='inprogress').length,'Being worked on','#f0a450','rgba(240,164,80,.15)')}
${sc('fas fa-check','Completed',actions.filter(a=>a.status==='closed').length,'Resolved','#3fb950','rgba(63,185,80,.15)')}
</div>
${groupHTML||'<div class="empty-state"><i class="fas fa-clipboard-list"></i><p>No action items yet.</p></div>'}`;}

function showActionUpdates(id){
const a=(AppState.data.actions||[]).find(x=>x.id===id);
if(!a)return;
if(!a.updates)a.updates=[];
const user=AppState.currentUser?.displayName||AppState.currentUser?.email||'Me';
function _renderUpdates(){
  const rows=a.updates.length?[...a.updates].reverse().map(u=>`
    <div style="display:flex;gap:10px;padding:10px 0;border-bottom:1px solid var(--border)">
      <div style="flex-shrink:0">${avatarH(u.by||'?',28)}</div>
      <div style="flex:1">
        <div style="font-size:12px;line-height:1.6;white-space:pre-line">${u.text}</div>
        <div style="font-size:10px;color:var(--text-secondary);margin-top:4px"><strong>${u.by||'Unknown'}</strong> · ${u.at?new Date(u.at).toLocaleString('en',{month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'}):'—'}</div>
      </div>
    </div>`).join(''):`<div style="text-align:center;padding:24px;color:var(--text-muted);font-size:12px"><i class="fas fa-comments" style="font-size:24px;opacity:.3;display:block;margin-bottom:8px"></i>No updates yet — be the first to log one.</div>`;
  const body=$('#genericModalBody');if(body)body.querySelector('#_auFeed').innerHTML=rows;
}
$('#genericModalTitle').textContent=`Updates — ${a.id}`;
$('#genericModalBody').innerHTML=`
<div style="background:var(--bg-hover);border-radius:8px;padding:10px 14px;margin-bottom:14px">
  <div style="font-size:11px;font-weight:600;color:var(--text-secondary);margin-bottom:2px">ACTION</div>
  <div style="font-size:13px;font-weight:600">${a.description}</div>
  <div style="display:flex;gap:10px;margin-top:6px;font-size:11px;color:var(--text-secondary)">
    <span>${avatarH(a.assignee,18)} ${a.assignee}</span>
    <span>·</span><span>Due: ${a.dueDate}</span>
    <span>·</span><span id="_auStatusBadge">${sBadge(a.status)}</span>
  </div>
</div>
<div style="display:flex;gap:10px;margin-bottom:12px">
  <div style="flex:1">
    <label class="form-label">Log an Update</label>
    <textarea id="_auText" class="form-input" rows="3" placeholder="What happened? What's the status? Any blockers?" style="resize:vertical"></textarea>
  </div>
  <div style="width:140px">
    <label class="form-label">Change Status</label>
    <select class="form-select" id="_auStatus">
      <option value="">— no change —</option>
      <option value="open" ${a.status==='open'?'selected':''}>Open</option>
      <option value="inprogress" ${a.status==='inprogress'?'selected':''}>In Progress</option>
      <option value="overdue" ${a.status==='overdue'?'selected':''}>Overdue</option>
      <option value="closed" ${a.status==='closed'?'selected':''}>Closed</option>
    </select>
  </div>
</div>
<div id="_auFeed" style="max-height:280px;overflow-y:auto"></div>`;
$('#genericModalFooter').innerHTML=`
<button class="btn btn-secondary" onclick="closeModal('genericModal')">Close</button>
<button class="btn btn-primary" onclick="saveActionUpdate('${id}')"><i class="fas fa-paper-plane"></i> Log Update</button>`;
_renderUpdates();
openModal('genericModal');}

function saveActionUpdate(id){
const text=($('#_auText')?.value||'').trim();
const newStatus=($('#_auStatus')?.value||'').trim();
if(!text&&!newStatus){showToast('Type an update or change the status first','warning');return;}
const a=(AppState.data.actions||[]).find(x=>x.id===id);
if(!a)return;
if(!a.updates)a.updates=[];
const user=AppState.currentUser?.displayName||AppState.currentUser?.email||'Me';
if(newStatus&&newStatus!==a.status){
  const oldStatus=a.status;
  a.status=newStatus;
  const statusLabel={open:'Open',inprogress:'In Progress',overdue:'Overdue',closed:'Closed'};
  const autoNote=`Status changed: ${statusLabel[oldStatus]||oldStatus} → ${statusLabel[newStatus]||newStatus}`;
  a.updates.push({text:text?(autoNote+'\n'+text):autoNote,by:user,at:new Date().toISOString()});
  const badge=$('#_auStatusBadge');if(badge)badge.innerHTML=sBadge(newStatus);
}else if(text){
  a.updates.push({text,by:user,at:new Date().toISOString()});
}
AppState.save();
const ta=$('#_auText');if(ta)ta.value='';
// Re-render the feed inside the open modal
const rows=[...a.updates].reverse().map(u=>`
  <div style="display:flex;gap:10px;padding:10px 0;border-bottom:1px solid var(--border)">
    <div style="flex-shrink:0">${avatarH(u.by||'?',28)}</div>
    <div style="flex:1">
      <div style="font-size:12px;line-height:1.5">${u.text}</div>
      <div style="font-size:10px;color:var(--text-secondary);margin-top:4px"><strong>${u.by||'Unknown'}</strong> · ${u.at?new Date(u.at).toLocaleString('en',{month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'}):'—'}</div>
    </div>
  </div>`).join('');
const feed=$('#_auFeed');if(feed)feed.innerHTML=rows;
showToast('Update logged','success');}

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
const _actMax=Math.max(0,...(AppState.data.actions||[]).map(x=>{const m=x.id&&x.id.match(/(\d+)$/);return m?parseInt(m[1]):0;}));
const a={id:'ACT-'+(_actMax+1).toString().padStart(3,'0'),projectId:$('#gProj').value,description:$('#gDesc').value,assignee:$('#gAss').value,source:$('#gSrc').value,dueDate:$('#gDate').value,priority:$('#gPri').value,status:'open'};
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
