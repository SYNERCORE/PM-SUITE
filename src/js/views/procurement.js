function _syncProcurementToAllocations(){} // stub — procurement→allocations sync not yet implemented
function renderProcurement(){
  ensureProcLogs();
  _syncProcurementToAllocations();
  const proc=(AppState.data.procurement||[]).filter(x=>!x._deleted);
  const logs=(AppState.data.procurementLogs||[]).filter(l=>!l._deleted);

  // KPIs
  const totVal=proc.reduce((s,p)=>s+p.amount,0);
  const byStage={};
  PROC_STAGES.forEach(s=>{byStage[s.id]=proc.filter(p=>p.status===s.id).length;});

  const tabs=[
    {id:'list',  label:'All POs / PRs', icon:'fa-list',         count:proc.length},
    {id:'board', label:'Workflow Board', icon:'fa-columns',      count:null},
    {id:'log',   label:'Activity Log',  icon:'fa-clipboard-list',count:logs.length},
    {id:'history',label:'History',       icon:'fa-history',       count:null},
  ];

  $('#procurement').innerHTML=`
  <div class="section-header" style="margin-bottom:14px">
    <div>
      <div class="section-title">Procurement Management</div>
      <div class="section-sub">Full cycle: Request → Approval → RFQ → PO → Delivery → Payment → Close-out</div>
    </div>
    <div style="display:flex;gap:7px">
      <button class="btn btn-secondary btn-sm" onclick="exportProcurementCSV()"><i class="fas fa-download"></i> Export</button>
      <button class="btn btn-secondary btn-sm" onclick="importProcurement()"><i class="fas fa-file-import"></i> Import CSV</button>
      <button class="btn btn-secondary btn-sm" onclick="exportCSV(procFilter(AppState.data.procurement||[]).map(p=>{const lastLog=(AppState.data.procurementLogs||[]).filter(l=>l.procId===p.id).slice(-1)[0];return[p.requestNumber||'',p.prNumber||'',p.poNumber||'',p.description,p.category,p.projectId,p.vendor||'',p.amount||0,p.budgetAmount||0,p.priority||'normal',p.status||'draft',p.requestedBy||'',p.responsiblePerson||'',p.prDate||'',p.poDate||'',p.deliveryDate||'',p.paymentTerms||'',p.notes||'',lastLog?lastLog.action:'',lastLog?lastLog.date:'',lastLog?lastLog.by:''];}),  ['RequestNumber','PRNumber','PONumber','Description','Category','ProjectID','Vendor','Amount','BudgetAmount','Priority','Status','RequestedBy','ResponsiblePerson','PRDate','PODate','DeliveryDate','PaymentTerms','Notes','LastAction','LastActionDate','LastActionBy'],'procurement.csv')"><i class="fas fa-download"></i> Export CSV</button>
      <button class="btn btn-primary btn-sm" onclick="showAddProcurement()"><i class="fas fa-plus"></i> New PR / PO</button>
    </div>
  </div>

  <!-- KPI strip -->
  <div style="display:grid;grid-template-columns:repeat(6,1fr);gap:8px;margin-bottom:14px">
    ${[
      ['fa-file-alt','Total',proc.length,'var(--accent-blue)'],
      ['fa-paper-plane','Open PRs',proc.filter(p=>['draft','requested','approved'].includes(p.status)).length,'#bc8cff'],
      ['fa-shopping-cart','Active POs',proc.filter(p=>['rfq','quoted','evaluated','ordered','partial'].includes(p.status)).length,'var(--accent-amber)'],
      ['fa-truck','In Transit',proc.filter(p=>p.status==='partial').length,'#39d3f2'],
      ['fa-check-double','Completed',proc.filter(p=>['delivered','invoiced','paid','closed'].includes(p.status)).length,'var(--accent-green)'],
      ['fa-ban','Cancelled',proc.filter(p=>p.status==='cancelled').length,'var(--accent-red)'],
    ].map(([ic,l,v,c])=>`<div class="stat-card" style="border-left:3px solid ${c}">
      <div class="stat-icon" style="background:${c}22"><i class="fas ${ic}" style="color:${c}"></i></div>
      <div class="stat-info"><div class="label">${l}</div><div class="value" style="color:${c}">${v}</div></div>
    </div>`).join('')}
  </div>

  <!-- Total value banner -->
  <div style="background:linear-gradient(135deg,#0d2147,#112266);border:1px solid rgba(56,139,253,.25);border-radius:10px;padding:12px 18px;margin-bottom:14px;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px">
    <div><div style="font-size:11px;color:rgba(255,255,255,.6)">Total Procurement Value</div><div style="font-size:24px;font-weight:800;font-family:var(--font-mono);color:#fff">₱${fmtNum(totVal)}</div></div>
    <div style="display:flex;gap:16px;flex-wrap:wrap">
      ${[['Paid',proc.filter(p=>p.status==='paid'||p.status==='closed').reduce((s,p)=>s+p.amount,0),'#3fb950'],
         ['Delivered (pending invoice)',proc.filter(p=>p.status==='delivered').reduce((s,p)=>s+p.amount,0),'#39d3f2'],
         ['Active/In Progress',proc.filter(p=>!['paid','closed','cancelled'].includes(p.status)).reduce((s,p)=>s+p.amount,0),'var(--accent-amber)'],
      ].map(([l,v,c])=>`<div style="text-align:center"><div style="font-size:10px;color:rgba(255,255,255,.6)">${l}</div><div style="font-size:14px;font-weight:700;font-family:var(--font-mono);color:${c}">₱${fmtNum(v)}</div></div>`).join('')}
    </div>
  </div>

  <!-- Filters -->
  <div class="filters-bar" style="margin-bottom:12px">
    <div class="search-bar"><i class="fas fa-search"></i><input type="text" id="procSearchInput" placeholder="Search PO#, PR#, vendor, description..." value="${procSearch}" oninput="_resetPage('procurement');procSearch=this.value;renderProcTab()"></div>
    <select class="form-select" style="height:32px;width:160px" onchange="procStatusFilter=this.value;renderProcTab()">
      <option value="all">All Statuses</option>
      ${PROC_STAGES.map(s=>`<option value="${s.id}" ${procStatusFilter===s.id?'selected':''}>${s.label}</option>`).join('')}
    </select>
    <select class="form-select" style="height:32px;width:155px" onchange="procProjFilter=this.value;renderProcTab()">
      <option value="all">All Projects</option>
      ${(AppState.data.projects||[]).map(p=>`<option value="${p.id}" ${procProjFilter===p.id?'selected':''}>${p.id}</option>`).join('')}
    </select>
    <button class="btn btn-secondary btn-sm" onclick="procSearch='';procStatusFilter='all';procProjFilter='all';$('#procSearchInput').value='';renderProcTab()"><i class="fas fa-times"></i> Clear</button>
  </div>

  <!-- Tabs -->
  <div class="tabs" style="margin-bottom:14px">
    ${tabs.map(t=>`<div class="tab ${procTab===t.id?'active':''}" onclick="procTab='${t.id}';renderProcTab()">
      <i class="fas ${t.icon}" style="margin-right:4px"></i>${t.label}
      ${t.count!==null?`<span style="margin-left:4px;background:${procTab===t.id?'rgba(255,255,255,.2)':'var(--bg-hover)'};border-radius:10px;padding:0 6px;font-size:10px;font-weight:700">${t.count}</span>`:''}
    </div>`).join('')}
  </div>
  <div id="procTabContent"></div>`;

  renderProcTab();
}

function renderProcTab(){
  const map={list:renderProcList,board:renderProcBoard,log:renderProcLog,history:renderProcHistory};
  if(map[procTab])map[procTab]();
}

function procFilter(arr){
  let r=[...arr];
  if(procSearch){const s=procSearch.toLowerCase();r=r.filter(p=>Object.values(p).some(v=>String(v||'').toLowerCase().includes(s)));}
  if(procStatusFilter!=='all')r=r.filter(p=>p.status===procStatusFilter);
  if(procProjFilter!=='all')r=r.filter(p=>p.projectId===procProjFilter);
  return r;
}

// ── LIST VIEW ──────────────────────────────────────────────
function renderProcList(){
  const data=procFilter(AppState.data.procurement||[]);
  const logs=AppState.data.procurementLogs||[];
  const priorityBadge={critical:'badge-red',high:'badge-amber',normal:'badge-blue',low:'badge-gray'};
  const priOrder={critical:0,high:1,normal:2,low:3};
  data.sort((a,b)=>(priOrder[a.priority||'normal']||2)-(priOrder[b.priority||'normal']||2));

  $('#procTabContent').innerHTML=`<div class="card">
  <div class="section-header" style="margin-bottom:10px">
    <div class="section-title">Purchase Requests / Orders <span style="font-size:12px;font-weight:400;color:var(--text-secondary)">${data.length} records</span></div>
  </div>
  <div class="table-wrap"><table>
    <thead><tr><th style="min-width:120px">Request No. → PR No. → PO No.</th><th>Description</th><th>Category</th><th>Project</th><th>Vendor / Supplier</th><th>Requested By</th><th>Responsible</th><th>Priority</th><th>Amount (₱)</th><th>PR Date</th><th>PO Date</th><th>Delivery</th><th>Payment Terms</th><th>Status</th><th>Last Update</th><th>Actions</th></tr></thead>
    <tbody>${data.length?_pgSlice('procurement',data).map(p=>{
      const stage=getProcStage(p.status);
      const lastLog=logs.filter(l=>l.procId===p.id).slice(-1)[0];
      const isOverdueDelivery=p.deliveryDate&&isOverdue(p.deliveryDate)&&!['delivered','paid','closed','cancelled'].includes(p.status);
      return`<tr style="${isOverdueDelivery?'border-left:3px solid var(--accent-red)':''}">
        <td style="font-size:10px;font-family:var(--font-mono);font-weight:700;white-space:nowrap">
          <div style="display:flex;flex-direction:column;gap:2px">
            ${p.requestNumber?`<div style="font-size:9px;color:#39d3f2"><i class="fas fa-file-alt" style="width:12px"></i>REQ: ${p.requestNumber}</div>`:''}
            ${p.prNumber?`<div style="font-size:9px;color:#bc8cff"><i class="fas fa-check-circle" style="width:12px"></i>PR: ${p.prNumber}</div>`:''}
            ${p.poNumber?`<div style="font-size:10px;font-weight:700;color:var(--accent-blue)"><i class="fas fa-shopping-cart" style="width:12px"></i>PO: ${p.poNumber}</div>`:`<div style="font-size:10px;color:var(--text-muted)"><i class="fas fa-shopping-cart" style="width:12px"></i>PO: <em>Pending</em></div>`}
          </div>
        </td>
        <td style="min-width:180px"><div style="font-weight:500;font-size:12px">${p.description}</div>
          ${p.notes?`<div style="font-size:10px;color:var(--text-muted);margin-top:2px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:200px" title="${p.notes.replace(/"/g,'&quot;')}"><i class="fas fa-sticky-note" style="margin-right:3px"></i>${p.notes.substring(0,60)}${p.notes.length>60?'...':''}</div>`:''}
          ${p.attachments?.length?`<div style="margin-top:3px"><span class="badge badge-amber" style="font-size:8px"><i class="fas fa-paperclip" style="margin-right:3px"></i>${p.attachments.length} file${p.attachments.length!==1?'s':''}</span></div>`:''}
        </td>
        <td><span class="badge badge-gray">${p.category}</span></td>
        <td><span class="badge badge-blue">${p.projectId}</span></td>
        <td><div style="font-size:12px;font-weight:500">${p.vendor||'—'}</div></td>
        <td><div style="display:flex;align-items:center;gap:5px">${p.requestedBy?avatarH(p.requestedBy,22):'<i class="fas fa-user" style="color:var(--text-muted);font-size:11px"></i>'}<span style="font-size:11px">${p.requestedBy||'—'}</span></div></td>
        <td><div style="display:flex;align-items:center;gap:5px">${p.responsiblePerson?`<div style="width:22px;height:22px;border-radius:50%;background:var(--accent-amber);display:flex;align-items:center;justify-content:center;font-size:9px;font-weight:700;color:#fff;flex-shrink:0">${p.responsiblePerson.charAt(0).toUpperCase()}</div>`:''}<span style="font-size:11px;font-weight:${p.responsiblePerson?'500':'400'};color:${p.responsiblePerson?'inherit':'var(--text-muted)'}">${p.responsiblePerson||'Unassigned'}</span></div></td>
        <td><span class="badge ${priorityBadge[p.priority||'normal']||'badge-gray'}">${p.priority||'normal'}</span></td>
        <td style="font-size:11px">
          <div style="font-family:var(--font-mono);font-weight:600">₱${Number(p.amount||0).toLocaleString()}</div>
          ${p.budgetAmount&&p.budgetAmount!==p.amount?`<div style="font-size:9px;color:var(--text-muted)">Budget: ₱${Number(p.budgetAmount).toLocaleString()}</div>`:''}
        </td>
        <td style="font-size:10px;font-family:var(--font-mono)">${p.prDate||p.poDate||'—'}</td>
        <td style="font-size:10px;font-family:var(--font-mono)">${p.poDate&&p.prDate!==p.poDate?p.poDate:'—'}</td>
        <td style="font-size:10px;font-family:var(--font-mono);color:${isOverdueDelivery?'var(--accent-red)':'inherit'};font-weight:${isOverdueDelivery?'700':'400'}">${p.deliveryDate||'—'}${isOverdueDelivery?' ⚠':''}</td>
        <td style="font-size:10px;color:var(--text-secondary)">${p.paymentTerms||'—'}</td>
        <td>
          <div style="display:flex;align-items:center;gap:5px">
            <i class="fas ${stage.icon}" style="color:${stage.color};font-size:10px"></i>
            <span class="badge" style="background:${stage.color}22;color:${stage.color};font-size:9px;white-space:nowrap">${stage.label}</span>
          </div>
        </td>
        <td style="font-size:10px;color:var(--text-secondary);min-width:130px">${lastLog?`<div style="font-weight:500;color:var(--text-primary)">${lastLog.action}</div><div style="font-size:9px">${lastLog.date} · ${lastLog.by}</div>`:'<span style="color:var(--text-muted)">No updates yet</span>'}</td>
        <td>
          <div style="display:flex;flex-direction:column;gap:3px">
            <button class="btn btn-primary btn-sm" style="font-size:9px;padding:3px 8px;white-space:nowrap" onclick="showProcDetail('${p.id}')"><i class="fas fa-eye"></i> View</button>
            <button class="btn btn-success btn-sm" style="font-size:9px;padding:3px 8px;white-space:nowrap" onclick="showProcLogUpdate('${p.id}')"><i class="fas fa-plus"></i> Log Update</button>
            <button class="btn btn-secondary btn-sm" style="font-size:9px;padding:3px 8px;white-space:nowrap" onclick="showEditProcurement('${p.id}')"><i class="fas fa-edit"></i> Edit</button>
            <button class="btn btn-danger btn-sm btn-icon" onclick="deleteProcurement('${p.id}')" title="Delete"><i class="fas fa-trash"></i></button>
          </div>
        </td>
      </tr>`;}).join(''):`<tr><td colspan="16"><div class="empty-state" style="padding:24px"><i class="fas fa-shopping-cart" style="font-size:28px;margin-bottom:8px"></i><p>No procurement records found.</p><button class="btn btn-primary" onclick="showAddProcurement()"><i class="fas fa-plus"></i> New PR / PO</button></div></td></tr>`}
    </tbody>
  </table></div></div>`;
}

// ── BOARD VIEW ─────────────────────────────────────────────
function renderProcBoard(){
  const data=procFilter(AppState.data.procurement||[]);
  // Show key stages as columns
  const boardStages=PROC_STAGES.filter(s=>s.id!=='cancelled');
  $('#procTabContent').innerHTML=`
  <div style="display:flex;gap:10px;overflow-x:auto;padding-bottom:10px;min-height:300px">
    ${boardStages.map(stage=>{
      const items=data.filter(p=>p.status===stage.id);
      return`<div style="min-width:200px;width:200px;flex-shrink:0">
        <div style="padding:8px 10px;background:${stage.color}22;border-radius:8px 8px 0 0;border:1px solid ${stage.color}44;border-bottom:none;display:flex;align-items:center;justify-content:space-between">
          <div style="display:flex;align-items:center;gap:6px">
            <i class="fas ${stage.icon}" style="color:${stage.color};font-size:11px"></i>
            <span style="font-size:11px;font-weight:700;color:${stage.color}">${stage.label}</span>
          </div>
          <span style="background:${stage.color}44;color:${stage.color};font-size:10px;font-weight:700;padding:1px 7px;border-radius:10px">${items.length}</span>
        </div>
        <div style="background:var(--bg-hover);border:1px solid ${stage.color}44;border-top:none;border-radius:0 0 8px 8px;min-height:100px;padding:6px;display:flex;flex-direction:column;gap:6px">
          ${items.map(p=>`<div style="background:var(--bg-card);border:1px solid var(--border);border-radius:7px;padding:9px;cursor:pointer" onclick="showProcDetail('${p.id}')">
            <div style="font-size:10px;font-family:var(--font-mono);color:${stage.color};font-weight:700;margin-bottom:3px">${p.id}</div>
            <div style="font-size:11px;font-weight:500;margin-bottom:4px;overflow:hidden;text-overflow:ellipsis;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical">${p.description}</div>
            <div style="font-size:10px;color:var(--text-secondary);margin-bottom:3px">${p.vendor||'—'}</div>
            <div style="display:flex;justify-content:space-between;align-items:center">
              <span style="font-size:10px;font-family:var(--font-mono);font-weight:600">₱${fmtNum(p.amount)}</span>
              <span class="badge badge-blue" style="font-size:8px">${p.projectId}</span>
            </div>
            ${p.responsiblePerson?`<div style="font-size:9px;color:var(--text-muted);margin-top:4px"><i class="fas fa-user" style="margin-right:3px"></i>${p.responsiblePerson}</div>`:''}
          </div>`).join('')}
          ${!items.length?`<div style="text-align:center;padding:12px;color:var(--text-muted);font-size:10px">No items</div>`:''}
        </div>
      </div>`;
    }).join('')}
  </div>
  <div class="card" style="margin-top:14px;padding:10px 16px">
    <div style="display:flex;gap:12px;flex-wrap:wrap;align-items:center">
      <span style="font-size:11px;font-weight:600;color:var(--text-secondary)">Legend:</span>
      ${PROC_STAGES.map(s=>`<div style="display:flex;align-items:center;gap:4px"><i class="fas ${s.icon}" style="color:${s.color};font-size:10px"></i><span style="font-size:10px">${s.label}</span></div>`).join('')}
    </div>
  </div>`;
}

// ── LOG VIEW ───────────────────────────────────────────────
function renderProcLog(){
  const logs=(AppState.data.procurementLogs||[]).slice().reverse();
  const proc=AppState.data.procurement||[];

  $('#procTabContent').innerHTML=`<div class="card">
  <div class="section-header" style="margin-bottom:10px">
    <div><div class="section-title">Activity Log <span style="font-size:12px;font-weight:400;color:var(--text-secondary)">${logs.length} entries</span></div>
    <div style="font-size:11px;color:var(--text-secondary)">All status changes, updates, and remarks across all procurement items</div></div>
    <button class="btn btn-primary btn-sm" onclick="showProcLogUpdateGlobal()"><i class="fas fa-plus"></i> Log Update</button>
  </div>
  <div class="table-wrap"><table>
    <thead><tr><th>Log ID</th><th>Date &amp; Time</th><th>REQ / PR / PO</th><th>Description</th><th>Action / Stage Change</th><th>Stage Before</th><th>Stage After</th><th>Updated By</th><th>Remarks / Notes</th><th></th></tr></thead>
    <tbody>${logs.length?logs.map(l=>{
      const p=proc.find(x=>x.id===l.procId)||{};
      const before=l.stageBefore?getProcStage(l.stageBefore):null;
      const after=l.stageAfter?getProcStage(l.stageAfter):null;
      return`<tr>
        <td style="font-size:10px;font-family:var(--font-mono);color:var(--text-muted)">${l.id}</td>
        <td style="font-size:10px;font-family:var(--font-mono);white-space:nowrap">${l.date}${l.time?' '+l.time:''}</td>
        <td><div style="font-family:var(--font-mono);font-size:11px;font-weight:700;color:var(--accent-blue)">${l.procId}</div>
          <div style="font-size:9px;color:var(--text-muted);max-width:120px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${p.description||''}</div>
        </td>
        <td style="font-size:11px;font-weight:500;min-width:150px">${p.description||'—'}</td>
        <td><div style="font-size:12px;font-weight:600">${l.action}</div></td>
        <td>${before?`<span class="badge" style="background:${before.color}22;color:${before.color};font-size:9px">${before.label}</span>`:'<span style="color:var(--text-muted);font-size:10px">—</span>'}</td>
        <td>${after?`<span class="badge" style="background:${after.color}22;color:${after.color};font-size:9px">${after.label}</span>`:'<span style="color:var(--text-muted);font-size:10px">—</span>'}</td>
        <td><div style="display:flex;align-items:center;gap:5px">${l.by?avatarH(l.by,22):''}
          <span style="font-size:11px">${l.by||'—'}</span></div>
        </td>
        <td style="font-size:11px;color:var(--text-secondary);max-width:200px">${l.remarks||'<span style="color:var(--text-muted)">—</span>'}</td>
        <td><button class="btn btn-danger btn-sm btn-icon" onclick="deleteProcLog('${l.id}')"><i class="fas fa-trash"></i></button></td>
      </tr>`;}).join(''):`<tr><td colspan="10"><div class="empty-state" style="padding:24px"><i class="fas fa-clipboard-list" style="font-size:24px;margin-bottom:8px"></i><p>No activity logged yet.</p></div></td></tr>`}
    </tbody>
  </table></div></div>`;
}

// ── HISTORY TIMELINE VIEW ──────────────────────────────────
function renderProcHistory(){
  const logs=(AppState.data.procurementLogs||[]).slice().reverse();
  const proc=AppState.data.procurement||[];
  const data=procFilter(proc);
  // Group logs by procId
  const byPO={};
  logs.forEach(l=>{if(!byPO[l.procId])byPO[l.procId]=[];byPO[l.procId].push(l);});

  $('#procTabContent').innerHTML=`<div style="display:flex;flex-direction:column;gap:14px">
    ${data.length?data.map(p=>{
      const pLogs=byPO[p.id]||[];
      const stage=getProcStage(p.status);
      const stageIdx=PROC_STAGES.findIndex(s=>s.id===p.status);
      const progPct=Math.round((stageIdx/(PROC_STAGES.length-2))*100);
      return`<div class="card">
        <!-- PO Header -->
        <div style="display:flex;align-items:flex-start;justify-content:space-between;margin-bottom:12px;flex-wrap:wrap;gap:8px">
          <div>
            <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px">
              <span style="font-family:var(--font-mono);font-size:13px;font-weight:700;color:var(--accent-blue)">${p.id}</span>
              <div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:2px">
                ${p.requestNumber?`<span style="font-size:9px;background:rgba(57,211,242,.1);color:#39d3f2;padding:1px 5px;border-radius:3px">REQ: ${p.requestNumber}</span>`:''}
                ${p.prNumber?`<span style="font-size:9px;background:rgba(188,140,255,.1);color:#bc8cff;padding:1px 5px;border-radius:3px">PR: ${p.prNumber}</span>`:''}
                <span style="font-size:9px;background:rgba(56,139,253,.1);color:var(--accent-blue);padding:1px 5px;border-radius:3px">PO: ${p.poNumber||p.id}</span>
              </div>              <span class="badge" style="background:${stage.color}22;color:${stage.color}"><i class="fas ${stage.icon}" style="margin-right:4px;font-size:9px"></i>${stage.label}</span>
              <span class="badge ${{'critical':'badge-red','high':'badge-amber','normal':'badge-blue','low':'badge-gray'}[p.priority||'normal']}">${p.priority||'normal'}</span>
            </div>
            <div style="font-size:14px;font-weight:600;margin-bottom:3px">${p.description}</div>
            <div style="font-size:11px;color:var(--text-secondary);display:flex;gap:12px;flex-wrap:wrap">
              <span><i class="fas fa-building" style="margin-right:4px"></i>${p.vendor||'—'}</span>
              <span><i class="fas fa-project-diagram" style="margin-right:4px"></i>${p.projectId}</span>
              <span><i class="fas fa-dollar-sign" style="margin-right:4px"></i>₱${fmtNum(p.amount)}</span>
              ${p.responsiblePerson?`<span style="color:var(--accent-amber)"><i class="fas fa-user-tie" style="margin-right:4px"></i>${p.responsiblePerson}</span>`:''}
              ${p.requestedBy?`<span><i class="fas fa-user" style="margin-right:4px"></i>Requested by: ${p.requestedBy}</span>`:''}
            </div>
          </div>
          <div style="display:flex;gap:6px">
            <button class="btn btn-primary btn-sm" onclick="showProcDetail('${p.id}')"><i class="fas fa-eye"></i> Detail</button>
            <button class="btn btn-success btn-sm" onclick="showProcLogUpdate('${p.id}')"><i class="fas fa-plus"></i> Log</button>
          </div>
        </div>

        <!-- Progress bar -->
        <div style="margin-bottom:14px">
          <div style="display:flex;justify-content:space-between;margin-bottom:4px">
            <span style="font-size:10px;color:var(--text-secondary)">Workflow Progress</span>
            <span style="font-size:11px;font-weight:700;color:${stage.color}">${stage.label}</span>
          </div>
          <div class="progress-bar" style="height:8px">
            <div class="progress-fill" style="width:${Math.min(100,progPct)}%;background:${stage.color};border-radius:4px"></div>
          </div>
          <div style="display:flex;justify-content:space-between;margin-top:4px;font-size:9px;color:var(--text-muted)">
            <span>Request</span><span>PO Issued</span><span>Delivered</span><span>Paid</span><span>Closed</span>
          </div>
        </div>

        <!-- Timeline entries -->
        ${pLogs.length?`<div style="border-left:2px solid var(--border);padding-left:14px;margin-left:7px">
          ${pLogs.map((l,i)=>{
            const lStage=l.stageAfter?getProcStage(l.stageAfter):null;
            return`<div style="position:relative;padding-bottom:${i<pLogs.length-1?'14':'0'}px">
              <div style="position:absolute;left:-21px;top:4px;width:10px;height:10px;border-radius:50%;background:${lStage?lStage.color:'#8b949e'};border:2px solid var(--bg-card)"></div>
              <div style="display:flex;align-items:flex-start;justify-content:space-between;flex-wrap:wrap;gap:4px">
                <div style="flex:1;min-width:0">
                  <div style="font-size:12px;font-weight:600">${l.action}</div>
                  ${l.remarks?`<div style="font-size:11px;color:var(--text-secondary);margin-top:3px;padding:6px 10px;background:var(--bg-hover);border-radius:5px;border-left:2px solid ${lStage?lStage.color:'#8b949e'}">${l.remarks}</div>`:''}
                  <div style="font-size:10px;color:var(--text-muted);margin-top:3px;display:flex;gap:8px;flex-wrap:wrap">
                    ${l.stageBefore&&l.stageAfter&&l.stageBefore!==l.stageAfter?`<span><i class="fas fa-arrow-right" style="font-size:8px;margin-right:3px"></i>${getProcStage(l.stageBefore).label} → <strong style="color:${getProcStage(l.stageAfter).color}">${getProcStage(l.stageAfter).label}</strong></span>`:''}
                    ${l.by?`<span><i class="fas fa-user" style="margin-right:3px"></i>${l.by}</span>`:''}
                  </div>
                </div>
                <div style="font-size:10px;font-family:var(--font-mono);color:var(--text-muted);white-space:nowrap">${l.date}${l.time?' '+l.time:''}</div>
              </div>
            </div>`;
          }).join('')}
        </div>`:
        `<div style="padding:10px;text-align:center;color:var(--text-muted);font-size:11px"><i class="fas fa-clipboard-list" style="margin-right:6px"></i>No updates logged yet — <a href="#" onclick="showProcLogUpdate('${p.id}')" style="color:var(--accent-blue)">add first update</a></div>`}
      </div>`;
    }).join(''):`<div class="card" style="padding:30px;text-align:center;color:var(--text-muted)"><i class="fas fa-shopping-cart" style="font-size:30px;margin-bottom:10px;display:block;opacity:.3"></i><p>No procurement records found.</p></div>`}
  </div>`;
}

// ── PO DETAIL MODAL ────────────────────────────────────────
function showProcDetail(id){
  const p=(AppState.data.procurement||[]).find(x=>x.id===id);
  if(!p)return;
  const logs=(AppState.data.procurementLogs||[]).filter(l=>l.procId===id).slice().reverse();
  const stage=getProcStage(p.status);
  const stageIdx=PROC_STAGES.findIndex(s=>s.id===p.status);

  $('#genericModalTitle').textContent=id+' — '+p.description.substring(0,40);
  $('#genericModalBody').innerHTML=`
  <!-- Stage selector -->
  <div style="margin-bottom:14px;padding:12px;background:var(--bg-hover);border-radius:8px">
    <div style="font-size:11px;font-weight:600;color:var(--text-secondary);margin-bottom:8px">Current Status — click to change</div>
    <div style="display:flex;gap:4px;flex-wrap:wrap">
      ${PROC_STAGES.map((s,i)=>`<div onclick="changeProcStage('${id}','${s.id}')" style="padding:4px 8px;border-radius:5px;font-size:9px;font-weight:600;cursor:pointer;border:1px solid ${s.color}44;background:${p.status===s.id?s.color+'33':'transparent'};color:${p.status===s.id?s.color:'var(--text-muted)'};transition:.15s" title="${s.label}">
        <i class="fas ${s.icon}" style="margin-right:3px"></i>${s.label}
      </div>`).join('')}
    </div>
  </div>

  <!-- Info grid -->
  <div class="grid grid-2" style="margin-bottom:14px;gap:10px">
    <div>
      <div style="font-size:13px;font-weight:600;margin-bottom:8px">Procurement Details</div>
      ${[
        ['Request No.',p.requestNumber||'—'],['PR Number',p.prNumber||'—'],['PO Number',p.poNumber||'— Pending'],['Category',p.category],
        ['Project',p.projectId],['Vendor',p.vendor||'—'],['Amount','₱'+fmtNum(p.amount)],
        ['PR Date',p.prDate||'—'],['PO Date',p.poDate||'—'],['Delivery Date',p.deliveryDate||'—'],
        ['Payment Terms',p.paymentTerms||'—'],['Delivery Address',p.deliveryAddress||'—'],
      ].map(([l,v])=>`<div style="display:flex;justify-content:space-between;padding:5px 0;border-bottom:1px solid var(--border);font-size:11px">
        <span style="color:var(--text-secondary)">${l}</span>
        <span style="font-weight:500;text-align:right;max-width:55%">${v}</span>
      </div>`).join('')}
    </div>
    <div>
      <div style="font-size:13px;font-weight:600;margin-bottom:8px">Responsibility</div>
      ${[
        ['Requested By',p.requestedBy||'—'],['Responsible Person',p.responsiblePerson||'Unassigned'],
        ['Priority',p.priority||'normal'],['Status',stage.label],
      ].map(([l,v])=>`<div style="display:flex;justify-content:space-between;padding:5px 0;border-bottom:1px solid var(--border);font-size:11px">
        <span style="color:var(--text-secondary)">${l}</span><span style="font-weight:500">${v}</span>
      </div>`).join('')}
      ${p.notes?`<div style="margin-top:10px;padding:10px;background:rgba(56,139,253,.08);border-radius:7px;border-left:3px solid var(--accent-blue)">
        <div style="font-size:10px;font-weight:600;color:var(--text-secondary);margin-bottom:4px">Notes / Remarks</div>
        <div style="font-size:12px">${p.notes}</div>
      </div>`:''}
    </div>
  </div>

  <!-- Activity log -->
  <div style="font-size:13px;font-weight:600;margin-bottom:8px">Activity History (${logs.length} entries)</div>
  <div style="max-height:250px;overflow-y:auto;border:1px solid var(--border);border-radius:8px">
    ${logs.length?logs.map(l=>{
      const lStage=l.stageAfter?getProcStage(l.stageAfter):null;
      return`<div style="padding:10px 12px;border-bottom:1px solid var(--border);display:flex;gap:10px">
        <div style="width:28px;height:28px;border-radius:50%;background:${lStage?lStage.color+'22':'var(--bg-hover)'};display:flex;align-items:center;justify-content:center;flex-shrink:0">
          <i class="fas ${lStage?lStage.icon:'fa-circle-dot'}" style="color:${lStage?lStage.color:'#8b949e'};font-size:11px"></i>
        </div>
        <div style="flex:1;min-width:0">
          <div style="display:flex;justify-content:space-between;align-items:flex-start">
            <div style="font-size:12px;font-weight:600">${l.action}</div>
            <div style="font-size:10px;color:var(--text-muted);white-space:nowrap;margin-left:8px">${l.date}${l.time?' '+l.time:''}</div>
          </div>
          ${l.remarks?`<div style="font-size:11px;color:var(--text-secondary);margin:4px 0;padding:5px 8px;background:var(--bg-hover);border-radius:4px">${l.remarks}</div>`:''}
          <div style="font-size:10px;color:var(--text-muted);display:flex;gap:8px">
            ${l.by?`<span><i class="fas fa-user" style="margin-right:3px"></i>${l.by}</span>`:''}
            ${l.stageBefore&&l.stageAfter&&l.stageBefore!==l.stageAfter?`<span>${getProcStage(l.stageBefore).label} → <strong style="color:${getProcStage(l.stageAfter).color}">${getProcStage(l.stageAfter).label}</strong></span>`:''}
          </div>
        </div>
      </div>`;
    }).join(''):`<div style="padding:16px;text-align:center;color:var(--text-muted);font-size:11px">No activity logged yet.</div>`}
  </div>`;

  $('#genericModalFooter').innerHTML=`
    <button class="btn btn-success" onclick="closeModal('genericModal');showProcLogUpdate('${id}')"><i class="fas fa-plus"></i> Log Update</button>
    <button class="btn btn-secondary" onclick="closeModal('genericModal');showEditProcurement('${id}')"><i class="fas fa-edit"></i> Edit</button>
    <div style="flex:1"></div>
    <button class="btn btn-secondary" onclick="closeModal('genericModal')">Close</button>`;
  openModal('genericModal');
}

function changeProcStage(id,newStage){
  const p=(AppState.data.procurement||[]).find(x=>x.id===id);
  if(!p)return;
  const oldStage=p.status;
  if(oldStage===newStage)return;
  p.status=newStage;
  AppState.save();
  // Auto-log stage change
  addProcLog(id,{
    action:'Stage changed to: '+getProcStage(newStage).label,
    stageBefore:oldStage,stageAfter:newStage,
    by:(_currentUserProfile?.name||'User'),
    remarks:'',
  });
  closeModal('genericModal');
  renderProcurement();
  showToast('Stage updated to: '+getProcStage(newStage).label,'success');
}

// ── LOG UPDATE MODAL ───────────────────────────────────────
function showProcLogUpdate(procId, preselect=null){
  const p=(AppState.data.procurement||[]).find(x=>x.id===procId);
  if(!p)return;
  const currentStage=getProcStage(p.status);
  const user=_currentUserProfile?.name||'';

  $('#genericModalTitle').textContent='Log Update — '+procId;
  $('#genericModalBody').innerHTML=`
  <div style="padding:8px 12px;background:rgba(56,139,253,.08);border-radius:7px;margin-bottom:14px;font-size:11px">
    <strong>${p.description}</strong><br>
    <span style="color:var(--text-secondary)">Current Stage: </span>
    <span class="badge" style="background:${currentStage.color}22;color:${currentStage.color};font-size:9px">${currentStage.label}</span>
  </div>
  <div class="form-grid">
    <div class="form-group" style="grid-column:1/-1">
      <label class="form-label">Action / Update *</label>
      <input class="form-input" id="plAction" placeholder="e.g., PO issued, Delivery received, Invoice submitted, Payment processed..." value="${preselect||''}">
    </div>
    <div class="form-group">
      <label class="form-label">Date *</label>
      <input class="form-input" type="date" id="plDate" value="${new Date().toISOString().split('T')[0]}">
    </div>
    <div class="form-group">
      <label class="form-label">Time</label>
      <input class="form-input" type="time" id="plTime" value="${new Date().toTimeString().slice(0,5)}">
    </div>
    <div class="form-group">
      <label class="form-label">Updated By</label>
      <input class="form-input" id="plBy" value="${user}" placeholder="Your name">
    </div>
    <div class="form-group">
      <label class="form-label">Advance Stage To</label>
      <select class="form-select" id="plStage">
        <option value="">— No stage change —</option>
        ${PROC_STAGES.map(s=>`<option value="${s.id}" ${p.status===s.id?'selected':''}>${s.label}</option>`).join('')}
      </select>
    </div>
    <div class="form-group" style="grid-column:1/-1">
      <label class="form-label">Remarks / Notes</label>
      <textarea class="form-textarea" id="plRemarks" placeholder="Enter any remarks, decisions, issues, delivery details, invoice numbers, etc." style="min-height:80px"></textarea>
    </div>
  </div>`;
  $('#genericModalFooter').innerHTML=`
    <button class="btn btn-secondary" onclick="closeModal('genericModal')">Cancel</button>
    <button class="btn btn-primary" onclick="saveProcLogUpdate('${procId}')"><i class="fas fa-save"></i> Save Update</button>`;
  openModal('genericModal');
}

function showProcLogUpdateGlobal(){
  const proc=AppState.data.procurement||[];
  if(!proc.length){showToast('No procurement records yet','warning');return;}
  const user=_currentUserProfile?.name||'';
  $('#genericModalTitle').textContent='Log Procurement Update';
  $('#genericModalBody').innerHTML=`
  <div class="form-grid">
    <div class="form-group" style="grid-column:1/-1">
      <label class="form-label">Select PR / PO *</label>
      <select class="form-select" id="plProcId">
        <option value="">— Select —</option>
        ${proc.map(p=>`<option value="${p.id}">${p.id} — ${p.description.substring(0,40)} [${getProcStage(p.status).label}]</option>`).join('')}
      </select>
    </div>
    <div class="form-group" style="grid-column:1/-1">
      <label class="form-label">Action / Update *</label>
      <input class="form-input" id="plAction" placeholder="What happened?">
    </div>
    <div class="form-group">
      <label class="form-label">Date *</label>
      <input class="form-input" type="date" id="plDate" value="${new Date().toISOString().split('T')[0]}">
    </div>
    <div class="form-group">
      <label class="form-label">Time</label>
      <input class="form-input" type="time" id="plTime" value="${new Date().toTimeString().slice(0,5)}">
    </div>
    <div class="form-group">
      <label class="form-label">Updated By</label>
      <input class="form-input" id="plBy" value="${user}" placeholder="Your name">
    </div>
    <div class="form-group">
      <label class="form-label">Advance Stage To</label>
      <select class="form-select" id="plStage">
        <option value="">— No stage change —</option>
        ${PROC_STAGES.map(s=>`<option value="${s.id}">${s.label}</option>`).join('')}
      </select>
    </div>
    <div class="form-group" style="grid-column:1/-1">
      <label class="form-label">Remarks / Notes</label>
      <textarea class="form-textarea" id="plRemarks" placeholder="Remarks, decisions, issues, reference numbers..." style="min-height:80px"></textarea>
    </div>
  </div>`;
  $('#genericModalFooter').innerHTML=`
    <button class="btn btn-secondary" onclick="closeModal('genericModal')">Cancel</button>
    <button class="btn btn-primary" onclick="saveProcLogUpdateGlobal()"><i class="fas fa-save"></i> Save Update</button>`;
  openModal('genericModal');
}

function saveProcLogUpdate(procId){
  const action=$('#plAction')?.value?.trim();
  if(!action){showToast('Action/Update is required','error');return;}
  const newStage=$('#plStage')?.value||'';
  const p=(AppState.data.procurement||[]).find(x=>x.id===procId);
  const oldStage=p?.status||'';
  if(newStage&&p){p.status=newStage;}
  addProcLog(procId,{
    action,
    stageBefore:oldStage,
    stageAfter:newStage||oldStage,
    date:$('#plDate')?.value||new Date().toISOString().split('T')[0],
    time:$('#plTime')?.value||'',
    by:$('#plBy')?.value||'',
    remarks:$('#plRemarks')?.value||'',
  });
  AppState.save();
  closeModal('genericModal');
  renderProcurement();
  showToast('Update logged','success');
}

function saveProcLogUpdateGlobal(){
  const procId=$('#plProcId')?.value||'';
  if(!procId){showToast('Select a PR/PO first','error');return;}
  saveProcLogUpdate(procId);
}

function addProcLog(procId,data){
  if(!AppState.data.procurementLogs)AppState.data.procurementLogs=[];
  const log={
    id:'PL-'+((AppState.data.procurementLogs||[]).length+1).toString().padStart(4,'0'),
    procId,
    action:data.action||'Update',
    stageBefore:data.stageBefore||'',
    stageAfter:data.stageAfter||'',
    date:data.date||new Date().toISOString().split('T')[0],
    time:data.time||new Date().toTimeString().slice(0,5),
    by:data.by||(_currentUserProfile?.name||''),
    remarks:data.remarks||'',
  };
  AppState.data.procurementLogs.push(log);
  AppState.save();
}

function deleteProcLog(id){
  if(!confirm('Delete this log entry?'))return;
  const log=(AppState.data.procurementLogs||[]).find(l=>l.id===id);
  if(log){log._deleted=true;log._deletedAt=new Date().toISOString();log._deletedBy=(typeof _currentUserProfile!=='undefined')?(_currentUserProfile?.name||_currentUserProfile?.email||'unknown'):'unknown';}
  AppState.save();renderProcurement();showToast('Log entry moved to Trash','warning');
}

// ── ADD / EDIT PROCUREMENT MODAL ───────────────────────────
function showAddProcurement(){showEditProcurement(null);}
function showEditProcurement(id){
  const p=id?(AppState.data.procurement||[]).find(x=>x.id===id):null;
  const isNew=!p;
  const _procLen=(AppState.data.procurement||[]).length+1;
  const nextId='PO-'+String(_procLen).padStart(3,'0');
  const nextReqId='REQ-'+String(_procLen).padStart(3,'0');
  const user=_currentUserProfile?.name||'';
  const isPOIssued=['po_issued','partial','delivered','invoiced','paid','closed'].includes(p?.status||'');
  const attachments=p?.attachments||[];

  $('#genericModalTitle').textContent=isNew?'New Purchase Request':'Edit — '+(p?.requestNumber||p?.id||'');
  $('#genericModalBody').innerHTML=`
  <div class="form-grid">
    <!-- Step indicators -->
    <div style="grid-column:1/-1;display:flex;gap:8px;padding:10px 12px;background:var(--bg-hover);border-radius:8px;margin-bottom:4px">
      ${[['#39d3f2','fa-file-alt','1','Request No.',p?.requestNumber||nextReqId],
         ['#bc8cff','fa-check-circle','2','PR No.',p?.prNumber||'—'],
         ['#388bfd','fa-shopping-cart','3','PO No.',p?.poNumber||(isNew?'Not yet awarded':'—')],
      ].map(([c,ic,n,l,v])=>`<div style="flex:1;text-align:center;padding:6px;border-radius:6px;border:1px solid ${c}44;background:${c}11">
        <div style="font-size:9px;font-weight:700;color:${c};letter-spacing:.5px">STEP ${n}</div>
        <div style="font-size:10px;font-weight:600;margin:2px 0">${l}</div>
        <div style="font-size:10px;font-family:var(--font-mono);color:${v==='—'?'var(--text-muted)':c}">${v}</div>
      </div>`).join('<div style="display:flex;align-items:center;color:var(--text-muted);font-size:12px">→</div>')}
    </div>

    <!-- Step 1 fields -->
    <div style="grid-column:1/-1;font-size:11px;font-weight:700;color:#39d3f2;padding:6px 0 2px;border-bottom:1px solid #39d3f244;margin-bottom:4px">
      <i class="fas fa-file-alt" style="margin-right:6px"></i>STEP 1 — REQUEST DETAILS
    </div>
    <div class="form-group">
      <label class="form-label">Request Number *</label>
      <input class="form-input" id="poReqNum" value="${p?.requestNumber||nextReqId}" placeholder="REQ-001">
    </div>
    <div class="form-group">
      <label class="form-label">Request Date *</label>
      <input class="form-input" type="date" id="poPRDate" value="${safeDate(p?.prDate||new Date().toISOString().split('T')[0])}">
    </div>
    <div class="form-group" style="grid-column:1/-1">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:4px">
        <label class="form-label" style="margin:0">Description / Scope of Work *</label>
        <button type="button" class="btn btn-secondary btn-sm" style="font-size:10px;padding:2px 8px" onclick="_procPickFromMaster()"><i class="fas fa-book-open" style="margin-right:4px"></i>Pick from Item Master</button>
      </div>
      <input class="form-input" id="poDesc" value="${(p?.description||'').replace(/"/g,'&quot;')}" placeholder="Full description — or pick from Item Master above">
      <div id="poItemMasterTag" style="margin-top:4px;font-size:10px;color:var(--accent-blue);display:${p?.itemMasterId?'flex':'none'};align-items:center;gap:6px">
        <i class="fas fa-link"></i><span id="poItemMasterLabel">${p?.itemMasterId?`Linked to Item Master: ${p.itemMasterId}`:''}</span>
        <button type="button" style="background:none;border:none;color:var(--accent-red);cursor:pointer;font-size:11px" onclick="document.getElementById('poItemMasterId').value='';document.getElementById('poItemMasterTag').style.display='none'"><i class="fas fa-times"></i></button>
      </div>
      <input type="hidden" id="poItemMasterId" value="${p?.itemMasterId||''}">
    </div>
    <div class="form-group">
      <label class="form-label">Category</label>
      <select class="form-select" id="poCat">${['Materials','Equipment','Services','Subcontract','Consumables','Other'].map(c=>`<option ${p?.category===c?'selected':''}>${c}</option>`).join('')}</select>
    </div>
    <div class="form-group">
      <label class="form-label">Project *</label>
      <select class="form-select" id="poProj">${(AppState.data.projects||[]).map(pr=>`<option value="${pr.id}" ${p?.projectId===pr.id?'selected':''}>${pr.id} — ${(pr.name||'').substring(0,25)}</option>`).join('')}</select>
    </div>
    <div class="form-group">
      <label class="form-label">Requested By</label>
      <input class="form-input" id="poReqBy" value="${p?.requestedBy||user}" placeholder="Name of requester">
    </div>
    <div class="form-group">
      <label class="form-label">Responsible Person</label>
      <input class="form-input" id="poResp" value="${p?.responsiblePerson||''}" placeholder="Person handling this request">
    </div>
    <div class="form-group">
      <label class="form-label">Priority</label>
      <select class="form-select" id="poPriority">${['critical','high','normal','low'].map(pr=>`<option value="${pr}" ${(p?.priority||'normal')===pr?'selected':''}>${pr}</option>`).join('')}</select>
    </div>
    <div class="form-group">
      <label class="form-label" style="color:var(--accent-amber)">
        <i class="fas fa-coins" style="margin-right:5px"></i>Budget Amount (₱) *
        <span style="font-size:9px;font-weight:400;color:var(--text-muted)"> — estimated cost</span>
      </label>
      <input class="form-input" type="number" id="poBudget" value="${p?.budgetAmount||0}" min="0" placeholder="Estimated budget" style="border-color:${!p?.budgetAmount?'var(--accent-amber)':''}">
    </div>
    <div class="form-group">
      <label class="form-label">Current Status</label>
      <select class="form-select" id="poStatus" onchange="procFormStatusChange(this.value)">${PROC_STAGES.map(s=>`<option value="${s.id}" ${(p?.status||'draft')===s.id?'selected':''}>${s.label}</option>`).join('')}</select>
    </div>

    <!-- Step 2 fields -->
    <div style="grid-column:1/-1;font-size:11px;font-weight:700;color:#bc8cff;padding:6px 0 2px;border-bottom:1px solid #bc8cff44;margin-top:6px;margin-bottom:4px">
      <i class="fas fa-check-circle" style="margin-right:6px"></i>STEP 2 — PURCHASE REQUEST (fill when PR approved)
    </div>
    <div class="form-group">
      <label class="form-label"><i class="fas fa-check-circle" style="color:#bc8cff;margin-right:5px"></i>PR Number</label>
      <input class="form-input" id="poPR" value="${p?.prNumber||''}" placeholder="PR-2025-001">
    </div>
    <div class="form-group">
      <label class="form-label">Vendor / Supplier</label>
      <input class="form-input" id="poVendor" value="${p?.vendor||''}" placeholder="Supplier name">
    </div>
    <div class="form-group">
      <label class="form-label">Payment Terms</label>
      <input class="form-input" id="poPayTerms" value="${p?.paymentTerms||''}" placeholder="e.g., 30 days net, COD, LC">
    </div>
    <div class="form-group">
      <label class="form-label">Delivery Address</label>
      <input class="form-input" id="poDelAddr" value="${p?.deliveryAddress||''}" placeholder="Site / warehouse address">
    </div>

    <!-- Step 3 fields — PO -->
    <div style="grid-column:1/-1;font-size:11px;font-weight:700;color:var(--accent-blue);padding:6px 0 2px;border-bottom:1px solid rgba(56,139,253,.3);margin-top:6px;margin-bottom:4px">
      <i class="fas fa-shopping-cart" style="margin-right:6px"></i>STEP 3 — PURCHASE ORDER (fill when PO is issued)
    </div>
    <div class="form-group">
      <label class="form-label"><i class="fas fa-shopping-cart" style="color:var(--accent-blue);margin-right:5px"></i>PO Number
        <span style="font-size:9px;font-weight:400;color:var(--text-muted)"> — assign when PO awarded to supplier</span>
      </label>
      <input class="form-input" id="poId" value="${isPOIssued?(p?.poNumber||''):isNew?'':(p?.poNumber||'')}" placeholder="e.g. PO-2025-001 — leave blank until awarded">
    </div>
    <div class="form-group">
      <label class="form-label" id="poAmountLabel" style="color:${isPOIssued?'var(--accent-green)':'var(--text-secondary)'}">
        <i class="fas fa-dollar-sign" style="margin-right:5px"></i>Contracted Amount (₱)
        <span id="poAmountReq" style="font-size:9px;color:${isPOIssued?'var(--accent-red)':''}">${isPOIssued?' *required':'— required when PO issued'}</span>
      </label>
      <input class="form-input" type="number" id="poAmount" value="${p?.amount||0}" min="0" placeholder="Final contracted amount">
    </div>
    <div class="form-group">
      <label class="form-label">PO Issue Date</label>
      <input class="form-input" type="date" id="poPODate" value="${safeDate(p?.poDate)}">
    </div>
    <div class="form-group">
      <label class="form-label">Expected Delivery Date</label>
      <input class="form-input" type="date" id="poDelDate" value="${safeDate(p?.deliveryDate)}">
    </div>

    <div class="form-group" style="grid-column:1/-1">
      <label class="form-label">Notes / Remarks</label>
      <textarea class="form-textarea" id="poNotes" style="min-height:60px" placeholder="Scope, conditions, special instructions...">${p?.notes||''}</textarea>
    </div>
  </div>

  <!-- Attachments section -->
  <div style="margin-top:14px;border-top:1px solid var(--border);padding-top:12px">
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px">
      <div style="font-size:13px;font-weight:600"><i class="fas fa-paperclip" style="color:var(--accent-amber);margin-right:7px"></i>Attachments <span style="font-size:11px;font-weight:400;color:var(--text-secondary)">(${attachments.length} file${attachments.length!==1?'s':''})</span></div>
      <button class="btn btn-secondary btn-sm" onclick="procAttachFile('${p?.id||'__new__'}')"><i class="fas fa-upload"></i> Attach File</button>
    </div>
    <div id="procAttachList" style="display:flex;flex-direction:column;gap:6px">
      ${attachments.length?attachments.map((a,i)=>`
      <div style="display:flex;align-items:center;gap:8px;padding:7px 10px;background:var(--bg-hover);border-radius:6px;border:1px solid var(--border)">
        <i class="fas ${a.type==='pdf'?'fa-file-pdf':a.type?.match(/doc/)?'fa-file-word':a.type?.match(/xls/)?'fa-file-excel':a.type?.match(/jpe?g|png/)?'fa-file-image':'fa-file-alt'}" style="color:var(--accent-amber);font-size:14px;flex-shrink:0"></i>
        <div style="flex:1;min-width:0">
          <div style="font-size:11px;font-weight:500;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${a.name}</div>
          <div style="font-size:9px;color:var(--text-muted)">${a.size||''} · ${a.uploadedAt||''} · ${a.uploadedBy||''}</div>
        </div>
        <button class="btn btn-success btn-sm btn-icon" onclick="procDownloadAttachment('${p?.id||'__new__'}',${i})" title="Download"><i class="fas fa-download"></i></button>
        <button class="btn btn-secondary btn-sm btn-icon" onclick="procViewAttachment('${p?.id||'__new__'}',${i})" title="View"><i class="fas fa-eye"></i></button>
        <button class="btn btn-danger btn-sm btn-icon" onclick="procRemoveAttachment('${p?.id||'__new__'}',${i})" title="Remove"><i class="fas fa-trash"></i></button>
      </div>`).join(''):
      `<div style="padding:10px;text-align:center;color:var(--text-muted);font-size:11px;background:var(--bg-hover);border-radius:6px;border:1px dashed var(--border)">
        <i class="fas fa-paperclip" style="font-size:18px;display:block;margin-bottom:5px;opacity:.4"></i>No attachments yet. Click "Attach File" to add documents, drawings, quotations, etc.
      </div>`}
    </div>
  </div>`;

  // Store temp attachments for new records
  if(isNew)window._procTempAttachments=[];

  $('#genericModalFooter').innerHTML=`
    <button class="btn btn-secondary" onclick="closeModal('genericModal')">Cancel</button>
    <button class="btn btn-primary" onclick="saveProcurement('${id||''}')"><i class="fas fa-save"></i> ${isNew?'Create Request':'Save Changes'}</button>`;
  openModal('genericModal');
}

function procFormStatusChange(val){
  const isPO=['po_issued','partial','delivered','invoiced','paid','closed'].includes(val);
  const lbl=document.getElementById('poAmountLabel');
  const req=document.getElementById('poAmountReq');
  const inp=document.getElementById('poAmount');
  if(lbl)lbl.style.color=isPO?'var(--accent-green)':'var(--text-secondary)';
  if(req){req.textContent=isPO?' * required':' — required when PO issued';req.style.color=isPO?'var(--accent-red)':'';}
  if(inp)inp.style.borderColor=isPO&&!(parseFloat(inp.value)>0)?'var(--accent-red)':'';
}

// ── Attachment helpers ──────────────────────────────────────
function procAttachFile(procId){
  const inp=document.createElement('input');inp.type='file';inp.multiple=true;
  inp.accept='.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.dwg,.dxf,.jpg,.jpeg,.png,.txt,.csv,.zip';
  inp.onchange=e=>{
    const files=Array.from(e.target.files);
    let processed=0;
    files.forEach(file=>{
      if(file.size>15*1024*1024){showToast(file.name+' too large (max 15MB)','error');processed++;return;}

      const reader=new FileReader();
      reader.onload=ev=>{
        const att={
          name:file.name,
          type:file.name.split('.').pop().toLowerCase(),
          size:file.size>=1048576?(file.size/1048576).toFixed(1)+' MB':(file.size/1024).toFixed(0)+' KB',
          data:ev.target.result,
          uploadedAt:new Date().toISOString().split('T')[0],
          uploadedBy:_currentUserProfile?.name||'User',
        };
        if(procId==='__new__'){
          if(!window._procTempAttachments)window._procTempAttachments=[];
          window._procTempAttachments.push(att);
        }else{
          const rec=(AppState.data.procurement||[]).find(x=>x.id===procId);
          if(rec){if(!rec.attachments)rec.attachments=[];rec.attachments.push(att);}
        }
        processed++;
        if(processed===files.length){
          // Refresh attachment list in modal without closing
          const listEl=document.getElementById('procAttachList');
          if(listEl){
            const allAtts=procId==='__new__'?(window._procTempAttachments||[]):((AppState.data.procurement||[]).find(x=>x.id===procId)?.attachments||[]);
            listEl.innerHTML=allAtts.map((a,i)=>`
            <div style="display:flex;align-items:center;gap:8px;padding:7px 10px;background:var(--bg-hover);border-radius:6px;border:1px solid var(--border)">
              <i class="fas ${a.type==='pdf'?'fa-file-pdf':a.type?.match(/doc/)?'fa-file-word':a.type?.match(/xls/)?'fa-file-excel':a.type?.match(/jpe?g|png/)?'fa-file-image':'fa-file-alt'}" style="color:var(--accent-amber);font-size:14px;flex-shrink:0"></i>
              <div style="flex:1;min-width:0"><div style="font-size:11px;font-weight:500;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${a.name}</div>
              <div style="font-size:9px;color:var(--text-muted)">${a.size||''} · ${a.uploadedAt||''}</div></div>
              <button class="btn btn-success btn-sm btn-icon" onclick="procDownloadAttachment('${procId}',${i})"><i class="fas fa-download"></i></button>
              <button class="btn btn-secondary btn-sm btn-icon" onclick="procViewAttachment('${procId}',${i})"><i class="fas fa-eye"></i></button>
              <button class="btn btn-danger btn-sm btn-icon" onclick="procRemoveAttachment('${procId}',${i})"><i class="fas fa-trash"></i></button>
            </div>`).join('');
          }
          if(procId!=='__new__')AppState.save();
          showToast(processed===1?'File attached':''+processed+' files attached','success');
        }
      };
      reader.readAsDataURL(file);
    });
  };
  inp.click();
}

function procGetAttachments(procId,idx){
  const list=procId==='__new__'?(window._procTempAttachments||[]):((AppState.data.procurement||[]).find(x=>x.id===procId)?.attachments||[]);
  return{list,att:list[idx]};
}

function procDownloadAttachment(procId,idx){
  const{att}=procGetAttachments(procId,idx);
  if(!att){showToast('Attachment not found','error');return;}
  const a=document.createElement('a');a.href=att.data;a.download=att.name;a.click();
}

function procViewAttachment(procId,idx){
  const{att}=procGetAttachments(procId,idx);
  if(!att){showToast('Attachment not found','error');return;}
  const win=window.open('','_blank');
  if(!win){showToast('Pop-up blocked — allow pop-ups','warning');return;}
  if(att.type==='pdf'){
    win.document.write(`<html><body style="margin:0"><embed src="${att.data}" type="application/pdf" width="100%" height="100%"></body></html>`);
  }else if(['jpg','jpeg','png','gif','webp'].includes(att.type)){
    win.document.write(`<html><body style="margin:0;background:#111;display:flex;align-items:center;justify-content:center;min-height:100vh"><img src="${att.data}" style="max-width:100%;max-height:100vh;object-fit:contain"></body></html>`);
  }else{
    win.document.write(`<html><body><p style="font-family:sans-serif"><strong>${att.name}</strong><br><a href="${att.data}" download="${att.name}">Click to download</a></p></body></html>`);
  }
}

function procRemoveAttachment(procId,idx){
  if(!confirm('Remove this attachment?'))return;
  if(procId==='__new__'){
    if(window._procTempAttachments)window._procTempAttachments.splice(idx,1);
  }else{
    const rec=(AppState.data.procurement||[]).find(x=>x.id===procId);
    if(rec&&rec.attachments)rec.attachments.splice(idx,1);
    AppState.save();
  }
  // Re-render attachment list
  const listEl=document.getElementById('procAttachList');
  if(listEl){
    const allAtts=procId==='__new__'?(window._procTempAttachments||[]):((AppState.data.procurement||[]).find(x=>x.id===procId)?.attachments||[]);
    if(!allAtts.length){listEl.innerHTML=`<div style="padding:10px;text-align:center;color:var(--text-muted);font-size:11px;background:var(--bg-hover);border-radius:6px;border:1px dashed var(--border)"><i class="fas fa-paperclip" style="font-size:18px;display:block;margin-bottom:5px;opacity:.4"></i>No attachments yet.</div>`;return;}
    listEl.innerHTML=allAtts.map((a,i)=>`
    <div style="display:flex;align-items:center;gap:8px;padding:7px 10px;background:var(--bg-hover);border-radius:6px;border:1px solid var(--border)">
      <i class="fas ${a.type==='pdf'?'fa-file-pdf':a.type?.match(/doc/)?'fa-file-word':a.type?.match(/xls/)?'fa-file-excel':a.type?.match(/jpe?g|png/)?'fa-file-image':'fa-file-alt'}" style="color:var(--accent-amber);font-size:14px;flex-shrink:0"></i>
      <div style="flex:1;min-width:0"><div style="font-size:11px;font-weight:500;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${a.name}</div>
      <div style="font-size:9px;color:var(--text-muted)">${a.size||''} · ${a.uploadedAt||''}</div></div>
      <button class="btn btn-success btn-sm btn-icon" onclick="procDownloadAttachment('${procId}',${i})"><i class="fas fa-download"></i></button>
      <button class="btn btn-secondary btn-sm btn-icon" onclick="procViewAttachment('${procId}',${i})"><i class="fas fa-eye"></i></button>
      <button class="btn btn-danger btn-sm btn-icon" onclick="procRemoveAttachment('${procId}',${i})"><i class="fas fa-trash"></i></button>
    </div>`).join('');
  }
  showToast('Attachment removed','warning');
}

function _procPickFromMaster(){
  const mats=(AppState.data.materials||[]).filter(m=>!m._deleted);
  const cons=(AppState.data.consumables||[]).filter(c=>!c._deleted);
  const all=[...mats.map(m=>({...m,_type:'materials'})),...cons.map(c=>({...c,_type:'consumables'}))];
  const html=`
  <div class="modal-overlay open" data-dynamic="1" id="procMasterPickModal">
    <div class="modal" style="max-width:540px">
      <div class="modal-header">
        <div class="modal-title"><i class="fas fa-book-open" style="color:var(--accent-blue);margin-right:8px"></i>Pick from Item Master</div>
        <button class="modal-close" onclick="closeModal('procMasterPickModal')"><i class="fas fa-times"></i></button>
      </div>
      <div class="modal-body">
        <div style="font-size:11px;color:var(--text-secondary);margin-bottom:8px">Select an item to pre-fill description, unit, and standard cost. You can still edit the description freely after.</div>
        <input class="form-control" placeholder="Search…" oninput="
          const q=this.value.toLowerCase();
          document.querySelectorAll('#procMasterList .pm-row').forEach(r=>{r.style.display=r.dataset.name.includes(q)?'':'none';});
        " style="margin-bottom:10px">
        <div id="procMasterList" style="max-height:300px;overflow-y:auto;border:1px solid var(--border);border-radius:6px">
          ${all.length?all.map(item=>`
          <div class="pm-row" data-name="${(item.name||'').toLowerCase()}" style="padding:10px 14px;border-bottom:1px solid var(--border);cursor:pointer;display:flex;align-items:center;gap:10px"
            onclick="_procApplyMasterItem('${item.id}','${(item.name||'').replace(/'/g,'\\\'').replace(/"/g,'&quot;')}','${item.unit||''}',${item.unitCost||0},'${item.category||'Materials'}')">
            <div style="flex:1">
              <div style="font-weight:600;font-size:12px">${item.name}</div>
              <div style="font-size:10px;color:var(--text-secondary)">${item.id} · ${item.category||'—'} · ${item.unit||'—'} · Std Cost: ₱${fmtNum(item.unitCost||0)}</div>
            </div>
            <i class="fas fa-chevron-right" style="color:var(--text-secondary)"></i>
          </div>`).join(''):`<div class="empty-state" style="padding:24px"><i class="fas fa-book-open"></i><p>No items in Item Master.<br>Add materials/consumables in Asset Masterlist first.</p></div>`}
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" onclick="closeModal('procMasterPickModal')">Cancel — keep free text</button>
      </div>
    </div>
  </div>`;
  document.body.insertAdjacentHTML('beforeend',html);
}

function _procApplyMasterItem(itemId, name, unit, stdCost, category){
  const descEl=$('#poDesc');
  if(descEl) descEl.value=name+(unit?' ('+unit+')':'');
  const catEl=$('#poCat');
  if(catEl) catEl.value=['Materials','Consumables'].includes(category)?category:'Materials';
  const budgetEl=$('#poBudget');
  if(budgetEl&&(!budgetEl.value||budgetEl.value==='0'))budgetEl.value=stdCost>0?stdCost:'';
  // Store link
  const hiddenEl=$('#poItemMasterId');
  if(hiddenEl) hiddenEl.value=itemId;
  const tagEl=$('#poItemMasterTag');
  if(tagEl) tagEl.style.display='flex';
  const labelEl=$('#poItemMasterLabel');
  if(labelEl) labelEl.textContent=`Linked to Item Master: ${itemId} — ${name}`;
  closeModal('procMasterPickModal');
  showToast('Item Master item applied — edit description freely','success',3000);
}

function saveProcurement(id){
  const desc=$('#poDesc')?.value?.trim();
  const budget=parseFloat($('#poBudget')?.value)||0;
  const amt=parseFloat($('#poAmount')?.value)||0;
  const newStatus=$('#poStatus')?.value||'draft';
  const isPOStage=['po_issued','partial','delivered','invoiced','paid','closed'].includes(newStatus);

  const _reqIds=['poDesc','poBudget'];
  if(isPOStage)_reqIds.push('poAmount');
  if(!_req(_reqIds)){showToast('Fill in required fields','error');return;}

  let oldStatus='draft';
  const rec={
    id:id||$('#poId')?.value?.trim()||'PO-'+Date.now().toString().slice(-5),
    requestNumber:$('#poReqNum')?.value?.trim()||'',
    prNumber:$('#poPR')?.value?.trim()||'',
    poNumber:(()=>{
      const poVal=$('#poId')?.value?.trim()||'';
      const status=$('#poStatus')?.value||'draft';
      const isPoStage=['po_issued','partial','delivered','invoiced','paid','closed'].includes(status);
      // Only save a PO number if explicitly entered AND we're at PO stage or editing existing
      if(poVal&&poVal!==nextId)return poVal;
      if(isPoStage&&!poVal)return nextId; // auto-assign when PO is issued with no number entered
      return p?.poNumber||''; // keep existing, or blank for new PRs
    })(),
    description:desc,
    category:$('#poCat')?.value||'Materials',
    projectId:$('#poProj')?.value||'',
    vendor:$('#poVendor')?.value||'',
    budgetAmount:budget,
    amount:amt,
    priority:$('#poPriority')?.value||'normal',
    status:newStatus,
    requestedBy:$('#poReqBy')?.value||'',
    responsiblePerson:$('#poResp')?.value||'',
    prDate:$('#poPRDate')?.value||'',
    poDate:$('#poPODate')?.value||'',
    deliveryDate:$('#poDelDate')?.value||'',
    paymentTerms:$('#poPayTerms')?.value||'',
    deliveryAddress:$('#poDelAddr')?.value||'',
    notes:$('#poNotes')?.value||'',
    itemMasterId:$('#poItemMasterId')?.value||null,
  };

  // Budget check — warn if PO budget would exceed allocation for linked project
  if(rec.projectId&&(rec.category==='Materials'||rec.category==='Consumables')){
    const allocBudget=(AppState.data.resourceAllocations||[])
      .filter(a=>!a._deleted&&a.projectId===rec.projectId&&(rec.category==='Materials'?a.resourceType==='Material':a.resourceType==='Consumable'))
      .reduce((s,a)=>s+(a.plannedCost||0),0);
    const committed=(AppState.data.procurement||[])
      .filter(po=>!po._deleted&&po.projectId===rec.projectId&&po.category===rec.category&&po.status!=='cancelled'&&po.id!==rec.id)
      .reduce((s,po)=>s+(po.budgetAmount||0),0);
    const projected=committed+rec.budgetAmount;
    if(allocBudget>0&&projected>allocBudget){
      const over=projected-allocBudget;
      if(!confirm(`⚠️ Budget Overrun Warning\n\n${rec.category} allocation budget: ₱${fmtNum(allocBudget)}\nAlready committed: ₱${fmtNum(committed)}\nThis PO adds: ₱${fmtNum(rec.budgetAmount)}\nProjected total: ₱${fmtNum(projected)} (over by ₱${fmtNum(over)})\n\nProceed with saving anyway?`))return;
    }
  }

  if(!AppState.data.procurement)AppState.data.procurement=[];
  const existing=(AppState.data.procurement||[]).findIndex(x=>x.id===id);
  if(existing>=0){
    oldStatus=AppState.data.procurement[existing].status||'draft';
    // Preserve existing attachments and merge temp if any
    const existingAtts=AppState.data.procurement[existing].attachments||[];
    rec.attachments=existingAtts;
    AppState.data.procurement[existing]={...AppState.data.procurement[existing],...rec};
  }else{
    // New record — attach temp files
    rec.attachments=window._procTempAttachments||[];
    window._procTempAttachments=[];
    AppState.data.procurement.push(rec);
    oldStatus='';
  }
  AppState.save();

  if(!id){
    addProcLog(rec.id,{
      action:'Request Created',stageBefore:'',stageAfter:newStatus,
      by:rec.requestedBy||(_currentUserProfile?.name||''),
      remarks:'Budget: ₱'+budget.toLocaleString()+(rec.notes?'\n'+rec.notes:''),
    });
  }else if(oldStatus!==newStatus){
    addProcLog(rec.id,{
      action:'Status changed to: '+getProcStage(newStatus).label,
      stageBefore:oldStatus,stageAfter:newStatus,
      by:_currentUserProfile?.name||'',
      remarks:isPOStage&&amt?'PO Amount: ₱'+amt.toLocaleString():'',
    });
  }

  if(typeof fireWebhook==='function'&&newStatus==='po_issued'&&oldStatus!==newStatus)
    fireWebhook('po_approved',{poNumber:rec.poNumber||rec.id,vendor:rec.vendor,projectId:rec.projectId,amount:rec.amount,description:rec.description});
  closeModal('genericModal');
  renderProcurement();
  showToast(id?'Record updated':'Request created — REQ: '+rec.requestNumber,'success');
}

function deleteProcurement(id){
  if(!confirm('Delete this procurement record and all its logs? They will be moved to Trash.'))return;
  const now=new Date().toISOString();
  const by=(typeof _currentUserProfile!=='undefined')?(_currentUserProfile?.name||_currentUserProfile?.email||'unknown'):'unknown';
  const rec=(AppState.data.procurement||[]).find(x=>x.id===id);
  if(rec){rec._deleted=true;rec._deletedAt=now;rec._deletedBy=by;}
  (AppState.data.procurementLogs||[]).filter(l=>l.procId===id).forEach(l=>{l._deleted=true;l._deletedAt=now;l._deletedBy=by;});
  AppState.save();renderProcurement();showToast('Moved to Trash','warning');
}

function exportProcurementCSV(){
  const proc=AppState.data.procurement||[];
  const logs=AppState.data.procurementLogs||[];
  exportCSV(
    proc.map(p=>{
      const lastLog=logs.filter(l=>l.procId===p.id).slice(-1)[0];
      return[p.requestNumber||'',p.prNumber||'',p.poNumber||'',p.description,p.category,p.projectId,p.vendor||'',p.amount||0,p.budgetAmount||0,p.priority||'normal',p.status||'draft',p.requestedBy||'',p.responsiblePerson||'',p.prDate||'',p.poDate||'',p.deliveryDate||'',p.paymentTerms||'',p.notes||'',lastLog?lastLog.action:'',lastLog?lastLog.date:'',lastLog?lastLog.by:''];
    }),
    ['RequestNumber','PRNumber','PONumber','Description','Category','ProjectID','Vendor','Amount','BudgetAmount','Priority','Status','RequestedBy','ResponsiblePerson','PRDate','PODate','DeliveryDate','PaymentTerms','Notes','LastAction','LastActionDate','LastActionBy'],
    'procurement.csv'
  );
}


