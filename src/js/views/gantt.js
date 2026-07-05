// _ganttShowBaseline: baseline ghost bars toggle (ganttFrom/To/ProjFilter declared in core.js)
let _ganttShowBaseline=true;

function renderGantt(){
  AppState.ensureData();
  const{projects,tasks}=AppState.data;

  // Gather all valid dates for auto range
  const allDates=[...tasks.filter(t=>!t._deleted).flatMap(t=>[t.startDate,t.dueDate||t.endDate]),...projects.flatMap(p=>[p.startDate,p.endDate])].filter(d=>d&&/^\d{4}-\d{2}-\d{2}$/.test(d));
  if(!allDates.length){
    $('#gantt').innerHTML=`<div class="empty-state"><i class="fas fa-stream" style="font-size:36px;margin-bottom:12px;display:block;opacity:.3"></i><p>No task dates to display. Add tasks with Start and Due dates.</p></div>`;
    return;
  }

  const autoMin=allDates.reduce((a,b)=>a<b?a:b);
  const autoMax=allDates.reduce((a,b)=>a>b?a:b);
  const effFrom=ganttFrom||autoMin;
  const effTo=ganttTo||autoMax;

  const mD=new Date(effFrom);mD.setDate(1);
  const xD=new Date(effTo);xD.setDate(xD.getDate()+14);
  const minDate=mD.toISOString().split('T')[0];
  const maxDate=xD.toISOString().split('T')[0];
  const totalDays=Math.max(1,daysBetween(minDate,maxDate));
  const today=new Date().toISOString().split('T')[0];
  const todayPct=Math.max(0,Math.min(100,daysBetween(minDate,today)/totalDays*100));

  const filteredProjects=projects.filter(p=>ganttProjFilter==='all'||p.id===ganttProjFilter);

  // ── CPM Computation ──────────────────────────────────────────
  const cpmMap=new Map();
  const cycleErrors=[];

  if(window.SHICCPMEngine){
    filteredProjects.forEach(p=>{
      const pt=tasks.filter(t=>t.projectId===p.id&&!t._deleted);
      if(!pt.length)return;
      const result=SHICCPMEngine.runFullCPM(pt,p);
      if(result.hasCycle){
        cycleErrors.push({project:p.name,msg:result.cycleInfo});
      }else{
        result.tasks.forEach(t=>cpmMap.set(t.id,t));
      }
    });
  }

  // ── Month Headers ─────────────────────────────────────────────
  const months=[];const cur2=new Date(mD);
  while(cur2<=xD){
    const visStart=new Date(Math.max(+cur2,+mD));
    const visEnd=new Date(Math.min(+(new Date(cur2.getFullYear(),cur2.getMonth()+1,0)),+xD));
    const p1=Math.max(0,daysBetween(minDate,visStart.toISOString().split('T')[0])/totalDays*100);
    const p2=Math.min(100,(daysBetween(minDate,visEnd.toISOString().split('T')[0])+1)/totalDays*100);
    months.push({label:cur2.toLocaleString('en',{month:'short',year:'2-digit'}),l:p1,w:Math.max(0,p2-p1)});
    cur2.setMonth(cur2.getMonth()+1);
  }

  const pct=d=>Math.max(0,Math.min(100,daysBetween(minDate,d)/totalDays*100));
  const wPct=(s,e)=>Math.max(0.3,Math.min(100-pct(s),daysBetween(s,e)/totalDays*100));

  const scColor={todo:'#8b949e','in-progress':'#388bfd',inprogress:'#388bfd',done:'#3fb950','on-hold':'#f0a450',blocked:'#f85149'};
  const projColors=['#388bfd','#3fb950','#f0a450','#bc8cff','#39d3f2','#fb8f44','#f85149','#ffca28'];
  const todayLine=todayPct>0&&todayPct<100?`<div style="position:absolute;left:${todayPct}%;top:0;bottom:0;width:2px;background:var(--accent-red);z-index:10;pointer-events:none"></div>`:'';

  // ── Row Building ─────────────────────────────────────────────
  const LABEL_W=260;
  const SV_W=52;  // schedule variance column width
  const PROJ_H=32;
  const TASK_H=30;
  const HEADER_H=34;
  let rows='';
  let totalTasksShown=0;
  let currentY=0;

  const taskPos=new Map();
  const hasBL=!!window.SHICBaseline;

  filteredProjects.forEach((p,pi)=>{
    const pc=projColors[pi%projColors.length];
    const pt=tasks.filter(t=>{
      if(t.projectId!==p.id)return false;
      if(t._deleted)return false;
      if(ganttStatusFilter!=='all'&&t.status!==ganttStatusFilter)return false;
      return true;
    });

    const activeBL=hasBL?SHICBaseline.getActiveBaseline(p.id):null;
    const showBL=_ganttShowBaseline&&!!activeBL;

    const ps=p.startDate||minDate;
    const pe=p.endDate||maxDate;

    // Budget variance for project row
    let cvHtml='';
    if(showBL){
      const cv=SHICBaseline.calcCV(p);
      if(cv!==null){
        const cvSign=cv>=0?'+':'';
        const cvColor=cv>=0?'#3fb950':'#f85149';
        cvHtml=`<span style="font-size:9px;color:${cvColor};font-weight:600;margin-left:4px" title="Budget vs Baseline">${cvSign}₱${Math.abs(cv).toLocaleString()}</span>`;
      }
    }

    rows+=`<div style="display:flex;background:${pc}11;border-bottom:2px solid ${pc}55" title="${p.name}">
      <div style="width:${LABEL_W}px;min-width:${LABEL_W}px;padding:6px 10px;font-weight:700;font-size:12px;color:${pc};border-right:1px solid var(--border);overflow:hidden;white-space:nowrap;text-overflow:ellipsis;display:flex;align-items:center;gap:6px">
        <i class="fas fa-folder" style="font-size:10px;flex-shrink:0"></i>${p.id} — ${p.name.substring(0,22)}
        <span style="margin-left:auto;font-size:9px;font-weight:400;color:var(--text-muted)">${pt.length} tasks</span>
      </div>
      <div style="flex:1;position:relative;height:${PROJ_H}px;min-width:0">
        ${todayLine}
        <div style="position:absolute;left:${pct(ps)}%;width:${wPct(ps,pe)}%;min-width:6px;top:7px;height:18px;background:${pc}33;border-radius:3px;border:2px solid ${pc}88"></div>
        <div style="position:absolute;left:${pct(ps)}%;width:${Math.min(wPct(ps,pe),wPct(ps,pe)*(p.progress||0)/100)}%;min-width:${(p.progress||0)>0?4:0}px;top:7px;height:18px;background:${pc}bb;border-radius:3px;overflow:hidden;display:flex;align-items:center;padding:0 5px">
          <span style="font-size:9px;color:#fff;font-weight:700;white-space:nowrap">${p.name.substring(0,18)} ${p.progress||0}%</span>
        </div>
      </div>
      <div style="width:86px;min-width:86px;padding:5px 8px;font-size:9px;font-family:var(--font-mono);border-left:1px solid var(--border);color:var(--text-secondary);line-height:1.5">
        <div>${ps}</div><div>${pe}</div>
      </div>
      <div style="width:75px;min-width:75px;padding:5px 6px;border-left:1px solid var(--border)">${sBadge(p.status||'active')}</div>
      <div style="width:${SV_W}px;min-width:${SV_W}px;padding:5px 4px;border-left:1px solid var(--border);display:flex;align-items:center;justify-content:center;flex-direction:column;gap:1px">
        ${showBL?`<span style="font-size:8px;color:var(--text-muted)">BL</span>${cvHtml}`:'<span style="font-size:9px;color:var(--text-muted)">—</span>'}
      </div>
    </div>`;
    currentY+=PROJ_H;

    if(!pt.length){
      rows+=`<div style="display:flex;border-bottom:1px solid var(--border)">
        <div style="width:${LABEL_W}px;min-width:${LABEL_W}px;padding:5px 10px 5px 26px;font-size:10px;color:var(--text-muted);border-right:1px solid var(--border);font-style:italic">No tasks match filter</div>
        <div style="flex:1;height:28px;position:relative">${todayLine}</div>
        <div style="width:${161+SV_W}px;min-width:${161+SV_W}px;border-left:1px solid var(--border)"></div>
      </div>`;
      currentY+=28;
    }

    const ptOrdered=typeof _orderTasksHier==='function'?_orderTasksHier(pt):pt.map(t=>({t,depth:0}));
    ptOrdered.forEach(({t,depth})=>{
      const isSummary=typeof _taskHasChildren==='function'&&_taskHasChildren(t.id,pt);
      const cpm=cpmMap.get(t.id);
      const isCrit=!isSummary&&(cpm?._isCritical||false);
      const tf=cpm?._TF||0;

      // Always use stored dates for bar position (keeps Gantt in sync with Task List).
      // CPM _ES/_EF are only used for float bar and critical path decoration.
      const ts=t.startDate||p.startDate||minDate;
      const te=t.endDate||t.dueDate||p.endDate||maxDate;
      const tsStr=typeof ts==='object'?ts.toISOString().split('T')[0]:ts;
      const teStr=typeof te==='object'?te.toISOString().split('T')[0]:te;
      const lfStr=cpm?._LF?(typeof cpm._LF==='object'?cpm._LF.toISOString().split('T')[0]:cpm._LF):null;

      const tc=isCrit?'#f85149':(scColor[t.status]||'#8b949e');
      const overdue=isOverdue(teStr)&&t.status!=='done';
      const isMile=!!t.milestone;

      // Baseline ghost bar
      const blTask=showBL?SHICBaseline.getBaselineTask(p.id,t.id):null;
      let ghostBar='';
      let svHtml='<span style="font-size:9px;color:var(--text-muted)">—</span>';

      if(blTask&&blTask.startDate&&blTask.endDate){
        const bls=blTask.startDate;
        const ble=blTask.endDate;
        ghostBar=`<div style="position:absolute;left:${pct(bls)}%;width:${wPct(bls,ble)}%;min-width:3px;top:5px;height:20px;background:rgba(139,148,158,.15);border:1.5px dashed rgba(139,148,158,.5);border-radius:3px;pointer-events:none" title="Baseline: ${bls} → ${ble}"></div>`;

        // SV: positive = finishing earlier than baseline (ahead), negative = behind
        const sv=SHICBaseline.calcSV(teStr,ble);
        if(sv!==null){
          const svColor=sv>=0?'#3fb950':'#f85149';
          const svSign=sv>=0?'+':'';
          svHtml=`<span style="font-size:10px;font-weight:700;color:${svColor}" title="Schedule Variance: ${svSign}${sv} days vs baseline">${svSign}${sv}d</span>`;
        }
      }

      const rowCenterY=currentY+TASK_H/2;
      const leftX=pct(tsStr)*10;
      const rightX=Math.min(1000,(pct(tsStr)+wPct(tsStr,teStr))*10);
      taskPos.set(t.id,{leftX,rightX,y:rowCenterY});
      totalTasksShown++;

      let bar='';
      if(isSummary){
        // Summary bar: slim solid bracket with end caps spanning the children
        const lft=pct(tsStr),wdt=wPct(tsStr,teStr);
        bar=`${ghostBar}
          <div style="position:absolute;left:${lft}%;width:${wdt}%;min-width:8px;top:9px;height:7px;background:#6e7681;border-radius:2px" title="Summary: ${t.name} (${tsStr} → ${teStr})"></div>
          <div style="position:absolute;left:${lft}%;top:16px;width:0;height:0;border-left:4px solid transparent;border-right:4px solid transparent;border-top:6px solid #6e7681;margin-left:-1px"></div>
          <div style="position:absolute;left:calc(${lft}% + ${wdt}% - 7px);top:16px;width:0;height:0;border-left:4px solid transparent;border-right:4px solid transparent;border-top:6px solid #6e7681"></div>`;
      }else if(isMile){
        bar=`${ghostBar}<div style="position:absolute;left:calc(${pct(tsStr)}% - 9px);top:4px;width:18px;height:18px;background:${isCrit?'#f85149':'var(--accent-amber)'};border-radius:2px;transform:rotate(45deg)" title="Milestone: ${t.name}"></div>`;
      }else{
        const lft=pct(tsStr);
        const wdt=wPct(tsStr,teStr);
        const progW=t.status==='done'?wdt:Math.min(wdt,wdt*((t.progress||0)/100));
        const floatBar=(tf>0&&lfStr&&lfStr>teStr)?`<div style="position:absolute;left:${pct(teStr)}%;width:${wPct(teStr,lfStr)}%;min-width:2px;top:9px;height:12px;background:rgba(139,148,158,.25);border:1px dashed rgba(139,148,158,.4);border-radius:0 3px 3px 0" title="Float: ${tf.toFixed(1)} working days"></div>`:'';
        bar=`
          ${ghostBar}
          ${floatBar}
          <div style="position:absolute;left:${lft}%;width:${wdt}%;min-width:4px;top:7px;height:16px;background:${tc}33;border-radius:3px;border:1px solid ${tc}77"></div>
          ${progW>0?`<div style="position:absolute;left:${lft}%;width:${progW}%;min-width:4px;top:7px;height:16px;background:${tc};border-radius:3px;overflow:hidden;display:flex;align-items:center;padding:0 4px">
            <span style="font-size:8px;color:#fff;white-space:nowrap;overflow:hidden">${t.name}</span>
          </div>`:''}
          ${overdue?`<div style="position:absolute;left:calc(${lft+wdt}% + 2px);top:7px;font-size:9px;color:var(--accent-red)">⚠</div>`:''}`;
      }

      const predCount=(window.SHICCPMEngine&&t.predecessors)?SHICCPMEngine.parsePredecessors(t.predecessors).length:0;

      rows+=`<div style="display:flex;border-bottom:1px solid var(--border)" title="${t.name} [${t.status}]${isCrit?' — CRITICAL PATH':''}${tf>0?' — Float: '+tf.toFixed(1)+'d':''}">
        <div style="width:${LABEL_W}px;min-width:${LABEL_W}px;padding:4px 10px 4px ${26+depth*14}px;border-right:1px solid var(--border);overflow:hidden">
          <div style="display:flex;align-items:center;gap:5px">
            <i class="fas ${isSummary?'fa-folder-open':isMile?'fa-diamond':'fa-circle'}" style="color:${isSummary?'#6e7681':isMile?(isCrit?'#f85149':'var(--accent-amber)'):tc};font-size:${isSummary?'9':isMile?'9':'5'}px;flex-shrink:0"></i>
            <span style="font-size:11px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:${isCrit?'var(--accent-red)':overdue?'var(--accent-red)':'inherit'};font-weight:${isSummary?'700':isCrit?'600':'400'}">${t.name}</span>
            ${isCrit?`<span style="flex-shrink:0;width:6px;height:6px;background:var(--accent-red);border-radius:50%" title="Critical Path"></span>`:''}
          </div>
          <div style="display:flex;gap:4px;align-items:center;padding-left:14px">
            ${t.assignee?`<span style="font-size:9px;color:var(--text-muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:120px">${t.assignee}</span>`:''}
            ${predCount>0?`<span style="font-size:8px;color:var(--accent-cyan);flex-shrink:0"><i class="fas fa-link"></i> ${predCount}</span>`:''}
          </div>
        </div>
        <div style="flex:1;position:relative;height:${TASK_H}px;min-width:0">
          ${todayLine}${bar}
        </div>
        <div style="width:86px;min-width:86px;padding:4px 8px;font-size:9px;font-family:var(--font-mono);border-left:1px solid var(--border);color:${overdue?'var(--accent-red)':'var(--text-secondary)'};line-height:1.5">
          <div>${tsStr}</div><div>${teStr}</div>
        </div>
        <div style="width:75px;min-width:75px;padding:4px 6px;border-left:1px solid var(--border)">
          <span class="badge" style="background:${tc}22;color:${tc};font-size:9px">${t.status}</span>
          ${t.priority==='critical'?`<span class="badge badge-red" style="font-size:8px;margin-left:2px">!</span>`:''}
        </div>
        <div style="width:${SV_W}px;min-width:${SV_W}px;padding:4px;border-left:1px solid var(--border);display:flex;align-items:center;justify-content:center">${svHtml}</div>
      </div>`;
      currentY+=TASK_H;
    });
  });

  const totalRowsH=currentY;

  // ── Dependency Arrows SVG ─────────────────────────────────────
  let arrowsSvg='';
  if(window.SHICCPMEngine&&taskPos.size>0){
    let defs=`<defs>
      <marker id="gArr" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto"><path d="M0,0 L0,6 L6,3 z" fill="#8b949e"/></marker>
      <marker id="rArr" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto"><path d="M0,0 L0,6 L6,3 z" fill="#f85149"/></marker>
    </defs>`;
    let paths='';

    const viewTasks=filteredProjects.flatMap(p=>tasks.filter(t=>t.projectId===p.id&&!t._deleted&&(ganttStatusFilter==='all'||t.status===ganttStatusFilter)));

    viewTasks.forEach(t=>{
      if(!t.predecessors)return;
      const preds=SHICCPMEngine.parsePredecessors(t.predecessors);
      const succPos=taskPos.get(t.id);
      if(!succPos)return;

      preds.forEach(pr=>{
        const predPos=taskPos.get(pr.id);
        if(!predPos)return;

        let sx,sy,ex,ey;
        // Use bar edges + a small vertical offset so the line exits/enters at the edge of the bar
        // rather than its center — this prevents crossing through bars
        const halfH = TASK_H / 2;
        const gap = 5; // clearance in px past the bar edge before routing vertically
        switch(pr.type){
          case 'SS': sx=predPos.leftX;  sy=predPos.y; ex=succPos.leftX;  ey=succPos.y; break;
          case 'FF': sx=predPos.rightX; sy=predPos.y; ex=succPos.rightX; ey=succPos.y; break;
          case 'SF': sx=predPos.leftX;  sy=predPos.y; ex=succPos.rightX; ey=succPos.y; break;
          default:   sx=predPos.rightX; sy=predPos.y; ex=succPos.leftX;  ey=succPos.y;
        }

        const predCrit=cpmMap.get(pr.id)?._isCritical;
        const succCrit=cpmMap.get(t.id)?._isCritical;
        const isCritArrow=predCrit&&succCrit;
        const color=isCritArrow?'#f85149':'#8b949e';
        const marker=isCritArrow?'url(#rArr)':'url(#gArr)';

        // Proper elbow routing: exit right of predecessor → step right by gap →
        // travel vertically between rows → step left to successor start
        // The vertical leg stays at (sx + gap) so it clears the predecessor bar edge
        // and avoids cutting through any task bars in between rows.
        const vx = sx + gap; // vertical routing lane X (just past predecessor right edge)
        const midY = ey > sy
          ? ey - halfH - 2   // going down: enter row from the top edge
          : ey + halfH + 2;  // going up: enter row from the bottom edge

        // If source and target are on the same row, fall back to simple horizontal line
        if(Math.abs(sy - ey) < 2){
          paths+=`<path d="M${sx.toFixed(1)},${sy.toFixed(1)} H${ex.toFixed(1)}"
            stroke="${color}" stroke-width="1.5" fill="none" opacity="0.75" stroke-dasharray="5,3"
            marker-end="${marker}"/>`;
        } else {
          // M start → short hop right → vertical lane → approach target row → arrive at target
          paths+=`<path d="M${sx.toFixed(1)},${sy.toFixed(1)} H${vx.toFixed(1)} V${midY.toFixed(1)} H${ex.toFixed(1)} V${ey.toFixed(1)}"
            stroke="${color}" stroke-width="1.5" fill="none" opacity="0.75" stroke-dasharray="5,3"
            marker-end="${marker}"/>`;
        }
      });
    });

    if(paths){
      arrowsSvg=`<svg style="position:absolute;top:0;left:${LABEL_W}px;width:calc(100% - ${LABEL_W+161+SV_W}px);height:${totalRowsH}px;pointer-events:none;overflow:visible"
        viewBox="0 0 1000 ${totalRowsH}" preserveAspectRatio="none">
        ${defs}${paths}
      </svg>`;
    }
  }

  // ── Month Header HTML ─────────────────────────────────────────
  const monthHeader=`<div style="display:flex;position:sticky;top:0;z-index:8;background:var(--bg-hover);border-bottom:2px solid var(--border)">
    <div style="width:${LABEL_W}px;min-width:${LABEL_W}px;padding:8px 10px;font-size:11px;font-weight:700;color:var(--text-secondary);border-right:1px solid var(--border)">Activity</div>
    <div style="flex:1;position:relative;height:${HEADER_H}px;min-width:0;overflow:hidden">
      ${months.map(m=>`<div style="position:absolute;left:${m.l}%;width:${m.w}%;height:100%;border-left:1px solid var(--border);display:flex;align-items:center;padding:0 6px;overflow:hidden;box-sizing:border-box">
        <span style="font-size:10px;font-weight:700;white-space:nowrap">${m.label}</span>
      </div>`).join('')}
      ${todayPct>0&&todayPct<100?`<div style="position:absolute;left:${todayPct}%;top:0;bottom:0;width:2px;background:var(--accent-red);z-index:9"><div style="position:absolute;top:0;left:-4px;width:10px;height:10px;background:var(--accent-red);border-radius:50%"></div></div>`:''}
    </div>
    <div style="width:86px;min-width:86px;padding:8px 8px;font-size:9px;font-weight:700;color:var(--text-secondary);border-left:1px solid var(--border)">START/END</div>
    <div style="width:75px;min-width:75px;padding:8px 6px;font-size:9px;font-weight:700;color:var(--text-secondary);border-left:1px solid var(--border)">STATUS</div>
    <div style="width:${SV_W}px;min-width:${SV_W}px;padding:8px 4px;font-size:9px;font-weight:700;color:var(--text-secondary);border-left:1px solid var(--border);text-align:center">SV</div>
  </div>`;

  const totalTaskCount=tasks.filter(t=>!t._deleted&&(ganttProjFilter==='all'||t.projectId===ganttProjFilter)).length;
  const critCount=[...cpmMap.values()].filter(t=>t._isCritical).length;

  // Check if any filtered project has a baseline set
  const anyBaseline=hasBL&&filteredProjects.some(p=>(p.baselines||[]).length>0);

  const cycleBanner=cycleErrors.length?`<div style="background:rgba(248,81,73,.1);border:1px solid rgba(248,81,73,.4);border-radius:8px;padding:10px 14px;margin-bottom:12px;font-size:12px;color:var(--accent-red)">
    <i class="fas fa-exclamation-triangle" style="margin-right:7px"></i><strong>Circular Dependency Detected</strong>
    ${cycleErrors.map(e=>`<div style="margin-top:4px;font-size:11px;color:var(--text-secondary)">${e.project}: ${e.msg}</div>`).join('')}
    <div style="margin-top:6px;font-size:11px">Fix the predecessor links in the affected tasks to continue CPM scheduling.</div>
  </div>`:'';

  $('#gantt').innerHTML=`
  <div class="section-header" style="margin-bottom:14px">
    <div>
      <div class="section-title">Gantt Chart ${window.SHICCPMEngine?'<span style="font-size:10px;font-weight:400;color:var(--accent-cyan);margin-left:6px"><i class="fas fa-project-diagram"></i> CPM Active</span>':''}</div>
      <div class="section-sub">${totalTasksShown} tasks shown (${totalTaskCount} total) · ${critCount>0?`<span style="color:var(--accent-red);font-weight:600">${critCount} critical</span> · `:''}${filteredProjects.length} project(s)</div>
    </div>
    <div style="display:flex;gap:6px">
      ${hasBL?`<button class="btn btn-secondary btn-sm" onclick="showBaselineManager()" title="Manage baselines"><i class="fas fa-layer-group"></i> Baselines</button>`:''}
      <button class="btn btn-secondary btn-sm" onclick="exportGanttPDF(ganttProjFilter)" title="Export Gantt to PDF (SY3-F-EPD-002 format)"><i class="fas fa-file-pdf" style="color:#f85149"></i> Export PDF</button>
      <button class="btn btn-primary btn-sm" onclick="showTaskForm()"><i class="fas fa-plus"></i> Add Task</button>
    </div>
  </div>

  ${cycleBanner}

  <!-- Timeline controls -->
  <div class="card" style="padding:10px 14px;margin-bottom:12px">
    <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">
      <div style="display:flex;align-items:center;gap:6px">
        <span style="font-size:11px;color:var(--text-secondary);font-weight:600">Date Range:</span>
        <input type="date" class="form-input" style="height:28px;width:130px;font-size:11px" value="${ganttFrom||effFrom}" onchange="ganttFrom=this.value;renderGantt()">
        <span style="font-size:11px;color:var(--text-muted)">→</span>
        <input type="date" class="form-input" style="height:28px;width:130px;font-size:11px" value="${ganttTo||effTo}" onchange="ganttTo=this.value;renderGantt()">
        <button class="btn btn-secondary btn-sm" onclick="ganttFrom='';ganttTo='';renderGantt()" title="Reset to auto range"><i class="fas fa-undo"></i> Auto</button>
      </div>
      <div style="display:flex;align-items:center;gap:6px">
        <span style="font-size:11px;color:var(--text-secondary);font-weight:600">Project:</span>
        <select class="form-select" style="height:30px;width:140px;font-size:11px" onchange="ganttProjFilter=this.value;renderGantt()">
          <option value="all">All Projects</option>
          ${projects.map(p=>`<option value="${p.id}" ${ganttProjFilter===p.id?'selected':''}>${p.id}</option>`).join('')}
        </select>
      </div>
      <div style="display:flex;align-items:center;gap:6px">
        <span style="font-size:11px;color:var(--text-secondary);font-weight:600">Status:</span>
        <select class="form-select" style="height:30px;width:130px;font-size:11px" onchange="ganttStatusFilter=this.value;renderGantt()">
          <option value="all">All Statuses</option>
          ${['todo','in-progress','inprogress','done','on-hold','blocked'].map(s=>`<option value="${s}" ${ganttStatusFilter===s?'selected':''}>${s}</option>`).join('')}
        </select>
      </div>
      ${anyBaseline?`<div style="display:flex;align-items:center;gap:6px">
        <label style="font-size:11px;color:var(--text-secondary);font-weight:600;display:flex;align-items:center;gap:5px;cursor:pointer">
          <input type="checkbox" ${_ganttShowBaseline?'checked':''} onchange="_ganttShowBaseline=this.checked;renderGantt()" style="accent-color:var(--accent-cyan)">
          Show Baseline
        </label>
      </div>`:''}
      <div style="margin-left:auto;display:flex;gap:6px;align-items:center">
        <button class="btn btn-secondary btn-sm" onclick="ganttQuickRange(3)" title="Last 3 months">3M</button>
        <button class="btn btn-secondary btn-sm" onclick="ganttQuickRange(6)" title="Last 6 months">6M</button>
        <button class="btn btn-secondary btn-sm" onclick="ganttQuickRange(12)" title="12 months">1Y</button>
        <button class="btn btn-secondary btn-sm" onclick="ganttQuickRange(24)" title="24 months">2Y</button>
      </div>
    </div>
    <div style="margin-top:8px;display:flex;gap:10px;flex-wrap:wrap">
      ${[['#388bfd','In Progress'],['#3fb950','Done'],['#8b949e','Todo'],['#f85149','Critical / Overdue ⚠'],['#f0a450','On Hold'],['var(--accent-amber)','Milestone ◆'],['#6e7681','Summary ▔'],['rgba(139,148,158,.3)','Float'],['rgba(139,148,158,.15)','Baseline ┄']].map(([c,l])=>`<div style="display:flex;align-items:center;gap:4px"><div style="width:14px;height:8px;background:${c};border-radius:2px;border:1.5px dashed ${c.includes('rgba')||c==='rgba(139,148,158,.15)'?'#8b949e':'transparent'}"></div><span style="font-size:10px">${l}</span></div>`).join('')}
      ${todayPct>0&&todayPct<100?`<div style="display:flex;align-items:center;gap:4px"><div style="width:2px;height:14px;background:var(--accent-red)"></div><span style="font-size:10px">Today: ${today}</span></div>`:''}
    </div>
  </div>

  <div class="card" style="padding:0;overflow:hidden">
    <div style="overflow-x:auto;overflow-y:auto;max-height:75vh">
      <div style="min-width:700px;position:relative">
        ${monthHeader}
        <div style="position:relative">
          ${rows}
          ${arrowsSvg}
        </div>
      </div>
    </div>
    <div style="padding:7px 14px;font-size:10px;color:var(--text-secondary);border-top:1px solid var(--border);display:flex;justify-content:space-between">
      <span>Timeline: ${minDate} → ${maxDate} (${totalDays} days)</span>
      <span>${totalTasksShown} tasks displayed${anyBaseline&&_ganttShowBaseline?' · <span style="color:var(--accent-cyan)">Baseline active</span>':''}</span>
    </div>
  </div>`;
}

function ganttQuickRange(months){
  const now=new Date();
  const start=new Date(now);start.setMonth(start.getMonth()-Math.floor(months*0.3));
  const end=new Date(now);end.setMonth(end.getMonth()+Math.ceil(months*0.7));
  ganttFrom=start.toISOString().split('T')[0];
  ganttTo=end.toISOString().split('T')[0];
  renderGantt();
}

// ── Baseline Manager Modal ────────────────────────────────────
function showBaselineManager(){
  if(!window.SHICBaseline)return;
  const projects=AppState.data.projects||[];
  const target=ganttProjFilter!=='all'?projects.filter(p=>p.id===ganttProjFilter):projects;

  const projectRows=target.map(p=>{
    const bls=p.baselines||[];
    const blList=bls.length?bls.map(bl=>{
      const isActive=p.activeBaseline===bl.id;
      return `<div style="display:flex;align-items:center;gap:8px;padding:8px 10px;background:${isActive?'rgba(56,139,253,.08)':'var(--bg-primary)'};border-radius:6px;border:1px solid ${isActive?'rgba(56,139,253,.3)':'var(--border)'};margin-bottom:5px">
        <div style="flex:1;min-width:0">
          <div style="font-size:12px;font-weight:600;color:var(--text-primary)">${bl.name}</div>
          <div style="font-size:10px;color:var(--text-muted)">${bl.createdAt}${bl.createdBy?' · '+bl.createdBy:''} · ${bl.tasks.length} tasks</div>
        </div>
        ${isActive?`<span style="font-size:9px;font-weight:700;padding:2px 6px;border-radius:10px;background:rgba(56,139,253,.15);color:#79c0ff">Active</span>`:`<button class="btn btn-secondary btn-sm" onclick="_blSetActive('${p.id}','${bl.id}')" style="font-size:10px;padding:3px 8px">Set Active</button>`}
        <button class="btn btn-danger btn-sm" onclick="_blDelete('${p.id}','${bl.id}')" style="font-size:10px;padding:3px 8px" title="Delete baseline"><i class="fas fa-trash"></i></button>
      </div>`;
    }).join(''):`<div style="font-size:11px;color:var(--text-muted);padding:8px 0;font-style:italic">No baselines yet.</div>`;

    const canAdd=bls.length<SHICBaseline.MAX_BASELINES;

    return `<div style="margin-bottom:16px">
      <div style="font-size:12px;font-weight:700;color:var(--accent-blue);margin-bottom:8px"><i class="fas fa-folder" style="margin-right:5px"></i>${p.id} — ${p.name}</div>
      ${blList}
      ${canAdd?`<div style="display:flex;gap:6px;margin-top:6px">
        <input class="form-input" id="blName_${p.id}" placeholder="Baseline name (e.g. Rev-0)" style="height:30px;font-size:11px;flex:1">
        <button class="btn btn-primary btn-sm" onclick="_blCreate('${p.id}')" style="font-size:11px;white-space:nowrap"><i class="fas fa-plus"></i> Set Baseline</button>
      </div>`:`<div style="font-size:10px;color:var(--accent-amber);margin-top:4px"><i class="fas fa-info-circle"></i> Max ${SHICBaseline.MAX_BASELINES} baselines reached. Delete one to add a new baseline.</div>`}
    </div>`;
  }).join('<hr style="border-color:var(--border);margin:12px 0">');

  $('#genericModalTitle').textContent='Baseline Manager';
  $('#genericModalBody').innerHTML=`
    <div style="font-size:11px;color:var(--text-muted);margin-bottom:14px;line-height:1.6">
      A baseline captures the current planned dates for all tasks. Once set, ghost bars appear on the Gantt and the <strong>SV</strong> column shows schedule variance per task.
    </div>
    ${projectRows}
    <div class="modal-footer">
      <button class="btn btn-secondary" onclick="closeModal('genericModal')">Close</button>
    </div>`;
  openModal('genericModal');
}

function _blCreate(projectId){
  const nameEl=document.getElementById('blName_'+projectId);
  const name=(nameEl?.value||'').trim()||null;
  const result=SHICBaseline.setBaseline(projectId,name);
  if(!result.ok){showToast(result.msg,'error');return;}
  showToast('Baseline set: '+result.baseline.name,'success');
  showBaselineManager();
  renderGantt();
}

function _blDelete(projectId,baselineId){
  if(!confirm('Delete this baseline? This cannot be undone.'))return;
  SHICBaseline.deleteBaseline(projectId,baselineId);
  showToast('Baseline deleted','success');
  showBaselineManager();
  renderGantt();
}

function _blSetActive(projectId,baselineId){
  SHICBaseline.setActiveBaseline(projectId,baselineId);
  showToast('Active baseline updated','success');
  showBaselineManager();
  renderGantt();
}
