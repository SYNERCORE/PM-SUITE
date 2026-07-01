function renderQAQC(){
const qaqc=(AppState.data.qaqc||[]).filter(q=>!q._deleted);
$('#qaqc').innerHTML=`<div class="section-header" style="margin-bottom:14px">
<div class="section-title">QA/QC Management</div>
<button class="btn btn-primary btn-sm" onclick="showAddInspection(detailProjectId)"><i class="fas fa-plus"></i> New IR</button></div>
<div class="grid grid-4" style="margin-bottom:14px">
${sc('fas fa-clipboard-check','Total IRs',qaqc.length,'Inspection records','#388bfd','rgba(56,139,253,.15)')}
${sc('fas fa-check-double','Approved',qaqc.filter(q=>q.status==='approved').length,'Passed','#3fb950','rgba(63,185,80,.15)')}
${sc('fas fa-exclamation-triangle','Open NCRs',qaqc.filter(q=>q.type==='NCR'&&q.status==='open').length,'Non-conformances','#f85149','rgba(248,81,73,.15)')}
${sc('fas fa-list','Punch Items',qaqc.filter(q=>q.type==='Punch'&&q.status==='open').length,'Open punch list','#f0a450','rgba(240,164,80,.15)')}
</div>
<div class="tabs">
${['All','Inspection','NCR','Punch','Test','Audit'].map((t,i)=>`<div class="tab ${i===0?'active':''}" onclick="filterQAQC('${t}',this)">${t}</div>`).join('')}
</div>
<div id="qaqcTable"></div>`;renderQAQCTable('All');}

function filterQAQC(type,el){$$('.tab').forEach(t=>t.classList.remove('active'));el.classList.add('active');renderQAQCTable(type);}
function renderQAQCTable(type){
let items=AppState.data.qaqc;
if(type!=='All')items=items.filter(q=>q.type===type);
const tc={Inspection:'badge-blue',NCR:'badge-red',Punch:'badge-amber',Test:'badge-cyan',Audit:'badge-purple'};
$('#qaqcTable').innerHTML=`<div class="card"><div class="table-wrap"><table>
<thead><tr><th>IR Number</th><th>Type</th><th>Project</th><th>Description</th><th>Inspector</th><th>Date</th><th>Discipline</th><th>Result</th><th>Status</th></tr></thead>
<tbody>${_pgSlice("qaqc",items).map(q=>`<tr>
<td style="font-size:10px;font-family:var(--font-mono);font-weight:700">${q.id}</td>
<td><span class="badge ${tc[q.type]||'badge-gray'}">${q.type}</span></td>
<td><span class="badge badge-blue">${q.projectId}</span></td>
<td style="font-size:11px;max-width:190px">${q.description}</td>
<td><div style="display:flex;align-items:center;gap:5px">${avatarH(q.inspector)}<span style="font-size:11px">${q.inspector.split(' ')[0]}</span></div></td>
<td style="font-size:11px;font-family:var(--font-mono)">${q.date}</td>
<td><span class="badge badge-gray">${q.discipline}</span></td>
<td><span class="badge ${q.result==='Pass'?'badge-green':q.result==='Fail'?'badge-red':'badge-gray'}">${q.result||'Pending'}</span></td>
<td>${sBadge(q.status)}</td>
</tr>`).join('')}</tbody></table>${_pgNav("qaqc",items,typeof renderQAQC==="function"?renderQAQC:null)}</div></div>`;}

function showAddInspection(pid){
if(!pid && typeof detailProjectId !== 'undefined') pid = detailProjectId;
$('#genericModalTitle').textContent='New Inspection Record';
$('#genericModalBody').innerHTML=`<div class="form-grid">
<div class="form-group"><label class="form-label">Project</label><select class="form-select" id="gProj">${(AppState.data.projects||[]).map(p=>`<option value="${p.id}" ${p.id===pid?'selected':''}>${p.id}${p.name?' — '+p.name.substring(0,30):''}</option>`).join('')}</select></div>
<div class="form-group"><label class="form-label">Type</label><select class="form-select" id="gType">${_getDropdown('qaqc_types').map(t=>`<option>${t}</option>`).join('')}</select></div>
<div class="form-group" style="grid-column:1/-1"><label class="form-label">Description *</label><input class="form-input" id="gDesc" placeholder="Inspection description"></div>
<div class="form-group"><label class="form-label">Inspector</label><input class="form-input" id="gInsp" placeholder="Inspector name"></div>
<div class="form-group"><label class="form-label">Date</label><input class="form-input" type="date" id="gDate" value="${new Date().toISOString().split('T')[0]}"></div>
<div class="form-group"><label class="form-label">Discipline</label><input class="form-input" id="gDisc" placeholder="e.g., Structural"></div>
<div class="form-group"><label class="form-label">Result</label><select class="form-select" id="gRes"><option value="">Pending</option><option>Pass</option><option>Fail</option></select></div>
</div>`;
$('#genericModalFooter').innerHTML=`<button class="btn btn-secondary" onclick="closeModal('genericModal')">Cancel</button><button class="btn btn-primary" onclick="saveInspection()">Create IR</button>`;
openModal('genericModal');}

function saveInspection(){
if(!_req(['gDesc','gInsp','gDate'])){showToast('Fill in required fields','error');return;}
const item={id:'IR-'+((AppState.data.qaqc||[]).length+1).toString().padStart(3,'0'),projectId:$('#gProj').value,type:$('#gType').value,description:$('#gDesc').value,inspector:$('#gInsp').value,date:$('#gDate').value,discipline:$('#gDisc').value,result:$('#gRes').value,status:'pending'};
AppState.data.qaqc.push(item);AppState.save();closeModal('genericModal');renderQAQC();showToast('IR created','success');buildSidebar();}

