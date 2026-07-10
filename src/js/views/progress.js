function renderProgress(){
const{projects,tasks}=AppState.data;
$('#progress').innerHTML=`<div class="section-header" style="margin-bottom:14px">
<div class="section-title">Progress Monitoring</div></div>
<div class="grid grid-2" style="margin-bottom:14px">
${projects.map(p=>{
const pt=tasks.filter(t=>t.projectId===p.id);
const done=pt.filter(t=>t.status==='done').length,inp=pt.filter(t=>t.status==='inprogress').length;
const dl=daysBetween(new Date().toISOString().split('T')[0],p.endDate);
const tot=daysBetween(p.startDate,p.endDate);
const te=Math.round(((tot-Math.max(0,dl))/Math.max(1,tot))*100);
return`<div class="card">
<div style="display:flex;align-items:flex-start;justify-content:space-between;margin-bottom:10px">
<div><div style="font-size:10px;color:var(--text-muted);font-family:var(--font-mono)">${p.id}</div>
<div style="font-size:14px;font-weight:600;margin:2px 0">${esc(p.name)}</div>
<div style="font-size:11px;color:var(--text-secondary)">${esc(p.pm)}</div></div>${sBadge(p.status)}</div>
<div style="margin-bottom:10px">
<div style="display:flex;justify-content:space-between;margin-bottom:3px"><span style="font-size:11px;color:var(--text-secondary)">Physical Progress</span><span style="font-size:13px;font-weight:700;font-family:var(--font-mono);color:${pColor(p.progress)}">${p.progress}%</span></div>
<div class="progress-bar" style="height:9px"><div class="progress-fill" style="width:${p.progress}%;background:${pColor(p.progress)};border-radius:5px"></div></div></div>
<div style="display:flex;justify-content:space-between;margin-bottom:3px"><span style="font-size:11px;color:var(--text-secondary)">Time Elapsed</span><span style="font-size:11px;font-family:var(--font-mono)">${te}%</span></div>
<div class="progress-bar" style="height:5px;margin-bottom:10px"><div class="progress-fill" style="width:${te}%;background:var(--accent-amber)"></div></div>
<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:7px">
${[['fa-tasks',pt.length,'Tasks','var(--text-primary)'],['fa-check',done,'Done','var(--accent-green)'],['fa-spinner',inp,'Active','var(--accent-blue)'],[dl<0?'fa-flag':'fa-clock',dl<0?'OD':dl+'d','Days Left',dl<30&&dl>0?'var(--accent-amber)':dl<=0?'var(--accent-red)':'var(--text-primary)']].map(([ic,v,l,c])=>`
<div style="text-align:center;padding:7px;background:var(--bg-hover);border-radius:6px">
<div style="font-size:14px;font-weight:700;font-family:var(--font-mono);color:${c}">${v}</div>
<div style="font-size:9px;color:var(--text-secondary)">${l}</div></div>`).join('')}
</div></div>`;}).join('')}
</div>
<div class="card"><div class="card-title">Progress Trend (Last 8 Weeks)</div><canvas id="progTrendChart" height="130" style="width:100%"></canvas></div>`;
setTimeout(()=>{const c=$('#progTrendChart');if(c){c.width=c.parentElement.offsetWidth-30;drawLine('progTrendChart',[{data:[25,30,35,38,41,45,47,50],color:'#388bfd'},{data:[55,62,70,75,78,82,87,90],color:'#3fb950'},{data:[20,24,27,30,33,36,39,41],color:'#f0a450'}]);}},50);}
