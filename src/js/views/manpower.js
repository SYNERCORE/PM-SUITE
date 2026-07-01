function renderManpower(){
  // Sync Manpower-type allocations → Manpower Tracking records
  _syncManpowerAllocations();
const manpower=(AppState.data.manpower||[]).filter(m=>!m._deleted);
const totP=manpower.reduce((s,m)=>s+m.planned,0),totA=manpower.reduce((s,m)=>s+m.actual,0);
const totC=manpower.reduce((s,m)=>s+m.cost,0),totOT=manpower.reduce((s,m)=>s+m.overtime,0);
$('#manpower').innerHTML=`<div class="section-header" style="margin-bottom:14px">
<div><div class="section-title">Manpower Tracking</div><div class="section-sub">Edit any field inline — changes save instantly</div></div>
<div style="display:flex;gap:7px">
  <button class="btn btn-secondary btn-sm" onclick="showTradeMasterlist()"><i class="fas fa-list"></i> Trade Masterlist</button>
  <button class="btn btn-secondary btn-sm" onclick="importManpower()"><i class="fas fa-file-import"></i> Import CSV</button>
  <button class="btn btn-primary btn-sm" onclick="showAddManpowerRecord()"><i class="fas fa-plus"></i> Add Record</button>
</div>
</div>
<div class="grid grid-4" style="margin-bottom:14px">
${sc('fas fa-hard-hat','Planned Headcount',totP,'This week','#388bfd','rgba(56,139,253,.15)')}
${sc('fas fa-users','Actual Headcount',totA,totP>0?Math.round(totA/totP*100)+'% of plan':'0% of plan','#3fb950','rgba(63,185,80,.15)')}
${sc('fas fa-dollar-sign','Weekly Labor Cost',fmtNum(totC),'Direct labor','#f0a450','rgba(240,164,80,.15)')}
${sc('fas fa-clock','Overtime Hours',totOT,'This week','#f85149','rgba(248,81,73,.15)')}
</div>
<div class="grid grid-2" style="margin-bottom:14px">
<div class="card"><div class="card-title">Planned vs Actual by Project</div><canvas id="mpChart" height="160" style="width:100%"></canvas></div>
<div class="card"><div class="card-title">Manpower Distribution by Trade</div>
${manpower.map(m=>`<div class="resource-row">
<div class="resource-name" style="font-size:11px">${m.trade}</div>
<div class="resource-bar-wrap">
<div class="progress-bar" style="height:5px;margin-bottom:2px"><div class="progress-fill" style="width:${Math.min(100,(m.planned/Math.max(totP/manpower.length*1.5,1))*100)}%;background:rgba(56,139,253,.35)"></div></div>
<div class="progress-bar" style="height:5px"><div class="progress-fill" style="width:${Math.min(100,(m.actual/Math.max(totP/manpower.length*1.5,1))*100)}%;background:${m.actual>m.planned?'var(--accent-amber)':'var(--accent-blue)'}"></div></div>
<div style="display:flex;justify-content:space-between;font-size:9px;color:var(--text-secondary)"><span>Plan: ${m.planned}</span><span>Actual: ${m.actual}</span><span>OT: ${m.overtime}h</span></div>
</div><span class="badge badge-blue" style="font-size:9px">${m.projectId}</span></div>`).join('')}
</div></div>
<div class="card">
<div class="section-header" style="margin-bottom:10px">
<div class="section-title">Manpower Register <span style="font-size:11px;font-weight:400;color:var(--text-secondary)">— all fields editable</span></div>
<button class="btn btn-secondary btn-sm" onclick="exportCSV((AppState.data.manpower||[]).map(m=>[m.id,m.projectId,m.trade,m.planned,m.actual,m.actual-m.planned,m.cost,m.shift,m.overtime,m.week]),['ID','Project','Trade','Planned','Actual','Variance','Cost','Shift','OT hrs','Week'],'manpower.csv')"><i class="fas fa-download"></i> Export</button>
</div>
<div class="table-wrap"><table>
<thead><tr>
  <th style="padding:6px 6px;white-space:nowrap">ID</th>
  <th style="padding:6px 6px">Project</th>
  <th style="padding:6px 6px;min-width:220px">Trade / Discipline</th>
  <th style="padding:6px 6px">Week</th>
  <th style="padding:6px 6px;text-align:right">Planned</th>
  <th style="padding:6px 6px;text-align:right">Actual</th>
  <th style="padding:6px 6px;text-align:center">Variance</th>
  <th style="padding:6px 6px;text-align:right">Cost</th>
  <th style="padding:6px 6px">Shift</th>
  <th style="padding:6px 6px;text-align:right">OT Hrs</th>
  <th style="padding:6px 6px"></th>
</tr></thead>
<tbody id="mpTableBody">${mpRows(_pgSlice('manpower_reg',manpower))}</tbody>${_pgNav('manpower_reg',manpower,typeof renderManpower==='function'?renderManpower:null)}
</table>
<div style="display:flex;justify-content:space-between;padding:10px 11px;background:var(--bg-hover);font-size:12px;font-weight:700;border-top:2px solid var(--border)">
<span>TOTAL</span>
<span style="font-family:var(--font-mono)">${totP} planned</span>
<span style="font-family:var(--font-mono)">${totA} actual</span>
<span style="font-family:var(--font-mono);color:${totA-totP>=0?'var(--accent-green)':'var(--accent-red)'}">${totA-totP>=0?'+':''}${totA-totP}</span>
<span style="font-family:var(--font-mono)">${fmtCur(totC)}</span>
<span></span><span style="font-family:var(--font-mono)">${totOT}h OT</span>
<span></span>
</div>
</div></div>`;
setTimeout(()=>{const c=$('#mpChart');if(c){c.width=c.parentElement.offsetWidth-30;const labs=[...new Set(manpower.map(m=>m.projectId))];drawGrouped('mpChart',labs,labs.map(l=>manpower.filter(m=>m.projectId===l).reduce((s,m)=>s+m.planned,0)),labs.map(l=>manpower.filter(m=>m.projectId===l).reduce((s,m)=>s+m.actual,0)));}},50);}

function mpRows(manpower){
const cur=(AppState.data?.settings?.currency)||'PHP';
const sym={'PHP':'&#8369;','USD':'$','EUR':'&euro;','SAR':'&#xFDFC;','GBP':'&pound;','SGD':'S$'}[cur]||cur+' ';
if(!manpower.length)return`<tr><td colspan="11"><div class="empty-state"><i class="fas fa-hard-hat"></i><p>No manpower records. Click "Add Record".</p></div></td></tr>`;
return manpower.map(m=>{
  const v=m.actual-m.planned;
  // Support both string trades and object trades {name,...}
  const trades=(AppState.data.trades||[]).map(t=>typeof t==='string'?t:(t?.name||''));
  const tradeName=typeof m.trade==='string'?m.trade:(m.trade?.name||m.trade||'');
  return`<tr data-mpid="${m.id}">
<td style="font-size:10px;font-family:var(--font-mono);font-weight:700;white-space:nowrap;padding:4px 6px">${m.id}${m._fromAlloc?'<br><span style="font-size:8px;color:var(--accent-blue)">↑ alloc</span>':''}</td>
<td style="padding:3px 4px">
  <select class="form-select" style="height:30px;font-size:11px;min-width:88px" onchange="updateMp('${m.id}','projectId',this.value)">
    ${(AppState.data.projects||[]).map(p=>`<option value="${p.id}" ${m.projectId===p.id?'selected':''}>${p.id}</option>`).join('')}
  </select>
</td>
<td style="padding:3px 4px;min-width:220px">
  <select class="form-select" style="width:100%;min-width:215px;max-width:280px;height:28px;font-size:12px;font-weight:500"
    onchange="if(this.value==='__add__'){addNewTrade('${m.id}',this);}else{updateMp('${m.id}','trade',this.value);}">
    ${trades.sort().map(t=>`<option value="${t}" ${tradeName===t?'selected':''}>${t}</option>`).join('')}
    ${!trades.includes(tradeName)&&tradeName?`<option value="${tradeName}" selected>${tradeName} ★</option>`:''}
    <option value="__add__" style="color:var(--accent-blue)">&#xFF0B; Add new trade...</option>
  </select>
</td>
<td style="padding:3px 4px"><input class="form-input" value="${m.week||''}" style="width:52px;height:26px;font-size:11px;text-align:center" onchange="updateMp('${m.id}','week',this.value)"></td>
<td style="padding:3px 4px"><input class="form-input" type="number" value="${m.planned}" style="width:68px;height:26px;font-family:var(--font-mono);font-size:11px;text-align:right" onchange="updateMp('${m.id}','planned',+this.value);setTimeout(renderManpower,700)"></td>
<td style="padding:3px 4px"><input class="form-input" type="number" value="${m.actual}" style="width:68px;height:26px;font-family:var(--font-mono);font-size:11px;text-align:right;${m.actual>m.planned?'border-color:var(--accent-amber);font-weight:700':''}" onchange="updateMp('${m.id}','actual',+this.value);setTimeout(renderManpower,700)"></td>
<td style="font-family:var(--font-mono);font-weight:700;text-align:center;color:${v>=0?'var(--accent-green)':'var(--accent-red)'};">${v>=0?'+':''}${v}</td>
<td style="padding:3px 4px">
  <div style="display:flex;align-items:center;gap:3px">
    <span style="font-size:11px;color:var(--text-secondary);flex-shrink:0">${sym}</span>
    <input class="form-input" type="number" value="${m.cost}" style="width:90px;height:26px;font-family:var(--font-mono);font-size:11px;text-align:right" onchange="updateMp('${m.id}','cost',+this.value);setTimeout(renderManpower,700)">
  </div>
</td>
<td style="padding:3px 4px"><select class="form-select" style="height:30px;font-size:11px;min-width:90px" onchange="updateMp('${m.id}','shift',this.value)">${_getDropdown('manpower_shifts').map(s=>`<option value="${s}" ${m.shift===s?'selected':''}>${s}</option>`).join('')}</select></td>
<td style="padding:3px 4px"><input class="form-input" type="number" value="${m.overtime}" style="width:62px;height:30px;font-family:var(--font-mono);font-size:11px;text-align:right;${m.overtime>100?'color:var(--accent-amber)':''}" onchange="updateMp('${m.id}','overtime',+this.value);setTimeout(renderManpower,700)"></td>
<td style="padding:3px 6px"><button class="btn btn-danger btn-sm btn-icon" onclick="deleteMpRecord('${m.id}')" title="Delete"><i class="fas fa-trash"></i></button></td>
</tr>`;}).join('');
}

function showTradeMasterlist(){
  // Authoritative — never delegates. Prevents stored patches overriding with broken string logic.
  AppState.ensureData();
  if(!AppState.data.trades)AppState.data.trades=[];
  AppState.data.trades=AppState.data.trades.map(t=>
    typeof t==='string'?{name:t,dailyRate:0,monthlyRate:0,overtimeRate:0,currency:'PHP',notes:''}:t
  );
  const trades=AppState.data.trades.slice().sort((a,b)=>a.name.localeCompare(b.name));
  $('#genericModalTitle').textContent='Trade / Discipline Masterlist';
  $('#genericModalBody').innerHTML=`
  <div style="display:flex;gap:8px;margin-bottom:12px;flex-wrap:wrap">
    <input class="form-input" id="newTradeInput" placeholder="New trade name..."
      style="flex:1;min-width:180px" onkeydown="if(event.key==='Enter')addTradeToMasterlist()">
    <button class="btn btn-primary" onclick="addTradeToMasterlist()"><i class="fas fa-plus"></i> Add</button>
    <button class="btn btn-secondary" onclick="if(window.showTradeMasterlistImport)showTradeMasterlistImport()"><i class="fas fa-file-import"></i> Import</button>
    <button class="btn btn-secondary" onclick="if(window.exportTradeMasterlist)exportTradeMasterlist()"><i class="fas fa-file-export"></i> Export</button>
  </div>
  <div style="font-size:10px;color:var(--text-muted);margin-bottom:8px">
    ${trades.length} trade(s) · Edit rates inline · Monthly auto=Daily×22 · OT auto=Daily÷8×1.25
  </div>
  <div style="max-height:420px;overflow-y:auto;border:1px solid var(--border);border-radius:8px">
    <table style="width:100%;border-collapse:collapse;font-size:11px">
      <thead><tr style="background:var(--bg-hover);position:sticky;top:0;z-index:2">
        <th style="padding:7px 10px;text-align:left;border-bottom:2px solid var(--border)">Trade / Discipline</th>
        <th style="padding:7px 8px;text-align:right;border-bottom:2px solid var(--border)">Daily (₱)</th>
        <th style="padding:7px 8px;text-align:right;border-bottom:2px solid var(--border)">Monthly (₱)</th>
        <th style="padding:7px 8px;text-align:right;border-bottom:2px solid var(--border)">OT (₱/hr)</th>
        <th style="padding:7px 8px;text-align:left;border-bottom:2px solid var(--border)">Notes</th>
        <th style="padding:7px 6px;border-bottom:2px solid var(--border)"></th>
      </tr></thead>
      <tbody>
        ${trades.length?trades.map((t,i)=>{
          const used=(AppState.data.manpower||[]).filter(m=>m.trade===t.name).length;
          const esc=t.name.replace(/\\/g,'\\\\').replace(/'/g,"\\'").replace(/"/g,'&quot;');
          return '<tr style="border-top:1px solid var(--border);background:'+(i%2?'var(--bg-hover)':'transparent')+'">'
          +'<td style="padding:6px 10px"><div style="font-weight:600;font-size:12px">'+t.name+'</div>'
          +(used?'<div style="font-size:9px;color:var(--text-muted)">'+used+' record(s)</div>':'')+'</td>'
          +'<td style="padding:4px 8px"><input type="number" value="'+(t.dailyRate||'')+'" min="0" placeholder="0"'
          +' style="width:88px;text-align:right;font-family:var(--font-mono);font-size:11px;padding:3px 5px;background:var(--bg-input,#161b22);border:1px solid var(--border);border-radius:4px;color:var(--text-primary)"'
          +' onchange="updateTradeCost(\''+esc+'\',\'dailyRate\',this.value)"></td>'
          +'<td style="padding:4px 8px"><input type="number" value="'+(t.monthlyRate||'')+'" min="0" placeholder="auto"'
          +' style="width:96px;text-align:right;font-family:var(--font-mono);font-size:11px;padding:3px 5px;background:var(--bg-input,#161b22);border:1px solid var(--border);border-radius:4px;color:var(--text-primary)"'
          +' onchange="updateTradeCost(\''+esc+'\',\'monthlyRate\',this.value)"></td>'
          +'<td style="padding:4px 8px"><input type="number" value="'+(t.overtimeRate||'')+'" min="0" placeholder="auto"'
          +' style="width:76px;text-align:right;font-family:var(--font-mono);font-size:11px;padding:3px 5px;background:var(--bg-input,#161b22);border:1px solid var(--border);border-radius:4px;color:var(--text-primary)"'
          +' onchange="updateTradeCost(\''+esc+'\',\'overtimeRate\',this.value)"></td>'
          +'<td style="padding:4px 8px"><input type="text" value="'+(t.notes||'')+'" placeholder="—"'
          +' style="width:100%;font-size:11px;padding:3px 5px;background:var(--bg-input,#161b22);border:1px solid var(--border);border-radius:4px;color:var(--text-primary)"'
          +' onchange="updateTradeCost(\''+esc+'\',\'notes\',this.value)"></td>'
          +'<td style="padding:4px 6px;text-align:center"><button class="btn btn-danger btn-sm btn-icon" title="Remove"'
          +' onclick="deleteTrade(\''+esc+'\')"><i class="fas fa-trash"></i></button></td>'
          +'</tr>';
        }).join('')
        :'<tr><td colspan="6" style="padding:24px;text-align:center;color:var(--text-muted)"><i class="fas fa-hard-hat" style="font-size:28px;display:block;margin-bottom:8px;opacity:.3"></i>No trades yet — add one above or import CSV.</td></tr>'}
      </tbody>
    </table>
  </div>`;
  $('#genericModalFooter').innerHTML=`
    <button class="btn btn-secondary btn-sm" onclick="if(window.resetDefaultTrades)resetDefaultTrades()"><i class="fas fa-undo"></i> Reset Defaults</button>
    <div style="flex:1"></div>
    <button class="btn btn-secondary" onclick="closeModal('genericModal');if(typeof renderManpower==='function')renderManpower()">Close &amp; Apply</button>`;
  openModal('genericModal');
  window.showTradeMasterlist=showTradeMasterlist; // keep window ref pointing to this authoritative version
}

function updateTradeCost(tradeName,field,val){
  AppState.ensureData();
  const t=(AppState.data.trades||[]).find(x=>(x.name||x)===tradeName);
  if(!t)return;
  if(field==='notes'){t.notes=val||'';}
  else{
    const num=parseFloat(val)||0;
    t[field]=num;
    if(field==='dailyRate'&&num>0){
      if(!t.monthlyRate)t.monthlyRate=Math.round(num*22);
      if(!t.overtimeRate)t.overtimeRate=Math.round(num/8*1.25*100)/100;
    }
  }
  AppState.save();
}
window.updateTradeCost=updateTradeCost;


function addTradeToMasterlist(){
  const inp=document.getElementById('newTradeInput');
  const name=(inp?.value||'').trim();
  if(!name){showToast('Enter a trade name','error');return;}
  if(!AppState.data.trades)AppState.data.trades=[];
  if(AppState.data.trades.includes(name)){showToast('"'+name+'" already exists','warning');return;}
  AppState.data.trades=AppState.data.trades.map(t=>typeof t==='string'?{name:t,dailyRate:0,monthlyRate:0,overtimeRate:0,currency:'PHP',notes:''}:t);
  if(AppState.data.trades.some(t=>t.name===name)){showToast('"'+name+'" already exists','warning');return;}
  AppState.data.trades.push({name,dailyRate:0,monthlyRate:0,overtimeRate:0,currency:'PHP',notes:''});
  AppState.data.trades.sort((a,b)=>a.name.localeCompare(b.name));
  AppState.save();
  inp.value='';
  showTradeMasterlist();
  showToast('"'+name+'" added','success');
}

function renameTrade(oldName,btn){
  const newName=prompt('Rename "'+oldName+'" to:',oldName);
  if(!newName||!newName.trim()||newName.trim()===oldName)return;
  const n=newName.trim();
  AppState.data.trades=(AppState.data.trades||[]).map(t=>{
    if(typeof t==='string')return t===oldName?{name:n,dailyRate:0,monthlyRate:0,overtimeRate:0,currency:'PHP',notes:''}:{name:t,dailyRate:0,monthlyRate:0,overtimeRate:0,currency:'PHP',notes:''};
    if(t.name===oldName)t.name=n;
    return t;
  });
  (AppState.data.manpower||[]).forEach(m=>{if(m.trade===oldName)m.trade=n;});
  AppState.save();
  showTradeMasterlist();
  showToast('"'+oldName+'" → "'+n+'"','success');
}

function deleteTrade(name,btn){
  const usedBy=(AppState.data.manpower||[]).filter(m=>m.trade===name).length;
  const msg=usedBy?'Remove "'+name+'" from masterlist?\n\nThis trade is used in '+usedBy+' manpower record(s). The records will keep their current value but the dropdown option will be removed.':'Remove "'+name+'" from masterlist?';
  if(!confirm(msg))return;
  AppState.data.trades=(AppState.data.trades||[]).filter(t=>(typeof t==='string'?t:t.name)!==name);
  AppState.save();
  showTradeMasterlist();
  showToast('"'+name+'" removed from masterlist','warning');
}


function resetDefaultTrades(){
  var defaults=['Structural Fitter','Pipe Welder','TIG Welder','SMAW Welder','Pipe Fitter',
    'Rigger/Signalman','Scaffolder','Electrician','Instrumentation Tech','Mechanical Fitter',
    'Millwright','Insulation Worker','Painter/Blaster','Civil/Concrete Worker','Rebar Fixer',
    'Carpenter','Heavy Equipment Operator','Crane Operator','Forklift Operator','Safety Officer',
    'QC Inspector','Document Controller','Storekeeper','Driver','Helper/Laborer'];
  if(!confirm('Merge default 25 trades? Existing rates preserved.'))return;
  AppState.ensureData();
  if(!AppState.data.trades)AppState.data.trades=[];
  AppState.data.trades=AppState.data.trades.map(t=>
    typeof t==='string'?{name:t,dailyRate:0,monthlyRate:0,overtimeRate:0,currency:'PHP',notes:''}:t
  );
  defaults.forEach(function(name){
    if(!AppState.data.trades.some(function(t){return t.name===name;}))
      AppState.data.trades.push({name:name,dailyRate:0,monthlyRate:0,overtimeRate:0,currency:'PHP',notes:''});
  });
  AppState.save();
  showTradeMasterlist();
  showToast('Default trades merged','success');
}
window.resetDefaultTrades=resetDefaultTrades;

function addNewTrade(mpId, selectEl){
  const name=prompt('Enter new trade/discipline name:');
  if(!name||!name.trim()){selectEl.value=selectEl.options[0].value;return;}
  const tradeName=name.trim();
  if(!AppState.data.trades)AppState.data.trades=[];
  if(!AppState.data.trades.includes(tradeName)){
    AppState.data.trades=AppState.data.trades.map(t=>typeof t==='string'?{name:t,dailyRate:0,monthlyRate:0,overtimeRate:0,currency:'PHP',notes:''}:t);
    AppState.data.trades.push({name:tradeName,dailyRate:0,monthlyRate:0,overtimeRate:0,currency:'PHP',notes:''});
    AppState.data.trades.sort((a,b)=>a.name.localeCompare(b.name));
    AppState.save();
    showToast('Trade "'+tradeName+'" added to masterlist','success');
  }
  if(mpId)updateMp(mpId,'trade',tradeName);
  renderManpower();
}


function updateMp(id,field,val){
  const m=(AppState.data.manpower||[]).find(m=>m.id===id);
  if(!m)return;
  m[field]=val;
  clearTimeout(window._mpSaveTimer);
  window._mpSaveTimer=setTimeout(()=>AppState.save(),600);
}

function deleteMpRecord(id){
  const rec=(AppState.data.manpower||[]).find(m=>m.id===id);
  if(!rec)return;
  if(rec._fromAlloc&&rec.allocId){
    // Record was auto-synced from an allocation — give user the choice
    const removeAlloc=confirm(
      'This record was synced from a Resource Allocation ('+rec.allocId+').\n\n'+
      'Click OK to delete BOTH this manpower record AND its allocation.\n'+
      'Click Cancel to delete the manpower record only (it will re-appear on next sync unless you also remove the allocation).'
    );
    if(removeAlloc){
      const allocRec=(AppState.data.resourceAllocations||[]).find(a=>a.id===rec.allocId);
      if(allocRec){allocRec._deleted=true;allocRec._deletedAt=new Date().toISOString();allocRec._deletedBy=(typeof _currentUserProfile!=='undefined')?(_currentUserProfile?.name||_currentUserProfile?.email||'unknown'):'unknown';}
    }
  }else if(!confirm('Delete this manpower record?')){
    return;
  }
  // Soft-delete manpower record so it goes to Trash and survives sync
  rec._deleted=true;
  rec._deletedAt=new Date().toISOString();
  rec._deletedBy=(typeof _currentUserProfile!=='undefined')?(_currentUserProfile?.name||_currentUserProfile?.email||'unknown'):'unknown';
  AppState.save();
  renderManpower();
  showToast('Record moved to Trash','warning');
}

function showAddManpowerRecord(){
$('#genericModalTitle').textContent='Add Manpower Record';
$('#genericModalBody').innerHTML=`<div class="form-grid">
<div class="form-group"><label class="form-label">Project *</label><select class="form-select" id="mpProj">${(AppState.data.projects||[]).map(p=>`<option value="${p.id}">${p.id} — ${p.name.substring(0,25)}</option>`).join('')}</select></div>
<div class="form-group"><label class="form-label">Week / Period</label><input class="form-input" id="mpWeek" placeholder="e.g., W19" value="W${Math.ceil((new Date()-new Date(new Date().getFullYear(),0,1))/604800000)}"></div>
<div class="form-group" style="grid-column:1/-1"><label class="form-label">Trade / Discipline *</label><input class="form-input" id="mpTrade" placeholder="e.g., Pipe Welder, Civil Worker, Electrician"></div>
<div class="form-group"><label class="form-label">Planned Headcount *</label><input class="form-input" type="number" id="mpPlan" value="0" min="0"></div>
<div class="form-group"><label class="form-label">Actual Headcount</label><input class="form-input" type="number" id="mpAct" value="0" min="0"></div>
<div class="form-group"><label class="form-label">Weekly Labor Cost (₱)</label><input class="form-input" type="number" id="mpCost" value="0" min="0"></div>
<div class="form-group"><label class="form-label">Shift</label><select class="form-select" id="mpShift">${_getDropdown('manpower_shifts').map(s=>`<option>${s}</option>`).join('')}</select></div>
<div class="form-group"><label class="form-label">Overtime Hours</label><input class="form-input" type="number" id="mpOT" value="0" min="0"></div>
</div>`;
$('#genericModalFooter').innerHTML=`<button class="btn btn-secondary" onclick="closeModal('genericModal')">Cancel</button><button class="btn btn-primary" onclick="saveMpRecord()"><i class="fas fa-save"></i> Add Record</button>`;
openModal('genericModal');}

function saveMpRecord(){
if(!_req(['mpTrade','mpWeek'])){showToast('Fill in required fields','error');return;}
const rec={id:'MP-'+((AppState.data.manpower||[]).length+1).toString().padStart(3,'0'),projectId:$('#mpProj').value,trade:$('#mpTrade').value,week:$('#mpWeek').value,planned:parseInt($('#mpPlan').value)||0,actual:parseInt($('#mpAct').value)||0,cost:parseFloat($('#mpCost').value)||0,shift:$('#mpShift').value,overtime:parseInt($('#mpOT').value)||0};
if(!AppState.data.manpower)AppState.data.manpower=[];
AppState.data.manpower.push(rec);AppState.save();closeModal('genericModal');renderManpower();showToast('Manpower record added','success');}



// ── MANPOWER IMPORT ───────────────────────────────────────────────────────
function importManpower(){
  const template='ID,ProjectID,Trade,Planned,Actual,Cost,Shift,OTHrs,Week';
  const sampleRow='MP-001,PRJ-001,Pipe Welder,10,8,180000,Day,0,W22';
  $('#genericModalTitle').textContent='Import Manpower Records';
  $('#genericModalBody').innerHTML=`
  <div style="padding:12px;background:rgba(56,139,253,.08);border-radius:8px;margin-bottom:14px;border-left:3px solid var(--accent-blue)">
    <div style="font-size:13px;font-weight:600;margin-bottom:6px"><i class="fas fa-info-circle" style="color:var(--accent-blue);margin-right:6px"></i>Import Instructions</div>
    <ol style="font-size:11px;color:var(--text-secondary);padding-left:18px;line-height:2">
      <li>Download the template — fill it in Excel or any spreadsheet app</li>
      <li><strong>Shift</strong> must be: <code style="background:var(--bg-hover);padding:1px 5px;border-radius:3px">Day, Night, Day/Night, Rotating</code></li>
      <li><strong>Week</strong> format: W22, W23 etc. &nbsp;·&nbsp; <strong>ID</strong> leave blank to auto-assign</li>
      <li>Save as <strong>.csv</strong> and upload below</li>
    </ol>
  </div>
  <div style="display:flex;gap:8px;margin-bottom:14px">
    <button class="btn btn-secondary btn-sm" onclick="downloadTemplate('${template}','manpower_template.csv')"><i class="fas fa-file-excel" style="color:#217346"></i> Download Template</button>
  </div>
  <div class="form-group">
    <label class="form-label">Select CSV File *</label>
    <input type="file" id="mpImportFile" accept=".csv" class="form-input" style="padding:4px" onchange="previewMpImport(this)">
  </div>
  <div id="mpImportPreview" style="margin-top:10px"></div>`;
  window._mpImportRows=null;
  $('#genericModalFooter').innerHTML=`
    <button class="btn btn-secondary" onclick="closeModal('genericModal')">Cancel</button>
    <button class="btn btn-primary" id="mpImportBtn" onclick="executeMpImport()" disabled><i class="fas fa-file-import"></i> Import Records</button>`;
  openModal('genericModal');
}

function previewMpImport(input){
  const file=input.files[0];if(!file)return;
  const reader=new FileReader();
  reader.onload=ev=>{
    try{
      const rows=parseCSVToRows(ev.target.result);
      window._mpImportRows=rows;
      const btn=$('#mpImportBtn');if(btn)btn.removeAttribute('disabled');
      const prev=$('#mpImportPreview');
      if(!prev)return;
      const headers=Object.keys(rows[0]||{});
      const show=rows.slice(0,5);
      prev.innerHTML=`<div style="margin-bottom:8px;font-size:12px;font-weight:600;color:var(--accent-green)"><i class="fas fa-check-circle" style="margin-right:5px"></i>${rows.length} rows ready</div>
      <div style="overflow-x:auto;max-height:150px;border:1px solid var(--border);border-radius:6px">
        <table style="width:100%;font-size:10px;border-collapse:collapse">
          <thead style="background:var(--bg-hover)"><tr>${headers.map(h=>`<th style="padding:5px 8px;text-align:left;font-weight:600;border-bottom:1px solid var(--border)">${h}</th>`).join('')}</tr></thead>
          <tbody>${show.map((r,i)=>`<tr style="${i%2?'background:var(--bg-hover)':''}">${headers.map(h=>`<td style="padding:4px 8px;border-bottom:1px solid var(--border)">${r[h]||''}</td>`).join('')}</tr>`).join('')}
          ${rows.length>5?`<tr><td colspan="${headers.length}" style="padding:5px 8px;text-align:center;color:var(--text-muted)">... ${rows.length-5} more rows</td></tr>`:''}</tbody>
        </table>
      </div>`;
    }catch(e){const p=$('#mpImportPreview');if(p)p.innerHTML=`<div style="color:var(--accent-red);padding:10px">Error: ${e.message}</div>`;}
  };
  reader.readAsText(file);
}

function executeMpImport(){
  const rows=window._mpImportRows;
  if(!rows||!rows.length){showToast('No data to import','error');return;}
  if(!AppState.data.manpower)AppState.data.manpower=[];
  const list=AppState.data.manpower;
  const norm=s=>String(s||'').replace(/\s+/g,'').toLowerCase();
  let added=0,updated=0,skipped=0;
  rows.forEach((row,i)=>{
    const n=s=>row[s]!==undefined?row[s]:Object.entries(row).find(([k])=>norm(k)===norm(s))?.[1]??'';
    const trade=String(n('Trade')||n('trade')||'').trim();
    if(!trade){skipped++;return;}
    const rec={
      id:String(n('ID')||n('id')||'').trim()||'MP-'+String(list.length+added+1).padStart(3,'0'),
      projectId:String(n('ProjectID')||n('Project ID')||n('project')||'').trim()||'—',
      trade,
      planned:parseFloat(n('Planned')||n('planned')||0)||0,
      actual:parseFloat(n('Actual')||n('actual')||0)||0,
      cost:parseFloat(n('Cost')||n('cost')||0)||0,
      shift:String(n('Shift')||n('shift')||'Day').trim()||'Day',
      overtime:parseFloat(n('OTHrs')||n('OT hrs')||n('overtime')||0)||0,
      week:String(n('Week')||n('week')||'').trim(),
    };
    const existing=list.findIndex(m=>m.id===rec.id);
    if(existing>=0){list[existing]={...list[existing],...rec};updated++;}
    else{list.push(rec);added++;}
  });
  AppState.save();
  closeModal('genericModal');
  window._mpImportRows=null;
  renderManpower();
  showToast(`Manpower import: ${added} added, ${updated} updated, ${skipped} skipped`,'success',4000);
}
