function renderDocuments(){
  AppState.ensureData();
  const docs=AppState.data.documents||[];
  const projects=AppState.data.projects||[];
  const cats=[...new Set(docs.map(d=>d.category).filter(Boolean))];

  $('#documents').innerHTML=`
  <div class="section-header" style="margin-bottom:14px">
    <div>
      <div class="section-title">Document Control</div>
      <div class="section-sub">${docs.length} documents · Click a row to edit details</div>
    </div>
    <div style="display:flex;gap:7px">
      <button class="btn btn-secondary btn-sm" onclick="exportDocsCsv()"><i class="fas fa-download"></i> Export</button>
      <button class="btn btn-primary btn-sm" onclick="uploadDoc()"><i class="fas fa-upload"></i> Upload Document</button>
    </div>
  </div>

  <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:14px">
    ${[['fa-file-alt','Total',docs.length,'var(--accent-blue)'],
       ['fa-check-circle','Approved',docs.filter(d=>d.status==='approved').length,'var(--accent-green)'],
       ['fa-edit','In Review',docs.filter(d=>d.status==='review').length,'var(--accent-amber)'],
       ['fa-paper-plane','Issued',docs.filter(d=>d.status==='issued').length,'#bc8cff'],
    ].map(([ic,l,v,c])=>`<div class="stat-card" style="border-left:3px solid ${c}">
      <div class="stat-icon" style="background:${c}22"><i class="fas ${ic}" style="color:${c}"></i></div>
      <div class="stat-info"><div class="label">${l}</div><div class="value" style="color:${c}">${v}</div></div>
    </div>`).join('')}
  </div>

  <div class="filters-bar" style="margin-bottom:12px">
    <div class="search-bar"><i class="fas fa-search"></i>
      <input type="text" id="docSearchInput" placeholder="Search by name, number, author..." value="${docSearch}"
        oninput="docSearch=this.value;renderDocTable()">
    </div>
    <select class="form-select" style="height:32px;width:140px" onchange="docStatusFilter=this.value;renderDocTable()">
      <option value="all">All Statuses</option>
      ${['approved','review','issued','draft','superseded'].map(s=>`<option value="${s}" ${docStatusFilter===s?'selected':''}>${s.charAt(0).toUpperCase()+s.slice(1)}</option>`).join('')}
    </select>
    <select class="form-select" style="height:32px;width:140px" onchange="docProjFilter=this.value;renderDocTable()">
      <option value="all">All Projects</option>
      ${projects.map(p=>`<option value="${p.id}" ${docProjFilter===p.id?'selected':''}>${p.id}</option>`).join('')}
    </select>
    <select class="form-select" style="height:32px;width:140px" onchange="docCatFilter=this.value;renderDocTable()">
      <option value="all">All Categories</option>
      ${cats.map(c=>`<option value="${c}" ${docCatFilter===c?'selected':''}>${c}</option>`).join('')}
    </select>
    <select class="form-select" style="height:32px;width:180px" title="Group documents by..." onchange="docGroupBy=this.value;docCollapsed={};renderDocTable()">
      ${[['status','Group: Status'],['project','Group: Project'],['projStatus','Group: Project → Status'],['projStateProjStatus','Group: Project Status → Project → Doc Status'],['none','No grouping']].map(([v,l])=>`<option value="${v}" ${docGroupBy===v?'selected':''}>${l}</option>`).join('')}
    </select>
    <button class="btn btn-secondary btn-sm" onclick="docSearch='';docStatusFilter='all';docProjFilter='all';docCatFilter='all';$('#docSearchInput').value='';renderDocTable()">
      <i class="fas fa-times"></i> Clear
    </button>
  </div>

  <div class="card" id="docTableCard"></div>`;

  renderDocTable();
}

function renderDocTable(){
  let docs=(AppState.data.documents||[]).filter(d=>{
    if(docStatusFilter!=='all'&&d.status!==docStatusFilter)return false;
    if(docProjFilter!=='all'&&d.projectId!==docProjFilter)return false;
    if(docCatFilter!=='all'&&d.category!==docCatFilter)return false;
    if(docSearch){const s=docSearch.toLowerCase();return Object.values(d).some(v=>String(v||'').toLowerCase().includes(s));}
    return true;
  });

  const iconMap={pdf:'fa-file-pdf',doc:'fa-file-word',docx:'fa-file-word',xls:'fa-file-excel',xlsx:'fa-file-excel',
    ppt:'fa-file-powerpoint',pptx:'fa-file-powerpoint',dwg:'fa-drafting-compass',dxf:'fa-drafting-compass',
    jpg:'fa-file-image',jpeg:'fa-file-image',png:'fa-file-image',zip:'fa-file-archive',txt:'fa-file-alt'};
  const colorMap={pdf:'var(--accent-red)',doc:'#2b7cd3',docx:'#2b7cd3',xls:'#217346',xlsx:'#217346',
    ppt:'#d24726',pptx:'#d24726',dwg:'var(--accent-amber)',dxf:'var(--accent-amber)',
    jpg:'#bc8cff',jpeg:'#bc8cff',png:'#bc8cff',zip:'var(--text-muted)',txt:'var(--text-secondary)'};

  const el=document.getElementById('docTableCard');
  if(!el)return;
  if(!docs.length){el.innerHTML=`<div class="empty-state" style="padding:30px"><i class="fas fa-folder-open" style="font-size:30px;margin-bottom:10px;display:block;opacity:.3"></i><p>No documents found.</p><button class="btn btn-primary" onclick="uploadDoc()"><i class="fas fa-upload"></i> Upload Document</button></div>`;return;}

  const projMap=Object.fromEntries((AppState.data.projects||[]).map(p=>[p.id,p]));
  const statusLabel=s=>({approved:'Approved',review:'In Review',issued:'Issued',draft:'Draft',superseded:'Superseded'})[s]||(s||'Unknown');
  const statusColor=s=>({approved:'#3fb950',review:'#f0a450',issued:'#bc8cff',draft:'var(--text-muted)',superseded:'#f04040'})[s]||'var(--text-muted)';
  const statusOrder=['approved','review','issued','draft','superseded'];

  const buildGroups=()=>{
    if(docGroupBy==='none')return [{key:'all',label:'All Documents ('+docs.length+')',docs}];
    if(docGroupBy==='status'){
      const byS={};docs.forEach(d=>{const s=d.status||'draft';(byS[s]=byS[s]||[]).push(d);});
      return statusOrder.filter(s=>byS[s]).concat(Object.keys(byS).filter(s=>!statusOrder.includes(s)))
        .map(s=>({key:'s:'+s,label:statusLabel(s)+' ('+byS[s].length+')',color:statusColor(s),docs:byS[s]}));
    }
    if(docGroupBy==='project'){
      const byP={};docs.forEach(d=>{const p=d.projectId||'—';(byP[p]=byP[p]||[]).push(d);});
      return Object.keys(byP).sort().map(p=>({key:'p:'+p,label:(projMap[p]?.name?p+' — '+projMap[p].name.substring(0,40):p)+' ('+byP[p].length+')',docs:byP[p]}));
    }
    if(docGroupBy==='projStatus'){
      const byP={};docs.forEach(d=>{const p=d.projectId||'—';(byP[p]=byP[p]||[]).push(d);});
      return Object.keys(byP).sort().map(p=>{
        const byS={};byP[p].forEach(d=>{const s=d.status||'draft';(byS[s]=byS[s]||[]).push(d);});
        const subGroups=statusOrder.filter(s=>byS[s]).concat(Object.keys(byS).filter(s=>!statusOrder.includes(s)))
          .map(s=>({key:'ps:'+p+':'+s,label:statusLabel(s)+' ('+byS[s].length+')',color:statusColor(s),docs:byS[s]}));
        return {key:'p:'+p,label:(projMap[p]?.name?p+' — '+projMap[p].name.substring(0,40):p)+' ('+byP[p].length+')',subGroups};
      });
    }
    if(docGroupBy==='projStateProjStatus'){
      // Project Status → Project → Doc Status
      const projStatusOrder=['active','planned','on-hold','completed','archived'];
      const projStatusLabel=ps=>(typeof _PROJ_STATUS_LABELS!=='undefined'&&_PROJ_STATUS_LABELS[ps])||(ps?ps.toUpperCase():'UNSPECIFIED');
      const projStatusColor=ps=>(typeof _PROJ_STATUS_COLORS!=='undefined'&&_PROJ_STATUS_COLORS[ps])||'var(--text-muted)';
      const byPs={};
      docs.forEach(d=>{const ps=(projMap[d.projectId]?.status)||'unspecified';(byPs[ps]=byPs[ps]||[]).push(d);});
      return projStatusOrder.filter(ps=>byPs[ps]).concat(Object.keys(byPs).filter(ps=>!projStatusOrder.includes(ps))).map(ps=>{
        const psDocs=byPs[ps];
        const byP={};psDocs.forEach(d=>{const p=d.projectId||'—';(byP[p]=byP[p]||[]).push(d);});
        const projGroups=Object.keys(byP).sort().map(p=>{
          const byS={};byP[p].forEach(d=>{const s=d.status||'draft';(byS[s]=byS[s]||[]).push(d);});
          const statusGroups=statusOrder.filter(s=>byS[s]).concat(Object.keys(byS).filter(s=>!statusOrder.includes(s)))
            .map(s=>({key:'psps:'+ps+':'+p+':'+s,label:statusLabel(s)+' ('+byS[s].length+')',color:statusColor(s),docs:byS[s]}));
          return {key:'psp:'+ps+':'+p,label:(projMap[p]?.name?p+' — '+projMap[p].name.substring(0,40):p)+' ('+byP[p].length+')',subGroups:statusGroups};
        });
        return {key:'psg:'+ps,label:projStatusLabel(ps)+' ('+psDocs.length+')',color:projStatusColor(ps),subGroups:projGroups};
      });
    }
    return [{key:'all',label:'All',docs}];
  };

  const rowHtml=(d)=>{
      const ext=(d.fileType||d.name?.split('.').pop()||'').toLowerCase();
      const icon=iconMap[ext]||'fa-file-alt';
      const color=colorMap[ext]||'var(--text-secondary)';
      const hasFile=!!(d.fileData||d.fileUrl||d.fileWebUrl||(d.spDriveId&&d.spItemId));
      const isLegacy=!!d.legacyFile;
      const isAdmin=(_currentUserProfile&&_currentUserProfile.isAdmin)||false;
      const hasPendingDeletion=!!d.deletionRequested;
      return`<tr onclick="showDocDetail('${d.id}')" style="cursor:pointer${hasPendingDeletion?';background:rgba(240,164,80,.05)':''}">
        <td style="font-family:var(--font-mono);font-size:10px;font-weight:700;color:var(--accent-blue)">${d.number||d.id}</td>
        <td><span class="badge badge-gray">Rev ${d.rev||'A'}</span></td>
        <td>
          <div style="display:flex;align-items:center;gap:8px">
            <i class="fas ${icon}" style="color:${color};font-size:16px;flex-shrink:0"></i>
            <div>
              <div style="font-size:12px;font-weight:500">${esc(d.name)}</div>
              ${d.description?`<div style="font-size:10px;color:var(--text-muted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:220px">${esc(d.description)}</div>`:''}
            </div>
          </div>
        </td>
        <td><span class="badge badge-blue">${d.projectId}</span></td>
        <td><span class="badge badge-purple">${esc(d.category)}</span></td>
        <td>
          <div style="display:flex;align-items:center;gap:5px">
            ${d.author?`<div style="width:22px;height:22px;border-radius:50%;background:${stringToColor(d.author)};display:flex;align-items:center;justify-content:center;font-size:9px;font-weight:700;color:#fff">${d.author.charAt(0).toUpperCase()}</div>`:''}
            <span style="font-size:11px">${d.author||'—'}</span>
          </div>
        </td>
        <td style="font-size:11px;font-family:var(--font-mono)">${d.date||'—'}</td>
        <td style="font-size:11px;color:var(--text-secondary)">${d.size||'—'}</td>
        <td onclick="event.stopPropagation()">${sBadge(d.status)}${hasPendingDeletion?`<div style="font-size:9px;color:var(--accent-amber);margin-top:3px"><i class="fas fa-clock" style="margin-right:3px"></i>Delete pending</div>`:''}${isLegacy?`<div style="font-size:9px;color:var(--accent-amber);margin-top:3px"><i class="fas fa-exclamation-triangle" style="margin-right:3px"></i>Re-upload needed</div>`:''}</td>
        <td onclick="event.stopPropagation()">
          <div style="display:flex;gap:4px;flex-wrap:wrap">
            <button class="btn btn-primary btn-sm btn-icon" onclick="showDocDetail('${d.id}')" title="Edit details"><i class="fas fa-edit"></i></button>
            ${hasFile?`
              <button class="btn btn-success btn-sm btn-icon" onclick="downloadDoc('${d.id}')" title="Download"><i class="fas fa-download"></i></button>
              <button class="btn btn-secondary btn-sm btn-icon" onclick="viewDoc('${d.id}')" title="View file"><i class="fas fa-eye"></i></button>
            `:isLegacy?`
              <button class="btn btn-warning btn-sm btn-icon" onclick="attachFileToDoc('${d.id}')" title="Re-upload file (legacy)"><i class="fas fa-cloud-upload-alt"></i></button>
            `:`
              <button class="btn btn-secondary btn-sm btn-icon" onclick="attachFileToDoc('${d.id}')" title="Attach file"><i class="fas fa-paperclip"></i></button>
            `}
            ${isAdmin?`
              <button class="btn btn-danger btn-sm btn-icon" onclick="deleteDoc('${d.id}')" title="Delete document (Admin)"><i class="fas fa-trash"></i></button>
            `:hasPendingDeletion?`
              <button class="btn btn-warning btn-sm btn-icon" onclick="cancelDeletionRequest('${d.id}')" title="Cancel deletion request"><i class="fas fa-undo"></i></button>
            `:`
              <button class="btn btn-secondary btn-sm btn-icon" onclick="requestDocDeletion('${d.id}')" title="Request deletion"><i class="fas fa-flag"></i></button>
            `}
          </div>
        </td>
      </tr>`;
  };

  const tableFor=(rows)=>`<div class="table-wrap"><table>
    <thead><tr><th>Doc No.</th><th>Rev</th><th>Document Name</th><th>Project</th><th>Category</th><th>Author</th><th>Date</th><th>Size</th><th>Status</th><th style="min-width:120px">Actions</th></tr></thead>
    <tbody>${rows.map(rowHtml).join('')}</tbody>
  </table></div>`;

  const groupCard=(g,depth)=>{
    const collapsed=!!docCollapsed[g.key];
    const bar=`<div onclick="docCollapsed['${g.key}']=!docCollapsed['${g.key}'];renderDocTable()" style="cursor:pointer;padding:8px 12px;background:var(--bg-secondary);border-radius:6px;display:flex;align-items:center;gap:8px;margin:${depth?'8px 0 6px':'12px 0 6px'};font-size:${depth?'12px':'13px'};font-weight:600${g.color?';border-left:3px solid '+g.color:''}">
      <i class="fas fa-chevron-${collapsed?'right':'down'}" style="font-size:10px;color:var(--text-muted)"></i>
      <span>${g.label}</span></div>`;
    if(collapsed) return bar;
    if(g.subGroups) return bar+'<div style="padding-left:14px">'+g.subGroups.map(sg=>groupCard(sg,depth+1)).join('')+'</div>';
    return bar+tableFor(g.docs);
  };

  if(docGroupBy==='none'){el.innerHTML=tableFor(_pgSlice('documents',docs));return;}
  el.innerHTML=buildGroups().map(g=>groupCard(g,0)).join('');
  return;

  // Legacy unreachable path kept for reference:
  el.innerHTML=`<div class="table-wrap"><table>
    <thead><tr>
      <th>Doc No.</th><th>Rev</th><th>Document Name</th><th>Project</th>
      <th>Category</th><th>Author</th><th>Date</th><th>Size</th>
      <th>Status</th><th style="min-width:120px">Actions</th>
    </tr></thead>
    <tbody>${_pgSlice('documents',docs).map(d=>{
      const ext=(d.fileType||d.name?.split('.').pop()||'').toLowerCase();
      const icon=iconMap[ext]||'fa-file-alt';
      const color=colorMap[ext]||'var(--text-secondary)';
      // Has file if either legacy fileData OR new SP file reference
      const hasFile=!!(d.fileData||d.fileUrl||d.fileWebUrl||(d.spDriveId&&d.spItemId));
      const isLegacy=!!d.legacyFile;
      const isAdmin=(_currentUserProfile&&_currentUserProfile.isAdmin)||false;
      const hasPendingDeletion=!!d.deletionRequested;
      return`<tr onclick="showDocDetail('${d.id}')" style="cursor:pointer${hasPendingDeletion?';background:rgba(240,164,80,.05)':''}">
        <td style="font-family:var(--font-mono);font-size:10px;font-weight:700;color:var(--accent-blue)">${d.number||d.id}</td>
        <td><span class="badge badge-gray">Rev ${d.rev||'A'}</span></td>
        <td>
          <div style="display:flex;align-items:center;gap:8px">
            <i class="fas ${icon}" style="color:${color};font-size:16px;flex-shrink:0"></i>
            <div>
              <div style="font-size:12px;font-weight:500">${esc(d.name)}</div>
              ${d.description?`<div style="font-size:10px;color:var(--text-muted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:220px">${esc(d.description)}</div>`:''}
            </div>
          </div>
        </td>
        <td><span class="badge badge-blue">${d.projectId}</span></td>
        <td><span class="badge badge-purple">${esc(d.category)}</span></td>
        <td>
          <div style="display:flex;align-items:center;gap:5px">
            ${d.author?`<div style="width:22px;height:22px;border-radius:50%;background:${stringToColor(d.author)};display:flex;align-items:center;justify-content:center;font-size:9px;font-weight:700;color:#fff">${d.author.charAt(0).toUpperCase()}</div>`:''}
            <span style="font-size:11px">${d.author||'—'}</span>
          </div>
        </td>
        <td style="font-size:11px;font-family:var(--font-mono)">${d.date||'—'}</td>
        <td style="font-size:11px;color:var(--text-secondary)">${d.size||'—'}</td>
        <td onclick="event.stopPropagation()">${sBadge(d.status)}${hasPendingDeletion?`<div style="font-size:9px;color:var(--accent-amber);margin-top:3px"><i class="fas fa-clock" style="margin-right:3px"></i>Delete pending</div>`:''}${isLegacy?`<div style="font-size:9px;color:var(--accent-amber);margin-top:3px"><i class="fas fa-exclamation-triangle" style="margin-right:3px"></i>Re-upload needed</div>`:''}</td>
        <td onclick="event.stopPropagation()">
          <div style="display:flex;gap:4px;flex-wrap:wrap">
            <button class="btn btn-primary btn-sm btn-icon" onclick="showDocDetail('${d.id}')" title="Edit details"><i class="fas fa-edit"></i></button>
            ${hasFile?`
              <button class="btn btn-success btn-sm btn-icon" onclick="downloadDoc('${d.id}')" title="Download"><i class="fas fa-download"></i></button>
              <button class="btn btn-secondary btn-sm btn-icon" onclick="viewDoc('${d.id}')" title="View file"><i class="fas fa-eye"></i></button>
            `:isLegacy?`
              <button class="btn btn-warning btn-sm btn-icon" onclick="attachFileToDoc('${d.id}')" title="Re-upload file (legacy)"><i class="fas fa-cloud-upload-alt"></i></button>
            `:`
              <button class="btn btn-secondary btn-sm btn-icon" onclick="attachFileToDoc('${d.id}')" title="Attach file"><i class="fas fa-paperclip"></i></button>
            `}
            ${isAdmin?`
              <button class="btn btn-danger btn-sm btn-icon" onclick="deleteDoc('${d.id}')" title="Delete document (Admin)"><i class="fas fa-trash"></i></button>
            `:hasPendingDeletion?`
              <button class="btn btn-warning btn-sm btn-icon" onclick="cancelDeletionRequest('${d.id}')" title="Cancel deletion request"><i class="fas fa-undo"></i></button>
            `:`
              <button class="btn btn-secondary btn-sm btn-icon" onclick="requestDocDeletion('${d.id}')" title="Request deletion"><i class="fas fa-flag"></i></button>
            `}
          </div>
        </td>
      </tr>`;}).join('')}
    </tbody>
  </table></div>`;
}

function showDocDetail(id){
  const d=(AppState.data.documents||[]).find(x=>x.id===id);
  if(!d)return;
  const projects=AppState.data.projects||[];
  $('#genericModalTitle').textContent='Document Details — '+d.id;
  $('#genericModalBody').innerHTML=`
  <div class="form-grid">
    <div class="form-group"><label class="form-label">Document Number</label>
      <input class="form-input" id="dd_number" value="${(d.number||'').replace(/"/g,'&quot;')}"></div>
    <div class="form-group"><label class="form-label">Revision</label>
      <input class="form-input" id="dd_rev" value="${d.rev||'A'}" placeholder="A, B, 0, 1..."></div>
    <div class="form-group" style="grid-column:1/-1"><label class="form-label">Document Name *</label>
      <input class="form-input" id="dd_name" value="${(d.name||'').replace(/"/g,'&quot;')}"></div>
    <div class="form-group"><label class="form-label">Project</label>
      <select class="form-select" id="dd_project">
        ${projects.map(p=>`<option value="${p.id}" ${d.projectId===p.id?'selected':''}>${p.id} — ${(p.name||'').substring(0,25)}</option>`).join('')}
      </select></div>
    <div class="form-group"><label class="form-label">Category</label>
      <select class="form-select" id="dd_category">
        ${_getDropdown('doc_categories').map(c=>`<option ${d.category===c?'selected':''}>${c}</option>`).join('')}
      </select></div>
    <div class="form-group"><label class="form-label">Author / Uploaded By</label>
      <input class="form-input" id="dd_author" value="${(d.author||'').replace(/"/g,'&quot;')}"></div>
    <div class="form-group"><label class="form-label">Document Date</label>
      <input class="form-input" type="date" id="dd_date" value="${safeDate(d.date)}"></div>
    <div class="form-group"><label class="form-label">Status</label>
      <select class="form-select" id="dd_status">
        ${_getDropdown('doc_status').map(s=>`<option value="${s}" ${d.status===s?'selected':''}>${s.charAt(0).toUpperCase()+s.slice(1)}</option>`).join('')}
      </select></div>
    <div class="form-group"><label class="form-label">Tags</label>
      <input class="form-input" id="dd_tags" value="${(d.tags||[]).join(', ')}" placeholder="tag1, tag2, tag3"></div>
    <div class="form-group" style="grid-column:1/-1"><label class="form-label">Description / Remarks</label>
      <textarea class="form-textarea" id="dd_desc" style="min-height:70px">${(d.description||'').replace(/</g,'&lt;').replace(/>/g,'&gt;')}</textarea></div>
  </div>
  ${d.fileData?`<div style="margin-top:8px;padding:8px 12px;background:rgba(63,185,80,.08);border-radius:6px;font-size:11px;border:1px solid rgba(63,185,80,.2)">
    <i class="fas fa-paperclip" style="color:var(--accent-green);margin-right:6px"></i>
    <strong>File attached:</strong> ${d.fileName||d.name} (${d.size||'unknown size'})
    <button class="btn btn-success btn-sm" style="margin-left:10px" onclick="downloadDoc('${id}')"><i class="fas fa-download"></i> Download</button>
    <button class="btn btn-secondary btn-sm" style="margin-left:4px" onclick="viewDoc('${id}')"><i class="fas fa-eye"></i> View</button>
  </div>`:`<div style="margin-top:8px;padding:8px 12px;background:var(--bg-hover);border-radius:6px;font-size:11px">
    <i class="fas fa-paperclip" style="color:var(--text-muted);margin-right:6px"></i>No file attached — 
    <button class="btn btn-secondary btn-sm" style="margin-left:4px" onclick="attachFileToDoc('${id}')"><i class="fas fa-upload"></i> Attach File</button>
  </div>`}`;
  $('#genericModalFooter').innerHTML=`
    <button class="btn btn-danger btn-sm" onclick="deleteDoc('${id}');closeModal('genericModal')"><i class="fas fa-trash"></i> Delete</button>
    <div style="flex:1"></div>
    <button class="btn btn-secondary" onclick="closeModal('genericModal')">Cancel</button>
    <button class="btn btn-primary" onclick="saveDocDetail('${id}')"><i class="fas fa-save"></i> Save Changes</button>`;
  openModal('genericModal');
}

function saveDocDetail(id){
  const d=(AppState.data.documents||[]).find(x=>x.id===id);
  if(!d)return;
  d.number=$('#dd_number')?.value||d.number;
  d.rev=$('#dd_rev')?.value||'A';
  d.name=$('#dd_name')?.value?.trim()||d.name;
  d.projectId=$('#dd_project')?.value||d.projectId;
  d.category=$('#dd_category')?.value||d.category;
  d.author=$('#dd_author')?.value||d.author;
  d.date=$('#dd_date')?.value||d.date;
  d.status=$('#dd_status')?.value||d.status;
  d.description=$('#dd_desc')?.value||'';
  const tagsRaw=$('#dd_tags')?.value||'';
  d.tags=tagsRaw?tagsRaw.split(',').map(t=>t.trim()).filter(Boolean):[];
  AppState.save();
  closeModal('genericModal');
  renderDocuments();
  showToast('Document details saved','success');
}

function attachFileToDoc(id){
  const inp=document.createElement('input');inp.type='file';
  inp.accept='.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.dwg,.dxf,.jpg,.jpeg,.png,.txt,.csv,.zip';
  inp.onchange=async e=>{
    const file=e.target.files[0];if(!file)return;
    if(file.size>100*1024*1024){showToast('File too large — max 100 MB','error');return;}
    if(!_spConnected){showToast('SharePoint not connected — cannot upload files','error',5000);return;}
    const d=(AppState.data.documents||[]).find(x=>x.id===id);
    if(!d)return;
    showToast('Uploading '+file.name+'...','info',3000);
    try{
      const result=await spUploadFile(file, d.projectId||'General');
      d.fileUrl=result.url;
      d.fileWebUrl=result.webUrl;
      d.spDriveId=result.driveId;
      d.spItemId=result.itemId;
      d.fileName=file.name;
      d.fileType=file.name.split('.').pop().toLowerCase();
      d.size=_formatFileSize(file.size);
      d.fileData=null; // clear any old base64 data
      AppState.save();
      showDocDetail(id);
      showToast('File uploaded to SharePoint: '+file.name,'success');
    }catch(err){
      console.error('[Upload] Error:',err);
      showToast('Upload failed: '+err.message,'error',6000);
    }
  };
  inp.click();
}

async function downloadDoc(id){
  const d=(AppState.data.documents||[]).find(x=>x.id===id);
  if(!d){showToast('Document not found','warning');return;}
  // Modern: SharePoint-stored file
  if(d.spDriveId&&d.spItemId){
    showToast('Getting download link...','info',2000);
    const url=await spGetFileDownloadUrl(d.spDriveId,d.spItemId);
    if(!url){showToast('Could not get download URL — try opening in SharePoint','error');return;}
    const a=document.createElement('a');
    a.href=url;
    a.download=d.fileName||d.name;
    a.target='_blank';
    a.click();
    showToast('Downloading: '+(d.fileName||d.name),'success');
    return;
  }
  // Legacy: base64 data
  if(d.fileData){
    const a=document.createElement('a');
    a.href=d.fileData;
    a.download=d.fileName||d.name;
    a.click();
    showToast('Downloading: '+a.download,'success');
    return;
  }
  showToast('No file attached to this document','warning');
}

async function viewDoc(id){
  const d=(AppState.data.documents||[]).find(x=>x.id===id);
  if(!d){showToast('Document not found','warning');return;}
  // Modern: SharePoint-stored file — open SharePoint web view
  if(d.fileWebUrl){
    window.open(d.fileWebUrl,'_blank');
    return;
  }
  if(d.spDriveId&&d.spItemId){
    showToast('Getting view link...','info',2000);
    const url=await spGetFileDownloadUrl(d.spDriveId,d.spItemId);
    if(url){window.open(url,'_blank');return;}
  }
  // Legacy: base64 data
  if(d.fileData){
    const win=window.open('','_blank');
    if(!win){showToast('Pop-up blocked — please allow pop-ups for this file','warning');return;}
    if(d.fileType==='pdf'||d.fileData.startsWith('data:application/pdf')){
      win.document.write(`<html><body style="margin:0"><embed src="${d.fileData}" type="application/pdf" width="100%" height="100%"></body></html>`);
    }else if(['jpg','jpeg','png','gif','webp'].includes(d.fileType||'')){
      win.document.write(`<html><body style="margin:0;background:#111;display:flex;align-items:center;justify-content:center;min-height:100vh"><img src="${d.fileData}" style="max-width:100%;max-height:100vh;object-fit:contain"></body></html>`);
    }else{
      win.document.write(`<html><body><p>Preview not available for this file type. <a href="${d.fileData}" download="${d.fileName||d.name}">Click here to download</a>.</p></body></html>`);
    }
    return;
  }
  showToast('No file attached to this document','warning');
}

async function deleteDoc(id){
  // ── Permission check: only admin can delete ──
  const isAdmin=(_currentUserProfile&&_currentUserProfile.isAdmin)||false;
  if(!isAdmin){
    showToast('Only admins can delete documents. Use "Request Deletion" instead.','error',4000);
    return;
  }
  const d=(AppState.data.documents||[]).find(x=>x.id===id);
  if(!d){showToast('Document not found','error');return;}
  const wasRequested=d.deletionRequested?(' (requested by '+d.deletionRequestedBy+')'):'';
  if(!confirm('Delete document'+wasRequested+'?\n\nIt will be moved to Trash and can be restored within '+SOFT_DELETE_RETENTION_DAYS+' days. The SharePoint file will be deleted when permanently purged.\nDocument: '+d.name))return;
  // Route via permission system
  const proceeded = requestOrDelete('documents', id);
  if(proceeded){
    if(typeof renderDocuments==='function')renderDocuments();
  }
}

// ── Request document deletion (non-admin users) ─────────────
function requestDocDeletion(id){
  const d=(AppState.data.documents||[]).find(x=>x.id===id);
  if(!d){showToast('Document not found','error');return;}
  if(d.deletionRequested){showToast('Deletion already requested for this document','warning');return;}
  const reason=prompt('Reason for deletion request:\n(this will be sent to the admin)','');
  if(reason===null)return;
  const user=_currentUserProfile?.name||_currentUser?.email||'Unknown';
  d.deletionRequested=true;
  d.deletionRequestedBy=user;
  d.deletionRequestedAt=new Date().toISOString();
  d.deletionReason=(reason||'').trim()||'(no reason given)';
  AppState.save();
  renderDocuments();
  showToast('Deletion request submitted to admin','success',4000);
  // Add to notifications if present
  if(!AppState.data.notifications)AppState.data.notifications=[];
  AppState.data.notifications.unshift({
    id:'NOTIF-'+Date.now().toString(36).toUpperCase(),
    type:'deletion_request',
    title:'Document deletion request',
    message:user+' requested deletion of "'+d.name+'": '+d.deletionReason,
    docId:id,
    createdAt:new Date().toISOString(),
    read:false,
    forAdmin:true
  });
  AppState.save();
}

// ── Cancel a deletion request ───────────────────────────────
function cancelDeletionRequest(id){
  const d=(AppState.data.documents||[]).find(x=>x.id===id);
  if(!d||!d.deletionRequested){showToast('No deletion request to cancel','warning');return;}
  const user=_currentUserProfile?.name||_currentUser?.email||'Unknown';
  // Only requestor or admin can cancel
  const isAdmin=(_currentUserProfile&&_currentUserProfile.isAdmin)||false;
  if(!isAdmin && d.deletionRequestedBy!==user){
    showToast('Only the requestor or an admin can cancel this request','error');
    return;
  }
  if(!confirm('Cancel the deletion request for this document?'))return;
  delete d.deletionRequested;
  delete d.deletionRequestedBy;
  delete d.deletionRequestedAt;
  delete d.deletionReason;
  AppState.save();
  renderDocuments();
  showToast('Deletion request cancelled','info');
}

function uploadDoc(){
  const inp=document.createElement('input');inp.type='file';
  inp.accept='.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.dwg,.dxf,.jpg,.jpeg,.png,.txt,.csv,.zip';
  inp.onchange=async e=>{
    const file=e.target.files[0];if(!file)return;
    if(file.size>100*1024*1024){showToast('File too large — max 100 MB','error');return;}
    if(!_spConnected){showToast('SharePoint not connected — cannot upload files','error',5000);return;}
    const ext=file.name.split('.').pop().toLowerCase();
    const catMap={pdf:'Engineering',doc:'Management',docx:'Management',xls:'Finance',xlsx:'Finance',
      ppt:'Management',pptx:'Management',dwg:'Engineering',dxf:'Engineering',jpg:'Photos',jpeg:'Photos',png:'Photos'};
    const docs=AppState.data.documents||[];
    const nextNum='DOC-'+String(docs.length+1).padStart(3,'0');
    const user=_currentUserProfile?.name||'Admin';
    const projectId=(AppState.data.projects||[])[0]?.id||'';
    showToast('Uploading '+file.name+'...','info',3000);
    try{
      const result=await spUploadFile(file,projectId||'General');
      const d={
        id:'DOC-'+Date.now().toString(36).toUpperCase(),
        number:nextNum,rev:'A',
        name:file.name.replace(/\.[^/.]+$/,''),
        fileName:file.name,fileType:ext,
        fileUrl:result.url,
        fileWebUrl:result.webUrl,
        spDriveId:result.driveId,
        spItemId:result.itemId,
        projectId:projectId,
        category:catMap[ext]||'General',
        status:'review',author:user,
        date:new Date().toISOString().split('T')[0],
        size:_formatFileSize(file.size),
        description:'',tags:[]
      };
      if(!AppState.data.documents)AppState.data.documents=[];
      _markNewlyCreated(d);
      AppState.data.documents.push(d);
      AppState.save();renderDocuments();
      showToast('Uploaded to SharePoint: '+file.name+' ('+_formatFileSize(file.size)+')','success',4000);
    }catch(err){
      console.error('[Upload] Error:',err);
      showToast('Upload failed: '+err.message,'error',6000);
    }
  };
  inp.click();
}

function exportDocsCsv(){
  const docs=AppState.data.documents||[];
  exportCSV(
    docs.map(d=>[d.number||d.id,d.rev||'A',d.name,d.projectId,d.category,d.author||'',d.date||'',d.size||'',d.status,d.description||'']),
    ['Doc Number','Rev','Name','Project','Category','Author','Date','Size','Status','Description'],
    'documents.csv'
  );
}

function searchDocs(v){docSearch=v;renderDocTable();}

