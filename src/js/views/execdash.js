// ╔══════════════════════════════════════════════════════════════╗
// ║  EXECUTION DASHBOARD  (per-project, OMT-style one-page view)   ║
// ║  Live from existing modules + editable manual fields, with a   ║
// ║  daily snapshot that freezes the whole page for the record.    ║
// ╚══════════════════════════════════════════════════════════════╝

// View state: null = live; otherwise a snapshot date string 'YYYY-MM-DD'.
let _edViewSnap = null;

// ── Per-project manual settings (things no module stores) ──────────
function _edSettings(pid){
  if(!AppState.data.execDashSettings) AppState.data.execDashSettings=[];
  let s=AppState.data.execDashSettings.find(x=>x.projectId===pid);
  if(!s){ s={projectId:pid}; AppState.data.execDashSettings.push(s); }
  s.ratings = s.ratings || {safety:'good',quality:'',prep:''};
  s.permits = s.permits || {total:0,complete:0,openActs:0};
  s.safety  = s.safety  || {unsafeCond:0,unsafeAct:0,nearMiss:0,firstAid:0,mtc:0,lti:0,ltifr:0,propDmg:0};
  if(s.hoursPerDay==null) s.hoursPerDay=8;
  if(s.daysPerWeek==null) s.daysPerWeek=6;
  if(s.weather==null) s.weather='';
  if(s.weatherFc==null) s.weatherFc='';
  if(s.contractors==null) s.contractors=0;
  return s;
}

function _edSnaps(pid){
  return (AppState.data.execDashSnapshots||[]).filter(s=>s.projectId===pid)
    .sort((a,b)=>(b.date||'').localeCompare(a.date||''));
}

// ── small format helpers ──────────────────────────────────────────
function _edCur(n){ // compact ₱ with M/K
  n=Number(n)||0; const s=n<0?'-':''; n=Math.abs(n);
  if(n>=1e6) return s+'₱'+(n/1e6).toFixed(1)+'M';
  if(n>=1e3) return s+'₱'+(n/1e3).toFixed(0)+'K';
  return s+'₱'+n.toFixed(0);
}
function _edNum(n){ return (Number(n)||0).toLocaleString(); }
function _edPct(a,b){ b=Number(b)||0; return b? Math.round((Number(a)||0)/b*100):0; }
function _edRating(v){ // -> {label,cls}
  const m={good:['GOOD','p-good'],moderate:['MODERATE','p-mod'],low:['LOW','p-low']};
  return m[v]||['—','p-na'];
}
function _edAgeCls(d){ return d>=30?'t-hi':d>=15?'t-md':'t-lo'; }

// ── Build the full display model (also what a snapshot stores) ─────
function _edModel(pid){
  const D=AppState.data;
  const p=(D.projects||[]).find(x=>x.id===pid);
  if(!p) return null;
  const st=_edSettings(pid);
  const today=new Date().toISOString().split('T')[0];
  const tasks=(D.tasks||[]).filter(t=>t.projectId===pid&&!t._deleted);
  const allocs=(D.resourceAllocations||[]).filter(a=>a.projectId===pid&&!a._deleted);
  const proc=(D.procurement||[]).filter(x=>x.projectId===pid&&!x._deleted);
  const actions=(D.actions||[]).filter(a=>a.projectId===pid&&!a._deleted);
  const risks=(D.risks||[]).filter(r=>r.projectId===pid&&!r._deleted);
  const qaqc=(D.qaqc||[]).filter(q=>q.projectId===pid&&!q._deleted);
  const manpower=(D.manpower||[]).filter(m=>m.projectId===pid&&!m._deleted);

  // Header timing
  const dayNo = p.startDate? Math.max(1,(daysBetween(p.startDate,today)||0)+1):'—';
  const daysLeft = p.endDate? daysBetween(today,p.endDate):null;
  const totalDur = (p.startDate&&p.endDate)? Math.max(1,daysBetween(p.startDate,p.endDate)+1):1;
  const elapsed = p.startDate? Math.max(0,Math.min(totalDur,(daysBetween(p.startDate,today)||0)+1)):0;

  // Progress & SPI
  const actualPct = Number(p.progress)||0;
  const plannedPct = Math.round(elapsed/totalDur*100);        // time-based plan line
  const spi = plannedPct? +(actualPct/plannedPct).toFixed(2):1;
  const prevSnap=_edSnaps(pid).find(s=>s.date<today);
  const prevSpi = prevSnap&&prevSnap.data? prevSnap.data.spi : spi;

  // ── CPM ──
  let cpm={len:0,driving:'—',nearCrit:0,forecast:null,baseline:p.endDate||null,rows:[]};
  try{
    if(window.SHICCPMEngine && tasks.length){
      const r=SHICCPMEngine.runFullCPM(tasks,p);
      const cm=r.tasks||[];
      const toStr=d=>d? (typeof d==='object'?d.toISOString().split('T')[0]:String(d)):'';
      const crit=cm.filter(t=>t._isCritical && !(t.isSummary||t.summary))
        .sort((a,b)=>(toStr(a._ES)).localeCompare(toStr(b._ES)));
      cpm.nearCrit=cm.filter(t=>t._TF>0&&t._TF<=2).length;
      cpm.forecast=r.projectFinish? toStr(r.projectFinish):null;
      const ess=cm.map(t=>toStr(t._ES)).filter(Boolean).sort();
      if(ess.length&&cpm.forecast) cpm.len=Math.max(1,daysBetween(ess[0],cpm.forecast)+1);
      if(crit.length) cpm.driving=crit[0].name;
      cpm.rows=crit.slice(0,12).map(t=>({
        name:t.name, start:toStr(t._ES), finish:toStr(t._EF),
        dur:Math.max(1,daysBetween(toStr(t._ES),toStr(t._EF))+1),
        tf:+(t._TF||0), pct:_taskPct(t), status:t.status||'—'
      }));
      // near-critical rows (dimmed)
      cm.filter(t=>t._TF>0&&t._TF<=2).sort((a,b)=>a._TF-b._TF).slice(0,3).forEach(t=>{
        cpm.rows.push({near:true,name:t.name,start:toStr(t._ES),finish:toStr(t._EF),
          dur:Math.max(1,daysBetween(toStr(t._ES),toStr(t._EF))+1),tf:+(t._TF||0),pct:_taskPct(t),status:t.status||'—'});
      });
    }
  }catch(e){ console.warn('ExecDash CPM failed',e); }
  const fcVar = (cpm.forecast&&cpm.baseline)? daysBetween(cpm.forecast,cpm.baseline):null; // + = early

  // ── Budget by category (Resource Allocation) ──
  const cats=(typeof ALLOC_CATS!=='undefined')?ALLOC_CATS:[{id:'misc',label:'Miscellaneous',color:'#8b949e',test:()=>true}];
  const catAgg={}; cats.forEach(c=>catAgg[c.id]={label:c.label,color:c.color,budget:0,actual:0});
  allocs.forEach(a=>{
    const c=(typeof getAllocCat==='function')?getAllocCat(a):cats[cats.length-1];
    const row=catAgg[c.id]||catAgg[cats[cats.length-1].id];
    row.budget+=Number(a.plannedCost)||0; row.actual+=Number(a.actualCost)||0;
  });
  const budgetRows=Object.values(catAgg).filter(r=>r.budget||r.actual)
    .sort((a,b)=>b.budget-a.budget);
  const budTotB=budgetRows.reduce((s,r)=>s+r.budget,0);
  const budTotA=budgetRows.reduce((s,r)=>s+r.actual,0);

  // ── Man-hours by role (manpower register, grouped by trade) ──
  const hpd=Number(st.hoursPerDay)||8, dpw=Number(st.daysPerWeek)||6;
  const roleAgg={};
  manpower.forEach(m=>{
    const role=(typeof m.trade==='string'?m.trade:(m.trade&&m.trade.name)||'')||'Unspecified';
    const r=roleAgg[role]||(roleAgg[role]={role,onsite:0,planHrs:0,actHrs:0});
    const pl=Number(m.planned)||0, ac=Number(m.actual)||0, ot=Number(m.overtime)||0;
    r.planHrs += pl*hpd*dpw;
    r.actHrs  += ac*hpd*dpw + ot;
    r.onsite = ac; // latest record's actual headcount wins (register is weekly)
  });
  const roleRows=Object.values(roleAgg).filter(r=>r.planHrs||r.actHrs)
    .sort((a,b)=>b.planHrs-a.planHrs);
  const mhPlan=roleRows.reduce((s,r)=>s+r.planHrs,0);
  const mhAct=roleRows.reduce((s,r)=>s+r.actHrs,0);
  const onsiteTot=roleRows.reduce((s,r)=>s+r.onsite,0);

  // ── Procurement items + age + assignee ──
  const openStat=['draft','requested','approved','rfq','quoted','evaluated','ordered','partial'];
  const procRows=proc.map(x=>{
    const reqDate=x.prDate||x.poDate||x.date||'';
    const age=reqDate? daysBetween(reqDate,today):null;
    return {
      ref:x.poNumber||x.prNumber||x.requestNumber||x.id,
      desc:x.description||'—', cat:x.category||'—',
      qty:(x.qty!=null?x.qty:(x.quantity!=null?x.quantity:'—')),
      amount:Number(x.amount||x.budgetAmount||0),
      reqDate, age,
      assignee:x.responsiblePerson||x.requestedBy||'', status:x.status||'draft',
      open:openStat.includes(x.status)
    };
  }).sort((a,b)=>(b.age||0)-(a.age||0));

  // ── Open action items ──
  const actRows=actions.filter(a=>a.status!=='closed').map(a=>({
    id:a.id, desc:a.description||'—', source:a.source||'—',
    owner:a.assignee||'', due:a.dueDate||'', priority:a.priority||'normal',
    status:a.status||'open', overdue:(a.status==='overdue')||(a.dueDate&&typeof isOverdue==='function'&&isOverdue(a.dueDate))
  })).sort((a,b)=>(b.overdue?1:0)-(a.overdue?1:0)||(a.due||'').localeCompare(b.due||''));

  // ── Risks / Quality ──
  const riskRows=risks.filter(r=>r.status!=='closed').slice(0,6)
    .map(r=>({desc:r.title||r.description||'—',sev:(r.severity||r.exposure||'medium')}));
  const qualRows=qaqc.slice(-6).reverse()
    .map(q=>({desc:q.description||q.title||'—',type:q.type||'Obs',status:q.status||''}));

  // ── Last 24h: diff vs previous snapshot where possible ──
  const last24={completed:[],advanced:[],notes:[]};
  if(prevSnap&&prevSnap.data&&prevSnap.data._taskPct){
    const prev=prevSnap.data._taskPct;
    tasks.forEach(t=>{
      const now=_taskPct(t), was=prev[t.id];
      if(was==null) return;
      if(now>=100&&was<100) last24.completed.push({name:t.name,from:was});
      else if(now>was) last24.advanced.push({name:t.name,from:was,to:now});
    });
  } else {
    tasks.filter(t=>t.completedDate&&daysBetween(t.completedDate,today)<=1)
      .forEach(t=>last24.completed.push({name:t.name,from:null}));
    if(!last24.completed.length) last24.notes.push('Save a daily snapshot to begin day-over-day tracking.');
  }
  last24.advanced=last24.advanced.slice(0,6); last24.completed=last24.completed.slice(0,6);

  // ── Phase progress (group by task.phase) ──
  const phaseAgg={};
  tasks.forEach(t=>{ const ph=t.phase||'General'; const g=phaseAgg[ph]||(phaseAgg[ph]={phase:ph,n:0,sum:0});
    g.n++; g.sum+=_taskPct(t); });
  const phaseRows=Object.values(phaseAgg).map(g=>({phase:g.phase,n:g.n,pct:Math.round(g.sum/Math.max(1,g.n))}));

  // ── Performance index ──
  const openNcr=qaqc.filter(q=>q.type==='NCR'&&q.status==='open').length;
  const schedR= spi>=0.98?'good':spi>=0.9?'moderate':'low';
  const cpi = budTotA? +(budTotB*0.2 + 0)/1:0; // placeholder (unused)
  const costR= (budTotB&&budTotA)? (budTotA<=budTotB?'good':budTotA<=budTotB*1.05?'moderate':'low') : (p.budget&&p.spent? (p.spent<=p.budget?'good':'moderate'):'good');
  const qualR= st.ratings.quality || (openNcr===0?'good':openNcr<=2?'moderate':'low');
  let prepR= st.ratings.prep;
  if(!prepR && typeof _projectReadiness==='function'){ try{ const rd=_projectReadiness(pid); prepR= rd.overall==='go'?'good':rd.overall==='caution'?'moderate':'low'; }catch(e){} }

  // man-hours cumulative for safety
  const manHrsCum = Math.round(mhAct);

  return {
    _v:1, generatedAt:new Date().toISOString(), date:today,
    project:{id:p.id,name:p.name,client:p.client,bu:p.businessUnit||p.bu||'',
      start:p.startDate||'',end:p.endDate||'',budget:Number(p.budget)||0},
    dayNo, daysLeft,
    perf:{safety:st.ratings.safety||'good',quality:qualR||'good',schedule:schedR,cost:costR,prep:prepR||'good'},
    spi, prevSpi, spiTrend: spi>prevSpi?'up':spi<prevSpi?'down':'flat',
    actualPct, plannedPct,
    cpm:{...cpm,fcVar},
    budgetRows, budTotB, budTotA,
    roleRows, mhPlan, mhAct, onsiteTot, hpd, dpw,
    procRows,
    actRows, riskRows, qualRows, phaseRows, last24,
    permits:{...st.permits},
    safety:{...st.safety, manHrs:manHrsCum, onsite:onsiteTot},
    contractors:st.contractors||0,
    weather:st.weather||'', weatherFc:st.weatherFc||'',
    sysComplete: tasks.length? Math.round(tasks.filter(t=>_taskPct(t)>=100).length/tasks.length*100):0,
    _taskPct: tasks.reduce((o,t)=>{o[t.id]=_taskPct(t);return o;},{})
  };
}

function _taskPct(t){
  if(t.progress!=null&&!isNaN(t.progress)) return Math.max(0,Math.min(100,Number(t.progress)));
  if(t.percentComplete!=null&&!isNaN(t.percentComplete)) return Math.max(0,Math.min(100,Number(t.percentComplete)));
  return t.status==='done'?100:t.status==='in-progress'?50:0;
}

// ── Main render entry (project detail tab) ────────────────────────
function renderExecDashboard(){
  const pid=detailProjectId;
  // Guard: a snapshot selected for another project doesn't apply here.
  if(_edViewSnap!==null && !_edSnaps(pid).some(s=>s.date===_edViewSnap)) _edViewSnap=null;
  const live=_edViewSnap===null;
  let model;
  if(live){ model=_edModel(pid); }
  else {
    const snap=_edSnaps(pid).find(s=>s.date===_edViewSnap);
    model=snap?snap.data:_edModel(pid);
  }
  if(!model){ $('#detailTabContent').innerHTML='<div class="card" style="padding:24px;text-align:center;color:var(--text-muted)">Project not found.</div>'; return; }
  $('#detailTabContent').innerHTML=_edRender(model,{live,pid});
}

// ── Toolbar ───────────────────────────────────────────────────────
function _edToolbar(model,live,pid){
  const projects=(AppState.data.projects||[]).filter(p=>!p._deleted&&p.status!=='prospect'&&p.status!=='archived');
  const snaps=_edSnaps(pid);
  return `<div class="card" style="display:flex;align-items:center;gap:12px;flex-wrap:wrap;margin-bottom:14px;padding:10px 12px">
    <div style="display:flex;align-items:center;gap:6px">
      <span style="font-size:10px;text-transform:uppercase;letter-spacing:.3px;color:var(--text-muted);font-weight:700">Project</span>
      <select class="form-select" style="height:30px;font-size:12px;max-width:280px" onchange="detailProjectId=this.value;_edViewSnap=null;detailTab='execdash';renderProjectDetail()">
        ${projects.map(p=>`<option value="${esc(p.id)}" ${p.id===pid?'selected':''}>${esc(p.id)} — ${esc(p.name)}</option>`).join('')}
      </select>
    </div>
    <div style="display:flex;align-items:center;gap:6px">
      <span style="font-size:10px;text-transform:uppercase;letter-spacing:.3px;color:var(--text-muted);font-weight:700">View</span>
      <select class="form-select" style="height:30px;font-size:12px" onchange="_edViewSnap=this.value==='live'?null:this.value;renderExecDashboard()">
        <option value="live" ${live?'selected':''}>● Live (today)</option>
        ${snaps.map(s=>`<option value="${esc(s.date)}" ${(!live&&_edViewSnap===s.date)?'selected':''}>Snapshot · ${esc(s.date)}</option>`).join('')}
      </select>
    </div>
    <div style="margin-left:auto;display:flex;gap:7px;flex-wrap:wrap">
      <button class="btn btn-secondary btn-sm" onclick="renderExecDashboard()"><i class="fas fa-sync"></i> Refresh</button>
      ${live?`<button class="btn btn-secondary btn-sm" style="border-color:rgba(63,185,80,.5);color:var(--accent-green)" onclick="_edSaveSnapshot('${esc(pid)}')"><i class="fas fa-camera"></i> Save Today's Snapshot</button>`:`<button class="btn btn-secondary btn-sm" style="border-color:var(--accent-red);color:var(--accent-red)" onclick="_edDeleteSnapshot('${esc(pid)}','${esc(_edViewSnap)}')"><i class="fas fa-trash"></i> Delete Snapshot</button>`}
      <button class="btn btn-primary btn-sm" onclick="_edPrint()"><i class="fas fa-print"></i> Print / Export PDF</button>
    </div>
  </div>`;
}

// ── Full HTML render from model ───────────────────────────────────
function _edRender(m,opts){
  const live=opts.live, pid=opts.pid;
  const pill=(v)=>{const[l,c]=_edRating(v);return `<span class="ed-pill ${c}">${l}</span>`;};
  const bar=(pct,color)=>`<div class="ed-bar"><i style="width:${Math.max(0,Math.min(100,pct))}%;background:${color}"></i></div>`;
  const trend=m.spiTrend==='up'?'<span style="color:var(--accent-green)">▲</span>':m.spiTrend==='down'?'<span style="color:var(--accent-red)">▼</span>':'<span style="color:var(--text-muted)">▬</span>';
  const st=_edSettings(pid);

  return `${_edStyle()}
  ${_edToolbar(m,live,pid)}
  ${live?'':`<div class="ed-note" style="border-color:var(--accent-amber);color:var(--accent-amber)"><i class="fas fa-history"></i> Viewing the saved snapshot for <b>${esc(m.date)}</b> — historical record, not live data.</div>`}
  <div id="execDashRoot">

  <!-- HEADER -->
  <div class="ed-hdr">
    <div>
      <div class="ed-badge-live">${live?'● LIVE from ProMaster · auto-updated':'● SNAPSHOT · '+esc(m.date)}</div>
      <div class="ed-title">${esc(m.project.name)} — Execution Dashboard</div>
      <div class="ed-sub">${esc(m.project.id)}${m.project.bu?' · '+esc(m.project.bu):''} · ${esc(m.project.start||'—')} → ${esc(m.project.end||'—')}${m.project.client?' · '+esc(m.project.client):''}</div>
    </div>
    <div class="ed-meta">
      <div>Project Day No. <span class="ed-big">${m.dayNo}</span></div>
      <div>Days Remaining: <b>${m.daysLeft==null?'—':(m.daysLeft<0?Math.abs(m.daysLeft)+'d overdue':m.daysLeft+'d')}</b></div>
      <div>Updated: <b class="ed-mono">${esc((m.generatedAt||'').replace('T',' ').slice(0,16))}</b></div>
    </div>
  </div>

  <!-- PERFORMANCE INDEX -->
  <div class="card ed-mb">
    <div class="ed-h3">Summary of Overall Performance Index
      <span class="ed-legend"><span><i class="ed-sw" style="background:var(--accent-green)"></i>Good</span><span><i class="ed-sw" style="background:var(--accent-amber)"></i>Moderate</span><span><i class="ed-sw" style="background:var(--accent-red)"></i>Low</span></span>
    </div>
    <div class="ed-g5">
      <div class="ed-kpi"><div class="ed-lbl">Safety</div>${pill(m.perf.safety)}</div>
      <div class="ed-kpi"><div class="ed-lbl">Quality</div>${pill(m.perf.quality)}</div>
      <div class="ed-kpi"><div class="ed-lbl">Schedule</div>${pill(m.perf.schedule)}</div>
      <div class="ed-kpi"><div class="ed-lbl">Cost</div>${pill(m.perf.cost)}</div>
      <div class="ed-kpi"><div class="ed-lbl">Preparation</div>${pill(m.perf.prep)}</div>
    </div>
  </div>

  <!-- SPI + PROGRESS + CPM SUMMARY -->
  <div class="ed-g3 ed-mb">
    <div class="card">
      <div class="ed-h3">Schedule Performance Index</div>
      <div class="ed-g3">
        <div class="ed-kpi"><div class="ed-lbl">Acc SPI</div><div class="ed-num" style="color:${m.spi>=0.98?'var(--accent-green)':m.spi>=0.9?'var(--accent-amber)':'var(--accent-red)'}">${(m.spi||0).toFixed(2)}</div></div>
        <div class="ed-kpi"><div class="ed-lbl">Prev SPI</div><div class="ed-num">${(m.prevSpi||0).toFixed(2)}</div></div>
        <div class="ed-kpi"><div class="ed-lbl">Trend</div><div class="ed-num">${trend}</div></div>
      </div>
      <div class="ed-src">SPI = actual % ÷ planned % (time-based plan line)</div>
    </div>
    <div class="card">
      <div class="ed-h3">Progress Percentage</div>
      <div class="ed-row"><span class="ed-sub2">Planned</span><span class="ed-mono">${m.plannedPct}%</span></div>
      ${bar(m.plannedPct,'var(--text-muted)')}
      <div class="ed-row" style="margin-top:8px"><span class="ed-sub2">Actual</span><span class="ed-mono" style="color:var(--accent-green)">${m.actualPct}%</span></div>
      ${bar(m.actualPct,'var(--accent-green)')}
    </div>
    <div class="card">
      <div class="ed-h3">Critical Path (CPM) — Summary</div>
      <div class="ed-g2">
        <div class="ed-kpi"><div class="ed-lbl">Path Length</div><div class="ed-num">${m.cpm.len||'—'}<span class="ed-sub2"> d</span></div></div>
        <div class="ed-kpi"><div class="ed-lbl">Near-critical</div><div class="ed-num" style="color:var(--accent-amber)">${m.cpm.nearCrit}</div></div>
      </div>
      <div class="ed-src" style="margin-top:8px">Forecast finish <b class="ed-mono">${esc(m.cpm.forecast||'—')}</b>${m.cpm.fcVar!=null?` · <span style="color:${m.cpm.fcVar>=0?'var(--accent-green)':'var(--accent-red)'}">${m.cpm.fcVar>=0?m.cpm.fcVar+'d early':Math.abs(m.cpm.fcVar)+'d late'}</span>`:''}</div>
    </div>
  </div>

  <!-- BUDGET BY CATEGORY -->
  <div class="card ed-mb" style="border:1px solid rgba(57,211,242,.4)">
    <div class="ed-h3" style="color:var(--accent-cyan)">Budget &amp; Cost — Itemized by Category <span class="ed-src" style="margin:0">grouped from Resource Allocation (planned vs actual cost)</span></div>
    <table class="ed-tbl">
      <thead><tr><th>Category</th><th class="r">Budgeted</th><th class="r">Actual</th><th class="r">Variance</th><th style="width:150px">% of Budget</th><th class="r">Used</th></tr></thead>
      <tbody>
        ${m.budgetRows.map(r=>{const v=r.budget-r.actual;return `<tr>
          <td><i class="ed-dot" style="background:${r.color}"></i>${esc(r.label)}</td>
          <td class="r ed-mono">${_edCur(r.budget)}</td>
          <td class="r ed-mono">${_edCur(r.actual)}</td>
          <td class="r ed-mono" style="color:${v>=0?'var(--accent-green)':'var(--accent-red)'}">${v>=0?'+':''}${_edCur(v)}</td>
          <td>${bar(_edPct(r.budget,m.budTotB),r.color)}</td>
          <td class="r ed-mono">${_edPct(r.actual,r.budget)}%</td></tr>`;}).join('')||'<tr><td colspan="6" class="ed-empty">No allocations yet — add them in Resource Allocation.</td></tr>'}
        ${m.budgetRows.length?`<tr class="ed-tot"><td>TOTAL</td><td class="r ed-mono">${_edCur(m.budTotB)}</td><td class="r ed-mono" style="color:var(--accent-blue)">${_edCur(m.budTotA)}</td><td class="r ed-mono" style="color:var(--accent-green)">+${_edCur(m.budTotB-m.budTotA)}</td><td>${bar(_edPct(m.budTotA,m.budTotB),'var(--accent-green)')}</td><td class="r ed-mono">${_edPct(m.budTotA,m.budTotB)}%</td></tr>`:''}
      </tbody>
    </table>
  </div>

  <!-- PROCUREMENT -->
  <div class="card ed-mb">
    <div class="ed-h3">Procurement — Items, Request Age &amp; Assignee <span class="ed-src" style="margin:0">live from Procurement</span></div>
    <table class="ed-tbl">
      <thead><tr><th>PR / PO #</th><th>Item / Description</th><th>Category</th><th class="r">Qty</th><th class="r">Amount</th><th>Requested</th><th class="r">Age</th><th>Assigned To</th><th>Status</th></tr></thead>
      <tbody>
        ${m.procRows.map(r=>`<tr>
          <td class="ed-mono">${esc(r.ref)}</td>
          <td>${esc(r.desc)}</td>
          <td>${esc(r.cat)}</td>
          <td class="r ed-mono">${esc(String(r.qty))}</td>
          <td class="r ed-mono">${_edCur(r.amount)}</td>
          <td class="ed-mono">${esc(r.reqDate||'—')}</td>
          <td class="r">${r.age==null?'—':`<span class="ed-tag ${_edAgeCls(r.age)}">${r.age}d</span>`}</td>
          <td>${r.assignee?esc(r.assignee):'<span style="color:var(--accent-amber);font-size:10px">Unassigned</span>'}</td>
          <td><span class="ed-tag ${r.open?'t-prog':'t-lo'}">${esc(r.status)}</span></td></tr>`).join('')||'<tr><td colspan="9" class="ed-empty">No procurement items for this project.</td></tr>'}
      </tbody>
    </table>
    <div class="ed-src">Age = days since request date · <span style="color:var(--accent-red)">red ≥30d</span> · <span style="color:var(--accent-amber)">amber 15–29d</span> · <span style="color:var(--accent-green)">green &lt;15d</span>. Unassigned aged items flag procurement bottlenecks.</div>
  </div>

  <!-- CPM DETAIL -->
  <div class="card ed-mb">
    <div class="ed-h3">Critical Path Method (CPM) — Driving Chain <span class="ed-src" style="margin:0">zero-float path · ${esc(m.cpm.driving||'—')}</span></div>
    <table class="ed-tbl">
      <thead><tr><th>#</th><th>Critical Task</th><th>Start</th><th>Finish</th><th class="r">Dur</th><th class="r">Float</th><th class="r">%</th><th>Status</th></tr></thead>
      <tbody>
        ${m.cpm.rows.map((r,i)=>`<tr${r.near?' style="color:var(--text-muted)"':''}>
          <td class="ed-mono">${r.near?'~':(i+1)}</td>
          <td>${esc(r.name)} ${r.near?'<span class="ed-tag t-md">near-critical</span>':(i===0?'<span class="ed-tag t-hi">driving</span>':'')}</td>
          <td class="ed-mono">${esc(r.start||'—')}</td><td class="ed-mono">${esc(r.finish||'—')}</td>
          <td class="r ed-mono">${r.dur}d</td>
          <td class="r ed-mono" style="color:${r.tf<=0?'var(--accent-red)':'var(--accent-amber)'}">${r.tf.toFixed?r.tf.toFixed(1):r.tf}d</td>
          <td class="r ed-mono">${r.pct}%</td>
          <td><span class="ed-tag ${r.status==='done'?'t-lo':r.status==='in-progress'?'t-prog':'t-open'}">${esc(r.status)}</span></td></tr>`).join('')||'<tr><td colspan="8" class="ed-empty">No critical path — add task dependencies to compute CPM.</td></tr>'}
      </tbody>
    </table>
  </div>

  <!-- MAN-HOURS BY ROLE -->
  <div class="card ed-mb">
    <div class="ed-h3">Man-hours by Role <span class="ed-src" style="margin:0">Manpower register grouped by trade · ${m.hpd}h/day × ${m.dpw}d/wk + OT</span></div>
    <div class="ed-g4 ed-mb">
      <div class="ed-kpi"><div class="ed-lbl">Contractors</div><div class="ed-num">${m.contractors||'—'}</div></div>
      <div class="ed-kpi"><div class="ed-lbl">On Site (headcount)</div><div class="ed-num">${m.onsiteTot}</div></div>
      <div class="ed-kpi"><div class="ed-lbl">Planned Man-hours</div><div class="ed-num">${_edNum(Math.round(m.mhPlan))}</div></div>
      <div class="ed-kpi"><div class="ed-lbl">Actual Man-hours</div><div class="ed-num" style="color:var(--accent-cyan)">${_edNum(Math.round(m.mhAct))}</div></div>
    </div>
    <table class="ed-tbl">
      <thead><tr><th>Role / Trade</th><th class="r">On Site</th><th class="r">Planned Hrs</th><th class="r">Actual Hrs</th><th class="r">Variance</th><th style="width:130px">% Used</th></tr></thead>
      <tbody>
        ${m.roleRows.map(r=>{const v=r.planHrs-r.actHrs;return `<tr>
          <td>${esc(r.role)}</td>
          <td class="r ed-mono">${r.onsite}</td>
          <td class="r ed-mono">${_edNum(Math.round(r.planHrs))}</td>
          <td class="r ed-mono">${_edNum(Math.round(r.actHrs))}</td>
          <td class="r ed-mono" style="color:${v>=0?'var(--accent-green)':'var(--accent-red)'}">${v>=0?'+':''}${_edNum(Math.round(v))}</td>
          <td>${bar(_edPct(r.actHrs,r.planHrs),'var(--accent-blue)')}</td></tr>`;}).join('')||'<tr><td colspan="6" class="ed-empty">No manpower records — add them in the Manpower module.</td></tr>'}
        ${m.roleRows.length?`<tr class="ed-tot"><td>TOTAL</td><td class="r ed-mono">${m.onsiteTot}</td><td class="r ed-mono">${_edNum(Math.round(m.mhPlan))}</td><td class="r ed-mono" style="color:var(--accent-cyan)">${_edNum(Math.round(m.mhAct))}</td><td class="r ed-mono" style="color:var(--accent-green)">+${_edNum(Math.round(m.mhPlan-m.mhAct))}</td><td>${bar(_edPct(m.mhAct,m.mhPlan),'var(--accent-green)')}</td></tr>`:''}
      </tbody>
    </table>
    <div class="ed-src">Planned Hrs = planned headcount × hours/day × days/week; Actual = actual headcount × hours + OT. Adjust hours/day &amp; days/week in Manual Inputs below.</div>
  </div>

  <!-- LAST 24H + PLANNED/PHASES -->
  <div class="ed-g2 ed-mb">
    <div class="card">
      <div class="ed-h3">Last 24 Hours — Accomplishments</div>
      <ul class="ed-list">
        ${m.last24.completed.map(x=>`<li><i class="ed-dot" style="background:var(--accent-green)"></i><div><b>Completed:</b> ${esc(x.name)}${x.from!=null?' <span class="ed-tag t-lo">'+x.from+'%→100%</span>':''}</div></li>`).join('')}
        ${m.last24.advanced.map(x=>`<li><i class="ed-dot" style="background:var(--accent-blue)"></i><div><b>Advanced:</b> ${esc(x.name)} <span class="ed-mono">${x.from}%→${x.to}%</span></div></li>`).join('')}
        ${(!m.last24.completed.length&&!m.last24.advanced.length)?`<li style="color:var(--text-muted)">${esc(m.last24.notes[0]||'No changes in the last 24 hours.')}</li>`:''}
      </ul>
      <div class="ed-src">Computed by diffing task % against the previous daily snapshot.</div>
    </div>
    <div class="card">
      <div class="ed-h3">Phase Progress</div>
      ${m.phaseRows.map(ph=>`<div class="ed-phase"><div class="ed-pn">${esc(ph.phase)} <span class="ed-sub2">(${ph.n})</span></div><div style="flex:1">${bar(ph.pct,'var(--accent-green)')}</div><div class="ed-mono" style="width:40px;text-align:right">${ph.pct}%</div></div>`).join('')||'<div class="ed-empty">No task phases defined.</div>'}
      <div class="ed-src">Average % complete per phase (tasks grouped by Phase).</div>
    </div>
  </div>

  <!-- OPEN ACTION ITEMS -->
  <div class="card ed-mb" style="border:1px solid rgba(240,164,80,.5)">
    <div class="ed-h3" style="color:var(--accent-amber)">★ Open Action Items <span class="ed-src" style="margin:0">live from Action Items (status ≠ closed)</span></div>
    <table class="ed-tbl">
      <thead><tr><th>#</th><th>Action / Finding</th><th>Source</th><th>Owner</th><th>Due</th><th>Priority</th><th>Status</th></tr></thead>
      <tbody>
        ${m.actRows.map(a=>`<tr>
          <td class="ed-mono">${esc(a.id)}</td><td>${esc(a.desc)}</td><td>${esc(a.source)}</td>
          <td>${a.owner?esc(a.owner):'<span style="color:var(--accent-amber);font-size:10px">Unassigned</span>'}</td>
          <td class="ed-mono">${esc(a.due||'—')}</td>
          <td><span class="ed-tag ${a.priority==='critical'||a.priority==='high'?'t-hi':a.priority==='medium'||a.priority==='normal'?'t-md':'t-lo'}">${esc(a.priority)}</span></td>
          <td><span class="ed-tag ${a.overdue?'t-due':a.status==='inprogress'?'t-prog':'t-open'}">${a.overdue?'Overdue':esc(a.status)}</span></td></tr>`).join('')||'<tr><td colspan="7" class="ed-empty">No open action items. 🎉</td></tr>'}
      </tbody>
    </table>
    <div class="ed-src">${m.actRows.length} open · ${m.actRows.filter(a=>a.overdue).length} overdue · sorted overdue first.</div>
  </div>

  <!-- QUALITY / RISK / SYSTEM -->
  <div class="ed-g3 ed-mb">
    <div class="card">
      <div class="ed-h3">Quality Observations</div>
      <ul class="ed-list">${m.qualRows.map(q=>`<li><i class="ed-dot" style="background:${q.type==='NCR'?'var(--accent-red)':'var(--accent-green)'}"></i><div>${esc(q.desc)} <span class="ed-sub2">${esc(q.type)}${q.status?' · '+esc(q.status):''}</span></div></li>`).join('')||'<li style="color:var(--text-muted)">No observations logged.</li>'}</ul>
    </div>
    <div class="card">
      <div class="ed-h3">Key Project Risk Exposure</div>
      <ul class="ed-list">${m.riskRows.map(r=>`<li><i class="ed-dot" style="background:${/high|crit/i.test(r.sev)?'var(--accent-red)':/med/i.test(r.sev)?'var(--accent-amber)':'var(--accent-green)'}"></i><div>${esc(r.desc)} <span class="ed-tag ${/high|crit/i.test(r.sev)?'t-hi':/med/i.test(r.sev)?'t-md':'t-lo'}">${esc(r.sev)}</span></div></li>`).join('')||'<li style="color:var(--text-muted)">No open risks.</li>'}</ul>
    </div>
    <div class="card">
      <div class="ed-h3">System Completion</div>
      <div class="ed-g2">
        <div class="ed-kpi"><div class="ed-lbl">Total Permits</div><div class="ed-num">${m.permits.total||0}</div></div>
        <div class="ed-kpi"><div class="ed-lbl">Permits Complete</div><div class="ed-num" style="color:var(--accent-green)">${m.permits.complete||0}</div></div>
        <div class="ed-kpi"><div class="ed-lbl">Open Activities</div><div class="ed-num" style="color:var(--accent-amber)">${m.permits.openActs||0}</div></div>
        <div class="ed-kpi"><div class="ed-lbl">System Complete</div><div class="ed-num" style="color:var(--accent-green)">${m.sysComplete}%</div></div>
      </div>
    </div>
  </div>

  <!-- SAFETY + WEATHER -->
  <div class="ed-g2 ed-mb">
    <div class="card">
      <div class="ed-h3">Safety Statistics <span class="ed-src" style="margin:0">manual input · to date</span></div>
      <table class="ed-tbl">
        <tbody>
          <tr><td>Unsafe Condition / Act</td><td class="r ed-mono">${m.safety.unsafeCond||0} / ${m.safety.unsafeAct||0}</td><td>Near Miss</td><td class="r ed-mono">${m.safety.nearMiss||0}</td></tr>
          <tr><td>First Aid / MTC</td><td class="r ed-mono">${m.safety.firstAid||0} / ${m.safety.mtc||0}</td><td>LTI</td><td class="r ed-mono">${m.safety.lti||0}</td></tr>
          <tr><td>LTIFR</td><td class="r ed-mono">${m.safety.ltifr||0}</td><td>Property Damage</td><td class="r ed-mono">${m.safety.propDmg||0}</td></tr>
          <tr><td>Cumulative Man-hours</td><td class="r ed-mono" style="color:var(--accent-cyan)">${_edNum(m.safety.manHrs||0)}</td><td>On Site</td><td class="r ed-mono">${m.safety.onsite||0}</td></tr>
        </tbody>
      </table>
    </div>
    <div class="card">
      <div class="ed-h3">Weather</div>
      <div style="font-size:12px;line-height:1.7"><b>Today:</b> ${esc(m.weather||'—')}<br><b>Forecast:</b> ${esc(m.weatherFc||'—')}</div>
      <div class="ed-src">Manual input (edit below).</div>
    </div>
  </div>

  </div><!-- /execDashRoot -->

  ${live?_edManualPanel(st,pid):''}
  <div class="ed-note"><i class="fas fa-info-circle"></i> Numbers are live from this project's modules. Save a daily snapshot to keep the OMT-style dated record; Print / Export PDF produces the one-page form.</div>`;
}

// ── Manual inputs panel ───────────────────────────────────────────
function _edManualPanel(st,pid){
  const r=st.ratings, s=st.safety, pm=st.permits;
  const sel=(id,val,cur)=>`<select class="form-select" style="height:28px;font-size:11px" onchange="_edSetManual('${pid}','${id}',this.value)">${['','good','moderate','low'].map(o=>`<option value="${o}" ${cur===o?'selected':''}>${o?o[0].toUpperCase()+o.slice(1):'(auto)'}</option>`).join('')}</select>`;
  const numI=(path,val)=>`<input class="form-input" type="number" style="height:28px;font-size:11px;width:90px" value="${val||0}" onchange="_edSetManual('${pid}','${path}',this.value)">`;
  const txtI=(path,val,ph)=>`<input class="form-input" style="height:28px;font-size:11px" value="${esc(val||'')}" placeholder="${ph||''}" onchange="_edSetManual('${pid}','${path}',this.value)">`;
  return `<div class="card ed-mb" style="border:1px dashed var(--border)">
    <div class="ed-h3"><i class="fas fa-sliders-h" style="margin-right:6px"></i>Manual Inputs <span class="ed-src" style="margin:0">saved per project — for the fields no module tracks</span></div>
    <div class="ed-g4">
      <div><div class="ed-lbl">Safety rating</div>${sel('ratings.safety',r.safety,r.safety)}</div>
      <div><div class="ed-lbl">Quality rating (blank=auto)</div>${sel('ratings.quality',r.quality,r.quality)}</div>
      <div><div class="ed-lbl">Preparation rating (blank=auto)</div>${sel('ratings.prep',r.prep,r.prep)}</div>
      <div><div class="ed-lbl">Contractors on site</div>${numI('contractors',st.contractors)}</div>
    </div>
    <div class="ed-g4" style="margin-top:10px">
      <div><div class="ed-lbl">Hours / day</div>${numI('hoursPerDay',st.hoursPerDay)}</div>
      <div><div class="ed-lbl">Days / week</div>${numI('daysPerWeek',st.daysPerWeek)}</div>
      <div><div class="ed-lbl">Permits — total</div>${numI('permits.total',pm.total)}</div>
      <div><div class="ed-lbl">Permits — complete</div>${numI('permits.complete',pm.complete)}</div>
    </div>
    <div class="ed-g4" style="margin-top:10px">
      <div><div class="ed-lbl">Open activities</div>${numI('permits.openActs',pm.openActs)}</div>
      <div><div class="ed-lbl">Unsafe condition</div>${numI('safety.unsafeCond',s.unsafeCond)}</div>
      <div><div class="ed-lbl">Unsafe act</div>${numI('safety.unsafeAct',s.unsafeAct)}</div>
      <div><div class="ed-lbl">Near miss</div>${numI('safety.nearMiss',s.nearMiss)}</div>
    </div>
    <div class="ed-g4" style="margin-top:10px">
      <div><div class="ed-lbl">First aid</div>${numI('safety.firstAid',s.firstAid)}</div>
      <div><div class="ed-lbl">Medical treatment</div>${numI('safety.mtc',s.mtc)}</div>
      <div><div class="ed-lbl">Lost-time injury</div>${numI('safety.lti',s.lti)}</div>
      <div><div class="ed-lbl">LTIFR</div>${numI('safety.ltifr',s.ltifr)}</div>
    </div>
    <div class="ed-g2" style="margin-top:10px">
      <div><div class="ed-lbl">Weather — today</div>${txtI('weather',st.weather,'e.g. Sunny, 32°C')}</div>
      <div><div class="ed-lbl">Weather — forecast</div>${txtI('weatherFc',st.weatherFc,'e.g. Rain expected PM')}</div>
    </div>
    <div style="margin-top:10px"><button class="btn btn-secondary btn-sm" onclick="renderExecDashboard()"><i class="fas fa-sync"></i> Apply to dashboard</button></div>
  </div>`;
}

// set a (possibly nested a.b) manual field then persist
function _edSetManual(pid,path,val){
  const st=_edSettings(pid);
  const num=!isNaN(val)&&val!==''&&!/weather/.test(path)&&!/ratings/.test(path);
  const v = num? Number(val) : val;
  const parts=path.split('.');
  let o=st; for(let i=0;i<parts.length-1;i++){ o[parts[i]]=o[parts[i]]||{}; o=o[parts[i]]; }
  o[parts[parts.length-1]]=v;
  AppState.save();
}

// ── Snapshots ─────────────────────────────────────────────────────
function _edSaveSnapshot(pid){
  const m=_edModel(pid); if(!m){showToast('Nothing to snapshot','error');return;}
  if(!AppState.data.execDashSnapshots) AppState.data.execDashSnapshots=[];
  const date=m.date;
  const idx=AppState.data.execDashSnapshots.findIndex(s=>s.projectId===pid&&s.date===date);
  const rec={id:'EDS-'+pid+'-'+date, projectId:pid, date, savedAt:new Date().toISOString(),
    savedBy:(typeof _currentUser!=='undefined'&&_currentUser)?(_currentUser.name||_currentUser.email||''):'', data:m};
  if(idx>=0){ AppState.data.execDashSnapshots[idx]=rec; showToast('Snapshot for '+date+' updated','success'); }
  else { AppState.data.execDashSnapshots.push(rec); showToast('Snapshot saved for '+date,'success'); }
  AppState.save();
  _edViewSnap=null; renderExecDashboard();
}
function _edDeleteSnapshot(pid,date){
  if(!confirm('Delete the snapshot for '+date+'? This cannot be undone.')) return;
  AppState.data.execDashSnapshots=(AppState.data.execDashSnapshots||[]).filter(s=>!(s.projectId===pid&&s.date===date));
  AppState.save();
  _edViewSnap=null; renderExecDashboard();
  showToast('Snapshot '+date+' deleted','warning');
}

// ── Print / Export PDF ────────────────────────────────────────────
function _edPrint(){
  const root=document.getElementById('execDashRoot');
  if(!root){showToast('Open the dashboard first','error');return;}
  const w=window.open('','_edprint','width=1100,height=800');
  if(!w){showToast('Pop-up blocked — allow pop-ups to print','error');return;}
  w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Execution Dashboard</title>
  ${_edStyle(true)}
  <style>body{background:#fff;color:#111;padding:14px;font-family:system-ui,Segoe UI,sans-serif}
  .card{background:#fff;border:1px solid #ccc;break-inside:avoid}
  .ed-tbl th{color:#555;border-bottom:1px solid #bbb}.ed-tbl td{border-bottom:1px solid #eee}
  .ed-hdr{background:#f3f6fb;border:1px solid #cdd9ec}.ed-title{color:#111}
  @page{size:A4 landscape;margin:10mm}</style></head>
  <body>${root.innerHTML}</body></html>`);
  w.document.close();
  setTimeout(()=>{ try{w.focus();w.print();}catch(e){} },300);
}

// ── Scoped styles (light=true for print) ──────────────────────────
function _edStyle(light){
  return `<style>
  .ed-mb{margin-bottom:14px}
  .ed-hdr{display:flex;justify-content:space-between;gap:14px;flex-wrap:wrap;background:linear-gradient(135deg,rgba(56,139,253,.14),rgba(188,140,255,.08));border:1px solid rgba(56,139,253,.3);border-radius:12px;padding:14px 16px;margin-bottom:14px}
  .ed-badge-live{display:inline-block;font-size:10px;font-weight:700;color:var(--accent-green);border:1px solid rgba(63,185,80,.45);background:rgba(63,185,80,.08);border-radius:999px;padding:3px 9px}
  .ed-title{font-size:17px;font-weight:800;margin-top:7px}
  .ed-sub{font-size:11px;color:var(--text-secondary)}
  .ed-meta{text-align:right;font-size:11px;color:var(--text-secondary);line-height:1.7}
  .ed-meta .ed-big{font-size:22px;font-weight:800;color:var(--accent-amber);font-family:var(--font-mono)}
  .ed-h3{font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.3px;margin:0 0 10px;display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap}
  .ed-src{font-size:9.5px;color:var(--text-muted);font-weight:600;text-transform:uppercase;letter-spacing:.3px;margin-top:6px}
  .ed-g5{display:grid;grid-template-columns:repeat(5,1fr);gap:10px}
  .ed-g4{display:grid;grid-template-columns:repeat(4,1fr);gap:10px}
  .ed-g3{display:grid;grid-template-columns:repeat(3,1fr);gap:12px}
  .ed-g2{display:grid;grid-template-columns:1fr 1fr;gap:12px}
  .ed-kpi{background:var(--bg-hover);border:1px solid var(--border);border-radius:9px;padding:10px;text-align:center}
  .ed-lbl{font-size:10px;color:var(--text-secondary);margin-bottom:5px;font-weight:600}
  .ed-num{font-size:19px;font-weight:800;font-family:var(--font-mono)}
  .ed-pill{display:inline-block;font-size:12px;font-weight:800;padding:4px 12px;border-radius:999px}
  .p-good{background:rgba(63,185,80,.16);color:var(--accent-green)}.p-mod{background:rgba(240,164,80,.16);color:var(--accent-amber)}.p-low{background:rgba(248,81,73,.16);color:var(--accent-red)}.p-na{background:var(--bg-hover);color:var(--text-muted)}
  .ed-bar{height:9px;border-radius:999px;background:rgba(0,0,0,.25);overflow:hidden;border:1px solid var(--border)}.ed-bar>i{display:block;height:100%}
  .ed-row{display:flex;justify-content:space-between;font-size:11px;margin-bottom:4px}
  .ed-sub2{font-size:10px;color:var(--text-muted)}
  .ed-mono{font-family:var(--font-mono)}
  .ed-tbl{width:100%;border-collapse:collapse;font-size:11.5px}
  .ed-tbl th{text-align:left;color:var(--text-secondary);font-weight:600;padding:5px 7px;border-bottom:1px solid var(--border);font-size:10px;text-transform:uppercase;letter-spacing:.3px}
  .ed-tbl th.r,.ed-tbl td.r{text-align:right}
  .ed-tbl td{padding:5px 7px;border-bottom:1px solid var(--border)}
  .ed-tbl tr:last-child td{border-bottom:none}
  .ed-tot td{font-weight:800;border-top:2px solid var(--border)}
  .ed-dot{display:inline-block;width:8px;height:8px;border-radius:50%;margin-right:6px}
  .ed-tag{font-size:9.5px;font-weight:700;padding:1.5px 7px;border-radius:999px;white-space:nowrap}
  .t-open{background:rgba(248,81,73,.14);color:var(--accent-red)}.t-prog{background:rgba(56,139,253,.14);color:var(--accent-blue)}.t-due{background:rgba(240,164,80,.18);color:var(--accent-amber)}
  .t-hi{background:rgba(248,81,73,.16);color:var(--accent-red)}.t-md{background:rgba(240,164,80,.16);color:var(--accent-amber)}.t-lo{background:rgba(63,185,80,.14);color:var(--accent-green)}
  .ed-list{margin:0;padding:0;list-style:none;font-size:11.5px}
  .ed-list li{padding:5px 0;border-bottom:1px solid var(--border);display:flex;gap:8px;align-items:flex-start}
  .ed-list li:last-child{border-bottom:none}
  .ed-list li .ed-dot{margin-top:5px;flex-shrink:0}
  .ed-phase{display:flex;align-items:center;gap:10px;margin:6px 0}
  .ed-pn{width:160px;font-size:11px}
  .ed-legend{font-size:10px;color:var(--text-secondary);display:inline-flex;gap:12px}
  .ed-legend span{display:inline-flex;align-items:center;gap:4px}
  .ed-sw{width:9px;height:9px;border-radius:2px;display:inline-block}
  .ed-empty{padding:14px;text-align:center;color:var(--text-muted);font-size:11px}
  .ed-note{font-size:11px;color:var(--text-secondary);border:1px solid var(--border);border-radius:9px;padding:9px 12px;margin-bottom:12px}
  @media(max-width:900px){.ed-g5,.ed-g4,.ed-g3,.ed-g2{grid-template-columns:1fr 1fr}.ed-meta{text-align:left}}
  </style>`;
}
