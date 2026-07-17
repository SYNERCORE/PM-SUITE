// ── Team Load — pivot of open workload across all people ──────
// Same source data as My Work, but pivoted per-person so managers
// can spot overloaded people and idle ones at a glance.
//
// Row = person, columns = open task count, open action count, pending
// approval count, overdue count, total. Sortable, clickable — row
// click drops the person into My Work.

(function () {
  function _esc(s) {
    if (s == null) return '';
    return String(s).replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
  }

  function _isOverdue(dueDate, status) {
    if (!dueDate) return false;
    if (status === 'completed' || status === 'closed' || status === 'done') return false;
    const today = new Date(); today.setHours(0, 0, 0, 0);
    return new Date(dueDate) < today;
  }

  function _collectLoad() {
    // per-person record — key: canonical name (trimmed)
    const map = new Map();
    function bump(name, k) {
      if (!name) return;
      const key = String(name).trim();
      if (!key) return;
      if (!map.has(key)) map.set(key, { name: key, tasks: 0, actions: 0, approvals: 0, overdue: 0 });
      map.get(key)[k] += 1;
    }
    (AppState.data.tasks || []).forEach(t => {
      if (t._deleted || t.status === 'completed' || !t.assignee) return;
      bump(t.assignee, 'tasks');
      if (_isOverdue(t.dueDate || t.endDate, t.status)) bump(t.assignee, 'overdue');
    });
    (AppState.data.actions || []).forEach(a => {
      if (a._deleted || a.status === 'closed' || a.status === 'completed' || !a.assignee) return;
      bump(a.assignee, 'actions');
      if (_isOverdue(a.dueDate, a.status)) bump(a.assignee, 'overdue');
    });
    // Workflow approvals — use step approvers as the assignee
    if (typeof WF_DOCTYPES !== 'undefined') {
      Object.entries(WF_DOCTYPES).forEach(([dt, reg]) => {
        (AppState.data[reg.arrayKey] || []).forEach(d => {
          if (d._deleted || !d.wfRoute || d.wfRoute.docType !== dt) return;
          const st = wfState(d);
          if (st.status !== 'in-route') return;
          const step = st.steps[st.cur];
          if (!step) return;
          step.approvers.forEach(who => {
            if (!(st.approvals[st.cur]?.has(String(who).toLowerCase()))) bump(who, 'approvals');
          });
        });
      });
    }
    return Array.from(map.values());
  }

  function _totalOf(r) { return r.tasks + r.actions + r.approvals; }

  function _sort(rows, key, dir) {
    const mul = dir === 'asc' ? 1 : -1;
    return rows.slice().sort((a, b) => {
      const av = key === 'total' ? _totalOf(a) : (key === 'name' ? a.name : a[key]);
      const bv = key === 'total' ? _totalOf(b) : (key === 'name' ? b.name : b[key]);
      if (typeof av === 'string') return mul * av.localeCompare(bv);
      return mul * (av - bv);
    });
  }

  function _bar(count, max) {
    if (!max) return '';
    const pct = Math.max(4, Math.round((count / max) * 100));
    return `<div style="height:6px;width:${pct}%;background:var(--accent-blue);border-radius:3px;margin-top:4px"></div>`;
  }

  function renderTeamLoad() {
    const el = document.getElementById('teamLoad');
    if (!el) return;
    const rows = _collectLoad();

    if (!window._teamLoadSortState) window._teamLoadSortState = { key: 'total', dir: 'desc' };
    const { key, dir } = window._teamLoadSortState;
    const sorted = _sort(rows, key, dir);
    const maxTotal = Math.max(1, ...sorted.map(_totalOf));

    const totalOpen   = sorted.reduce((s, r) => s + _totalOf(r), 0);
    const totalOverdue = sorted.reduce((s, r) => s + r.overdue, 0);
    const peopleWithWork = sorted.filter(r => _totalOf(r) > 0).length;

    el.innerHTML = `
      <div class="page-header">
        <div>
          <h1 class="page-title"><i class="fas fa-users-cog" style="margin-right:8px;color:var(--accent-blue)"></i>Team Load</h1>
          <p class="page-subtitle">Open workload across the team · ${peopleWithWork} people with active items</p>
        </div>
        <button class="btn btn-sm btn-secondary" onclick="renderTeamLoad()"><i class="fas fa-sync"></i> Refresh</button>
      </div>

      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:12px;margin-bottom:20px">
        ${_tile('People with work', peopleWithWork, 'fa-users',       'var(--accent-blue)')}
        ${_tile('Open items',       totalOpen,      'fa-list',        'var(--accent-amber)')}
        ${_tile('Overdue',          totalOverdue,   'fa-hourglass-half', 'var(--accent-red)')}
      </div>

      <div class="card">
        <div class="card-body" style="padding:0">
          ${sorted.length ? `<table class="data-table">
            <thead><tr>
              ${_th('Person',   'name')}
              ${_th('Tasks',    'tasks')}
              ${_th('Actions',  'actions')}
              ${_th('Approvals','approvals')}
              ${_th('Overdue',  'overdue')}
              ${_th('Total',    'total')}
              <th>Load</th>
            </tr></thead>
            <tbody>${sorted.map(r => `<tr style="cursor:pointer" onclick="_teamLoadOpen('${_esc(r.name)}')">
              <td style="font-weight:600">${_esc(r.name)}</td>
              <td>${r.tasks || '—'}</td>
              <td>${r.actions || '—'}</td>
              <td>${r.approvals || '—'}</td>
              <td>${r.overdue ? `<span class="badge badge-danger">${r.overdue}</span>` : '—'}</td>
              <td style="font-weight:700">${_totalOf(r)}</td>
              <td style="min-width:120px">${_bar(_totalOf(r), maxTotal)}</td>
            </tr>`).join('')}</tbody>
          </table>` : `<div class="empty-state" style="padding:40px">
            <i class="fas fa-check-circle" style="font-size:28px;color:var(--accent-green);display:block;margin-bottom:12px"></i>
            <div>No open assignments. Team is clear.</div>
          </div>`}
        </div>
      </div>
    `;
  }

  function _th(label, key) {
    const active = window._teamLoadSortState?.key === key;
    const dir = active ? window._teamLoadSortState.dir : 'desc';
    const arrow = active ? (dir === 'asc' ? ' ▲' : ' ▼') : '';
    return `<th style="cursor:pointer" onclick="_teamLoadSortClick('${key}')">${label}${arrow}</th>`;
  }

  function _tile(label, value, icon, color) {
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

  window.renderTeamLoad = renderTeamLoad;
  window._teamLoadSortClick = function (key) {
    const cur = window._teamLoadSortState;
    const dir = (cur && cur.key === key && cur.dir === 'desc') ? 'asc' : 'desc';
    window._teamLoadSortState = { key, dir };
    renderTeamLoad();
  };
  window._teamLoadOpen = function (name) {
    window._myWorkTarget = name;
    navigate('myWork');
  };
})();
