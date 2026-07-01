// ── SHARED UI TEMPLATE HELPERS (Phase C3) ────────────────────
// Named, readable replacements for cryptic one-letter helpers.
// All functions return HTML strings for use in innerHTML assignments.

// ── Empty state ──────────────────────────────────────────────
// icon: FontAwesome class e.g. 'fas fa-boxes'
// title: main heading
// desc: supporting sentence
// cta: optional { label, onclick } for a primary action button
function tEmptyState(icon, title, desc, cta) {
  return `<div class="empty-state">
    <i class="${icon} empty-icon"></i>
    <div class="empty-title">${title}</div>
    <div class="empty-desc">${desc}</div>
    ${cta ? `<button class="btn btn-primary btn-sm" onclick="${cta.onclick}">${cta.label}</button>` : ''}
  </div>`;
}

// ── KPI stat card ────────────────────────────────────────────
function tStatCard(icon, label, value, sub, color, bg, onclick) {
  const clickAttr = onclick ? `onclick="${onclick}" title="Click to view"` : '';
  return `<div class="stat-card" ${clickAttr} style="${onclick ? 'cursor:pointer' : ''}">
    <div class="stat-icon" style="background:${bg}"><i class="${icon}" style="color:${color}"></i></div>
    <div class="stat-info">
      <div class="label">${label}</div>
      <div class="value" style="color:${color}">${value}</div>
      <div class="change">${sub}</div>
    </div>
  </div>`;
}

// ── Badge ────────────────────────────────────────────────────
function tBadge(status) {
  const map = {
    active:      ['badge-blue','Active'],    completed:  ['badge-green','Completed'],
    planned:     ['badge-purple','Planned'], done:       ['badge-green','Done'],
    inprogress:  ['badge-blue','In Progress'], todo:     ['badge-gray','To Do'],
    blocked:     ['badge-red','Blocked'],    approved:   ['badge-green','Approved'],
    pending:     ['badge-amber','Pending'],  review:     ['badge-blue','In Review'],
    issued:      ['badge-cyan','Issued'],    open:       ['badge-amber','Open'],
    closed:      ['badge-green','Closed'],   mitigated:  ['badge-purple','Mitigated'],
    overdue:     ['badge-red','Overdue'],    partial:    ['badge-amber','Partial'],
    ordered:     ['badge-blue','Ordered'],   delivered:  ['badge-green','Delivered'],
    'on-hold':   ['badge-gray','On Hold'],
  };
  const [cls, label] = map[status] || ['badge-gray', status || '—'];
  return `<span class="badge ${cls}">${label}</span>`;
}

// ── Priority badge ───────────────────────────────────────────
function tPriorityBadge(priority) {
  const map = {
    critical: ['badge-red','Critical'], high:   ['badge-amber','High'],
    medium:   ['badge-blue','Medium'],  low:    ['badge-green','Low'],
  };
  const [cls, label] = map[priority] || ['badge-gray', priority || '—'];
  return `<span class="badge ${cls}">${label}</span>`;
}

// ── Progress bar ─────────────────────────────────────────────
function tProgressBar(pct, height = 6) {
  const color = pct >= 80 ? 'var(--accent-green)' : pct >= 50 ? 'var(--accent-blue)' : pct >= 30 ? 'var(--accent-amber)' : 'var(--accent-red)';
  return `<div style="display:flex;align-items:center;gap:6px">
    <div class="progress-bar" style="flex:1;height:${height}px">
      <div class="progress-fill" style="width:${Math.min(100,Math.max(0,pct))}%;background:${color}"></div>
    </div>
    <span style="font-size:10px;font-family:var(--font-mono);min-width:28px;text-align:right">${pct}%</span>
  </div>`;
}

// ── Table wrapper with optional empty state ──────────────────
function tTable(headers, rows, emptyMsg) {
  if (!rows || !rows.length) {
    return tEmptyState('fas fa-table', 'No records found', emptyMsg || 'Add entries to see them here.');
  }
  return `<div class="table-wrap"><table>
    <thead><tr>${headers.map(h => `<th>${h}</th>`).join('')}</tr></thead>
    <tbody>${rows.join('')}</tbody>
  </table></div>`;
}

// ── Section header ───────────────────────────────────────────
function tSectionHeader(title, icon, rightContent) {
  return `<div class="section-header">
    <div class="section-title"><i class="${icon}" style="margin-right:7px;color:var(--accent-blue)"></i>${title}</div>
    ${rightContent || ''}
  </div>`;
}

window.tEmptyState     = tEmptyState;
window.tStatCard       = tStatCard;
window.tBadge          = tBadge;
window.tPriorityBadge  = tPriorityBadge;
window.tProgressBar    = tProgressBar;
window.tTable          = tTable;
window.tSectionHeader  = tSectionHeader;
