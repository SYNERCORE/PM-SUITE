function renderCalendar(){
$('#calendar').innerHTML=`<div class="section-header" style="margin-bottom:14px">
<div class="section-title">Project Calendar</div>
<div style="display:flex;gap:7px;align-items:center">
<button class="btn btn-secondary btn-sm" onclick="calNav(-1)"><i class="fas fa-chevron-left"></i></button>
<span style="font-size:13px;font-weight:600;min-width:130px;text-align:center" id="calTitle"></span>
<button class="btn btn-secondary btn-sm" onclick="calNav(1)"><i class="fas fa-chevron-right"></i></button>
<button class="btn btn-secondary btn-sm" onclick="calDate=new Date();renderCalendarGrid()">Today</button>
</div></div>
<div style="display:grid;grid-template-columns:repeat(7,1fr);gap:4px;margin-bottom:4px">
${['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map(d=>`<div style="text-align:center;font-size:10px;font-weight:600;color:var(--text-secondary);padding:4px">${d}</div>`).join('')}
</div>
<div style="display:grid;grid-template-columns:repeat(7,1fr);gap:4px" id="calGrid"></div>
<div class="card" style="margin-top:14px"><div class="card-title" style="margin-bottom:10px">Upcoming Events &amp; Deadlines</div><div id="upcomingEvents"></div></div>`;
renderCalendarGrid();}

function calNav(dir){calDate=new Date(calDate);calDate.setMonth(calDate.getMonth()+dir);renderCalendarGrid();}

function renderCalendarGrid(){
const y=calDate.getFullYear(),m=calDate.getMonth();
$('#calTitle').textContent=calDate.toLocaleString('en',{month:'long',year:'numeric'});
const first=new Date(y,m,1).getDay(),days=new Date(y,m+1,0).getDate();
const today=new Date().toDateString();
const allEvents=[
...(AppState.data.tasks||[]).filter(t=>t.milestone).map(t=>({date:t.endDate,label:t.name.substring(0,20),color:'var(--accent-amber)'})),
...(AppState.data.actions||[]).filter(a=>a.status!=='closed').map(a=>({date:a.dueDate,label:a.description.substring(0,20),color:'var(--accent-red)'})),
...(AppState.data.risks||[]).filter(r=>r.status==='active').map(r=>({date:r.dueDate,label:r.description.substring(0,20),color:'var(--accent-orange)'})),
];
let html='';
for(let i=0;i<first;i++)html+=`<div class="cal-day other-month"><div class="cal-day-num">${new Date(y,m,-(first-i-1)).getDate()}</div></div>`;
for(let d=1;d<=days;d++){
const dt=new Date(y,m,d),dtStr=dt.toISOString().split('T')[0];
const isToday=dt.toDateString()===today,evs=allEvents.filter(e=>e.date===dtStr);
html+=`<div class="cal-day ${isToday?'today':''}">
<div class="cal-day-num" style="color:${isToday?'var(--accent-blue)':'inherit'}">${d}</div>
${evs.slice(0,2).map(e=>`<div class="cal-event" style="background:${e.color}22;color:${e.color}">${e.label}</div>`).join('')}
</div>`;}
const rem=42-(first+days);for(let i=1;i<=rem;i++)html+=`<div class="cal-day other-month"><div class="cal-day-num">${i}</div></div>`;
$('#calGrid').innerHTML=html;
const now=new Date();
const upcoming=[...allEvents].filter(e=>e.date&&new Date(e.date)>=now).sort((a,b)=>new Date(a.date)-new Date(b.date)).slice(0,6);
$('#upcomingEvents').innerHTML=upcoming.length?upcoming.map(e=>`
<div style="display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid var(--border)">
<div style="width:8px;height:8px;border-radius:50%;background:${e.color};flex-shrink:0"></div>
<div style="flex:1;font-size:12px;font-weight:500">${e.label}</div>
<div style="font-size:11px;font-family:var(--font-mono);color:var(--text-secondary)">${e.date}</div>
</div>`).join(''):`<div class="empty-state"><i class="fas fa-calendar-check"></i><p>No upcoming events</p></div>`;}

// ── Report filter state ───────────────────────────────────
let _reportBUFilter = 'all'; // 'all' | '' (main co) | bu.id
