let _dashDateFilter=localStorage.getItem('shic_dash_filter')||'all';
// Compute the [start, end] window for the currently-selected dashboard tab.
function _dashRange(){
  const now=new Date();
  if(_dashDateFilter==='month')return{start:new Date(now.getFullYear(),now.getMonth(),1,0,0,0,0),end:new Date(now.getFullYear(),now.getMonth()+1,0,23,59,59,999)};
  if(_dashDateFilter==='quarter'){const q=Math.floor(now.getMonth()/3);return{start:new Date(now.getFullYear(),q*3,1,0,0,0,0),end:new Date(now.getFullYear(),q*3+3,0,23,59,59,999)};}
  return{start:new Date(now.getFullYear(),0,1,0,0,0,0),end:new Date(now.getFullYear(),11,31,23,59,59,999)};
}
function _dashFilterProjects(all){
  if(_dashDateFilter==='all')return all;
  const{start,end}=_dashRange();
  return all.filter(p=>_projectOverlapsRange(p,start,end));
}
function setDashFilter(val){_dashDateFilter=val;localStorage.setItem('shic_dash_filter',val);renderDashboard();}

function renderDashboard(){
AppState.ensureData();
const{tasks,risks,actions,qaqc,manpower}=AppState.data;
// Exclude prospect projects from dashboard KPIs — they aren't real projects yet
const projects=_dashFilterProjects((AppState.data.projects||[]).filter(p=>p.status!=='prospect'));
const active=projects.filter(p=>p.status==='active').length;
const completed=projects.filter(p=>p.status==='completed').length;
const planned=projects.filter(p=>p.status==='planned').length;
const avgProg=projects.length?Math.round(projects.reduce((s,p)=>s+(p.progress||0),0)/projects.length):0;
const totalBudget=projects.reduce((s,p)=>s+(p.budget||0),0);
const totalSpent=projects.reduce((s,p)=>s+(p.spent||0),0);
const openRisks=risks.filter(r=>r.status==='active').length;
const openActions=actions.filter(a=>a.status!=='closed').length;
const overdueAct=actions.filter(a=>a.status==='overdue').length;
const openNCR=qaqc.filter(q=>q.type==='NCR'&&q.status==='open').length;
const totalMP=manpower.reduce((s,m)=>s+m.actual,0);
const delayed=projects.filter(p=>p.status==='active'&&p.progress<35).length;
const budgetUtil=Math.round((totalSpent/totalBudget)*100);
const now=new Date();
const timeStr=now.toLocaleTimeString('en',{hour:'2-digit',minute:'2-digit'});
const dateStr=now.toLocaleDateString('en',{weekday:'long',year:'numeric',month:'long',day:'numeric'});
// Sensitive field masking: hide budget figures for non-admins
const isAdm=typeof isAdminUser==='function'&&isAdminUser();
const _budgetDisplay=isAdm?fmtNum(totalSpent):'●●●●●';
const _budgetSub=isAdm?`${isNaN(budgetUtil)?0:budgetUtil}% of ${fmtNum(totalBudget)}`:'Admin only';
// KPI trend arrows — compare to snapshot from previous render (resets on page reload)
const _prev=window._dashKPISnap||{};
window._dashKPISnap={projects:projects.length,avgProg,openRisks,openActions,totalMP,openNCR,delayed};
const _tr=(now,prev,goodUp=true)=>{
  if(prev===undefined)return'';const d=now-prev;if(!d)return'';
  const good=(goodUp&&d>0)||(!goodUp&&d<0);
  return` <span style="font-size:9px;font-weight:700;color:${good?'var(--accent-green)':'var(--accent-red)'}">${d>0?'↑':'↓'}${Math.abs(d)}</span>`;
};

$('#dashboard').innerHTML=`
<div class="welcome-banner">
<div><div class="banner-title">Project Control Center</div><div class="banner-sub">${dateStr} &middot; ${AppState.data.settings.companyName}</div></div>
<div style="text-align:right"><div class="banner-time" id="dashClock">${timeStr}</div><div style="font-size:10px;color:rgba(255,255,255,.6)">Local Time</div></div></div>
${_renderRecentStrip()}
<div style="display:flex;gap:6px;margin-bottom:14px;flex-wrap:wrap">
  ${[['all','All Time'],['month','This Month'],['quarter','This Quarter'],['year','This Year']].map(([v,l])=>`
  <button onclick="setDashFilter('${v}')" style="padding:5px 14px;border-radius:20px;border:1px solid ${_dashDateFilter===v?'var(--accent-blue)':'var(--border)'};background:${_dashDateFilter===v?'rgba(56,139,253,.15)':'var(--bg-hover)'};color:${_dashDateFilter===v?'var(--accent-blue)':'var(--text-secondary)'};font-size:11px;font-weight:${_dashDateFilter===v?'700':'400'};cursor:pointer;transition:all .15s">${l}</button>`).join('')}
</div>
<div class="grid grid-4" style="margin-bottom:14px">
${sc('fas fa-briefcase','Total Projects',projects.length+_tr(projects.length,_prev.projects),`${active} active`,'#388bfd','rgba(56,139,253,.15)',"navigate('projects')")}
${sc('fas fa-chart-line','Avg Progress',avgProg+'%'+_tr(avgProg,_prev.avgProg),`${completed} completed`,'#3fb950','rgba(63,185,80,.15)',"navigate('projects')")}
${sc('fas fa-dollar-sign','Budget Used',_budgetDisplay,_budgetSub,'#f0a450','rgba(240,164,80,.15)',isAdm?"navigate('costs')":null)}
${sc('fas fa-exclamation-triangle','Open Risks',openRisks+_tr(openRisks,_prev.openRisks,false),`${overdueAct} overdue actions`,'#f85149','rgba(248,81,73,.15)',"navigate('risks')")}
</div>
<div class="grid grid-4" style="margin-bottom:14px">
${sc('fas fa-tasks','Action Items',openActions+_tr(openActions,_prev.openActions,false),`${overdueAct} overdue`,'#bc8cff','rgba(188,140,255,.15)',"navigate('actions')")}
${sc('fas fa-hard-hat','Manpower Today',totalMP+_tr(totalMP,_prev.totalMP),`Across all sites`,'#39d3f2','rgba(57,211,242,.15)',"navigate('manpower')")}
${sc('fas fa-check-double','Open NCRs',openNCR+_tr(openNCR,_prev.openNCR,false),'QA/QC tracking','#fb8f44','rgba(251,143,68,.15)',"navigate('qaqc')")}
${sc('fas fa-flag','At Risk',delayed+_tr(delayed,_prev.delayed,false),`of ${active} active projects`,'#f85149','rgba(248,81,73,.15)',"navigate('projects')")}
</div>
<div class="grid grid-3" style="margin-bottom:14px">
<div class="card"><div class="card-title">Project Status Distribution</div>
<div style="display:flex;align-items:center;gap:14px">
<div style="position:relative;display:inline-flex;align-items:center;justify-content:center">
<canvas id="donutMain" width="110" height="110"></canvas>
<div style="position:absolute;text-align:center"><div style="font-size:18px;font-weight:700;font-family:var(--font-mono)">${projects.length}</div><div style="font-size:9px;color:var(--text-secondary)">Total</div></div></div>
<div style="flex:1">
${[['Active',active,'#388bfd'],['Completed',completed,'#3fb950'],['Planned',planned,'#bc8cff'],['At Risk',delayed,'#f85149']].map(([l,v,c])=>`
<div style="display:flex;align-items:center;gap:7px;margin-bottom:5px">
<div style="width:9px;height:9px;border-radius:50%;background:${c}"></div>
<span style="font-size:11px;flex:1">${l}</span>
<span style="font-size:12px;font-weight:700;font-family:var(--font-mono)">${v}</span></div>`).join('')}
</div></div></div>
<div class="card"><div class="card-title">Budget vs Spent</div><canvas id="budgetChartMain" height="140" style="width:100%"></canvas></div>
<div class="card"><div class="card-title">Project Progress</div><div style="max-height:155px;overflow-y:auto">
${projects.filter(p=>p.status!=='completed').map(p=>`
<div style="margin-bottom:9px;cursor:pointer" onclick="showProjectDetail('${p.id}')" title="Open ${p.id}">
<div style="display:flex;justify-content:space-between;margin-bottom:3px">
<span style="font-size:11px;font-weight:500">${p.id}</span>
<span style="font-size:11px;font-family:var(--font-mono);font-weight:700">${p.progress}%</span></div>
<div class="progress-bar" style="height:6px"><div class="progress-fill" style="width:${p.progress}%;background:${pColor(p.progress)}"></div></div>
</div>`).join('')}</div></div>
</div>
${(()=>{
  const activeProjs=projects.filter(p=>p.status==='active');
  if(!activeProjs.length)return'';
  const rows=activeProjs.map(p=>{
    const rd=(typeof _projectReadiness==='function')?_projectReadiness(p.id):{overall:'go',fails:0,warns:0};
    const cfg=rd.overall==='go'?{c:'var(--accent-green)',ic:'fa-check-circle',l:'GO'}:rd.overall==='caution'?{c:'var(--accent-amber)',ic:'fa-exclamation-triangle',l:'CAUTION'}:{c:'var(--accent-red)',ic:'fa-times-circle',l:'NOT READY'};
    return`<tr style="cursor:pointer" onclick="showProjectDetail('${p.id}');setTimeout(()=>{detailTab='readiness';renderDetailTab();},300)">
      <td style="padding:7px 10px"><div style="font-size:12px;font-weight:600">${p.id}</div><div style="font-size:10px;color:var(--text-secondary);max-width:160px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(p.name||'')}</div></td>
      <td style="padding:7px 10px;text-align:center"><span style="font-size:10px;padding:2px 8px;border-radius:8px;background:${cfg.c}22;color:${cfg.c};font-weight:700"><i class="fas ${cfg.ic}" style="margin-right:4px;font-size:9px"></i>${cfg.l}</span></td>
      <td style="padding:7px 10px;font-size:10px;color:var(--accent-red);text-align:center">${rd.fails>0?rd.fails+' blocker'+(rd.fails!==1?'s':''):'-'}</td>
      <td style="padding:7px 10px;font-size:10px;color:var(--accent-amber);text-align:center">${rd.warns>0?rd.warns+' issue'+(rd.warns!==1?'s':''):'-'}</td>
    </tr>`;
  }).join('');
  const notReady=activeProjs.filter(p=>(typeof _projectReadiness==='function')&&_projectReadiness(p.id).overall==='notready').length;
  const caution=activeProjs.filter(p=>(typeof _projectReadiness==='function')&&_projectReadiness(p.id).overall==='caution').length;
  return`<div class="card" style="margin-bottom:14px">
  <div class="section-header"><div class="section-title"><i class="fas fa-clipboard-check" style="margin-right:7px;color:var(--accent-blue)"></i>Project Readiness</div>
  <div style="display:flex;gap:8px;align-items:center">
    ${notReady>0?`<span style="font-size:10px;padding:2px 8px;border-radius:8px;background:rgba(248,81,73,.12);color:var(--accent-red);font-weight:700">${notReady} Not Ready</span>`:''}
    ${caution>0?`<span style="font-size:10px;padding:2px 8px;border-radius:8px;background:rgba(240,164,80,.12);color:var(--accent-amber);font-weight:700">${caution} Caution</span>`:''}
    <button class="btn btn-secondary btn-sm" onclick="navigate('projects')">View All</button>
  </div></div>
  <div class="table-wrap"><table><thead><tr><th>Project</th><th style="text-align:center">Status</th><th style="text-align:center">Blockers</th><th style="text-align:center">Issues</th></tr></thead>
  <tbody>${rows}</tbody></table></div></div>`;
})()}
<div class="grid grid-2" style="margin-bottom:14px">
<div class="card"><div class="section-header"><div class="section-title">Active Projects</div><button class="btn btn-secondary btn-sm" onclick="navigate('projects')">View All</button></div>
<div class="table-wrap"><table><thead><tr><th>Project</th><th>PM</th><th>Progress</th><th>Status</th></tr></thead><tbody>
${projects.filter(p=>p.status==='active').slice(0,4).map(p=>`<tr style="cursor:pointer" onclick="showProjectDetail('${p.id}')" title="Open ${p.id}">
<td><div style="font-size:12px;font-weight:500">${(p.name||p.id||'').substring(0,26)}${(p.name||'').length>26?'…':''}</div><div style="font-size:10px;color:var(--text-secondary)">${p.id}</div></td>
<td style="font-size:11px">${p.pm.split(' ')[0]}</td>
<td><div style="display:flex;align-items:center;gap:6px"><div class="progress-bar" style="width:60px;height:5px"><div class="progress-fill" style="width:${p.progress}%;background:${pColor(p.progress)}"></div></div><span style="font-size:10px;font-family:var(--font-mono)">${p.progress}%</span></div></td>
<td>${sBadge(p.status)}</td></tr>`).join('')}
</tbody></table></div></div>
<div class="card"><div class="section-header"><div class="section-title">Recent Activity</div><span style="font-size:10px;color:var(--text-secondary)">Last 24h</span></div>
<div class="scroll-card">
${(AppState.data.activities||[]).map(a=>{
const icol={update:'#388bfd',alert:'#f85149',report:'#3fb950',risk:'#f0a450',success:'#3fb950',procurement:'#bc8cff'}[a.type]||'#388bfd';
const iicn={update:'fa-edit',alert:'fa-exclamation-triangle',report:'fa-file-alt',risk:'fa-shield-alt',success:'fa-check',procurement:'fa-shopping-cart'}[a.type]||'fa-circle';
return`<div class="activity-item">
<div class="activity-icon" style="background:${icol}22"><i class="fas ${iicn}" style="color:${icol};font-size:11px"></i></div>
<div class="activity-content"><div class="title"><strong>${a.user.split(' ')[0]}</strong> ${a.action}</div>
<div class="time">${a.time} &middot; <span class="badge badge-gray" style="font-size:9px">${a.project}</span></div></div></div>`;
}).join('')}</div></div></div>
<div class="grid grid-2">
<div class="card"><div class="section-header"><div class="section-title">Critical Risks</div><button class="btn btn-secondary btn-sm" onclick="navigate('risks')">Risk Register</button></div>
${risks.filter(r=>r.status==='active').slice(0,4).map(r=>{
const score=r.probability*r.impact;
const sc2=score>=15?'var(--accent-red)':score>=8?'var(--accent-amber)':'var(--accent-green)';
return`<div style="display:flex;gap:10px;padding:9px 0;border-bottom:1px solid var(--border)">
<div style="width:34px;height:34px;border-radius:7px;background:${sc2}22;display:flex;align-items:center;justify-content:center;flex-shrink:0">
<span style="font-size:12px;font-weight:700;font-family:var(--font-mono);color:${sc2}">${score}</span></div>
<div style="flex:1;min-width:0"><div style="font-size:11px;font-weight:500;margin-bottom:2px">${r.description}</div>
<div style="font-size:10px;color:var(--text-secondary)">${r.projectId} &middot; ${r.owner.split(' ')[0]} &middot; Due: ${r.dueDate}</div></div></div>`;
}).join('')}</div>
<div class="card"><div class="section-header"><div class="section-title">Pending Actions</div><button class="btn btn-secondary btn-sm" onclick="navigate('actions')">All Actions</button></div>
${actions.slice(0,4).map(a=>`
<div style="display:flex;gap:10px;padding:9px 0;border-bottom:1px solid var(--border)">
<div style="width:6px;border-radius:3px;background:${a.priority==='critical'?'var(--accent-red)':a.priority==='high'?'var(--accent-amber)':'var(--accent-blue)'}"></div>
<div style="flex:1;min-width:0"><div style="font-size:11px;font-weight:500;margin-bottom:2px">${a.description}</div>
<div style="font-size:10px;color:var(--text-secondary);display:flex;align-items:center;gap:6px">
<span>${a.projectId}</span><span>·</span><span>${a.assignee.split(' ')[0]}</span><span>·</span>
<span style="color:${isOverdue(a.dueDate)?'var(--accent-red)':'var(--text-secondary)'}">Due: ${a.dueDate}</span>
${sBadge(a.status)}</div></div></div>`).join('')}</div></div>
${_renderWarehouseDashSection()}
${_renderReorderAlerts()}
`;

setTimeout(()=>{
drawDonut('donutMain',[active,completed,planned,Math.max(0,delayed)],['#388bfd','#3fb950','#bc8cff','#f85149']);
const bC=$('#budgetChartMain');if(bC){bC.width=bC.parentElement.offsetWidth-30;drawBudgetBars();}
_renderDashWacChart();
},50);
// Clock tick is separate from full re-render — only updates #dashClock, no data reads
if (!window._dashClockInterval) {
  window._dashClockInterval = setInterval(() => {
    const cl = $('#dashClock');
    if (cl && AppState.currentPage === 'dashboard') {
      cl.textContent = new Date().toLocaleTimeString('en', {hour:'2-digit', minute:'2-digit'});
    }
  }, 1000);
}}

// ── Warehouse KPI section for Dashboard ──────────────────────
function _renderWarehouseDashSection(){
  const items=(AppState.data.warehouseItems||[]).filter(i=>!i._deleted);
  const tx=(AppState.data.stockTransactions||[]).filter(t=>!t._deleted);
  const reqs=(AppState.data.issuanceRequests||[]).filter(r=>!r._deleted);
  if(!items.length)return'';

  const totalItems=items.length;
  const totalValue=items.reduce((s,i)=>{
    const qty=tx.filter(t=>t.itemId===i.id).reduce((q,t)=>{
      if(t.type==='receive')return q+t.qty;
      if(t.type==='issue'||t.type==='issue-shop'||t.type==='issue-enduser')return q-t.qty;
      if(t.type==='return')return q+t.qty;
      if(t.type==='adjust')return q+t.qty;
      return q;
    },0);
    return s+(qty*(i.unitCost||0));
  },0);

  const lowStock=items.filter(i=>{
    const qty=tx.filter(t=>t.itemId===i.id).reduce((q,t)=>{
      if(t.type==='receive')return q+t.qty;
      if(t.type==='issue'||t.type==='issue-shop'||t.type==='issue-enduser')return q-t.qty;
      if(t.type==='return')return q+t.qty;
      if(t.type==='adjust')return q+t.qty;
      return q;
    },0);
    return i.minStock>0&&qty<=i.minStock;
  }).length;

  const pendingReqs=reqs.filter(r=>r.status==='pending').length;
  const now=new Date();
  const thisMonth=`${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`;
  const monthReceive=tx.filter(t=>t.type==='receive'&&(t.date||'').startsWith(thisMonth));
  const monthIssue=tx.filter(t=>(t.type==='issue'||t.type==='issue-shop'||t.type==='issue-enduser')&&(t.date||'').startsWith(thisMonth));
  const monthReceiveVal=monthReceive.reduce((s,t)=>s+(t.qty*(t.unitCost||0)),0);
  const monthIssueVal=monthIssue.reduce((s,t)=>s+(t.qty*((t.unitCost)||0)),0);

  // Top 5 most issued items this month
  const issueCounts={};
  monthIssue.forEach(t=>{issueCounts[t.itemId]=(issueCounts[t.itemId]||0)+t.qty;});
  const top5=Object.entries(issueCounts).sort((a,b)=>b[1]-a[1]).slice(0,5).map(([id,qty])=>{
    const item=items.find(i=>i.id===id);
    return{name:item?.name||id,code:item?.code||id,qty,unit:item?.unit||'ea'};
  });

  // Recent receives (last 5)
  const recentRcv=tx.filter(t=>t.type==='receive').sort((a,b)=>(b.date||'').localeCompare(a.date||'')).slice(0,5);

  const kpis=[
    {icon:'fa-boxes',label:'Total Items',val:totalItems,sub:'in warehouse',color:'var(--accent-blue)',action:"navigate('warehouse')"},
    {icon:'fa-peso-sign',label:'Inventory Value',val:'₱'+fmtNum(Math.round(totalValue)),sub:'estimated at cost',color:'var(--accent-green)',action:null},
    {icon:'fa-exclamation-circle',label:'Low Stock',val:lowStock,sub:'items at/below min',color:lowStock>0?'var(--accent-red)':'var(--accent-green)',action:"navigate('warehouse')"},
    {icon:'fa-clipboard-list',label:'Pending Requests',val:pendingReqs,sub:'awaiting approval',color:pendingReqs>0?'var(--accent-amber)':'var(--text-secondary)',action:"navigate('warehouse')"},
    {icon:'fa-truck-loading',label:'Received (Month)',val:monthReceive.length+' tx',sub:'₱'+fmtNum(Math.round(monthReceiveVal)),color:'var(--accent-blue)',action:null},
    {icon:'fa-dolly',label:'Issued (Month)',val:monthIssue.length+' tx',sub:'₱'+fmtNum(Math.round(monthIssueVal)),color:'var(--accent-amber)',action:null},
  ];

  return`<div class="card" style="margin-bottom:14px">
    <div class="section-header" style="margin-bottom:12px">
      <div class="section-title"><i class="fas fa-warehouse" style="margin-right:7px;color:var(--accent-blue)"></i>Warehouse Overview</div>
      <button class="btn btn-secondary btn-sm" onclick="navigate('warehouse')">Open Warehouse</button>
    </div>
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:10px;margin-bottom:14px">
      ${kpis.map(k=>`<div style="background:var(--bg-tertiary);border-radius:8px;padding:10px;cursor:${k.action?'pointer':'default'}" ${k.action?`onclick="${k.action}"`:''}">
        <div style="font-size:10px;color:var(--text-secondary);margin-bottom:4px"><i class="fas ${k.icon}" style="margin-right:4px"></i>${k.label}</div>
        <div style="font-size:18px;font-weight:700;font-family:var(--font-mono);color:${k.color}">${k.val}</div>
        <div style="font-size:10px;color:var(--text-secondary);margin-top:2px">${k.sub}</div>
      </div>`).join('')}
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
      <div>
        <div style="font-size:11px;font-weight:600;color:var(--text-secondary);margin-bottom:8px">TOP 5 ISSUED THIS MONTH</div>
        ${top5.length?top5.map((t,i)=>`<div style="display:flex;align-items:center;gap:8px;padding:5px 0;border-bottom:1px solid var(--border)">
          <div style="width:18px;height:18px;border-radius:50%;background:var(--accent-blue)22;color:var(--accent-blue);font-size:9px;font-weight:700;display:flex;align-items:center;justify-content:center">${i+1}</div>
          <div style="flex:1;font-size:11px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(t.name)}</div>
          <div style="font-size:11px;font-family:var(--font-mono);font-weight:600;color:var(--accent-amber)">${t.qty} ${t.unit}</div>
        </div>`).join(''):'<div style="font-size:11px;color:var(--text-secondary);padding:8px 0">No issues this month</div>'}
      </div>
      <div>
        <div style="font-size:11px;font-weight:600;color:var(--text-secondary);margin-bottom:8px">RECENT DELIVERIES</div>
        ${recentRcv.length?recentRcv.map(t=>{
          const item=items.find(i=>i.id===t.itemId);
          return`<div style="display:flex;align-items:center;gap:8px;padding:5px 0;border-bottom:1px solid var(--border)">
            <i class="fas fa-truck-loading" style="color:var(--accent-green);font-size:10px;flex-shrink:0"></i>
            <div style="flex:1;min-width:0">
              <div style="font-size:11px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${item?.name||t.itemId}</div>
              <div style="font-size:10px;color:var(--text-secondary)">${t.date} · ${t.vendor||'Unknown vendor'}</div>
            </div>
            <div style="font-size:11px;font-family:var(--font-mono);font-weight:600;color:var(--accent-green)">+${t.qty}</div>
          </div>`;
        }).join(''):'<div style="font-size:11px;color:var(--text-secondary);padding:8px 0">No recent deliveries</div>'}
      </div>
    </div>
  </div>`;
}

function _renderReorderAlerts(){
  const items=(AppState.data.warehouseItems||[]).filter(i=>!i._deleted);
  const tx=(AppState.data.stockTransactions||[]).filter(t=>!t._deleted);
  const lowItems=items.filter(i=>{
    if(!i.minStock)return false;
    const qty=tx.filter(t=>t.itemId===i.id).reduce((q,t)=>{
      if(t.type==='receive')return q+t.qty;
      if(t.type==='issue'||t.type==='issue-shop'||t.type==='issue-enduser')return q-t.qty;
      if(t.type==='return')return q+t.qty;
      if(t.type==='adjust')return q+t.qty;
      return q;
    },0);
    return qty<=i.minStock;
  });
  if(!lowItems.length)return'';
  return`<div class="card" style="margin-bottom:14px;border-left:3px solid var(--accent-red)">
    <div class="section-header" style="margin-bottom:10px">
      <div class="section-title" style="color:var(--accent-red)"><i class="fas fa-exclamation-triangle" style="margin-right:7px"></i>Low Stock Alerts (${lowItems.length})</div>
      <button class="btn btn-secondary btn-sm" onclick="navigate('warehouse')">View in Warehouse</button>
    </div>
    <div style="display:flex;flex-wrap:wrap;gap:8px">
      ${lowItems.slice(0,10).map(i=>{
        const qty=tx.filter(t=>t.itemId===i.id).reduce((q,t)=>{
          if(t.type==='receive')return q+t.qty;
          if(t.type==='issue'||t.type==='issue-shop'||t.type==='issue-enduser')return q-t.qty;
          if(t.type==='return')return q+t.qty;
          if(t.type==='adjust')return q+t.qty;
          return q;
        },0);
        const pct=i.minStock>0?Math.round(qty/i.minStock*100):0;
        return`<div style="background:var(--bg-tertiary);border:1px solid rgba(248,81,73,.3);border-radius:8px;padding:8px 12px;min-width:160px;flex:1">
          <div style="font-size:11px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${i.name}</div>
          <div style="font-size:10px;color:var(--text-secondary);margin:2px 0">${i.code||''}</div>
          <div style="display:flex;align-items:center;gap:6px;margin-top:4px">
            <div style="flex:1;height:4px;background:var(--bg-hover);border-radius:2px"><div style="height:100%;width:${Math.min(100,pct)}%;background:var(--accent-red);border-radius:2px"></div></div>
            <span style="font-size:10px;font-family:var(--font-mono);color:var(--accent-red);font-weight:700">${qty}/${i.minStock}</span>
          </div>
        </div>`;
      }).join('')}
    </div>
  </div>`;
}

function _renderDashWacChart(){
  // placeholder — WAC trend chart can be added per-item via warehouse cost trend button
}

function drawBudgetBars(){
const c=$('#budgetChartMain');if(!c)return;
const ctx=c.getContext('2d'),W=c.width,H=c.height,pd={t:8,r:8,b:22,l:8};
const cH=H-pd.t-pd.b,cW=W-pd.l-pd.r;ctx.clearRect(0,0,W,H);
const prjs=(AppState.data.projects||[]).filter(p=>p.status==='active');
const mx=Math.max(...prjs.map(p=>p.budget))||1;
const gW=cW/prjs.length,bW=Math.max(8,gW*.35);
prjs.forEach((p,i)=>{
const x=pd.l+i*gW+gW*.12;
const bH=(p.budget/mx)*cH,sH=(p.spent/mx)*cH;
ctx.fillStyle='rgba(56,139,253,.15)';ctx.fillRect(x,pd.t+cH-bH,bW,bH);
ctx.fillStyle='#388bfd';ctx.fillRect(x,pd.t+cH-sH,bW,sH);
ctx.fillStyle='#8b949e';ctx.font='9px Outfit';ctx.textAlign='center';
ctx.fillText(p.id.replace('PRJ-','P'),x+bW/2,H-4);});}


let projectFilter='all',projectSearch='',projectBUFilter='all';

// ═══════════════════════════════════════════════════════════
// ── HYBRID PROJECT OVERVIEW (Table / List / Cards) ───────
// Groups by Status (default) or by BU
// Stable sort: project start date (oldest first)
// View + Group + Collapse state persisted in localStorage
// ═══════════════════════════════════════════════════════════

// State helpers — persist user preferences
const _projPrefs = {
  get view() { return localStorage.getItem('shic_proj_view') || (window.innerWidth < 768 ? 'list' : 'table'); },
  set view(v) { localStorage.setItem('shic_proj_view', v); },
  get groupBy() { return localStorage.getItem('shic_proj_groupby') || 'status'; },
  set groupBy(v) { localStorage.setItem('shic_proj_groupby', v); },
  get sortCol() { return localStorage.getItem('shic_proj_sortcol') || 'startDate'; },
  set sortCol(v) { localStorage.setItem('shic_proj_sortcol', v); },
  get sortDir() { return localStorage.getItem('shic_proj_sortdir') || 'asc'; },
  set sortDir(v) { localStorage.setItem('shic_proj_sortdir', v); },
  getCollapsed() {
    try { return JSON.parse(localStorage.getItem('shic_proj_collapsed') || '[]'); } catch(e) { return []; }
  },
  setCollapsed(arr) { localStorage.setItem('shic_proj_collapsed', JSON.stringify(arr)); },
  isCollapsed(key) { return this.getCollapsed().includes(key); },
  toggleCollapsed(key) {
    const arr = this.getCollapsed();
    const idx = arr.indexOf(key);
    if (idx >= 0) arr.splice(idx, 1);
    else arr.push(key);
    this.setCollapsed(arr);
  },
};

// Status color + ordering for grouping
const _PROJ_STATUS_ORDER = ['active','planned','on-hold','completed','archived'];
const _PROJ_STATUS_COLORS = {
  'active':'#3fb950','planned':'#388bfd','on-hold':'#f0a450',
  'completed':'#8b949e','archived':'#6e7681',
};
const _PROJ_STATUS_LABELS = {
  'active':'ACTIVE','planned':'PLANNED','on-hold':'ON HOLD',
  'completed':'COMPLETED','archived':'ARCHIVED',
};
const _PROJ_DEFAULT_COLLAPSED = ['status:completed','status:archived'];

// Initialize default collapsed state on first load
(function _initProjCollapse() {
  if (!localStorage.getItem('shic_proj_collapsed')) {
    _projPrefs.setCollapsed(_PROJ_DEFAULT_COLLAPSED);
  }
})();

// View switcher handlers
function setProjView(v) { _projPrefs.view = v; renderProjects(); }
function setProjGroupBy(v) { _projPrefs.groupBy = v; renderProjects(); }
function setProjSort(col) {
  if (_projPrefs.sortCol === col) {
    _projPrefs.sortDir = _projPrefs.sortDir === 'asc' ? 'desc' : 'asc';
  } else {
    _projPrefs.sortCol = col;
    _projPrefs.sortDir = 'asc';
  }
  renderProjects();
}
function toggleProjGroup(key) {
  _projPrefs.toggleCollapsed(key);
  renderProjects();
}

// Get filtered + sorted projects
function _getFilteredProjects() {
  let ps = (AppState.data.projects || []).filter(p => p && !p._deleted && p.status !== 'prospect');
  if (typeof projectFilter !== 'undefined' && projectFilter !== 'all') ps = ps.filter(p => p.status === projectFilter);
  if (typeof projectBUFilter !== 'undefined' && projectBUFilter !== 'all') {
    ps = ps.filter(p => (p.businessUnit||'') === (projectBUFilter||''));
  }
  if (typeof projectSearch !== 'undefined' && projectSearch) {
    const q = projectSearch.toLowerCase();
    ps = ps.filter(p => (p.name||'').toLowerCase().includes(q) || (p.client||'').toLowerCase().includes(q) || (p.id||'').toLowerCase().includes(q));
  }
  return _sortProjects(ps);
}

function _sortProjects(arr) {
  const col = _projPrefs.sortCol;
  const dir = _projPrefs.sortDir === 'asc' ? 1 : -1;
  const sorted = [...arr].sort((a, b) => {
    let va = a[col], vb = b[col];
    if (col === 'progress') { va = a.progress||0; vb = b.progress||0; }
    else if (col === 'budget') { va = a.budget||0; vb = b.budget||0; }
    else if (col === 'startDate' || col === 'endDate') { va = va || ''; vb = vb || ''; }
    else { va = String(va||'').toLowerCase(); vb = String(vb||'').toLowerCase(); }
    if (va < vb) return -1 * dir;
    if (va > vb) return 1 * dir;
    return 0;
  });
  return sorted;
}

// Get a project's BU info
function _getProjBU(p) {
  if (!p.businessUnit) return { id: '_main', name: 'Main Company', color: '#388bfd' };
  const bu = (AppState.data.businessUnits||[]).find(b => b.id === p.businessUnit);
  if (!bu) return { id: '_unknown', name: 'Unknown BU', color: '#8b949e' };
  return { id: bu.id, name: bu.name, color: bu.color || '#388bfd' };
}

// Group projects per current groupBy preference
function _groupProjects(projects) {
  const groupBy = _projPrefs.groupBy;
  if (groupBy === 'none') return [{ key: 'all', label: '', projects, isFlat: true }];

  if (groupBy === 'status') {
    const groups = {};
    projects.forEach(p => {
      const s = p.status || 'active';
      if (!groups[s]) groups[s] = [];
      groups[s].push(p);
    });
    return _PROJ_STATUS_ORDER
      .filter(s => groups[s] && groups[s].length > 0)
      .map(s => ({
        key: 'status:' + s,
        label: _PROJ_STATUS_LABELS[s] || s.toUpperCase(),
        color: _PROJ_STATUS_COLORS[s] || '#388bfd',
        projects: groups[s],
      }));
  }

  if (groupBy === 'bu') {
    // Outer: BU, Inner: Status
    const buGroups = {};
    projects.forEach(p => {
      const bu = _getProjBU(p);
      if (!buGroups[bu.id]) buGroups[bu.id] = { bu, projects: [] };
      buGroups[bu.id].projects.push(p);
    });
    // For each BU, build status sub-groups
    return Object.values(buGroups)
      .sort((a, b) => a.bu.name.localeCompare(b.bu.name))
      .map(g => {
        const statusGroups = {};
        g.projects.forEach(p => {
          const s = p.status || 'active';
          if (!statusGroups[s]) statusGroups[s] = [];
          statusGroups[s].push(p);
        });
        return {
          key: 'bu:' + g.bu.id,
          label: g.bu.name,
          color: g.bu.color,
          projects: g.projects,
          subgroups: _PROJ_STATUS_ORDER
            .filter(s => statusGroups[s] && statusGroups[s].length > 0)
            .map(s => ({
              key: 'bu:' + g.bu.id + ':status:' + s,
              label: _PROJ_STATUS_LABELS[s],
              color: _PROJ_STATUS_COLORS[s],
              projects: statusGroups[s],
            })),
        };
      });
  }
  return [];
}

// ═══ MAIN ENTRY ════════════════════════════════════════════