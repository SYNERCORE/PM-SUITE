function renderMasterlist(){
  const d=AppState.data;
  const personnel=getActive('resources');
  const equipment=getActive('equipment');
  const tools=getActive('tools');
  const vehicles=getActive('vehicles');
  const consumables=getActive('consumables');
  const materials=getActive('materials');
  const thirdParty=getActive('thirdParty');

  const totFleet=equipment.reduce((s,r)=>s+r.dailyRate*30,0)+tools.reduce((s,r)=>s+r.dailyRate*30,0)+vehicles.reduce((s,r)=>s+r.dailyRate*30,0);
  const totStock=(AppState.data.warehouseItems||[]).filter(i=>!i._deleted).reduce((s,i)=>{const q=typeof _whCalcQty==='function'?_whCalcQty(i.id):{qtyOnHand:0};return s+(q.qtyOnHand*(i.unitCost||0));},0);
  const totalItems=personnel.length+equipment.length+tools.length+vehicles.length+consumables.length+materials.length+thirdParty.length;
  const inUse=equipment.filter(e=>e.status==='in-use').length+tools.filter(t=>t.status==='in-use').length+vehicles.filter(v=>v.status==='in-use').length;
  const underMaint=equipment.filter(e=>e.status==='maintenance').length+tools.filter(t=>t.status==='maintenance').length+vehicles.filter(v=>v.status==='maintenance').length;
  const lowStock=(AppState.data.warehouseItems||[]).filter(i=>!i._deleted&&i.minStock>0&&(typeof _whCalcQty==='function'?_whCalcQty(i.id).qtyOnHand:0)<=i.minStock).length;

  const tabs=[
    {id:'all',label:'All Assets',icon:'fa-th-list',count:totalItems},
    {id:'personnel',label:'Personnel',icon:'fa-users',count:personnel.length},
    {id:'equipment',label:'Equipment',icon:'fa-cog',count:equipment.length},
    {id:'tools',label:'Tools',icon:'fa-wrench',count:tools.length},
    {id:'vehicles',label:'Vehicles',icon:'fa-truck',count:vehicles.length},
    {id:'warehouse',label:'Item Master',icon:'fa-book-open',count:consumables.length+materials.length},
    {id:'thirdparty',label:'Third Party',icon:'fa-handshake',count:thirdParty.length},
    {id:'history',label:'Asset History',icon:'fa-history',count:(d.assetHistory||[]).length},
  ];

  $('#masterlist').innerHTML=`
  <div class="section-header" style="margin-bottom:14px">
    <div><div class="section-title">Company Asset Masterlist</div>
    <div class="section-sub">Complete inventory &nbsp;·&nbsp; All fields editable inline — changes save automatically</div></div>
    <div style="display:flex;gap:7px">
      <button class="btn btn-secondary btn-sm" onclick="exportMasterlistCSV()"><i class="fas fa-file-csv"></i> Export All CSV</button>
      <button class="btn btn-primary btn-sm" onclick="showMasterlistAdd()"><i class="fas fa-plus"></i> Add Asset</button>
    </div>
  </div>

  <div style="display:grid;grid-template-columns:repeat(6,1fr);gap:10px;margin-bottom:16px">
    <div class="stat-card"><div class="stat-icon" style="background:rgba(56,139,253,.15)"><i class="fas fa-th-list" style="color:var(--accent-blue)"></i></div><div class="stat-info"><div class="label">Total Assets</div><div class="value" style="color:var(--accent-blue)">${totalItems}</div></div></div>
    <div class="stat-card"><div class="stat-icon" style="background:rgba(240,164,80,.15)"><i class="fas fa-hard-hat" style="color:var(--accent-amber)"></i></div><div class="stat-info"><div class="label">In Use</div><div class="value" style="color:var(--accent-amber)">${inUse}</div></div></div>
    <div class="stat-card"><div class="stat-icon" style="background:rgba(248,81,73,.15)"><i class="fas fa-tools" style="color:var(--accent-red)"></i></div><div class="stat-info"><div class="label">Maintenance</div><div class="value" style="color:var(--accent-red)">${underMaint}</div></div></div>
    <div class="stat-card"><div class="stat-icon" style="background:rgba(248,81,73,.15)"><i class="fas fa-exclamation-triangle" style="color:var(--accent-red)"></i></div><div class="stat-info"><div class="label">Low Stock</div><div class="value" style="color:var(--accent-red)">${lowStock}</div></div></div>
    <div class="stat-card" style="border-left:3px solid var(--accent-amber)"><div class="stat-icon" style="background:rgba(240,164,80,.15)"><i class="fas fa-dollar-sign" style="color:var(--accent-amber)"></i></div><div class="stat-info"><div class="label">Fleet Value/mo</div><div class="value" style="color:var(--accent-amber);font-size:14px">${fmtNum(totFleet)}</div></div></div>
    <div class="stat-card" style="border-left:3px solid var(--accent-green)"><div class="stat-icon" style="background:rgba(63,185,80,.15)"><i class="fas fa-boxes" style="color:var(--accent-green)"></i></div><div class="stat-info"><div class="label">Stock Value</div><div class="value" style="color:var(--accent-green);font-size:14px">${fmtNum(totStock)}</div></div></div>
  </div>

  <div class="card" style="margin-bottom:14px;padding:12px 16px">
    <div style="display:flex;align-items:center;gap:14px;flex-wrap:wrap">
      ${[['Personnel',personnel.length,'#388bfd','personnel'],['Equipment',equipment.length,'#f0a450','equipment'],['Tools',tools.length,'#bc8cff','tools'],['Vehicles',vehicles.length,'#39d3f2','vehicles'],['Item Master',consumables.length+materials.length,'#3fb950','warehouse'],['Third Party',thirdParty.length,'#f85149','thirdparty']].map(([l,n,c,t])=>`
      <div style="display:flex;align-items:center;gap:6px;cursor:pointer" onclick="mlTab='${t}';renderMasterlist()">
        <div style="width:10px;height:10px;border-radius:50%;background:${c}"></div>
        <span style="font-size:11px;font-weight:600">${l}</span>
        <span style="font-size:12px;font-weight:700;font-family:var(--font-mono);background:${c}22;color:${c};padding:1px 8px;border-radius:10px">${n}</span>
      </div>`).join('')}
    </div>
  </div>

  <div class="filters-bar" style="margin-bottom:12px">
    <div class="search-bar"><i class="fas fa-search"></i><input type="text" id="mlSearchInput" placeholder="Search name, ID, category, project, supplier..." value="${mlSearch}" oninput="(window._mlSearchDebounced||(window._mlSearchDebounced=debounce(v=>{mlSearch=v;_resetPage('ml_personnel');_resetPage('ml_equipment');_resetPage('ml_tools');_resetPage('ml_vehicles');renderMlTab();},250)))(this.value)"></div>
    <select class="form-select" style="height:32px;width:150px" onchange="mlStatusFilter=this.value;renderMlTab()">
      <option value="all" ${mlStatusFilter==='all'?'selected':''}>All Statuses</option>
      <option value="available" ${mlStatusFilter==='available'?'selected':''}>Available</option>
      <option value="in-use" ${mlStatusFilter==='in-use'?'selected':''}>In Use</option>
      <option value="in-stock" ${mlStatusFilter==='in-stock'?'selected':''}>In Stock</option>
      <option value="maintenance" ${mlStatusFilter==='maintenance'?'selected':''}>Maintenance</option>
      <option value="low-stock" ${mlStatusFilter==='low-stock'?'selected':''}>Low Stock</option>
    </select>
    <select class="form-select" style="height:32px;width:155px" onchange="mlProjectFilter=this.value;renderMlTab()">
      <option value="all" ${mlProjectFilter==='all'?'selected':''}>All Projects</option>
      <option value="N/A" ${mlProjectFilter==='N/A'?'selected':''}>— Not Assigned (Stored)</option>
      ${(AppState.data.projects||[]).map(p=>`<option value="${p.id}" ${mlProjectFilter===p.id?'selected':''}>${p.id}</option>`).join('')}
    </select>
    <button class="btn btn-secondary btn-sm" onclick="mlSearch='';mlStatusFilter='all';mlProjectFilter='all';$('#mlSearchInput').value='';renderMlTab()"><i class="fas fa-times"></i> Clear</button>
    <div style="margin-left:auto;font-size:11px;color:var(--text-secondary);display:flex;align-items:center;gap:5px">
      <div style="width:8px;height:8px;border-radius:50%;background:var(--accent-green)"></div>
      Changes auto-save as you type
    </div>
  </div>

  <div class="tabs" style="margin-bottom:14px">
    ${tabs.map(t=>`<div class="tab ${mlTab===t.id?'active':''}" onclick="mlTab='${t.id}';renderMlTab()">
      <i class="fas ${t.icon}" style="margin-right:4px"></i>${t.label}
      <span style="margin-left:4px;background:${mlTab===t.id?'rgba(255,255,255,.2)':'var(--bg-hover)'};border-radius:10px;padding:0 6px;font-size:10px;font-weight:700">${t.count}</span>
    </div>`).join('')}
  </div>
  <div id="mlTabContent"></div>`;

  renderMlTab();
}

function renderMlTab(){
  const map={all:renderMlAll,personnel:renderMlPersonnel,equipment:renderMlEquipment,tools:renderMlTools,vehicles:renderMlVehicles,warehouse:renderMlWarehouse,consumables:renderMlConsumables,materials:renderMlMaterials,thirdparty:renderMlThirdParty,history:renderMlHistory};
  if(map[mlTab])map[mlTab]();
}

function mlFilter(arr){
  let r=arr.filter(i=>i&&!i._deleted);
  if(mlSearch){
    const s=mlSearch.toLowerCase();
    r=r.filter(i=>Object.values(i).some(v=>String(v||'').toLowerCase().includes(s)));
  }
  if(mlProjectFilter!=='all'){
    if(mlProjectFilter==='N/A'){
      r=r.filter(i=>!i.projectId||i.projectId==='N/A'||i.projectId==='');
    }else{
      r=r.filter(i=>(i.projectId||'')===(mlProjectFilter));
    }
  }
  return r;
}

function mlSB(s){const m={available:'badge-green','in-use':'badge-blue',maintenance:'badge-red','out-of-service':'badge-red',standby:'badge-gray','in-stock':'badge-green','low-stock':'badge-amber',pending:'badge-amber',partial:'badge-amber',ordered:'badge-blue',delivered:'badge-green',active:'badge-green',busy:'badge-amber',unavailable:'badge-red',inactive:'badge-gray',expired:'badge-red'};return`<span class="badge ${m[s]||'badge-gray'}">${s}</span>`;}
function mlCB(exp){if(!exp||exp==='N/A')return`<span style="color:var(--text-muted);font-size:10px">N/A</span>`;const d=daysBetween(new Date().toISOString().split('T')[0],exp);return`<span class="badge ${d<0?'badge-red':d<60?'badge-amber':'badge-green'}" style="font-size:9px">${d<0?'EXPIRED':d<60?d+'d':exp}</span>`;}
function mlNA(v){return v&&v!=='N/A'?v:'<span style="color:var(--text-muted);font-size:10px">N/A</span>';}
function mlEmpty(label){return`<tr><td colspan="20"><div class="empty-state" style="padding:28px"><i class="fas fa-search" style="font-size:24px;margin-bottom:8px"></i><p>No ${label} match the current filters</p></div></td></tr>`;}
function projOpts(cur){
  const na=`<option value="N/A" ${(!cur||cur==='N/A')?'selected':''}>— Not Assigned (Stored)</option>`;
  return na+(AppState.data.projects||[]).map(p=>`<option value="${p.id}" ${cur===p.id?'selected':''}>${p.id} — ${p.name.substring(0,22)}</option>`).join('');
}
function statOpts(cur,opts){return opts.map(s=>`<option value="${s}" ${cur===s?'selected':''}>${s}</option>`).join('');}

// Helper: make an editable text input that auto-saves
function mlInput(id,listKey,field,val,style=''){
  return`<input class="form-input" value="${String(val||'').replace(/"/g,'&quot;')}" style="height:26px;font-size:11px;${style}" oninput="mlSave('${id}','${listKey}','${field}',this.value)" onchange="mlSave('${id}','${listKey}','${field}',this.value)">`;
}
function mlNumInput(id,listKey,field,val,style=''){
  return`<input class="form-input" type="number" value="${val||0}" style="height:26px;font-size:11px;font-family:var(--font-mono);${style}" oninput="mlSave('${id}','${listKey}','${field}',+this.value)" onchange="mlSave('${id}','${listKey}','${field}',+this.value)">`;
}
function mlDateInput(id,listKey,field,val,style=''){
  return`<input class="form-input" type="date" value="${safeDate(val)}" style="height:26px;font-size:11px;${style}" onchange="mlSave('${id}','${listKey}','${field}',this.value||'N/A')">`;
}
function mlSelect(id,listKey,field,cur,opts,extra=''){
  return`<select class="form-select" style="height:30px;font-size:11px;" onchange="mlSave('${id}','${listKey}','${field}',this.value)${extra?';'+extra:''}">${opts}</select>`;
}

// ── ALL VIEW ───────────────────────────────────────────────
function renderMlAll(){
  const d=AppState.data;const now=new Date().toISOString().split('T')[0];
  const typeColor={Personnel:'#388bfd',Equipment:'#f0a450',Tool:'#bc8cff',Vehicle:'#39d3f2',Consumable:'#3fb950',Material:'#fb8f44','Third Party':'#f85149'};
  let rows=[];
  mlFilter(d.resources||[]).forEach(r=>rows.push({id:r.id,name:r.name,type:'Personnel',category:r.dept,detail:r.role,identifier:r.id,status:r.availability,projectId:'—',location:r.dept,nextMaint:'N/A',nextCal:'N/A',certExpiry:'N/A',rate:r.hourlyRate*8,notes:(r.skills||[]).join(', ')}));
  mlFilter(d.equipment||[]).forEach(r=>rows.push({id:r.id,name:r.name,type:'Equipment',category:r.category,detail:`${r.make} ${r.model}`,identifier:r.serialNo,status:r.status,projectId:r.projectId,location:r.location,nextMaint:r.nextMaint,nextCal:r.nextCal,certExpiry:r.certExpiry,rate:r.dailyRate,notes:r.notes||''}));
  mlFilter(d.tools||[]).forEach(r=>rows.push({id:r.id,name:r.name,type:'Tool',category:r.category,detail:`${r.make} ${r.model}`,identifier:r.serialNo,status:r.status,projectId:r.projectId,location:r.location,nextMaint:'N/A',nextCal:r.nextCal,certExpiry:r.certExpiry,rate:r.dailyRate,notes:r.notes||''}));
  mlFilter(d.vehicles||[]).forEach(r=>rows.push({id:r.id,name:r.name,type:'Vehicle',category:r.category,detail:`${r.make} ${r.model}`,identifier:r.regNo,status:r.status,projectId:r.projectId,location:r.location,nextMaint:r.nextMaint,nextCal:'N/A',certExpiry:r.certExpiry,rate:r.dailyRate,notes:r.notes||''}));
  mlFilter(d.consumables||[]).forEach(c=>rows.push({id:c.id,name:c.name,type:'Consumable',category:c.category,detail:`${c.qtyOnHand} ${c.unit} on hand`,identifier:c.supplier,status:c.qtyOnHand<=c.minStock?'low-stock':'in-stock',projectId:c.projectId,location:'Store',nextMaint:'N/A',nextCal:'N/A',certExpiry:'N/A',rate:c.unitCost,notes:c.notes||''}));
  mlFilter(d.materials||[]).forEach(m=>rows.push({id:m.id,name:m.name,type:'Material',category:'Materials',detail:`${m.qty} ${m.unit}`,identifier:m.supplier,status:m.status,projectId:m.projectId,location:'Warehouse',nextMaint:'N/A',nextCal:'N/A',certExpiry:'N/A',rate:m.unitCost,notes:m.critical?'⚠ Critical':''}));
  mlFilter(d.thirdParty||[]).forEach(t=>rows.push({id:t.id,name:t.name,type:'Third Party',category:t.category,detail:t.service,identifier:t.contactPerson,status:t.status,projectId:t.projectId,location:'External',nextMaint:'N/A',nextCal:t.accreditationExpiry||'N/A',certExpiry:t.accreditationExpiry||'N/A',rate:Math.round(t.monthlyRate/30),notes:t.notes||''}));
  if(mlStatusFilter!=='all')rows=rows.filter(r=>r.status===mlStatusFilter);

  $('#mlTabContent').innerHTML=`<div class="card">
  <div class="section-header" style="margin-bottom:10px"><div class="section-title">All Company Assets <span style="font-size:12px;font-weight:400;color:var(--text-secondary)">${rows.length} records</span></div>
  <button class="btn btn-secondary btn-sm" onclick="exportMasterlistCSV()"><i class="fas fa-download"></i> Export CSV</button></div>
  <div class="table-wrap"><table>
  <thead><tr><th>ID</th><th>Name</th><th>Type</th><th>Category</th><th>Details</th><th>Identifier</th><th>Status</th><th>Project</th><th>Location</th><th>Next Maint.</th><th>Cal / Accred.</th><th>Cert Expiry</th><th>Unit Rate (₱)</th><th>Notes</th></tr></thead>
  <tbody>${rows.length?rows.map(r=>`<tr data-rowid="${r.id}">
    <td style="font-size:10px;font-family:var(--font-mono);font-weight:700;white-space:nowrap">${r.id}</td>
    <td style="font-weight:500;font-size:12px;min-width:150px">${esc(r.name)}</td>
    <td><span class="badge" style="background:${typeColor[r.type]||'#8b949e'}22;color:${typeColor[r.type]||'#8b949e'}">${r.type}</span></td>
    <td><span class="badge badge-gray">${r.category||'—'}</span></td>
    <td style="font-size:11px;color:var(--text-secondary);max-width:130px">${r.detail}</td>
    <td style="font-size:10px;font-family:var(--font-mono)">${r.identifier||'—'}</td>
    <td>${mlSB(r.status)}</td>
    <td><span class="badge badge-blue">${r.projectId||'—'}</span></td>
    <td style="font-size:11px">${r.location||'—'}</td>
    <td style="font-size:10px;font-family:var(--font-mono);color:${r.nextMaint&&r.nextMaint!=='N/A'&&daysBetween(now,r.nextMaint)<14?'var(--accent-red)':'inherit'}">${mlNA(r.nextMaint)}</td>
    <td style="font-size:10px;font-family:var(--font-mono)">${mlNA(r.nextCal)}</td>
    <td>${mlCB(r.certExpiry)}</td>
    <td style="font-family:var(--font-mono);font-size:11px">₱${Number(r.rate||0).toLocaleString()}</td>
    <td style="font-size:10px;color:var(--text-secondary);max-width:130px">${r.notes||'—'}</td>
  </tr>`).join(''):mlEmpty('assets')}
  </tbody></table></div></div>`;
}

// ── PERSONNEL ──────────────────────────────────────────────
function renderMlPersonnel(){
  let data=mlFilter(AppState.data.resources||[]);
  if(mlStatusFilter!=='all')data=data.filter(r=>r.availability===mlStatusFilter);
  const avgUtil=data.length?Math.round(data.reduce((s,r)=>s+r.utilization,0)/data.length):0;
  $('#mlTabContent').innerHTML=`
  <div class="grid grid-4" style="margin-bottom:12px">
    ${sc('fas fa-users','Total Personnel',(AppState.data.resources||[]).length,'In register','#388bfd','rgba(56,139,253,.15)')}
    ${sc('fas fa-check-circle','Available',(AppState.data.resources||[]).filter(r=>r.availability==='available').length,'Ready to assign','#3fb950','rgba(63,185,80,.15)')}
    ${sc('fas fa-chart-bar','Avg Utilization',avgUtil+'%',(AppState.data.resources||[]).filter(r=>r.utilization>80).length+' overloaded','#f0a450','rgba(240,164,80,.15)')}
    ${sc('fas fa-times-circle','Unavailable',(AppState.data.resources||[]).filter(r=>r.availability==='unavailable').length,'Not available','#f85149','rgba(248,81,73,.15)')}
  </div>
  <div class="card">
  <div class="section-header" style="margin-bottom:10px">
    <div class="section-title">Personnel Register <span style="font-size:12px;font-weight:400;color:var(--text-secondary)">${data.length} records</span></div>
    <div style="display:flex;gap:7px">
      <button class="btn btn-secondary btn-sm" onclick="importExcel('personnel')"><i class="fas fa-file-excel"></i> Import Excel</button>
      <button class="btn btn-secondary btn-sm" onclick="exportMlCSV('personnel')"><i class="fas fa-download"></i> Export</button>
      <button class="btn btn-primary btn-sm" onclick="showEditPersonnel(null)"><i class="fas fa-plus"></i> Add Personnel</button>
    </div>
  </div>
  <div class="table-wrap"><table>
  <thead><tr><th>ID</th><th>Name</th><th>Role</th><th>Department</th><th>Skills</th><th>Certifications</th><th>Utilization%</th><th>Availability</th><th>Hourly Rate (₱)</th><th>Daily Rate (₱)</th><th></th></tr></thead>
  <tbody>${_pgSliceN('ml_personnel',data,20).length?_pgSliceN('ml_personnel',data,20).map(r=>`<tr data-rowid="${r.id}">
    <td style="font-size:10px;font-family:var(--font-mono);font-weight:700">${r.id}</td>
    <td><div style="display:flex;align-items:center;gap:8px">${avatarH(r.name,30)}<div><div style="font-weight:600;font-size:12px">${esc(r.name)}</div><div style="font-size:9px;color:var(--text-muted)">${r.id}</div></div></div></td>
    <td><input class="form-input" value="${r.role||''}" style="min-width:120px;height:26px;font-size:11px" oninput="mlSavePersonnel('${r.id}','role',this.value)" onchange="mlSavePersonnel('${r.id}','role',this.value)"></td>
    <td><input class="form-input" value="${r.dept||''}" style="min-width:100px;height:26px;font-size:11px" oninput="mlSavePersonnel('${r.id}','dept',this.value)" onchange="mlSavePersonnel('${r.id}','dept',this.value)"></td>
    <td style="max-width:160px">${(r.skills||[]).map(s=>`<span class="chip" style="margin:1px;font-size:9px">${s}</span>`).join('')||'<span style="color:var(--text-muted);font-size:10px">—</span>'}</td>
    <td style="max-width:160px">${(r.certifications||[]).map(c=>`<span class="badge badge-purple" style="font-size:9px;margin:1px">${c}</span>`).join('')||'<span style="color:var(--text-muted);font-size:10px">—</span>'}</td>
    <td><div style="display:flex;align-items:center;gap:5px;min-width:90px">
      <div class="progress-bar" style="flex:1;height:5px"><div class="progress-fill" style="width:${r.utilization}%;background:${r.utilization>90?'var(--accent-red)':r.utilization>70?'var(--accent-amber)':'var(--accent-blue)'}"></div></div>
      <input class="form-input" type="number" value="${r.utilization}" style="width:46px;height:24px;font-family:var(--font-mono);font-size:10px;padding:0 4px" min="0" max="100" oninput="mlSavePersonnel('${r.id}','utilization',+this.value)" onchange="mlSavePersonnel('${r.id}','utilization',+this.value);setTimeout(renderMlPersonnel,700)">
    </div></td>
    <td><select class="form-select" style="height:30px;font-size:11px;min-width:100px" onchange="mlSavePersonnel('${r.id}','availability',this.value);setTimeout(renderMlPersonnel,700)">${_getDropdown('personnel_avail').map(s=>`<option value="${s}" ${r.availability===s?'selected':''}>${s}</option>`).join('')}</select></td>
    <td><input class="form-input" type="number" value="${r.hourlyRate||0}" style="width:85px;height:26px;font-family:var(--font-mono);font-size:11px" oninput="mlSavePersonnel('${r.id}','hourlyRate',+this.value)" onchange="mlSavePersonnel('${r.id}','hourlyRate',+this.value);setTimeout(renderMlPersonnel,700)"></td>
    <td style="font-family:var(--font-mono);font-size:11px;font-weight:600">₱${Number((r.hourlyRate||0)*8).toLocaleString()}</td>
    <td><div style="display:flex;flex-direction:column;gap:3px">
      <button class="btn btn-secondary btn-sm btn-icon" onclick="showEditPersonnel('${r.id}')" title="Edit all details"><i class="fas fa-edit"></i></button>
      <button class="btn btn-secondary btn-sm btn-icon" onclick="showAssetDetail('${r.id}','resources')" title="View attachments"><i class="fas fa-paperclip"></i>${(r.attachments&&r.attachments.length)?`<span style="position:absolute;top:-4px;right:-4px;background:var(--accent-amber);color:#fff;font-size:8px;padding:1px 4px;border-radius:6px;font-weight:700">${r.attachments.length}</span>`:''}</button>
      <button class="btn btn-danger btn-sm btn-icon" onclick="deletePersonnel('${r.id}')" title="Delete"><i class="fas fa-trash"></i></button>
    </div></td>
  </tr>`).join(''):mlEmpty('personnel')}
  </tbody></table>${_pgNavN('ml_personnel',data,typeof renderMlPersonnel==='function'?renderMlPersonnel:null,20)}</div></div>`;
}

function mlSavePersonnel(id,field,val){
  if(!AppState.data.resources)AppState.data.resources=[];
  const r=(AppState.data.resources||[]).find(r=>r.id===id);
  if(r){r[field]=val;if(typeof _stampEdit==='function')_stampEdit(r);AppState.save();}
}

function deletePersonnel(id){
  if(requestOrDelete('resources',id)){renderMlPersonnel();}
}

function showEditPersonnel(id){
  const r=id?(AppState.data.resources||[]).find(x=>x.id===id):null;
  const isNew=!r;
  const nextId='RES-'+String(((AppState.data.resources||[]).length+1)).padStart(3,'0');
  $('#genericModalTitle').textContent=isNew?'Add Personnel':'Edit Personnel — '+(r?.name||'');
  $('#genericModalBody').innerHTML=`
  <div class="form-grid">
    <div class="form-group"><label class="form-label">Employee / Resource ID</label><input class="form-input" id="prId" value="${r?.id||nextId}" ${!isNew?'readonly style="opacity:.6"':''}></div>
    <div class="form-group"><label class="form-label">Full Name *</label><input class="form-input" id="prName" value="${r?.name||''}" placeholder="Full name"></div>
    <div class="form-group"><label class="form-label">Role / Position *</label><input class="form-input" id="prRole" value="${r?.role||''}" placeholder="e.g., Senior Engineer"></div>
    <div class="form-group"><label class="form-label">Department</label><input class="form-input" id="prDept" value="${r?.dept||''}" placeholder="Department"></div>
    <div class="form-group"><label class="form-label">Hourly Rate (₱)</label><input class="form-input" type="number" id="prRate" value="${r?.hourlyRate||0}" min="0"></div>
    <div class="form-group"><label class="form-label">Utilization %</label><input class="form-input" type="number" id="prUtil" value="${r?.utilization||0}" min="0" max="100"></div>
    <div class="form-group"><label class="form-label">Availability</label><select class="form-select" id="prAvail">${_getDropdown('personnel_avail').map(s=>`<option value="${s}" ${r?.availability===s?'selected':''}>${s}</option>`).join('')}</select></div>
    <div class="form-group"><label class="form-label">Contact / Mobile</label><input class="form-input" id="prContact" value="${r?.contact||''}" placeholder="+63-xxx-xxx-xxxx"></div>
    <div class="form-group" style="grid-column:1/-1"><label class="form-label">Skills <span style="color:var(--text-muted);font-size:10px">(comma separated)</span></label><input class="form-input" id="prSkills" value="${(r?.skills||[]).join(', ')}" placeholder="e.g., Welding, Structural, AutoCAD"></div>
    <div class="form-group" style="grid-column:1/-1"><label class="form-label">Certifications <span style="color:var(--text-muted);font-size:10px">(comma separated)</span></label><input class="form-input" id="prCerts" value="${(r?.certifications||[]).join(', ')}" placeholder="e.g., PMP, AWS-CWI, OSHA-30"></div>
    <div class="form-group" style="grid-column:1/-1"><label class="form-label">Notes</label><input class="form-input" id="prNotes" value="${r?.notes||''}" placeholder="Additional info..."></div>
  </div>`;
  $('#genericModalFooter').innerHTML=`<button class="btn btn-secondary" onclick="closeModal('genericModal')">Cancel</button><button class="btn btn-primary" onclick="savePersonnel('${id||''}')"><i class="fas fa-save"></i> ${isNew?'Add Personnel':'Save Changes'}</button>`;
  openModal('genericModal');
}

function savePersonnel(id){
  const name=$('#prName')?.value?.trim();
  const role=$('#prRole')?.value?.trim();
  if(!name){showToast('Name is required','error');return;}
  if(!role){showToast('Role is required','error');return;}
  const rec={
    id:id||$('#prId')?.value||'RES-'+Date.now().toString().slice(-5),
    name,role,
    dept:$('#prDept')?.value||'',
    hourlyRate:parseFloat($('#prRate')?.value)||0,
    utilization:parseInt($('#prUtil')?.value)||0,
    availability:$('#prAvail')?.value||'available',
    contact:$('#prContact')?.value||'',
    skills:($('#prSkills')?.value||'').split(',').map(s=>s.trim()).filter(Boolean),
    certifications:($('#prCerts')?.value||'').split(',').map(s=>s.trim()).filter(Boolean),
    notes:$('#prNotes')?.value||''
  };
  if(!AppState.data.resources)AppState.data.resources=[];
  if(id){
    const idx=(AppState.data.resources||[]).findIndex(r=>r.id===id);
    if(idx>=0)AppState.data.resources[idx]={...AppState.data.resources[idx],...rec};
    else AppState.data.resources.push(rec);
  }else{
    if((AppState.data.resources||[]).find(r=>r.id===rec.id))rec.id='RES-'+Date.now().toString().slice(-5);
    AppState.data.resources.push(rec);
  }
  AppState.save();closeModal('genericModal');renderMlPersonnel();showToast(id?'Personnel updated':'Personnel added','success');
}


// ── EQUIPMENT ─────────────────────────────────────────────
function renderMlEquipment(){
  let data=mlFilter(AppState.data.equipment||[]);
  if(mlStatusFilter!=='all')data=data.filter(r=>r.status===mlStatusFilter);
  const now=new Date().toISOString().split('T')[0];
  const statOp=statOpts('',_getDropdown('equipment_status'));
  $('#mlTabContent').innerHTML=`
  <div class="grid grid-4" style="margin-bottom:12px">
    ${sc('fas fa-cog','Total Equipment',getActive('equipment').length,'In register','#f0a450','rgba(240,164,80,.15)')}
    ${sc('fas fa-check-circle','Available',getActive('equipment').filter(e=>e.status==='available').length,'Ready','#3fb950','rgba(63,185,80,.15)')}
    ${sc('fas fa-hard-hat','In Use',getActive('equipment').filter(e=>e.status==='in-use').length,'Deployed','#388bfd','rgba(56,139,253,.15)')}
    ${sc('fas fa-tools','Maintenance',getActive('equipment').filter(e=>e.status==='maintenance').length,'Needs attention','#f85149','rgba(248,81,73,.15)')}
  </div>
  <div class="card">
  <div class="section-header" style="margin-bottom:10px">
  <div class="section-title">Equipment Register <span style="font-size:12px;font-weight:400;color:var(--text-secondary)">${data.length} records</span></div>
  <div style="display:flex;gap:7px">
    <button class="btn btn-secondary btn-sm" onclick="exportMlCSV('equipment')"><i class="fas fa-download"></i> Export</button>
    <button class="btn btn-secondary btn-sm" onclick="importExcel('equipment')"><i class="fas fa-file-excel"></i> Import Excel</button>
    <button class="btn btn-primary btn-sm" onclick="showAddAsset('equipment')"><i class="fas fa-plus"></i> Add Equipment</button>
  </div></div>
  <div class="table-wrap"><table>
  <thead><tr><th>ID</th><th>Name</th><th>Category</th><th>Make</th><th>Model</th><th>Serial No.</th><th>Status</th><th>Project</th><th>Location</th><th>Last Maint.</th><th>Next Maint.</th><th>Last Cal.</th><th>Next Cal.</th><th>Cal. Body</th><th>Certification</th><th>Cert Body</th><th>Cert Expiry</th><th>Daily Rate (₱)</th><th>Notes</th><th></th></tr></thead>
  <tbody>${_pgSliceN('ml_equipment',data,20).length?_pgSliceN('ml_equipment',data,20).map(r=>{
    const mA=r.nextMaint&&r.nextMaint!=='N/A'&&daysBetween(now,r.nextMaint)<14;
    const cA=r.nextCal&&r.nextCal!=='N/A'&&daysBetween(now,r.nextCal)<14;
    return`<tr data-rowid="${r.id}">
    <td style="font-size:10px;font-family:var(--font-mono);font-weight:700;white-space:nowrap">${r.id}</td>
    <td style="font-weight:500;font-size:12px;min-width:140px">${esc(r.name)}</td>
    <td><span class="badge badge-gray">${r.category}</span></td>
    <td style="font-size:11px">${r.make}</td>
    <td style="font-size:11px">${r.model}</td>
    <td style="font-size:10px;font-family:var(--font-mono)">${r.serialNo}</td>
    <td><select class="form-select" style="height:30px;font-size:11px;min-width:105px" onchange="mlSave('${r.id}','equipment','status',this.value);renderMlEquipment()">${statOpts(r.status,_getDropdown('equipment_status'))}</select></td>
    <td><select class="form-select" style="height:30px;font-size:11px;min-width:85px" onchange="mlSave('${r.id}','equipment','projectId',this.value)">${projOpts(r.projectId)}</select></td>
    <td>${mlInput(r.id,'equipment','location',r.location,'min-width:100px')}</td>
    <td style="font-size:10px;font-family:var(--font-mono)">${mlNA(r.lastMaint)}</td>
    <td>${mlDateInput(r.id,'equipment','nextMaint',r.nextMaint,mA?'border-color:var(--accent-red);color:var(--accent-red);min-width:110px':'min-width:110px')}</td>
    <td style="font-size:10px;font-family:var(--font-mono)">${mlNA(r.lastCal)}</td>
    <td>${mlDateInput(r.id,'equipment','nextCal',r.nextCal,cA?'border-color:var(--accent-amber);min-width:110px':'min-width:110px')}</td>
    <td>${mlInput(r.id,'equipment','calBody',r.calBody,'min-width:90px')}</td>
    <td>${mlInput(r.id,'equipment','cert',r.cert,'min-width:120px')}</td>
    <td>${mlInput(r.id,'equipment','certBody',r.certBody,'min-width:80px')}</td>
    <td><div>${mlCB(r.certExpiry)}</div>${mlDateInput(r.id,'equipment','certExpiry',r.certExpiry!=='N/A'?r.certExpiry:'','min-width:110px;margin-top:2px')}</td>
    <td>${mlNumInput(r.id,'equipment','dailyRate',r.dailyRate,'width:90px')}</td>
    <td>${mlInput(r.id,'equipment','notes',r.notes||'','min-width:120px')}</td>
    <td><div style="display:flex;gap:3px;position:relative">
      <button class="btn btn-secondary btn-sm btn-icon" onclick="showAssetDetail('${r.id}','equipment')" title="View attachments"><i class="fas fa-paperclip"></i>${(r.attachments&&r.attachments.length)?`<span style="position:absolute;top:-4px;right:-4px;background:var(--accent-amber);color:#fff;font-size:8px;padding:1px 4px;border-radius:6px;font-weight:700">${r.attachments.length}</span>`:''}</button>
      <button class="btn btn-danger btn-sm btn-icon" onclick="deleteMlAsset('${r.id}','equipment');renderMlEquipment()" title="Delete"><i class="fas fa-trash"></i></button>
    </div></td>
  </tr>`;}).join(''):mlEmpty('equipment')}
  </tbody></table>${_pgNavN('ml_equipment',data,typeof renderMlEquipment==='function'?renderMlEquipment:null,20)}</div></div>`;
}

// ── TOOLS ─────────────────────────────────────────────────
function renderMlTools(){
  let data=mlFilter(AppState.data.tools||[]);
  if(mlStatusFilter!=='all')data=data.filter(r=>r.status===mlStatusFilter);
  const now=new Date().toISOString().split('T')[0];
  $('#mlTabContent').innerHTML=`<div class="card">
  <div class="section-header" style="margin-bottom:10px">
  <div class="section-title">Tools Register <span style="font-size:12px;font-weight:400;color:var(--text-secondary)">${data.length} records</span></div>
  <div style="display:flex;gap:7px">
    <button class="btn btn-secondary btn-sm" onclick="exportMlCSV('tools')"><i class="fas fa-download"></i> Export</button>
    <button class="btn btn-secondary btn-sm" onclick="importExcel('tools')"><i class="fas fa-file-excel"></i> Import Excel</button>
    <button class="btn btn-primary btn-sm" onclick="showAddAsset('tools')"><i class="fas fa-plus"></i> Add Tool</button>
  </div></div>
  <div class="table-wrap"><table>
  <thead><tr><th>ID</th><th>Tool Name</th><th>Category</th><th>Make</th><th>Model</th><th>Serial No.</th><th>Status</th><th>Project</th><th>Location</th><th>Last Cal.</th><th>Next Cal.</th><th>Cal. Body</th><th>Certification</th><th>Cert Expiry</th><th>Daily Rate (₱)</th><th>Notes</th><th></th></tr></thead>
  <tbody>${_pgSliceN('ml_tools',data,20).length?_pgSliceN('ml_tools',data,20).map(r=>{
    const cA=r.nextCal&&r.nextCal!=='N/A'&&daysBetween(now,r.nextCal)<14;
    return`<tr data-rowid="${r.id}">
    <td style="font-size:10px;font-family:var(--font-mono);font-weight:700;white-space:nowrap">${r.id}</td>
    <td style="font-weight:500;font-size:12px;min-width:140px">${esc(r.name)}</td>
    <td><span class="badge badge-gray">${r.category}</span></td>
    <td style="font-size:11px">${r.make}</td>
    <td style="font-size:11px">${r.model}</td>
    <td style="font-size:10px;font-family:var(--font-mono)">${r.serialNo}</td>
    <td><select class="form-select" style="height:30px;font-size:11px;min-width:105px" onchange="mlSave('${r.id}','tools','status',this.value);renderMlTools()">${statOpts(r.status,_getDropdown('tool_status'))}</select></td>
    <td><select class="form-select" style="height:30px;font-size:11px;min-width:85px" onchange="mlSave('${r.id}','tools','projectId',this.value)">${projOpts(r.projectId)}</select></td>
    <td>${mlInput(r.id,'tools','location',r.location,'min-width:100px')}</td>
    <td style="font-size:10px;font-family:var(--font-mono)">${mlNA(r.lastCal)}</td>
    <td>${mlDateInput(r.id,'tools','nextCal',r.nextCal,cA?'border-color:var(--accent-amber);min-width:110px':'min-width:110px')}</td>
    <td>${mlInput(r.id,'tools','calBody',r.calBody,'min-width:90px')}</td>
    <td>${mlInput(r.id,'tools','cert',r.cert,'min-width:120px')}</td>
    <td><div>${mlCB(r.certExpiry)}</div>${mlDateInput(r.id,'tools','certExpiry',r.certExpiry!=='N/A'?r.certExpiry:'','min-width:110px;margin-top:2px')}</td>
    <td>${mlNumInput(r.id,'tools','dailyRate',r.dailyRate,'width:90px')}</td>
    <td>${mlInput(r.id,'tools','notes',r.notes||'','min-width:120px')}</td>
    <td><div style="display:flex;gap:3px;position:relative">
      <button class="btn btn-secondary btn-sm btn-icon" onclick="showAssetDetail('${r.id}','tools')" title="View attachments"><i class="fas fa-paperclip"></i>${(r.attachments&&r.attachments.length)?`<span style="position:absolute;top:-4px;right:-4px;background:var(--accent-amber);color:#fff;font-size:8px;padding:1px 4px;border-radius:6px;font-weight:700">${r.attachments.length}</span>`:''}</button>
      <button class="btn btn-danger btn-sm btn-icon" onclick="deleteMlAsset('${r.id}','tools');renderMlTools()" title="Delete"><i class="fas fa-trash"></i></button>
    </div></td>
  </tr>`;}).join(''):mlEmpty('tools')}
  </tbody></table>${_pgNavN('ml_tools',data,typeof renderMlTools==='function'?renderMlTools:null,20)}</div></div>`;
}

// ── VEHICLES ──────────────────────────────────────────────
function renderMlVehicles(){
  let data=mlFilter(AppState.data.vehicles||[]);
  if(mlStatusFilter!=='all')data=data.filter(r=>r.status===mlStatusFilter);
  const now=new Date().toISOString().split('T')[0];
  $('#mlTabContent').innerHTML=`<div class="card">
  <div class="section-header" style="margin-bottom:10px">
  <div class="section-title">Vehicle Register <span style="font-size:12px;font-weight:400;color:var(--text-secondary)">${data.length} records</span></div>
  <div style="display:flex;gap:7px">
    <button class="btn btn-secondary btn-sm" onclick="exportMlCSV('vehicles')"><i class="fas fa-download"></i> Export</button>
    <button class="btn btn-secondary btn-sm" onclick="importExcel('vehicles')"><i class="fas fa-file-excel"></i> Import Excel</button>
    <button class="btn btn-primary btn-sm" onclick="showAddAsset('vehicles')"><i class="fas fa-plus"></i> Add Vehicle</button>
  </div></div>
  <div class="table-wrap"><table>
  <thead><tr><th>ID</th><th>Vehicle Name</th><th>Category</th><th>Make</th><th>Model</th><th>Reg. No.</th><th>Status</th><th>Project</th><th>Location</th><th>Last Maint.</th><th>Next Maint.</th><th>Maint. Interval</th><th>Certification</th><th>Cert Body</th><th>Cert Expiry</th><th>Daily Rate (₱)</th><th>Notes</th><th></th></tr></thead>
  <tbody>${_pgSliceN('ml_vehicles',data,20).length?_pgSliceN('ml_vehicles',data,20).map(r=>{
    const mA=r.nextMaint&&r.nextMaint!=='N/A'&&daysBetween(now,r.nextMaint)<14;
    return`<tr data-rowid="${r.id}">
    <td style="font-size:10px;font-family:var(--font-mono);font-weight:700;white-space:nowrap">${r.id}</td>
    <td style="font-weight:500;font-size:12px;min-width:140px">${esc(r.name)}</td>
    <td><span class="badge badge-gray">${r.category}</span></td>
    <td style="font-size:11px">${r.make}</td>
    <td style="font-size:11px">${r.model}</td>
    <td>${mlInput(r.id,'vehicles','regNo',r.regNo||'','min-width:90px;font-family:var(--font-mono);font-size:10px')}</td>
    <td><select class="form-select" style="height:30px;font-size:11px;min-width:105px" onchange="mlSave('${r.id}','vehicles','status',this.value);renderMlVehicles()">${statOpts(r.status,_getDropdown('vehicle_status'))}</select></td>
    <td><select class="form-select" style="height:30px;font-size:11px;min-width:85px" onchange="mlSave('${r.id}','vehicles','projectId',this.value)">${projOpts(r.projectId)}</select></td>
    <td>${mlInput(r.id,'vehicles','location',r.location,'min-width:100px')}</td>
    <td style="font-size:10px;font-family:var(--font-mono)">${mlNA(r.lastMaint)}</td>
    <td>${mlDateInput(r.id,'vehicles','nextMaint',r.nextMaint,mA?'border-color:var(--accent-red);min-width:110px':'min-width:110px')}</td>
    <td style="font-size:10px;color:var(--text-secondary)">${r.maintInterval||'—'}</td>
    <td>${mlInput(r.id,'vehicles','cert',r.cert,'min-width:120px')}</td>
    <td>${mlInput(r.id,'vehicles','certBody',r.certBody,'min-width:80px')}</td>
    <td><div>${mlCB(r.certExpiry)}</div>${mlDateInput(r.id,'vehicles','certExpiry',r.certExpiry!=='N/A'?r.certExpiry:'','min-width:110px;margin-top:2px')}</td>
    <td>${mlNumInput(r.id,'vehicles','dailyRate',r.dailyRate,'width:90px')}</td>
    <td>${mlInput(r.id,'vehicles','notes',r.notes||'','min-width:120px')}</td>
    <td><div style="display:flex;gap:3px;position:relative">
      <button class="btn btn-secondary btn-sm btn-icon" onclick="showAssetDetail('${r.id}','vehicles')" title="View attachments"><i class="fas fa-paperclip"></i>${(r.attachments&&r.attachments.length)?`<span style="position:absolute;top:-4px;right:-4px;background:var(--accent-amber);color:#fff;font-size:8px;padding:1px 4px;border-radius:6px;font-weight:700">${r.attachments.length}</span>`:''}</button>
      <button class="btn btn-danger btn-sm btn-icon" onclick="deleteMlAsset('${r.id}','vehicles');renderMlVehicles()" title="Delete"><i class="fas fa-trash"></i></button>
    </div></td>
  </tr>`;}).join(''):mlEmpty('vehicles')}
  </tbody></table>${_pgNavN('ml_vehicles',data,typeof renderMlVehicles==='function'?renderMlVehicles:null,20)}</div></div>`;
}

// ── CONSUMABLES ───────────────────────────────────────────

// ── ITEM MASTER (Consumables + Materials + PPE — central catalog) ──────────
function renderMlWarehouse(){
  const d=AppState.data;
  const allCons=d.consumables||[];
  const allMats=d.materials||[];
  let cons=mlFilter(allCons);
  let mats=mlFilter(allMats);
  if(!window._warehouseSubTab)window._warehouseSubTab='all';
  if(window._warehouseSubTab==='consumables')mats=[];
  else if(window._warehouseSubTab==='ppe'){cons=cons.filter(c=>c.category&&c.category.toLowerCase()==='ppe');mats=[];}
  else if(window._warehouseSubTab==='materials')cons=[];
  if(mlStatusFilter!=='all'){
    cons=cons.filter(c=>(c.qtyOnHand<=c.minStock?'low-stock':'in-stock')===mlStatusFilter);
    mats=mats.filter(m=>m.status===mlStatusFilter);
  }
  const totalItems=allCons.length+allMats.length;
  const lowStock=allCons.filter(c=>c.qtyOnHand<=c.minStock).length;
  const ppeItems=allCons.filter(c=>c.category&&c.category.toLowerCase()==='ppe').length;
  const conVal=allCons.reduce((s,c)=>s+c.qtyOnHand*c.unitCost,0);
  const matVal=allMats.reduce((s,m)=>s+m.qty*m.unitCost,0);
  const subTabBtns=[['all','All','fa-th-list'],['consumables','Consumables','fa-boxes'],['ppe','PPE','fa-hard-hat'],['materials','Materials','fa-layer-group']];
  const subTabCounts={all:totalItems,consumables:allCons.filter(c=>c.category&&c.category.toLowerCase()!=='ppe').length,ppe:ppeItems,materials:allMats.length};
  let html='';
  // Stats
  // Item Master banner
  html+=`<div style="background:rgba(56,139,253,.07);border:1px solid rgba(56,139,253,.2);border-radius:8px;padding:10px 14px;margin-bottom:12px;display:flex;align-items:center;gap:10px">
    <i class="fas fa-book-open" style="color:var(--accent-blue);font-size:16px"></i>
    <div style="flex:1"><div style="font-weight:700;font-size:12px">Item Master — Central Catalog</div>
    <div style="font-size:11px;color:var(--text-secondary)">Define items here once. Enroll them into the Warehouse for stock tracking, or reference them in Procurement PRs/POs.</div></div>
    <button class="btn btn-secondary btn-sm" onclick="navigate('warehouse')"><i class="fas fa-warehouse" style="margin-right:4px"></i>Go to Warehouse</button>
  </div>`;
  html+=`<div class="grid grid-4" style="margin-bottom:12px">
    ${sc('fas fa-book-open','Catalog Items',totalItems,'Consumables + Materials','#3fb950','rgba(63,185,80,.15)')}
    ${sc('fas fa-warehouse','In Warehouse',(AppState.data.warehouseItems||[]).filter(w=>!w._deleted).length,'Enrolled & stocked','#388bfd','rgba(56,139,253,.15)')}
    ${sc('fas fa-hard-hat','PPE Items',ppeItems,'Safety equipment','#f0a450','rgba(240,164,80,.15)')}
    ${sc('fas fa-dollar-sign','Catalog Std Value',fmtNum(conVal+matVal),'Std cost reference','#bc8cff','rgba(188,140,255,.15)')}
  </div>`;
  // Sub-tabs
  html+=`<div style="display:flex;gap:8px;margin-bottom:12px;flex-wrap:wrap;align-items:center">
    ${subTabBtns.map(([id,label,ic])=>`<button class="btn btn-sm ${window._warehouseSubTab===id?'btn-primary':'btn-secondary'}" onclick="window._warehouseSubTab='${id}';renderMlWarehouse()"><i class="fas ${ic}" style="margin-right:4px"></i>${label} <span style="margin-left:4px;background:rgba(255,255,255,.15);border-radius:10px;padding:0 6px;font-size:10px">${subTabCounts[id]}</span></button>`).join('')}
    <div style="margin-left:auto;display:flex;gap:6px;flex-wrap:wrap">
      <button class="btn btn-secondary btn-sm" onclick="showMlImport('consumables')"><i class="fas fa-file-import" style="margin-right:4px"></i>Import Consumables</button>
      <button class="btn btn-secondary btn-sm" onclick="showMlImport('materials')"><i class="fas fa-file-import" style="margin-right:4px"></i>Import Materials</button>
      <button class="btn btn-secondary btn-sm" onclick="showAddConsumable()"><i class="fas fa-plus" style="margin-right:4px"></i>Add Consumable/PPE</button>
      <button class="btn btn-primary btn-sm" onclick="showAddMaterial()"><i class="fas fa-plus" style="margin-right:4px"></i>Add Material</button>
    </div>
  </div>`;
  // Consumables / PPE table
  if(window._warehouseSubTab!=='materials'){
    html+=`<div class="card" style="margin-bottom:14px">
    <div class="section-header" style="margin-bottom:10px">
      <div class="section-title"><i class="fas fa-boxes" style="color:#3fb950;margin-right:6px"></i>Consumables &amp; PPE <span class="badge badge-green" style="font-size:10px">${cons.length}</span>${lowStock?` <span class="badge badge-red" style="font-size:9px">${lowStock} low stock</span>`:''}</div>
      <div style="display:flex;gap:6px">
        <button class="btn btn-secondary btn-sm" onclick="showMlImport('consumables')"><i class="fas fa-file-import"></i> Import</button>
        <button class="btn btn-secondary btn-sm" onclick="exportMlCSV('consumables')"><i class="fas fa-download"></i> Export</button>
        <button class="btn btn-primary btn-sm" onclick="showAddConsumable()"><i class="fas fa-plus"></i> Add</button>
      </div>
    </div>
    <div class="table-wrap"><table>
    <thead><tr><th>ID</th><th>Item Name</th><th>Category</th><th>Unit</th><th>Supplier</th><th>Notes</th><th></th></tr></thead>
    <tbody>${_pgSliceN('wh_cons',cons,20).length?_pgSliceN('wh_cons',cons,20).map(c=>{
      const isPPE=c.category&&c.category.toLowerCase()==='ppe';
      return '<tr data-rowid="'+c.id+'">'
      +'<td style="font-size:10px;font-family:var(--font-mono);font-weight:700">'+c.id+'</td>'
      +'<td style="font-weight:500;font-size:12px;min-width:160px">'+c.name+'</td>'
      +'<td>'+(isPPE?'<span class="badge badge-amber" style="font-size:9px">PPE</span>':'<span class="badge badge-gray">'+c.category+'</span>')+'</td>'
      +'<td><span class="badge badge-blue">'+c.unit+'</span></td>'
      +'<td>'+mlInput(c.id,'consumables','supplier',c.supplier||'','min-width:110px')+'</td>'
      +'<td style="font-size:11px;color:var(--text-secondary);max-width:160px">'+(c.notes||'—')+'</td>'
      +'<td><div style="display:flex;gap:3px">'
        +_imEnrollBtn(c.id,'consumables')
        +'<button class="btn btn-secondary btn-sm btn-icon" onclick="showEditConsumable(\''+c.id+'\')" title="Edit"><i class="fas fa-edit"></i></button>'
        +'<button class="btn btn-secondary btn-sm btn-icon" onclick="showAssetDetail(\''+c.id+'\',\'consumables\')" title="View attachments" style="position:relative"><i class="fas fa-paperclip"></i>'+(c.attachments&&c.attachments.length?'<span style="position:absolute;top:-4px;right:-4px;background:var(--accent-amber);color:#fff;font-size:8px;padding:1px 4px;border-radius:6px;font-weight:700">'+c.attachments.length+'</span>':'')+'</button>'
        +'<button class="btn btn-danger btn-sm btn-icon" onclick="deleteMlConsumable(\''+c.id+'\')"><i class="fas fa-trash"></i></button>'
      +'</div></td>'
      +'</tr>';
    }).join(''):mlEmpty('consumables')}
    </tbody></table>${_pgNavN('wh_cons',cons,typeof renderMlWarehouse==='function'?renderMlWarehouse:null,20)}</div></div>`;
  }
  // Materials table
  if(window._warehouseSubTab!=='consumables'&&window._warehouseSubTab!=='ppe'){
    html+=`<div class="card">
    <div class="section-header" style="margin-bottom:10px">
      <div class="section-title"><i class="fas fa-layer-group" style="color:#fb8f44;margin-right:6px"></i>Materials <span class="badge" style="background:rgba(251,143,68,.2);color:#fb8f44;font-size:10px">${mats.length}</span></div>
      <div style="display:flex;gap:6px">
        <button class="btn btn-secondary btn-sm" onclick="showMlImport('materials')"><i class="fas fa-file-import"></i> Import</button>
        <button class="btn btn-secondary btn-sm" onclick="exportMlCSV('materials')"><i class="fas fa-download"></i> Export</button>
        <button class="btn btn-primary btn-sm" onclick="showAddMaterial()"><i class="fas fa-plus"></i> Add</button>
      </div>
    </div>
    <div class="table-wrap"><table>
    <thead><tr><th>ID</th><th>Material Name</th><th>Unit</th><th>Supplier</th><th>Delivery Date</th><th>Critical</th><th></th></tr></thead>
    <tbody>${_pgSliceN('wh_mats',mats,20).length?_pgSliceN('wh_mats',mats,20).map(m=>'<tr data-rowid="'+m.id+'" style="'+(m.critical?'border-left:3px solid var(--accent-amber)':'')+'">'
      +'<td style="font-size:10px;font-family:var(--font-mono);font-weight:700">'+m.id+'</td>'
      +'<td style="font-weight:500;font-size:12px;min-width:180px">'+m.name+'</td>'
      +'<td><span class="badge badge-blue">'+m.unit+'</span></td>'
      +'<td><input class="form-input" value="'+(m.supplier||'')+'" style="min-width:120px;height:26px;font-size:11px" onchange="mlSaveMaterial(\''+m.id+'\',\'supplier\',this.value)"></td>'
      +'<td><input class="form-input" type="date" value="'+(m.deliveryDate||'')+'" style="height:26px;font-size:11px;'+(isOverdue(m.deliveryDate)&&m.status!=='delivered'?'border-color:var(--accent-red);color:var(--accent-red)':'')+'" onchange="mlSaveMaterial(\''+m.id+'\',\'deliveryDate\',this.value)"></td>'
      +'<td><label class="toggle" style="width:36px;height:18px"><input type="checkbox" '+(m.critical?'checked':'')+' onchange="mlSaveMaterial(\''+m.id+'\',\'critical\',this.checked)"><span class="toggle-slider"></span></label>'+(m.critical?' <span class="badge badge-amber" style="font-size:9px">Critical</span>':'')+'</td>'
      +'<td><div style="display:flex;gap:3px">'
      +_imEnrollBtn(m.id,'materials')
      +'<button class="btn btn-secondary btn-sm btn-icon" onclick="showAssetDetail(\''+m.id+'\',\'materials\')" title="View attachments" style="position:relative"><i class="fas fa-paperclip"></i>'+(m.attachments&&m.attachments.length?'<span style="position:absolute;top:-4px;right:-4px;background:var(--accent-amber);color:#fff;font-size:8px;padding:1px 4px;border-radius:6px;font-weight:700">'+m.attachments.length+'</span>':'')+'</button>'
      +'<button class="btn btn-danger btn-sm btn-icon" onclick="deleteMlMaterial(\''+m.id+'\')"><i class="fas fa-trash"></i></button>'
      +'</div></td>'
      +'</tr>').join(''):mlEmpty('materials')}
    </tbody></table>${_pgNavN('wh_mats',mats,typeof renderMlWarehouse==='function'?renderMlWarehouse:null,20)}</div></div>`;
  }
  document.getElementById('mlTabContent').innerHTML=html;
}
function renderMlConsumables(){
  let data=mlFilter(AppState.data.consumables||[]);
  if(mlStatusFilter!=='all')data=data.filter(c=>(c.qtyOnHand<=c.minStock?'low-stock':'in-stock')===mlStatusFilter);
  const totVal=getActive('consumables').reduce((s,c)=>s+c.qtyOnHand*c.unitCost,0);
  $('#mlTabContent').innerHTML=`
  <div class="grid grid-4" style="margin-bottom:12px">
    ${sc('fas fa-boxes','Total Items',getActive('consumables').length,'Consumables','#3fb950','rgba(63,185,80,.15)')}
    ${sc('fas fa-check','In Stock',getActive('consumables').filter(c=>c.qtyOnHand>c.minStock).length,'Adequate','#3fb950','rgba(63,185,80,.15)')}
    ${sc('fas fa-exclamation-triangle','Low / Reorder',getActive('consumables').filter(c=>c.qtyOnHand<=c.minStock).length,'Action needed','#f85149','rgba(248,81,73,.15)')}
    ${sc('fas fa-dollar-sign','Stock Value',fmtNum(totVal),'Total inventory','#f0a450','rgba(240,164,80,.15)')}
  </div>
  <div class="card">
  <div class="section-header" style="margin-bottom:10px">
  <div class="section-title">Consumables Register <span style="font-size:12px;font-weight:400;color:var(--text-secondary)">${data.length} records</span></div>
  <div style="display:flex;gap:7px">
    <button class="btn btn-secondary btn-sm" onclick="exportMlCSV('consumables')"><i class="fas fa-download"></i> Export</button>
    <button class="btn btn-secondary btn-sm" onclick="importExcel('consumables')"><i class="fas fa-file-excel"></i> Import Excel</button>
    <button class="btn btn-primary btn-sm" onclick="showAddConsumable()"><i class="fas fa-plus"></i> Add Item</button>
  </div></div>
  <div class="table-wrap"><table>
  <thead><tr><th>ID</th><th>Item Name</th><th>Category</th><th>Unit</th><th>Qty on Hand</th><th>Min Stock</th><th>Reorder Qty</th><th>Stock Bar</th><th>Unit Cost (₱)</th><th>Total Value (₱)</th><th>Project</th><th>Supplier</th><th>Status</th><th>Notes</th><th></th></tr></thead>
  <tbody>${data.length?data.map(c=>{
    const low=c.qtyOnHand<=c.minStock;
    const pct=Math.min(100,Math.round((c.qtyOnHand/Math.max(c.minStock*2,1))*100));
    return`<tr data-rowid="${c.id}" style="${low?'background:rgba(248,81,73,.04)':''}">
    <td style="font-size:10px;font-family:var(--font-mono);font-weight:700">${c.id}</td>
    <td style="font-weight:500;font-size:12px;min-width:160px">${c.name}</td>
    <td><span class="badge badge-gray">${c.category}</span></td>
    <td><span class="badge badge-blue">${c.unit}</span></td>
    <td><input class="form-input" type="number" value="${c.qtyOnHand}" style="width:80px;height:30px;font-family:var(--font-mono);font-size:11px;${low?'border-color:var(--accent-red);color:var(--accent-red);font-weight:700':''}" oninput="mlSaveConsumable('${c.id}','qtyOnHand',+this.value);setTimeout(renderMlConsumables,700)" onchange="mlSaveConsumable('${c.id}','qtyOnHand',+this.value);setTimeout(renderMlConsumables,700)"></td>
    <td><input class="form-input" type="number" value="${c.minStock}" style="width:75px;height:30px;font-family:var(--font-mono);font-size:11px" oninput="mlSaveConsumable('${c.id}','minStock',+this.value)" onchange="mlSaveConsumable('${c.id}','minStock',+this.value)"></td>
    <td style="font-family:var(--font-mono);font-size:11px;color:var(--text-secondary)">${c.reorderQty||0}</td>
    <td><div style="display:flex;align-items:center;gap:5px;min-width:100px"><div class="progress-bar" style="flex:1;height:6px"><div class="progress-fill" style="width:${pct}%;background:${low?'var(--accent-red)':'var(--accent-green)'}"></div></div><span style="font-size:9px;font-weight:700;color:${low?'var(--accent-red)':'var(--accent-green)'}">${pct}%</span></div>${low?`<div><span class="badge badge-red" style="font-size:9px">Reorder!</span></div>`:''}</td>
    <td><input class="form-input" type="number" value="${c.unitCost}" style="width:85px;height:26px;font-family:var(--font-mono);font-size:11px" oninput="mlSaveConsumable('${c.id}','unitCost',+this.value);setTimeout(renderMlConsumables,700)" onchange="mlSaveConsumable('${c.id}','unitCost',+this.value);setTimeout(renderMlConsumables,700)"></td>
    <td style="font-family:var(--font-mono);font-size:11px;font-weight:600">₱${(c.qtyOnHand*c.unitCost).toLocaleString()}</td>
    <td><select class="form-select" style="height:30px;font-size:11px;min-width:80px" onchange="mlSaveConsumable('${c.id}','projectId',this.value)">${projOpts(c.projectId)}</select></td>
    <td>${mlInput(c.id,'consumables','supplier',c.supplier||'','min-width:110px')}</td>
    <td>${mlSB(low?'low-stock':'in-stock')}</td>
    <td>${mlInput(c.id,'consumables','notes',c.notes||'','min-width:110px')}</td>
    <td><div style="display:flex;flex-direction:column;gap:3px">
      <button class="btn btn-secondary btn-sm btn-icon" onclick="showEditConsumable('${c.id}')" title="Edit all fields"><i class="fas fa-edit"></i></button>
      <button class="btn btn-secondary btn-sm btn-icon" onclick="showAssetDetail('${c.id}','consumables')" title="View attachments"><i class="fas fa-paperclip"></i>${(c.attachments&&c.attachments.length)?`<span style="position:absolute;top:-4px;right:-4px;background:var(--accent-amber);color:#fff;font-size:8px;padding:1px 4px;border-radius:6px;font-weight:700">${c.attachments.length}</span>`:''}</button>
      <button class="btn btn-danger btn-sm btn-icon" onclick="deleteMlConsumable('${c.id}')" title="Delete"><i class="fas fa-trash"></i></button>
    </div></td>
  </tr>`;}).join(''):mlEmpty('consumables')}
  </tbody></table></div></div>`;
}

// ── MATERIALS ─────────────────────────────────────────────
function renderMlMaterials(){
  let data=mlFilter(AppState.data.materials||[]);
  if(mlStatusFilter!=='all')data=data.filter(m=>m.status===mlStatusFilter);
  const totVal=getActive('materials').reduce((s,m)=>s+m.qty*m.unitCost,0);
  $('#mlTabContent').innerHTML=`
  <div class="grid grid-4" style="margin-bottom:12px">
    ${sc('fas fa-layer-group','Total Materials',getActive('materials').length,'All materials','#fb8f44','rgba(251,143,68,.15)')}
    ${sc('fas fa-check','Delivered',getActive('materials').filter(m=>m.status==='delivered').length,'On site','#3fb950','rgba(63,185,80,.15)')}
    ${sc('fas fa-shipping-fast','In Transit',getActive('materials').filter(m=>m.status==='ordered'||m.status==='partial').length,'En route','#388bfd','rgba(56,139,253,.15)')}
    ${sc('fas fa-dollar-sign','Total Value',fmtNum(totVal),'Material stock','#f0a450','rgba(240,164,80,.15)')}
  </div>
  <div class="card">
  <div class="section-header" style="margin-bottom:10px">
  <div class="section-title">Materials Register <span style="font-size:12px;font-weight:400;color:var(--text-secondary)">${data.length} records</span></div>
  <div style="display:flex;gap:7px">
    <button class="btn btn-secondary btn-sm" onclick="exportMlCSV('materials')"><i class="fas fa-download"></i> Export</button>
    <button class="btn btn-secondary btn-sm" onclick="importExcel('materials')"><i class="fas fa-file-excel"></i> Import Excel</button>
    <button class="btn btn-primary btn-sm" onclick="showAddMaterial()"><i class="fas fa-plus"></i> Add Material</button>
  </div></div>
  <div class="table-wrap"><table>
  <thead><tr><th>ID</th><th>Material Name</th><th>Project</th><th>Quantity</th><th>Unit</th><th>Unit Cost (₱)</th><th>Total Value (₱)</th><th>Supplier</th><th>Delivery Date</th><th>Status</th><th>Critical</th><th></th></tr></thead>
  <tbody>${data.length?data.map(m=>`<tr data-rowid="${m.id}" style="${m.critical?'border-left:3px solid var(--accent-amber)':''}">
    <td style="font-size:10px;font-family:var(--font-mono);font-weight:700">${m.id}</td>
    <td style="font-weight:500;font-size:12px;min-width:180px">${esc(m.name)}</td>
    <td><select class="form-select" style="height:30px;font-size:11px;min-width:80px" onchange="mlSaveMaterial('${m.id}','projectId',this.value)">${projOpts(m.projectId)}</select></td>
    <td><input class="form-input" type="number" value="${m.qty}" style="width:80px;height:26px;font-family:var(--font-mono);font-size:11px" oninput="mlSaveMaterial('${m.id}','qty',+this.value);setTimeout(renderMlMaterials,700)" onchange="mlSaveMaterial('${m.id}','qty',+this.value);setTimeout(renderMlMaterials,700)"></td>
    <td><span class="badge badge-blue">${m.unit}</span></td>
    <td><input class="form-input" type="number" value="${m.unitCost}" style="width:90px;height:26px;font-family:var(--font-mono);font-size:11px" oninput="mlSaveMaterial('${m.id}','unitCost',+this.value);setTimeout(renderMlMaterials,700)" onchange="mlSaveMaterial('${m.id}','unitCost',+this.value);setTimeout(renderMlMaterials,700)"></td>
    <td style="font-family:var(--font-mono);font-size:11px;font-weight:600">₱${(m.qty*m.unitCost).toLocaleString()}</td>
    <td><input class="form-input" value="${m.supplier||''}" style="min-width:120px;height:26px;font-size:11px" oninput="mlSaveMaterial('${m.id}','supplier',this.value)" onchange="mlSaveMaterial('${m.id}','supplier',this.value)"></td>
    <td><input class="form-input" type="date" value="${m.deliveryDate||''}" style="height:26px;font-size:11px;${isOverdue(m.deliveryDate)&&m.status!=='delivered'?'border-color:var(--accent-red);color:var(--accent-red)':''}" onchange="mlSaveMaterial('${m.id}','deliveryDate',this.value)"></td>
    <td><select class="form-select" style="height:30px;font-size:11px;min-width:90px" onchange="mlSaveMaterial('${m.id}','status',this.value);setTimeout(renderMlMaterials,700)">${statOpts(m.status,_getDropdown('material_status'))}</select></td>
    <td><label class="toggle" style="width:36px;height:18px"><input type="checkbox" ${m.critical?'checked':''} onchange="mlSaveMaterial('${m.id}','critical',this.checked)"><span class="toggle-slider"></span></label> ${m.critical?'<span class="badge badge-amber" style="font-size:9px">Critical</span>':''}</td>
    <td><div style="display:flex;gap:3px;position:relative">
      <button class="btn btn-secondary btn-sm btn-icon" onclick="showAssetDetail('${m.id}','materials')" title="View attachments"><i class="fas fa-paperclip"></i>${(m.attachments&&m.attachments.length)?`<span style="position:absolute;top:-4px;right:-4px;background:var(--accent-amber);color:#fff;font-size:8px;padding:1px 4px;border-radius:6px;font-weight:700">${m.attachments.length}</span>`:''}</button>
      <button class="btn btn-danger btn-sm btn-icon" onclick="deleteMlMaterial('${m.id}')" title="Delete"><i class="fas fa-trash"></i></button>
    </div></td>
  </tr>`).join(''):mlEmpty('materials')}
  </tbody></table></div></div>`;
}

// ── THIRD PARTY ───────────────────────────────────────────
function renderMlThirdParty(){
  let data=mlFilter(AppState.data.thirdParty||[]);
  if(mlStatusFilter!=='all')data=data.filter(t=>t.status===mlStatusFilter);
  const totMonthly=getActive('thirdParty').filter(t=>t.status==='active').reduce((s,t)=>s+t.monthlyRate,0);
  const now=new Date().toISOString().split('T')[0];
  $('#mlTabContent').innerHTML=`
  <div class="grid grid-4" style="margin-bottom:12px">
    ${sc('fas fa-handshake','Total Vendors',getActive('thirdParty').length,'All vendors','#f85149','rgba(248,81,73,.15)')}
    ${sc('fas fa-check-circle','Active',getActive('thirdParty').filter(t=>t.status==='active').length,'Active contracts','#3fb950','rgba(63,185,80,.15)')}
    ${sc('fas fa-dollar-sign','Monthly Commitment',fmtNum(totMonthly),'Active only','#f0a450','rgba(240,164,80,.15)')}
    ${sc('fas fa-calendar-times','Expiring <60d',getActive('thirdParty').filter(t=>t.contractEnd&&daysBetween(now,t.contractEnd)<60&&daysBetween(now,t.contractEnd)>0).length,'Review needed','#f85149','rgba(248,81,73,.15)')}
  </div>
  <div class="card">
  <div class="section-header" style="margin-bottom:10px">
  <div class="section-title">Third Party Services Register <span style="font-size:12px;font-weight:400;color:var(--text-secondary)">${data.length} records</span></div>
  <div style="display:flex;gap:7px">
    <button class="btn btn-secondary btn-sm" onclick="exportMlCSV('thirdparty')"><i class="fas fa-download"></i> Export</button>
    <button class="btn btn-secondary btn-sm" onclick="importExcel('thirdparty')"><i class="fas fa-file-excel"></i> Import Excel</button>
    <button class="btn btn-primary btn-sm" onclick="showAddThirdParty()"><i class="fas fa-plus"></i> Add Vendor</button>
  </div></div>
  <div class="table-wrap"><table>
  <thead><tr><th>ID</th><th>Company</th><th>Category</th><th>Services</th><th>Contact Person</th><th>Contact No.</th><th>Project</th><th>Contract Start</th><th>Contract End</th><th>Monthly Rate (₱)</th><th>Accreditation</th><th>Accred. Expiry</th><th>Status</th><th>Notes</th><th></th></tr></thead>
  <tbody>${data.length?data.map(t=>{
    const expSoon=t.contractEnd&&daysBetween(now,t.contractEnd)<60&&daysBetween(now,t.contractEnd)>0;
    return`<tr data-rowid="${t.id}" style="${expSoon?'background:rgba(248,81,73,.04)':''}">
    <td style="font-size:10px;font-family:var(--font-mono);font-weight:700">${t.id}</td>
    <td style="font-weight:600;font-size:12px;min-width:150px">${esc(t.name)}</td>
    <td><span class="badge badge-purple">${t.category}</span></td>
    <td style="font-size:10px;color:var(--text-secondary);max-width:140px">${t.service}</td>
    <td><div style="display:flex;align-items:center;gap:5px">${avatarH(t.contactPerson,22)}<span style="font-size:11px">${t.contactPerson}</span></div></td>
    <td style="font-size:10px;font-family:var(--font-mono)">${t.contactNo}</td>
    <td><select class="form-select" style="height:30px;font-size:11px;min-width:80px" onchange="mlSaveTp('${t.id}','projectId',this.value)">${projOpts(t.projectId)}</select></td>
    <td style="font-size:10px;font-family:var(--font-mono)">${t.contractStart}</td>
    <td><input class="form-input" type="date" value="${t.contractEnd||''}" style="height:26px;font-size:11px;${expSoon?'border-color:var(--accent-amber);color:var(--accent-amber)':''}" onchange="mlSaveTp('${t.id}','contractEnd',this.value)"></td>
    <td><input class="form-input" type="number" value="${t.monthlyRate}" style="width:110px;height:26px;font-family:var(--font-mono);font-size:11px" oninput="mlSaveTp('${t.id}','monthlyRate',+this.value)" onchange="mlSaveTp('${t.id}','monthlyRate',+this.value)"></td>
    <td style="font-size:10px">${t.accreditation}</td>
    <td><div>${mlCB(t.accreditationExpiry)}</div><input class="form-input" type="date" value="${safeDate(t.accreditationExpiry)}" style="height:26px;font-size:11px;min-width:110px;margin-top:2px" onchange="mlSaveTp('${t.id}','accreditationExpiry',this.value)"></td>
    <td><select class="form-select" style="height:30px;font-size:11px;min-width:90px" onchange="mlSaveTp('${t.id}','status',this.value);setTimeout(renderMlThirdParty,700)">${statOpts(t.status,_getDropdown('tp_status'))}</select></td>
    <td><input class="form-input" value="${t.notes||''}" style="min-width:120px;height:26px;font-size:10px" oninput="mlSaveTp('${t.id}','notes',this.value)" onchange="mlSaveTp('${t.id}','notes',this.value)"></td>
    <td><button class="btn btn-danger btn-sm btn-icon" onclick="deleteMlTp('${t.id}')"><i class="fas fa-trash"></i></button></td>
  </tr>`;}).join(''):mlEmpty('vendors')}
  </tbody></table></div></div>`;
}

// ── CRUD HELPERS ──────────────────────────────────────────
function _mlSoftDelete(arrayKey,id){
  const arr=AppState.data[arrayKey]||[];
  const rec=arr.find(r=>r.id===id);
  if(!rec)return false;
  rec._deleted=true;
  rec._deletedAt=new Date().toISOString();
  rec._deletedBy=(typeof _currentUserProfile!=='undefined')?(_currentUserProfile?.name||_currentUserProfile?.email||'unknown'):'unknown';
  AppState.save();
  return true;
}
function deleteMlAsset(id,typeKey){if(!confirm('Delete this asset? It will be moved to Trash.'))return;if(!AppState.data[typeKey])return;_mlSoftDelete(typeKey,id);showToast('Asset moved to Trash','warning');}
function deleteMlConsumable(id){if(!confirm('Delete? It will be moved to Trash.'))return;_mlSoftDelete('consumables',id);renderMlConsumables();showToast('Moved to Trash','warning');}
function deleteMlMaterial(id){if(!confirm('Delete? It will be moved to Trash.'))return;_mlSoftDelete('materials',id);renderMlMaterials();showToast('Moved to Trash','warning');}
function deleteMlTp(id){if(!confirm('Delete? It will be moved to Trash.'))return;_mlSoftDelete('thirdParty',id);renderMlThirdParty();showToast('Moved to Trash','warning');}
// Also keep old aliases that other code may call
function updateConsumableField(id,field,val){mlSaveConsumable(id,field,val);}
function updateMaterialField(id,field,val){mlSaveMaterial(id,field,val);}
function updateTpField(id,field,val){mlSaveTp(id,field,val);}

function showAddMaterial(){
  $('#genericModalTitle').textContent='Add Material';
  $('#genericModalBody').innerHTML=`<div class="form-grid">
    <div class="form-group" style="grid-column:1/-1"><label class="form-label">Material Name *</label><input class="form-input" id="mlMN" placeholder="Full material description"></div>
    <div class="form-group"><label class="form-label">Project <span style="font-weight:400;color:var(--text-muted)">(optional)</span></label><select class="form-select" id="mlMP"><option value="N/A" selected>— Not Assigned (Warehouse) —</option>${(AppState.data.projects||[]).map(p=>`<option value="${p.id}">${p.id}${p.name?' — '+p.name.substring(0,30):''}</option>`).join('')}</select></div>
    <div class="form-group"><label class="form-label">Supplier</label><input class="form-input" id="mlMS" placeholder="Supplier name"></div>
    <div class="form-group"><label class="form-label">Quantity</label><input class="form-input" type="number" id="mlMQ" value="0"></div>
    <div class="form-group"><label class="form-label">Unit</label><input class="form-input" id="mlMU" placeholder="MT, M, PCS, L, M2..."></div>
    <div class="form-group"><label class="form-label">Unit Cost (₱)</label><input class="form-input" type="number" id="mlMC" value="0"></div>
    <div class="form-group"><label class="form-label">Status</label><select class="form-select" id="mlMSt">${_getDropdown('material_status').map(s=>`<option>${s}</option>`).join('')}</select></div>
    <div class="form-group"><label class="form-label">Delivery Date</label><input class="form-input" type="date" id="mlMD"></div>
    <div class="form-group"><label class="form-label">Critical Path?</label><select class="form-select" id="mlMCr"><option value="false">No</option><option value="true">Yes — Critical</option></select></div>
  </div>`;
  $('#genericModalFooter').innerHTML=`<button class="btn btn-secondary" onclick="closeModal('genericModal')">Cancel</button><button class="btn btn-primary" onclick="saveMlMaterial()">Add Material</button>`;
  openModal('genericModal');
}
function saveMlMaterial(){
  const m={id:'MAT-'+((AppState.data.materials||[]).length+1).toString().padStart(3,'0'),projectId:$('#mlMP').value,name:$('#mlMN').value,qty:parseFloat($('#mlMQ').value)||0,unit:$('#mlMU').value,unitCost:parseFloat($('#mlMC').value)||0,status:$('#mlMSt').value,deliveryDate:$('#mlMD').value,supplier:$('#mlMS').value,critical:$('#mlMCr').value==='true'};
  if(!m.name){showToast('Name required','error');return;}
  if(!AppState.data.materials)AppState.data.materials=[];
  AppState.data.materials.push(m);AppState.save();closeModal('genericModal');renderMlMaterials();showToast('Material added','success');
}


// ── ITEM MASTER → WAREHOUSE ENROLLMENT ────────────────────────
function _imEnrollBtn(itemId, itemType){
  const already=(AppState.data.warehouseItems||[]).some(w=>!w._deleted&&w.itemMasterId===itemId);
  if(already)return`<button class="btn btn-secondary btn-sm btn-icon" title="Already in Warehouse" style="color:var(--accent-green)" onclick="navigate('warehouse')"><i class="fas fa-warehouse"></i></button>`;
  return`<button class="btn btn-secondary btn-sm btn-icon" title="Enroll in Warehouse" style="color:var(--accent-blue)" onclick="_imEnrollInWarehouse('${itemId}','${itemType}')"><i class="fas fa-plus-circle"></i></button>`;
}

function _imEnrollInWarehouse(itemId, itemType){
  const arr=itemType==='consumables'?AppState.data.consumables:AppState.data.materials;
  const item=(arr||[]).find(i=>i.id===itemId);
  if(!item){showToast('Item not found','error');return;}
  if(!AppState.data.warehouseItems)AppState.data.warehouseItems=[];
  if(AppState.data.warehouseItems.some(w=>!w._deleted&&w.itemMasterId===itemId)){showToast('Already enrolled in Warehouse','warning');return;}
  const wh={
    id:'WH-'+String((AppState.data.warehouseItems.length+1)).padStart(4,'0'),
    itemMasterId:itemId,
    itemMasterType:itemType,
    name:item.name,
    code:item.id,
    category:item.category||'General',
    unit:item.unit||'',
    unitCost:item.unitCost||0,
    minStock:item.minStock||0,
    reorderPoint:item.reorderQty||item.minStock||0,
    location:'',
    description:item.notes||'',
    qtyOnHand:0,qtyReserved:0,qtyAvailable:0,netIssued:0,
    createdAt:new Date().toISOString(),
  };
  AppState.data.warehouseItems.push(wh);
  AppState.save();
  showToast(`"${item.name}" enrolled in Warehouse — add stock via Receive tab`,'success',4000);
  renderMlWarehouse();
}

// ── EXCEL IMPORT ────────────────────────────────────────────
// Alias used by Item Master tab buttons
function showMlImport(typeKey){ importExcel(typeKey); }

function importExcel(typeKey){
  const labels={
    personnel:'Personnel',equipment:'Equipment',tools:'Tools',vehicles:'Vehicles',
    consumables:'Consumables',materials:'Materials',thirdparty:'Third Party'};
  const templates={
    personnel:'ID,Name,Role,Department,HourlyRate,Utilization,Availability,Skills,Certifications,Notes',
    equipment:'ID,Name,Category,Make,Model,SerialNo,Status,ProjectID,Location,LastMaint,NextMaint,MainInterval,LastCal,NextCal,CalBody,Certification,CertBody,CertExpiry,DailyRate,Notes',
    tools:'ID,Name,Category,Make,Model,SerialNo,Status,ProjectID,Location,LastCal,NextCal,CalBody,Certification,CertExpiry,DailyRate,Notes',
    vehicles:'ID,Name,Category,Make,Model,RegNo,Status,ProjectID,Location,LastMaint,NextMaint,MaintInterval,Certification,CertBody,CertExpiry,DailyRate,Notes',
    consumables:'ID,Name,Category,Unit,QtyOnHand,MinStock,ReorderQty,UnitCost,ProjectID,Supplier,Notes',
    materials:'ID,Name,ProjectID,Qty,Unit,UnitCost,Supplier,DeliveryDate,Status,Critical',
    thirdparty:'ID,Name,Category,Service,ContactPerson,ContactNo,ProjectID,ContractStart,ContractEnd,MonthlyRate,Accreditation,AccreditationExpiry,Status,Notes'
  };
  const label=labels[typeKey]||typeKey;
  $('#genericModalTitle').textContent='Import '+label+' from Excel / CSV';
  $('#genericModalBody').innerHTML=`
  <div style="padding:12px;background:rgba(56,139,253,.08);border-radius:8px;margin-bottom:14px;border-left:3px solid var(--accent-blue)">
    <div style="font-size:13px;font-weight:600;margin-bottom:6px"><i class="fas fa-info-circle" style="margin-right:6px;color:var(--accent-blue)"></i>Import Instructions</div>
    <ol style="font-size:11px;color:var(--text-secondary);padding-left:18px;line-height:1.8">
      <li>Download the template below and open it in Excel</li>
      <li>Fill in your data — keep the column headers exactly as they are</li>
      <li>Save as <strong>.xlsx</strong> or <strong>.csv</strong></li>
      <li>Click "Choose File" and select your filled file</li>
      <li>Preview your data, then click Import</li>
    </ol>
  </div>
  <div style="display:flex;gap:8px;margin-bottom:14px">
    <button class="btn btn-secondary btn-sm" onclick="downloadImportTemplate('${typeKey}','${templates[typeKey]||''}')"><i class="fas fa-file-excel" style="color:#217346"></i> Download Template</button>
    <span style="font-size:11px;color:var(--text-muted);align-self:center">Template columns: <code style="font-size:9px;background:var(--bg-hover);padding:1px 4px;border-radius:3px">${(templates[typeKey]||'').substring(0,60)}${(templates[typeKey]||'').length>60?'...':''}</code></span>
  </div>
  <div class="form-group">
    <label class="form-label">Select File (.xlsx or .csv) *</label>
    <input type="file" id="importFile" accept=".xlsx,.xls,.csv" class="form-input" style="padding:4px" onchange="previewImport(this,'${typeKey}')">
  </div>
  <div id="importPreview" style="margin-top:10px"></div>`;
  window._importTypeKey=typeKey;
  window._importRows=null;
  $('#genericModalFooter').innerHTML=`<button class="btn btn-secondary" onclick="closeModal('genericModal')">Cancel</button><button class="btn btn-primary" id="importBtn" onclick="executeImport()" disabled><i class="fas fa-file-import"></i> Import Records</button>`;
  openModal('genericModal');
}

function downloadImportTemplate(typeKey,headers){
  const sampleData={
    personnel:'RES-001,Juan dela Cruz,Engineer,Engineering,625,80,available,AutoCAD;AVEVA,PMP;API-580,',
    equipment:'EQP-001,Crawler Crane 150T,Lifting,Liebherr,LTM1150,LBH-2019-001,available,N/A,Main Yard,2025-01-01,2025-04-01,3 months,N/A,N/A,N/A,Lifting Certificate,SGS,2025-12-31,45000,',
    tools:'TOL-001,Ultrasonic Gauge,NDT,Olympus,38DL,OLY-2021-14,available,N/A,QA Lab,N/A,2025-07-15,Bureau Veritas,N/A,N/A,500,',
    vehicles:'VEH-001,Service Pickup Toyota Hilux,Light Vehicle,Toyota,Hilux 4x4,ABC-1234,available,N/A,Main Base,2025-03-01,2025-06-01,3 months,Vehicle Registration,LTO,2025-12-31,2500,',
    consumables:'CON-001,Welding Electrodes E7018,Welding,KG,850,200,500,180,N/A,ESAB Philippines,Store in dry cabinet',
    materials:'MAT-001,A36 Steel Plates,PRJ-001,850,MT,920,ArcelorMittal,2025-02-15,delivered,Yes',
    thirdparty:'TP-001,SGS Philippines,Testing,NDT & Inspection,Maria Santos,+63-2-5555-0001,PRJ-001,2025-01-01,2025-12-31,150000,ISO 17025,2026-06-30,active,'
  };
  const sample=sampleData[typeKey]||'';
  const csv='# SHIC Import Template for '+typeKey+' — fill in data rows below. Delete this # comment before importing.\n'+headers+(sample?'\n'+sample:'')+'\n';
  const a=document.createElement('a');
  a.href=URL.createObjectURL(new Blob([csv],{type:'text/csv'}));
  a.download=typeKey+'_import_template.csv';a.click();
  showToast('Template downloaded — fill in Excel, delete the # comment row, save as CSV','success',4000);
}

function previewImport(input,typeKey){
  const file=input.files[0];if(!file)return;
  const preview=$('#importPreview');
  preview.innerHTML=`<div style="padding:10px;text-align:center;color:var(--text-secondary)"><i class="fas fa-spinner fa-spin"></i> Reading file...</div>`;

  const ext=file.name.split('.').pop().toLowerCase();

  if(ext==='csv'){
    const reader=new FileReader();
    reader.onload=ev=>{
      try{
        const rows=parseCSVToRows(ev.target.result);
        showImportPreview(rows,typeKey);
      }catch(e){preview.innerHTML=`<div style="color:var(--accent-red);padding:10px">Error reading CSV: ${e.message}</div>`;}
    };
    reader.readAsText(file);
  }else if(ext==='xlsx'||ext==='xls'){
    const reader=new FileReader();
    reader.onload=ev=>{
      try{
        const data=new Uint8Array(ev.target.result);
        const wb=XLSX.read(data,{type:'array'});
        const ws=wb.Sheets[wb.SheetNames[0]];
        const json=XLSX.utils.sheet_to_json(ws,{defval:''});
        showImportPreview(json,typeKey,true);
      }catch(e){
        // XLSX not loaded, try CSV fallback message
        preview.innerHTML=`<div style="color:var(--accent-amber);padding:10px;background:rgba(240,164,80,.1);border-radius:6px"><i class="fas fa-exclamation-triangle" style="margin-right:6px"></i><strong>Excel (.xlsx) requires the SheetJS library.</strong> Please save your file as <strong>.csv</strong> from Excel (File → Save As → CSV) and try again.</div>`;
      }
    };
    reader.readAsArrayBuffer(file);
  }
}

function parseCSVToRows(text){
  // Strip BOM, normalize line endings, skip comment lines
  const clean=text.replace(/^\uFEFF/,'').replace(/\r\n/g,'\n').replace(/\r/g,'\n');
  const allLines=clean.split('\n').filter(l=>l.trim()&&!l.trim().startsWith('#'));
  if(allLines.length<2)throw new Error('File must have a header row and at least one data row (lines starting with # are skipped)');

  // RFC 4180-compliant CSV parser
  // Handles: quoted fields, embedded commas, escaped quotes (""), 
  //          AND bare/unescaped " characters (e.g. 4" pipe, CUTTING DISC (4"))
  function parseCSVLine(line){
    const vals=[];
    let i=0;
    while(i<=line.length){
      if(i===line.length){vals.push('');break;}
      if(line[i]==='"'){
        // Properly quoted field — read until closing quote
        let val='';i++; // skip opening quote
        while(i<line.length){
          if(line[i]==='"'&&line[i+1]==='"'){val+='"';i+=2;} // escaped ""
          else if(line[i]==='"'){i++;break;} // closing quote
          else{val+=line[i];i++;}
        }
        vals.push(val);
        if(line[i]===',')i++; // skip comma after quoted field
      }else{
        // Unquoted field — read until next comma, but tolerate bare " characters
        // A bare " mid-field (e.g. 4") is treated as a literal character, NOT a quote opener
        // Detection: if we're not at field start and hit ", it's literal
        let val='';
        while(i<line.length&&line[i]!==','){
          val+=line[i];i++;
        }
        vals.push(val.trim());
        if(line[i]===',')i++; // skip comma
      }
    }
    return vals;
  }

  const headers=parseCSVLine(allLines[0]).map(h=>h.trim().replace(/^"|"$/g,''));
  return allLines.slice(1).filter(l=>l.trim()).map(line=>{
    const vals=parseCSVLine(line);
    const obj={};
    headers.forEach((h,i)=>obj[h]=(vals[i]!==undefined?String(vals[i]):''));
    return obj;
  });
}

function showImportPreview(rows,typeKey,fromExcel=false){
  const preview=$('#importPreview');
  const importBtn=$('#importBtn');
  if(!rows||!rows.length){preview.innerHTML=`<div style="color:var(--accent-red);padding:10px">No data rows found in file.</div>`;return;}
  window._importRows=rows;window._importTypeKey=typeKey;

  // ── Validate against expected columns ──────────────────────
  const expectedCols={
    personnel:['ID','Name','Role'],
    equipment:['ID','Name','Category'],
    tools:['ID','Name','Category'],
    vehicles:['ID','Name','Category'],
    consumables:['ID','Name','Unit'],
    materials:['ID','Name','Qty'],
    thirdparty:['ID','Name','Category']
  }[typeKey]||['ID','Name'];

  const headers=Object.keys(rows[0]);
  const _norm=s=>(s||'').replace(/\s+/g,'').toLowerCase();
  const headerNorms=headers.map(_norm);
  const missing=[];
  const found={};
  expectedCols.forEach(c=>{
    const ix=headerNorms.indexOf(_norm(c));
    if(ix===-1) missing.push(c);
    else found[c]=headers[ix];
  });

  // Check how many rows have a Name (required field)
  const nameKey=found['Name']||headers.find(h=>_norm(h)==='name');
  const idKey=found['ID']||headers.find(h=>_norm(h)==='id');
  let rowsWithName=0, rowsWithId=0, rowsEmpty=0;
  rows.forEach(r=>{
    const hasName=nameKey && String(r[nameKey]||'').trim();
    const hasId=idKey && String(r[idKey]||'').trim();
    if(hasName) rowsWithName++;
    if(hasId) rowsWithId++;
    if(!hasName && !hasId) rowsEmpty++;
  });

  // Warning banner if there are issues
  let warningHTML='';
  if(missing.length>0||rowsWithName<rows.length||rowsWithId===0){
    warningHTML=`<div style="margin-bottom:8px;padding:10px 12px;background:rgba(240,164,80,.1);border:1px solid rgba(240,164,80,.3);border-radius:7px;font-size:11px">
      <div style="font-weight:700;color:var(--accent-amber);margin-bottom:4px"><i class="fas fa-exclamation-triangle" style="margin-right:5px"></i>Heads up — possible issues</div>
      ${missing.length>0?`<div style="color:var(--text-secondary)">• Missing column(s): <strong>${missing.join(', ')}</strong></div>`:''}
      ${rowsWithName<rows.length?`<div style="color:var(--text-secondary)">• <strong>${rows.length-rowsWithName}</strong> row(s) have empty Name — these will be skipped</div>`:''}
      ${rowsWithId===0?`<div style="color:var(--text-secondary)">• All ID cells appear empty — IDs will be auto-generated (e.g., TOL-0001, TOL-0002, ...)</div>`:rowsWithId<rows.length?`<div style="color:var(--text-secondary)">• <strong>${rows.length-rowsWithId}</strong> row(s) have empty ID — IDs will be auto-generated for them</div>`:''}
      <div style="margin-top:6px;color:var(--text-muted);font-size:10px">Headers found: ${headers.map(h=>'<code>'+h+'</code>').join(', ')}</div>
    </div>`;
  }

  if(importBtn) importBtn.removeAttribute('disabled');
  const showRows=rows.slice(0,5);
  preview.innerHTML=`
  ${warningHTML}
  <div style="margin-bottom:8px;display:flex;align-items:center;justify-content:space-between">
    <span style="font-size:12px;font-weight:600"><i class="fas fa-table" style="color:var(--accent-green);margin-right:6px"></i>Preview — ${rows.length} rows ready to import</span>
    <span class="badge badge-green">${rowsWithName} valid · ${rows.length-rowsWithName} skipped</span>
  </div>
  <div style="overflow-x:auto;max-height:200px;border:1px solid var(--border);border-radius:6px">
    <table style="width:100%;font-size:10px;border-collapse:collapse">
      <thead style="background:var(--bg-hover);position:sticky;top:0"><tr>${headers.map(h=>`<th style="padding:5px 8px;text-align:left;font-weight:600;white-space:nowrap;border-bottom:1px solid var(--border)">${h}</th>`).join('')}</tr></thead>
      <tbody>${showRows.map((r,i)=>`<tr style="${i%2===0?'':'background:var(--bg-hover)'}">${headers.map(h=>`<td style="padding:4px 8px;border-bottom:1px solid var(--border);max-width:120px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${r[h]||''}</td>`).join('')}</tr>`).join('')}
      ${rows.length>5?`<tr><td colspan="${headers.length}" style="padding:6px 8px;text-align:center;color:var(--text-muted)">... and ${rows.length-5} more rows</td></tr>`:''}
      </tbody>
    </table>
  </div>
  <div style="margin-top:8px;font-size:11px;color:var(--text-secondary)"><i class="fas fa-info-circle" style="margin-right:4px"></i>Existing records with the same ID will be <strong>updated</strong>. New IDs will be <strong>added</strong>.</div>`;
}

function executeImport(){
  const rows=window._importRows;
  const typeKey=window._importTypeKey;
  if(!rows||!rows.length){showToast('No data to import','error');return;}
  let added=0,updated=0,skipped=0;
  const skipReasons=[];
  const fieldMap={
    personnel:{id:'ID',name:'Name',role:'Role',dept:'Department',hourlyRate:'HourlyRate',utilization:'Utilization',availability:'Availability',skills:'Skills',certifications:'Certifications',notes:'Notes'},
    equipment:{id:'ID',name:'Name',category:'Category',make:'Make',model:'Model',serialNo:'SerialNo',status:'Status',projectId:'ProjectID',location:'Location',lastMaint:'LastMaint',nextMaint:'NextMaint',maintInterval:'MainInterval',lastCal:'LastCal',nextCal:'NextCal',calBody:'CalBody',cert:'Certification',certBody:'CertBody',certExpiry:'CertExpiry',dailyRate:'DailyRate',notes:'Notes'},
    tools:{id:'ID',name:'Name',category:'Category',make:'Make',model:'Model',serialNo:'SerialNo',status:'Status',projectId:'ProjectID',location:'Location',lastCal:'LastCal',nextCal:'NextCal',calBody:'CalBody',cert:'Certification',certExpiry:'CertExpiry',dailyRate:'DailyRate',notes:'Notes'},
    vehicles:{id:'ID',name:'Name',category:'Category',make:'Make',model:'Model',regNo:'RegNo',status:'Status',projectId:'ProjectID',location:'Location',lastMaint:'LastMaint',nextMaint:'NextMaint',maintInterval:'MaintInterval',cert:'Certification',certBody:'CertBody',certExpiry:'CertExpiry',dailyRate:'DailyRate',notes:'Notes'},
    consumables:{id:'ID',name:'Name',category:'Category',unit:'Unit',qtyOnHand:'QtyOnHand',minStock:'MinStock',reorderQty:'ReorderQty',unitCost:'UnitCost',projectId:'ProjectID',supplier:'Supplier',notes:'Notes'},
    materials:{id:'ID',name:'Name',projectId:'ProjectID',qty:'Qty',unit:'Unit',unitCost:'UnitCost',supplier:'Supplier',deliveryDate:'DeliveryDate',status:'Status',critical:'Critical'},
    thirdparty:{id:'ID',name:'Name',category:'Category',service:'Service',contactPerson:'ContactPerson',contactNo:'ContactNo',projectId:'ProjectID',contractStart:'ContractStart',contractEnd:'ContractEnd',monthlyRate:'MonthlyRate',accreditation:'Accreditation',accreditationExpiry:'AccreditationExpiry',status:'Status',notes:'Notes'},
  };
  const map=fieldMap[typeKey]||{};
  const listKey={thirdparty:'thirdParty'}[typeKey]||typeKey;
  if(!AppState.data[listKey])AppState.data[listKey]=[];
  const list=AppState.data[listKey];

  rows.forEach(row=>{
    const rec={};
    Object.entries(map).forEach(([jsKey,csvKey])=>{
      // Case+space insensitive lookup: 'Qty On Hand' finds 'QtyOnHand', 'Project' finds 'ProjectID'
      const _normalize=s=>s.replace(/\s+/g,'').toLowerCase();
      let val=row[csvKey];
      if(val===undefined||val===''){
        // Try case-insensitive and space-stripped match
        const normKey=_normalize(csvKey);
        const matchKey=Object.keys(row).find(k=>_normalize(k)===normKey||_normalize(k)===_normalize(jsKey));
        if(matchKey!==undefined)val=row[matchKey];
      }
      val=val!==undefined?String(val):'';
      if(jsKey==='qtyOnHand'||jsKey==='minStock'||jsKey==='reorderQty'||jsKey==='unitCost'||jsKey==='hourlyRate'||jsKey==='dailyRate'||jsKey==='monthlyRate'||jsKey==='qty'||jsKey==='utilization')val=parseFloat(val)||0;
      if(jsKey==='critical')val=String(val).toLowerCase()==='true'||val==='1'||val==='yes';
      if(jsKey==='skills'||jsKey==='certifications')val=val?String(val).split(',').map(s=>s.trim()).filter(Boolean):[];
      rec[jsKey]=val;
    });
    // Skip only if no name (which is the essential field)
    if(!rec.name){ skipReasons.push(`Row ${skipped+added+updated+1}: missing Name`); skipped++; return; }
    // Auto-generate ID if missing — keeps the row instead of skipping
    if(!rec.id){
      const prefix={personnel:'RES',equipment:'EQP',tools:'TOL',vehicles:'VEH',consumables:'CON',materials:'MAT',thirdparty:'TP'}[typeKey]||'ITM';
      const existing=list.length;
      let n=existing+1;
      let newId=prefix+'-'+String(n).padStart(4,'0');
      while(list.some(x=>x.id===newId)){n++;newId=prefix+'-'+String(n).padStart(4,'0');}
      rec.id=newId;
    }
    // Defaults
    if(typeKey==='equipment'||typeKey==='tools'||typeKey==='vehicles'){
      if(!rec.status)rec.status='available';
      if(!rec.nextMaint)rec.nextMaint='N/A';if(!rec.nextCal)rec.nextCal='N/A';
      if(!rec.cert)rec.cert='N/A';if(!rec.certExpiry)rec.certExpiry='N/A';
      if(!rec.calBody)rec.calBody='N/A';if(!rec.certBody)rec.certBody='N/A';
      if(typeKey==='equipment'){if(!rec.lastMaint)rec.lastMaint='N/A';if(!rec.lastCal)rec.lastCal='N/A';}
      rec.type={equipment:'Equipment',tools:'Tool',vehicles:'Vehicle'}[typeKey];
    }
    if(typeKey==='thirdparty'){if(!rec.status)rec.status='active';}
    if(typeKey==='consumables'){rec.status=rec.qtyOnHand<=rec.minStock?'low-stock':'in-stock';}
    const idx=list.findIndex(x=>x.id===rec.id);
    if(idx>=0){list[idx]={...list[idx],...rec};updated++;}
    else{list.push(rec);added++;}
  });

  AppState.save();closeModal('genericModal');
  window._importRows=null;
  // Refresh current tab
  renderMlTab();
  if(skipped>0&&skipReasons.length){
    // Show a detailed modal so the user can see what was skipped
    $('#genericModalTitle').textContent='Import Complete';
    $('#genericModalBody').innerHTML=`
      <div style="display:flex;gap:14px;margin-bottom:14px;text-align:center">
        <div style="flex:1;padding:10px;background:rgba(63,185,80,.1);border-radius:8px">
          <div style="font-size:22px;font-weight:800;color:var(--accent-green)">${added}</div>
          <div style="font-size:10px;color:var(--text-muted)">ADDED</div>
        </div>
        <div style="flex:1;padding:10px;background:rgba(56,139,253,.1);border-radius:8px">
          <div style="font-size:22px;font-weight:800;color:var(--accent-blue)">${updated}</div>
          <div style="font-size:10px;color:var(--text-muted)">UPDATED</div>
        </div>
        <div style="flex:1;padding:10px;background:rgba(240,164,80,.1);border-radius:8px">
          <div style="font-size:22px;font-weight:800;color:var(--accent-amber)">${skipped}</div>
          <div style="font-size:10px;color:var(--text-muted)">SKIPPED</div>
        </div>
      </div>
      <div style="font-size:12px;font-weight:600;color:var(--accent-amber);margin-bottom:6px"><i class="fas fa-exclamation-triangle" style="margin-right:5px"></i>Skipped row reasons:</div>
      <div style="max-height:280px;overflow-y:auto;padding:8px 12px;background:var(--bg-hover);border-radius:7px;font-size:11px;color:var(--text-secondary);line-height:1.7">
        ${skipReasons.slice(0,50).map(r=>'• '+r).join('<br>')}
        ${skipReasons.length>50?'<br>... and '+(skipReasons.length-50)+' more':''}
      </div>`;
    $('#genericModalFooter').innerHTML='<button class="btn btn-primary" onclick="closeModal(\'genericModal\')">OK</button>';
    openModal('genericModal');
  } else {
    showToast(`Import complete: ${added} added, ${updated} updated${skipped?', '+skipped+' skipped':''}`,'success',5000);
  }
}


// ── ADD PICKER MODAL ──────────────────────────────────────
function showMasterlistAdd(){
  const opts=[['Equipment','fa-cog','#f0a450',"showAddAsset('equipment')"],['Tool','fa-wrench','#bc8cff',"showAddAsset('tools')"],['Vehicle','fa-truck','#39d3f2',"showAddAsset('vehicles')"],['Consumable','fa-boxes','#3fb950','showAddConsumable()'],['Material','fa-layer-group','#fb8f44','showAddMaterial()'],['Third Party','fa-handshake','#f85149','showAddThirdParty()']];
  $('#genericModalTitle').textContent='Add to Masterlist — Select Type';
  $('#genericModalBody').innerHTML=`<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px">
    ${opts.map(([l,ic,c,fn])=>`<div class="card" style="cursor:pointer;text-align:center;padding:18px;border:2px solid transparent;transition:var(--transition)" onclick="closeModal('genericModal');${fn}" onmouseover="this.style.borderColor='${c}'" onmouseout="this.style.borderColor='transparent'">
      <i class="fas ${ic}" style="font-size:26px;color:${c};margin-bottom:8px;display:block"></i>
      <div style="font-size:13px;font-weight:600">${l}</div>
    </div>`).join('')}
  </div>`;
  $('#genericModalFooter').innerHTML=`<button class="btn btn-secondary" onclick="closeModal('genericModal')">Cancel</button>`;
  openModal('genericModal');
}

// ── ASSET HISTORY ─────────────────────────────────────────
function renderMlHistory(){
  const hist=(AppState.data.assetHistory||[]).slice().reverse(); // newest first
  let data=[...hist];
  if(mlSearch){const s=mlSearch.toLowerCase();data=data.filter(h=>Object.values(h).some(v=>String(v||'').toLowerCase().includes(s)));}
  if(mlProjectFilter!=='all')data=data.filter(h=>h.projectId===mlProjectFilter);

  const actionColor={Deployment:'#388bfd',Maintenance:'#f0a450','Preventive Maintenance':'#f0a450','Corrective Maintenance':'#fb8f44',Breakdown:'#f85149',Calibration:'#bc8cff','Permit Renewal':'#39d3f2','Certification Renewal':'#39d3f2','Status Change':'#3fb950',Repair:'#f85149',Inspection:'#388bfd',Transfer:'#8b949e','Return to Store':'#8b949e',Decommission:'#f85149',Other:'#8b949e'};
  const typeColor={Equipment:'#f0a450',Tool:'#bc8cff',Vehicle:'#39d3f2',Personnel:'#388bfd'};

  $('#mlTabContent').innerHTML=`
  <div class="grid grid-4" style="margin-bottom:14px">
    ${sc('fas fa-history','Total Events',hist.length,'All history','#388bfd','rgba(56,139,253,.15)')}
    ${sc('fas fa-tools','Maintenance',hist.filter(h=>h.action==='Maintenance').length,'Maintenance events','#f0a450','rgba(240,164,80,.15)')}
    ${sc('fas fa-crosshairs','Calibration',hist.filter(h=>h.action==='Calibration').length,'Cal events','#bc8cff','rgba(188,140,255,.15)')}
    ${sc('fas fa-hard-hat','Deployments',hist.filter(h=>h.action==='Deployment').length,'Asset deployments','#3fb950','rgba(63,185,80,.15)')}
  </div>
  <div class="grid grid-4" style="margin-bottom:14px">
    ${sc('fas fa-bolt','Breakdowns',hist.filter(h=>h.action==='Breakdown').length,'Breakdown events','#f85149','rgba(248,81,73,.15)')}
    ${sc('fas fa-wrench','Repairs',hist.filter(h=>h.action==='Repair'||h.action==='Corrective Maintenance').length,'Repair events','#fb8f44','rgba(251,143,68,.15)')}
    ${sc('fas fa-shield-alt','Preventive Maint.',hist.filter(h=>h.action==='Preventive Maintenance').length,'PM events','#3fb950','rgba(63,185,80,.15)')}
    ${sc('fas fa-id-card','Cert Renewals',hist.filter(h=>h.action==='Permit Renewal'||h.action==='Certification Renewal').length,'Renewals logged','#39d3f2','rgba(57,211,242,.15)')}
  </div>
  <div class="card">
    <div class="section-header" style="margin-bottom:12px">
      <div class="section-title">Asset History Log <span style="font-size:12px;font-weight:400;color:var(--text-secondary)">${data.length} events</span></div>
      <div style="display:flex;gap:7px">
        <button class="btn btn-secondary btn-sm" onclick="exportHistoryCSV()"><i class="fas fa-download"></i> Export</button>
        <button class="btn btn-primary btn-sm" onclick="showLogAssetHistory()"><i class="fas fa-plus"></i> Log Event</button>
      </div>
    </div>
    <div class="table-wrap"><table>
      <thead><tr><th>ID</th><th>Date</th><th>Asset</th><th>Type</th><th>Action</th><th>Detail</th><th>Before</th><th>After</th><th>Project</th><th>Performed By</th><th></th></tr></thead>
      <tbody>${data.length?data.map(h=>`<tr>
        <td style="font-size:10px;font-family:var(--font-mono);font-weight:700">${h.id}</td>
        <td style="font-size:11px;font-family:var(--font-mono);white-space:nowrap">${h.date}</td>
        <td><div style="font-weight:500;font-size:12px">${h.assetName}</div><div style="font-size:9px;font-family:var(--font-mono);color:var(--text-muted)">${h.assetId}</div></td>
        <td><span class="badge" style="background:${typeColor[h.assetType]||'#8b949e'}22;color:${typeColor[h.assetType]||'#8b949e'}">${h.assetType}</span></td>
        <td><span class="badge" style="background:${actionColor[h.action]||'#8b949e'}22;color:${actionColor[h.action]||'#8b949e'};font-size:11px">${h.action}</span></td>
        <td style="font-size:11px;max-width:220px;color:var(--text-secondary)">${h.detail}</td>
        <td><span class="badge badge-gray" style="font-size:9px">${h.beforeValue||'—'}</span></td>
        <td><span class="badge badge-blue" style="font-size:9px">${h.afterValue||'—'}</span></td>
        <td><span class="badge badge-blue">${h.projectId||'—'}</span></td>
        <td><div style="display:flex;align-items:center;gap:5px">${avatarH(h.performedBy,22)}<span style="font-size:11px">${h.performedBy}</span></div></td>
        <td><button class="btn btn-danger btn-sm btn-icon" onclick="deleteHistoryEntry('${h.id}')"><i class="fas fa-trash"></i></button></td>
      </tr>`).join(''):`<tr><td colspan="11"><div class="empty-state" style="padding:24px"><i class="fas fa-history" style="font-size:24px;margin-bottom:8px"></i><p>No history events yet. Click "Log Event" to add one.</p></div></td></tr>`}
      </tbody>
    </table>
  </div>

  <!-- Timeline view -->
  <div class="card" style="margin-top:14px">
    <div class="card-title" style="margin-bottom:12px"><i class="fas fa-stream" style="margin-right:6px"></i>Activity Timeline</div>
    ${data.slice(0,10).map(h=>`
    <div style="display:flex;gap:12px;padding:10px 0;border-bottom:1px solid var(--border)">
      <div style="width:38px;height:38px;border-radius:50%;background:${actionColor[h.action]||'#8b949e'}22;display:flex;align-items:center;justify-content:center;flex-shrink:0">
        <i class="fas ${{'Deployment':'fa-truck-loading','Maintenance':'fa-tools','Preventive Maintenance':'fa-shield-check','Corrective Maintenance':'fa-exclamation-circle','Breakdown':'fa-bolt','Calibration':'fa-crosshairs','Permit Renewal':'fa-certificate','Certification Renewal':'fa-id-card','Status Change':'fa-exchange-alt','Repair':'fa-wrench','Inspection':'fa-clipboard-check','Transfer':'fa-arrows-alt','Return to Store':'fa-undo','Decommission':'fa-ban'}[h.action]||'fa-circle'}" style="color:${actionColor[h.action]||'#8b949e'};font-size:14px"></i>
      </div>
      <div style="flex:1;min-width:0">
        <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
          <span style="font-size:12px;font-weight:600">${h.action}</span>
          <span style="font-size:11px;color:var(--text-secondary)">on</span>
          <span style="font-size:12px;font-weight:600;color:${typeColor[h.assetType]||'#8b949e'}">${h.assetName}</span>
          <span class="badge badge-blue" style="font-size:9px">${h.projectId}</span>
        </div>
        <div style="font-size:11px;color:var(--text-secondary);margin:3px 0">${h.detail}</div>
        <div style="font-size:10px;color:var(--text-muted);display:flex;gap:8px">
          <span><i class="fas fa-user" style="margin-right:3px"></i>${h.performedBy}</span>
          <span><i class="fas fa-calendar" style="margin-right:3px"></i>${h.date}</span>
          ${h.beforeValue?`<span style="color:var(--text-muted)">${h.beforeValue} &#8594; <strong style="color:var(--accent-blue)">${h.afterValue}</strong></span>`:''}
        </div>
      </div>
    </div>`).join('')}
    ${data.length>10?`<div style="padding:10px;text-align:center;font-size:11px;color:var(--text-secondary)">${data.length-10} more events above in the table</div>`:''}
  </div>`;
}

function deleteHistoryEntry(id){
  if(requestOrDelete('assetHistory',id)){renderMlHistory();}
}

function showLogAssetHistoryFor(assetId, assetName, assetType){
  // Opens the log modal with the asset pre-selected
  _ahSelectedAsset = null;
  showLogAssetHistory();
  // After modal renders, pre-select the asset
  setTimeout(() => {
    const typeToKey = { Equipment:'equipment', Tool:'tools', Vehicle:'vehicles', Personnel:'personnel', Consumable:'consumables', 'Third Party':'thirdParty' };
    const listKey = typeToKey[assetType] || 'equipment';
    const asset = (AppState.data[listKey]||[]).find(a => a.id === assetId);
    if (asset) _ahPickAsset(asset, listKey);
  }, 50);
}

// ── State for the new logging form ───────────────────────
let _ahSelectedAsset = null; // { asset, typeKey, typeLabel }
let _ahSelectedFile = null;

const _AH_EVENT_TYPES = [
  'Deployment','Return','Maintenance','Preventive Maintenance','Corrective Maintenance',
  'Calibration','Inspection','Repair','Breakdown','Disposal','Transfer',
  'Permit Renewal','Certification Renewal','Status Change','Other'
];

// Fields shown per event type
const _AH_FIELD_RULES = {
  'Deployment':            { project:true,  nextMaint:false, nextCal:false, certExpiry:false, cost:false },
  'Return':                { project:false, nextMaint:false, nextCal:false, certExpiry:false, cost:false },
  'Maintenance':           { project:false, nextMaint:true,  nextCal:false, certExpiry:false, cost:true },
  'Preventive Maintenance':{ project:false, nextMaint:true,  nextCal:false, certExpiry:false, cost:true },
  'Corrective Maintenance':{ project:false, nextMaint:true,  nextCal:false, certExpiry:false, cost:true },
  'Calibration':           { project:false, nextMaint:false, nextCal:true,  certExpiry:true,  cost:true },
  'Inspection':            { project:false, nextMaint:false, nextCal:false, certExpiry:false, cost:false },
  'Repair':                { project:false, nextMaint:false, nextCal:false, certExpiry:false, cost:true },
  'Breakdown':             { project:false, nextMaint:false, nextCal:false, certExpiry:false, cost:false },
  'Disposal':              { project:false, nextMaint:false, nextCal:false, certExpiry:false, cost:true },
  'Transfer':              { project:true,  nextMaint:false, nextCal:false, certExpiry:false, cost:false },
  'Permit Renewal':        { project:false, nextMaint:false, nextCal:false, certExpiry:true,  cost:true },
  'Certification Renewal': { project:false, nextMaint:false, nextCal:false, certExpiry:true,  cost:true },
  'Status Change':         { project:false, nextMaint:false, nextCal:false, certExpiry:false, cost:false },
  'Other':                 { project:true,  nextMaint:true,  nextCal:true,  certExpiry:true,  cost:true },
};

// Suggested "Status After" per event type
const _AH_SUGGESTED_AFTER = {
  'Deployment':            'in-use',
  'Return':                'available',
  'Maintenance':           'available · serviced {date}',
  'Preventive Maintenance':'available · PM done {date}',
  'Corrective Maintenance':'available · repaired {date}',
  'Calibration':           'available · calibrated {date}',
  'Inspection':            '',
  'Repair':                'available · repaired {date}',
  'Breakdown':             'out-of-service',
  'Disposal':              'disposed',
  'Transfer':              'in-use',
  'Permit Renewal':        'available · permit renewed {date}',
  'Certification Renewal': 'available · cert renewed {date}',
  'Status Change':         '',
  'Other':                 '',
};

function showLogAssetHistory(){
  _ahSelectedAsset = null;
  _ahSelectedFile = null;
  $('#genericModalTitle').textContent = 'Log Asset History Event';
  $('#genericModalBody').innerHTML = `
    <!-- ASSET SEARCH SECTION -->
    <div class="form-group" style="margin-bottom:14px">
      <label class="form-label">Asset * <span style="font-weight:400;color:var(--text-muted)">(search by ID, name, category, serial...)</span></label>
      <div style="position:relative">
        <i class="fas fa-search" style="position:absolute;left:10px;top:50%;transform:translateY(-50%);color:var(--text-muted);font-size:12px;pointer-events:none"></i>
        <input id="ahAssetSearch" class="form-input" autocomplete="off"
          style="padding-left:30px" placeholder="Type to search 1000+ assets..."
          oninput="_ahRenderSearchResults(this.value)"
          onfocus="_ahRenderSearchResults(this.value)"
          onkeydown="_ahSearchKeyNav(event)">
        <div id="ahSearchResults" style="display:none;position:absolute;left:0;right:0;top:calc(100% + 4px);max-height:280px;overflow-y:auto;background:var(--bg-card);border:1px solid var(--border);border-radius:8px;box-shadow:0 8px 24px rgba(0,0,0,.3);z-index:100"></div>
      </div>
      <div id="ahAssetSelected" style="display:none;margin-top:10px;padding:10px 12px;background:rgba(56,139,253,.06);border:1px solid rgba(56,139,253,.25);border-radius:8px"></div>
    </div>

    <div id="ahEventFields" style="display:none">
      <!-- EVENT TYPE + DATE -->
      <div class="form-grid">
        <div class="form-group"><label class="form-label">Event Type *</label>
          <select class="form-select" id="ahAction" onchange="_ahOnEventTypeChange()">
            ${_AH_EVENT_TYPES.map(a=>`<option value="${a}">${a}</option>`).join('')}
          </select>
        </div>
        <div class="form-group"><label class="form-label">Date *</label>
          <input class="form-input" type="date" id="ahDate" value="${new Date().toISOString().split('T')[0]}" onchange="_ahUpdateSuggestedAfter()">
        </div>
      </div>

      <!-- BEFORE / AFTER -->
      <div class="form-grid">
        <div class="form-group">
          <label class="form-label">Status / Value Before
            <a id="ahBeforeOverride" onclick="_ahToggleBeforeEdit()" style="font-size:10px;color:var(--accent-blue);cursor:pointer;font-weight:400;margin-left:8px"><i class="fas fa-lock" style="margin-right:3px"></i>Override</a>
          </label>
          <input class="form-input" id="ahBefore" readonly style="opacity:.85;cursor:not-allowed;background:var(--bg-hover)">
          <div style="font-size:10px;color:var(--text-muted);margin-top:3px"><i class="fas fa-magic" style="margin-right:3px"></i>Auto-filled from asset record</div>
        </div>
        <div class="form-group">
          <label class="form-label">Status / Value After <span style="font-weight:400;color:var(--text-muted)">(suggestion)</span></label>
          <input class="form-input" id="ahAfter" placeholder="Suggested based on event type">
        </div>
      </div>

      <!-- CONDITIONAL FIELDS -->
      <div id="ahProjGroup" class="form-grid" style="display:none">
        <div class="form-group" style="grid-column:1/-1"><label class="form-label">Project</label>
          <select class="form-select" id="ahProj">
            <option value="N/A">— Not Assigned / General</option>
            ${(AppState.data.projects||[]).map(p=>`<option value="${p.id}">${p.id} — ${(p.name||'').substring(0,32)}</option>`).join('')}
          </select>
        </div>
      </div>

      <div class="form-grid">
        <div class="form-group" id="ahNextMaintGroup" style="display:none">
          <label class="form-label">Next Maintenance Date</label>
          <input class="form-input" type="date" id="ahNextMaint">
          <label style="display:flex;align-items:center;gap:6px;font-size:10px;color:var(--text-secondary);margin-top:4px;cursor:pointer">
            <input type="checkbox" id="ahUpdAssetMaint" checked> Also update the asset record's next maintenance date
          </label>
        </div>
        <div class="form-group" id="ahNextCalGroup" style="display:none">
          <label class="form-label">Next Calibration Date</label>
          <input class="form-input" type="date" id="ahNextCal">
          <label style="display:flex;align-items:center;gap:6px;font-size:10px;color:var(--text-secondary);margin-top:4px;cursor:pointer">
            <input type="checkbox" id="ahUpdAssetCal" checked> Also update the asset record's next calibration date
          </label>
        </div>
      </div>

      <div class="form-grid">
        <div class="form-group" id="ahCertExpiryGroup" style="display:none">
          <label class="form-label">Cert / Permit Expiry</label>
          <input class="form-input" type="date" id="ahCertExpiry">
          <label style="display:flex;align-items:center;gap:6px;font-size:10px;color:var(--text-secondary);margin-top:4px;cursor:pointer">
            <input type="checkbox" id="ahUpdAssetCert" checked> Also update the asset record's expiry
          </label>
        </div>
        <div class="form-group" id="ahCostGroup" style="display:none">
          <label class="form-label">Cost <span style="font-weight:400;color:var(--text-muted)">(optional)</span></label>
          <input class="form-input" type="number" id="ahCost" placeholder="0.00" step="0.01">
        </div>
      </div>

      <div class="form-grid">
        <div class="form-group"><label class="form-label">Performed By</label>
          <input class="form-input" id="ahBy" placeholder="Name or company">
        </div>
        <div class="form-group"><label class="form-label">&nbsp;</label>
          <div style="display:flex;align-items:center;height:36px;color:var(--text-muted);font-size:11px">
            <i class="fas fa-user" style="margin-right:5px"></i>Logged by: <strong style="margin-left:4px;color:var(--text-primary)">${_currentUserProfile?.name || _currentUser?.email || 'You'}</strong>
          </div>
        </div>
      </div>

      <div class="form-group">
        <label class="form-label">Detail / Description *</label>
        <textarea class="form-textarea" id="ahDetail" placeholder="Describe what was done..." style="min-height:60px"></textarea>
      </div>

      <!-- ATTACHMENT -->
      <div class="form-group" style="margin-top:14px">
        <label class="form-label">📎 Attach Document / Photo <span style="font-weight:400;color:var(--text-muted)">(optional)</span></label>
        <input type="file" class="form-input" id="ahFile" accept=".pdf,.jpg,.jpeg,.png,.doc,.docx" onchange="_ahPickFile(event)">
        <div id="ahFilePreview" style="font-size:11px;color:var(--text-muted);margin-top:4px">Photos for breakdown, certificates for calibration, service receipts, etc.</div>
      </div>
    </div>
  `;
  $('#genericModalFooter').innerHTML = `
    <button class="btn btn-secondary" onclick="closeModal('genericModal')">Cancel</button>
    <button class="btn btn-primary" id="ahSaveBtn" onclick="saveAssetHistory()" disabled style="opacity:.5"><i class="fas fa-save"></i> Log Event</button>
  `;
  openModal('genericModal');
  setTimeout(() => document.getElementById('ahAssetSearch')?.focus(), 100);
}

// ── Asset search ───────────────────────────────────────
let _ahSearchIdx = 0;
function _ahRenderSearchResults(query) {
  const resultsEl = document.getElementById('ahSearchResults');
  if (!resultsEl) return;
  const q = (query || '').toLowerCase().trim();

  // Build pool of all asset types
  const pool = [];
  const addPool = (arr, typeKey, typeLabel, icon, color) => {
    (arr || []).forEach(a => pool.push({ asset: a, typeKey, typeLabel, icon, color }));
  };
  addPool(AppState.data.equipment, 'equipment', 'Equipment', 'fa-cogs', '#fb8f44');
  addPool(AppState.data.tools, 'tools', 'Tools', 'fa-wrench', '#bc8cff');
  addPool(AppState.data.vehicles, 'vehicles', 'Vehicles', 'fa-truck', '#3fb950');
  addPool(AppState.data.personnel, 'personnel', 'Personnel', 'fa-user-hard-hat', '#388bfd');
  addPool(AppState.data.consumables, 'consumables', 'Consumables', 'fa-boxes', '#39d3f2');
  addPool(AppState.data.thirdParty, 'thirdParty', 'Third Party', 'fa-handshake', '#f0a450');

  let matches;
  if (!q) {
    // Recently logged assets at top
    const recentIds = (AppState.data.assetHistory||[]).slice(-30).reverse().map(h => h.assetId);
    const seen = new Set();
    matches = [];
    for (const id of recentIds) {
      const found = pool.find(p => p.asset.id === id);
      if (found && !seen.has(id)) { matches.push(found); seen.add(id); if (matches.length >= 6) break; }
    }
    if (matches.length === 0) matches = pool.slice(0, 12);
  } else {
    matches = pool.filter(p => {
      const a = p.asset;
      return (a.id || '').toLowerCase().includes(q)
        || (a.name || '').toLowerCase().includes(q)
        || (a.category || '').toLowerCase().includes(q)
        || (a.serialNo || a.serial || '').toLowerCase().includes(q)
        || (a.location || '').toLowerCase().includes(q)
        || (a.make || '').toLowerCase().includes(q)
        || (a.model || '').toLowerCase().includes(q);
    }).slice(0, 30);
  }

  if (!matches.length) {
    resultsEl.style.display = 'block';
    resultsEl.innerHTML = `<div style="padding:14px;text-align:center;color:var(--text-muted);font-size:12px"><i class="fas fa-search" style="font-size:18px;opacity:.4;display:block;margin-bottom:5px"></i>No assets match "${q}"</div>`;
    return;
  }
  _ahSearchIdx = 0;
  resultsEl.style.display = 'block';
  resultsEl.innerHTML = (!q ? '<div style="padding:6px 12px;font-size:9px;font-weight:700;letter-spacing:1px;color:var(--text-muted);background:var(--bg-hover);border-bottom:1px solid var(--border)">' + (matches.length && (AppState.data.assetHistory||[]).length ? 'RECENT' : 'ALL ASSETS') + '</div>' : '')
    + matches.map((m, i) => {
    const a = m.asset;
    const statusColor = (a.status==='available')?'#3fb950':(a.status==='in-use')?'#388bfd':(a.status==='maintenance')?'#f0a450':(a.status==='out-of-service')?'#f85149':'#8b949e';
    return `<div data-ah-idx="${i}" onclick='_ahPickAsset(${JSON.stringify(a).replace(/'/g,"&#39;")}, "${m.typeKey}")' onmouseenter="_ahSearchIdx=${i};_ahHighlight()"
      style="padding:8px 12px;display:flex;align-items:center;gap:10px;cursor:pointer;border-bottom:1px solid var(--border);${i===_ahSearchIdx?'background:var(--bg-hover)':''}">
      <div style="width:28px;height:28px;background:${m.color}22;color:${m.color};border-radius:6px;display:flex;align-items:center;justify-content:center;flex-shrink:0"><i class="fas ${m.icon}" style="font-size:11px"></i></div>
      <div style="flex:1;min-width:0">
        <div style="font-size:12px;font-weight:600;line-height:1.3;white-space:nowrap;overflow:hidden;text-overflow:ellipsis"><span style="font-family:var(--font-mono);color:var(--accent-blue)">${a.id}</span> — ${a.name||'(no name)'}</div>
        <div style="font-size:10px;color:var(--text-muted);margin-top:2px">${m.typeLabel}${a.category?' · '+a.category:''}${a.location?' · '+a.location:''}</div>
      </div>
      <span style="font-size:10px;padding:2px 7px;border-radius:8px;background:${statusColor}22;color:${statusColor};font-weight:600;flex-shrink:0">${a.status||'available'}</span>
    </div>`;
  }).join('');
}

function _ahHighlight() {
  document.querySelectorAll('[data-ah-idx]').forEach((el, i) => {
    el.style.background = i === _ahSearchIdx ? 'var(--bg-hover)' : '';
  });
}

function _ahSearchKeyNav(e) {
  const resultsEl = document.getElementById('ahSearchResults');
  if (!resultsEl || resultsEl.style.display === 'none') return;
  const items = resultsEl.querySelectorAll('[data-ah-idx]');
  if (!items.length) return;
  if (e.key === 'ArrowDown') { e.preventDefault(); _ahSearchIdx = Math.min(_ahSearchIdx + 1, items.length - 1); _ahHighlight(); items[_ahSearchIdx]?.scrollIntoView({block:'nearest'}); }
  else if (e.key === 'ArrowUp') { e.preventDefault(); _ahSearchIdx = Math.max(_ahSearchIdx - 1, 0); _ahHighlight(); items[_ahSearchIdx]?.scrollIntoView({block:'nearest'}); }
  else if (e.key === 'Enter') { e.preventDefault(); items[_ahSearchIdx]?.click(); }
  else if (e.key === 'Escape') { resultsEl.style.display = 'none'; }
}

function _ahPickAsset(asset, typeKey) {
  const typeLabels = { equipment:'Equipment', tools:'Tools', vehicles:'Vehicles', personnel:'Personnel', consumables:'Consumables', thirdParty:'Third Party' };
  const typeAssetType = { equipment:'Equipment', tools:'Tool', vehicles:'Vehicle', personnel:'Personnel', consumables:'Consumable', thirdParty:'Third Party' };
  _ahSelectedAsset = { asset, typeKey, typeLabel: typeLabels[typeKey], assetType: typeAssetType[typeKey] };
  // Update UI
  const searchInput = document.getElementById('ahAssetSearch');
  const resultsEl = document.getElementById('ahSearchResults');
  const selectedEl = document.getElementById('ahAssetSelected');
  const fieldsEl = document.getElementById('ahEventFields');
  const saveBtn = document.getElementById('ahSaveBtn');
  if (searchInput) { searchInput.value = ''; searchInput.placeholder = 'Search again to change asset...'; }
  if (resultsEl) resultsEl.style.display = 'none';
  if (selectedEl) {
    const a = asset;
    const statusColor = (a.status==='available')?'#3fb950':(a.status==='in-use')?'#388bfd':(a.status==='maintenance')?'#f0a450':'#8b949e';
    selectedEl.style.display = 'block';
    selectedEl.innerHTML = `
      <div style="display:flex;align-items:center;gap:12px">
        <i class="fas fa-check-circle" style="color:var(--accent-green);font-size:18px"></i>
        <div style="flex:1;min-width:0">
          <div style="font-size:13px;font-weight:700"><span style="font-family:var(--font-mono);color:var(--accent-blue)">${a.id}</span> — ${a.name||''}</div>
          <div style="font-size:10px;color:var(--text-muted);margin-top:2px">
            <span style="padding:1px 6px;background:${statusColor}22;color:${statusColor};border-radius:8px;font-weight:600;margin-right:6px">${a.status||'available'}</span>
            ${_ahSelectedAsset.typeLabel}${a.category?' · '+a.category:''}${a.location?' · 📍 '+a.location:''}
            ${a.nextCal?' · 🔧 Cal: '+a.nextCal:''}${a.nextMaint?' · 🛠 Maint: '+a.nextMaint:''}${a.certExpiry?' · 📜 Cert: '+a.certExpiry:''}
          </div>
        </div>
        <button onclick="_ahClearAsset()" style="background:none;border:none;color:var(--text-muted);cursor:pointer;font-size:14px" title="Change asset"><i class="fas fa-times"></i></button>
      </div>`;
  }
  if (fieldsEl) fieldsEl.style.display = 'block';
  if (saveBtn) { saveBtn.disabled = false; saveBtn.style.opacity = '1'; }
  // Auto-fill "Status Before" with current asset status (+ details if relevant)
  _ahPopulateBefore();
  _ahOnEventTypeChange(); // refresh visibility + after-suggestion
}

function _ahClearAsset() {
  _ahSelectedAsset = null;
  const searchInput = document.getElementById('ahAssetSearch');
  const selectedEl = document.getElementById('ahAssetSelected');
  const fieldsEl = document.getElementById('ahEventFields');
  const saveBtn = document.getElementById('ahSaveBtn');
  if (searchInput) { searchInput.value = ''; searchInput.placeholder = 'Type to search 1000+ assets...'; searchInput.focus(); }
  if (selectedEl) selectedEl.style.display = 'none';
  if (fieldsEl) fieldsEl.style.display = 'none';
  if (saveBtn) { saveBtn.disabled = true; saveBtn.style.opacity = '.5'; }
}

function _ahPopulateBefore() {
  if (!_ahSelectedAsset) return;
  const a = _ahSelectedAsset.asset;
  const beforeEl = document.getElementById('ahBefore');
  if (!beforeEl) return;
  const parts = [a.status || 'available'];
  if (a.nextCal && a.nextCal !== 'N/A') {
    const today = new Date().toISOString().split('T')[0];
    if (a.nextCal < today) parts.push('cal overdue (was due ' + a.nextCal + ')');
    else parts.push('cal due ' + a.nextCal);
  }
  if (a.nextMaint && a.nextMaint !== 'N/A') {
    const today = new Date().toISOString().split('T')[0];
    if (a.nextMaint < today) parts.push('maint overdue');
  }
  if (a.certExpiry && a.certExpiry !== 'N/A') {
    const today = new Date().toISOString().split('T')[0];
    if (a.certExpiry < today) parts.push('cert expired');
  }
  beforeEl.value = parts.join(' · ');
}

function _ahToggleBeforeEdit() {
  const beforeEl = document.getElementById('ahBefore');
  const overrideLink = document.getElementById('ahBeforeOverride');
  if (!beforeEl) return;
  if (beforeEl.readOnly) {
    beforeEl.readOnly = false;
    beforeEl.style.opacity = '1';
    beforeEl.style.cursor = 'text';
    beforeEl.style.background = '';
    beforeEl.focus();
    if (overrideLink) overrideLink.innerHTML = '<i class="fas fa-lock-open" style="margin-right:3px"></i>Reset to auto';
  } else {
    beforeEl.readOnly = true;
    beforeEl.style.opacity = '.85';
    beforeEl.style.cursor = 'not-allowed';
    beforeEl.style.background = 'var(--bg-hover)';
    _ahPopulateBefore();
    if (overrideLink) overrideLink.innerHTML = '<i class="fas fa-lock" style="margin-right:3px"></i>Override';
  }
}

function _ahOnEventTypeChange() {
  const action = document.getElementById('ahAction')?.value || 'Other';
  const rules = _AH_FIELD_RULES[action] || _AH_FIELD_RULES['Other'];
  // Show/hide groups
  const show = (id, cond) => { const el = document.getElementById(id); if (el) el.style.display = cond ? '' : 'none'; };
  show('ahProjGroup', rules.project);
  show('ahNextMaintGroup', rules.nextMaint);
  show('ahNextCalGroup', rules.nextCal);
  show('ahCertExpiryGroup', rules.certExpiry);
  show('ahCostGroup', rules.cost);
  _ahUpdateSuggestedAfter();
}

function _ahUpdateSuggestedAfter() {
  const action = document.getElementById('ahAction')?.value || 'Other';
  const date = document.getElementById('ahDate')?.value || new Date().toISOString().split('T')[0];
  const afterEl = document.getElementById('ahAfter');
  if (!afterEl) return;
  const tmpl = _AH_SUGGESTED_AFTER[action] || '';
  const suggested = tmpl.replace('{date}', date);
  // Only set if not yet user-edited (heuristic: matches last suggestion or empty)
  if (!afterEl.value || afterEl.dataset.fromSuggestion === '1') {
    afterEl.value = suggested;
    afterEl.dataset.fromSuggestion = '1';
  }
  // Track manual edits so we don't overwrite
  if (!afterEl._ahHooked) {
    afterEl._ahHooked = true;
    afterEl.addEventListener('input', () => { afterEl.dataset.fromSuggestion = '0'; });
  }
}

function _ahPickFile(event) {
  const file = event.target.files[0];
  const preview = document.getElementById('ahFilePreview');
  if (!file) { _ahSelectedFile = null; if (preview) preview.textContent = 'Photos for breakdown, certificates for calibration, service receipts, etc.'; return; }
  if (file.size > 50 * 1024 * 1024) { showToast('File too large — max 50 MB', 'error'); event.target.value = ''; return; }
  _ahSelectedFile = file;
  if (preview) preview.innerHTML = '<i class="fas fa-paperclip" style="color:var(--accent-blue);margin-right:5px"></i><strong>' + file.name + '</strong> · ' + _formatFileSize(file.size);
}

async function saveAssetHistory() {
  if (!_ahSelectedAsset) { showToast('Please select an asset', 'error'); return; }
  const a = _ahSelectedAsset.asset;
  const typeKey = _ahSelectedAsset.typeKey;
  const assetType = _ahSelectedAsset.assetType;
  const action = $('#ahAction')?.value || '';
  const rules = _AH_FIELD_RULES[action] || _AH_FIELD_RULES['Other'];
  const date = $('#ahDate')?.value || new Date().toISOString().split('T')[0];
  let detail = $('#ahDetail')?.value || '';
  const nextMaint = rules.nextMaint ? ($('#ahNextMaint')?.value || '') : '';
  const nextCal = rules.nextCal ? ($('#ahNextCal')?.value || '') : '';
  const certExpiry = rules.certExpiry ? ($('#ahCertExpiry')?.value || '') : '';
  const cost = rules.cost ? (parseFloat($('#ahCost')?.value || 0) || 0) : 0;
  const projectId = rules.project ? ($('#ahProj')?.value || 'N/A') : 'N/A';
  const updMaint = document.getElementById('ahUpdAssetMaint')?.checked !== false;
  const updCal = document.getElementById('ahUpdAssetCal')?.checked !== false;
  const updCert = document.getElementById('ahUpdAssetCert')?.checked !== false;

  if (!detail) {
    const parts = [];
    if (nextMaint) parts.push('Next maintenance: ' + nextMaint);
    if (nextCal) parts.push('Next calibration: ' + nextCal);
    if (certExpiry) parts.push('Cert/permit expiry updated to: ' + certExpiry);
    detail = parts.join(' · ') || action + ' performed';
  }

  // Upload attachment if present
  let attachment = null;
  if (_ahSelectedFile) {
    if (_spConnected) {
      try {
        showToast('Uploading attachment...', 'info', 2000);
        const result = await spUploadFile(_ahSelectedFile, 'ASSETS/' + a.id);
        attachment = {
          name: _ahSelectedFile.name,
          fileUrl: result.url,
          fileWebUrl: result.webUrl,
          spDriveId: result.driveId,
          spItemId: result.itemId,
          size: _formatFileSize(_ahSelectedFile.size),
        };
      } catch(e) {
        if (!confirm('Attachment upload failed: ' + e.message + '\n\nSave event without attachment?')) return;
      }
    } else {
      if (!confirm('Not connected to SharePoint — cannot upload attachment.\n\nSave event without attachment?')) return;
    }
  }

  const h = {
    id: 'AH-' + ((AppState.data.assetHistory||[]).length + 1).toString().padStart(4, '0'),
    assetId: a.id,
    assetName: a.name,
    assetType,
    action,
    detail,
    performedBy: $('#ahBy')?.value || '',
    loggedBy: _currentUserProfile?.name || _currentUser?.email || '',
    date,
    projectId,
    beforeValue: $('#ahBefore')?.value || '',
    afterValue: $('#ahAfter')?.value || '',
    nextMaint, nextCal, certExpiry, cost,
    attachment,
    timestamp: new Date().toISOString(),
  };
  if (!AppState.data.assetHistory) AppState.data.assetHistory = [];
  _markNewlyCreated(h);
  AppState.data.assetHistory.push(h);

  // Update asset record per rules + checkboxes
  const asset = (AppState.data[typeKey] || []).find(x => x.id === a.id);
  if (asset) {
    if (nextMaint && updMaint) {
      asset.lastMaint = asset.nextMaint && asset.nextMaint !== 'N/A' ? asset.nextMaint : date;
      asset.nextMaint = nextMaint;
    }
    if (nextCal && updCal) {
      asset.lastCal = asset.nextCal && asset.nextCal !== 'N/A' ? asset.nextCal : date;
      asset.nextCal = nextCal;
    }
    if (certExpiry && updCert) asset.certExpiry = certExpiry;

    const afterVal = $('#ahAfter')?.value || '';
    if (afterVal) {
      // Try to extract a clean status keyword from the suggestion (first word before ·)
      const cleanStatus = afterVal.split('·')[0].trim();
      // Only update status field with a known status keyword
      const knownStatuses = ['available','in-use','maintenance','out-of-service','disposed'];
      if (knownStatuses.includes(cleanStatus)) asset.status = cleanStatus;
    }
    if (action === 'Transfer' && projectId && projectId !== 'N/A') asset.projectId = projectId;
    if (action === 'Deployment' && projectId && projectId !== 'N/A') asset.projectId = projectId;
  }

  AppState.save();
  closeModal('genericModal');
  if (typeof renderMlHistory === 'function') renderMlHistory();
  showToast('History logged' + (attachment ? ' + attachment uploaded' : ''), 'success');
}


// ═══════════════════════════════════════════════════════════
// ── FIX #3: SOFT-DELETE + TRASH MODULE ───────────────────
// Records get _deleted:true flag instead of being removed
// 30-day retention before permanent delete
// ═══════════════════════════════════════════════════════════

const SOFT_DELETE_RETENTION_DAYS = 30;

// Mark a record as soft-deleted (used by new delete handlers)

// ═══════════════════════════════════════════════════════════════════════
// ── TIER 1 + 3 HARDENING MODULE ───────────────────────────────────────
// Diagnostics · Version banner · Reset · Audit log · Error boundary
// Pre-sync snapshot · Daily SP backup
// ═══════════════════════════════════════════════════════════════════════

const HARDENING_VERSION = '5.0.0';
const HARDENING_BUILD_DATE = '2026-06-17';

// ── 1. AUDIT LOG ──────────────────────────────────────────
// Captures sync events, errors, conflicts, ID renames, deletes, restores.
// Audit log persistence lives in the Audit facade (lib/audit.js).
// This wrapper preserves the (category, message, details) call shape
// used across masterlist.js / prospects.js / deletionRequests.js.
const AUDIT_LOG_KEY = 'shic_audit_log'; // kept for legacy readers
const AUDIT_LOG_MAX = 500;
Object.defineProperty(window, '_auditLog', { get: () => Audit.all(), configurable: true });

function auditLog(...args) { Audit.record(...args); }
auditLog('boot', 'App loaded v' + HARDENING_VERSION);

// ── 2. GLOBAL ERROR BOUNDARY ──────────────────────────────
// Catches uncaught errors and promise rejections → toast + audit log
window.addEventListener('error', (e) => {
  try {
    const msg = e?.error?.message || e?.message || 'Unknown error';
    const stack = e?.error?.stack || '';
    auditLog('error', msg, { stack: stack.substring(0, 1000), file: e.filename, line: e.lineno });
    // Show friendly toast (avoid loops by not toasting on the toast itself)
    if (typeof showToast === 'function' && !msg.includes('showToast')) {
      showToast('Something went wrong. Check Diagnostics → Audit Log for details.', 'error', 5000);
    }
  } catch(_) {}
});
window.addEventListener('unhandledrejection', (e) => {
  try {
    const msg = e?.reason?.message || String(e?.reason || 'Unhandled promise rejection');
    auditLog('error', msg, { stack: (e?.reason?.stack || '').substring(0, 1000), type: 'promise' });
    if (typeof showToast === 'function' && !msg.includes('SP') && !msg.includes('Graph')) {
      showToast('An operation failed. Check Diagnostics for details.', 'warning', 4000);
    }
  } catch(_) {}
});

// ── 3. VERSION BANNER ─────────────────────────────────────
// Bottom-right pill showing version + last sync time
function _ensureVersionBanner() {
  if (document.getElementById('versionBanner')) return;
  const banner = document.createElement('div');
  banner.id = 'versionBanner';
  banner.style.cssText = 'position:fixed;bottom:8px;right:12px;background:rgba(13,17,23,.85);backdrop-filter:blur(8px);color:var(--text-muted);padding:5px 10px;border-radius:14px;font-size:9px;font-family:var(--font-mono);z-index:998;border:1px solid var(--border);cursor:pointer;transition:all .2s;opacity:.6;display:flex;align-items:center;gap:6px';
  banner.title = 'Click to open Diagnostics';
  banner.onclick = () => navigate('settings').then ? navigate('settings').then(()=>setTimeout(showDiagnostics,200)) : (navigate('settings'), setTimeout(showDiagnostics, 300));
  banner.onmouseenter = () => { banner.style.opacity = '1'; };
  banner.onmouseleave = () => { banner.style.opacity = '.6'; };
  document.body.appendChild(banner);
  _updateVersionBanner();
  setInterval(_updateVersionBanner, 30000);
}
function _updateVersionBanner() {
  const b = document.getElementById('versionBanner');
  if (!b) return;
  let syncInfo = '';
  if (typeof _syncLastTs !== 'undefined' && _syncLastTs) {
    const ago = Math.floor((Date.now() - _syncLastTs) / 1000);
    if (ago < 60) syncInfo = ' · synced ' + ago + 's ago';
    else if (ago < 3600) syncInfo = ' · synced ' + Math.floor(ago/60) + 'm ago';
    else syncInfo = ' · synced ' + Math.floor(ago/3600) + 'h ago';
  }
  b.innerHTML = '<span style="color:var(--accent-blue);font-weight:700">v' + HARDENING_VERSION + '</span>' + syncInfo;
}
setTimeout(_ensureVersionBanner, 500);

// ── 4. PRE-SYNC SNAPSHOT (Tier 3 #9) ──────────────────────
// Saves AppState.data before every sync. If next load detects corruption
// (e.g., empty arrays where there shouldn't be), offers restore.
const PRESYNC_KEY = 'shic_presync_backup';
function _savePreSyncSnapshot() {
  try {
    // Only snapshot the arrays needed for corruption detection — not full AppState
    // This keeps the backup small enough to avoid localStorage quota errors
    const keys = ['projects','tasks','equipment','tools','vehicles','consumables','manpower'];
    const slim = {};
    keys.forEach(k => { if (AppState.data[k]?.length) slim[k] = AppState.data[k].length; });
    const snap = {
      ts: Date.now(),
      iso: new Date().toISOString(),
      counts: slim, // store counts only, not full arrays
      version: HARDENING_VERSION,
    };
    localStorage.setItem(PRESYNC_KEY, JSON.stringify(snap));
  } catch(e) {
    // Quota exceeded — silently skip, sync continues normally
  }
}
function _detectDataCorruption() {
  // Heuristic: if previously had data and now everything is empty
  try {
    const snap = JSON.parse(localStorage.getItem(PRESYNC_KEY) || 'null');
    if (!snap) return null;
    const arrays = ['projects','tasks','equipment','tools','vehicles','consumables','manpower'];
    // Support both slim (counts only) and legacy (full data) snapshot formats
    const prevTotal = snap.counts
      ? Object.values(snap.counts).reduce((s, v) => s + v, 0)
      : arrays.reduce((s, k) => s + (snap.data?.[k]?.length || 0), 0);
    const currTotal = arrays.reduce((s, k) => s + (AppState.data[k]?.length || 0), 0);
    // Skip check if SP is connected — data lives in SP lists and may not be in local AppState yet
    if (typeof _spConnected !== 'undefined' && _spConnected) return null;
    // Skip check if snapshot is very recent (< 2 min) — SP pull may still be in progress
    if (snap.ts && (Date.now() - snap.ts) < 120000) return null;
    // If previous had >50 records and current has 0, something's wrong
    if (prevTotal > 50 && currTotal === 0) {
      return { snap, prevTotal, currTotal };
    }
    return null;
  } catch(e) { return null; }
}
function _offerRestoreSnapshot() {
  const corruption = _detectDataCorruption();
  if (!corruption) return false;
  const ageMin = Math.floor((Date.now() - corruption.snap.ts) / 60000);
  if (confirm(
    '⚠ Possible data corruption detected\n\n' +
    'Your local data appears to have been wiped.\n' +
    'Previous snapshot has ' + corruption.prevTotal + ' records (from ' + ageMin + ' minutes ago).\n' +
    'Current state has ' + corruption.currTotal + ' records.\n\n' +
    'Restore from snapshot?'
  )) {
    AppState.data = corruption.snap.data;
    AppState.save();
    auditLog('restore', 'Restored from pre-sync snapshot', { prevTotal: corruption.prevTotal });
    location.reload();
    return true;
  }
  return false;
}
// Delay check by 15s to give SP sync time to load data before evaluating
setTimeout(() => { try { _offerRestoreSnapshot(); } catch(e) {} }, 15000);

// Hook pre-sync snapshot into spPushData
(function hookPreSyncSnapshot() {
  if (typeof spPushData !== 'function' || spPushData._presyncHooked) return;
  spPushData._presyncHooked = true;
  const orig = window.spPushData;
  window.spPushData = async function(...args) {
    try { _savePreSyncSnapshot(); } catch(e) {}
    return await orig.apply(this, args);
  };
})();

// ── 5. DAILY BACKUP TO SHAREPOINT (Tier 3 #10) ───────────
// Once per day per user, push full AppState.data to SHIC_Documents/Backups/
const DAILY_BACKUP_KEY = 'shic_last_backup_date';
async function _runDailyBackup() {
  try {
    // Use LOCAL date, not UTC — otherwise PHT users get double backups around midnight UTC
    const d = new Date();
    const today = d.getFullYear() + '-' +
                  String(d.getMonth() + 1).padStart(2, '0') + '-' +
                  String(d.getDate()).padStart(2, '0');
    const lastBackup = localStorage.getItem(DAILY_BACKUP_KEY);
    if (lastBackup === today) return; // already done today (in user's local timezone)
    if (typeof _spConnected === 'undefined' || !_spConnected) return;
    if (typeof getSpToken !== 'function') return;
    const token = await getSpToken();
    if (!token || !_spSiteId) return;

    // Build backup JSON
    const backup = {
      version: HARDENING_VERSION,
      backupDate: today,
      backedUpAt: new Date().toISOString(),
      backedUpBy: _currentUserProfile?.email || _currentUser?.email || 'unknown',
      recordCounts: {},
      data: AppState.data,
    };
    ['projects','tasks','costs','qaqc','risks','actions','documents','libraryDocs',
     'resourceAllocations','resourceUsageLogs','dailyMeetingLogs','procurement',
     'materials','manpower','equipment','tools','vehicles','consumables','thirdParty',
     'assetHistory'].forEach(k => {
      backup.recordCounts[k] = (AppState.data[k] || []).length;
    });

    const fileName = 'backup-' + today + '-' + (_currentUserProfile?.email || 'unknown').split('@')[0] + '.json';
    // Create a File (not Blob) — spUploadFile reads file.name property
    const file = new File(
      [JSON.stringify(backup, null, 2)],
      fileName,
      { type: 'application/json' }
    );

    // Upload — spUploadFile signature is (file, projectId) where projectId becomes the subfolder
    if (typeof spUploadFile === 'function') {
      const result = await spUploadFile(file, 'Backups');
      localStorage.setItem(DAILY_BACKUP_KEY, today);
      auditLog('backup', 'Daily backup uploaded', { fileName, sizeKB: Math.round(file.size / 1024), webUrl: result?.webUrl });
      console.log('[Backup] Daily backup uploaded: ' + fileName);
    }
  } catch(e) {
    auditLog('error', 'Daily backup failed: ' + e.message);
    console.warn('[Backup] Failed:', e.message);
  }
}
// Run on login (after data load + SP connection) — defer 30s to avoid blocking startup
setTimeout(_runDailyBackup, 30000);

// ── 6. DIAGNOSTICS PANEL ──────────────────────────────────
function showDiagnostics() {
  const counts = {};
  const arrays = ['projects','tasks','costs','qaqc','risks','actions','documents','libraryDocs',
    'resourceAllocations','resourceUsageLogs','dailyMeetingLogs','procurement','procurementLogs',
    'materials','manpower','equipment','tools','vehicles','consumables','thirdParty',
    'assetHistory','assetUtilization','idChangeRequests','notifications','activities','projectIdHistory'];
  arrays.forEach(k => { counts[k] = (AppState.data[k] || []).length; });

  const pending = (typeof _getPendingItems === 'function') ? _getPendingItems() : [];
  const editingNow = (typeof _editingRecords !== 'undefined') ? Object.keys(_editingRecords).reduce((s, k) => s + Object.keys(_editingRecords[k]||{}).length, 0) : 0;
  const failedLists = (typeof _getFailedLists === 'function') ? _getFailedLists() : [];
  const lsSize = (() => {
    try {
      let total = 0;
      for (const k in localStorage) total += (localStorage[k]?.length || 0);
      return Math.round(total / 1024);
    } catch(e) { return 0; }
  })();

  const recentLog = _auditLog.slice(-50).reverse();
  const errorCount = _auditLog.filter(e => e.category === 'error').length;
  const conflictCount = _auditLog.filter(e => e.category === 'conflict' || e.category === 'collision').length;

  $('#genericModalTitle').textContent = 'Diagnostics';
  $('#genericModalBody').innerHTML = `
    <div style="max-height:65vh;overflow-y:auto">

      <!-- HEADER STATUS -->
      <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-bottom:14px">
        <div style="padding:8px 10px;background:var(--bg-hover);border-radius:7px">
          <div style="font-size:9px;color:var(--text-muted);letter-spacing:1px">VERSION</div>
          <div style="font-size:13px;font-weight:700;color:var(--accent-blue)">v${HARDENING_VERSION}</div>
        </div>
        <div style="padding:8px 10px;background:var(--bg-hover);border-radius:7px">
          <div style="font-size:9px;color:var(--text-muted);letter-spacing:1px">SYNC STATE</div>
          <div style="font-size:13px;font-weight:700;color:${_syncState==='synced'?'var(--accent-green)':_syncState==='pending'?'var(--accent-amber)':_syncState==='error'?'var(--accent-red)':'var(--text-muted)'}">${(typeof _syncState !== 'undefined' ? _syncState : 'unknown').toUpperCase()}</div>
        </div>
        <div style="padding:8px 10px;background:var(--bg-hover);border-radius:7px">
          <div style="font-size:9px;color:var(--text-muted);letter-spacing:1px">PENDING</div>
          <div style="font-size:13px;font-weight:700;color:${pending.length>0?'var(--accent-amber)':'var(--accent-green)'}">${pending.length}</div>
        </div>
        <div style="padding:8px 10px;background:var(--bg-hover);border-radius:7px">
          <div style="font-size:9px;color:var(--text-muted);letter-spacing:1px">STORAGE</div>
          <div style="font-size:13px;font-weight:700">${lsSize} KB</div>
        </div>
      </div>

      <!-- ACTIONS -->
      <div style="display:flex;gap:7px;flex-wrap:wrap;margin-bottom:14px">
        <button class="btn btn-primary btn-sm" onclick="_diagExportBundle()"><i class="fas fa-download"></i> Export Bundle</button>
        <button class="btn btn-secondary btn-sm" onclick="_diagViewLog()"><i class="fas fa-list"></i> Full Audit Log</button>
        <button class="btn btn-secondary btn-sm" onclick="_diagForceReSnapshot()"><i class="fas fa-camera"></i> Reset Baseline</button>
        <button class="btn btn-danger btn-sm" onclick="_diagResetToFresh()"><i class="fas fa-exclamation-triangle"></i> Reset to Fresh</button>
        <button class="btn btn-secondary btn-sm" onclick="_runDailyBackup().then(()=>showToast('Backup triggered','info'))" title="Force daily backup now"><i class="fas fa-shield"></i> Backup Now</button>
      </div>

      <!-- RECORD COUNTS -->
      <details open style="margin-bottom:10px">
        <summary style="cursor:pointer;font-weight:700;font-size:12px;padding:8px 12px;background:var(--bg-hover);border-radius:7px">📊 Record Counts</summary>
        <div style="padding:10px;display:grid;grid-template-columns:repeat(3,1fr);gap:6px;font-size:11px">
          ${Object.entries(counts).filter(([k,v])=>v>0).map(([k,v]) => `<div style="display:flex;justify-content:space-between;padding:4px 8px;background:var(--bg-hover);border-radius:4px"><span style="color:var(--text-muted)">${k}</span><strong>${v}</strong></div>`).join('')}
        </div>
      </details>

      <!-- SYNC INTERNALS -->
      <details style="margin-bottom:10px">
        <summary style="cursor:pointer;font-weight:700;font-size:12px;padding:8px 12px;background:var(--bg-hover);border-radius:7px">🔄 Sync Internals</summary>
        <div style="padding:10px;font-size:10px;font-family:var(--font-mono)">
          <div>_spConnected: <strong>${typeof _spConnected !== 'undefined' ? _spConnected : 'undefined'}</strong></div>
          <div>_spLastWriteTs: <strong>${typeof _spLastWriteTs !== 'undefined' ? new Date(_spLastWriteTs).toISOString() : '-'}</strong></div>
          <div>_syncLastTs: <strong>${typeof _syncLastTs !== 'undefined' && _syncLastTs ? new Date(_syncLastTs).toISOString() : '-'}</strong></div>
          <div>_syncLastError: <strong style="color:var(--accent-red)">${typeof _syncLastError !== 'undefined' ? _syncLastError : '-'}</strong></div>
          <div>_syncLastRenamed: <strong>${typeof _syncLastRenamed !== 'undefined' ? _syncLastRenamed : 0}</strong></div>
          <div>_spListIdMaps: <strong>${typeof _spListIdMaps !== 'undefined' ? Object.keys(_spListIdMaps).length + ' lists' : '-'}</strong></div>
          <div>Active edits: <strong>${editingNow}</strong></div>
          <div>Failed lists (last 10 min): <strong style="color:${failedLists.length>0?'var(--accent-red)':'var(--text-muted)'}">${failedLists.length}${failedLists.length>0?' — '+failedLists.map(f=>f.list).join(', '):''}</strong></div>
        </div>
      </details>

      <!-- RECENT AUDIT LOG -->
      <details ${errorCount > 0 ? 'open' : ''}>
        <summary style="cursor:pointer;font-weight:700;font-size:12px;padding:8px 12px;background:var(--bg-hover);border-radius:7px">📋 Recent Activity <span style="font-weight:400;color:var(--text-muted);font-size:10px">· ${_auditLog.length} entries · ${errorCount} errors · ${conflictCount} conflicts</span></summary>
        <div style="padding:10px;max-height:240px;overflow-y:auto">
          ${recentLog.slice(0, 30).map(e => {
            const colors = { error:'#f85149', conflict:'#f0a450', collision:'#f0a450', sync:'#388bfd', boot:'#8b949e', backup:'#3fb950', restore:'#3fb950', reset:'#bc8cff', delete:'#f85149', auth:'#388bfd' };
            const c = colors[e.category] || '#8b949e';
            return `<div style="padding:6px 8px;border-left:2px solid ${c};margin-bottom:4px;font-size:10px;background:var(--bg-hover)">
              <div style="display:flex;justify-content:space-between;align-items:center">
                <span style="color:${c};font-weight:700;text-transform:uppercase;font-size:9px">${e.category}</span>
                <span style="color:var(--text-muted);font-size:9px">${new Date(e.ts).toLocaleString()}</span>
              </div>
              <div style="margin-top:2px">${e.message}</div>
              ${e.details ? `<details style="margin-top:3px"><summary style="cursor:pointer;font-size:9px;color:var(--text-muted)">details</summary><pre style="font-size:9px;background:rgba(0,0,0,.3);padding:5px;border-radius:3px;margin-top:3px;overflow-x:auto">${JSON.stringify(e.details, null, 2).substring(0, 400)}</pre></details>` : ''}
            </div>`;
          }).join('')}
        </div>
      </details>
    </div>
  `;
  $('#genericModalFooter').innerHTML = `<button class="btn btn-secondary" onclick="closeModal('genericModal')">Close</button>`;
  openModal('genericModal');
}

function _diagExportBundle() {
  const bundle = {
    exported: new Date().toISOString(),
    version: HARDENING_VERSION,
    user: _currentUserProfile?.email || 'unknown',
    syncState: {
      _spConnected: typeof _spConnected !== 'undefined' ? _spConnected : null,
      _syncState: typeof _syncState !== 'undefined' ? _syncState : null,
      _spLastWriteTs: typeof _spLastWriteTs !== 'undefined' ? _spLastWriteTs : null,
      _syncLastTs: typeof _syncLastTs !== 'undefined' ? _syncLastTs : null,
      _syncLastError: typeof _syncLastError !== 'undefined' ? _syncLastError : null,
      _spDataHash: typeof _spDataHash !== 'undefined' ? _spDataHash : null,
    },
    recordCounts: {},
    pendingItems: typeof _getPendingItems === 'function' ? _getPendingItems() : [],
    auditLog: _auditLog,
    editingRecords: typeof _editingRecords !== 'undefined' ? _editingRecords : null,
  };
  ['projects','tasks','costs','qaqc','risks','actions','documents','libraryDocs',
   'resourceAllocations','resourceUsageLogs','dailyMeetingLogs','procurement',
   'materials','manpower','equipment','tools','vehicles','consumables','thirdParty',
   'assetHistory'].forEach(k => {
    bundle.recordCounts[k] = (AppState.data[k] || []).length;
  });
  const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'shic-diagnostics-' + new Date().toISOString().split('T')[0] + '.json';
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
  showToast('Diagnostics bundle downloaded', 'success');
}

function _diagViewLog() {
  $('#genericModalTitle').textContent = 'Full Audit Log (' + _auditLog.length + ' entries)';
  const logs = [..._auditLog].reverse();
  $('#genericModalBody').innerHTML = `
    <div style="max-height:65vh;overflow-y:auto;font-family:var(--font-mono);font-size:10px">
      ${logs.map(e => {
        const colors = { error:'#f85149', conflict:'#f0a450', collision:'#f0a450', sync:'#388bfd', boot:'#8b949e', backup:'#3fb950', restore:'#3fb950', reset:'#bc8cff' };
        const c = colors[e.category] || '#8b949e';
        return `<div style="padding:6px 10px;border-left:3px solid ${c};margin-bottom:4px;background:var(--bg-hover)">
          <div style="color:var(--text-muted);font-size:9px">${e.iso} · ${e.user}</div>
          <div><span style="color:${c};font-weight:700">[${e.category}]</span> ${e.message}</div>
          ${e.details ? `<pre style="font-size:9px;background:rgba(0,0,0,.3);padding:5px;border-radius:3px;margin-top:3px;overflow-x:auto">${JSON.stringify(e.details, null, 2).substring(0, 600)}</pre>` : ''}
        </div>`;
      }).join('')}
    </div>
  `;
  $('#genericModalFooter').innerHTML = `
    <button class="btn btn-secondary" onclick="_clearAuditLog()" style="color:var(--accent-red)"><i class="fas fa-trash"></i> Clear Log</button>
    <button class="btn btn-secondary" onclick="showDiagnostics()">Back</button>`;
  openModal('genericModal');
}

function _clearAuditLog() {
  if (!confirm('Clear all audit log entries? This is irreversible.')) return;
  Audit.clear();
  showToast('Audit log cleared', 'warning');
  showDiagnostics();
}

function _diagForceReSnapshot() {
  if (!confirm('Reset sync baseline?\n\nThis tells the app that the current local state IS the latest synced state. Use this if the sync indicator is stuck on amber despite no actual changes.')) return;
  try {
    if (typeof _captureSyncedSnapshot === 'function') _captureSyncedSnapshot();
    auditLog('reset', 'Sync baseline manually reset');
    if (typeof updateSyncStatusButton === 'function') updateSyncStatusButton();
    showToast('Sync baseline reset', 'success');
  } catch(e) {
    showToast('Failed: ' + e.message, 'error');
  }
}

async function _diagResetToFresh() {
  if (!confirm(
    '⚠ RESET TO FRESH STATE ⚠\n\n' +
    'This will:\n' +
    '• Clear all local data (cache)\n' +
    '• Re-download everything from SharePoint\n' +
    '• Discard any unsynced changes\n\n' +
    'Use ONLY when local data is corrupted.\n\n' +
    'Continue?'
  )) return;
  if (!confirm('Last warning: ALL unsynced changes will be LOST. Continue?')) return;

  try {
    auditLog('reset', 'User initiated reset to fresh state');
    // Save pre-reset snapshot in case user wants to recover
    _savePreSyncSnapshot();
    // Clear local data
    AppState.data = getDefaultData();
    AppState.save();
    // Clear sync state
    if (typeof _spDataHash !== 'undefined') _spDataHash = '';
    if (typeof _spLastWriteTs !== 'undefined') _spLastWriteTs = 0;
    if (typeof _spListIdMaps !== 'undefined') Object.keys(_spListIdMaps).forEach(k => delete _spListIdMaps[k]);
    if (typeof _lastSyncedSnapshot !== 'undefined') _lastSyncedSnapshot = {};
    showToast('Local data cleared. Pulling fresh from SharePoint...', 'info', 3000);
    closeModal('genericModal');
    // Trigger fresh pull
    if (typeof spPullData === 'function') {
      await spPullData();
      auditLog('reset', 'Fresh pull from SharePoint completed');
      showToast('Reset complete · fresh data loaded', 'success', 4000);
    } else {
      location.reload();
    }
  } catch(e) {
    auditLog('error', 'Reset to fresh failed: ' + e.message);
    showToast('Reset failed: ' + e.message + ' · refreshing page', 'error', 4000);
    setTimeout(() => location.reload(), 2000);
  }
}

// ── 7. HOOK AUDIT LOG INTO KEY EVENTS ─────────────────────
// Wrap sync/push/pull to log events
setTimeout(() => {
  try {
    if (typeof _doFullSync === 'function' && !_doFullSync._auditHooked) {
      _doFullSync._auditHooked = true;
      const orig = _doFullSync;
      window._doFullSync = async function() {
        auditLog('sync', 'Full sync started');
        const before = Date.now();
        try {
          await orig.apply(this, arguments);
          auditLog('sync', 'Full sync completed in ' + (Date.now() - before) + 'ms', { renamed: _syncLastRenamed });
        } catch(e) {
          auditLog('error', 'Sync failed: ' + e.message);
          throw e;
        }
      };
    }
    if (typeof _showIdRenameSummary === 'function' && !_showIdRenameSummary._auditHooked) {
      _showIdRenameSummary._auditHooked = true;
      const orig = _showIdRenameSummary;
      window._showIdRenameSummary = function(renamed) {
        auditLog('collision', renamed.length + ' record(s) renumbered for ID collision', { renamed: renamed.map(r => ({ from: r.oldId, to: r.newId, type: r.arrayKey })) });
        return orig.apply(this, arguments);
      };
    }
  } catch(e) { console.warn('[Audit] Hook setup failed:', e.message); }
}, 1500);

// ── 8. SETTINGS PANEL ENTRY ───────────────────────────────
// Add Diagnostics button to Settings page
function _injectDiagnosticsButton() {
  // Check if Settings page has been rendered and add the button there
  const settingsEl = document.getElementById('settings');
  if (!settingsEl || !settingsEl.querySelector || settingsEl.querySelector('#diagPanelBtn')) return;
  const sectionHeader = settingsEl.querySelector('.section-header');
  if (!sectionHeader) return;
  const btnArea = sectionHeader.querySelector('div:last-child') || sectionHeader;
  if (btnArea.querySelector('#diagPanelBtn')) return;
  const btn = document.createElement('button');
  btn.id = 'diagPanelBtn';
  btn.className = 'btn btn-secondary btn-sm';
  btn.innerHTML = '<i class="fas fa-stethoscope"></i> Diagnostics';
  btn.style.cssText = 'background:rgba(188,140,255,.12);border-color:rgba(188,140,255,.4);color:#bc8cff';
  btn.onclick = showDiagnostics;
  btnArea.appendChild(btn);
}
// Re-inject after each render
const _origNavigate = typeof navigate === 'function' ? navigate : null;
if (_origNavigate) {
  setTimeout(() => {
    document.addEventListener('click', (e) => {
      if (e.target?.closest && e.target.closest('[onclick*="navigate(\'settings\')"]')) {
        setTimeout(_injectDiagnosticsButton, 200);
      }
    });
  }, 1000);
}
// Also try after render
setInterval(() => {
  try {
    if (AppState.currentPage === 'settings') _injectDiagnosticsButton();
  } catch(e) {}
}, 2000);

// ── 9. COMMAND PALETTE INTEGRATION ────────────────────────
// Add Diagnostics to Cmd+K palette if it exists
setTimeout(() => {
  try {
    if (typeof commandPaletteItems !== 'undefined' && Array.isArray(commandPaletteItems)) {
      commandPaletteItems.push({
        label: 'Diagnostics',
        icon: 'fas fa-stethoscope',
        keywords: 'diagnostics debug audit log error troubleshoot health',
        fn: showDiagnostics,
      });
    }
  } catch(e) {}
}, 2000);

console.log('[Hardening] Tier 1 + 3 module loaded · v' + HARDENING_VERSION);

function softDelete(arrayKey, id) {
  const list = AppState.data[arrayKey] || [];
  const idx = list.findIndex(r => r && r.id === id);
  if (idx === -1) return false;
  const r = list[idx];
  r._deleted = true;
  r._deletedAt = new Date().toISOString();
  r._deletedBy = _currentUserProfile?.name || _currentUser?.email || 'unknown';
  if (typeof _spTrackDeletion === 'function') _spTrackDeletion(arrayKey, id);
  return true;
}

// Restore a soft-deleted record
function restoreFromTrash(arrayKey, id) {
  const list = AppState.data[arrayKey] || [];
  const r = list.find(x => x && x.id === id);
  if (!r) return false;
  delete r._deleted;
  delete r._deletedAt;
  delete r._deletedBy;
  return true;
}

// Permanently remove a soft-deleted record (admin only or after retention)
// Uses _purged flag instead of hard-delete so sync doesn't re-add it from remote
function purgeFromTrash(arrayKey, id) {
  if (!AppState.data[arrayKey]) return false;
  const rec = AppState.data[arrayKey].find(r => r && r.id === id);
  if (!rec) return false;
  rec._purged = true;
  rec._purgedAt = new Date().toISOString();
  return true;
}

// Filter active (non-deleted) records — used by getActive() helper
function getActive(arrayKey) {
  return (AppState.data[arrayKey] || []).filter(r => r && !r._deleted);
}

// Filter deleted records (for Trash view) — excludes already-purged records
function getTrashed(arrayKey) {
  return (AppState.data[arrayKey] || []).filter(r => r && r._deleted && !r._purged);
}

// Auto-purge records older than retention (run on app start)
function autoPurgeOldTrash() {
  const cutoff = Date.now() - (SOFT_DELETE_RETENTION_DAYS * 24 * 60 * 60 * 1000);
  let purged = 0;
  const arrays = ['projects','tasks','costs','qaqc','risks','actions','documents','libraryDocs',
    'resourceAllocations','resourceUsageLogs','dailyMeetingLogs','procurement','procurementLogs',
    'materials','manpower','equipment','tools','vehicles','consumables','thirdParty',
    'assetHistory','assetUtilization'];
  arrays.forEach(k => {
    if (!AppState.data[k]) return;
    AppState.data[k].forEach(r => {
      if (!r || !r._deleted || r._purged) return;
      const t = new Date(r._deletedAt || 0).getTime();
      if (t <= cutoff) { r._purged = true; r._purgedAt = new Date().toISOString(); purged++; }
    });
  });
  if (purged > 0) {
    console.log('[Trash] Auto-purged ' + purged + ' records older than ' + SOFT_DELETE_RETENTION_DAYS + ' days');
  }
}

// ── Trash module renderer ─────────────────────────────────