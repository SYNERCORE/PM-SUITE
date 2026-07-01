// ── WAREHOUSE MODULE ──────────────────────────────────────────
// Items catalog + Stock Transactions + Issuance Requests

// ── Undo toast ───────────────────────────────────────────────
let _whUndoTimer=null;
function _whShowUndoToast(msg, undoFn, seconds=30){
  // Remove any existing undo toast
  const old=document.getElementById('wh-undo-toast');
  if(old)old.remove();
  if(_whUndoTimer)clearTimeout(_whUndoTimer);
  const toast=document.createElement('div');
  toast.id='wh-undo-toast';
  let remaining=seconds;
  toast.style.cssText='position:fixed;bottom:24px;left:50%;transform:translateX(-50%);background:var(--bg-secondary);border:1px solid var(--border);border-radius:10px;padding:12px 18px;display:flex;align-items:center;gap:12px;z-index:9999;box-shadow:0 4px 20px rgba(0,0,0,.4);min-width:320px;max-width:90vw';
  const update=()=>{
    toast.innerHTML=`<i class="fas fa-check-circle" style="color:var(--accent-green);font-size:16px"></i>
    <span style="flex:1;font-size:12px">${msg}</span>
    <span style="font-size:11px;color:var(--text-secondary);min-width:24px;text-align:right">${remaining}s</span>
    <button onclick="document.getElementById('wh-undo-toast')._undoFn&&document.getElementById('wh-undo-toast')._undoFn();document.getElementById('wh-undo-toast')?.remove();clearTimeout(window._whUndoTimer)" style="background:rgba(248,81,73,.15);color:var(--accent-red);border:1px solid rgba(248,81,73,.3);border-radius:6px;padding:4px 10px;font-size:11px;font-weight:600;cursor:pointer;white-space:nowrap"><i class="fas fa-undo"></i> Undo</button>
    <button onclick="document.getElementById('wh-undo-toast')?.remove();clearTimeout(window._whUndoTimer)" style="background:none;border:none;color:var(--text-secondary);cursor:pointer;font-size:14px;padding:2px 4px">×</button>`;
    toast._undoFn=undoFn;
  };
  update();
  document.body.appendChild(toast);
  window._whUndoTimer=setInterval(()=>{
    remaining--;
    if(remaining<=0){clearInterval(window._whUndoTimer);toast.remove();return;}
    const span=toast.querySelector('span:nth-child(3)');
    if(span)span.textContent=remaining+'s';
  },1000);
}

// ── helpers ──────────────────────────────────────────────────
function _whItems(){return(AppState.data.warehouseItems||[]).filter(i=>!i._deleted);}
function _whTx(){return(AppState.data.stockTransactions||[]).filter(t=>!t._deleted);}
function _whReq(){return(AppState.data.issuanceRequests||[]).filter(r=>!r._deleted);}
// In-memory cache of form templates loaded from SP (shared across all users)
let _whFormsCache=null;
let _whFormsCacheTime=0; // timestamp of last SP load
function _whForms(){
  // Return cache if loaded, otherwise fall back to local defaults until SP loads
  if(_whFormsCache&&_whFormsCache.length)return _whFormsCache;
  if(AppState.data.whForms&&AppState.data.whForms.length)return AppState.data.whForms;
  return[
    {id:'form-shic',name:'SHIC Form',companyName:'SYNERCORE',companySub:'HEAVY INDUSTRIES CORP.',logoDataUrl:'',docControlNo:'SHIC-WHD-F-003',revisionNo:'REV.000',effectiveDate:'January 4, 2025'},
    {id:'form-sy3', name:'SY3 Form', companyName:'SY3 ENERGY', companySub:'MAINTENANCE SERVICES CORP.',logoDataUrl:'',docControlNo:'SY3-F-WHD-003', revisionNo:'REV.003',effectiveDate:'April 21, 2025'},
  ];
}
let _whFormsLoading=false;
async function _whLoadFormsFromSP(){
  if(_whFormsLoading)return _whFormsCache||_whForms();
  _whFormsLoading=true;
  try{
    const forms=await spGetFormTemplates();
    if(forms&&forms.length){_whFormsCache=forms;_whFormsCacheTime=Date.now();return forms;}
    // SP is empty — seed with defaults if admin
    if(_currentUserProfile?.isAdmin){
      const defaults=_whForms();
      for(const f of defaults){try{await spSaveFormTemplate(f);}catch(e){console.warn('[Forms] Seed failed',e);}}
      _whFormsCache=defaults;_whFormsCacheTime=Date.now();
    }
    return _whFormsCache||_whForms();
  }catch(e){console.warn('[Forms] SP load failed, using local:',e.message);return _whForms();}
  finally{_whFormsLoading=false;}
}
// Generate WHD-MCWF NO.: 26YY - NNN (sequential per year across all withdrawal tx)
function _whGenMcwfNo(date){
  const yr=new Date(date||Date.now());
  const yy=String(yr.getFullYear()).slice(-2);
  const yearStr=yr.getFullYear().toString();
  const isWithdrawal=t=>t.type==='issue'||t.type==='issue-shop'||t.type==='issue-enduser'||t.type==='return'||t.type==='adjust';
  const countThisYear=_whTx().filter(t=>isWithdrawal(t)&&(t.date||'').startsWith(yearStr)).length;
  return`${yy} - ${String(countThisYear).padStart(3,'0')}`;
}

// Weighted Average Cost — recalculated from all receipts; falls back to item stored cost
function _whCalcWAC(itemId){
  const receipts=_whTx().filter(t=>t.type==='receive'&&t.itemId===itemId&&(t.unitCost||0)>0);
  const totalQty=receipts.reduce((s,t)=>s+t.qty,0);
  if(!totalQty){const item=_whItems().find(i=>i.id===itemId);return item?.unitCost||0;}
  return receipts.reduce((s,t)=>s+(t.qty*(t.unitCost||0)),0)/totalQty;
}

// Smart reorder banner — shows items predicted to run out soon
function _whReorderBanner(){
  const items=_whItems();
  if(!items.length)return'';
  const tx=_whTx();
  const now=Date.now();
  const WINDOW_MS=90*24*60*60*1000; // 90-day consumption window
  const suggestions=[];

  items.forEach(item=>{
    const issues=tx.filter(t=>t.itemId===item.id&&(t.type==='issue'||t.type==='issue-shop'||t.type==='issue-enduser')&&t.date);
    const recent=issues.filter(t=>new Date(t.date).getTime()>now-WINDOW_MS);
    if(!recent.length)return;
    const totalIssued=recent.reduce((s,t)=>s+t.qty,0);
    const avgDailyUse=totalIssued/90;
    if(avgDailyUse<=0)return;
    const qtyOnHand=_whCalcQty(item.id).qtyOnHand;
    const daysLeft=qtyOnHand/avgDailyUse;
    const reorderPt=item.reorderPoint||item.minStock||0;
    const daysToReorder=reorderPt>0?(qtyOnHand-reorderPt)/avgDailyUse:daysLeft;
    // Flag if: will hit reorder point within 14 days OR will run out within 7 days
    if(daysToReorder<=14||daysLeft<=7){
      suggestions.push({item,qtyOnHand,avgDailyUse:Math.round(avgDailyUse*10)/10,daysLeft:Math.round(daysLeft),daysToReorder:Math.round(daysToReorder),suggestedQty:Math.ceil(avgDailyUse*30)});
    }
  });

  if(!suggestions.length)return'';
  suggestions.sort((a,b)=>a.daysLeft-b.daysLeft);

  return`<div style="background:rgba(240,164,80,.08);border:1px solid rgba(240,164,80,.3);border-radius:10px;padding:12px 14px;margin-bottom:12px">
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px">
      <div style="font-size:12px;font-weight:700;color:var(--accent-amber)"><i class="fas fa-bell" style="margin-right:6px"></i>Reorder Suggestions (${suggestions.length} items)</div>
      <span style="font-size:10px;color:var(--text-secondary)">Based on 90-day consumption rate</span>
    </div>
    <div style="display:flex;flex-wrap:wrap;gap:8px">
      ${suggestions.slice(0,6).map(s=>{
        const urgent=s.daysLeft<=7;
        const c=urgent?'var(--accent-red)':'var(--accent-amber)';
        return`<div style="background:var(--bg-secondary);border:1px solid ${c}44;border-radius:8px;padding:8px 12px;min-width:180px;flex:1;max-width:280px">
          <div style="font-size:11px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${s.item.name}">${s.item.name}</div>
          <div style="font-size:10px;color:${c};margin-top:3px"><i class="fas fa-${urgent?'exclamation-triangle':'clock'}" style="margin-right:3px"></i>${urgent?'Runs out in ~'+s.daysLeft+'d':'Reorder in ~'+s.daysToReorder+'d'}</div>
          <div style="display:flex;justify-content:space-between;margin-top:5px;font-size:10px;color:var(--text-secondary)">
            <span>On hand: <strong style="color:var(--text-primary)">${s.qtyOnHand}</strong></span>
            <span>Daily use: ~${s.avgDailyUse}</span>
          </div>
          <button class="btn btn-sm" style="margin-top:6px;width:100%;font-size:10px;padding:3px;background:${c}22;color:${c};border:1px solid ${c}44;border-radius:5px" onclick="_whShowReceive('${s.item.id}')">
            <i class="fas fa-truck-loading"></i> Receive (~${s.suggestedQty} ${s.item.unit||'ea'} suggested)
          </button>
        </div>`;
      }).join('')}
    </div>
  </div>`;
}

// Cost trend modal — running WAC history + SVG line chart
function _whShowCostTrend(itemId){
  const item=_whItems().find(i=>i.id===itemId);
  if(!item)return;

  // Build chronological receive events, computing running WAC after each
  const receipts=_whTx()
    .filter(t=>t.type==='receive'&&t.itemId===itemId&&(t.unitCost||0)>0)
    .sort((a,b)=>(a.date||'').localeCompare(b.date||''));

  let runQty=0,runVal=0;
  const points=receipts.map(t=>{
    runQty+=t.qty;
    runVal+=t.qty*(t.unitCost||0);
    const wac=runQty>0?runVal/runQty:0;
    return{date:t.date||'',qty:t.qty,unitCost:t.unitCost||0,wac,ref:t.ref||t.batchRef||'',vendor:t.vendor||''};
  });

  const currentWAC=_whCalcWAC(itemId);
  const lastPurchase=points.length?points[points.length-1].unitCost:0;
  const allCosts=points.map(p=>p.unitCost);
  const minCost=allCosts.length?Math.min(...allCosts):0;
  const maxCost=allCosts.length?Math.max(...allCosts):0;
  const avgPurchase=allCosts.length?allCosts.reduce((s,c)=>s+c,0)/allCosts.length:0;

  // Build SVG sparkline for running WAC
  let chartSVG='<div style="color:var(--text-secondary);font-size:12px;text-align:center;padding:20px">No receive transactions yet</div>';
  if(points.length>=2){
    const W=480,H=120,PAD=10;
    const wacs=points.map(p=>p.wac);
    const lo=Math.min(...wacs),hi=Math.max(...wacs);
    const range=hi-lo||1;
    const xs=points.map((_,i)=>PAD+i*(W-PAD*2)/(points.length-1));
    const ys=wacs.map(w=>H-PAD-(w-lo)/(range)*(H-PAD*2));
    const polyline=xs.map((x,i)=>`${x},${ys[i]}`).join(' ');
    // Gradient fill path
    const fillPath=`M${xs[0]},${H-PAD} `+xs.map((x,i)=>`L${x},${ys[i]}`).join(' ')+` L${xs[xs.length-1]},${H-PAD} Z`;
    // Last point highlight
    const lx=xs[xs.length-1],ly=ys[ys.length-1];
    chartSVG=`<svg viewBox="0 0 ${W} ${H}" style="width:100%;height:130px;display:block">
      <defs>
        <linearGradient id="wacGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="var(--accent-blue)" stop-opacity="0.25"/>
          <stop offset="100%" stop-color="var(--accent-blue)" stop-opacity="0.02"/>
        </linearGradient>
      </defs>
      <path d="${fillPath}" fill="url(#wacGrad)"/>
      <polyline points="${polyline}" fill="none" stroke="var(--accent-blue)" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>
      ${xs.map((x,i)=>`<circle cx="${x}" cy="${ys[i]}" r="3" fill="var(--accent-blue)" opacity="0.7"/>`).join('')}
      <circle cx="${lx}" cy="${ly}" r="5" fill="var(--accent-blue)"/>
      <text x="${lx>W*0.75?lx-6:lx+6}" y="${ly-8}" font-size="9" fill="var(--accent-blue)" text-anchor="${lx>W*0.75?'end':'start'}">₱${fmtNum(wacs[wacs.length-1])}</text>
      <text x="${PAD}" y="${PAD+6}" font-size="8" fill="var(--text-secondary)">₱${fmtNum(hi)}</text>
      <text x="${PAD}" y="${H-PAD-2}" font-size="8" fill="var(--text-secondary)">₱${fmtNum(lo)}</text>
    </svg>`;
  }else if(points.length===1){
    chartSVG=`<div style="color:var(--text-secondary);font-size:12px;text-align:center;padding:20px">Only 1 receive transaction — need 2+ to show trend</div>`;
  }

  // Transaction history table rows
  const histRows=points.slice().reverse().map(p=>`<tr>
    <td style="font-size:11px;color:var(--text-secondary)">${p.date}</td>
    <td style="font-size:11px">${p.vendor||'—'}</td>
    <td style="font-size:11px;color:var(--text-secondary)">${p.ref||'—'}</td>
    <td style="text-align:right;font-family:var(--font-mono);font-size:11px">${p.qty}</td>
    <td style="text-align:right;font-family:var(--font-mono);font-size:11px">₱${fmtNum(p.unitCost)}</td>
    <td style="text-align:right;font-family:var(--font-mono);font-size:11px;color:var(--accent-blue)">₱${fmtNum(p.wac)}</td>
  </tr>`).join('');

  const trendColor=points.length>=2?(points[points.length-1].wac>points[0].wac?'var(--accent-red)':'var(--accent-green)'):'var(--text-secondary)';
  const trendIcon=points.length>=2?(points[points.length-1].wac>points[0].wac?'fa-arrow-trend-up':'fa-arrow-trend-down'):'fa-minus';

  $('#genericModalTitle').textContent = `Cost Trend — ${item.name}`;
  $('#genericModalBody').innerHTML = `
      <!-- KPI cards -->
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(110px,1fr));gap:10px;margin-bottom:16px">
        <div style="background:var(--bg-tertiary);border-radius:8px;padding:10px;text-align:center">
          <div style="font-size:10px;color:var(--text-secondary);margin-bottom:4px">CURRENT WAC</div>
          <div style="font-size:16px;font-weight:700;font-family:var(--font-mono);color:var(--accent-blue)">₱${fmtNum(currentWAC)}</div>
        </div>
        <div style="background:var(--bg-tertiary);border-radius:8px;padding:10px;text-align:center">
          <div style="font-size:10px;color:var(--text-secondary);margin-bottom:4px">LAST PURCHASE</div>
          <div style="font-size:16px;font-weight:700;font-family:var(--font-mono)">₱${fmtNum(lastPurchase)}</div>
        </div>
        <div style="background:var(--bg-tertiary);border-radius:8px;padding:10px;text-align:center">
          <div style="font-size:10px;color:var(--text-secondary);margin-bottom:4px">AVG PURCHASE</div>
          <div style="font-size:16px;font-weight:700;font-family:var(--font-mono)">₱${fmtNum(avgPurchase)}</div>
        </div>
        <div style="background:var(--bg-tertiary);border-radius:8px;padding:10px;text-align:center">
          <div style="font-size:10px;color:var(--text-secondary);margin-bottom:4px">LOWEST</div>
          <div style="font-size:16px;font-weight:700;font-family:var(--font-mono);color:var(--accent-green)">₱${fmtNum(minCost)}</div>
        </div>
        <div style="background:var(--bg-tertiary);border-radius:8px;padding:10px;text-align:center">
          <div style="font-size:10px;color:var(--text-secondary);margin-bottom:4px">HIGHEST</div>
          <div style="font-size:16px;font-weight:700;font-family:var(--font-mono);color:var(--accent-red)">₱${fmtNum(maxCost)}</div>
        </div>
        <div style="background:var(--bg-tertiary);border-radius:8px;padding:10px;text-align:center">
          <div style="font-size:10px;color:var(--text-secondary);margin-bottom:4px">TREND</div>
          <div style="font-size:16px;font-weight:700;color:${trendColor}"><i class="fas ${trendIcon}"></i></div>
        </div>
      </div>
      <!-- Chart -->
      <div style="background:var(--bg-tertiary);border-radius:8px;padding:12px;margin-bottom:16px">
        <div style="font-size:11px;color:var(--text-secondary);margin-bottom:8px;font-weight:600">RUNNING WAC OVER TIME</div>
        ${chartSVG}
        ${points.length>=2?`<div style="font-size:10px;color:var(--text-secondary);text-align:center;margin-top:4px">${points[0].date} → ${points[points.length-1].date} · ${points.length} purchases</div>`:''}
      </div>
      <!-- History table -->
      ${points.length?`<div style="font-size:11px;font-weight:600;color:var(--text-secondary);margin-bottom:6px">PURCHASE HISTORY</div>
      <div style="max-height:200px;overflow-y:auto">
      <table style="font-size:11px"><thead><tr>
        <th>DATE</th><th>VENDOR</th><th>REF</th><th style="text-align:right">QTY</th>
        <th style="text-align:right">UNIT COST</th><th style="text-align:right">RUNNING WAC</th>
      </tr></thead><tbody>${histRows}</tbody></table></div>`:''}
  `;
  $('#genericModalFooter').innerHTML = `<button class="btn btn-secondary" onclick="closeModal('genericModal')">Close</button>`;
  openModal('genericModal');
}

// Actual cost issued to a project for a resource (supports direct WH id or itemMasterId linkage)
function _whActualIssueCost(projectId, resourceId){
  if(!projectId||!resourceId)return 0;
  const whItem=_whItems().find(w=>w.id===resourceId||w.itemMasterId===resourceId);
  const itemId=whItem?whItem.id:resourceId;
  return _whTx()
    .filter(t=>t.type==='issue'&&t.projectId===projectId&&t.itemId===itemId)
    .reduce((s,t)=>s+(t.qty*(t.unitCost||whItem?.unitCost||0)),0);
}

// Recompute live qty fields for an item from its transactions
function _whCalcQty(itemId){
  const tx=_whTx().filter(t=>t.itemId===itemId);
  const qtyOnHand=tx.reduce((s,t)=>{
    if(t.type==='receive')return s+t.qty;
    if(t.type==='issue'||t.type==='issue-shop'||t.type==='issue-enduser')return s-t.qty;
    if(t.type==='return')return s+t.qty;
    if(t.type==='adjust')return s+t.qty;
    return s;
  },0);
  const qtyReserved=(AppState.data.resourceAllocations||[]).filter(a=>!a._deleted&&a.resourceId===itemId&&(a.resourceType==='Material'||a.resourceType==='Consumable')).reduce((s,a)=>s+(a.allocatedQty||0),0);
  const issued=tx.filter(t=>t.type==='issue'||t.type==='issue-shop'||t.type==='issue-enduser').reduce((s,t)=>s+t.qty,0);
  const returned=tx.filter(t=>t.type==='return').reduce((s,t)=>s+t.qty,0);
  const netIssued=Math.max(0,issued-returned);
  const qtyAvailable=Math.max(0,qtyOnHand-Math.max(0,qtyReserved-netIssued));
  return{qtyOnHand:Math.max(0,qtyOnHand),qtyReserved:Math.max(0,qtyReserved),qtyAvailable,netIssued};
}

// Sync computed qty back to the item record (called on save)
function _whSyncQty(itemId){
  const idx=(AppState.data.warehouseItems||[]).findIndex(i=>i.id===itemId);
  if(idx===-1)return;
  const q=_whCalcQty(itemId);
  Object.assign(AppState.data.warehouseItems[idx],q);
}

// Generate sequential IDs
function _whNextId(prefix,arr){
  const nums=(arr||[]).map(i=>{const m=i.id&&i.id.match(/(\d+)$/);return m?parseInt(m[1]):0;});
  return prefix+String((Math.max(0,...nums)+1)).padStart(4,'0');
}

let _whTab='items', _whItemSearch='', _whItemCat='all', _whTxItemFilter='all', _whReqStatus='all', _whItemPage=0;
let _whItemPageSize=25, _whItemSortCol='name', _whItemSortAsc=true;
let _whSelected=new Set();
function _whToggleSel(id){_whSelected.has(id)?_whSelected.delete(id):_whSelected.add(id);_whRenderBulkBar();}
function _whToggleAll(checked){document.querySelectorAll('input[data-wh-id]').forEach(cb=>{checked?_whSelected.add(cb.dataset.whId):_whSelected.delete(cb.dataset.whId);cb.checked=checked;});_whRenderBulkBar();}
function _whRenderBulkBar(){
  let bar=document.getElementById('wh-bulk-bar');
  if(!_whSelected.size){if(bar)bar.remove();return;}
  if(!bar){bar=document.createElement('div');bar.id='wh-bulk-bar';bar.style.cssText='position:fixed;bottom:24px;right:24px;z-index:9990;display:flex;align-items:center;gap:10px;padding:10px 16px;background:var(--bg-card);border:1px solid var(--border);border-radius:10px;box-shadow:0 4px 20px rgba(0,0,0,.4)';document.body.appendChild(bar);}
  bar.innerHTML=`<span style="font-size:12px;font-weight:700;color:var(--accent-blue)">${_whSelected.size} item${_whSelected.size>1?'s':''} selected</span>
    <button class="btn btn-danger btn-sm" onclick="_whBulkDelete()"><i class="fas fa-trash"></i> Delete Selected</button>
    <button class="btn btn-secondary btn-sm" onclick="_whSelected.clear();document.querySelectorAll('input[data-wh-id]').forEach(cb=>cb.checked=false);_whRenderBulkBar()"><i class="fas fa-times"></i> Clear</button>`;}
function _whBulkDelete(){
  if(!_whSelected.size)return;
  if(!confirm(`Delete ${_whSelected.size} selected item${_whSelected.size>1?'s':''}?\n\nThis will soft-delete the items. Transaction history is preserved.`))return;
  _whSelected.forEach(id=>{const i=(AppState.data.warehouseItems||[]).findIndex(x=>x.id===id);if(i>=0)AppState.data.warehouseItems[i]._deleted=true;});
  const n=_whSelected.size;AppState.save();showToast(`${n} item${n>1?'s':''} deleted`,'success');_whSelected.clear();_whRenderBulkBar();_whRenderTab();}

// ── MAIN RENDER ──────────────────────────────────────────────
function renderWarehouse(){
  _ensureWarehouseData();
  const items=_whItems();
  const tx=_whTx();
  const reqs=_whReq();

  const totalItems=items.length;
  const lowStock=items.filter(i=>{const q=_whCalcQty(i.id);return i.minStock>0&&q.qtyOnHand<=i.minStock;}).length;
  const totalValue=items.reduce((s,i)=>{const q=_whCalcQty(i.id);return s+(q.qtyOnHand*(i.unitCost||0));},0);
  const pendingReqs=reqs.filter(r=>r.status==='pending').length;
  const todayTx=tx.filter(t=>t.date&&t.date.slice(0,10)===new Date().toISOString().slice(0,10)).length;

  const tabs=[
    {id:'items',   label:'Items',             icon:'fa-boxes',          count:totalItems},
    {id:'receive', label:'Receive Stock',      icon:'fa-truck-loading',  count:null},
    {id:'issue',   label:'Issue / Return',     icon:'fa-dolly',          count:null},
    {id:'requests',label:'Issuance Requests',  icon:'fa-clipboard-list', count:pendingReqs||null},
    {id:'ledger',  label:'Transaction Ledger', icon:'fa-list-alt',       count:null},
    {id:'forms',   label:'Form Setup',         icon:'fa-id-card',        count:null},
  ];

  $('#warehouse').innerHTML=`
  <div class="section-header" style="margin-bottom:16px">
    <div>
      <div class="section-title"><i class="fas fa-warehouse" style="color:var(--accent-blue);margin-right:9px"></i>Warehouse</div>
      <div class="section-sub">Stock management — receive, reserve, issue, return, and track all materials &amp; consumables</div>
    </div>
  </div>

  <!-- KPI strip -->
  <div style="display:grid;grid-template-columns:repeat(5,1fr);gap:10px;margin-bottom:18px">
    ${[
      ['fa-boxes','Total Items',totalItems,'var(--accent-blue)'],
      ['fa-exclamation-circle','Low Stock',lowStock,'var(--accent-red)'],
      ['fa-peso-sign','Inventory Value','₱'+fmtNum(totalValue),'var(--accent-green)'],
      ['fa-clipboard-list','Pending Requests',pendingReqs,'var(--accent-amber)'],
      ['fa-exchange-alt',"Today's Transactions",todayTx,'#39d3f2'],
    ].map(([ic,l,v,c])=>`
    <div class="stat-card" style="border-left:3px solid ${c};cursor:default">
      <div class="stat-icon" style="background:${c}18"><i class="fas ${ic}" style="color:${c}"></i></div>
      <div class="stat-info">
        <div class="label">${l}</div>
        <div class="value" style="color:${c};font-size:20px">${v}</div>
      </div>
    </div>`).join('')}
  </div>

  <!-- Tabs -->
  <div class="wh-tabs-wrap"><div class="tabs">
    ${tabs.map(t=>`
    <div class="tab ${_whTab===t.id?'active':''}" onclick="_whSetTab('${t.id}')" style="display:flex;align-items:center;gap:6px;padding:9px 16px;font-size:12px;font-weight:500;cursor:pointer;white-space:nowrap">
      <i class="fas ${t.icon}" style="font-size:13px"></i>
      <span>${t.label}</span>
      ${t.count?`<span style="background:var(--accent-amber);color:#000;font-size:9px;font-weight:700;padding:1px 6px;border-radius:10px;min-width:18px;text-align:center">${t.count}</span>`:''}
    </div>`).join('')}
  </div></div>

  <div id="wh-tab-body"></div>`;

  _whRenderTab();
}

function _whSetTab(t){_whTab=t;_whSelected.clear();const b=document.getElementById('wh-bulk-bar');if(b)b.remove();_whRenderTab();}

function _whRenderTab(){
  const el=$('#wh-tab-body');
  if(!el)return;
  if(_whTab==='items'){
    el.innerHTML=_whItemsHTML();
    const si=el.querySelector('input[placeholder*="Search"]');
    if(si)setTimeout(()=>{si.focus();const l=si.value.length;si.setSelectionRange(l,l);},0);
  }
  else if(_whTab==='receive') el.innerHTML=_whReceiveHTML();
  else if(_whTab==='issue')   el.innerHTML=_whIssueHTML();
  else if(_whTab==='requests')el.innerHTML=_whRequestsHTML();
  else if(_whTab==='ledger')  el.innerHTML=_whLedgerHTML();
  else if(_whTab==='forms')   el.innerHTML=_whFormsHTML();
}

// ── TAB: ITEMS ────────────────────────────────────────────────
function _whSortHeader(col,label){
  const active=_whItemSortCol===col;
  const icon=active?(_whItemSortAsc?'fa-sort-up':'fa-sort-down'):'fa-sort';
  return`<th style="cursor:pointer;white-space:nowrap;user-select:none" onclick="_whItemSortCol='${col}';_whItemSortAsc=${active}?!_whItemSortAsc:true;_whRenderTab()">${label} <i class="fas ${icon}" style="font-size:9px;opacity:${active?1:.3}"></i></th>`;
}

function _whItemsHTML(){
  const cats=['all',...new Set(_whItems().map(i=>i.category||'Uncategorized'))];
  let items=_whItems();
  if(_whItemCat!=='all')items=items.filter(i=>(i.category||'Uncategorized')===_whItemCat);
  if(_whItemSearch){
    const q=_whItemSearch.toLowerCase();
    items=items.filter(i=>(i.name+' '+(i.code||'')+' '+(i.barcode||'')+' '+(i.location||'')+' '+(i.rack||'')+' '+(i.row||'')+' '+(i.category||'')).toLowerCase().includes(q));
  }

  // Sort
  items=[...items].sort((a,b)=>{
    let av,bv;
    if(_whItemSortCol==='qty'){const qa=_whCalcQty(a.id),qb=_whCalcQty(b.id);av=qa.qtyOnHand;bv=qb.qtyOnHand;}
    else if(_whItemSortCol==='value'){const qa=_whCalcQty(a.id),qb=_whCalcQty(b.id);av=qa.qtyOnHand*(a.unitCost||0);bv=qb.qtyOnHand*(b.unitCost||0);}
    else if(_whItemSortCol==='cost'){av=parseFloat(a.unitCost||0);bv=parseFloat(b.unitCost||0);}
    else{av=(a[_whItemSortCol]||'').toString().toLowerCase();bv=(b[_whItemSortCol]||'').toString().toLowerCase();}
    if(av<bv)return _whItemSortAsc?-1:1;
    if(av>bv)return _whItemSortAsc?1:-1;
    return 0;
  });

  const totalFiltered=items.length;
  const ps=_whItemPageSize===0?totalFiltered:_whItemPageSize;
  const totalPages=Math.max(1,Math.ceil(totalFiltered/ps));
  if(_whItemPage>=totalPages)_whItemPage=totalPages-1;
  const pageItems=_whItemPageSize===0?items:items.slice(_whItemPage*ps,(_whItemPage+1)*ps);

  const rows=pageItems.map(item=>{
    const q=_whCalcQty(item.id);
    const low=item.minStock>0&&q.qtyOnHand<=item.minStock;
    const stockColor=q.qtyAvailable<=0?'var(--accent-red)':low?'var(--accent-amber)':'var(--accent-green)';
    const stockPct=item.minStock>0?Math.min(100,Math.round(q.qtyOnHand/item.minStock*100)):100;
    return`<tr>
      <td style="width:32px;text-align:center"><input type="checkbox" data-wh-id="${item.id}" ${_whSelected.has(item.id)?'checked':''} onchange="_whToggleSel('${item.id}')" style="cursor:pointer"></td>
      <td style="font-family:var(--font-mono);font-size:11px;color:var(--text-secondary)">${item.code||item.id}</td>
      <td><div style="font-weight:600">${item.name}</div>
        <div style="font-size:10px;color:var(--text-secondary)">${item.category||'—'}</div>
        ${item.itemMasterId?`<div style="font-size:9px;color:var(--accent-blue)"><i class="fas fa-link"></i> ${item.itemMasterId}</div>`:''}
      </td>
      <td style="white-space:nowrap">
        ${(item.rack||item.row)?`
        <div style="display:flex;flex-direction:column;gap:3px">
          ${item.rack?`<span style="display:inline-flex;align-items:center;gap:4px;font-size:10px;font-family:var(--font-mono);background:rgba(56,139,253,.12);color:var(--accent-blue);border:1px solid rgba(56,139,253,.25);padding:1px 6px;border-radius:4px;font-weight:600"><i class="fas fa-th-large" style="font-size:8px"></i>Rack ${item.rack}</span>`:''}
          ${item.row?`<span style="display:inline-flex;align-items:center;gap:4px;font-size:10px;font-family:var(--font-mono);background:rgba(63,185,80,.10);color:var(--accent-green);border:1px solid rgba(63,185,80,.22);padding:1px 6px;border-radius:4px;font-weight:600"><i class="fas fa-stream" style="font-size:8px"></i>Row ${item.row}</span>`:''}
        </div>`:`<span style="color:var(--text-secondary);font-size:11px">—</span>`}
      </td>
      <td><span class="badge badge-blue" style="font-size:10px">${item.unit||'ea'}</span></td>
      <td style="text-align:right;font-family:var(--font-mono)">
        <div style="color:${stockColor};font-weight:700">${q.qtyOnHand}</div>
        <div style="font-size:10px;color:var(--text-secondary)">on hand</div>
      </td>
      <td style="text-align:right;font-family:var(--font-mono)">
        <div style="color:var(--accent-amber)">${q.qtyReserved}</div>
        <div style="font-size:10px;color:var(--text-secondary)">reserved</div>
      </td>
      <td style="text-align:right;font-family:var(--font-mono)">
        <div style="color:${q.qtyAvailable>0?'var(--accent-green)':'var(--accent-red)'};font-weight:700">${q.qtyAvailable}</div>
        <div style="font-size:10px;color:var(--text-secondary)">available</div>
      </td>
      <td style="text-align:right;font-family:var(--font-mono);font-size:11px">₱${fmtNum(item.unitCost||0)}</td>
      <td style="text-align:right;font-family:var(--font-mono);font-size:11px;color:var(--accent-green)">₱${fmtNum(q.qtyOnHand*(item.unitCost||0))}</td>
      <td>
        <div style="display:flex;align-items:center;gap:6px">
          <div style="flex:1;height:5px;background:var(--bg-hover);border-radius:3px;overflow:hidden">
            <div style="height:100%;width:${stockPct}%;background:${stockColor};border-radius:3px;transition:.3s"></div>
          </div>
          ${low?`<i class="fas fa-exclamation-circle" style="color:var(--accent-red);font-size:11px" title="Low stock"></i>`:''}
        </div>
      </td>
      <td>
        <div style="display:flex;gap:4px">
          <button class="btn btn-secondary btn-sm" style="padding:3px 7px" onclick="_whShowReceive('${item.id}')" title="Receive stock"><i class="fas fa-truck-loading" style="color:var(--accent-green)"></i></button>
          <button class="btn btn-secondary btn-sm" style="padding:3px 7px" onclick="_whShowIssueItem('${item.id}')" title="Issue/Return"><i class="fas fa-dolly" style="color:var(--accent-amber)"></i></button>
          <button class="btn btn-secondary btn-sm" style="padding:3px 7px" onclick="_whShowCostTrend('${item.id}')" title="Cost trend"><i class="fas fa-chart-line" style="color:var(--accent-blue)"></i></button>
          <button class="btn btn-secondary btn-sm" style="padding:3px 7px" onclick="_whEditItem('${item.id}')" title="Edit"><i class="fas fa-edit"></i></button>
          <button class="btn btn-secondary btn-sm" style="padding:3px 7px" onclick="_whDeleteItem('${item.id}')" title="Delete"><i class="fas fa-trash" style="color:var(--accent-red)"></i></button>
        </div>
      </td>
    </tr>`;
  }).join('');

  const reorderBanner=_whReorderBanner();
  return`
  ${reorderBanner}
  <!-- Toolbar -->
  <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:10px;flex-wrap:wrap">
    <div style="font-size:13px;font-weight:700;color:var(--text-secondary)">
      Warehouse Items — <span style="color:var(--text-primary)">${totalFiltered}</span>${totalFiltered!==_whItems().length?` <span style="font-size:11px;font-weight:400">of ${_whItems().length}</span>`:''}
    </div>
    <div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap">
      <button class="btn btn-danger btn-sm" onclick="_whClearAll()" title="Clear all items"><i class="fas fa-trash"></i></button>
      <button class="btn btn-secondary btn-sm" onclick="_whPrintItemsReport()"><i class="fas fa-print"></i> Print Report</button>
      <button class="btn btn-secondary btn-sm" onclick="_whImportItems()"><i class="fas fa-file-import"></i> Import</button>
      <button class="btn btn-secondary btn-sm" onclick="_whExportItems()"><i class="fas fa-download"></i> Export</button>
      <button class="btn btn-primary btn-sm" onclick="_whShowAddItem()"><i class="fas fa-plus"></i> Add</button>
    </div>
  </div>
  <!-- Search & filter -->
  <div style="display:flex;gap:8px;margin-bottom:10px;flex-wrap:wrap">
    <input class="form-control" style="flex:1;min-width:200px" placeholder="Search name, code, barcode, category, location…" value="${_whItemSearch}"
      oninput="(window._whSearchDebounced||(window._whSearchDebounced=debounce(v=>{_whItemSearch=v;_whItemPage=0;_whRenderTab();},250)))(this.value)">
    <select class="form-control" style="width:160px" onchange="_whItemCat=this.value;_whItemPage=0;_whRenderTab()">
      ${cats.map(c=>`<option value="${c}" ${_whItemCat===c?'selected':''}>${c==='all'?'All Categories':c}</option>`).join('')}
    </select>
    <select class="form-control" style="width:100px" onchange="_whItemPageSize=parseInt(this.value);_whItemPage=0;_whRenderTab()">
      ${[10,25,50,100,0].map(n=>`<option value="${n}" ${_whItemPageSize===n?'selected':''}>${n===0?'All':n+' / page'}</option>`).join('')}
    </select>
  </div>
  <div class="table-wrap">
  <table>
    <thead><tr>
      <th style="width:32px;text-align:center"><input type="checkbox" title="Select all" onchange="_whToggleAll(this.checked)" style="cursor:pointer"></th>
      ${_whSortHeader('code','CODE')}
      ${_whSortHeader('name','ITEM')}
      <th>LOCATION</th><th>UNIT</th>
      <th style="text-align:right;cursor:pointer;user-select:none" onclick="_whItemSortCol='qty';_whItemSortAsc=_whItemSortCol==='qty'?!_whItemSortAsc:true;_whRenderTab()">ON HAND <i class="fas ${_whItemSortCol==='qty'?(_whItemSortAsc?'fa-sort-up':'fa-sort-down'):'fa-sort'}" style="font-size:9px;opacity:${_whItemSortCol==='qty'?1:.3}"></i></th>
      <th style="text-align:right">RESERVED</th>
      <th style="text-align:right">AVAILABLE</th>
      ${_whSortHeader('cost','UNIT COST')}
      <th style="text-align:right;cursor:pointer;user-select:none" onclick="_whItemSortCol='value';_whItemSortAsc=_whItemSortCol==='value'?!_whItemSortAsc:true;_whRenderTab()">TOTAL VALUE <i class="fas ${_whItemSortCol==='value'?(_whItemSortAsc?'fa-sort-up':'fa-sort-down'):'fa-sort'}" style="font-size:9px;opacity:${_whItemSortCol==='value'?1:.3}"></i></th>
      <th style="width:110px">STOCK LEVEL</th>
      <th>ACTIONS</th>
    </tr></thead>
    <tbody>${rows||`<tr><td colspan="11"><div class="empty-state"><i class="fas fa-boxes"></i><p>No items in warehouse yet.</p><p style="font-size:12px;margin-top:4px">Click <strong>Add</strong> to add a single item, or <strong>Import</strong> to load stock in bulk from a CSV/Excel file.</p></div></td></tr>`}</tbody>
  </table>
  </div>
  <div style="display:flex;align-items:center;justify-content:space-between;padding:8px 4px;flex-wrap:wrap;gap:8px">
    <div style="font-size:11px;color:var(--text-secondary)">
      Showing <strong style="color:var(--text-primary)">${_whItemPageSize===0?totalFiltered:Math.min(_whItemPage*ps+1,totalFiltered)}–${_whItemPageSize===0?totalFiltered:Math.min((_whItemPage+1)*ps,totalFiltered)}</strong> of <strong style="color:var(--text-primary)">${totalFiltered}</strong> items
      · Total value: <strong style="color:var(--accent-green)">₱${fmtNum(_whItems().reduce((s,i)=>{const q=_whCalcQty(i.id);return s+(q.qtyOnHand*(i.unitCost||0));},0))}</strong>
    </div>
    ${totalPages>1&&_whItemPageSize!==0?`<div style="display:flex;align-items:center;gap:4px">
      <button class="btn btn-secondary btn-sm" style="padding:3px 10px" ${_whItemPage===0?'disabled':''} onclick="_whItemPage=0;_whRenderTab()"><i class="fas fa-angle-double-left"></i></button>
      <button class="btn btn-secondary btn-sm" style="padding:3px 10px" ${_whItemPage===0?'disabled':''} onclick="_whItemPage--;_whRenderTab()"><i class="fas fa-angle-left"></i></button>
      <span style="font-size:12px;color:var(--text-secondary);padding:0 6px">Page ${_whItemPage+1} / ${totalPages}</span>
      <button class="btn btn-secondary btn-sm" style="padding:3px 10px" ${_whItemPage>=totalPages-1?'disabled':''} onclick="_whItemPage++;_whRenderTab()"><i class="fas fa-angle-right"></i></button>
      <button class="btn btn-secondary btn-sm" style="padding:3px 10px" ${_whItemPage>=totalPages-1?'disabled':''} onclick="_whItemPage=${totalPages-1};_whRenderTab()"><i class="fas fa-angle-double-right"></i></button>
    </div>`:''}
  </div>`;
}

// ── IMPORT ITEMS ─────────────────────────────────────────────
function _whImportItems(){
  const tmpl=`Code,Name,Category,Unit,UnitCost,MinStock,ReorderPoint,Location,OpeningQty\nMAT-001,Portland Cement Type I,Materials,bag,320.00,50,30,Bin A-1,100\nCON-001,Welding Rod E6013,Consumables,pcs,18.50,200,100,Rack B-2,500`;
  const html=`
  <div class="modal-overlay open" data-dynamic="1" id="whImportModal">
    <div class="modal" style="max-width:680px">
      <div class="modal-header">
        <div class="modal-title"><i class="fas fa-file-import" style="color:var(--accent-blue);margin-right:8px"></i>Import Warehouse Items</div>
        <button class="modal-close" onclick="closeModal('whImportModal')"><i class="fas fa-times"></i></button>
      </div>
      <div class="modal-body">

        <!-- Instructions -->
        <div style="padding:10px 14px;background:rgba(56,139,253,.08);border:1px solid rgba(56,139,253,.2);border-radius:6px;margin-bottom:14px;font-size:12px">
          <div style="font-weight:600;margin-bottom:6px"><i class="fas fa-info-circle" style="color:var(--accent-blue);margin-right:6px"></i>How to import</div>
          <ol style="margin:0;padding-left:18px;line-height:1.8;color:var(--text-secondary)">
            <li>Download the template below and fill it in Excel or Google Sheets.</li>
            <li>Save as <strong>CSV</strong> (File → Save As → CSV).</li>
            <li>Paste the CSV content in the box below (or select a file).</li>
            <li>Items will be added as new warehouse records with opening stock posted as a "receive" transaction.</li>
          </ol>
        </div>
        <!-- Import mode -->
        <div style="display:flex;gap:8px;margin-bottom:14px;flex-wrap:wrap">
          <label style="display:flex;align-items:center;gap:6px;font-size:12px;cursor:pointer;padding:7px 12px;border:1px solid var(--border);border-radius:6px;flex:1">
            <input type="radio" name="wh-import-mode" value="skip" checked> <div><strong>Skip existing</strong><div style="font-size:10px;color:var(--text-secondary)">Only add new items — safe for first-time load</div></div>
          </label>
          <label style="display:flex;align-items:center;gap:6px;font-size:12px;cursor:pointer;padding:7px 12px;border:1px solid var(--border);border-radius:6px;flex:1">
            <input type="radio" name="wh-import-mode" value="update"> <div><strong>Update existing</strong><div style="font-size:10px;color:var(--text-secondary)">Update item details + post OnHand as receive transaction</div></div>
          </label>
          <label style="display:flex;align-items:center;gap:6px;font-size:12px;cursor:pointer;padding:7px 12px;border:1px solid var(--border);border-radius:6px;flex:1">
            <input type="radio" name="wh-import-mode" value="replace"> <div><strong>Replace all</strong><div style="font-size:10px;color:var(--text-secondary);color:var(--accent-red)">Clear warehouse then reimport everything</div></div>
          </label>
        </div>

        <!-- Template download -->
        <div style="display:flex;gap:8px;margin-bottom:14px;align-items:center">
          <button class="btn btn-secondary btn-sm" onclick="_whDownloadTemplate()">
            <i class="fas fa-download"></i> Download Template
          </button>
          <span style="font-size:11px;color:var(--text-secondary)">Required columns: Code, Name, Category, Unit · Optional: UnitCost, MinStock, ReorderPoint, Location, OpeningQty</span>
        </div>

        <!-- File picker -->
        <div style="margin-bottom:10px">
          <label class="form-label">Select CSV file</label>
          <input type="file" accept=".csv,.txt" class="form-control" onchange="_whImportReadFile(this)">
        </div>

        <!-- Or paste -->
        <div style="margin-bottom:10px">
          <label class="form-label">— or paste CSV content directly —</label>
          <textarea class="form-control" id="wh-import-csv" rows="8" placeholder="${tmpl.replace(/</g,'&lt;')}" style="font-family:var(--font-mono);font-size:11px"></textarea>
        </div>

        <!-- Preview -->
        <div id="wh-import-preview"></div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" onclick="closeModal('whImportModal')">Cancel</button>
        <button class="btn btn-secondary btn-sm" onclick="_whImportPreview()"><i class="fas fa-eye"></i> Preview</button>
        <button class="btn btn-primary" onclick="_whImportExecute()"><i class="fas fa-file-import"></i> Import Items</button>
      </div>
    </div>
  </div>`;
  document.body.insertAdjacentHTML('beforeend',html);
}

function _whImportReadFile(input){
  const file=input.files[0];
  if(!file)return;
  const reader=new FileReader();
  reader.onload=e=>{
    const el=$('#wh-import-csv');
    if(el)el.value=e.target.result;
    _whImportPreview();
  };
  reader.readAsText(file);
}

function _whImportParseCsv(text){
  const lines=text.trim().split(/\r?\n/).filter(l=>l.trim());
  if(lines.length<2)return{headers:[],rows:[]};
  const parseRow=line=>{
    const cols=[];let cur='';let inQ=false;
    for(let i=0;i<line.length;i++){
      const ch=line[i];
      if(ch==='"'&&!inQ){inQ=true;}
      else if(ch==='"'&&inQ){inQ=false;}
      else if(ch===','&&!inQ){cols.push(cur.trim());cur='';}
      else cur+=ch;
    }
    cols.push(cur.trim());
    return cols;
  };
  const headers=parseRow(lines[0]).map(h=>h.toLowerCase().replace(/\s+/g,''));
  const rows=lines.slice(1).map(l=>parseRow(l));
  return{headers,rows};
}

function _whImportPreview(){
  const text=$('#wh-import-csv')?.value||'';
  const preview=$('#wh-import-preview');
  if(!preview)return;
  if(!text.trim()){preview.innerHTML='';return;}
  const {headers,rows}=_whImportParseCsv(text);
  const nameIdx=headers.findIndex(h=>h==='name');
  const codeIdx=headers.findIndex(h=>h==='code');
  if(nameIdx===-1){preview.innerHTML=`<div style="color:var(--accent-red);font-size:12px;padding:8px"><i class="fas fa-exclamation-circle"></i> Could not find "Name" column. Check your CSV header row.</div>`;return;}
  const existingCodes=new Set(_whItems().map(i=>i.code||i.id));
  const tableRows=rows.slice(0,10).map(row=>{
    const code=codeIdx>=0?row[codeIdx]:'';
    const name=row[nameIdx]||'';
    const exists=code&&existingCodes.has(code);
    const mode=(document.querySelector('input[name="wh-import-mode"]:checked')||{}).value||'skip';
    const statusLabel=exists?(mode==='skip'?'<span style="color:var(--accent-amber)">Skip</span>':'<span style="color:var(--accent-blue)">Update</span>'):'<span style="color:var(--accent-green)">New</span>';
    return`<tr style="${exists&&mode==='skip'?'opacity:.45':''}">
      <td style="font-size:11px;font-family:var(--font-mono)">${code||'auto'}</td>
      <td style="font-size:11px">${name}</td>
      <td style="font-size:11px">${row[headers.indexOf('category')]||'—'}</td>
      <td style="font-size:11px">${row[headers.indexOf('unit')]||'—'}</td>
      <td style="font-size:11px;text-align:right">${(()=>{const qi=['openingqty','onhand','on hand','qty','quantity'].map(a=>headers.findIndex(h=>h.replace(/[\s_\-]/g,'')===a.replace(/[\s_\-]/g,''))).find(i=>i!==-1);return qi!==-1&&qi!==undefined?row[qi]||'0':'0';})()}</td>
      <td style="font-size:10px">${statusLabel}</td>
    </tr>`;
  }).join('');
  preview.innerHTML=`
  <div style="font-size:12px;font-weight:600;margin-bottom:6px;color:var(--text-secondary)"><i class="fas fa-eye" style="margin-right:6px"></i>Preview (first 10 rows)</div>
  <div class="table-wrap" style="max-height:200px;overflow-y:auto">
    <table>
      <thead><tr><th>Code</th><th>Name</th><th>Category</th><th>Unit</th><th style="text-align:right">Opening Qty</th><th>Status</th></tr></thead>
      <tbody>${tableRows}</tbody>
    </table>
  </div>
  <div style="font-size:11px;color:var(--text-secondary);margin-top:6px">${rows.length} rows detected${rows.length>10?' (showing first 10)':''}</div>`;
}

function _whImportExecute(){
  const text=$('#wh-import-csv')?.value||'';
  if(!text.trim()){showToast('Paste or select a CSV file first','error');return;}
  const {headers,rows}=_whImportParseCsv(text);
  // Fuzzy column finder — strips spaces, lowercases, checks multiple aliases
  const idx=(...aliases)=>{
    for(const alias of aliases){
      const norm=alias.toLowerCase().replace(/[\s_\-]/g,'');
      const i=headers.findIndex(h=>h.replace(/[\s_\-]/g,'')===norm);
      if(i!==-1)return i;
    }
    return -1;
  };
  const nameIdx=idx('name','itemname','description');
  if(nameIdx===-1){showToast('No "Name" column found in CSV','error');return;}
  const codeIdx=idx('code','itemcode','sku','id');
  const catIdx=idx('category','cat','type');
  const unitIdx=idx('unit','uom','unitofmeasure');
  const costIdx=idx('unitcost','cost','price','unitprice');
  const minIdx=idx('minstock','minimumstock','minqty','minimum');
  const reorderIdx=idx('reorderpoint','reorder','reorderqty');
  const rackIdx=idx('rack');
  const rowIdx=idx('row');
  const locIdx=idx('location','storagelocation','bin','area');
  // Accept OnHand / OpeningQty / Qty / Quantity as the opening stock column
  const qtyIdx=idx('openingqty','openingstock','onhand','on hand','qty','quantity','initialqty','beginningqty');

  const mode=(document.querySelector('input[name="wh-import-mode"]:checked')||{}).value||'skip';

  if(!AppState.data.warehouseItems)AppState.data.warehouseItems=[];
  if(!AppState.data.stockTransactions)AppState.data.stockTransactions=[];

  // Replace mode: soft-delete all existing items first
  if(mode==='replace'){
    if(!confirm(`Replace ALL warehouse items with this CSV?\n\nThis will remove all ${_whItems().length} existing items and reimport from the file. Transaction history is preserved.\n\nProceed?`))return;
    AppState.data.warehouseItems.forEach(i=>i._deleted=true);
  }

  const existingByCode=new Map(_whItems().map(i=>[i.code||i.id,i]));
  const now=new Date().toISOString();
  const today=now.slice(0,10);
  let added=0,updated=0,skipped=0;

  rows.forEach(row=>{
    const name=(row[nameIdx]||'').trim();
    if(!name)return;
    const code=(codeIdx>=0?row[codeIdx]:'').trim();
    const unitCost=costIdx>=0?parseFloat(row[costIdx])||0:0;
    const openingQty=qtyIdx>=0?parseFloat(row[qtyIdx])||0:0;

    const existing=code?existingByCode.get(code):null;

    if(existing&&mode==='skip'){skipped++;return;}

    if(existing&&(mode==='update'||mode==='replace')){
      // Update item fields (but don't change qty directly — post a receive tx instead)
      Object.assign(existing,{
        name,
        category:catIdx>=0?row[catIdx]||existing.category:existing.category,
        unit:unitIdx>=0?row[unitIdx]||existing.unit:existing.unit,
        unitCost:unitCost||existing.unitCost,
        minStock:minIdx>=0?parseFloat(row[minIdx])||existing.minStock:existing.minStock,
        reorderPoint:reorderIdx>=0?parseFloat(row[reorderIdx])||existing.reorderPoint:existing.reorderPoint,
        rack:rackIdx>=0?(row[rackIdx]||'').toUpperCase()||existing.rack:existing.rack,
        row:rowIdx>=0?parseInt(row[rowIdx])||existing.row:existing.row,
        location:locIdx>=0?row[locIdx]||existing.location:existing.location,
        updatedAt:now,
      });
      // Post stock adjustment to reconcile OnHand if provided
      if(openingQty>0){
        const currentQty=_whCalcQty(existing.id).qtyOnHand;
        const diff=openingQty-currentQty;
        if(Math.abs(diff)>0){
          AppState.data.stockTransactions.push({
            id:_whNextId('TX-',AppState.data.stockTransactions),
            itemId:existing.id,type:'adjust',qty:diff,date:today,
            vendor:'',ref:'REIMPORT',
            notes:`Reimport reconciliation (prev: ${currentQty}, imported: ${openingQty})`,
            unitCost:unitCost||undefined,
            by:AppState.currentUser?.displayName||'import',
            postedAt:now,
          });
          _whSyncQty(existing.id);
        }
      }
      updated++;
      return;
    }

    // New item
    const id=_whNextId('WH-',AppState.data.warehouseItems);
    AppState.data.warehouseItems.push({
      id,name,
      code:code||id,
      category:catIdx>=0?row[catIdx]||'General':'General',
      unit:unitIdx>=0?row[unitIdx]||'ea':'ea',
      unitCost,
      minStock:minIdx>=0?parseFloat(row[minIdx])||0:0,
      reorderPoint:reorderIdx>=0?parseFloat(row[reorderIdx])||0:0,
      rack:rackIdx>=0?(row[rackIdx]||'').toUpperCase():'',
      row:rowIdx>=0?(parseInt(row[rowIdx])||''):'',
      location:locIdx>=0?row[locIdx]||'':'',
      description:'',
      qtyOnHand:0,qtyReserved:0,qtyAvailable:0,netIssued:0,
      createdAt:now,updatedAt:now,
    });
    if(openingQty>0){
      AppState.data.stockTransactions.push({
        id:_whNextId('TX-',AppState.data.stockTransactions),
        itemId:id,type:'receive',qty:openingQty,date:today,
        vendor:'Opening Stock',ref:'IMPORT',
        notes:'Imported opening balance',
        unitCost:unitCost||undefined,
        by:AppState.currentUser?.displayName||'import',
        postedAt:now,
      });
      _whSyncQty(id);
    }
    if(code)existingByCode.set(code,AppState.data.warehouseItems[AppState.data.warehouseItems.length-1]);
    added++;
  });

  AppState.save();
  closeModal('whImportModal');
  const parts=[];
  if(added)parts.push(`${added} added`);
  if(updated)parts.push(`${updated} updated`);
  if(skipped)parts.push(`${skipped} skipped`);
  showToast(`Import complete — ${parts.join(' · ')}`,'success',5000);
  _whRenderTab();
}

// ── MULTI-LINE TRANSACTION STATE ────────────────────────────
let _whRcvLines=[];
let _whIssLines=[];
let _whRcvAttachments=[]; // {file, name, size, preview?}

function _whRcvAddFiles(fileList){
  const remaining=4-_whRcvAttachments.length;
  if(remaining<=0){showToast('Maximum 4 attachments allowed','warning');return;}
  const toAdd=Array.from(fileList).slice(0,remaining);
  toAdd.forEach(file=>{
    _whRcvAttachments.push({file,name:file.name,size:file.size});
  });
  _whRcvRenderAttachments();
  // Reset file input so same file can be added again if needed
  const inp=$('#wh-rcv-files');if(inp)inp.value='';
}
function _whRcvDropFiles(e){
  e.preventDefault();
  const area=$('#wh-rcv-attach-area');if(area)area.style.borderColor='var(--border)';
  _whRcvAddFiles(e.dataTransfer.files);
}
function _whRcvRemoveAttachment(idx){
  _whRcvAttachments.splice(idx,1);
  _whRcvRenderAttachments();
}
function _whRcvRenderAttachments(){
  const el=$('#wh-rcv-attach-list');if(!el)return;
  if(!_whRcvAttachments.length){el.innerHTML='';return;}
  el.innerHTML=_whRcvAttachments.map((a,i)=>{
    const icon=a.name.match(/\.(jpe?g|png|gif|webp)$/i)?'fa-file-image':a.name.match(/\.pdf$/i)?'fa-file-pdf':a.name.match(/\.xlsx?$/i)?'fa-file-excel':'fa-file-alt';
    const kb=(a.size/1024).toFixed(0);
    return`<div style="display:flex;align-items:center;gap:8px;padding:6px 10px;background:var(--bg-secondary);border-radius:6px;font-size:12px">
      <i class="fas ${icon}" style="color:var(--accent-blue);width:16px;text-align:center;flex-shrink:0"></i>
      <span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${a.name}</span>
      <span style="color:var(--text-secondary);flex-shrink:0">${kb} KB</span>
      <button class="btn btn-secondary btn-sm" style="padding:2px 6px;color:var(--accent-red);flex-shrink:0" onclick="_whRcvRemoveAttachment(${i})"><i class="fas fa-times"></i></button>
    </div>`;
  }).join('');
}

// Exact currency formatter (no K/M rounding) for warehouse money fields
const _whFmt=v=>Number(v||0).toLocaleString('en-PH',{minimumFractionDigits:2,maximumFractionDigits:2});

function _whRcvLinesHTML(){
  const items=_whItems();
  const itemOpts=items.map(i=>`<option value="${i.id}">${i.name} (${i.code||i.id})</option>`).join('');
  if(!_whRcvLines.length)_whRcvLines=[{itemId:'',qty:'',unitCost:'',lineTotal:''}];
  const rows=_whRcvLines.map((ln,idx)=>{
    const qty=parseFloat(ln.qty||0);
    const uc=parseFloat(ln.unitCost||0);
    const lt=parseFloat(ln.lineTotal||0);
    const rowTotal=lt>0?lt:(qty*uc);
    return`
  <tr>
    <td style="padding:5px 4px">
      <select class="form-control" style="font-size:12px;width:100%" onchange="_whRcvLines[${idx}].itemId=this.value;_whRcvAutoFillCost(${idx})">
        <option value="">— Select Item —</option>${itemOpts.replace(`value="${ln.itemId}"`,`value="${ln.itemId}" selected`)}
      </select>
    </td>
    <td style="padding:5px 4px;width:36px;text-align:center">
      <button class="btn btn-secondary btn-sm" style="padding:3px 7px;width:100%" title="Scan barcode" onclick="_whScanBarcode(${idx})"><i class="fas fa-barcode"></i></button>
    </td>
    <td style="padding:5px 4px;width:75px">
      <input class="form-control" type="number" min="0.01" step="0.01" style="font-size:12px;width:100%" placeholder="0" value="${ln.qty||''}"
        oninput="_whRcvLines[${idx}].qty=this.value;_whRcvCalcFromQtyOrCost(${idx})">
    </td>
    <td style="padding:5px 4px;width:100px">
      <input id="wh-rcv-uc-${idx}" class="form-control" type="number" min="0" step="0.01" style="font-size:12px;width:100%" placeholder="0.00" value="${ln.unitCost||''}"
        oninput="_whRcvLines[${idx}].unitCost=this.value;_whRcvLines[${idx}].lineTotal='';_whUpdateRcvTotals()">
    </td>
    <td style="padding:5px 4px;width:105px">
      <input id="wh-rcv-lt-${idx}" class="form-control" type="number" min="0" step="0.01" style="font-size:12px;width:100%;color:var(--accent-green)" placeholder="0.00" value="${ln.lineTotal||rowTotal||''}"
        oninput="_whRcvLines[${idx}].lineTotal=this.value;_whRcvCalcUnitCost(${idx})">
    </td>
    <td id="wh-rcv-rt-${idx}" style="padding:5px 8px;width:110px;text-align:right;font-family:var(--font-mono);font-size:12px;font-weight:600;color:var(--accent-green);white-space:nowrap">
      ${rowTotal>0?'₱'+_whFmt(rowTotal):'—'}
    </td>
    <td style="padding:5px 4px;width:32px;text-align:center">
      ${_whRcvLines.length>1?`<button class="btn btn-secondary btn-sm" style="padding:2px 6px;color:var(--accent-red)" onclick="_whRcvLines.splice(${idx},1);_whRefreshRcv()"><i class="fas fa-times"></i></button>`:''}
    </td>
  </tr>`;}).join('');
  const grand=_whRcvLines.reduce((s,ln)=>{
    const lt=parseFloat(ln.lineTotal||0);
    const t=lt>0?lt:parseFloat(ln.qty||0)*parseFloat(ln.unitCost||0);
    return s+t;
  },0);
  return rows+`
  <tr style="background:var(--bg-tertiary);border-top:2px solid var(--border)">
    <td colspan="5" style="padding:6px 8px;font-size:12px;font-weight:600;text-align:right;color:var(--text-secondary)">TRANSACTION TOTAL</td>
    <td id="wh-rcv-grand" style="padding:6px 8px;text-align:right;font-family:var(--font-mono);font-size:13px;font-weight:700;color:var(--accent-green);white-space:nowrap">${grand>0?'₱'+_whFmt(grand):'—'}</td>
    <td></td>
  </tr>`;
}

// Called when qty or unit cost changes — clears lineTotal override, recalculates display
function _whRcvCalcFromQtyOrCost(idx){
  _whRcvLines[idx].lineTotal='';
  const ltEl=$(`#wh-rcv-lt-${idx}`);
  if(ltEl)ltEl.value='';
  _whUpdateRcvTotals();
}

// Called when Line Total is typed — back-calculates unit cost from qty
function _whRcvCalcUnitCost(idx){
  const lt=parseFloat(_whRcvLines[idx].lineTotal||0);
  const qty=parseFloat(_whRcvLines[idx].qty||0);
  if(lt>0&&qty>0){
    const uc=(lt/qty);
    _whRcvLines[idx].unitCost=uc.toFixed(4);
    const ucEl=$(`#wh-rcv-uc-${idx}`);
    if(ucEl)ucEl.value=uc.toFixed(4);
  }
  _whUpdateRcvTotals();
}

function _whUpdateRcvTotals(){
  let grand=0;
  _whRcvLines.forEach((ln,idx)=>{
    const lt=parseFloat(ln.lineTotal||0);
    const t=lt>0?lt:parseFloat(ln.qty||0)*parseFloat(ln.unitCost||0);
    grand+=t;
    const el=$(`#wh-rcv-rt-${idx}`);
    if(el)el.textContent=t>0?'₱'+_whFmt(t):'—';
  });
  const el=$('#wh-rcv-grand');
  if(el)el.textContent=grand>0?'₱'+_whFmt(grand):'—';
}

// ── BARCODE SCANNER ──────────────────────────────────────────
let _whScanStream=null;

async function _whScanBarcode(lineIdx){
  // Build modal
  const modalHtml=`
  <div class="modal-overlay open" data-dynamic="1" id="whBarcodeModal">
    <div class="modal" style="max-width:420px">
      <div class="modal-header">
        <div class="modal-title"><i class="fas fa-barcode" style="color:var(--accent-blue);margin-right:8px"></i>Scan Barcode</div>
        <button class="modal-close" onclick="_whStopScan()"><i class="fas fa-times"></i></button>
      </div>
      <div class="modal-body" style="padding:16px">
        <div id="wh-scan-status" style="font-size:12px;color:var(--text-muted);margin-bottom:10px;text-align:center">
          Starting camera…
        </div>
        <div style="position:relative;background:#000;border-radius:8px;overflow:hidden;aspect-ratio:4/3;margin-bottom:12px">
          <video id="wh-scan-video" autoplay playsinline muted style="width:100%;height:100%;object-fit:cover"></video>
          <div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;pointer-events:none">
            <div style="width:60%;height:40%;border:2px solid rgba(56,139,253,.8);border-radius:6px;box-shadow:0 0 0 9999px rgba(0,0,0,.4)"></div>
          </div>
        </div>
        <div style="text-align:center;margin-bottom:10px;font-size:11px;color:var(--text-muted)">— or enter barcode manually —</div>
        <div style="display:flex;gap:6px">
          <input id="wh-scan-manual" class="form-control" placeholder="Type or paste barcode…" style="flex:1"
            onkeydown="if(event.key==='Enter')_whScanManual(${lineIdx})">
          <button class="btn btn-primary btn-sm" onclick="_whScanManual(${lineIdx})">Find</button>
        </div>
      </div>
    </div>
  </div>`;
  document.body.insertAdjacentHTML('beforeend',modalHtml);

  // Try native BarcodeDetector (Chrome/Edge/Android)
  const video=document.getElementById('wh-scan-video');
  const status=document.getElementById('wh-scan-status');
  if(!('BarcodeDetector' in window)){
    status.textContent='Camera scanning not supported on this browser. Use manual entry below.';
    status.style.color='var(--accent-amber)';
    return;
  }
  try{
    _whScanStream=await navigator.mediaDevices.getUserMedia({video:{facingMode:'environment'}});
    video.srcObject=_whScanStream;
    status.textContent='Point camera at barcode…';
    status.style.color='var(--accent-green)';
    const detector=new BarcodeDetector({formats:['ean_13','ean_8','code_128','code_39','qr_code','upc_a','upc_e','data_matrix']});
    const scan=async()=>{
      if(!document.getElementById('whBarcodeModal'))return; // modal closed
      try{
        const barcodes=await detector.detect(video);
        if(barcodes.length){
          const code=barcodes[0].rawValue;
          _whStopScan();
          _whApplyScan(lineIdx,code);
          return;
        }
      }catch{}
      requestAnimationFrame(scan);
    };
    video.onloadedmetadata=()=>requestAnimationFrame(scan);
  }catch(e){
    status.textContent='Camera access denied. Use manual entry below.';
    status.style.color='var(--accent-red)';
  }
}

function _whStopScan(){
  if(_whScanStream){_whScanStream.getTracks().forEach(t=>t.stop());_whScanStream=null;}
  const m=document.getElementById('whBarcodeModal');if(m)m.remove();
}

function _whScanManual(lineIdx){
  const val=(document.getElementById('wh-scan-manual')?.value||'').trim();
  if(!val){showToast('Enter a barcode value','warning');return;}
  _whStopScan();
  _whApplyScan(lineIdx,val);
}

function _whApplyScan(lineIdx,code){
  // Match against item barcode field, then code field, then name
  const items=_whItems();
  const found=items.find(i=>i.barcode===code)||items.find(i=>i.code===code)||items.find(i=>i.name===code);
  if(!found){
    showToast(`No item found for barcode "${code}"`, 'warning', 5000);
    return;
  }
  _whRcvLines[lineIdx].itemId=found.id;
  _whRcvAutoFillCost(lineIdx);
  _whRefreshRcv();
  showToast(`Found: ${found.name}`,'success');
}

function _whRcvAutoFillCost(idx){
  const id=_whRcvLines[idx].itemId;
  if(!id)return;
  const item=_whItems().find(i=>i.id===id);
  if(item?.unitCost&&!_whRcvLines[idx].unitCost)_whRcvLines[idx].unitCost=item.unitCost;
  _whRefreshRcv();
}

function _whRefreshRcv(){
  const el=$('#wh-rcv-lines');
  if(el)el.innerHTML=_whRcvLinesHTML();
}

function _whIssLinesHTML(){
  const items=_whItems();
  if(!_whIssLines.length)_whIssLines=[{itemId:'',qty:''}];
  const rows=_whIssLines.map((ln,idx)=>{
    const q=ln.itemId?_whCalcQty(ln.itemId):null;
    const item=ln.itemId?items.find(i=>i.id===ln.itemId):null;
    const avail=q?q.qtyAvailable:null;
    const availColor=avail===null?'var(--text-secondary)':avail<=0?'var(--accent-red)':'var(--accent-green)';
    const wac=ln.itemId?_whCalcWAC(ln.itemId):0;
    const rowTotal=parseFloat(ln.qty||0)*wac;
    const itemOpts=items.map(i=>`<option value="${i.id}"${i.id===ln.itemId?' selected':''}>${i.name} (${i.code||i.id})</option>`).join('');
    return`<tr>
      <td style="padding:5px 4px">
        <select class="form-control" style="font-size:12px;width:100%" onchange="_whIssLines[${idx}].itemId=this.value;_whRefreshIss()">
          <option value="">— Select Item —</option>${itemOpts}
        </select>
      </td>
      <td style="padding:5px 4px;font-size:11px;text-align:center;width:70px">
        ${q?`<span style="color:${availColor};font-weight:700">${avail}</span><br><span style="color:var(--text-secondary);font-size:10px">${item?.unit||''}</span>`:'—'}
      </td>
      <td style="padding:5px 4px;width:75px">
        <input class="form-control" type="number" min="0.01" step="0.01" style="font-size:12px;width:100%" placeholder="0" value="${ln.qty||''}"
          oninput="_whIssLines[${idx}].qty=this.value;_whUpdateIssTotals()">
      </td>
      <td style="padding:5px 8px;width:85px;text-align:right;font-family:var(--font-mono);font-size:11px;color:var(--text-secondary);white-space:nowrap">
        ${wac>0?'₱'+_whFmt(wac):'—'}
      </td>
      <td id="wh-iss-rt-${idx}" style="padding:5px 8px;width:100px;text-align:right;font-family:var(--font-mono);font-size:12px;font-weight:600;color:var(--accent-amber);white-space:nowrap">
        ${rowTotal>0?'₱'+_whFmt(rowTotal):'—'}
      </td>
      <td style="padding:5px 4px;width:32px;text-align:center">
        ${_whIssLines.length>1?`<button class="btn btn-secondary btn-sm" style="padding:2px 6px;color:var(--accent-red)" onclick="_whIssLines.splice(${idx},1);_whRefreshIss()"><i class="fas fa-times"></i></button>`:''}
      </td>
    </tr>`;
  }).join('');
  const grand=_whIssLines.reduce((s,ln)=>s+parseFloat(ln.qty||0)*( ln.itemId?_whCalcWAC(ln.itemId):0),0);
  return rows+`
  <tr style="background:var(--bg-tertiary);border-top:2px solid var(--border)">
    <td colspan="4" style="padding:6px 8px;font-size:12px;font-weight:600;text-align:right;color:var(--text-secondary)">TRANSACTION TOTAL</td>
    <td id="wh-iss-grand" style="padding:6px 8px;text-align:right;font-family:var(--font-mono);font-size:13px;font-weight:700;color:var(--accent-amber);white-space:nowrap">${grand>0?'₱'+_whFmt(grand):'—'}</td>
    <td></td>
  </tr>`;
}

function _whUpdateIssTotals(){
  let grand=0;
  _whIssLines.forEach((ln,idx)=>{
    const wac=ln.itemId?_whCalcWAC(ln.itemId):0;
    const t=parseFloat(ln.qty||0)*wac;
    grand+=t;
    const el=$(`#wh-iss-rt-${idx}`);
    if(el)el.textContent=t>0?'₱'+fmtNum(t):'—';
  });
  const el=$('#wh-iss-grand');
  if(el)el.textContent=grand>0?'₱'+fmtNum(grand):'—';
}

function _whRefreshIss(){
  const el=$('#wh-iss-lines');
  if(el)el.innerHTML=_whIssLinesHTML();
}

// ── TAB: RECEIVE ─────────────────────────────────────────────
function _whReceiveHTML(){
  _whRcvLines=[{itemId:'',qty:'',unitCost:''}];
  _whRcvAttachments=[];
  const recent=_whTx().filter(t=>t.type==='receive').sort((a,b)=>new Date(b.date)-new Date(a.date)).slice(0,15);
  return`
  <div style="display:grid;grid-template-columns:minmax(0,1.2fr) minmax(0,0.8fr);gap:14px;align-items:start">
    <!-- LEFT: form -->
    <div class="card" style="padding:18px 20px;min-width:0">
      <div class="section-header" style="margin-bottom:14px">
        <div>
          <div style="font-size:13px;font-weight:700"><i class="fas fa-truck-loading" style="color:var(--accent-green);margin-right:8px"></i>Receive Goods</div>
          <div style="font-size:11px;color:var(--text-secondary);margin-top:2px">Post incoming stock — supports multiple items per delivery</div>
        </div>
        <button class="btn btn-secondary btn-sm" onclick="_whImportDeliveries()" title="Import historical delivery records from CSV"><i class="fas fa-file-import"></i> Import History</button>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:14px">
        <div class="form-group" style="margin:0">
          <label class="form-label">Date Received *</label>
          <input class="form-control" type="date" id="wh-rcv-date" value="${new Date().toISOString().slice(0,10)}">
        </div>
        <div class="form-group" style="margin:0">
          <label class="form-label">PO / DR Reference</label>
          <input class="form-control" id="wh-rcv-ref" placeholder="PO-0001 or DR#">
        </div>
        <div class="form-group" style="margin:0">
          <label class="form-label">Supplier / Vendor</label>
          <input class="form-control" id="wh-rcv-vendor" placeholder="Vendor name">
        </div>
        <div class="form-group" style="margin:0">
          <label class="form-label">Notes</label>
          <input class="form-control" id="wh-rcv-notes" placeholder="Lot number, condition…">
        </div>
      </div>
      <div style="margin-bottom:14px">
        <label class="form-label"><i class="fas fa-paperclip" style="margin-right:5px;color:var(--text-secondary)"></i>Attachments <span style="font-size:10px;color:var(--text-secondary);font-weight:400">(DR, PO, delivery photo — max 4 files)</span></label>
        <div id="wh-rcv-attach-area" ondragover="event.preventDefault();this.style.borderColor='var(--accent-blue)'" ondragleave="this.style.borderColor='var(--border)'" ondrop="_whRcvDropFiles(event)"
          style="border:2px dashed var(--border);border-radius:8px;padding:12px;text-align:center;cursor:pointer;transition:border-color .2s;color:var(--text-secondary);font-size:12px"
          onclick="$('#wh-rcv-files').click()">
          <i class="fas fa-cloud-upload-alt" style="font-size:20px;margin-bottom:4px;display:block"></i>
          Click or drag files here
          <input type="file" id="wh-rcv-files" multiple accept="image/*,.pdf,.doc,.docx,.xls,.xlsx" style="display:none" onchange="_whRcvAddFiles(this.files)">
        </div>
        <div id="wh-rcv-attach-list" style="margin-top:8px;display:flex;flex-direction:column;gap:4px"></div>
      </div>
      <div style="margin-bottom:10px">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px">
          <div style="font-size:12px;font-weight:600;color:var(--text-secondary)"><i class="fas fa-list" style="margin-right:6px"></i>Line Items</div>
          <button class="btn btn-secondary btn-sm" onclick="_whRcvLines.push({itemId:'',qty:'',unitCost:''});_whRefreshRcv()">
            <i class="fas fa-plus"></i> Add Item
          </button>
        </div>
        <div style="border:1px solid var(--border);border-radius:6px;overflow:hidden">
          <table style="width:100%;border-collapse:collapse;table-layout:fixed">
            <thead>
              <tr style="background:var(--bg-tertiary)">
                <th style="padding:7px 8px;font-size:11px;font-weight:600;color:var(--text-secondary);text-align:left">Item</th>
                <th style="padding:7px 8px;width:36px" title="Scan barcode"><i class="fas fa-barcode" style="color:var(--text-muted);font-size:11px"></i></th>
                <th style="padding:7px 8px;font-size:11px;font-weight:600;color:var(--text-secondary);text-align:left;width:75px">Qty</th>
                <th style="padding:7px 8px;font-size:11px;font-weight:600;color:var(--text-secondary);text-align:left;width:100px">Unit Cost (₱)</th>
                <th style="padding:7px 8px;font-size:11px;font-weight:600;color:var(--accent-green);text-align:left;width:105px">Line Total (₱) <i class="fas fa-pencil-alt" style="font-size:9px;opacity:.7" title="Enter total — unit cost auto-calculates"></i></th>
                <th style="padding:7px 8px;font-size:11px;font-weight:600;color:var(--text-secondary);text-align:right;width:110px">Computed</th>
                <th style="width:32px"></th>
              </tr>
            </thead>
            <tbody id="wh-rcv-lines">${_whRcvLinesHTML()}</tbody>
          </table>
        </div>
      </div>
      <button class="btn btn-primary" style="width:100%" onclick="_whSaveReceive()">
        <i class="fas fa-save"></i> Post Receipt
      </button>
    </div>
    <!-- RIGHT: recent receipts -->
    <div>
      <div style="font-size:12px;font-weight:700;color:var(--text-secondary);margin-bottom:10px;text-transform:uppercase;letter-spacing:.5px">
        <i class="fas fa-history" style="margin-right:6px"></i>Recent Receipts
      </div>
      ${recent.length?`<div style="display:flex;flex-direction:column;gap:7px">
        ${recent.map(t=>{
          const item=_whItems().find(i=>i.id===t.itemId);
          const val=t.qty*(t.unitCost||item?.unitCost||0);
          return`<div class="card" style="padding:10px 14px;border-left:3px solid var(--accent-green)">
            <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px">
              <div style="min-width:0">
                <div style="font-weight:600;font-size:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${item?.name||t.itemId}</div>
                <div style="font-size:10px;color:var(--text-secondary);margin-top:2px">${t.date||''} · ${t.vendor||'—'}</div>
                <div style="font-size:10px;color:var(--text-secondary)">${t.ref||''}</div>
              </div>
              <div style="text-align:right;flex-shrink:0">
                <div style="font-family:var(--font-mono);color:var(--accent-green);font-size:13px;font-weight:700">+${t.qty} ${item?.unit||''}</div>
                ${val?`<div style="font-size:10px;color:var(--text-secondary)">₱${fmtNum(val)}</div>`:''}
              </div>
            </div>
          </div>`;
        }).join('')}
      </div>`:`<div class="empty-state" style="padding:30px"><i class="fas fa-truck"></i><p>No receipts yet</p></div>`}
    </div>
  </div>`;
}

// ── TAB: ISSUE / RETURN ──────────────────────────────────────
function _whIssueHTML(){
  _whIssLines=[{itemId:'',qty:''}];
  const recent=_whTx().filter(t=>t.type==='issue'||t.type==='issue-shop'||t.type==='issue-enduser'||t.type==='return'||t.type==='adjust').sort((a,b)=>new Date(b.date)-new Date(a.date)).slice(0,15);
  const projects=(AppState.data.projects||[]).filter(p=>!p._deleted&&p.status!=='completed');
  return`
  <div style="display:grid;grid-template-columns:minmax(0,1.2fr) minmax(0,0.8fr);gap:14px;align-items:start">
    <!-- LEFT: form -->
    <div class="card" style="padding:18px 20px;min-width:0">
      <div class="section-header" style="margin-bottom:14px">
        <div>
          <div style="font-size:13px;font-weight:700"><i class="fas fa-dolly" style="color:var(--accent-amber);margin-right:8px"></i>Issue / Return Stock</div>
          <div style="font-size:11px;color:var(--text-secondary);margin-top:2px">Post multiple items in a single transaction batch</div>
        </div>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:14px">
        <div class="form-group" style="margin:0">
          <label class="form-label">Transaction Type *</label>
          <select class="form-control" id="wh-iss-type">
            <option value="issue">Issue — Send to Site</option>
            <option value="issue-shop">Issue — Send to Shop</option>
            <option value="issue-enduser">Issue — To End User</option>
            <option value="return">Return — Back to Warehouse</option>
            <option value="adjust">Adjustment — Inventory Correction</option>
          </select>
        </div>
        <div class="form-group" style="margin:0">
          <label class="form-label">Business Unit (Form)</label>
          <select class="form-control" id="wh-iss-bu">
            ${_whForms().map(f=>`<option value="${f.id}">${f.companyName} — ${f.docControlNo}</option>`).join('')}
          </select>
        </div>
        <div class="form-group" style="margin:0;grid-column:1/-1">
          <label class="form-label">Project</label>
          <select class="form-control" id="wh-iss-proj">
            <option value="">— No project —</option>
            ${projects.map(p=>{const label=`${p.id} — ${p.name||''}`;return`<option value="${p.id}">${label.length>60?label.slice(0,60)+'…':label}</option>`;}).join('')}
          </select>
        </div>
        <div class="form-group" style="margin:0">
          <label class="form-label">Date *</label>
          <input class="form-control" type="date" id="wh-iss-date" value="${new Date().toISOString().slice(0,10)}">
        </div>
        <div class="form-group" style="margin:0">
          <label class="form-label">Issued / Returned By</label>
          <input class="form-control" id="wh-iss-by" placeholder="Name" value="${AppState.currentUser?.displayName||''}">
        </div>
        <div class="form-group" style="margin:0;grid-column:1/-1">
          <label class="form-label">Notes / Work Order Reference</label>
          <input class="form-control" id="wh-iss-notes" placeholder="Work order, location, reason…">
        </div>
      </div>
      <div style="margin-bottom:10px">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px">
          <div style="font-size:12px;font-weight:600;color:var(--text-secondary)"><i class="fas fa-list" style="margin-right:6px"></i>Line Items</div>
          <button class="btn btn-secondary btn-sm" onclick="_whIssLines.push({itemId:'',qty:''});_whRefreshIss()">
            <i class="fas fa-plus"></i> Add Item
          </button>
        </div>
        <div style="border:1px solid var(--border);border-radius:6px;overflow:hidden">
          <table style="width:100%;border-collapse:collapse;table-layout:fixed">
            <thead>
              <tr style="background:var(--bg-tertiary)">
                <th style="padding:7px 8px;font-size:11px;font-weight:600;color:var(--text-secondary);text-align:left">Item</th>
                <th style="padding:7px 8px;font-size:11px;font-weight:600;color:var(--text-secondary);text-align:center;width:70px">Available</th>
                <th style="padding:7px 8px;font-size:11px;font-weight:600;color:var(--text-secondary);text-align:left;width:75px">Qty</th>
                <th style="padding:7px 8px;font-size:11px;font-weight:600;color:var(--text-secondary);text-align:right;width:85px">WAC/Unit</th>
                <th style="padding:7px 8px;font-size:11px;font-weight:600;color:var(--text-secondary);text-align:right;width:90px">Line Total</th>
                <th style="width:32px"></th>
              </tr>
            </thead>
            <tbody id="wh-iss-lines">${_whIssLinesHTML()}</tbody>
          </table>
        </div>
      </div>
      <button class="btn btn-primary" style="width:100%" onclick="_whSaveIssue()">
        <i class="fas fa-check"></i> Post Transaction
      </button>
    </div>
    <!-- RIGHT: recent -->
    <div>
      <div style="font-size:12px;font-weight:700;color:var(--text-secondary);margin-bottom:10px;text-transform:uppercase;letter-spacing:.5px">
        <i class="fas fa-history" style="margin-right:6px"></i>Recent Transactions
      </div>
      ${recent.length?`<div style="display:flex;flex-direction:column;gap:7px">
        ${recent.map(t=>{
          const item=_whItems().find(i=>i.id===t.itemId);
          const isReturn=t.type==='return';
          const isAdj=t.type==='adjust';
          const color=isReturn?'var(--accent-green)':isAdj?'#39d3f2':'var(--accent-amber)';
          const typeTag={issue:'ISSUE→SITE','issue-shop':'ISSUE→SHOP','issue-enduser':'ISSUE→USER',return:'RETURN',adjust:'ADJUST'}[t.type]||t.type;
          const sign=isReturn?'+':isAdj?(t.qty>=0?'+':''):'−';
          const label={issue:'ISSUE',return:'RETURN',adjust:'ADJUST'}[t.type]||t.type.toUpperCase();
          return`<div class="card" style="padding:10px 14px;border-left:3px solid ${color}">
            <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px">
              <div style="min-width:0">
                <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap">
                  <span style="font-weight:600;font-size:12px">${item?.name||t.itemId}</span>
                  <span class="badge" style="background:${color}22;color:${color};border:1px solid ${color}44;font-size:9px">${label}</span>
                </div>
                <div style="font-size:10px;color:var(--text-secondary);margin-top:2px">${t.date||''} · ${t.issuedBy||t.by||'—'}</div>
                ${t.projectId?`<div style="font-size:10px;color:var(--text-secondary)">${t.projectId}</div>`:''}
              </div>
              <div style="font-family:var(--font-mono);color:${color};font-size:13px;font-weight:700;flex-shrink:0">${sign}${Math.abs(t.qty)} ${item?.unit||''}</div>
            </div>
          </div>`;
        }).join('')}
      </div>`:`<div class="empty-state" style="padding:30px"><i class="fas fa-dolly"></i><p>No transactions yet</p></div>`}
    </div>
  </div>`;
}

function _whFillIssueInfo(){}

// ── TAB: ISSUANCE REQUESTS ───────────────────────────────────
function _whRequestsHTML(){
  const statuses=['all','pending','approved','rejected','pr_started','released'];
  let reqs=_whReq();
  if(_whReqStatus!=='all')reqs=reqs.filter(r=>r.status===_whReqStatus);
  reqs=reqs.sort((a,b)=>{
    // Sort urgent first, then by date
    const p={urgent:0,normal:1,low:2};
    const pa=p[a.priority||'normal']??1, pb=p[b.priority||'normal']??1;
    if(pa!==pb)return pa-pb;
    return new Date(b.requestedAt)-new Date(a.requestedAt);
  });

  const statusColor={pending:'var(--accent-amber)',approved:'var(--accent-blue)',rejected:'var(--accent-red)',released:'var(--accent-green)',pr_started:'#bc8cff'};
  const statusLabel={pending:'Pending',approved:'Approved',rejected:'Rejected',released:'Released',pr_started:'PR Started'};
  const priorityBadge={urgent:'<span style="font-size:9px;font-weight:700;color:var(--accent-red);background:rgba(220,53,69,.12);border:1px solid rgba(220,53,69,.3);border-radius:4px;padding:1px 5px">🔴 URGENT</span>',normal:'',low:'<span style="font-size:9px;color:var(--accent-green);background:rgba(40,167,69,.1);border:1px solid rgba(40,167,69,.25);border-radius:4px;padding:1px 5px">🟢 Low</span>'};
  const rows=reqs.map(r=>{
    const item=_whItems().find(i=>i.id===r.itemId);
    const isStock=!!item;
    const displayName=item?.name||r.description||r.itemId||'—';
    const displayCat=item?.category||r.resourceType||'—';
    const q=isStock?_whCalcQty(r.itemId):{qtyOnHand:0,qtyAvailable:0};
    const hasStock=isStock&&q.qtyAvailable>=r.qty;
    const _whCanManage=typeof hasModulePermission==='function'?hasModulePermission('warehouse','manage'):isAdminUser();
    const canApprove=_whCanManage&&r.status==='pending';
    const canRelease=_whCanManage&&r.status==='approved'&&isStock&&hasStock;
    const canStartPR=_whCanManage&&(r.status==='pending'||r.status==='approved')&&!r.prId;
    const sc=statusColor[r.status]||'#555';
    return`<tr>
      <td style="font-family:var(--font-mono);font-size:10px;color:var(--text-secondary)">
        ${r.id}
        ${r.sourceLog?`<div style="font-size:9px;color:var(--accent-blue);margin-top:2px"><i class="fas fa-link" style="margin-right:3px"></i>${r.sourceLog}</div>`:''}
      </td>
      <td>
        <div style="display:flex;align-items:center;gap:5px;margin-bottom:2px">
          <span style="font-weight:600;font-size:12px">${displayName}</span>
          ${priorityBadge[r.priority||'normal']||''}
        </div>
        <div style="font-size:10px;color:var(--text-secondary);display:flex;gap:6px;flex-wrap:wrap;margin-top:1px">
          <span>${displayCat}</span>
          ${isStock?`<span style="color:${hasStock?'var(--accent-green)':'var(--accent-red)'}">● ${q.qtyAvailable} avail</span>`:`<span style="color:var(--accent-amber)">● Not in stock</span>`}
        </div>
      </td>
      <td style="font-family:var(--font-mono);text-align:right">${r.qty} ${r.unit||item?.unit||''}</td>
      <td style="font-size:11px">${r.projectId||'—'}</td>
      <td style="font-size:11px">${r.requestedBy||'—'}<div style="font-size:10px;color:var(--text-secondary)">${(r.requestedAt||'').slice(0,10)}</div></td>
      <td style="font-size:11px;max-width:140px;white-space:normal">
        ${r.reason||'—'}
        ${r.location?`<div style="font-size:10px;color:var(--accent-blue);margin-top:2px"><i class="fas fa-map-marker-alt" style="margin-right:3px"></i>${r.location}</div>`:''}
      </td>
      <td>
        <span class="badge" style="background:${sc}22;color:${sc};border:1px solid ${sc}44;font-size:10px">
          ${statusLabel[r.status]||r.status}
        </span>
        ${r.prId?`<div style="font-size:9px;color:#bc8cff;margin-top:2px"><i class="fas fa-file-alt" style="margin-right:3px"></i>${r.prId}</div>`:''}
      </td>
      <td>
        <div style="display:flex;gap:4px;flex-wrap:wrap">
          ${canApprove&&isStock?`<button class="btn btn-secondary btn-sm" style="padding:2px 7px;font-size:11px;color:var(--accent-green)" onclick="_whApproveReq('${r.id}',true)"><i class="fas fa-check"></i> Approve</button>
          <button class="btn btn-secondary btn-sm" style="padding:2px 7px;font-size:11px;color:var(--accent-red)" onclick="_whApproveReq('${r.id}',false)"><i class="fas fa-times"></i> Reject</button>`:''}
          ${canRelease?`<button class="btn btn-primary btn-sm" style="padding:2px 7px;font-size:11px" onclick="_whReleaseReq('${r.id}')"><i class="fas fa-dolly"></i> Release</button>`:''}
          ${canStartPR?`<button class="btn btn-secondary btn-sm" style="padding:2px 7px;font-size:11px;color:#bc8cff" onclick="_whStartPR('${r.id}')"><i class="fas fa-file-alt"></i> Start PR</button>`:''}
          ${r.status==='released'?`<span style="font-size:10px;color:var(--text-secondary)">Released ${(r.releasedAt||'').slice(0,10)}</span>`:''}
          ${r.status==='rejected'?`<span style="font-size:10px;color:var(--accent-red)">${(r.reviewedAt||'').slice(0,10)}</span>`:''}
        </div>
      </td>
    </tr>`;
  }).join('');

  return`
  <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:12px;flex-wrap:wrap">
    <div style="display:flex;gap:6px;flex-wrap:wrap">
      ${statuses.map(s=>`<button class="btn btn-sm ${_whReqStatus===s?'btn-primary':'btn-secondary'}" onclick="_whReqStatus='${s}';_whRenderTab()">${s==='all'?'All':(statusLabel[s]||s)}</button>`).join('')}
    </div>
    <button class="btn btn-primary btn-sm" onclick="_whShowAddRequest()"><i class="fas fa-plus"></i> New Request</button>
  </div>
  <div class="table-wrap">
  <table>
    <thead><tr><th>ID</th><th>ITEM / DESCRIPTION</th><th style="text-align:right">QTY</th><th>PROJECT</th><th>REQUESTED BY</th><th>REASON</th><th>STATUS</th><th>ACTIONS</th></tr></thead>
    <tbody>${rows||`<tr><td colspan="8"><div class="empty-state"><i class="fas fa-clipboard-list"></i><p>No issuance requests</p></div></td></tr>`}</tbody>
  </table>
  </div>`;
}

// ── TAB: FORM SETUP ──────────────────────────────────────────
function _whFormsHTML(){
  // Load from SP only if cache is empty or older than 5 minutes — never re-render if modal is open
  const cacheStale=!_whFormsCache||!_whFormsCacheTime||(Date.now()-_whFormsCacheTime>300000);
  if(cacheStale&&!_whFormsLoading){
    _whLoadFormsFromSP().then(()=>{
      const modalOpen=document.getElementById('wh-form-modal')?.style.display==='block';
      if(_whTab==='forms'&&!modalOpen)_whRenderTab();
    });
  }
  const forms=_whForms();
  const cards=forms.map(f=>`
    <div class="card" style="margin-bottom:12px;padding:14px 16px">
      <div style="display:flex;align-items:flex-start;gap:14px">
        <div style="width:72px;height:60px;border:1px solid var(--border);border-radius:6px;display:flex;align-items:center;justify-content:center;overflow:hidden;background:var(--bg-secondary);flex-shrink:0">
          ${f.logoDataUrl?`<img src="${f.logoDataUrl}" style="max-width:70px;max-height:58px;object-fit:contain">`:`<i class="fas fa-image" style="font-size:22px;color:var(--text-secondary)"></i>`}
        </div>
        <div style="flex:1;min-width:0">
          <div style="font-size:14px;font-weight:700;margin-bottom:2px">${f.name}</div>
          <div style="font-size:12px;color:var(--text-secondary)">${f.companyName} ${f.companySub}</div>
          <div style="font-size:11px;color:var(--text-secondary);margin-top:4px">
            ${f.docControlNo} &nbsp;|&nbsp; ${f.revisionNo} &nbsp;|&nbsp; Eff: ${f.effectiveDate}
          </div>
        </div>
        <div style="display:flex;gap:6px;flex-shrink:0">
          <button class="btn btn-secondary btn-sm" onclick="_whEditForm('${f.id}')"><i class="fas fa-edit"></i> Edit</button>
          <button class="btn btn-secondary btn-sm" style="color:var(--danger)" onclick="_whDeleteForm('${f.id}')"><i class="fas fa-trash"></i></button>
        </div>
      </div>
    </div>`).join('');
  return`
    <div style="max-width:640px">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px">
        <div>
          <div style="font-size:15px;font-weight:700">Withdrawal Form Templates</div>
          <div style="font-size:12px;color:var(--text-secondary);margin-top:2px">Configure company forms used when printing withdrawal slips</div>
        </div>
        <button class="btn btn-primary btn-sm" onclick="_whEditForm(null)"><i class="fas fa-plus"></i> Add Form</button>
      </div>
      ${cards||'<div class="empty-state"><i class="fas fa-id-card"></i><p>No forms configured</p></div>'}
    </div>
    <div id="wh-form-modal" style="display:none"></div>`;
}

function _whEditForm(id){
  const f=id?(_whForms().find(x=>x.id===id)||{}):
    {id:'form-'+Date.now(),name:'',companyName:'',companySub:'',logoDataUrl:'',docControlNo:'',revisionNo:'',effectiveDate:''};
  const el=$('#wh-form-modal');if(!el)return;
  el.style.display='block';
  el.innerHTML=`
    <div style="position:fixed;inset:0;background:rgba(0,0,0,0.45);z-index:9999;display:flex;align-items:center;justify-content:center" onclick="if(event.target===this)_whCloseFormModal()">
      <div class="card" style="width:480px;max-width:95vw;padding:20px;max-height:90vh;overflow-y:auto" onclick="event.stopPropagation()">
        <div style="font-size:15px;font-weight:700;margin-bottom:14px">${id?'Edit Form':'New Form'}</div>
        <div class="form-group">
          <label class="form-label">Form Name (display label)</label>
          <input class="form-control" id="wff-name" value="${f.name||''}" placeholder="e.g. SHIC Withdrawal Form">
        </div>
        <div class="form-group">
          <label class="form-label">Company Name</label>
          <input class="form-control" id="wff-coname" value="${f.companyName||''}" placeholder="e.g. SYNERCORE">
        </div>
        <div class="form-group">
          <label class="form-label">Company Sub-name / Description</label>
          <input class="form-control" id="wff-cosub" value="${f.companySub||''}" placeholder="e.g. HEAVY INDUSTRIES CORP.">
        </div>
        <div class="form-group">
          <label class="form-label">Doc. Control No.</label>
          <input class="form-control" id="wff-docno" value="${f.docControlNo||''}" placeholder="e.g. SHIC-WHD-F-003">
        </div>
        <div class="form-group">
          <label class="form-label">Revision No.</label>
          <input class="form-control" id="wff-revno" value="${f.revisionNo||''}" placeholder="e.g. REV.000">
        </div>
        <div class="form-group">
          <label class="form-label">Effective Date</label>
          <input class="form-control" id="wff-effdate" value="${f.effectiveDate||''}" placeholder="e.g. January 4, 2025">
        </div>
        <div class="form-group">
          <label class="form-label">Company Logo</label>
          ${f.logoDataUrl?`<div style="margin-bottom:8px"><img src="${f.logoDataUrl}" style="max-height:60px;border:1px solid var(--border);border-radius:4px;padding:4px"></div>`:''}
          <input type="file" class="form-control" id="wff-logo" accept="image/*" style="padding:4px">
          <div style="font-size:11px;color:var(--text-secondary);margin-top:4px">Upload PNG/JPG logo. Leave blank to keep current.</div>
        </div>
        <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:16px">
          <button class="btn btn-secondary" onclick="_whCloseFormModal()">Cancel</button>
          <button class="btn btn-primary" onclick="_whSaveFormEntry('${f.id}')">Save Form</button>
        </div>
      </div>
    </div>`;
}

function _whCloseFormModal(){
  const el=$('#wh-form-modal');if(el)el.style.display='none';
}

function _whSaveFormEntry(id){
  const name=$('#wff-name')?.value.trim();
  const coName=$('#wff-coname')?.value.trim();
  const coSub=$('#wff-cosub')?.value.trim();
  const docNo=$('#wff-docno')?.value.trim();
  const revNo=$('#wff-revno')?.value.trim();
  const effDate=$('#wff-effdate')?.value.trim();
  if(!name||!coName){showToast('Form Name and Company Name are required','error');return;}
  const logoFile=$('#wff-logo')?.files?.[0];
  const save=async(logoDataUrl)=>{
    if(!_whFormsCache)_whFormsCache=_whForms().slice();
    const idx=_whFormsCache.findIndex(f=>f.id===id);
    const existing=idx>=0?_whFormsCache[idx]:{};
    const updated={...existing,id,name,companyName:coName,companySub:coSub,docControlNo:docNo,revisionNo:revNo,effectiveDate:effDate,
      logoDataUrl:logoDataUrl!==undefined?logoDataUrl:(existing.logoDataUrl||'')};
    if(idx>=0)_whFormsCache[idx]=updated;
    else _whFormsCache.push(updated);
    _whCloseFormModal();
    _whRenderTab();
    showToast('Saving to SharePoint...','info',2000);
    try{
      await spSaveFormTemplate(updated);
      showToast('Form saved and shared with all users','success');
    }catch(e){showToast('Saved locally — SP sync failed: '+e.message,'warning',5000);}
  };
  if(logoFile){
    const reader=new FileReader();
    reader.onload=e=>save(e.target.result);
    reader.readAsDataURL(logoFile);
  }else{
    save(undefined);
  }
}

async function _whDeleteForm(id){
  if(!confirm('Delete this form template?'))return;
  const form=(_whFormsCache||_whForms()).find(f=>f.id===id);
  if(!_whFormsCache)_whFormsCache=_whForms().slice();
  _whFormsCache=_whFormsCache.filter(f=>f.id!==id);
  _whRenderTab();
  if(form?._spId){
    try{await spDeleteFormTemplate(form._spId);showToast('Form deleted','success');}
    catch(e){showToast('Deleted locally — SP sync failed: '+e.message,'warning',5000);}
  }else{showToast('Form deleted','success');}
}

// ── PRINT HELPERS ────────────────────────────────────────────
function _whPrintReport(title, tableHTML, summaryHTML){
  const form=_whForms()[0]||{};
  const logo=form.logoDataUrl?`<img src="${form.logoDataUrl}" style="height:50px;object-fit:contain">`:
    `<div style="font-size:16px;font-weight:700">${form.companyName||AppState.data.settings?.companyName||'SYNERCORE'}</div>`;
  const w=window.open('','_blank','width=900,height=700');
  w.document.write(`<!DOCTYPE html><html><head><title>${title}</title>
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:Arial,sans-serif;font-size:11px;color:#111;padding:20px}
    h1{font-size:14px;margin-bottom:4px}
    .header{display:flex;align-items:flex-start;justify-content:space-between;border-bottom:2px solid #000;padding-bottom:10px;margin-bottom:14px}
    .meta{font-size:10px;color:#555;line-height:1.6}
    table{width:100%;border-collapse:collapse;margin-bottom:10px}
    th{background:#222;color:#fff;padding:5px 8px;text-align:left;font-size:10px}
    td{padding:4px 8px;border-bottom:1px solid #eee;font-size:10px}
    tr:nth-child(even){background:#f9f9f9}
    .summary{margin-top:10px;font-size:11px}
    @media print{body{padding:10px}}
  </style></head><body>
  <div class="header">
    ${logo}
    <div style="text-align:right">
      <h1>${title}</h1>
      <div class="meta">Printed: ${new Date().toLocaleString('en-PH')}<br>By: ${AppState.currentUser?.displayName||''}</div>
    </div>
  </div>
  ${tableHTML}
  ${summaryHTML||''}
  <script>window.onload=()=>{window.print();}<\/script>
  </body></html>`);
  w.document.close();
}

function _whPrintLedger(){
  const all=_whTx().sort((a,b)=>new Date(b.date)-new Date(a.date));
  const items=_whItems();
  const shown=_whTxItemFilter==='all'?all:all.filter(t=>t.itemId===_whTxItemFilter);
  const filterLabel=_whTxItemFilter==='all'?'All Items':(items.find(i=>i.id===_whTxItemFilter)?.name||_whTxItemFilter);
  const typeSign=t=>(t.type==='issue'||t.type==='issue-shop'||t.type==='issue-enduser')?'-':'+';
  const rows=shown.map(t=>{
    const item=items.find(i=>i.id===t.itemId);
    return`<tr>
      <td>${(t.date||'').slice(0,10)}</td>
      <td style="text-transform:uppercase">${t.type}</td>
      <td>${item?.name||t.itemId}</td>
      <td style="text-align:right">${typeSign(t)}${Math.abs(t.qty)} ${item?.unit||''}</td>
      <td>${t.projectId||'—'}</td>
      <td>${t.vendor||t.issuedBy||t.by||'—'}</td>
      <td>${t.ref||'—'}</td>
      <td>${t.notes||'—'}</td>
    </tr>`;
  }).join('');
  const tableHTML=`<table><thead><tr><th>DATE</th><th>TYPE</th><th>ITEM</th><th style="text-align:right">QTY</th><th>PROJECT</th><th>VENDOR/BY</th><th>REF</th><th>NOTES</th></tr></thead><tbody>${rows}</tbody></table>`;
  const totalVal=shown.reduce((s,t)=>s+(t.qty*(t.unitCost||0)),0);
  _whPrintReport(`Transaction Ledger — ${filterLabel}`,tableHTML,`<div class="summary"><strong>Total records:</strong> ${shown.length} &nbsp; <strong>Total value:</strong> ₱${fmtNum(Math.round(totalVal))}</div>`);
}

function _whPrintItemsReport(){
  const items=_whItems();
  const rows=items.map(i=>{
    const q=_whCalcQty(i.id);
    return`<tr><td>${i.code||i.id}</td><td>${i.name}</td><td>${i.category||'—'}</td><td style="text-align:right">${q.qtyOnHand}</td><td style="text-align:right">${q.qtyAvailable}</td><td>${i.unit||'ea'}</td><td style="text-align:right">₱${fmtNum(i.unitCost||0)}</td><td style="text-align:right">₱${fmtNum(q.qtyOnHand*(i.unitCost||0))}</td><td>${i.rack||''}${i.row?' R'+i.row:''}</td></tr>`;
  }).join('');
  const total=items.reduce((s,i)=>s+((_whCalcQty(i.id).qtyOnHand)*(i.unitCost||0)),0);
  const tableHTML=`<table><thead><tr><th>CODE</th><th>ITEM</th><th>CATEGORY</th><th style="text-align:right">ON HAND</th><th style="text-align:right">AVAILABLE</th><th>UNIT</th><th style="text-align:right">UNIT COST</th><th style="text-align:right">TOTAL VALUE</th><th>LOCATION</th></tr></thead><tbody>${rows}</tbody></table>`;
  _whPrintReport('Warehouse Stock Report',tableHTML,`<div class="summary"><strong>Total items:</strong> ${items.length} &nbsp; <strong>Total inventory value:</strong> ₱${fmtNum(Math.round(total))}</div>`);
}

// ── TAB: LEDGER ──────────────────────────────────────────────
function _whLedgerHTML(){
  const all=_whTx().sort((a,b)=>new Date(b.date)-new Date(a.date));
  const items=_whItems();
  const typeColor={receive:'var(--accent-green)',issue:'var(--accent-amber)',return:'var(--accent-blue)',adjust:'#39d3f2'};

  let filterItem=_whTxItemFilter;
  let shown=filterItem==='all'?all:all.filter(t=>t.itemId===filterItem);

  const rows=shown.slice(0,100).map(t=>{
    const item=items.find(i=>i.id===t.itemId);
    const col=typeColor[t.type]||'#aaa';
    const isIss=t.type==='issue'||t.type==='issue-shop'||t.type==='issue-enduser';
    const sign=isIss?'−':'+';
    const canPrint=isIss||t.type==='return'||t.type==='adjust';
    return`<tr>
      <td style="font-size:10px;color:var(--text-secondary);font-family:var(--font-mono)">${(t.date||'').slice(0,10)}</td>
      <td><span class="badge" style="background:${col}22;color:${col};border:1px solid ${col}44;font-size:10px;text-transform:uppercase">${t.type}</span></td>
      <td style="font-size:12px;font-weight:600">${item?.name||t.itemId}</td>
      <td style="text-align:right;font-family:var(--font-mono);font-weight:700;color:${col}">${sign}${Math.abs(t.qty)} ${item?.unit||''}</td>
      <td style="font-size:11px">${t.projectId||'—'}</td>
      <td style="font-size:11px">${t.vendor||t.issuedBy||t.by||'—'}</td>
      <td style="font-size:11px">${t.ref||'—'}</td>
      <td style="font-size:11px;color:var(--text-secondary)">${t.notes||'—'}</td>
      <td style="padding:4px 6px">
        <div style="display:flex;gap:4px">
          ${canPrint?`<button class="btn btn-secondary btn-sm" style="padding:2px 7px" title="Print slip" onclick="_whReprintTx('${t.id}')"><i class="fas fa-print"></i></button>`:''}
          ${(t.attachments&&t.attachments.length)?`<button class="btn btn-secondary btn-sm" style="padding:2px 7px;color:var(--accent-blue)" title="${t.attachments.length} attachment(s)" onclick="_whViewAttachments('${t.id}')"><i class="fas fa-paperclip"></i><span style="font-size:9px;margin-left:2px">${t.attachments.length}</span></button>`:''}
        </div>
      </td>
    </tr>`;
  }).join('');

  return`
  <div style="display:flex;gap:8px;margin-bottom:10px;align-items:center">
    <select class="form-control" style="width:220px" onchange="_whTxItemFilter=this.value;_whRenderTab()">
      <option value="all">All Items</option>
      ${items.map(i=>`<option value="${i.id}" ${filterItem===i.id?'selected':''}>${i.name}</option>`).join('')}
    </select>
    <button class="btn btn-secondary btn-sm" onclick="_whExportLedger()"><i class="fas fa-download"></i> Export Ledger</button>
    <button class="btn btn-secondary btn-sm" onclick="_whPrintLedger()"><i class="fas fa-print"></i> Print</button>
  </div>
  <div class="table-wrap">
  <table>
    <thead><tr><th>DATE</th><th>TYPE</th><th>ITEM</th><th style="text-align:right">QTY</th><th>PROJECT</th><th>VENDOR / BY</th><th>REFERENCE</th><th>NOTES</th><th></th></tr></thead>
    <tbody>${rows||`<tr><td colspan="9"><div class="empty-state"><i class="fas fa-list-alt"></i><p>No transactions yet</p></div></td></tr>`}</tbody>
  </table>
  </div>
  ${shown.length>100?`<div style="text-align:center;padding:10px;color:var(--text-secondary);font-size:12px">Showing 100 of ${shown.length} records</div>`:''}`;
}

function _whViewAttachments(txId){
  const tx=_whTx().find(t=>t.id===txId);
  if(!tx||!tx.attachments?.length)return;
  const list=tx.attachments.map(a=>{
    const icon=a.name.match(/\.(jpe?g|png|gif|webp)$/i)?'fa-file-image':a.name.match(/\.pdf$/i)?'fa-file-pdf':a.name.match(/\.xlsx?$/i)?'fa-file-excel':'fa-file-alt';
    const kb=a.size?(a.size/1024).toFixed(0)+' KB':'';
    return`<a href="${a.url}" target="_blank" rel="noopener" style="display:flex;align-items:center;gap:10px;padding:10px 12px;background:var(--bg-secondary);border-radius:7px;text-decoration:none;color:var(--text-primary);border:1px solid var(--border)">
      <i class="fas ${icon}" style="font-size:18px;color:var(--accent-blue);flex-shrink:0"></i>
      <div style="flex:1;min-width:0">
        <div style="font-size:12px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${a.name}</div>
        ${kb?`<div style="font-size:10px;color:var(--text-secondary)">${kb}</div>`:''}
      </div>
      <i class="fas fa-external-link-alt" style="color:var(--text-secondary);font-size:11px;flex-shrink:0"></i>
    </a>`;
  }).join('');
  showModal('Attachments — '+txId,`
    <div style="padding:4px 0;display:flex;flex-direction:column;gap:8px">${list}</div>
    <div style="font-size:11px;color:var(--text-secondary);margin-top:10px"><i class="fas fa-info-circle"></i> Files open in SharePoint. You may need to sign in.</div>
  `);
}

function _whReprintTx(txId){
  const tx=_whTx().find(t=>t.id===txId);
  if(!tx)return;
  const item=_whItems().find(i=>i.id===tx.itemId);
  const wac=tx.unitCost||_whCalcWAC(tx.itemId)||0;
  const qty=Math.abs(tx.qty);
  const buId=tx.bu||_whForms()[0]?.id||'form-shic';
  const formCfg=_whForms().find(f=>f.id===buId)||_whForms()[0];
  const slipData={
    type:tx.type,
    bu:buId,formCfg,
    mcwfNo:_whGenMcwfNo(tx.date),
    projId:tx.projectId,
    date:tx.date,
    by:tx.issuedBy||tx.by||tx.vendor||'',
    notes:tx.notes||tx.ref||'',
    items:[{name:item?.name||tx.itemId,code:item?.code||tx.itemId,unit:item?.unit||'',qty,wac,total:qty*wac,stock:_whCalcQty(tx.itemId)}],
    grand:qty*wac,
    postedAt:tx.postedAt?new Date(tx.postedAt).toLocaleString('en-PH'):tx.date,
  };
  _whPrintSlip(slipData);
}

// ── IMPORT DELIVERY HISTORY ───────────────────────────────────
function _whImportDeliveries(){
  const tmpl=`Date,ItemCode,Qty,UnitCost,Vendor,Reference,Notes\n2024-01-15,MAT-001,100,320.00,Holcim Philippines,PO-2024-001,First delivery\n2024-02-10,CON-001,500,18.50,Lincoln Electric,DR-0042,`;
  const html=`
  <div class="modal-overlay open" data-dynamic="1" id="whRcvImportModal">
    <div class="modal" style="max-width:680px;width:95vw">
      <div class="modal-header">
        <h3 style="margin:0;font-size:15px"><i class="fas fa-file-import" style="color:var(--accent-green);margin-right:8px"></i>Import Delivery History</h3>
        <button class="btn btn-secondary btn-sm" onclick="closeModal('whRcvImportModal')"><i class="fas fa-times"></i></button>
      </div>
      <div class="modal-body">
        <div style="background:rgba(56,139,253,.08);border:1px solid rgba(56,139,253,.25);border-radius:8px;padding:10px 14px;margin-bottom:14px;font-size:12px">
          <strong style="color:var(--accent-blue)">Required columns:</strong> <code>Date</code>, <code>ItemCode</code>, <code>Qty</code>, <code>UnitCost</code><br>
          <strong style="color:var(--text-secondary)">Optional:</strong> <code>Vendor</code>, <code>Reference</code>, <code>Notes</code><br>
          <span style="color:var(--text-secondary)">Date format: <code>YYYY-MM-DD</code> · ItemCode must match an existing warehouse item code.</span>
        </div>
        <!-- File picker -->
        <div style="margin-bottom:12px">
          <label class="form-label">Upload CSV / Excel file</label>
          <div style="display:flex;gap:8px;align-items:center">
            <input type="file" id="wh-rcv-import-file" accept=".csv,.xlsx,.xls,.txt" style="display:none" onchange="_whRcvImportFileLoad(this)">
            <button class="btn btn-secondary btn-sm" onclick="$('#wh-rcv-import-file').click()"><i class="fas fa-folder-open"></i> Choose File</button>
            <span id="wh-rcv-import-filename" style="font-size:12px;color:var(--text-secondary)">No file chosen</span>
          </div>
        </div>
        <!-- Paste area -->
        <div style="margin-bottom:10px">
          <label class="form-label">— or paste CSV content directly —</label>
          <textarea class="form-control" id="wh-rcv-import-csv" rows="7"
            placeholder="${tmpl.replace(/</g,'&lt;')}"
            style="font-family:var(--font-mono);font-size:11px"
            oninput="_whRcvImportPreview()"></textarea>
        </div>
        <div id="wh-rcv-import-preview"></div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" onclick="closeModal('whRcvImportModal')">Cancel</button>
        <button class="btn btn-primary" onclick="_whRcvImportExecute()"><i class="fas fa-upload"></i> Import Records</button>
      </div>
    </div>
  </div>`;
  document.body.insertAdjacentHTML('beforeend',html);
}

function _whRcvImportFileLoad(input){
  const file=input.files[0];
  if(!file)return;
  const nameEl=$('#wh-rcv-import-filename');
  if(nameEl)nameEl.textContent=file.name;
  const reader=new FileReader();
  reader.onload=e=>{
    const el=$('#wh-rcv-import-csv');
    if(el){el.value=e.target.result;_whRcvImportPreview();}
  };
  reader.readAsText(file);
}

function _whRcvImportPreview(){
  const text=$('#wh-rcv-import-csv')?.value||'';
  const preview=$('#wh-rcv-import-preview');
  if(!preview)return;
  if(!text.trim()){preview.innerHTML='';return;}
  const {headers,rows}=_whImportParseCsv(text);
  const norm=h=>h.toLowerCase().replace(/[\s_\-\/]/g,'');
  const col=(...aliases)=>{const n=aliases.map(a=>a.toLowerCase().replace(/[\s_\-\/]/g,''));return headers.findIndex(h=>n.includes(norm(h)));};
  const dateIdx=col('date','deliverydate','receivedate','receiveddate','txdate');
  const codeIdx=col('itemcode','code','sku','item code','itemid');
  const qtyIdx=col('qty','quantity','receivedqty','qtyreceived');
  const costIdx=col('unitcost','unit cost','cost','price','unitprice');
  const vendorIdx=col('vendor','supplier','vendorname','suppliername');
  const refIdx=col('reference','ref','po','dr','pono','drno','ponumber','drnumber');
  const notesIdx=col('notes','note','remarks','remark');

  const itemsByCode=new Map(_whItems().map(i=>[i.code||i.id,i]));
  let valid=0,invalid=0;
  const previewRows=rows.slice(0,10).map(row=>{
    const code=(codeIdx>=0?row[codeIdx]:'').trim();
    const item=code?itemsByCode.get(code):null;
    const qty=parseFloat(qtyIdx>=0?row[qtyIdx]:0)||0;
    const cost=parseFloat(costIdx>=0?row[costIdx]:0)||0;
    const date=dateIdx>=0?row[dateIdx]:'';
    const ok=!!item&&qty>0&&!!date;
    if(ok)valid++;else invalid++;
    return`<tr style="${ok?'':'opacity:.5'}">
      <td style="font-size:11px">${date||'<span style="color:var(--accent-red)">missing</span>'}</td>
      <td style="font-size:11px;font-family:var(--font-mono)">${code||'—'}</td>
      <td style="font-size:11px">${item?item.name:'<span style="color:var(--accent-red)">not found</span>'}</td>
      <td style="text-align:right;font-family:var(--font-mono);font-size:11px">${qty||'—'}</td>
      <td style="text-align:right;font-family:var(--font-mono);font-size:11px">${cost?'₱'+fmtNum(cost):'—'}</td>
      <td style="font-size:11px">${ok?'<span style="color:var(--accent-green)">✓ OK</span>':'<span style="color:var(--accent-red)">✗ Skip</span>'}</td>
    </tr>`;
  }).join('');

  preview.innerHTML=`
    <div style="font-size:12px;color:var(--text-secondary);margin-bottom:6px">
      Preview (first 10 of ${rows.length} rows) · <span style="color:var(--accent-green)">${valid} valid</span> · <span style="color:var(--accent-red)">${invalid} will be skipped</span>
    </div>
    <div style="max-height:200px;overflow-y:auto">
    <table style="font-size:11px"><thead><tr>
      <th>DATE</th><th>CODE</th><th>ITEM</th><th style="text-align:right">QTY</th><th style="text-align:right">UNIT COST</th><th>STATUS</th>
    </tr></thead><tbody>${previewRows}</tbody></table></div>`;
}

function _whRcvImportExecute(){
  const text=$('#wh-rcv-import-csv')?.value||'';
  if(!text.trim()){showToast('Paste or select a CSV file first','error');return;}
  const {headers,rows}=_whImportParseCsv(text);
  const norm=h=>h.toLowerCase().replace(/[\s_\-\/]/g,'');
  const col=(...aliases)=>{const n=aliases.map(a=>a.toLowerCase().replace(/[\s_\-\/]/g,''));return headers.findIndex(h=>n.includes(norm(h)));};
  const dateIdx=col('date','deliverydate','receivedate','receiveddate','txdate');
  const codeIdx=col('itemcode','code','sku','item code','itemid');
  const qtyIdx=col('qty','quantity','receivedqty','qtyreceived');
  const costIdx=col('unitcost','unit cost','cost','price','unitprice');
  const vendorIdx=col('vendor','supplier','vendorname','suppliername');
  const refIdx=col('reference','ref','po','dr','pono','drno','ponumber','drnumber');
  const notesIdx=col('notes','note','remarks','remark');

  if(!AppState.data.stockTransactions)AppState.data.stockTransactions=[];
  const itemsByCode=new Map(_whItems().map(i=>[i.code||i.id,i]));
  const now=new Date().toISOString();
  const today=now.slice(0,10);
  let imported=0,skipped=0;

  rows.forEach(row=>{
    const code=(codeIdx>=0?row[codeIdx]:'').trim();
    const item=code?itemsByCode.get(code):null;
    if(!item){skipped++;return;}
    const qty=parseFloat(qtyIdx>=0?row[qtyIdx]:0)||0;
    if(qty<=0){skipped++;return;}
    const date=(dateIdx>=0?row[dateIdx]:'').trim()||today;
    if(!date){skipped++;return;}
    const unitCost=parseFloat(costIdx>=0?row[costIdx]:0)||0;
    const vendor=(vendorIdx>=0?row[vendorIdx]:'').trim();
    const ref=(refIdx>=0?row[refIdx]:'').trim();
    const notes=(notesIdx>=0?row[notesIdx]:'').trim();

    AppState.data.stockTransactions.push({
      id:_whNextId('TX-',AppState.data.stockTransactions),
      itemId:item.id,
      type:'receive',
      qty,
      date,
      vendor:vendor||'',
      ref:ref||'',
      notes:notes||'Historical import',
      unitCost:unitCost||undefined,
      batchRef:'HIST-IMPORT-'+Date.now().toString(36).toUpperCase(),
      by:AppState.currentUser?.displayName||'import',
      postedAt:now,
    });
    _whSyncQty(item.id);
    imported++;
  });

  AppState.save();
  closeModal('whRcvImportModal');
  showToast(`Import complete — ${imported} records imported · ${skipped} skipped`,'success',5000);
  _whRenderTab();
}

// ── SAVE HELPERS ─────────────────────────────────────────────
async function _whSaveReceive(){
  if(typeof hasModulePermission==='function'&&!hasModulePermission('warehouse','edit')){showToast('You have view-only access to Warehouse','warning');return;}
  const date=$('#wh-rcv-date')?.value||new Date().toISOString().slice(0,10);
  const ref=$('#wh-rcv-ref')?.value.trim();
  const vendor=$('#wh-rcv-vendor')?.value.trim();
  const notes=$('#wh-rcv-notes')?.value.trim();

  const valid=_whRcvLines.filter(ln=>ln.itemId&&parseFloat(ln.qty)>0);
  if(!valid.length){showToast('Add at least one item with qty > 0','error');return;}

  // Upload attachments first
  let attachments=[];
  if(_whRcvAttachments.length){
    showToast(`Uploading ${_whRcvAttachments.length} attachment(s)…`,'info',8000);
    for(const a of _whRcvAttachments){
      try{
        const result=await spUploadFile(a.file,'Warehouse');
        attachments.push({name:a.name,size:a.size,url:result.webUrl,downloadUrl:result.url});
      }catch(e){
        showToast(`Failed to upload "${a.name}": ${e.message}`,'error',6000);
        return; // Stop — don't post partial
      }
    }
  }

  if(!AppState.data.stockTransactions)AppState.data.stockTransactions=[];
  const postedAt=new Date().toISOString();
  const by=AppState.currentUser?.displayName||'';
  const batchRef='RCV-'+Date.now().toString(36).toUpperCase(); // Groups multi-line receipts
  valid.forEach(ln=>{
    const qty=parseFloat(ln.qty);
    const cost=parseFloat(ln.unitCost||0);
    AppState.data.stockTransactions.push({
      id:_whNextId('TX-',AppState.data.stockTransactions),
      itemId:ln.itemId,type:'receive',qty,date,ref,vendor,notes,by,postedAt,batchRef,
      unitCost:cost||undefined,
      attachments:attachments.length?attachments:undefined,
    });
    if(cost>0){
      const idx=(AppState.data.warehouseItems||[]).findIndex(i=>i.id===ln.itemId);
      if(idx!==-1)AppState.data.warehouseItems[idx].unitCost=cost;
    }
    _whSyncQty(ln.itemId);
  });
  AppState.save();
  auditLog('CREATE','Warehouse','StockTransaction',batchRef,null,{type:'receive',items:valid.length,vendor,ref,date},'Receive Goods');
  if(typeof fireWebhook==='function')fireWebhook('stock_received',{vendor,ref,date,itemCount:valid.length,items:valid.map(l=>({itemId:l.itemId,qty:l.qty}))});
  // Check for low stock after receiving (edge case: item still below min)
  valid.forEach(ln=>{const it=_whItems().find(i=>i.id===ln.itemId);if(it){const q=_whCalcQty(ln.itemId);if(it.minStock&&q.qtyOnHand<=parseFloat(it.minStock))if(typeof fireWebhook==='function')fireWebhook('low_stock',{itemId:it.id,itemName:it.name,qtyOnHand:q.qtyOnHand,minStock:it.minStock});}});
  const _rcvBatchRef=batchRef;
  _whRcvLines=[{itemId:'',qty:'',unitCost:''}];
  _whRcvAttachments=[];
  _whRenderTab();
  _whShowUndoToast(`${valid.length} item${valid.length>1?'s':''} received & posted${attachments.length?' with '+attachments.length+' attachment(s)':''}`, ()=>{
    (AppState.data.stockTransactions||[]).filter(t=>t.batchRef===_rcvBatchRef).forEach(t=>{t._deleted=true;_whSyncQty(t.itemId);});
    AppState.save();showToast('Receive undone','info');_whRenderTab();
  });
}

function _whSaveIssue(){
  if(typeof hasModulePermission==='function'&&!hasModulePermission('warehouse','edit')){showToast('You have view-only access to Warehouse','warning');return;}
  const type=$('#wh-iss-type')?.value||'issue';
  const bu=$('#wh-iss-bu')?.value||'SHIC';
  const projId=$('#wh-iss-proj')?.value;
  const date=$('#wh-iss-date')?.value||new Date().toISOString().slice(0,10);
  const by=$('#wh-iss-by')?.value.trim();
  const notes=$('#wh-iss-notes')?.value.trim();

  const valid=_whIssLines.filter(ln=>ln.itemId&&parseFloat(ln.qty)!==0&&ln.qty!=='');
  if(!valid.length){showToast('Add at least one item with a quantity','error');return;}

  const isIssueType=type==='issue'||type==='issue-shop'||type==='issue-enduser';
  if(isIssueType){
    for(const ln of valid){
      const q=_whCalcQty(ln.itemId);
      const qty=parseFloat(ln.qty);
      if(qty>q.qtyOnHand){
        const item=_whItems().find(i=>i.id===ln.itemId);
        showToast(`"${item?.name||ln.itemId}": only ${q.qtyOnHand} on hand — cannot issue ${qty}`,'error',5000);
        return;
      }
    }
  }

  if(isIssueType&&projId){
    const overBudget=[];
    for(const ln of valid){
      const qty=parseFloat(ln.qty);
      const wac=_whCalcWAC(ln.itemId);
      const newCost=qty*wac;
      const item=_whItems().find(i=>i.id===ln.itemId);
      const alloc=(AppState.data.resourceAllocations||[]).find(a=>!a._deleted&&a.projectId===projId&&(a.resourceId===ln.itemId||a.resourceId===(item?.itemMasterId)));
      if(alloc&&(alloc.plannedCost||0)>0){
        const currentIssued=_whActualIssueCost(projId,alloc.resourceId);
        const projected=currentIssued+newCost;
        if(projected>alloc.plannedCost){
          overBudget.push(`• ${item?.name||ln.itemId}: ₱${fmtNum(Math.round(projected))} issued vs ₱${fmtNum(alloc.plannedCost)} budget`);
        }
      }
    }
    if(overBudget.length&&!confirm(`⚠️ Budget Overrun Warning\n\nThe following items will exceed their allocation budget:\n${overBudget.join('\n')}\n\nProceed with issuance anyway?`))return;
  }

  if(!AppState.data.stockTransactions)AppState.data.stockTransactions=[];
  const postedAt=new Date().toISOString();
  valid.forEach(ln=>{
    const qty=parseFloat(ln.qty);
    AppState.data.stockTransactions.push({
      id:_whNextId('TX-',AppState.data.stockTransactions),
      itemId:ln.itemId,type,bu,
      qty:type==='adjust'&&String(ln.qty).startsWith('-')?-Math.abs(qty):qty,
      unitCost:isIssueType?_whCalcWAC(ln.itemId):undefined,
      projectId:projId||null,date,issuedBy:by,by,notes,postedAt,
    });
    _whSyncQty(ln.itemId);
  });
  AppState.save();
  auditLog('CREATE','Warehouse','StockTransaction',postedAt,null,{type,items:valid.length,projId,date,by},'Issue/Return');
  if(type==='issue'||type==='issue-shop'||type==='issue-enduser')if(typeof fireWebhook==='function')fireWebhook('stock_issued',{type,projId,date,issuedBy:by,itemCount:valid.length});
  valid.forEach(ln=>{const it=_whItems().find(i=>i.id===ln.itemId);if(it){const q=_whCalcQty(ln.itemId);if(it.minStock&&q.qtyOnHand<=parseFloat(it.minStock))if(typeof fireWebhook==='function')fireWebhook('low_stock',{itemId:it.id,itemName:it.name,qtyOnHand:q.qtyOnHand,minStock:it.minStock,projId});}});
  const _issBatchTs=postedAt;
  // Capture slip data before clearing
  const slipItems=valid.map(ln=>{
    const item=_whItems().find(i=>i.id===ln.itemId);
    const wac=_whCalcWAC(ln.itemId);
    const qty=parseFloat(ln.qty);
    return{name:item?.name||ln.itemId,code:item?.code||ln.itemId,unit:item?.unit||'',qty,wac,total:qty*wac,stock:_whCalcQty(ln.itemId)};
  });
  const formCfg=_whForms().find(f=>f.id===bu)||_whForms()[0];
  const mcwfNo=_whGenMcwfNo(date);
  const slipData={type,bu,formCfg,mcwfNo,projId,date,by,notes,items:slipItems,
    grand:slipItems.reduce((s,r)=>s+r.total,0),
    postedAt:new Date().toLocaleString('en-PH')};
  _whIssLines=[{itemId:'',qty:''}];
  _whRenderTab();
  _whShowUndoToast(`${valid.length} item${valid.length>1?'s':''} — ${type} posted`, ()=>{
    (AppState.data.stockTransactions||[]).filter(t=>t.postedAt===_issBatchTs).forEach(t=>{t._deleted=true;_whSyncQty(t.itemId);});
    AppState.save();showToast('Transaction undone','info');_whRenderTab();
  });
  // Ask to print
  setTimeout(()=>_whPrintSlip(slipData),400);
}

function _whPrintSlip(d){
  const cfg=d.formCfg||_whForms().find(f=>f.id===d.bu)||_whForms()[0];
  const docNo=cfg.docControlNo||'';
  const revNo=cfg.revisionNo||'';
  const effDate=cfg.effectiveDate||'';
  const proj=d.projId?(AppState.data.projects||[]).find(p=>p.id===d.projId):null;
  // Exactly 10 rows per page
  const padded=[...d.items].slice(0,10);
  while(padded.length<10)padded.push({name:'',code:'',unit:'',qty:'',wac:0,total:0});
  const rows=padded.map((r,i)=>{
    const reason=i===0&&d.notes?d.notes:'';
    const name=r.name?`${r.code?`<span style="color:#888;font-size:7pt">[${r.code}]</span> `:''}${r.name}`:'';
    const stock=(r.stock!=null&&r.stock!=='')?_whFmt(r.stock)+' '+( r.unit||''):'';
    return`<tr>
      <td class="tc">${i<d.items.length?i+1:''}</td>
      <td class="tl" style="padding-left:6pt">${name}</td>
      <td class="tc">${r.qty||''}</td>
      <td class="tc">${r.unit||''}</td>
      <td class="tl" style="padding-left:4pt">${reason}</td>
      <td class="tr">${stock}</td>
    </tr>`;
  }).join('');
  const timeStr=new Date().toLocaleTimeString('en-PH',{hour:'2-digit',minute:'2-digit'});
  const dateStr=d.date||new Date().toISOString().slice(0,10);
  // Logo: use uploaded image if available, otherwise show company name text
  const logoSVG=cfg.logoDataUrl
    ?`<img src="${cfg.logoDataUrl}" style="max-width:70pt;max-height:50pt;object-fit:contain">`
    :`<div style="font-size:11pt;font-weight:700;color:#c0392b;line-height:1">${cfg.companyName}</div>`;
  const coName=cfg.companyName||'';
  const coSub=cfg.companySub||'';
  const html=`<!DOCTYPE html><html><head><meta charset="utf-8">
<title>Materials &amp; Consumables Withdrawal Form</title>
<style>
@page{size:letter portrait;margin:8mm 8mm 8mm 8mm}
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:Arial,Helvetica,sans-serif;font-size:8.5pt;color:#000;background:#fff}
.no-print{text-align:center;padding:8px;background:#e5e7eb;margin-bottom:8px;display:flex;justify-content:center;gap:8px}
.no-print button{padding:6px 18px;border:none;border-radius:4px;font-size:12px;cursor:pointer;font-weight:600}
.btn-print{background:#1d4ed8;color:#fff}
.btn-close{background:#6b7280;color:#fff}
/* ── FORM WRAPPER ── */
.fw{width:100%;max-width:196mm;margin:0 auto;border:1pt solid #000}
/* ── HEADER TABLE ── */
table.hdr{width:100%;border-collapse:collapse;border-bottom:1pt solid #000}
table.hdr>tbody>tr>td{vertical-align:middle;padding:0}
.hdr-logo{width:18%;border-right:1pt solid #000;padding:3pt 5pt;text-align:center}
.hdr-logo .co{font-size:9.5pt;font-weight:700;line-height:1.1;margin-top:2pt}
.hdr-logo .sub{font-size:6pt;color:#444;line-height:1.3}
.hdr-title{text-align:center;vertical-align:middle;padding:4pt 6pt;border-right:1pt solid #000}
.hdr-title div{font-size:13pt;font-weight:700;letter-spacing:0.2pt;line-height:1.3}
.ctrl{width:24%;vertical-align:top;padding:0;font-size:7pt}
table.ctbl{width:100%;border-collapse:collapse}
table.ctbl tr{border-bottom:0.5pt solid #999}
table.ctbl td{padding:1.5pt 4pt;vertical-align:middle;white-space:nowrap}
table.ctbl td.lbl{color:#333;width:52%}
table.ctbl td.val{font-weight:700;color:#000}
.whd-no{padding:2pt 4pt;font-size:7pt;border-top:0.5pt solid #999;display:flex;justify-content:space-between;align-items:center}
.whd-no b{font-size:7pt}
.whd-blank{flex:1;border-bottom:0.75pt solid #555;margin-left:4pt;min-width:30pt}
/* ── FIELD ROWS ── */
table.flds{width:100%;border-collapse:collapse;border-bottom:1pt solid #000}
table.flds td{font-size:8pt;padding:2.5pt 5pt;border:0.5pt solid #000;vertical-align:middle;height:9.5mm}
.lbl{font-weight:700;white-space:nowrap;font-size:7.5pt}
.val{font-weight:600;font-size:8pt;padding-left:4pt}
/* ── ITEMS TABLE ── */
table.items{width:100%;border-collapse:collapse}
table.items thead tr td{background:#1e3a5f;color:#fff;text-align:center;font-size:7.5pt;font-weight:700;padding:3.5pt 2pt;border:0.75pt solid #000;vertical-align:middle}
table.items thead tr td.tl{text-align:left;padding-left:5pt}
table.items tbody tr{height:9mm}
table.items tbody td{border:0.5pt solid #bbb;padding:1.5pt 2pt;vertical-align:middle;font-size:8pt}
.tc{text-align:center}
.tl{text-align:left}
.tr{text-align:right;padding-right:3pt !important;font-size:7.5pt}
/* ── SIGNATURE TABLE ── */
table.sigs{width:100%;border-collapse:collapse;border-top:1pt solid #000}
table.sigs td{border:0.5pt solid #000;vertical-align:top;padding:2pt 3pt;font-size:7pt}
.stitle{font-weight:700;font-size:7pt;text-transform:uppercase;margin-bottom:2pt}
.slab{font-size:6.5pt;color:#222;white-space:nowrap}
.sline{border-bottom:0.75pt solid #555;margin-left:2pt;margin-right:2pt;margin-top:7mm;height:0}
.spos{font-size:6pt;font-weight:700;text-align:center;margin-top:1pt;color:#111}
.sysn{font-size:6pt;color:#777;padding:2pt 4pt}
@media print{
  .no-print{display:none}
  body{background:#fff}
  .fw{max-width:100%;border:1pt solid #000}
}
</style></head><body>
<div class="no-print">
  <button class="btn-print" onclick="window.print()">&#128424; Print Form</button>
  <button class="btn-close" onclick="window.close()">&#x2715; Close</button>
</div>
<div class="fw">
<!-- ══ HEADER ══ -->
<table class="hdr"><tbody><tr>
  <td class="hdr-logo">
    ${logoSVG}
    ${cfg.logoDataUrl?`<div class="co" style="margin-top:2pt">${coName}</div>`:''}
    <div class="sub">${coSub}</div>
  </td>
  <td class="hdr-title">
    <div>MATERIALS &amp; CONSUMABLES<br>WITHDRAWAL FORM</div>
  </td>
  <td class="ctrl">
    <table class="ctbl"><tbody>
      <tr><td class="lbl">Doc. Control No.:</td><td class="val">${docNo}</td></tr>
      <tr><td class="lbl">Revision No.:</td><td class="val">${revNo}</td></tr>
      <tr><td class="lbl">Effective Date:</td><td class="val">${effDate}</td></tr>
      <tr><td class="lbl" colspan="2" style="text-align:center;font-weight:700;font-size:7.5pt">PAGE 1 OF 1</td></tr>
    </tbody></table>
    <div class="whd-no"><b>WHD-MCWF NO.: ${d.mcwfNo||'—'}</b></div>
  </td>
</tr></tbody></table>
<!-- ══ FIELD ROWS ══ -->
<table class="flds"><colgroup>
  <col style="width:19%"><col style="width:40%"><col style="width:12%"><col style="width:29%">
</colgroup><tbody>
  <tr>
    <td><span class="lbl">REQUESTOR'S NAME</span></td>
    <td><span class="val">${d.by||''}</span></td>
    <td><span class="lbl">JOB ORDER NO.:</span></td>
    <td><span class="val">${d.notes||''}</span></td>
  </tr>
  <tr>
    <td><span class="lbl">CLIENT NAME:</span></td>
    <td><span class="val">${proj?.client||''}</span></td>
    <td><span class="lbl">DATE: <span class="val">${dateStr}</span></span></td>
    <td><span class="lbl">TIME: <span class="val">${timeStr}</span></span></td>
  </tr>
  <tr>
    <td><span class="lbl">PROJECT DESCRIPTION:</span></td>
    <td colspan="3"><span class="val">${proj?proj.id+' — '+(proj.name||''):''}</span></td>
  </tr>
</tbody></table>
<!-- ══ ITEMS TABLE ══ -->
<table class="items"><colgroup>
  <col style="width:6%">
  <col style="width:44%">
  <col style="width:5%">
  <col style="width:7%">
  <col style="width:28%">
  <col style="width:10%">
</colgroup>
<thead><tr>
  <td class="tc">LINE<br>No.</td>
  <td class="tl">ITEM NAME / DESCRIPTION</td>
  <td class="tc">QTY</td>
  <td class="tc">UNIT</td>
  <td class="tl">REASON FOR WITHDRAWAL</td>
  <td class="tc">WHD<br>STOCKS</td>
</tr></thead>
<tbody>${rows}</tbody>
</table>
<!-- ══ SIGNATURES ══ -->
<table class="sigs"><colgroup>
  <col style="width:16%">
  <col style="width:17%">
  <col style="width:17%">
  <col style="width:17%">
  <col style="width:17%">
  <col style="width:16%">
</colgroup><tbody>
  <tr>
    <td>
      <div class="stitle">REQUESTOR'S SIGNATURE</div>
      <div class="sline"></div><div class="ssub">Signature</div>
      <div class="sline"></div><div class="ssub">Name</div>
    </td>
    <td>
      <div class="stitle">PRE APPROVED BY:</div>
      <div class="sline"></div><div class="ssub">Signature</div>
      <div class="sline"></div><div class="ssub">Name</div>
      <div class="spos">DEPT MANAGER / SUPERVISOR</div>
    </td>
    <td>
      <div class="stitle">APPROVED BY (RND ONLY):</div>
      <div class="sline"></div><div class="ssub">Signature</div>
      <div class="sline"></div><div class="ssub">Name</div>
      <div class="spos">E-VP OPERATION</div>
    </td>
    <td>
      <div class="stitle">CHECKED BY:</div>
      <div class="sline"></div><div class="ssub">Signature</div>
      <div class="sline"></div><div class="ssub">Name</div>
      <div class="spos">ACCOUNTING DEPARTMENT</div>
    </td>
    <td>
      <div class="stitle">RECEIVED BY:</div>
      <div class="sline"></div><div class="ssub">Signature</div>
      <div class="sline"></div><div class="ssub">Name</div>
      <div class="spos">REQUESTING PARTY</div>
    </td>
    <td>
      <div class="stitle">RELEASED BY:</div>
      <div class="sline"></div><div class="ssub">Signature</div>
      <div class="sline"></div><div class="ssub">Name</div>
      <div class="spos">WHSE DEPARTMENT</div>
    </td>
  </tr>
  <tr>
    <td colspan="6" class="sysn">Generated by PROCMASTER Warehouse System &bull; ${d.postedAt}</td>
  </tr>
</tbody></table>
</div>
<script>window.onload=()=>window.print();<\/script>
</body></html>`;
  const w=window.open('','_blank','width=820,height=1060,scrollbars=yes');
  if(w){w.document.write(html);w.document.close();}
  else showToast('Allow popups to print the form','error',4000);
}

// ── ISSUANCE REQUEST ACTIONS ─────────────────────────────────
function _whApproveReq(id, approved){
  const req=(AppState.data.issuanceRequests||[]).find(r=>r.id===id);
  if(!req)return;
  req.status=approved?'approved':'rejected';
  req.reviewedBy=AppState.currentUser?.displayName||'Admin';
  req.reviewedAt=new Date().toISOString();
  AppState.save();
  showToast(approved?'Request approved':'Request rejected', approved?'success':'error');
  _whRenderTab();
}

function _whReleaseReq(id){
  const req=(AppState.data.issuanceRequests||[]).find(r=>r.id===id);
  if(!req)return;
  const q=_whCalcQty(req.itemId);
  if(req.qty>q.qtyOnHand){showToast(`Only ${q.qtyOnHand} on hand — cannot release ${req.qty}`,'error',4000);return;}
  if(!AppState.data.stockTransactions)AppState.data.stockTransactions=[];
  const tx={
    id:_whNextId('TX-',AppState.data.stockTransactions),
    itemId:req.itemId,type:'issue',qty:req.qty,
    unitCost:_whCalcWAC(req.itemId),
    projectId:req.projectId||null,
    date:new Date().toISOString().slice(0,10),
    issuedBy:AppState.currentUser?.displayName||'',
    by:AppState.currentUser?.displayName||'',
    ref:'REQ-'+req.id,
    notes:`Released from request ${req.id}`,
    postedAt:new Date().toISOString(),
  };
  AppState.data.stockTransactions.push(tx);
  _whSyncQty(req.itemId);
  req.status='released';
  req.releasedBy=AppState.currentUser?.displayName||'';
  req.releasedAt=new Date().toISOString();
  AppState.save();
  showToast('Stock released to project','success');
  _whRenderTab();
}

function _whStartPR(reqId){
  const req=(AppState.data.issuanceRequests||[]).find(r=>r.id===reqId);
  if(!req){showToast('Request not found','error');return;}
  if(req.prId){showToast(`PR ${req.prId} already exists for this request`,'warning',4000);return;}
  if(!AppState.data.procurement)AppState.data.procurement=[];
  const prId='PR-'+Date.now().toString().slice(-6);
  const cat=(req.resourceType==='Material'||req.resourceType==='Materials')?'Materials':(req.resourceType==='Consumable'||req.resourceType==='Consumables')?'Consumables':'Materials';
  AppState.data.procurement.push({
    id:prId,
    description:req.description||req.resourceId||'',
    category:cat,
    projectId:req.projectId||'',
    budgetAmount:0,amount:0,
    status:'draft',
    requestedBy:req.requestedBy||AppState.currentUser?.displayName||'',
    notes:`From Issuance Request ${req.id}${req.reason?': '+req.reason:''}`,
    itemMasterId:req.itemMasterId||null,
    issuanceRequestId:req.id,
    prDate:new Date().toISOString().slice(0,10),
    attachments:[],
  });
  req.status='pr_started';
  req.prId=prId;
  AppState.save();
  showToast(`PR ${prId} created — complete it in Procurement`,'success',5000);
  navigateTo('procurement');
}

// ── ADD ITEM MODAL ───────────────────────────────────────────
function _whPickFromMaster(){
  const mats=(AppState.data.materials||[]).filter(m=>!m._deleted);
  const cons=(AppState.data.consumables||[]).filter(c=>!c._deleted);
  const enrolled=new Set((AppState.data.warehouseItems||[]).filter(w=>!w._deleted).map(w=>w.itemMasterId).filter(Boolean));
  const all=[...mats.map(m=>({...m,_type:'materials'})),...cons.map(c=>({...c,_type:'consumables'}))];
  const html=`
  <div class="modal-overlay open" data-dynamic="1" id="whMasterPickModal">
    <div class="modal" style="max-width:540px">
      <div class="modal-header">
        <div class="modal-title"><i class="fas fa-book-open" style="color:var(--accent-blue);margin-right:8px"></i>Pick from Item Master</div>
        <button class="modal-close" onclick="closeModal('whMasterPickModal')"><i class="fas fa-times"></i></button>
      </div>
      <div class="modal-body">
        <input class="form-control" placeholder="Search items…" oninput="
          const q=this.value.toLowerCase();
          document.querySelectorAll('#whMasterList .im-row').forEach(r=>{r.style.display=r.dataset.name.includes(q)?'':'none';});
        " style="margin-bottom:10px">
        <div id="whMasterList" style="max-height:340px;overflow-y:auto;border:1px solid var(--border);border-radius:6px">
          ${all.length?all.map(item=>{
            const inWh=enrolled.has(item.id);
            return`<div class="im-row" data-name="${(item.name||'').toLowerCase()}" style="padding:10px 14px;border-bottom:1px solid var(--border);display:flex;align-items:center;gap:10px;${inWh?'opacity:.5':'cursor:pointer'}" ${!inWh?`onclick="_whEnrollFromPicker('${item.id}','${item._type}')"`:'title="Already in Warehouse"'}>
              <div style="flex:1">
                <div style="font-weight:600;font-size:12px">${item.name}</div>
                <div style="font-size:10px;color:var(--text-secondary)">${item.id} · ${item.category||'—'} · ${item.unit||'—'} · Std Cost: ₱${fmtNum(item.unitCost||0)}</div>
              </div>
              ${inWh?'<span style="font-size:10px;color:var(--accent-green)"><i class="fas fa-check"></i> In Warehouse</span>':'<span style="font-size:10px;color:var(--accent-blue)"><i class="fas fa-plus"></i> Enroll</span>'}
            </div>`;
          }).join(''):`<div class="empty-state" style="padding:24px"><i class="fas fa-book-open"></i><p>No items in Item Master yet.<br>Add materials or consumables in Asset Masterlist first.</p></div>`}
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" onclick="closeModal('whMasterPickModal')">Close</button>
      </div>
    </div>
  </div>`;
  document.body.insertAdjacentHTML('beforeend',html);
}

function _whEnrollFromPicker(itemId, itemType){
  const arr=itemType==='consumables'?AppState.data.consumables:AppState.data.materials;
  const item=(arr||[]).find(i=>i.id===itemId);
  if(!item)return;
  if(!AppState.data.warehouseItems)AppState.data.warehouseItems=[];
  if(AppState.data.warehouseItems.some(w=>!w._deleted&&w.itemMasterId===itemId)){showToast('Already enrolled','warning');return;}
  const wh={
    id:'WH-'+String((AppState.data.warehouseItems.length+1)).padStart(4,'0'),
    itemMasterId:itemId,itemMasterType:itemType,
    name:item.name,code:item.id,
    category:item.category||'General',unit:item.unit||'',
    unitCost:item.unitCost||0,
    minStock:item.minStock||0,reorderPoint:item.reorderQty||item.minStock||0,
    location:'',description:item.notes||'',
    qtyOnHand:0,qtyReserved:0,qtyAvailable:0,netIssued:0,
    createdAt:new Date().toISOString(),
  };
  AppState.data.warehouseItems.push(wh);
  AppState.save();
  closeModal('whMasterPickModal');
  showToast(`"${item.name}" enrolled — now add opening stock via Receive tab`,'success',4000);
  _whRenderTab();
}

function _whShowAddItem(editId){
  const existing=editId?(_whItems().find(i=>i.id===editId)||null):null;
  const cats=['Materials','Consumables','Spare Parts','Chemicals','Office Supplies','Safety Equipment','Other'];
  const linkedMaster=existing?.itemMasterId?(()=>{
    const arr=existing.itemMasterType==='consumables'?AppState.data.consumables:AppState.data.materials;
    return (arr||[]).find(i=>i.id===existing.itemMasterId);
  })():null;
  const html=`
  <div class="modal-overlay open" data-dynamic="1" id="whItemModal">
    <div class="modal" style="max-width:520px">
      <div class="modal-header">
        <div class="modal-title">${existing?'Edit Warehouse Item':'Add Warehouse Item'}</div>
        <button class="modal-close" onclick="closeModal('whItemModal')"><i class="fas fa-times"></i></button>
      </div>
      <div class="modal-body">
        ${!existing?`<div style="display:flex;gap:8px;margin-bottom:12px;align-items:center;padding:8px 12px;background:rgba(56,139,253,.08);border:1px solid rgba(56,139,253,.2);border-radius:6px">
          <i class="fas fa-book-open" style="color:var(--accent-blue)"></i>
          <span style="font-size:12px;flex:1">Pick from Item Master to link this warehouse record to the catalog.</span>
          <button class="btn btn-secondary btn-sm" onclick="closeModal('whItemModal');_whPickFromMaster()"><i class="fas fa-search"></i> Pick from Item Master</button>
        </div>`:''}
        ${linkedMaster?`<div style="padding:8px 12px;background:rgba(63,185,80,.08);border:1px solid rgba(63,185,80,.2);border-radius:6px;margin-bottom:10px;font-size:11px">
          <i class="fas fa-link" style="color:var(--accent-green);margin-right:6px"></i>Linked to Item Master: <strong>${linkedMaster.name}</strong> (${existing.itemMasterId})
        </div>`:''}
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
          <div class="form-group" style="grid-column:1/-1">
            <label class="form-label">Item Name *</label>
            <input class="form-control" id="wh-add-name" placeholder="e.g. Portland Cement Type I" value="${existing?.name||''}">
          </div>
          <div class="form-group">
            <label class="form-label">Item Code</label>
            <input class="form-control" id="wh-add-code" placeholder="MAT-001" value="${existing?.code||''}">
          </div>
          <div class="form-group">
            <label class="form-label">Barcode / QR <span style="font-size:10px;color:var(--text-secondary)">(for scanner lookup)</span></label>
            <input class="form-control" id="wh-add-barcode" placeholder="e.g. 4806512345678" value="${existing?.barcode||''}">
          </div>
          <div class="form-group">
            <label class="form-label">Category *</label>
            <select class="form-control" id="wh-add-cat">
              ${cats.map(c=>`<option ${(existing?.category||'Materials')===c?'selected':''}>${c}</option>`).join('')}
            </select>
          </div>
          <div class="form-group">
            <label class="form-label">Unit of Measure *</label>
            <input class="form-control" id="wh-add-unit" placeholder="bag, ltr, pcs, m, kg…" value="${existing?.unit||''}">
          </div>
          <div class="form-group">
            <label class="form-label">Unit Cost (₱)</label>
            <input class="form-control" type="number" min="0" step="0.01" id="wh-add-cost" placeholder="0.00" value="${existing?.unitCost||''}">
          </div>
          <div class="form-group">
            <label class="form-label">Min Stock Level</label>
            <input class="form-control" type="number" min="0" id="wh-add-min" placeholder="0 = no alert" value="${existing?.minStock||''}">
          </div>
          <div class="form-group">
            <label class="form-label">Reorder Point</label>
            <input class="form-control" type="number" min="0" id="wh-add-reorder" placeholder="0" value="${existing?.reorderPoint||''}">
          </div>
          <div class="form-group">
            <label class="form-label">Rack <span style="font-size:10px;color:var(--text-secondary)">(letter, number, or combo)</span></label>
            <input class="form-control" id="wh-add-rack" placeholder="e.g. A, B2, C12" value="${existing?.rack||''}" oninput="this.value=this.value.toUpperCase()">
          </div>
          <div class="form-group">
            <label class="form-label">Row <span style="font-size:10px;color:var(--text-secondary)">(number only)</span></label>
            <input class="form-control" id="wh-add-row" type="number" min="1" step="1" placeholder="e.g. 1, 2, 3" value="${existing?.row||''}">
          </div>
          <div class="form-group" style="grid-column:1/-1">
            <label class="form-label">Additional Location Notes</label>
            <input class="form-control" id="wh-add-loc" placeholder="Bin A-3, Storage Room B, Near entrance…" value="${existing?.location||''}">
          </div>
          <div class="form-group" style="grid-column:1/-1">
            <label class="form-label">Description / Specs</label>
            <textarea class="form-control" id="wh-add-desc" rows="2" placeholder="Specifications, brand, notes…">${existing?.description||''}</textarea>
          </div>
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" onclick="closeModal('whItemModal')">Cancel</button>
        <button class="btn btn-primary" onclick="_whSaveItem('${editId||''}')"><i class="fas fa-save"></i> Save Item</button>
      </div>
    </div>
  </div>`;
  document.body.insertAdjacentHTML('beforeend',html);
}

function _whSaveItem(editId){
  if(typeof hasModulePermission==='function'&&!hasModulePermission('warehouse','edit')){showToast('You have view-only access to Warehouse','warning');return;}
  const name=$('#wh-add-name')?.value.trim();
  if(!name){showToast('Item name required','error');return;}
  if(!AppState.data.warehouseItems)AppState.data.warehouseItems=[];
  const now=new Date().toISOString();
  if(editId){
    const idx=AppState.data.warehouseItems.findIndex(i=>i.id===editId);
    if(idx!==-1){
      Object.assign(AppState.data.warehouseItems[idx],{
        name,code:$('#wh-add-code')?.value.trim(),
        barcode:$('#wh-add-barcode')?.value.trim(),
        category:$('#wh-add-cat')?.value,unit:$('#wh-add-unit')?.value.trim(),
        unitCost:parseFloat($('#wh-add-cost')?.value||0),
        minStock:parseFloat($('#wh-add-min')?.value||0),
        reorderPoint:parseFloat($('#wh-add-reorder')?.value||0),
        rack:($('#wh-add-rack')?.value.trim()||'').toUpperCase(),
        row:$('#wh-add-row')?.value?parseInt($('#wh-add-row').value)||'':'',
        location:$('#wh-add-loc')?.value.trim(),
        description:$('#wh-add-desc')?.value.trim(),
        updatedAt:now,
      });
    }
  } else {
    const id=_whNextId('WH-',AppState.data.warehouseItems);
    AppState.data.warehouseItems.push({
      id,name,code:$('#wh-add-code')?.value.trim(),
      barcode:$('#wh-add-barcode')?.value.trim(),
      category:$('#wh-add-cat')?.value,unit:$('#wh-add-unit')?.value.trim(),
      unitCost:parseFloat($('#wh-add-cost')?.value||0),
      minStock:parseFloat($('#wh-add-min')?.value||0),
      reorderPoint:parseFloat($('#wh-add-reorder')?.value||0),
      rack:($('#wh-add-rack')?.value.trim()||'').toUpperCase(),
      row:$('#wh-add-row')?.value?parseInt($('#wh-add-row').value)||'':'',
      location:$('#wh-add-loc')?.value.trim(),
      description:$('#wh-add-desc')?.value.trim(),
      qtyOnHand:0,qtyReserved:0,qtyAvailable:0,netIssued:0,
      createdAt:now,updatedAt:now,
    });
  }
  AppState.save();
  closeModal('whItemModal');
  showToast(editId?'Item updated':'Item added','success');
  _whRenderTab();
}

function _whEditItem(id){_whShowAddItem(id);}

function _whDeleteItem(id){
  if(typeof hasModulePermission==='function'&&!hasModulePermission('warehouse','manage')){showToast('Only Warehouse Managers can delete items','warning');return;}
  if(!confirm('Delete this warehouse item? This will not delete its transaction history.'))return;
  const idx=(AppState.data.warehouseItems||[]).findIndex(i=>i.id===id);
  if(idx!==-1){
    const before={...AppState.data.warehouseItems[idx]};
    AppState.data.warehouseItems[idx]._deleted=true;
    auditLog('DELETE','Warehouse','WarehouseItem',id,before,null,'Item deleted');
  }
  AppState.save();showToast('Item removed','success');_whRenderTab();
}

function _whClearAll(){
  if(!confirm('Clear ALL warehouse items? This cannot be undone.\n\nTransaction history will be preserved but items will be removed.'))return;
  (AppState.data.warehouseItems||[]).forEach(i=>i._deleted=true);
  AppState.save();showToast('All warehouse items cleared','success');_whRenderTab();
}

// ── ADD ISSUANCE REQUEST ─────────────────────────────────────
let _whReqLines=[{itemId:'',qty:''}];

function _whReqLinesHTML(){
  const items=_whItems();
  return _whReqLines.map((ln,idx)=>{
    const q=ln.itemId?_whCalcQty(ln.itemId):null;
    const item=ln.itemId?items.find(i=>i.id===ln.itemId):null;
    const avail=q?q.qtyAvailable:null;
    const availColor=avail===null?'var(--text-secondary)':avail<=0?'var(--accent-red)':'var(--accent-green)';
    const itemOpts=items.map(i=>`<option value="${i.id}"${i.id===ln.itemId?' selected':''}>${i.name}</option>`).join('');
    return`<tr style="border-bottom:1px solid var(--border)">
      <td style="padding:6px 6px">
        <select class="form-control" style="font-size:12px;width:100%" onchange="_whReqLines[${idx}].itemId=this.value;_whRefreshReqLines()">
          <option value="">— Select —</option>${itemOpts}
        </select>
      </td>
      <td style="padding:6px 6px;text-align:center;font-size:11px;width:80px">
        ${q?`<span style="color:${availColor};font-weight:700">${avail}</span> <span style="color:var(--text-secondary)">${item?.unit||''}</span>`:'—'}
      </td>
      <td style="padding:6px 6px;width:90px">
        <input class="form-control" type="number" min="0.01" step="0.01" style="font-size:12px" placeholder="0" value="${ln.qty||''}"
          oninput="_whReqLines[${idx}].qty=this.value">
      </td>
      <td style="padding:6px 4px;width:32px;text-align:center">
        ${_whReqLines.length>1?`<button class="btn btn-secondary btn-sm" style="padding:2px 5px;color:var(--accent-red)" onclick="_whReqLines.splice(${idx},1);_whRefreshReqLines()"><i class="fas fa-times"></i></button>`:''}
      </td>
    </tr>`;
  }).join('');
}

function _whRefreshReqLines(){
  const el=$('#whr-lines');
  if(el)el.innerHTML=_whReqLinesHTML();
}

function _whShowAddRequest(){
  _whReqLines=[{itemId:'',qty:''}];
  const projects=(AppState.data.projects||[]).filter(p=>!p._deleted&&p.status!=='completed');
  const html=`
  <div class="modal-overlay open" data-dynamic="1" id="whReqModal">
    <div class="modal" style="max-width:560px">
      <div class="modal-header">
        <div class="modal-title"><i class="fas fa-clipboard-list" style="color:var(--accent-blue);margin-right:8px"></i>New Issuance Request</div>
        <button class="modal-close" onclick="closeModal('whReqModal')"><i class="fas fa-times"></i></button>
      </div>
      <div class="modal-body">
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:14px">
          <div class="form-group" style="margin:0;grid-column:1/-1">
            <label class="form-label">Project</label>
            <select class="form-control" id="whr-proj">
              <option value="">— No project —</option>
              ${projects.map(p=>{const label=`${p.id} — ${p.name||''}`;return`<option value="${p.id}">${label.length>60?label.slice(0,60)+'…':label}</option>`;}).join('')}
            </select>
          </div>
          <div class="form-group" style="margin:0">
            <label class="form-label">Requested By</label>
            <input class="form-control" id="whr-by" value="${AppState.currentUser?.displayName||''}" placeholder="Your name">
          </div>
          <div class="form-group" style="margin:0">
            <label class="form-label">Date Needed</label>
            <input class="form-control" type="date" id="whr-date" value="${new Date().toISOString().slice(0,10)}">
          </div>
          <div class="form-group" style="margin:0">
            <label class="form-label">Priority</label>
            <select class="form-control" id="whr-priority">
              <option value="normal">🟡 Normal</option>
              <option value="urgent">🔴 Urgent</option>
              <option value="low">🟢 Low</option>
            </select>
          </div>
          <div class="form-group" style="margin:0">
            <label class="form-label">Deliver To / Location</label>
            <input class="form-control" id="whr-location" placeholder="e.g. Site A, Shop, Gate 2">
          </div>
          <div class="form-group" style="margin:0;grid-column:1/-1">
            <label class="form-label">Purpose / Reason *</label>
            <textarea class="form-control" id="whr-reason" rows="2" placeholder="Why are these items needed?"></textarea>
          </div>
        </div>
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px">
          <div style="font-size:12px;font-weight:600;color:var(--text-secondary)"><i class="fas fa-list" style="margin-right:6px"></i>Items Requested</div>
          <button class="btn btn-secondary btn-sm" onclick="_whReqLines.push({itemId:'',qty:''});_whRefreshReqLines()"><i class="fas fa-plus"></i> Add Item</button>
        </div>
        <div style="border:1px solid var(--border);border-radius:6px;overflow:hidden;margin-bottom:4px">
          <table style="width:100%;border-collapse:collapse;table-layout:fixed">
            <thead><tr style="background:var(--bg-tertiary)">
              <th style="padding:7px 8px;font-size:11px;font-weight:600;color:var(--text-secondary);text-align:left">Item</th>
              <th style="padding:7px 8px;font-size:11px;font-weight:600;color:var(--text-secondary);text-align:center;width:80px">Available</th>
              <th style="padding:7px 8px;font-size:11px;font-weight:600;color:var(--text-secondary);text-align:left;width:90px">Qty</th>
              <th style="width:32px"></th>
            </tr></thead>
            <tbody id="whr-lines">${_whReqLinesHTML()}</tbody>
          </table>
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" onclick="closeModal('whReqModal')">Cancel</button>
        <button class="btn btn-primary" onclick="_whSaveRequest()"><i class="fas fa-paper-plane"></i> Submit Request</button>
      </div>
    </div>
  </div>`;
  document.body.insertAdjacentHTML('beforeend',html);
}

function _whSaveRequest(){
  const reason=$('#whr-reason')?.value.trim();
  if(!reason){showToast('Please state the reason/purpose','error');return;}
  const valid=_whReqLines.filter(ln=>ln.itemId&&parseFloat(ln.qty)>0);
  if(!valid.length){showToast('Add at least one item with qty > 0','error');return;}
  if(!AppState.data.issuanceRequests)AppState.data.issuanceRequests=[];
  const projectId=$('#whr-proj')?.value||null;
  const requestedBy=$('#whr-by')?.value.trim();
  const dateNeeded=$('#whr-date')?.value;
  const priority=$('#whr-priority')?.value||'normal';
  const location=$('#whr-location')?.value.trim();
  const requestedAt=new Date().toISOString();
  valid.forEach(ln=>{
    AppState.data.issuanceRequests.push({
      id:_whNextId('REQ-',AppState.data.issuanceRequests),
      itemId:ln.itemId,qty:parseFloat(ln.qty),
      projectId,requestedBy,dateNeeded,reason,priority,location,
      status:'pending',requestedAt,
    });
  });
  AppState.save();
  closeModal('whReqModal');
  showToast(`${valid.length} item${valid.length>1?'s':''} requested — awaiting approval`,'success',3500);
  _whRenderTab();
}

// ── QUICK ACTIONS ────────────────────────────────────────────
function _whShowReceive(itemId){_whTab='receive';_whRenderTab();setTimeout(()=>{const el=$('#wh-rcv-item');if(el){el.value=itemId;}},50);}
function _whShowIssueItem(itemId){_whTab='issue';_whRenderTab();setTimeout(()=>{const el=$('#wh-iss-item');if(el){el.value=itemId;_whFillIssueInfo();}},50);}

// ── EXPORT HELPERS ───────────────────────────────────────────
function _whDownloadTemplate(){
  exportCSV(
    [['MAT-001','Portland Cement Type I','Materials','bag','320.00','50','30','A','1','Bin A-1','100'],
     ['CON-001','Welding Rod E6013','Consumables','pcs','18.50','200','100','B2','3','Near entrance','500']],
    ['Code','Name','Category','Unit','UnitCost','MinStock','ReorderPoint','Rack','Row','Location','OpeningQty'],
    'warehouse_import_template.csv'
  );
}
function _whExportItems(){
  const rows=_whItems().map(i=>{const q=_whCalcQty(i.id);return[i.id,i.code||'',i.name,i.category||'',i.unit||'',i.rack||'',i.row||'',q.qtyOnHand,q.qtyReserved,q.qtyAvailable,i.unitCost||0,q.qtyOnHand*(i.unitCost||0),i.minStock||0,i.location||'',i.description||''];});
  exportCSV(rows,['ID','Code','Name','Category','Unit','Rack','Row','OnHand','Reserved','Available','UnitCost','TotalValue','MinStock','Location','Description'],'warehouse_items.csv');
}
function _whExportLedger(){
  const rows=_whTx().map(t=>{const item=_whItems().find(i=>i.id===t.itemId);return[t.id,t.date||'',t.type,item?.name||t.itemId,t.qty,t.projectId||'',t.vendor||t.issuedBy||'',t.ref||'',t.notes||''];});
  exportCSV(rows,['TxID','Date','Type','Item','Qty','Project','Vendor/By','Reference','Notes'],'warehouse_ledger.csv');
}

// ── DATA INITIALISER ─────────────────────────────────────────
function _ensureWarehouseData(){
  if(!AppState.data.warehouseItems)AppState.data.warehouseItems=[];
  if(!AppState.data.stockTransactions)AppState.data.stockTransactions=[];
  if(!AppState.data.issuanceRequests)AppState.data.issuanceRequests=[];
}
