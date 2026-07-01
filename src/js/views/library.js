function renderLibrary(){
  AppState.ensureData();
  if (!AppState.data.libraryDocs) AppState.data.libraryDocs = [];
  const all = AppState.data.libraryDocs;
  const active = all.filter(d => d.status !== 'superseded');
  let docs = _libShowSuperseded ? all : active;
  if (_libFilter !== 'all') docs = docs.filter(d => d.category === _libFilter);
  if (_libSearch) {
    const q = _libSearch.toLowerCase();
    docs = docs.filter(d => (d.name||'').toLowerCase().includes(q) || (d.number||'').toLowerCase().includes(q) || (d.description||'').toLowerCase().includes(q) || (d.tags||[]).join(' ').toLowerCase().includes(q));
  }
  docs = [...docs].sort((a,b) => (b.uploadedAt||'').localeCompare(a.uploadedAt||''));
  const isAdmin = (_currentUserProfile && _currentUserProfile.isAdmin) || false;

  const catCount = cat => active.filter(d => d.category === cat).length;

  $('#library').innerHTML = `
  <div class="section-header" style="margin-bottom:14px">
    <div>
      <div class="section-title"><i class="fas fa-book" style="color:var(--accent-blue);margin-right:8px"></i>Reference Library</div>
      <div class="section-sub">${active.length} active document${active.length!==1?'s':''} · Company-wide methodologies, ITPs, procedures &amp; standards</div>
    </div>
    <div style="display:flex;gap:7px">
      <button class="btn btn-secondary btn-sm" onclick="exportCSV((AppState.data.libraryDocs||[]).map(d=>[d.number,d.rev,d.name,d.category,d.status,d.uploadedBy,d.uploadedAt?d.uploadedAt.split('T')[0]:'']),['Number','Rev','Name','Category','Status','Uploaded By','Date'],'reference_library.csv')"><i class="fas fa-download"></i> Export</button>
      <button class="btn btn-primary btn-sm" onclick="showLibraryUpload()"><i class="fas fa-cloud-upload-alt"></i> Upload Document</button>
    </div>
  </div>

  <!-- Category chips -->
  <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:14px">
    <button onclick="_libFilter='all';renderLibrary()" style="font-size:11px;padding:6px 14px;border-radius:16px;cursor:pointer;font-weight:600;border:1px solid ${_libFilter==='all'?'var(--accent-blue)':'var(--border)'};background:${_libFilter==='all'?'var(--accent-blue)':'transparent'};color:${_libFilter==='all'?'#fff':'var(--text-secondary)'}">All <span style="opacity:.7">(${active.length})</span></button>
    ${LIB_CATEGORIES.map(c => `
      <button onclick="_libFilter='${c.id}';renderLibrary()" title="${c.full||c.id}"
        style="font-size:11px;padding:6px 14px;border-radius:16px;cursor:pointer;font-weight:600;display:flex;align-items:center;gap:6px;
          border:1px solid ${_libFilter===c.id?c.color:'var(--border)'};
          background:${_libFilter===c.id?c.color:'transparent'};
          color:${_libFilter===c.id?'#fff':c.color}">
        <i class="fas ${c.icon}" style="font-size:10px"></i>${c.id} <span style="opacity:.7">(${catCount(c.id)})</span>
      </button>`).join('')}
  </div>

  <div class="filters-bar">
    <label style="display:flex;align-items:center;gap:6px;font-size:11px;color:var(--text-secondary);cursor:pointer">
      <input type="checkbox" ${_libShowSuperseded?'checked':''} onchange="_libShowSuperseded=this.checked;renderLibrary()"> Show superseded revisions
    </label>
    <div class="search-bar" style="margin-left:auto"><i class="fas fa-search"></i><input type="text" placeholder="Search library..." value="${_libSearch}" oninput="_libSearch=this.value;renderLibrary()"></div>
  </div>

  ${docs.length === 0 ? `<div class="empty-state"><i class="fas fa-book"></i><p>No documents${_libFilter!=='all'?' in '+_libFilter:''} yet</p><button class="btn btn-primary btn-sm" style="margin-top:8px" onclick="showLibraryUpload()"><i class="fas fa-cloud-upload-alt"></i> Upload First Document</button></div>`
  : `<div class="card"><div class="table-wrap"><table>
    <thead><tr><th>Doc No.</th><th>Rev</th><th>Document Name</th><th>Category</th><th>Description</th><th>Uploaded By</th><th>Date</th><th>Size</th><th>Status</th><th>Actions</th></tr></thead>
    <tbody>${docs.map(d => {
      const cat = LIB_CATEGORIES.find(c => c.id === d.category) || LIB_CATEGORIES[LIB_CATEGORIES.length-1];
      const isSuperseded = d.status === 'superseded';
      return `<tr style="${isSuperseded?'opacity:.5':''}">
        <td style="font-family:var(--font-mono);font-size:11px;color:var(--accent-blue);font-weight:700">${d.number||'—'}</td>
        <td><span class="badge badge-gray">Rev ${d.rev||'A'}</span></td>
        <td style="font-weight:600;font-size:12px">${d.name}</td>
        <td><span class="badge" style="background:${cat.color}22;color:${cat.color}"><i class="fas ${cat.icon}" style="margin-right:4px;font-size:9px"></i>${d.category}</span></td>
        <td style="font-size:11px;max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${d.description||''}">${d.description||'—'}</td>
        <td style="font-size:11px">${(d.uploadedBy||'').split('@')[0]}</td>
        <td style="font-size:11px;font-family:var(--font-mono)">${d.uploadedAt?d.uploadedAt.split('T')[0]:'—'}</td>
        <td style="font-size:11px;color:var(--text-muted)">${d.size||'—'}</td>
        <td>${isSuperseded?'<span class="badge badge-gray">Superseded</span>':'<span class="badge badge-green">Active</span>'}</td>
        <td><div style="display:flex;gap:3px">
          ${(d.fileWebUrl||d.fileUrl)?`
            <button class="btn btn-secondary btn-sm btn-icon" onclick="viewLibraryDoc('${d.id}')" title="View"><i class="fas fa-eye"></i></button>
            <button class="btn btn-secondary btn-sm btn-icon" onclick="downloadLibraryDoc('${d.id}')" title="Download"><i class="fas fa-download"></i></button>
          `:''}
          ${!isSuperseded?`<button class="btn btn-secondary btn-sm btn-icon" onclick="showLibraryNewRevision('${d.id}')" title="Upload new revision"><i class="fas fa-code-branch"></i></button>`:''}
          ${isAdmin?`<button class="btn btn-danger btn-sm btn-icon" onclick="deleteLibraryDoc('${d.id}')" title="Delete (Admin)"><i class="fas fa-trash"></i></button>`:''}
        </div></td>
      </tr>`;
    }).join('')}</tbody>
  </table></div></div>`}`;
}

// ── Upload new library document ─────────────────────────────
function showLibraryUpload(presetDocId){
  const preset = presetDocId ? (AppState.data.libraryDocs||[]).find(d => d.id === presetDocId) : null;
  $('#genericModalTitle').textContent = preset ? 'Upload New Revision: ' + preset.name : 'Upload Library Document';
  $('#genericModalBody').innerHTML = `
    <div class="form-grid">
      <div class="form-group"><label class="form-label">Category *</label>
        <select class="form-select" id="libCat" ${preset?'disabled':''}>
          ${LIB_CATEGORIES.map(c=>`<option value="${c.id}" ${preset&&preset.category===c.id?'selected':''}>${c.full||c.id}</option>`).join('')}
        </select>
      </div>
      <div class="form-group"><label class="form-label">Document Number ${preset?'':'<span style="font-weight:400;color:var(--text-muted)">(auto if blank)</span>'}</label>
        <input class="form-input" id="libNum" value="${preset?preset.number:''}" ${preset?'readonly style="opacity:.6"':''} placeholder="e.g., SHIC-WM-001">
      </div>
    </div>
    <div class="form-group"><label class="form-label">Document Name *</label>
      <input class="form-input" id="libName" value="${preset?preset.name:''}" placeholder="e.g., Welding Methodology for Pressure Vessels">
    </div>
    <div class="form-group"><label class="form-label">Description</label>
      <input class="form-input" id="libDesc" value="${preset?(preset.description||''):''}" placeholder="Short description of the document">
    </div>
    <div class="form-group"><label class="form-label">Tags <span style="font-weight:400;color:var(--text-muted)">(comma-separated)</span></label>
      <input class="form-input" id="libTags" value="${preset?(preset.tags||[]).join(', '):''}" placeholder="welding, pressure vessel, ASME">
    </div>
    <div class="form-group" style="margin-top:12px"><label class="form-label">File *</label>
      <input type="file" class="form-input" id="libFile" accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.dwg,.dxf,.jpg,.jpeg,.png,.txt,.csv,.zip">
      <div style="font-size:10px;color:var(--text-muted);margin-top:4px">Stored in SharePoint → SHIC_Documents/LIBRARY/. Max 100 MB.</div>
    </div>
    ${preset?`<div style="padding:8px 12px;background:rgba(56,139,253,.08);border:1px solid rgba(56,139,253,.2);border-radius:7px;font-size:11px;color:var(--accent-blue)"><i class="fas fa-code-branch" style="margin-right:5px"></i>This will create <strong>Rev ${_nextRev(preset.rev)}</strong> and mark Rev ${preset.rev} as superseded.</div>`:''}
  `;
  $('#genericModalFooter').innerHTML = `
    <button class="btn btn-secondary" onclick="closeModal('genericModal')">Cancel</button>
    <button class="btn btn-primary" onclick="_submitLibraryUpload(${preset?`'${preset.id}'`:'null'})"><i class="fas fa-cloud-upload-alt"></i> Upload</button>
  `;
  openModal('genericModal');
}

function showLibraryNewRevision(id){ showLibraryUpload(id); }

function _nextRev(rev){
  if (!rev) return 'B';
  const c = rev.toUpperCase().charCodeAt(rev.length-1);
  return rev.slice(0,-1) + String.fromCharCode(c >= 90 ? 65 : c + 1) + (c >= 90 ? 'A' : '');
}

async function _submitLibraryUpload(revisionOfId){
  const fileInput = document.getElementById('libFile');
  const file = fileInput?.files?.[0];
  const name = (document.getElementById('libName').value||'').trim();
  if (!name) { showToast('Document name required','error'); return; }
  if (!file) { showToast('Please select a file','error'); return; }
  if (file.size > 100*1024*1024) { showToast('File too large — max 100 MB','error'); return; }
  if (!_spConnected) { showToast('SharePoint not connected — cannot upload','error',5000); return; }

  const category = document.getElementById('libCat').value;
  const desc = document.getElementById('libDesc').value||'';
  const tags = (document.getElementById('libTags').value||'').split(',').map(t=>t.trim()).filter(Boolean);
  const user = _currentUserProfile?.name || _currentUser?.email || 'User';
  const prev = revisionOfId ? (AppState.data.libraryDocs||[]).find(d => d.id === revisionOfId) : null;

  // Doc number: keep from prev revision, use typed, or auto-generate per category
  let number = (document.getElementById('libNum').value||'').trim();
  if (prev) number = prev.number;
  if (!number) {
    const prefix = 'SHIC-' + ({'Work Methodology':'WM','ITP':'ITP','Scope of Works':'SOW','Procedure':'PRC','Template':'TPL','Standard':'STD','Policy':'POL','Manual':'MAN','Form':'FRM','Other':'DOC'}[category]||'DOC') + '-';
    const existing = (AppState.data.libraryDocs||[]).filter(d => (d.number||'').startsWith(prefix)).length;
    number = prefix + String(existing+1).padStart(3,'0');
  }

  showToast('Uploading ' + file.name + '...','info',3000);
  try {
    const result = await spUploadFile(file, 'LIBRARY/' + category.replace(/[<>:"/\\|?*]/g,'_'));
    const doc = {
      id: 'LIB-' + Date.now().toString(36).toUpperCase(),
      name, number,
      rev: prev ? _nextRev(prev.rev) : 'A',
      category, description: desc, tags,
      fileName: file.name,
      fileType: file.name.split('.').pop().toLowerCase(),
      fileUrl: result.url, fileWebUrl: result.webUrl,
      spDriveId: result.driveId, spItemId: result.itemId,
      size: _formatFileSize(file.size),
      status: 'active',
      uploadedBy: user,
      uploadedAt: new Date().toISOString(),
      revisionOf: prev ? prev.id : null,
    };
    if (!AppState.data.libraryDocs) AppState.data.libraryDocs = [];
    _markNewlyCreated(doc);
    AppState.data.libraryDocs.push(doc);
    if (prev) { prev.status = 'superseded'; prev.supersededBy = doc.id; }
    AppState.save();
    closeModal('genericModal');
    renderLibrary();
    showToast(prev ? 'Rev ' + doc.rev + ' uploaded — Rev ' + prev.rev + ' superseded' : 'Document uploaded: ' + number, 'success', 4000);
  } catch(err) {
    console.error('[Library] Upload error:', err);
    showToast('Upload failed: ' + err.message, 'error', 6000);
  }
}

async function viewLibraryDoc(id){
  const d = (AppState.data.libraryDocs||[]).find(x => x.id === id);
  if (!d) return;
  if (d.fileWebUrl) { window.open(d.fileWebUrl,'_blank'); return; }
  if (d.spDriveId && d.spItemId) {
    const url = await spGetFileDownloadUrl(d.spDriveId, d.spItemId);
    if (url) { window.open(url,'_blank'); return; }
  }
  showToast('Cannot open file','error');
}

async function downloadLibraryDoc(id){
  const d = (AppState.data.libraryDocs||[]).find(x => x.id === id);
  if (!d) return;
  let url = d.fileUrl;
  if (d.spDriveId && d.spItemId) url = await spGetFileDownloadUrl(d.spDriveId, d.spItemId) || url;
  if (!url) { showToast('Cannot download file','error'); return; }
  const a = document.createElement('a');
  a.href = url; a.download = d.fileName || d.name; a.target = '_blank'; a.click();
  showToast('Downloading: ' + (d.fileName||d.name), 'success');
}

async function deleteLibraryDoc(id){
  const isAdmin = (_currentUserProfile && _currentUserProfile.isAdmin) || false;
  if (!isAdmin) { showToast('Only admins can delete library documents','error'); return; }
  const d = (AppState.data.libraryDocs||[]).find(x => x.id === id);
  if (!d) return;
  if (!confirm('Delete "' + d.name + '" (Rev ' + d.rev + ')?\n\nThis also deletes the file from SharePoint and cannot be undone.')) return;
  if (d.spDriveId && d.spItemId) {
    try { await spDeleteFile(d.spDriveId, d.spItemId); } catch(e){ console.warn('SP delete:', e.message); }
  }
  // If this doc superseded another, reactivate the previous revision
  if (d.revisionOf) {
    const prev = (AppState.data.libraryDocs||[]).find(x => x.id === d.revisionOf);
    if (prev && prev.supersededBy === d.id) { prev.status = 'active'; delete prev.supersededBy; }
  }
  AppState.data.libraryDocs = (AppState.data.libraryDocs||[]).filter(x => x.id !== id);
  AppState.save();
  renderLibrary();
  showToast('Library document deleted','warning');
}
