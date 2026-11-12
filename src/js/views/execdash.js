// ╔══════════════════════════════════════════════════════════════╗
// ║  EXECUTION DASHBOARD  (per-project, OMT-style one-page view)   ║
// ║  Live from existing modules + editable manual fields, with a   ║
// ║  daily snapshot that freezes the whole page for the record.    ║
// ╚══════════════════════════════════════════════════════════════╝

// View state: null = live; otherwise a snapshot date string 'YYYY-MM-DD'.
let _edViewSnap = null;
// Where the dashboard is being shown: 'detail' = inside a project tab,
// 'global' = the top-level sidebar page (its own project picker).
let _edCtx = 'detail';
let _edGlobalPid = null;
// Project picker hides finished projects by default; toggle to include them.
let _edShowCompleted = false;
function _edIsDone(p){ return p && (p.status==='completed' || p.status==='closed'); }
// Re-render whichever context is currently active (used by snapshot/manual actions).
function _edRerender(){ _edCtx==='global' ? renderExecDashboardPage() : renderExecDashboard(); }

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
  const _esef={};   // taskId -> {es,ef,crit,tf} from CPM (shared with Planned Work below)
  let cpm={len:0,driving:'—',nearCrit:0,forecast:null,baseline:p.endDate||null,rows:[]};
  try{
    if(window.SHICCPMEngine && tasks.length){
      const r=SHICCPMEngine.runFullCPM(tasks,p);
      const cm=r.tasks||[];
      const toStr=d=>d? (typeof d==='object'?d.toISOString().split('T')[0]:String(d)):'';
      cm.forEach(t=>{ _esef[t.id]={es:toStr(t._ES),ef:toStr(t._EF),crit:!!t._isCritical,tf:+(t._TF||0)}; });
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

  // ── Planned Work — Next 3 Days ──
  const _win3=(function(){const d=new Date(today+'T00:00:00');d.setDate(d.getDate()+3);return d.toISOString().split('T')[0];})();
  const planned3=tasks.filter(t=>!(t.isSummary||t.summary||t.milestone)).map(t=>{
    const ref=_esef[t.id]||{};
    const start=ref.es||t.startDate||'';
    const finish=ref.ef||t.endDate||t.dueDate||'';
    return {name:t.name||'(untitled)', start, finish, pct:_taskPct(t), crit:!!ref.crit, owner:t.assignee||t.owner||t.responsiblePerson||''};
  })
  .filter(x=>x.pct<100 && x.start && x.start<=_win3 && (!x.finish || x.finish>=today))  // not done & overlaps the next 3 days
  .sort((a,b)=>(a.start||'').localeCompare(b.start||'')||(a.finish||'').localeCompare(b.finish||''))
  .slice(0,10);

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
    actRows, riskRows, qualRows, phaseRows, last24, planned3,
    safety:{...st.safety, manHrs:manHrsCum, onsite:onsiteTot},
    contractors:st.contractors||0,
    weather:st.weather||'', weatherFc:st.weatherFc||'',
    // System Completion is now tracked from TASKS (not manual permits)
    sysTotal: tasks.length,
    sysDone: tasks.filter(t=>_taskPct(t)>=100).length,
    sysOpen: tasks.length - tasks.filter(t=>_taskPct(t)>=100).length,
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
  _edCtx='detail';
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

// ── Top-level sidebar page (global, with its own project picker) ──
function renderExecDashboardPage(){
  _edCtx='global';
  const el=document.getElementById('execdashboard'); if(!el) return;
  const projs=(AppState.data.projects||[]).filter(p=>!p._deleted&&p.status!=='prospect'&&p.status!=='archived');
  if(!_edGlobalPid || !projs.some(p=>p.id===_edGlobalPid)){
    const active=projs.filter(p=>!_edIsDone(p));   // prefer a not-completed project by default
    _edGlobalPid=(active[0]||projs[0]||{}).id||null;
  }
  if(!_edGlobalPid){ el.innerHTML='<div class="card" style="padding:40px;text-align:center;color:var(--text-muted)"><i class="fas fa-gauge-high" style="font-size:28px;display:block;margin-bottom:12px"></i>No active projects to show. Create a project first.</div>'; return; }
  const pid=_edGlobalPid;
  if(_edViewSnap!==null && !_edSnaps(pid).some(s=>s.date===_edViewSnap)) _edViewSnap=null;
  const live=_edViewSnap===null;
  let model;
  if(live){ model=_edModel(pid); }
  else { const snap=_edSnaps(pid).find(s=>s.date===_edViewSnap); model=snap?snap.data:_edModel(pid); }
  if(!model){ el.innerHTML='<div class="card" style="padding:24px;text-align:center;color:var(--text-muted)">Project not found.</div>'; return; }
  el.innerHTML=`<div style="margin-bottom:14px"><h1 class="page-title" style="margin:0"><i class="fas fa-gauge-high" style="margin-right:8px;color:var(--accent-cyan)"></i>Execution Dashboard</h1></div>`+_edRender(model,{live,pid});
}

// ── Toolbar ───────────────────────────────────────────────────────
function _edToolbar(model,live,pid){
  const all=(AppState.data.projects||[]).filter(p=>!p._deleted&&p.status!=='prospect'&&p.status!=='archived');
  const doneCount=all.filter(_edIsDone).length;
  // Hide finished projects unless the toggle is on; always keep the one being viewed.
  const projects=all.filter(p=>_edShowCompleted||!_edIsDone(p)||p.id===pid);
  const snaps=_edSnaps(pid);
  const pickCode = _edCtx==='global'
    ? `_edGlobalPid=this.value;_edViewSnap=null;renderExecDashboardPage()`
    : `detailProjectId=this.value;_edViewSnap=null;detailTab='execdash';renderProjectDetail()`;
  return `<div class="card" style="display:flex;align-items:center;gap:12px;flex-wrap:wrap;margin-bottom:14px;padding:10px 12px">
    <div style="display:flex;align-items:center;gap:6px">
      <span style="font-size:10px;text-transform:uppercase;letter-spacing:.3px;color:var(--text-muted);font-weight:700">Project</span>
      <select class="form-select" style="height:30px;font-size:12px;max-width:280px" onchange="${pickCode}">
        ${projects.map(p=>`<option value="${esc(p.id)}" ${p.id===pid?'selected':''}>${esc(p.id)} — ${esc(p.name)}${_edIsDone(p)?' ✓':''}</option>`).join('')}
      </select>
      ${doneCount?`<label style="display:flex;align-items:center;gap:5px;font-size:11px;color:var(--text-secondary);cursor:pointer;white-space:nowrap" title="Show ${doneCount} completed/closed project${doneCount>1?'s':''}">
        <input type="checkbox" ${_edShowCompleted?'checked':''} onchange="_edShowCompleted=this.checked;_edRerender()" style="cursor:pointer"> Show completed (${doneCount})</label>`:''}
    </div>
    <div style="display:flex;align-items:center;gap:6px">
      <span style="font-size:10px;text-transform:uppercase;letter-spacing:.3px;color:var(--text-muted);font-weight:700">View</span>
      <select class="form-select" style="height:30px;font-size:12px" onchange="_edViewSnap=this.value==='live'?null:this.value;_edRerender()">
        <option value="live" ${live?'selected':''}>● Live (today)</option>
        ${snaps.map(s=>`<option value="${esc(s.date)}" ${(!live&&_edViewSnap===s.date)?'selected':''}>Snapshot · ${esc(s.date)}</option>`).join('')}
      </select>
    </div>
    <div style="margin-left:auto;display:flex;gap:7px;flex-wrap:wrap">
      <button class="btn btn-secondary btn-sm" onclick="_edRerender()"><i class="fas fa-sync"></i> Refresh</button>
      ${live?`<button class="btn btn-secondary btn-sm" style="border-color:rgba(63,185,80,.5);color:var(--accent-green)" onclick="_edSaveSnapshot('${esc(pid)}')"><i class="fas fa-camera"></i> Save Today's Snapshot</button>`:`<button class="btn btn-secondary btn-sm" style="border-color:var(--accent-red);color:var(--accent-red)" onclick="_edDeleteSnapshot('${esc(pid)}','${esc(_edViewSnap)}')"><i class="fas fa-trash"></i> Delete Snapshot</button>`}
      <button class="btn btn-primary btn-sm" onclick="_edPrint()"><i class="fas fa-print"></i> Print / Export PDF</button>
    </div>
  </div>`;
}

// ── Latest Photos strip (reads live, not from snapshot, to keep snapshots small) ──
function _edPhotoStrip(pid){
  const photos=(AppState.data.progressPhotos||[])
    .filter(p=>p.projectId===pid && !p._deleted)
    .sort((a,b)=>(b.date||'').localeCompare(a.date||'')||(b._lastModified||'').localeCompare(a._lastModified||''))
    .slice(0,6);
  const viewAll=(_edCtx==='detail')
    ? `<button class="btn btn-secondary btn-sm" onclick="detailTab='photos';renderDetailTab()" style="margin-left:auto"><i class="fas fa-images"></i> View all</button>`
    : '';
  const body = photos.length
    ? `<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:10px">
        ${photos.map(ph=>`<div style="border:1px solid var(--border-subtle,rgba(255,255,255,.08));border-radius:8px;overflow:hidden">
          <img src="${ph.img}" loading="lazy" ${typeof _ppViewFull==='function'?`onclick="_ppViewFull('${ph.id}')"`:''} style="width:100%;aspect-ratio:4/3;object-fit:cover;cursor:pointer;display:block;background:#0b0f16">
          <div style="padding:5px 7px;font-size:10px;line-height:1.3">${esc(ph.caption||'')||'<span style="color:var(--text-muted)">—</span>'}<div style="color:var(--text-muted);font-size:9px;margin-top:2px">${esc(ph.date||'')}${ph.tag?' · '+esc(ph.tag):''}</div></div>
        </div>`).join('')}
      </div>`
    : `<div class="ed-empty">No progress photos yet. Add them in the Progress Photos tab.</div>`;
  return `<div class="card ed-mb">
    <div class="ed-h3" style="display:flex;align-items:center">Latest Photos <span class="ed-src" style="margin:0 0 0 8px">newest site photos</span>${viewAll}</div>
    ${body}
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
      <div class="ed-h3">Planned Work — Next 3 Days <span class="ed-src" style="margin:0">tasks scheduled today → +3 days</span></div>
      <ul class="ed-list">
        ${(m.planned3||[]).map(x=>`<li><i class="ed-dot" style="background:${x.crit?'var(--accent-red)':'var(--accent-blue)'}"></i><div><b>${esc(x.name)}</b> <span class="ed-sub2">${esc(x.start)}${x.finish&&x.finish!==x.start?' → '+esc(x.finish):''}${x.crit?' · Critical':''}${x.owner?' · '+esc(x.owner):''}</span> <span class="ed-tag t-lo">${x.pct}%</span></div></li>`).join('')||'<li style="color:var(--text-muted)">No tasks scheduled in the next 3 days.</li>'}
      </ul>
      <div class="ed-src">Not-yet-complete tasks whose schedule (CPM early dates, else task dates) overlaps the next 3 days; critical path in red.</div>
    </div>
  </div>

  <div class="card ed-mb">
    <div class="ed-h3">Phase Progress</div>
    ${m.phaseRows.map(ph=>`<div class="ed-phase"><div class="ed-pn">${esc(ph.phase)} <span class="ed-sub2">(${ph.n})</span></div><div style="flex:1">${bar(ph.pct,'var(--accent-green)')}</div><div class="ed-mono" style="width:40px;text-align:right">${ph.pct}%</div></div>`).join('')||'<div class="ed-empty">No task phases defined.</div>'}
    <div class="ed-src">Average % complete per phase (tasks grouped by Phase).</div>
  </div>

  ${_edPhotoStrip(pid)}

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
      <div class="ed-h3">System Completion <span class="ed-src" style="margin:0">from Tasks</span></div>
      <div class="ed-g2">
        <div class="ed-kpi"><div class="ed-lbl">Total Activities</div><div class="ed-num">${m.sysTotal||0}</div></div>
        <div class="ed-kpi"><div class="ed-lbl">Completed</div><div class="ed-num" style="color:var(--accent-green)">${m.sysDone||0}</div></div>
        <div class="ed-kpi"><div class="ed-lbl">Open Activities</div><div class="ed-num" style="color:var(--accent-amber)">${m.sysOpen||0}</div></div>
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
  const r=st.ratings, s=st.safety;
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
      <div><div class="ed-lbl">Unsafe condition</div>${numI('safety.unsafeCond',s.unsafeCond)}</div>
      <div><div class="ed-lbl">Unsafe act</div>${numI('safety.unsafeAct',s.unsafeAct)}</div>
    </div>
    <div class="ed-g4" style="margin-top:10px">
      <div><div class="ed-lbl">Near miss</div>${numI('safety.nearMiss',s.nearMiss)}</div>
      <div><div class="ed-lbl">First aid</div>${numI('safety.firstAid',s.firstAid)}</div>
      <div><div class="ed-lbl">Medical treatment</div>${numI('safety.mtc',s.mtc)}</div>
      <div><div class="ed-lbl">Lost-time injury</div>${numI('safety.lti',s.lti)}</div>
    </div>
    <div class="ed-g4" style="margin-top:10px">
      <div><div class="ed-lbl">LTIFR</div>${numI('safety.ltifr',s.ltifr)}</div>
    </div>
    <div class="ed-g2" style="margin-top:10px">
      <div><div class="ed-lbl">Weather — today</div>${txtI('weather',st.weather,'e.g. Sunny, 32°C')}</div>
      <div><div class="ed-lbl">Weather — forecast</div>${txtI('weatherFc',st.weatherFc,'e.g. Rain expected PM')}</div>
    </div>
    <div style="margin-top:10px"><button class="btn btn-secondary btn-sm" onclick="_edRerender()"><i class="fas fa-sync"></i> Apply to dashboard</button></div>
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
  _edViewSnap=null; _edRerender();
}
function _edDeleteSnapshot(pid,date){
  if(!confirm('Delete the snapshot for '+date+'? This cannot be undone.')) return;
  AppState.data.execDashSnapshots=(AppState.data.execDashSnapshots||[]).filter(s=>!(s.projectId===pid&&s.date===date));
  AppState.save();
  _edViewSnap=null; _edRerender();
  showToast('Snapshot '+date+' deleted','warning');
}

// ── Print / Export PDF ────────────────────────────────────────────
// Resolve the pid + model for whichever context/snapshot is active.
function _edCurrentPidModel(){
  const pid = (_edCtx==='global') ? _edGlobalPid : detailProjectId;
  if(!pid) return null;
  const live = _edViewSnap===null;
  let model;
  if(live){ model=_edModel(pid); }
  else { const snap=_edSnaps(pid).find(s=>s.date===_edViewSnap); model=snap?snap.data:_edModel(pid); }
  return {pid, live, model};
}

// ── Print / Export PDF — purpose-built ONE-PAGE A4 landscape report ──
function _edPrint(){
  const ctx=_edCurrentPidModel();
  if(!ctx||!ctx.model){showToast('Open the dashboard first','error');return;}
  const {pid,live,model:m}=ctx;
  const p=(AppState.data.projects||[]).find(x=>x.id===pid)||{};
  let lh={}, doc={docNo:'',rev:'0'};
  try{ if(typeof _pdfLetterheadForProject==='function') lh=_pdfLetterheadForProject(p)||{}; }catch(e){}
  try{ if(typeof _pdfDocCtrlForProject==='function') doc=_pdfDocCtrlForProject(p,'execdash')||doc; }catch(e){}
  const photos=(AppState.data.progressPhotos||[])
    .filter(x=>x.projectId===pid&&!x._deleted)
    .sort((a,b)=>(b.date||'').localeCompare(a.date||'')||(b._lastModified||'').localeCompare(a._lastModified||''))
    .slice(0,3);
  const w=window.open('','_edprint','width=1200,height=850');
  if(!w){showToast('Pop-up blocked — allow pop-ups to print','error');return;}
  w.document.write(_edPrintHTML(m,p,lh,doc,photos,live));
  w.document.close();
  setTimeout(()=>{ try{w.focus();w.print();}catch(e){} },350);
}

// money/number/date helpers for the print
function _pMoneyShort(n){ n=Number(n)||0; const a=Math.abs(n);
  if(a>=1e6) return (n/1e6).toFixed(a>=1e8?0:1)+'M';
  if(a>=1e3) return (n/1e3).toFixed(0)+'K';
  return n.toLocaleString(); }
function _pPctUsed(a,b){ b=Number(b)||0; return b? Math.round((Number(a)||0)/b*100)+'%':'—'; }
function _pDateShort(s){ if(!s)return '—'; const d=new Date((''+s).length<=10?s+'T00:00:00':s); if(isNaN(d))return esc(s);
  return d.toLocaleDateString('en-GB',{day:'2-digit',month:'short'}); }
function _pMd(s){ if(!s)return '—'; const d=new Date((''+s).length<=10?s+'T00:00:00':s); if(isNaN(d))return esc(s);
  return (''+(d.getMonth()+1)).padStart(2,'0')+'/'+(''+d.getDate()).padStart(2,'0'); }
function _pRating(v){ const[l,c]=_edRating(v); return `<span class="pill ${c}">${l[0]+l.slice(1).toLowerCase()}</span>`; }

function _edPrintHTML(m,p,lh,doc,photos,live){
  const esc2=s=>esc(s==null?'':s);
  const bu=(AppState.data.businessUnits||[]).find(b=>b.id===(m.project&&m.project.bu))||null;
  const buName=(bu&&bu.name)||'';
  const logo=lh.logoDataUrl||'';
  const company=lh.companyName||(AppState.data.settings&&AppState.data.settings.companyName)||'Company';
  const addr=[lh.addressLine,lh.contactLine].filter(Boolean).join(' · ');
  const now=new Date();
  const by=(AppState.currentUser&&AppState.currentUser.name)||'';
  const ver=(typeof APP_VERSION!=='undefined')?('v'+APP_VERSION):'';
  const pVar=(Number(m.actualPct)||0)-(Number(m.plannedPct)||0);
  const fc=m.cpm||{};
  const fcVar=fc.fcVar;
  const fcTxt = (fcVar==null)?'' : (fcVar>0?`${fcVar}d early`:(fcVar<0?`${-fcVar}d late`:'on time'));
  const fcCls = (fcVar==null)?'':(fcVar>0?'var(--green)':(fcVar<0?'var(--red)':'var(--muted)'));
  const openNcr=(m.qualRows||[]).filter(q=>/ncr/i.test(q.type||'')&&/open/i.test(q.status||'')).length;
  const cpmRows=(fc.rows||[]).slice(0,4);
  const budRows=(m.budgetRows||[]).slice(0,6);
  const roleRows=(m.roleRows||[]).slice(0,5);
  const procRows=(m.procRows||[]).slice(0,4);
  const actRows=(m.actRows||[]).slice(0,4);
  const planned=(m.planned3||[]).slice(0,4);
  const phases=(m.phaseRows||[]).slice(0,4);
  const risks=(m.riskRows||[]).slice(0,3);
  const quals=(m.qualRows||[]).slice(0,2);
  const last=[].concat((m.last24&&m.last24.completed||[]).map(x=>({t:'Completed',n:x.name,x:x.from!=null?x.from+'%→100%':'→100%',c:'var(--green)'})),
                       (m.last24&&m.last24.advanced||[]).map(x=>({t:'Advanced',n:x.name,x:x.from+'%→'+x.to+'%',c:'var(--blue)'}))).slice(0,3);
  const sevCls=s=>/high|critical/i.test(s)?'t-red':/low|obs/i.test(s)?'t-green':'t-amber';
  const sevLbl=s=>{s=(s||'').toLowerCase();return s?s[0].toUpperCase()+s.slice(1):'Med';};
  const stat=m.safety||{};

  const css=`<style>
  :root{--ink:#14181f;--muted:#5b6672;--line:#d4dae3;--soft:#eef2f8;--blue:#1f6feb;--green:#1a7f37;--amber:#9a6700;--red:#cf222e;--cyan:#0b7285}
  *{box-sizing:border-box}
  body{margin:0;background:#fff;color:var(--ink);font-family:"Segoe UI",system-ui,Arial,sans-serif}
  .page{padding:4mm 5mm;display:flex;flex-direction:column;min-height:0}
  .lh{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2px solid var(--blue);padding-bottom:7px;margin-bottom:7px}
  .lh-l{display:flex;gap:11px;align-items:center}
  .logo{height:50px;max-width:150px;object-fit:contain}
  .logo-ph{width:116px;height:48px;border:1px dashed #9db3d6;border-radius:6px;display:flex;align-items:center;justify-content:center;font-size:8px;color:#5a7bb5;background:#f5f9ff;font-weight:700;text-align:center}
  .co .nm{font-size:14.5px;font-weight:800}
  .co .ad{font-size:9px;color:var(--muted)}
  .bu-chip{display:inline-block;font-size:8.5px;font-weight:800;color:#fff;background:var(--cyan);border-radius:4px;padding:1.5px 7px;margin-top:3px}
  .lh-r{text-align:right;line-height:1.35}
  .lh-r .dt{font-size:14.5px;font-weight:800;color:var(--blue);letter-spacing:.5px}
  .lh-r .mt{font-size:9px;color:var(--muted)} .lh-r .mt b{color:var(--ink)}
  .titlebar{display:flex;justify-content:space-between;align-items:baseline;margin-bottom:7px;gap:12px}
  .titlebar .pj{font-size:12.5px;font-weight:800;line-height:1.2}
  .titlebar .pj small{font-weight:600;color:var(--muted);font-size:9.5px}
  .live{font-size:8.5px;font-weight:800;border-radius:999px;padding:2px 8px;white-space:nowrap}
  .live.on{color:var(--green);border:1px solid #9fd8af;background:#eafaf0}
  .live.snap{color:var(--amber);border:1px solid #e6c88a;background:#fff5e6}
  .kpis{display:grid;grid-template-columns:repeat(7,1fr);gap:6px;margin-bottom:8px}
  .kpi{border:1px solid var(--line);border-radius:7px;padding:6px 7px;text-align:center;background:var(--soft)}
  .kpi .l{font-size:7.5px;text-transform:uppercase;letter-spacing:.3px;color:var(--muted);font-weight:800;margin-bottom:2px}
  .kpi .v{font-size:15px;font-weight:800;font-family:"Consolas",monospace;line-height:1}
  .kpi .s{font-size:7.5px;color:var(--muted);margin-top:2px}
  .pill{display:inline-block;font-size:10px;font-weight:800;padding:2px 8px;border-radius:999px}
  .p-good{background:#eafaf0;color:var(--green)}.p-mod{background:#fff5e6;color:var(--amber)}.p-low{background:#fdecee;color:var(--red)}.p-na{background:#eef1f5;color:var(--muted)}
  .body{display:grid;grid-template-columns:1.15fr 1fr 1.05fr;gap:9px;flex:1;min-height:0}
  .col{display:flex;flex-direction:column;gap:8px;min-height:0}
  .box{border:1px solid var(--line);border-radius:7px;padding:6px 8px}
  .h{font-size:8.5px;font-weight:800;text-transform:uppercase;letter-spacing:.4px;color:#39424e;margin:0 0 4px;display:flex;justify-content:space-between;align-items:center}
  .h .src{font-size:7px;color:#93a0ad;font-weight:700;text-transform:none}
  table{width:100%;border-collapse:collapse;font-size:8.8px}
  th{text-align:left;color:var(--muted);font-weight:700;font-size:7px;text-transform:uppercase;letter-spacing:.2px;padding:2px 4px;border-bottom:1px solid var(--line)}
  td{padding:2.3px 4px;border-bottom:1px solid #eef1f5;line-height:1.2}
  td.r,th.r{text-align:right;font-variant-numeric:tabular-nums}
  tr:last-child td{border-bottom:none}
  .tot td{font-weight:800;border-top:1.5px solid var(--line)}
  .mono{font-family:"Consolas",monospace}
  .tag{font-size:7px;font-weight:800;padding:1px 6px;border-radius:999px;white-space:nowrap}
  .t-red{background:#fdecee;color:var(--red)}.t-blue{background:#eaf2fe;color:var(--blue)}.t-amber{background:#fff5e6;color:var(--amber)}.t-green{background:#eafaf0;color:var(--green)}
  .bar{height:6px;border-radius:999px;background:#e7ebf1;overflow:hidden}.bar>i{display:block;height:100%}
  ul.list{margin:0;padding:0;list-style:none;font-size:8.8px}
  ul.list li{padding:2.3px 0;border-bottom:1px solid #eef1f5;display:flex;gap:6px;align-items:flex-start;line-height:1.25}
  ul.list li:last-child{border-bottom:none}
  .dot{width:6px;height:6px;border-radius:50%;margin-top:3px;flex-shrink:0}
  .foot{display:flex;justify-content:space-between;align-items:center;gap:10px;border-top:1px solid var(--line);margin-top:7px;padding-top:5px}
  .photos{display:flex;gap:6px}
  .ph{width:80px;height:52px;border:1px solid var(--line);border-radius:4px;object-fit:cover;background:#dfe7f2}
  .ph-cap{font-size:6.5px;color:#43505f;text-align:center;max-width:80px;line-height:1.1;margin-top:1px}
  .foot .gen{font-size:7.5px;color:var(--muted);text-align:right;line-height:1.4}
  @page{size:A4 landscape;margin:7mm}
  </style>`;

  const kpi=(l,v,s,vcol)=>`<div class="kpi"><div class="l">${l}</div><div class="v"${vcol?` style="color:${vcol}"`:''}>${v}</div><div class="s">${s||''}</div></div>`;

  return `<!doctype html><html><head><meta charset="utf-8"><title>Execution Dashboard — ${esc2(m.project.id)}</title>${css}</head><body><div class="page">
  <div class="lh">
    <div class="lh-l">
      ${logo?`<img class="logo" src="${logo}" alt="logo">`:`<div class="logo-ph">BU LOGO<br>(set in Business Unit)</div>`}
      <div class="co"><div class="nm">${esc2(company)}</div>${addr?`<div class="ad">${esc2(addr)}</div>`:''}${buName?`<span class="bu-chip">BU: ${esc2(buName).toUpperCase()}</span>`:''}</div>
    </div>
    <div class="lh-r">
      <div class="dt">EXECUTION DASHBOARD</div>
      <div class="mt"><b>Doc No:</b> ${esc2(doc.docNo||'—')} · <b>Rev:</b> ${esc2(doc.rev||'0')}</div>
      <div class="mt"><b>Report date:</b> ${now.toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'numeric'})} · ${now.toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit'})}</div>
    </div>
  </div>

  <div class="titlebar">
    <div class="pj">${esc2(m.project.id)} — ${esc2(m.project.name)}<small>${m.project.client?' · Client: '+esc2(m.project.client):''}${m.dayNo?' · Project Day No. '+m.dayNo+(m.daysLeft!=null?' ('+m.daysLeft+' left)':''):''}</small></div>
    <span class="live ${live?'on':'snap'}">${live?'● LIVE (today)':'◧ SNAPSHOT '+esc2(m.date||'')}</span>
  </div>

  <div class="kpis">
    ${kpi('Overall %',(m.actualPct||0)+'%','plan '+(m.plannedPct||0)+'% · <span style="color:'+(pVar>=0?'var(--green)':'var(--amber)')+'">'+(pVar>=0?'+':'')+pVar+'</span>')}
    ${kpi('SPI',(m.spi!=null?m.spi:'—'),(m.spi>=1?'on/above plan':'behind'),(m.spi>=1?'var(--green)':'var(--amber)'))}
    ${kpi('Forecast Finish',_pDateShort(fc.forecast),fcTxt,fcCls)}
    ${kpi('System Compl.',(m.sysComplete||0)+'%',(m.sysDone||0)+' / '+(m.sysTotal||0)+' tasks')}
    ${kpi('Open Actions',(m.actRows||[]).length,(m.actRows||[]).filter(a=>a.overdue).length+' overdue',((m.actRows||[]).filter(a=>a.overdue).length?'var(--red)':''))}
    <div class="kpi"><div class="l">Safety</div><div style="margin-top:3px">${_pRating(m.perf.safety)}</div><div class="s">${(stat.lti||0)} LTI · ${(stat.nearMiss||0)} NM</div></div>
    <div class="kpi"><div class="l">Quality</div><div style="margin-top:3px">${_pRating(m.perf.quality)}</div><div class="s">${openNcr} open NCR</div></div>
  </div>

  <div class="body">
    <div class="col">
      <div class="box">
        <div class="h">Budget &amp; Cost <span class="src">Resource Allocation (₱)</span></div>
        <table><thead><tr><th>Category</th><th class="r">Budget</th><th class="r">Actual</th><th class="r">%</th></tr></thead><tbody>
          ${budRows.map(r=>`<tr><td>${esc2(r.label)}</td><td class="r mono">${_pMoneyShort(r.budget)}</td><td class="r mono">${_pMoneyShort(r.actual)}</td><td class="r">${_pPctUsed(r.actual,r.budget)}</td></tr>`).join('')||'<tr><td colspan="4" style="color:#93a0ad">No allocation data.</td></tr>'}
          ${budRows.length?`<tr class="tot"><td>TOTAL</td><td class="r mono">${_pMoneyShort(m.budTotB)}</td><td class="r mono">${_pMoneyShort(m.budTotA)}</td><td class="r">${_pPctUsed(m.budTotA,m.budTotB)}</td></tr>`:''}
        </tbody></table>
      </div>
      <div class="box" style="flex:1">
        <div class="h">Man-hours by Role <span class="src">${m.hpd}h/d × ${m.dpw}d + OT</span></div>
        <table><thead><tr><th>Role</th><th class="r">Site</th><th class="r">Plan</th><th class="r">Act</th><th class="r">%</th></tr></thead><tbody>
          ${roleRows.map(r=>`<tr><td>${esc2(r.role)}</td><td class="r mono">${r.onsite}</td><td class="r mono">${Math.round(r.planHrs).toLocaleString()}</td><td class="r mono">${Math.round(r.actHrs).toLocaleString()}</td><td class="r">${_pPctUsed(r.actHrs,r.planHrs)}</td></tr>`).join('')||'<tr><td colspan="5" style="color:#93a0ad">No manpower records.</td></tr>'}
          ${roleRows.length?`<tr class="tot"><td>TOTAL</td><td class="r mono">${m.onsiteTot}</td><td class="r mono">${Math.round(m.mhPlan).toLocaleString()}</td><td class="r mono">${Math.round(m.mhAct).toLocaleString()}</td><td class="r">${_pPctUsed(m.mhAct,m.mhPlan)}</td></tr>`:''}
        </tbody></table>
        <div class="h" style="margin-top:6px">Phase Progress</div>
        ${phases.map(ph=>`<div style="display:flex;align-items:center;gap:7px;margin:2.5px 0"><span style="width:78px;font-size:8px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc2(ph.phase)}</span><div class="bar" style="flex:1"><i style="width:${ph.pct}%;background:var(--green)"></i></div><span class="mono" style="font-size:8px;width:30px;text-align:right">${ph.pct}%</span></div>`).join('')||'<div style="font-size:8px;color:#93a0ad">No phases.</div>'}
      </div>
    </div>

    <div class="col">
      <div class="box">
        <div class="h">Critical Path (CPM) <span class="src">${fc.forecast?'finish '+_pDateShort(fc.forecast):''}${fc.nearCrit?' · '+fc.nearCrit+' near':''}</span></div>
        <table><thead><tr><th>Driving Task</th><th class="r">Start</th><th class="r">Finish</th><th class="r">%</th></tr></thead><tbody>
          ${cpmRows.map(t=>`<tr><td>${esc2(t.name)} ${t.near?'<span class="tag t-amber">TF'+t.tf+'</span>':'<span class="tag t-red">crit</span>'}</td><td class="r mono">${_pMd(t.start)}</td><td class="r mono">${_pMd(t.finish)}</td><td class="r">${t.pct}%</td></tr>`).join('')||'<tr><td colspan="4" style="color:#93a0ad">No critical path — add task dependencies.</td></tr>'}
        </tbody></table>
      </div>
      <div class="box" style="flex:1">
        <div class="h">Planned Work — Next 3 Days</div>
        <ul class="list">
          ${planned.map(x=>`<li><span class="dot" style="background:${x.crit?'var(--red)':'var(--blue)'}"></span><div><b>${esc2(x.name)}</b> <span style="color:var(--muted)">${_pMd(x.start)}${x.finish&&x.finish!==x.start?' → '+_pMd(x.finish):''}${x.crit?' · Critical':''}${x.owner?' · '+esc2(x.owner):''}</span> <span class="tag t-green">${x.pct}%</span></div></li>`).join('')||'<li style="color:#93a0ad">No tasks scheduled in the next 3 days.</li>'}
        </ul>
        <div class="h" style="margin-top:6px">Last 24 Hours</div>
        <ul class="list">
          ${last.map(x=>`<li><span class="dot" style="background:${x.c}"></span><div><b>${x.t}:</b> ${esc2(x.n)} <span class="mono" style="font-size:7.5px">${x.x}</span></div></li>`).join('')||'<li style="color:#93a0ad">No changes logged (save a daily snapshot to track).</li>'}
        </ul>
      </div>
    </div>

    <div class="col">
      <div class="box">
        <div class="h">Procurement — Aged <span class="src">oldest first</span></div>
        <table><thead><tr><th>Ref</th><th>Item</th><th class="r">Age</th><th>Assignee</th></tr></thead><tbody>
          ${procRows.map(r=>`<tr><td class="mono">${esc2(r.ref)}</td><td>${esc2((r.desc||'').slice(0,22))}</td><td class="r">${r.age!=null?'<span class="tag '+_edAgeCls(r.age)+'">'+r.age+'d</span>':'—'}</td><td>${r.assignee?esc2(r.assignee):'<span style="color:var(--amber)">Unassigned</span>'}</td></tr>`).join('')||'<tr><td colspan="4" style="color:#93a0ad">No procurement items.</td></tr>'}
        </tbody></table>
      </div>
      <div class="box">
        <div class="h">★ Open Action Items <span class="src">${(m.actRows||[]).length} open · ${(m.actRows||[]).filter(a=>a.overdue).length} overdue</span></div>
        <table><thead><tr><th>Action</th><th>Owner</th><th>Due</th><th>Status</th></tr></thead><tbody>
          ${actRows.map(a=>`<tr><td>${esc2((a.desc||'').slice(0,26))}</td><td>${esc2(a.owner||'—')}</td><td class="mono">${a.due?_pMd(a.due):'—'}</td><td><span class="tag ${a.overdue?'t-amber':a.status==='inprogress'?'t-blue':'t-red'}">${a.overdue?'Overdue':esc2(a.status||'open')}</span></td></tr>`).join('')||'<tr><td colspan="4" style="color:#93a0ad">No open actions. 🎉</td></tr>'}
        </tbody></table>
      </div>
      <div class="box" style="flex:1">
        <div class="h">Risks / Quality</div>
        <ul class="list">
          ${risks.map(r=>`<li><span class="dot" style="background:${/high|critical/i.test(r.sev)?'var(--red)':/low/i.test(r.sev)?'var(--green)':'var(--amber)'}"></span><div>${esc2(r.desc)} <span class="tag ${sevCls(r.sev)}">${sevLbl(r.sev)}</span></div></li>`).join('')}
          ${quals.map(q=>`<li><span class="dot" style="background:${/ncr/i.test(q.type)?'var(--red)':'var(--green)'}"></span><div>${esc2(q.desc)} <span class="tag ${/ncr/i.test(q.type)?'t-red':'t-green'}">${esc2(q.type)}</span></div></li>`).join('')}
          ${(!risks.length&&!quals.length)?'<li style="color:#93a0ad">No open risks or quality items.</li>':''}
        </ul>
      </div>
    </div>
  </div>

  <div class="foot">
    <div class="photos">
      ${photos.map(ph=>`<div><img class="ph" src="${ph.img}"><div class="ph-cap">${esc2((ph.caption||'').slice(0,26))}${ph.date?' · '+_pMd(ph.date):''}</div></div>`).join('')||'<span style="font-size:8px;color:#93a0ad">No progress photos — add them in the Progress Photos tab.</span>'}
    </div>
    <div class="gen">Generated ${now.toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'numeric'})} ${now.toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit'})}${by?' by '+esc2(by):''} · SHIC Enterprise PM Suite ${ver}<br>Confidential — internal project management use · Page 1 / 1</div>
  </div>
  </div></body></html>`;
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
