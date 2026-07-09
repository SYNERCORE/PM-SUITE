function renderKPI(){
const{tasks:_allTasks,costs:_allCosts,risks:_allRisks}=AppState.data;
// Exclude prospects, then filter to the selected time period
const projects=(AppState.data.projects||[]).filter(p=>p.status!=='prospect'&&_tfProjectInRange(p));
const _projIds=new Set(projects.map(p=>p.id));
const tasks=(_allTasks||[]).filter(t=>_projIds.has(t.projectId));
const costs=(_allCosts||[]).filter(c=>_projIds.has(c.projectId));
const risks=(_allRisks||[]).filter(r=>_projIds.has(r.projectId));
const totP=costs.reduce((s,c)=>s+c.planned,0),totA=costs.reduce((s,c)=>s+c.actual,0);
const avgProg=projects.length?projects.reduce((s,p)=>s+(p.progress||0),0)/projects.length/100:0;
const EV=totP*avgProg,CPI=(EV/totA).toFixed(2),SPI=(EV/(totP*.56)).toFixed(2);
const ph=tasks.reduce((s,t)=>s+t.plannedHrs,0),ah=tasks.reduce((s,t)=>s+t.actualHrs,0);
const prod=ah>0?(ph/ah).toFixed(2):'1.00';const done=tasks.filter(t=>t.status==='done').length;
$('#kpi').innerHTML=`<div class="section-header" style="margin-bottom:14px;flex-wrap:wrap;gap:10px">
<div><div class="section-title">KPI Analytics Dashboard</div><div class="section-sub">${projects.length} project${projects.length===1?'':'s'} in <strong>${_tfRange().label}</strong></div></div>
${_tfFilterHTML('renderKPI()')}
</div>
${projects.length===0?`<div class="empty-state" style="padding:36px"><i class="fas fa-calendar-times" style="font-size:24px;opacity:.4;display:block;margin-bottom:10px"></i><div>No projects overlap ${_tfRange().label}.</div></div>`:''}
<div class="grid grid-4" style="margin-bottom:14px">
<div class="card" style="text-align:center"><div class="card-title">Cost Performance Index</div>
<div style="font-size:44px;font-weight:700;font-family:var(--font-mono);color:${parseFloat(CPI)>=1?'var(--accent-green)':'var(--accent-red)'}">${CPI}</div>
<div style="font-size:11px;color:var(--text-secondary);margin:4px 0">${parseFloat(CPI)>=1?'Cost Efficient ✓':'Cost Overrun ✗'}</div>
<div class="progress-bar" style="height:5px"><div class="progress-fill" style="width:${Math.min(100,parseFloat(CPI)*50)}%;background:${parseFloat(CPI)>=1?'var(--accent-green)':'var(--accent-red)'}"></div></div></div>
<div class="card" style="text-align:center"><div class="card-title">Schedule Performance Index</div>
<div style="font-size:44px;font-weight:700;font-family:var(--font-mono);color:${parseFloat(SPI)>=1?'var(--accent-green)':'var(--accent-amber)'}">${SPI}</div>
<div style="font-size:11px;color:var(--text-secondary);margin:4px 0">${parseFloat(SPI)>=1?'On Schedule ✓':'Behind Schedule'}</div>
<div class="progress-bar" style="height:5px"><div class="progress-fill" style="width:${Math.min(100,parseFloat(SPI)*50)}%;background:${parseFloat(SPI)>=1?'var(--accent-green)':'var(--accent-amber)'}"></div></div></div>
<div class="card" style="text-align:center"><div class="card-title">Productivity Index</div>
<div style="font-size:44px;font-weight:700;font-family:var(--font-mono);color:${parseFloat(prod)>=1?'var(--accent-green)':'var(--accent-amber)'}">${prod}</div>
<div style="font-size:11px;color:var(--text-secondary);margin:4px 0">Earned / Burned Hours</div>
<div class="progress-bar" style="height:5px"><div class="progress-fill" style="width:${Math.min(100,parseFloat(prod)*50)}%;background:var(--accent-blue)"></div></div></div>
<div class="card" style="text-align:center"><div class="card-title">Overall Completion</div>
<div style="font-size:44px;font-weight:700;font-family:var(--font-mono);color:var(--accent-blue)">${Math.round(avgProg*100)}%</div>
<div style="font-size:11px;color:var(--text-secondary);margin:4px 0">${done}/${tasks.length} tasks done</div>
<div class="progress-bar" style="height:5px"><div class="progress-fill" style="width:${Math.round(avgProg*100)}%;background:var(--accent-blue)"></div></div></div>
</div>
<div class="grid grid-3" style="margin-bottom:14px">
<div class="card"><div class="card-title">Progress by Project</div><canvas id="kpiProg" height="150" style="width:100%"></canvas></div>
<div class="card"><div class="card-title">Budget Utilization %</div><canvas id="kpiBudg" height="150" style="width:100%"></canvas></div>
<div class="card"><div class="card-title">Resource Utilization %</div><canvas id="kpiRes" height="150" style="width:100%"></canvas></div>
</div>
<div class="card"><div class="card-title" style="margin-bottom:10px">Project KPI Summary</div>
<div class="table-wrap"><table>
<thead><tr><th>Project</th><th>PM</th><th>Physical%</th><th>Time%</th><th>Budget%</th><th>Tasks Done</th><th>Risks</th><th>NCRs</th><th>Schedule</th></tr></thead>
<tbody>${projects.map(p=>{
const pt=tasks.filter(t=>t.projectId===p.id);
const pd=pt.filter(t=>t.status==='done').length;
const pr=risks.filter(r=>r.projectId===p.id&&r.status==='active').length;
const pn=(AppState.data.qaqc||[]).filter(q=>q.projectId===p.id&&q.type==='NCR'&&q.status==='open').length;
const bp=Math.round((p.spent/p.budget)*100);
const dl=daysBetween(new Date().toISOString().split('T')[0],p.endDate);
const tot=daysBetween(p.startDate,p.endDate);
const te=Math.round(((tot-Math.max(0,dl))/Math.max(1,tot))*100);
const onTrk=p.progress>=te-8;
return`<tr>
<td><div style="font-weight:600;font-size:12px">${p.id}</div><div style="font-size:10px;color:var(--text-secondary)">${p.name.substring(0,22)}...</div></td>
<td style="font-size:11px">${p.pm.split(' ')[0]}</td>
<td><div style="display:flex;align-items:center;gap:5px"><div class="progress-bar" style="width:55px;height:5px"><div class="progress-fill" style="width:${p.progress}%;background:${pColor(p.progress)}"></div></div><span style="font-size:10px;font-family:var(--font-mono)">${p.progress}%</span></div></td>
<td style="font-family:var(--font-mono);font-size:11px">${te}%</td>
<td style="font-family:var(--font-mono);font-size:11px;color:${bp>90?'var(--accent-red)':'inherit'}">${bp}%</td>
<td style="font-family:var(--font-mono);font-size:11px">${pd}/${pt.length}</td>
<td style="font-family:var(--font-mono);font-size:11px;color:${pr>2?'var(--accent-red)':pr>0?'var(--accent-amber)':'var(--accent-green)'}">${pr}</td>
<td style="font-family:var(--font-mono);font-size:11px;color:${pn>0?'var(--accent-red)':'var(--accent-green)'}">${pn}</td>
<td><span class="badge ${onTrk?'badge-green':'badge-red'}">${onTrk?'On Track':'Delayed'}</span></td>
</tr>`;}).join('')}</tbody></table></div></div>`;
setTimeout(()=>{
let c=$('#kpiProg');if(c){c.width=c.parentElement.offsetWidth-30;drawBar('kpiProg',projects.map(p=>p.id),projects.map(p=>p.progress),'#388bfd');}
c=$('#kpiBudg');if(c){c.width=c.parentElement.offsetWidth-30;drawBar('kpiBudg',projects.map(p=>p.id),projects.map(p=>Math.round((p.spent/p.budget)*100)),'#f0a450');}
c=$('#kpiRes');if(c){c.width=c.parentElement.offsetWidth-30;drawBar('kpiRes',(AppState.data.resources||[]).map(r=>r.name.split(' ')[0]),(AppState.data.resources||[]).map(r=>r.utilization),'#3fb950');}
},50);}

let calDate=new Date();

// ── DAILY MEETING MODULE ──────────────────────────────────
let _dmViewDate = new Date().toISOString().split('T')[0]; // current viewing date
let _dmStatusFilter = 'all';
let _dmUnsaved = {}; // { projectId: { status, remarks, targetActivity, update, flagged } }
let _dmShowCompleted = false; // toggle to show completed/cancelled actions
let _dmExpanded = {}; // { projectId: true } — manual expand overrides
let _dmActionUpdates = {}; // { actionId: { text, newStatus } } — pending action updates

// ── Helpers for action-item Daily Meeting integration ─────
function _dmActionStatusColor(s) {
  return { 'open':'#8b949e','in-progress':'#388bfd','on-hold':'#f0a450','closed':'#3fb950','completed':'#3fb950','cancelled':'#f85149' }[s||'open'] || '#8b949e';
}
function _dmActionPriorityIcon(action) {
  const today = new Date().toISOString().split('T')[0];
  if (action.status === 'closed' || action.status === 'completed') return { icon:'fa-check-circle', color:'#3fb950', label:'Closed' };
  if (action.status === 'cancelled') return { icon:'fa-ban', color:'#8b949e', label:'Cancelled' };
  if (action.dueDate && action.dueDate < today) return { icon:'fa-exclamation-circle', color:'#f85149', label:'Overdue' };
  if (action.dueDate === today) return { icon:'fa-clock', color:'#f0a450', label:'Due today' };
  return { icon:'fa-circle', color:'#3fb950', label:'On track' };
}
function _dmGetProjectActions(projectId) {
  return (AppState.data.actions||[]).filter(a => a.projectId === projectId);
}

// ── Get all historic daily-meeting logs for a project ─────
function _dmGetProjectLogHistory(projectId) {
  return (AppState.data.dailyMeetingLogs||[])
    .filter(l => l.projectId === projectId)
    .sort((a,b) => (b.date||'').localeCompare(a.date||''));
}

// ── Get the most recent log BEFORE the currently viewed date ──
function _dmGetPreviousLog(projectId) {
  const all = _dmGetProjectLogHistory(projectId);
  return all.find(l => l.date < _dmViewDate);
}

// ── Show full update history modal for a project ───────────
// ── Show full update history for a single action item ─────
function dmShowActionHistory(actionId) {
  const a = (AppState.data.actions||[]).find(x => x.id === actionId);
  if (!a) return;
  const updates = [...(a.updates||[])].reverse(); // newest first
  const project = (AppState.data.projects||[]).find(p => p.id === a.projectId);
  $('#genericModalTitle').textContent = 'Action Update History';
  $('#genericModalBody').innerHTML = `
    <div style="background:var(--bg-hover);padding:10px 12px;border-radius:8px;margin-bottom:14px">
      <div style="font-size:10px;color:var(--text-muted);margin-bottom:2px">${a.id} · ${project ? project.id : '(project)'}</div>
      <div style="font-size:13px;font-weight:700">${a.description || a.title || '(no description)'}</div>
      <div style="font-size:10px;color:var(--text-muted);margin-top:3px">
        ${a.assignee || a.assignedTo ? '👤 ' + (a.assignee || a.assignedTo) : ''}
        ${a.dueDate ? ' · 📅 Due ' + a.dueDate : ''}
        · Status: <strong>${a.status || 'open'}</strong>
      </div>
    </div>
    ${updates.length === 0 ? `<div class="empty-state" style="padding:20px"><i class="fas fa-clock-rotate-left"></i><p>No updates yet for this action</p></div>` :
    `<div style="max-height:50vh;overflow-y:auto;border-left:2px solid var(--border);margin-left:10px;padding-left:14px">
      ${updates.map(u => {
        const statusChanged = u.statusBefore && u.statusAfter && u.statusBefore !== u.statusAfter;
        return `<div style="position:relative;margin-bottom:14px;padding:10px 12px;background:var(--bg-card);border:1px solid var(--border);border-radius:8px">
          <div style="position:absolute;left:-22px;top:14px;width:10px;height:10px;border-radius:50%;background:#bc8cff;border:2px solid var(--bg-primary)"></div>
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:5px">
            <span style="font-size:11px;font-weight:700;color:#bc8cff">${u.date}</span>
            ${statusChanged ? `<span style="font-size:9px;font-family:var(--font-mono);color:var(--text-muted)">${u.statusBefore} → <strong style="color:var(--accent-green)">${u.statusAfter}</strong></span>` : ''}
          </div>
          ${u.text ? `<div style="font-size:11px;color:var(--text-secondary)">${u.text}</div>` : ''}
          <div style="font-size:9px;color:var(--text-muted);margin-top:6px">${u.user ? '— ' + u.user : ''}</div>
        </div>`;
      }).join('')}
    </div>`}
  `;
  $('#genericModalFooter').innerHTML = `<button class="btn btn-secondary" onclick="closeModal('genericModal')">Close</button>`;
  openModal('genericModal');
}

function dmShowHistory(projectId) {
  const project = (AppState.data.projects||[]).find(p => p.id === projectId);
  if (!project) return;
  const logs = _dmGetProjectLogHistory(projectId);
  const actions = _dmGetProjectActions(projectId);

  // Build timeline entries: project logs + action updates
  const timeline = [];
  logs.forEach(l => {
    timeline.push({
      date: l.date,
      type: 'meeting',
      data: l,
    });
  });
  actions.forEach(a => {
    (a.updates||[]).forEach(u => {
      timeline.push({
        date: u.date || a.createdAt?.split('T')[0] || '',
        type: 'action',
        action: a,
        data: u,
      });
    });
  });
  timeline.sort((a,b) => (b.date||'').localeCompare(a.date||''));

  $('#genericModalTitle').textContent = 'Update History — ' + project.id;
  $('#genericModalBody').innerHTML = `
    <div style="background:var(--bg-hover);padding:10px 12px;border-radius:8px;margin-bottom:14px">
      <div style="font-size:11px;font-family:var(--font-mono);color:var(--accent-blue);font-weight:700">${project.id}</div>
      <div style="font-size:13px;font-weight:700;margin-top:2px">${project.name}</div>
      <div style="font-size:10px;color:var(--text-muted);margin-top:3px">${logs.length} meeting log${logs.length!==1?'s':''} · ${timeline.length-logs.length} action update${timeline.length-logs.length!==1?'s':''}</div>
    </div>
    ${timeline.length === 0 ? `<div class="empty-state" style="padding:30px"><i class="fas fa-clock-rotate-left" style="font-size:32px;opacity:.3"></i><p style="margin-top:8px">No history yet for this project</p></div>` :
    `<div style="max-height:60vh;overflow-y:auto;border-left:2px solid var(--border);margin-left:10px;padding-left:14px">
      ${timeline.map(entry => {
        if (entry.type === 'meeting') {
          const l = entry.data;
          const statusColors = {'ONGOING':'#388bfd','WAITING':'#f0a450','DONE':'#3fb950','ON HOLD':'#f85149'};
          return `<div style="position:relative;margin-bottom:14px;padding:10px 12px;background:var(--bg-card);border:1px solid var(--border);border-radius:8px">
            <div style="position:absolute;left:-22px;top:14px;width:10px;height:10px;border-radius:50%;background:${statusColors[l.status]||'#8b949e'};border:2px solid var(--bg-primary)"></div>
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
              <span style="font-size:11px;font-weight:700;font-family:var(--font-mono);color:var(--accent-blue)"><i class="fas fa-clipboard-check" style="margin-right:5px"></i>${l.date}</span>
              <span style="font-size:9px;padding:2px 8px;border-radius:10px;background:${statusColors[l.status]||'#8b949e'}22;color:${statusColors[l.status]||'#8b949e'};font-weight:700">${l.status || 'NO STATUS'}</span>
            </div>
            ${l.remarks ? `<div style="font-size:11px;margin-bottom:4px"><strong style="color:var(--text-secondary)">Remarks:</strong> ${l.remarks}</div>` : ''}
            ${l.targetActivity ? `<div style="font-size:11px;margin-bottom:4px"><strong style="color:var(--text-secondary)">Target:</strong> ${l.targetActivity}</div>` : ''}
            ${l.update ? `<div style="font-size:11px;margin-bottom:4px"><strong style="color:var(--accent-blue)">Update:</strong> ${l.update}</div>` : ''}
            ${l.flagged ? `<div style="font-size:10px;color:var(--accent-red);margin-top:4px"><i class="fas fa-flag" style="margin-right:3px"></i>FLAGGED</div>` : ''}
            <div style="font-size:9px;color:var(--text-muted);margin-top:6px">${l.savedBy ? '— ' + l.savedBy.split('@')[0] : ''}</div>
          </div>`;
        } else {
          const a = entry.action;
          const u = entry.data;
          const statusChanged = u.statusBefore && u.statusAfter && u.statusBefore !== u.statusAfter;
          return `<div style="position:relative;margin-bottom:14px;padding:10px 12px;background:var(--bg-card);border:1px solid var(--border);border-radius:8px;border-left:3px solid #bc8cff">
            <div style="position:absolute;left:-22px;top:14px;width:10px;height:10px;border-radius:50%;background:#bc8cff;border:2px solid var(--bg-primary)"></div>
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
              <span style="font-size:11px;font-weight:700;color:#bc8cff"><i class="fas fa-tasks" style="margin-right:5px"></i>${u.date} · Action ${a.id}</span>
              ${statusChanged ? `<span style="font-size:9px;font-family:var(--font-mono);color:var(--text-muted)">${u.statusBefore} → <strong style="color:var(--accent-green)">${u.statusAfter}</strong></span>` : ''}
            </div>
            <div style="font-size:11px;font-weight:600;color:var(--text-secondary);margin-bottom:3px">${a.description || a.title || '(no description)'}</div>
            ${u.text ? `<div style="font-size:11px"><strong style="color:#bc8cff">Update:</strong> ${u.text}</div>` : ''}
            <div style="font-size:9px;color:var(--text-muted);margin-top:6px">${u.user ? '— ' + u.user : ''}</div>
          </div>`;
        }
      }).join('')}
    </div>`}
  `;
  $('#genericModalFooter').innerHTML = `<button class="btn btn-secondary" onclick="closeModal('genericModal')">Close</button>`;
  openModal('genericModal');
}


function _dmActionCounts(projectId) {
  const today = new Date().toISOString().split('T')[0];
  const acts = _dmGetProjectActions(projectId);
  const isDone = a => a.status === 'closed' || a.status === 'completed' || a.status === 'cancelled';
  return {
    total: acts.filter(a => !isDone(a)).length,
    overdue: acts.filter(a => !isDone(a) && a.dueDate && a.dueDate < today).length,
    dueToday: acts.filter(a => !isDone(a) && a.dueDate === today).length,
  };
}

function renderDailyMeeting() {
  AppState.ensureData();
  const today = new Date().toISOString().split('T')[0];
  const isToday = _dmViewDate === today;
  const projects = (AppState.data.projects || []).filter(p =>
    p.status === 'active' || p.status === 'planned' || p.status === 'on-hold'
  );
  const BUs = AppState.data.businessUnits || [];
  const logs = AppState.data.dailyMeetingLogs || [];
  const companyName = AppState.data.settings?.companyName || 'SHIC';

  // Get logs for the viewing date
  const dateLogs = logs.filter(l => l.date === _dmViewDate);
  const dateLogMap = {}; dateLogs.forEach(l => dateLogMap[l.projectId] = l);

  // Check which projects have been updated today
  const todayLogs = logs.filter(l => l.date === today);
  const todayLogIds = new Set(todayLogs.map(l => l.projectId));

  // Status filter
  let filteredProjects = projects;
  if (_dmStatusFilter !== 'all') {
    filteredProjects = projects.filter(p => {
      const log = dateLogMap[p.id];
      if (!log) return _dmStatusFilter === 'none';
      return (log.status || '').toLowerCase() === _dmStatusFilter.toLowerCase();
    });
  }

  // Group projects by BU then discipline
  const groups = {};
  filteredProjects.forEach(p => {
    const bu = BUs.find(b => b.id === p.businessUnit);
    const groupKey = bu ? bu.name : (p.discipline || companyName + ' — Main');
    if (!groups[groupKey]) groups[groupKey] = { color: bu?.color || '#388bfd', projects: [] };
    groups[groupKey].projects.push(p);
  });

  // Count stats
  const totalProjects = projects.length;
  const updatedToday = todayLogs.length;
  const flaggedCount = dateLogs.filter(l => l.flagged).length;
  const doneCount = dateLogs.filter(l => l.status === 'DONE').length;
  const waitingCount = dateLogs.filter(l => l.status === 'WAITING' || l.status === 'ON HOLD').length;

  // Build table rows for a group
  function buildRows(groupProjects) {
    return groupProjects.map(p => {
      const log = dateLogMap[p.id] || {};
      const unsaved = _dmUnsaved[p.id] || {};
      const status = unsaved.status !== undefined ? unsaved.status : (log.status || '');
      const remarks = unsaved.remarks !== undefined ? unsaved.remarks : (log.remarks || '');
      const targetActivity = unsaved.targetActivity !== undefined ? unsaved.targetActivity : (log.targetActivity || '');
      const update = unsaved.update !== undefined ? unsaved.update : (log.update || '');
      const flagged = unsaved.flagged !== undefined ? unsaved.flagged : (log.flagged || false);
      const hasUpdate = !!log.id;
      const notUpdatedToday = isToday && !todayLogIds.has(p.id);

      // Duration calc
      const startDate = p.startDate ? new Date(p.startDate) : null;
      const endDate = p.endDate ? new Date(p.endDate) : null;
      const viewDate = new Date(_dmViewDate);
      const completionDate = p.status === 'completed' && p.completedDate ? new Date(p.completedDate) : null;
      const durationActualEnd = completionDate || (p.status === 'completed' ? endDate : viewDate);
      // Inclusive day count: start == end → 1 day, not 0
      const durActual = startDate && durationActualEnd
        ? Math.max(0, Math.ceil((durationActualEnd - startDate) / (1000 * 60 * 60 * 24)) + 1)
        : '—';
      const durPlan = startDate && endDate
        ? Math.max(0, Math.ceil((endDate - startDate) / (1000 * 60 * 60 * 24)) + 1)
        : '—';

      const statusColors = {
        'DONE': '#3fb950', 'ONGOING': '#388bfd',
        'WAITING': '#f0a450', 'ON HOLD': '#f85149', '': '#8b949e'
      };
      const statusColor = statusColors[status] || '#8b949e';
      const readonly = !isToday;

      // Previous update (most recent log before viewing date)
      const prevLog = _dmGetPreviousLog(p.id);
      // Action item counts
      const actCounts = _dmActionCounts(p.id);
      const hasUrgentActions = actCounts.overdue > 0 || actCounts.dueToday > 0;
      const isExpanded = _dmExpanded[p.id] !== undefined ? _dmExpanded[p.id] : hasUrgentActions;
      _dmExpanded[p.id] = isExpanded;

      return `<tr style="border-top:1px solid var(--border);${flagged ? 'background:rgba(248,81,73,.06)' : ''};${notUpdatedToday ? 'background:rgba(240,164,80,.04)' : ''}">
        <td style="padding:6px 8px;min-width:160px;max-width:220px">
          <div style="display:flex;align-items:flex-start;gap:6px">
            <button onclick="dmToggleExpand('${p.id}')" title="${isExpanded?'Collapse':'Expand'} action items"
              style="background:none;border:none;color:var(--text-muted);cursor:pointer;padding:0;margin-top:2px;flex-shrink:0;transition:transform .15s;${isExpanded?'transform:rotate(90deg)':''}">
              <i class="fas fa-chevron-right" style="font-size:9px"></i>
            </button>
            ${flagged ? '<i class="fas fa-flag" style="color:var(--accent-red);font-size:11px;margin-top:2px;flex-shrink:0"></i>' : ''}
            <div style="flex:1;min-width:0">
              <div style="font-size:10px;font-family:var(--font-mono);font-weight:700;color:var(--accent-blue);display:flex;align-items:center;gap:5px"><span>${p.id}</span>${prevLog ? `<button onclick="event.stopPropagation();dmShowHistory('${p.id}')" title="View update history" style="background:none;border:none;color:var(--accent-blue);opacity:.6;cursor:pointer;padding:0;font-size:9px"><i class="fas fa-clock-rotate-left"></i></button>` : ''}</div>
              <div style="font-size:11px;font-weight:600;line-height:1.3">${p.name}</div>
              ${p.client ? `<div style="font-size:9px;color:var(--text-muted)">${p.client}</div>` : ''}
              ${notUpdatedToday ? '<div style="font-size:9px;color:var(--accent-amber);margin-top:2px"><i class="fas fa-exclamation-circle" style="margin-right:3px"></i>Not yet updated</div>' : ''}
              ${(actCounts.total>0||actCounts.overdue>0) ? `<div style="display:flex;gap:4px;margin-top:3px;flex-wrap:wrap">
                ${actCounts.overdue>0?`<span style="font-size:8px;background:rgba(248,81,73,.15);color:#f85149;padding:1px 5px;border-radius:8px;font-weight:700"><i class="fas fa-exclamation-circle" style="margin-right:2px"></i>${actCounts.overdue} overdue</span>`:''}
                ${actCounts.dueToday>0?`<span style="font-size:8px;background:rgba(240,164,80,.15);color:#f0a450;padding:1px 5px;border-radius:8px;font-weight:700"><i class="fas fa-clock" style="margin-right:2px"></i>${actCounts.dueToday} today</span>`:''}
                ${actCounts.total>0?`<span style="font-size:8px;background:var(--bg-hover);color:var(--text-secondary);padding:1px 5px;border-radius:8px;font-weight:600">${actCounts.total} open</span>`:''}
              </div>`:''}
            </div>
          </div>
        </td>
        <td style="padding:6px 8px;text-align:center">
          <div style="font-size:14px;font-weight:800;font-family:var(--font-mono);color:${p.progress>=100?'var(--accent-green)':p.progress>=50?'var(--accent-blue)':'var(--text-primary)'}">${p.progress || 0}%</div>
          <div style="width:50px;height:4px;background:var(--border);border-radius:2px;margin:3px auto 0">
            <div style="width:${p.progress||0}%;height:100%;background:${p.progress>=100?'var(--accent-green)':'var(--accent-blue)'};border-radius:2px"></div>
          </div>
        </td>
        <td style="padding:6px 8px;text-align:center">
          <div style="font-size:14px;font-weight:800;font-family:var(--font-mono);color:var(--text-muted)">${p.plannedProgress || 0}%</div>
          <div style="width:50px;height:4px;background:var(--border);border-radius:2px;margin:3px auto 0">
            <div style="width:${p.plannedProgress||0}%;height:100%;background:var(--text-muted);border-radius:2px"></div>
          </div>
        </td>
        <td style="padding:6px 8px;text-align:center;font-family:var(--font-mono);font-weight:700;font-size:13px">${durActual}</td>
        <td style="padding:6px 8px;text-align:center;font-family:var(--font-mono);font-size:13px;color:var(--text-muted)">${durPlan}</td>
        <td style="padding:4px 6px;min-width:130px">
          ${readonly
            ? `<span style="font-size:11px;font-weight:700;padding:3px 10px;border-radius:12px;background:${statusColor}22;color:${statusColor}">${status || '—'}</span>`
            : `<div style="display:flex;gap:3px;flex-wrap:wrap">
              ${['ONGOING','WAITING','DONE','ON HOLD'].map(s =>
                `<button onclick="dmSetStatus('${p.id}','${s}')"
                  style="font-size:9px;padding:3px 7px;border-radius:10px;border:1px solid ${statusColors[s]};
                    background:${status===s ? statusColors[s] : 'transparent'};
                    color:${status===s ? '#fff' : statusColors[s]};cursor:pointer;font-weight:600;transition:all .15s"
                >${s}</button>`).join('')}
              </div>`
          }
        </td>
        <td style="padding:4px 6px;min-width:140px">
          ${readonly
            ? `<span style="font-size:11px">${remarks || '<span style="color:var(--text-muted)">N/A</span>'}</span>`
            : `<textarea class="form-input" rows="2" placeholder="Remarks..."
                style="width:100%;min-width:130px;font-size:11px;padding:4px 6px;resize:vertical;min-height:36px"
                oninput="dmSetField('${p.id}','remarks',this.value)">${remarks}</textarea>`
          }
        </td>
        <td style="padding:4px 6px;min-width:140px">
          ${readonly
            ? `<span style="font-size:11px">${targetActivity || '<span style="color:var(--text-muted)">N/A</span>'}</span>`
            : `<textarea class="form-input" rows="2" placeholder="Next activity..."
                style="width:100%;min-width:130px;font-size:11px;padding:4px 6px;resize:vertical;min-height:36px"
                oninput="dmSetField('${p.id}','targetActivity',this.value)">${targetActivity}</textarea>`
          }
        </td>
        <td style="padding:4px 6px;min-width:160px">
          ${readonly
            ? `<span style="font-size:11px">${update || '<span style="color:var(--text-muted)">N/A</span>'}</span>`
            : `<textarea class="form-input" rows="2" placeholder="Today's update..."
                style="width:100%;min-width:130px;font-size:11px;padding:4px 6px;resize:vertical;min-height:36px"
                oninput="dmSetField('${p.id}','update',this.value)">${update}</textarea>`
          }
          ${prevLog && prevLog.update ? `<div style="margin-top:4px;padding:4px 6px;background:var(--bg-hover);border-left:2px solid var(--accent-blue);border-radius:0 4px 4px 0;font-size:9px;line-height:1.4;color:var(--text-muted)" title="Previous update from ${prevLog.date}">
            <div style="font-weight:700;color:var(--accent-blue);margin-bottom:2px"><i class="fas fa-clock-rotate-left" style="margin-right:3px"></i>Last update · ${prevLog.date}</div>
            <div style="max-height:36px;overflow:hidden;text-overflow:ellipsis">${(prevLog.update||'').substring(0,140)}${(prevLog.update||'').length>140?'...':''}</div>
          </div>` : ''}
        </td>
        <td style="padding:4px 6px;text-align:center">
          ${readonly ? '' : `
          <button onclick="dmToggleFlag('${p.id}')" title="${flagged ? 'Remove flag' : 'Flag for attention'}"
            style="background:${flagged ? 'rgba(248,81,73,.15)' : 'var(--bg-hover)'};border:1px solid ${flagged ? 'var(--accent-red)' : 'var(--border)'};
              color:${flagged ? 'var(--accent-red)' : 'var(--text-muted)'};border-radius:6px;padding:4px 8px;cursor:pointer">
            <i class="fas fa-flag" style="font-size:12px"></i>
          </button>`}
          ${hasUpdate && log.savedBy ? `<div style="font-size:9px;color:var(--text-muted);margin-top:3px">${log.savedBy.split('@')[0]}</div>` : ''}
        </td>
      </tr>
      ${isExpanded ? _dmRenderActionRows(p.id, readonly) : ''}`;
    }).join('');
  }

  // Build group tables
  let groupsHTML = '';
  const sortedGroups = Object.entries(groups).sort(([a], [b]) => {
    // Flagged projects first within groups
    return 0;
  });

  if (sortedGroups.length === 0) {
    groupsHTML = `<div class="empty-state"><i class="fas fa-clipboard-check"></i><p>No active projects found. Add projects first.</p></div>`;
  } else {
    sortedGroups.forEach(([groupName, group]) => {
      // Sort: flagged first
      const gProjects = [...group.projects].sort((a, b) => {
        const aF = (dateLogMap[a.id]?.flagged || _dmUnsaved[a.id]?.flagged) ? -1 : 0;
        const bF = (dateLogMap[b.id]?.flagged || _dmUnsaved[b.id]?.flagged) ? -1 : 0;
        return aF - bF;
      });
      groupsHTML += `
      <div style="margin-bottom:20px;border:1px solid ${group.color}33;border-radius:10px;overflow:hidden">
        <div style="background:${group.color};padding:8px 16px;display:flex;align-items:center;justify-content:space-between">
          <div style="color:#fff;font-weight:800;font-size:13px;letter-spacing:1px;text-transform:uppercase">
            <i class="fas fa-layer-group" style="margin-right:8px;font-size:11px"></i>${groupName}
          </div>
          <div style="color:rgba(255,255,255,.8);font-size:10px">${gProjects.length} project${gProjects.length !== 1 ? 's' : ''}</div>
        </div>
        <div style="overflow-x:auto">
          <table style="width:100%;border-collapse:collapse;min-width:900px">
            <thead>
              <tr style="background:${group.color}18">
                <th style="padding:8px;font-size:10px;font-weight:700;text-align:left;min-width:160px;border-bottom:2px solid ${group.color}33">ITEM</th>
                <th style="padding:8px;font-size:10px;font-weight:700;text-align:center;border-bottom:2px solid ${group.color}33" colspan="2">PROGRESS (%)</th>
                <th style="padding:8px;font-size:10px;font-weight:700;text-align:center;border-bottom:2px solid ${group.color}33" colspan="2">DURATION (DAY)</th>
                <th style="padding:8px;font-size:10px;font-weight:700;text-align:center;border-bottom:2px solid ${group.color}33">STATUS</th>
                <th style="padding:8px;font-size:10px;font-weight:700;text-align:left;border-bottom:2px solid ${group.color}33">REMARKS</th>
                <th style="padding:8px;font-size:10px;font-weight:700;text-align:left;border-bottom:2px solid ${group.color}33">TARGET ACTIVITY</th>
                <th style="padding:8px;font-size:10px;font-weight:700;text-align:left;border-bottom:2px solid ${group.color}33">UPDATE</th>
                <th style="padding:8px;font-size:10px;font-weight:700;text-align:center;border-bottom:2px solid ${group.color}33">FLAG</th>
              </tr>
              <tr style="background:${group.color}0a">
                <th style="padding:3px 8px;font-size:9px;color:var(--text-muted);font-weight:400"></th>
                <th style="padding:3px 8px;font-size:9px;color:var(--text-muted);font-weight:400;text-align:center">ACTUAL</th>
                <th style="padding:3px 8px;font-size:9px;color:var(--text-muted);font-weight:400;text-align:center">PLAN</th>
                <th style="padding:3px 8px;font-size:9px;color:var(--text-muted);font-weight:400;text-align:center">ACTUAL</th>
                <th style="padding:3px 8px;font-size:9px;color:var(--text-muted);font-weight:400;text-align:center">PLAN</th>
                <th colspan="5"></th>
              </tr>
            </thead>
            <tbody>${buildRows(gProjects)}</tbody>
          </table>
        </div>
      </div>`;
    });
  }

  $('#dailymeeting').innerHTML = `
  <!-- Header -->
  <div class="section-header" style="margin-bottom:14px">
    <div>
      <div class="section-title"><i class="fas fa-clipboard-check" style="color:var(--accent-blue);margin-right:8px"></i>Daily Meeting Board</div>
      <div class="section-sub">${companyName} — Project Status Update</div>
    </div>
    <div style="display:flex;gap:7px;align-items:center;flex-wrap:wrap">
      ${isToday ? `
      <button class="btn btn-secondary btn-sm" onclick="dmCarryForward()" title="Pre-fill from yesterday's meeting">
        <i class="fas fa-copy"></i> Carry Forward
      </button>
      <button class="btn btn-success" onclick="dmSaveMeeting()">
        <i class="fas fa-save"></i> Save Meeting
      </button>` : ''}
      <button class="btn btn-secondary btn-sm" onclick="dmShowPrintOptions()">
        <i class="fas fa-print"></i> Print Minutes
      </button>
    </div>
  </div>

  <!-- Stats bar -->
  <div style="display:grid;grid-template-columns:repeat(7,1fr);gap:8px;margin-bottom:14px">
    ${(()=>{
      const allActs = (AppState.data.actions||[]).filter(a => projects.find(p=>p.id===a.projectId));
      const t = new Date().toISOString().split('T')[0];
      const isDoneA = a => a.status==='closed' || a.status==='completed' || a.status==='cancelled';
      const openA = allActs.filter(a => !isDoneA(a)).length;
      const overdueA = allActs.filter(a => !isDoneA(a) && a.dueDate && a.dueDate<t).length;
      return [
      ['fa-briefcase','Total Projects',totalProjects,'var(--accent-blue)'],
      ['fa-check-circle','Updated Today',updatedToday + ' / ' + totalProjects,'var(--accent-green)'],
      ['fa-flag','Flagged',flaggedCount,'var(--accent-red)'],
      ['fa-check-double','Done',doneCount,'var(--accent-green)'],
      ['fa-pause-circle','Waiting / On Hold',waitingCount,'var(--accent-amber)'],
      ['fa-tasks','Open Actions',openA,'#388bfd'],
      ['fa-exclamation-circle','Overdue Actions',overdueA,overdueA>0?'#f85149':'var(--text-muted)'],
      ];
    })().map(([ico,lbl,val,col]) => `
    <div style="padding:10px 12px;background:var(--bg-card);border-radius:8px;border:1px solid var(--border);text-align:center">
      <i class="fas ${ico}" style="color:${col};margin-bottom:5px;display:block"></i>
      <div style="font-size:15px;font-weight:800;font-family:var(--font-mono);color:${col}">${val}</div>
      <div style="font-size:9px;color:var(--text-muted)">${lbl}</div>
    </div>`).join('')}
  </div>

  <!-- Controls -->
  <div style="display:flex;align-items:center;gap:10px;margin-bottom:14px;flex-wrap:wrap">
    <!-- Date picker -->
    <div style="display:flex;align-items:center;gap:6px">
      <button class="btn btn-secondary btn-sm" onclick="dmChangeDate(-1)"><i class="fas fa-chevron-left"></i></button>
      <input type="date" class="form-input" value="${_dmViewDate}" onchange="dmGoToDate(this.value)"
        style="width:145px;height:32px;font-size:12px">
      <button class="btn btn-secondary btn-sm" onclick="dmChangeDate(1)" ${isToday ? 'disabled' : ''}><i class="fas fa-chevron-right"></i></button>
      ${!isToday ? `<button class="btn btn-primary btn-sm" onclick="dmGoToDate('${today}')">Today</button>` : ''}
    </div>
    <!-- Show completed actions toggle -->
    <label style="display:flex;align-items:center;gap:6px;font-size:11px;color:var(--text-secondary);cursor:pointer;white-space:nowrap">
      <input type="checkbox" ${_dmShowCompleted?'checked':''} onchange="_dmShowCompleted=this.checked;renderDailyMeeting()">
      Show completed actions
    </label>
    <button class="btn btn-secondary btn-sm" onclick="_dmExpandAll(true)" style="font-size:10px" title="Expand all action lists"><i class="fas fa-angles-down"></i></button>
    <button class="btn btn-secondary btn-sm" onclick="_dmExpandAll(false)" style="font-size:10px" title="Collapse all action lists"><i class="fas fa-angles-up"></i></button>
    <!-- Status filter -->
    <div style="display:flex;gap:5px;flex-wrap:wrap">
      ${[['all','All','var(--text-secondary)'],['ONGOING','Ongoing','#388bfd'],['WAITING','Waiting','#f0a450'],['DONE','Done','#3fb950'],['ON HOLD','On Hold','#f85149']].map(([val,lbl,col]) =>
        `<button onclick="_dmStatusFilter='${val}';renderDailyMeeting()"
          style="font-size:10px;padding:4px 10px;border-radius:10px;cursor:pointer;font-weight:600;
            background:${_dmStatusFilter===val ? col : 'transparent'};
            color:${_dmStatusFilter===val ? '#fff' : col};
            border:1px solid ${col};transition:all .15s">${lbl}</button>`
      ).join('')}
    </div>
    ${isToday && Object.keys(_dmUnsaved).length > 0 ? `
    <div style="margin-left:auto;padding:5px 10px;background:rgba(240,164,80,.1);border:1px solid var(--accent-amber);border-radius:6px;font-size:10px;color:var(--accent-amber)">
      <i class="fas fa-exclamation-circle" style="margin-right:4px"></i>${Object.keys(_dmUnsaved).length} unsaved change(s)
    </div>` : ''}
  </div>

  <!-- Not today notice -->
  ${!isToday ? `
  <div style="padding:8px 14px;background:rgba(56,139,253,.08);border:1px solid rgba(56,139,253,.2);border-radius:7px;font-size:11px;margin-bottom:12px;color:var(--accent-blue)">
    <i class="fas fa-history" style="margin-right:6px"></i>
    Viewing meeting record for <strong>${_dmViewDate}</strong> — read only. Switch to today to add new entries.
  </div>` : ''}

  <!-- Groups -->
  <div id="dmGroups">${groupsHTML}</div>`;
}

// ── Daily Meeting helper functions ───────────────────────

// ── Render expandable action item rows under a project ────
function _dmRenderActionRows(projectId, readonly) {
  let actions = _dmGetProjectActions(projectId);
  const isDone = a => a.status === 'closed' || a.status === 'completed' || a.status === 'cancelled';
  if (!_dmShowCompleted) actions = actions.filter(a => !isDone(a));
  if (!actions.length) {
    return `<tr style="background:var(--bg-primary)">
      <td colspan="10" style="padding:8px 16px 8px 38px;border-top:1px dashed var(--border)">
        <div style="display:flex;align-items:center;gap:10px;font-size:11px;color:var(--text-muted)">
          <i class="fas fa-tasks" style="color:var(--accent-blue)"></i>
          <span>No action items yet for this project</span>
          ${readonly?'':`<button class="btn btn-secondary btn-sm" style="font-size:10px;padding:3px 8px" onclick="dmAddActionInline('${projectId}')"><i class="fas fa-plus"></i> Add action</button>`}
        </div>
      </td></tr>`;
  }
  // Sort: overdue first, then due today, then by status
  const today = new Date().toISOString().split('T')[0];
  actions.sort((a,b) => {
    const aOverdue = (!isDone(a)&&a.dueDate&&a.dueDate<today)?0:1;
    const bOverdue = (!isDone(b)&&b.dueDate&&b.dueDate<today)?0:1;
    if (aOverdue !== bOverdue) return aOverdue - bOverdue;
    return (a.dueDate||'').localeCompare(b.dueDate||'');
  });

  const actionsHTML = actions.map(a => {
    const pri = _dmActionPriorityIcon(a);
    const statusColor = _dmActionStatusColor(a.status||'open');
    const updates = a.updates || [];
    const pendingUpdate = _dmActionUpdates[a.id] || {};
    const updateText = pendingUpdate.text !== undefined ? pendingUpdate.text : '';
    const pendingStatus = pendingUpdate.newStatus !== undefined ? pendingUpdate.newStatus : (a.status||'open');
    const statusChanged = pendingStatus !== (a.status||'open');
    const lastUpdate = updates[updates.length-1];
    const updatedToday = a.lastUpdate === today || (pendingUpdate.text && pendingUpdate.text.trim());

    return `<div style="padding:10px 12px;border-bottom:1px solid var(--border);background:${pri.color==='#f85149'?'rgba(248,81,73,.04)':pri.color==='#f0a450'?'rgba(240,164,80,.04)':'transparent'}">
      <div style="display:grid;grid-template-columns:24px 1fr 220px 220px 60px;gap:10px;align-items:center">
        <i class="fas ${pri.icon}" style="color:${pri.color};font-size:14px" title="${pri.label}"></i>
        <div>
          <div style="font-size:12px;font-weight:600;line-height:1.3;cursor:pointer" onclick="event.stopPropagation();_dmOpenAction('${a.id}')">${a.description||a.title||'(no description)'}</div>
          <div style="font-size:10px;color:var(--text-muted);margin-top:2px;display:flex;flex-wrap:wrap;gap:8px">
            <span style="font-family:var(--font-mono);color:var(--accent-blue);font-weight:700">${a.id}</span>
            ${(a.assignee||a.assignedTo)?`<span><i class="fas fa-user" style="margin-right:3px"></i>${a.assignee||a.assignedTo}</span>`:''}
            ${a.source?`<span><i class="fas fa-tag" style="margin-right:3px"></i>${a.source}</span>`:''}
            ${a.dueDate?`<span style="${pri.color==='#f85149'?'color:'+pri.color+';font-weight:700':''}"><i class="fas fa-calendar" style="margin-right:3px"></i>${a.dueDate}</span>`:''}
            ${a.priority?`<span class="badge" style="background:${(a.priority==='critical'||a.priority==='high')?'rgba(248,81,73,.15);color:#f85149':a.priority==='medium'?'rgba(240,164,80,.15);color:#f0a450':'rgba(63,185,80,.15);color:#3fb950'};font-size:8px;padding:1px 4px">${a.priority}</span>`:''}
            ${lastUpdate?`<span title="${lastUpdate.text}"><i class="fas fa-history" style="margin-right:3px"></i>${updates.length} update${updates.length!==1?'s':''}</span>`:''}
          </div>
        </div>
        ${readonly ? `<span style="font-size:11px;color:${statusColor};font-weight:600">${a.status||'open'}</span><span></span>` :
        `<select class="form-select" style="height:28px;font-size:11px" onchange="dmActionSetStatus('${a.id}',this.value)">
          ${['open','in-progress','on-hold','closed','cancelled'].map(s=>`<option value="${s}" ${pendingStatus===s?'selected':''}>${s}${statusChanged&&s===pendingStatus?' (will change)':''}</option>`).join('')}
        </select>
        <textarea class="form-input" rows="1" placeholder="Today's update for this action..." style="font-size:11px;padding:5px 8px;resize:vertical;min-height:28px" oninput="dmActionSetUpdate('${a.id}',this.value)">${updateText}</textarea>`}
        ${readonly?'<span></span>':`<button class="btn btn-success btn-sm btn-icon" onclick="dmActionQuickComplete('${a.id}')" title="Mark as completed"><i class="fas fa-check"></i></button>`}
      </div>
      ${(updateText||statusChanged)?`<div style="margin-top:6px;padding-left:34px;font-size:10px;color:var(--accent-amber)"><i class="fas fa-exclamation-circle" style="margin-right:3px"></i>Pending changes — will save with meeting</div>`:''}
      ${lastUpdate ? `<div style="margin-top:6px;padding:5px 8px;background:var(--bg-hover);border-left:2px solid #bc8cff;border-radius:0 4px 4px 0;margin-left:34px;font-size:10px;color:var(--text-muted);line-height:1.5">
        <strong style="color:#bc8cff"><i class="fas fa-clock-rotate-left" style="margin-right:3px"></i>Last update · ${lastUpdate.date}</strong>${lastUpdate.user ? ` <span style="opacity:.7">by ${lastUpdate.user}</span>` : ''}
        <div style="margin-top:2px;color:var(--text-secondary)">${(lastUpdate.text||'').substring(0,200)}${(lastUpdate.text||'').length>200?'...':''}</div>
        ${(a.updates||[]).length > 1 ? `<a onclick="event.stopPropagation();dmShowActionHistory('${a.id}')" style="font-size:9px;color:var(--accent-blue);cursor:pointer;font-weight:600;margin-top:3px;display:inline-block">View all ${(a.updates||[]).length} updates →</a>` : ''}
      </div>` : ''}
    </div>`;
  }).join('');

  return `<tr style="background:var(--bg-primary)">
    <td colspan="10" style="padding:0;border-top:2px solid var(--accent-blue)">
      <div style="padding:8px 14px;background:rgba(56,139,253,.05);border-bottom:1px solid var(--border);font-size:11px;font-weight:700;color:var(--accent-blue);display:flex;align-items:center;justify-content:space-between">
        <span><i class="fas fa-tasks" style="margin-right:6px"></i>Action Items (${actions.length}${_dmShowCompleted?' shown':' open'})</span>
        ${readonly?'':`<button class="btn btn-secondary btn-sm" style="font-size:10px;padding:3px 10px" onclick="dmAddActionInline('${projectId}')"><i class="fas fa-plus"></i> Add Action</button>`}
      </div>
      ${actionsHTML}
    </td></tr>`;
}

// ── Action handlers ────────────────────────────────────────
function dmToggleExpand(pid) {
  _dmExpanded[pid] = !_dmExpanded[pid];
  renderDailyMeeting();
}

function _dmExpandAll(expand) {
  const projects = (AppState.data.projects || []).filter(p =>
    p.status === 'active' || p.status === 'planned' || p.status === 'on-hold'
  );
  projects.forEach(p => { _dmExpanded[p.id] = expand; });
  renderDailyMeeting();
}

function dmActionSetStatus(actionId, newStatus) {
  if (!_dmActionUpdates[actionId]) _dmActionUpdates[actionId] = {};
  _dmActionUpdates[actionId].newStatus = newStatus;
  // Don't re-render — that would lose textarea focus
  // The pending indicator will appear on next save
}

function dmActionSetUpdate(actionId, text) {
  if (!_dmActionUpdates[actionId]) _dmActionUpdates[actionId] = {};
  _dmActionUpdates[actionId].text = text;
}

function dmActionQuickComplete(actionId) {
  const a = (AppState.data.actions||[]).find(x => x.id === actionId);
  if (!a) return;
  if (a.status === 'closed' || a.status === 'completed') { showToast('Already closed','info'); return; }
  const label = a.description || a.title || 'this action';
  if (!confirm('Mark "' + label + '" as closed?')) return;
  if (!_dmActionUpdates[actionId]) _dmActionUpdates[actionId] = {};
  _dmActionUpdates[actionId].newStatus = 'closed';
  if (!_dmActionUpdates[actionId].text) _dmActionUpdates[actionId].text = 'Closed via Daily Meeting quick action';
  _dmApplyActionUpdate(actionId);
  AppState.save();
  delete _dmActionUpdates[actionId];
  renderDailyMeeting();
  showToast('Action closed','success');
}

function _dmApplyActionUpdate(actionId) {
  const a = (AppState.data.actions||[]).find(x => x.id === actionId);
  if (!a) return;
  const pending = _dmActionUpdates[actionId] || {};
  const today = new Date().toISOString().split('T')[0];
  const user = _currentUserProfile?.name || _currentUser?.email || 'User';
  const oldStatus = a.status || 'open';
  const newStatus = pending.newStatus || oldStatus;
  const text = (pending.text || '').trim();
  if (!text && newStatus === oldStatus) return; // nothing to save
  if (!a.updates) a.updates = [];
  a.updates.push({
    date: today,
    user,
    text: text || ('Status changed: ' + oldStatus + ' → ' + newStatus),
    statusBefore: oldStatus,
    statusAfter: newStatus,
  });
  a.status = newStatus;
  a.lastUpdate = today;
  if (newStatus === 'closed' || newStatus === 'completed') {
    a.closedAt = new Date().toISOString();
    a.closedBy = user;
  }
}

function dmAddActionInline(projectId) {
  const description = prompt('Action item description:');
  if (!description || !description.trim()) return;
  const assignee = prompt('Assignee (optional):') || '';
  const dueDate = prompt('Due date (YYYY-MM-DD, optional):') || '';
  const priority = prompt('Priority (critical/high/medium/low, optional):', 'medium') || 'medium';
  const user = _currentUserProfile?.name || _currentUser?.email || 'User';
  const newId = 'ACT-' + String((AppState.data.actions||[]).length + 1).padStart(3, '0');
  const newAction = {
    id: newId,
    projectId,
    description: description.trim(),
    assignee: assignee.trim(),
    source: 'Daily Meeting',
    dueDate: dueDate.trim(),
    priority: ['critical','high','medium','low'].includes(priority.trim().toLowerCase()) ? priority.trim().toLowerCase() : 'medium',
    status: 'open',
    createdBy: user,
    createdAt: new Date().toISOString(),
    updates: [],
  };
  if (!AppState.data.actions) AppState.data.actions = [];
  _markNewlyCreated(newAction);
  AppState.data.actions.push(newAction);
  AppState.save();
  _dmExpanded[projectId] = true;
  renderDailyMeeting();
  showToast('Action item added','success');
  if (typeof buildSidebar === 'function') buildSidebar();
}

function _dmOpenAction(actionId) {
  // Navigate to Action Items page and (if function exists) open detail
  navigate('actions');
}

function dmSetStatus(pid, status) {
  if (!_dmUnsaved[pid]) _dmUnsaved[pid] = {};
  // Toggle off if already selected
  _dmUnsaved[pid].status = _dmUnsaved[pid].status === status ? '' : status;
  renderDailyMeeting();
}

function dmSetField(pid, field, value) {
  if (!_dmUnsaved[pid]) _dmUnsaved[pid] = {};
  _dmUnsaved[pid][field] = value;
}

function dmToggleFlag(pid) {
  if (!_dmUnsaved[pid]) _dmUnsaved[pid] = {};
  const today = new Date().toISOString().split('T')[0];
  const existingLog = (AppState.data.dailyMeetingLogs || []).find(l => l.projectId === pid && l.date === today);
  const currentFlag = _dmUnsaved[pid].flagged !== undefined ? _dmUnsaved[pid].flagged : (existingLog?.flagged || false);
  _dmUnsaved[pid].flagged = !currentFlag;
  renderDailyMeeting();
}

function dmChangeDate(delta) {
  const d = new Date(_dmViewDate);
  d.setDate(d.getDate() + delta);
  const today = new Date().toISOString().split('T')[0];
  const newDate = d.toISOString().split('T')[0];
  if (newDate > today) return;
  _dmViewDate = newDate;
  _dmUnsaved = {};
  renderDailyMeeting();
}

function dmGoToDate(date) {
  const today = new Date().toISOString().split('T')[0];
  if (date > today) return;
  _dmViewDate = date;
  _dmUnsaved = {};
  renderDailyMeeting();
}

// ── Carry forward yesterday's entries ────────────────────
function dmCarryForward() {
  const today = new Date().toISOString().split('T')[0];
  const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];
  const yesterdayLogs = (AppState.data.dailyMeetingLogs || []).filter(l => l.date === yesterday);
  if (!yesterdayLogs.length) { showToast('No entries found from yesterday', 'warning'); return; }
  const todayLogs = (AppState.data.dailyMeetingLogs || []).filter(l => l.date === today);
  const todayLogIds = new Set(todayLogs.map(l => l.projectId));
  let carried = 0;
  yesterdayLogs.forEach(l => {
    if (todayLogIds.has(l.projectId)) return; // already has today's entry
    if (!_dmUnsaved[l.projectId]) {
      _dmUnsaved[l.projectId] = {
        status: l.status === 'DONE' ? 'DONE' : l.status, // keep DONE, carry others
        remarks: l.remarks || '',
        targetActivity: l.targetActivity || '',
        update: '', // clear update — needs new entry
        flagged: l.flagged || false
      };
      carried++;
    }
  });
  showToast(`Carried forward ${carried} entries from yesterday`, 'success');
  renderDailyMeeting();
}

// ── Save meeting ──────────────────────────────────────────
function dmSaveMeeting() {
  const today = new Date().toISOString().split('T')[0];
  if (!AppState.data.dailyMeetingLogs) AppState.data.dailyMeetingLogs = [];
  const savedBy = (typeof _currentUserProfile !== 'undefined' && _currentUserProfile?.name) ||
    (typeof _currentUser !== 'undefined' && _currentUser?.email) || 'Unknown';
  const projects = AppState.data.projects || [];
  let savedCount = 0;

  Object.entries(_dmUnsaved).forEach(([pid, entry]) => {
    const p = projects.find(x => x.id === pid);
    if (!p) return;
    // Find existing log for today
    const existingIdx = AppState.data.dailyMeetingLogs.findIndex(l => l.projectId === pid && l.date === today);
    const log = {
      id: existingIdx >= 0 ? AppState.data.dailyMeetingLogs[existingIdx].id : 'DML-' + Date.now().toString(36).toUpperCase() + '-' + pid,
      date: today,
      projectId: pid,
      status: entry.status || '',
      remarks: entry.remarks || '',
      targetActivity: entry.targetActivity || '',
      update: entry.update || '',
      progressSnapshot: p.progress || 0,
      plannedProgressSnapshot: p.plannedProgress || 0,
      flagged: entry.flagged || false,
      savedBy,
      savedAt: new Date().toISOString()
    };
    if (existingIdx >= 0) AppState.data.dailyMeetingLogs[existingIdx] = log;
    else AppState.data.dailyMeetingLogs.push(log);
    savedCount++;
  });

  // Apply any pending action item updates
  let actionUpdates = 0;
  Object.keys(_dmActionUpdates).forEach(actId => {
    const pending = _dmActionUpdates[actId];
    if (pending.text || pending.newStatus) {
      const a = (AppState.data.actions||[]).find(x => x.id === actId);
      if (a) {
        const willChange = (pending.text && pending.text.trim()) || (pending.newStatus && pending.newStatus !== (a.status||'open'));
        if (willChange) { _dmApplyActionUpdate(actId); actionUpdates++; }
      }
    }
  });
  _dmActionUpdates = {};

  if (savedCount === 0 && actionUpdates === 0) { showToast('No changes to save', 'warning'); return; }
  _dmUnsaved = {};
  AppState.save();
  const parts = [];
  if (savedCount) parts.push(`${savedCount} project${savedCount !== 1 ? 's' : ''}`);
  if (actionUpdates) parts.push(`${actionUpdates} action${actionUpdates !== 1 ? 's' : ''}`);
  showToast(`Meeting saved — ${parts.join(' + ')} updated`, 'success');
  renderDailyMeeting();
}

// ── Print meeting minutes ─────────────────────────────────

// ── Print Options Modal ─────────────────────────────────────
function dmShowPrintOptions() {
  const projects = (AppState.data.projects || []).filter(p =>
    p.status === 'active' || p.status === 'planned' || p.status === 'on-hold'
  );
  const today = new Date().toISOString().split('T')[0];

  $('#genericModalTitle').textContent = 'Print Daily Meeting Minutes';
  $('#genericModalBody').innerHTML = `
    <div class="form-group" style="margin-bottom:14px">
      <label class="form-label" style="display:flex;align-items:center;gap:6px"><i class="fas fa-tasks" style="color:var(--accent-blue)"></i>Action Items</label>
      <div style="display:flex;flex-direction:column;gap:10px;padding:10px;background:var(--bg-hover);border-radius:8px">
        <label style="display:flex;align-items:center;gap:8px;font-size:12px;cursor:pointer">
          <input type="checkbox" id="pmIncludeActions" checked> <strong>Include action items per project</strong>
        </label>
        <label style="display:flex;align-items:center;gap:8px;font-size:12px;cursor:pointer;padding-left:20px">
          <input type="checkbox" id="pmIncludeCompleted"> Also include closed / completed / cancelled actions
        </label>
        <label style="display:flex;align-items:center;gap:8px;font-size:12px;cursor:pointer;padding-left:20px">
          <input type="checkbox" id="pmIncludeUpdates" checked> Include action update history
        </label>
        <div style="display:flex;align-items:center;gap:8px;font-size:11px;padding-left:20px;color:var(--text-muted)">
          Show last
          <input type="number" id="pmUpdateLimit" value="5" min="1" max="50" style="width:50px;padding:3px 6px;font-size:11px;background:var(--bg-card);border:1px solid var(--border);border-radius:4px;color:var(--text-primary)">
          updates per action
        </div>
      </div>
    </div>

    <div class="form-group" style="margin-bottom:14px">
      <label class="form-label" style="display:flex;align-items:center;gap:6px"><i class="fas fa-clock-rotate-left" style="color:var(--accent-blue)"></i>Project Update History</label>
      <div style="display:flex;flex-direction:column;gap:10px;padding:10px;background:var(--bg-hover);border-radius:8px">
        <label style="display:flex;align-items:center;gap:8px;font-size:12px;cursor:pointer">
          <input type="checkbox" id="pmIncludeProjectHistory"> <strong>Include previous meeting updates for selected projects</strong>
        </label>
        <div style="display:flex;align-items:center;gap:8px;font-size:11px;padding-left:20px;color:var(--text-muted)">
          Show last
          <input type="number" id="pmHistoryLimit" value="3" min="1" max="30" style="width:50px;padding:3px 6px;font-size:11px;background:var(--bg-card);border:1px solid var(--border);border-radius:4px;color:var(--text-primary)">
          previous meeting updates per project
        </div>
      </div>
    </div>

    <div class="form-group">
      <label class="form-label">Projects to Include</label>
      <div style="display:flex;gap:8px;margin-bottom:8px">
        <button type="button" class="btn btn-secondary btn-sm" onclick="_pmSelectAll(true)" style="font-size:10px;padding:4px 10px"><i class="fas fa-check-square"></i> Select All</button>
        <button type="button" class="btn btn-secondary btn-sm" onclick="_pmSelectAll(false)" style="font-size:10px;padding:4px 10px"><i class="fas fa-square"></i> Deselect All</button>
        <button type="button" class="btn btn-secondary btn-sm" onclick="_pmSelectActive()" style="font-size:10px;padding:4px 10px"><i class="fas fa-bolt"></i> Only Active Today</button>
      </div>
      <div style="max-height:240px;overflow-y:auto;border:1px solid var(--border);border-radius:7px;padding:8px">
        ${projects.map(p => {
          const log = (AppState.data.dailyMeetingLogs||[]).find(l => l.date === _dmViewDate && l.projectId === p.id);
          const hasUpdate = log && (log.update || log.status);
          return `<label style="display:flex;align-items:center;gap:8px;padding:6px;font-size:11px;cursor:pointer;border-bottom:1px solid var(--border)">
            <input type="checkbox" class="pm-proj-cb" value="${p.id}" checked>
            <span style="font-family:var(--font-mono);color:var(--accent-blue);font-weight:700">${p.id}</span>
            <span style="flex:1;color:var(--text-secondary)">${(p.name||'').substring(0,50)}</span>
            ${hasUpdate ? '<span style="font-size:9px;color:var(--accent-green);font-weight:600"><i class="fas fa-check" style="margin-right:2px"></i>Updated</span>' : '<span style="font-size:9px;color:var(--text-muted)">Not yet</span>'}
          </label>`;
        }).join('')}
      </div>
    </div>
  `;
  $('#genericModalFooter').innerHTML = `
    <button class="btn btn-secondary" onclick="closeModal('genericModal')">Cancel</button>
    <button class="btn btn-primary" onclick="_pmExecutePrint()"><i class="fas fa-print"></i> Print Selected</button>
  `;
  openModal('genericModal');
}

function _pmSelectAll(checked) {
  document.querySelectorAll('.pm-proj-cb').forEach(cb => cb.checked = checked);
}

function _pmSelectActive() {
  const today = new Date().toISOString().split('T')[0];
  const logs = (AppState.data.dailyMeetingLogs||[]).filter(l => l.date === _dmViewDate);
  const activeIds = new Set(logs.map(l => l.projectId));
  document.querySelectorAll('.pm-proj-cb').forEach(cb => cb.checked = activeIds.has(cb.value));
}

function _pmExecutePrint() {
  const includeActions = document.getElementById('pmIncludeActions')?.checked;
  const includeCompleted = document.getElementById('pmIncludeCompleted')?.checked;
  const includeUpdates = document.getElementById('pmIncludeUpdates')?.checked;
  const includeProjectHistory = document.getElementById('pmIncludeProjectHistory')?.checked;
  const updateLimit = parseInt(document.getElementById('pmUpdateLimit')?.value) || 5;
  const historyLimit = parseInt(document.getElementById('pmHistoryLimit')?.value) || 3;
  const selectedIds = Array.from(document.querySelectorAll('.pm-proj-cb'))
    .filter(cb => cb.checked).map(cb => cb.value);
  if (selectedIds.length === 0) { showToast('Select at least one project', 'warning'); return; }
  closeModal('genericModal');
  dmPrintMeeting({
    includeActions, includeCompleted, includeUpdates, includeProjectHistory,
    updateLimit, historyLimit,
    projectIds: selectedIds,
  });
}

function dmPrintMeeting(opts) {
  opts = opts || { includeActions: true, includeCompleted: false, includeUpdates: true, includeProjectHistory: false, projectIds: null };
  const companyName = AppState.data.settings?.companyName || 'SHIC';
  const BUs = AppState.data.businessUnits || [];
  const logs = AppState.data.dailyMeetingLogs || [];
  const dateLogs = logs.filter(l => l.date === _dmViewDate);
  const dateLogMap = {}; dateLogs.forEach(l => dateLogMap[l.projectId] = l);
  let projects = (AppState.data.projects || []).filter(p =>
    p.status === 'active' || p.status === 'planned' || p.status === 'on-hold'
  );
  if (opts.projectIds && opts.projectIds.length) {
    projects = projects.filter(p => opts.projectIds.includes(p.id));
  }

  // Group
  const groups = {};
  projects.forEach(p => {
    const bu = BUs.find(b => b.id === p.businessUnit);
    const key = bu ? bu.name : (p.discipline || companyName + ' — Main');
    if (!groups[key]) groups[key] = { color: bu?.color || '#1565c0', projects: [] };
    groups[key].projects.push(p);
  });

  const dateStr = new Date(_dmViewDate).toLocaleDateString('en-US', { weekday:'long', year:'numeric', month:'long', day:'numeric' });
  const statusColors = { 'DONE': '#2e7d32', 'ONGOING': '#1565c0', 'WAITING': '#e65100', 'ON HOLD': '#c62828', '': '#666' };

  let groupHTML = '';
  let totalActionsShown = 0;
  Object.entries(groups).forEach(([groupName, group]) => {
    const rows = group.projects.map(p => {
      const log = dateLogMap[p.id] || {};
      const startDate = p.startDate ? new Date(p.startDate) : null;
      const endDate = p.endDate ? new Date(p.endDate) : null;
      const viewDate = new Date(_dmViewDate);
      const durActual = startDate ? Math.max(0, Math.ceil((viewDate - startDate) / 86400000)) : '—';
      const durPlan = startDate && endDate ? Math.max(0, Math.ceil((endDate - startDate) / 86400000)) : '—';
      const sc = statusColors[log.status || ''] || '#666';
      // Previous project meeting history (if requested)
      let prevProjUpdate = '';
      if (opts.includeProjectHistory) {
        const limit = opts.historyLimit || 3;
        const allLogs = (AppState.data.dailyMeetingLogs||[])
          .filter(l => l.projectId === p.id && l.date < _dmViewDate && (l.update || l.remarks || l.status))
          .sort((a,b) => (b.date||'').localeCompare(a.date||''))
          .slice(0, limit);
        if (allLogs.length) {
          const entriesHTML = allLogs.map(l => `
            <div style="margin:3px 0;padding-left:8px;border-left:2px solid #1565c0">
              <div style="font-size:9px;color:#1565c0;font-weight:700">${l.date}${l.status?' · '+l.status:''}${l.flagged?' · 🚩 FLAGGED':''}</div>
              ${l.update ? `<div style="font-size:9px;color:#333;margin-top:1px"><strong>Update:</strong> ${l.update}</div>` : ''}
              ${l.remarks ? `<div style="font-size:9px;color:#666;margin-top:1px"><strong>Remarks:</strong> ${l.remarks}</div>` : ''}
              ${l.targetActivity ? `<div style="font-size:9px;color:#666;margin-top:1px"><strong>Target:</strong> ${l.targetActivity}</div>` : ''}
              ${l.savedBy ? `<div style="font-size:8px;color:#999;margin-top:1px">— ${l.savedBy.split('@')[0]}</div>` : ''}
            </div>`).join('');
          prevProjUpdate = `<tr><td colspan="9" style="padding:6px 8px 8px 16px;border:1px solid #ccc;background:#f0f8ff">
            <div style="font-size:9px;font-weight:700;color:#1565c0;margin-bottom:4px"><span style="background:#1565c0;color:#fff;padding:1px 6px;border-radius:8px">📅 PREVIOUS UPDATES</span> Last ${allLogs.length} meeting${allLogs.length!==1?'s':''}</div>
            ${entriesHTML}
          </td></tr>`;
        }
      }

      // Build action items for print
      const today = new Date().toISOString().split('T')[0];
      let actionRow = '';
      if (opts.includeActions) {
        const isDone = a => a.status === 'closed' || a.status === 'completed' || a.status === 'cancelled';
        let projActions = (AppState.data.actions||[]).filter(a => a.projectId === p.id);
        if (!opts.includeCompleted) projActions = projActions.filter(a => !isDone(a));
        projActions.sort((a,b) => {
          // Closed actions last
          if (isDone(a) !== isDone(b)) return isDone(a) ? 1 : -1;
          return (a.dueDate||'').localeCompare(b.dueDate||'');
        });

        if (projActions.length > 0) {
          totalActionsShown += projActions.length;
          const openCount = projActions.filter(a => !isDone(a)).length;
          const closedCount = projActions.length - openCount;
          const actionsTxt = projActions.map(a => {
            const overdue = !isDone(a) && a.dueDate && a.dueDate < today;
            const done = isDone(a);
            const status = (a.status||'open').toUpperCase();
            const bgColor = done ? '#f5f5f5' : (overdue ? '#fff5f5' : 'transparent');
            const textColor = done ? '#888' : (overdue ? '#c62828' : '#000');
            const allUpdates = a.updates || [];
            const todayUpd = allUpdates.slice(-1)[0];
            const todayText = todayUpd && todayUpd.date === today ? todayUpd.text : '';
            // Update history (last 5)
            let historyHTML = '';
            if (opts.includeUpdates && allUpdates.length > 0) {
              const limit = opts.updateLimit || 5;
              const recent = allUpdates.slice(-limit).reverse(); // newest first
              historyHTML = '<div style="margin-top:4px;padding-left:18px;border-left:2px solid #ddd">' +
                recent.map(u => {
                  const stchg = u.statusBefore && u.statusAfter && u.statusBefore !== u.statusAfter ? ` <em style="color:#666">(${u.statusBefore} → ${u.statusAfter})</em>` : '';
                  return `<div style="font-size:8px;color:#555;margin:2px 0">
                    <strong style="color:#1565c0">${u.date}</strong>${u.user?' · '+u.user:''}${stchg}<br>
                    <span style="padding-left:6px">${u.text||''}</span>
                  </div>`;
                }).join('') +
                (allUpdates.length > limit ? `<div style="font-size:8px;color:#999;font-style:italic">... and ${allUpdates.length - limit} earlier updates</div>` : '') +
                '</div>';
            } else if (todayText) {
              historyHTML = `<div style="margin-top:2px;padding-left:18px;font-size:8px;color:#1565c0">↳ Today: ${todayText}</div>`;
            }
            return `<div style="margin:4px 0;padding:4px;font-size:9px;background:${bgColor};color:${textColor};border-radius:3px">
              <strong>${done?'[CLOSED]':(overdue?'[OVERDUE]':'['+status+']')}</strong> ${a.description||a.title||'(no description)'}
              ${(a.assignee||a.assignedTo)?' — '+(a.assignee||a.assignedTo):''}${a.dueDate?', due '+a.dueDate:''}${a.priority?' · '+a.priority:''}
              ${historyHTML}
            </div>`;
          }).join('');
          const summary = `${openCount} open${closedCount ? ' · ' + closedCount + ' closed' : ''}`;
          actionRow = `<tr><td colspan="9" style="padding:6px 8px 10px 16px;border:1px solid #ccc;background:#fafafa">
            <div style="font-size:9px;font-weight:700;color:#1565c0;margin-bottom:5px"><span style="background:#1565c0;color:#fff;padding:1px 6px;border-radius:8px">ACTION ITEMS</span> ${summary}</div>
            ${actionsTxt}
          </td></tr>`;
        }
      }
      return `<tr>
        <td style="padding:5px 7px;border:1px solid #ccc;font-size:10px;min-width:140px">${log.flagged ? '🚩 ' : ''}${p.id}<br><strong>${p.name}</strong>${p.client ? '<br><span style="color:#666">'+p.client+'</span>' : ''}</td>
        <td style="padding:5px 7px;border:1px solid #ccc;text-align:center;font-size:11px;font-weight:700">${p.progress || 0}%</td>
        <td style="padding:5px 7px;border:1px solid #ccc;text-align:center;font-size:11px;color:#666">${p.plannedProgress || 0}%</td>
        <td style="padding:5px 7px;border:1px solid #ccc;text-align:center;font-size:11px;font-weight:700">${durActual}</td>
        <td style="padding:5px 7px;border:1px solid #ccc;text-align:center;font-size:11px;color:#666">${durPlan}</td>
        <td style="padding:5px 7px;border:1px solid #ccc;text-align:center"><span style="background:${sc};color:#fff;padding:2px 8px;border-radius:10px;font-size:10px;font-weight:700">${log.status || '—'}</span></td>
        <td style="padding:5px 7px;border:1px solid #ccc;font-size:10px">${log.remarks || 'N/A'}</td>
        <td style="padding:5px 7px;border:1px solid #ccc;font-size:10px">${log.targetActivity || 'N/A'}</td>
        <td style="padding:5px 7px;border:1px solid #ccc;font-size:10px">${log.update || 'N/A'}</td>
      </tr>${prevProjUpdate}${actionRow}`;
    }).join('');
    groupHTML += `
    <div style="margin-bottom:16px">
      <div style="background:${group.color};color:#fff;padding:6px 12px;font-weight:800;font-size:11px;letter-spacing:1px;text-transform:uppercase">${groupName}</div>
      <table style="width:100%;border-collapse:collapse;border:1px solid #ccc">
        <thead>
          <tr style="background:#f5f5f5">
            <th style="padding:5px 7px;border:1px solid #ccc;font-size:10px;text-align:left">ITEM</th>
            <th style="padding:5px 7px;border:1px solid #ccc;font-size:10px;text-align:center">ACT%</th>
            <th style="padding:5px 7px;border:1px solid #ccc;font-size:10px;text-align:center">PLAN%</th>
            <th style="padding:5px 7px;border:1px solid #ccc;font-size:10px;text-align:center">ACT DAY</th>
            <th style="padding:5px 7px;border:1px solid #ccc;font-size:10px;text-align:center">PLAN DAY</th>
            <th style="padding:5px 7px;border:1px solid #ccc;font-size:10px;text-align:center">STATUS</th>
            <th style="padding:5px 7px;border:1px solid #ccc;font-size:10px;text-align:left">REMARKS</th>
            <th style="padding:5px 7px;border:1px solid #ccc;font-size:10px;text-align:left">TARGET ACTIVITY</th>
            <th style="padding:5px 7px;border:1px solid #ccc;font-size:10px;text-align:left">UPDATE</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;
  });

  const win = window.open('', '_blank');
  win.document.write(`<!DOCTYPE html><html><head>
    <title>${companyName} — Daily Meeting Minutes — ${_dmViewDate}</title>
    <style>
      body { font-family: Arial, sans-serif; margin: 20px; color: #000; }
      @media print { body { margin: 10mm; } .no-print { display: none; } }
    </style>
  </head><body>
    <div style="text-align:center;margin-bottom:20px;border-bottom:2px solid #1565c0;padding-bottom:12px">
      <div style="font-size:18px;font-weight:900;letter-spacing:1px">${companyName.toUpperCase()}</div>
      <div style="font-size:14px;font-weight:700;margin-top:4px">DAILY PROJECT STATUS MEETING</div>
      <div style="font-size:12px;color:#555;margin-top:4px">${dateStr}</div>
    </div>
    ${opts.includeActions && totalActionsShown === 0 ? `<div style="margin-bottom:14px;padding:10px 12px;background:#fff3cd;border:1px solid #ffc107;border-radius:4px;font-size:11px;color:#856404">
      <strong>⚠ No action items found</strong> for the selected project(s).${!opts.includeCompleted ? ' Try checking <em>"Also include closed actions"</em> to see them.' : ' Action items can be added from the Daily Meeting or the Actions module.'}
    </div>` : ''}
    <div style="display:flex;gap:20px;margin-bottom:16px;font-size:11px;flex-wrap:wrap">
      <div>Total Projects: <strong>${projects.length}</strong></div>
      <div>Updated: <strong>${dateLogs.length}</strong></div>
      <div>Flagged: <strong style="color:red">${dateLogs.filter(l=>l.flagged).length}</strong></div>
      <div>Done: <strong style="color:green">${dateLogs.filter(l=>l.status==='DONE').length}</strong></div>
      <div>Waiting/On Hold: <strong style="color:orange">${dateLogs.filter(l=>l.status==='WAITING'||l.status==='ON HOLD').length}</strong></div>
      ${(()=>{
        const t = new Date().toISOString().split('T')[0];
        const allActs = (AppState.data.actions||[]).filter(a => projects.find(p=>p.id===a.projectId));
        const isDoneA = a => a.status==='closed' || a.status==='completed' || a.status==='cancelled';
        const openA = allActs.filter(a => !isDoneA(a)).length;
        const overdueA = allActs.filter(a => !isDoneA(a) && a.dueDate && a.dueDate<t).length;
        return `<div>Open Actions: <strong style="color:#1565c0">${openA}</strong></div><div>Overdue Actions: <strong style="color:${overdueA>0?'red':'#666'}">${overdueA}</strong></div>`;
      })()}
    </div>
    ${groupHTML}
    <div style="margin-top:30px;display:grid;grid-template-columns:1fr 1fr 1fr;gap:30px;font-size:11px">
      <div style="text-align:center"><div style="border-top:1px solid #000;padding-top:5px;margin-top:30px">Prepared by</div></div>
      <div style="text-align:center"><div style="border-top:1px solid #000;padding-top:5px;margin-top:30px">Reviewed by</div></div>
      <div style="text-align:center"><div style="border-top:1px solid #000;padding-top:5px;margin-top:30px">Approved by</div></div>
    </div>
    <div class="no-print" style="margin-top:20px;text-align:center">
      <button onclick="window.print()" style="padding:8px 20px;background:#1565c0;color:#fff;border:none;border-radius:4px;cursor:pointer;font-size:13px">
        🖨 Print / Save as PDF
      </button>
    </div>
  </body></html>`);
  win.document.close();
}

// ── Daily Logs tab in Project Detail ─────────────────────
function renderProjectDailyLogs(pid) {
  const logs = (AppState.data.dailyMeetingLogs || [])
    .filter(l => l.projectId === pid)
    .sort((a, b) => b.date.localeCompare(a.date));
  const statusColors = { 'DONE': 'badge-green', 'ONGOING': 'badge-blue', 'WAITING': 'badge-amber', 'ON HOLD': 'badge-red' };
  if (!logs.length) return `<div class="empty-state"><i class="fas fa-clipboard-check"></i><p>No daily meeting logs yet for this project.</p></div>`;

  // Build sparkline data
  const progData = [...logs].reverse().map(l => l.progressSnapshot || 0);
  const maxProg = 100;
  const sparkW = 120, sparkH = 30;
  const points = progData.map((v, i) => {
    const x = progData.length > 1 ? (i / (progData.length - 1)) * sparkW : sparkW / 2;
    const y = sparkH - (v / maxProg) * sparkH;
    return `${x},${y}`;
  }).join(' ');

  return `
  <div style="margin-bottom:12px;padding:10px 14px;background:var(--bg-hover);border-radius:8px;display:flex;align-items:center;gap:20px;flex-wrap:wrap">
    <div style="text-align:center"><div style="font-size:18px;font-weight:800;font-family:var(--font-mono)">${logs.length}</div><div style="font-size:10px;color:var(--text-muted)">Total Logs</div></div>
    <div style="text-align:center"><div style="font-size:18px;font-weight:800;font-family:var(--font-mono)">${logs[0]?.progressSnapshot || 0}%</div><div style="font-size:10px;color:var(--text-muted)">Latest Progress</div></div>
    ${progData.length > 1 ? `
    <div>
      <div style="font-size:10px;color:var(--text-muted);margin-bottom:3px">Progress Trend</div>
      <svg width="${sparkW}" height="${sparkH}" style="overflow:visible">
        <polyline points="${points}" fill="none" stroke="var(--accent-blue)" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
        ${progData.map((v,i)=>{const x=progData.length>1?(i/(progData.length-1))*sparkW:sparkW/2;const y=sparkH-(v/maxProg)*sparkH;return `<circle cx="${x}" cy="${y}" r="2" fill="var(--accent-blue)"/>`;}).join('')}
      </svg>
    </div>` : ''}
    <button class="btn btn-primary btn-sm" style="margin-left:auto" onclick="navigate('dailymeeting')">
      <i class="fas fa-clipboard-check" style="margin-right:5px"></i>Go to Daily Meeting
    </button>
  </div>
  <div class="table-wrap"><table>
    <thead><tr>
      <th>Date</th><th>Progress</th><th>Plan</th><th>Status</th>
      <th>Remarks</th><th>Target Activity</th><th>Update</th><th>Saved By</th><th></th>
    </tr></thead>
    <tbody>${logs.map(l => `<tr>
      <td style="font-family:var(--font-mono);font-size:11px;white-space:nowrap">${l.date}${l.flagged?'<i class="fas fa-flag" style="color:var(--accent-red);margin-left:5px;font-size:9px"></i>':''}</td>
      <td style="text-align:center;font-weight:700;font-family:var(--font-mono)">${l.progressSnapshot || 0}%</td>
      <td style="text-align:center;font-family:var(--font-mono);color:var(--text-muted)">${l.plannedProgressSnapshot || 0}%</td>
      <td><span class="badge ${statusColors[l.status]||'badge-secondary'}" style="font-size:10px">${l.status||'—'}</span></td>
      <td style="font-size:11px;max-width:150px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${l.remarks||'—'}</td>
      <td style="font-size:11px;max-width:150px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${l.targetActivity||'—'}</td>
      <td style="font-size:11px;max-width:150px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${l.update||'—'}</td>
      <td style="font-size:10px;color:var(--text-muted)">${(l.savedBy||'').split('@')[0]}</td>
      <td><button class="btn btn-danger btn-sm btn-icon" onclick="dmDeleteLog('${l.id}','${pid}')"><i class="fas fa-trash"></i></button></td>
    </tr>`).join('')}</tbody>
  </table></div>`;
}

function dmDeleteLog(id, pid) {
  if(requestOrDelete('dailyMeetingLogs',id)){
    const el=document.getElementById('dmLogsTab');
    if(el)el.innerHTML=renderProjectDailyLogs(pid);
  }
}
