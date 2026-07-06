function renderReports(){
  const now = new Date().toLocaleDateString('en',{year:'numeric',month:'long',day:'numeric'});
  const companyName = AppState.data.settings?.companyName || 'SHIC';
  const BUs = AppState.data.businessUnits || [];

  // Build report view for a given set of projects + scope label
  function buildReportHTML(scopeProjects, scopeLabel, scopeColor, isCompact) {
    const costs = AppState.data.costs || [];
    const scopeCosts = costs.filter(c => scopeProjects.some(p => p.id === c.projectId));
    const totBudget = scopeProjects.reduce((s,p)=>s+p.budget,0);
    const totSpent  = scopeProjects.reduce((s,p)=>s+p.spent,0);
    const totPlanned = scopeCosts.reduce((s,c)=>s+c.planned,0);
    const totActual  = scopeCosts.reduce((s,c)=>s+c.actual,0);
    const avgProg = scopeProjects.length ? Math.round(scopeProjects.reduce((s,p)=>s+p.progress,0)/scopeProjects.length) : 0;
    const active  = scopeProjects.filter(p=>p.status==='active').length;
    const completed = scopeProjects.filter(p=>p.status==='completed').length;
    const budgetUtil = totBudget ? Math.round(totSpent/totBudget*100) : 0;
    const costVariance = totPlanned - totActual;

    return `
    <div style="border:1px solid ${scopeColor}44;border-radius:10px;overflow:hidden;margin-bottom:${isCompact?'10':'16'}px">
      <!-- Report header -->
      <div style="background:linear-gradient(135deg,${scopeColor}dd,${scopeColor}aa);color:#fff;padding:${isCompact?'10px 14px':'14px 18px'}">
        <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px">
          <div>
            <div style="font-size:${isCompact?'13':'16'}px;font-weight:700">${scopeLabel}</div>
            <div style="font-size:10px;opacity:.8">Generated: ${now} &middot; ${companyName}</div>
          </div>
          <div style="display:flex;gap:6px">
            <button class="btn btn-sm" style="background:rgba(255,255,255,.2);color:#fff;border:1px solid rgba(255,255,255,.3);font-size:10px"
              onclick="exportReportCSV('${scopeLabel}')">
              <i class="fas fa-file-csv" style="margin-right:4px"></i>Export CSV
            </button>
            <button class="btn btn-sm" style="background:rgba(255,255,255,.2);color:#fff;border:1px solid rgba(255,255,255,.3);font-size:10px"
              onclick="window.print()">
              <i class="fas fa-print" style="margin-right:4px"></i>Print
            </button>
          </div>
        </div>
      </div>
      <!-- KPI row -->
      <div style="display:grid;grid-template-columns:repeat(${isCompact?'6':'6'},1fr);gap:1px;background:var(--border)">
        ${[
          ['Projects',scopeProjects.length,'total'],
          ['Active',active,'projects'],
          ['Completed',completed,'projects'],
          ['Avg Progress',avgProg+'%','physical'],
          ['Budget',fmtCur(totBudget),'total'],
          ['Budget Used',budgetUtil+'%',budgetUtil>90?'⚠ Over budget':'on track'],
        ].map(([l,v,s])=>`
        <div style="background:var(--bg-card);padding:10px;text-align:center">
          <div style="font-size:${isCompact?'13':'16'}px;font-weight:700;font-family:var(--font-mono);color:${scopeColor}">${v}</div>
          <div style="font-size:9px;font-weight:600;color:var(--text-secondary)">${l}</div>
          <div style="font-size:9px;color:var(--text-muted)">${s}</div>
        </div>`).join('')}
      </div>
      <!-- Cost breakdown -->
      ${scopeCosts.length ? `
      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:1px;background:var(--border)">
        ${[
          ['Planned Cost',fmtCur(totPlanned),'from cost records'],
          ['Actual Cost',fmtCur(totActual),'incurred to date'],
          ['Variance',fmtCur(Math.abs(costVariance)),(costVariance>=0?'✓ Under':'⚠ Over')+' by '+fmtCur(Math.abs(costVariance))],
        ].map(([l,v,s])=>`
        <div style="background:var(--bg-secondary);padding:8px 12px">
          <div style="font-size:10px;color:var(--text-muted);margin-bottom:2px">${l}</div>
          <div style="font-size:13px;font-weight:700;font-family:var(--font-mono)">${v}</div>
          <div style="font-size:9px;color:${costVariance>=0?'var(--accent-green)':'var(--accent-red)'}">${s}</div>
        </div>`).join('')}
      </div>` : ''}
      <!-- Cost by category -->
      ${scopeCosts.length ? `
      <div style="padding:10px 14px;background:var(--bg-secondary)">
        <div style="font-size:11px;font-weight:600;margin-bottom:8px;color:var(--text-secondary)">COST BY CATEGORY</div>
        <div style="display:flex;flex-wrap:wrap;gap:6px">
          ${Object.entries(scopeCosts.reduce((acc,c)=>{acc[c.category]=(acc[c.category]||0)+c.actual;return acc;},{}))
            .sort((a,b)=>b[1]-a[1])
            .map(([cat,amt])=>`<div style="padding:4px 10px;background:var(--bg-hover);border-radius:6px;font-size:10px">
              <span style="font-weight:600">${cat}</span>
              <span style="font-family:var(--font-mono);color:${scopeColor};margin-left:6px">${fmtCur(amt)}</span>
            </div>`).join('')}
        </div>
      </div>` : ''}
      <!-- Projects table -->
      ${!isCompact ? `
      <div style="padding:0">
        <div style="background:var(--bg-hover);padding:7px 14px;font-size:10px;font-weight:700;color:var(--text-secondary);letter-spacing:.5px">PROJECT LIST</div>
        <div class="table-wrap"><table>
          <thead><tr>
            <th style="font-size:10px">ID</th>
            <th style="font-size:10px">Project Name</th>
            <th style="font-size:10px">Client</th>
            <th style="font-size:10px">PM</th>
            <th style="font-size:10px">Progress</th>
            <th style="font-size:10px">Budget</th>
            <th style="font-size:10px">Spent</th>
            <th style="font-size:10px">Status</th>
          </tr></thead>
          <tbody>${scopeProjects.map(p=>`<tr>
            <td style="font-size:10px;font-family:var(--font-mono);font-weight:700;color:${scopeColor}">${p.id}</td>
            <td style="font-size:11px;font-weight:500;max-width:180px">${p.name}</td>
            <td style="font-size:10px;color:var(--text-secondary)">${p.client}</td>
            <td style="font-size:10px">${(p.pm||'').split(' ')[0]}</td>
            <td>
              <div style="display:flex;align-items:center;gap:5px">
                <div class="progress-bar" style="width:50px;height:5px">
                  <div class="progress-fill" style="width:${p.progress}%;background:${pColor(p.progress)}"></div>
                </div>
                <span style="font-size:10px;font-family:var(--font-mono)">${p.progress}%</span>
              </div>
            </td>
            <td style="font-size:10px;font-family:var(--font-mono)">${fmtCur(p.budget)}</td>
            <td style="font-size:10px;font-family:var(--font-mono);color:${p.spent/p.budget>0.9?'var(--accent-red)':'inherit'}">${fmtCur(p.spent)}</td>
            <td>${sBadge(p.status)}</td>
          </tr>`).join('')}</tbody>
        </table></div>
      </div>` : `
      <div style="padding:8px 14px;font-size:10px;color:var(--text-muted)">${scopeProjects.length} project(s) — click <strong>View Full Report</strong> to see details</div>`}
    </div>`;
  }

  // Filter projects based on report scope
  function getProjectsForScope(buId) {
    const all = AppState.data.projects || [];
    if (buId === 'all') return all;
    if (buId === '') return all.filter(p => !p.businessUnit);
    return all.filter(p => p.businessUnit === buId);
  }

  // Build BU summary cards for consolidated view
  function buildBUSummaryCards() {
    const BUColors = ['#388bfd','#3fb950','#f0a450','#bc8cff','#39d3f2','#f85149','#fb8f44'];
    let html = '';

    // Main company section
    const mainProjects = getProjectsForScope('');
    if (mainProjects.length) {
      html += buildReportHTML(mainProjects,
        `${companyName} — Main Company`, '#388bfd', _reportBUFilter !== 'all' && _reportBUFilter !== '');
    }

    // Each BU section
    BUs.forEach((bu, i) => {
      const buProjects = getProjectsForScope(bu.id);
      const color = bu.color || BUColors[i % BUColors.length];
      html += buildReportHTML(buProjects,
        bu.name, color, _reportBUFilter !== 'all' && _reportBUFilter !== bu.id);
    });

    return html || '<div class="empty-state"><i class="fas fa-layer-group"></i><p>No business units configured yet. Add them in Settings.</p></div>';
  }

  const allProjects = getProjectsForScope('all');
  const allCosts = AppState.data.costs || [];

  $('#reports').innerHTML = `
  <div class="section-header" style="margin-bottom:14px">
    <div>
      <div class="section-title">Reports & Analytics</div>
      <div class="section-sub">Consolidated &amp; per Business Unit reports</div>
    </div>
    <div style="display:flex;gap:7px;align-items:center;flex-wrap:wrap">
      <button class="btn btn-secondary btn-sm" onclick="window.print()"><i class="fas fa-print"></i> Print</button>
      <button class="btn btn-primary btn-sm" onclick="exportReportCSV('All')"><i class="fas fa-file-csv"></i> Export CSV</button>
    </div>
  </div>

  <!-- Report scope selector -->
  <div class="card" style="margin-bottom:16px;padding:14px">
    <div style="font-size:12px;font-weight:600;margin-bottom:10px"><i class="fas fa-filter" style="color:var(--accent-blue);margin-right:6px"></i>Report Scope</div>
    <div style="display:flex;gap:8px;flex-wrap:wrap">
      <button class="btn btn-sm ${_reportBUFilter==='all'?'btn-primary':'btn-secondary'}"
        onclick="_reportBUFilter='all';renderReports()">
        <i class="fas fa-globe" style="margin-right:4px"></i>Consolidated (All)
      </button>
      <button class="btn btn-sm ${_reportBUFilter===''?'btn-primary':'btn-secondary'}"
        onclick="_reportBUFilter='';renderReports()">
        <i class="fas fa-building" style="margin-right:4px"></i>${companyName} — Main Company
      </button>
      ${BUs.map(bu=>`
      <button class="btn btn-sm ${_reportBUFilter===bu.id?'btn-primary':'btn-secondary'}"
        style="${_reportBUFilter===bu.id?'background:'+bu.color+';border-color:'+bu.color:''}"
        onclick="_reportBUFilter='${bu.id}';renderReports()">
        <i class="fas fa-layer-group" style="margin-right:4px"></i>${bu.name}
      </button>`).join('')}
    </div>
  </div>

  <!-- Consolidated summary (only shown when viewing all) -->
  ${_reportBUFilter==='all' ? `
  <div style="background:linear-gradient(135deg,#0d47a1,#1565c0);color:#fff;padding:16px 20px;border-radius:10px;margin-bottom:16px">
    <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px;margin-bottom:12px">
      <div>
        <div style="font-size:18px;font-weight:800">${companyName} — Consolidated Report</div>
        <div style="font-size:11px;opacity:.7">All Business Units &middot; Generated: ${now}</div>
      </div>
    </div>
    <div style="display:grid;grid-template-columns:repeat(6,1fr);gap:10px">
      ${[
        ['Total Projects', allProjects.length],
        ['Active', allProjects.filter(p=>p.status==='active').length],
        ['Completed', allProjects.filter(p=>p.status==='completed').length],
        ['Avg Progress', Math.round(allProjects.reduce((s,p)=>s+p.progress,0)/(allProjects.length||1))+'%'],
        ['Total Budget', fmtCur(allProjects.reduce((s,p)=>s+p.budget,0))],
        ['Total Spent', fmtCur(allProjects.reduce((s,p)=>s+p.spent,0))],
      ].map(([l,v])=>`
      <div style="background:rgba(255,255,255,.1);border-radius:7px;padding:8px;text-align:center">
        <div style="font-size:15px;font-weight:700;font-family:var(--font-mono)">${v}</div>
        <div style="font-size:9px;opacity:.7">${l}</div>
      </div>`).join('')}
    </div>
    <!-- BU breakdown bar -->
    ${BUs.length ? `
    <div style="margin-top:12px">
      <div style="font-size:10px;opacity:.7;margin-bottom:5px">BUDGET DISTRIBUTION BY BUSINESS UNIT</div>
      <div style="display:flex;height:8px;border-radius:4px;overflow:hidden;gap:1px">
        ${(()=>{
          const totalBudget = allProjects.reduce((s,p)=>s+p.budget,0)||1;
          const BUColors = ['#388bfd','#3fb950','#f0a450','#bc8cff','#39d3f2','#f85149'];
          const segments = [];
          // Main company
          const mainBudget = getProjectsForScope('').reduce((s,p)=>s+p.budget,0);
          if(mainBudget) segments.push(`<div style="flex:${mainBudget/totalBudget};background:#888;min-width:2px" title="Main: ${fmtCur(mainBudget)}"></div>`);
          BUs.forEach((bu,i)=>{
            const buBudget = getProjectsForScope(bu.id).reduce((s,p)=>s+p.budget,0);
            if(buBudget) segments.push(`<div style="flex:${buBudget/totalBudget};background:${bu.color||BUColors[i%BUColors.length]};min-width:2px" title="${bu.name}: ${fmtCur(buBudget)}"></div>`);
          });
          return segments.join('');
        })()}
      </div>
      <div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:5px">
        <div style="display:flex;align-items:center;gap:4px;font-size:9px;opacity:.7">
          <div style="width:8px;height:8px;border-radius:2px;background:#888"></div>Main Company
        </div>
        ${BUs.map((bu,i)=>{
          const BUColors=['#388bfd','#3fb950','#f0a450','#bc8cff','#39d3f2','#f85149'];
          const buBudget=getProjectsForScope(bu.id).reduce((s,p)=>s+p.budget,0);
          return `<div style="display:flex;align-items:center;gap:4px;font-size:9px;opacity:.7">
            <div style="width:8px;height:8px;border-radius:2px;background:${bu.color||BUColors[i%BUColors.length]}"></div>${bu.name} (${fmtCur(buBudget)})
          </div>`;
        }).join('')}
      </div>
    </div>` : ''}
  </div>` : ''}

  <!-- Per-scope report content -->
  ${_reportBUFilter === 'all'
    ? buildBUSummaryCards()
    : buildReportHTML(
        getProjectsForScope(_reportBUFilter),
        _reportBUFilter === ''
          ? companyName + ' — Main Company'
          : (BUs.find(b=>b.id===_reportBUFilter)||{name:'Business Unit'}).name,
        _reportBUFilter === ''
          ? '#388bfd'
          : (BUs.find(b=>b.id===_reportBUFilter)||{color:'#388bfd'}).color || '#388bfd',
        false
      )
  }`;
}

// ── Export report CSV for a given scope ──────────────────
function exportReportCSV(scopeLabel) {
  const BUs = AppState.data.businessUnits || [];
  let projects;
  if (_reportBUFilter === 'all') projects = AppState.data.projects || [];
  else if (_reportBUFilter === '') projects = (AppState.data.projects||[]).filter(p=>!p.businessUnit);
  else projects = (AppState.data.projects||[]).filter(p=>p.businessUnit===_reportBUFilter);

  const costs = AppState.data.costs || [];
  const rows = projects.map(p => {
    const pCosts = costs.filter(c=>c.projectId===p.id);
    const planned = pCosts.reduce((s,c)=>s+c.planned,0);
    const actual  = pCosts.reduce((s,c)=>s+c.actual,0);
    const bu = BUs.find(b=>b.id===p.businessUnit);
    return [
      p.id, p.name, p.client, bu?bu.name:'Main Company',
      p.status, p.progress+'%', p.pm,
      p.budget, p.spent, planned, actual, (planned-actual),
      p.startDate, p.endDate
    ];
  });
  exportCSV(rows,
    ['Project ID','Project Name','Client','Business Unit','Status','Progress','PM',
     'Contract Budget','Spent','Planned Cost','Actual Cost','Variance','Start Date','End Date'],
    `SHIC_Report_${scopeLabel.replace(/[^a-z0-9]/gi,'_')}_${new Date().toISOString().slice(0,10)}.csv`
  );
}

// ── MODULE ACCESS CONTROL ─────────────────────────────────
const ALL_MODULES=[
  {id:'dashboard',label:'Dashboard',icon:'fa-tachometer-alt'},
  {id:'projects',label:'Projects',icon:'fa-project-diagram'},
  {id:'tasks',label:'Task Management',icon:'fa-tasks'},
  {id:'gantt',label:'Gantt Chart',icon:'fa-stream'},
  {id:'resources',label:'Resources',icon:'fa-users'},
  {id:'manpower',label:'Manpower',icon:'fa-hard-hat'},
  {id:'materials',label:'Materials',icon:'fa-boxes'},
  {id:'procurement',label:'Procurement',icon:'fa-shopping-cart'},
  {id:'costs',label:'Cost Control',icon:'fa-dollar-sign'},
  {id:'qaqc',label:'QA / QC',icon:'fa-check-double'},
  {id:'risks',label:'Risk Register',icon:'fa-shield-alt'},
  {id:'actions',label:'Action Items',icon:'fa-clipboard-list'},
  {id:'documents',label:'Documents',icon:'fa-folder-open'},
  {id:'progress',label:'Progress',icon:'fa-chart-line'},
  {id:'kpi',label:'KPI Analytics',icon:'fa-chart-bar'},
  {id:'calendar',label:'Calendar',icon:'fa-calendar'},
  {id:'reports',label:'Reports',icon:'fa-file-alt'},
  {id:'masterlist',label:'Asset Masterlist',icon:'fa-clipboard-list'},
  {id:'warehouse',label:'Warehouse',icon:'fa-warehouse'},
  {id:'prospects',label:'Prospects',icon:'fa-binoculars'},
  {id:'settings',label:'Settings',icon:'fa-cog'},
];

// Permission levels: none < view < edit < manage
const PERM_LEVELS={none:0,view:1,edit:2,manage:3};
const PERM_LABELS={none:'No Access',view:'View Only',edit:'Edit',manage:'Manage'};
const PERM_COLORS={none:'var(--accent-red)',view:'var(--accent-amber)',edit:'var(--accent-blue)',manage:'var(--accent-green)'};

function _getPermKey(uid){return'shic_perms_'+uid;}

// Permissions live in AppState.data.userPerms (synced to SharePoint) so an
// admin's changes reach every device. localStorage is only a legacy fallback.
function getModulePerms(uid){
  try{
    const rec=(AppState.data?.userPerms||[]).find(p=>p.id===uid&&!p._deleted);
    if(rec&&rec.perms)return rec.perms;
    const stored=JSON.parse(localStorage.getItem(_getPermKey(uid))||'null');
    if(stored)return stored;
    // Migrate from old block-list format
    const blocked=JSON.parse(localStorage.getItem('shic_blocked_'+uid)||'[]');
    const perms={};
    ALL_MODULES.forEach(m=>{perms[m.id]=blocked.includes(m.id)?'none':'edit';});
    return perms;
  }catch{return{};}
}

function setModulePerms(uid,perms,email){
  AppState.ensureData();
  if(!AppState.data.userPerms)AppState.data.userPerms=[];
  const arr=AppState.data.userPerms;
  const i=arr.findIndex(p=>p.id===uid);
  const rec={id:uid,email:(email||'').toLowerCase(),perms,updatedBy:(typeof _currentUserProfile!=='undefined'?_currentUserProfile?.email:'')||'',updatedAt:new Date().toISOString()};
  if(i>=0)arr[i]={...arr[i],...rec};else arr.push(rec);
  AppState.save();
  try{localStorage.setItem(_getPermKey(uid),JSON.stringify(perms));}catch(e){} // legacy mirror for old builds
}

// Returns the permission level string ('none','view','edit','manage') for the current user on a module
function getModulePermission(moduleId){
  const profile=typeof _currentUserProfile!=='undefined'?_currentUserProfile:null;
  if(!profile)return'none';
  if(profile.isAdmin||profile.role==='Admin')return'manage';
  const uid=typeof _currentUser!=='undefined'&&_currentUser?_currentUser.uid:null;
  if(!uid)return'none';
  const perms=getModulePerms(uid);
  return perms[moduleId]||'edit'; // default: edit access for unlisted modules
}

// Returns true if current user has at least `minLevel` permission for `moduleId`
function hasModulePermission(moduleId,minLevel='edit'){
  const level=getModulePermission(moduleId);
  return(PERM_LEVELS[level]||0)>=(PERM_LEVELS[minLevel]||0);
}

// Keep backward compat
function getBlockedModules(uid){
  const perms=getModulePerms(uid);
  return Object.entries(perms).filter(([,v])=>v==='none').map(([k])=>k);
}

function showModuleAccess(uid,userName,userEmail){
  _modAccessEmail=userEmail||'';
  const perms=getModulePerms(uid);
  $('#genericModalTitle').textContent='Module Permissions — '+userName;
  $('#genericModalBody').innerHTML=`
  <div style="padding:8px 12px;background:rgba(56,139,253,.08);border-radius:7px;margin-bottom:14px;font-size:11px;border-left:3px solid var(--accent-blue)">
    <i class="fas fa-shield-alt" style="color:var(--accent-blue);margin-right:6px"></i>
    Set the permission level per module. <strong>Manage</strong> = full control (approve, delete, configure).
    <strong>Edit</strong> = create &amp; edit. <strong>View</strong> = read-only. <strong>No Access</strong> = hidden.
  </div>
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
    ${ALL_MODULES.map(m=>{
      const cur=perms[m.id]||'edit';
      return`<div style="display:flex;align-items:center;gap:8px;padding:8px 10px;background:var(--bg-hover);border-radius:7px;border:1px solid var(--border)">
        <i class="fas ${m.icon}" style="color:${PERM_COLORS[cur]};font-size:11px;width:14px;flex-shrink:0"></i>
        <span style="font-size:11px;flex:1;font-weight:500">${m.label}</span>
        <select class="mod-perm-sel" data-mod="${m.id}" style="font-size:10px;padding:2px 4px;background:var(--bg-card);border:1px solid var(--border);border-radius:4px;color:${PERM_COLORS[cur]}" onchange="(function(s){s.style.color=PERM_COLORS[s.value]||'inherit'})(this)">
          ${Object.keys(PERM_LEVELS).map(l=>`<option value="${l}" ${cur===l?'selected':''}>${PERM_LABELS[l]}</option>`).join('')}
        </select>
      </div>`;
    }).join('')}
  </div>
  <div style="margin-top:10px;font-size:10px;color:var(--text-muted)">
    <i class="fas fa-info-circle" style="margin-right:4px"></i>Changes take effect on the user's next page load. Admins always have Manage on all modules.
  </div>`;
  $('#genericModalFooter').innerHTML=`
    <button class="btn btn-secondary" onclick="closeModal('genericModal')">Cancel</button>
    <button class="btn btn-warning btn-sm" onclick="saveModuleAccess('${uid}',false,true)"><i class="fas fa-eye"></i> Set All View</button>
    <button class="btn btn-danger btn-sm" onclick="saveModuleAccess('${uid}',true)"><i class="fas fa-lock-open"></i> Set All Edit</button>
    <button class="btn btn-primary" onclick="saveModuleAccess('${uid}')"><i class="fas fa-save"></i> Save</button>`;
  openModal('genericModal');
}

let _modAccessEmail='';
function saveModuleAccess(uid,setAll=false,setView=false){
  const perms={};
  if(setAll){
    ALL_MODULES.forEach(m=>{perms[m.id]='edit';});
  } else if(setView){
    ALL_MODULES.forEach(m=>{perms[m.id]='view';});
  } else {
    document.querySelectorAll('.mod-perm-sel').forEach(sel=>{
      perms[sel.dataset.mod]=sel.value;
    });
  }
  setModulePerms(uid,perms,_modAccessEmail);
  closeModal('genericModal');
  buildSidebar();
  showToast('Module permissions updated for '+uid,'success');
  if(typeof auditLog==='function')auditLog('permissions_update','Users','Module Permissions',uid,null,perms,'Admin updated module permissions');
}

