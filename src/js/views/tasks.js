// ── Parent/Child (WBS) task hierarchy ─────────────────────────
function _taskHasChildren(id,tasks){return (tasks||AppState.data.tasks||[]).some(t=>t.parentId===id&&!t._deleted);}

// Auto-WBS: compute next WBS number for a task given its project and parent
function _autoWbs(projId,parentId,editId){
  const all=(AppState.data.tasks||[]).filter(t=>t.projectId===projId&&!t._deleted&&t.id!==editId);
  if(!parentId){
    const roots=all.filter(t=>!t.parentId);
    const nums=roots.map(t=>{const n=parseInt(t.wbs);return isNaN(n)?0:n;});
    return String((nums.length?Math.max(...nums):0)+1);
  }
  const par=all.find(t=>t.id===parentId);
  const parWbs=par?.wbs||'';
  const siblings=all.filter(t=>t.parentId===parentId);
  const last=siblings.reduce((mx,t)=>{
    const parts=(t.wbs||'').split('.');
    const n=parseInt(parts[parts.length-1]);
    return isNaN(n)?mx:Math.max(mx,n);
  },0);
  return parWbs?(parWbs+'.'+(last+1)):String(last+1);
}

// Recalculate all WBS numbers for a project so they stay sequential
function _recalcAllWbs(projId){
  const all=AppState.data.tasks||[];
  const pool=all.filter(t=>t.projectId===projId&&!t._deleted);
  const assign=(parentId,prefix)=>{
    const children=pool.filter(t=>(t.parentId||'')===(parentId||''));
    children.sort((a,b)=>{
      const ap=(a.wbs||'').split('.'),bp=(b.wbs||'').split('.');
      const aw=parseInt(ap[ap.length-1])||0,bw=parseInt(bp[bp.length-1])||0;
      if(aw!==bw)return aw-bw;
      return (a.createdAt||a.id)<(b.createdAt||b.id)?-1:1;
    });
    children.forEach((t,i)=>{
      t.wbs=prefix?(prefix+'.'+(i+1)):String(i+1);
      assign(t.id,t.wbs);
    });
  };
  assign('','');
}
// true if candidateId sits anywhere under ofId (walks up the parent chain)
function _taskIsDescendant(candidateId,ofId,tasks){
  const all=tasks||AppState.data.tasks||[];
  let cur=all.find(t=>t.id===candidateId);
  const seen=new Set();
  while(cur&&cur.parentId&&!seen.has(cur.id)){
    if(cur.parentId===ofId)return true;
    seen.add(cur.id);
    cur=all.find(t=>t.id===cur.parentId);
  }
  return false;
}
// DFS order: roots first, each followed by its children. Tasks whose parent
// is missing from the list (filtered out / deleted) surface as roots.
function _orderTasksHier(list){
  const ids=new Set(list.map(t=>t.id));
  const out=[];const visited=new Set();
  const add=(t,depth)=>{
    if(visited.has(t.id))return; // cycle guard
    visited.add(t.id);
    out.push({t,depth});
    list.filter(c=>c.parentId===t.id).forEach(c=>add(c,Math.min(depth+1,6)));
  };
  list.filter(t=>!t.parentId||!ids.has(t.parentId)).forEach(t=>add(t,0));
  list.forEach(t=>{if(!visited.has(t.id))add(t,0);}); // orphans in a cycle
  return out;
}
// Summary tasks: dates = span of children, progress = duration-weighted avg.
// Bottom-up via repeated passes (handles nesting up to 10 levels).
function _applySummaryRollups(projId){
  const tasks=(AppState.data.tasks||[]).filter(t=>t.projectId===projId&&!t._deleted);
  for(let pass=0;pass<10;pass++){
    let changed=false;
    tasks.forEach(p=>{
      const kids=tasks.filter(c=>c.parentId===p.id);
      if(!kids.length)return;
      const starts=kids.map(k=>k.startDate).filter(Boolean);
      const ends=kids.map(k=>k.endDate).filter(Boolean);
      const ns=starts.length?starts.reduce((a,b)=>a<b?a:b):p.startDate;
      const ne=ends.length?ends.reduce((a,b)=>a>b?a:b):p.endDate;
      let wSum=0,pSum=0;
      kids.forEach(k=>{
        const w=Math.max(1,k.durationHrs||((k.startDate&&k.endDate&&typeof daysBetween==='function')?(daysBetween(k.startDate,k.endDate)+1)*8:8));
        wSum+=w;pSum+=w*(k.progress||0);
      });
      const np=wSum?Math.round(pSum/wSum):(p.progress||0);
      if(p.startDate!==ns||p.endDate!==ne||p.progress!==np){p.startDate=ns;p.endDate=ne;p.progress=np;changed=true;}
      if(np>=100&&p.status!=='done'){p.status='done';changed=true;}
      else if(np>0&&np<100&&p.status==='todo'){p.status='inprogress';changed=true;}
    });
    if(!changed)break;
  }
}

function _recalcProjectProgress(projId){
  const p=(AppState.data.projects||[]).find(x=>x.id===projId);
  if(!p)return;
  const tasks=(AppState.data.tasks||[]).filter(t=>t.projectId===projId&&!t._deleted);
  if(!tasks.length)return;
  const roots=tasks.filter(t=>!t.parentId||!tasks.find(x=>x.id===t.parentId));
  if(!roots.length)return;
  let wSum=0,pSum=0,plSum=0;
  const today=new Date();today.setHours(0,0,0,0);
  const parseYMD=(s)=>{if(!s)return null;const d=new Date(s+'T00:00:00');return isNaN(d)?null:d;};
  roots.forEach(t=>{
    const w=Math.max(1,t.durationHrs||((t.startDate&&t.endDate&&typeof daysBetween==='function')?(daysBetween(t.startDate,t.endDate)+1)*8:8));
    wSum+=w;pSum+=w*(t.progress||0);
    // Planned % at "today" for this task: 0 before start, 100 after end, linear in between.
    const s=parseYMD(t.startDate), e=parseYMD(t.endDate||t.startDate);
    let taskPlanned=0;
    if(s&&e){
      if(today<=s)taskPlanned=0;
      else if(today>=e)taskPlanned=100;
      else{const span=e-s||1;taskPlanned=Math.round(((today-s)/span)*100);}
    }
    plSum+=w*taskPlanned;
  });
  p.progress=wSum?Math.round(pSum/wSum):0;
  p.plannedProgress=wSum?Math.round(plSum/wSum):0;
}

function _getTaskProjHPD(projectId) {
  const p = (AppState.data.projects||[]).find(p => p.id === projectId);
  return p?.calendar?.hoursPerDay || 8;
}

function renderTasks(){
// Ensure all projects have sequential WBS numbers assigned
const _wbsProjs=new Set((AppState.data.tasks||[]).filter(t=>!t._deleted).map(t=>t.projectId));
let _wbsDirty=false;
_wbsProjs.forEach(pid=>{
  const pool=(AppState.data.tasks||[]).filter(t=>t.projectId===pid&&!t._deleted);
  if(pool.some(t=>!t.wbs)){_recalcAllWbs(pid);_wbsDirty=true;}
});
if(_wbsDirty)AppState.save();
const el=$('#tasks');
el.innerHTML=`<div class="section-header" style="margin-bottom:14px">
<div><div class="section-title">Task Management</div><div class="section-sub">${(AppState.data.tasks||[]).length} tasks total</div></div>
<div style="display:flex;gap:7px;align-items:center">
<select class="form-select" style="width:180px;height:32px" id="taskProjSel" onchange="taskProjectFilter=this.value;renderTaskView()">
<option value="all">All Projects</option>
${(AppState.data.projects||[]).map(p=>`<option value="${p.id}" ${taskProjectFilter===p.id?'selected':''}>${p.id}</option>`).join('')}
</select>
<div style="display:flex;border:1px solid var(--border);border-radius:var(--radius-sm);overflow:hidden">
<div class="tab ${taskView==='kanban'?'active':''}" style="border:none;padding:5px 10px;margin:0" onclick="taskView='kanban';renderTasks()"><i class="fas fa-columns"></i></div>
<div class="tab ${taskView==='table'?'active':''}" style="border:none;padding:5px 10px;margin:0" onclick="taskView='table';renderTasks()"><i class="fas fa-table"></i></div>
</div>
<button class="btn btn-primary btn-sm" onclick="showTaskForm()"><i class="fas fa-plus"></i> New Task</button>
</div></div>
<div id="taskViewContent"></div>`;renderTaskView();}

function getFilteredTasks(){const all=(AppState.data.tasks||[]).filter(t=>!t._deleted);return taskProjectFilter==='all'?all:all.filter(t=>t.projectId===taskProjectFilter);}
function renderTaskView(){
  if(!$('#taskViewContent'))return; // not on tasks page
  if(taskView==='kanban')renderKanban();else renderTaskTable();
}

function renderKanban(){
const container=$('#taskViewContent');
if(!container)return; // not on tasks page, skip render
const tasks=getFilteredTasks();
const cols=[{id:'todo',label:'To Do',color:'#8b949e'},{id:'inprogress',label:'In Progress',color:'#388bfd'},{id:'done',label:'Done',color:'#3fb950'},{id:'blocked',label:'Blocked',color:'#f85149'}];
container.innerHTML=`<div class="kanban-board">
${cols.map(col=>{
const ct=tasks.filter(t=>t.status===col.id);
return`<div class="kanban-col" ondragover="event.preventDefault()" ondrop="dropTask(event,'${col.id}')">
<div class="kanban-col-header">
<div class="kanban-col-title"><div style="width:9px;height:9px;border-radius:50%;background:${col.color}"></div>${col.label}<span class="kanban-count">${ct.length}</span></div>
<button class="btn btn-secondary btn-sm btn-icon" onclick="showTaskForm(null,'${col.id}')"><i class="fas fa-plus"></i></button></div>
${ct.map(t=>`<div class="kanban-card" draggable="true" ondragstart="dragTaskId='${t.id}'" onclick="showTaskForm('${t.id}')">
<div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:5px">
<span style="font-size:9px;font-family:var(--font-mono);color:var(--text-muted)">${t.wbs||t.id}</span>
${t.milestone?'<span style="color:var(--accent-amber)">&#9670;</span>':''}${pBadge(t.priority)}</div>
<div class="kanban-card-title">${esc(t.name)}</div>
${t.progress>0?`<div style="margin-bottom:6px"><div class="progress-bar" style="height:4px"><div class="progress-fill" style="width:${t.progress}%;background:${pColor(t.progress)}"></div></div></div>`:''}
<div class="kanban-card-meta">${avatarH(t.assignee,22)}<span style="font-size:10px;color:var(--text-secondary)">${t.assignee.split(' ')[0]}</span>
<span style="margin-left:auto;font-size:9px;color:${isOverdue(t.endDate)?'var(--accent-red)':'var(--text-muted)'}">${t.endDate}</span></div>
</div>`).join('')}</div>`;}).join('')}</div>`;}

let dragTaskId=null;
function dropTask(e,status){
if(!dragTaskId)return;
const t=(AppState.data.tasks||[]).find(t=>t.id===dragTaskId);
if(t){
  t.status=status;
  // Keep task progress in sync with the column it was dropped into so
  // Physical Progress, EV, CPI, and SPI roll up correctly. Otherwise a
  // manager dragging a card to Done still shows 0% progress everywhere.
  if(status==='done')t.progress=100;
  else if(status==='todo')t.progress=0;
  else if(status==='inprogress'&&(t.progress===0||t.progress===100))t.progress=50;
  // blocked → don't change progress; whatever was there is preserved
  _applySummaryRollups(t.projectId);
  _recalcProjectProgress(t.projectId);
  AppState.save();
  renderTaskView();
  showToast('Task moved','success');
}
dragTaskId=null;}

function renderTaskTable(){
const __ttContainer=$('#taskViewContent');
if(!__ttContainer)return; // not on tasks page
const tasks=getFilteredTasks();
$('#taskViewContent').innerHTML=`<div class="card"><div class="table-wrap"><table>
<thead><tr><th>WBS</th><th>Task</th><th>Project</th><th>Assignee</th><th>End</th><th>Progress</th><th>Status</th><th>Priority</th><th></th></tr></thead>
<tbody>${_pgSlice("tasks",_orderTasksHier(tasks)).map(({t,depth})=>{const isSum=_taskHasChildren(t.id,tasks);return`<tr>
<td style="font-size:10px;font-family:var(--font-mono)">${t.wbs||t.id}</td>
<td><div style="font-weight:${isSum?'700':'500'};font-size:12px;padding-left:${depth*18}px">${isSum?'<i class="fas fa-folder-open" style="font-size:9px;color:var(--accent-cyan);margin-right:5px"></i>':depth>0?'<i class="fas fa-level-up-alt fa-rotate-90" style="font-size:8px;color:var(--text-muted);margin-right:5px"></i>':''}${esc(t.name)}</div><div style="font-size:10px;color:var(--text-secondary);padding-left:${depth*18}px">${esc(t.dept||'')}</div></td>
<td><span class="badge badge-blue">${t.projectId}</span></td>
<td><div style="display:flex;align-items:center;gap:5px">${avatarH(t.assignee)}<span style="font-size:11px">${t.assignee.split(' ')[0]}</span></div></td>
<td style="font-size:11px;font-family:var(--font-mono);color:${isOverdue(t.endDate)?'var(--accent-red)':'inherit'}">${t.endDate}</td>
<td><div style="display:flex;align-items:center;gap:5px"><div class="progress-bar" style="width:65px;height:5px"><div class="progress-fill" style="width:${t.progress}%;background:${pColor(t.progress)}"></div></div><span style="font-size:10px;font-family:var(--font-mono)">${t.progress}%</span></div></td>
<td>${sBadge(t.status)}</td><td>${pBadge(t.priority)}</td>
<td><div style="display:flex;gap:3px">
<button class="btn btn-secondary btn-sm btn-icon" onclick="showTaskForm('${t.id}')"><i class="fas fa-edit"></i></button>
<button class="btn btn-danger btn-sm btn-icon" onclick="deleteTask('${t.id}')"><i class="fas fa-trash"></i></button>
</div></td></tr>`;}).join('')}</tbody></table>${_pgNav("tasks",tasks,typeof renderTaskView==="function"?renderTaskView:null)}</div></div>`;}

let _tEditingId=null; // tracks which task is open in the form

function showTaskForm(id=null,defStatus='todo'){
_tEditingId=id||null;
// Fix #2b: snapshot for conflict detection if editing
if(id && typeof _genericSnapshotForEdit==='function')_genericSnapshotForEdit('task_'+id,'tasks',id);
const t=id?(AppState.data.tasks||[]).find(x=>x.id===id):null;
$('#taskModalTitle').textContent=id?'Edit Task':'New Task';
const _hasPred=!!(t?.predecessors||'').trim();
const _isMile=!!t?.milestone;
const _hpd=_getTaskProjHPD(t?.projectId||taskProjectFilter||'');
const _durVal=t?.durationHrs>0?+(t.durationHrs/_hpd).toFixed(2).replace(/\.?0+$/,''):(_isMile?0:'');
const _isSummary=!!(id&&_taskHasChildren(id));
// For successor tasks: start/end are CPM-computed. For summary tasks: rolled up from children.
const _dateRO=(_hasPred||_isSummary)?'readonly style="opacity:.55;cursor:not-allowed;background:var(--bg-secondary)"':'';
const _dateNote=_isSummary?'<span style="font-size:10px;color:var(--accent-cyan);margin-left:6px"><i class="fas fa-sitemap"></i> Rolled up from subtasks</span>':(_hasPred?'<span style="font-size:10px;color:var(--accent-amber);margin-left:6px"><i class="fas fa-calculator"></i> Computed by CPM</span>':'');
$('#taskModalBody').innerHTML=`<div class="form-grid">
<div class="form-group"><label class="form-label">Project</label><select class="form-select" id="tProj" onchange="_tRefreshParentOptions('${id||''}')">${(AppState.data.projects||[]).map(p=>`<option value="${p.id}" ${(t?.projectId===p.id||taskProjectFilter===p.id)?'selected':''}>${p.id}</option>`).join('')}</select></div>
<div class="form-group"><label class="form-label">WBS Code <span style="font-size:10px;color:var(--text-muted)">auto</span></label><input class="form-input" id="tWbs" value="${t?.wbs||''}" readonly style="opacity:.7;cursor:not-allowed;background:var(--bg-secondary)"></div>
<div class="form-group" style="grid-column:1/-1"><label class="form-label">Parent Task <span style="font-size:10px;color:var(--text-muted)">— makes this a subtask (WBS hierarchy)</span></label><select class="form-select" id="tParent" onchange="_tRefreshWbs('${id||''}')">${_tParentOptionsHTML(id,t?.projectId||(taskProjectFilter!=='all'?taskProjectFilter:((AppState.data.projects||[])[0]?.id||'')),t?.parentId||'')}</select></div>
<div class="form-group" style="grid-column:1/-1"><label class="form-label">Task Name *</label><input class="form-input" id="tName" value="${t?.name||''}" placeholder="Task description"></div>
<div class="form-group"><label class="form-label">Assigned To</label><input class="form-input" id="tAss" value="${t?.assignee||''}" placeholder="Name"></div>
<div class="form-group"><label class="form-label">Department</label><input class="form-input" id="tDept" value="${t?.dept||''}" placeholder="Department"></div>
<div class="form-group"><label class="form-label">Start Date ${_dateNote}</label><input class="form-input" type="date" id="tStart" value="${t?.startDate||''}" ${_dateRO} onchange="_tFormRecalc('start')"></div>
<div class="form-group"><label class="form-label">End Date ${_dateNote}</label><input class="form-input" type="date" id="tEnd" value="${t?.endDate||''}" ${_dateRO} onchange="_tFormRecalc('end')"></div>
<div class="form-group"><label class="form-label">Planned Hours</label><input class="form-input" type="number" id="tPH" value="${t?.plannedHrs||0}"></div>
<div class="form-group"><label class="form-label">Actual Hours</label><input class="form-input" type="number" id="tAH" value="${t?.actualHrs||0}"></div>
<div class="form-group"><label class="form-label">Duration (days) <span style="font-size:10px;color:var(--text-muted)">— working days</span></label><input class="form-input" type="number" id="tDur" step="0.125" min="0" value="${_durVal}" placeholder="e.g. 5" onchange="_tFormRecalc('dur')" ${_isMile?'readonly style="opacity:.55"':''}></div>
<div class="form-group" style="grid-column:1/-1"><label class="form-label">Predecessors <span style="font-size:10px;color:var(--text-muted)">e.g. TSK-001 FS, TSK-002 SS+2d</span></label><div style="display:flex;gap:6px"><input class="form-input" id="tPred" value="${t?.predecessors||''}" placeholder="Leave blank if no dependencies" style="flex:1" onchange="_tFormRecalc('pred')"><button type="button" class="btn btn-secondary btn-sm" style="white-space:nowrap;padding:0 10px" onclick="showPredPicker('${id||''}')"><i class="fas fa-list-ul"></i> Pick</button></div></div>
<div class="form-group"><label class="form-label">Status</label><select class="form-select" id="tStat">${['todo','inprogress','done','blocked'].map(s=>`<option value="${s}" ${(t?.status||defStatus)===s?'selected':''}>${s}</option>`).join('')}</select></div>
<div class="form-group"><label class="form-label">Priority</label><select class="form-select" id="tPri">${['critical','high','medium','low'].map(s=>`<option value="${s}" ${t?.priority===s?'selected':''}>${s}</option>`).join('')}</select></div>
<div class="form-group"><label class="form-label">Progress % <span id="progVal">${t?.progress||0}%</span></label><input type="range" id="tProg" value="${t?.progress||0}" min="0" max="100" style="width:100%;accent-color:var(--accent-blue)" oninput="$('#progVal').textContent=this.value+'%'"></div>
<div class="form-group"><label class="form-label">Milestone</label><select class="form-select" id="tMile" onchange="_tFormRecalc('mile')"><option value="false" ${!_isMile?'selected':''}>No</option><option value="true" ${_isMile?'selected':''}>Yes - Milestone</option></select></div>
</div>
<div class="modal-footer">
<button class="btn btn-secondary" onclick="closeModal('taskModal')">Cancel</button>
<button class="btn btn-primary" onclick="saveTask('${id||''}')"><i class="fas fa-save"></i> ${id?'Update':'Create'}</button>
</div>`; openModal('taskModal');
// Auto-fill WBS for new tasks after form is rendered; also refresh parent options to match resolved project
if(!id) setTimeout(()=>{_tRefreshParentOptions('');_tRefreshWbs('');},0);
// Run live CPM preview immediately so read-only date fields show computed values on open
if(_hasPred) setTimeout(_runFormCPMPreview, 50);
}

// Options for the Parent Task dropdown: same-project tasks, excluding self,
// own descendants (cycle guard) and milestones. Indented to show hierarchy.
function _tParentOptionsHTML(editId,projId,selectedId){
  const all=AppState.data.tasks||[];
  if(!projId)projId=(AppState.data.projects||[])[0]?.id||'';
  const pool=all.filter(t=>t.projectId===projId&&!t._deleted&&!t.milestone&&t.id!==editId&&!(editId&&_taskIsDescendant(t.id,editId,all)));
  const ordered=_orderTasksHier(pool);
  return `<option value="">— None (top-level task) —</option>`+
    ordered.map(({t,depth})=>`<option value="${t.id}" ${selectedId===t.id?'selected':''}>${' '.repeat(depth*3)}${t.wbs||t.id} — ${(t.name||'').substring(0,50)}</option>`).join('');
}
function _tRefreshParentOptions(editId){
  const sel=$('#tParent');if(!sel)return;
  sel.innerHTML=_tParentOptionsHTML(editId||null,$('#tProj')?.value||'',sel.value);
  _tRefreshWbs(editId);
}
function _tRefreshWbs(editId){
  const el=$('#tWbs');if(!el)return;
  el.value=_autoWbs($('#tProj')?.value||'',$('#tParent')?.value||'',editId||'');
}

async function saveTask(id){
// Fix #2b: conflict check before save
if(id && typeof _genericCheckConflict==='function'){
  const proceed=await _genericCheckConflict('task_'+id,'tasks',id);
  if(!proceed){
    closeModal('genericModal');
    setTimeout(()=>showTaskForm(id),300);
    return;
  }
}
const _tProjId=$('#tProj').value;
const _tDurDays=parseFloat($('#tDur')?.value)||0;
const _tHPD=_getTaskProjHPD(_tProjId);
const _isMileSave=$('#tMile').value==='true';
// Normalize predecessor string: parse then re-serialize with space separator
const _rawPred=($('#tPred')?.value||'').trim();
const _normPred=window.SHICCPMEngine?SHICCPMEngine.parsePredecessors(_rawPred).map(p=>{
  const lagStr=p.lagDays>0?`+${p.lagDays}d`:p.lagDays<0?`${p.lagDays}d`:'';
  return `${p.id} ${p.type}${lagStr}`;
}).join(', '):_rawPred;
const t={
  id:id||'TSK-'+(Date.now()%100000).toString().padStart(5,'0'),
  projectId:_tProjId,wbs:$('#tWbs').value,name:$('#tName').value,
  assignee:$('#tAss').value,dept:$('#tDept').value,
  startDate:_isMileSave?$('#tStart').value:$('#tStart').value,
  endDate:_isMileSave?$('#tStart').value:$('#tEnd').value, // milestone: end=start
  plannedHrs:(parseFloat($('#tPH').value)||0)||(_isMileSave?0:(_tDurDays>0?_tDurDays*_tHPD:0)),actualHrs:parseFloat($('#tAH').value)||0,
  status:$('#tStat').value,priority:$('#tPri').value,
  progress:parseInt($('#tProg').value)||0,
  milestone:_isMileSave,
  parentId:$('#tParent')?.value||'',
  predecessors:_normPred,
  durationHrs:_isMileSave?0:(_tDurDays>0?_tDurDays*_tHPD:(id?(AppState.data.tasks||[]).find(x=>x.id===id)?.durationHrs||0:0))
};
if(!_req(['tName','tProj','tStart'])){showToast('Fill in required fields','error');return;}
// Hierarchy guards: no self-parenting, no cycles, parent must be in same project
if(t.parentId){
  if(t.parentId===t.id||_taskIsDescendant(t.parentId,t.id)){showToast('Invalid parent: would create a loop in the hierarchy','error');return;}
  const par=(AppState.data.tasks||[]).find(x=>x.id===t.parentId);
  if(!par||par._deleted||par.projectId!==_tProjId){showToast('Parent task must belong to the same project','error');return;}
}
if(id){const i=(AppState.data.tasks||[]).findIndex(x=>x.id===id);AppState.data.tasks[i]={...AppState.data.tasks[i],...t};}
else AppState.data.tasks.push(t);
_applyCPMDates(_tProjId);
_applySummaryRollups(_tProjId);
_recalcProjectProgress(_tProjId);
_recalcAllWbs(_tProjId);
AppState.save();closeModal('taskModal');
if(typeof detailProjectId!=='undefined'&&detailProjectId&&typeof renderDetailTasks==='function'){renderDetailTasks();}else{renderTaskView();}
showToast(id?'Task updated':'Task created','success');}

// After any task save, run CPM on the project and write _ES/_EF back to
// startDate/endDate for tasks that are CPM-scheduled (have predecessors or
// only a duration with no manual dates). Anchor tasks (predecessors='' and
// manual dates set) keep their dates.
function _applyCPMDates(projId){
  if(!window.SHICCPMEngine)return;
  const proj=(AppState.data.projects||[]).find(p=>p.id===projId);
  const pt=(AppState.data.tasks||[]).filter(t=>t.projectId===projId&&!t._deleted);
  if(!pt.length)return;
  const result=SHICCPMEngine.runFullCPM(pt,proj);
  if(result.hasCycle){showToast('Circular dependency detected — dates not updated','error');return;}
  result.tasks.forEach(ct=>{
    if(!ct._ES||!ct._EF)return;
    const i=(AppState.data.tasks||[]).findIndex(x=>x.id===ct.id);
    if(i<0)return;
    const stored=AppState.data.tasks[i];
    if(_taskHasChildren(ct.id,pt))return; // summary task: dates come from rollup, not CPM
    const hasPreds=(ct.predecessors||'').trim().length>0;
    if(hasPreds){
      // Successor: CPM owns both dates
      stored.startDate=ct._ES;
      stored.endDate=ct.milestone?ct._ES:ct._EF; // milestone: end=start
    } else {
      // Anchor: user owns startDate; CPM owns endDate if duration or milestone
      if(ct.milestone){
        stored.endDate=stored.startDate; // milestone: end always = start
      } else if(ct.durationHrs>0){
        stored.endDate=ct._EF;
      }
    }
    // Final guard: end must never be before start
    if(stored.endDate&&stored.startDate&&stored.endDate<stored.startDate){
      stored.endDate=stored.startDate;
    }
  });
}

function deleteTask(id){ return requestOrDelete('tasks', id); }

// Live CPM preview: run CPM with current form values and push computed
// start/end into the read-only fields so the user sees the result before saving.
function _runFormCPMPreview(){
  if(!window.SHICCPMEngine)return;
  const projId=$('#tProj')?.value; if(!projId)return;
  const predEl=$('#tPred'), startEl=$('#tStart'), endEl=$('#tEnd'), durEl=$('#tDur'), mileEl=$('#tMile');
  if(!predEl||!startEl||!endEl)return;
  const predStr=(predEl.value||'').trim();
  if(!predStr)return; // no predecessor — nothing to preview
  const isMile=mileEl?.value==='true';
  const proj=(AppState.data.projects||[]).find(p=>p.id===projId);
  const hpd=_getTaskProjHPD(projId);
  const durDays=parseFloat(durEl?.value)||1;
  const previewId=_tEditingId||'__cpm_preview__';
  // Build snapshot of ALL project tasks except the one being edited, plus the current form state
  const others=(AppState.data.tasks||[]).filter(t=>t.projectId===projId&&!t._deleted&&t.id!==previewId);
  const thisTask={
    id:previewId, projectId:projId,
    startDate:startEl.value||proj?.startDate||'',
    endDate:endEl.value||'',
    durationHrs:isMile?0:durDays*hpd,
    predecessors:predStr,
    milestone:isMile
  };
  const result=SHICCPMEngine.runFullCPM([...others,thisTask],proj);
  if(result.hasCycle)return;
  const computed=result.tasks.find(t=>t.id===previewId);
  if(!computed||!computed._ES)return;
  startEl.value=computed._ES;
  endEl.value=isMile?computed._ES:(computed._EF||computed._ES);
  // Update duration display if not milestone. Keep a fractional value the user
  // typed (e.g. 0.5, 1.25) as long as it rounds up to the same calendar span.
  if(!isMile&&durEl){
    const cal=SHICCPMEngine.getCalendar(proj);
    // inclusive: workingDaysBetween(Mon,Mon)=0 → dur=1; workingDaysBetween(Mon,Fri)=4 → dur=5
    const d=SHICCPMEngine.workingDaysBetween(computed._ES,computed._EF||computed._ES,cal)+1;
    const cur=parseFloat(durEl.value);
    if(d>=1&&(isNaN(cur)||cur<=0||Math.ceil(cur)!==d))durEl.value=d;
  }
}

// Auto-sync Start / End / Duration / Milestone / Predecessor in the task form.
// source: 'start' | 'end' | 'dur' | 'mile' | 'pred'
function _tFormRecalc(source){
  const projId=$('#tProj')?.value;
  const cal=window.SHICCPMEngine?SHICCPMEngine.getCalendar((AppState.data.projects||[]).find(p=>p.id===projId)):null;
  const addWD=(d,n)=>window.SHICCPMEngine&&d?SHICCPMEngine.addWorkingDays(d,n,cal):d;
  const diffWD=(s,e)=>window.SHICCPMEngine?SHICCPMEngine.workingDaysBetween(s,e,cal):0;

  const startEl=$('#tStart'), endEl=$('#tEnd'), durEl=$('#tDur'), mileEl=$('#tMile'), predEl=$('#tPred');
  if(!startEl||!endEl||!durEl)return;

  const isMile=mileEl?.value==='true';
  const hasPred=!!(predEl?.value||'').trim();

  // Milestone: lock duration=0, end=start
  if(source==='mile'){
    if(isMile){
      durEl.value=0;
      durEl.readOnly=true; durEl.style.opacity='.55';
      if(startEl.value)endEl.value=startEl.value;
    } else {
      durEl.readOnly=false; durEl.style.opacity='';
      durEl.value='';
    }
    return;
  }

  // Predecessor changed: lock/unlock start+end fields, then run live CPM preview
  if(source==='pred'){
    const ro=hasPred;
    startEl.readOnly=ro; startEl.style.opacity=ro?'.55':''; startEl.style.cursor=ro?'not-allowed':'';
    endEl.readOnly=ro;   endEl.style.opacity=ro?'.55':'';   endEl.style.cursor=ro?'not-allowed':'';
    if(hasPred) _runFormCPMPreview(); // show computed dates immediately
    return;
  }

  // If milestone: end always = start
  if(isMile){
    if(startEl.value)endEl.value=startEl.value;
    durEl.value=0;
    return;
  }

  // Successor tasks: duration changed → recompute end via CPM preview
  if(hasPred){
    if(source==='dur') _runFormCPMPreview();
    return;
  }

  const s=startEl.value, e=endEl.value;
  const dur=parseFloat(durEl.value);

  // Live-sync Planned Hours from duration (only if user hasn't edited it manually)
  const phEl=$('#tPH');
  if(phEl && !isNaN(dur) && dur>0 && (source==='dur'||source==='start'||source==='end')){
    const hpd=_getTaskProjHPD(projId);
    const cur=parseFloat(phEl.value)||0;
    if(cur===0 || Math.abs(cur-dur*hpd)<hpd) phEl.value=+(dur*hpd).toFixed(2);
  }

  if(source==='start'){
    // end = start + (ceil(dur)-1) working days  [inclusive model: dur<=1 → same day, 1.5 → 2 days]
    if(!isNaN(dur)&&dur>0&&s) endEl.value=addWD(s,Math.max(0,Math.ceil(dur)-1));
    else if(e&&s>e) endEl.value=s;
  } else if(source==='dur'){
    if(!isNaN(dur)&&dur>0&&s) endEl.value=addWD(s,Math.max(0,Math.ceil(dur)-1));
  } else if(source==='end'){
    if(s&&e){
      if(e<s){endEl.value=s;durEl.value=1;}
      // inclusive count: Mon→Mon=1, Mon→Fri=5
      else{const d=diffWD(s,e)+1;durEl.value=d>=1?d:1;}
    }
  }
}

// ── Task Import ─────────────────────────────────────────────
// Copy tasks from another project into the current one. Useful when a
// repeating project template lives in an old job — pick the source, pick
// the tasks, choose a start date to rebase timelines against, and go.
let _taskImportTargetProj='';
function showImportFromProject(targetProjId){
  _taskImportTargetProj=targetProjId;
  const projects=(AppState.data.projects||[]).filter(p=>!p._deleted&&p.id!==targetProjId);
  if(!projects.length){showToast('No other projects to import from','error');return;}
  const today=new Date().toISOString().slice(0,10);
  let m=$('#taskImportModal');
  if(!m){
    m=document.createElement('div');
    m.id='taskImportModal';
    m.className='modal-overlay';
    m.innerHTML=`<div class="modal" style="width:760px;max-width:96vw"><div class="modal-header"><h3 class="modal-title"><i class="fas fa-file-import"></i> Import Tasks</h3><button class="btn btn-secondary btn-sm btn-icon" onclick="$('#taskImportModal')?.classList.remove('open')"><i class="fas fa-times"></i></button></div><div class="modal-body" id="taskImportBody"></div></div>`;
    document.body.appendChild(m);
  }
  $('#taskImportBody').innerHTML=`
    <div class="form-grid" style="grid-template-columns:1fr 1fr;gap:10px;margin-bottom:10px">
      <div class="form-group"><label class="form-label">Source Project</label>
        <select class="form-select" id="tiSrc" onchange="_tiRefreshList()">
          <option value="">— Select project —</option>
          ${projects.map(p=>`<option value="${p.id}">${p.id}${p.name?' — '+p.name.substring(0,40):''}</option>`).join('')}
        </select></div>
      <div class="form-group"><label class="form-label">Rebase Start Date <span style="font-size:10px;color:var(--text-muted)">— earliest task starts here</span></label>
        <input class="form-input" type="date" id="tiStart" value="${today}"></div>
    </div>
    <div style="display:flex;gap:10px;font-size:11px;color:var(--text-secondary);margin-bottom:8px">
      <label style="display:flex;align-items:center;gap:5px;cursor:pointer"><input type="checkbox" id="tiKeepPreds" checked> Copy predecessors</label>
      <label style="display:flex;align-items:center;gap:5px;cursor:pointer"><input type="checkbox" id="tiKeepAssign"> Copy assignees</label>
      <label style="display:flex;align-items:center;gap:5px;cursor:pointer"><input type="checkbox" id="tiResetProgress" checked> Reset progress & status</label>
    </div>
    <div id="tiListWrap" style="max-height:340px;overflow:auto;border:1px solid var(--border);border-radius:6px;padding:6px 8px;background:var(--bg-secondary)">
      <div style="font-size:11px;color:var(--text-muted);padding:20px;text-align:center">Select a source project to see its tasks.</div>
    </div>
    <div class="modal-footer" style="margin-top:12px">
      <button class="btn btn-secondary" onclick="$('#taskImportModal')?.classList.remove('open')">Cancel</button>
      <button class="btn btn-primary" onclick="_tiApply()"><i class="fas fa-check"></i> Import Selected</button>
    </div>`;
  m.classList.add('open');
}

function _tiRefreshList(){
  const srcId=$('#tiSrc')?.value;
  const wrap=$('#tiListWrap');if(!wrap)return;
  if(!srcId){wrap.innerHTML=`<div style="font-size:11px;color:var(--text-muted);padding:20px;text-align:center">Select a source project to see its tasks.</div>`;return;}
  const tasks=(AppState.data.tasks||[]).filter(t=>t.projectId===srcId&&!t._deleted);
  if(!tasks.length){wrap.innerHTML=`<div style="font-size:11px;color:var(--text-muted);padding:20px;text-align:center">No tasks in that project.</div>`;return;}
  const ordered=typeof _orderTasksHier==='function'?_orderTasksHier(tasks):tasks.map(t=>({t,depth:0}));
  wrap.innerHTML=`<div style="display:flex;align-items:center;gap:8px;padding:4px 0 8px;border-bottom:1px solid var(--border);margin-bottom:6px">
    <label style="display:flex;align-items:center;gap:5px;cursor:pointer;font-size:11px"><input type="checkbox" id="tiAll" checked onchange="document.querySelectorAll('.ti-chk').forEach(c=>c.checked=this.checked)"> Select all (${tasks.length})</label>
  </div>`+
  ordered.map(({t,depth})=>`<label style="display:flex;align-items:center;gap:8px;padding:4px 4px;border-bottom:1px solid var(--border-subtle);cursor:pointer">
    <input type="checkbox" class="ti-chk" data-id="${t.id}" checked>
    <span style="font-family:var(--font-mono);font-size:10px;color:var(--text-muted);min-width:50px">${t.wbs||t.id}</span>
    <span style="font-size:11px;padding-left:${depth*14}px">${depth>0?'↳ ':''}${(t.name||'').substring(0,80)}</span>
    <span style="margin-left:auto;font-size:10px;color:var(--text-muted);font-family:var(--font-mono)">${t.startDate||''}${t.endDate&&t.endDate!==t.startDate?' → '+t.endDate:''}</span>
  </label>`).join('');
}

function _tiApply(){
  const srcId=$('#tiSrc')?.value; if(!srcId){showToast('Pick a source project','error');return;}
  const rebase=$('#tiStart')?.value; if(!rebase){showToast('Pick a rebase start date','error');return;}
  const keepPreds=$('#tiKeepPreds')?.checked;
  const keepAssign=$('#tiKeepAssign')?.checked;
  const resetProgress=$('#tiResetProgress')?.checked;
  const selectedIds=new Set([...document.querySelectorAll('.ti-chk')].filter(c=>c.checked).map(c=>c.dataset.id));
  if(!selectedIds.size){showToast('Select at least one task','error');return;}
  const src=(AppState.data.tasks||[]).filter(t=>t.projectId===srcId&&!t._deleted&&selectedIds.has(t.id));

  // Compute offset in calendar days from earliest selected start to rebase date
  const starts=src.map(t=>t.startDate).filter(Boolean).sort();
  const anchor=starts[0]||rebase;
  const msPerDay=86400000;
  const offsetDays=Math.round((new Date(rebase+'T00:00:00')-new Date(anchor+'T00:00:00'))/msPerDay);
  const shift=(d)=>{if(!d)return d;const nd=new Date(d+'T00:00:00');nd.setDate(nd.getDate()+offsetDays);return nd.getFullYear()+'-'+String(nd.getMonth()+1).padStart(2,'0')+'-'+String(nd.getDate()).padStart(2,'0');};

  // ID remap so parent/predecessor references stay internally consistent
  const idMap={};
  src.forEach(t=>{idMap[t.id]='TSK-'+(Date.now()%100000+Math.floor(Math.random()*1000)).toString().padStart(5,'0');});
  const remapPred=(str)=>{
    if(!str||!keepPreds)return '';
    return str.split(',').map(s=>s.trim()).filter(Boolean).map(entry=>{
      const m=entry.match(/^([A-Za-z0-9_-]*[0-9])(\s*(?:FS|SS|FF|SF)?\s*[+-]?\d*d?)?$/i);
      if(!m)return entry;
      const oldId=m[1];const rest=m[2]||'';
      return (idMap[oldId]||oldId)+rest;
    }).join(', ');
  };

  const newTasks=src.map(t=>({
    ...t,
    id:idMap[t.id],
    projectId:_taskImportTargetProj,
    startDate:shift(t.startDate),
    endDate:shift(t.endDate),
    parentId:t.parentId?(idMap[t.parentId]||''):'',
    predecessors:remapPred(t.predecessors),
    assignee:keepAssign?t.assignee:'',
    progress:resetProgress?0:(t.progress||0),
    status:resetProgress?'todo':(t.status||'todo'),
    actualHrs:resetProgress?0:(t.actualHrs||0),
    wbs:'',
    createdAt:new Date().toISOString()
  }));

  AppState.data.tasks.push(...newTasks);
  if(typeof _recalcAllWbs==='function')_recalcAllWbs(_taskImportTargetProj);
  if(typeof _applyCPMDates==='function')_applyCPMDates(_taskImportTargetProj);
  if(typeof _applySummaryRollups==='function')_applySummaryRollups(_taskImportTargetProj);
  if(typeof _recalcProjectProgress==='function')_recalcProjectProgress(_taskImportTargetProj);
  AppState.save();
  $('#taskImportModal')?.classList.remove('open');
  showToast(`Imported ${newTasks.length} task${newTasks.length===1?'':'s'}`,'success');
  if(typeof renderDetailTasks==='function'&&typeof detailProjectId!=='undefined'&&detailProjectId===_taskImportTargetProj)renderDetailTasks();
  else if(typeof renderTaskView==='function')renderTaskView();
}

function showPredPicker(currentTaskId){
  const projId=$('#tProj').value;
  const allTasks=(AppState.data.tasks||[]).filter(t=>t.projectId===projId&&!t._deleted&&t.id!==currentTaskId);

  // Parse existing predecessors into a working set
  const existing={};
  ($('#tPred').value||'').split(',').map(s=>s.trim()).filter(Boolean).forEach(entry=>{
    const m=entry.match(/^([A-Za-z0-9_-]*[0-9])\s*(FS|SS|FF|SF)?\s*([+-]\d+d?)?$/i);
    if(m){existing[m[1].toUpperCase()]={type:(m[2]||'FS').toUpperCase(),lag:m[3]||''};}
  });

  // Build rows
  const rows=allTasks.map(t=>{
    const sel=existing[t.id]||null;
    const chk=sel?'checked':'';
    const typeVal=sel?sel.type:'FS';
    const lagVal=sel?sel.lag.replace(/[+-]/,'').replace('d',''):'';
    const lagSign=sel&&sel.lag.startsWith('-')?'-':'+';
    return `<tr id="ppr-row-${t.id}">
      <td style="width:28px;text-align:center"><input type="checkbox" class="ppr-chk" data-id="${t.id}" ${chk} onchange="_pprToggle('${t.id}')"></td>
      <td style="font-size:11px;font-family:var(--font-mono);color:var(--text-secondary)">${t.wbs||t.id}</td>
      <td style="font-size:12px">${t.name}</td>
      <td style="width:90px">
        <select class="form-select ppr-type" data-id="${t.id}" style="font-size:11px;padding:2px 4px;height:26px" ${sel?'':'disabled'} onchange="_pprApply()">
          ${['FS','SS','FF','SF'].map(x=>`<option value="${x}" ${typeVal===x?'selected':''}>${x} — ${x==='FS'?'Finish-to-Start':x==='SS'?'Start-to-Start':x==='FF'?'Finish-to-Finish':'Start-to-Finish'}</option>`).join('')}
        </select>
      </td>
      <td style="width:90px">
        <div style="display:flex;align-items:center;gap:2px">
          <select class="ppr-lsign" data-id="${t.id}" style="font-size:11px;padding:2px 2px;height:26px;width:38px" ${sel?'':'disabled'} onchange="_pprApply()">
            <option value="+" ${lagSign==='+'?'selected':''}>+</option>
            <option value="-" ${lagSign==='-'?'selected':''}>-</option>
          </select>
          <input type="number" class="form-input ppr-lag" data-id="${t.id}" value="${lagVal}" min="0" placeholder="0" style="font-size:11px;padding:2px 4px;height:26px;width:46px" ${sel?'':'disabled'} oninput="_pprApply()">
          <span style="font-size:10px;color:var(--text-muted)">d</span>
        </div>
      </td>
    </tr>`;
  }).join('');

  const html=`<div style="padding:0">
    <p style="font-size:12px;color:var(--text-secondary);margin-bottom:10px">Check tasks to add as predecessors. Set dependency type and lag for each.</p>
    <div style="max-height:340px;overflow-y:auto;border:1px solid var(--border-primary);border-radius:6px">
    <table style="width:100%;border-collapse:collapse">
      <thead><tr style="background:var(--bg-secondary);position:sticky;top:0;z-index:1">
        <th style="padding:6px 4px;font-size:11px;font-weight:600;text-align:center;width:28px"></th>
        <th style="padding:6px 8px;font-size:11px;font-weight:600;text-align:left">WBS / ID</th>
        <th style="padding:6px 8px;font-size:11px;font-weight:600;text-align:left">Task Name</th>
        <th style="padding:6px 8px;font-size:11px;font-weight:600">Type</th>
        <th style="padding:6px 8px;font-size:11px;font-weight:600">Lag</th>
      </tr></thead>
      <tbody>${rows||'<tr><td colspan="5" style="padding:20px;text-align:center;color:var(--text-muted);font-size:12px">No other tasks in this project.</td></tr>'}</tbody>
    </table>
    </div>
    <div id="pprPreview" style="margin-top:10px;font-size:11px;color:var(--text-secondary);font-family:var(--font-mono);min-height:18px"></div>
    <div class="modal-footer" style="margin-top:12px">
      <button class="btn btn-secondary" onclick="$('#predPickerModal')?.classList.remove('open')">Cancel</button>
      <button class="btn btn-primary" onclick="_pprApplyToField()"><i class="fas fa-check"></i> Apply</button>
    </div>
  </div>`;

  // Use generic modal
  let m=$('#predPickerModal');
  if(!m){
    m=document.createElement('div');
    m.id='predPickerModal';
    m.className='modal-overlay';
    m.innerHTML=`<div class="modal" style="width:640px;max-width:96vw"><div class="modal-header"><h3 class="modal-title">Pick Predecessors</h3><button class="btn btn-secondary btn-sm btn-icon" onclick="$('#predPickerModal')?.classList.remove('open')"><i class="fas fa-times"></i></button></div><div class="modal-body" id="predPickerBody"></div></div>`;
    document.body.appendChild(m);
  }
  $('#predPickerBody').innerHTML=html;
  m.classList.add('open');
  _pprApply();
}

function _pprToggle(taskId){
  const chk=document.querySelector(`.ppr-chk[data-id="${taskId}"]`);
  const enabled=chk&&chk.checked;
  document.querySelector(`.ppr-type[data-id="${taskId}"]`).disabled=!enabled;
  document.querySelector(`.ppr-lsign[data-id="${taskId}"]`).disabled=!enabled;
  document.querySelector(`.ppr-lag[data-id="${taskId}"]`).disabled=!enabled;
  _pprApply();
}

function _pprApply(){
  const parts=[];
  document.querySelectorAll('.ppr-chk').forEach(chk=>{
    if(!chk.checked)return;
    const id=chk.dataset.id;
    const type=document.querySelector(`.ppr-type[data-id="${id}"]`)?.value||'FS';
    const sign=document.querySelector(`.ppr-lsign[data-id="${id}"]`)?.value||'+';
    const lag=parseInt(document.querySelector(`.ppr-lag[data-id="${id}"]`)?.value)||0;
    const lagStr=lag>0?`${sign}${lag}d`:'';
    parts.push(`${id} ${type}${lagStr}`);
  });
  const preview=$('#pprPreview');
  if(preview)preview.textContent=parts.length?'Preview: '+parts.join(', '):'No predecessors selected.';
}

function _pprApplyToField(){
  const parts=[];
  document.querySelectorAll('.ppr-chk').forEach(chk=>{
    if(!chk.checked)return;
    const id=chk.dataset.id;
    const type=document.querySelector(`.ppr-type[data-id="${id}"]`)?.value||'FS';
    const sign=document.querySelector(`.ppr-lsign[data-id="${id}"]`)?.value||'+';
    const lag=parseInt(document.querySelector(`.ppr-lag[data-id="${id}"]`)?.value)||0;
    const lagStr=lag>0?`${sign}${lag}d`:'';
    parts.push(`${id} ${type}${lagStr}`);
  });
  const field=$('#tPred');
  if(field){field.value=parts.join(', ');_tFormRecalc('pred');}
  $('#predPickerModal')?.classList.remove('open');
}

// ── GLOBAL GANTT MODULE ───────────────────────────────────
