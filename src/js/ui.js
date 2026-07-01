function showToast(msg,type='info',dur=3500){
const icons={success:'fa-check-circle',error:'fa-times-circle',warning:'fa-exclamation-circle',info:'fa-info-circle'};
const cols={success:'var(--accent-green)',error:'var(--accent-red)',warning:'var(--accent-amber)',info:'var(--accent-blue)'};
const t=document.createElement('div');t.className=`toast ${type}`;
t.innerHTML=`<i class="fas ${icons[type]}" style="color:${cols[type]}"></i><span style="flex:1">${msg}</span><i class="fas fa-times" style="cursor:pointer;opacity:.5" onclick="this.parentElement.remove()"></i>`;
$('#toastContainer').appendChild(t);
setTimeout(()=>{t.style.opacity='0';t.style.transform='translateX(20px)';t.style.transition='.3s';setTimeout(()=>t.remove(),300);},dur);}

function buildSidebar(){
let html='',lastSec='';
// Module access control — hide modules the user has no access to
const _uid=typeof _currentUser!=='undefined'&&_currentUser?_currentUser.uid:null;
const _profile=typeof _currentUserProfile!=='undefined'?_currentUserProfile:null;
const _isAdm=_profile&&(_profile.isAdmin||_profile.role==='Admin');
const _userPerms=(!_isAdm&&_uid&&typeof getModulePerms==='function')?getModulePerms(_uid):{};

NAV_ITEMS.forEach(item=>{
if(item.section!==lastSec){html+=`<div class="nav-section"><div class="nav-section-label">${item.section}</div></div>`;lastSec=item.section;}
const badge={actions:(AppState.data.actions||[]).filter(a=>a.status==='overdue').length,
qaqc:(AppState.data.qaqc||[]).filter(q=>q.type==='NCR'&&q.status==='open').length,
risks:(AppState.data.risks||[]).filter(r=>r.status==='active').length}[item.id];
if(!_isAdm&&(_userPerms[item.id]==='none'))return; // no access
html+=`<div class="nav-item ${AppState.currentPage===item.id?'active':''}" onclick="navigate('${item.id}')" id="nav-${item.id}">
<span class="nav-icon"><i class="${item.icon}"></i></span><span class="nav-label">${item.label}</span>
${badge?`<span class="nav-badge">${badge}</span>`:''}</div>`;});
$('#sidebarNav').innerHTML=html;}

function navigate(pid){
AppState.currentPage=pid;
$$('.nav-item').forEach(e=>e.classList.remove('active'));
const n=$(`#nav-${pid}`);if(n)n.classList.add('active');
$$('.page').forEach(e=>e.classList.remove('active'));
const p=$(`#${pid}`);if(p){p.classList.add('active');_showSkeleton(p);}
const ni=NAV_ITEMS.find(n=>n.id===pid);
$('#topbarTitle').textContent=ni?ni.label:'Settings';
renderPage(pid);
if(window.innerWidth<768)_closeMobileSidebar();}

// ── Skeleton loading screen ───────────────────────────────────
function _showSkeleton(container) {
  if (!container || container.innerHTML.trim()) return;
  container.innerHTML = `<div class="skeleton-wrap" style="padding:20px">
    <div class="skeleton-line" style="width:40%;height:22px;margin-bottom:16px"></div>
    <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:10px;margin-bottom:20px">
      ${[1,2,3,4].map(()=>'<div class="skeleton-card" style="height:80px;border-radius:10px"></div>').join('')}
    </div>
    <div class="skeleton-line" style="width:100%;height:200px;border-radius:10px"></div>
  </div>`;
}

// ── Global keyboard shortcuts (Phase D3) ─────────────────────
(function _initKeyboardShortcuts() {
  const _NAV_SHORTCUT_MAP = {};
  // Alt+1…Alt+9 → first 9 nav items
  NAV_ITEMS.slice(0, 9).forEach((item, i) => { _NAV_SHORTCUT_MAP['Alt+' + (i + 1)] = item.id; });

  document.addEventListener('keydown', e => {
    // Escape → close any open modal
    if (e.key === 'Escape') {
      const open = document.querySelector('.modal.open');
      if (open) { closeModal(open.id); return; }
    }
    // Ctrl+K / Cmd+K → global search
    if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
      e.preventDefault();
      _showGlobalSearch();
      return;
    }
    // ? → show shortcut cheatsheet
    if (e.key === '?' && !e.ctrlKey && !e.metaKey && document.activeElement.tagName !== 'INPUT' && document.activeElement.tagName !== 'TEXTAREA') {
      _showShortcutHelp();
      return;
    }
    // Alt+1…Alt+9 navigation
    const combo = (e.altKey ? 'Alt+' : '') + e.key;
    if (_NAV_SHORTCUT_MAP[combo] && document.activeElement.tagName !== 'INPUT') {
      e.preventDefault();
      navigate(_NAV_SHORTCUT_MAP[combo]);
    }
  });
})();

function _showShortcutHelp() {
  const shortcuts = [
    ['Escape', 'Close modal'],
    ['Ctrl+K', 'Focus search'],
    ['?', 'Show shortcuts'],
    ['Alt+1', 'Dashboard'],
    ['Alt+2', 'Projects'],
    ['Alt+3', 'Prospects'],
    ['Alt+4', 'Tasks'],
    ['Alt+5', 'Gantt Chart'],
    ['Alt+6', 'Resources'],
    ['Alt+7', 'Manpower'],
    ['Alt+8', 'Materials'],
    ['Alt+9', 'Procurement'],
  ];
  const body = `<div style="display:grid;grid-template-columns:1fr 1fr;gap:6px 20px;font-size:12px">
    ${shortcuts.map(([k, d]) => `<div style="display:flex;justify-content:space-between;gap:12px;padding:4px 0;border-bottom:1px solid var(--border)">
      <kbd style="font-family:var(--font-mono);font-size:11px;background:var(--bg-hover);padding:2px 8px;border-radius:4px;border:1px solid var(--border)">${k}</kbd>
      <span style="color:var(--text-secondary)">${d}</span>
    </div>`).join('')}
  </div>`;
  $('#genericModalTitle').textContent = 'Keyboard Shortcuts';
  $('#genericModalBody').innerHTML = body;
  openModal('genericModal');
}


// ── Global search (Ctrl+K) ────────────────────────────────────────────────
function _showGlobalSearch() {
  $('#genericModalTitle').innerHTML = '<i class="fas fa-search" style="margin-right:7px;color:var(--accent-blue)"></i>Quick Search';
  $('#genericModalBody').innerHTML = `
    <input id="_gsInput" class="form-input" placeholder="Search projects, tasks, items, people…" autocomplete="off" style="margin-bottom:10px">
    <div id="_gsResults" style="max-height:320px;overflow-y:auto"></div>`;
  $('#genericModalFooter').innerHTML = '<span style="font-size:11px;color:var(--text-secondary)">Press Enter to open first result &nbsp;·&nbsp; Esc to close</span>';
  openModal('genericModal');
  const inp = $('#_gsInput');
  if (inp) { inp.focus(); inp.addEventListener('input', _gsRun); inp.addEventListener('keydown', e => { if (e.key === 'Enter') { const first = $('#_gsResults a'); if (first) first.click(); } }); }
}
function _gsRun() {
  const q = ($('#_gsInput')?.value || '').toLowerCase().trim();
  const out = $('#_gsResults');
  if (!out) return;
  if (!q) { out.innerHTML = '<div style="color:var(--text-secondary);font-size:12px;padding:8px 0">Start typing…</div>'; return; }
  const hits = [];
  const d = AppState.data || {};
  (d.projects||[]).filter(x=>!x._deleted).forEach(x=>{ if((x.id+x.name+x.client+x.pm).toLowerCase().includes(q)) hits.push({icon:'fa-briefcase',col:'#388bfd',label:x.id+(x.name?` — ${x.name}`:''),sub:x.client||'',go:`showProjectDetail('${x.id}')`}); });
  (d.tasks||[]).filter(x=>!x._deleted).forEach(x=>{ if((x.id+x.name+x.assignee).toLowerCase().includes(q)) hits.push({icon:'fa-tasks',col:'#3fb950',label:x.id+(x.name?` — ${x.name}`:''),sub:x.assignee||'',go:`navigate('tasks')`}); });
  const wItems=(d.whItems||d.stockItems||[]);
  wItems.filter(x=>!x._deleted).forEach(x=>{ if((x.id+x.name+x.category).toLowerCase().includes(q)) hits.push({icon:'fa-boxes',col:'#f0a450',label:x.id+(x.name?` — ${x.name}`:''),sub:x.category||'',go:`navigate('warehouse')`}); });
  (d.personnel||[]).filter(x=>!x._deleted).forEach(x=>{ if((x.name+x.department+x.designation).toLowerCase().includes(q)) hits.push({icon:'fa-user',col:'#bc8cff',label:x.name,sub:`${x.designation||''} · ${x.department||''}`,go:`navigate('masterlist')`}); });
  NAV_ITEMS.forEach(n=>{ if(n.label.toLowerCase().includes(q)) hits.push({icon:n.icon,col:'#8b949e',label:n.label,sub:'Page',go:`navigate('${n.id}')`}); });
  if (!hits.length) { out.innerHTML = '<div style="color:var(--text-secondary);font-size:12px;padding:8px 0">No results found</div>'; return; }
  out.innerHTML = hits.slice(0,12).map(h=>`<a href="#" onclick="closeModal('genericModal');${h.go};return false" style="display:flex;align-items:center;gap:10px;padding:8px 6px;border-radius:6px;text-decoration:none;color:inherit;border-bottom:1px solid var(--border)">
    <div style="width:28px;height:28px;border-radius:6px;background:${h.col}22;display:flex;align-items:center;justify-content:center;flex-shrink:0"><i class="fas ${h.icon}" style="color:${h.col};font-size:11px"></i></div>
    <div style="min-width:0"><div style="font-size:12px;font-weight:500;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${h.label}</div><div style="font-size:10px;color:var(--text-secondary)">${h.sub}</div></div>
  </a>`).join('');
}

// ── Pagination utility ──────────────────────────────────────────────────────
const PAGE_SIZE = 10;
const _pages = {};  // keyed by tableId

// Called by pagination buttons to re-render just the tbody+nav (no full re-render)
function _repaginateTable(tableId, containerId) {
  const fn = window['_pgFn_' + tableId];
  if (fn) fn();
}

// Register a re-render function for a table so pagination buttons can call it
function _registerPageFn(tableId, fn) {
  window['_pgFn_' + tableId] = fn;
}

// Reset page to 0 when filters/search change
function _resetPage(tableId) {
  _pages[tableId] = 0;
}

// Slice data for current page (default PAGE_SIZE rows)
function _pgSlice(tableId, data) {
  return _pgSliceN(tableId, data, PAGE_SIZE);
}

// Slice with custom page size (e.g. 20 for masterlist tables)
function _pgSliceN(tableId, data, n) {
  if (!_pages[tableId]) _pages[tableId] = 0;
  const total = data.length;
  const totalPages = Math.max(1, Math.ceil(total / n));
  if (_pages[tableId] >= totalPages) _pages[tableId] = totalPages - 1;
  return data.slice(_pages[tableId] * n, (_pages[tableId] + 1) * n);
}

// Custom-size pagination nav
function _pgNavN(tableId, data, rerenderFn, n) {
  const total = data.length;
  if (total <= n) return '';
  if (rerenderFn) _registerPageFn(tableId, rerenderFn);
  const page = _pages[tableId] || 0;
  const totalPages = Math.ceil(total / n);
  const start = page * n + 1;
  const end = Math.min(start + n - 1, total);
  const dis = (c) => c ? ' disabled' : '';
  return `<div class="pg-nav" style="display:flex;align-items:center;justify-content:space-between;padding:6px 12px;background:var(--bg-hover);border-top:1px solid var(--border);font-size:11px;flex-wrap:wrap;gap:6px">
    <span style="color:var(--text-secondary)">${start}&ndash;${end} of <strong>${total}</strong></span>
    <div style="display:flex;gap:4px;align-items:center">
      <button class="btn btn-secondary btn-sm" style="padding:2px 8px" onclick="_pages['${tableId}']=0;_repaginateTable('${tableId}')"${dis(page===0)}>«</button>
      <button class="btn btn-secondary btn-sm" style="padding:2px 8px" onclick="_pages['${tableId}']=Math.max(0,(_pages['${tableId}']||0)-1);_repaginateTable('${tableId}')"${dis(page===0)}>‹</button>
      <span style="padding:2px 8px;border:1px solid var(--border);border-radius:4px;font-family:var(--font-mono);background:var(--bg-secondary)">${page+1}/${totalPages}</span>
      <button class="btn btn-secondary btn-sm" style="padding:2px 8px" onclick="_pages['${tableId}']=Math.min(${totalPages-1},(_pages['${tableId}']||0)+1);_repaginateTable('${tableId}')"${dis(page===totalPages-1)}>›</button>
      <button class="btn btn-secondary btn-sm" style="padding:2px 8px" onclick="_pages['${tableId}']=${totalPages-1};_repaginateTable('${tableId}')"${dis(page===totalPages-1)}>»</button>
    </div>
  </div>`;
}


// Build pagination nav HTML
function _pgNav(tableId, data, rerenderFn) {
  const total = data.length;
  if (total <= PAGE_SIZE) return '';
  if (rerenderFn) _registerPageFn(tableId, rerenderFn);
  const page = _pages[tableId] || 0;
  const totalPages = Math.ceil(total / PAGE_SIZE);
  const start = page * PAGE_SIZE + 1;
  const end = Math.min(start + PAGE_SIZE - 1, total);
  const dis = (cond) => cond ? ' disabled' : '';
  const btn = (label, onclick) => `<button class="btn btn-secondary btn-sm" style="padding:2px 8px;min-width:28px" onclick="${onclick}"${dis(label==='«'?page===0:label==='›'||label==='»'?page===totalPages-1:false)}>${label}</button>`;
  return `<div class="pg-nav" style="display:flex;align-items:center;justify-content:space-between;padding:6px 12px;background:var(--bg-hover);border-top:1px solid var(--border);font-size:11px;flex-wrap:wrap;gap:6px">
    <span style="color:var(--text-secondary)">${start}&ndash;${end} of <strong>${total}</strong></span>
    <div style="display:flex;gap:4px;align-items:center">
      <button class="btn btn-secondary btn-sm" style="padding:2px 8px" onclick="_pages['${tableId}']=0;_repaginateTable('${tableId}')"${dis(page===0)}>«</button>
      <button class="btn btn-secondary btn-sm" style="padding:2px 8px" onclick="_pages['${tableId}']=Math.max(0,(_pages['${tableId}']||0)-1);_repaginateTable('${tableId}')"${dis(page===0)}>‹</button>
      <span style="padding:2px 8px;border:1px solid var(--border);border-radius:4px;font-family:var(--font-mono);background:var(--bg-secondary)">${page+1}/${totalPages}</span>
      <button class="btn btn-secondary btn-sm" style="padding:2px 8px" onclick="_pages['${tableId}']=Math.min(${totalPages-1},(_pages['${tableId}']||0)+1);_repaginateTable('${tableId}')"${dis(page===totalPages-1)}>›</button>
      <button class="btn btn-secondary btn-sm" style="padding:2px 8px" onclick="_pages['${tableId}']=${totalPages-1};_repaginateTable('${tableId}')"${dis(page===totalPages-1)}>»</button>
    </div>
  </div>`;
}

function renderPage(pid){
AppState.ensureData();
// Fix #3: auto-purge old trash on first load each session
if (!window._trashPurged) {
  window._trashPurged = true;
  try { autoPurgeOldTrash(); } catch(e) {}
}
// Capture initial sync snapshot once on first load
if (!window._snapshotCaptured) {
  window._snapshotCaptured = true;
  try { _captureSyncedSnapshot(); } catch(e) {}
}
const map={dashboard:renderDashboard,projects:renderProjects,tasks:renderTasks,gantt:renderGantt,
resources:renderResources,manpower:renderManpower,materials:renderMaterials,procurement:renderProcurement,warehouse:renderWarehouse,
costs:renderCosts,qaqc:renderQAQC,risks:renderRisks,actions:renderActions,documents:renderDocuments,
progress:renderProgress,kpi:renderKPI,analytics:()=>{if(typeof renderAnalytics==='function')renderAnalytics();else{const el=$('#analytics');if(el)el.innerHTML='<div class="empty-state"><p>Analytics module not loaded.</p></div>';}},dailymeeting:renderDailyMeeting,calendar:renderCalendar,reports:renderReports,settings:renderSettings,masterlist:renderMasterlist,prospects:renderProspects,library:renderLibrary,
trash:typeof renderTrash==='function'?renderTrash:null,
deletionRequests:typeof renderDeletionRequests==='function'?renderDeletionRequests:null};
// ── Global error boundary (Phase A4) ─────────────────────────
if (map[pid]) {
  try {
    map[pid]();
  } catch(e) {
    console.error('[renderPage]', pid, e);
    const el = $(`#${pid}`);
    if (el) el.innerHTML = `<div class="empty-state" style="padding:40px">
      <i class="fas fa-exclamation-triangle" style="font-size:28px;color:var(--accent-red);display:block;margin-bottom:12px"></i>
      <div style="font-weight:700;font-size:14px;margin-bottom:6px">Something went wrong</div>
      <div style="color:var(--accent-red);font-size:12px;font-family:var(--font-mono);margin-bottom:16px">${e.message}</div>
      <button class="btn btn-secondary btn-sm" onclick="renderPage('${pid}')">Try Again</button>
    </div>`;
    showToast(`Error loading ${pid}: ${e.message}`, 'error', 5000);
  }
}}

// ── Offline banner ────────────────────────────────────────────
(function _initOfflineBanner() {
  const BANNER_ID = 'offlineBanner';
  function _showBanner(show) {
    let b = $('#' + BANNER_ID);
    if (!b) {
      b = document.createElement('div');
      b.id = BANNER_ID;
      b.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:9999;display:none;align-items:center;justify-content:center;gap:8px;padding:6px 16px;background:#b45309;color:#fff;font-size:12px;font-weight:600;box-shadow:0 2px 8px rgba(0,0,0,.3)';
      b.innerHTML = '<i class="fas fa-wifi-slash"></i><span>No internet connection — changes saved locally and will sync when reconnected</span>';
      document.body.prepend(b);
    }
    b.style.display = show ? 'flex' : 'none';
    document.body.style.paddingTop = show ? '34px' : '';
  }
  window.addEventListener('offline', () => _showBanner(true));
  window.addEventListener('online',  () => { _showBanner(false); showToast('Back online — syncing…', 'success', 3000); });
  if (!navigator.onLine) _showBanner(true);
})();

function toggleSidebar(){
const s=$('#sidebar');
if(window.innerWidth<768){s.classList.toggle('mobile-open');const ov=$('#mobileOverlay');if(ov)ov.style.display=s.classList.contains('mobile-open')?'block':'none';}
else s.classList.toggle('collapsed');}

function _closeMobileSidebar(){
const s=$('#sidebar');if(s)s.classList.remove('mobile-open');
const ov=$('#mobileOverlay');if(ov)ov.style.display='none';}

function toggleTheme(){
AppState.theme=AppState.theme==='dark'?'light':'dark';
document.documentElement.setAttribute('data-theme',AppState.theme);
localStorage.setItem('pm_theme',AppState.theme);
$('#themeIcon').className=AppState.theme==='dark'?'fas fa-moon':'fas fa-sun';}

// Auto-follow OS colour scheme when user hasn't manually picked a theme
window.matchMedia('(prefers-color-scheme: light)').addEventListener('change',e=>{
  if(localStorage.getItem('pm_theme'))return;
  AppState.theme=e.matches?'light':'dark';
  document.documentElement.setAttribute('data-theme',AppState.theme);
  const ti=$('#themeIcon');if(ti)ti.className=AppState.theme==='dark'?'fas fa-moon':'fas fa-sun';
});

function toggleNotifications(){
const p=$('#notifPanel');p.classList.toggle('open');renderNotifPanel();
if(p.classList.contains('open')){
setTimeout(()=>document.addEventListener('click',function h(e){
if(!$('#notifBtn').contains(e.target)){p.classList.remove('open');document.removeEventListener('click',h);}
}),10);}}

function _generateSmartNotifs(){
  // Auto-generate notifications from live data — never persisted, always fresh
  const smart=[];
  if(!AppState.data)return smart;
  const today=new Date().toISOString().slice(0,10);
  // Overdue tasks
  (AppState.data.tasks||[]).filter(t=>!t._deleted&&t.status!=='done'&&t.dueDate&&t.dueDate<today).forEach(t=>{
    smart.push({id:'ot_'+t.id,type:'warning',title:'Overdue Task',
      message:`"${t.name||t.id}" was due ${t.dueDate}`,
      onclick:`navigate('tasks')`,read:false,auto:true});
  });
  // Pending deletion requests (admin only)
  if(typeof isAdminUser==='function'&&isAdminUser()){
    const pend=(AppState.data.deletionRequests||[]).filter(r=>r.status==='pending');
    if(pend.length)smart.push({id:'dr_pending',type:'info',title:'Deletion Requests Pending',
      message:`${pend.length} request${pend.length!==1?'s':''} awaiting your approval`,
      onclick:`navigate('deletionRequests')`,read:false,auto:true});
  }
  // My pending deletion requests
  const myPend=(AppState.data.deletionRequests||[]).filter(r=>r.requestedByEmail===(_currentUserProfile?.email||'')&&r.status==='pending');
  if(myPend.length)smart.push({id:'my_dr',type:'info',title:'Your Deletion Requests',
    message:`${myPend.length} of your request${myPend.length!==1?'s are':' is'} pending admin approval`,
    onclick:`navigate('deletionRequests')`,read:false,auto:true});
  // Sync error
  if(typeof _syncState!=='undefined'&&_syncState==='error')
    smart.push({id:'sync_err',type:'error',title:'Sync Error',
      message:'Last SharePoint sync failed — check connection',read:false,auto:true});
  // Active projects with no recent update (>7 days no progress change)
  const stale=(AppState.data.projects||[]).filter(p=>{
    if(p.status!=='active'||p._deleted)return false;
    if(!p._updatedAt)return false;
    return(Date.now()-new Date(p._updatedAt).getTime())>7*24*60*60*1000;
  });
  if(stale.length)smart.push({id:'stale_proj',type:'warning',title:'Projects Need Update',
    message:`${stale.length} active project${stale.length!==1?'s have':' has'} no updates in 7+ days`,
    onclick:`navigate('projects')`,read:false,auto:true});
  // Warehouse: low stock alerts
  if(typeof _whItems==='function'&&typeof _whCalcQty==='function'){
    const whItems=_whItems();
    const lowStock=whItems.filter(it=>{
      const ms=parseFloat(it.minStock||0);
      if(ms<=0)return false;
      const q=_whCalcQty(it.id);
      return q.qtyOnHand<=ms;
    });
    if(lowStock.length)smart.push({id:'wh_low_stock',type:'warning',title:'Low Stock Alert',
      message:`${lowStock.length} item${lowStock.length!==1?'s are':' is'} at or below minimum stock level`,
      onclick:`navigate('warehouse')`,read:false,auto:true});
    const stockout=whItems.filter(it=>_whCalcQty(it.id).qtyOnHand<=0);
    if(stockout.length)smart.push({id:'wh_stockout',type:'error',title:'Stock Out',
      message:`${stockout.length} item${stockout.length!==1?'s have':' has'} zero or negative stock`,
      onclick:`navigate('warehouse')`,read:false,auto:true});
  }
  // Warehouse: pending issuance requests
  const whPendingIssues=(AppState.data.whTransactions||[]).filter(t=>!t._deleted&&t.type==='issue'&&t.status==='pending');
  if(whPendingIssues.length)smart.push({id:'wh_pending_issues',type:'info',title:'Pending Stock Requests',
    message:`${whPendingIssues.length} stock issuance request${whPendingIssues.length!==1?'s':''} awaiting approval`,
    onclick:`navigate('warehouse')`,read:false,auto:true});
  // Warehouse: my recently resolved requests (last 24h)
  const myEmail24=typeof _currentUserProfile!=='undefined'?(_currentUserProfile?.email||''):'';
  if(myEmail24){
    const now24=Date.now()-24*60*60*1000;
    (AppState.data.whTransactions||[]).filter(t=>
      !t._deleted&&t.type==='issue'&&(t.status==='approved'||t.status==='rejected')&&
      t.requestedByEmail===myEmail24&&t._resolvedAt&&new Date(t._resolvedAt).getTime()>now24
    ).forEach(t=>{
      smart.push({id:'wh_resolved_'+t.id,type:t.status==='approved'?'success':'warning',
        title:`Stock Request ${t.status==='approved'?'Approved':'Rejected'}`,
        message:`Your request for "${t.itemName||t.itemId}" was ${t.status}`,
        onclick:`navigate('warehouse')`,read:false,auto:true});
    });
  }
  return smart;
}

function renderNotifPanel(){
AppState.ensureData();
const stored=AppState.data.notifications||[];
const smart=_generateSmartNotifs();
// Merge: smart notifs on top, then stored manual ones
const all=[...smart,...stored.filter(n=>!smart.find(s=>s.id===n.id))];
const unread=all.filter(n=>!n.read).length;
const icons={error:'🔴',warning:'🟠',info:'🔵',success:'🟢'};
$('#notifPanel').innerHTML=`<div class="notif-panel-header">Notifications <span class="badge badge-red">${unread}</span>
<span style="font-size:10px;cursor:pointer;color:var(--accent-blue)" onclick="markAllRead()">Mark all read</span></div>
<div style="max-height:340px;overflow-y:auto">
${all.length?all.map(n=>`<div class="notif-item ${n.read?'':'unread'}" ${n.onclick?`onclick="${n.onclick};toggleNotifications()"style="cursor:pointer"`:''}>
<span style="font-size:14px">${icons[n.type]||'●'}</span>
<div><div class="notif-title">${n.title}</div><div class="notif-time">${n.message||''}</div>${n.time?`<div class="notif-time">${n.time}</div>`:''}</div>
</div>`).join(''):'<div style="padding:20px;text-align:center;color:var(--text-muted);font-size:12px"><i class="fas fa-check-circle" style="font-size:20px;display:block;margin-bottom:6px;opacity:.3"></i>All caught up!</div>'}
</div>`;
$('#notifDot').style.display=unread?'':'none';}

function markAllRead(){(AppState.data.notifications||[]).forEach(n=>n.read=true);renderNotifPanel();}
let _modalOpener = null;
function openModal(id){
  const el=$(`#${id}`);if(!el)return;
  _modalOpener = document.activeElement;
  el.setAttribute('role','dialog');el.setAttribute('aria-modal','true');
  el.classList.add('open');
  const first=el.querySelector('input:not([type=hidden]),select,textarea,button:not([disabled])');
  if(first)setTimeout(()=>first.focus(),50);
  if(typeof _ssm!=='undefined')_ssm.startEdit();}
function closeModal(id){
  const el=document.getElementById(id);if(!el)return;
  el.classList.remove('open');if(el.dataset.dynamic)el.remove();
  if(_modalOpener&&_modalOpener.focus)try{_modalOpener.focus();}catch(_){}
  _modalOpener=null;
  if(typeof _ssm!=='undefined')_ssm.endEdit();}
// Backdrop click intentionally disabled — accidental clicks outside a form panel
// no longer close it. Use the ✕ button or Cancel to dismiss modals.

function showQuickAdd(){
const map={dashboard:'project',projects:'project',tasks:'task',risks:'risk',actions:'action',qaqc:'inspection',procurement:'po'};
const type=map[AppState.currentPage]||'project';
if(type==='project')showProjectForm();
else if(type==='task')showTaskForm();
else if(type==='risk')showAddRisk();
else if(type==='action')showAddAction();
else if(type==='inspection')showAddInspection();
else if(type==='po')showAddPO();
else showToast('Use page-specific Add button','info');}

const _ric=window.requestIdleCallback||(f=>setTimeout(f,16));
function drawDonut(cid,vals,cols){_ric(()=>{
const c=$(`#${cid}`);if(!c)return;
const ctx=c.getContext('2d'),cx=c.width/2,cy=c.height/2,r=Math.min(cx,cy)-6,ir=r*.58,tot=vals.reduce((a,b)=>a+b,0)||1;
ctx.clearRect(0,0,c.width,c.height);let ang=-Math.PI/2;
vals.forEach((v,i)=>{const sl=(v/tot)*Math.PI*2;ctx.beginPath();ctx.moveTo(cx,cy);ctx.arc(cx,cy,r,ang,ang+sl);ctx.closePath();ctx.fillStyle=cols[i];ctx.fill();ang+=sl;});
ctx.beginPath();ctx.arc(cx,cy,ir,0,Math.PI*2);
const bg=getComputedStyle(document.documentElement).getPropertyValue('--bg-card').trim()||'#1c2333';
ctx.fillStyle=bg;ctx.fill();});}

function drawBar(cid,labels,vals,col='#388bfd'){_ric(()=>{
const c=$(`#${cid}`);if(!c)return;
const ctx=c.getContext('2d'),W=c.width,H=c.height,pd={t:8,r:8,b:22,l:8};
const cH=H-pd.t-pd.b,cW=W-pd.l-pd.r;
ctx.clearRect(0,0,W,H);const mx=Math.max(...vals.map(v=>isFinite(v)?v:0))||1,bW=Math.floor(cW/vals.length)-5;
vals.forEach((v,i)=>{
const sv=isFinite(v)?v:0;
const bH=Math.max(0,(sv/mx)*cH),x=pd.l+i*(cW/vals.length)+2,y=pd.t+cH-bH;
const g=ctx.createLinearGradient(x,y,x,y+Math.max(1,bH));g.addColorStop(0,col);g.addColorStop(1,col+'55');
ctx.fillStyle=g;ctx.fillRect(x,y,bW,bH);
ctx.fillStyle='#8b949e';ctx.font='9px Outfit,sans-serif';ctx.textAlign='center';
ctx.fillText((labels[i]||'').substring(0,6),x+bW/2,H-4);});})}

function drawLine(cid,datasets){_ric(()=>{
const c=$(`#${cid}`);if(!c)return;
const ctx=c.getContext('2d'),W=c.width,H=c.height,pd={t:12,r:12,b:20,l:28};
ctx.clearRect(0,0,W,H);
const allV=datasets.flatMap(d=>d.data.filter(v=>v!==null));
const mx=Math.max(...allV)||1,pts=Math.max(...datasets.map(d=>d.data.length));
[.25,.5,.75,1].forEach(f=>{
const y=pd.t+(1-f)*(H-pd.t-pd.b);
ctx.strokeStyle='rgba(255,255,255,0.06)';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(pd.l,y);ctx.lineTo(W-pd.r,y);ctx.stroke();
ctx.fillStyle='#8b949e';ctx.font='9px Outfit';ctx.textAlign='right';ctx.fillText(fmtNum(mx*f),pd.l-2,y+3);});
datasets.forEach(ds=>{
const valid=ds.data.filter(v=>v!==null);if(!valid.length)return;
ctx.strokeStyle=ds.color;ctx.lineWidth=2;ctx.beginPath();let first=true;
ds.data.forEach((v,i)=>{if(v===null)return;const x=pd.l+(i/(pts-1||1))*(W-pd.l-pd.r),y=pd.t+(1-v/mx)*(H-pd.t-pd.b);first?(ctx.moveTo(x,y),first=false):ctx.lineTo(x,y);});ctx.stroke();
ctx.beginPath();first=true;
ds.data.forEach((v,i)=>{if(v===null)return;const x=pd.l+(i/(pts-1||1))*(W-pd.l-pd.r),y=pd.t+(1-v/mx)*(H-pd.t-pd.b);first?(ctx.moveTo(x,y),first=false):ctx.lineTo(x,y);});
ctx.lineTo(W-pd.r,H-pd.b);ctx.lineTo(pd.l,H-pd.b);ctx.closePath();ctx.fillStyle=ds.color+'18';ctx.fill();});})}

function drawGrouped(cid,labels,d1,d2){_ric(()=>{
const c=$(`#${cid}`);if(!c)return;
const ctx=c.getContext('2d'),W=c.width,H=c.height,pd={t:8,r:8,b:22,l:8};
const cH=H-pd.t-pd.b,cW=W-pd.l-pd.r;
ctx.clearRect(0,0,W,H);const mx=Math.max(...d1,...d2)||1,gW=cW/labels.length,bW=gW*.32;
labels.forEach((l,i)=>{
const x=pd.l+i*gW+gW*.1;
ctx.fillStyle='rgba(56,139,253,0.25)';const h1=(d1[i]/mx)*cH;ctx.fillRect(x,pd.t+cH-h1,bW,h1);
ctx.fillStyle='#388bfd';const h2=(d2[i]/mx)*cH;ctx.fillRect(x+bW+2,pd.t+cH-h2,bW,h2);
ctx.fillStyle='#8b949e';ctx.font='9px Outfit';ctx.textAlign='center';ctx.fillText(l.replace('PRJ-','P'),x+bW,H-4);});});}

function sc(icon,label,value,sub,color,bg,onclick){
const clickStyle=onclick?'cursor:pointer;transition:transform .12s,box-shadow .12s'+'':' ';
const clickAttr=onclick?`onclick="${onclick}" title="Click to view details"`:'';
return`<div class="stat-card" ${clickAttr} style="${onclick?'cursor:pointer':''}"><div class="stat-icon" style="background:${bg}"><i class="${icon}" style="color:${color}"></i></div>
<div class="stat-info"><div class="label">${label}</div><div class="value" style="color:${color}">${value}</div><div class="change">${sub}</div></div></div>`;}

// ── Recently Viewed strip for dashboard ─────────────────────
function _renderRecentStrip(){
  const recent = (typeof _getRecentItems === 'function') ? _getRecentItems() : [];
  if (!recent.length) return '';
  const typeIcons = { project:'fa-briefcase', page:'fa-file', document:'fa-file-alt', asset:'fa-toolbox' };
  return `<div style="display:flex;align-items:center;gap:8px;margin-bottom:14px;overflow-x:auto;padding:2px">
    <span style="font-size:10px;color:var(--text-muted);font-weight:700;letter-spacing:1px;flex-shrink:0"><i class="fas fa-history" style="margin-right:4px"></i>RECENT</span>
    ${recent.slice(0,6).map(r => `
      <button onclick='_openRecentItem(${JSON.stringify(r).replace(/'/g,"&#39;")})'
        style="display:flex;align-items:center;gap:7px;padding:6px 12px;background:var(--bg-card);border:1px solid var(--border);border-radius:18px;cursor:pointer;flex-shrink:0;color:var(--text-primary);transition:border-color .15s"
        onmouseenter="this.style.borderColor='var(--accent-blue)'" onmouseleave="this.style.borderColor='var(--border)'">
        <i class="fas ${typeIcons[r.type]||'fa-file'}" style="font-size:10px;color:var(--accent-blue)"></i>
        <span style="font-size:11px;font-weight:600;white-space:nowrap;max-width:160px;overflow:hidden;text-overflow:ellipsis">${r.label}</span>
      </button>
    `).join('')}
  </div>`;
}
