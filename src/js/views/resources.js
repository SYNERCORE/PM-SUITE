function _syncResourceStatuses(){} // stub — resource status sync not yet implemented
let resTab='personnel';
function renderResources(){
  _syncResourceStatuses();
const tabs=[
{id:'personnel',label:'Personnel',icon:'fa-users'},
{id:'equipment',label:'Equipment',icon:'fa-cog'},
{id:'tools',label:'Tools',icon:'fa-wrench'},
{id:'vehicles',label:'Vehicles',icon:'fa-truck'},
{id:'consumables',label:'Consumables',icon:'fa-boxes'},
{id:'thirdparty',label:'Third Party',icon:'fa-handshake'},
{id:'utilization',label:'Utilization Log',icon:'fa-chart-bar'},
{id:'tracking',label:'Resource Tracking',icon:'fa-map-marker-alt'},
{id:'history',label:'Asset History',icon:'fa-history'},
];
const d=AppState.data;
const allRes=[...(d.equipment||[]),...(d.tools||[]),...(d.vehicles||[])];
const avail=allRes.filter(r=>r.status==='available').length;
const inuse=allRes.filter(r=>r.status==='in-use').length;
const maint=allRes.filter(r=>r.status==='maintenance').length;
const expSoon=allRes.filter(r=>r.certExpiry&&r.certExpiry!=='N/A'&&daysBetween(new Date().toISOString().split('T')[0],r.certExpiry)<60).length;
$('#resources').innerHTML=`
<div class="section-header" style="margin-bottom:14px">
<div><div class="section-title">Resource Management</div><div class="section-sub">Personnel · Equipment · Tools · Vehicles · Consumables · Third Party</div></div>
</div>
<div class="grid grid-4" style="margin-bottom:14px">
${sc('fas fa-users','Personnel',(d.resources||[]).length,'Team members','#388bfd','rgba(56,139,253,.15)')}
${sc('fas fa-check-circle','Available',avail,'Ready for deployment','#3fb950','rgba(63,185,80,.15)')}
${sc('fas fa-hard-hat','In Use',inuse,'Currently deployed','#f0a450','rgba(240,164,80,.15)')}
${sc('fas fa-tools','Maintenance',maint+(expSoon>0?' | '+expSoon+' cert expiring':''),'Needs attention','#f85149','rgba(248,81,73,.15)')}
</div>
<div class="tabs" style="margin-bottom:16px">
${tabs.map(t=>`<div class="tab ${resTab===t.id?'active':''}" onclick="resTab='${t.id}';renderResTab()"><i class="fas ${t.icon}" style="margin-right:5px"></i>${t.label}</div>`).join('')}
</div>
<div id="resTabContent"></div>`;
renderResTab();}

function renderResTab(){
const map={personnel:renderPersonnelTab,equipment:renderEquipmentTab,tools:renderToolsTab,vehicles:renderVehiclesTab,consumables:renderConsumablesTab,thirdparty:renderThirdPartyTab,utilization:renderUtilizationTab,tracking:renderTrackingTab,history:renderResHistoryTab};
if(map[resTab])map[resTab]();}

function renderPersonnelTab(){
const resources=AppState.data.resources||[];
const avgUtil=resources.length?Math.round(resources.reduce((s,r)=>s+r.utilization,0)/resources.length):0;
$('#resTabContent').innerHTML=`
<div class="grid grid-4" style="margin-bottom:14px">
${sc('fas fa-users','Total Personnel',resources.length,'All team members','#388bfd','rgba(56,139,253,.15)')}
${sc('fas fa-chart-bar','Avg Utilization',avgUtil+'%',resources.filter(r=>r.utilization>80).length+' overloaded','#f0a450','rgba(240,164,80,.15)')}
${sc('fas fa-check-circle','Available',resources.filter(r=>r.availability==='available').length,'Ready to assign','#3fb950','rgba(63,185,80,.15)')}
${sc('fas fa-times-circle','Unavailable',resources.filter(r=>r.availability==='unavailable').length,'Not available','#f85149','rgba(248,81,73,.15)')}
</div>
<div class="card" style="margin-bottom:14px"><div class="card-title">Utilization by Person</div><canvas id="resChart" height="70" style="width:100%"></canvas></div>
<div class="card"><div class="table-wrap"><table>
<thead><tr><th>Resource</th><th>Role</th><th>Dept</th><th>Skills</th><th>Certifications</th><th>Utilization</th><th>Availability</th><th>Rate/Day</th></tr></thead>
<tbody>${_pgSlice("resources",resources).map(r=>`<tr>
<td><div style="display:flex;align-items:center;gap:7px">${avatarH(r.name)}<div><div style="font-weight:500;font-size:12px">${esc(r.name)}</div><div style="font-size:10px;color:var(--text-secondary)">${esc(r.id)}</div></div></div></td>
<td style="font-size:11px">${r.role}</td><td style="font-size:11px">${r.dept}</td>
<td>${r.skills.slice(0,2).map(s=>`<span class="chip" style="margin:1px;font-size:9px">${s}</span>`).join('')}</td>
<td>${r.certifications.map(c=>`<span class="badge badge-purple" style="margin:1px;font-size:9px">${c}</span>`).join('')}</td>
<td><div style="display:flex;align-items:center;gap:6px;min-width:90px"><div class="progress-bar" style="flex:1;height:5px"><div class="progress-fill" style="width:${r.utilization}%;background:${r.utilization>90?'var(--accent-red)':r.utilization>70?'var(--accent-amber)':'var(--accent-green)'}"></div></div><span style="font-size:11px;font-family:var(--font-mono)">${r.utilization}%</span></div></td>
<td><span class="badge ${r.availability==='available'?'badge-green':r.availability==='busy'?'badge-amber':'badge-red'}">${r.availability}</span></td>
<td style="font-size:11px;font-family:var(--font-mono)">₱${(r.hourlyRate*8).toLocaleString()}</td>
</tr>`).join('')}</tbody></table>${_pgNav("costs",costs,typeof renderCostControl==="function"?renderCostControl:null)}</div></div>`;
setTimeout(()=>{const c=$('#resChart');if(c){c.width=c.parentElement.offsetWidth-30;drawBar('resChart',resources.map(r=>r.name.split(' ')[0]),resources.map(r=>r.utilization),'#388bfd');}},50);}

function resourceStatusBadge(s){
const m={available:'badge-green',busy:'badge-amber','in-use':'badge-blue',maintenance:'badge-red','out-of-service':'badge-red',standby:'badge-gray','low-stock':'badge-amber','in-stock':'badge-green','active':'badge-green'};
return`<span class="badge ${m[s]||'badge-gray'}">${s}</span>`;}

function certBadge(expiry){
if(!expiry||expiry==='N/A')return`<span class="badge badge-gray">N/A</span>`;
const days=daysBetween(new Date().toISOString().split('T')[0],expiry);
const col=days<0?'badge-red':days<60?'badge-amber':'badge-green';
const label=days<0?'Expired':days<60?`Exp soon (${days}d)`:expiry;
return`<span class="badge ${col}">${label}</span>`;}

function renderEquipmentTab(){
const eq=AppState.data.equipment||[];
$('#resTabContent').innerHTML=`
<div class="section-header" style="margin-bottom:12px">
<div class="section-title">Equipment Register (${eq.length})</div>
<button class="btn btn-primary btn-sm" onclick="showAddAsset('equipment')"><i class="fas fa-plus"></i> Add Equipment</button></div>
<div class="card"><div class="table-wrap"><table>
<thead><tr><th>ID</th><th>Name</th><th>Category</th><th>Make/Model</th><th>Serial No.</th><th>Project</th><th>Location</th><th>Status</th><th>Next Maintenance</th><th>Next Calibration</th><th>Certification</th><th>Cert Expiry</th><th>Daily Rate</th><th></th></tr></thead>
<tbody>${eq.map(r=>assetRow(r)).join('')||noData('Equipment','fa-cog')}</tbody>
</table></div></div>`;}

function renderToolsTab(){
const tools=AppState.data.tools||[];
$('#resTabContent').innerHTML=`
<div class="section-header" style="margin-bottom:12px">
<div class="section-title">Tools Register (${tools.length})</div>
<button class="btn btn-primary btn-sm" onclick="showAddAsset('tools')"><i class="fas fa-plus"></i> Add Tool</button></div>
<div class="card"><div class="table-wrap"><table>
<thead><tr><th>ID</th><th>Name</th><th>Category</th><th>Make/Model</th><th>Serial No.</th><th>Project</th><th>Location</th><th>Status</th><th>Next Maintenance</th><th>Next Calibration</th><th>Cal. Body</th><th>Cert Expiry</th><th>Daily Rate</th><th></th></tr></thead>
<tbody>${tools.map(r=>assetRow(r)).join('')||noData('Tools','fa-wrench')}</tbody>
</table></div></div>`;}

function renderVehiclesTab(){
const veh=AppState.data.vehicles||[];
$('#resTabContent').innerHTML=`
<div class="section-header" style="margin-bottom:12px">
<div class="section-title">Vehicle Register (${veh.length})</div>
<button class="btn btn-primary btn-sm" onclick="showAddAsset('vehicles')"><i class="fas fa-plus"></i> Add Vehicle</button></div>
<div class="card"><div class="table-wrap"><table>
<thead><tr><th>ID</th><th>Name</th><th>Category</th><th>Make/Model</th><th>Reg. No.</th><th>Project</th><th>Location</th><th>Status</th><th>Next Maintenance</th><th>Registration</th><th>Cert/Permit</th><th>Cert Expiry</th><th>Daily Rate</th><th></th></tr></thead>
<tbody>${veh.map(r=>assetRow(r,true)).join('')||noData('Vehicles','fa-truck')}</tbody>
</table></div></div>`;}

function assetRow(r,isVeh=false){
const nextMaintDue=r.nextMaint&&r.nextMaint!=='N/A'&&daysBetween(new Date().toISOString().split('T')[0],r.nextMaint)<14;
return`<tr>
<td style="font-size:10px;font-family:var(--font-mono);font-weight:700">${r.id}</td>
<td><div style="font-weight:500;font-size:12px;min-width:140px">${esc(r.name)}</div><div style="font-size:9px;color:var(--text-secondary)">${esc(r.serialNo)}</div></td>
<td><span class="badge badge-gray">${r.category}</span></td>
<td style="font-size:11px;min-width:110px">${r.make} ${r.model}</td>
<td style="font-size:10px;font-family:var(--font-mono)">${isVeh?r.regNo:r.serialNo}</td>
<td><span class="badge badge-blue">${r.projectId}</span></td>
<td style="font-size:11px">${r.location}</td>
<td>${resourceStatusBadge(r.status)}</td>
<td style="font-size:11px;font-family:var(--font-mono);color:${nextMaintDue?'var(--accent-red)':'inherit'}">${r.nextMaint==='N/A'?'<span style="color:var(--text-muted)">N/A</span>':r.nextMaint}</td>
<td style="font-size:11px;font-family:var(--font-mono)">${r.nextCal==='N/A'?'<span style="color:var(--text-muted)">N/A</span>':r.nextCal}</td>
<td style="font-size:11px;max-width:120px">${r.cert==='N/A'?'<span style="color:var(--text-muted)">N/A</span>':r.cert}</td>
<td>${certBadge(r.certExpiry)}</td>
<td style="font-family:var(--font-mono);font-size:11px">₱${Number(r.dailyRate).toLocaleString()}</td>
<td><div style="display:flex;gap:3px;position:relative">
<button class="btn btn-secondary btn-sm btn-icon" onclick="showAssetDetail('${r.id}','${r.type.toLowerCase()}')" title="View detail & attachments"><i class="fas fa-paperclip"></i>${(r.attachments&&r.attachments.length)?`<span style="position:absolute;top:-4px;right:-4px;background:var(--accent-amber);color:#fff;font-size:8px;padding:1px 4px;border-radius:6px;font-weight:700">${r.attachments.length}</span>`:''}</button>
<button class="btn btn-secondary btn-sm btn-icon" onclick="showEditAsset('${r.id}','${r.type.toLowerCase()}')" title="Edit"><i class="fas fa-edit"></i></button>
<button class="btn btn-primary btn-sm btn-icon" onclick="logUtilization('${r.id}')" title="Log utilization"><i class="fas fa-plus-circle"></i></button>
</div></td></tr>`;}

function noData(label,icon){return`<tr><td colspan="14"><div class="empty-state"><i class="fas ${icon}"></i><p>No ${label} records yet</p></div></td></tr>`;}

function renderConsumablesTab(){
const cons=AppState.data.consumables||[];
const lowStock=cons.filter(c=>c.status==='low-stock'||c.qtyOnHand<=c.minStock).length;
$('#resTabContent').innerHTML=`
<div class="grid grid-4" style="margin-bottom:14px">
${sc('fas fa-boxes','Total Items',cons.length,'Consumable items','#388bfd','rgba(56,139,253,.15)')}
${sc('fas fa-check','In Stock',cons.filter(c=>c.status==='in-stock').length,'Adequate supply','#3fb950','rgba(63,185,80,.15)')}
${sc('fas fa-exclamation-triangle','Low Stock',lowStock,'Needs reorder','#f85149','rgba(248,81,73,.15)')}
${sc('fas fa-dollar-sign','Total Value',fmtNum(cons.reduce((s,c)=>s+c.qtyOnHand*c.unitCost,0)),'Current stock value','#bc8cff','rgba(188,140,255,.15)')}
</div>
<div class="section-header" style="margin-bottom:12px">
<div class="section-title">Consumables Register</div>
<button class="btn btn-primary btn-sm" onclick="showAddConsumable()"><i class="fas fa-plus"></i> Add Item</button></div>
<div class="card"><div class="table-wrap"><table>
<thead><tr><th>ID</th><th>Name</th><th>Category</th><th>Unit</th><th>On Hand</th><th>Min Stock</th><th>Stock Level</th><th>Unit Cost (₱)</th><th>Total Value</th><th>Project</th><th>Supplier</th><th>Status</th><th>Actions</th></tr></thead>
<tbody>${cons.map(c=>{
const pct=Math.min(100,Math.round((c.qtyOnHand/Math.max(c.minStock*2,1))*100));
const low=c.qtyOnHand<=c.minStock;
return`<tr>
<td style="font-size:10px;font-family:var(--font-mono)">${c.id}</td>
<td style="font-weight:500;font-size:12px;min-width:160px">${c.name}</td>
<td><span class="badge badge-gray">${c.category}</span></td>
<td><span class="badge badge-blue">${c.unit}</span></td>
<td style="font-family:var(--font-mono);font-weight:600;color:${low?'var(--accent-red)':'inherit'}">${c.qtyOnHand.toLocaleString()}</td>
<td style="font-family:var(--font-mono);color:var(--text-secondary)">${c.minStock.toLocaleString()}</td>
<td><div style="display:flex;align-items:center;gap:5px;min-width:90px"><div class="progress-bar" style="flex:1;height:5px"><div class="progress-fill" style="width:${pct}%;background:${low?'var(--accent-red)':'var(--accent-green)'}"></div></div><span style="font-size:9px">${pct}%</span></div></td>
<td style="font-family:var(--font-mono)">${c.unitCost.toLocaleString()}</td>
<td style="font-family:var(--font-mono);font-weight:600">₱${(c.qtyOnHand*c.unitCost).toLocaleString()}</td>
<td><span class="badge badge-blue">${c.projectId}</span></td>
<td style="font-size:11px">${c.supplier}</td>
<td>${resourceStatusBadge(c.status||(c.qtyOnHand<=c.minStock?'low-stock':'in-stock'))}</td>
<td><div style="display:flex;gap:3px;position:relative">
<button class="btn btn-secondary btn-sm btn-icon" onclick="showAssetDetail('${c.id}','consumables')" title="View detail & attachments"><i class="fas fa-paperclip"></i>${(c.attachments&&c.attachments.length)?`<span style="position:absolute;top:-4px;right:-4px;background:var(--accent-amber);color:#fff;font-size:8px;padding:1px 4px;border-radius:6px;font-weight:700">${c.attachments.length}</span>`:''}</button>
<button class="btn btn-secondary btn-sm btn-icon" onclick="showEditConsumable('${c.id}')" title="Edit"><i class="fas fa-edit"></i></button>
</div></td>
</tr>`;}).join('')||`<tr><td colspan="13"><div class="empty-state"><i class="fas fa-boxes"></i><p>No consumables yet</p></div></td></tr>`}
</tbody></table></div></div>`;}

function renderThirdPartyTab(){
const tp=AppState.data.thirdParty||[];
$('#resTabContent').innerHTML=`
<div class="grid grid-4" style="margin-bottom:14px">
${sc('fas fa-handshake','Total Contracts',tp.length,'Active vendors','#388bfd','rgba(56,139,253,.15)')}
${sc('fas fa-dollar-sign','Monthly Commitment',fmtNum(tp.filter(t=>t.status==='active').reduce((s,t)=>s+t.monthlyRate,0)),'Active contracts','#3fb950','rgba(63,185,80,.15)')}
${sc('fas fa-check-circle','Active',tp.filter(t=>t.status==='active').length,'Running contracts','#f0a450','rgba(240,164,80,.15)')}
${sc('fas fa-calendar-times','Expiring Soon',tp.filter(t=>t.contractEnd&&daysBetween(new Date().toISOString().split('T')[0],t.contractEnd)<60).length,'Review needed','#f85149','rgba(248,81,73,.15)')}
</div>
<div class="section-header" style="margin-bottom:12px">
<div class="section-title">Third Party Services</div>
<button class="btn btn-primary btn-sm" onclick="showAddThirdParty()"><i class="fas fa-plus"></i> Add Vendor</button></div>
<div class="card"><div class="table-wrap"><table>
<thead><tr><th>ID</th><th>Company</th><th>Category</th><th>Service</th><th>Contact Person</th><th>Contact No.</th><th>Project</th><th>Contract Period</th><th>Monthly Rate (₱)</th><th>Accreditation</th><th>Accred. Expiry</th><th>Status</th><th></th></tr></thead>
<tbody>${tp.map(t=>{
const expSoon=t.contractEnd&&daysBetween(new Date().toISOString().split('T')[0],t.contractEnd)<60;
return`<tr>
<td style="font-size:10px;font-family:var(--font-mono)">${t.id}</td>
<td><div style="font-weight:500;font-size:12px;min-width:140px">${esc(t.name)}</div></td>
<td><span class="badge badge-purple">${t.category}</span></td>
<td style="font-size:11px;max-width:160px;color:var(--text-secondary)">${t.service}</td>
<td><div style="display:flex;align-items:center;gap:5px">${avatarH(t.contactPerson,22)}<span style="font-size:11px">${t.contactPerson}</span></div></td>
<td style="font-size:11px;font-family:var(--font-mono)">${t.contactNo}</td>
<td><span class="badge badge-blue">${t.projectId}</span></td>
<td style="font-size:11px;font-family:var(--font-mono);color:${expSoon?'var(--accent-amber)':'inherit'}">${t.contractStart} → ${t.contractEnd}</td>
<td style="font-family:var(--font-mono);font-weight:600">₱${t.monthlyRate.toLocaleString()}</td>
<td style="font-size:11px">${t.accreditation}</td>
<td>${certBadge(t.accreditationExpiry)}</td>
<td>${resourceStatusBadge(t.status)}</td>
<td><button class="btn btn-secondary btn-sm btn-icon" onclick="showToast('Edit ${t.id}','info')"><i class="fas fa-edit"></i></button></td>
</tr>`;}).join('')||`<tr><td colspan="13"><div class="empty-state"><i class="fas fa-handshake"></i><p>No third party vendors yet</p></div></td></tr>`}
</tbody></table></div></div>`;}

function renderUtilizationTab(){
const logs=AppState.data.utilizationLog||[];
const allAssets=[...(AppState.data.equipment||[]),...(AppState.data.tools||[]),...(AppState.data.vehicles||[])];
const totalHrs=logs.reduce((s,l)=>s+l.hoursUsed,0);
const avgUtil=logs.length?Math.round(logs.reduce((s,l)=>s+l.utilization,0)/logs.length):0;
const totalFuel=logs.reduce((s,l)=>s+(l.fuelConsumed||0),0);
$('#resTabContent').innerHTML=`
<div class="grid grid-4" style="margin-bottom:14px">
${sc('fas fa-chart-bar','Total Log Entries',logs.length,'Utilization records','#388bfd','rgba(56,139,253,.15)')}
${sc('fas fa-clock','Total Hours Logged',totalHrs+'h','Across all resources','#3fb950','rgba(63,185,80,.15)')}
${sc('fas fa-tachometer-alt','Avg Utilization',avgUtil+'%','Resource efficiency','#f0a450','rgba(240,164,80,.15)')}
${sc('fas fa-gas-pump','Total Fuel',totalFuel+'L','All equipment','#bc8cff','rgba(188,140,255,.15)')}
</div>
<div class="section-header" style="margin-bottom:12px">
<div class="section-title">Utilization Log</div>
<button class="btn btn-primary btn-sm" onclick="showLogUtilization()"><i class="fas fa-plus"></i> Log Utilization</button></div>
<div class="card">
<div class="table-wrap"><table>
<thead><tr><th>ID</th><th>Resource</th><th>Type</th><th>Project</th><th>Date</th><th>Start</th><th>End</th><th>Hours</th><th>Operator</th><th>Activity</th><th>Utilization%</th><th>Fuel(L)</th><th>Notes</th><th></th></tr></thead>
<tbody>${logs.map(l=>`<tr>
<td style="font-size:10px;font-family:var(--font-mono)">${l.id}</td>
<td style="font-weight:500;font-size:12px;min-width:140px">${l.resourceName}</td>
<td><span class="badge ${l.resourceType==='Equipment'?'badge-blue':l.resourceType==='Vehicle'?'badge-amber':'badge-purple'}">${l.resourceType}</span></td>
<td><span class="badge badge-blue">${l.projectId}</span></td>
<td style="font-size:11px;font-family:var(--font-mono)">${l.date}</td>
<td style="font-size:11px;font-family:var(--font-mono)">${l.startTime}</td>
<td style="font-size:11px;font-family:var(--font-mono)">${l.endTime}</td>
<td style="font-family:var(--font-mono);font-weight:700">${l.hoursUsed}h</td>
<td><div style="display:flex;align-items:center;gap:5px">${avatarH(l.operator,22)}<span style="font-size:11px">${l.operator.split(' ')[0]}</span></div></td>
<td style="font-size:11px;max-width:160px;color:var(--text-secondary)">${l.activity}</td>
<td><div style="display:flex;align-items:center;gap:5px;min-width:80px"><div class="progress-bar" style="flex:1;height:5px"><div class="progress-fill" style="width:${l.utilization}%;background:${pColor(l.utilization)}"></div></div><span style="font-size:10px;font-family:var(--font-mono)">${l.utilization}%</span></div></td>
<td style="font-family:var(--font-mono);font-size:11px">${l.fuelConsumed||0}</td>
<td style="font-size:10px;color:var(--text-secondary)">${l.notes||'—'}</td>
<td><button class="btn btn-danger btn-sm btn-icon" onclick="deleteUtilLog('${l.id}')"><i class="fas fa-trash"></i></button></td>
</tr>`).join('')||`<tr><td colspan="14"><div class="empty-state"><i class="fas fa-chart-bar"></i><p>No utilization logs yet. Click "Log Utilization" to start.</p></div></td></tr>`}
</tbody></table></div></div>`;
}

function renderResHistoryTab(){
  // Render Asset History into the Resources module tab content area
  if(!AppState.data.assetHistory)AppState.data.assetHistory=[];
  const hist=(AppState.data.assetHistory||[]).slice().reverse();
  let data=[...hist];

  const actionColor={Deployment:'#388bfd',Maintenance:'#f0a450','Preventive Maintenance':'#f0a450','Corrective Maintenance':'#fb8f44',Breakdown:'#f85149',Calibration:'#bc8cff','Permit Renewal':'#39d3f2','Certification Renewal':'#39d3f2','Status Change':'#3fb950',Repair:'#f85149',Inspection:'#388bfd',Transfer:'#8b949e','Return to Store':'#8b949e',Decommission:'#f85149',Other:'#8b949e'};
  const typeColor={Equipment:'#f0a450',Tool:'#bc8cff',Vehicle:'#39d3f2'};
  const actionIcon={'Deployment':'fa-truck-loading','Maintenance':'fa-tools','Preventive Maintenance':'fa-shield-alt','Corrective Maintenance':'fa-exclamation-circle','Breakdown':'fa-bolt','Calibration':'fa-crosshairs','Permit Renewal':'fa-certificate','Certification Renewal':'fa-id-card','Status Change':'fa-exchange-alt','Repair':'fa-wrench','Inspection':'fa-clipboard-check','Transfer':'fa-arrows-alt','Return to Store':'fa-undo','Decommission':'fa-ban'};

  $('#resTabContent').innerHTML=`
  <div style="display:grid;grid-template-columns:repeat(4,1fr) repeat(4,1fr);gap:10px;margin-bottom:14px">
    ${sc('fas fa-history','Total Events',hist.length,'All logged events','#388bfd','rgba(56,139,253,.15)')}
    ${sc('fas fa-tools','Maintenance',hist.filter(h=>h.action==='Maintenance'||h.action==='Preventive Maintenance'||h.action==='Corrective Maintenance').length,'Maint. events','#f0a450','rgba(240,164,80,.15)')}
    ${sc('fas fa-crosshairs','Calibration',hist.filter(h=>h.action==='Calibration').length,'Cal. events','#bc8cff','rgba(188,140,255,.15)')}
    ${sc('fas fa-hard-hat','Deployments',hist.filter(h=>h.action==='Deployment').length,'Deployments','#3fb950','rgba(63,185,80,.15)')}
    ${sc('fas fa-bolt','Breakdowns',hist.filter(h=>h.action==='Breakdown').length,'Breakdown events','#f85149','rgba(248,81,73,.15)')}
    ${sc('fas fa-wrench','Repairs',hist.filter(h=>h.action==='Repair'||h.action==='Corrective Maintenance').length,'Repair events','#fb8f44','rgba(251,143,68,.15)')}
    ${sc('fas fa-certificate','Cert Renewals',hist.filter(h=>h.action==='Permit Renewal'||h.action==='Certification Renewal').length,'Renewals','#39d3f2','rgba(57,211,242,.15)')}
    ${sc('fas fa-shield-alt','Preventive',hist.filter(h=>h.action==='Preventive Maintenance').length,'PM events','#3fb950','rgba(63,185,80,.15)')}
  </div>

  <div class="card" style="margin-bottom:14px">
    <div class="section-header" style="margin-bottom:10px">
      <div>
        <div class="section-title">Asset History Log</div>
        <div style="font-size:11px;color:var(--text-secondary)">Log events here → auto-updates Next Maint / Next Cal / Status on the asset record</div>
      </div>
      <div style="display:flex;gap:7px">
        <button class="btn btn-secondary btn-sm" onclick="exportHistoryCSV()"><i class="fas fa-download"></i> Export CSV</button>
        <button class="btn btn-primary btn-sm" onclick="showLogAssetHistory()"><i class="fas fa-plus"></i> Log Event</button>
      </div>
    </div>
    <div class="table-wrap"><table>
      <thead><tr><th>ID</th><th>Date</th><th>Asset</th><th>Type</th><th>Action</th><th>Detail</th><th>Before</th><th>After</th><th>Next Maint Set</th><th>Next Cal Set</th><th>Project</th><th>Performed By</th><th></th></tr></thead>
      <tbody>${data.length?data.map(h=>`<tr>
        <td style="font-size:10px;font-family:var(--font-mono);font-weight:700">${h.id}</td>
        <td style="font-size:11px;font-family:var(--font-mono);white-space:nowrap">${h.date}</td>
        <td>
          <div style="font-weight:500;font-size:12px">${h.assetName}</div>
          <div style="font-size:9px;font-family:var(--font-mono);color:var(--text-muted)">${h.assetId}</div>
        </td>
        <td><span class="badge" style="background:${typeColor[h.assetType]||'#8b949e'}22;color:${typeColor[h.assetType]||'#8b949e'}">${h.assetType||'—'}</span></td>
        <td><span class="badge" style="background:${actionColor[h.action]||'#8b949e'}22;color:${actionColor[h.action]||'#8b949e'};white-space:nowrap">
          <i class="fas ${actionIcon[h.action]||'fa-circle'}" style="margin-right:4px;font-size:9px"></i>${h.action}
        </span></td>
        <td style="font-size:11px;color:var(--text-secondary);max-width:200px">${h.detail||'—'}</td>
        <td><span class="badge badge-gray" style="font-size:9px">${h.beforeValue||'—'}</span></td>
        <td><span class="badge badge-blue" style="font-size:9px">${h.afterValue||'—'}</span></td>
        <td style="font-size:10px;font-family:var(--font-mono);color:${h.nextMaint?'var(--accent-green)':'var(--text-muted)'}">${h.nextMaint||'—'}</td>
        <td style="font-size:10px;font-family:var(--font-mono);color:${h.nextCal?'var(--accent-blue)':'var(--text-muted)'}">${h.nextCal||'—'}</td>
        <td><span class="badge badge-blue" style="font-size:9px">${h.projectId||'—'}</span></td>
        <td><div style="display:flex;align-items:center;gap:5px">${avatarH(h.performedBy||'?',22)}<span style="font-size:11px">${h.performedBy||'—'}</span></div></td>
        <td><button class="btn btn-danger btn-sm btn-icon" onclick="deleteResHistoryEntry('${h.id}')"><i class="fas fa-trash"></i></button></td>
      </tr>`).join(''):`<tr><td colspan="13"><div class="empty-state" style="padding:24px">
        <i class="fas fa-history" style="font-size:28px;margin-bottom:10px;opacity:.4;display:block"></i>
        <p style="margin-bottom:10px">No history events yet.</p>
        <button class="btn btn-primary" onclick="showLogAssetHistory()"><i class="fas fa-plus"></i> Log First Event</button>
      </div></td></tr>`}
      </tbody>
    </table></div>
  </div>

  <!-- Timeline -->
  <div class="card">
    <div class="section-title" style="margin-bottom:12px"><i class="fas fa-stream" style="margin-right:7px;color:var(--accent-blue)"></i>Recent Activity Timeline</div>
    ${data.slice(0,12).map(h=>`
    <div style="display:flex;gap:12px;padding:11px 0;border-bottom:1px solid var(--border);align-items:flex-start">
      <div style="width:36px;height:36px;border-radius:50%;background:${actionColor[h.action]||'#8b949e'}22;display:flex;align-items:center;justify-content:center;flex-shrink:0;margin-top:2px">
        <i class="fas ${actionIcon[h.action]||'fa-circle'}" style="color:${actionColor[h.action]||'#8b949e'};font-size:13px"></i>
      </div>
      <div style="flex:1;min-width:0">
        <div style="display:flex;align-items:center;gap:7px;flex-wrap:wrap;margin-bottom:3px">
          <span style="font-size:12px;font-weight:600">${h.action}</span>
          <span style="font-size:11px;color:var(--text-secondary)">on</span>
          <span style="font-size:12px;font-weight:600;color:${typeColor[h.assetType]||'var(--accent-blue)'}">${h.assetName}</span>
          ${h.projectId&&h.projectId!=='N/A'?`<span class="badge badge-blue" style="font-size:9px">${h.projectId}</span>`:'<span class="badge badge-gray" style="font-size:9px">Stored</span>'}
        </div>
        <div style="font-size:11px;color:var(--text-secondary);margin-bottom:4px">${h.detail||''}</div>
        <div style="font-size:10px;color:var(--text-muted);display:flex;gap:10px;flex-wrap:wrap">
          ${h.performedBy?`<span><i class="fas fa-user" style="margin-right:3px"></i>${h.performedBy}</span>`:''}
          <span><i class="fas fa-calendar" style="margin-right:3px"></i>${h.date}</span>
          ${h.nextMaint?`<span style="color:var(--accent-green)"><i class="fas fa-tools" style="margin-right:3px"></i>Next Maint: ${h.nextMaint}</span>`:''}
          ${h.nextCal?`<span style="color:var(--accent-blue)"><i class="fas fa-crosshairs" style="margin-right:3px"></i>Next Cal: ${h.nextCal}</span>`:''}
          ${h.beforeValue?`<span>${h.beforeValue} → <strong style="color:var(--accent-blue)">${h.afterValue}</strong></span>`:''}
        </div>
      </div>
    </div>`).join('')}
    ${data.length>12?`<div style="padding:10px;text-align:center;font-size:11px;color:var(--text-secondary)">${data.length-12} more events in the table above</div>`:''}
    ${!data.length?`<div style="padding:16px;text-align:center;color:var(--text-muted);font-size:12px">No events logged yet</div>`:''}
  </div>`;
}

function deleteResHistoryEntry(id){
  if(requestOrDelete('assetHistory',id)){renderResHistoryTab();}
}


function renderTrackingTab(){
const allAssets=[...(AppState.data.equipment||[]),...(AppState.data.tools||[]),...(AppState.data.vehicles||[])];
const now=new Date().toISOString().split('T')[0];
const maintDue=allAssets.filter(r=>r.nextMaint&&r.nextMaint!=='N/A'&&daysBetween(now,r.nextMaint)<30);
const calDue=allAssets.filter(r=>r.nextCal&&r.nextCal!=='N/A'&&daysBetween(now,r.nextCal)<30);
const certExp=allAssets.filter(r=>r.certExpiry&&r.certExpiry!=='N/A'&&daysBetween(now,r.certExpiry)<60);
const statColors={available:'var(--accent-green)','in-use':'var(--accent-blue)',maintenance:'var(--accent-red)','out-of-service':'var(--accent-red)',standby:'var(--text-muted)'};
$('#resTabContent').innerHTML=`
<div class="grid grid-3" style="margin-bottom:14px">
<div class="card" style="border-left:3px solid var(--accent-red)">
<div class="card-title" style="color:var(--accent-red)"><i class="fas fa-tools" style="margin-right:5px"></i>Maintenance Due (&lt;30 days)</div>
${maintDue.length?maintDue.map(r=>`<div style="display:flex;justify-content:space-between;padding:7px 0;border-bottom:1px solid var(--border);font-size:11px">
<span style="font-weight:500">${esc(r.name)}</span>
<span style="font-family:var(--font-mono);color:${daysBetween(now,r.nextMaint)<0?'var(--accent-red)':'var(--accent-amber)'}">${r.nextMaint}</span>
</div>`).join(''):`<div style="padding:10px 0;font-size:11px;color:var(--text-muted)">No maintenance due soon ✓</div>`}
</div>
<div class="card" style="border-left:3px solid var(--accent-amber)">
<div class="card-title" style="color:var(--accent-amber)"><i class="fas fa-crosshairs" style="margin-right:5px"></i>Calibration Due (&lt;30 days)</div>
${calDue.length?calDue.map(r=>`<div style="display:flex;justify-content:space-between;padding:7px 0;border-bottom:1px solid var(--border);font-size:11px">
<span style="font-weight:500">${esc(r.name)}</span>
<span style="font-family:var(--font-mono);color:${daysBetween(now,r.nextCal)<0?'var(--accent-red)':'var(--accent-amber)'}">${r.nextCal}</span>
</div>`).join(''):`<div style="padding:10px 0;font-size:11px;color:var(--text-muted)">No calibration due soon ✓</div>`}
</div>
<div class="card" style="border-left:3px solid var(--accent-purple)">
<div class="card-title" style="color:var(--accent-purple)"><i class="fas fa-certificate" style="margin-right:5px"></i>Cert/Permit Expiring (&lt;60 days)</div>
${certExp.length?certExp.map(r=>`<div style="display:flex;justify-content:space-between;padding:7px 0;border-bottom:1px solid var(--border);font-size:11px">
<span style="font-weight:500">${esc(r.name)}</span>
<span style="font-family:var(--font-mono);color:${daysBetween(now,r.certExpiry)<0?'var(--accent-red)':daysBetween(now,r.certExpiry)<30?'var(--accent-red)':'var(--accent-amber)'}">${r.certExpiry}</span>
</div>`).join(''):`<div style="padding:10px 0;font-size:11px;color:var(--text-muted)">No certificates expiring soon ✓</div>`}
</div>
</div>
<div class="card">
<div class="section-header" style="margin-bottom:12px">
<div><div class="section-title">Full Asset Tracking Register</div><div style="font-size:10px;color:var(--text-secondary);margin-top:2px"><i class="fas fa-info-circle" style="color:var(--accent-blue);margin-right:4px"></i>Status, maintenance &amp; calibration dates are updated by logging events in <strong>Asset History</strong>. Direct edits here are for corrections only.</div></div>
<div style="display:flex;gap:7px">
<select class="form-select" style="height:32px;width:160px" id="trackFilter" onchange="filterTracking(this.value)">
<option value="all">All Types</option><option value="Equipment">Equipment</option><option value="Tool">Tools</option><option value="Vehicle">Vehicles</option>
</select>
<select class="form-select" style="height:32px;width:160px" id="trackStatusFilter" onchange="filterTracking()">
<option value="all">All Statuses</option><option value="available">Available</option><option value="in-use">In Use</option><option value="maintenance">Maintenance</option>
</select>
<button class="btn btn-primary btn-sm" onclick="resTab='tracking';showLogAssetHistory()"><i class="fas fa-plus"></i> Log Event</button>
</div>
</div>
<div class="table-wrap"><table id="trackingTable">
<thead><tr><th>ID</th><th>Name</th><th>Type</th><th>Status</th><th>Project</th><th>Location</th><th>Last Maint.</th><th>Next Maint.</th><th>Last Cal.</th><th>Next Cal.</th><th>Cal. Body</th><th>Certification</th><th>Cert Body</th><th>Cert Expiry</th><th>Notes</th><th>Log</th></tr></thead>
<tbody id="trackingBody">${trackingRows(allAssets)}</tbody>
</table></div></div>`;
}

function trackingRows(assets){
if(!assets.length)return`<tr><td colspan="16"><div class="empty-state"><i class="fas fa-map-marker-alt"></i><p>No assets to track. Log a history event to get started.</p></div></td></tr>`;
const now=new Date().toISOString().split('T')[0];
return assets.map(r=>{
const maintAlert=r.nextMaint&&r.nextMaint!=='N/A'&&daysBetween(now,r.nextMaint)<14;
const calAlert=r.nextCal&&r.nextCal!=='N/A'&&daysBetween(now,r.nextCal)<14;
const certAlert=r.certExpiry&&r.certExpiry!=='N/A'&&daysBetween(now,r.certExpiry)<60;
const listKey=r.type==='Equipment'?'equipment':r.type==='Vehicle'?'vehicles':'tools';
return`<tr>
<td style="font-size:10px;font-family:var(--font-mono);font-weight:700">${r.id}</td>
<td style="font-weight:500;font-size:12px;min-width:140px">${esc(r.name)}</td>
<td><span class="badge ${r.type==='Equipment'?'badge-blue':r.type==='Vehicle'?'badge-amber':'badge-purple'}">${r.type}</span></td>
<td>${resourceStatusBadge(r.status)}</td>
<td><span class="badge badge-blue" style="font-size:10px">${r.projectId||'N/A'}</span></td>
<td><input class="form-input" value="${r.location||''}" style="min-width:100px;height:26px;font-size:11px" onchange="updateAssetField('${r.id}','${listKey}','location',this.value)"></td>
<td style="font-size:11px;font-family:var(--font-mono)">${na(r.lastMaint)}</td>
<td style="font-size:11px;font-family:var(--font-mono);color:${maintAlert?'var(--accent-red)':r.nextMaint==='N/A'?'var(--text-muted)':'inherit'};font-weight:${maintAlert?'700':'400'}">
  ${maintAlert?'<i class="fas fa-exclamation-triangle" style="margin-right:4px;font-size:10px"></i>':''}${r.nextMaint||'N/A'}
</td>
<td style="font-size:11px;font-family:var(--font-mono)">${na(r.lastCal)}</td>
<td style="font-size:11px;font-family:var(--font-mono);color:${calAlert?'var(--accent-amber)':r.nextCal==='N/A'?'var(--text-muted)':'inherit'};font-weight:${calAlert?'700':'400'}">
  ${calAlert?'<i class="fas fa-exclamation-circle" style="margin-right:4px;font-size:10px"></i>':''}${r.nextCal||'N/A'}
</td>
<td><input class="form-input" value="${r.calBody||'N/A'}" style="min-width:90px;height:26px;font-size:11px" onchange="updateAssetField('${r.id}','${listKey}','calBody',this.value)"></td>
<td><input class="form-input" value="${r.cert||'N/A'}" style="min-width:110px;height:26px;font-size:11px" onchange="updateAssetField('${r.id}','${listKey}','cert',this.value)"></td>
<td><input class="form-input" value="${r.certBody||'N/A'}" style="min-width:90px;height:26px;font-size:11px" onchange="updateAssetField('${r.id}','${listKey}','certBody',this.value)"></td>
<td style="font-size:11px;font-family:var(--font-mono);color:${certAlert?'var(--accent-red)':r.certExpiry==='N/A'?'var(--text-muted)':'inherit'};font-weight:${certAlert?'700':'400'}">
  ${certAlert?'<i class="fas fa-certificate" style="margin-right:4px;font-size:10px"></i>':''}${r.certExpiry||'N/A'}
</td>
<td><input class="form-input" value="${r.notes||''}" style="min-width:110px;height:26px;font-size:11px" onchange="updateAssetField('${r.id}','${listKey}','notes',this.value)"></td>
<td>
  <button class="btn btn-primary btn-sm" style="white-space:nowrap;font-size:10px;padding:4px 8px" onclick="showLogAssetHistoryFor('${r.id}','${r.name.replace(/'/g,'&#39;')}','${r.type}')" title="Log maintenance, calibration, breakdown etc.">
    <i class="fas fa-clipboard-list"></i> Log
  </button>
</td>
</tr>`;}).join('');}

function na(v){return v&&v!=='N/A'?`<span style="font-size:11px;font-family:var(--font-mono)">${v}</span>`:`<span style="color:var(--text-muted);font-size:10px">N/A</span>`;}

function updateAssetField(id,listKey,field,val){
  if(!AppState.data[listKey])AppState.data[listKey]=[];
  const item=AppState.data[listKey].find(r=>r.id===id);
  if(!item){console.warn('updateAssetField: not found',id,listKey);return;}
  item[field]=val;
  AppState.save();
  // Note: history is logged via Asset History tab, not from here
}

function filterTracking(){
const type=($('#trackFilter')||{value:'all'}).value;
const stat=($('#trackStatusFilter')||{value:'all'}).value;
let assets=[...(AppState.data.equipment||[]),...(AppState.data.tools||[]),...(AppState.data.vehicles||[])];
if(type!=='all')assets=assets.filter(a=>a.type===type);
if(stat!=='all')assets=assets.filter(a=>a.status===stat);
if($('#trackingBody'))$('#trackingBody').innerHTML=trackingRows(assets);}


// ── ASSET FORMS ────────────────────────────────────────────
function showAddAsset(typeKey){
const typeLabel={equipment:'Equipment',tools:'Tool',vehicles:'Vehicle'}[typeKey]||'Asset';
$('#genericModalTitle').textContent='Add '+typeLabel;
$('#genericModalBody').innerHTML=`<div class="form-grid">
<div class="form-group"><label class="form-label">ID</label><input class="form-input" id="aId" value="${typeKey.toUpperCase().slice(0,3)}-${String((AppState.data[typeKey]||[]).length+1).padStart(3,'0')}" readonly style="opacity:.6"></div>
<div class="form-group"><label class="form-label">Name *</label><input class="form-input" id="aName" placeholder="Asset name"></div>
<div class="form-group"><label class="form-label">Category</label><input class="form-input" id="aCat" placeholder="e.g., Lifting, Welding"></div>
<div class="form-group"><label class="form-label">Make</label><input class="form-input" id="aMake" placeholder="Manufacturer"></div>
<div class="form-group"><label class="form-label">Model</label><input class="form-input" id="aModel" placeholder="Model number"></div>
<div class="form-group"><label class="form-label">Serial / Reg. No.</label><input class="form-input" id="aSerial" placeholder="Serial or plate number"></div>
<div class="form-group"><label class="form-label">Project <span style="font-weight:400;color:var(--text-muted)">(optional)</span></label><select class="form-select" id="aProj"><option value="N/A">— Not Assigned (Stored)</option>${(AppState.data.projects||[]).map(p=>`<option value="${p.id}">${p.id} — ${p.name?p.name.substring(0,20):''}</option>`).join('')}</select></div>
<div class="form-group"><label class="form-label">Location</label><input class="form-input" id="aLoc" placeholder="Current location"></div>
<div class="form-group"><label class="form-label">Status</label><select class="form-select" id="aStat">${['available','in-use','maintenance','standby','out-of-service'].map(s=>`<option>${s}</option>`).join('')}</select></div>
<div class="form-group"><label class="form-label">Daily Rate (₱)</label><input class="form-input" type="number" id="aRate" placeholder="0"></div>
</div>
<div style="font-size:12px;font-weight:600;margin:12px 0 8px">Maintenance (enter N/A if not applicable)</div>
<div class="form-grid">
<div class="form-group"><label class="form-label">Last Maintenance</label><input class="form-input" id="aLastM" placeholder="YYYY-MM-DD or N/A" value="N/A"></div>
<div class="form-group"><label class="form-label">Next Maintenance</label><input class="form-input" id="aNextM" placeholder="YYYY-MM-DD or N/A" value="N/A"></div>
<div class="form-group"><label class="form-label">Maint. Interval</label><input class="form-input" id="aMI" placeholder="e.g., 3 months, N/A" value="N/A"></div>
</div>
<div style="font-size:12px;font-weight:600;margin:12px 0 8px">Calibration (N/A if not applicable)</div>
<div class="form-grid">
<div class="form-group"><label class="form-label">Last Calibration</label><input class="form-input" id="aLastC" placeholder="YYYY-MM-DD or N/A" value="N/A"></div>
<div class="form-group"><label class="form-label">Next Calibration</label><input class="form-input" id="aNextC" placeholder="YYYY-MM-DD or N/A" value="N/A"></div>
<div class="form-group"><label class="form-label">Calibration Body</label><input class="form-input" id="aCB" placeholder="e.g., SGS, N/A" value="N/A"></div>
</div>
<div style="font-size:12px;font-weight:600;margin:12px 0 8px">Certification / Permit (N/A if not applicable)</div>
<div class="form-grid">
<div class="form-group"><label class="form-label">Certification Name</label><input class="form-input" id="aCert" placeholder="e.g., Lifting Cert, N/A" value="N/A"></div>
<div class="form-group"><label class="form-label">Certifying Body</label><input class="form-input" id="aCertB" placeholder="e.g., SGS, LTO, N/A" value="N/A"></div>
<div class="form-group"><label class="form-label">Cert. Expiry</label><input class="form-input" id="aCertE" placeholder="YYYY-MM-DD or N/A" value="N/A"></div>
</div>
<div class="form-group"><label class="form-label">Notes</label><textarea class="form-textarea" id="aNotes" style="min-height:50px"></textarea></div>`;
$('#genericModalFooter').innerHTML=`<button class="btn btn-secondary" onclick="closeModal('genericModal')">Cancel</button><button class="btn btn-primary" onclick="saveAsset('${typeKey}')">Add ${typeLabel}</button>`;
openModal('genericModal');}

function saveAsset(typeKey){
const typeLabel={equipment:'Equipment',tools:'Tool',vehicles:'Vehicle'}[typeKey]||'Asset';
const prefix={equipment:'EQP',tools:'TOL',vehicles:'VEH'}[typeKey]||'AST';
const item={
id:$('#aId').value||prefix+'-'+(Date.now()%1000).toString().padStart(3,'0'),
name:$('#aName').value,type:typeLabel,category:$('#aCat').value,
make:$('#aMake').value,model:$('#aModel').value,
serialNo:typeKey==='vehicles'?'—':$('#aSerial').value,
regNo:typeKey==='vehicles'?$('#aSerial').value:'N/A',
status:$('#aStat').value,projectId:$('#aProj').value,location:$('#aLoc').value,
lastMaint:$('#aLastM').value,nextMaint:$('#aNextM').value,maintInterval:$('#aMI').value,
lastCal:$('#aLastC').value,nextCal:$('#aNextC').value,calBody:$('#aCB').value,
cert:$('#aCert').value,certBody:$('#aCertB').value,certExpiry:$('#aCertE').value,
dailyRate:parseFloat($('#aRate').value)||0,notes:$('#aNotes').value};
if(!item.name){showToast('Name required','error');return;}
if(!AppState.data[typeKey])AppState.data[typeKey]=[];
AppState.data[typeKey].push(item);
AppState.save();closeModal('genericModal');renderResTab();showToast(typeLabel+' added','success');}

function showEditAsset(id,typeKey){
  // Open the asset detail with attachments — full edit panel
  showAssetDetail(id, typeKey);
}


// ═══════════════════════════════════════════════════════════
// ── ASSET ATTACHMENTS (MSDS, Certificates, Insurance, etc) ──
// ═══════════════════════════════════════════════════════════

function showAssetDetail(id, typeKey) {
  const asset = (AppState.data[typeKey]||[]).find(a => a.id === id);
  if (!asset) { showToast('Asset not found', 'error'); return; }
  if (!asset.attachments) asset.attachments = [];

  const typeLabel = {equipment:'Equipment',tools:'Tool',vehicles:'Vehicle',personnel:'Personnel',consumables:'Consumable',materials:'Material'}[typeKey] || 'Asset';
  const isAdmin = (_currentUserProfile && _currentUserProfile.isAdmin) || false;

  $('#genericModalTitle').textContent = typeLabel + ' Detail: ' + asset.name;
  $('#genericModalBody').innerHTML = `
    <!-- Asset summary -->
    <div style="background:var(--bg-hover);padding:12px;border-radius:8px;margin-bottom:14px">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px">
        <div>
          <div style="font-family:var(--font-mono);font-size:11px;color:var(--accent-blue);font-weight:700">${asset.id}</div>
          <div style="font-size:15px;font-weight:700;margin-top:3px">${asset.name}</div>
          <div style="font-size:11px;color:var(--text-muted)">${asset.category || ''} ${asset.make ? '· ' + asset.make : ''} ${asset.model ? asset.model : ''}</div>
        </div>
        <div style="text-align:right;font-size:10px;color:var(--text-muted)">
          ${asset.serialNo ? 'S/N: ' + asset.serialNo + '<br>' : ''}
          ${asset.location ? '<i class="fas fa-map-marker-alt" style="margin-right:3px"></i>' + asset.location : ''}
        </div>
      </div>
    </div>

    <!-- Attachment categories tabs -->
    <div style="border-bottom:1px solid var(--border);margin-bottom:14px;padding-bottom:8px">
      <div style="font-size:13px;font-weight:700;display:flex;align-items:center;justify-content:space-between">
        <span><i class="fas fa-paperclip" style="margin-right:6px;color:var(--accent-blue)"></i>Attachments (${asset.attachments.length})</span>
        <button class="btn btn-primary btn-sm" onclick="uploadAssetAttachment('${id}','${typeKey}')">
          <i class="fas fa-cloud-upload-alt"></i> Add Attachment
        </button>
      </div>
    </div>

    <!-- Quick filter chips by category -->
    <div style="display:flex;gap:5px;flex-wrap:wrap;margin-bottom:12px">
      ${['All','MSDS','Calibration','Insurance','Permit','Manual','Photo','Other'].map(cat => `
        <button onclick="_assetAttachFilter='${cat}';showAssetDetail('${id}','${typeKey}')"
          style="font-size:10px;padding:4px 10px;border-radius:10px;cursor:pointer;font-weight:600;
            background:${_assetAttachFilter===cat||(!_assetAttachFilter&&cat==='All')?'var(--accent-blue)':'transparent'};
            color:${_assetAttachFilter===cat||(!_assetAttachFilter&&cat==='All')?'#fff':'var(--text-secondary)'};
            border:1px solid ${_assetAttachFilter===cat||(!_assetAttachFilter&&cat==='All')?'var(--accent-blue)':'var(--border)'};">
          ${cat} ${cat!=='All'?'('+asset.attachments.filter(a=>a.category===cat).length+')':''}
        </button>
      `).join('')}
    </div>

    <!-- Attachment list -->
    <div id="assetAttachList">${_renderAssetAttachmentList(asset, typeKey)}</div>
  `;
  $('#genericModalFooter').innerHTML = `<button class="btn btn-secondary" onclick="closeModal('genericModal')">Close</button>`;
  openModal('genericModal');
}

let _assetAttachFilter = 'All';

function _renderAssetAttachmentList(asset, typeKey) {
  let list = asset.attachments || [];
  if (_assetAttachFilter && _assetAttachFilter !== 'All') {
    list = list.filter(a => a.category === _assetAttachFilter);
  }
  if (!list.length) {
    return `<div class="empty-state" style="padding:20px"><i class="fas fa-folder-open" style="font-size:32px;opacity:.3"></i><p style="margin-top:8px">No attachments${_assetAttachFilter!=='All'?' in '+_assetAttachFilter:''} yet</p><div style="font-size:11px;color:var(--text-muted);margin-top:4px">Upload MSDS, calibration certificates, insurance docs, permits, manuals, photos, etc.</div></div>`;
  }
  const iconMap = {'MSDS':'fa-flask','Calibration':'fa-balance-scale','Insurance':'fa-shield-alt','Permit':'fa-stamp','Manual':'fa-book','Photo':'fa-camera','Other':'fa-file'};
  const colorMap = {'MSDS':'#fb8f44','Calibration':'#39d3f2','Insurance':'#3fb950','Permit':'#bc8cff','Manual':'#f0a450','Photo':'#388bfd','Other':'#8b949e'};
  const isAdmin = (_currentUserProfile && _currentUserProfile.isAdmin) || false;
  return list.map(att => {
    const ico = iconMap[att.category] || 'fa-file';
    const col = colorMap[att.category] || '#8b949e';
    const isExpired = att.expiryDate && new Date(att.expiryDate) < new Date();
    const expiresSoon = att.expiryDate && !isExpired && (new Date(att.expiryDate) - new Date()) < 30*86400000;
    return `<div style="display:flex;align-items:center;gap:10px;padding:10px;border:1px solid ${isExpired?'var(--accent-red)':expiresSoon?'var(--accent-amber)':'var(--border)'};border-radius:7px;margin-bottom:7px;${isExpired?'background:rgba(248,81,73,.05)':expiresSoon?'background:rgba(240,164,80,.05)':''}">
      <div style="width:34px;height:34px;background:${col}22;color:${col};border-radius:6px;display:flex;align-items:center;justify-content:center;flex-shrink:0"><i class="fas ${ico}"></i></div>
      <div style="flex:1;min-width:0">
        <div style="font-size:12px;font-weight:600;line-height:1.3">${att.name}</div>
        <div style="font-size:10px;color:var(--text-muted);margin-top:2px">
          <span class="badge" style="background:${col}22;color:${col};font-size:9px">${att.category}</span>
          ${att.fileSize?'<span style="margin-left:6px">· '+att.fileSize+'</span>':''}
          ${att.uploadedBy?'<span style="margin-left:6px">· by '+att.uploadedBy+'</span>':''}
          ${att.uploadedAt?'<span style="margin-left:6px">· '+new Date(att.uploadedAt).toLocaleDateString()+'</span>':''}
        </div>
        ${att.expiryDate ? `<div style="font-size:10px;margin-top:3px;color:${isExpired?'var(--accent-red)':expiresSoon?'var(--accent-amber)':'var(--text-muted)'}"><i class="fas ${isExpired?'fa-exclamation-triangle':'fa-clock'}" style="margin-right:3px"></i>${isExpired?'EXPIRED':'Expires'} ${att.expiryDate}</div>`:''}
        ${att.notes?`<div style="font-size:10px;color:var(--text-muted);margin-top:3px;font-style:italic">${att.notes}</div>`:''}
      </div>
      <div style="display:flex;gap:4px;flex-shrink:0">
        ${(att.fileWebUrl||att.fileUrl)?`<button class="btn btn-secondary btn-sm btn-icon" onclick="viewAssetAttachment('${asset.id}','${typeKey}','${att.id}')" title="View"><i class="fas fa-eye"></i></button>`:''}
        ${(att.fileWebUrl||att.fileUrl||att.spDriveId)?`<button class="btn btn-secondary btn-sm btn-icon" onclick="downloadAssetAttachment('${asset.id}','${typeKey}','${att.id}')" title="Download"><i class="fas fa-download"></i></button>`:''}
        <button class="btn btn-secondary btn-sm btn-icon" onclick="editAssetAttachment('${asset.id}','${typeKey}','${att.id}')" title="Edit metadata"><i class="fas fa-edit"></i></button>
        ${isAdmin?`<button class="btn btn-danger btn-sm btn-icon" onclick="deleteAssetAttachment('${asset.id}','${typeKey}','${att.id}')" title="Delete"><i class="fas fa-trash"></i></button>`:''}
      </div>
    </div>`;
  }).join('');
}

function uploadAssetAttachment(assetId, typeKey) {
  const asset = (AppState.data[typeKey]||[]).find(a => a.id === assetId);
  if (!asset) return;
  // Show category + metadata form first
  $('#genericModalTitle').textContent = 'Upload Attachment to ' + asset.name;
  $('#genericModalBody').innerHTML = `
    <div class="form-grid">
      <div class="form-group"><label class="form-label">Document Type *</label>
        <select class="form-select" id="attCat">
          <option value="MSDS">MSDS (Material Safety Data Sheet)</option>
          <option value="Calibration">Calibration Certificate</option>
          <option value="Insurance">Insurance Document</option>
          <option value="Permit">Permit / Registration</option>
          <option value="Manual">Manual / Operating Procedure</option>
          <option value="Photo">Photo</option>
          <option value="Other">Other</option>
        </select>
      </div>
      <div class="form-group"><label class="form-label">Expiry Date <span style="font-weight:400;color:var(--text-muted)">(if applicable)</span></label>
        <input type="date" class="form-input" id="attExpiry">
      </div>
    </div>
    <div class="form-group"><label class="form-label">Description / Notes</label>
      <input class="form-input" id="attNotes" placeholder="e.g., Calibration by SGS, valid until next year">
    </div>
    <div class="form-group" style="margin-top:14px">
      <label class="form-label">File *</label>
      <input type="file" class="form-input" id="attFile" accept=".pdf,.doc,.docx,.xls,.xlsx,.jpg,.jpeg,.png,.txt,.csv">
      <div style="font-size:10px;color:var(--text-muted);margin-top:4px">Files are uploaded to SharePoint Document Library</div>
    </div>
  `;
  $('#genericModalFooter').innerHTML = `
    <button class="btn btn-secondary" onclick="showAssetDetail('${assetId}','${typeKey}')">Back</button>
    <button class="btn btn-primary" onclick="_submitAssetAttachment('${assetId}','${typeKey}')"><i class="fas fa-upload"></i> Upload</button>
  `;
}

async function _submitAssetAttachment(assetId, typeKey) {
  const asset = (AppState.data[typeKey]||[]).find(a => a.id === assetId);
  if (!asset) return;
  const fileInput = document.getElementById('attFile');
  const file = fileInput?.files?.[0];
  if (!file) { showToast('Please select a file', 'error'); return; }
  if (file.size > 100 * 1024 * 1024) { showToast('File too large — max 100 MB', 'error'); return; }
  if (!_spConnected) { showToast('SharePoint not connected — cannot upload', 'error', 5000); return; }
  const category = document.getElementById('attCat').value;
  const expiry = document.getElementById('attExpiry').value;
  const notes = document.getElementById('attNotes').value;
  const user = _currentUserProfile?.name || _currentUser?.email || 'User';

  showToast('Uploading ' + file.name + '...', 'info', 3000);
  try {
    // Upload to SP using asset ID as the folder
    const result = await spUploadFile(file, 'ASSETS/' + asset.id);
    const att = {
      id: 'ATT-' + Date.now().toString(36).toUpperCase(),
      name: file.name.replace(/\.[^/.]+$/, ''),
      fileName: file.name,
      fileType: file.name.split('.').pop().toLowerCase(),
      fileUrl: result.url,
      fileWebUrl: result.webUrl,
      spDriveId: result.driveId,
      spItemId: result.itemId,
      fileSize: _formatFileSize(file.size),
      category,
      expiryDate: expiry || null,
      notes: notes || '',
      uploadedBy: user,
      uploadedAt: new Date().toISOString(),
    };
    if (!asset.attachments) asset.attachments = [];
    asset.attachments.push(att);
    AppState.save();
    showToast('Attachment uploaded: ' + file.name, 'success');
    showAssetDetail(assetId, typeKey); // refresh
  } catch (err) {
    console.error('[Asset Attach] Error:', err);
    showToast('Upload failed: ' + err.message, 'error', 6000);
  }
}

async function viewAssetAttachment(assetId, typeKey, attId) {
  const asset = (AppState.data[typeKey]||[]).find(a => a.id === assetId);
  if (!asset) return;
  const att = (asset.attachments||[]).find(a => a.id === attId);
  if (!att) return;
  if (att.fileWebUrl) { window.open(att.fileWebUrl, '_blank'); return; }
  if (att.spDriveId && att.spItemId) {
    showToast('Getting view link...', 'info', 2000);
    const url = await spGetFileDownloadUrl(att.spDriveId, att.spItemId);
    if (url) { window.open(url, '_blank'); return; }
  }
  showToast('Cannot open file', 'error');
}

async function downloadAssetAttachment(assetId, typeKey, attId) {
  const asset = (AppState.data[typeKey]||[]).find(a => a.id === assetId);
  if (!asset) return;
  const att = (asset.attachments||[]).find(a => a.id === attId);
  if (!att) return;
  let url = att.fileUrl;
  if (att.spDriveId && att.spItemId) {
    url = await spGetFileDownloadUrl(att.spDriveId, att.spItemId);
  }
  if (!url) { showToast('Cannot download file', 'error'); return; }
  const a = document.createElement('a');
  a.href = url; a.download = att.fileName || att.name; a.target = '_blank';
  a.click();
  showToast('Downloading: ' + (att.fileName || att.name), 'success');
}

function editAssetAttachment(assetId, typeKey, attId) {
  const asset = (AppState.data[typeKey]||[]).find(a => a.id === assetId);
  if (!asset) return;
  const att = (asset.attachments||[]).find(a => a.id === attId);
  if (!att) return;

  $('#genericModalTitle').textContent = 'Edit Attachment Metadata';
  $('#genericModalBody').innerHTML = `
    <div style="background:var(--bg-hover);padding:8px;border-radius:6px;margin-bottom:12px;font-size:11px">
      <i class="fas fa-file" style="margin-right:5px"></i>${att.fileName || att.name}
    </div>
    <div class="form-grid">
      <div class="form-group"><label class="form-label">Document Type</label>
        <select class="form-select" id="attCatE">
          ${['MSDS','Calibration','Insurance','Permit','Manual','Photo','Other'].map(c=>`<option value="${c}" ${att.category===c?'selected':''}>${c}</option>`).join('')}
        </select>
      </div>
      <div class="form-group"><label class="form-label">Expiry Date</label>
        <input type="date" class="form-input" id="attExpiryE" value="${att.expiryDate||''}">
      </div>
    </div>
    <div class="form-group"><label class="form-label">Name / Title</label>
      <input class="form-input" id="attNameE" value="${att.name||''}">
    </div>
    <div class="form-group"><label class="form-label">Notes</label>
      <input class="form-input" id="attNotesE" value="${att.notes||''}">
    </div>
  `;
  $('#genericModalFooter').innerHTML = `
    <button class="btn btn-secondary" onclick="showAssetDetail('${assetId}','${typeKey}')">Back</button>
    <button class="btn btn-primary" onclick="_saveAssetAttachmentMeta('${assetId}','${typeKey}','${attId}')">Save</button>
  `;
}

function _saveAssetAttachmentMeta(assetId, typeKey, attId) {
  const asset = (AppState.data[typeKey]||[]).find(a => a.id === assetId);
  if (!asset) return;
  const att = (asset.attachments||[]).find(a => a.id === attId);
  if (!att) return;
  att.name = document.getElementById('attNameE').value || att.name;
  att.category = document.getElementById('attCatE').value;
  att.expiryDate = document.getElementById('attExpiryE').value || null;
  att.notes = document.getElementById('attNotesE').value || '';
  AppState.save();
  showToast('Attachment updated', 'success');
  showAssetDetail(assetId, typeKey);
}

async function deleteAssetAttachment(assetId, typeKey, attId) {
  const isAdmin = (_currentUserProfile && _currentUserProfile.isAdmin) || false;
  if (!isAdmin) { showToast('Admin only', 'error'); return; }
  const asset = (AppState.data[typeKey]||[]).find(a => a.id === assetId);
  if (!asset) return;
  const att = (asset.attachments||[]).find(a => a.id === attId);
  if (!att) return;
  if (!confirm('Delete attachment "' + (att.name || att.fileName) + '"?\n\nThis will also delete the file from SharePoint.')) return;
  // Delete from SP
  if (att.spDriveId && att.spItemId) {
    try { await spDeleteFile(att.spDriveId, att.spItemId); } catch(e) { console.warn('SP delete:', e.message); }
  }
  asset.attachments = (asset.attachments||[]).filter(a => a.id !== attId);
  AppState.save();
  showToast('Attachment deleted', 'warning');
  showAssetDetail(assetId, typeKey);
}



function logUtilization(rid,rname,rtype){
// Look up name/type by id so callers only need to pass a safe identifier.
// The previous signature took rname/rtype as raw strings interpolated into
// an onclick attribute, which was a JS-string XSS surface if names contained
// quotes or angle brackets. Legacy rname/rtype params kept as fallbacks.
if(!rname||!rtype){
  const all=[...(AppState.data.equipment||[]),...(AppState.data.tools||[]),...(AppState.data.vehicles||[]),...(AppState.data.consumables||[]),...(AppState.data.materials||[])];
  const rec=all.find(x=>x&&x.id===rid);
  if(rec){rname=rname||rec.name||'';rtype=rtype||rec.type||'Equipment';}
}
AppState.data._quickLogId=rid;AppState.data._quickLogName=rname||'';AppState.data._quickLogType=rtype||'Equipment';
showLogUtilization();}

function showLogUtilization(){
const rid=AppState.data._quickLogId||'';
const rname=AppState.data._quickLogName||'';
const rtype=AppState.data._quickLogType||'Equipment';
const allAssets=[...(AppState.data.equipment||[]),...(AppState.data.tools||[]),...(AppState.data.vehicles||[])];
$('#genericModalTitle').textContent='Log Resource Utilization';
$('#genericModalBody').innerHTML=`<div class="form-grid">
<div class="form-group" style="grid-column:1/-1"><label class="form-label">Resource *</label>
<select class="form-select" id="ulRes" onchange="this.setAttribute('data-type',this.options[this.selectedIndex].dataset.rtype||'Equipment')">
${allAssets.map(a=>`<option value="${a.id}" data-rtype="${a.type}" ${a.id===rid?'selected':''}>${a.id} — ${a.name} (${a.type})</option>`).join('')}
</select></div>
<div class="form-group"><label class="form-label">Project</label><select class="form-select" id="ulProj">${(AppState.data.projects||[]).map(p=>`<option value="${p.id}">${p.id}</option>`).join('')}</select></div>
<div class="form-group"><label class="form-label">Date *</label><input class="form-input" type="date" id="ulDate" value="${new Date().toISOString().split('T')[0]}"></div>
<div class="form-group"><label class="form-label">Start Time</label><input class="form-input" type="time" id="ulStart" value="07:00"></div>
<div class="form-group"><label class="form-label">End Time</label><input class="form-input" type="time" id="ulEnd" value="17:00"></div>
<div class="form-group"><label class="form-label">Hours Used *</label><input class="form-input" type="number" id="ulHrs" value="10" step="0.5" min="0" max="24"></div>
<div class="form-group"><label class="form-label">Operator / Used By</label><input class="form-input" id="ulOp" placeholder="Name" value="${AppState.data.resources[0]?.name||''}"></div>
<div class="form-group"><label class="form-label">Utilization % (0-100)</label><input class="form-input" type="number" id="ulUtil" value="100" min="0" max="100"></div>
<div class="form-group" style="grid-column:1/-1"><label class="form-label">Activity / Work Description *</label><input class="form-input" id="ulAct" placeholder="Describe the work performed"></div>
<div class="form-group"><label class="form-label">Fuel Consumed (L)</label><input class="form-input" type="number" id="ulFuel" value="0" min="0"></div>
<div class="form-group"><label class="form-label">Notes</label><input class="form-input" id="ulNotes" placeholder="Any observations"></div>
</div>`;
$('#genericModalFooter').innerHTML=`<button class="btn btn-secondary" onclick="closeModal('genericModal')">Cancel</button><button class="btn btn-primary" onclick="saveUtilLog()"><i class="fas fa-save"></i> Save Log</button>`;
openModal('genericModal');}

function saveUtilLog(){
const sel=$('#ulRes');
const asset=[...(AppState.data.equipment||[]),...(AppState.data.tools||[]),...(AppState.data.vehicles||[])].find(a=>a.id===(sel?.value||''));
if(!AppState.data.utilizationLog)AppState.data.utilizationLog=[];
const log={id:'UL-'+((AppState.data.utilizationLog||[]).length+1).toString().padStart(3,'0'),
resourceId:sel?.value||'',resourceName:asset?.name||'Unknown',resourceType:asset?.type||'Equipment',
projectId:$('#ulProj')?.value||'',date:$('#ulDate')?.value||'',
startTime:$('#ulStart')?.value||'',endTime:$('#ulEnd')?.value||'',
hoursUsed:parseFloat($('#ulHrs')?.value)||0,operator:$('#ulOp')?.value||'',
activity:$('#ulAct')?.value||'',utilization:parseInt($('#ulUtil')?.value)||100,
fuelConsumed:parseFloat($('#ulFuel')?.value)||0,notes:$('#ulNotes')?.value||''};
if(!log.resourceId||!log.activity){showToast('Resource and Activity required','error');return;}
if(!AppState.data.utilizationLog)AppState.data.utilizationLog=[];
AppState.data.utilizationLog.push(log);
AppState.save();closeModal('genericModal');resTab='utilization';renderResources();showToast('Utilization logged','success');}

function deleteUtilLog(id){
  if(requestOrDelete('assetUtilization',id)){renderUtilizationTab();}
}

function showAddConsumable(){
$('#genericModalTitle').textContent='Add Consumable';
$('#genericModalBody').innerHTML=`<div class="form-grid">
<div class="form-group"><label class="form-label">Name *</label><input class="form-input" id="cName" placeholder="Item name"></div>
<div class="form-group"><label class="form-label">Category</label><input class="form-input" id="cCat" placeholder="e.g., Welding, PPE"></div>
<div class="form-group"><label class="form-label">Unit</label><input class="form-input" id="cUnit" placeholder="KG, PCS, L"></div>
<div class="form-group"><label class="form-label">Unit Cost (₱)</label><input class="form-input" type="number" id="cCost" placeholder="0"></div>
<div class="form-group"><label class="form-label">Qty on Hand</label><input class="form-input" type="number" id="cQty" placeholder="0"></div>
<div class="form-group"><label class="form-label">Min Stock Level</label><input class="form-input" type="number" id="cMin" placeholder="0"></div>
<div class="form-group"><label class="form-label">Reorder Qty</label><input class="form-input" type="number" id="cReorder" placeholder="0"></div>
<div class="form-group"><label class="form-label">Project <span style="font-weight:400;color:var(--text-muted)">(optional)</span></label><select class="form-select" id="cProj"><option value="N/A" selected>— Not Assigned (Warehouse) —</option>${(AppState.data.projects||[]).map(p=>`<option value="${p.id}">${p.id}${p.name?' — '+p.name.substring(0,30):''}</option>`).join('')}</select></div>
<div class="form-group" style="grid-column:1/-1"><label class="form-label">Supplier</label><input class="form-input" id="cSupp" placeholder="Supplier name"></div>
<div class="form-group" style="grid-column:1/-1"><label class="form-label">Notes</label><input class="form-input" id="cNotes" placeholder="Storage or handling notes"></div>
</div>`;
$('#genericModalFooter').innerHTML=`<button class="btn btn-secondary" onclick="closeModal('genericModal')">Cancel</button><button class="btn btn-primary" onclick="saveConsumable()">Add Item</button>`;
openModal('genericModal');}

function saveConsumable(){
const qty=parseFloat($('#cQty').value)||0;
const min=parseFloat($('#cMin').value)||0;
const item={id:'CON-'+((AppState.data.consumables||[]).length+1).toString().padStart(3,'0'),
name:$('#cName').value,type:'Consumable',category:$('#cCat').value,
unit:$('#cUnit').value,qtyOnHand:qty,minStock:min,
reorderQty:parseFloat($('#cReorder').value)||0,unitCost:parseFloat($('#cCost').value)||0,
projectId:$('#cProj').value,supplier:$('#cSupp').value,
status:qty<=min?'low-stock':'in-stock',notes:$('#cNotes').value};
if(!item.name){showToast('Name required','error');return;}
if(!AppState.data.consumables)AppState.data.consumables=[];
AppState.data.consumables.push(item);AppState.save();closeModal('genericModal');renderConsumablesTab();showToast('Consumable added','success');}

function showEditConsumable(id){
  const c=(AppState.data.consumables||[]).find(c=>c.id===id);
  if(!c){showToast('Consumable not found','error');return;}
  $('#genericModalTitle').textContent='Edit Consumable — '+c.name;
  $('#genericModalBody').innerHTML=`
  <div class="form-grid">
    <div class="form-group"><label class="form-label">Item ID</label><input class="form-input" id="ecId" value="${c.id}" readonly style="opacity:.6"></div>
    <div class="form-group"><label class="form-label">Item Name *</label><input class="form-input" id="ecName" value="${c.name||''}"></div>
    <div class="form-group"><label class="form-label">Category</label><input class="form-input" id="ecCat" value="${c.category||''}" placeholder="e.g., Welding, PPE, Civil"></div>
    <div class="form-group"><label class="form-label">Unit</label><input class="form-input" id="ecUnit" value="${c.unit||''}" placeholder="KG, PCS, L, M..."></div>
    <div class="form-group"><label class="form-label">Qty on Hand</label><input class="form-input" type="number" id="ecQty" value="${c.qtyOnHand||0}" min="0"></div>
    <div class="form-group"><label class="form-label">Min Stock Level</label><input class="form-input" type="number" id="ecMin" value="${c.minStock||0}" min="0"></div>
    <div class="form-group"><label class="form-label">Reorder Quantity</label><input class="form-input" type="number" id="ecReorder" value="${c.reorderQty||0}" min="0"></div>
    <div class="form-group"><label class="form-label">Unit Cost (₱)</label><input class="form-input" type="number" id="ecCost" value="${c.unitCost||0}" min="0"></div>
    <div class="form-group"><label class="form-label">Project <span style="font-weight:400;color:var(--text-muted)">(optional)</span></label><select class="form-select" id="ecProj"><option value="N/A" ${(c.projectId==='N/A'||!c.projectId)?'selected':''}>— Not Assigned (Warehouse) —</option>${(AppState.data.projects||[]).map(p=>`<option value="${p.id}" ${c.projectId===p.id?'selected':''}>${p.id}${p.name?' — '+p.name.substring(0,30):''}</option>`).join('')}</select></div>
    <div class="form-group"><label class="form-label">Supplier</label><input class="form-input" id="ecSupp" value="${c.supplier||''}" placeholder="Supplier name"></div>
    <div class="form-group" style="grid-column:1/-1"><label class="form-label">Storage / Handling Notes</label><input class="form-input" id="ecNotes" value="${c.notes||''}" placeholder="Storage instructions, handling notes..."></div>
  </div>
  <div style="padding:10px;background:var(--bg-hover);border-radius:6px;margin-top:8px;font-size:11px;color:var(--text-secondary)">
    Total Value: <strong style="color:var(--accent-green);font-family:var(--font-mono)">₱${((c.qtyOnHand||0)*(c.unitCost||0)).toLocaleString()}</strong>
    &nbsp;·&nbsp; Status: <strong>${(c.qtyOnHand||0)<=(c.minStock||0)?'<span style="color:var(--accent-red)">Low Stock — Reorder Needed</span>':'<span style="color:var(--accent-green)">In Stock</span>'}</strong>
  </div>`;
  $('#genericModalFooter').innerHTML=`
  <button class="btn btn-danger" onclick="if(confirm('Delete this consumable?')){deleteMlConsumable('${id}');closeModal('genericModal');}"><i class="fas fa-trash"></i> Delete</button>
  <div style="flex:1"></div>
  <button class="btn btn-secondary" onclick="closeModal('genericModal')">Cancel</button>
  <button class="btn btn-primary" onclick="saveEditConsumable('${id}')"><i class="fas fa-save"></i> Save Changes</button>`;
  openModal('genericModal');
}

function saveEditConsumable(id){
  const c=(AppState.data.consumables||[]).find(c=>c.id===id);
  if(!c){showToast('Not found','error');return;}
  const name=$('#ecName')?.value?.trim();
  if(!name){showToast('Item name required','error');return;}
  c.name=name;
  c.category=$('#ecCat')?.value||c.category;
  c.unit=$('#ecUnit')?.value||c.unit;
  c.qtyOnHand=parseFloat($('#ecQty')?.value)||0;
  c.minStock=parseFloat($('#ecMin')?.value)||0;
  c.reorderQty=parseFloat($('#ecReorder')?.value)||0;
  c.unitCost=parseFloat($('#ecCost')?.value)||0;
  c.projectId=$('#ecProj')?.value||c.projectId;
  c.supplier=$('#ecSupp')?.value||'';
  c.notes=$('#ecNotes')?.value||'';
  c.status=c.qtyOnHand<=c.minStock?'low-stock':'in-stock';
  AppState.save();closeModal('genericModal');if($('#mlTabContent'))renderMlConsumables();showToast('Consumable updated','success');
}

function showAddThirdParty(){
$('#genericModalTitle').textContent='Add Third Party Vendor';
$('#genericModalBody').innerHTML=`<div class="form-grid">
<div class="form-group"><label class="form-label">Company Name *</label><input class="form-input" id="tpName" placeholder="Company name"></div>
<div class="form-group"><label class="form-label">Category</label><input class="form-input" id="tpCat" placeholder="e.g., Inspection, Labour"></div>
<div class="form-group" style="grid-column:1/-1"><label class="form-label">Services Provided</label><input class="form-input" id="tpSvc" placeholder="Describe services"></div>
<div class="form-group"><label class="form-label">Contact Person</label><input class="form-input" id="tpCP" placeholder="Name"></div>
<div class="form-group"><label class="form-label">Contact Number</label><input class="form-input" id="tpCN" placeholder="+63-xxx-xxx-xxxx"></div>
<div class="form-group"><label class="form-label">Project</label><select class="form-select" id="tpProj">${(AppState.data.projects||[]).map(p=>`<option value="${p.id}">${p.id}</option>`).join('')}</select></div>
<div class="form-group"><label class="form-label">Monthly Rate (₱)</label><input class="form-input" type="number" id="tpRate" placeholder="0"></div>
<div class="form-group"><label class="form-label">Contract Start</label><input class="form-input" type="date" id="tpCS" value="${new Date().toISOString().split('T')[0]}"></div>
<div class="form-group"><label class="form-label">Contract End</label><input class="form-input" type="date" id="tpCE"></div>
<div class="form-group"><label class="form-label">Accreditation</label><input class="form-input" id="tpAcc" placeholder="e.g., ISO 9001, N/A" value="N/A"></div>
<div class="form-group"><label class="form-label">Accred. Expiry</label><input class="form-input" id="tpAE" placeholder="YYYY-MM-DD or N/A" value="N/A"></div>
<div class="form-group"><label class="form-label">Notes</label><input class="form-input" id="tpNotes"></div>
</div>`;
$('#genericModalFooter').innerHTML=`<button class="btn btn-secondary" onclick="closeModal('genericModal')">Cancel</button><button class="btn btn-primary" onclick="saveThirdParty()">Add Vendor</button>`;
openModal('genericModal');}

function saveThirdParty(){
const tp={id:'TP-'+((AppState.data.thirdParty||[]).length+1).toString().padStart(3,'0'),
name:$('#tpName').value,type:'Third Party',category:$('#tpCat').value,
service:$('#tpSvc').value,contactPerson:$('#tpCP').value,contactNo:$('#tpCN').value,
projectId:$('#tpProj').value,status:'active',
contractStart:$('#tpCS').value,contractEnd:$('#tpCE').value,
monthlyRate:parseFloat($('#tpRate').value)||0,
accreditation:$('#tpAcc').value,accreditationExpiry:$('#tpAE').value,notes:$('#tpNotes').value};
if(!tp.name){showToast('Company name required','error');return;}
if(!AppState.data.thirdParty)AppState.data.thirdParty=[];
AppState.data.thirdParty.push(tp);AppState.save();closeModal('genericModal');renderThirdPartyTab();showToast('Vendor added','success');}



// ── Sync Manpower allocations → Manpower Tracking ─────────────────────────
// When a Manpower-type resource is allocated in a project, auto-create a
// corresponding Manpower Tracking record so it appears in the register.
function _syncManpowerAllocations(){
  AppState.ensureData();
  if(!AppState.data.resourceAllocations)return;
  if(!AppState.data.manpower)AppState.data.manpower=[];

  const mpAllocs=(AppState.data.resourceAllocations||[]).filter(a=>
    a.resourceType==='Manpower'||
    /manpow|labour|labor|welder|fitter|technician|operator|inspector|engineer|supervisor|foreman|leadman|helper|laborer|crew|scaffolder|rigger|painter|electrician|mechanic|driver/i.test(a.resourceName||'')
  );

  let changed=false;
  mpAllocs.forEach(a=>{
    // Check if a manpower record already exists for this allocation
    const exists=AppState.data.manpower.some(m=>m.allocId===a.id);
    if(!exists){
      const rec={
        id:'MP-'+((AppState.data.manpower||[]).length+1).toString().padStart(3,'0')+'-A',
        allocId:a.id,          // link back to allocation
        projectId:a.projectId,
        trade:a.resourceName||a.role||'Manpower',
        week:a.week||('W'+Math.ceil((new Date()-new Date(new Date().getFullYear(),0,1))/604800000)),
        planned:a.allocatedQty||0,
        actual:0,
        cost:a.plannedCost||0,
        shift:'Day',
        overtime:0,
        _fromAlloc:true  // flag so we know it came from allocation
      };
      AppState.data.manpower.push(rec);
      changed=true;
    }else{
      // Update planned qty if allocation changed
      const m=AppState.data.manpower.find(m=>m.allocId===a.id);
      if(m&&m.planned!==(a.allocatedQty||0)){
        m.planned=a.allocatedQty||0;
        if(a.plannedCost&&!m.cost)m.cost=a.plannedCost;
        changed=true;
      }
    }
  });
  if(changed){
    AppState.save();
  }
}
