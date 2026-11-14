/* ============================================================================
   COST BUDGET BY CATEGORY  (top-down cost-control sheet)
   Mirrors the standard SY3 project cost sheet: one budget figure per main
   cost category, with Actual auto-rolled from existing modules where possible
   (manual for the rest), Variance = Budget − Actual, % = Variance ÷ Budget,
   and a NET INCOME BASED ON TOTAL DIRECT COST total row.
   Rendered as a panel at the top of the Cost Control tab.
   Entity:  AppState.data.costBudgets  (map: projectId → {rows:[...], _lastModified})
   ========================================================================== */

/* ---- the standard 12 categories (editable per project) ----
   src = which module feeds the Actual column automatically ('' = manual only) */
function _cbStandard(){
  return [
    {id:'mobilization',  label:'Mobilization',   src:'mob'},
    {id:'demobilization',label:'Demobilization', src:'demob'},
    {id:'labor',         label:'Labor',          src:'labor'},
    {id:'accommodation', label:'Accommodation',  src:''},
    {id:'transpo',       label:'Transpo',        src:''},
    {id:'requirements',  label:'Requirements',   src:''},
    {id:'admin',         label:'Admin Cost',     src:''},
    {id:'thirdparty',    label:'Third Party',    src:'thirdparty'},
    {id:'insurances',    label:'Insurances',     src:''},
    {id:'materials',     label:'Materials',      src:'materials'},
    {id:'ppe',           label:'PPE',            src:'ppe'},
    {id:'tools',         label:'Tools',          src:'tools'},
  ];
}
const _CB_SRC_LABEL={
  mob:'Mob. allocations', demob:'Demob. allocations', labor:'Daily Manpower Log',
  thirdparty:'Procurement allocations', materials:'Material allocations',
  ppe:'PPE allocations', tools:'Tool allocations'
};

/* ---- storage: get/create the per-project record ---- */
function _cbRecord(pid){
  if(!AppState.data.costBudgets)AppState.data.costBudgets={};
  let rec=AppState.data.costBudgets[pid];
  if(!rec){
    rec=AppState.data.costBudgets[pid]={
      rows:_cbStandard().map(c=>({id:c.id,label:c.label,src:c.src,budget:0,actualMode:(c.src?'auto':'manual'),actualManual:0})),
      _lastModified:new Date().toISOString()
    };
  }
  return rec;
}
function _cbRows(pid){ return _cbRecord(pid).rows; }
function _cbTouch(pid){ _cbRecord(pid)._lastModified=new Date().toISOString(); }

/* ---- auto-rolled actual for a source key ---- */
function _cbSumAllocCat(pid,catId,filterFn){
  return (AppState.data.resourceAllocations||[])
    .filter(a=>a.projectId===pid && !a._deleted && (typeof getAllocCat==='function') && getAllocCat(a).id===catId && (filterFn?filterFn(a):true))
    .reduce((s,a)=>s+(Number(a.actualCost)||0),0);
}
function _cbAuto(pid,src){
  switch(src){
    case 'labor':{
      // prefer the Daily Manpower Log (manual total overrides computed-from-rates)
      const man=(AppState.data.mplManualCost||{})[pid];
      if(man!=null) return +man;
      const logs=(AppState.data.manpowerLogs||[]).filter(e=>e.projectId===pid&&!e._deleted);
      if(logs.length && typeof _mplEntryCost==='function') return logs.reduce((s,e)=>s+_mplEntryCost(e),0);
      return _cbSumAllocCat(pid,'manpower');
    }
    case 'materials':  return _cbSumAllocCat(pid,'cons_mat');
    case 'tools':      return _cbSumAllocCat(pid,'tools');
    case 'ppe':        return _cbSumAllocCat(pid,'ppe');
    case 'mob':        return _cbSumAllocCat(pid,'mob_demob',a=>/mobiliz/i.test(a.resourceName||'')&&!/demob/i.test(a.resourceName||''));
    case 'demob':      return _cbSumAllocCat(pid,'mob_demob',a=>/demob/i.test(a.resourceName||''));
    case 'thirdparty': return _cbSumAllocCat(pid,'procurement');
    default:           return 0;
  }
}
/* itemized line items under a row (specific charges) */
function _cbItems(r){ return Array.isArray(r&&r.items)?r.items:[]; }
function _cbItemsTotal(r){ return _cbItems(r).reduce((s,it)=>s+(Number(it.amount)||0),0); }
/* actual actually used for a row.
   Priority: itemized line items (sum) → manual value → auto-rolled from a module. */
function _cbActual(pid,r){
  if(_cbItems(r).length) return _cbItemsTotal(r);
  if(r.actualMode==='manual' || !r.src) return Number(r.actualManual)||0;
  return _cbAuto(pid,r.src);
}
function _cbMoney(n){ return '₱'+(Number(n)||0).toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2}); }
function _cbPct(bud,v){ return bud>0? (v/bud*100):0; }

/* ============================ PANEL RENDER ============================ */
/* returns an HTML string; embedded at the top of the Cost Control tab */
function renderCostBudgetPanel(pid){
  const rows=_cbRows(pid);
  const seeB=(typeof canSeeBudget==='function')?canSeeBudget():true;
  if(!seeB) return _cbPanelMasked(pid,rows);
  let totB=0,totA=0;
  const body=rows.map(r=>{
    const bud=Number(r.budget)||0;
    const act=_cbActual(pid,r);
    const v=bud-act; const pct=_cbPct(bud,v);
    totB+=bud; totA+=act;
    const items=_cbItems(r); const hasItems=items.length>0;
    const isAuto=(r.src && r.actualMode!=='manual');
    let actCell;
    if(hasItems){
      // actual comes from the itemized charges — show the sum + link to manage them
      actCell=`<span class="cb-auto" style="color:var(--text-primary)" title="Sum of ${items.length} itemized charge(s)">${_cbMoney(act)}</span>
        <button class="cb-link" onclick="showCbItems('${pid}','${r.id}')" title="View / edit the itemized charges"><i class="fas fa-list-ul" style="font-size:9px"></i> ${items.length} item${items.length>1?'s':''}</button>`;
    } else if(isAuto){
      actCell=`<span class="cb-auto" title="Auto from ${_CB_SRC_LABEL[r.src]||'module'}">${_cbMoney(act)}</span>
        <button class="cb-link" onclick="_cbSetMode('${pid}','${r.id}','manual')" title="Enter actual manually">override</button>
        <button class="cb-link" onclick="showCbItems('${pid}','${r.id}')" title="Break down into specific charges">itemize</button>`;
    } else {
      actCell=`<input class="form-input cb-in" type="number" step="0.01" value="${act||''}" placeholder="0.00"
           oninput="_cbSetActual('${pid}','${r.id}',this.value)" onchange="_cbReRender('${pid}')">
        ${r.src?`<button class="cb-link" onclick="_cbSetMode('${pid}','${r.id}','auto')" title="Auto from ${_CB_SRC_LABEL[r.src]||'module'}">auto</button>`:''}
        <button class="cb-link" onclick="showCbItems('${pid}','${r.id}')" title="Break down into specific charges">itemize</button>`;
    }
    return `<tr>
      <td class="cb-part">${esc(r.label)}${r.src?`<span class="cb-srctag">${_CB_SRC_LABEL[r.src]||''}</span>`:''}</td>
      <td class="cb-r"><input class="form-input cb-in" type="number" step="0.01" value="${bud||''}" placeholder="0.00"
            oninput="_cbSetBudget('${pid}','${r.id}',this.value)" onchange="_cbReRender('${pid}')"></td>
      <td class="cb-r">${actCell}</td>
      <td class="cb-r cb-mono" style="color:${v>=0?'var(--accent-green)':'var(--accent-red)'}">${v<0?'('+_cbMoney(Math.abs(v)).replace('₱','')+')':_cbMoney(v)}</td>
      <td class="cb-r cb-mono" style="color:${pct>=0?'var(--accent-green)':'var(--accent-red)'}">${pct.toFixed(2)}%</td>
      <td class="cb-r"><button class="btn btn-secondary btn-sm btn-icon" onclick="_cbRename('${pid}','${r.id}')" title="Rename"><i class="fas fa-pen"></i></button>
          <button class="btn btn-secondary btn-sm btn-icon" onclick="_cbRemove('${pid}','${r.id}')" title="Remove"><i class="fas fa-trash"></i></button></td>
    </tr>`;
  }).join('');
  const totV=totB-totA; const totPct=_cbPct(totB,totV);

  return `
  <style>
    .cb-wrap{font-size:12px;margin-bottom:16px}
    .cb-tbl{width:100%;border-collapse:collapse}
    .cb-tbl th{background:var(--bg-hover,rgba(255,255,255,.04));text-align:left;padding:8px 10px;font-size:10px;text-transform:uppercase;letter-spacing:.4px;color:var(--text-muted);border-bottom:2px solid var(--border-subtle,rgba(255,255,255,.12));white-space:nowrap}
    .cb-tbl td{padding:5px 10px;border-bottom:1px solid var(--border-subtle,rgba(255,255,255,.06))}
    .cb-tbl th.cb-r,.cb-tbl td.cb-r{text-align:right}
    .cb-part{font-weight:600}
    .cb-srctag{display:block;font-size:9px;font-weight:400;color:var(--text-muted)}
    .cb-mono{font-family:var(--font-mono)}
    .cb-in{height:28px;width:130px;font-family:var(--font-mono);font-size:11.5px;text-align:right;display:inline-block}
    .cb-auto{font-family:var(--font-mono);font-size:11.5px;color:var(--accent-cyan)}
    .cb-link{background:none;border:none;color:var(--text-muted);font-size:9.5px;cursor:pointer;text-decoration:underline;margin-left:5px;padding:0}
    .cb-link:hover{color:var(--accent-cyan)}
    .cb-net td{font-weight:800;border-top:2px solid var(--border-subtle,rgba(255,255,255,.2));background:var(--bg-hover,rgba(255,255,255,.05));padding:10px}
    .cb-net .cb-lbl{color:var(--accent-amber)}
    .cb-note{font-size:10px;color:var(--text-muted);margin-top:7px}
  </style>
  <div class="card cb-wrap">
    <div class="section-header" style="margin-bottom:10px">
      <div class="section-title"><i class="fas fa-funnel-dollar" style="margin-right:7px;color:var(--accent-cyan)"></i>Budget by Category <span style="font-size:11px;font-weight:400;color:var(--text-secondary)">— type the budget per main cost category; actual auto-rolls where tracked</span></div>
      <div style="display:flex;gap:6px">
        <button class="btn btn-secondary btn-sm" onclick="exportCostBudget('${pid}')"><i class="fas fa-download"></i> Export</button>
        <button class="btn btn-secondary btn-sm" onclick="_cbResetStandard('${pid}')" title="Reset to the standard 12 categories"><i class="fas fa-rotate-left"></i> Standard</button>
        <button class="btn btn-primary btn-sm" onclick="_cbAddCategory('${pid}')"><i class="fas fa-plus"></i> Category</button>
      </div>
    </div>
    <div class="table-wrap"><table class="cb-tbl">
      <thead><tr><th>Particular</th><th class="cb-r">Budget</th><th class="cb-r">Actual Cost</th><th class="cb-r">Variance</th><th class="cb-r">%</th><th class="cb-r"></th></tr></thead>
      <tbody>
        ${body||'<tr><td colspan="6" style="text-align:center;color:var(--text-muted);padding:18px">No categories. Click “Standard” to load the standard 12.</td></tr>'}
        <tr class="cb-net">
          <td class="cb-lbl">NET INCOME BASED ON TOTAL DIRECT COST</td>
          <td class="cb-r cb-mono">${_cbMoney(totB)}</td>
          <td class="cb-r cb-mono">${_cbMoney(totA)}</td>
          <td class="cb-r cb-mono" style="color:${totV>=0?'var(--accent-green)':'var(--accent-red)'}">${totV<0?'('+_cbMoney(Math.abs(totV)).replace('₱','')+')':_cbMoney(totV)}</td>
          <td class="cb-r cb-mono" style="color:${totPct>=0?'var(--accent-green)':'var(--accent-red)'}">${totPct.toFixed(2)}%</td>
          <td></td>
        </tr>
      </tbody>
    </table></div>
    <div class="cb-note">Variance = Budget − Actual (positive = under budget / saved). % = Variance ÷ Budget. Auto actuals: Labor ← Daily Manpower Log; Materials/Tools/PPE/Mobilization/Demobilization/Third Party ← Resource Allocation actuals. Click <b>override</b> to type the actual yourself, or <b>itemize</b> to break a category into specific charges (their sum becomes the actual).</div>
  </div>`;
}

/* ---- masked panel for NON-CONFIDENTIAL users ----
   Category names and structure stay visible; every peso figure is hidden and
   the sheet is read-only (no editing, itemize or export of amounts). */
function _cbPanelMasked(pid,rows){
  const M='₱ ••••••';
  const body=rows.map(r=>`<tr>
      <td class="cb-part">${esc(r.label)}${r.src?`<span class="cb-srctag">${_CB_SRC_LABEL[r.src]||''}</span>`:''}</td>
      <td class="cb-r"><span class="cb-mask">${M}</span></td>
      <td class="cb-r"><span class="cb-mask">${M}</span></td>
      <td class="cb-r"><span class="cb-mask">••••</span></td>
      <td class="cb-r"><span class="cb-mask">••%</span></td>
      <td class="cb-r"></td>
    </tr>`).join('');
  return `
  <style>
    .cb-wrap{font-size:12px;margin-bottom:16px}
    .cb-tbl{width:100%;border-collapse:collapse}
    .cb-tbl th{background:var(--bg-hover,rgba(255,255,255,.04));text-align:left;padding:8px 10px;font-size:10px;text-transform:uppercase;letter-spacing:.4px;color:var(--text-muted);border-bottom:2px solid var(--border-subtle,rgba(255,255,255,.12));white-space:nowrap}
    .cb-tbl td{padding:5px 10px;border-bottom:1px solid var(--border-subtle,rgba(255,255,255,.06))}
    .cb-tbl th.cb-r,.cb-tbl td.cb-r{text-align:right}
    .cb-part{font-weight:600}
    .cb-srctag{display:block;font-size:9px;font-weight:400;color:var(--text-muted)}
    .cb-mask{font-family:var(--font-mono);font-size:11.5px;color:var(--text-muted);letter-spacing:1.5px;user-select:none}
    .cb-net td{font-weight:800;border-top:2px solid var(--border-subtle,rgba(255,255,255,.2));background:var(--bg-hover,rgba(255,255,255,.05));padding:10px}
    .cb-net .cb-lbl{color:var(--accent-amber)}
    .cb-note{font-size:10px;color:var(--text-muted);margin-top:7px}
    .cb-lock{display:inline-flex;align-items:center;gap:6px;font-size:10px;font-weight:600;color:var(--accent-amber);background:rgba(240,164,80,.12);border:1px solid rgba(240,164,80,.3);border-radius:6px;padding:3px 9px}
  </style>
  <div class="card cb-wrap">
    <div class="section-header" style="margin-bottom:10px">
      <div class="section-title"><i class="fas fa-funnel-dollar" style="margin-right:7px;color:var(--accent-cyan)"></i>Budget by Category</div>
      <span class="cb-lock"><i class="fas fa-lock"></i> Confidential — budget figures hidden</span>
    </div>
    <div class="table-wrap"><table class="cb-tbl">
      <thead><tr><th>Particular</th><th class="cb-r">Budget</th><th class="cb-r">Actual Cost</th><th class="cb-r">Variance</th><th class="cb-r">%</th><th class="cb-r"></th></tr></thead>
      <tbody>
        ${body||'<tr><td colspan="6" style="text-align:center;color:var(--text-muted);padding:18px">No categories.</td></tr>'}
        <tr class="cb-net">
          <td class="cb-lbl">NET INCOME BASED ON TOTAL DIRECT COST</td>
          <td class="cb-r"><span class="cb-mask">${M}</span></td>
          <td class="cb-r"><span class="cb-mask">${M}</span></td>
          <td class="cb-r"><span class="cb-mask">••••</span></td>
          <td class="cb-r"><span class="cb-mask">••%</span></td>
          <td></td>
        </tr>
      </tbody>
    </table></div>
    <div class="cb-note"><i class="fas fa-info-circle" style="margin-right:4px"></i>Budget amounts are restricted to confidential users. Ask an administrator for access if you need to view these figures.</div>
  </div>`;
}

/* ============================ EDIT HANDLERS ============================ */
function _cbReRender(pid){
  // the panel lives inside the Cost Control tab — re-render the whole tab
  if(typeof renderDetailCostControl==='function' && detailProjectId===pid){
    setTimeout(()=>renderDetailCostControl(),120);
  }
}
function _cbFind(pid,rowId){ return _cbRows(pid).find(r=>r.id===rowId); }
function _cbSetBudget(pid,rowId,val){ const r=_cbFind(pid,rowId); if(r){ r.budget=+val||0; _cbTouch(pid); AppState.save(); } }
function _cbSetActual(pid,rowId,val){ const r=_cbFind(pid,rowId); if(r){ r.actualManual=+val||0; r.actualMode='manual'; _cbTouch(pid); AppState.save(); } }
function _cbSetMode(pid,rowId,mode){
  const r=_cbFind(pid,rowId);
  if(r){ if(mode==='manual' && r.actualMode!=='manual'){ r.actualManual=_cbAuto(pid,r.src); } r.actualMode=mode; _cbTouch(pid); AppState.save(); _cbReRender(pid); }
}
function _cbAddCategory(pid){
  const name=(prompt('New cost category name:')||'').trim();
  if(!name)return;
  const rows=_cbRows(pid);
  rows.push({id:'cb-'+Date.now().toString(36)+'-'+Math.floor(Math.random()*1000),label:name,src:'',budget:0,actualMode:'manual',actualManual:0});
  _cbTouch(pid); AppState.save(); _cbReRender(pid);
  if(typeof showToast==='function')showToast('Category added','success');
}
function _cbRename(pid,rowId){
  const r=_cbFind(pid,rowId); if(!r)return;
  const name=(prompt('Rename category:',r.label)||'').trim();
  if(!name)return;
  r.label=name; _cbTouch(pid); AppState.save(); _cbReRender(pid);
}
function _cbRemove(pid,rowId){
  const r=_cbFind(pid,rowId); if(!r)return;
  if(!confirm('Remove category "'+r.label+'" from this project\'s budget sheet?'))return;
  const rows=_cbRows(pid); const i=rows.findIndex(x=>x.id===rowId);
  if(i>=0)rows.splice(i,1);
  _cbTouch(pid); AppState.save(); _cbReRender(pid);
  if(typeof showToast==='function')showToast('Category removed','warning');
}
function _cbResetStandard(pid){
  if(!confirm('Reset to the standard 12 categories? Budgets you typed for non-standard categories will be removed (standard-category budgets are kept).'))return;
  const existing={}; _cbRows(pid).forEach(r=>{existing[r.id]={budget:r.budget,actualMode:r.actualMode,actualManual:r.actualManual};});
  _cbRecord(pid).rows=_cbStandard().map(c=>{
    const e=existing[c.id]||{};
    return {id:c.id,label:c.label,src:c.src,budget:e.budget||0,actualMode:e.actualMode||(c.src?'auto':'manual'),actualManual:e.actualManual||0};
  });
  _cbTouch(pid); AppState.save(); _cbReRender(pid);
  if(typeof showToast==='function')showToast('Reset to standard categories','success');
}
/* ============================ ITEMIZED CHARGES (per category) ============================ */
function showCbItems(pid,rowId){
  if(typeof canSeeBudget==='function' && !canSeeBudget()){
    if(typeof showToast==='function')showToast('Budget figures are confidential.','error');
    return;
  }
  const r=_cbFind(pid,rowId); if(!r)return;
  if(!Array.isArray(r.items))r.items=[];
  $('#genericModalTitle').textContent='Itemized Charges — '+r.label;
  $('#genericModalBody').innerHTML=_cbItemsBody(pid,rowId);
  $('#genericModalFooter').innerHTML=`<button class="btn btn-primary" onclick="closeModal('genericModal');_cbReRender('${pid}')"><i class="fas fa-check"></i> Done</button>`;
  openModal('genericModal');
}
function _cbItemsBody(pid,rowId){
  const r=_cbFind(pid,rowId); const items=_cbItems(r); const tot=_cbItemsTotal(r);
  const rows=items.map(it=>`<tr>
    <td style="padding:4px 6px"><input class="form-input" type="date" value="${it.date||''}" style="height:28px;font-size:11px" onchange="_cbItemSet('${pid}','${rowId}','${it.id}','date',this.value)"></td>
    <td style="padding:4px 6px"><input class="form-input" value="${esc(it.desc||'')}" placeholder="e.g., Hotel — 5 rooms × 10 nights" style="height:28px;font-size:11px;min-width:180px" oninput="_cbItemSet('${pid}','${rowId}','${it.id}','desc',this.value)"></td>
    <td style="padding:4px 6px"><input class="form-input" value="${esc(it.ref||'')}" placeholder="Vendor / PO / ref" style="height:28px;font-size:11px;min-width:120px" oninput="_cbItemSet('${pid}','${rowId}','${it.id}','ref',this.value)"></td>
    <td style="padding:4px 6px"><input class="form-input" type="number" step="0.01" value="${it.amount||''}" placeholder="0.00" style="height:28px;font-size:11px;width:120px;text-align:right;font-family:var(--font-mono)" oninput="_cbItemSet('${pid}','${rowId}','${it.id}','amount',this.value)" onchange="_cbItemsRefresh('${pid}','${rowId}')"></td>
    <td style="padding:4px 6px"><button class="btn btn-secondary btn-sm btn-icon" onclick="_cbItemDel('${pid}','${rowId}','${it.id}')" title="Remove"><i class="fas fa-trash"></i></button></td>
  </tr>`).join('');
  return `
    <div style="font-size:11.5px;color:var(--text-secondary);margin-bottom:10px">Record each specific charge under <b>${esc(r.label)}</b>. Their total becomes this category's Actual Cost on the budget sheet.</div>
    <div class="table-wrap"><table style="width:100%;border-collapse:collapse;font-size:11.5px">
      <thead><tr style="color:var(--text-muted);font-size:10px;text-transform:uppercase">
        <th style="text-align:left;padding:5px 6px">Date</th><th style="text-align:left;padding:5px 6px">Description</th>
        <th style="text-align:left;padding:5px 6px">Vendor / Ref</th><th style="text-align:right;padding:5px 6px">Amount</th><th style="padding:5px 6px"></th>
      </tr></thead>
      <tbody id="cbItemsRows">
        ${rows||'<tr><td colspan="5" style="text-align:center;color:var(--text-muted);padding:16px">No items yet. Click “Add item”.</td></tr>'}
        <tr style="border-top:2px solid var(--border-subtle,rgba(255,255,255,.15));font-weight:700">
          <td colspan="3" style="padding:7px 6px">TOTAL (${items.length} item${items.length===1?'':'s'})</td>
          <td style="padding:7px 6px;text-align:right;font-family:var(--font-mono);color:var(--accent-cyan)" id="cbItemsTot">${_cbMoney(tot)}</td><td></td>
        </tr>
      </tbody>
    </table></div>
    <div style="margin-top:10px"><button class="btn btn-secondary btn-sm" onclick="_cbItemAdd('${pid}','${rowId}')"><i class="fas fa-plus"></i> Add item</button></div>`;
}
function _cbItemsRefresh(pid,rowId){ const b=$('#genericModalBody'); if(b)b.innerHTML=_cbItemsBody(pid,rowId); }
function _cbItemAdd(pid,rowId){
  const r=_cbFind(pid,rowId); if(!r)return; if(!Array.isArray(r.items))r.items=[];
  r.items.push({id:'cbi-'+Date.now().toString(36)+'-'+Math.floor(Math.random()*1000),date:'',desc:'',ref:'',amount:0});
  _cbTouch(pid); AppState.save(); _cbItemsRefresh(pid,rowId);
}
function _cbItemSet(pid,rowId,itemId,field,val){
  const r=_cbFind(pid,rowId); if(!r)return; const it=_cbItems(r).find(x=>x.id===itemId); if(!it)return;
  it[field]=(field==='amount')?(+val||0):val; _cbTouch(pid); AppState.save();
}
function _cbItemDel(pid,rowId,itemId){
  const r=_cbFind(pid,rowId); if(!r)return; const i=_cbItems(r).findIndex(x=>x.id===itemId);
  if(i>=0)r.items.splice(i,1); _cbTouch(pid); AppState.save(); _cbItemsRefresh(pid,rowId);
}
function exportCostBudget(pid){
  if(typeof canSeeBudget==='function' && !canSeeBudget()){
    if(typeof showToast==='function')showToast('Budget figures are confidential — export not permitted.','error');
    return;
  }
  const rows=_cbRows(pid);
  const out=[];
  rows.forEach(r=>{
    const bud=+r.budget||0,act=_cbActual(pid,r),v=bud-act;
    out.push([r.label,bud,act,v,_cbPct(bud,v).toFixed(2)+'%','']);
    // itemized charges (indented detail under the category)
    _cbItems(r).forEach(it=>out.push(['   • '+(it.desc||'(item)'),'',(+it.amount||0),'','',[it.date,it.ref].filter(Boolean).join(' / ')]));
  });
  const totB=rows.reduce((s,r)=>s+(+r.budget||0),0), totA=rows.reduce((s,r)=>s+_cbActual(pid,r),0);
  out.push(['NET INCOME BASED ON TOTAL DIRECT COST',totB,totA,totB-totA,_cbPct(totB,totB-totA).toFixed(2)+'%','']);
  if(typeof exportCSV==='function')
    exportCSV(out,['Particular','Budget','Actual Cost','Variance','%','Detail'],'cost_budget_'+pid+'.csv');
}
