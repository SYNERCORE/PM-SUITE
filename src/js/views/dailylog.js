/* ============================================================================
   DAILY MANPOWER LOG  (per-project timesheet)
   Logs the ACTUAL named personnel who worked each day, the work they did,
   and their regular / OT / night hours, then computes labour cost from each
   person's salary (hourlyRate) using editable premium multipliers.
   Entity:  AppState.data.manpowerLogs[]
   Config:  AppState.data.payMultipliers   (PH DOLE-style defaults, editable)
   ========================================================================== */

/* ---- premium multipliers (defaults = PH DOLE; night diff set to SY3 20%) ---- */
function _mplDefaults(){
  return {
    ordinary:  {base:1.00, ot:1.25},   // ordinary working day
    restday:   {base:1.30, ot:1.69},   // rest day (day-off)
    special:   {base:1.30, ot:1.69},   // special non-working holiday
    regholiday:{base:2.00, ot:2.60},   // regular holiday
    nightDiff: 0.20                     // +20% adder for hours in 10pm-6am window
  };
}
function _mplMult(){
  const d=_mplDefaults();
  const c=AppState.data.payMultipliers||{};
  const out={nightDiff:(c.nightDiff!=null?+c.nightDiff:d.nightDiff)};
  ['ordinary','restday','special','regholiday'].forEach(k=>{
    const s=c[k]||{};
    out[k]={base:(s.base!=null?+s.base:d[k].base), ot:(s.ot!=null?+s.ot:d[k].ot)};
  });
  return out;
}
const _MPL_DAYTYPES=[
  {k:'ordinary',  label:'Ordinary day'},
  {k:'restday',   label:'Rest day (day-off)'},
  {k:'special',   label:'Special non-working holiday'},
  {k:'regholiday',label:'Regular holiday'}
];
function _mplDayLabel(k){ const d=_MPL_DAYTYPES.find(x=>x.k===k); return d?d.label:(k||'Ordinary day'); }

/* ---- personnel register (named people with an hourly salary) ---- */
function _mplPersonnel(){ return (AppState.data.resources||[]).filter(r=>!r._deleted); }
function _mplRateFor(resId){
  const p=_mplPersonnel().find(r=>r.id===resId);
  if(!p) return 0;
  if(p.hourlyRate>0) return +p.hourlyRate;
  // fallback: trade daily rate / 8
  const t=(AppState.data.trades||[]).find(t=>typeof t==='object'&&(t.name===p.role));
  if(t&&t.dailyRate>0) return +(t.dailyRate/8).toFixed(2);
  return 0;
}

/* ---- cost of a single log entry ---- */
function _mplCost(e){
  const M=_mplMult();
  const dt=M[e.dayType]||M.ordinary;
  const rate=+e.rate||0;
  const reg=+e.regHrs||0, ot=+e.otHrs||0, night=+e.nightHrs||0;
  const regCost   = reg  * rate * dt.base;
  const otCost    = ot   * rate * dt.ot;
  const nightCost = night* rate * dt.base * M.nightDiff;   // 20% adder on night-window hours
  return Math.round((regCost+otCost+nightCost)*100)/100;
}
function _mplMoney(n){ return '₱'+(Number(n)||0).toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2}); }
function _mplNum(n){ return (Number(n)||0).toLocaleString(undefined,{maximumFractionDigits:2}); }

/* ---- per-project entries, newest first ---- */
function _mplEntries(pid){
  return (AppState.data.manpowerLogs||[])
    .filter(e=>e.projectId===pid && !e._deleted)
    .sort((a,b)=> (b.date||'').localeCompare(a.date||'') || (a.personName||'').localeCompare(b.personName||''));
}

/* ============================ MAIN RENDER ============================ */
function renderManpowerLog(){
  const pid=detailProjectId;
  const p=(AppState.data.projects||[]).find(x=>x.id===pid);
  let entries=_mplEntries(pid);

  // date filter
  const dates=[...new Set(entries.map(e=>e.date))].sort().reverse();
  const flt=window._mplDateFilter||'';
  if(flt) entries=entries.filter(e=>e.date===flt);

  const totReg=entries.reduce((s,e)=>s+(+e.regHrs||0),0);
  const totOT =entries.reduce((s,e)=>s+(+e.otHrs||0),0);
  const totNight=entries.reduce((s,e)=>s+(+e.nightHrs||0),0);
  const totHrs=totReg+totOT;
  const totCost=entries.reduce((s,e)=>s+_mplCost(e),0);
  const headcount=new Set(entries.map(e=>e.resourceId||e.personName)).size;
  const noPersonnel=_mplPersonnel().length===0;

  const tile=(lbl,val,color)=>`<div class="mpl-kpi"><div class="mpl-lbl">${lbl}</div><div class="mpl-num" style="${color?'color:'+color:''}">${val}</div></div>`;

  $('#detailTabContent').innerHTML=`
  <style>
    .mpl-wrap{font-size:12px}
    .mpl-bar{display:flex;flex-wrap:wrap;gap:10px;align-items:center;justify-content:space-between;margin-bottom:14px}
    .mpl-g{display:grid;grid-template-columns:repeat(5,1fr);gap:10px;margin-bottom:14px}
    @media(max-width:860px){.mpl-g{grid-template-columns:repeat(2,1fr)}}
    .mpl-kpi{background:var(--bg-elevated,rgba(255,255,255,.03));border:1px solid var(--border-subtle,rgba(255,255,255,.08));border-radius:10px;padding:12px 14px}
    .mpl-lbl{font-size:10px;text-transform:uppercase;letter-spacing:.5px;color:var(--text-muted);margin-bottom:5px}
    .mpl-num{font-size:20px;font-weight:700;font-family:var(--font-mono)}
    .mpl-tbl{width:100%;border-collapse:collapse;font-size:11.5px}
    .mpl-tbl th{text-align:left;padding:7px 8px;border-bottom:2px solid var(--border-subtle,rgba(255,255,255,.12));font-size:10px;text-transform:uppercase;letter-spacing:.4px;color:var(--text-muted);white-space:nowrap}
    .mpl-tbl td{padding:7px 8px;border-bottom:1px solid var(--border-subtle,rgba(255,255,255,.06));vertical-align:top}
    .mpl-tbl td.r,.mpl-tbl th.r{text-align:right;font-family:var(--font-mono)}
    .mpl-tbl tr:hover td{background:rgba(255,255,255,.02)}
    .mpl-tot td{font-weight:700;border-top:2px solid var(--border-subtle,rgba(255,255,255,.15));background:rgba(255,255,255,.02)}
    .mpl-tag{display:inline-block;padding:1px 7px;border-radius:9px;font-size:9.5px;font-weight:600}
    .mpl-src{font-size:10px;color:var(--text-muted);margin-top:8px}
    .mpl-empty{text-align:center;color:var(--text-muted);padding:26px}
  </style>
  <div class="mpl-wrap">
    <div class="mpl-bar">
      <div>
        <div style="font-size:15px;font-weight:700"><i class="fas fa-user-clock" style="color:var(--accent-cyan);margin-right:7px"></i>Daily Manpower Log</div>
        <div style="font-size:11px;color:var(--text-muted);margin-top:2px">${esc(p?p.name:pid)} — actual personnel, hours &amp; labour cost per day</div>
      </div>
      <div style="display:flex;gap:7px;align-items:center;flex-wrap:wrap">
        <select class="form-select" style="height:32px;font-size:11px;min-width:150px" onchange="window._mplDateFilter=this.value;renderManpowerLog()">
          <option value="">All dates (${dates.length})</option>
          ${dates.map(d=>`<option value="${d}" ${flt===d?'selected':''}>${d}</option>`).join('')}
        </select>
        <button class="btn btn-secondary btn-sm" onclick="showPayMultipliers()" title="Edit premium pay multipliers"><i class="fas fa-percent"></i> Multipliers</button>
        <button class="btn btn-secondary btn-sm" onclick="exportManpowerLog()"><i class="fas fa-download"></i> Export</button>
        <button class="btn btn-primary btn-sm" onclick="showManpowerLogForm(null)"><i class="fas fa-plus"></i> Log Day</button>
      </div>
    </div>

    <div class="mpl-g">
      ${tile('Entries', entries.length)}
      ${tile('Personnel', headcount)}
      ${tile('Man-hours', _mplNum(totHrs))}
      ${tile('OT / Night hrs', _mplNum(totOT)+' / '+_mplNum(totNight))}
      ${tile('Labour Cost', _mplMoney(totCost), 'var(--accent-cyan)')}
    </div>

    ${noPersonnel?`<div class="card" style="padding:14px;border-left:3px solid var(--accent-amber);margin-bottom:12px;font-size:11.5px">
      <i class="fas fa-exclamation-triangle" style="color:var(--accent-amber);margin-right:6px"></i>
      No personnel in the register yet. Add people (with their hourly rate) in <b>Masterlist &rarr; Personnel</b> so you can log them here and compute salary cost.</div>`:''}

    <div class="card" style="padding:14px;overflow-x:auto">
      <table class="mpl-tbl">
        <thead><tr>
          <th>Date</th><th>Personnel</th><th>Role</th><th>Work Done</th>
          <th class="r">Reg</th><th class="r">OT</th><th class="r">Night</th>
          <th>Day Type</th><th class="r">Rate/hr</th><th class="r">Cost</th><th></th>
        </tr></thead>
        <tbody>
          ${entries.length?entries.map(e=>{
            const cost=_mplCost(e);
            return `<tr>
              <td style="white-space:nowrap">${esc(e.date||'')}</td>
              <td>${esc(e.personName||'')}</td>
              <td style="color:var(--text-secondary)">${esc(e.role||'')}</td>
              <td style="max-width:220px">${esc(e.workDone||'')||'<span style="color:var(--text-muted)">—</span>'}</td>
              <td class="r">${_mplNum(e.regHrs)}</td>
              <td class="r" style="${(+e.otHrs)>0?'color:var(--accent-amber)':''}">${_mplNum(e.otHrs)}</td>
              <td class="r" style="${(+e.nightHrs)>0?'color:var(--accent-purple,#bc8cff)':''}">${_mplNum(e.nightHrs)}</td>
              <td><span class="mpl-tag" style="background:${_mplDayColor(e.dayType)}">${_mplDayLabel(e.dayType)}</span></td>
              <td class="r">${_mplMoney(e.rate)}</td>
              <td class="r" style="font-weight:600">${_mplMoney(cost)}</td>
              <td style="white-space:nowrap">
                <button class="btn btn-secondary btn-sm btn-icon" onclick="showManpowerLogForm('${e.id}')" title="Edit"><i class="fas fa-edit"></i></button>
                <button class="btn btn-secondary btn-sm btn-icon" onclick="deleteManpowerLog('${e.id}')" title="Delete"><i class="fas fa-trash"></i></button>
              </td>
            </tr>`;}).join(''):`<tr><td colspan="11"><div class="mpl-empty"><i class="fas fa-user-clock" style="font-size:22px;display:block;margin-bottom:8px"></i>No daily logs yet. Click <b>Log Day</b> to record who worked and what they did.</div></td></tr>`}
          ${entries.length?`<tr class="mpl-tot">
            <td colspan="4">TOTAL${flt?' ('+flt+')':''}</td>
            <td class="r">${_mplNum(totReg)}</td><td class="r">${_mplNum(totOT)}</td><td class="r">${_mplNum(totNight)}</td>
            <td></td><td></td><td class="r" style="color:var(--accent-cyan)">${_mplMoney(totCost)}</td><td></td>
          </tr>`:''}
        </tbody>
      </table>
      <div class="mpl-src">Cost = (Reg hrs &times; rate &times; day-type base) + (OT hrs &times; rate &times; day-type OT) + (Night hrs &times; rate &times; base &times; ${(_mplMult().nightDiff*100)}% night diff). Rate is each person's hourly salary, captured when the entry is saved.</div>
    </div>
  </div>`;
}

function _mplDayColor(k){
  return k==='regholiday'?'rgba(248,81,73,.22)':
         k==='special'   ?'rgba(240,164,80,.22)':
         k==='restday'   ?'rgba(188,140,255,.20)':
                          'rgba(56,139,253,.18)';
}

/* ============================ ADD / EDIT FORM ============================ */
function showManpowerLogForm(id){
  const pid=detailProjectId;
  const edit=id?(AppState.data.manpowerLogs||[]).find(e=>e.id===id):null;
  const people=_mplPersonnel();
  const today=new Date().toISOString().slice(0,10);
  const curRes=edit?edit.resourceId:'';
  $('#genericModalTitle').textContent=edit?'Edit Daily Log':'Log Day — Manpower';
  $('#genericModalBody').innerHTML=`<div class="form-grid">
    <div class="form-group"><label class="form-label">Date *</label><input class="form-input" type="date" id="mplDate" value="${edit?edit.date:today}"></div>
    <div class="form-group"><label class="form-label">Personnel *</label>
      <select class="form-select" id="mplPerson" onchange="_mplSyncRate()">
        <option value="">— select —</option>
        ${people.map(r=>`<option value="${r.id}" data-role="${esc(r.role||'')}" data-rate="${r.hourlyRate||0}" ${curRes===r.id?'selected':''}>${esc(r.name)}${r.role?' ('+esc(r.role)+')':''}</option>`).join('')}
      </select>
    </div>
    <div class="form-group" style="grid-column:1/-1"><label class="form-label">Work Done</label><input class="form-input" id="mplWork" placeholder="e.g., Boiler tube welding — 12 joints" value="${edit?esc(edit.workDone||''):''}"></div>
    <div class="form-group"><label class="form-label">Regular Hours *</label><input class="form-input" type="number" id="mplReg" min="0" step="0.5" value="${edit?edit.regHrs:8}"></div>
    <div class="form-group"><label class="form-label">Overtime Hours</label><input class="form-input" type="number" id="mplOT" min="0" step="0.5" value="${edit?edit.otHrs:0}"></div>
    <div class="form-group"><label class="form-label">Night Hours <span style="font-weight:400;color:var(--text-muted)">(10pm–6am, +${(_mplMult().nightDiff*100)}%)</span></label><input class="form-input" type="number" id="mplNight" min="0" step="0.5" value="${edit?edit.nightHrs:0}"></div>
    <div class="form-group"><label class="form-label">Day Type *</label><select class="form-select" id="mplDayType">${_MPL_DAYTYPES.map(d=>`<option value="${d.k}" ${((edit&&edit.dayType)||'ordinary')===d.k?'selected':''}>${d.label}</option>`).join('')}</select></div>
    <div class="form-group"><label class="form-label">Hourly Rate (₱) *</label><input class="form-input" type="number" id="mplRate" min="0" step="0.01" value="${edit?edit.rate:0}"><div style="font-size:10px;color:var(--text-muted);margin-top:3px">Auto-filled from the person's salary; override if needed.</div></div>
  </div>
  <div style="margin-top:10px;padding:10px 12px;background:rgba(56,139,253,.08);border-radius:8px;font-size:11.5px">
    Estimated cost: <b id="mplPreview" style="font-family:var(--font-mono)">₱0.00</b>
  </div>`;
  $('#genericModalFooter').innerHTML=`<button class="btn btn-secondary" onclick="closeModal('genericModal')">Cancel</button><button class="btn btn-primary" onclick="saveManpowerLog(${edit?`'${edit.id}'`:'null'})"><i class="fas fa-save"></i> ${edit?'Save':'Add Entry'}</button>`;
  openModal('genericModal');
  ['mplReg','mplOT','mplNight','mplRate','mplDayType'].forEach(fid=>{const el=$('#'+fid);if(el)el.addEventListener('input',_mplPreview);});
  if(!edit)_mplSyncRate(); else _mplPreview();
}
function _mplSyncRate(){
  const sel=$('#mplPerson'); if(!sel)return;
  const opt=sel.options[sel.selectedIndex];
  if(opt&&opt.value){ const rate=+opt.getAttribute('data-rate')||0; if($('#mplRate'))$('#mplRate').value=rate; }
  _mplPreview();
}
function _mplPreview(){
  const e={regHrs:+$('#mplReg').value||0, otHrs:+$('#mplOT').value||0, nightHrs:+$('#mplNight').value||0, dayType:$('#mplDayType').value, rate:+$('#mplRate').value||0};
  if($('#mplPreview'))$('#mplPreview').textContent=_mplMoney(_mplCost(e));
}
function saveManpowerLog(id){
  const sel=$('#mplPerson'); const resId=sel?sel.value:'';
  if(!resId){showToast('Select a person','error');return;}
  if(!$('#mplDate').value){showToast('Pick a date','error');return;}
  const opt=sel.options[sel.selectedIndex];
  const personName=opt?opt.textContent.replace(/\s*\(.*\)$/,''):'';
  const role=opt?(opt.getAttribute('data-role')||''):'';
  const rec={
    projectId:detailProjectId,
    date:$('#mplDate').value,
    resourceId:resId,
    personName:personName,
    role:role,
    workDone:$('#mplWork').value.trim(),
    regHrs:+$('#mplReg').value||0,
    otHrs:+$('#mplOT').value||0,
    nightHrs:+$('#mplNight').value||0,
    dayType:$('#mplDayType').value||'ordinary',
    rate:+$('#mplRate').value||0,
    _lastModified:new Date().toISOString()
  };
  if(!AppState.data.manpowerLogs)AppState.data.manpowerLogs=[];
  if(id){
    const i=AppState.data.manpowerLogs.findIndex(e=>e.id===id);
    if(i>=0)AppState.data.manpowerLogs[i]=Object.assign({},AppState.data.manpowerLogs[i],rec);
  }else{
    rec.id='MPL-'+Date.now().toString(36)+'-'+Math.floor(Math.random()*1000);
    rec.enteredBy=(AppState.currentUser&&AppState.currentUser.name)||'';
    AppState.data.manpowerLogs.push(rec);
  }
  AppState.save();
  closeModal('genericModal');
  renderManpowerLog();
  showToast(id?'Daily log updated':'Day logged','success');
}
function deleteManpowerLog(id){
  if(!confirm('Delete this daily log entry?'))return;
  const i=(AppState.data.manpowerLogs||[]).findIndex(e=>e.id===id);
  if(i>=0){ AppState.data.manpowerLogs[i]._deleted=true; AppState.data.manpowerLogs[i]._lastModified=new Date().toISOString();
    if(typeof _spTrackDeletion==='function'){ try{_spTrackDeletion('manpowerLogs',id);}catch(e){} }
    AppState.save(); renderManpowerLog(); showToast('Entry deleted','warning'); }
}
function exportManpowerLog(){
  const pid=detailProjectId;
  const rows=_mplEntries(pid).map(e=>[e.date,e.personName,e.role,e.workDone,e.regHrs,e.otHrs,e.nightHrs,_mplDayLabel(e.dayType),e.rate,_mplCost(e)]);
  if(typeof exportCSV==='function')
    exportCSV(rows,['Date','Personnel','Role','Work Done','Reg Hrs','OT Hrs','Night Hrs','Day Type','Rate/hr','Cost'],'daily_manpower_'+pid+'.csv');
}

/* ============================ MULTIPLIERS SETTINGS ============================ */
function showPayMultipliers(){
  const M=_mplMult();
  const row=(k,label)=>`<tr>
    <td style="padding:6px 8px">${label}</td>
    <td style="padding:6px 8px"><input class="form-input" type="number" step="0.01" min="0" id="mplm_${k}_base" value="${M[k].base}" style="width:90px;height:30px;font-family:var(--font-mono)"></td>
    <td style="padding:6px 8px"><input class="form-input" type="number" step="0.01" min="0" id="mplm_${k}_ot" value="${M[k].ot}" style="width:90px;height:30px;font-family:var(--font-mono)"></td>
  </tr>`;
  $('#genericModalTitle').textContent='Premium Pay Multipliers';
  $('#genericModalBody').innerHTML=`
    <div style="font-size:11.5px;color:var(--text-secondary);margin-bottom:10px">Applied to each person's hourly salary. Defaults follow Philippine DOLE rules; adjust to match SY3 policy.</div>
    <table style="width:100%;border-collapse:collapse;font-size:12px">
      <thead><tr style="color:var(--text-muted);font-size:10px;text-transform:uppercase">
        <th style="text-align:left;padding:6px 8px">Day Type</th><th style="text-align:left;padding:6px 8px">First 8 hrs ×</th><th style="text-align:left;padding:6px 8px">Overtime ×</th>
      </tr></thead>
      <tbody>
        ${row('ordinary','Ordinary day')}
        ${row('restday','Rest day (day-off)')}
        ${row('special','Special non-working holiday')}
        ${row('regholiday','Regular holiday')}
      </tbody>
    </table>
    <div class="form-group" style="margin-top:14px;max-width:260px">
      <label class="form-label">Night differential (10pm–6am)</label>
      <div style="display:flex;align-items:center;gap:6px">
        <input class="form-input" type="number" step="1" min="0" id="mplm_night" value="${Math.round(M.nightDiff*100)}" style="width:90px;font-family:var(--font-mono)">
        <span style="color:var(--text-muted)">% adder</span>
      </div>
    </div>`;
  $('#genericModalFooter').innerHTML=`<button class="btn btn-secondary" onclick="closeModal('genericModal')">Cancel</button><button class="btn btn-primary" onclick="savePayMultipliers()"><i class="fas fa-save"></i> Save</button>`;
  openModal('genericModal');
}
function savePayMultipliers(){
  const g=id=>{const el=$('#'+id);return el?+el.value:null;};
  const cfg={nightDiff:(g('mplm_night')||0)/100};
  ['ordinary','restday','special','regholiday'].forEach(k=>{ cfg[k]={base:g('mplm_'+k+'_base')||0, ot:g('mplm_'+k+'_ot')||0}; });
  AppState.data.payMultipliers=cfg;
  AppState.save();
  closeModal('genericModal');
  renderManpowerLog();
  showToast('Multipliers saved','success');
}
