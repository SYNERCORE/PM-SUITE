function renderProjects() {
  if (detailProjectId) { renderProjectDetail(); return; }
  const el = $('#projects');
  const totalProjects = (AppState.data.projects||[]).filter(p => p && !p._deleted && p.status !== 'prospect').length;
  const view = _projPrefs.view;
  const groupBy = _projPrefs.groupBy;

  el.innerHTML = `
    <div class="section-header" style="margin-bottom:14px">
      <div>
        <div class="section-title">Project Master List</div>
        <div class="section-sub">${totalProjects} project${totalProjects!==1?'s':''}</div>
      </div>
      <div style="display:flex;gap:7px;align-items:center;flex-wrap:wrap">
        <button class="btn btn-secondary btn-sm" onclick="exportCSV((AppState.data.projects||[]).filter(p=>!p._deleted&&p.status!=='prospect').map(p=>[p.id,p.name,p.client,p.status,p.progress+'%',p.budget,p.spent]),['ID','Name','Client','Status','Progress','Budget','Spent'],'projects.csv')"><i class="fas fa-download"></i> Export</button>
        <button class="btn btn-primary btn-sm" onclick="showProjectForm()"><i class="fas fa-plus"></i> New Project</button>
      </div>
    </div>

    <!-- Filters bar -->
    <div class="filters-bar" style="flex-wrap:wrap;gap:7px">
      ${['all','active','completed','planned'].map(f => `<button class="btn btn-sm ${(typeof projectFilter!=='undefined'?projectFilter:'all')===f?'btn-primary':'btn-secondary'}" onclick="filterProjects('${f}')">${f.charAt(0).toUpperCase()+f.slice(1)}</button>`).join('')}
      <select class="form-select" style="height:30px;width:160px" id="projBUFilter" onchange="projectBUFilter=this.value;renderProjects()">
        <option value="all">All Business Units</option>
        <option value="" ${typeof projectBUFilter!=='undefined'&&projectBUFilter===''?'selected':''}>Main Company</option>
        ${(AppState.data.businessUnits||[]).map(bu => `<option value="${bu.id}" ${typeof projectBUFilter!=='undefined'&&projectBUFilter===bu.id?'selected':''}>${bu.name}</option>`).join('')}
      </select>
      <div class="search-bar" style="margin-left:auto">
        <i class="fas fa-search"></i>
        <input type="text" placeholder="Search ID, name, client..." value="${typeof projectSearch!=='undefined'?projectSearch:''}" oninput="searchProjects(this.value)">
      </div>
    </div>

    <!-- View + Group controls -->
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;flex-wrap:wrap;gap:10px">
      <div style="display:flex;align-items:center;gap:10px">
        <span style="font-size:11px;color:var(--text-muted);font-weight:600">Group by:</span>
        <select class="form-select" style="height:28px;font-size:11px;width:120px" onchange="setProjGroupBy(this.value)">
          <option value="status" ${groupBy==='status'?'selected':''}>Status</option>
          <option value="bu" ${groupBy==='bu'?'selected':''}>Business Unit</option>
          <option value="none" ${groupBy==='none'?'selected':''}>None (flat)</option>
        </select>
      </div>
      <div style="display:flex;align-items:center;gap:5px;background:var(--bg-hover);border-radius:7px;padding:2px">
        <button class="btn btn-sm" style="height:26px;padding:0 10px;border:none;background:${view==='table'?'var(--accent-blue)':'transparent'};color:${view==='table'?'#fff':'var(--text-muted)'};font-weight:600" onclick="setProjView('table')" title="Table view"><i class="fas fa-table"></i> Table</button>
        <button class="btn btn-sm" style="height:26px;padding:0 10px;border:none;background:${view==='list'?'var(--accent-blue)':'transparent'};color:${view==='list'?'#fff':'var(--text-muted)'};font-weight:600" onclick="setProjView('list')" title="List view"><i class="fas fa-list"></i> List</button>
        <button class="btn btn-sm" style="height:26px;padding:0 10px;border:none;background:${view==='cards'?'var(--accent-blue)':'transparent'};color:${view==='cards'?'#fff':'var(--text-muted)'};font-weight:600" onclick="setProjView('cards')" title="Cards view"><i class="fas fa-th"></i> Cards</button>
      </div>
    </div>

    <!-- Content area -->
    <div id="projectsContent">${_renderProjGroups()}</div>
  `;
}

// Render groups + dispatch to view renderer
function _renderProjGroups() {
  const projects = _getFilteredProjects();
  if (!projects.length) {
    return `<div class="empty-state"><i class="fas fa-folder-open"></i><p>No projects match these filters</p></div>`;
  }
  const groups = _groupProjects(projects);
  if (groups.length === 1 && groups[0].isFlat) {
    // No grouping
    return _renderProjView(groups[0].projects);
  }
  return groups.map(g => _renderGroupSection(g, false)).join('');
}

function _renderGroupSection(group, isSubgroup) {
  const collapsed = _projPrefs.isCollapsed(group.key);
  const count = group.projects.length;
  const headerStyle = isSubgroup
    ? 'padding:7px 12px;margin:6px 0 4px 14px;background:var(--bg-hover);border-radius:6px;font-size:11px'
    : 'padding:9px 14px;margin:12px 0 6px;background:linear-gradient(90deg,'+(group.color||'#388bfd')+'22, transparent);border-left:3px solid '+(group.color||'#388bfd')+';border-radius:6px;font-size:12px';

  let content = '';
  if (!collapsed) {
    if (group.subgroups && group.subgroups.length) {
      // BU group with status subgroups
      content = group.subgroups.map(sub => _renderGroupSection(sub, true)).join('');
    } else {
      content = _renderProjView(group.projects);
    }
  }
  return `
    <div class="proj-group" data-key="${group.key}">
      <div style="${headerStyle};cursor:pointer;display:flex;align-items:center;gap:8px;user-select:none" onclick="toggleProjGroup('${group.key}')">
        <i class="fas fa-chevron-${collapsed?'right':'down'}" style="font-size:9px;color:${group.color||'#388bfd'};width:9px"></i>
        <span style="font-weight:700;color:${group.color||'#388bfd'};letter-spacing:.5px">${group.label}</span>
        <span style="font-size:10px;color:var(--text-muted);background:var(--bg-hover);padding:1px 7px;border-radius:8px;font-weight:600">${count}</span>
      </div>
      ${content}
    </div>`;
}

// Dispatch to the right view renderer
function _renderProjView(projects) {
  const view = _projPrefs.view;
  if (view === 'table') return _renderProjTable(projects);
  if (view === 'list') return _renderProjList(projects);
  return _renderProjCards(projects);
}

// ═══ TABLE VIEW ═══════════════════════════════════════════
function _renderProjTable(projects) {
  const col = _projPrefs.sortCol;
  const dir = _projPrefs.sortDir;
  const sortIcon = c => c === col ? `<i class="fas fa-caret-${dir==='asc'?'up':'down'}" style="margin-left:4px;color:var(--accent-blue)"></i>` : '';
  const cols = [
    { k:'id', label:'ID', w:'150px' },
    { k:'name', label:'Name', w:'auto' },
    { k:'client', label:'Client', w:'120px' },
    { k:'phase', label:'Phase', w:'80px' },
    { k:'status', label:'Status', w:'90px' },
    { k:'progress', label:'Progress', w:'130px' },
    { k:'budget', label:'Budget', w:'110px' },
    { k:'startDate', label:'Start', w:'95px' },
    { k:'endDate', label:'End', w:'95px' },
    { k:'_health', label:'Health', w:'60px', nosort:true },
    { k:'_ready', label:'Ready', w:'65px', nosort:true },
    { k:'_actions', label:'', w:'50px', nosort:true },
  ];
  const today = new Date().toISOString().split('T')[0];
  return `
    <div style="overflow-x:auto;border:1px solid var(--border);border-radius:8px;margin-bottom:10px">
      <table style="width:100%;border-collapse:collapse;font-size:11px;background:var(--bg-card)">
        <thead style="position:sticky;top:0;background:var(--bg-primary);z-index:1">
          <tr>
            ${cols.map(c => `<th style="text-align:left;padding:8px 10px;font-weight:700;font-size:10px;letter-spacing:.5px;color:var(--text-muted);border-bottom:1px solid var(--border);white-space:nowrap;${c.w!=='auto'?'width:'+c.w:''};${c.nosort?'':'cursor:pointer;user-select:none'}" ${c.nosort?'':`onclick="setProjSort('${c.k}')"`}>${c.label}${!c.nosort?sortIcon(c.k):''}</th>`).join('')}
          </tr>
        </thead>
        <tbody>
          ${projects.map(p => {
            const dl = (typeof daysBetween === 'function') ? daysBetween(today, p.endDate) : 0;
            const overdue = p.endDate && p.endDate < today && p.status !== 'completed';
            const flagged = p._flagged;
            const health = flagged ? '<i class="fas fa-flag" style="color:var(--accent-red)" title="Flagged"></i>'
              : overdue ? '<i class="fas fa-exclamation-triangle" style="color:var(--accent-amber)" title="Overdue"></i>'
              : '<i class="fas fa-check-circle" style="color:var(--accent-green)" title="On track"></i>';
            const statusColor = _PROJ_STATUS_COLORS[p.status] || '#388bfd';
            const progColor = (typeof pColor === 'function') ? pColor(p.progress) : '#388bfd';
            return `<tr style="border-bottom:1px solid var(--border);transition:background .15s" onmouseenter="this.style.background='var(--bg-hover)'" onmouseleave="this.style.background=''">
              <td style="padding:8px 10px;font-family:var(--font-mono);font-size:10px;color:var(--accent-blue);font-weight:700;cursor:pointer;white-space:nowrap" onclick="showProjectDetail('${p.id}')" title="Open project detail">${p.id}</td>
              <td style="padding:8px 10px;font-weight:600;cursor:pointer;max-width:280px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" onclick="showProjectDetail('${p.id}')" title="${(p.name||'').replace(/"/g,'&quot;')}">${p.name||'-'}</td>
              <td style="padding:8px 10px;color:var(--text-secondary);max-width:120px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${(p.client||'').replace(/"/g,'&quot;')}">${p.client||'-'}</td>
              <td style="padding:8px 10px"><span style="font-size:9px;padding:2px 7px;border-radius:8px;background:var(--bg-hover);color:var(--text-secondary);text-transform:capitalize">${p.phase||'-'}</span></td>
              <td style="padding:8px 10px"><span style="font-size:9px;padding:2px 8px;border-radius:8px;background:${statusColor}22;color:${statusColor};font-weight:700;text-transform:uppercase">${p.status||'-'}</span></td>
              <td style="padding:8px 10px">
                <div style="display:flex;align-items:center;gap:6px">
                  <div style="flex:1;height:5px;background:var(--bg-hover);border-radius:3px;overflow:hidden"><div style="width:${p.progress||0}%;height:100%;background:${progColor}"></div></div>
                  <span style="font-size:10px;font-family:var(--font-mono);font-weight:700;width:30px;text-align:right">${p.progress||0}%</span>
                </div>
              </td>
              <td style="padding:8px 10px;font-family:var(--font-mono);font-size:10px;font-weight:600">${(typeof fmtNum==='function')?fmtNum(p.budget||0):p.budget||0}</td>
              <td style="padding:8px 10px;font-family:var(--font-mono);font-size:10px;color:var(--text-secondary)">${p.startDate||'-'}</td>
              <td style="padding:8px 10px;font-family:var(--font-mono);font-size:10px;color:${overdue?'var(--accent-red);font-weight:700':'var(--text-secondary)'}">${p.endDate||'-'}</td>
              <td style="padding:8px 10px;text-align:center">${health}</td>
              <td style="padding:8px 10px;text-align:center">${(()=>{const rd=_projectReadiness(p.id);return rd.overall==='go'?'<span style="font-size:9px;padding:2px 7px;border-radius:8px;background:rgba(63,185,80,.15);color:var(--accent-green);font-weight:700">GO</span>':rd.overall==='caution'?'<span style="font-size:9px;padding:2px 7px;border-radius:8px;background:rgba(240,164,80,.15);color:var(--accent-amber);font-weight:700">CAUTION</span>':'<span style="font-size:9px;padding:2px 7px;border-radius:8px;background:rgba(248,81,73,.15);color:var(--accent-red);font-weight:700">NOT READY</span>';})()}</td>
              <td style="padding:8px 10px;text-align:right">
                <button class="btn btn-secondary btn-sm btn-icon" style="height:24px;width:24px;font-size:10px" onclick="event.stopPropagation();showProjectForm('${p.id}')" title="Edit"><i class="fas fa-pen"></i></button>
              </td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>
    </div>`;
}

// ═══ LIST VIEW ════════════════════════════════════════════
function _renderProjList(projects) {
  const today = new Date().toISOString().split('T')[0];
  return `<div style="display:flex;flex-direction:column;gap:7px;margin-bottom:10px">
    ${projects.map(p => {
      const dl = (typeof daysBetween === 'function') ? daysBetween(today, p.endDate) : 0;
      const overdue = p.endDate && p.endDate < today && p.status !== 'completed';
      const statusColor = _PROJ_STATUS_COLORS[p.status] || '#388bfd';
      const progColor = (typeof pColor === 'function') ? pColor(p.progress) : '#388bfd';
      const bu = _getProjBU(p);
      return `<div style="background:var(--bg-card);border:1px solid var(--border);border-radius:8px;padding:10px 12px;cursor:pointer;transition:transform .1s,border-color .15s" onmouseenter="this.style.borderColor='var(--accent-blue)'" onmouseleave="this.style.borderColor='var(--border)'" onclick="showProjectDetail('${p.id}')">
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:8px">
          <span style="width:8px;height:8px;border-radius:50%;background:${statusColor};flex-shrink:0"></span>
          <span style="font-family:var(--font-mono);font-size:11px;font-weight:700;color:var(--accent-blue)">${p.id}</span>
          <span style="font-size:10px;padding:1px 7px;border-radius:8px;background:${statusColor}22;color:${statusColor};font-weight:700;text-transform:uppercase">${p.status||'-'}</span>
          <span style="font-size:10px;color:var(--text-muted)">· ${p.client||'-'}${p.phase?' · '+p.phase:''}</span>
          ${p._flagged?'<i class="fas fa-flag" style="color:var(--accent-red);margin-left:auto"></i>':''}
          ${overdue?'<i class="fas fa-exclamation-triangle" style="color:var(--accent-amber);margin-left:auto"></i>':''}
          ${(()=>{const rd=_projectReadiness(p.id);return rd.overall==='go'?'<span style="font-size:9px;padding:1px 7px;border-radius:8px;background:rgba(63,185,80,.15);color:var(--accent-green);font-weight:700;margin-left:auto">GO</span>':rd.overall==='caution'?'<span style="font-size:9px;padding:1px 7px;border-radius:8px;background:rgba(240,164,80,.15);color:var(--accent-amber);font-weight:700;margin-left:auto">CAUTION</span>':'<span style="font-size:9px;padding:1px 7px;border-radius:8px;background:rgba(248,81,73,.15);color:var(--accent-red);font-weight:700;margin-left:auto">NOT READY</span>';})()}
          <button class="btn btn-secondary btn-sm btn-icon" style="height:24px;width:24px;font-size:10px;margin-left:5px" onclick="event.stopPropagation();showProjectForm('${p.id}')" title="Edit"><i class="fas fa-pen"></i></button>
        </div>
        <div style="font-size:13px;font-weight:600;line-height:1.3;margin-bottom:6px">${p.name||'-'}</div>
        <div style="display:flex;align-items:center;gap:10px;font-size:10px;color:var(--text-muted)">
          <div style="flex:1;display:flex;align-items:center;gap:6px">
            <div style="flex:1;height:5px;background:var(--bg-hover);border-radius:3px;overflow:hidden"><div style="width:${p.progress||0}%;height:100%;background:${progColor}"></div></div>
            <span style="font-family:var(--font-mono);font-weight:700;color:var(--text-primary);min-width:30px;text-align:right">${p.progress||0}%</span>
          </div>
          <span>${(typeof fmtNum==='function')?'₱'+fmtNum(p.budget||0):p.budget||0}</span>
          ${p.endDate?`<span style="${overdue?'color:var(--accent-red);font-weight:700':''}"><i class="fas fa-calendar" style="margin-right:3px;font-size:9px"></i>${p.endDate}</span>`:''}
        </div>
      </div>`;
    }).join('')}
  </div>`;
}

// ═══ CARDS VIEW (preserved from original) ═════════════════
function _renderProjCards(projects) {
  if (!projects.length) return '';
  return `<div class="grid grid-3" style="margin-bottom:10px">${projects.map(p => {
    const bu = Math.round((p.spent/p.budget)*100) || 0;
    const dl = (typeof daysBetween === 'function') ? daysBetween(new Date().toISOString().split('T')[0], p.endDate) : 0;
    return `<div class="project-card">
      <div style="display:flex;align-items:flex-start;justify-content:space-between;margin-bottom:10px">
        <div>
          <div class="project-card-id">${p.id}${p.discipline?'<span class="project-card-id-discipline">'+p.discipline+'</span>':''}</div>
          <div class="project-card-name">${p.name}</div>
          <div class="project-card-client"><i class="fas fa-building" style="font-size:9px"></i> ${p.client}</div>
          ${p.businessUnit?(()=>{const b=(AppState.data.businessUnits||[]).find(x=>x.id===p.businessUnit);return b?`<div style="margin-top:3px"><span style="font-size:9px;padding:1px 7px;border-radius:10px;background:${b.color||'#388bfd'}22;color:${b.color||'#388bfd'};font-weight:600;border:1px solid ${b.color||'#388bfd'}44"><i class="fas fa-layer-group" style="margin-right:3px;font-size:8px"></i>${b.name}</span></div>`:'';})():''}
        </div>
        <div style="display:flex;flex-direction:column;align-items:flex-end;gap:3px">${typeof sBadge==='function'?sBadge(p.status):p.status}${typeof pBadge==='function'?pBadge(p.priority):''}</div>
      </div>
      <div style="margin:10px 0">
        <div style="display:flex;justify-content:space-between;margin-bottom:3px">
          <span style="font-size:10px;color:var(--text-secondary)">Progress</span>
          <span style="font-size:11px;font-weight:700;font-family:var(--font-mono)">${p.progress}%</span>
        </div>
        <div class="progress-bar" style="height:7px"><div class="progress-fill" style="width:${p.progress}%;background:${typeof pColor==='function'?pColor(p.progress):'#388bfd'};border-radius:4px"></div></div>
      </div>
      <div style="display:flex;gap:14px;padding-top:10px;border-top:1px solid var(--border)">
        <div style="text-align:center"><div style="font-size:13px;font-weight:700;font-family:var(--font-mono)">${typeof fmtNum==='function'?fmtNum(p.budget):p.budget}</div><div style="font-size:9px;color:var(--text-secondary)">Budget</div></div>
        <div style="text-align:center"><div style="font-size:13px;font-weight:700;font-family:var(--font-mono);color:${bu>90?'var(--accent-red)':'var(--accent-green)'}">${bu}%</div><div style="font-size:9px;color:var(--text-secondary)">Spent</div></div>
        <div style="text-align:center"><div style="font-size:13px;font-weight:700;font-family:var(--font-mono);color:${dl<30&&dl>0?'var(--accent-amber)':dl<=0?'var(--accent-red)':'inherit'}">${dl<0?'OD':dl+'d'}</div><div style="font-size:9px;color:var(--text-secondary)">Left</div></div>
        <div style="text-align:center;margin-left:auto"><div style="font-size:11px;font-weight:700">${(p.pm||'').split(' ')[0]||'-'}</div><div style="font-size:9px;color:var(--text-secondary)">PM</div></div>
      </div>
      ${(()=>{const rd=_projectReadiness(p.id);const cfg=rd.overall==='go'?{c:'var(--accent-green)',bg:'rgba(63,185,80,.1)',ic:'fa-check-circle',l:'Ready to Execute'}:rd.overall==='caution'?{c:'var(--accent-amber)',bg:'rgba(240,164,80,.1)',ic:'fa-exclamation-triangle',l:`Caution · ${rd.warns} issue${rd.warns!==1?'s':''}`}:{c:'var(--accent-red)',bg:'rgba(248,81,73,.1)',ic:'fa-times-circle',l:`Not Ready · ${rd.fails} blocker${rd.fails!==1?'s':''}`};return`<div style="margin-top:8px;padding:6px 10px;border-radius:6px;background:${cfg.bg};border:1px solid ${cfg.c}33;display:flex;align-items:center;gap:6px;cursor:pointer" onclick="showProjectDetail('${p.id}');setTimeout(()=>{detailTab='readiness';renderDetailTab();},200)" title="View Readiness"><i class="fas ${cfg.ic}" style="color:${cfg.c};font-size:12px"></i><span style="font-size:10px;font-weight:700;color:${cfg.c}">${cfg.l}</span><i class="fas fa-chevron-right" style="color:${cfg.c};font-size:9px;margin-left:auto"></i></div>`;})()}
      <div style="display:flex;justify-content:flex-end;gap:6px;margin-top:10px;padding-top:10px;border-top:1px solid var(--border)">
        <button class="btn btn-primary btn-sm" onclick="showProjectDetail('${p.id}')"><i class="fas fa-eye"></i> View</button>
        <button class="btn btn-secondary btn-sm" onclick="showProjectForm('${p.id}')"><i class="fas fa-pen"></i> Edit</button>
        <button class="btn btn-secondary btn-sm" onclick="duplicateProject('${p.id}')" title="Duplicate project"><i class="fas fa-copy"></i></button>
        <button class="btn btn-danger btn-sm" onclick="deleteProject('${p.id}')"><i class="fas fa-trash"></i></button>
      </div>
    </div>`;
  }).join('')}</div>`;
}



function filterProjects(f){projectFilter=f;renderProjects();}
function searchProjects(v){projectSearch=v;const c=$('#projectsContent');if(c)c.innerHTML=_renderProjGroups();}


// ═══════════════════════════════════════════════════════════
// ── FIX #2: FIELD-LEVEL CONFLICT DETECTION ───────────────
// Snapshot record when modal opens, diff against current on save
// ═══════════════════════════════════════════════════════════

let _editModalSnapshots = {}; // { modalKey: { record, openedAt } }

function _snapshotRecord(modalKey, record) {
  if (!record) return;
  _editModalSnapshots[modalKey] = {
    record: JSON.parse(JSON.stringify(record)), // deep clone
    openedAt: Date.now(),
  };
}

// Returns array of field names that have changed since modal opened
function _detectExternalChanges(modalKey, currentRecord) {
  const snap = _editModalSnapshots[modalKey];
  if (!snap || !currentRecord) return [];
  const changed = [];
  Object.keys(currentRecord).forEach(key => {
    // Skip internal/transient fields
    if (key.startsWith('_') || key === 'id') return;
    if (typeof currentRecord[key] === 'object') return; // skip nested objects/arrays
    if (JSON.stringify(snap.record[key]) !== JSON.stringify(currentRecord[key])) {
      changed.push(key);
    }
  });
  return changed;
}

function _clearSnapshot(modalKey) {
  delete _editModalSnapshots[modalKey];
}

// Show conflict warning modal — returns Promise<boolean> (true = keep mine, false = reload)
function _showConflictWarning(modalKey, currentRecord, mySnapshot, conflictFields) {
  return new Promise(resolve => {
    const fieldList = conflictFields.map(f => `<div style="padding:6px 10px;background:var(--bg-hover);border-radius:5px;margin-bottom:4px;font-size:11px">
      <strong style="color:var(--accent-amber);text-transform:uppercase;font-size:9px;letter-spacing:.5px">${f}</strong><br>
      <span style="color:var(--text-muted)">Your value:</span> <code style="background:rgba(63,185,80,.1);padding:1px 5px;border-radius:3px;color:var(--accent-green);font-size:10px">${String(mySnapshot.record[f]||'').substring(0,80)}</code><br>
      <span style="color:var(--text-muted)">Current value:</span> <code style="background:rgba(248,81,73,.1);padding:1px 5px;border-radius:3px;color:var(--accent-red);font-size:10px">${String(currentRecord[f]||'').substring(0,80)}</code>
    </div>`).join('');

    $('#genericModalTitle').textContent = '⚠ Conflict Detected';
    $('#genericModalBody').innerHTML = `
      <div style="padding:12px;background:rgba(240,164,80,.1);border:1px solid rgba(240,164,80,.3);border-radius:8px;margin-bottom:14px">
        <div style="font-weight:700;color:var(--accent-amber);margin-bottom:5px"><i class="fas fa-exclamation-triangle" style="margin-right:5px"></i>Another user modified this record while you were editing</div>
        <div style="font-size:11px;color:var(--text-secondary)">${conflictFields.length} field${conflictFields.length!==1?'s':''} changed. Choose how to resolve:</div>
      </div>
      <div style="max-height:300px;overflow-y:auto;margin-bottom:10px">${fieldList}</div>
      <div style="padding:10px 12px;background:var(--bg-hover);border-radius:7px;font-size:11px;color:var(--text-muted)">
        <strong>Keep my changes:</strong> Overwrites the other user's edits with yours.<br>
        <strong>Reload latest:</strong> Discards your unsaved edits and reloads the current record.
      </div>
    `;
    $('#genericModalFooter').innerHTML = `
      <button class="btn btn-secondary" onclick="closeModal('genericModal');window._conflictResolve&&window._conflictResolve('reload')"><i class="fas fa-undo"></i> Reload latest</button>
      <button class="btn btn-primary" style="background:var(--accent-amber);border-color:var(--accent-amber)" onclick="closeModal('genericModal');window._conflictResolve&&window._conflictResolve('keep')"><i class="fas fa-save"></i> Keep my changes</button>
    `;
    window._conflictResolve = (choice) => {
      window._conflictResolve = null;
      resolve(choice === 'keep');
    };
    openModal('genericModal');
  });
}

// Wrapper used by Save handlers — returns true if user wants to proceed
async function _checkConflictBeforeSave(modalKey, recordId, dataKey) {
  const snap = _editModalSnapshots[modalKey];
  if (!snap) return true; // no snapshot = no check
  const current = (AppState.data[dataKey] || []).find(r => r.id === recordId);
  if (!current) return true; // record gone — let save handle it
  const changed = _detectExternalChanges(modalKey, current);
  if (changed.length === 0) return true; // no conflict
  // Conflict! Ask user
  const keepMine = await _showConflictWarning(modalKey, current, snap, changed);
  if (!keepMine) {
    // Reload — close edit modal too (user will need to reopen with fresh data)
    _clearSnapshot(modalKey);
    return false;
  }
  return true;
}


// ── Auto-compute project Start/End/Duration ──────────────────
// 'lastEdited' is the field the user just changed: 'start' | 'end' | 'duration'
// Logic:
//   - User edits Start: if Duration set → recompute End; if End set → recompute Duration
//   - User edits End:   if Duration set → recompute Start; if Start set → recompute Duration
//   - User edits Duration: prefer Start as anchor → recompute End; else if End set → recompute Start
const _CAL_PRESETS = {
  standard:    { workDays:[1,2,3,4,5],         hoursPerDay:8,  mode:'standard'    },
  extended:    { workDays:[1,2,3,4,5],         hoursPerDay:12, mode:'extended'    },
  monsat8:     { workDays:[1,2,3,4,5,6],       hoursPerDay:8,  mode:'monsat8'     },
  monsat12:    { workDays:[1,2,3,4,5,6],       hoursPerDay:12, mode:'monsat12'    },
  calendar247: { workDays:[0,1,2,3,4,5,6],     hoursPerDay:24, mode:'calendar247' },
};

function _applyCalPreset(preset) {
  const custom = document.getElementById('pCalCustom');
  if (!custom) return;
  if (preset === 'custom') { custom.style.display = 'block'; return; }
  custom.style.display = 'none';
  const p = _CAL_PRESETS[preset];
  if (!p) return;
  // Update checkboxes and hours to reflect the preset
  [0,1,2,3,4,5,6].forEach(i => {
    const cb = document.getElementById('pCalDay' + i);
    if (cb) cb.checked = p.workDays.includes(i);
  });
  const hpd = document.getElementById('pCalHPD');
  if (hpd) hpd.value = p.hoursPerDay;
}

function _readCalendarFromForm() {
  const preset = document.getElementById('pCalPreset')?.value || 'standard';
  if (preset !== 'custom' && _CAL_PRESETS[preset]) return _CAL_PRESETS[preset];
  // custom
  const workDays = [0,1,2,3,4,5,6].filter(i => document.getElementById('pCalDay'+i)?.checked);
  const hoursPerDay = parseInt(document.getElementById('pCalHPD')?.value) || 8;
  return { workDays, hoursPerDay, mode: 'custom' };
}

function _recalcProjDates(lastEdited) {
  const startEl = document.getElementById('pStart');
  const endEl = document.getElementById('pEnd');
  const durEl = document.getElementById('pDuration');
  if (!startEl || !endEl || !durEl) return;

  const start = startEl.value;
  const end = endEl.value;
  const dur = parseInt(durEl.value, 10);
  const hasStart = !!start;
  const hasEnd = !!end;
  const hasDur = !isNaN(dur) && dur >= 0;

  // Use local date format to avoid UTC drift on non-UTC timezones (e.g., PHT)
  const fmtLocal = (d) => d.getFullYear() + '-' +
    String(d.getMonth() + 1).padStart(2, '0') + '-' +
    String(d.getDate()).padStart(2, '0');
  const addDays = (dateStr, days) => {
    const d = new Date(dateStr + 'T00:00:00');
    d.setDate(d.getDate() + days);
    return fmtLocal(d);
  };
  const diffDays = (a, b) => {
    // Compare only the date parts to avoid timezone issues
    const da = new Date(a + 'T00:00:00');
    const db = new Date(b + 'T00:00:00');
    return Math.max(0, Math.round((db - da) / 86400000));
  };

  // Inclusive counting: start date = day 1.
  // So duration = (end - start) + 1, and end = start + (duration - 1).
  try {
    if (lastEdited === 'start') {
      if (hasStart && hasDur && dur > 0) {
        endEl.value = addDays(start, dur - 1);
      } else if (hasStart && hasEnd) {
        durEl.value = diffDays(start, end) + 1;
      }
    } else if (lastEdited === 'end') {
      if (hasEnd && hasDur && dur > 0) {
        startEl.value = addDays(end, -(dur - 1));
      } else if (hasStart && hasEnd) {
        if (new Date(end) < new Date(start)) return; // End before start — invalid
        durEl.value = diffDays(start, end) + 1;
      }
    } else if (lastEdited === 'duration') {
      if (hasStart && hasDur && dur > 0) {
        endEl.value = addDays(start, dur - 1);
      } else if (hasEnd && hasDur && dur > 0) {
        startEl.value = addDays(end, -(dur - 1));
      }
    }
  } catch(e) { /* silent */ }
}

function showProjectForm(id=null){
const p=id?(AppState.data.projects||[]).find(x=>x.id===id):null;
// Fix #2: snapshot record for conflict detection
if (p) _snapshotRecord('project_'+id, p);
// Fix: mark this project as being edited — prevents background sync from wiping fields
if (id && typeof markRecordEditing === 'function') markRecordEditing('projects', id);
$('#projectModalTitle').textContent=id?'Edit Project':'New Project';
$('#projectModalBody').innerHTML=`<div class="form-grid">
<div class="form-group"><label class="form-label">Project ID${id&&p?.status==='prospect'?' <span style="font-size:10px;color:var(--accent-amber)">(editable)</span>':id?' <span style="font-size:10px;color:var(--text-muted)">(use Change ID button to modify)</span>':''}</label><input class="form-input" id="pId" value="${p?.id||'PRJ-'+((AppState.data.projects||[]).length+1).toString().padStart(3,'0')}" ${id&&p?.status!=='prospect'?'readonly style="opacity:.6"':''}></div>
<div class="form-group"><label class="form-label">Project Name *</label><input class="form-input" id="pName" value="${p?.name||''}" placeholder="Enter project name"></div>
<div class="form-group"><label class="form-label">Client *</label><input class="form-input" id="pClient" value="${p?.client||''}" placeholder="Client name"></div>
<div class="form-group"><label class="form-label">Location</label><input class="form-input" id="pLoc" value="${p?.location||''}" placeholder="Location"></div>
<div class="form-group"><label class="form-label">Start Date</label><input class="form-input" type="date" id="pStart" value="${p?.startDate||''}" oninput="_recalcProjDates('start')"></div>
<div class="form-group"><label class="form-label">Duration (days) <span style="font-weight:400;color:var(--text-muted);font-size:10px">· auto-computes the other date</span></label><input class="form-input" type="number" min="0" id="pDuration" value="${p?.duration!=null?p.duration:(p?.startDate&&p?.endDate?Math.max(1,Math.round((new Date(p.endDate)-new Date(p.startDate))/86400000)+1):'')}" oninput="_recalcProjDates('duration')" placeholder="e.g. 90"></div>
<div class="form-group"><label class="form-label">End Date</label><input class="form-input" type="date" id="pEnd" value="${p?.endDate||''}" oninput="_recalcProjDates('end')"></div>
<div class="form-group"><label class="form-label">Budget (${AppState.data.settings?.currency||'PHP'})</label><input class="form-input" type="number" id="pBudget" value="${p?.budget||''}"></div>
<div class="form-group"><label class="form-label">Project Manager</label><input class="form-input" id="pPM" value="${p?.pm||''}" placeholder="PM name"></div>
<div class="form-group"><label class="form-label">Status</label><select class="form-select" id="pStatus">${(function(){
  const cur=p?.status||'active';
  const allowed=(typeof getAllowedStatusTransitions==='function')?getAllowedStatusTransitions(cur):['active','planned','on-hold','completed','archived'];
  const labels={prospect:'Prospect',planned:'Planned',active:'Active','on-hold':'On Hold',completed:'Completed',archived:'Archived'};
  return allowed.map(s=>'<option value="'+s+'"'+(s===cur?' selected':'')+'>'+labels[s]+(s===cur?'':' (transition)')+'</option>').join('');
})()}</select>${(typeof isAdminUser==='function'&&!isAdminUser()&&p?.id)?'<div style="font-size:9px;color:var(--text-muted);margin-top:3px"><i class="fas fa-lock" style="margin-right:3px;font-size:8px"></i>Status flow: prospect → planned → active → completed → archived (admin can override)</div>':''}</div>
<div class="form-group"><label class="form-label">Priority</label><select class="form-select" id="pPri">${['critical','high','medium','low'].map(s=>`<option value="${s}" ${p?.priority===s?'selected':''}>${s}</option>`).join('')}</select></div>
<div class="form-group"><label class="form-label">Discipline</label><input class="form-input" id="pDisc" value="${p?.discipline||''}" placeholder="e.g., Civil/Structural"></div>
<div class="form-group"><label class="form-label">Progress % (Actual)</label><input class="form-input" type="number" id="pProg" value="${p?.progress||0}" min="0" max="100"></div>
<div class="form-group"><label class="form-label">Progress % (Plan)</label><input class="form-input" type="number" id="pPlannedProg" value="${p?.plannedProgress||0}" min="0" max="100"></div>
<div class="form-group"><label class="form-label">Business Unit</label>
<select class="form-select" id="pBU">
<option value="">— None / Main Company —</option>
${(AppState.data.businessUnits||[]).map(bu=>`<option value="${bu.id}" ${p?.businessUnit===bu.id?'selected':''}>${bu.name}</option>`).join('')}
</select></div>
</div>
<div class="form-group"><label class="form-label">Description</label><textarea class="form-textarea" id="pDesc">${p?.description||''}</textarea></div>

<!-- ── CPM Calendar ── -->
<div style="border:1px solid var(--border);border-radius:var(--radius);padding:14px;margin-bottom:4px">
  <div style="font-size:12px;font-weight:600;margin-bottom:10px"><i class="fas fa-calendar-alt" style="color:var(--accent-blue);margin-right:6px"></i>Work Calendar <span style="font-size:10px;font-weight:400;color:var(--text-muted)">— used for CPM scheduling</span></div>
  <div class="form-group">
    <label class="form-label">Preset</label>
    <select class="form-select" id="pCalPreset" onchange="_applyCalPreset(this.value)">
      <option value="standard"   ${(!p?.calendar||p?.calendar?.mode==='standard'  ?'selected':'')}>Standard (Mon–Fri, 8hr)</option>
      <option value="extended"   ${p?.calendar?.mode==='extended'  ?'selected':''}>Extended Weekday (Mon–Fri, 12hr)</option>
      <option value="monsat8"    ${p?.calendar?.mode==='monsat8'   ?'selected':''}>Mon–Sat (8hr)</option>
      <option value="monsat12"   ${p?.calendar?.mode==='monsat12'  ?'selected':''}>Mon–Sat (12hr)</option>
      <option value="calendar247" ${p?.calendar?.mode==='calendar247'?'selected':''}>Pure Calendar (24/7)</option>
      <option value="custom"     ${p?.calendar?.mode==='custom'    ?'selected':''}>Custom</option>
    </select>
  </div>
  <div id="pCalCustom" style="display:${p?.calendar?.mode==='custom'?'block':'none'}">
    <div class="form-group">
      <label class="form-label">Working Days</label>
      <div style="display:flex;gap:6px;flex-wrap:wrap">
        ${['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map((d,i)=>{
          const checked=(p?.calendar?.workDays||[1,2,3,4,5]).includes(i);
          return `<label style="display:flex;align-items:center;gap:4px;font-size:11px;cursor:pointer">
            <input type="checkbox" id="pCalDay${i}" value="${i}" ${checked?'checked':''}> ${d}</label>`;
        }).join('')}
      </div>
    </div>
    <div class="form-group">
      <label class="form-label">Hours per Day</label>
      <input class="form-input" type="number" id="pCalHPD" min="1" max="24" value="${p?.calendar?.hoursPerDay||8}" style="width:100px">
    </div>
  </div>
</div>

<div class="modal-footer">
<button class="btn btn-secondary" onclick="closeModal('projectModal')">Cancel</button>
<button class="btn btn-primary" onclick="saveProject('${id||''}')"><i class="fas fa-save"></i> ${id?'Update':'Create'}</button>
</div>`; openModal('projectModal');}

async function saveProject(id){
const newId=$('#pId').value.trim();
// Capture duration for storage (computed from start/end if needed)
const _durVal = parseInt($('#pDuration')?.value, 10);
// Phase 2: validate status change against lock rules
if (id) {
  const existing = (AppState.data.projects||[]).find(p => p.id === id);
  const newStatus = $('#pStatus')?.value;
  if (existing && newStatus && existing.status !== newStatus) {
    if (!validateStatusChange(existing.status, newStatus, existing.name)) {
      // Revert the dropdown
      const sel = document.getElementById('pStatus');
      if (sel) sel.value = existing.status;
      return;
    }
  }
}
// Fix #2: check for external changes before save
if (id) {
  const proceed = await _checkConflictBeforeSave('project_'+id, id, 'projects');
  if (!proceed) {
    // User chose "Reload latest" — close edit modal and reopen with fresh data
    closeModal('projectModal');
    setTimeout(() => showProjectForm(id), 300);
    return;
  }
}
const pr={id:newId,name:$('#pName').value,client:$('#pClient').value,location:$('#pLoc').value,startDate:$('#pStart').value,endDate:$('#pEnd').value,duration:isNaN(_durVal)?undefined:_durVal,budget:parseFloat($('#pBudget').value)||0,pm:$('#pPM').value,status:$('#pStatus').value,priority:$('#pPri').value,discipline:$('#pDisc').value,progress:parseInt($('#pProg').value)||0,description:$('#pDesc').value,businessUnit:$('#pBU')?.value||'',plannedProgress:parseInt($('#pPlannedProg')?.value)||0,spent:0,riskLevel:'medium',phase:'Initiation',calendar:_readCalendarFromForm()};
if(!_req(['pName','pId','pClient','pStart','pEnd'])){showToast('Fill in required fields','error');return;}
if(id){
  const existing=(AppState.data.projects||[]).find(p=>p.id===id);
  const idChanged=existing&&existing.id!==newId;
  // For prospect projects, allow inline ID edit
  if(idChanged&&existing.status==='prospect'){
    // Check uniqueness
    if((AppState.data.projects||[]).some(p=>p.id===newId&&p.id!==id)){showToast('Project ID '+newId+' already exists','error');return;}
    // Cascade update
    _cascadeUpdateProjectId(id,newId,_currentUserProfile?.name||'User','Inline edit on prospect');
    id=newId; // refresh id reference
  }else if(idChanged){
    showToast('Cannot change ID directly — use "Change Project ID" button','error',5000);
    return;
  }
  const idx=(AppState.data.projects||[]).findIndex(p=>p.id===id);
  AppState.data.projects[idx]={...AppState.data.projects[idx],...pr,id};
}else{
  // Auto-prefix ID for prospects if user kept the default PRJ- prefix
  if(pr.status==='prospect'&&newId.startsWith('PRJ-')){
    pr.id='PROSPECT-'+((AppState.data.projects||[]).filter(p=>p.status==='prospect').length+1).toString().padStart(3,'0');
  }
  // Check uniqueness
  if((AppState.data.projects||[]).some(p=>p.id===pr.id)){showToast('Project ID '+pr.id+' already exists','error');return;}
  AppState.data.projects.push(pr);
}
AppState.save();closeModal('projectModal');
if(id){_clearSnapshot('project_'+id);if(typeof unmarkRecordEditing==='function')unmarkRecordEditing('projects',id);}
const isProspect=pr.status==='prospect';
if(isProspect){renderProspects();navigate('prospects');}else{renderProjects();}
showToast(id?'Project updated':(isProspect?'Prospect created':'Project created'),'success');}

function deleteProject(id){
  return requestOrDelete('projects', id);
  // Original code below (no longer reached) ────────────
  _origDeleteProject(id);
}
function _origDeleteProject(id){
if(!confirm('Delete this project?'))return;
AppState.data.projects=(AppState.data.projects||[]).filter(p=>p.id!==id);
AppState.save();showToast('Project deleted','warning');renderProjects();}

function duplicateProject(id){
  const src=(AppState.data.projects||[]).find(p=>p.id===id);
  if(!src){showToast('Project not found','error');return;}
  const newId='PROJ-'+String(Date.now()).slice(-6);
  const copy=JSON.parse(JSON.stringify(src));
  copy.id=newId;
  copy.name='Copy of '+src.name;
  copy.status='planned';
  copy.progress=0;
  copy.spent=0;
  copy._deleted=false;
  copy._purged=false;
  delete copy._deletedAt; delete copy._deletedBy; delete copy._purgedAt;
  copy._createdAt=new Date().toISOString();
  copy._createdBy=_currentUserProfile?.name||_currentUserProfile?.email||'unknown';
  // Copy allocations for this project
  const allocsToCopy=(AppState.data.resourceAllocations||[]).filter(a=>a.projectId===id&&!a._deleted);
  allocsToCopy.forEach(a=>{
    const na=JSON.parse(JSON.stringify(a));
    na.id='ALLOC-'+Math.random().toString(36).slice(2,8).toUpperCase();
    na.projectId=newId;
    na.actualCost=0;
    if(!AppState.data.resourceAllocations)AppState.data.resourceAllocations=[];
    AppState.data.resourceAllocations.push(na);
  });
  // Copy costs
  const costsToCopy=(AppState.data.costs||[]).filter(c=>c.projectId===id&&!c._deleted);
  costsToCopy.forEach(c=>{
    const nc=JSON.parse(JSON.stringify(c));
    nc.id='CST-'+Math.random().toString(36).slice(2,8).toUpperCase();
    nc.projectId=newId;
    nc.actual=0;
    if(!AppState.data.costs)AppState.data.costs=[];
    AppState.data.costs.push(nc);
  });
  if(!AppState.data.projects)AppState.data.projects=[];
  AppState.data.projects.push(copy);
  AppState.save();
  renderProjects();
  showToast(`Project duplicated as ${newId} — allocations & costs copied, usage logs not copied`,'success',5000);
}

function printProjectDetail(pid){
  const p=(AppState.data.projects||[]).find(x=>x.id===pid);
  if(!p)return;
  const allocs=(AppState.data.resourceAllocations||[]).filter(a=>a.projectId===pid&&!a._deleted);
  const logs=(AppState.data.resourceUsageLogs||[]).filter(l=>l.projectId===pid);
  const costs=(AppState.data.costs||[]).filter(c=>c.projectId===pid&&!c._deleted);
  const risks=(AppState.data.risks||[]).filter(r=>r.projectId===pid&&!r._deleted);
  const cur=(AppState.data.settings?.currency)||'PHP';
  const sym={PHP:'₱',USD:'$',EUR:'€',SAR:'﷼',GBP:'£',SGD:'S$'}[cur]||cur+' ';
  const fmt=n=>Number(n||0).toLocaleString();
  const usageMap={};
  logs.forEach(l=>{
    if(!usageMap[l.allocationId])usageMap[l.allocationId]={issued:0,returned:0};
    l.transactionType==='Return'?usageMap[l.allocationId].returned+=l.quantity:usageMap[l.allocationId].issued+=l.quantity;
  });
  const w=window.open('','_blank');
  w.document.write(`<!DOCTYPE html><html><head><title>Project Summary — ${p.id}</title>
  <style>
    body{font-family:Arial,sans-serif;font-size:11px;color:#111;margin:0;padding:20px}
    h1{font-size:18px;margin:0 0 4px}h2{font-size:13px;margin:16px 0 6px;border-bottom:2px solid #333;padding-bottom:3px}
    table{width:100%;border-collapse:collapse;margin-bottom:12px}
    th{background:#1a237e;color:#fff;padding:5px 8px;text-align:left;font-size:10px}
    td{padding:4px 8px;border-bottom:1px solid #ddd;font-size:10px}
    tr:nth-child(even){background:#f5f5f5}
    .grid{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-bottom:14px}
    .kpi{border:1px solid #ccc;border-radius:6px;padding:8px;text-align:center}
    .kpi-val{font-size:16px;font-weight:700;font-family:monospace}
    .kpi-lbl{font-size:9px;color:#666}
    @media print{body{padding:10px}}
  </style></head><body>
  <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:12px">
    <div><h1>${p.name}</h1><div style="font-size:11px;color:#555">${p.id} · ${p.client} · PM: ${p.pm||'—'}</div></div>
    <div style="font-size:10px;color:#777;text-align:right">Printed: ${new Date().toLocaleString()}<br>Status: ${p.status} · Priority: ${p.priority}</div>
  </div>
  <div class="grid">
    <div class="kpi"><div class="kpi-val">${p.progress}%</div><div class="kpi-lbl">Progress</div></div>
    <div class="kpi"><div class="kpi-val">${sym}${fmt(p.budget)}</div><div class="kpi-lbl">Budget</div></div>
    <div class="kpi"><div class="kpi-val">${sym}${fmt(p.spent)}</div><div class="kpi-lbl">Spent</div></div>
    <div class="kpi"><div class="kpi-val">${allocs.length}</div><div class="kpi-lbl">Allocations</div></div>
  </div>
  <h2>Resource Allocations (${allocs.length})</h2>
  <table><thead><tr><th>ID</th><th>Resource</th><th>Type</th><th>Unit</th><th>Alloc.</th><th>Issued</th><th>Returned</th><th>Net</th><th>Remaining</th><th>Planned</th><th>Actual</th></tr></thead><tbody>
  ${allocs.map(a=>{const u=usageMap[a.id]||{issued:0,returned:0};const net=u.issued-u.returned;const rem=a.allocatedQty-net;
    return`<tr><td>${a.id}</td><td>${a.resourceName}</td><td>${a.resourceType}</td><td>${a.unit}</td><td>${a.allocatedQty}</td><td>${u.issued}</td><td>${u.returned}</td><td>${net}</td><td style="color:${rem<0?'red':rem===0?'#e65100':'green'}">${rem}</td><td>${sym}${fmt(a.plannedCost)}</td><td>${sym}${fmt(a.actualCost)}</td></tr>`;
  }).join('')}</tbody></table>
  <h2>Costs (${costs.length})</h2>
  <table><thead><tr><th>ID</th><th>Category</th><th>Description</th><th>Planned</th><th>Actual</th><th>Variance</th></tr></thead><tbody>
  ${costs.map(c=>{const v=c.planned-c.actual;return`<tr><td>${c.id}</td><td>${c.category}</td><td>${c.description}</td><td>${sym}${fmt(c.planned)}</td><td>${sym}${fmt(c.actual)}</td><td style="color:${v<0?'red':'green'}">${sym}${fmt(v)}</td></tr>`;}).join('')}
  </tbody></table>
  <h2>Risks (${risks.length})</h2>
  <table><thead><tr><th>ID</th><th>Description</th><th>Category</th><th>Score</th><th>Status</th><th>Mitigation</th></tr></thead><tbody>
  ${risks.map(r=>`<tr><td>${r.id}</td><td>${r.description||r.title||''}</td><td>${r.category||'—'}</td><td>${(r.probability||1)*(r.impact||1)}</td><td>${r.status}</td><td>${r.mitigation||'—'}</td></tr>`).join('')}
  </tbody></table>
  </body></html>`);
  w.document.close();
  setTimeout(()=>w.print(),500);
}

// ═══════════════════════════════════════════════════════════
// ── PROSPECTS MODULE + EDITABLE PROJECT ID ────────────────
// ═══════════════════════════════════════════════════════════

let prospectSearch = '';
let prospectBUFilter = 'all';


// ── PROJECT DETAIL VIEW ──────────────────────────────────────


// Show ID change history badge if this project had its ID changed
function _renderProjectIdHistoryBadge(currentId){
  const history = (AppState.data.projectIdHistory||[]).filter(h => h.projectId === currentId);
  if (!history.length) return '';
  return `<div style="margin-bottom:12px;padding:8px 12px;background:rgba(56,139,253,.06);border:1px solid rgba(56,139,253,.2);border-radius:7px;font-size:11px;color:var(--text-secondary)">
    <i class="fas fa-history" style="margin-right:5px;color:var(--accent-blue)"></i>
    <strong>ID History:</strong>
    ${history.map(h => `<span style="margin-left:8px;font-family:var(--font-mono)">${h.oldId} → ${h.newId}</span> <span style="color:var(--text-muted)">(${h.changedBy}, ${new Date(h.changedAt).toLocaleDateString()})</span>`).join(' · ')}
  </div>`;
}

function showProjectDetail(id){
// Fix: while viewing project detail, treat it as "actively edited" so polling won't wipe inline edits
if (typeof markRecordEditing === 'function') markRecordEditing('projects', id);
  detailProjectId=id;
  detailTab='overview';
  navigate('projects');
  renderProjectDetail();
}

function renderProjectDetail(){
  const p=(AppState.data.projects||[]).find(x=>x.id===detailProjectId);
  if(!p){renderProjects();return;}
  const tasks=(AppState.data.tasks||[]).filter(t=>t.projectId===p.id&&!t._deleted);
  const costs=(AppState.data.costs||[]).filter(c=>c.projectId===p.id);
  const risks=(AppState.data.risks||[]).filter(r=>r.projectId===p.id);
  const actions=(AppState.data.actions||[]).filter(a=>a.projectId===p.id);
  const docs=(AppState.data.documents||[]).filter(d=>!d._deleted && d.projectId===p.id);
  const qaqc=(AppState.data.qaqc||[]).filter(q=>q.projectId===p.id);
  const totP=costs.reduce((s,c)=>s+c.planned,0);
  const totA=costs.reduce((s,c)=>s+c.actual,0);
  const bu=Math.round((p.spent/p.budget)*100);
  const dl=daysBetween(new Date().toISOString().split('T')[0],p.endDate);
  const tot=daysBetween(p.startDate,p.endDate);
  const te=Math.round(((tot-Math.max(0,dl))/Math.max(1,tot))*100);

  const _rdScore=_projectReadiness(p.id);
  const _rdIcon=_rdScore.overall==='go'?'fa-check-circle':_rdScore.overall==='caution'?'fa-exclamation-triangle':'fa-times-circle';
  const _rdColor=_rdScore.overall==='go'?'var(--accent-green)':_rdScore.overall==='caution'?'var(--accent-amber)':'var(--accent-red)';
  const tabs=[
    {id:'overview',label:'Overview',icon:'fa-info-circle'},
    {id:'readiness',label:'Readiness',icon:_rdIcon,color:_rdColor},
    {id:'tasks',label:`Tasks (${tasks.length})`,icon:'fa-tasks'},
    {id:'resources',label:'Resources',icon:'fa-users'},
    {id:'costs',label:`Costs (${costs.length})`,icon:'fa-dollar-sign'},
    {id:'documents',label:`Documents (${docs.length})`,icon:'fa-folder-open'},
    {id:'qaqc',label:`QA/QC (${qaqc.length})`,icon:'fa-check-double'},
    {id:'risks',label:`Risks (${risks.length})`,icon:'fa-shield-alt'},
    {id:'actions',label:`Actions (${actions.length})`,icon:'fa-clipboard-list'},
    {id:'allocation',label:'Resource Allocation',icon:'fa-chart-bar'},
    {id:'costcontrol',label:'Cost Control',icon:'fa-funnel-dollar'},
    {id:'gantt',label:'Gantt Chart',icon:'fa-stream'},
    {id:'dailylogs',label:`Daily Logs (${(AppState.data.dailyMeetingLogs||[]).filter(l=>l.projectId===p.id).length})`,icon:'fa-clipboard-check'},
  ];

  $('#projects').innerHTML=`
  <!-- Back bar -->
  <div style="display:flex;align-items:center;gap:10px;margin-bottom:16px">
    <button class="btn btn-secondary btn-sm" onclick="if(typeof unmarkRecordEditing==='function')unmarkRecordEditing('projects',detailProjectId);detailProjectId=null;renderProjects()"><i class="fas fa-arrow-left"></i> All Projects</button>
    <div style="display:flex;align-items:center;gap:8px"><span style="font-size:15px;font-family:var(--font-mono);color:var(--accent-blue);font-weight:700;letter-spacing:.3px">${p.id}</span><span style="font-size:11px;color:var(--text-muted)">&rsaquo; Project Detail</span></div>
    <div style="margin-left:auto;display:flex;gap:7px">
      ${sBadge(p.status)} ${pBadge(p.priority)}
      ${p.status==='completed'||p.status==='archived'?'':`<button class="btn btn-secondary btn-sm" onclick="showChangeProjectId('${p.id}')" title="Change Project ID"><i class="fas fa-id-card"></i> Change ID</button>`}
      <button class="btn btn-secondary btn-sm" onclick="printProjectDetail('${p.id}')" title="Print project summary"><i class="fas fa-print"></i> Print</button>
      <button class="btn btn-primary btn-sm" onclick="showProjectForm('${p.id}')"><i class="fas fa-edit"></i> Edit Project</button>
    </div>
  </div>
  ${_renderProjectIdHistoryBadge(p.id)}

  <!-- Hero header -->
  <div style="background:linear-gradient(135deg,#0d2147,#112266);border:1px solid rgba(56,139,253,.25);border-radius:var(--radius);padding:20px;margin-bottom:16px">
    <div style="display:flex;align-items:flex-start;justify-content:space-between;flex-wrap:wrap;gap:12px">
      <div>
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:6px;flex-wrap:wrap">
          <span style="font-size:18px;font-family:var(--font-mono);color:#f59e0b;font-weight:800;letter-spacing:.5px;padding:3px 12px;background:rgba(245,158,11,.15);border:1px solid rgba(245,158,11,.4);border-radius:6px">${p.id}</span>
          <span style="font-size:10px;color:rgba(255,255,255,.6)">${p.discipline||'—'}</span>
          <span style="font-size:10px;color:rgba(255,255,255,.6)">&middot;</span>
          <span style="font-size:10px;color:rgba(255,255,255,.6)">Phase: ${p.phase||'—'}</span>
          ${p.duration||(p.startDate&&p.endDate)?`<span style="font-size:10px;color:rgba(255,255,255,.6)">&middot;</span><span style="font-size:10px;color:rgba(255,255,255,.6)">Duration: ${p.duration||Math.max(1,Math.round((new Date(p.endDate)-new Date(p.startDate))/86400000)+1)} days</span>`:''}
        </div>
        <div style="font-size:22px;font-weight:700;color:#fff;margin-bottom:4px">${p.name}</div>
        <div style="font-size:13px;color:rgba(255,255,255,.7)"><i class="fas fa-building" style="margin-right:6px"></i>${p.client} &nbsp;|&nbsp; <i class="fas fa-map-marker-alt" style="margin-right:6px"></i>${p.location}</div>
      </div>
      <div style="text-align:right">
        <div style="font-size:34px;font-weight:700;font-family:var(--font-mono);color:${pColor(p.progress)}">${p.progress}%</div>
        <div style="font-size:11px;color:rgba(255,255,255,.6)">Physical Progress</div>
      </div>
    </div>
    <div style="display:grid;grid-template-columns:repeat(5,1fr);gap:12px;margin-top:16px;padding-top:16px;border-top:1px solid rgba(255,255,255,.1)">
      ${[
        ['fa-user-tie','Project Manager',p.pm],
        ['fa-calendar-alt','Start Date',p.startDate],
        ['fa-calendar-check','End Date',p.endDate],
        ['fa-dollar-sign','Contract Budget',fmtCur(p.budget)],
        ['fa-clock','Days Remaining',dl<0?'<span style="color:var(--accent-red)">'+Math.abs(dl)+'d overdue</span>':dl+'d left'],
      ].map(([ic,label,val])=>`
      <div>
        <div style="font-size:10px;color:rgba(255,255,255,.5);margin-bottom:3px"><i class="fas ${ic}" style="margin-right:4px"></i>${label}</div>
        <div style="font-size:13px;font-weight:600;color:#fff">${val}</div>
      </div>`).join('')}
    </div>
    <!-- Progress bars -->
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:14px">
      <div>
        <div style="display:flex;justify-content:space-between;margin-bottom:4px"><span style="font-size:10px;color:rgba(255,255,255,.6)">Physical Progress</span><span style="font-size:11px;font-family:var(--font-mono);color:${pColor(p.progress)}">${p.progress}%</span></div>
        <div class="progress-bar" style="height:8px"><div class="progress-fill" style="width:${p.progress}%;background:${pColor(p.progress)};border-radius:4px"></div></div>
      </div>
      <div>
        <div style="display:flex;justify-content:space-between;margin-bottom:4px"><span style="font-size:10px;color:rgba(255,255,255,.6)">Time Elapsed</span><span style="font-size:11px;font-family:var(--font-mono);color:var(--accent-amber)">${te}%</span></div>
        <div class="progress-bar" style="height:8px"><div class="progress-fill" style="width:${te}%;background:var(--accent-amber);border-radius:4px"></div></div>
      </div>
    </div>
  </div>

  <!-- Summary stats row -->
  <div class="grid grid-4" style="margin-bottom:16px">
    ${sc('fas fa-tasks','Total Tasks',tasks.length,tasks.filter(t=>t.status==='done').length+' completed','#388bfd','rgba(56,139,253,.15)')}
    ${sc('fas fa-dollar-sign','Budget Spent',fmtNum(p.spent),bu+'% of '+fmtNum(p.budget),'#f0a450','rgba(240,164,80,.15)')}
    ${sc('fas fa-exclamation-triangle','Active Risks',risks.filter(r=>r.status==='active').length,'Risk exposure','#f85149','rgba(248,81,73,.15)')}
    ${sc('fas fa-check-double','Open NCRs',qaqc.filter(q=>q.type==='NCR'&&q.status==='open').length,'Quality issues','#bc8cff','rgba(188,140,255,.15)')}
  </div>

  <!-- Tabs -->
  <div class="tabs" style="margin-bottom:16px">
    ${tabs.map(t=>`<div class="tab ${detailTab===t.id?'active':''}" onclick="detailTab='${t.id}';renderDetailTab()"><i class="fas ${t.icon}" style="margin-right:5px${t.color?';color:'+t.color:''}"></i>${t.label}</div>`).join('')}
  </div>
  <div id="detailTabContent"></div>`;

  renderDetailTab();
}

function renderDetailTab(){
  const map={
    overview:renderDetailOverview,
    readiness:renderDetailReadiness,
    tasks:renderDetailTasks,
    resources:renderDetailResources,
    costs:renderDetailCosts,
    documents:renderDetailDocs,
    qaqc:renderDetailQAQC,
    risks:renderDetailRisks,
    actions:renderDetailActions,
    allocation:renderDetailAllocation,
    costcontrol:renderDetailCostControl,
    gantt:renderDetailGantt,
    dailylogs:()=>{ $('#detailTabContent').innerHTML=`<div class="card" id="dmLogsTab">${renderProjectDailyLogs(detailProjectId)}</div>`; },
  };
  const fn=map[detailTab];
  if(!fn){$('#detailTabContent').innerHTML=`<div class="card" style="padding:24px;text-align:center;color:var(--text-muted)">Tab "${detailTab}" not found.</div>`;return;}
  try{fn();}catch(e){
    console.error('renderDetailTab error in tab "'+detailTab+'":', e);
    $('#detailTabContent').innerHTML=`<div class="card" style="padding:20px;border-left:3px solid var(--accent-red)">
      <div style="font-size:13px;font-weight:600;color:var(--accent-red);margin-bottom:8px"><i class="fas fa-exclamation-triangle" style="margin-right:7px"></i>Error loading tab</div>
      <div style="font-size:11px;font-family:var(--font-mono);color:var(--text-secondary)">${e.message}</div>
      <button class="btn btn-secondary btn-sm" style="margin-top:10px" onclick="renderDetailTab()"><i class="fas fa-redo"></i> Retry</button>
    </div>`;
  }
}


// ── PROJECT READINESS SCORING ENGINE ─────────────────────
function _projectReadiness(pid){
  const today=new Date().toISOString().split('T')[0];
  const soon=new Date();soon.setDate(soon.getDate()+30);const soonStr=soon.toISOString().split('T')[0];
  const allocs=(AppState.data.resourceAllocations||[]).filter(a=>a.projectId===pid&&!a._deleted);
  const resources=AppState.data.resources||[];
  const equipment=AppState.data.equipment||[];
  const tools=AppState.data.tools||[];
  const vehicles=AppState.data.vehicles||[];
  const allMaterials=AppState.data.materials||[];
  const allConsumables=AppState.data.consumables||[];
  const docs=(AppState.data.documents||[]).filter(d=>d.projectId===pid&&!d._deleted);
  const manpower=(AppState.data.manpower||[]).filter(m=>m.projectId===pid&&!m._deleted);
  const procurement=(AppState.data.procurement||[]).filter(po=>po.projectId===pid&&!po._deleted);

  const checks=[];

  // ── CHECK 1: Personnel Availability ──────────────────────
  const personnelAllocs=allocs.filter(a=>a.resourceType==='Personnel'||a.resourceType==='Resource'||(!a.resourceType&&a.resourceId&&a.resourceId.startsWith('RES')));
  const personnelItems=[];
  personnelAllocs.forEach(a=>{
    const res=resources.find(r=>r.id===a.resourceId);
    if(!res)return;
    const avail=res.availability||'available';
    personnelItems.push({name:res.name,role:res.role,avail,status:avail==='available'?'go':avail==='busy'?'warn':'fail',detail:avail==='available'?'Available':'Currently '+avail,link:`masterlist`});
  });
  const pFail=personnelItems.filter(i=>i.status==='fail').length;
  const pWarn=personnelItems.filter(i=>i.status==='warn').length;
  checks.push({id:'personnel',icon:'fa-users',label:'Personnel Availability',
    status:pFail>0?'fail':pWarn>0?'warn':'go',
    summary:personnelItems.length===0?'No personnel allocated':`${personnelItems.filter(i=>i.status==='go').length}/${personnelItems.length} available`,
    items:personnelItems,emptyMsg:'No personnel allocations found for this project.'});

  // ── CHECK 2: Certifications & Calibration ────────────────
  const certItems=[];
  personnelAllocs.forEach(a=>{
    const res=resources.find(r=>r.id===a.resourceId);
    if(!res||!res.certExpiry)return;
    const exp=res.certExpiry;
    const st=exp<today?'fail':exp<=soonStr?'warn':'go';
    certItems.push({name:res.name,detail:`Cert expiry: ${exp}`,status:st,link:'masterlist'});
  });
  const eqAllocs=allocs.filter(a=>a.resourceType==='Equipment'||(a.resourceId&&a.resourceId.startsWith('EQP')));
  eqAllocs.forEach(a=>{
    const eq=equipment.find(e=>e.id===a.resourceId);
    if(!eq)return;
    if(eq.nextCalibration){const st=eq.nextCalibration<today?'fail':eq.nextCalibration<=soonStr?'warn':'go';certItems.push({name:eq.name||eq.description,detail:`Calibration due: ${eq.nextCalibration}`,status:st,link:'masterlist'});}
    if(eq.nextMaintenance){const st=eq.nextMaintenance<today?'fail':eq.nextMaintenance<=soonStr?'warn':'go';certItems.push({name:eq.name||eq.description,detail:`Maintenance due: ${eq.nextMaintenance}`,status:st,link:'masterlist'});}
  });
  const cFail=certItems.filter(i=>i.status==='fail').length;
  const cWarn=certItems.filter(i=>i.status==='warn').length;
  checks.push({id:'certs',icon:'fa-certificate',label:'Certifications & Calibration',
    status:cFail>0?'fail':cWarn>0?'warn':'go',
    summary:certItems.length===0?'No expiry data':cFail>0?`${cFail} expired`:cWarn>0?`${cWarn} expiring soon`:'All valid',
    items:certItems,emptyMsg:'No certification or calibration data found for allocated resources.'});

  // ── CHECK 3: Equipment / Tool / Vehicle Condition ─────────
  const assetItems=[];
  allocs.forEach(a=>{
    const id=a.resourceId||'';
    let asset=null,type='';
    if(id.startsWith('EQP')||a.resourceType==='Equipment'){asset=equipment.find(e=>e.id===id);type='Equipment';}
    else if(id.startsWith('TOL')||a.resourceType==='Tool'){asset=tools.find(t=>t.id===id);type='Tool';}
    else if(id.startsWith('VEH')||a.resourceType==='Vehicle'){asset=vehicles.find(v=>v.id===id);type='Vehicle';}
    if(!asset)return;
    const st=asset.status==='available'?'go':asset.status==='standby'?'warn':'fail';
    assetItems.push({name:asset.name||asset.description||id,detail:`${type} · Status: ${asset.status||'unknown'}`,status:st,link:'masterlist'});
  });
  const aFail=assetItems.filter(i=>i.status==='fail').length;
  const aWarn=assetItems.filter(i=>i.status==='warn').length;
  checks.push({id:'assets',icon:'fa-tools',label:'Equipment & Tools',
    status:aFail>0?'fail':aWarn>0?'warn':'go',
    summary:assetItems.length===0?'No assets allocated':`${assetItems.filter(i=>i.status==='go').length}/${assetItems.length} available`,
    items:assetItems,emptyMsg:'No equipment, tool, or vehicle allocations found for this project.'});

  // ── CHECK 4: Materials & Consumables — Warehouse Sufficiency ──
  // Uses warehouse module: compares allocatedQty vs live qtyAvailable per warehouse item
  const matAllocItems=[];
  const whItems=AppState.data.warehouseItems||[];
  allocs.filter(a=>a.resourceType==='Material'||a.resourceType==='Consumable').forEach(a=>{
    const needed=a.allocatedQty||0;
    // Try warehouse first, fall back to old masterlist arrays
    // Match by warehouse item's own id OR by itemMasterId (enrolled from Item Master)
    const whItem=whItems.find(w=>!w._deleted&&(w.id===a.resourceId||w.itemMasterId===a.resourceId));
    let unit,qtyAvail,qtyOnHand,st,detail;
    if(whItem){
      const q=(typeof _whCalcQty==='function')?_whCalcQty(whItem.id):{qtyOnHand:whItem.qtyOnHand||0,qtyAvailable:whItem.qtyAvailable||0};
      qtyOnHand=q.qtyOnHand; qtyAvail=q.qtyAvailable; unit=a.unit||whItem.unit||'';
      if(qtyAvail>=needed){st='go';detail=`Available: ${qtyAvail} ${unit} · Needed: ${needed} ${unit} ✓`;}
      else if(qtyAvail>0){st='warn';detail=`Available: ${qtyAvail} ${unit} · Needed: ${needed} ${unit} — SHORT by ${needed-qtyAvail} ${unit}`;}
      else{st='fail';detail=`Available: 0 ${unit} · Needed: ${needed} ${unit} — NOT IN WAREHOUSE`;}
    } else {
      // fallback to old masterlist
      const warehouseList=a.resourceType==='Consumable'?allConsumables:allMaterials;
      const wh=warehouseList.find(m=>m.id===a.resourceId);
      unit=a.unit||wh?.unit||'';
      qtyOnHand=wh?.qtyOnHand||0;
      if(!wh){st='warn';detail=`Not found in warehouse · Need: ${needed} ${unit}`;}
      else if(qtyOnHand>=needed){st='go';detail=`On hand: ${qtyOnHand} ${unit} · Needed: ${needed} ${unit} ✓`;}
      else if(qtyOnHand>0){st='warn';detail=`On hand: ${qtyOnHand} ${unit} · Needed: ${needed} ${unit} — SHORT by ${needed-qtyOnHand} ${unit}`;}
      else{st='fail';detail=`On hand: 0 ${unit} · Need: ${needed} ${unit} — NOT AVAILABLE`;}
    }
    matAllocItems.push({name:a.resourceName,detail,status:st,type:a.resourceType,link:'warehouse'});
  });
  const m4Fail=matAllocItems.filter(i=>i.status==='fail').length;
  const m4Warn=matAllocItems.filter(i=>i.status==='warn').length;
  checks.push({id:'materials',icon:'fa-cubes',label:'Materials & Consumables',
    status:m4Fail>0?'fail':m4Warn>0?'warn':matAllocItems.length===0?'warn':'go',
    summary:matAllocItems.length===0?'No materials/consumables in allocation':m4Fail>0?`${m4Fail} item(s) unavailable in warehouse`:m4Warn>0?`${m4Warn} item(s) insufficient`:'All items available in warehouse',
    items:matAllocItems,emptyMsg:'Add Material or Consumable items in Resource Allocation, then add them to the Warehouse module to check live stock.'});

  // ── CHECK 7: Procurement Status ──────────────────────────
  const poItems=procurement.map(po=>{
    const st=po.status==='delivered'||po.status==='closed'||po.status==='active'?'go':po.status==='partial'||po.status==='po_issued'||po.status==='ordered'?'warn':'fail';
    const overdueFlag=po.deliveryDate&&po.deliveryDate<today&&po.status!=='delivered'&&po.status!=='closed';
    const finalSt=overdueFlag?'fail':st;
    return{name:po.description||po.id,detail:`${po.vendor||'No vendor'} · Status: ${po.status||'pending'}${po.deliveryDate?' · Due: '+po.deliveryDate:''}${overdueFlag?' ⚠ Overdue':''}`,status:finalSt,link:'procurement'};
  });
  const po7Fail=poItems.filter(i=>i.status==='fail').length;
  const po7Warn=poItems.filter(i=>i.status==='warn').length;
  checks.push({id:'procurement',icon:'fa-shopping-cart',label:'Procurement',
    status:po7Fail>0?'fail':po7Warn>0?'warn':poItems.length===0?'warn':'go',
    summary:poItems.length===0?'No POs raised for this project':po7Fail>0?`${po7Fail} PO(s) overdue/blocked`:po7Warn>0?`${po7Warn} PO(s) in progress`:`All ${poItems.length} PO(s) on track`,
    items:poItems,emptyMsg:'No procurement orders found for this project.'});

  // ── CHECK 5: Required Documents Approved ─────────────────
  const reqTypes=['Method Statement','ITP','Safety Plan','Work Permit','Risk Assessment'];
  const docItems=docs.map(d=>{
    const isReq=reqTypes.some(rt=>d.name&&d.name.toLowerCase().includes(rt.toLowerCase()));
    const st=d.status==='approved'?'go':d.status==='review'?'warn':'fail';
    return{name:d.name,detail:`Status: ${d.status||'draft'}${isReq?' · Required doc':''}`,status:st,isReq,link:'documents'};
  });
  const reqDocs=docItems.filter(i=>i.isReq);
  const dFail=reqDocs.filter(i=>i.status==='fail').length;
  const dWarn=reqDocs.filter(i=>i.status==='warn').length;
  const allDocStatus=dFail>0?'fail':dWarn>0?'warn':reqDocs.length===0&&docs.length===0?'warn':'go';
  checks.push({id:'documents',icon:'fa-file-check',label:'Documents Approved',
    status:allDocStatus,
    summary:docs.length===0?'No documents uploaded':dFail>0?`${dFail} required doc(s) not approved`:dWarn>0?`${dWarn} under review`:'All key docs approved',
    items:docItems,emptyMsg:'No documents found for this project.'});

  // ── CHECK 6: Manpower Headcount ──────────────────────────
  const mpItems=manpower.map(m=>{
    const planned=m.planned||m.plannedHeadcount||0;
    const actual=m.actual||m.actualHeadcount||0;
    const ratio=planned>0?actual/planned:actual>0?1:0;
    const st=planned===0?'warn':ratio>=0.8?'go':ratio>=0.5?'warn':'fail';
    return{name:`Week ${m.week||'?'} · ${m.trade||'General'}`,detail:`Planned: ${planned} · Actual: ${actual} (${Math.round(ratio*100)}%)`,status:st,link:'manpower'};
  });
  const mpFail=mpItems.filter(i=>i.status==='fail').length;
  const mpWarn=mpItems.filter(i=>i.status==='warn').length;
  checks.push({id:'manpower',icon:'fa-hard-hat',label:'Manpower Headcount',
    status:mpFail>0?'fail':mpWarn>0?'warn':mpItems.length===0?'warn':'go',
    summary:mpItems.length===0?'No manpower records':mpFail>0?`${mpFail} week(s) critically short`:mpWarn>0?`${mpWarn} week(s) below target`:'Headcount on target',
    items:mpItems,emptyMsg:'No manpower records for this project.'});

  // ── Overall Score ────────────────────────────────────────
  const fails=checks.filter(c=>c.status==='fail').length;
  const warns=checks.filter(c=>c.status==='warn').length;
  const overall=fails>0?'notready':warns>0?'caution':'go';
  return{checks,overall,fails,warns};
}

// ── PROJECT DETAIL: READINESS TAB ────────────────────────
function renderDetailReadiness(){
  const pid=detailProjectId;
  const rd=_projectReadiness(pid);
  const overallCfg={
    go:{color:'var(--accent-green)',bg:'rgba(63,185,80,.12)',icon:'fa-check-circle',label:'GO — Ready to Execute'},
    caution:{color:'var(--accent-amber)',bg:'rgba(240,164,80,.12)',icon:'fa-exclamation-triangle',label:'Caution — Minor Issues'},
    notready:{color:'var(--accent-red)',bg:'rgba(248,81,73,.12)',icon:'fa-times-circle',label:'Not Ready — Blockers Present'},
  }[rd.overall];

  const statusIcon=s=>s==='go'?'<i class="fas fa-check-circle" style="color:var(--accent-green)"></i>':s==='warn'?'<i class="fas fa-exclamation-triangle" style="color:var(--accent-amber)"></i>':'<i class="fas fa-times-circle" style="color:var(--accent-red)"></i>';
  const statusColor=s=>s==='go'?'var(--accent-green)':s==='warn'?'var(--accent-amber)':'var(--accent-red)';
  const statusBg=s=>s==='go'?'rgba(63,185,80,.08)':s==='warn'?'rgba(240,164,80,.08)':'rgba(248,81,73,.08)';
  const statusBorder=s=>s==='go'?'rgba(63,185,80,.3)':s==='warn'?'rgba(240,164,80,.3)':'rgba(248,81,73,.3)';

  let html=`
  <div style="padding:16px 20px;border-radius:10px;background:${overallCfg.bg};border:1px solid ${overallCfg.color}44;margin-bottom:16px;display:flex;align-items:center;gap:14px">
    <i class="fas ${overallCfg.icon}" style="font-size:28px;color:${overallCfg.color};flex-shrink:0"></i>
    <div>
      <div style="font-size:16px;font-weight:700;color:${overallCfg.color}">${overallCfg.label}</div>
      <div style="font-size:12px;color:var(--text-secondary);margin-top:2px">${rd.fails} blocker${rd.fails!==1?'s':''} · ${rd.warns} caution${rd.warns!==1?'s':''} · ${rd.checks.filter(c=>c.status==='go').length} checks passed</div>
    </div>
    <button class="btn btn-secondary btn-sm" style="margin-left:auto" onclick="renderDetailReadiness()"><i class="fas fa-sync-alt"></i> Refresh</button>
  </div>
  <div style="display:grid;grid-template-columns:repeat(2,1fr);gap:12px">`;

  rd.checks.forEach(ch=>{
    const expanded=`_rdExpanded_${ch.id}`;
    const isOpen=window[expanded]||false;
    html+=`
    <div style="background:var(--bg-card);border:1px solid ${statusBorder(ch.status)};border-radius:10px;overflow:hidden">
      <div style="padding:12px 14px;cursor:pointer;display:flex;align-items:center;gap:10px;background:${statusBg(ch.status)}" onclick="window._rdExpanded_${ch.id}=!window._rdExpanded_${ch.id};renderDetailReadiness()">
        <i class="fas ${ch.icon}" style="color:${statusColor(ch.status)};font-size:15px;width:18px;flex-shrink:0"></i>
        <div style="flex:1;min-width:0">
          <div style="font-size:12px;font-weight:700;color:var(--text-primary)">${ch.label}</div>
          <div style="font-size:10px;color:${statusColor(ch.status)};margin-top:1px">${ch.summary}</div>
        </div>
        ${statusIcon(ch.status)}
        <i class="fas fa-chevron-${isOpen?'up':'down'}" style="color:var(--text-muted);font-size:10px;margin-left:4px"></i>
      </div>
      ${isOpen?`<div style="padding:10px 14px;border-top:1px solid var(--border)">
        ${ch.items.length===0?`<div style="font-size:11px;color:var(--text-muted);text-align:center;padding:8px 0">${ch.emptyMsg}</div>`:`
        <div style="display:flex;flex-direction:column;gap:5px">
          ${ch.items.map(item=>`
          <div style="display:flex;align-items:flex-start;gap:8px;padding:6px 8px;border-radius:6px;background:${statusBg(item.status)};border:1px solid ${statusBorder(item.status)}">
            ${statusIcon(item.status)}
            <div style="flex:1;min-width:0">
              <div style="font-size:11px;font-weight:600;color:var(--text-primary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${item.name}</div>
              <div style="font-size:10px;color:var(--text-secondary);margin-top:1px">${item.detail}</div>
            </div>
            ${item.status!=='go'?`<button class="btn btn-secondary btn-sm" style="height:22px;font-size:9px;padding:0 7px;flex-shrink:0" onclick="navigate('${item.link||'masterlist'}')">Fix</button>`:''}
          </div>`).join('')}
        </div>`}
      </div>`:''}
    </div>`;
  });

  html+=`</div>`;
  $('#detailTabContent').innerHTML=html;
}

// ── PROJECT DETAIL: OVERVIEW ──────────────────────────────
function renderDetailOverview(){
  const p=(AppState.data.projects||[]).find(x=>x.id===detailProjectId);
  if(!p)return;
  const pid=p.id;
  const tasks=(AppState.data.tasks||[]).filter(t=>t.projectId===pid);
  const allocs=(AppState.data.resourceAllocations||[]).filter(a=>a.projectId===pid);
  const team=(AppState.data.projectTeam||[]).filter(m=>m.projectId===pid);
  const risks=(AppState.data.risks||[]).filter(r=>r.projectId===pid);
  const actions=(AppState.data.actions||[]).filter(a=>a.projectId===pid);
  const docs=(AppState.data.documents||[]).filter(d=>d.projectId===pid);
  const qaqc=(AppState.data.qaqc||[]).filter(q=>q.projectId===pid);
  const logs=(AppState.data.resourceUsageLogs||[]).filter(l=>l.projectId===pid);
  const costs=(AppState.data.costs||[]).filter(c=>c.projectId===pid);
  const procurement=(AppState.data.procurement||[]).filter(po=>po.projectId===pid);

  const done=tasks.filter(t=>t.status==='done').length;
  const inprog=tasks.filter(t=>t.status==='in-progress'||t.status==='inprogress').length;
  const today=new Date().toISOString().split('T')[0];
  const dl=daysBetween(today,p.endDate);
  const tot=daysBetween(p.startDate,p.endDate);
  const te=tot>0?Math.min(100,Math.round((daysBetween(p.startDate,today)/tot)*100)):0;
  const bu=Math.round((p.spent/Math.max(p.budget,1))*100);
  const poTotal=procurement.reduce((s,po)=>s+po.amount,0);
  const allocCost=allocs.reduce((s,a)=>s+a.plannedCost,0);
  const totCost=costs.reduce((s,c)=>s+c.planned,0);
  const totActual=costs.reduce((s,c)=>s+c.actual,0);
  const overdueTasks=tasks.filter(t=>t.dueDate&&isOverdue(t.dueDate)&&t.status!=='done');
  const lowStock=(AppState.data.consumables||[]).filter(c=>c.projectId===pid&&c.qtyOnHand<=c.minStock);
  const statusBadgeMap={available:'badge-green',active:'badge-green','in-stock':'badge-green',delivered:'badge-green','in-use':'badge-blue',maintenance:'badge-red','out-of-service':'badge-red','low-stock':'badge-amber',pending:'badge-amber',standby:'badge-gray','on-hold':'badge-gray',completed:'badge-purple',planned:'badge-purple'};

  let html=`
  <div style="display:grid;grid-template-columns:repeat(5,1fr);gap:10px;margin-bottom:16px">
    <div class="stat-card" style="border-left:3px solid var(--accent-blue)">
      <div class="stat-icon" style="background:rgba(56,139,253,.15)"><i class="fas fa-tasks" style="color:var(--accent-blue)"></i></div>
      <div class="stat-info"><div class="label">Tasks</div><div class="value" style="color:var(--accent-blue)">${tasks.length}</div>
      <div style="font-size:9px;color:var(--text-secondary)">${done} done &middot; ${inprog} active</div></div>
    </div>
    <div class="stat-card" style="border-left:3px solid ${dl<0?'var(--accent-red)':'var(--accent-amber)'}">
      <div class="stat-icon" style="background:rgba(240,164,80,.15)"><i class="fas fa-calendar-check" style="color:${dl<0?'var(--accent-red)':'var(--accent-amber)'}"></i></div>
      <div class="stat-info"><div class="label">Days Remaining</div><div class="value" style="color:${dl<0?'var(--accent-red)':'var(--accent-amber)'}">${dl<0?Math.abs(dl)+' overdue':dl}</div>
      <div style="font-size:9px;color:var(--text-secondary)">${te}% time elapsed</div></div>
    </div>
    <div class="stat-card" style="border-left:3px solid ${bu>90?'var(--accent-red)':'var(--accent-green)'}">
      <div class="stat-icon" style="background:rgba(63,185,80,.15)"><i class="fas fa-dollar-sign" style="color:${bu>90?'var(--accent-red)':'var(--accent-green)'}"></i></div>
      <div class="stat-info"><div class="label">Budget Used</div><div class="value" style="font-size:15px;color:${bu>90?'var(--accent-red)':'var(--accent-green)'}">${bu}%</div>
      <div style="font-size:9px;color:var(--text-secondary)">&#8369;${fmtNum(p.spent)} / &#8369;${fmtNum(p.budget)}</div></div>
    </div>
    <div class="stat-card" style="border-left:3px solid var(--accent-red)">
      <div class="stat-icon" style="background:rgba(248,81,73,.15)"><i class="fas fa-shield-alt" style="color:var(--accent-red)"></i></div>
      <div class="stat-info"><div class="label">Active Risks</div><div class="value" style="color:var(--accent-red)">${risks.filter(r=>r.status==='active').length}</div>
      <div style="font-size:9px;color:var(--text-secondary)">${risks.length} total</div></div>
    </div>
    <div class="stat-card" style="border-left:3px solid #bc8cff">
      <div class="stat-icon" style="background:rgba(188,140,255,.15)"><i class="fas fa-users" style="color:#bc8cff"></i></div>
      <div class="stat-info"><div class="label">Team / Allocs</div><div class="value" style="color:#bc8cff">${team.length}</div>
      <div style="font-size:9px;color:var(--text-secondary)">${allocs.length} allocated items</div></div>
    </div>
  </div>

  <div class="grid grid-2" style="margin-bottom:16px">
    <div class="card">
      <div style="font-size:14px;font-weight:600;margin-bottom:14px"><i class="fas fa-edit" style="color:var(--accent-blue);margin-right:7px"></i>Project Information</div>
      <div class="form-grid">
        <div class="form-group"><label class="form-label">Project ID</label><input class="form-input" id="dp_id" value="${p.id}" readonly style="opacity:.6;font-family:var(--font-mono)"></div>
        <div class="form-group"><label class="form-label">Project Name</label><input class="form-input" id="dp_name" value="${(p.name||'').replace(/"/g,'&quot;')}"></div>
        <div class="form-group"><label class="form-label">Client</label><input class="form-input" id="dp_client" value="${(p.client||'').replace(/"/g,'&quot;')}"></div>
        <div class="form-group"><label class="form-label">Location</label><input class="form-input" id="dp_loc" value="${(p.location||'').replace(/"/g,'&quot;')}"></div>
        <div class="form-group"><label class="form-label">Project Manager</label><input class="form-input" id="dp_pm" value="${(p.pm||'').replace(/"/g,'&quot;')}"></div>
        <div class="form-group"><label class="form-label">Discipline</label><input class="form-input" id="dp_disc" value="${(p.discipline||'').replace(/"/g,'&quot;')}"></div>
        <div class="form-group"><label class="form-label">Phase</label><input class="form-input" id="dp_phase" value="${(p.phase||'').replace(/"/g,'&quot;')}"></div>
        <div class="form-group"><label class="form-label">Status</label><select class="form-select" id="dp_status">${['active','planned','completed','on-hold'].map(s=>`<option value="${s}" ${p.status===s?'selected':''}>${s}</option>`).join('')}</select></div>
        <div class="form-group"><label class="form-label">Priority</label><select class="form-select" id="dp_priority">${['critical','high','medium','low'].map(s=>`<option value="${s}" ${p.priority===s?'selected':''}>${s}</option>`).join('')}</select></div>
        <div class="form-group"><label class="form-label">Risk Level</label><select class="form-select" id="dp_risk">${['low','medium','high'].map(r=>`<option value="${r}" ${p.riskLevel===r?'selected':''}>${r}</option>`).join('')}</select></div>
        <div class="form-group"><label class="form-label">Start Date</label><input class="form-input" type="date" id="dp_start" value="${safeDate(p.startDate)}"></div>
        <div class="form-group"><label class="form-label">End Date</label><input class="form-input" type="date" id="dp_end" value="${safeDate(p.endDate)}"></div>
        <div class="form-group"><label class="form-label">Contract Budget (&#8369;)</label><input class="form-input" type="number" id="dp_budget" value="${p.budget||0}"></div>
        <div class="form-group"><label class="form-label">Amount Spent (&#8369;)</label><input class="form-input" type="number" id="dp_spent" value="${p.spent||0}"></div>
        <div class="form-group"><label class="form-label">Physical Progress %</label><input class="form-input" type="number" id="dp_prog" value="${p.progress||0}" min="0" max="100"></div>
      </div>
      <div class="form-group" style="margin-top:8px"><label class="form-label">Description</label>
        <textarea class="form-textarea" id="dp_desc" style="min-height:80px">${(p.description||'').replace(/</g,'&lt;').replace(/>/g,'&gt;')}</textarea>
      </div>
      <div style="display:flex;gap:8px;margin-top:12px">
        <button class="btn btn-primary" onclick="saveDetailOverview()"><i class="fas fa-save"></i> Save Changes</button>
        <button class="btn btn-secondary" onclick="showProjectDetail('${pid}')"><i class="fas fa-undo"></i> Discard</button>
      </div>
    </div>
    <div>
      <div class="card" style="margin-bottom:12px">
        <div style="font-size:13px;font-weight:600;margin-bottom:12px"><i class="fas fa-chart-line" style="color:var(--accent-amber);margin-right:7px"></i>Progress Overview</div>
        <div style="margin-bottom:10px">
          <div style="display:flex;justify-content:space-between;margin-bottom:4px"><span style="font-size:11px;color:var(--text-secondary)">Physical Progress</span><span style="font-size:13px;font-weight:700;font-family:var(--font-mono);color:${pColor(p.progress)}">${p.progress}%</span></div>
          <div class="progress-bar" style="height:10px"><div class="progress-fill" style="width:${p.progress}%;background:${pColor(p.progress)};border-radius:5px"></div></div>
        </div>
        <div style="margin-bottom:10px">
          <div style="display:flex;justify-content:space-between;margin-bottom:4px"><span style="font-size:11px;color:var(--text-secondary)">Time Elapsed</span><span style="font-size:13px;font-weight:700;font-family:var(--font-mono);color:var(--accent-amber)">${te}%</span></div>
          <div class="progress-bar" style="height:10px"><div class="progress-fill" style="width:${te}%;background:var(--accent-amber);border-radius:5px"></div></div>
        </div>
        <div style="margin-bottom:10px">
          <div style="display:flex;justify-content:space-between;margin-bottom:4px"><span style="font-size:11px;color:var(--text-secondary)">Task Completion</span><span style="font-size:13px;font-weight:700;font-family:var(--font-mono);color:var(--accent-green)">${tasks.length>0?Math.round(done/tasks.length*100):0}%</span></div>
          <div class="progress-bar" style="height:10px"><div class="progress-fill" style="width:${tasks.length>0?Math.round(done/tasks.length*100):0}%;background:var(--accent-green);border-radius:5px"></div></div>
        </div>
        <div style="margin-bottom:10px">
          <div style="display:flex;justify-content:space-between;margin-bottom:4px"><span style="font-size:11px;color:var(--text-secondary)">Budget Utilized</span><span style="font-size:13px;font-weight:700;font-family:var(--font-mono);color:${bu>90?'var(--accent-red)':bu>75?'var(--accent-amber)':'var(--accent-green)'}">${bu}%</span></div>
          <div class="progress-bar" style="height:10px"><div class="progress-fill" style="width:${Math.min(100,bu)}%;background:${bu>90?'var(--accent-red)':bu>75?'var(--accent-amber)':'var(--accent-green)'};border-radius:5px"></div></div>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;padding-top:10px;border-top:1px solid var(--border)">
          <div><div style="font-size:10px;color:var(--text-secondary)">Start Date</div><div style="font-size:12px;font-weight:600;font-family:var(--font-mono)">${p.startDate}</div></div>
          <div><div style="font-size:10px;color:var(--text-secondary)">End Date</div><div style="font-size:12px;font-weight:600;font-family:var(--font-mono);color:${dl<0?'var(--accent-red)':'inherit'}">${p.endDate}</div></div>
        </div>
      </div>
      <div class="card">
        <div style="font-size:13px;font-weight:600;margin-bottom:12px"><i class="fas fa-dollar-sign" style="color:var(--accent-green);margin-right:7px"></i>Financial Summary</div>`;

  [['Contract Budget','&#8369;'+fmtNum(p.budget),'var(--text-primary)'],
   ['Amount Spent','&#8369;'+fmtNum(p.spent),bu>90?'var(--accent-red)':bu>75?'var(--accent-amber)':'var(--accent-green)'],
   ['Remaining','&#8369;'+fmtNum(p.budget-p.spent),(p.budget-p.spent)<0?'var(--accent-red)':'var(--accent-green)'],
   ['Cost Breakdown (Planned)','&#8369;'+fmtNum(totCost),'var(--text-secondary)'],
   ['Cost Breakdown (Actual)','&#8369;'+fmtNum(totActual),totActual>totCost?'var(--accent-red)':'var(--accent-green)'],
   ['PO Committed','&#8369;'+fmtNum(poTotal),'var(--accent-blue)'],
   ['Resource Allocation','&#8369;'+fmtNum(allocCost),'#bc8cff'],
  ].forEach(([l,v,c])=>{
    html+=`<div style="display:flex;justify-content:space-between;padding:7px 0;border-bottom:1px solid var(--border)">
      <span style="font-size:11px;color:var(--text-secondary)">${l}</span>
      <span style="font-size:12px;font-weight:700;font-family:var(--font-mono);color:${c}">${v}</span>
    </div>`;
  });

  html+=`</div></div></div>`;

  // ── BUDGET CONTROL CARD ───────────────────────────────────────
  (()=>{
    const matAllocs=allocs.filter(a=>!a._deleted&&a.resourceType==='Material');
    const conAllocs=allocs.filter(a=>!a._deleted&&a.resourceType==='Consumable');
    const matBudget=matAllocs.reduce((s,a)=>s+(a.plannedCost||0),0);
    const conBudget=conAllocs.reduce((s,a)=>s+(a.plannedCost||0),0);
    const totalBudget=matBudget+conBudget;
    const matPO=procurement.filter(po=>po.category==='Materials'&&po.status!=='cancelled').reduce((s,po)=>s+(po.budgetAmount||0),0);
    const conPO=procurement.filter(po=>po.category==='Consumables'&&po.status!=='cancelled').reduce((s,po)=>s+(po.budgetAmount||0),0);
    const totalPO=matPO+conPO;
    const whFn=typeof _whActualIssueCost==='function';
    const matIssued=whFn?matAllocs.reduce((s,a)=>s+_whActualIssueCost(pid,a.resourceId),0):0;
    const conIssued=whFn?conAllocs.reduce((s,a)=>s+_whActualIssueCost(pid,a.resourceId),0):0;
    const totalIssued=matIssued+conIssued;
    const varMat=matBudget-matPO;
    const varCon=conBudget-conPO;
    const varTot=totalBudget-totalPO;
    const varMatA=matBudget-matIssued;
    const varConA=conBudget-conIssued;
    const varTotA=totalBudget-totalIssued;
    const vc=v=>v<0?'var(--accent-red)':v===0?'var(--text-secondary)':'var(--accent-green)';
    const vi=v=>v<0?'▼':'▲';
    const poUtilPct=totalBudget>0?Math.min(100,Math.round(totalPO/totalBudget*100)):0;
    const whUtilPct=totalBudget>0?Math.min(100,Math.round(totalIssued/totalBudget*100)):0;
    html+=`
  <div class="card" style="margin-bottom:16px">
    <div style="font-size:13px;font-weight:600;margin-bottom:14px"><i class="fas fa-balance-scale" style="color:#bc8cff;margin-right:7px"></i>Budget Control <span style="font-size:11px;font-weight:400;color:var(--text-secondary)">Materials &amp; Consumables</span></div>
    <div style="overflow-x:auto">
    <table style="width:100%;border-collapse:collapse;font-size:11px">
      <thead>
        <tr style="border-bottom:2px solid var(--border)">
          <th style="text-align:left;padding:6px 8px;color:var(--text-secondary);font-weight:600">Category</th>
          <th style="text-align:right;padding:6px 8px;color:var(--text-secondary);font-weight:600">Alloc. Budget</th>
          <th style="text-align:right;padding:6px 8px;color:var(--text-secondary);font-weight:600">PO Committed</th>
          <th style="text-align:right;padding:6px 8px;color:var(--text-secondary);font-weight:600">PO Variance</th>
          <th style="text-align:right;padding:6px 8px;color:var(--text-secondary);font-weight:600">WH Issued</th>
          <th style="text-align:right;padding:6px 8px;color:var(--text-secondary);font-weight:600">WH Variance</th>
        </tr>
      </thead>
      <tbody>
        <tr style="border-bottom:1px solid var(--border)">
          <td style="padding:7px 8px;font-weight:600;color:var(--accent-blue)"><i class="fas fa-cubes" style="font-size:10px;margin-right:5px"></i>Material</td>
          <td style="padding:7px 8px;text-align:right;font-family:var(--font-mono)">&#8369;${fmtNum(matBudget)}</td>
          <td style="padding:7px 8px;text-align:right;font-family:var(--font-mono);color:${matPO>matBudget?'var(--accent-red)':'var(--text-primary)'}">&#8369;${fmtNum(matPO)}</td>
          <td style="padding:7px 8px;text-align:right;font-family:var(--font-mono);font-weight:700;color:${vc(varMat)}">${vi(varMat)} &#8369;${fmtNum(Math.abs(varMat))}</td>
          <td style="padding:7px 8px;text-align:right;font-family:var(--font-mono);color:${matIssued>matBudget?'var(--accent-red)':'var(--text-primary)'}">&#8369;${fmtNum(matIssued)}</td>
          <td style="padding:7px 8px;text-align:right;font-family:var(--font-mono);font-weight:700;color:${vc(varMatA)}">${vi(varMatA)} &#8369;${fmtNum(Math.abs(varMatA))}</td>
        </tr>
        <tr style="border-bottom:1px solid var(--border)">
          <td style="padding:7px 8px;font-weight:600;color:var(--accent-amber)"><i class="fas fa-box" style="font-size:10px;margin-right:5px"></i>Consumable</td>
          <td style="padding:7px 8px;text-align:right;font-family:var(--font-mono)">&#8369;${fmtNum(conBudget)}</td>
          <td style="padding:7px 8px;text-align:right;font-family:var(--font-mono);color:${conPO>conBudget?'var(--accent-red)':'var(--text-primary)'}">&#8369;${fmtNum(conPO)}</td>
          <td style="padding:7px 8px;text-align:right;font-family:var(--font-mono);font-weight:700;color:${vc(varCon)}">${vi(varCon)} &#8369;${fmtNum(Math.abs(varCon))}</td>
          <td style="padding:7px 8px;text-align:right;font-family:var(--font-mono);color:${conIssued>conBudget?'var(--accent-red)':'var(--text-primary)'}">&#8369;${fmtNum(conIssued)}</td>
          <td style="padding:7px 8px;text-align:right;font-family:var(--font-mono);font-weight:700;color:${vc(varConA)}">${vi(varConA)} &#8369;${fmtNum(Math.abs(varConA))}</td>
        </tr>
        <tr style="background:var(--bg-hover)">
          <td style="padding:7px 8px;font-weight:700">TOTAL</td>
          <td style="padding:7px 8px;text-align:right;font-family:var(--font-mono);font-weight:700">&#8369;${fmtNum(totalBudget)}</td>
          <td style="padding:7px 8px;text-align:right;font-family:var(--font-mono);font-weight:700;color:${totalPO>totalBudget?'var(--accent-red)':'var(--text-primary)'}">&#8369;${fmtNum(totalPO)}</td>
          <td style="padding:7px 8px;text-align:right;font-family:var(--font-mono);font-weight:800;color:${vc(varTot)}">${vi(varTot)} &#8369;${fmtNum(Math.abs(varTot))}</td>
          <td style="padding:7px 8px;text-align:right;font-family:var(--font-mono);font-weight:700;color:${totalIssued>totalBudget?'var(--accent-red)':'var(--text-primary)'}">&#8369;${fmtNum(totalIssued)}</td>
          <td style="padding:7px 8px;text-align:right;font-family:var(--font-mono);font-weight:800;color:${vc(varTotA)}">${vi(varTotA)} &#8369;${fmtNum(Math.abs(varTotA))}</td>
        </tr>
      </tbody>
    </table>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:14px">
      <div>
        <div style="display:flex;justify-content:space-between;margin-bottom:4px">
          <span style="font-size:10px;color:var(--text-secondary)">PO Commitment Rate</span>
          <span style="font-size:11px;font-weight:700;font-family:var(--font-mono);color:${poUtilPct>100?'var(--accent-red)':poUtilPct>80?'var(--accent-amber)':'var(--accent-blue)'}">${poUtilPct}%</span>
        </div>
        <div class="progress-bar" style="height:8px"><div class="progress-fill" style="width:${Math.min(100,poUtilPct)}%;background:${poUtilPct>100?'var(--accent-red)':poUtilPct>80?'var(--accent-amber)':'var(--accent-blue)'};border-radius:4px"></div></div>
      </div>
      <div>
        <div style="display:flex;justify-content:space-between;margin-bottom:4px">
          <span style="font-size:10px;color:var(--text-secondary)">WH Issuance Rate</span>
          <span style="font-size:11px;font-weight:700;font-family:var(--font-mono);color:${whUtilPct>100?'var(--accent-red)':whUtilPct>80?'var(--accent-amber)':'var(--accent-green)'}">${whUtilPct}%</span>
        </div>
        <div class="progress-bar" style="height:8px"><div class="progress-fill" style="width:${Math.min(100,whUtilPct)}%;background:${whUtilPct>100?'var(--accent-red)':whUtilPct>80?'var(--accent-amber)':'var(--accent-green)'};border-radius:4px"></div></div>
      </div>
    </div>
  </div>`;
  })();

  html+=`
  <div class="card" style="margin-bottom:16px">
    <div style="font-size:13px;font-weight:600;margin-bottom:12px"><i class="fas fa-th" style="color:var(--accent-blue);margin-right:7px"></i>Project Snapshot</div>
    <div style="display:grid;grid-template-columns:repeat(8,1fr);gap:8px">`;

  [['fa-tasks','Tasks',tasks.length,'var(--accent-blue)'],
   ['fa-check-circle','Done',done,'var(--accent-green)'],
   ['fa-clock','Overdue',overdueTasks.length,'var(--accent-red)'],
   ['fa-shield-alt','Risks',risks.filter(r=>r.status==='active').length,'var(--accent-red)'],
   ['fa-clipboard-list','Actions',actions.filter(a=>a.status!=='closed').length,'var(--accent-amber)'],
   ['fa-check-double','QA/QC',qaqc.length,'#39d3f2'],
   ['fa-folder-open','Docs',docs.length,'#bc8cff'],
   ['fa-exclamation-triangle','Low Stock',lowStock.length,'var(--accent-amber)'],
  ].forEach(([ic,l,v,c])=>{
    html+=`<div style="text-align:center;padding:10px 6px;background:var(--bg-hover);border-radius:8px;border:1px solid var(--border)">
      <i class="fas ${ic}" style="color:${c};font-size:16px;margin-bottom:5px;display:block"></i>
      <div style="font-size:18px;font-weight:800;font-family:var(--font-mono);color:${c}">${v}</div>
      <div style="font-size:9px;color:var(--text-secondary);margin-top:2px">${l}</div>
    </div>`;
  });

  html+=`</div></div>
  <div class="card" style="margin-bottom:16px">
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px">
      <div style="font-size:13px;font-weight:600"><i class="fas fa-layer-group" style="color:var(--accent-blue);margin-right:7px"></i>Resource Overview <span style="font-size:11px;font-weight:400;color:var(--text-secondary)">from allocation registry</span></div>
      <button class="btn btn-secondary btn-sm" onclick="detailTab='resources';renderDetailTab()">View Full Details &#8594;</button>
    </div>`;

  if(allocs.length===0){
    html+=`<div style="padding:14px;text-align:center;color:var(--text-muted);font-size:12px">No resources allocated. <button class="btn btn-primary btn-sm" onclick="detailTab='allocation';renderDetailTab()">+ Add Allocations</button></div>`;
  }else{
    html+=`<div class="table-wrap"><table>
    <thead><tr><th>Resource</th><th>Type</th><th>Unit</th><th>Role</th><th>Alloc. Qty</th><th>Issued</th><th>Returned</th><th>Net Used</th><th>Remaining</th><th>Asset Status</th><th>Availability / Stock</th><th>Planned Cost (&#8369;)</th><th>Status</th></tr></thead>
    <tbody>`;
    allocs.forEach(a=>{
      const logs2=(AppState.data.resourceUsageLogs||[]).filter(l=>l.allocationId===a.id);
      const issued=logs2.filter(l=>l.transactionType==='Issue').reduce((s,l)=>s+l.quantity,0);
      const returned=logs2.filter(l=>l.transactionType==='Return').reduce((s,l)=>s+l.quantity,0);
      const net=issued-returned;
      const rem=a.allocatedQty-net;
      const pct=a.allocatedQty>0?Math.min(100,Math.round(net/a.allocatedQty*100)):0;
      const tc={Personnel:'#388bfd',Equipment:'#f0a450',Tool:'#bc8cff',Vehicle:'#39d3f2',Consumable:'#3fb950',Material:'#fb8f44',Manpower:'#f85149'}[a.resourceType]||'#8b949e';
      const iconMap={Personnel:'fa-user',Equipment:'fa-cog',Tool:'fa-wrench',Vehicle:'fa-truck',Consumable:'fa-boxes',Material:'fa-layer-group',Manpower:'fa-hard-hat'};
      const regKey={Personnel:'resources',Equipment:'equipment',Tool:'tools',Vehicle:'vehicles',Consumable:'consumables',Material:'materials',Manpower:'manpower'}[a.resourceType];
      const master=regKey?(AppState.data[regKey]||[]).find(r=>r.id===a.resourceId):null;
      let assetStatus='—', availDisplay='—';
      if(a.resourceType==='Personnel'){
        assetStatus=master?.availability||'—';
        availDisplay=`${master?.utilization||0}% utilized`;
      }else if(['Equipment','Tool','Vehicle'].includes(a.resourceType)){
        assetStatus=master?.status||'—';
        const nm=master?.nextMaint||'N/A';
        const nd=nm!=='N/A'?daysBetween(today,nm):null;
        availDisplay=nm==='N/A'?'No maint. scheduled':nd<0?'Maint. OVERDUE':nd<14?`Maint. in ${nd}d`:`Next: ${nm}`;
      }else if(a.resourceType==='Consumable'){
        const oh=master?.qtyOnHand||0;
        const ms=master?.minStock||0;
        assetStatus=oh<=ms?'low-stock':'in-stock';
        availDisplay=`${oh.toLocaleString()} ${master?.unit||a.unit} on hand`;
      }else if(a.resourceType==='Material'){
        assetStatus=master?.status||'—';
        availDisplay=`${(master?.qty||0).toLocaleString()} ${master?.unit||a.unit}`;
      }else if(a.resourceType==='Manpower'){
        assetStatus='active';
        availDisplay=`Plan: ${master?.planned||0} / Act: ${master?.actual||0}`;
      }
      html+=`<tr>
        <td><div style="display:flex;align-items:center;gap:7px">
          <div style="width:24px;height:24px;border-radius:5px;background:${tc}22;display:flex;align-items:center;justify-content:center;flex-shrink:0">
            <i class="fas ${iconMap[a.resourceType]||'fa-cube'}" style="color:${tc};font-size:9px"></i>
          </div>
          <div><div style="font-weight:500;font-size:12px">${a.resourceName}</div>
          <div style="font-size:9px;color:var(--text-muted)">${a.resourceId}</div></div>
        </div></td>
        <td><span class="badge" style="background:${tc}22;color:${tc};font-size:9px">${a.resourceType}</span></td>
        <td><span class="badge badge-blue" style="font-size:9px">${a.unit}</span></td>
        <td style="font-size:11px;color:var(--text-secondary)">${a.role||'&#8212;'}</td>
        <td style="font-family:var(--font-mono);font-weight:700;text-align:center">${a.allocatedQty}</td>
        <td style="font-family:var(--font-mono);color:var(--accent-blue);text-align:center;font-weight:600">${issued}</td>
        <td style="font-family:var(--font-mono);color:var(--accent-amber);text-align:center;font-weight:600">${returned}</td>
        <td style="text-align:center">
          <div style="font-family:var(--font-mono);font-weight:700;font-size:13px;color:${pct>90?'var(--accent-red)':pct>70?'var(--accent-amber)':'var(--accent-green)'}">${net}</div>
          <div class="progress-bar" style="height:3px;margin-top:2px"><div class="progress-fill" style="width:${pct}%;background:${pct>90?'var(--accent-red)':pct>70?'var(--accent-amber)':'var(--accent-green)'}"></div></div>
        </td>
        <td style="font-family:var(--font-mono);font-weight:700;text-align:center;color:${rem<0?'var(--accent-red)':rem===0?'var(--accent-amber)':'inherit'}">${rem}${rem<0?' !':''}</td>
        <td><span class="badge ${statusBadgeMap[assetStatus]||'badge-gray'}" style="font-size:9px">${assetStatus}</span></td>
        <td style="font-size:11px;min-width:130px">${availDisplay}</td>
        <td style="font-family:var(--font-mono);font-size:11px">&#8369;${a.plannedCost.toLocaleString()}</td>
        <td><span class="badge ${statusBadgeMap[a.status]||'badge-gray'}" style="font-size:9px">${a.status}</span></td>
      </tr>`;
    });
    html+=`</tbody></table></div>`;
  }

  // Alerts + Recent Transactions
  let alertItems=[];
  overdueTasks.forEach(t=>{alertItems.push(`<div style="display:flex;gap:8px;padding:8px 0;border-bottom:1px solid var(--border)"><i class="fas fa-clock" style="color:var(--accent-red);margin-top:2px;flex-shrink:0"></i><div><div style="font-size:11px;font-weight:500">Overdue Task: ${t.name}</div><div style="font-size:10px;color:var(--text-secondary)">Due: ${t.dueDate} &middot; ${t.assignee||'Unassigned'}</div></div></div>`);});
  risks.filter(r=>r.status==='active'&&(r.impact||0)*(r.probability||0)>=6).forEach(r=>{alertItems.push(`<div style="display:flex;gap:8px;padding:8px 0;border-bottom:1px solid var(--border)"><i class="fas fa-shield-alt" style="color:var(--accent-red);margin-top:2px;flex-shrink:0"></i><div><div style="font-size:11px;font-weight:500">High Risk: ${(r.description||'').substring(0,50)||'&#8212;'}</div><div style="font-size:10px;color:var(--text-secondary)">Score: ${(r.impact||0)*(r.probability||0)}</div></div></div>`);});
  lowStock.forEach(c=>{alertItems.push(`<div style="display:flex;gap:8px;padding:8px 0;border-bottom:1px solid var(--border)"><i class="fas fa-exclamation-triangle" style="color:var(--accent-amber);margin-top:2px;flex-shrink:0"></i><div><div style="font-size:11px;font-weight:500">Low Stock: ${c.name}</div><div style="font-size:10px;color:var(--text-secondary)">${c.qtyOnHand} ${c.unit} &middot; Min: ${c.minStock}</div></div></div>`);});
  actions.filter(a=>a.status!=='closed'&&a.dueDate&&isOverdue(a.dueDate)).forEach(a=>{alertItems.push(`<div style="display:flex;gap:8px;padding:8px 0;border-bottom:1px solid var(--border)"><i class="fas fa-clipboard-list" style="color:var(--accent-amber);margin-top:2px;flex-shrink:0"></i><div><div style="font-size:11px;font-weight:500">Overdue Action: ${(a.description||'').substring(0,50)||'&#8212;'}</div><div style="font-size:10px;color:var(--text-secondary)">Due: ${a.dueDate}</div></div></div>`);});

  let txHtml='';
  logs.slice().reverse().slice(0,8).forEach(l=>{
    txHtml+=`<div style="display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid var(--border)">
      <div style="width:28px;height:28px;border-radius:50%;background:${l.transactionType==='Return'?'rgba(240,164,80,.15)':'rgba(63,185,80,.15)'};display:flex;align-items:center;justify-content:center;flex-shrink:0">
        <i class="fas ${l.transactionType==='Return'?'fa-undo':'fa-sign-out-alt'}" style="color:${l.transactionType==='Return'?'var(--accent-amber)':'var(--accent-green)'};font-size:11px"></i>
      </div>
      <div style="flex:1;min-width:0">
        <div style="font-size:11px;font-weight:500;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${l.transactionType}: ${l.resourceName}</div>
        <div style="font-size:10px;color:var(--text-secondary)">${l.date} &middot; ${l.quantity} ${l.unit}</div>
      </div>
      <div style="font-family:var(--font-mono);font-size:13px;font-weight:700;color:${l.transactionType==='Return'?'var(--accent-amber)':'var(--accent-green)'}">
        ${l.transactionType==='Return'?'-':'+'}${l.quantity}
      </div>
    </div>`;
  });

  html+=`</div>
  <div class="grid grid-2" style="margin-top:0">
    <div class="card">
      <div style="font-size:13px;font-weight:600;margin-bottom:12px"><i class="fas fa-bell" style="color:var(--accent-amber);margin-right:7px"></i>Alerts</div>
      ${alertItems.length?alertItems.join(''):`<div style="padding:12px;text-align:center;color:var(--text-muted);font-size:12px"><i class="fas fa-check-circle" style="color:var(--accent-green);font-size:20px;display:block;margin-bottom:6px"></i>No active alerts</div>`}
    </div>
    <div class="card">
      <div style="font-size:13px;font-weight:600;margin-bottom:12px"><i class="fas fa-clipboard-list" style="color:var(--accent-blue);margin-right:7px"></i>Recent Transactions</div>
      ${logs.length?`<div style="max-height:260px;overflow-y:auto">${txHtml}</div>
      <div style="margin-top:10px;display:flex;gap:7px">
        <button class="btn btn-success btn-sm" onclick="showLogUsage('${pid}','Issue')"><i class="fas fa-sign-out-alt"></i> Issue</button>
        <button class="btn btn-warning btn-sm" onclick="showLogUsage('${pid}','Return')"><i class="fas fa-undo"></i> Return</button>
        <button class="btn btn-secondary btn-sm" onclick="detailTab='allocation';renderDetailTab()">View All &#8594;</button>
      </div>`:`<div style="padding:12px;text-align:center;color:var(--text-muted);font-size:12px">No transactions logged yet</div>`}
    </div>
  </div>`;

  $('#detailTabContent').innerHTML=html;
}



function saveDetailOverview(){
  const p=(AppState.data.projects||[]).find(x=>x.id===detailProjectId);
  if(!p)return;
  p.name=$('#dp_name').value||p.name;
  p.client=$('#dp_client').value;
  p.location=$('#dp_loc').value;
  p.pm=$('#dp_pm').value;
  p.discipline=$('#dp_disc').value;
  p.phase=$('#dp_phase').value;
  p.riskLevel=$('#dp_risk').value;
  p.status=$('#dp_status').value;
  p.priority=$('#dp_priority').value;
  p.startDate=$('#dp_start').value;
  p.endDate=$('#dp_end').value;
  p.budget=parseFloat($('#dp_budget').value)||p.budget;
  p.spent=parseFloat($('#dp_spent').value)||p.spent;
  p.progress=parseInt($('#dp_prog').value)||p.progress;
  p.description=$('#dp_desc').value;
  AppState.save();
  showProjectDetail(detailProjectId);
  showToast('Project updated successfully','success');
}

function renderDetailTasks(){
  if(typeof _recalcAllWbs==='function'){const pool=(AppState.data.tasks||[]).filter(t=>t.projectId===detailProjectId&&!t._deleted);if(pool.some(t=>!t.wbs)){_recalcAllWbs(detailProjectId);AppState.save();}}
  // Backfill Planned Hrs from durationHrs when never set
  {const hpd=(typeof _getTaskProjHPD==='function')?_getTaskProjHPD(detailProjectId):8;let dirty=false;(AppState.data.tasks||[]).filter(t=>t.projectId===detailProjectId&&!t._deleted&&!t.milestone&&t.durationHrs>0&&(!t.plannedHrs||t.plannedHrs===0)).forEach(t=>{t.plannedHrs=+t.durationHrs.toFixed(2);dirty=true;});if(dirty)AppState.save();}
  const tasks=(AppState.data.tasks||[]).filter(t=>t.projectId===detailProjectId&&!t._deleted);
  const p=(AppState.data.projects||[]).find(x=>x.id===detailProjectId);
  const done=tasks.filter(t=>t.status==='done').length;
  const inp=tasks.filter(t=>t.status==='inprogress').length;
  const todo=tasks.filter(t=>t.status==='todo').length;
  $('#detailTabContent').innerHTML=`
  <div class="grid grid-4" style="margin-bottom:14px">
    ${sc('fas fa-tasks','Total Tasks',tasks.length,'This project','#388bfd','rgba(56,139,253,.15)')}
    ${sc('fas fa-check-circle','Completed',done,Math.round(done/Math.max(tasks.length,1)*100)+'% done','#3fb950','rgba(63,185,80,.15)')}
    ${sc('fas fa-spinner','In Progress',inp,'Active work','#f0a450','rgba(240,164,80,.15)')}
    ${sc('fas fa-circle','Pending',todo,'Not started','#8b949e','rgba(139,148,158,.15)')}
  </div>
  <div class="card">
    <div class="section-header" style="margin-bottom:12px">
      <div class="section-title">Task List — ${p?.name||detailProjectId}</div>
      <button class="btn btn-primary btn-sm" onclick="taskProjectFilter='${detailProjectId}';showTaskForm(null,'todo')"><i class="fas fa-plus"></i> Add Task</button>
    </div>
    <div class="table-wrap"><table>
      <thead><tr><th>WBS</th><th>Task Name</th><th>Assignee</th><th>Dept</th><th>Start</th><th>End</th><th>Dur (d)</th><th>Planned Hrs</th><th>Actual Hrs</th><th>Progress</th><th>Status</th><th>Priority</th><th>Milestone</th><th></th></tr></thead>
      <tbody id="detailTaskBody">${renderDetailTaskRows(tasks)}</tbody>
    </table></div>
  </div>`;
}

function renderDetailTaskRows(tasks){
  if(!tasks.length)return`<tr><td colspan="14"><div class="empty-state"><i class="fas fa-tasks"></i><p>No tasks yet. Click "Add Task" to create one.</p></div></td></tr>`;
  const ordered=typeof _orderTasksHier==='function'?_orderTasksHier(tasks):tasks.map(t=>({t,depth:0}));
  return ordered.map(({t,depth})=>{const isSum=typeof _taskHasChildren==='function'&&_taskHasChildren(t.id,tasks);return`<tr>
    <td style="font-size:10px;font-family:var(--font-mono);color:var(--text-muted)">${t.wbs||t.id}</td>
    <td><div style="font-weight:${isSum?'700':'500'};font-size:12px;padding-left:${depth*18}px">${isSum?'<i class="fas fa-folder-open" style="font-size:9px;color:var(--accent-cyan);margin-right:5px"></i>':depth>0?'<i class="fas fa-level-up-alt fa-rotate-90" style="font-size:8px;color:var(--text-muted);margin-right:5px"></i>':''}${t.name}</div></td>
    <td><div style="display:flex;align-items:center;gap:5px">${avatarH(t.assignee,22)}<span style="font-size:11px">${t.assignee}</span></div></td>
    <td style="font-size:11px;color:var(--text-secondary)">${t.dept}</td>
    <td style="font-size:11px;font-family:var(--font-mono)">${t.startDate}</td>
    <td style="font-size:11px;font-family:var(--font-mono);color:${isOverdue(t.endDate)&&t.status!=='done'?'var(--accent-red)':'inherit'}">${t.endDate}</td>
    <td style="font-family:var(--font-mono);font-size:11px;text-align:center">${t.milestone?'—':(t.durationHrs?+((t.durationHrs/(_getTaskProjHPD?.(t.projectId)||8)).toFixed(2)):'')}</td>
    <td style="font-family:var(--font-mono);font-size:11px;text-align:center">${t.plannedHrs}</td>
    <td style="font-family:var(--font-mono);font-size:11px;text-align:center;color:${t.actualHrs>t.plannedHrs?'var(--accent-red)':'inherit'}">${t.actualHrs}</td>
    <td><div style="display:flex;align-items:center;gap:5px;min-width:90px"><div class="progress-bar" style="flex:1;height:5px"><div class="progress-fill" style="width:${t.progress}%;background:${pColor(t.progress)}"></div></div><span style="font-size:10px;font-family:var(--font-mono)">${t.progress}%</span></div></td>
    <td>${sBadge(t.status)}</td>
    <td>${pBadge(t.priority)}</td>
    <td style="text-align:center">${t.milestone?'<span style="color:var(--accent-amber);font-size:16px">&#9670;</span>':'<span style="color:var(--text-muted)">—</span>'}</td>
    <td><div style="display:flex;gap:3px">
      <button class="btn btn-secondary btn-sm btn-icon" onclick="taskProjectFilter='${t.projectId}';showTaskForm('${t.id}')"><i class="fas fa-edit"></i></button>
      <button class="btn btn-danger btn-sm btn-icon" onclick="deleteDetailTask('${t.id}')"><i class="fas fa-trash"></i></button>
    </div></td>
  </tr>`;}).join('');
}

function deleteDetailTask(id){
  requestOrDelete('tasks', id);
}


// ── PROJECT DETAIL: RESOURCES TAB ─────────────────────────

// ── PROJECT DETAIL: RESOURCES (from Allocation Registry) ──

// ── PROJECT DETAIL: RESOURCES (full detail from allocation + master registers) ──
function renderDetailResources(){
  const pid=detailProjectId;
  const p=(AppState.data.projects||[]).find(x=>x.id===pid);
  if(!p)return;
  if(!AppState.data.projectTeam)AppState.data.projectTeam=[];
  if(!AppState.data.resourceAllocations)AppState.data.resourceAllocations=[];
  if(!AppState.data.resourceUsageLogs)AppState.data.resourceUsageLogs=[];

  const allocs=(AppState.data.resourceAllocations||[]).filter(a=>a.projectId===pid);
  const logs=(AppState.data.resourceUsageLogs||[]).filter(l=>l.projectId===pid);
  const team=(AppState.data.projectTeam||[]).filter(m=>m.projectId===pid);
  const tasks=(AppState.data.tasks||[]).filter(t=>t.projectId===pid);

  // Usage map — issued vs returned per allocation
  const usageMap={};
  logs.forEach(l=>{
    if(!usageMap[l.allocationId])usageMap[l.allocationId]={issued:0,returned:0};
    if(l.transactionType==='Return')usageMap[l.allocationId].returned+=l.quantity;
    else usageMap[l.allocationId].issued+=l.quantity;
  });

  // Master registers
  const reg={
    Personnel: AppState.data.resources||[],
    Equipment: AppState.data.equipment||[],
    Tool:      AppState.data.tools||[],
    Vehicle:   AppState.data.vehicles||[],
    Consumable:AppState.data.consumables||[],
    Material:  AppState.data.materials||[],
    Manpower:  AppState.data.manpower||[],
    Procurement:AppState.data.procurement||[],
  };

  // Helper: get master record for an allocation
  function getMaster(a){
    const list=reg[a.resourceType]||[];
    return list.find(r=>r.id===a.resourceId)||null;
  }

  // Group allocations by type
  const byType={};
  allocs.forEach(a=>{
    if(!byType[a.resourceType])byType[a.resourceType]=[];
    byType[a.resourceType].push(a);
  });

  const typeColor={Personnel:'#388bfd',Equipment:'#f0a450',Tool:'#bc8cff',Vehicle:'#39d3f2',Consumable:'#3fb950',Material:'#fb8f44',Manpower:'#f85149',Procurement:'#39d3f2'};
  const typeIcon ={Personnel:'fa-user',Equipment:'fa-cog',Tool:'fa-wrench',Vehicle:'fa-truck',Consumable:'fa-boxes',Material:'fa-layer-group',Manpower:'fa-hard-hat',Procurement:'fa-shopping-cart'};

  const totPlanned=allocs.reduce((s,a)=>s+a.plannedCost,0);
  const totActual =allocs.reduce((s,a)=>s+a.actualCost,0);
  const activeAllocs=allocs.filter(a=>a.status==='active').length;
  const today=new Date().toISOString().split('T')[0];

  // Status badge helper (reusable)
  const sb=(s,opts={})=>{
    const map={
      available:'badge-green',active:'badge-green','in-stock':'badge-green',delivered:'badge-green',
      'in-use':'badge-blue',busy:'badge-blue',
      maintenance:'badge-red',breakdown:'badge-red',unavailable:'badge-red','out-of-service':'badge-red',expired:'badge-red',
      standby:'badge-gray','on-hold':'badge-gray',inactive:'badge-gray',
      'low-stock':'badge-amber',pending:'badge-amber','on-leave':'badge-amber',ordered:'badge-amber',partial:'badge-amber',
      completed:'badge-purple',planned:'badge-purple',
    };
    return`<span class="badge ${map[s]||'badge-gray'}" ${opts.style?`style="${opts.style}"`:''} >${s||'—'}</span>`;
  };

  // Cert / date alert
  const certAlert=(exp)=>{
    if(!exp||exp==='N/A')return`<span style="color:var(--text-muted);font-size:9px">N/A</span>`;
    const d=daysBetween(today,exp);
    return`<span class="badge ${d<0?'badge-red':d<60?'badge-amber':'badge-green'}" style="font-size:9px">${d<0?'EXPIRED':d<30?d+'d':exp}</span>`;
  };

  const maintAlert=(d)=>{
    if(!d||d==='N/A')return`<span style="color:var(--text-muted);font-size:9px">N/A</span>`;
    const days=daysBetween(today,d);
    return`<span class="badge ${days<0?'badge-red':days<14?'badge-amber':'badge-green'}" style="font-size:9px">${days<0?'OVERDUE':days<14?days+'d':d}</span>`;
  };

  // Build resource cards per type
  function buildTypeSection(type, arr){
    const tc=typeColor[type]||'#8b949e';
    const ti=typeIcon[type]||'fa-cube';
    const isPersonnel=type==='Personnel';
    const isEquip=type==='Equipment';
    const isTool=type==='Tool';
    const isVehicle=type==='Vehicle';
    const isFleet=isEquip||isTool||isVehicle;
    const isConsumable=type==='Consumable';
    const isMaterial=type==='Material';
    const isStock=isConsumable||isMaterial;
    const isManpower=type==='Manpower';

    const rows=arr.map(a=>{
      const u=usageMap[a.id]||{issued:0,returned:0};
      const net=u.issued-u.returned;
      const rem=a.allocatedQty-net;
      const pct=a.allocatedQty>0?Math.min(100,Math.round(net/a.allocatedQty*100)):0;
      const m=getMaster(a);

      // ── Personnel ──
      if(isPersonnel){
        const util=m?.utilization||0;
        const avail=m?.availability||'unknown';
        const certs=(m?.certifications||[]);
        const skills=(m?.skills||[]);
        return`<tr>
          <td><div style="display:flex;align-items:center;gap:8px">${avatarH(a.resourceName,32)}
            <div><div style="font-weight:600;font-size:12px">${a.resourceName}</div>
            <div style="font-size:9px;color:var(--text-muted)">${a.resourceId}</div></div>
          </div></td>
          <td style="font-size:11px">${a.role||m?.role||'—'}</td>
          <td style="font-size:11px">${m?.dept||'—'}</td>
          <td>${sb(avail)}</td>
          <td><div style="display:flex;align-items:center;gap:5px;min-width:80px">
            <div class="progress-bar" style="flex:1;height:5px"><div class="progress-fill" style="width:${util}%;background:${util>90?'var(--accent-red)':util>70?'var(--accent-amber)':'var(--accent-blue)'}"></div></div>
            <span style="font-size:10px;font-family:var(--font-mono);font-weight:600">${util}%</span>
          </div></td>
          <td style="max-width:150px">${certs.map(c=>`<span class="badge badge-purple" style="font-size:8px;margin:1px">${c}</span>`).join('')||'<span style="color:var(--text-muted);font-size:10px">—</span>'}</td>
          <td style="max-width:140px">${skills.slice(0,3).map(s=>`<span class="chip" style="font-size:8px;margin:1px">${s}</span>`).join('')||'<span style="color:var(--text-muted);font-size:10px">—</span>'}</td>
          <td style="font-family:var(--font-mono);font-size:11px">₱${((m?.hourlyRate||0)*8).toLocaleString()}</td>
          <td style="font-family:var(--font-mono);font-size:11px;text-align:center">${a.allocatedQty} ${a.unit}</td>
          ${usageCells(u,net,rem,pct,a)}
          <td>${sb(a.status)}</td>
        </tr>`;
      }

      // ── Fleet (Equipment / Tool / Vehicle) ──
      if(isFleet){
        const status=m?.status||'unknown';
        const loc=m?.location||'—';
        const nextMaint=m?.nextMaint||'N/A';
        const nextCal=m?.nextCal||'N/A';
        const certExp=m?.certExpiry||'N/A';
        const make=m?`${m.make||''} ${m.model||''}`.trim():'—';
        const serial=m?.serialNo||m?.regNo||'—';
        const cat=m?.category||'—';
        return`<tr>
          <td><div style="display:flex;align-items:center;gap:8px">
            <div style="width:30px;height:30px;border-radius:6px;background:${tc}22;display:flex;align-items:center;justify-content:center;flex-shrink:0">
              <i class="fas ${ti}" style="color:${tc};font-size:12px"></i>
            </div>
            <div><div style="font-weight:600;font-size:12px">${a.resourceName}</div>
            <div style="font-size:9px;color:var(--text-muted)">${a.resourceId}</div></div>
          </div></td>
          <td><span class="badge badge-gray" style="font-size:9px">${cat}</span></td>
          <td style="font-size:11px;color:var(--text-secondary)">${make}</td>
          <td style="font-size:10px;font-family:var(--font-mono);color:var(--text-muted)">${serial}</td>
          <td>${sb(status)}</td>
          <td style="font-size:11px">${loc}</td>
          <td>${maintAlert(nextMaint)}</td>
          ${!isTool?'':`<td>${maintAlert(nextCal)}</td>`}
          ${isTool?'':`<td>${maintAlert(isEquip?nextCal:'N/A')}</td>`}
          <td>${certAlert(certExp)}</td>
          <td style="font-family:var(--font-mono);font-size:11px">₱${(m?.dailyRate||0).toLocaleString()}</td>
          <td style="font-family:var(--font-mono);font-size:11px;text-align:center">${a.allocatedQty} ${a.unit}</td>
          ${usageCells(u,net,rem,pct,a)}
          <td>${sb(a.status)}</td>
        </tr>`;
      }

      // ── Consumable ──
      if(isConsumable){
        const onHand=m?.qtyOnHand||0;
        const minStock=m?.minStock||0;
        const unitCost=m?.unitCost||0;
        const supplier=m?.supplier||'—';
        const stockStatus=onHand<=minStock?'low-stock':'in-stock';
        const stockPct=Math.min(100,Math.round(onHand/Math.max(minStock*2,1)*100));
        const planned=a.plannedCost||0;
        const whActual=(typeof _whActualIssueCost==='function')?_whActualIssueCost(pid,a.resourceId):0;
        const variance=planned-whActual;
        const varColor=variance<0?'var(--accent-red)':variance===0?'var(--text-secondary)':'var(--accent-green)';
        return`<tr>
          <td><div style="font-weight:600;font-size:12px">${a.resourceName}</div>
            <div style="font-size:9px;color:var(--text-muted)">${a.resourceId}</div></td>
          <td><span class="badge badge-gray" style="font-size:9px">${m?.category||'—'}</span></td>
          <td><span class="badge badge-blue" style="font-size:9px">${m?.unit||a.unit}</span></td>
          <td>${sb(stockStatus)}</td>
          <td style="font-family:var(--font-mono);font-weight:700;color:${onHand<=minStock?'var(--accent-red)':'inherit'}">${onHand.toLocaleString()}</td>
          <td style="font-family:var(--font-mono);color:var(--text-secondary)">${minStock.toLocaleString()}</td>
          <td><div style="display:flex;align-items:center;gap:5px;min-width:80px">
            <div class="progress-bar" style="flex:1;height:5px"><div class="progress-fill" style="width:${stockPct}%;background:${onHand<=minStock?'var(--accent-red)':'var(--accent-green)'}"></div></div>
            <span style="font-size:9px;font-weight:700;color:${onHand<=minStock?'var(--accent-red)':'var(--accent-green)'}">${stockPct}%</span>
          </div>${onHand<=minStock?`<span class="badge badge-red" style="font-size:8px;display:block;margin-top:2px">Reorder!</span>`:''}</td>
          <td style="font-family:var(--font-mono);font-size:11px">₱${unitCost.toLocaleString()}</td>
          <td style="font-family:var(--font-mono);font-size:11px">${supplier}</td>
          <td style="font-family:var(--font-mono);font-size:11px;text-align:center">${a.allocatedQty} ${a.unit}</td>
          ${usageCells(u,net,rem,pct,a)}
          <td style="font-family:var(--font-mono);font-size:11px;color:var(--text-secondary)">₱${planned.toLocaleString()}</td>
          <td style="font-family:var(--font-mono);font-size:11px;font-weight:600">₱${whActual.toLocaleString()}</td>
          <td style="font-family:var(--font-mono);font-size:11px;font-weight:700;color:${varColor}">${variance>=0?'+':''}₱${variance.toLocaleString()}</td>
          <td>${sb(a.status)}</td>
        </tr>`;
      }

      // ── Material ──
      if(isMaterial){
        const qty=m?.qty||0;
        const unitCost=m?.unitCost||0;
        const delDate=m?.deliveryDate||'—';
        const matStatus=m?.status||'—';
        const supplier=m?.supplier||'—';
        const critical=m?.critical||false;
        const planned=a.plannedCost||0;
        const whActual=(typeof _whActualIssueCost==='function')?_whActualIssueCost(pid,a.resourceId):0;
        const variance=planned-whActual;
        const varColor=variance<0?'var(--accent-red)':variance===0?'var(--text-secondary)':'var(--accent-green)';
        return`<tr style="${critical?'border-left:3px solid var(--accent-amber)':''}">
          <td><div style="display:flex;align-items:center;gap:6px">
            ${critical?'<i class="fas fa-exclamation-triangle" style="color:var(--accent-amber);font-size:10px"></i>':''}
            <div><div style="font-weight:600;font-size:12px">${a.resourceName}</div>
            <div style="font-size:9px;color:var(--text-muted)">${a.resourceId}</div></div>
          </div></td>
          <td><span class="badge badge-blue" style="font-size:9px">${m?.unit||a.unit}</span></td>
          <td>${sb(matStatus)}</td>
          <td style="font-family:var(--font-mono);font-weight:700">${qty.toLocaleString()}</td>
          <td style="font-family:var(--font-mono);font-size:11px">₱${unitCost.toLocaleString()}</td>
          <td style="font-size:11px">${supplier}</td>
          <td style="font-size:11px;font-family:var(--font-mono);color:${isOverdue(delDate)&&matStatus!=='delivered'?'var(--accent-red)':'var(--text-secondary)'}">${delDate}</td>
          <td><span class="badge ${critical?'badge-amber':'badge-gray'}" style="font-size:9px">${critical?'Critical':'Normal'}</span></td>
          <td style="font-family:var(--font-mono);font-size:11px;text-align:center">${a.allocatedQty} ${a.unit}</td>
          ${usageCells(u,net,rem,pct,a)}
          <td style="font-family:var(--font-mono);font-size:11px;color:var(--text-secondary)">₱${planned.toLocaleString()}</td>
          <td style="font-family:var(--font-mono);font-size:11px;font-weight:600">₱${whActual.toLocaleString()}</td>
          <td style="font-family:var(--font-mono);font-size:11px;font-weight:700;color:${varColor}">${variance>=0?'+':''}₱${variance.toLocaleString()}</td>
          <td>${sb(a.status)}</td>
        </tr>`;
      }

      // ── Manpower ──
      if(isManpower){
        const planned=m?.planned||0;
        const actual=m?.actual||0;
        const variance=actual-planned;
        const ot=m?.overtime||0;
        const shift=m?.shift||'—';
        const cost=m?.cost||0;
        return`<tr>
          <td><div style="font-weight:600;font-size:12px">${a.resourceName}</div>
            <div style="font-size:9px;color:var(--text-muted)">${a.resourceId}</div></td>
          <td style="font-size:11px">${a.role||'—'}</td>
          <td><span class="badge badge-gray">${shift}</span></td>
          <td style="font-family:var(--font-mono);text-align:center">${planned}</td>
          <td style="font-family:var(--font-mono);text-align:center;font-weight:700">${actual}</td>
          <td style="font-family:var(--font-mono);font-weight:700;color:${variance>=0?'var(--accent-green)':'var(--accent-red)'};text-align:center">${variance>=0?'+':''}${variance}</td>
          <td style="font-family:var(--font-mono);color:${ot>100?'var(--accent-amber)':'inherit'};text-align:center">${ot}h</td>
          <td style="font-family:var(--font-mono)">₱${cost.toLocaleString()}</td>
          <td style="font-family:var(--font-mono);font-size:11px;text-align:center">${a.allocatedQty} ${a.unit}</td>
          ${usageCells(u,net,rem,pct,a)}
          <td>${sb(a.status)}</td>
        </tr>`;
      }

      return`<tr><td colspan="12" style="color:var(--text-muted);font-size:11px;padding:8px">Unknown type: ${type}</td></tr>`;
    });

    // Column headers per type
    const headers={
      Personnel:['Name','Role','Dept','Availability','Utilization','Certifications','Skills','Daily Rate','Alloc. Qty','Issued','Returned','Net Used','Remaining','Alloc. Status'],
      Equipment:['Name','Category','Make/Model','Serial No.','Asset Status','Location','Next Maint.','Next Cal.','Cert Expiry','Daily Rate','Alloc. Qty','Issued','Returned','Net Used','Remaining','Alloc. Status'],
      Tool:     ['Name','Category','Make/Model','Serial No.','Asset Status','Location','Next Maint.','Next Cal.','Cert Expiry','Daily Rate','Alloc. Qty','Issued','Returned','Net Used','Remaining','Alloc. Status'],
      Vehicle:  ['Name','Category','Make/Model','Reg. No.','Asset Status','Location','Next Maint.','Next Cal.','Cert Expiry','Daily Rate','Alloc. Qty','Issued','Returned','Net Used','Remaining','Alloc. Status'],
      Consumable:['Name','Category','Unit','Stock Status','On Hand','Min Stock','Stock Level','Unit Cost (₱)','Supplier','Alloc. Qty','Issued','Returned','Net Used','Remaining','Planned (₱)','Actual WH (₱)','Variance (₱)','Alloc. Status'],
      Material: ['Name','Unit','Delivery Status','Total Qty','Unit Cost (₱)','Supplier','Delivery Date','Priority','Alloc. Qty','Issued','Returned','Net Used','Remaining','Planned (₱)','Actual WH (₱)','Variance (₱)','Alloc. Status'],
      Manpower: ['Trade','Role','Shift','Planned HC','Actual HC','Variance','OT Hours','Weekly Cost','Alloc. Qty','Issued','Returned','Net Used','Remaining','Alloc. Status'],
    };
    const hdrs=headers[type]||['Name','Alloc. Qty','Issued','Returned','Net Used','Remaining','Status'];

    return`<div class="card" style="margin-bottom:14px">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px">
        <div style="font-size:14px;font-weight:600"><i class="fas ${ti}" style="color:${tc};margin-right:7px"></i>${type} <span style="font-size:12px;font-weight:400;color:var(--text-secondary)">(${arr.length})</span></div>
        <div style="display:flex;gap:7px">
          ${(()=>{
            const totPlanned=arr.reduce((s,a)=>s+a.plannedCost,0);
            const useWH=(type==='Material'||type==='Consumable')&&typeof _whActualIssueCost==='function';
            const totActual=useWH?arr.reduce((s,a)=>s+_whActualIssueCost(pid,a.resourceId),0):arr.reduce((s,a)=>s+a.actualCost,0);
            const variance=totPlanned-totActual;
            const varColor=variance<0?'var(--accent-red)':variance===0?'var(--text-secondary)':'var(--accent-green)';
            return`<span style="font-size:10px;color:var(--text-secondary);align-self:center">Planned: <strong style="font-family:var(--font-mono)">₱${totPlanned.toLocaleString()}</strong></span>
            <span style="font-size:10px;color:var(--text-secondary);align-self:center">Actual${useWH?' (WH)':''}: <strong style="font-family:var(--font-mono);color:${totActual>totPlanned?'var(--accent-red)':'inherit'}">₱${totActual.toLocaleString()}</strong></span>
            <span style="font-size:10px;align-self:center;font-weight:700;color:${varColor}">${variance>=0?'▲ Under':'▼ Over'} ₱${Math.abs(variance).toLocaleString()}</span>`;
          })()}
          <button class="btn btn-success btn-sm" style="font-size:9px;padding:3px 8px" onclick="showLogUsage('${pid}','Issue')"><i class="fas fa-sign-out-alt"></i> Issue</button>
          <button class="btn btn-warning btn-sm" style="font-size:9px;padding:3px 8px" onclick="showLogUsage('${pid}','Return')"><i class="fas fa-undo"></i> Return</button>
        </div>
      </div>
      <div class="table-wrap"><table>
        <thead><tr>${hdrs.map(h=>`<th style="white-space:nowrap;font-size:10px">${h}</th>`).join('')}</tr></thead>
        <tbody>${rows.join('')}</tbody>
      </table></div>
    </div>`;
  }

  // Shared usage cells (Alloc Qty, Issued, Returned, Net Used bar, Remaining)
  function usageCells(u,net,rem,pct,a){
    return`
    <td style="font-family:var(--font-mono);font-size:12px;font-weight:700;color:var(--accent-blue);text-align:center">${u.issued}</td>
    <td style="font-family:var(--font-mono);font-size:12px;font-weight:700;color:var(--accent-amber);text-align:center">${u.returned}</td>
    <td style="text-align:center">
      <div style="font-family:var(--font-mono);font-size:12px;font-weight:700;color:${pct>90?'var(--accent-red)':pct>70?'var(--accent-amber)':'var(--accent-green)'}">${net}</div>
      <div class="progress-bar" style="height:3px;margin-top:2px"><div class="progress-fill" style="width:${pct}%;background:${pct>90?'var(--accent-red)':pct>70?'var(--accent-amber)':'var(--accent-green)'}"></div></div>
    </td>
    <td style="font-family:var(--font-mono);font-size:12px;font-weight:700;text-align:center;color:${rem<0?'var(--accent-red)':rem===0?'var(--accent-amber)':'inherit'}">${rem}${rem<0?` <i class="fas fa-exclamation-triangle" style="font-size:9px"></i>`:''}</td>`;
  }

  $('#detailTabContent').innerHTML=`
  <!-- Summary KPI strip -->
  <div style="display:grid;grid-template-columns:repeat(6,1fr);gap:8px;margin-bottom:14px">
    <div class="stat-card"><div class="stat-icon" style="background:rgba(56,139,253,.15)"><i class="fas fa-layer-group" style="color:var(--accent-blue)"></i></div><div class="stat-info"><div class="label">Total Allocated</div><div class="value" style="color:var(--accent-blue)">${allocs.length}</div></div></div>
    <div class="stat-card"><div class="stat-icon" style="background:rgba(63,185,80,.15)"><i class="fas fa-check-circle" style="color:var(--accent-green)"></i></div><div class="stat-info"><div class="label">Active</div><div class="value" style="color:var(--accent-green)">${activeAllocs}</div></div></div>
    <div class="stat-card"><div class="stat-icon" style="background:rgba(56,139,253,.15)"><i class="fas fa-id-badge" style="color:var(--accent-blue)"></i></div><div class="stat-info"><div class="label">Team Members</div><div class="value">${team.length}</div></div></div>
    <div class="stat-card"><div class="stat-icon" style="background:rgba(248,81,73,.15)"><i class="fas fa-exclamation-triangle" style="color:var(--accent-red)"></i></div><div class="stat-info"><div class="label">Low Stock Items</div><div class="value" style="color:var(--accent-red)">${(AppState.data.consumables||[]).filter(c=>c.projectId===pid&&c.qtyOnHand<=c.minStock).length}</div></div></div>
    <div class="stat-card"><div class="stat-icon" style="background:rgba(240,164,80,.15)"><i class="fas fa-dollar-sign" style="color:var(--accent-amber)"></i></div><div class="stat-info"><div class="label">Planned Cost</div><div class="value" style="font-size:12px;color:var(--accent-amber)">${fmtNum(totPlanned)}</div></div></div>
    <div class="stat-card"><div class="stat-icon" style="background:rgba(188,140,255,.15)"><i class="fas fa-dollar-sign" style="color:#bc8cff"></i></div><div class="stat-info"><div class="label">Actual Cost</div><div class="value" style="font-size:12px;color:#bc8cff">${fmtNum(totActual)}</div></div></div>
  </div>

  <!-- Type breakdown pills -->
  ${allocs.length?`<div class="card" style="padding:10px 16px;margin-bottom:14px">
    <div style="display:flex;gap:12px;flex-wrap:wrap;align-items:center">
      <span style="font-size:11px;font-weight:600;color:var(--text-secondary)">Allocated:</span>
      ${Object.entries(byType).map(([t,arr])=>{
        const c=typeColor[t]||'#8b949e';
        return`<div style="display:flex;align-items:center;gap:4px">
          <i class="fas ${typeIcon[t]||'fa-cube'}" style="color:${c};font-size:10px"></i>
          <span style="font-size:11px;font-weight:600">${t}</span>
          <span style="background:${c}22;color:${c};font-size:11px;font-weight:700;padding:1px 8px;border-radius:10px">${arr.length}</span>
        </div>`;}).join('')}
    </div>
  </div>`:''}

  ${allocs.length===0?`<div class="card" style="padding:30px;text-align:center">
    <i class="fas fa-layer-group" style="font-size:36px;opacity:.3;display:block;margin-bottom:12px"></i>
    <p style="color:var(--text-muted);margin-bottom:12px">No resources allocated yet.</p>
    <button class="btn btn-primary" onclick="detailTab='allocation';renderDetailTab()"><i class="fas fa-plus"></i> Add Resource Allocations</button>
  </div>`:`

  <!-- PROJECT TEAM -->
  <div class="card" style="margin-bottom:14px">
    <div class="section-header" style="margin-bottom:10px">
      <div><div style="font-size:14px;font-weight:600"><i class="fas fa-id-badge" style="color:var(--accent-blue);margin-right:7px"></i>Project Team Members</div>
      <div style="font-size:10px;color:var(--text-secondary)">Staff directly assigned to this project</div></div>
      <button class="btn btn-primary btn-sm" onclick="showAddTeamMember('${pid}')"><i class="fas fa-user-plus"></i> Add Member</button>
    </div>
    ${team.length?`<div class="table-wrap"><table>
      <thead><tr><th>Name</th><th>Role</th><th>Dept</th><th>Availability</th><th>Utilization</th><th>Certifications</th><th>Start</th><th>End</th><th>Tasks</th><th>Done</th><th>Completion</th><th>Status</th><th></th></tr></thead>
      <tbody>${team.map(m=>{
        const tc2=tasks.filter(t=>t.assignee===m.name).length;
        const dc=tasks.filter(t=>t.assignee===m.name&&t.status==='done').length;
        const pct2=tc2>0?Math.round(dc/tc2*100):0;
        const res=(AppState.data.resources||[]).find(r=>r.id===m.resourceId)||{};
        return`<tr>
        <td><div style="display:flex;align-items:center;gap:8px">${avatarH(m.name,30)}<div><div style="font-weight:600;font-size:12px">${m.name}</div><div style="font-size:9px;color:var(--text-muted)">${res.dept||m.department||'—'}</div></div></div></td>
        <td><input class="form-input" value="${m.role||''}" style="min-width:110px;height:26px;font-size:11px" oninput="updateTeamMember('${m.id}','role',this.value)" onchange="updateTeamMember('${m.id}','role',this.value)"></td>
        <td style="font-size:11px">${m.department||res.dept||'—'}</td>
        <td>${sb(res.availability||'—')}</td>
        <td><div style="display:flex;align-items:center;gap:5px;min-width:75px">
          <div class="progress-bar" style="flex:1;height:5px"><div class="progress-fill" style="width:${res.utilization||0}%;background:${(res.utilization||0)>90?'var(--accent-red)':(res.utilization||0)>70?'var(--accent-amber)':'var(--accent-blue)'}"></div></div>
          <span style="font-size:10px;font-family:var(--font-mono)">${res.utilization||0}%</span>
        </div></td>
        <td>${(res.certifications||[]).map(c=>`<span class="badge badge-purple" style="font-size:8px;margin:1px">${c}</span>`).join('')||'<span style="color:var(--text-muted);font-size:10px">—</span>'}</td>
        <td style="font-size:11px;font-family:var(--font-mono)">${m.startDate||'—'}</td>
        <td style="font-size:11px;font-family:var(--font-mono)">${m.endDate||'—'}</td>
        <td style="font-family:var(--font-mono);text-align:center">${tc2}</td>
        <td style="font-family:var(--font-mono);text-align:center;color:var(--accent-green)">${dc}</td>
        <td><div style="display:flex;align-items:center;gap:5px;min-width:75px"><div class="progress-bar" style="flex:1;height:5px"><div class="progress-fill" style="width:${pct2}%;background:${pColor(pct2)}"></div></div><span style="font-size:10px;font-family:var(--font-mono)">${pct2}%</span></div></td>
        <td><select class="form-select" style="height:30px;font-size:11px;min-width:90px" onchange="updateTeamMember('${m.id}','status',this.value)">${['active','standby','on-leave','completed','removed'].map(s=>`<option value="${s}" ${m.status===s?'selected':''}>${s}</option>`).join('')}</select></td>
        <td><button class="btn btn-danger btn-sm btn-icon" onclick="removeTeamMember('${m.id}')"><i class="fas fa-user-minus"></i></button></td>
      </tr>`;}).join('')}
      </tbody></table></div>`
    :`<div style="padding:14px;text-align:center;color:var(--text-muted);font-size:12px">No team members. <button class="btn btn-primary btn-sm" onclick="showAddTeamMember('${pid}')">Add Member</button></div>`}
  </div>

  <!-- Resource sections by type -->
  ${Object.entries(byType).map(([type,arr])=>buildTypeSection(type,arr)).join('')}

  <!-- Quick actions -->
  <div style="display:flex;gap:10px;flex-wrap:wrap">
    <button class="btn btn-primary btn-sm" onclick="detailTab='allocation';renderDetailTab()"><i class="fas fa-chart-bar"></i> Manage Allocations</button>
    <button class="btn btn-success btn-sm" onclick="showLogUsage('${pid}','Issue')"><i class="fas fa-sign-out-alt"></i> Issue Resources</button>
    <button class="btn btn-warning btn-sm" onclick="showLogUsage('${pid}','Return')"><i class="fas fa-undo"></i> Return Resources</button>
  </div>`}`;
}



function renderDetailCosts(){
  const costs=(AppState.data.costs||[]).filter(c=>c.projectId===detailProjectId);
  const p=(AppState.data.projects||[]).find(x=>x.id===detailProjectId);
  const totP=costs.reduce((s,c)=>s+c.planned,0);
  const totA=costs.reduce((s,c)=>s+c.actual,0);
  $('#detailTabContent').innerHTML=`
  <div class="grid grid-3" style="margin-bottom:14px">
    <div class="evm-card"><div class="evm-value" style="color:var(--accent-blue)">${fmtCur(p?.budget||0)}</div><div class="evm-label">Contract Budget</div></div>
    <div class="evm-card"><div class="evm-value" style="color:${totA>totP?'var(--accent-red)':'var(--accent-green)'}">${fmtCur(totA)}</div><div class="evm-label">Total Actual Cost</div></div>
    <div class="evm-card"><div class="evm-value" style="color:var(--accent-amber)">${fmtCur(totP-totA)}</div><div class="evm-label">Remaining Budget</div></div>
  </div>
  <div class="card">
    <div class="section-header" style="margin-bottom:12px">
      <div class="section-title">Cost Breakdown Register</div>
      <button class="btn btn-primary btn-sm" onclick="showAddCostItem()"><i class="fas fa-plus"></i> Add Cost Item</button>
    </div>
    ${costs.length?`<div class="table-wrap"><table>
      <thead><tr><th>ID</th><th>Category</th><th>Description</th><th>Planned (₱)</th><th>Actual (₱)</th><th>Variance (₱)</th><th>Utilization</th><th></th></tr></thead>
      <tbody>${costs.map(c=>{
        const v=c.planned-c.actual,pct=Math.round((c.actual/c.planned)*100);
        return`<tr>
          <td style="font-size:10px;font-family:var(--font-mono)">${c.id}</td>
          <td><span class="badge badge-purple">${c.category}</span></td>
          <td><input class="form-input" value="${c.description}" style="min-width:140px;height:28px;font-size:11px" onchange="updateCostField('${c.id}','description',this.value)"></td>
          <td><input class="form-input" type="number" value="${c.planned}" style="width:110px;height:28px;font-size:11px;font-family:var(--font-mono)" onchange="updateCostField('${c.id}','planned',+this.value)"></td>
          <td><input class="form-input" type="number" value="${c.actual}" style="width:110px;height:28px;font-size:11px;font-family:var(--font-mono)" onchange="updateCostField('${c.id}','actual',+this.value)"></td>
          <td style="font-family:var(--font-mono);color:${v>=0?'var(--accent-green)':'var(--accent-red)'};font-weight:600">${v>=0?'+':''}${fmtCur(Math.abs(v))}</td>
          <td><div style="display:flex;align-items:center;gap:5px"><div class="progress-bar" style="width:60px;height:5px"><div class="progress-fill" style="width:${Math.min(100,pct)}%;background:${pct>90?'var(--accent-red)':pct>70?'var(--accent-amber)':'var(--accent-green)'}"></div></div><span style="font-size:10px;font-family:var(--font-mono)">${pct}%</span></div></td>
          <td><button class="btn btn-danger btn-sm btn-icon" onclick="deleteCostItem('${c.id}')"><i class="fas fa-trash"></i></button></td>
        </tr>`;}).join('')}
        <tr style="background:var(--bg-hover);font-weight:700">
          <td colspan="3" style="font-size:12px;padding:10px 11px">TOTAL</td>
          <td style="font-family:var(--font-mono)">${fmtCur(totP)}</td>
          <td style="font-family:var(--font-mono);color:${totA>totP?'var(--accent-red)':'var(--accent-green)'}">${fmtCur(totA)}</td>
          <td style="font-family:var(--font-mono);color:${totP-totA>=0?'var(--accent-green)':'var(--accent-red)'};font-weight:700">${totP-totA>=0?'+':''}${fmtCur(Math.abs(totP-totA))}</td>
          <td colspan="2"></td>
        </tr>
      </tbody></table></div>`:`<div class="empty-state"><i class="fas fa-dollar-sign"></i><p>No cost records. Click "Add Cost Item".</p></div>`}
  </div>`;
}

function updateCostField(id,field,val){
  const c=(AppState.data.costs||[]).find(c=>c.id===id);
  if(c){c[field]=val;AppState.save();}
}
function deleteCostItem(id){ return requestOrDelete('costs', id); }
function showAddCostItem(){
  $('#genericModalTitle').textContent='Add Cost Item';
  $('#genericModalBody').innerHTML=`<div class="form-grid">
    <div class="form-group"><label class="form-label">Category</label><select class="form-select" id="gCat">${_getDropdown('cost_categories').map(c=>`<option>${c}</option>`).join('')}</select></div>
    <div class="form-group"><label class="form-label">Description</label><input class="form-input" id="gDesc" placeholder="Cost description"></div>
    <div class="form-group"><label class="form-label">Planned (₱)</label><input class="form-input" type="number" id="gPlan" placeholder="0"></div>
    <div class="form-group"><label class="form-label">Actual (₱)</label><input class="form-input" type="number" id="gAct" placeholder="0"></div>
  </div>`;
  $('#genericModalFooter').innerHTML=`<button class="btn btn-secondary" onclick="closeModal('genericModal')">Cancel</button><button class="btn btn-primary" onclick="saveDetailCostItem()">Add</button>`;
  openModal('genericModal');
}
function saveDetailCostItem(){
  const c={id:'CST-'+((AppState.data.costs||[]).length+1).toString().padStart(3,'0'),projectId:detailProjectId,category:$('#gCat').value,description:$('#gDesc').value,planned:parseFloat($('#gPlan').value)||0,actual:parseFloat($('#gAct').value)||0};
  AppState.data.costs.push(c);AppState.save();closeModal('genericModal');renderDetailCosts();showToast('Cost item added','success');
}

function renderDetailDocs(){
  const docs=(AppState.data.documents||[]).filter(d=>d.projectId===detailProjectId);
  $('#detailTabContent').innerHTML=`
  <div class="card">
    <div class="section-header" style="margin-bottom:12px">
      <div class="section-title">Project Documents</div>
      <div style="display:flex;gap:7px">
        <div class="search-bar"><i class="fas fa-search"></i><input type="text" placeholder="Search..." oninput="filterDetailDocs(this.value)"></div>
        <button class="btn btn-primary btn-sm" onclick="uploadDocForProject('${detailProjectId}')"><i class="fas fa-upload"></i> Upload Document</button>
      </div>
    </div>
    <div class="table-wrap"><table>
      <thead><tr><th>Doc Number</th><th>Rev</th><th>Document Name</th><th>Category</th><th>Author</th><th>Date</th><th>Size</th><th>Status</th><th></th></tr></thead>
      <tbody id="detailDocBody">${renderDetailDocRows(docs)}</tbody>
    </table></div>
    ${!docs.length?'':''}
  </div>`;
}

function renderDetailDocRows(docs){
  if(!docs.length)return`<tr><td colspan="9"><div class="empty-state"><i class="fas fa-folder-open"></i><p>No documents. Click "Upload Document".</p></div></td></tr>`;
  return docs.map(d=>`<tr>
    <td style="font-size:10px;font-family:var(--font-mono);font-weight:700">${d.number}</td>
    <td><input class="form-input" value="${d.rev}" style="width:48px;height:26px;font-size:11px" onchange="updateDocField('${d.id}','rev',this.value)"></td>
    <td><input class="form-input" value="${d.name}" style="min-width:160px;height:26px;font-size:12px;font-weight:500" onchange="updateDocField('${d.id}','name',this.value)"></td>
    <td><select class="form-select" style="height:30px;font-size:11px" onchange="updateDocField('${d.id}','category',this.value)">${_getDropdown('doc_categories').map(c=>`<option ${d.category===c?'selected':''}>${c}</option>`).join('')}</select></td>
    <td><input class="form-input" value="${d.author}" style="min-width:100px;height:26px;font-size:11px" onchange="updateDocField('${d.id}','author',this.value)"></td>
    <td><input class="form-input" type="date" value="${safeDate(d.date)}" style="height:26px;font-size:11px" onchange="updateDocField('${d.id}','date',this.value)"></td>
    <td style="font-size:11px;color:var(--text-secondary)">${d.size}</td>
    <td><select class="form-select" style="height:30px;font-size:11px" onchange="updateDocField('${d.id}','status',this.value)">${['review','approved','issued','superseded'].map(s=>`<option value="${s}" ${d.status===s?'selected':''}>${s}</option>`).join('')}</select></td>
    <td><div style="display:flex;gap:3px">
      ${(d.fileUrl||d.fileWebUrl)?`
        <button class="btn btn-secondary btn-sm btn-icon" title="View" onclick="viewDoc('${d.id}')"><i class="fas fa-eye"></i></button>
        <button class="btn btn-secondary btn-sm btn-icon" title="Download" onclick="downloadDoc('${d.id}')"><i class="fas fa-download"></i></button>
      `:d.legacyFile?`
        <button class="btn btn-warning btn-sm btn-icon" title="Re-upload required (legacy file: ${d.legacyFileName||''})" onclick="attachFileToProjectDoc('${d.id}')"><i class="fas fa-exclamation-triangle"></i></button>
        <span style="font-size:9px;color:var(--accent-amber);align-self:center">Re-upload</span>
      `:`
        <button class="btn btn-primary btn-sm btn-icon" title="Attach file" onclick="attachFileToProjectDoc('${d.id}')"><i class="fas fa-paperclip"></i></button>
      `}
      ${(_currentUserProfile&&_currentUserProfile.isAdmin)?`
        <button class="btn btn-danger btn-sm btn-icon" onclick="deleteDetailDoc('${d.id}')" title="Delete (Admin)"><i class="fas fa-trash"></i></button>
      `:d.deletionRequested?`
        <button class="btn btn-warning btn-sm btn-icon" onclick="cancelDeletionRequest('${d.id}');renderDetailDocs()" title="Cancel deletion request"><i class="fas fa-undo"></i></button>
      `:`
        <button class="btn btn-secondary btn-sm btn-icon" onclick="deleteDetailDoc('${d.id}')" title="Request deletion"><i class="fas fa-flag"></i></button>
      `}
    </div></td>
  </tr>`).join('');
}

// ── Attach file to existing project document ───────────────
function attachFileToProjectDoc(id){
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
      d.fileData=null;
      AppState.save();
      renderDetailDocs();
      showToast('File uploaded: '+file.name,'success');
    }catch(err){
      console.error('[Upload] Error:',err);
      showToast('Upload failed: '+err.message,'error',6000);
    }
  };
  inp.click();
}

function updateDocField(id,field,val){const d=(AppState.data.documents||[]).find(d=>d.id===id);if(d){d[field]=val;AppState.save();}}
async function deleteDetailDoc(id){
  const isAdmin=(_currentUserProfile&&_currentUserProfile.isAdmin)||false;
  if(!isAdmin){
    // Non-admin: route to deletion request
    requestDocDeletion(id);
    renderDetailDocs();
    return;
  }
  const d=(AppState.data.documents||[]).find(x=>x.id===id);
  if(!d)return;
  if(!confirm('Delete this document? This cannot be undone.\nDocument: '+d.name))return;
  if(d.spDriveId&&d.spItemId){
    try{ await spDeleteFile(d.spDriveId,d.spItemId); }catch(e){console.warn('SP delete:',e.message);}
  }
  AppState.data.documents=(AppState.data.documents||[]).filter(x=>x.id!==id);
  AppState.save();renderDetailDocs();showToast('Document deleted','warning');
}
function filterDetailDocs(v){const docs=(AppState.data.documents||[]).filter(d=>d.projectId===detailProjectId&&(!v||d.name.toLowerCase().includes(v.toLowerCase())||d.number.toLowerCase().includes(v.toLowerCase())));if($('#detailDocBody'))$('#detailDocBody').innerHTML=renderDetailDocRows(docs);}

function uploadDocForProject(pid){
  const inp=document.createElement('input');inp.type='file';
  inp.accept='.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.dwg,.dxf,.jpg,.jpeg,.png,.txt,.csv,.zip';
  inp.onchange=async e=>{
    const file=e.target.files[0];if(!file)return;
    if(file.size>100*1024*1024){showToast('File too large — max 100 MB','error');return;}
    if(!_spConnected){showToast('SharePoint not connected — cannot upload files','error',5000);return;}
    const ext=file.name.split('.').pop().toLowerCase();
    const catMap={pdf:'Engineering',doc:'Management',docx:'Management',xls:'Finance',xlsx:'Finance',dwg:'Engineering',dxf:'Engineering',jpg:'Photos',jpeg:'Photos',png:'Photos'};
    const user=_currentUserProfile?.name||'Admin';
    showToast('Uploading '+file.name+' to SharePoint...','info',3000);
    try{
      const result=await spUploadFile(file,pid);
      const d={
        id:'DOC-'+Date.now().toString(36).toUpperCase(),
        projectId:pid,
        name:file.name.replace(/\.[^/.]+$/,''),
        number:pid+'-DOC-'+Date.now().toString().slice(-4),
        fileName:file.name,
        fileType:ext,
        fileUrl:result.url,
        fileWebUrl:result.webUrl,
        spDriveId:result.driveId,
        spItemId:result.itemId,
        rev:'A',
        category:catMap[ext]||'General',
        status:'review',
        author:user,
        date:new Date().toISOString().split('T')[0],
        size:_formatFileSize(file.size)
      };
      if(!AppState.data.documents)AppState.data.documents=[];
      _markNewlyCreated(d);
      AppState.data.documents.push(d);
      AppState.save();renderDetailDocs();
      showToast('Uploaded: '+file.name+' ('+_formatFileSize(file.size)+')','success',4000);
    }catch(err){
      console.error('[Upload] Error:',err);
      showToast('Upload failed: '+err.message,'error',6000);
    }
  };
  inp.click();
}

function renderDetailQAQC(){
  const items=(AppState.data.qaqc||[]).filter(q=>q.projectId===detailProjectId);
  const tc={Inspection:'badge-blue',NCR:'badge-red',Punch:'badge-amber',Test:'badge-cyan',Audit:'badge-purple'};
  $('#detailTabContent').innerHTML=`
  <div class="grid grid-4" style="margin-bottom:14px">
    ${sc('fas fa-clipboard-check','Total IRs',items.length,'All records','#388bfd','rgba(56,139,253,.15)')}
    ${sc('fas fa-check-double','Approved',items.filter(q=>q.status==='approved').length,'Passed','#3fb950','rgba(63,185,80,.15)')}
    ${sc('fas fa-exclamation-triangle','Open NCRs',items.filter(q=>q.type==='NCR'&&q.status==='open').length,'Non-conformances','#f85149','rgba(248,81,73,.15)')}
    ${sc('fas fa-list','Punch Items',items.filter(q=>q.type==='Punch'&&q.status==='open').length,'Open punch','#f0a450','rgba(240,164,80,.15)')}
  </div>
  <div class="card">
    <div class="section-header" style="margin-bottom:12px">
      <div class="section-title">Inspection &amp; QA Records</div>
      <button class="btn btn-primary btn-sm" onclick="showAddInspection(detailProjectId)"><i class="fas fa-plus"></i> New IR</button>
    </div>
    <div class="table-wrap"><table>
      <thead><tr><th>ID</th><th>Type</th><th>Description</th><th>Inspector</th><th>Date</th><th>Discipline</th><th>Result</th><th>Status</th><th></th></tr></thead>
      <tbody>${items.length?items.map(q=>`<tr>
        <td style="font-size:10px;font-family:var(--font-mono);font-weight:700">${q.id}</td>
        <td><span class="badge ${tc[q.type]||'badge-gray'}">${q.type}</span></td>
        <td style="font-size:11px;max-width:190px">${q.description}</td>
        <td><div style="display:flex;align-items:center;gap:5px">${avatarH(q.inspector,22)}<span style="font-size:11px">${q.inspector}</span></div></td>
        <td style="font-size:11px;font-family:var(--font-mono)">${q.date}</td>
        <td><span class="badge badge-gray">${q.discipline}</span></td>
        <td><select class="form-select" style="height:30px;font-size:11px" onchange="updateQAQCField('${q.id}','result',this.value)"><option value="" ${!q.result?'selected':''}>Pending</option><option ${q.result==='Pass'?'selected':''}>Pass</option><option ${q.result==='Fail'?'selected':''}>Fail</option></select></td>
        <td><select class="form-select" style="height:30px;font-size:11px" onchange="updateQAQCField('${q.id}','status',this.value)">${['pending','approved','open','closed'].map(s=>`<option value="${s}" ${q.status===s?'selected':''}>${s}</option>`).join('')}</select></td>
        <td><button class="btn btn-danger btn-sm btn-icon" onclick="deleteQAQCItem('${q.id}')"><i class="fas fa-trash"></i></button></td>
      </tr>`).join(''):`<tr><td colspan="9"><div class="empty-state"><i class="fas fa-clipboard-check"></i><p>No QA/QC records for this project.</p></div></td></tr>`}
      </tbody>
    </table></div>
  </div>`;
}
function updateQAQCField(id,field,val){const q=(AppState.data.qaqc||[]).find(q=>q.id===id);if(q){q[field]=val;AppState.save();showToast('Updated','success');}}
function deleteQAQCItem(id){ return requestOrDelete('qaqc', id); }

function renderDetailRisks(){
  const risks=(AppState.data.risks||[]).filter(r=>r.projectId===detailProjectId);
  $('#detailTabContent').innerHTML=`
  <div class="grid grid-3" style="margin-bottom:14px">
    ${sc('fas fa-shield-alt','Total Risks',risks.length,'This project','#f0a450','rgba(240,164,80,.15)')}
    ${sc('fas fa-exclamation-triangle','Active',risks.filter(r=>r.status==='active').length,'Require action','#f85149','rgba(248,81,73,.15)')}
    ${sc('fas fa-check-circle','Closed/Mitigated',risks.filter(r=>r.status!=='active').length,'Resolved','#3fb950','rgba(63,185,80,.15)')}
  </div>
  <div class="card">
    <div class="section-header" style="margin-bottom:12px">
      <div class="section-title">Risk Register</div>
      <button class="btn btn-primary btn-sm" onclick="showAddRisk(detailProjectId)"><i class="fas fa-plus"></i> New Risk</button>
    </div>
    <div class="table-wrap"><table>
      <thead><tr><th>ID</th><th>Description</th><th>Category</th><th>P</th><th>I</th><th>Score</th><th>Mitigation</th><th>Owner</th><th>Due</th><th>Status</th><th></th></tr></thead>
      <tbody>${risks.length?risks.map(r=>{const score=r.probability*r.impact;const sc2=score>=15?'var(--accent-red)':score>=8?'var(--accent-amber)':'var(--accent-green)';return`<tr>
        <td style="font-size:10px;font-family:var(--font-mono)">${r.id}</td>
        <td style="font-size:11px;max-width:160px">${r.description}</td>
        <td><span class="badge badge-purple">${r.category}</span></td>
        <td><input class="form-input" type="number" value="${r.probability}" min="1" max="5" style="width:44px;height:26px;font-size:11px;text-align:center" onchange="updateRiskField('${r.id}','probability',+this.value)"></td>
        <td><input class="form-input" type="number" value="${r.impact}" min="1" max="5" style="width:44px;height:26px;font-size:11px;text-align:center" onchange="updateRiskField('${r.id}','impact',+this.value)"></td>
        <td><span class="badge" style="background:${sc2}22;color:${sc2};font-size:12px;font-weight:700">${score}</span></td>
        <td style="font-size:10px;color:var(--text-secondary);max-width:130px">${r.mitigation.substring(0,45)}...</td>
        <td style="font-size:11px">${r.owner.split(' ')[0]}</td>
        <td style="font-size:10px;font-family:var(--font-mono);color:${isOverdue(r.dueDate)?'var(--accent-red)':'inherit'}">${r.dueDate}</td>
        <td><select class="form-select" style="height:30px;font-size:11px" onchange="updateRiskField('${r.id}','status',this.value)">${['active','mitigated','closed'].map(s=>`<option value="${s}" ${r.status===s?'selected':''}>${s}</option>`).join('')}</select></td>
        <td><button class="btn btn-danger btn-sm btn-icon" onclick="deleteDetailRisk('${r.id}')"><i class="fas fa-trash"></i></button></td>
      </tr>`;}).join(''):`<tr><td colspan="11"><div class="empty-state"><i class="fas fa-shield-alt"></i><p>No risks for this project.</p></div></td></tr>`}
      </tbody>
    </table></div>
  </div>`;
}
function updateRiskField(id,field,val){const r=(AppState.data.risks||[]).find(r=>r.id===id);if(r){r[field]=val;AppState.save();}}
function deleteDetailRisk(id){if(requestOrDelete('risks',id)){renderDetailRisks();buildSidebar();}}

function renderDetailActions(){
  const actions=(AppState.data.actions||[]).filter(a=>a.projectId===detailProjectId);
  $('#detailTabContent').innerHTML=`
  <div class="grid grid-3" style="margin-bottom:14px">
    ${sc('fas fa-clipboard-list','Total Actions',actions.length,'This project','#388bfd','rgba(56,139,253,.15)')}
    ${sc('fas fa-exclamation-circle','Overdue',actions.filter(a=>a.status==='overdue').length,'Past due','#f85149','rgba(248,81,73,.15)')}
    ${sc('fas fa-check','Closed',actions.filter(a=>a.status==='closed').length,'Resolved','#3fb950','rgba(63,185,80,.15)')}
  </div>
  <div class="card">
    <div class="section-header" style="margin-bottom:12px">
      <div class="section-title">Action Items</div>
      <button class="btn btn-primary btn-sm" onclick="showAddAction(detailProjectId)"><i class="fas fa-plus"></i> New Action</button>
    </div>
    <div class="table-wrap"><table>
      <thead><tr><th>ID</th><th>Description</th><th>Assignee</th><th>Source</th><th>Due Date</th><th>Priority</th><th>Status</th><th></th></tr></thead>
      <tbody>${actions.length?actions.map(a=>`<tr>
        <td style="font-size:10px;font-family:var(--font-mono)">${a.id}</td>
        <td><input class="form-input" value="${a.description}" style="min-width:180px;height:26px;font-size:12px" onchange="updateActionField('${a.id}','description',this.value)"></td>
        <td><input class="form-input" value="${a.assignee}" style="min-width:110px;height:26px;font-size:11px" onchange="updateActionField('${a.id}','assignee',this.value)"></td>
        <td><span class="badge badge-gray">${a.source}</span></td>
        <td><input class="form-input" type="date" value="${safeDate(a.dueDate)}" style="height:26px;font-size:11px" onchange="updateActionField('${a.id}','dueDate',this.value)"></td>
        <td><select class="form-select" style="height:30px;font-size:11px" onchange="updateActionField('${a.id}','priority',this.value)">${['critical','high','medium','low'].map(p=>`<option value="${p}" ${a.priority===p?'selected':''}>${p}</option>`).join('')}</select></td>
        <td><select class="form-select" style="height:30px;font-size:11px" onchange="updateActionField('${a.id}','status',this.value);buildSidebar()">${['open','inprogress','overdue','closed'].map(s=>`<option value="${s}" ${a.status===s?'selected':''}>${s}</option>`).join('')}</select></td>
        <td><button class="btn btn-danger btn-sm btn-icon" onclick="deleteDetailAction('${a.id}')"><i class="fas fa-trash"></i></button></td>
      </tr>`).join(''):`<tr><td colspan="8"><div class="empty-state"><i class="fas fa-clipboard-list"></i><p>No action items for this project.</p></div></td></tr>`}
      </tbody>
    </table></div>
  </div>`;
}
function updateActionField(id,field,val){const a=(AppState.data.actions||[]).find(a=>a.id===id);if(a){a[field]=val;AppState.save();}}
function deleteDetailAction(id){if(requestOrDelete('actions',id)){renderDetailActions();buildSidebar();}}



// ── RESOURCE ALLOCATION TAB ────────────────────────────────

// ── RESOURCE ALLOCATION TAB ────────────────────────────────
// ── ALLOCATION CATEGORIES ─────────────────────────────────────
const ALLOC_CATS=[
  {id:'manpower',  label:'Manpower',         icon:'fa-hard-hat',    color:'#f85149',
   test:a=>a.resourceType==='Manpower'||/manpow|labour|labor|welder|fitter|technician|operator|inspector|engineer|supervisor|foreman|leadman|helper|laborer|crew|scaffolder|rigger|painter|electrician|mechanic|driver|coordinator/i.test(a.resourceName)},
  {id:'tools',     label:'Tools & Equipment',icon:'fa-cog',         color:'#f0a450',
   test:a=>['Equipment','Tool','Vehicle'].includes(a.resourceType)&&!/ppe|helmet|vest|glove|goggle|harness|boot|mask|coverall/i.test(a.resourceName)},
  {id:'ppe',       label:'PPE',              icon:'fa-shield-alt',  color:'#39d3f2',
   test:a=>/ppe|personal protective|safety helmet|hard hat|safety vest|hi.vis|glove|goggle|harness|safety boot|respirator|face shield|ear plug|coverall/i.test(a.resourceName+(a.role||''))},
  {id:'mob_demob', label:'Mobilization & Demobilization',icon:'fa-truck-moving',color:'#bc8cff',
   test:a=>/mobiliz|demobiliz|mob.demob/i.test(a.resourceName+(a.role||''))},
  {id:'cons_mat',  label:'Consumables & Materials',icon:'fa-boxes', color:'#3fb950',
   test:a=>['Consumable','Material'].includes(a.resourceType)},
  {id:'procurement',label:'Procurement',     icon:'fa-shopping-cart',color:'#388bfd',
   test:a=>a.resourceType==='Procurement'||a._procId},
  {id:'misc',      label:'Miscellaneous',    icon:'fa-layer-group', color:'#8b949e',
   test:()=>true},
];
function getAllocCat(a){return ALLOC_CATS.find(c=>c.test(a))||ALLOC_CATS[ALLOC_CATS.length-1];}

let _aSearch='',_aLogSearch='',_aCatFilter='all';


// ── Clean ghost-project allocations ──────────────────────────────────────
function cleanGhostAllocations(pid){
  AppState.ensureData();
  const existingProjIds=new Set((AppState.data.projects||[]).map(p=>p.id));
  existingProjIds.add('N/A'); // N/A is valid (unassigned)
  
  const ghosts=(AppState.data.resourceAllocations||[]).filter(a=>!existingProjIds.has(a.projectId));
  if(!ghosts.length){showToast('No ghost-project allocations found ✓','success');return;}
  
  const msg=`Found ${ghosts.length} allocation(s) assigned to non-existent projects:\n\n`+
    [...new Set(ghosts.map(a=>a.projectId))].slice(0,10).join('\n')+
    (ghosts.length>10?'\n...':'')+'\n\nReassign ALL to current project ('+pid+')?';
  
  if(!confirm(msg))return;
  
  ghosts.forEach(a=>{a.projectId=pid;});
  AppState.save();
  renderDetailAllocation();
  showToast(ghosts.length+' ghost allocations moved to '+pid,'success',4000);
}

function renderDetailAllocation(){
  const pid=detailProjectId;
  const p=(AppState.data.projects||[]).find(x=>x.id===pid);
  if(!p)return;
  AppState.ensureData();
  if(!AppState.data.resourceAllocations)AppState.data.resourceAllocations=[];
  if(!AppState.data.resourceUsageLogs)AppState.data.resourceUsageLogs=[];
  const allocs=(AppState.data.resourceAllocations||[]).filter(a=>a.projectId===pid);
  const logs=(AppState.data.resourceUsageLogs||[]).filter(l=>l.projectId===pid);

  const usageMap={};
  logs.forEach(l=>{
    if(!usageMap[l.allocationId])usageMap[l.allocationId]={issued:0,returned:0};
    if(l.transactionType==='Return')usageMap[l.allocationId].returned+=l.quantity;
    else usageMap[l.allocationId].issued+=l.quantity;
  });

  const totCost=allocs.reduce((s,a)=>s+(a.plannedCost||0),0);
  const totAct=allocs.reduce((s,a)=>s+(a.actualCost||0),0);
  const totUsed=Object.values(usageMap).reduce((s,u)=>s+(u.issued-u.returned),0);
  const cur=(AppState.data.settings?.currency)||'PHP';
  const sym={PHP:'₱',USD:'$',EUR:'€',SAR:'﷼',GBP:'£',SGD:'S$'}[cur]||cur+' ';
  const isAdm=!!(_currentUserProfile&&_currentUserProfile.isAdmin)||(!!_currentUser&&typeof isAdminEmail==='function'&&isAdminEmail(_currentUser.email||''));

  const catCounts={};
  allocs.forEach(a=>{const c=getAllocCat(a);catCounts[c.id]=(catCounts[c.id]||0)+1;});

  $('#detailTabContent').innerHTML=`
  <div class="grid grid-4" style="margin-bottom:14px">
    ${sc('fas fa-layer-group','Total Allocated',allocs.length,'Line items','#388bfd','rgba(56,139,253,.15)')}
    ${sc('fas fa-sign-out-alt','Total Issued',totUsed+' units','Net issued','#3fb950','rgba(63,185,80,.15)')}
    ${sc('fas fa-dollar-sign','Planned Cost',sym+fmtNum(totCost),'All resources','#f0a450','rgba(240,164,80,.15)')}
    ${sc('fas fa-dollar-sign','Actual Cost',sym+fmtNum(totAct),totCost>0?Math.round(totAct/totCost*100)+'% of plan':'—','#bc8cff','rgba(188,140,255,.15)')}
  </div>

  <div class="card" style="margin-bottom:14px">
    <div class="section-header" style="margin-bottom:8px">
      <div class="section-title">Allocation Register <span style="font-size:11px;font-weight:400;color:var(--text-secondary)">— ${allocs.length} items</span></div>
      <div style="display:flex;gap:5px;flex-wrap:wrap">
        ${isAdm?`<button class="btn btn-danger btn-sm" onclick="showDeleteAllAllocationsModal&&showDeleteAllAllocationsModal('${pid}')" title="Admin: Delete All"><i class="fas fa-trash-alt"></i></button>`:''}
        <button class="btn btn-secondary btn-sm" onclick="importAllocExcel('${pid}')"><i class="fas fa-file-excel" style="color:#217346"></i> Import</button>
        <button class="btn btn-secondary btn-sm" onclick="exportAllocExcel('${pid}')"><i class="fas fa-download"></i> Export</button>
        <button class="btn btn-secondary btn-sm" style="color:var(--accent-amber)" onclick="cleanGhostAllocations('${pid}')" title="Remove allocation records assigned to non-existent projects and re-assign to this project"><i class="fas fa-ghost"></i> Fix Ghost</button>
        <button class="btn btn-primary btn-sm" onclick="showAllocateResource('${pid}')"><i class="fas fa-plus"></i> Add</button>
      </div>
    </div>
    <div style="display:flex;gap:8px;margin-bottom:10px;flex-wrap:wrap">
      <div style="flex:1;min-width:160px;position:relative">
        <i class="fas fa-search" style="position:absolute;left:9px;top:50%;transform:translateY(-50%);color:var(--text-muted);font-size:11px;pointer-events:none"></i>
        <input id="allocSrch" class="form-input" placeholder="Search resource, role, ID..." value="${_aSearch||''}"
          oninput="_aSearch=this.value;renderAllocBody('${pid}')" style="padding-left:28px;height:32px;font-size:12px">
      </div>
      <select id="allocCatSel" class="form-select" style="height:32px;font-size:12px;min-width:155px" onchange="_aCatFilter=this.value;renderAllocBody('${pid}')">
        <option value="all">All Categories</option>
        ${ALLOC_CATS.filter(c=>catCounts[c.id]>0).map(c=>`<option value="${c.id}"${_aCatFilter===c.id?' selected':''}>${c.label} (${catCounts[c.id]})</option>`).join('')}
      </select>
      <button class="btn btn-secondary btn-sm" onclick="_aSearch='';_aCatFilter='all';document.getElementById('allocSrch').value='';document.getElementById('allocCatSel').value='all';renderAllocBody('${pid}')" title="Clear"><i class="fas fa-times"></i></button>
    </div>
    <div style="overflow:auto;max-height:418px;border:1px solid var(--border);border-radius:6px">
      <table style="width:100%;border-collapse:collapse;font-size:11px;min-width:900px">
        <thead style="position:sticky;top:0;z-index:3;background:var(--bg-hover)">
          <tr style="border-bottom:2px solid var(--border)">
            <th style="padding:6px 8px">ID</th><th style="padding:6px 8px;min-width:130px">Resource</th>
            <th style="padding:6px 8px">Category</th><th style="padding:6px 8px">Unit</th>
            <th style="padding:6px 8px;min-width:100px">Role/Scope</th>
            <th style="padding:6px 8px;text-align:center">Alloc.</th>
            <th style="padding:6px 8px;text-align:center">Issued</th>
            <th style="padding:6px 8px;text-align:center">Ret.</th>
            <th style="padding:6px 8px;text-align:center">Net</th>
            <th style="padding:6px 8px;text-align:center">Left</th>
            <th style="padding:6px 8px;text-align:right;white-space:nowrap">Planned(${sym})</th>
            <th style="padding:6px 8px;text-align:right;white-space:nowrap">Actual(${sym})</th>
            <th style="padding:6px 8px">Status</th>
            <th style="padding:6px 8px"></th>
          </tr>
        </thead>
        <tbody id="allocBodyRows"></tbody>
      </table>
    </div>
    <div style="display:flex;gap:16px;padding:7px 12px;background:var(--bg-hover);border-top:2px solid var(--border);font-size:11px;font-weight:700;flex-wrap:wrap">
      <span id="allocFootCount">TOTAL (${allocs.length})</span>
      <span style="margin-left:auto;font-family:var(--font-mono)">Planned: ${sym}${fmtNum(totCost)}</span>
      <span style="font-family:var(--font-mono)">Actual: ${sym}${fmtNum(totAct)}</span>
    </div>
  </div>

  ${(()=>{
    const varLogs=logs.filter(l=>l.category&&l.category!=='Budgeted');
    if(!varLogs.length)return'';
    const varAlt=varLogs.filter(l=>l.category==='Variation - Alternative');
    const varUnb=varLogs.filter(l=>l.category==='Variation - Unbudgeted');
    return`<div class="card" style="margin-bottom:14px;border-left:3px solid var(--accent-amber)">
    <div class="section-header" style="margin-bottom:10px">
      <div class="section-title"><i class="fas fa-exclamation-triangle" style="color:var(--accent-amber);margin-right:6px"></i>Variation Register <span style="font-size:11px;font-weight:400;color:var(--text-secondary)">${varLogs.length} variation${varLogs.length!==1?'s':''}</span></div>
      <div style="display:flex;gap:8px">
        <span style="font-size:11px;padding:3px 10px;border-radius:10px;background:rgba(240,164,80,.15);color:var(--accent-amber)"><i class="fas fa-exchange-alt" style="margin-right:4px"></i>${varAlt.length} Alternative</span>
        <span style="font-size:11px;padding:3px 10px;border-radius:10px;background:rgba(248,81,73,.15);color:var(--accent-red)"><i class="fas fa-exclamation-triangle" style="margin-right:4px"></i>${varUnb.length} Unbudgeted</span>
      </div>
    </div>
    <div style="overflow:auto;max-height:280px;border:1px solid var(--border);border-radius:6px">
      <table style="width:100%;border-collapse:collapse;font-size:11px;min-width:700px">
        <thead style="position:sticky;top:0;z-index:3;background:var(--bg-hover)">
          <tr style="border-bottom:2px solid var(--border)">
            <th style="padding:6px 8px">Log ID</th><th style="padding:6px 8px">Date</th><th style="padding:6px 8px">Type</th>
            <th style="padding:6px 8px">Resource</th><th style="padding:6px 8px">Variation Code</th>
            <th style="padding:6px 8px">Authorized By</th><th style="padding:6px 8px">Qty</th>
            <th style="padding:6px 8px">Justification</th>
          </tr>
        </thead>
        <tbody>${varLogs.slice().reverse().map((l,i)=>{
          const isUnb=l.category==='Variation - Unbudgeted';
          const col=isUnb?'var(--accent-red)':'var(--accent-amber)';
          return`<tr style="border-top:1px solid var(--border);background:${i%2?'rgba(255,255,255,.02)':'transparent'}">
            <td style="padding:4px 8px;font-size:10px;font-family:var(--font-mono)">${l.id}</td>
            <td style="padding:4px 8px;font-size:11px;white-space:nowrap">${l.date}</td>
            <td style="padding:4px 8px"><span style="background:${col}22;color:${col};font-size:9px;padding:2px 7px;border-radius:10px;font-weight:700">${isUnb?'Unbudgeted':'Alt'}</span></td>
            <td style="padding:4px 8px;font-weight:500;max-width:130px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${l.resourceName}</td>
            <td style="padding:4px 8px;font-size:10px">${l.variationCode||'—'}</td>
            <td style="padding:4px 8px;font-size:11px">${l.variationAuthorizedBy||'—'}</td>
            <td style="padding:4px 8px;font-family:var(--font-mono);font-weight:700;color:${col}">${l.quantity} ${l.unit||''}</td>
            <td style="padding:4px 8px;font-size:10px;color:var(--text-secondary);max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${String(l.variationReason||'').replace(/"/g,'&quot;')}">${l.variationReason||'—'}</td>
          </tr>`;
        }).join('')}</tbody>
      </table>
    </div>
  </div>`;
  })()}

  <div class="card">
    <div class="section-header" style="margin-bottom:8px">
      <div class="section-title">Transaction Log <span style="font-size:11px;font-weight:400;color:var(--text-secondary)">${logs.length} entries</span></div>
      <div style="display:flex;gap:5px;flex-wrap:wrap">
        <button class="btn btn-secondary btn-sm" onclick="importUsageLogExcel('${pid}')"><i class="fas fa-file-excel" style="color:#217346"></i> Import</button>
        <button class="btn btn-secondary btn-sm" onclick="exportUsageLogExcel('${pid}')"><i class="fas fa-download"></i> Export</button>
        <button class="btn btn-success btn-sm" onclick="showLogUsage('${pid}','Issue')"><i class="fas fa-sign-out-alt"></i> Issue</button>
        <button class="btn btn-warning btn-sm" onclick="showLogUsage('${pid}','Return')"><i class="fas fa-undo"></i> Return</button>
      </div>
    </div>
    <div style="position:relative;margin-bottom:8px">
      <i class="fas fa-search" style="position:absolute;left:9px;top:50%;transform:translateY(-50%);color:var(--text-muted);font-size:11px;pointer-events:none"></i>
      <input id="logSrch" class="form-input" placeholder="Search log ID, resource, issued-to..." value="${_aLogSearch||''}"
        oninput="_aLogSearch=this.value;renderLogBody()" style="padding-left:28px;height:32px;font-size:12px">
    </div>
    <div style="overflow:auto;max-height:418px;border:1px solid var(--border);border-radius:6px">
      <table style="width:100%;border-collapse:collapse;font-size:11px;min-width:800px">
        <thead style="position:sticky;top:0;z-index:3;background:var(--bg-hover)">
          <tr style="border-bottom:2px solid var(--border)">
            <th style="padding:6px 8px">Log ID</th><th style="padding:6px 8px">Date</th><th style="padding:6px 8px">Category</th>
            <th style="padding:6px 8px">Type</th><th style="padding:6px 8px;min-width:120px">Resource</th>
            <th style="padding:6px 8px">Category</th>
            <th style="padding:6px 8px;text-align:center">Qty</th><th style="padding:6px 8px">Unit</th>
            <th style="padding:6px 8px">Issued/Ret.To</th><th style="padding:6px 8px">Approved</th>
            <th style="padding:6px 8px">Ref.</th><th style="padding:6px 8px">Notes</th>
            <th style="padding:6px 8px"></th>
          </tr>
        </thead>
        <tbody id="logBodyRows"></tbody>
      </table>
    </div>
  </div>`;

  // Store refs for search/filter callbacks
  window._adAllocs=allocs; window._adUsageMap=usageMap;
  window._adLogs=logs.slice().reverse(); window._adPid=pid; window._adSym=sym;
  renderAllocBody(pid);
  renderLogBody();
}

function renderAllocBody(pid){
  pid=pid||window._adPid||detailProjectId;
  const allocs=window._adAllocs||(AppState.data.resourceAllocations||[]).filter(a=>a.projectId===pid);
  const umap=window._adUsageMap||{};
  const sym=window._adSym||'₱';
  const srch=(_aSearch||'').toLowerCase();
  const cf=_aCatFilter||'all';

  const filtered=allocs.filter(a=>{
    if(cf!=='all'&&getAllocCat(a).id!==cf)return false;
    if(srch){const h=(a.resourceName+' '+a.resourceType+' '+(a.role||'')+' '+a.id).toLowerCase();if(!h.includes(srch))return false;}
    return true;
  });

  const groups={};const order=[];
  filtered.forEach(a=>{const c=getAllocCat(a);if(!groups[c.id]){groups[c.id]={c,rows:[]};order.push(c.id);}groups[c.id].rows.push(a);});

  let html='';
  if(!filtered.length){
    html=`<tr><td colspan="14" style="padding:20px;text-align:center;color:var(--text-muted)">${srch||cf!=='all'?'No results — try a different search or filter':'No allocations yet — click Add'}</td></tr>`;
  }else{
    order.forEach(cid=>{
      const{c,rows}=groups[cid];
      html+=`<tr style="background:${c.color}14"><td colspan="14" style="padding:5px 10px;font-size:10px;font-weight:700;color:${c.color};border-top:2px solid ${c.color}55;letter-spacing:.5px"><i class="fas ${c.icon}" style="margin-right:6px"></i>${c.label.toUpperCase()} <span style="font-weight:400;color:var(--text-muted)">— ${rows.length} item(s)</span></td></tr>`;
      rows.forEach((a,ri)=>{
        const u=umap[a.id]||{issued:0,returned:0};
        const net=u.issued-u.returned,left=a.allocatedQty-net;
        const pct=a.allocatedQty>0?Math.min(100,Math.round(net/a.allocatedQty*100)):0;
        const pc=pct>90?'var(--accent-red)':pct>70?'var(--accent-amber)':'var(--accent-green)';
        const nm=String(a.resourceName||'').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
        html+=`<tr style="border-top:1px solid var(--border);background:${ri%2?'rgba(255,255,255,.02)':'transparent'}">
<td style="padding:4px 8px;font-size:10px;font-family:var(--font-mono)">${a.id}</td>
<td style="padding:4px 8px;max-width:160px"><div style="font-weight:500;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${nm}">${a.resourceName}</div>${a.resourceId?`<div style="font-size:9px;color:var(--text-muted)">${a.resourceId}</div>`:''}</td>
<td style="padding:4px 8px"><span style="background:${c.color}22;color:${c.color};font-size:9px;padding:1px 6px;border-radius:4px;white-space:nowrap">${c.label}</span></td>
<td style="padding:4px 8px"><input class="form-input" value="${String(a.unit||'unit').replace(/"/g,'&quot;')}" style="width:58px;height:24px;font-size:11px;text-align:center" onchange="updateAlloc('${a.id}','unit',this.value)"></td>
<td style="padding:4px 8px"><input class="form-input" value="${String(a.role||'').replace(/"/g,'&quot;')}" style="min-width:90px;height:24px;font-size:11px" onchange="updateAlloc('${a.id}','role',this.value)"></td>
<td style="padding:4px 8px;text-align:center"><input class="form-input" type="number" value="${a.allocatedQty}" style="width:65px;height:24px;font-family:var(--font-mono);font-weight:600;text-align:right" onchange="updateAlloc('${a.id}','allocatedQty',+this.value);setTimeout(renderDetailAllocation,700)"></td>
<td style="padding:4px 8px;text-align:center;font-family:var(--font-mono);font-weight:600;color:var(--accent-blue)">${u.issued}</td>
<td style="padding:4px 8px;text-align:center;font-family:var(--font-mono);font-weight:600;color:var(--accent-amber)">${u.returned}</td>
<td style="padding:4px 8px;text-align:center"><span style="font-family:var(--font-mono);font-size:12px;font-weight:700;color:${pc}">${net}</span><div style="height:3px;background:var(--border);border-radius:2px;margin-top:2px;width:40px;margin:2px auto 0"><div style="height:3px;border-radius:2px;width:${pct}%;background:${pc}"></div></div></td>
<td style="padding:4px 8px;text-align:center;font-family:var(--font-mono);font-weight:700;color:${left<0?'var(--accent-red)':left===0?'var(--accent-amber)':'inherit'}">${left}</td>
<td style="padding:4px 8px;text-align:right"><input class="form-input" type="number" value="${a.plannedCost}" style="width:88px;height:24px;font-family:var(--font-mono);font-size:11px;text-align:right" onchange="updateAlloc('${a.id}','plannedCost',+this.value);setTimeout(renderDetailAllocation,700)"></td>
<td style="padding:4px 8px;text-align:right"><input class="form-input" type="number" value="${a.actualCost}" style="width:88px;height:24px;font-family:var(--font-mono);font-size:11px;text-align:right;${a.actualCost>a.plannedCost?'border-color:var(--accent-red)':''}" onchange="updateAlloc('${a.id}','actualCost',+this.value);setTimeout(renderDetailAllocation,700)"></td>
<td style="padding:4px 8px"><select class="form-select" style="height:24px;font-size:10px;min-width:80px" onchange="updateAlloc('${a.id}','status',this.value)">${['active','planned','completed','on-hold'].map(s=>`<option value="${s}"${a.status===s?' selected':''}>${s}</option>`).join('')}</select></td>
<td style="padding:4px 6px"><div style="display:flex;gap:2px">
<button class="btn btn-success btn-sm" style="font-size:9px;padding:2px 5px" onclick="showLogUsage('${pid}','Issue','${a.id}')"><i class="fas fa-sign-out-alt"></i></button>
<button class="btn btn-warning btn-sm" style="font-size:9px;padding:2px 5px" onclick="showLogUsage('${pid}','Return','${a.id}')"><i class="fas fa-undo"></i></button>
<button class="btn btn-danger btn-sm btn-icon" onclick="deleteAlloc('${a.id}')" title="Delete"><i class="fas fa-trash"></i></button>
</div></td></tr>`;
      });
    });
  }
  const tb=document.getElementById('allocBodyRows');if(tb)tb.innerHTML=html;
  const fc=document.getElementById('allocFootCount');if(fc)fc.textContent=`SHOWING ${filtered.length} of ${allocs.length}`;
}

function renderLogBody(){
  const logs=window._adLogs||[];
  const srch=(_aLogSearch||'').toLowerCase();
  const filtered=srch?logs.filter(l=>(l.id+' '+l.resourceName+' '+l.resourceType+' '+(l.issuedTo||'')+' '+(l.reference||'')).toLowerCase().includes(srch)):logs;
  let html='';
  if(!filtered.length){
    html=`<tr><td colspan="12" style="padding:20px;text-align:center;color:var(--text-muted)">${srch?'No results':'No transactions yet. Use Issue / Return buttons.'}</td></tr>`;
  }else{
    filtered.forEach((l,i)=>{
      const c=getAllocCat({resourceName:l.resourceName,resourceType:l.resourceType,role:''});
      html+=`<tr style="border-top:1px solid var(--border);background:${i%2?'rgba(255,255,255,.02)':'transparent'}">
<td style="padding:4px 8px;font-size:10px;font-family:var(--font-mono);white-space:nowrap">${l.id}</td>
<td style="padding:4px 8px;font-size:11px;font-family:var(--font-mono);white-space:nowrap">${l.date}</td>
<td style="padding:4px 8px"><span class="badge ${l.transactionType==='Return'?'badge-amber':'badge-green'}" style="font-size:10px"><i class="fas ${l.transactionType==='Return'?'fa-undo':'fa-sign-out-alt'}" style="margin-right:3px"></i>${l.transactionType}</span></td>
<td style="padding:4px 8px">${(()=>{const cat=l.category||'Budgeted';const catMap={'Budgeted':['var(--accent-green)','fa-check-circle'],'Variation - Alternative':['var(--accent-amber)','fa-exchange-alt'],'Variation - Unbudgeted':['var(--accent-red)','fa-exclamation-triangle']};const[col,ico]=catMap[cat]||catMap['Budgeted'];const tip=cat!=='Budgeted'&&l.variationReason?`title="${(l.variationCode||'')+': '+(l.variationReason||'').replace(/"/g,'&quot;')}"`:'' ;return`<span ${tip} style="background:${col}22;color:${col};font-size:9px;padding:2px 7px;border-radius:10px;white-space:nowrap;font-weight:600;cursor:${cat!=='Budgeted'?'help':'default'}"><i class="fas ${ico}" style="margin-right:3px;font-size:8px"></i>${cat==='Budgeted'?'Budgeted':cat==='Variation - Alternative'?'Var-Alt':'Var-Unbud'}</span>`;})()}</td>
<td style="padding:4px 8px;font-weight:500;max-width:150px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${String(l.resourceName||'').replace(/"/g,'&quot;')}">${l.resourceName}</td>
<td style="padding:4px 8px"><span style="background:${c.color}22;color:${c.color};font-size:9px;padding:1px 6px;border-radius:4px;white-space:nowrap">${c.label}</span></td>
<td style="padding:4px 8px;text-align:center;font-family:var(--font-mono);font-weight:700;font-size:12px;color:${l.transactionType==='Return'?'var(--accent-amber)':'var(--accent-green)'}">
${l.transactionType==='Return'?'-':'+'}${l.quantity}</td>
<td style="padding:4px 8px"><span class="badge badge-blue" style="font-size:9px">${l.unit||'unit'}</span></td>
<td style="padding:4px 8px;font-size:11px">${l.issuedTo||'—'}</td>
<td style="padding:4px 8px;font-size:11px;color:var(--text-secondary)">${l.approvedBy||'—'}</td>
<td style="padding:4px 8px;font-size:10px;font-family:var(--font-mono);color:var(--text-secondary)">${l.reference||'—'}</td>
<td style="padding:4px 8px;font-size:10px;color:var(--text-secondary);max-width:120px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${l.notes||'—'}</td>
<td style="padding:4px 6px;white-space:nowrap"><button class="btn btn-secondary btn-sm btn-icon" onclick="editUsageLog('${l.id}')" title="Edit"><i class="fas fa-pen"></i></button> <button class="btn btn-danger btn-sm btn-icon" onclick="deleteUsageLog('${l.id}')"><i class="fas fa-trash"></i></button></td>
</tr>`;
    });
  }
  const tb=document.getElementById('logBodyRows');if(tb)tb.innerHTML=html;
}


function updateAlloc(id,field,val){
  if(!AppState.data.resourceAllocations)AppState.data.resourceAllocations=[];
  const a=(AppState.data.resourceAllocations||[]).find(a=>a.id===id);
  if(a){a[field]=val;AppState.save();}
}
function deleteAlloc(id){ return requestOrDelete('resourceAllocations', id); }

// ── ALLOCATE RESOURCE MODAL ────────────────────────────────
function showAllocateResource(pid){
  const p=(AppState.data.projects||[]).find(x=>x.id===pid);
  window._allocPid=pid;
  window._allocTabIdx=0;
  window._selectedAlloc=null;
  $('#genericModalTitle').textContent='Add Resource Allocation — '+pid;
  $('#genericModalBody').innerHTML=`
  <div class="tabs" id="allocTabs" style="margin-bottom:12px">
    ${['Personnel','Equipment','Tools','Vehicles','Manpower','Consumables','Materials'].map((t,i)=>`<div class="tab ${i===0?'active':''}" onclick="switchAllocTab(${i})">${t}</div>`).join('')}
  </div>
  <div id="allocTabBody" style="margin-bottom:12px"></div>
  <div style="padding:8px;background:rgba(56,139,253,.08);border-radius:6px;margin-bottom:12px;font-size:12px;color:var(--text-secondary)" id="arSelected">&#8593; Select a resource from the list above</div>
  <div class="form-grid">
    <div class="form-group"><label class="form-label">Role / Scope of Work</label><input class="form-input" id="arRole" placeholder="e.g., Structural Lead, Cutting"></div>
    <div class="form-group"><label class="form-label">Unit *</label><input class="form-input" id="arUnit" placeholder="pcs, kg, m, hr, day, set..."></div>
    <div class="form-group"><label class="form-label">Allocated Quantity *</label><input class="form-input" type="number" id="arQty" value="0" min="0" placeholder="0"></div>
    <div class="form-group"><label class="form-label">Status</label><select class="form-select" id="arStatus"><option>planned</option><option selected>active</option><option>on-hold</option></select></div>
    <div class="form-group"><label class="form-label">Planned Cost (₱)</label><input class="form-input" type="number" id="arPC" value="0"></div>
    <div class="form-group"><label class="form-label">Actual Cost (₱)</label><input class="form-input" type="number" id="arAC" value="0"></div>
    <div class="form-group" style="grid-column:1/-1"><label class="form-label">Notes</label><input class="form-input" id="arNotes" placeholder="Scope, remarks, conditions..."></div>
  </div>`;
  renderAllocTabContent();
  $('#genericModalFooter').innerHTML=`<button class="btn btn-secondary" onclick="closeModal('genericModal')">Cancel</button><button class="btn btn-primary" onclick="saveAllocation()"><i class="fas fa-save"></i> Add Allocation</button>`;
  openModal('genericModal');
}

function switchAllocTab(idx){
  window._allocTabIdx=idx;
  window._selectedAlloc=null;
  $$('#allocTabs .tab').forEach((t,i)=>t.classList.toggle('active',i===idx));
  const sel=$('#arSelected');if(sel)sel.innerHTML='&#8593; Select a resource from the list above';
  const roleEl=$('#arRole');if(roleEl)roleEl.value='';
  const unitEl=$('#arUnit');if(unitEl)unitEl.value='';
  renderAllocTabContent();
}

function renderAllocTabContent(){
  const idx=window._allocTabIdx||0;
  const d=AppState.data;

  // Manpower tab (idx=4): use Trade/Discipline Masterlist, not manpower tracking records
  const tradeList=(d.trades||[]).map(t=>{
    const obj=typeof t==='string'?{name:t,dailyRate:0,monthlyRate:0,overtimeRate:0}:t;
    return{id:'TRADE-'+obj.name.replace(/\s+/g,'-').toUpperCase(),
      name:obj.name,dailyRate:obj.dailyRate||0,monthlyRate:obj.monthlyRate||0,overtimeRate:obj.overtimeRate||0};
  });

  const lists=[d.resources||[],d.equipment||[],d.tools||[],d.vehicles||[],tradeList,d.consumables||[],d.materials||[]];
  const types=['Personnel','Equipment','Tool','Vehicle','Manpower','Consumable','Material'];
  const icons=['fa-user','fa-cog','fa-wrench','fa-truck','fa-hard-hat','fa-boxes','fa-layer-group'];
  const colors=['#388bfd','#f0a450','#bc8cff','#39d3f2','#f85149','#3fb950','#fb8f44'];

  const formatRow=r=>{
    if(idx===0)(()=>{const allocd=(window._resourceAllocMap&&window._resourceAllocMap[r.id])||[];return`${r.name} — ${r.role||''} · ${r.dept} · Util: ${r.utilization}%${allocd.length?' <span style="color:var(--accent-green);font-size:10px">● '+allocd.join(',')+' </span>':''}`;})();
    if(idx===4){
      const rates=[];
      if(r.dailyRate>0)rates.push('Day: ₱'+Number(r.dailyRate).toLocaleString());
      if(r.overtimeRate>0)rates.push('OT: ₱'+r.overtimeRate+'/hr');
      return r.name+(rates.length?' <span style="color:var(--accent-green);font-size:10px">· '+rates.join(' · ')+'</span>':'<span style="color:var(--text-muted);font-size:10px"> · No rates set</span>');
    }
    if(idx===5){
      // Consumable: check if enrolled in warehouse for live qty
      const whLink=(AppState.data.warehouseItems||[]).find(w=>!w._deleted&&w.itemMasterId===r.id);
      const liveQty=whLink&&typeof _whCalcQty==='function'?_whCalcQty(whLink.id):null;
      const qtyLabel=liveQty?`Avail: ${liveQty.qtyAvailable} ${r.unit} (WH)`:`Stock: ${r.qtyOnHand} ${r.unit}`;
      const low=liveQty?liveQty.qtyAvailable<=0:(r.qtyOnHand<=r.minStock);
      return`${r.name} [${r.category}] · ${qtyLabel}${low?' ⚠':''} · Min: ${r.minStock}`;
    }
    if(idx===6){
      const whLink=(AppState.data.warehouseItems||[]).find(w=>!w._deleted&&w.itemMasterId===r.id);
      const liveQty=whLink&&typeof _whCalcQty==='function'?_whCalcQty(whLink.id):null;
      const qtyLabel=liveQty?`Avail: ${liveQty.qtyAvailable} ${r.unit} (WH)`:`Qty: ${r.qty} ${r.unit}`;
      return`${r.name} [${r.unit}] · ${qtyLabel} · Status: ${r.status}`;
    }
    return`${r.name} [${r.category||''}] · ${r.status||''}`;
  };
  const getUnit=r=>{
    if(idx===5)return r.unit||'pcs';
    if(idx===6)return r.unit||'unit';
    if(idx===0)return 'person';
    if(idx===4)return 'day';
    return 'unit';
  };
  const getName=r=>r.name||r.trade||'';
  const getId=r=>r.id;

  const list=lists[idx]||[];
  if(!list.length){
    const emptyMsg=idx===4
      ?'No trades in masterlist. Go to Manpower module → Trade Masterlist button to add trades.'
      :`No ${types[idx]} records found. Add them in Resources / Materials first.`;
    $('#allocTabBody').innerHTML=`<div class="empty-state" style="padding:12px"><i class="fas ${icons[idx]}"></i><p>${emptyMsg}</p></div>`;
    return;
  }

  $('#allocTabBody').innerHTML=`<div style="max-height:165px;overflow-y:auto;border:1px solid var(--border);border-radius:6px">
  ${list.map((r,i)=>`<div style="padding:8px 12px;cursor:pointer;border-bottom:1px solid var(--border);display:flex;align-items:center;gap:8px" id="arOpt${i}" onclick="selectAllocResource('${getId(r)}','${getName(r).replace(/'/g,"&#39;").replace(/"/g,"&quot;")}','${types[idx]}','${getUnit(r)}',${i},${idx===4?(r.dailyRate||0):0})">
    <i class="fas ${icons[idx]}" style="color:${colors[idx]};width:14px;text-align:center;flex-shrink:0"></i>
    <div style="flex:1;min-width:0">
      <div style="font-size:12px;font-weight:500;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${formatRow(r)}</div>
      ${idx===5?(()=>{const wh=(AppState.data.warehouseItems||[]).find(w=>!w._deleted&&w.itemMasterId===r.id);const lq=wh&&typeof _whCalcQty==='function'?_whCalcQty(wh.id):null;const low=lq?lq.qtyAvailable<=0:(r.qtyOnHand<=r.minStock);return`<div style="font-size:10px;color:${low?'var(--accent-red)':'var(--text-muted)'}">Supplier: ${r.supplier||'—'}${wh?` · WH Avail: ${lq?.qtyAvailable} ${r.unit}`:''}${low?' · ⚠ Low/None':''}</div>`;})():''}
      ${idx===6?(()=>{const wh=(AppState.data.warehouseItems||[]).find(w=>!w._deleted&&w.itemMasterId===r.id);const lq=wh&&typeof _whCalcQty==='function'?_whCalcQty(wh.id):null;return`<div style="font-size:10px;color:${r.status==='pending'?'var(--accent-amber)':r.status==='delivered'?'var(--accent-green)':'var(--text-muted)'}">Supplier: ${r.supplier||'—'}${wh?` · WH Avail: ${lq?.qtyAvailable} ${r.unit}`:''}· ${r.status}</div>`;})():''}
    </div>
  </div>`).join('')}
  </div>`;
}

window._selectedAlloc=null;
function selectAllocResource(id,name,type,unit,optIdx,dailyRate){
  window._selectedAlloc={id,name,type,unit};
  $$('[id^=arOpt]').forEach(el=>el.style.background='');
  const el=$(`#arOpt${optIdx}`);
  if(el)el.style.background='rgba(56,139,253,.15)';
  const infoEl=$('#arSelected');
  if(infoEl)infoEl.innerHTML=`<strong style="color:var(--accent-blue)">✓ Selected:</strong> <span style="font-weight:600">${name}</span> <span class="badge badge-blue">${type}</span>`;
  // Auto-fill unit
  const unitEl=$('#arUnit');if(unitEl&&unit)unitEl.value=unit;
  const roleEl=$('#arRole');
  if(roleEl&&!roleEl.value){
    if(type==='Manpower'){
      roleEl.value=name; // pre-fill role with trade name
    }else{
      const res=(AppState.data.resources||[]).find(r=>r.id===id);
      if(res)roleEl.value=res.role||res.dept||type;
    }
  }
  // Auto-fill planned cost from trade daily rate if available
  if(type==='Manpower'&&dailyRate>0){
    const pcEl=$('#arPC');
    const qtyEl=$('#arQty');
    const qty=parseFloat(qtyEl?.value)||1;
    if(pcEl&&(!pcEl.value||pcEl.value==='0'))pcEl.value=dailyRate*qty;
    // Update cost when qty changes
    if(qtyEl){
      qtyEl.oninput=function(){
        const q=parseFloat(this.value)||1;
        const pc=$('#arPC');
        if(pc)pc.value=(dailyRate*q).toFixed(2);
      };
    }
  }
}

function saveAllocation(){
  if(!window._selectedAlloc){showToast('Select a resource first','error');return;}
  if(!AppState.data.resourceAllocations)AppState.data.resourceAllocations=[];
  const qty=parseFloat($('#arQty')?.value)||0;
  if(qty<=0){showToast('Allocated Quantity must be > 0','error');return;}
  const alloc={
    id:'RA-'+((AppState.data.resourceAllocations||[]).length+1).toString().padStart(3,'0'),
    projectId:window._allocPid,
    resourceId:window._selectedAlloc.id,
    resourceName:window._selectedAlloc.name,
    resourceType:window._selectedAlloc.type,
    unit:$('#arUnit')?.value||window._selectedAlloc.unit||'unit',
    role:$('#arRole')?.value||'',
    allocatedQty:qty,
    plannedCost:parseFloat($('#arPC')?.value)||0,
    actualCost:parseFloat($('#arAC')?.value)||0,
    status:$('#arStatus')?.value||'active',
    notes:$('#arNotes')?.value||''
  };
  AppState.data.resourceAllocations.push(alloc);
  AppState.save();
  if(typeof _syncManpowerAllocations==='function')_syncManpowerAllocations();closeModal('genericModal');
  window._selectedAlloc=null;
  renderDetailAllocation();showToast('Resource allocated','success');
}

// ── USAGE / RETURN LOG (multi-item) ────────────────────────
function _UL_VAR_CODES(){return _getDropdown('variation_codes');}
const _UL_TYPE_COLORS={Equipment:'#f0a450',Tool:'#bc8cff',Vehicle:'#39d3f2',Consumable:'#3fb950',Material:'#fb8f44',Manpower:'#f85149',Personnel:'#388bfd'};

function _ulBuildResources(pid){
  const allResources=[];
  const POOLS=[
    {key:'equipment',type:'Equipment'},{key:'tools',type:'Tool'},{key:'vehicles',type:'Vehicle'},
    {key:'consumables',type:'Consumable'},{key:'materials',type:'Material'},
    {key:'manpower',type:'Manpower'},{key:'resources',type:'Personnel'},
  ];
  POOLS.forEach(({key,type})=>{
    (AppState.data[key]||[]).forEach(r=>{
      allResources.push({id:r.id,name:r.name||'',type,unit:r.unit||'pcs',source:key});
    });
  });
  (AppState.data.resourceAllocations||[]).filter(a=>a.projectId===pid).forEach(a=>{
    if(!allResources.find(r=>r.id===a.resourceId)){
      allResources.push({id:a.resourceId||a.id,name:a.resourceName,type:a.resourceType,unit:a.unit||'pcs',source:'allocation'});
    }
  });
  return allResources;
}

function _ulLineHtml(line,i){
  const isVar=line.category!=='Budgeted';
  const allocs=(AppState.data.resourceAllocations||[]).filter(a=>a.projectId===window._ulPid);
  const col=isVar?(line.category==='Variation - Unbudgeted'?'var(--accent-red)':'var(--accent-amber)'):'var(--border)';
  return`<div style="margin-bottom:10px;padding:12px;background:var(--bg-card);border:1px solid ${col};border-radius:10px">
  <div style="display:flex;align-items:center;gap:8px;margin-bottom:10px">
    <span style="font-size:11px;font-weight:700;padding:2px 10px;border-radius:20px;background:var(--bg-hover);color:var(--text-secondary)">Line ${i+1}</span>
    ${window._ulLines.length>1?`<button class="btn btn-danger btn-sm btn-icon" onclick="_ulRemoveLine(${i})" style="margin-left:auto;padding:2px 7px"><i class="fas fa-times"></i></button>`:''}
  </div>
  <div style="margin-bottom:10px">
    <label class="form-label">Resource *</label>
    ${line.resource?`
    <div style="padding:7px 12px;background:rgba(56,139,253,.08);border:1px solid rgba(56,139,253,.25);border-radius:7px;display:flex;align-items:center;justify-content:space-between">
      <div>
        <span style="font-weight:700;font-size:12px">${line.resource.name}</span>
        <span style="margin-left:6px;font-size:10px;padding:1px 7px;border-radius:10px;background:${_UL_TYPE_COLORS[line.resource.type]||'#888'}22;color:${_UL_TYPE_COLORS[line.resource.type]||'#888'}">${line.resource.type}</span>
        <span style="margin-left:5px;font-size:10px;color:var(--text-muted);font-family:var(--font-mono)">${line.resource.id}</span>
      </div>
      <button class="btn btn-secondary btn-sm" onclick="_ulClearRes(${i})" style="font-size:10px;padding:2px 8px">✕ Clear</button>
    </div>`:`
    <div style="position:relative">
      <i class="fas fa-search" style="position:absolute;left:10px;top:50%;transform:translateY(-50%);color:var(--text-muted);font-size:12px;pointer-events:none"></i>
      <input class="form-input" id="ulRS_${i}" placeholder="Search resource name, ID or type..." style="padding-left:32px"
        oninput="_ulFilterRes(${i},this.value)" autocomplete="off">
      <div id="ulRR_${i}" style="display:none;position:absolute;z-index:300;width:100%;margin-top:2px;background:var(--bg-card);border:1px solid var(--border);border-radius:8px;max-height:160px;overflow-y:auto;box-shadow:0 4px 20px rgba(0,0,0,.4)"></div>
    </div>`}
  </div>
  <div class="form-grid">
    <div class="form-group">
      <label class="form-label">Category *</label>
      <select class="form-select" onchange="_ulCatChange(${i},this.value)">
        <option value="Budgeted" ${line.category==='Budgeted'?'selected':''}>✓ Budgeted</option>
        <option value="Variation - Alternative" ${line.category==='Variation - Alternative'?'selected':''}>⇄ Variation – Alternative</option>
        <option value="Variation - Unbudgeted" ${line.category==='Variation - Unbudgeted'?'selected':''}>⚠ Variation – Unbudgeted</option>
      </select>
    </div>
    <div class="form-group">
      <label class="form-label">Link to Allocation</label>
      <select class="form-select" id="ulAL_${i}" onchange="_ulPrefill(${i},this.value)">
        <option value="">— Optional —</option>
        ${allocs.map(a=>`<option value="${a.id}" ${a.id===line.allocId?'selected':''}>${a.id} · ${a.resourceName} [${a.unit}]</option>`).join('')}
      </select>
    </div>
    <div class="form-group">
      <label class="form-label">Quantity *</label>
      <input class="form-input" type="number" id="ulQT_${i}" value="${line.qty||''}" min="0.01" step="any" placeholder="0"
        oninput="_ulLV(${i},'qty',this.value)">
    </div>
    <div class="form-group">
      <label class="form-label">Unit</label>
      <input class="form-input" id="ulUN_${i}" value="${line.unit||'unit'}" oninput="_ulLV(${i},'unit',this.value)">
    </div>
  </div>
  ${isVar?`
  <div style="margin-top:10px;padding:10px 12px;background:rgba(248,81,73,.06);border:1px solid rgba(248,81,73,.3);border-radius:8px">
    <div style="font-size:10px;font-weight:700;color:var(--accent-red);margin-bottom:8px"><i class="fas fa-exclamation-triangle" style="margin-right:4px"></i>Variation Justification Required</div>
    <div class="form-grid">
      <div class="form-group">
        <label class="form-label">Variation Code <span style="color:var(--accent-red)">*</span></label>
        <select class="form-select" id="ulVC_${i}" onchange="_ulLV(${i},'varCode',this.value)">
          <option value="">— Select —</option>
          ${_UL_VAR_CODES().map(v=>`<option value="${v}" ${line.varCode===v?'selected':''}>${v}</option>`).join('')}
        </select>
      </div>
      <div class="form-group">
        <label class="form-label">Authorized By <span style="color:var(--accent-red)">*</span></label>
        <input class="form-input" id="ulVA_${i}" value="${line.varAuth||''}" placeholder="Name of approver"
          oninput="_ulLV(${i},'varAuth',this.value)">
      </div>
      <div class="form-group" style="grid-column:1/-1">
        <label class="form-label">Justification <span style="color:var(--accent-red)">*</span></label>
        <textarea class="form-input" id="ulVR_${i}" rows="2" style="resize:vertical"
          placeholder="Why did this variation occur?" oninput="_ulLV(${i},'varReason',this.value)">${line.varReason||''}</textarea>
      </div>
    </div>
  </div>`:''}
  <div id="ulBAL_${i}" style="margin-top:8px;font-size:11px"></div>
</div>`;
}

function _ulRenderLines(){
  const c=$('#ulLinesContainer');if(!c)return;
  c.innerHTML=window._ulLines.map((l,i)=>_ulLineHtml(l,i)).join('');
  // Restore balance for lines that have allocations
  window._ulLines.forEach((l,i)=>{if(l.allocId)_ulShowBal(i,l.allocId);});
}

function _ulFilterRes(i,query){
  const results=$(`#ulRR_${i}`);if(!results)return;
  if(!query||query.length<1){results.style.display='none';return;}
  const q=query.toLowerCase();
  const matches=(window._ulAllResources||[]).filter(r=>
    r.name.toLowerCase().includes(q)||r.id.toLowerCase().includes(q)||r.type.toLowerCase().includes(q)
  ).slice(0,12);
  if(!matches.length){results.style.display='none';return;}
  results.style.display='block';
  results.innerHTML=matches.map(r=>`
    <div onclick="_ulSelectRes(${i},${JSON.stringify(r).replace(/"/g,'&quot;')})"
      style="padding:8px 12px;cursor:pointer;display:flex;align-items:center;gap:10px;border-bottom:1px solid var(--border)"
      onmouseover="this.style.background='var(--bg-hover)'" onmouseout="this.style.background=''">
      <div style="flex:1;min-width:0">
        <div style="font-size:12px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${r.name}</div>
        <div style="font-size:10px;color:var(--text-muted)">${r.id} · ${r.unit}</div>
      </div>
      <span style="font-size:10px;padding:1px 7px;border-radius:10px;background:${_UL_TYPE_COLORS[r.type]||'#888'}22;color:${_UL_TYPE_COLORS[r.type]||'#888'};white-space:nowrap">${r.type}</span>
    </div>`).join('');
}

function _ulSelectRes(i,r){
  window._ulLines[i].resource=r;
  window._ulLines[i].unit=r.unit||'unit';
  const pid=window._ulPid;
  const matchAlloc=(AppState.data.resourceAllocations||[]).find(a=>a.projectId===pid&&(a.resourceId===r.id||a.resourceName===r.name));
  if(matchAlloc)window._ulLines[i].allocId=matchAlloc.id;
  _ulRenderLines();
  if(matchAlloc)_ulShowBal(i,matchAlloc.id);
}

function _ulClearRes(i){
  window._ulLines[i].resource=null;
  window._ulLines[i].allocId='';
  _ulRenderLines();
}

function _ulCatChange(i,val){
  window._ulLines[i].category=val;
  _ulRenderLines();
}

function _ulLV(i,field,val){window._ulLines[i][field]=val;}

function _ulPrefill(i,allocId){
  window._ulLines[i].allocId=allocId;
  if(!allocId){const b=$(`#ulBAL_${i}`);if(b)b.innerHTML='';return;}
  const a=(AppState.data.resourceAllocations||[]).find(x=>x.id===allocId);
  if(!a)return;
  if(!window._ulLines[i].resource){
    window._ulLines[i].resource={id:a.resourceId,name:a.resourceName,type:a.resourceType,unit:a.unit};
    window._ulLines[i].unit=a.unit||'unit';
    _ulRenderLines();
  } else {
    const uEl=$(`#ulUN_${i}`);if(uEl)uEl.value=a.unit||'unit';
    window._ulLines[i].unit=a.unit||'unit';
  }
  _ulShowBal(i,allocId);
}

function _ulShowBal(i,allocId){
  const a=(AppState.data.resourceAllocations||[]).find(x=>x.id===allocId);if(!a)return;
  const logs=(AppState.data.resourceUsageLogs||[]).filter(l=>l.allocationId===allocId);
  const issued=logs.filter(l=>l.transactionType==='Issue').reduce((s,l)=>s+l.quantity,0);
  const returned=logs.filter(l=>l.transactionType==='Return').reduce((s,l)=>s+l.quantity,0);
  const rem=a.allocatedQty-(issued-returned);
  const el=$(`#ulBAL_${i}`);
  if(el)el.innerHTML=`<div style="padding:5px 8px;background:var(--bg-hover);border-radius:6px;font-size:10px;display:flex;gap:12px;flex-wrap:wrap">
    <span>Allocated: <strong>${a.allocatedQty} ${a.unit}</strong></span>
    <span>Issued: <strong style="color:var(--accent-blue)">${issued}</strong></span>
    <span>Returned: <strong style="color:var(--accent-amber)">${returned}</strong></span>
    <span>Remaining: <strong style="color:${rem<0?'var(--accent-red)':rem===0?'var(--accent-amber)':'var(--accent-green)'}">${rem} ${a.unit}</strong></span>
  </div>`;
}

function _ulAddLine(){
  window._ulLines.push({resource:null,allocId:'',category:'Budgeted',qty:'',unit:'unit',varCode:'',varAuth:'',varReason:''});
  _ulRenderLines();
  // Scroll to new line
  const c=$('#ulLinesContainer');if(c)c.lastElementChild?.scrollIntoView({behavior:'smooth',block:'nearest'});
}

function _ulRemoveLine(i){
  if(window._ulLines.length<=1)return;
  window._ulLines.splice(i,1);
  _ulRenderLines();
}

function showLogUsage(pid,txType='Issue',preselectedAllocId=''){
  if(!AppState.data.resourceAllocations)AppState.data.resourceAllocations=[];
  const isReturn=txType==='Return';
  window._ulPid=pid;
  window._ulTxType=txType;
  window._ulAllResources=_ulBuildResources(pid);
  window._ulLines=[{resource:null,allocId:preselectedAllocId||'',category:'Budgeted',qty:'',unit:'unit',varCode:'',varAuth:'',varReason:''}];

  $('#genericModalTitle').textContent=(isReturn?'Log Return (Excess)':'Log Issue / Usage')+' — '+pid;
  $('#genericModalBody').innerHTML=`
  <div style="padding:8px 12px;background:${isReturn?'rgba(240,164,80,.1)':'rgba(63,185,80,.1)'};border-radius:6px;margin-bottom:14px;border-left:3px solid ${isReturn?'var(--accent-amber)':'var(--accent-green)'}">
    <strong>${isReturn?'↩ Return Excess':'↗ Issue to Site'}</strong> — ${isReturn?'Log resources being returned from site to store/warehouse.':'Log resources being issued/deployed to site.'}
  </div>
  <div class="form-grid" style="margin-bottom:14px">
    <div class="form-group"><label class="form-label">Date *</label><input class="form-input" type="date" id="ulDate" value="${new Date().toISOString().split('T')[0]}"></div>
    <div class="form-group"><label class="form-label">${isReturn?'Returned By':'Issued To'} *</label><input class="form-input" id="ulIssuedTo" placeholder="${isReturn?'Name or team':'Person, team or location'}"></div>
    <div class="form-group"><label class="form-label">Approved By</label><input class="form-input" id="ulApproved" placeholder="Supervisor / approver"></div>
    <div class="form-group"><label class="form-label">Reference / DR No.</label><input class="form-input" id="ulRef" placeholder="Delivery receipt, slip no."></div>
    <div class="form-group" style="grid-column:1/-1"><label class="form-label">Remarks</label><input class="form-input" id="ulNotes" placeholder="${isReturn?'Condition of items, reason for return...':'Work area, purpose, remarks...'}"></div>
  </div>
  <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px">
    <div style="font-weight:700;font-size:13px">Line Items</div>
    <button class="btn btn-primary btn-sm" onclick="_ulAddLine()"><i class="fas fa-plus"></i> Add Item</button>
  </div>
  <div id="ulLinesContainer"></div>`;

  $('#genericModalFooter').innerHTML=`
  <button class="btn btn-secondary" onclick="closeModal('genericModal')">Cancel</button>
  <button class="btn ${isReturn?'btn-warning':'btn-success'}" onclick="saveUsageLog()"><i class="fas fa-save"></i> Save ${txType}</button>`;
  openModal('genericModal');
  _ulRenderLines();

  // Pre-fill line 0 if allocation pre-selected
  if(preselectedAllocId){
    const a=(AppState.data.resourceAllocations||[]).find(x=>x.id===preselectedAllocId);
    if(a){
      window._ulLines[0].resource={id:a.resourceId,name:a.resourceName,type:a.resourceType,unit:a.unit};
      window._ulLines[0].unit=a.unit||'unit';
      _ulRenderLines();
      _ulShowBal(0,preselectedAllocId);
    }
  }
}

function saveUsageLog(){
  const date=$('#ulDate')?.value||new Date().toISOString().split('T')[0];
  const issuedTo=$('#ulIssuedTo')?.value||'';
  const approvedBy=$('#ulApproved')?.value||'';
  const reference=$('#ulRef')?.value||'';
  const notes=$('#ulNotes')?.value||'';
  const txType=window._ulTxType||'Issue';
  const pid=window._ulPid;
  const lines=window._ulLines||[];
  if(!lines.length){showToast('Add at least one line item','error');return;}

  // Sync any still-focused text inputs into line state
  lines.forEach((line,i)=>{
    const qt=$(`#ulQT_${i}`);if(qt)line.qty=qt.value;
    const un=$(`#ulUN_${i}`);if(un)line.unit=un.value;
    const vc=$(`#ulVC_${i}`);if(vc)line.varCode=vc.value;
    const va=$(`#ulVA_${i}`);if(va)line.varAuth=va.value;
    const vr=$(`#ulVR_${i}`);if(vr)line.varReason=vr.value;
  });

  // Validate all lines
  for(let i=0;i<lines.length;i++){
    const line=lines[i];
    if(!line.resource){showToast(`Line ${i+1}: Select a resource`,'error');return;}
    const qty=parseFloat(line.qty)||0;
    if(qty<=0){showToast(`Line ${i+1}: Quantity must be greater than 0`,'error');return;}
    if(line.category!=='Budgeted'){
      if(!line.varCode){showToast(`Line ${i+1}: Select a Variation Code`,'error');return;}
      if(!(line.varAuth||'').trim()){showToast(`Line ${i+1}: Authorized By is required`,'error');return;}
      if(!(line.varReason||'').trim()){showToast(`Line ${i+1}: Justification is required`,'error');return;}
    }
  }

  if(!AppState.data.resourceUsageLogs)AppState.data.resourceUsageLogs=[];
  if(txType==='Issue'&&!AppState.data.issuanceRequests)AppState.data.issuanceRequests=[];
  lines.forEach(line=>{
    const qty=parseFloat(line.qty);
    const allocId=line.allocId||'';
    const a=allocId?(AppState.data.resourceAllocations||[]).find(x=>x.id===allocId):null;
    const log={
      id:'RUL-'+((AppState.data.resourceUsageLogs||[]).length+1).toString().padStart(4,'0'),
      projectId:pid,
      allocationId:allocId||null,
      resourceId:line.resource.id||'',
      resourceName:line.resource.name||'',
      resourceType:line.resource.type||'',
      category:line.category,
      variationCode:line.category!=='Budgeted'?line.varCode:'',
      variationAuthorizedBy:line.category!=='Budgeted'?(line.varAuth||'').trim():'',
      variationReason:line.category!=='Budgeted'?(line.varReason||'').trim():'',
      transactionType:txType,
      date,quantity:qty,
      unit:line.unit||a?.unit||line.resource.unit||'unit',
      issuedTo,approvedBy,reference,notes
    };
    AppState.data.resourceUsageLogs.push(log);
    if(a&&a.plannedCost>0&&a.allocatedQty>0){
      const cpu=a.plannedCost/a.allocatedQty;
      const allLogs=(AppState.data.resourceUsageLogs||[]).filter(l=>l.allocationId===allocId);
      const net=allLogs.filter(l=>l.transactionType==='Issue').reduce((s,l)=>s+l.quantity,0)
               -allLogs.filter(l=>l.transactionType==='Return').reduce((s,l)=>s+l.quantity,0);
      a.actualCost=Math.round(net*cpu);
    }
    // Push issuance request to warehouse for every Issue line
    if(txType==='Issue'){
      const resourceId=line.resource.id||'';
      const whItem=(typeof _whItems==='function')?_whItems().find(w=>w.id===resourceId||(w.itemMasterId&&w.itemMasterId===resourceId)):null;
      AppState.data.issuanceRequests.push({
        id:_whNextId('REQ-',AppState.data.issuanceRequests),
        itemId:whItem?whItem.id:null,
        description:line.resource.name||'',
        resourceId,
        resourceType:line.resource.type||'',
        unit:log.unit,
        qty,
        projectId:pid,
        requestedBy:issuedTo||AppState.currentUser?.displayName||'',
        approvedBy,reference,
        dateNeeded:date,
        reason:notes||`Issued from project ${pid}`,
        category:line.category,
        status:'pending',
        requestedAt:new Date().toISOString(),
        sourceLog:log.id,
      });
    }
  });

  AppState.save();closeModal('genericModal');renderDetailAllocation();
  const varCount=lines.filter(l=>l.category!=='Budgeted').length;
  const reqMsg=txType==='Issue'?` · ${lines.length} WH request${lines.length!==1?'s':''} submitted`:'';
  showToast(`${lines.length} ${txType} line${lines.length!==1?'s':''} saved`+(varCount?` · ${varCount} variation${varCount!==1?'s':''}`:``)+reqMsg,txType==='Return'?'warning':'success');
}

function deleteUsageLog(id){
  if(requestOrDelete('resourceUsageLogs',id)){renderDetailAllocation();}
}

function editUsageLog(id){
  const l=(AppState.data.resourceUsageLogs||[]).find(x=>x.id===id);
  if(!l){showToast('Log entry not found','error');return;}
  const isVar=l.category&&l.category!=='Budgeted';
  $('#genericModalTitle').textContent='Edit Log Entry — '+id;
  $('#genericModalBody').innerHTML=`
  <div style="padding:6px 10px;background:rgba(56,139,253,.08);border-radius:6px;margin-bottom:12px;font-size:11px;font-family:var(--font-mono)">
    ${l.id} · ${l.resourceName} · ${l.transactionType}
  </div>
  <div class="form-grid">
    <div class="form-group"><label class="form-label">Date</label><input class="form-input" type="date" id="elDate" value="${l.date||''}"></div>
    <div class="form-group"><label class="form-label">Quantity</label><input class="form-input" type="number" id="elQty" value="${l.quantity||0}" min="0.01" step="any"></div>
    <div class="form-group"><label class="form-label">Unit</label><input class="form-input" id="elUnit" value="${l.unit||'unit'}"></div>
    <div class="form-group"><label class="form-label">${l.transactionType==='Return'?'Returned By':'Issued To'}</label><input class="form-input" id="elIssuedTo" value="${l.issuedTo||''}"></div>
    <div class="form-group"><label class="form-label">Approved By</label><input class="form-input" id="elApproved" value="${l.approvedBy||''}"></div>
    <div class="form-group"><label class="form-label">Reference / DR No.</label><input class="form-input" id="elRef" value="${l.reference||''}"></div>
    <div class="form-group" style="grid-column:1/-1"><label class="form-label">Remarks</label><input class="form-input" id="elNotes" value="${l.notes||''}"></div>
  </div>
  ${isVar?`
  <div style="margin-top:10px;padding:10px 12px;background:rgba(248,81,73,.06);border:1px solid rgba(248,81,73,.25);border-radius:8px">
    <div style="font-size:10px;font-weight:700;color:var(--accent-red);margin-bottom:8px"><i class="fas fa-exclamation-triangle" style="margin-right:4px"></i>Variation Details</div>
    <div class="form-grid">
      <div class="form-group">
        <label class="form-label">Variation Code</label>
        <select class="form-select" id="elVarCode">
          <option value="">— Select —</option>
          ${_UL_VAR_CODES().map(v=>`<option value="${v}" ${l.variationCode===v?'selected':''}>${v}</option>`).join('')}
        </select>
      </div>
      <div class="form-group"><label class="form-label">Authorized By</label><input class="form-input" id="elVarAuth" value="${l.variationAuthorizedBy||''}"></div>
      <div class="form-group" style="grid-column:1/-1"><label class="form-label">Justification</label>
        <textarea class="form-input" id="elVarReason" rows="2" style="resize:vertical">${l.variationReason||''}</textarea>
      </div>
    </div>
  </div>`:''}`;
  $('#genericModalFooter').innerHTML=`
  <button class="btn btn-secondary" onclick="closeModal('genericModal')">Cancel</button>
  <button class="btn btn-primary" onclick="_saveEditUsageLog('${id}')"><i class="fas fa-save"></i> Save Changes</button>`;
  openModal('genericModal');
}

function _saveEditUsageLog(id){
  const l=(AppState.data.resourceUsageLogs||[]).find(x=>x.id===id);
  if(!l)return;
  const qty=parseFloat($('#elQty')?.value)||0;
  if(qty<=0){showToast('Quantity must be > 0','error');return;}
  const isVar=l.category&&l.category!=='Budgeted';
  if(isVar){
    if(!($('#elVarCode')?.value)){showToast('Variation Code required','error');return;}
    if(!($('#elVarAuth')?.value?.trim())){showToast('Authorized By required','error');return;}
    if(!($('#elVarReason')?.value?.trim())){showToast('Justification required','error');return;}
  }
  const oldQty=l.quantity;
  l.date=$('#elDate')?.value||l.date;
  l.quantity=qty;
  l.unit=$('#elUnit')?.value||l.unit;
  l.issuedTo=$('#elIssuedTo')?.value||'';
  l.approvedBy=$('#elApproved')?.value||'';
  l.reference=$('#elRef')?.value||'';
  l.notes=$('#elNotes')?.value||'';
  if(isVar){
    l.variationCode=$('#elVarCode')?.value||'';
    l.variationAuthorizedBy=$('#elVarAuth')?.value?.trim()||'';
    l.variationReason=$('#elVarReason')?.value?.trim()||'';
  }
  l._updatedAt=new Date().toISOString();
  l._updatedBy=_currentUserProfile?.name||_currentUserProfile?.email||'unknown';
  // Recalculate actual cost on linked allocation
  if(l.allocationId){
    const a=(AppState.data.resourceAllocations||[]).find(x=>x.id===l.allocationId);
    if(a&&a.plannedCost>0&&a.allocatedQty>0){
      const cpu=a.plannedCost/a.allocatedQty;
      const allLogs=(AppState.data.resourceUsageLogs||[]).filter(x=>x.allocationId===l.allocationId);
      const net=allLogs.filter(x=>x.transactionType==='Issue').reduce((s,x)=>s+x.quantity,0)
               -allLogs.filter(x=>x.transactionType==='Return').reduce((s,x)=>s+x.quantity,0);
      a.actualCost=Math.round(net*cpu);
    }
  }
  AppState.save();closeModal('genericModal');renderDetailAllocation();
  showToast('Log entry updated','success');
}

// ── RESOURCE ALLOCATION EXCEL EXPORT ──────────────────────
function exportAllocExcel(pid){
  const allocs=(AppState.data.resourceAllocations||[]).filter(a=>a.projectId===pid);
  const logs=(AppState.data.resourceUsageLogs||[]).filter(l=>l.projectId===pid);
  const usageMap={};
  logs.forEach(l=>{
    if(!usageMap[l.allocationId])usageMap[l.allocationId]={issued:0,returned:0};
    l.transactionType==='Return'?usageMap[l.allocationId].returned+=l.quantity:usageMap[l.allocationId].issued+=l.quantity;
  });
  const headers=['ID','ProjectID','ResourceID','ResourceName','ResourceType','Unit','Role','AllocatedQty','PlannedCost','ActualCost','Status','StartDate','EndDate','Notes','Issued','Returned','NetUsed','Remaining'];
  const rows=allocs.map(a=>{
    const u=usageMap[a.id]||{issued:0,returned:0};
    const net=u.issued-u.returned;
    return[a.id,a.projectId,a.resourceId,a.resourceName,a.resourceType,a.unit||'',a.role||'',a.allocatedQty,a.plannedCost,a.actualCost,a.status,a.startDate||'',a.endDate||'',a.notes||'',u.issued,u.returned,net,a.allocatedQty-net];
  });
  exportCSV(rows,headers,'allocation_'+pid+'.csv');
  showToast('Allocation exported — '+allocs.length+' records. Re-import via the Import button.','success',3000);
}
// Keep old name for backward compatibility
function exportAllocCSV(pid){exportAllocExcel(pid);}

// ── USAGE LOG EXCEL EXPORT ────────────────────────────────
function exportUsageLogExcel(pid){
  const logs=(AppState.data.resourceUsageLogs||[]).filter(l=>l.projectId===pid);
  const headers=['LogID','ProjectID','AllocationID','ResourceID','ResourceName','ResourceType','Category','TransactionType','Date','Quantity','Unit','IssuedTo','ApprovedBy','Reference','Notes'];
  const rows=logs.map(l=>[l.id,l.projectId,l.allocationId,l.resourceId||'',l.resourceName,l.resourceType,l.transactionType,l.date,l.quantity,l.unit||'',l.issuedTo||'',l.approvedBy||'',l.reference||'',l.notes||'']);
  exportCSV(rows,headers,'usage_log_'+pid+'.csv');
  showToast('Usage log exported as CSV (open in Excel)','success');
}
function exportUsageLogCSV(pid){exportUsageLogExcel(pid);}

// ── RESOURCE ALLOCATION IMPORT ────────────────────────────
function importAllocExcel(pid){
  const template='LogID,ProjectID,AllocationID,ResourceID,ResourceName,ResourceType,TransactionType,Date,Quantity,Unit,IssuedTo,ApprovedBy,Reference,Notes';
  $('#genericModalTitle').textContent='Import Resource Allocations — '+pid;
  $('#genericModalBody').innerHTML=`
  <div style="padding:12px;background:rgba(56,139,253,.08);border-radius:8px;margin-bottom:14px;border-left:3px solid var(--accent-blue)">
    <div style="font-size:13px;font-weight:600;margin-bottom:6px"><i class="fas fa-info-circle" style="color:var(--accent-blue);margin-right:6px"></i>How to Import Resource Allocations</div>
    <ol style="font-size:11px;color:var(--text-secondary);padding-left:18px;line-height:2">
      <li>Download the template — fill it in Excel</li>
      <li><strong>ProjectID</strong> must match exactly: <code style="background:var(--bg-hover);padding:1px 5px;border-radius:3px">${pid}</code></li>
      <li><strong>ResourceType</strong> accepts: <code style="background:var(--bg-hover);padding:1px 5px;border-radius:3px;font-size:10px">Personnel, Equipment, Tool, Vehicle, Consumable, Material, Manpower, Procurement</code> — and many variants (PPE→Consumable, Misc→Consumable, etc.)</li>
      <li>Save as <strong>.csv</strong> from Excel, then upload below</li>
      <li>Records with matching ID will be <strong>updated</strong>; new IDs will be <strong>added</strong></li>
    </ol>
  </div>
  <div style="display:flex;gap:8px;margin-bottom:14px">
    <button class="btn btn-secondary btn-sm" onclick="downloadTemplate('${template}','allocation_template.csv')"><i class="fas fa-file-excel" style="color:#217346"></i> Download Template</button>
    <span style="font-size:10px;color:var(--text-muted);align-self:center">Columns: ${template.split(',').length} fields</span>
  </div>
  <div class="form-group">
    <label class="form-label">Select File (.csv or .xlsx) *</label>
    <input type="file" id="allocImportFile" accept=".csv,.xlsx,.xls" class="form-input" style="padding:4px" onchange="previewAllocImport(this,'${pid}')">
  </div>
  <div id="allocImportPreview" style="margin-top:10px"></div>`;
  window._allocImportPid=pid;
  window._allocImportRows=null;
  $('#genericModalFooter').innerHTML=`
    <button class="btn btn-secondary" onclick="closeModal('genericModal')">Cancel</button>
    <button class="btn btn-primary" id="allocImportBtn" onclick="executeAllocImport()" disabled><i class="fas fa-file-import"></i> Import Allocations</button>`;
  openModal('genericModal');
}

function previewAllocImport(input,pid){
  const file=input.files[0];if(!file)return;
  const preview=$('#allocImportPreview');
  preview.innerHTML=`<div style="padding:10px;color:var(--text-secondary)"><i class="fas fa-spinner fa-spin"></i> Reading file...</div>`;
  const ext=file.name.split('.').pop().toLowerCase();
  if(ext==='csv'){
    const reader=new FileReader();
    reader.onload=ev=>{
      try{showAllocImportPreview(parseCSVToRows(ev.target.result),pid);}
      catch(e){preview.innerHTML=`<div style="color:var(--accent-red);padding:10px">Error: ${e.message}</div>`;}
    };
    reader.readAsText(file);
  }else{
    const reader=new FileReader();
    reader.onload=ev=>{
      try{
        const data=new Uint8Array(ev.target.result);
        const wb=XLSX.read(data,{type:'array'});
        const json=XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]],{defval:''});
        showAllocImportPreview(json,pid,true);
      }catch(e){
        preview.innerHTML=`<div style="color:var(--accent-amber);padding:10px;background:rgba(240,164,80,.1);border-radius:6px"><i class="fas fa-exclamation-triangle" style="margin-right:6px"></i>Excel import requires SheetJS. Please save your file as <strong>.csv</strong> from Excel (File → Save As → CSV) and re-upload.</div>`;
      }
    };
    reader.readAsArrayBuffer(file);
  }
}

function showAllocImportPreview(rows,pid,fromExcel=false){
  const preview=$('#allocImportPreview');
  if(!rows||!rows.length){preview.innerHTML=`<div style="color:var(--accent-red);padding:10px">No data rows found.</div>`;return;}
  window._allocImportRows=rows;
  const btn=$('#allocImportBtn');if(btn)btn.removeAttribute('disabled');
  const headers=Object.keys(rows[0]);
  const show=rows.slice(0,5);
  const existing=(AppState.data.resourceAllocations||[]).filter(a=>a.projectId===pid).map(a=>a.id);
  const willAdd=rows.filter(r=>!existing.includes(r.ID||r.id||'')).length;
  const willUpdate=rows.filter(r=>existing.includes(r.ID||r.id||'')).length;
  preview.innerHTML=`
  <div style="margin-bottom:8px;display:flex;gap:10px;align-items:center;flex-wrap:wrap">
    <span style="font-size:12px;font-weight:600"><i class="fas fa-table" style="color:var(--accent-green);margin-right:5px"></i>${rows.length} rows ready to import</span>
    <span class="badge badge-green">${willAdd} new</span>
    <span class="badge badge-blue">${willUpdate} updates</span>
  </div>
  <div style="overflow-x:auto;max-height:180px;border:1px solid var(--border);border-radius:6px">
    <table style="width:100%;font-size:10px;border-collapse:collapse">
      <thead style="background:var(--bg-hover);position:sticky;top:0"><tr>${headers.map(h=>`<th style="padding:5px 8px;text-align:left;font-weight:600;border-bottom:1px solid var(--border);white-space:nowrap">${h}</th>`).join('')}</tr></thead>
      <tbody>${show.map((r,i)=>`<tr style="${i%2?'background:var(--bg-hover)':''}">${headers.map(h=>`<td style="padding:4px 8px;border-bottom:1px solid var(--border);max-width:120px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${r[h]||''}">${r[h]||''}</td>`).join('')}</tr>`).join('')}
      ${rows.length>5?`<tr><td colspan="${headers.length}" style="padding:5px 8px;text-align:center;color:var(--text-muted)">... and ${rows.length-5} more rows</td></tr>`:''}</tbody>
    </table>
  </div>
  <div style="margin-top:8px;font-size:11px;color:var(--text-secondary)"><i class="fas fa-info-circle" style="margin-right:4px"></i>Matching IDs will be updated. New IDs will be added. Blank IDs will be auto-assigned.</div>
  ${(()=>{
    const csvPids=[...new Set(rows.map(r=>String(r.ProjectID||r.projectId||r['Project ID']||'').trim()).filter(Boolean))];
    const hasMultiPid=csvPids.length>1||(csvPids.length===1&&csvPids[0]!==pid);
    return hasMultiPid?'<div style="margin-top:8px;padding:8px 10px;background:rgba(240,164,80,.12);border:1px solid rgba(240,164,80,.3);border-radius:6px;font-size:11px;color:var(--accent-amber)"><i class="fas fa-exclamation-triangle" style="margin-right:5px"></i><strong>Note:</strong> The CSV contains different Project IDs in the ProjectID column — these will be <strong>ignored</strong>. All rows will be imported under project <code style="background:rgba(0,0,0,.2);padding:1px 5px;border-radius:3px">${pid}</code>. The ProjectID column in your CSV is likely an allocation sequence ID, not the project ID.</div>':'';
  })()}`;
}

function executeAllocImport(){
  const rows=window._allocImportRows;
  const pid=window._allocImportPid;
  if(!rows||!rows.length){showToast('No data to import','error');return;}
  if(!AppState.data.resourceAllocations)AppState.data.resourceAllocations=[];
  const list=AppState.data.resourceAllocations;
  let added=0,updated=0,skipped=0;
  const skipReasons=[];

  // Case-insensitive type map — handles all common variants
  const typeMap={
    'personnel':'Personnel','person':'Personnel','people':'Personnel','staff':'Personnel',
    'equipment':'Equipment','equip':'Equipment',
    'tool':'Tool','tools':'Tool',
    'vehicle':'Vehicle','vehicles':'Vehicle','transport':'Vehicle',
    'consumable':'Consumable','consumables':'Consumable',
    'consumables & materials':'Consumable','consumable & material':'Consumable',
    'materials & consumables':'Consumable','cons & mat':'Consumable','cons/mat':'Consumable',
    'material':'Material','materials':'Material',
    'manpower':'Manpower','labour':'Manpower','labor':'Manpower',
    'workforce':'Manpower','worker':'Manpower','workers':'Manpower','crew':'Manpower',
    'ppe':'Consumable',   // PPE is a Consumable sub-category
    'procurement':'Procurement','po':'Procurement','purchase':'Procurement',
    'miscellaneous':'Consumable','misc':'Consumable','other':'Consumable',
    'mobilization':'Consumable','demobilization':'Consumable','mob':'Consumable',
    'mob/demob':'Consumable','tools & equipment':'Equipment',
  };

  // Use a Map for O(1) lookup by ID to handle 500+ records efficiently
  const existingMap=new Map(list.map((a,i)=>[a.id,i]));

  rows.forEach((row,rowIdx)=>{
    const name=String(row.ResourceName||row.resourceName||row['Resource Name']||row.Name||row.name||'').trim();
    const rawType=String(row.ResourceType||row.resourceType||row['Resource Type']||row.Type||row.type||'').trim();
    const type=typeMap[rawType.toLowerCase()]||rawType;

    if(!name){
      skipReasons.push(`Row ${rowIdx+2}: missing ResourceName`);
      skipped++;return;
    }
    const validTypes=['Personnel','Equipment','Tool','Vehicle','Consumable','Material','Manpower','Procurement'];
    if(!type||!validTypes.includes(type)){
      // Last resort: if we have a name but unknown type, default to Consumable with a note
      if(name&&rawType){
        skipReasons.push(`Row ${rowIdx+2}: unknown ResourceType "${rawType}" — imported as Consumable`);
        // Don't skip — use Consumable as fallback
      }else{
        skipReasons.push(`Row ${rowIdx+2}: invalid ResourceType "${rawType}" (use: Personnel/Equipment/Tool/Vehicle/Consumable/Material/Manpower)`);
        skipped++;return;
      }
    }

    // Generate unique ID — support >999 records
    const rawId=String(row.ID||row.id||row.AllocationID||'').trim();
    // If no ID in CSV, try to match existing record by ResourceName+ResourceType+ProjectID
    // to avoid duplicating records on re-import
    let recId=rawId;
    if(!recId){
      const matchExisting=list.find(a=>
        a.projectId===pid&&
        (a.resourceName||'').toLowerCase().trim()===(name||'').toLowerCase().trim()&&
        a.resourceType===type
      );
      if(matchExisting){recId=matchExisting.id;} // will trigger update path
      else{recId='RA-'+String(list.length+added+1).padStart(4,'0');}
    }

    const rec={
      id:recId,
      projectId:pid, // always use the current project — CSV ProjectID column is often an allocation sequence ID
      resourceId:String(row.ResourceID||row.resourceId||row['Resource ID']||'').trim(),
      resourceName:name,
      resourceType:type,
      unit:String(row.Unit||row.unit||'unit').trim(),
      role:String(row.Role||row.role||row['Role/Scope']||'').trim(),
      allocatedQty:parseFloat(row.AllocatedQty||row.allocatedQty||row['Allocated Qty']||row.Qty||0)||0,
      plannedCost:parseFloat(row.PlannedCost||row.plannedCost||row['Planned Cost']||0)||0,
      actualCost:parseFloat(row.ActualCost||row.actualCost||row['Actual Cost']||0)||0,
      status:String(row.Status||row.status||'active').trim().toLowerCase()||'active',
      startDate:String(row.StartDate||row.startDate||row['Start Date']||'').trim(),
      endDate:String(row.EndDate||row.endDate||row['End Date']||'').trim(),
      notes:String(row.Notes||row.notes||'').trim(),
    };

    const existIdx=existingMap.get(rec.id);
    if(existIdx!==undefined){
      list[existIdx]={...list[existIdx],...rec};
      updated++;
    }else{
      list.push(rec);
      existingMap.set(rec.id,list.length-1);
      added++;
    }
  });

  // Fix ghost-project records: any allocation with a non-existent projectId
  // that has the same resourceNames as what we just imported → reassign to pid
  const existingProjIds=new Set((AppState.data.projects||[]).map(p=>p.id));
  let ghostFixed=0;
  (AppState.data.resourceAllocations||[]).forEach(a=>{
    if(a.projectId===pid)return; // already correct
    if(existingProjIds.has(a.projectId))return; // valid project, leave alone
    // Ghost project ID — re-assign to current project if name matches imported set
    const importedNames=rows.map(r=>String(r.ResourceName||r.resourceName||'').trim().toLowerCase());
    if(importedNames.includes((a.resourceName||'').toLowerCase().trim())){
      a.projectId=pid;
      ghostFixed++;
    }
  });
  // Save — for large datasets, try localStorage first then SharePoint
  const total=added+updated;
  const ghostMsg=ghostFixed>0?(ghostFixed+' ghost-project records fixed. '):'';
  try{
    AppState.save();
  }catch(storageErr){
    console.warn('[SHIC] localStorage full — data saved in memory only');
    showToast('localStorage limit reached — please sync to SharePoint...','warning',4000);
  }

  closeModal('genericModal');
  window._allocImportRows=null;

  // Show detailed result
  const msg=`Import complete: ${added} added, ${updated} updated`+
    (skipped?`, ${skipped} skipped`:'');
  showToast(msg,'success',6000);

  if(skipped>0&&skipReasons.length){
    console.warn('[SHIC Import] Skipped rows:',skipReasons.slice(0,10).join('\n'));
    if(skipped>0){
      setTimeout(()=>showToast(`${skipped} rows skipped — check console (F12) for details`,'warning',5000),2000);
    }
  }

  if(typeof renderDetailAllocation==='function')renderDetailAllocation();
}

// ── USAGE LOG IMPORT ──────────────────────────────────────
function importUsageLogExcel(pid){
  const template='LogID,ProjectID,AllocationID,ResourceID,ResourceName,ResourceType,TransactionType,Date,Quantity,Unit,IssuedTo,ApprovedBy,Reference,Notes';
  const allocs=(AppState.data.resourceAllocations||[]).filter(a=>a.projectId===pid);
  $('#genericModalTitle').textContent='Import Usage Log — '+pid;
  $('#genericModalBody').innerHTML=`
  <div style="padding:12px;background:rgba(56,139,253,.08);border-radius:8px;margin-bottom:14px;border-left:3px solid var(--accent-blue)">
    <div style="font-size:13px;font-weight:600;margin-bottom:6px"><i class="fas fa-info-circle" style="color:var(--accent-blue);margin-right:6px"></i>How to Import Usage Transactions</div>
    <ol style="font-size:11px;color:var(--text-secondary);padding-left:18px;line-height:2">
      <li>Download the template and fill in Excel</li>
      <li><strong>TransactionType</strong>: <code style="background:var(--bg-hover);padding:1px 5px;border-radius:3px">Issue</code> or <code style="background:var(--bg-hover);padding:1px 5px;border-radius:3px">Return</code></li>
      <li><strong>AllocationID</strong> — must match an existing allocation ID for this project (see below):</li>
      <li><strong>Date</strong> format: YYYY-MM-DD &nbsp;·&nbsp; <strong>LogID</strong> leave blank for auto-assign</li>
    </ol>
    ${allocs.length?`<div style="max-height:80px;overflow-y:auto;margin-top:6px;padding:6px 10px;background:var(--bg-hover);border-radius:5px;font-size:10px;font-family:var(--font-mono)">
      ${allocs.map(a=>`<span style="margin-right:10px">${a.id} (${a.resourceName})</span>`).join('')}
    </div>`:`<div style="color:var(--accent-amber);font-size:11px;margin-top:6px">⚠ No allocations found for ${pid}. Add allocations first.</div>`}
    <div style="margin-top:8px;font-size:11px;color:var(--text-secondary)">4. <strong>Date</strong> format: YYYY-MM-DD &nbsp;·&nbsp; 5. Save as .csv, then upload</div>
  </div>
  <div style="display:flex;gap:8px;margin-bottom:14px">
    <button class="btn btn-secondary btn-sm" onclick="downloadTemplate('${template}','usage_log_template.csv')"><i class="fas fa-file-excel" style="color:#217346"></i> Download Template</button>
  </div>
  <div class="form-group">
    <label class="form-label">Select File (.csv or .xlsx) *</label>
    <input type="file" id="logImportFile" accept=".csv,.xlsx,.xls" class="form-input" style="padding:4px" onchange="previewLogImport(this,'${pid}')">
  </div>
  <div id="logImportPreview" style="margin-top:10px"></div>`;
  window._logImportPid=pid;
  window._logImportRows=null;
  $('#genericModalFooter').innerHTML=`
    <button class="btn btn-secondary" onclick="closeModal('genericModal')">Cancel</button>
    <button class="btn btn-primary" id="logImportBtn" onclick="executeLogImport()" disabled><i class="fas fa-file-import"></i> Import Transactions</button>`;
  openModal('genericModal');
}

function previewLogImport(input,pid){
  const file=input.files[0];if(!file)return;
  const preview=$('#logImportPreview');
  preview.innerHTML=`<div style="padding:10px;color:var(--text-secondary)"><i class="fas fa-spinner fa-spin"></i> Reading...</div>`;
  const ext=file.name.split('.').pop().toLowerCase();
  if(ext==='csv'){
    const reader=new FileReader();
    reader.onload=ev=>{
      try{
        const rows=parseCSVToRows(ev.target.result);
        window._logImportRows=rows;
        const btn=$('#logImportBtn');if(btn)btn.removeAttribute('disabled');
        const headers=Object.keys(rows[0]||{});
        const show=rows.slice(0,5);
        preview.innerHTML=`<div style="margin-bottom:8px;font-size:12px;font-weight:600"><i class="fas fa-table" style="color:var(--accent-green);margin-right:5px"></i>${rows.length} transactions ready to import</div>
        <div style="overflow-x:auto;max-height:160px;border:1px solid var(--border);border-radius:6px">
          <table style="width:100%;font-size:10px;border-collapse:collapse">
            <thead style="background:var(--bg-hover)"><tr>${headers.map(h=>`<th style="padding:5px 8px;text-align:left;font-weight:600;border-bottom:1px solid var(--border);white-space:nowrap">${h}</th>`).join('')}</tr></thead>
            <tbody>${show.map((r,i)=>`<tr style="${i%2?'background:var(--bg-hover)':''}">${headers.map(h=>`<td style="padding:4px 8px;border-bottom:1px solid var(--border);white-space:nowrap;max-width:120px;overflow:hidden;text-overflow:ellipsis">${r[h]||''}</td>`).join('')}</tr>`).join('')}
            ${rows.length>5?`<tr><td colspan="${headers.length}" style="padding:5px 8px;text-align:center;color:var(--text-muted)">... ${rows.length-5} more</td></tr>`:''}</tbody>
          </table>
        </div>`;
      }catch(e){preview.innerHTML=`<div style="color:var(--accent-red);padding:10px">Error: ${e.message}</div>`;}
    };
    reader.readAsText(file);
  }else{
    const reader=new FileReader();
    reader.onload=ev=>{
      try{
        const data=new Uint8Array(ev.target.result);
        const wb=XLSX.read(data,{type:'array'});
        const rows=XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]],{defval:''});
        window._logImportRows=rows;
        const btn=$('#logImportBtn');if(btn)btn.removeAttribute('disabled');
        preview.innerHTML=`<div style="font-size:12px;font-weight:600;color:var(--accent-green)"><i class="fas fa-check-circle" style="margin-right:5px"></i>${rows.length} rows read from Excel</div>`;
      }catch(e){
        preview.innerHTML=`<div style="color:var(--accent-amber);padding:10px;background:rgba(240,164,80,.1);border-radius:6px">Excel import requires SheetJS. Please save as .csv and re-upload.</div>`;
      }
    };
    reader.readAsArrayBuffer(file);
  }
}

function executeLogImport(){
  const rows=window._logImportRows;
  const pid=window._logImportPid;
  if(!rows||!rows.length){showToast('No data to import','error');return;}
  if(!AppState.data.resourceUsageLogs)AppState.data.resourceUsageLogs=[];
  const list=AppState.data.resourceUsageLogs;
  let added=0,skipped=0;
  const skipReasons=[];
  rows.forEach((row,rowIdx)=>{
    const txType=String(row.TransactionType||row.transactionType||'').trim();
    const qty=parseFloat(row.Quantity||row.quantity||0)||0;
    const allocId=String(row.AllocationID||row.allocationId||'').trim();
    const rName=String(row.ResourceName||row.resourceName||'').trim();
    if(!rName){ skipReasons.push(`Row ${rowIdx+2}: missing ResourceName`); skipped++; return; }
    if(!txType){ skipReasons.push(`Row ${rowIdx+2} (${rName}): missing TransactionType (Issue or Return)`); skipped++; return; }
    if(!['Issue','Return'].includes(txType)){ skipReasons.push(`Row ${rowIdx+2} (${rName}): TransactionType "${txType}" invalid — use Issue or Return`); skipped++; return; }
    if(qty<=0){ skipReasons.push(`Row ${rowIdx+2} (${rName}): Quantity must be > 0`); skipped++; return; }
    // Find allocation for auto-fill
    const alloc=(AppState.data.resourceAllocations||[]).find(a=>a.id===allocId&&a.projectId===pid);
    const logId=String(row.LogID||row.logId||'').trim();
    const rec={
      id:logId||'RUL-'+String(list.length+added+1).padStart(4,'0'),
      projectId:pid,
      allocationId:allocId,
      resourceId:String(row.ResourceID||row.resourceId||alloc?.resourceId||'').trim(),
      resourceName:rName,
      resourceType:String(row.ResourceType||row.resourceType||alloc?.resourceType||'').trim(),
      transactionType:txType,
      date:String(row.Date||row.date||new Date().toISOString().split('T')[0]).trim(),
      quantity:qty,
      unit:String(row.Unit||row.unit||alloc?.unit||'unit').trim(),
      issuedTo:String(row.IssuedTo||row.issuedTo||'').trim(),
      approvedBy:String(row.ApprovedBy||row.approvedBy||'').trim(),
      reference:String(row.Reference||row.reference||'').trim(),
      notes:String(row.Notes||row.notes||'').trim(),
    };
    // Skip exact duplicate log IDs
    if(logId&&list.find(l=>l.id===logId)){ skipReasons.push(`Row ${rowIdx+2} (${rName}): LogID "${logId}" already exists`); skipped++; return; }
    list.push(rec);added++;
  });
  AppState.save();
  closeModal('genericModal');
  window._logImportRows=null;
  renderDetailAllocation();
  showToast(`Import done: ${added} transactions added, ${skipped} skipped`,'success',5000);
}

// Template download helper
function downloadTemplate(headers,filename){
  // Smarter sample row generation based on column names
  const predefined={
    // Allocation template
    'ID,ProjectID,ResourceID,ResourceName,ResourceType,Unit,Role,AllocatedQty,PlannedCost,ActualCost,Status,StartDate,EndDate,Notes':
      ',PRJ-001,TRADE-PIPE-WELDER,Pipe Welder,Manpower,pax,Pipe Welder,10,185000,0,active,2025-01-01,2025-12-31,',
    // Usage log template
    'LogID,ProjectID,AllocationID,ResourceID,ResourceName,ResourceType,TransactionType,Date,Quantity,Unit,IssuedTo,ApprovedBy,Reference,Notes':
      ',PRJ-001,RA-0001,TRADE-PIPE-WELDER,Pipe Welder,Manpower,Issue,'+new Date().toISOString().split('T')[0]+',5,pax,Foreman Juan,PM Cruz,WO-001,',
    // Manpower template
    'ID,ProjectID,Trade,Planned,Actual,Cost,Shift,OTHrs,Week':
      'MP-001,PRJ-001,Pipe Welder,10,8,185000,Day,0,'+('W'+Math.ceil((new Date()-new Date(new Date().getFullYear(),0,1))/604800000)),
    // Procurement template
    'RequestNumber,PRNumber,PONumber,Description,Category,ProjectID,Vendor,Amount,BudgetAmount,Priority,Status,RequestedBy,ResponsiblePerson,PRDate,PODate,DeliveryDate,PaymentTerms,Notes':
      'REQ-001,PR-001,,Steel Plates A36 Grade,Materials,PRJ-001,ArcelorMittal,0,850000,high,rfq,Juan dela Cruz,Maria Santos,'+new Date().toISOString().split('T')[0]+',,,30 days net,',
  };
  const sample=predefined[headers]||headers.split(',').map(c=>{
    const cl=c.toLowerCase().replace(/\s+/g,'');
    if(cl.includes('date'))return new Date().toISOString().split('T')[0];
    if(cl==='id'||cl.endsWith('id')||cl.endsWith('number')||cl.endsWith('no'))return'';
    if(cl.includes('qty')||cl.includes('quantity')||cl.includes('rate')||cl.includes('cost')||cl.includes('amount')||cl.includes('planned')||cl.includes('actual'))return'0';
    if(cl==='status')return'active';
    if(cl==='transactiontype')return'Issue';
    if(cl==='resourcetype')return'Manpower';
    if(cl==='unit')return'unit';
    if(cl==='shift')return'Day';
    if(cl==='priority')return'normal';
    if(cl==='critical')return'No';
    return '';
  }).join(',');
  const csv='# SHIC Import Template — delete this # comment line before importing\n'+headers+'\n'+sample+'\n';
  const a=document.createElement('a');
  a.href=URL.createObjectURL(new Blob([csv],{type:'text/csv'}));
  a.download=filename;a.click();
  showToast('Template downloaded — open in Excel, delete the # comment row, save as CSV','success',4000);
}





function renderDetailCostControl(){
  const pid=detailProjectId;
  const p=(AppState.data.projects||[]).find(x=>x.id===pid);
  if(!p)return;
  const costs=(AppState.data.costs||[]).filter(c=>c.projectId===pid);
  const allocs=(AppState.data.resourceAllocations||[]).filter(a=>a.projectId===pid);
  const manpower=(AppState.data.manpower||[]).filter(m=>m.projectId===pid);
  const procurement=(AppState.data.procurement||[]).filter(po=>po.projectId===pid);
  const materials=(AppState.data.materials||[]).filter(m=>m.projectId===pid);

  const totPlanned=costs.reduce((s,c)=>s+c.planned,0);
  const totActual=costs.reduce((s,c)=>s+c.actual,0);
  const avgProg=p.progress/100;
  const EV=totPlanned*avgProg;
  const AC=totActual;
  const PV=totPlanned*(p.progress>0?Math.min(1,(new Date()-new Date(p.startDate))/(new Date(p.endDate)-new Date(p.startDate))):0);
  const CPI=AC>0?(EV/AC).toFixed(2):'—';
  const SPI=PV>0?(EV/PV).toFixed(2):'—';
  const cv=EV-AC;
  const EAC=parseFloat(CPI)>0?totPlanned/parseFloat(CPI):totPlanned;
  const VAC=totPlanned-EAC;
  const budget=p.budget;
  const spent=p.spent;
  const remaining=budget-spent;
  const budgetPct=Math.round((spent/Math.max(budget,1))*100);

  // Procurement commitment total
  const poTotal=procurement.reduce((s,po)=>s+po.amount,0);
  const mpCostTotal=manpower.reduce((s,m)=>s+m.cost,0);
  const matCostTotal=materials.reduce((s,m)=>s+m.qty*m.unitCost,0);
  const allocCost=(AppState.data.resourceAllocations||[]).filter(a=>a.projectId===pid).reduce((s,a)=>s+a.plannedCost,0);

  const categories=[...new Set(costs.map(c=>c.category))];

  $('#detailTabContent').innerHTML=`
  <!-- Budget Health Banner -->
  <div style="background:${budgetPct>90?'linear-gradient(135deg,#4a0f0f,#7f1d1d)':budgetPct>75?'linear-gradient(135deg,#3d2800,#7c4a00)':'linear-gradient(135deg,#0d2147,#112266)'};border:1px solid ${budgetPct>90?'rgba(248,81,73,.4)':budgetPct>75?'rgba(240,164,80,.4)':'rgba(56,139,253,.25)'};border-radius:var(--radius);padding:16px 20px;margin-bottom:16px;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px">
    <div>
      <div style="font-size:11px;color:rgba(255,255,255,.6);margin-bottom:3px">Contract Budget</div>
      <div style="font-size:26px;font-weight:800;font-family:var(--font-mono);color:#fff">${fmtCur(budget)}</div>
    </div>
    <div style="text-align:center">
      <div style="font-size:11px;color:rgba(255,255,255,.6);margin-bottom:3px">Amount Spent</div>
      <div style="font-size:26px;font-weight:800;font-family:var(--font-mono);color:${budgetPct>90?'var(--accent-red)':budgetPct>75?'var(--accent-amber)':'#3fb950'}">${fmtCur(spent)}</div>
    </div>
    <div style="text-align:center">
      <div style="font-size:11px;color:rgba(255,255,255,.6);margin-bottom:3px">Remaining</div>
      <div style="font-size:26px;font-weight:800;font-family:var(--font-mono);color:${remaining<0?'var(--accent-red)':'#fff'}">${fmtCur(remaining)}</div>
    </div>
    <div style="min-width:200px">
      <div style="display:flex;justify-content:space-between;margin-bottom:5px"><span style="font-size:11px;color:rgba(255,255,255,.7)">Budget Utilization</span><span style="font-size:13px;font-weight:700;font-family:var(--font-mono);color:${budgetPct>90?'var(--accent-red)':budgetPct>75?'var(--accent-amber)':'var(--accent-green)'}">${budgetPct}%</span></div>
      <div class="progress-bar" style="height:10px;background:rgba(255,255,255,.15)"><div class="progress-fill" style="width:${Math.min(100,budgetPct)}%;background:${budgetPct>90?'var(--accent-red)':budgetPct>75?'var(--accent-amber)':'var(--accent-green)'};border-radius:5px"></div></div>
    </div>
  </div>

  <!-- Quick edit budget/spent -->
  <div class="card" style="margin-bottom:14px">
    <div class="card-title" style="margin-bottom:10px">Update Budget & Spent</div>
    <div style="display:flex;gap:12px;align-items:flex-end;flex-wrap:wrap">
      <div class="form-group" style="margin:0;flex:1;min-width:160px"><label class="form-label">Contract Budget (₱)</label><input class="form-input" type="number" id="ccBudget" value="${budget}" oninput="updateCCBudget('${pid}')"></div>
      <div class="form-group" style="margin:0;flex:1;min-width:160px"><label class="form-label">Amount Spent (₱)</label><input class="form-input" type="number" id="ccSpent" value="${spent}" oninput="updateCCSpent('${pid}')"></div>
      <div class="form-group" style="margin:0;flex:1;min-width:160px"><label class="form-label">Progress %</label><input class="form-input" type="number" id="ccProg" value="${p.progress}" min="0" max="100" oninput="updateCCProgress('${pid}')"></div>
      <button class="btn btn-success btn-sm" onclick="saveCCQuick('${pid}')"><i class="fas fa-save"></i> Save</button>
    </div>
  </div>

  <!-- EVM KPIs -->
  <div class="grid grid-3" style="margin-bottom:14px">
    <div class="evm-card"><div class="evm-value" style="color:${parseFloat(CPI)>=1?'var(--accent-green)':'var(--accent-red)'}">${CPI}</div><div class="evm-label">Cost Performance Index (CPI)</div><div class="evm-status" style="color:${parseFloat(CPI)>=1?'var(--accent-green)':'var(--accent-red)'}">${parseFloat(CPI)>=1?'✓ Cost Efficient':'✗ Cost Overrun'}</div></div>
    <div class="evm-card"><div class="evm-value" style="color:${parseFloat(SPI)>=1?'var(--accent-green)':'var(--accent-amber)'}">${SPI}</div><div class="evm-label">Schedule Performance Index (SPI)</div><div class="evm-status" style="color:${parseFloat(SPI)>=1?'var(--accent-green)':'var(--accent-amber)'}">${parseFloat(SPI)>=1?'✓ On Schedule':'! Behind Schedule'}</div></div>
    <div class="evm-card"><div class="evm-value" style="color:${VAC>=0?'var(--accent-green)':'var(--accent-red)'}">₱${fmtNum(Math.abs(EAC))}</div><div class="evm-label">EAC (Estimate at Completion)</div><div class="evm-status" style="color:${EAC<=budget?'var(--accent-green)':'var(--accent-red)'}">${EAC<=budget?'Within Budget':'Over Budget by ₱'+fmtNum(EAC-budget)}</div></div>
  </div>

  <!-- Cost Committed Overview -->
  <div class="grid grid-4" style="margin-bottom:14px">
    ${sc('fas fa-file-invoice','PO Committed',fmtNum(poTotal),procurement.length+' purchase orders','#388bfd','rgba(56,139,253,.15)')}
    ${sc('fas fa-hard-hat','Manpower Cost',fmtNum(mpCostTotal),manpower.length+' trades this week','#f0a450','rgba(240,164,80,.15)')}
    ${sc('fas fa-boxes','Materials Value',fmtNum(matCostTotal),materials.length+' material items','#3fb950','rgba(63,185,80,.15)')}
    ${sc('fas fa-users','Resource Allocation',fmtNum(allocCost),allocs.length+' allocated resources','#bc8cff','rgba(188,140,255,.15)')}
  </div>

  <!-- Cost breakdown table with inline editing -->
  <div class="card" style="margin-bottom:14px">
    <div class="section-header" style="margin-bottom:10px">
      <div class="section-title">Cost Breakdown Register <span style="font-size:11px;font-weight:400;color:var(--text-secondary)">— all fields editable</span></div>
      <button class="btn btn-primary btn-sm" onclick="showAddCostItem()"><i class="fas fa-plus"></i> Add Line Item</button>
    </div>
    <div class="table-wrap"><table>
      <thead><tr><th>ID</th><th>Category</th><th>Description</th><th>Planned (₱)</th><th>Actual (₱)</th><th>Variance (₱)</th><th>% Used</th><th></th></tr></thead>
      <tbody>${costs.length?costs.map(c=>{
        const v=c.planned-c.actual;
        const pct=Math.min(999,Math.round((c.actual/Math.max(c.planned,1))*100));
        return`<tr>
        <td style="font-size:10px;font-family:var(--font-mono)">${c.id}</td>
        <td><select class="form-select" style="height:30px;font-size:11px;min-width:100px" onchange="updateCostField('${c.id}','category',this.value)">${_getDropdown('cost_categories').map(cat=>`<option value="${cat}" ${c.category===cat?'selected':''}>${cat}</option>`).join('')}</select></td>
        <td><input class="form-input" value="${c.description}" style="min-width:160px;height:26px;font-size:11px" oninput="updateCostField('${c.id}','description',this.value)" onchange="updateCostField('${c.id}','description',this.value)"></td>
        <td><input class="form-input" type="number" value="${c.planned}" style="width:110px;height:26px;font-family:var(--font-mono);font-size:11px" oninput="updateCostField('${c.id}','planned',+this.value)" onchange="updateCostField('${c.id}','planned',+this.value);setTimeout(()=>renderDetailCostControl(),700)"></td>
        <td><input class="form-input" type="number" value="${c.actual}" style="width:110px;height:26px;font-family:var(--font-mono);font-size:11px;${c.actual>c.planned?'border-color:var(--accent-red);color:var(--accent-red)':''}" oninput="updateCostField('${c.id}','actual',+this.value)" onchange="updateCostField('${c.id}','actual',+this.value);setTimeout(()=>renderDetailCostControl(),700)"></td>
        <td style="font-family:var(--font-mono);font-weight:700;color:${v>=0?'var(--accent-green)':'var(--accent-red)'}">${v>=0?'+':''}${fmtCur(Math.abs(v))}</td>
        <td><div style="display:flex;align-items:center;gap:5px"><div class="progress-bar" style="width:65px;height:5px"><div class="progress-fill" style="width:${Math.min(100,pct)}%;background:${pct>90?'var(--accent-red)':pct>70?'var(--accent-amber)':'var(--accent-green)'}"></div></div><span style="font-size:10px;font-family:var(--font-mono);font-weight:${pct>90?'700':'400'};color:${pct>90?'var(--accent-red)':'inherit'}">${pct}%</span></div></td>
        <td><button class="btn btn-danger btn-sm btn-icon" onclick="deleteCostItem('${c.id}')"><i class="fas fa-trash"></i></button></td>
      </tr>`;}).join(''):`<tr><td colspan="8"><div class="empty-state"><i class="fas fa-dollar-sign"></i><p>No cost items. Click "Add Line Item".</p></div></td></tr>`}
      ${costs.length?`<tr style="background:var(--bg-hover);font-weight:700">
        <td colspan="3" style="padding:10px 11px;font-size:12px">TOTAL</td>
        <td style="font-family:var(--font-mono)">${fmtCur(totPlanned)}</td>
        <td style="font-family:var(--font-mono);color:${totActual>totPlanned?'var(--accent-red)':'var(--accent-green)'}">${fmtCur(totActual)}</td>
        <td style="font-family:var(--font-mono);font-weight:700;color:${totPlanned-totActual>=0?'var(--accent-green)':'var(--accent-red)'}">
          ${totPlanned-totActual>=0?'+':''}${fmtCur(Math.abs(totPlanned-totActual))}</td>
        <td colspan="2"></td>
      </tr>`:''}
      </tbody>
    </table></div>
  </div>

  <!-- PO List for this project -->
  <div class="card">
    <div class="section-header" style="margin-bottom:10px">
      <div class="section-title">Purchase Orders for ${pid}</div>
      <button class="btn btn-primary btn-sm" onclick="showAddPO()"><i class="fas fa-plus"></i> New PO</button>
    </div>
    <div class="table-wrap"><table>
      <thead><tr><th>PO No.</th><th>Description</th><th>Vendor</th><th>Category</th><th>Amount (₱)</th><th>PO Date</th><th>Delivery</th><th>Status</th></tr></thead>
      <tbody>${procurement.length?procurement.map(po=>`<tr>
        <td style="font-size:10px;font-family:var(--font-mono);font-weight:700">${po.id}</td>
        <td style="font-size:12px;font-weight:500">${po.description}</td>
        <td style="font-size:11px">${po.vendor}</td>
        <td><span class="badge badge-gray">${po.category}</span></td>
        <td style="font-family:var(--font-mono);font-weight:600;color:var(--accent-green)">${fmtCur(po.amount)}</td>
        <td style="font-size:11px;font-family:var(--font-mono)">${po.poDate}</td>
        <td style="font-size:11px;font-family:var(--font-mono);color:${isOverdue(po.deliveryDate)&&po.status!=='delivered'?'var(--accent-red)':'inherit'}">${po.deliveryDate}</td>
        <td>${sBadge(po.status)}</td>
      </tr>`).join(''):`<tr><td colspan="8" style="text-align:center;padding:12px;color:var(--text-muted)">No POs for this project</td></tr>`}
      ${procurement.length?`<tr style="background:var(--bg-hover);font-weight:700"><td colspan="4" style="padding:9px 11px">TOTAL COMMITTED</td><td style="font-family:var(--font-mono)">${fmtCur(poTotal)}</td><td colspan="3"></td></tr>`:''}
      </tbody>
    </table></div>
  </div>`;
}

function updateCCBudget(pid){const p=(AppState.data.projects||[]).find(x=>x.id===pid);if(p&&$('#ccBudget')){p.budget=parseFloat($('#ccBudget').value)||p.budget;AppState.save();}}
function updateCCSpent(pid){const p=(AppState.data.projects||[]).find(x=>x.id===pid);if(p&&$('#ccSpent')){p.spent=parseFloat($('#ccSpent').value)||0;AppState.save();}}
function updateCCProgress(pid){const p=(AppState.data.projects||[]).find(x=>x.id===pid);if(p&&$('#ccProg')){p.progress=parseInt($('#ccProg').value)||p.progress;AppState.save();}}
function saveCCQuick(pid){
  const p=(AppState.data.projects||[]).find(x=>x.id===pid);
  if(!p)return;
  if($('#ccBudget'))p.budget=parseFloat($('#ccBudget').value)||p.budget;
  if($('#ccSpent'))p.spent=parseFloat($('#ccSpent').value)||0;
  if($('#ccProg'))p.progress=parseInt($('#ccProg').value)||p.progress;
  AppState.save();renderDetailCostControl();showToast('Cost data saved','success');
}


// ── PROJECT DETAIL: GANTT CHART ────────────────────────────
function renderDetailGantt(){
  const pid=detailProjectId;
  const p=(AppState.data.projects||[]).find(x=>x.id===pid);
  if(!p)return;
  const tasks=(AppState.data.tasks||[]).filter(t=>t.projectId===pid&&!t._deleted);
  const allocs=(AppState.data.resourceAllocations||[]).filter(a=>a.projectId===pid&&a.startDate&&a.endDate);

  if(!tasks.length){
    $('#detailTabContent').innerHTML=`<div class="card" style="padding:40px;text-align:center">
      <i class="fas fa-stream" style="font-size:36px;opacity:.3;display:block;margin-bottom:12px"></i>
      <p style="color:var(--text-muted);margin-bottom:12px">No tasks yet. Add tasks with start and end dates.</p>
      <button class="btn btn-primary" onclick="detailTab='tasks';renderDetailTab()"><i class="fas fa-plus"></i> Add Tasks</button>
    </div>`;return;
  }

  // ── Date range ──
  const allDates=[p.startDate,p.endDate,...tasks.flatMap(t=>[t.startDate,t.endDate,t.dueDate]),...allocs.flatMap(a=>[a.startDate,a.endDate])].filter(d=>d&&/^\d{4}-\d{2}-\d{2}$/.test(d));
  if(!allDates.length){$('#detailTabContent').innerHTML=`<div class="card" style="padding:24px;text-align:center"><p style="color:var(--text-muted)">Tasks need start and due dates to show the Gantt chart.</p></div>`;return;}

  const mD=new Date(allDates.reduce((a,b)=>a<b?a:b));mD.setDate(mD.getDate()-2);
  const xD=new Date(allDates.reduce((a,b)=>a>b?a:b));xD.setDate(xD.getDate()+5);
  const minDate=mD.toISOString().split('T')[0];
  const maxDate=xD.toISOString().split('T')[0];
  const totalDays=Math.max(1,daysBetween(minDate,maxDate));
  const today=new Date().toISOString().split('T')[0];
  const todayPct=Math.max(0,Math.min(100,daysBetween(minDate,today)/totalDays*100));

  const LABEL_W=240; // fixed left column width px
  const BAR_H=18;    // bar height
  const ROW_H=34;    // row height

  const scColor={todo:'#8b949e','in-progress':'#388bfd',inprogress:'#388bfd',done:'#3fb950','on-hold':'#f0a450',blocked:'#f85149'};
  const tcColor={Personnel:'#388bfd',Equipment:'#f0a450',Tool:'#bc8cff',Vehicle:'#39d3f2',Consumable:'#3fb950',Material:'#fb8f44',Manpower:'#f85149'};

  // ── Build month header ──
  const months=[];
  const cur=new Date(mD);cur.setDate(1);
  while(cur<=xD){
    const ms=new Date(Math.max(+cur,+mD));
    const me=new Date(Math.min(+(new Date(cur.getFullYear(),cur.getMonth()+1,0)),+xD));
    const p1=Math.max(0,daysBetween(minDate,ms.toISOString().split('T')[0])/totalDays*100);
    const p2=Math.min(100,(daysBetween(minDate,me.toISOString().split('T')[0])+1)/totalDays*100);
    months.push({label:cur.toLocaleString('default',{month:'short',year:'2-digit'}),l:p1,w:Math.max(0,p2-p1)});
    cur.setMonth(cur.getMonth()+1);
  }

  const pct=d=>Math.max(0,Math.min(100,daysBetween(minDate,d)/totalDays*100));
  const wPct=(s,e)=>Math.max(0.3,Math.min(100-pct(s),daysBetween(s,e)/totalDays*100));

  // ── Build rows HTML ──
  const todayLine=todayPct>0&&todayPct<100?`<div style="position:absolute;left:${todayPct}%;top:0;bottom:0;width:2px;background:var(--accent-red);z-index:10;pointer-events:none"></div>`:'';

  function barCell(barHtml){
    return`<div style="position:relative;height:${ROW_H}px;min-width:0;overflow:hidden">${todayLine}${barHtml}</div>`;
  }

  let rowsHtml='';
  const _gmeta={};

  // Project bar row
  rowsHtml+=`<div style="display:flex;border-bottom:2px solid var(--border);background:rgba(56,139,253,.05)">
    <div style="width:${LABEL_W}px;min-width:${LABEL_W}px;padding:6px 10px;font-size:12px;font-weight:700;color:var(--accent-blue);border-right:1px solid var(--border);overflow:hidden;white-space:nowrap;text-overflow:ellipsis">
      <i class="fas fa-project-diagram" style="margin-right:6px"></i>${p.id} — ${p.name.substring(0,22)}
    </div>
    <div style="flex:1;min-width:0">
      ${barCell(`
        <div style="position:absolute;left:0;right:0;top:8px;height:18px;background:rgba(56,139,253,.12);border-radius:3px;border:1px solid rgba(56,139,253,.3)"></div>
        <div style="position:absolute;left:0;width:${Math.min(100,p.progress||0)}%;top:8px;height:18px;background:rgba(56,139,253,.5);border-radius:3px;display:flex;align-items:center;padding:0 6px;overflow:hidden">
          <span style="font-size:9px;color:#fff;font-weight:700;white-space:nowrap">${p.progress||0}% complete</span>
        </div>`)}
    </div>
    <div style="width:86px;min-width:86px;padding:6px 8px;font-size:10px;font-family:var(--font-mono);border-left:1px solid var(--border);line-height:1.4">
      <div>${p.startDate}</div><div style="color:var(--text-muted)">${p.endDate}</div>
    </div>
    <div style="width:80px;min-width:80px;padding:6px 6px;font-size:10px;border-left:1px solid var(--border)"></div>
  </div>`;

  // Tasks header
  rowsHtml+=`<div style="display:flex;background:var(--bg-hover);border-bottom:1px solid var(--border)">
    <div style="width:${LABEL_W}px;min-width:${LABEL_W}px;padding:4px 10px;font-size:10px;font-weight:700;color:var(--text-secondary);letter-spacing:.5px;border-right:1px solid var(--border)">
      <i class="fas fa-tasks" style="color:var(--accent-blue);margin-right:5px"></i>TASKS (${tasks.length})
    </div>
    <div style="flex:1"></div>
    <div style="width:86px;min-width:86px;padding:4px 8px;font-size:9px;font-weight:700;color:var(--text-secondary);border-left:1px solid var(--border)">START / END</div>
    <div style="width:80px;min-width:80px;padding:4px 6px;font-size:9px;font-weight:700;color:var(--text-secondary);border-left:1px solid var(--border)">STATUS</div>
  </div>`;

  tasks.forEach(t=>{
    const c=scColor[t.status]||'#8b949e';
    const s=t.startDate||p.startDate;
    const e=t.endDate||t.dueDate||p.endDate;
    if(!s||!e)return;
    const lft=pct(s);
    const wdt=wPct(s,e);
    _gmeta[t.id]={lft,rgt:lft+wdt,preds:t.predecessors||''};
    const prog=t.status==='done'?wdt:Math.min(wdt,wdt*((t.progress||0)/100));
    const overdue=isOverdue(e)&&t.status!=='done';
    const isMile=!!t.milestone;

    let barContent='';
    if(isMile){
      barContent=`<div style="position:absolute;left:calc(${lft}% - 9px);top:8px;width:18px;height:18px;background:var(--accent-amber);border-radius:2px;transform:rotate(45deg)"></div>`;
    }else{
      barContent=`
        <div style="position:absolute;left:${lft}%;width:${wdt}%;min-width:4px;top:9px;height:${BAR_H}px;background:${c}33;border-radius:3px;border:1px solid ${c}88"></div>
        ${prog>0?`<div style="position:absolute;left:${lft}%;width:${prog}%;min-width:4px;top:9px;height:${BAR_H}px;background:${c};border-radius:3px;overflow:hidden;display:flex;align-items:center">
          <span style="font-size:8px;color:#fff;padding:0 4px;white-space:nowrap;overflow:hidden">${t.name}</span>
        </div>`:''}
        ${overdue?`<div style="position:absolute;left:calc(${lft+wdt}% + 2px);top:9px;font-size:9px;color:var(--accent-red)">⚠</div>`:''}`;
    }

    rowsHtml+=`<div id="ganttRow_${t.id}" style="display:flex;border-bottom:1px solid var(--border)" title="${t.name}">
      <div style="width:${LABEL_W}px;min-width:${LABEL_W}px;padding:5px 10px;border-right:1px solid var(--border);overflow:hidden">
        <div style="display:flex;align-items:center;gap:5px">
          <i class="fas ${isMile?'fa-diamond':'fa-circle'}" style="color:${isMile?'var(--accent-amber)':c};font-size:${isMile?'9':'6'}px;flex-shrink:0"></i>
          <span style="font-size:11px;font-weight:500;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${t.name}</span>
        </div>
        ${t.assignee?`<div style="font-size:9px;color:var(--text-muted);padding-left:14px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${t.assignee}</div>`:''}
      </div>
      <div id="ganttBar_${t.id}" style="flex:1;min-width:0">${barCell(barContent)}</div>
      <div style="width:86px;min-width:86px;padding:5px 8px;font-size:9px;font-family:var(--font-mono);border-left:1px solid var(--border);color:${overdue?'var(--accent-red)':'var(--text-secondary)'}">
        <div>${s}</div><div>${e}</div>
      </div>
      <div style="width:80px;min-width:80px;padding:5px 6px;border-left:1px solid var(--border)">
        <span class="badge" style="background:${c}22;color:${c};font-size:9px">${t.status}</span>
      </div>
    </div>`;
  });

  window._ganttMeta=_gmeta;

  // Resource allocations
  if(allocs.length){
    rowsHtml+=`<div style="display:flex;background:var(--bg-hover);border-bottom:1px solid var(--border)">
      <div style="width:${LABEL_W}px;min-width:${LABEL_W}px;padding:4px 10px;font-size:10px;font-weight:700;color:var(--text-secondary);letter-spacing:.5px;border-right:1px solid var(--border)">
        <i class="fas fa-layer-group" style="color:var(--accent-green);margin-right:5px"></i>ALLOCATIONS (${allocs.length})
      </div>
      <div style="flex:1"></div>
      <div style="width:166px;min-width:166px;border-left:1px solid var(--border)"></div>
    </div>`;
    allocs.forEach(a=>{
      const c=tcColor[a.resourceType]||'#8b949e';
      const lft=pct(a.startDate);
      const wdt=wPct(a.startDate,a.endDate);
      rowsHtml+=`<div style="display:flex;border-bottom:1px solid var(--border)">
        <div style="width:${LABEL_W}px;min-width:${LABEL_W}px;padding:4px 10px;border-right:1px solid var(--border);overflow:hidden">
          <div style="display:flex;align-items:center;gap:5px">
            <i class="fas fa-circle" style="color:${c};font-size:6px;flex-shrink:0"></i>
            <span style="font-size:11px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${a.resourceName}</span>
          </div>
          <div style="font-size:9px;color:var(--text-muted);padding-left:14px">${a.resourceType} · ${a.allocatedQty} ${a.unit}</div>
        </div>
        <div style="flex:1;min-width:0">${barCell(`<div style="position:absolute;left:${lft}%;width:${wdt}%;min-width:4px;top:10px;height:14px;background:${c};opacity:.75;border-radius:3px"></div>`)}</div>
        <div style="width:86px;min-width:86px;padding:4px 8px;font-size:9px;font-family:var(--font-mono);border-left:1px solid var(--border);color:var(--text-secondary)">
          <div>${a.startDate}</div><div>${a.endDate}</div>
        </div>
        <div style="width:80px;min-width:80px;padding:4px 6px;border-left:1px solid var(--border)">
          <span class="badge" style="background:${c}22;color:${c};font-size:9px">${a.resourceType}</span>
        </div>
      </div>`;
    });
  }

  // ── Month header ──
  const monthHeader=`<div style="display:flex;position:sticky;top:0;z-index:5;background:var(--bg-card);border-bottom:2px solid var(--border)">
    <div style="width:${LABEL_W}px;min-width:${LABEL_W}px;padding:7px 10px;font-size:11px;font-weight:700;color:var(--text-secondary);border-right:1px solid var(--border)">Task / Resource</div>
    <div style="flex:1;position:relative;height:32px;min-width:0">
      ${months.map(m=>`<div style="position:absolute;left:${m.l}%;width:${m.w}%;height:100%;border-left:1px solid var(--border);display:flex;align-items:center;padding:0 6px;overflow:hidden;box-sizing:border-box">
        <span style="font-size:10px;font-weight:700;white-space:nowrap">${m.label}</span>
      </div>`).join('')}
      ${todayPct>0&&todayPct<100?`<div style="position:absolute;left:${todayPct}%;top:0;bottom:0;width:2px;background:var(--accent-red);z-index:6"></div>`:''}
    </div>
    <div style="width:86px;min-width:86px;padding:7px 8px;font-size:9px;font-weight:700;color:var(--text-secondary);border-left:1px solid var(--border)">START / END</div>
    <div style="width:80px;min-width:80px;padding:7px 6px;font-size:9px;font-weight:700;color:var(--text-secondary);border-left:1px solid var(--border)">STATUS</div>
  </div>`;

  // ── Task summary ──
  const summaryCards=[
    ['#388bfd','In Progress',tasks.filter(t=>t.status==='in-progress'||t.status==='inprogress').length],
    ['#3fb950','Done',tasks.filter(t=>t.status==='done').length],
    ['#8b949e','Todo',tasks.filter(t=>t.status==='todo').length],
    ['#f85149','Overdue',tasks.filter(t=>t.dueDate&&isOverdue(t.dueDate)&&t.status!=='done').length],
    ['#f0a450','On Hold',tasks.filter(t=>t.status==='on-hold').length],
    ['var(--accent-amber)','Milestones',tasks.filter(t=>t.milestone).length],
  ];

  $('#detailTabContent').innerHTML=`
  <div class="card" style="padding:10px 14px;margin-bottom:12px;display:flex;align-items:center;gap:14px;flex-wrap:wrap">
    <div><span style="font-size:12px;color:var(--text-secondary)">Range: </span><span style="font-size:12px;font-weight:600;font-family:var(--font-mono)">${p.startDate} → ${p.endDate}</span></div>
    <div><span style="font-size:12px;color:var(--text-secondary)">Duration: </span><span style="font-size:12px;font-weight:600;font-family:var(--font-mono)">${daysBetween(p.startDate,p.endDate)} days</span></div>
    ${todayPct>0&&todayPct<100?`<div style="display:flex;align-items:center;gap:5px"><div style="width:12px;height:12px;background:var(--accent-red);border-radius:50%"></div><span style="font-size:11px">Today: ${today}</span></div>`:''}
    <div style="margin-left:auto;display:flex;align-items:center;gap:8px;flex-wrap:wrap">
      ${[['#388bfd','In Progress'],['#3fb950','Done'],['#8b949e','Todo'],['#f85149','Overdue'],['var(--accent-amber)','Milestone ◆']].map(([c,l])=>`<div style="display:flex;align-items:center;gap:4px"><div style="width:14px;height:8px;background:${c};border-radius:2px"></div><span style="font-size:10px">${l}</span></div>`).join('')}
      <button class="btn btn-secondary btn-sm" onclick="exportGanttPDF('${pid}')" title="Export Gantt to PDF (SY3-F-EPD-002 format)" style="margin-left:8px"><i class="fas fa-file-pdf" style="color:#f85149"></i> Export PDF</button>
    </div>
  </div>

  <div class="card" style="padding:0;overflow:hidden;margin-bottom:12px">
    <div style="overflow-x:auto;overflow-y:auto;max-height:70vh">
      <div style="min-width:700px">
        ${monthHeader}
        <div id="ganttRowsWrap" style="position:relative">${rowsHtml}<svg id="ganttArrowSvg" style="position:absolute;left:0;top:0;pointer-events:none;overflow:visible" width="0" height="0"></svg></div>
      </div>
    </div>
    ${todayPct>0&&todayPct<100?`<div style="padding:6px 14px;font-size:10px;color:var(--accent-red);border-top:1px solid var(--border)"><i class="fas fa-circle" style="font-size:7px;margin-right:5px"></i>Red line = Today (${today})</div>`:''}
  </div>

  <div style="display:grid;grid-template-columns:repeat(6,1fr);gap:8px;margin-bottom:12px">
    ${summaryCards.map(([c,l,v])=>`<div style="text-align:center;padding:10px 6px;background:var(--bg-hover);border-radius:8px;border:1px solid ${c}44">
      <div style="font-size:20px;font-weight:800;font-family:var(--font-mono);color:${c}">${v}</div>
      <div style="font-size:9px;color:var(--text-secondary);margin-top:2px">${l}</div>
    </div>`).join('')}
  </div>`;
  setTimeout(_drawGanttArrows,0);
}

function _parseGanttPreds(str){
  if(!str)return[];
  return str.split(',').map(s=>{
    s=s.trim();if(!s)return null;
    const m=s.match(/^(.+?)(FS|SS|FF|SF)?([+-]\d+)?$/i);
    if(!m)return{id:s,type:'FS',lag:0};
    return{id:m[1].trim(),type:(m[2]||'FS').toUpperCase(),lag:parseInt(m[3]||0)};
  }).filter(Boolean);
}

function _drawGanttArrows(){
  const svg=document.getElementById('ganttArrowSvg');
  if(!svg)return;
  const wrap=document.getElementById('ganttRowsWrap');
  if(!wrap)return;
  const meta=window._ganttMeta;
  if(!meta)return;
  const hasPreds=Object.values(meta).some(m=>m.preds);
  if(!hasPreds){svg.innerHTML='';return;}
  const wrapRect=wrap.getBoundingClientRect();
  const LABEL_W=240;
  const firstBar=wrap.querySelector('[id^="ganttBar_"]');
  const barW=firstBar?firstBar.getBoundingClientRect().width:Math.max(1,wrapRect.width-LABEL_W-166);
  svg.setAttribute('width',wrapRect.width);
  svg.setAttribute('height',wrapRect.height);
  let paths='';
  Object.entries(meta).forEach(([succId,succMeta])=>{
    if(!succMeta.preds)return;
    const preds=_parseGanttPreds(succMeta.preds);
    if(!preds.length)return;
    const succRowEl=document.getElementById('ganttRow_'+succId);
    if(!succRowEl)return;
    const succRect=succRowEl.getBoundingClientRect();
    const succY=succRect.top-wrapRect.top+succRect.height/2;
    preds.forEach(pred=>{
      const predMeta=meta[pred.id];
      if(!predMeta)return;
      const predRowEl=document.getElementById('ganttRow_'+pred.id);
      if(!predRowEl)return;
      const predRect=predRowEl.getBoundingClientRect();
      const predY=predRect.top-wrapRect.top+predRect.height/2;
      let x1,x2;
      if(pred.type==='SS'){x1=LABEL_W+predMeta.lft/100*barW;x2=LABEL_W+succMeta.lft/100*barW;}
      else if(pred.type==='FF'){x1=LABEL_W+predMeta.rgt/100*barW;x2=LABEL_W+succMeta.rgt/100*barW;}
      else if(pred.type==='SF'){x1=LABEL_W+predMeta.lft/100*barW;x2=LABEL_W+succMeta.rgt/100*barW;}
      else{x1=LABEL_W+predMeta.rgt/100*barW;x2=LABEL_W+succMeta.lft/100*barW;}
      const dx=x2-x1;
      let pathD;
      if(dx>20){
        const cp=dx*0.45;
        pathD=`M${x1},${predY} C${x1+cp},${predY} ${x2-cp},${succY} ${x2},${succY}`;
      }else{
        const g=14;
        const vx1=x1+g;const vx2=x2-g;
        pathD=`M${x1},${predY} L${vx1},${predY} L${vx1},${(predY+succY)/2} L${vx2},${(predY+succY)/2} L${vx2},${succY} L${x2},${succY}`;
      }
      paths+=`<path d="${pathD}" fill="none" stroke="rgba(56,139,253,.7)" stroke-width="1.5" marker-end="url(#ganttArr)"/>`;
    });
  });
  svg.innerHTML=`<defs><marker id="ganttArr" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto"><path d="M0,0 L6,3 L0,6 Z" fill="rgba(56,139,253,.8)"/></marker></defs>${paths}`;
}


// ── ASSET MASTERLIST ──────────────────────────────────────
// mlSearch etc. declared at top of script

// Debounced save helper — waits 600ms after last keystroke then saves
let _mlSaveTimer=null;
function _stampEdit(item,field,oldVal){
  const by=(typeof _currentUserProfile!=='undefined')?(_currentUserProfile?.name||_currentUserProfile?.email||'unknown'):'unknown';
  item._updatedAt=new Date().toISOString();
  item._updatedBy=by;
  // Record before/after for each field change (keep last 50 entries per record)
  if(field!==undefined&&oldVal!==undefined){
    if(!item._editHistory)item._editHistory=[];
    item._editHistory.push({field,oldVal,newVal:item[field],by,at:item._updatedAt});
    if(item._editHistory.length>50)item._editHistory=item._editHistory.slice(-50);
  }
}
function mlSave(id,listKey,field,val){
  clearTimeout(_mlSaveTimer);
  if(!AppState.data[listKey])AppState.data[listKey]=[];
  const item=AppState.data[listKey].find(r=>r.id===id);
  if(!item)return;
  const oldVal=item[field];
  item[field]=val;_stampEdit(item,field,oldVal);
  _mlSaveTimer=setTimeout(()=>{AppState.save();mlFlash(id);},600);
}
function mlSaveConsumable(id,field,val){
  clearTimeout(_mlSaveTimer);
  const item=(AppState.data.consumables||[]).find(c=>c.id===id);
  if(!item)return;
  const oldVal=item[field];
  item[field]=val;_stampEdit(item,field,oldVal);
  _mlSaveTimer=setTimeout(()=>{AppState.save();mlFlash(id);},600);
}
function mlSaveMaterial(id,field,val){
  clearTimeout(_mlSaveTimer);
  const item=(AppState.data.materials||[]).find(m=>m.id===id);
  if(!item)return;
  const oldVal=item[field];
  item[field]=val;_stampEdit(item,field,oldVal);
  _mlSaveTimer=setTimeout(()=>{AppState.save();mlFlash(id);},600);
}
function mlSaveTp(id,field,val){
  clearTimeout(_mlSaveTimer);
  const item=(AppState.data.thirdParty||[]).find(t=>t.id===id);
  if(!item)return;
  const oldVal=item[field];
  item[field]=val;_stampEdit(item,field,oldVal);
  _mlSaveTimer=setTimeout(()=>{AppState.save();mlFlash(id);},600);
}
function mlFlash(id){
  const rows=document.querySelectorAll(`[data-rowid="${id}"]`);
  rows.forEach(r=>{
    r.style.transition='background .15s';
    r.style.background='rgba(63,185,80,.15)';
    setTimeout(()=>{r.style.background='';},800);
  });
}
