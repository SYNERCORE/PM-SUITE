function renderCosts(){
const{costs,projects}=AppState.data;
const totP=costs.reduce((s,c)=>s+c.planned,0),totA=costs.reduce((s,c)=>s+c.actual,0);
const avgProg=projects.reduce((s,p)=>s+p.progress,0)/projects.length/100;
const EV=totP*avgProg,AC=totA,PV=totP*.56;
const CPI=(EV/AC).toFixed(2),SPI=(EV/PV).toFixed(2);
const cv=EV-AC,EAC=totP/parseFloat(CPI);
$('#costs').innerHTML=`<div class="section-header" style="margin-bottom:14px">
<div class="section-title">Cost Control &amp; EVM</div>
<button class="btn btn-secondary btn-sm" onclick="exportCSV((AppState.data.costs||[]).map(c=>[c.id,c.projectId,c.category,c.description,c.planned,c.actual,c.planned-c.actual]),['ID','Project','Category','Description','Planned','Actual','Variance'],'costs.csv')"><i class="fas fa-download"></i> Export</button></div>
<div class="grid grid-4" style="margin-bottom:14px">
<div class="evm-card"><div class="evm-value" style="color:var(--accent-blue)">${fmtNum(totP)}</div><div class="evm-label">Planned Value (BAC)</div><div class="evm-status">Total Budget</div></div>
<div class="evm-card"><div class="evm-value" style="color:var(--accent-green)">${fmtNum(EV)}</div><div class="evm-label">Earned Value (EV)</div><div class="evm-status">Work Completed</div></div>
<div class="evm-card"><div class="evm-value" style="color:${totA>EV?'var(--accent-red)':'var(--accent-green)'}">${fmtNum(totA)}</div><div class="evm-label">Actual Cost (AC)</div><div class="evm-status" style="color:${totA>EV?'var(--accent-red)':'var(--accent-green)'}">${totA>EV?'Over Earned':'Under Earned'}</div></div>
<div class="evm-card"><div class="evm-value" style="color:${EAC>totP?'var(--accent-red)':'var(--accent-green)'}">${fmtNum(EAC)}</div><div class="evm-label">EAC (Forecast)</div><div class="evm-status" style="color:${EAC>totP?'var(--accent-red)':'var(--accent-green)'}">${EAC>totP?'Over Budget':'Within Budget'}</div></div>
</div>
<div class="grid grid-3" style="margin-bottom:14px">
<div class="evm-card"><div class="evm-value" style="color:${parseFloat(CPI)>=1?'var(--accent-green)':'var(--accent-red)'}">${CPI}</div><div class="evm-label">Cost Performance Index (CPI)</div><div class="evm-status" style="color:${parseFloat(CPI)>=1?'var(--accent-green)':'var(--accent-red)'}">${parseFloat(CPI)>=1?'&#10003; Cost Efficient':'&#10007; Cost Overrun'}</div></div>
<div class="evm-card"><div class="evm-value" style="color:${parseFloat(SPI)>=1?'var(--accent-green)':'var(--accent-amber)'}">${SPI}</div><div class="evm-label">Schedule Performance Index (SPI)</div><div class="evm-status" style="color:${parseFloat(SPI)>=1?'var(--accent-green)':'var(--accent-amber)'}">${parseFloat(SPI)>=1?'&#10003; On Schedule':'! Behind Schedule'}</div></div>
<div class="evm-card"><div class="evm-value" style="color:${cv>=0?'var(--accent-green)':'var(--accent-red)'}">₱${fmtNum(Math.abs(cv))}</div><div class="evm-label">Cost Variance (CV)</div><div class="evm-status" style="color:${cv>=0?'var(--accent-green)':'var(--accent-red)'}">${cv>=0?'Under Budget':'Over Budget'}</div></div>
</div>
<div class="grid grid-2" style="margin-bottom:14px">
<div class="card"><div class="card-title">Cost by Category</div><canvas id="costCat" height="150" style="width:100%"></canvas></div>
<div class="card"><div class="card-title">S-Curve: Planned vs Actual</div><canvas id="sCurve" height="150" style="width:100%"></canvas></div>
</div>
<div class="card"><div class="table-wrap"><table>
<thead><tr><th>ID</th><th>Project</th><th>Category</th><th>Description</th><th>Planned</th><th>Actual</th><th>Variance</th><th>Util%</th></tr></thead>
<tbody>${_pgSlice("costs",costs).map(c=>{const v=c.planned-c.actual,pct=Math.round((c.actual/c.planned)*100);return`<tr>
<td style="font-size:10px;font-family:var(--font-mono)">${c.id}</td>
<td><span class="badge badge-blue">${c.projectId}</span></td>
<td><span class="badge badge-purple">${c.category}</span></td>
<td style="font-size:11px">${c.description}</td>
<td style="font-family:var(--font-mono)">${fmtCur(c.planned)}</td>
<td style="font-family:var(--font-mono)">${fmtCur(c.actual)}</td>
<td style="font-family:var(--font-mono);color:${v>=0?'var(--accent-green)':'var(--accent-red)'}">${v>=0?'+':''}${fmtCur(Math.abs(v))}</td>
<td><div style="display:flex;align-items:center;gap:5px"><div class="progress-bar" style="width:55px;height:5px"><div class="progress-fill" style="width:${Math.min(100,pct)}%;background:${pct>90?'var(--accent-red)':pct>70?'var(--accent-amber)':'var(--accent-green)'}"></div></div><span style="font-size:10px;font-family:var(--font-mono)">${pct}%</span></div></td>
</tr>`;}).join('')}</tbody></table>${_pgNav("risks",risks,typeof renderRisks==="function"?renderRisks:null)}</div></div>`;
setTimeout(()=>{
let c=$('#costCat');if(c){c.width=c.parentElement.offsetWidth-30;const cats=[...new Set(costs.map(c=>c.category))];drawBar('costCat',cats,cats.map(ct=>costs.filter(c=>c.category===ct).reduce((s,c)=>s+c.planned,0)),'#bc8cff');}
c=$('#sCurve');if(c){c.width=c.parentElement.offsetWidth-30;drawLine('sCurve',[{data:[0,totP*.08,totP*.2,totP*.36,totP*.5,totP*.65,totP*.8,totP],color:'#388bfd'},{data:[0,totP*.06,totP*.17,totP*.32,totP*.46,totP*.6,totP*.73,null],color:'#3fb950'}]);}
},50);}
