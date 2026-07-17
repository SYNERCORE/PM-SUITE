// ── My Work — unified per-person queue ─────────────────────────
// One page that answers: "what's assigned to me?"
// Sections: open Tasks · open Actions · pending Workflow approvals ·
// Deletion Requests I raised.
//
// Assignee dropdown defaults to the current user; admins/managers can
// pick anyone from the roster to see that person's queue.

(function () {

  // Case-insensitive equality that also matches "First Last" against "First"
  function _assigneeMatches(recAssignee, target) {
    if (!recAssignee || !target) return false;
    const a = String(recAssignee).trim().toLowerCase();
    const t = String(target).trim().toLowerCase();
    if (!a || !t) return false;
    if (a === t) return true;
    // Allow email-vs-name loose match when a record was tagged with an email
    if (a.includes(t) || t.includes(a)) return true;
    return false;
  }

  function _allAssigneeNames() {
    const set = new Set();
    (AppState.data.tasks   || []).forEach(t => { if (t.assignee && !t._deleted) set.add(String(t.assignee).trim()); });
    (AppState.data.actions || []).forEach(a => { if (a.assignee && !a._deleted) set.add(String(a.assignee).trim()); });
    (AppState.data.resources || []).forEach(r => { if (r.name && !r._deleted) set.add(String(r.name).trim()); });
    return Array.from(set).filter(Boolean).sort((a, b) => a.localeCompare(b));
  }

  function _dueSort(a, b) {
    const ad = a.dueDate || a.endDate || '9999-12-31';
    const bd = b.dueDate || b.endDate || '9999-12-31';
    return String(ad).localeCompare(String(bd));
  }

  function _dueBadge(dueDate, status) {
    if (!dueDate) return '';
    if (status === 'completed' || status === 'closed' || status === 'done') return '';
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const due = new Date(dueDate);
    const days = Math.round((due - today) / 86400000);
    if (days < 0)  return `<span class="badge badge-danger" title="${dueDate}">Overdue ${-days}d</span>`;
    if (days === 0) return `<span class="badge badge-warning">Due today</span>`;
    if (days <= 3) return `<span class="badge badge-warning">Due in ${days}d</span>`;
    return `<span style="color:var(--text-muted);font-size:11px">${dueDate}</span>`;
  }

  function _projectName(projectId) {
    if (!projectId) return '—';
    const p = (AppState.data.projects || []).find(p => p.id === projectId);
    return p ? p.name : projectId;
  }

  function _openTasksFor(name) {
    return (AppState.data.tasks || [])
      .filter(t => !t._deleted && t.status !== 'completed' && _assigneeMatches(t.assignee, name))
      .sort(_dueSort);
  }

  function _openActionsFor(name) {
    return (AppState.data.actions || [])
      .filter(a => !a._deleted && a.status !== 'closed' && a.status !== 'completed' && _assigneeMatches(a.assignee, name))
      .sort(_dueSort);
  }

  function _approvalsFor(name, email) {
    // wfPendingForMe uses the logged-in user; for other people we replay
    // the same logic but match against the arbitrary target email/name.
    if (typeof WF_DOCTYPES === 'undefined') return [];
    const target = (email || name || '').toLowerCase();
    const out = [];
    Object.entries(WF_DOCTYPES).forEach(([dt, reg]) => {
      (AppState.data[reg.arrayKey] || []).forEach(d => {
        if (d._deleted || !d.wfRoute || d.wfRoute.docType !== dt) return;
        const st = wfState(d);
        if (st.status !== 'in-route') return;
        const step = st.steps[st.cur];
        if (!step) return;
        const isApprover = step.approvers.some(a => String(a).toLowerCase() === target);
        if (isApprover && !(st.approvals[st.cur]?.has(target))) out.push({ dt, reg, d, st, step });
      });
    });
    return out;
  }

  function _delReqsBy(name, email) {
    return (AppState.data.deletionRequests || [])
      .filter(r => !r._deleted && (
        (email && r.requestedByEmail && r.requestedByEmail.toLowerCase() === email.toLowerCase()) ||
        _assigneeMatches(r.requestedBy, name)
      ))
      .sort((a, b) => String(b.requestedAt || '').localeCompare(String(a.requestedAt || '')));
  }

  // ── Table renderers ─────────────────────────────────────────
  function _tasksTable(rows) {
    if (!rows.length) return `<div class="empty-state" style="padding:24px;font-size:12px">Nothing open.</div>`;
    return `<table class="data-table"><thead><tr>
      <th>Task</th><th>Project</th><th>Status</th><th>Progress</th><th>Due</th><th></th>
    </tr></thead><tbody>${rows.map(t => `<tr>
      <td>${_escape(t.name || t.id)}</td>
      <td>${_escape(_projectName(t.projectId))}</td>
      <td><span class="badge">${_escape(t.status || 'todo')}</span></td>
      <td>${(t.progress != null ? t.progress : 0)}%</td>
      <td>${_dueBadge(t.dueDate || t.endDate, t.status)}</td>
      <td><button class="btn btn-sm btn-secondary" onclick="_myWorkOpenTask('${_escape(t.id)}')">Open</button></td>
    </tr>`).join('')}</tbody></table>`;
  }

  function _actionsTable(rows) {
    if (!rows.length) return `<div class="empty-state" style="padding:24px;font-size:12px">Nothing open.</div>`;
    return `<table class="data-table"><thead><tr>
      <th>Description</th><th>Project</th><th>Priority</th><th>Status</th><th>Due</th>
    </tr></thead><tbody>${rows.map(a => `<tr>
      <td>${_escape(a.description || a.id)}</td>
      <td>${_escape(_projectName(a.projectId))}</td>
      <td><span class="badge">${_escape(a.priority || 'medium')}</span></td>
      <td><span class="badge">${_escape(a.status || 'open')}</span></td>
      <td>${_dueBadge(a.dueDate, a.status)}</td>
    </tr>`).join('')}</tbody></table>`;
  }

  function _approvalsTable(rows) {
    if (!rows.length) return `<div class="empty-state" style="padding:24px;font-size:12px">No pending approvals.</div>`;
    return `<table class="data-table"><thead><tr>
      <th>Document</th><th>Type</th><th>Step</th><th>Since</th>
    </tr></thead><tbody>${rows.map(({ d, st, step, reg }) => `<tr>
      <td>${_escape(d.name || d.description || d.id)}</td>
      <td>${_escape(reg.label || '')}</td>
      <td>${_escape(step.name || 'Step ' + (st.cur + 1))} (${st.cur + 1}/${st.steps.length})</td>
      <td style="font-size:11px;color:var(--text-muted)">${d.wfRoute?.startedAt ? new Date(d.wfRoute.startedAt).toLocaleDateString() : '—'}</td>
    </tr>`).join('')}</tbody></table>`;
  }

  function _delReqsTable(rows) {
    if (!rows.length) return `<div class="empty-state" style="padding:24px;font-size:12px">No requests raised.</div>`;
    return `<table class="data-table"><thead><tr>
      <th>Record</th><th>Type</th><th>Status</th><th>Requested</th>
    </tr></thead><tbody>${rows.map(r => `<tr>
      <td>${_escape(r.recordLabel || r.recordId)}</td>
      <td>${_escape(r.recordType || '—')}</td>
      <td><span class="badge">${_escape(r.status || 'pending')}</span></td>
      <td style="font-size:11px;color:var(--text-muted)">${r.requestedAt ? new Date(r.requestedAt).toLocaleDateString() : '—'}</td>
    </tr>`).join('')}</tbody></table>`;
  }

  function _escape(s) {
    if (s == null) return '';
    return String(s).replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
  }

  // ── Main render ─────────────────────────────────────────────
  function renderMyWork() {
    const el = document.getElementById('myWork');
    if (!el) return;

    const me = (typeof _currentUserProfile !== 'undefined' && _currentUserProfile) || null;
    const myName  = me?.name || '';
    const myEmail = me?.email || '';

    // Selected assignee — persists via window._myWorkTarget across re-renders
    if (!window._myWorkTarget) window._myWorkTarget = myName || myEmail || '';
    const target = window._myWorkTarget;

    // Match resources → email so approvals can find the person by email
    let targetEmail = myEmail;
    if (target && target !== myName) {
      const res = (AppState.data.resources || []).find(r => r.name === target);
      targetEmail = res?.email || '';
    }

    const names = _allAssigneeNames();
    const tasks     = _openTasksFor(target);
    const actions   = _openActionsFor(target);
    const approvals = _approvalsFor(target, targetEmail);
    const delReqs   = _delReqsBy(target, targetEmail);

    const total = tasks.length + actions.length + approvals.length + delReqs.length;

    el.innerHTML = `
      <div class="page-header">
        <div>
          <h1 class="page-title"><i class="fas fa-inbox" style="margin-right:8px;color:var(--accent-blue)"></i>My Work</h1>
          <p class="page-subtitle">Everything assigned to <strong>${_escape(target || '—')}</strong> · ${total} open item${total === 1 ? '' : 's'}</p>
        </div>
        <div style="display:flex;align-items:center;gap:10px">
          <label style="font-size:12px;color:var(--text-muted)">Assignee</label>
          <select id="_mwPicker" class="form-input" style="min-width:220px" onchange="_myWorkPick(this.value)">
            ${myName ? `<option value="${_escape(myName)}">${_escape(myName)} (me)</option>` : ''}
            ${names.filter(n => n !== myName).map(n => `<option value="${_escape(n)}" ${n === target ? 'selected' : ''}>${_escape(n)}</option>`).join('')}
          </select>
          <button class="btn btn-sm btn-secondary" onclick="renderMyWork()"><i class="fas fa-sync"></i> Refresh</button>
        </div>
      </div>

      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:12px;margin-bottom:20px">
        ${_kpiTile('Tasks',      tasks.length,     'fa-tasks',           'var(--accent-blue)')}
        ${_kpiTile('Actions',    actions.length,   'fa-clipboard-list',  'var(--accent-amber)')}
        ${_kpiTile('Approvals',  approvals.length, 'fa-stamp',           'var(--accent-purple, #8b5cf6)')}
        ${_kpiTile('Del. Reqs',  delReqs.length,   'fa-trash-restore',   'var(--accent-red)')}
      </div>

      ${_section('Open Tasks',                'fa-tasks',          _tasksTable(tasks),         'tasks')}
      ${_section('Open Action Items',         'fa-clipboard-list', _actionsTable(actions),     'actions')}
      ${_section('Pending Workflow Approvals','fa-stamp',          _approvalsTable(approvals), 'approvals')}
      ${_section('Deletion Requests I Raised','fa-trash-restore',  _delReqsTable(delReqs),     'deletionRequests')}
    `;
  }

  function _kpiTile(label, value, icon, color) {
    return `<div class="stat-card" style="padding:14px 16px">
      <div style="display:flex;align-items:center;gap:10px">
        <i class="fas ${icon}" style="font-size:20px;color:${color}"></i>
        <div>
          <div style="font-size:22px;font-weight:700">${value}</div>
          <div style="font-size:11px;color:var(--text-muted);text-transform:uppercase;letter-spacing:.5px">${label}</div>
        </div>
      </div>
    </div>`;
  }

  function _section(title, icon, body, gotoId) {
    return `<div class="card" style="margin-bottom:18px">
      <div class="card-header" style="display:flex;justify-content:space-between;align-items:center">
        <h3 class="card-title"><i class="fas ${icon}" style="margin-right:6px"></i>${title}</h3>
        ${gotoId ? `<button class="btn btn-sm btn-link" onclick="navigate('${gotoId}')">Go to ${title.split(' ').slice(-1)[0]} →</button>` : ''}
      </div>
      <div class="card-body" style="padding:0">${body}</div>
    </div>`;
  }

  // Public handlers used by inline onclick / onchange
  window.renderMyWork = renderMyWork;
  window._myWorkPick = function (name) {
    window._myWorkTarget = name || '';
    renderMyWork();
  };
  window._myWorkOpenTask = function (id) {
    // Task detail lives inside the tasks page; navigate then let it open
    navigate('tasks');
    window._openTaskId = id;
    if (typeof showTaskDetail === 'function') setTimeout(() => showTaskDetail(id), 100);
  };
})();
