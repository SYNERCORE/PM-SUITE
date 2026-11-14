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
// headcount for an entry (role-mode entries carry headcount; named-person entries = 1)
function _mplHC(e){ const h=+(e&&e.headcount); return h>0?h:1; }
// man-hours for an entry = (reg + ot) × headcount
function _mplManhrs(e){ return ((+e.regHrs||0)+(+e.otHrs||0))*_mplHC(e); }
// full entry cost = per-person cost × headcount
function _mplEntryCost(e){ return _mplCost(e)*_mplHC(e); }
// manual project-level total manpower cost override (used while per-role rates are confidential)
function _mplManual(pid){ return (AppState.data.mplManualCost||{})[pid]||null; }

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

  // man-hour totals are headcount-weighted (role-mode entries log a crew, not one person)
  const totReg=entries.reduce((s,e)=>s+(+e.regHrs||0)*_mplHC(e),0);
  const totOT =entries.reduce((s,e)=>s+(+e.otHrs||0)*_mplHC(e),0);
  const totNight=entries.reduce((s,e)=>s+(+e.nightHrs||0)*_mplHC(e),0);
  const totHrs=totReg+totOT;
  const computedCost=entries.reduce((s,e)=>s+_mplEntryCost(e),0);
  const manualCost=_mplManual(pid);                 // project-level actual total (while per-role rates are confidential)
  const costIsManual=(manualCost!=null && !flt);    // manual total covers the whole project, not a single filtered date
  const totCost=costIsManual?manualCost:computedCost;
  // workers = distinct named persons + sum of role-mode crew sizes
  const headcount=new Set(entries.filter(e=>e.resourceId).map(e=>e.resourceId)).size
                  + entries.filter(e=>!e.resourceId).reduce((s,e)=>s+_mplHC(e),0);
  // man-hours per role (so the breakdown is updated even without per-role cost)
  const byRole={};
  entries.forEach(e=>{ const r=(e.role||'Unassigned'); byRole[r]=(byRole[r]||0)+_mplManhrs(e); });
  const roleRows=Object.keys(byRole).sort((a,b)=>byRole[b]-byRole[a]);
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
        <button class="btn btn-secondary btn-sm" onclick="showMplManualCost()" title="Enter the actual total manpower cost (while per-role rates are confidential)"><i class="fas fa-coins"></i> Total Cost</button>
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
      ${tile('Labour Cost'+(costIsManual?' <span style="font-weight:400;color:var(--accent-amber);text-transform:none;letter-spacing:0">(manual)</span>':''), _mplMoney(totCost), 'var(--accent-cyan)')}
    </div>

    ${costIsManual?`<div class="card" style="padding:9px 12px;border-left:3px solid var(--accent-amber);margin-bottom:12px;font-size:11px;color:var(--text-secondary)">
      <i class="fas fa-coins" style="color:var(--accent-amber);margin-right:6px"></i>
      Labour Cost shows the <b>manually entered actual total</b> (${_mplMoney(manualCost)}). Computed-from-rates would be ${_mplMoney(computedCost)}. Clear the manual total to switch back to automatic once per-role rates are available.</div>`:''}

    ${roleRows.length?`<div class="card" style="padding:12px 14px;margin-bottom:12px">
      <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.4px;color:var(--text-muted);margin-bottom:8px">Man-hours by Role</div>
      <div style="display:flex;flex-wrap:wrap;gap:8px">
        ${roleRows.map(r=>`<div style="background:var(--bg-elevated,rgba(255,255,255,.03));border:1px solid var(--border-subtle,rgba(255,255,255,.08));border-radius:8px;padding:6px 11px;font-size:11.5px"><span style="color:var(--text-secondary)">${esc(r)}</span> &middot; <b style="font-family:var(--font-mono)">${_mplNum(byRole[r])}</b> <span style="color:var(--text-muted);font-size:10px">mh</span></div>`).join('')}
      </div>
    </div>`:''}

    ${noPersonnel?`<div class="card" style="padding:14px;border-left:3px solid var(--accent-amber);margin-bottom:12px;font-size:11.5px">
      <i class="fas fa-exclamation-triangle" style="color:var(--accent-amber);margin-right:6px"></i>
      No personnel in the register yet. Add people (with their hourly rate) in <b>Masterlist &rarr; Personnel</b> so you can log them here and compute salary cost.</div>`:''}

    <div class="card" style="padding:14px;overflow-x:auto">
      <table class="mpl-tbl">
        <thead><tr>
          <th>Date</th><th>Personnel / Crew</th><th>Role</th><th>Work Done</th>
          <th class="r">HC</th><th class="r">Reg</th><th class="r">OT</th><th class="r">Night</th>
          <th>Day Type</th><th class="r">Rate/hr</th><th class="r">Cost</th><th></th>
        </tr></thead>
        <tbody>
          ${entries.length?entries.map(e=>{
            const cost=_mplEntryCost(e); const hc=_mplHC(e); const byRoleMode=!e.resourceId;
            return `<tr>
              <td style="white-space:nowrap">${esc(e.date||'')}</td>
              <td>${byRoleMode?`<span class="mpl-tag" style="background:rgba(56,139,253,.18);margin-right:5px"><i class="fas fa-users" style="font-size:9px"></i> crew</span>${esc(e.personName||e.role||'')}`:esc(e.personName||'')}</td>
              <td style="color:var(--text-secondary)">${esc(e.role||'')}</td>
              <td style="max-width:220px">${esc(e.workDone||'')||'<span style="color:var(--text-muted)">—</span>'}</td>
              <td class="r" style="${hc>1?'font-weight:700':''}">${hc>1?hc:'<span style="color:var(--text-muted)">1</span>'}</td>
              <td class="r">${_mplNum(e.regHrs)}</td>
              <td class="r" style="${(+e.otHrs)>0?'color:var(--accent-amber)':''}">${_mplNum(e.otHrs)}</td>
              <td class="r" style="${(+e.nightHrs)>0?'color:var(--accent-purple,#bc8cff)':''}">${_mplNum(e.nightHrs)}</td>
              <td><span class="mpl-tag" style="background:${_mplDayColor(e.dayType)}">${_mplDayLabel(e.dayType)}</span></td>
              <td class="r">${(+e.rate)>0?_mplMoney(e.rate):'<span style="color:var(--text-muted)">—</span>'}</td>
              <td class="r" style="font-weight:600">${(+e.rate)>0?_mplMoney(cost):'<span style="color:var(--text-muted)">—</span>'}</td>
              <td style="white-space:nowrap">
                <button class="btn btn-secondary btn-sm btn-icon" onclick="showManpowerLogForm('${e.id}')" title="Edit"><i class="fas fa-edit"></i></button>
                <button class="btn btn-secondary btn-sm btn-icon" onclick="deleteManpowerLog('${e.id}')" title="Delete"><i class="fas fa-trash"></i></button>
              </td>
            </tr>`;}).join(''):`<tr><td colspan="12"><div class="mpl-empty"><i class="fas fa-user-clock" style="font-size:22px;display:block;margin-bottom:8px"></i>No daily logs yet. Click <b>Log Day</b> to record who (or which crew) worked and what they did.</div></td></tr>`}
          ${entries.length?`<tr class="mpl-tot">
            <td colspan="4">TOTAL${flt?' ('+flt+')':''} <span style="font-weight:400;color:var(--text-muted);font-size:10px">— man-hours (hrs×HC)</span></td>
            <td></td>
            <td class="r">${_mplNum(totReg)}</td><td class="r">${_mplNum(totOT)}</td><td class="r">${_mplNum(totNight)}</td>
            <td></td><td></td><td class="r" style="color:var(--accent-cyan)">${_mplMoney(totCost)}${costIsManual?' <span style="font-size:9px;color:var(--accent-amber);font-weight:400">(manual)</span>':''}</td><td></td>
          </tr>`:''}
        </tbody>
      </table>
      <div class="mpl-src">Man-hours = (Reg + OT) &times; headcount. Cost = [(Reg &times; rate &times; day base) + (OT &times; rate &times; day OT) + (Night &times; rate &times; base &times; ${(_mplMult().nightDiff*100)}% night diff)] &times; headcount. Rate optional — leave blank to log man-hours only while per-role cost is confidential, then enter the actual total via <b>Total Cost</b>.</div>
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
  // Role / trade options = trades masterlist + any roles on personnel (multi-skilled crews pick per day)
  const roleOpts=[...new Set([
    ...(AppState.data.trades||[]).map(t=>typeof t==='string'?t:(t&&t.name)).filter(Boolean),
    ...people.map(r=>r.role).filter(Boolean)
  ])].sort();
  const mode=edit?(edit.resourceId?'person':'role'):'person';
  window._mplMode=mode;
  $('#genericModalTitle').textContent=edit?'Edit Daily Log':'Log Day — Manpower';
  $('#genericModalBody').innerHTML=`
  <div style="display:flex;gap:6px;margin-bottom:12px">
    <button type="button" id="mplModePerson" class="btn btn-sm" onclick="_mplSetMode('person')" style="flex:1"><i class="fas fa-user"></i> Named person</button>
    <button type="button" id="mplModeRole" class="btn btn-sm" onclick="_mplSetMode('role')" style="flex:1"><i class="fas fa-users"></i> By role (headcount)</button>
  </div>
  <div style="font-size:10.5px;color:var(--text-muted);margin:-6px 0 10px"><b>By role</b> logs a crew's man-hours (hours × headcount) without naming each person — use this while per-role salaries are confidential.</div>
  <div class="form-grid">
    <div class="form-group"><label class="form-label">Date *</label><input class="form-input" type="date" id="mplDate" value="${edit?edit.date:today}"></div>
    <div class="form-group" id="mplPersonGrp"><label class="form-label">Personnel *</label>
      <select class="form-select" id="mplPerson" onchange="_mplSyncRate()">
        <option value="">— select —</option>
        ${people.map(r=>`<option value="${r.id}" data-role="${esc(r.role||'')}" data-rate="${r.hourlyRate||0}" ${curRes===r.id?'selected':''}>${esc(r.name)}${r.role?' ('+esc(r.role)+')':''}</option>`).join('')}
      </select>
    </div>
    <div class="form-group" id="mplHCGrp" style="display:none"><label class="form-label">Headcount *</label><input class="form-input" type="number" id="mplHC" min="1" step="1" value="${edit&&edit.headcount?edit.headcount:1}"><div style="font-size:10px;color:var(--text-muted);margin-top:3px">Number of people in this role today.</div></div>
    <div class="form-group" style="grid-column:1/-1"><label class="form-label">Role / Trade done this day *</label>
      <input class="form-input" id="mplRole" list="mplRoleList" placeholder="e.g., Welder, Fitter, Rigger" value="${edit?esc(edit.role||''):''}" oninput="window._mplRoleTouched=true">
      <datalist id="mplRoleList">${roleOpts.map(o=>`<option value="${esc(o)}"></option>`).join('')}</datalist>
      <div style="font-size:10px;color:var(--text-muted);margin-top:3px">Defaults to the person's primary trade — change it to the role actually done today.</div>
    </div>
    <div class="form-group" style="grid-column:1/-1"><label class="form-label">Work Done</label><input class="form-input" id="mplWork" placeholder="e.g., Boiler tube welding — 12 joints" value="${edit?esc(edit.workDone||''):''}"></div>
    <div class="form-group"><label class="form-label" id="mplRegLbl">Regular Hours *</label><input class="form-input" type="number" id="mplReg" min="0" step="0.5" value="${edit?edit.regHrs:8}"></div>
    <div class="form-group"><label class="form-label">Overtime Hours</label><input class="form-input" type="number" id="mplOT" min="0" step="0.5" value="${edit?edit.otHrs:0}"></div>
    <div class="form-group"><label class="form-label">Night Hours <span style="font-weight:400;color:var(--text-muted)">(10pm–6am, +${(_mplMult().nightDiff*100)}%)</span></label><input class="form-input" type="number" id="mplNight" min="0" step="0.5" value="${edit?edit.nightHrs:0}"></div>
    <div class="form-group"><label class="form-label">Day Type *</label><select class="form-select" id="mplDayType">${_MPL_DAYTYPES.map(d=>`<option value="${d.k}" ${((edit&&edit.dayType)||'ordinary')===d.k?'selected':''}>${d.label}</option>`).join('')}</select></div>
    <div class="form-group"><label class="form-label">Hourly Rate (₱) <span id="mplRateReq">*</span></label><input class="form-input" type="number" id="mplRate" min="0" step="0.01" value="${edit?edit.rate:0}"><div style="font-size:10px;color:var(--text-muted);margin-top:3px" id="mplRateHint">Auto-filled from the person's salary; override if needed.</div>
      <div id="mplRateWarn" style="display:none;margin-top:5px;font-size:10.5px;color:var(--accent-amber)"><i class="fas fa-exclamation-triangle"></i> No hourly rate — cost will be ₱0. Set a rate here, or leave blank and record the actual total via Total Cost.</div></div>
  </div>
  <div style="margin-top:10px;padding:10px 12px;background:rgba(56,139,253,.08);border-radius:8px;font-size:11.5px;display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap">
    <span>Man-hours: <b id="mplMhPreview" style="font-family:var(--font-mono)">0</b></span>
    <span>Estimated cost: <b id="mplPreview" style="font-family:var(--font-mono)">₱0.00</b></span>
  </div>`;
  $('#genericModalFooter').innerHTML=`<button class="btn btn-secondary" onclick="closeModal('genericModal')">Cancel</button><button class="btn btn-primary" onclick="saveManpowerLog(${edit?`'${edit.id}'`:'null'})"><i class="fas fa-save"></i> ${edit?'Save':'Add Entry'}</button>`;
  openModal('genericModal');
  window._mplRoleTouched=!!edit;   // in edit mode the existing role is user-chosen; don't auto-overwrite
  ['mplReg','mplOT','mplNight','mplRate','mplDayType','mplHC'].forEach(fid=>{const el=$('#'+fid);if(el)el.addEventListener('input',_mplPreview);});
  _mplSetMode(mode);
  if(!edit && mode==='person')_mplSyncRate(); else _mplPreview();
}
function _mplSetMode(m){
  window._mplMode=m;
  const pg=$('#mplPersonGrp'), hg=$('#mplHCGrp');
  if(pg)pg.style.display=(m==='person')?'':'none';
  if(hg)hg.style.display=(m==='role')?'':'none';
  const bp=$('#mplModePerson'), br=$('#mplModeRole');
  if(bp)bp.className='btn btn-sm '+(m==='person'?'btn-primary':'btn-secondary');
  if(br)br.className='btn btn-sm '+(m==='role'?'btn-primary':'btn-secondary');
  // rate is optional in role mode (per-role cost may be confidential)
  const req=$('#mplRateReq'); if(req)req.style.display=(m==='role')?'none':'';
  const hint=$('#mplRateHint'); if(hint)hint.textContent=(m==='role')?'Optional — leave blank to log man-hours only; enter actual total via Total Cost.':'Auto-filled from the person\'s salary; override if needed.';
  if(m==='role'){ const roleEl=$('#mplRole'); if(roleEl&&!roleEl.value){} }
  _mplPreview();
}
function _mplSyncRate(){
  const sel=$('#mplPerson'); if(!sel)return;
  const opt=sel.options[sel.selectedIndex];
  if(opt&&opt.value){
    const rate=+opt.getAttribute('data-rate')||0; if($('#mplRate'))$('#mplRate').value=rate;
    // prefill role with the person's primary trade unless the user has edited it
    const roleEl=$('#mplRole');
    if(roleEl && (!window._mplRoleTouched || !roleEl.value)) roleEl.value=opt.getAttribute('data-role')||'';
  }
  _mplPreview();
}
function _mplPreview(){
  const hc=(window._mplMode==='role')?Math.max(1,+($('#mplHC')&&$('#mplHC').value)||1):1;
  const e={regHrs:+$('#mplReg').value||0, otHrs:+$('#mplOT').value||0, nightHrs:+$('#mplNight').value||0, dayType:$('#mplDayType').value, rate:+$('#mplRate').value||0, headcount:hc};
  if($('#mplPreview'))$('#mplPreview').textContent=(e.rate>0)?_mplMoney(_mplEntryCost(e)):'—';
  if($('#mplMhPreview'))$('#mplMhPreview').textContent=_mplNum(_mplManhrs(e));
  const w=$('#mplRateWarn'); if(w) w.style.display=(e.rate>0||window._mplMode==='role')?'none':'block';
}
function saveManpowerLog(id){
  const mode=window._mplMode||'person';
  const sel=$('#mplPerson'); const resId=(mode==='person'&&sel)?sel.value:'';
  const role=($('#mplRole')&&$('#mplRole').value.trim())||'';
  if(mode==='person'&&!resId){showToast('Select a person','error');return;}
  if(mode==='role'&&!role){showToast('Enter the role / trade','error');return;}
  if(!$('#mplDate').value){showToast('Pick a date','error');return;}
  const hc=(mode==='role')?Math.max(1,+($('#mplHC')&&$('#mplHC').value)||1):1;
  if(mode==='role'&&hc<1){showToast('Headcount must be at least 1','error');return;}
  // in person mode a ₱0 rate is a warning; in role mode a blank rate is expected (cost captured via Total Cost)
  if(mode==='person'&&(+$('#mplRate').value||0)<=0 && !confirm('Hourly rate is ₱0 — this entry will have no labour cost.\n\nSave anyway? (Set the person\'s salary in Masterlist → Personnel to avoid this.)')) return;
  const opt=(mode==='person'&&sel)?sel.options[sel.selectedIndex]:null;
  const personName=(mode==='role')?(role+' crew ×'+hc):(opt?opt.textContent.replace(/\s*\(.*\)$/,''):'');
  const finalRole=role||(opt?(opt.getAttribute('data-role')||''):'');
  const rec={
    projectId:detailProjectId,
    date:$('#mplDate').value,
    resourceId:resId,
    personName:personName,
    role:finalRole,
    headcount:hc,
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
  const rows=_mplEntries(pid).map(e=>[e.date,e.personName,e.role,_mplHC(e),e.workDone,e.regHrs,e.otHrs,e.nightHrs,_mplManhrs(e),_mplDayLabel(e.dayType),e.rate,_mplEntryCost(e)]);
  if(typeof exportCSV==='function')
    exportCSV(rows,['Date','Personnel/Crew','Role','Headcount','Work Done','Reg Hrs','OT Hrs','Night Hrs','Man-hours','Day Type','Rate/hr','Cost'],'daily_manpower_'+pid+'.csv');
}

/* ============================ MANUAL TOTAL MANPOWER COST ============================ */
/* While per-role rates are confidential, the user can enter the actual total manpower
   cost for the whole project. It overrides the computed Labour Cost until cleared. */
function showMplManualCost(){
  const pid=detailProjectId;
  const cur=_mplManual(pid);
  const computed=_mplEntries(pid).reduce((s,e)=>s+_mplEntryCost(e),0);
  $('#genericModalTitle').textContent='Total Manpower Cost (actual)';
  $('#genericModalBody').innerHTML=`
    <div style="font-size:11.5px;color:var(--text-secondary);margin-bottom:12px">
      Enter the <b>actual total manpower cost utilised</b> for this project. Use this while per-role salaries are confidential — man-hours stay tracked per day/role, and this figure drives the Labour Cost tile. Clear it to revert to the computed-from-rates total once rates are available.
    </div>
    <div class="form-group" style="max-width:280px">
      <label class="form-label">Total Manpower Cost (₱)</label>
      <input class="form-input" type="number" id="mplManualVal" min="0" step="0.01" value="${cur!=null?cur:''}" placeholder="e.g., 1250000">
    </div>
    <div style="font-size:11px;color:var(--text-muted);margin-top:8px">Computed from entered rates right now: <b style="font-family:var(--font-mono)">${_mplMoney(computed)}</b></div>`;
  $('#genericModalFooter').innerHTML=`
    ${cur!=null?`<button class="btn btn-secondary" onclick="saveMplManualCost(true)" style="margin-right:auto"><i class="fas fa-eraser"></i> Clear (use computed)</button>`:''}
    <button class="btn btn-secondary" onclick="closeModal('genericModal')">Cancel</button>
    <button class="btn btn-primary" onclick="saveMplManualCost(false)"><i class="fas fa-save"></i> Save</button>`;
  openModal('genericModal');
}
function saveMplManualCost(clear){
  const pid=detailProjectId;
  if(!AppState.data.mplManualCost)AppState.data.mplManualCost={};
  if(clear){ delete AppState.data.mplManualCost[pid]; }
  else{
    const v=+($('#mplManualVal')&&$('#mplManualVal').value);
    if(!(v>0)){ if(!confirm('No amount entered — this will clear the manual total. Continue?')) return; delete AppState.data.mplManualCost[pid]; }
    else AppState.data.mplManualCost[pid]=Math.round(v*100)/100;
  }
  AppState.save();
  if(typeof _cbSyncProjectSpent==='function')_cbSyncProjectSpent(pid); // keep project.spent / Cost Control aligned
  closeModal('genericModal');
  renderManpowerLog();
  showToast(clear?'Reverted to computed cost':'Total manpower cost saved','success');
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
