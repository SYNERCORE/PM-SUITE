/* ============================================================================
   PROGRESS PHOTOS  (per-project site photo gallery)
   Each photo is downscaled in-browser to a ~1024px preview stored for reliable
   offline display; when SharePoint is connected the full-resolution original is
   also uploaded for the archive. Grouped by date, with caption + optional tag.
   Entity: AppState.data.progressPhotos[]
   ========================================================================== */

const _PP_MAXPX=1024, _PP_QUALITY=0.72;

/* ---- downscale a File to a JPEG dataURL via canvas ---- */
function _ppDownscale(file, maxPx, quality){
  return new Promise((resolve,reject)=>{
    const url=URL.createObjectURL(file);
    const img=new Image();
    img.onload=()=>{
      let w=img.naturalWidth||img.width, h=img.naturalHeight||img.height;
      const scale=Math.min(1,(maxPx||_PP_MAXPX)/Math.max(w,h||1));
      const cw=Math.max(1,Math.round(w*scale)), ch=Math.max(1,Math.round(h*scale));
      const c=document.createElement('canvas'); c.width=cw; c.height=ch;
      c.getContext('2d').drawImage(img,0,0,cw,ch);
      URL.revokeObjectURL(url);
      let dataUrl;
      try{ dataUrl=c.toDataURL('image/jpeg',quality||_PP_QUALITY); }
      catch(e){ reject(e); return; }
      resolve({dataUrl,w:cw,h:ch});
    };
    img.onerror=()=>{ URL.revokeObjectURL(url); reject(new Error('Not a readable image: '+file.name)); };
    img.src=url;
  });
}

function _ppList(pid){
  return (AppState.data.progressPhotos||[])
    .filter(p=>p.projectId===pid && !p._deleted)
    .sort((a,b)=>(b.date||'').localeCompare(a.date||'') || (b._lastModified||'').localeCompare(a._lastModified||''));
}

/* ============================ MAIN RENDER ============================ */
function renderProgressPhotos(){
  const pid=detailProjectId;
  const p=(AppState.data.projects||[]).find(x=>x.id===pid);
  const photos=_ppList(pid);
  // group by date
  const byDate={};
  photos.forEach(ph=>{ (byDate[ph.date||'Undated']=byDate[ph.date||'Undated']||[]).push(ph); });
  const dates=Object.keys(byDate).sort().reverse();

  $('#detailTabContent').innerHTML=`
  <style>
    .pp-wrap{font-size:12px}
    .pp-bar{display:flex;flex-wrap:wrap;gap:10px;align-items:center;justify-content:space-between;margin-bottom:14px}
    .pp-datehdr{font-size:12px;font-weight:700;color:var(--text-secondary);margin:16px 0 8px;display:flex;align-items:center;gap:8px}
    .pp-datehdr:before{content:"";display:inline-block;width:8px;height:8px;border-radius:50%;background:var(--accent-cyan)}
    .pp-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:12px}
    .pp-card{background:var(--bg-elevated,rgba(255,255,255,.03));border:1px solid var(--border-subtle,rgba(255,255,255,.08));border-radius:10px;overflow:hidden;position:relative}
    .pp-thumb{width:100%;aspect-ratio:4/3;object-fit:cover;cursor:pointer;display:block;background:#0b0f16}
    .pp-meta{padding:8px 10px}
    .pp-cap{font-size:11.5px;font-weight:600;line-height:1.3;word-break:break-word}
    .pp-sub{font-size:10px;color:var(--text-muted);margin-top:3px;display:flex;flex-wrap:wrap;gap:6px;align-items:center}
    .pp-tag{display:inline-block;padding:1px 7px;border-radius:9px;font-size:9.5px;font-weight:600;background:rgba(56,139,253,.18)}
    .pp-del{position:absolute;top:6px;right:6px;border:none;background:rgba(0,0,0,.55);color:#fff;width:26px;height:26px;border-radius:7px;cursor:pointer;font-size:12px}
    .pp-del:hover{background:var(--accent-red)}
    .pp-sp{position:absolute;top:6px;left:6px;background:rgba(63,185,80,.85);color:#fff;font-size:8.5px;font-weight:700;padding:2px 6px;border-radius:7px}
    .pp-empty{text-align:center;color:var(--text-muted);padding:40px}
  </style>
  <div class="pp-wrap">
    <div class="pp-bar">
      <div>
        <div style="font-size:15px;font-weight:700"><i class="fas fa-camera-retro" style="color:var(--accent-cyan);margin-right:7px"></i>Progress Photos</div>
        <div style="font-size:11px;color:var(--text-muted);margin-top:2px">${esc(p?p.name:pid)} — ${photos.length} photo${photos.length===1?'':'s'} across ${dates.length} day${dates.length===1?'':'s'}</div>
      </div>
      <button class="btn btn-primary btn-sm" onclick="showAddPhotos()"><i class="fas fa-plus"></i> Add Photos</button>
    </div>
    ${photos.length?dates.map(d=>`
      <div class="pp-datehdr">${esc(d)} <span style="color:var(--text-muted);font-weight:400">· ${byDate[d].length}</span></div>
      <div class="pp-grid">
        ${byDate[d].map(ph=>`<div class="pp-card">
          ${ph.spWebUrl?'<span class="pp-sp" title="Full-resolution original on SharePoint">SP</span>':''}
          <button class="pp-del" title="Delete" onclick="deleteProgressPhoto('${ph.id}')"><i class="fas fa-trash"></i></button>
          <img class="pp-thumb" src="${ph.img}" loading="lazy" onclick="_ppViewFull('${ph.id}')" alt="${esc(ph.caption||'')}">
          <div class="pp-meta">
            <div class="pp-cap">${esc(ph.caption||'(no caption)')}</div>
            <div class="pp-sub">${ph.tag?`<span class="pp-tag">${esc(ph.tag)}</span>`:''}${ph.uploadedBy?`<span>${esc(ph.uploadedBy)}</span>`:''}</div>
          </div>
        </div>`).join('')}
      </div>`).join(''):`<div class="card"><div class="pp-empty"><i class="fas fa-camera-retro" style="font-size:26px;display:block;margin-bottom:10px"></i>No progress photos yet. Click <b>Add Photos</b> to upload site photos for this project.</div></div>`}
  </div>`;
}

/* ============================ VIEW FULL ============================ */
function _ppViewFull(id){
  const ph=(AppState.data.progressPhotos||[]).find(x=>x.id===id); if(!ph)return;
  const w=window.open('','_blank');
  if(!w){showToast('Pop-up blocked — allow pop-ups to view the photo','warning');return;}
  const spLink=ph.spWebUrl?`<a href="${esc(ph.spWebUrl)}" target="_blank" style="position:fixed;top:10px;right:12px;background:#3fb950;color:#fff;padding:6px 12px;border-radius:7px;text-decoration:none;font:600 12px sans-serif">Open original (SharePoint)</a>`:'';
  const cap=`<div style="position:fixed;bottom:0;left:0;right:0;background:rgba(0,0,0,.6);color:#fff;padding:8px 14px;font:400 13px sans-serif">${esc(ph.caption||'')}${ph.tag?' · '+esc(ph.tag):''}${ph.date?' · '+esc(ph.date):''}</div>`;
  w.document.write(`<html><head><title>${esc(ph.caption||'Progress photo')}</title></head><body style="margin:0;background:#111;display:flex;align-items:center;justify-content:center;min-height:100vh"><img src="${ph.img}" style="max-width:100%;max-height:100vh;object-fit:contain">${spLink}${cap}</body></html>`);
}

/* ============================ ADD PHOTOS ============================ */
function showAddPhotos(){
  const pid=detailProjectId;
  const today=new Date().toISOString().slice(0,10);
  const tasks=(AppState.data.tasks||[]).filter(t=>t.projectId===pid&&!t._deleted);
  const tagOpts=[...new Set(tasks.map(t=>t.name).filter(Boolean))].sort();
  $('#genericModalTitle').textContent='Add Progress Photos';
  $('#genericModalBody').innerHTML=`<div class="form-grid">
    <div class="form-group"><label class="form-label">Date *</label><input class="form-input" type="date" id="ppDate" value="${today}"></div>
    <div class="form-group"><label class="form-label">Tag / Area / Task <span style="font-weight:400;color:var(--text-muted)">(optional)</span></label>
      <input class="form-input" id="ppTag" list="ppTagList" placeholder="e.g., Rotor blades, Boiler side">
      <datalist id="ppTagList">${tagOpts.map(o=>`<option value="${esc(o)}"></option>`).join('')}</datalist></div>
    <div class="form-group" style="grid-column:1/-1"><label class="form-label">Caption <span style="font-weight:400;color:var(--text-muted)">(applied to all selected)</span></label><input class="form-input" id="ppCap" placeholder="e.g., 1st stage blade removal in progress"></div>
    <div class="form-group" style="grid-column:1/-1"><label class="form-label">Photos *</label>
      <input class="form-input" type="file" id="ppFiles" accept="image/*" multiple onchange="_ppFileHint()" style="padding:7px">
      <div id="ppHint" style="font-size:10.5px;color:var(--text-muted);margin-top:4px">Pick one or more image files. They’re compressed to ~1024px for fast display; the full-resolution originals upload to SharePoint when connected.</div>
    </div>
  </div>
  <div id="ppProg" style="display:none;margin-top:10px;font-size:11.5px;color:var(--accent-cyan)"></div>`;
  $('#genericModalFooter').innerHTML=`<button class="btn btn-secondary" onclick="closeModal('genericModal')">Cancel</button><button class="btn btn-primary" id="ppSaveBtn" onclick="saveProgressPhotos()"><i class="fas fa-upload"></i> Add Photos</button>`;
  openModal('genericModal');
}
function _ppFileHint(){
  const f=$('#ppFiles'); const h=$('#ppHint'); if(!f||!h)return;
  const n=f.files?f.files.length:0;
  h.textContent=n?`${n} file${n===1?'':'s'} selected — compressed for display, full-res archived to SharePoint when connected.`:'Pick one or more image files.';
}
async function saveProgressPhotos(){
  const pid=detailProjectId;
  const files=($('#ppFiles')&&$('#ppFiles').files)?Array.from($('#ppFiles').files):[];
  if(!files.length){showToast('Choose at least one photo','error');return;}
  if(!$('#ppDate').value){showToast('Pick a date','error');return;}
  const date=$('#ppDate').value, tag=($('#ppTag').value||'').trim(), caption=($('#ppCap').value||'').trim();
  const by=(AppState.currentUser&&AppState.currentUser.name)||'';
  const btn=$('#ppSaveBtn'), prog=$('#ppProg');
  if(btn){btn.disabled=true;}
  if(prog){prog.style.display='block';}
  if(!AppState.data.progressPhotos)AppState.data.progressPhotos=[];
  const spOn=(typeof _spConnected!=='undefined'&&_spConnected&&typeof spUploadFile==='function');
  let ok=0, failed=0; const added=[];
  for(let i=0;i<files.length;i++){
    const f=files[i];
    if(prog)prog.textContent=`Processing ${i+1} of ${files.length}: ${f.name}…`;
    if(!/^image\//.test(f.type)){ failed++; continue; }
    try{
      const {dataUrl,w,h}=await _ppDownscale(f,_PP_MAXPX,_PP_QUALITY);
      const rec={id:'PP-'+Date.now().toString(36)+'-'+Math.floor(Math.random()*1000),
        projectId:pid, date, tag, caption, img:dataUrl, w, h,
        fileName:f.name, uploadedBy:by, _lastModified:new Date().toISOString()};
      added.push(rec); AppState.data.progressPhotos.push(rec); ok++;
    }catch(e){ failed++; console.warn('photo process failed',f.name,e); }
  }
  AppState.save();
  // best-effort full-res upload to SharePoint (does not block the save)
  if(spOn && added.length){
    if(prog)prog.textContent='Uploading full-resolution originals to SharePoint…';
    for(let i=0;i<added.length;i++){
      const f=files.find(x=>x.name===added[i].fileName);
      if(!f)continue;
      try{ const r=await spUploadFile(f,'PROGRESS_PHOTOS/'+pid); if(r){ added[i].spWebUrl=r.webUrl; added[i].spItemId=r.itemId; added[i].spDriveId=r.driveId; } }
      catch(e){ console.warn('SP upload failed',f.name,e); }
    }
    AppState.save();
  }
  closeModal('genericModal');
  if(typeof renderDetailTab==='function')renderProgressPhotos();
  showToast(`${ok} photo${ok===1?'':'s'} added`+(failed?` · ${failed} skipped`:'')+(spOn?'':' (not connected to SharePoint — stored locally only)'), failed?'warning':'success', 4000);
}

function deleteProgressPhoto(id){
  if(!confirm('Delete this photo?'))return;
  const i=(AppState.data.progressPhotos||[]).findIndex(p=>p.id===id);
  if(i>=0){ AppState.data.progressPhotos[i]._deleted=true; AppState.data.progressPhotos[i]._lastModified=new Date().toISOString();
    if(typeof _spTrackDeletion==='function'){ try{_spTrackDeletion('progressPhotos',id);}catch(e){} }
    AppState.save(); renderProgressPhotos(); showToast('Photo deleted','warning'); }
}
