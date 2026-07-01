function _syncProcurementAllocations(){} // stub — procurement→allocations sync not yet implemented
function renderMaterials(){
  _syncProcurementAllocations();
const{materials}=AppState.data;
const totVal=materials.reduce((s,m)=>s+m.qty*m.unitCost,0);
$('#materials').innerHTML=`<div class="section-header" style="margin-bottom:14px">
<div class="section-title">Material Tracking</div>
<button class="btn btn-primary btn-sm" onclick="showToast('Add material form','info')"><i class="fas fa-plus"></i> Add</button></div>
<div class="grid grid-4" style="margin-bottom:14px">
${sc('fas fa-boxes','Total Items',materials.length,'Tracked materials','#388bfd','rgba(56,139,253,.15)')}
${sc('fas fa-check','Delivered',materials.filter(m=>m.status==='delivered').length,'On site','#3fb950','rgba(63,185,80,.15)')}
${sc('fas fa-shipping-fast','In Transit',materials.filter(m=>m.status==='ordered'||m.status==='partial').length,'En route','#f0a450','rgba(240,164,80,.15)')}
${sc('fas fa-exclamation-circle','Critical',materials.filter(m=>m.critical).length,'Critical path','#f85149','rgba(248,81,73,.15)')}
</div>
<div class="card"><div class="section-header" style="margin-bottom:12px"><div class="section-title">Material Status Register</div><span style="font-size:11px;color:var(--text-secondary)">Total Value: ${fmtCur(totVal)}</span></div>
<div class="table-wrap"><table>
<thead><tr><th>ID</th><th>Project</th><th>Material</th><th>Qty</th><th>Unit</th><th>Unit Cost</th><th>Total Value</th><th>Supplier</th><th>Delivery</th><th>Status</th><th>Critical</th><th>Actions</th></tr></thead>
<tbody>${_pgSlice("materials_mod",materials).map(m=>`<tr>
<td style="font-size:10px;font-family:var(--font-mono)">${m.id}</td>
<td><span class="badge badge-blue">${m.projectId}</span></td>
<td style="font-weight:500;font-size:12px;max-width:180px">${m.name}</td>
<td style="font-family:var(--font-mono)">${m.qty.toLocaleString()}</td>
<td><span class="badge badge-gray">${m.unit}</span></td>
<td style="font-family:var(--font-mono)">${fmtCur(m.unitCost)}</td>
<td style="font-family:var(--font-mono);font-weight:600">${fmtCur(m.qty*m.unitCost)}</td>
<td style="font-size:11px">${m.supplier}</td>
<td style="font-size:11px;font-family:var(--font-mono);color:${isOverdue(m.deliveryDate)?'var(--accent-red)':'inherit'}">${m.deliveryDate}</td>
<td>${sBadge(m.status)}</td>
<td>${m.critical?'<span class="badge badge-red">&#9888; Critical</span>':'<span style="color:var(--text-muted)">-</span>'}</td>
<td><div style="display:flex;gap:3px;position:relative">
<button class="btn btn-secondary btn-sm btn-icon" onclick="showAssetDetail('${m.id}','materials')" title="View detail & attachments"><i class="fas fa-paperclip"></i>${(m.attachments&&m.attachments.length)?`<span style="position:absolute;top:-4px;right:-4px;background:var(--accent-amber);color:#fff;font-size:8px;padding:1px 4px;border-radius:6px;font-weight:700">${m.attachments.length}</span>`:''}</button>
</div></td>
</tr>`).join('')}</tbody></table>${_pgNav("materials_mod",materials,typeof renderMaterials==="function"?renderMaterials:null)}</div></div>`;}


// ── PROCUREMENT MODULE ────────────────────────────────────

// Workflow stages in order
const PROC_STAGES=[
  {id:'draft',        label:'Draft',            icon:'fa-file-alt',             color:'#8b949e'},
  {id:'requested',    label:'Requested',         icon:'fa-paper-plane',          color:'#388bfd'},
  {id:'disapproved',  label:'Disapproved',        icon:'fa-times-circle',         color:'#f85149'},
  {id:'approved',     label:'PR Approved',        icon:'fa-check-circle',         color:'#bc8cff'},
  {id:'rfq',          label:'RFQ Sent',           icon:'fa-envelope-open',        color:'#39d3f2'},
  {id:'quoted',       label:'Quotes Received',    icon:'fa-file-invoice',         color:'#f59e0b'},
  {id:'evaluated',    label:'Bid Evaluated',      icon:'fa-balance-scale',        color:'#fb8f44'},
  {id:'po_issued',    label:'PO Issued',          icon:'fa-shopping-cart',        color:'#388bfd'},
  {id:'partial',      label:'Partial Delivery',   icon:'fa-truck',                color:'#f0a450'},
  {id:'delivered',    label:'Fully Delivered',    icon:'fa-check-double',         color:'#3fb950'},
  {id:'invoiced',     label:'Invoiced',           icon:'fa-file-invoice-dollar',  color:'#bc8cff'},
  {id:'paid',         label:'Payment Done',        icon:'fa-money-check-alt',      color:'#3fb950'},
  {id:'closed',       label:'Closed Out',         icon:'fa-archive',              color:'#8b949e'},
  {id:'cancelled',    label:'Cancelled',          icon:'fa-ban',                  color:'#f85149'},
];

function getProcStage(id){return PROC_STAGES.find(s=>s.id===id)||PROC_STAGES[0];}
function getProcStageColor(id){return getProcStage(id).color;}
function getProcStageIcon(id){return getProcStage(id).icon;}

// Ensure procurement logs array exists
function ensureProcLogs(){
  if(!AppState.data.procurementLogs)AppState.data.procurementLogs=[];
  // Legacy: migrate old procurement to new schema if needed
  (AppState.data.procurement||[]).forEach(po=>{
    if(!po.requestedBy)po.requestedBy='';
    if(!po.responsiblePerson)po.responsiblePerson='';
    if(!po.prNumber)po.prNumber='';
    if(!po.notes)po.notes='';
    if(!po.priority)po.priority='normal';
    if(!po.paymentTerms)po.paymentTerms='';
    if(!po.deliveryAddress)po.deliveryAddress='';
    if(!po.currency)po.currency='PHP';
  });
}


// ── PROCUREMENT IMPORT ────────────────────────────────────────────────────
function importProcurement(){
  const template='RequestNumber,PRNumber,PONumber,Description,Category,ProjectID,Vendor,Amount,BudgetAmount,Priority,Status,RequestedBy,ResponsiblePerson,PRDate,PODate,DeliveryDate,PaymentTerms,Notes';
  $('#genericModalTitle').textContent='Import Procurement Records';
  $('#genericModalBody').innerHTML=`
  <div style="padding:12px;background:rgba(56,139,253,.08);border-radius:8px;margin-bottom:14px;border-left:3px solid var(--accent-blue)">
    <div style="font-size:13px;font-weight:600;margin-bottom:6px"><i class="fas fa-info-circle" style="color:var(--accent-blue);margin-right:6px"></i>Import Instructions</div>
    <ol style="font-size:11px;color:var(--text-secondary);padding-left:18px;line-height:2">
      <li>Download the template — export your existing records first to see the format</li>
      <li><strong>Status</strong> values: <code style="background:var(--bg-hover);padding:1px 4px;border-radius:3px">draft, rfq, evaluation, approved, po_issued, partial, delivered, invoiced, paid, closed, cancelled</code></li>
      <li><strong>PONumber</strong> — leave blank until PO is awarded to supplier</li>
      <li><strong>PRDate / PODate / DeliveryDate</strong> format: YYYY-MM-DD</li>
    </ol>
  </div>
  <div style="display:flex;gap:8px;margin-bottom:14px">
    <button class="btn btn-secondary btn-sm" onclick="downloadTemplate('${template}','procurement_template.csv')"><i class="fas fa-file-excel" style="color:#217346"></i> Download Template</button>
    <button class="btn btn-secondary btn-sm" onclick="exportCSV(/* current */[],'procurement')"><i class="fas fa-download"></i> Export Current First</button>
  </div>
  <div class="form-group">
    <label class="form-label">Select CSV File *</label>
    <input type="file" id="procImportFile" accept=".csv" class="form-input" style="padding:4px" onchange="previewProcImport(this)">
  </div>
  <div id="procImportPreview" style="margin-top:10px"></div>`;
  window._procImportRows=null;
  $('#genericModalFooter').innerHTML=`
    <button class="btn btn-secondary" onclick="closeModal('genericModal')">Cancel</button>
    <button class="btn btn-primary" id="procImportBtn" onclick="executeProcImport()" disabled><i class="fas fa-file-import"></i> Import</button>`;
  openModal('genericModal');
}

function previewProcImport(input){
  const file=input.files[0];if(!file)return;
  const reader=new FileReader();
  reader.onload=ev=>{
    try{
      const rows=parseCSVToRows(ev.target.result);
      window._procImportRows=rows;
      const btn=$('#procImportBtn');if(btn)btn.removeAttribute('disabled');
      const prev=$('#procImportPreview');if(!prev)return;
      const headers=Object.keys(rows[0]||{});
      const show=rows.slice(0,4);
      prev.innerHTML=`<div style="margin-bottom:8px;font-size:12px;font-weight:600;color:var(--accent-green)"><i class="fas fa-check-circle" style="margin-right:5px"></i>${rows.length} records ready</div>
      <div style="overflow-x:auto;max-height:140px;border:1px solid var(--border);border-radius:6px">
        <table style="width:100%;font-size:10px;border-collapse:collapse">
          <thead style="background:var(--bg-hover)"><tr>${headers.map(h=>`<th style="padding:5px 8px;border-bottom:1px solid var(--border)">${h}</th>`).join('')}</tr></thead>
          <tbody>${show.map((r,i)=>`<tr style="${i%2?'background:var(--bg-hover)':''}">${headers.map(h=>`<td style="padding:4px 8px;border-bottom:1px solid var(--border);max-width:120px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${r[h]||''}</td>`).join('')}</tr>`).join('')}
          ${rows.length>4?`<tr><td colspan="${headers.length}" style="padding:5px 8px;text-align:center;color:var(--text-muted)">... ${rows.length-4} more</td></tr>`:''}</tbody>
        </table>
      </div>`;
    }catch(e){const p=$('#procImportPreview');if(p)p.innerHTML=`<div style="color:var(--accent-red);padding:10px">Error: ${e.message}</div>`;}
  };
  reader.readAsText(file);
}

function executeProcImport(){
  const rows=window._procImportRows;
  if(!rows||!rows.length){showToast('No data to import','error');return;}
  if(!AppState.data.procurement)AppState.data.procurement=[];
  const list=AppState.data.procurement;
  const n=(row,k)=>{const v=row[k];if(v!==undefined)return String(v);const nk=k.toLowerCase().replace(/\s+/g,'');const match=Object.entries(row).find(([ck])=>ck.toLowerCase().replace(/\s+/g,'')===nk);return match?String(match[1]):'';}; 
  const validStatuses=['draft','rfq','evaluation','approved','po_issued','partial','delivered','invoiced','paid','closed','cancelled'];
  const _procLen=(AppState.data.procurement||[]).length;
  let added=0,updated=0,skipped=0;
  rows.forEach((row,i)=>{
    const desc=n(row,'Description').trim();
    if(!desc){skipped++;return;}
    const status=(n(row,'Status')||'draft').toLowerCase().trim();
    const rec={
      id:'PR-'+String(_procLen+added+1).padStart(4,'0'),
      requestNumber:n(row,'RequestNumber')||n(row,'Request No.')||n(row,'RequestNo')||'REQ-'+String(_procLen+added+1).padStart(3,'0'),
      prNumber:n(row,'PRNumber')||n(row,'PR Number')||n(row,'PRNo')||'',
      poNumber:n(row,'PONumber')||n(row,'PO Number')||n(row,'PONo')||'',
      description:desc,
      category:n(row,'Category')||'',
      projectId:n(row,'ProjectID')||n(row,'Project')||'',
      vendor:n(row,'Vendor')||'',
      amount:parseFloat(n(row,'Amount'))||0,
      budgetAmount:parseFloat(n(row,'BudgetAmount')||n(row,'Budget Amount'))||0,
      priority:(n(row,'Priority')||'normal').toLowerCase(),
      status:validStatuses.includes(status)?status:'draft',
      requestedBy:n(row,'RequestedBy')||n(row,'Requested By')||'',
      responsiblePerson:n(row,'ResponsiblePerson')||n(row,'Responsible')||'',
      prDate:n(row,'PRDate')||n(row,'PR Date')||'',
      poDate:n(row,'PODate')||n(row,'PO Date')||'',
      deliveryDate:n(row,'DeliveryDate')||n(row,'Delivery Date')||'',
      paymentTerms:n(row,'PaymentTerms')||n(row,'Payment Terms')||'',
      notes:n(row,'Notes')||'',
      createdAt:Date.now(),
    };
    // Match by RequestNumber if it exists
    const existIdx=list.findIndex(p=>p.requestNumber&&p.requestNumber===rec.requestNumber);
    if(existIdx>=0){list[existIdx]={...list[existIdx],...rec,id:list[existIdx].id};updated++;}
    else{list.push(rec);added++;}
  });
  AppState.save();
  closeModal('genericModal');
  window._procImportRows=null;
  if(typeof renderProcurement==='function')renderProcurement();
  showToast(`Procurement import: ${added} added, ${updated} updated, ${skipped} skipped`,'success',4000);
}
