function renderRisks(){
const risks=(AppState.data.risks||[]).filter(r=>!r._deleted);
$('#risks').innerHTML=`<div class="section-header" style="margin-bottom:14px">
<div class="section-title">Risk Register</div>
<button class="btn btn-primary btn-sm" onclick="showAddRisk(detailProjectId)"><i class="fas fa-plus"></i> New Risk</button></div>
<div class="grid grid-4" style="margin-bottom:14px">
${sc('fas fa-shield-alt','Total Risks',risks.length,'Identified','#f0a450','rgba(240,164,80,.15)')}
${sc('fas fa-exclamation-triangle','Active',risks.filter(r=>r.status==='active').length,'Require attention','#f85149','rgba(248,81,73,.15)')}
${sc('fas fa-check-circle','Mitigated',risks.filter(r=>r.status==='mitigated').length,'Under control','#3fb950','rgba(63,185,80,.15)')}
${sc('fas fa-lock','Closed',risks.filter(r=>r.status==='closed').length,'Resolved','#8b949e','rgba(139,148,158,.15)')}
</div>
<div class="grid grid-2" style="margin-bottom:14px">
<div class="card">
<div class="card-title" style="margin-bottom:10px">Risk Heat Map (Probability &#215; Impact)</div>
<div style="font-size:10px;color:var(--text-secondary);margin-bottom:4px">Impact &#8594;</div>
<div style="display:flex;gap:6px">
<div style="writing-mode:vertical-rl;transform:rotate(180deg);font-size:10px;color:var(--text-secondary);align-self:center">Probability</div>
<div>
<div style="display:flex;gap:3px;margin-bottom:3px;margin-left:18px">${[1,2,3,4,5].map(i=>`<div style="width:40px;text-align:center;font-size:9px;color:var(--text-secondary)">${i}</div>`).join('')}</div>
${[5,4,3,2,1].map(prob=>`<div style="display:flex;gap:3px;margin-bottom:3px;align-items:center">
<div style="width:18px;text-align:right;font-size:9px;color:var(--text-secondary)">${prob}</div>
${[1,2,3,4,5].map(imp=>{
const score=prob*imp,rc=risks.filter(r=>r.probability===prob&&r.impact===imp);
const col=score>=15?'#c5221f':score>=8?'#e37400':score>=4?'#f9ab00':'#137333';
return`<div style="width:40px;height:40px;border-radius:4px;background:${col}22;border:1px solid ${col}44;display:flex;align-items:center;justify-content:center" title="Score ${score}">
${rc.length?`<span style="font-size:14px;font-weight:700;color:${col}">${rc.length}</span>`:`<span style="font-size:8px;color:${col};opacity:.4">${score}</span>`}</div>`;
}).join('')}</div>`).join('')}
<div style="display:flex;gap:8px;margin-top:8px;margin-left:18px;flex-wrap:wrap">
${[['#c5221f','Critical 15+'],['#e37400','High 8-14'],['#f9ab00','Medium 4-7'],['#137333','Low &lt;4']].map(([c,l])=>`<div style="display:flex;align-items:center;gap:3px"><div style="width:10px;height:10px;border-radius:2px;background:${c}33;border:1px solid ${c}66"></div><span style="font-size:9px">${l}</span></div>`).join('')}
</div></div></div>
</div>
<div class="card"><div class="card-title">Risks by Category</div><canvas id="riskCatChart" height="180" style="width:100%"></canvas></div>
</div>
<div class="card"><div class="table-wrap"><table>
<thead><tr><th>ID</th><th>Project</th><th>Description</th><th>Category</th><th>P</th><th>I</th><th>Score</th><th>Mitigation</th><th>Owner</th><th>Due</th><th>Status</th></tr></thead>
<tbody>${_pgSlice("risks",risks).map(r=>{const score=r.probability*r.impact;const sc2=score>=15?'var(--accent-red)':score>=8?'var(--accent-amber)':'var(--accent-green)';return`<tr>
<td style="font-size:10px;font-family:var(--font-mono)">${r.id}</td>
<td><span class="badge badge-blue">${r.projectId}</span></td>
<td style="font-size:11px;max-width:165px">${r.description}</td>
<td><span class="badge badge-purple">${r.category}</span></td>
<td style="font-family:var(--font-mono);text-align:center;font-weight:700">${r.probability}</td>
<td style="font-family:var(--font-mono);text-align:center;font-weight:700">${r.impact}</td>
<td><span class="badge" style="background:${sc2}22;color:${sc2};font-size:12px;font-weight:700">${score}</span></td>
<td style="font-size:10px;color:var(--text-secondary);max-width:140px">${r.mitigation.substring(0,45)}...</td>
<td><div style="display:flex;align-items:center;gap:4px">${avatarH(r.owner,22)}<span style="font-size:10px">${r.owner.split(' ')[0]}</span></div></td>
<td style="font-size:10px;font-family:var(--font-mono);color:${isOverdue(r.dueDate)?'var(--accent-red)':'inherit'}">${r.dueDate}</td>
<td>${sBadge(r.status)}</td>
</tr>`;}).join('')}</tbody></table>${_pgNav("risks",risks,renderRisks)}</div></div>`;
setTimeout(()=>{const c=$('#riskCatChart');if(c){c.width=c.parentElement.offsetWidth-30;const cats=[...new Set(risks.map(r=>r.category))];drawBar('riskCatChart',cats,cats.map(ct=>risks.filter(r=>r.category===ct).length),'#f0a450');}},50);}

function showAddRisk(pid){
if(!pid && typeof detailProjectId !== 'undefined') pid = detailProjectId;
$('#genericModalTitle').textContent='New Risk';
$('#genericModalBody').innerHTML=`<div class="form-grid">
<div class="form-group"><label class="form-label">Project</label><select class="form-select" id="gProj">${(AppState.data.projects||[]).map(p=>`<option value="${p.id}" ${p.id===pid?'selected':''}>${p.id}${p.name?' — '+p.name.substring(0,30):''}</option>`).join('')}</select></div>
<div class="form-group"><label class="form-label">Category</label><select class="form-select" id="gCat">${_getDropdown('risk_categories').map(c=>`<option>${c}</option>`).join('')}</select></div>
<div class="form-group" style="grid-column:1/-1"><label class="form-label">Risk Description *</label><input class="form-input" id="gDesc" placeholder="Describe the risk"></div>
<div class="form-group"><label class="form-label">Probability (1-5)</label><input class="form-input" type="number" id="gProb" min="1" max="5" value="3"></div>
<div class="form-group"><label class="form-label">Impact (1-5)</label><input class="form-input" type="number" id="gImp" min="1" max="5" value="3"></div>
<div class="form-group" style="grid-column:1/-1"><label class="form-label">Mitigation Plan</label><textarea class="form-textarea" id="gMit" placeholder="Mitigation measures..."></textarea></div>
<div class="form-group"><label class="form-label">Risk Owner</label><input class="form-input" id="gOwner" placeholder="Owner name"></div>
<div class="form-group"><label class="form-label">Due Date</label><input class="form-input" type="date" id="gDate"></div>
</div>`;
$('#genericModalFooter').innerHTML=`<button class="btn btn-secondary" onclick="closeModal('genericModal')">Cancel</button><button class="btn btn-primary" onclick="saveRisk()">Add Risk</button>`;
openModal('genericModal');}

function saveRisk(){
if(!_req(['gDesc','gOwner','gDate'])){showToast('Fill in required fields','error');return;}
const r={id:'RSK-'+((AppState.data.risks||[]).length+1).toString().padStart(3,'0'),projectId:$('#gProj').value,description:$('#gDesc').value,category:$('#gCat').value,probability:parseInt($('#gProb').value)||3,impact:parseInt($('#gImp').value)||3,mitigation:$('#gMit').value,owner:$('#gOwner').value,dueDate:$('#gDate').value,status:'active'};
AppState.data.risks.push(r);AppState.save();closeModal('genericModal');renderRisks();showToast('Risk added','success');buildSidebar();}
