// ── SHIC Gantt PDF Export  (SY3-F-EPD-002 format) ────────────
(function(){

function _wbsDepth(wbs){
  if(!wbs||typeof wbs!=='string')return 0;
  return(wbs.match(/\./g)||[]).length;
}
function _fmtDate(d){
  if(!d)return'';
  const dt=new Date(d);
  if(isNaN(dt))return d;
  return`${dt.getMonth()+1}/${dt.getDate()}/${String(dt.getFullYear()).slice(-2)}`;
}
function _durDays(startDate,endDate,durationHrs,hpd){
  if(durationHrs>0)return+(durationHrs/(hpd||8)).toFixed(1);
  if(startDate&&endDate)return Math.max(1,Math.round((new Date(endDate)-new Date(startDate))/86400000)+1);
  return 1;
}

function _loadJsPDF(){
  return new Promise((res,rej)=>{
    if(window.jspdf){res();return;}
    const s=document.createElement('script');
    s.src='https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js';
    s.onload=res;s.onerror=rej;
    document.head.appendChild(s);
  });
}

async function exportGanttPDF(projectId){
  showToast('Preparing PDF…','info');
  try{ await _loadJsPDF(); }
  catch(e){ showToast('Failed to load PDF library. Check internet connection.','error'); return; }

  const {jsPDF}=window.jspdf;
  const allProjects=AppState.data.projects||[];
  const allTasks=AppState.data.tasks||[];

  const filter=projectId||(typeof ganttProjFilter!=='undefined'?ganttProjFilter:'all');
  const targets=filter==='all'?allProjects:allProjects.filter(p=>p.id===filter);
  if(!targets.length){showToast('No projects to export','error');return;}

  // ── Page constants (landscape A4) ─────────────────────────
  const PW=297,PH=210;
  const ML=8,MR=8,MT=8,MB=13;
  const CW=PW-ML-MR;

  // Table column widths (mm)
  const C_ID=10,C_NAME=82,C_DUR=18,C_START=21,C_FINISH=21,C_PCT=14;
  const TABLE_W=C_ID+C_NAME+C_DUR+C_START+C_FINISH+C_PCT;
  const GANTT_X=ML+TABLE_W+1;
  const GANTT_W=CW-TABLE_W-1;

  const DOC_H=20;   // letterhead height
  const MH_H=6;     // month header row
  const WK_H=5;     // week header row
  const ROW_H=5.8;
  const FOOTER_H=10;
  const USABLE=PH-MT-MB-DOC_H-MH_H-WK_H-FOOTER_H;
  const RPP=Math.floor(USABLE/ROW_H);

  // Colours
  const BLU=[56,139,253],GRN=[63,185,80],RED=[248,81,73];
  const AMB=[240,164,80],GRY=[139,148,158];
  const NAVY=[15,20,35],BORDER=[185,190,198];
  const LTBG=[247,248,250],PROJBG=[232,240,252];
  const HBGD=[28,38,58],HBGL=[38,50,72];
  const WHITE=[255,255,255],TEXT=[28,34,44],TMUT=[105,115,130];

  const doc=new jsPDF({orientation:'landscape',unit:'mm',format:'a4'});
  let pageSeq=1;
  let firstProject=true;

  // Arrow head helper (draws small filled triangle pointing right)
  function _arrowHead(x,y,color){
    doc.setFillColor(...color);
    doc.triangle(x,y-1,x,y+1,x+1.8,y,'F');
  }

  targets.forEach(project=>{
    const tasks=allTasks.filter(t=>t.projectId===project.id&&!t._deleted);
    const hpd=project.calendar?.hoursPerDay||8;

    // Build rows
    const rows=[];
    rows.push({type:'proj',d:project,depth:0});
    const sorted=[...tasks].sort((a,b)=>{
      if(a.wbs&&b.wbs)return a.wbs.localeCompare(b.wbs,undefined,{numeric:true});
      return(a.startDate||'').localeCompare(b.startDate||'');
    });
    sorted.forEach(t=>rows.push({type:'task',d:t,depth:_wbsDepth(t.wbs)}));

    // Date range
    const allD=[project.startDate,project.endDate,...tasks.flatMap(t=>[t.startDate,t.endDate||t.dueDate])].filter(d=>d&&/^\d{4}/.test(d));
    if(!allD.length)return;
    const dMin=allD.reduce((a,b)=>a<b?a:b);
    const dMax=allD.reduce((a,b)=>a>b?a:b);
    const rStart=new Date(dMin);rStart.setDate(1);
    const rEnd=new Date(dMax);rEnd.setDate(rEnd.getDate()+18);
    const totalMs=rEnd-rStart;

    const xPct=ds=>{if(!ds)return 0;return Math.max(0,Math.min(1,(new Date(ds)-rStart)/totalMs));};
    const todayPct=xPct(new Date().toISOString().split('T')[0]);

    const months=[];
    {const c=new Date(rStart);while(c<=rEnd){months.push({dt:new Date(c),p:xPct(c.toISOString().split('T')[0])});c.setMonth(c.getMonth()+1);}}
    const weeks=[];
    {const c=new Date(rStart);while(c<=rEnd){weeks.push({day:c.getDate(),p:xPct(c.toISOString().split('T')[0])});c.setDate(c.getDate()+7);}}

    // ── Paginate ───────────────────────────────────────────────
    let ri=0,localPg=0;
    while(ri<rows.length){
      if(!firstProject||localPg>0){doc.addPage();pageSeq++;}
      firstProject=false;

      const Y0=MT;

      // ── Letterhead (no logo) ───────────────────────────────
      doc.setFillColor(...WHITE);
      doc.rect(ML,Y0,CW,DOC_H,'F');

      // Center: JO # + title
      doc.setFont('helvetica','bold');doc.setFontSize(9);
      doc.setTextColor(...NAVY);
      doc.text(project.id||'',PW/2,Y0+7,{align:'center'});
      doc.setFontSize(8);
      const titleLines=doc.splitTextToSize((project.name||'').toUpperCase(),140);
      doc.text(titleLines[0]||'',PW/2,Y0+13,{align:'center'});
      if(titleLines[1])doc.text(titleLines[1],PW/2,Y0+18,{align:'center'});

      // Right: form ref + address
      const rx=ML+CW;
      doc.setFont('helvetica','bold');doc.setFontSize(7.5);
      doc.setTextColor(...NAVY);
      doc.text('SY3-F-EPD-002',rx,Y0+5,{align:'right'});
      doc.setFont('helvetica','normal');doc.setFontSize(6);
      doc.text('REV.01/04-10-2022',rx,Y0+9,{align:'right'});
      doc.setFontSize(5.8);doc.setTextColor(...TMUT);
      doc.text('153 Arnaldo Highway, Barangay Santiago, General Trias, Cavite, Philippines',rx,Y0+13.5,{align:'right'});
      doc.text('Tel. No.: (046) 683-7580 • (046) 683-7581  TeleFax No.: 046 412-5513',rx,Y0+17.5,{align:'right'});

      // Letterhead border
      doc.setDrawColor(...BORDER);doc.setLineWidth(0.3);
      doc.rect(ML,Y0,CW,DOC_H,'S');

      // ── Column + Timeline Headers ──────────────────────────
      const CHY=Y0+DOC_H;

      doc.setFillColor(...HBGD);
      doc.rect(ML,CHY,TABLE_W,MH_H+WK_H,'F');

      doc.setFont('helvetica','bold');doc.setFontSize(6.5);
      doc.setTextColor(...WHITE);
      const cols=[['ID',C_ID],['Task Name',C_NAME],['Duration',C_DUR],['Start',C_START],['Finish',C_FINISH],['% Complete',C_PCT]];
      let cx=ML;
      cols.forEach(([lbl,w])=>{
        doc.text(lbl,cx+w/2,CHY+(MH_H+WK_H)/2+1.5,{align:'center'});
        cx+=w;
      });

      // Gantt timeline bg
      doc.setFillColor(...HBGD);doc.rect(GANTT_X,CHY,GANTT_W,MH_H,'F');
      doc.setFillColor(...HBGL);doc.rect(GANTT_X,CHY+MH_H,GANTT_W,WK_H,'F');

      // Month labels
      doc.setFont('helvetica','bold');doc.setFontSize(6.5);doc.setTextColor(...WHITE);
      for(let mi=0;mi<months.length-1;mi++){
        const m=months[mi],mn=months[mi+1];
        const mx=GANTT_X+m.p*GANTT_W;
        const mw=(mn.p-m.p)*GANTT_W;
        if(mw<4)continue;
        const lbl=m.dt.toLocaleString('en',{month:'short'})+' \''+String(m.dt.getFullYear()).slice(-2);
        doc.text(lbl,mx+mw/2,CHY+MH_H-1.5,{align:'center'});
        doc.setDrawColor(70,90,120);doc.setLineWidth(0.15);
        doc.line(mx,CHY,mx,CHY+MH_H+WK_H);
      }

      // Week day ticks
      doc.setFont('helvetica','normal');doc.setFontSize(4.5);doc.setTextColor(195,210,230);
      weeks.forEach(w=>{
        const wx=GANTT_X+w.p*GANTT_W;
        doc.setDrawColor(75,95,125);doc.setLineWidth(0.1);
        doc.line(wx,CHY+MH_H,wx,CHY+MH_H+WK_H);
        if(wx>GANTT_X+1)doc.text(String(w.day),wx+0.5,CHY+MH_H+WK_H-1);
      });

      // ── Task Rows + collect bar positions for arrows ───────
      const firstRowY=CHY+MH_H+WK_H;
      const rowsThisPage=Math.min(RPP,rows.length-ri);

      // barPos: taskId → {lx (left x), rx (right x), cy (center y)}
      const barPos=new Map();

      for(let i=0;i<rowsThisPage;i++){
        const row=rows[ri+i];
        const ry=firstRowY+i*ROW_H;
        const isProj=row.type==='proj';
        const t=row.d;

        // Row bg
        if(isProj){
          doc.setFillColor(...PROJBG);doc.rect(ML,ry,CW,ROW_H,'F');
        }else if(i%2===0){
          doc.setFillColor(...LTBG);doc.rect(ML,ry,CW,ROW_H,'F');
        }

        const midY=ry+ROW_H-1.8;

        // ID
        if(!isProj){
          doc.setFont('helvetica','normal');doc.setFontSize(5.8);doc.setTextColor(...TMUT);
          doc.text(t.wbs||String(t.id||''),ML+C_ID-1,midY,{align:'right'});
        }

        // Name
        const indent=isProj?0:Math.min(row.depth,3)*3;
        const nameMaxW=C_NAME-indent-2;
        if(isProj||row.depth===0){
          doc.setFont('helvetica','bold');doc.setFontSize(isProj?7:6.5);doc.setTextColor(...NAVY);
        }else{
          doc.setFont('helvetica','normal');doc.setFontSize(6);doc.setTextColor(...TEXT);
        }
        doc.text(doc.splitTextToSize(t.name||'',nameMaxW)[0]||'',ML+C_ID+indent,midY);

        if(!isProj){
          doc.setFont('helvetica','normal');doc.setFontSize(6);doc.setTextColor(...TEXT);
          const dur=_durDays(t.startDate,t.endDate||t.dueDate,t.durationHrs,hpd);
          doc.text(`${dur} days`,ML+C_ID+C_NAME+C_DUR-1,midY,{align:'right'});
          doc.text(_fmtDate(t.startDate),ML+C_ID+C_NAME+C_DUR+C_START/2,midY,{align:'center'});
          doc.text(_fmtDate(t.endDate||t.dueDate||''),ML+C_ID+C_NAME+C_DUR+C_START+C_FINISH/2,midY,{align:'center'});
          const pct=t.progress||0;
          doc.setFont('helvetica','bold');
          doc.setTextColor(pct>=100?GRN[0]:pct>0?BLU[0]:TMUT[0],pct>=100?GRN[1]:pct>0?BLU[1]:TMUT[1],pct>=100?GRN[2]:pct>0?BLU[2]:TMUT[2]);
          doc.text(`${pct}%`,ML+C_ID+C_NAME+C_DUR+C_START+C_FINISH+C_PCT/2,midY,{align:'center'});
        }

        // Gantt bar
        const s=t.startDate;
        const e=isProj?t.endDate:(t.endDate||t.dueDate);
        if(s&&e){
          const bx=GANTT_X+xPct(s)*GANTT_W;
          const bx2=GANTT_X+xPct(e)*GANTT_W;
          const bw=Math.max(1.5,bx2-bx);
          const BH=isProj?3.2:2.6;
          const by=ry+(ROW_H-BH)/2;
          const cy=ry+ROW_H/2;

          if(isProj){
            doc.setFillColor(20,40,80);doc.rect(bx,by,bw,BH,'F');
            const pw=bw*((t.progress||0)/100);
            if(pw>0){doc.setFillColor(...BLU);doc.rect(bx,by,pw,BH,'F');}
            doc.setFillColor(20,40,80);
            doc.triangle(bx,by+BH,bx,by+BH+2,bx+2,by+BH,'F');
            doc.triangle(bx2,by+BH,bx2,by+BH+2,bx2-2,by+BH,'F');
            barPos.set(t.id,{lx:bx,rx:bx2,cy});
          }else{
            let bc=GRY;
            const st=t.status||'todo',pr=t.progress||0;
            if(pr>=100||st==='done')bc=GRN;
            else if(st==='blocked')bc=RED;
            else if(st==='inprogress'||st==='in-progress')bc=BLU;
            else if(st==='on-hold')bc=AMB;

            const lr=bc[0]+Math.round((255-bc[0])*0.75);
            const lg=bc[1]+Math.round((255-bc[1])*0.75);
            const lb=bc[2]+Math.round((255-bc[2])*0.75);
            doc.setFillColor(lr,lg,lb);
            doc.setDrawColor(...bc);doc.setLineWidth(0.25);
            doc.rect(bx,by,bw,BH,'FD');
            const pw=bw*(pr/100);
            if(pw>0){doc.setFillColor(...bc);doc.rect(bx,by,pw,BH,'F');}

            if(t.milestone){
              doc.setFillColor(...AMB);
              doc.triangle(bx+bw/2,cy-3,bx+bw/2+2.5,cy,bx+bw/2,cy+3,'F');
              doc.triangle(bx+bw/2,cy-3,bx+bw/2-2.5,cy,bx+bw/2,cy+3,'F');
            }

            barPos.set(t.id,{lx:bx,rx:bx2,cy});
          }
        }

        // Row divider
        doc.setDrawColor(...BORDER);doc.setLineWidth(0.1);
        doc.line(ML,ry+ROW_H,ML+CW,ry+ROW_H);
      }

      // ── Dependency Arrows ──────────────────────────────────
      // Draw elbow paths: predecessor right edge → successor left edge
      // Only draw if both tasks are visible on this page
      if(window.SHICCPMEngine){
        const pageTaskIds=new Set(
          rows.slice(ri,ri+rowsThisPage).filter(r=>r.type==='task').map(r=>r.d.id)
        );

        rows.slice(ri,ri+rowsThisPage).forEach(row=>{
          if(row.type!=='task')return;
          const t=row.d;
          if(!t.predecessors)return;
          const preds=SHICCPMEngine.parsePredecessors(t.predecessors);
          const succPos=barPos.get(t.id);
          if(!succPos)return;

          preds.forEach(pr=>{
            if(!pageTaskIds.has(pr.id))return;  // skip cross-page arrows
            const predPos=barPos.get(pr.id);
            if(!predPos)return;

            // Determine colour: red if both critical, grey otherwise
            const predCrit=false; // CPM not re-run here; use grey default
            const arrowColor=GRY;

            let sx,sy,ex,ey;
            switch(pr.type){
              case 'SS': sx=predPos.lx; sy=predPos.cy; ex=succPos.lx; ey=succPos.cy; break;
              case 'FF': sx=predPos.rx; sy=predPos.cy; ex=succPos.rx; ey=succPos.cy; break;
              case 'SF': sx=predPos.lx; sy=predPos.cy; ex=succPos.rx; ey=succPos.cy; break;
              default:   sx=predPos.rx; sy=predPos.cy; ex=succPos.lx; ey=succPos.cy;
            }

            const midX=(sx+ex)/2;

            doc.setDrawColor(...arrowColor);
            doc.setLineWidth(0.35);
            doc.setLineDash([],0);

            // Elbow: right from pred → midpoint → down/up → left to succ
            doc.line(sx,sy,midX,sy);
            doc.line(midX,sy,midX,ey);
            doc.line(midX,ey,ex,ey);

            // Arrow head at destination
            _arrowHead(ex,ey,arrowColor);
          });
        });
      }

      // ── Today line ─────────────────────────────────────────
      if(todayPct>0&&todayPct<1){
        const tx=GANTT_X+todayPct*GANTT_W;
        doc.setDrawColor(...RED);doc.setLineWidth(0.5);
        doc.setLineDash([1.5,1],0);
        doc.line(tx,CHY,tx,firstRowY+rowsThisPage*ROW_H);
        doc.setLineDash([],0);
      }

      // ── Grid lines ─────────────────────────────────────────
      doc.setDrawColor(...BORDER);doc.setLineWidth(0.2);
      let tcx=ML;
      [C_ID,C_NAME,C_DUR,C_START,C_FINISH,C_PCT].forEach(w=>{tcx+=w;doc.line(tcx,CHY,tcx,firstRowY+rowsThisPage*ROW_H);});
      doc.line(GANTT_X,CHY,GANTT_X,firstRowY+rowsThisPage*ROW_H);
      doc.setLineWidth(0.08);doc.setDrawColor(210,215,225);
      months.forEach(m=>{const mx=GANTT_X+m.p*GANTT_W;doc.line(mx,firstRowY,mx,firstRowY+rowsThisPage*ROW_H);});
      doc.setDrawColor(...BORDER);doc.setLineWidth(0.3);
      doc.rect(ML,CHY,CW,MH_H+WK_H+rowsThisPage*ROW_H,'S');

      // ── Footer ─────────────────────────────────────────────
      const fy=PH-MB;
      doc.setDrawColor(...BORDER);doc.setLineWidth(0.25);
      doc.line(ML,fy,ML+CW,fy);
      doc.setFont('helvetica','normal');doc.setFontSize(6);doc.setTextColor(...TMUT);
      doc.text(`${project.id} — ${(project.name||'').toUpperCase()}`,ML,fy+4);
      doc.text(`Page ${localPg+1}`,PW/2,fy+4,{align:'center'});
      doc.text(new Date().toLocaleDateString('en-US',{year:'numeric',month:'short',day:'numeric'}),ML+CW,fy+4,{align:'right'});

      ri+=rowsThisPage;
      localPg++;
    }
  });

  const projId=filter!=='all'?filter:'ALL-PROJECTS';
  const stamp=new Date().toISOString().slice(0,10).replace(/-/g,'');
  doc.save(`Gantt-${projId}-${stamp}.pdf`);
  showToast('Gantt PDF saved successfully','success');
}

window.exportGanttPDF=exportGanttPDF;
})();
