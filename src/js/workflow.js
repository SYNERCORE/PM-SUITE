// ═══════════════════════════════════════════════════════════════
// WORKFLOW ENGINE — multi-step approval routing (v2.7.0)
//
// Definition (template, admin-edited)  vs  Instance (snapshot on the doc).
// Instance state is REPLAYED from an append-only wfActions[] array so that
// concurrent multi-user merges (union by `at`) always converge to the same
// state on every device. Admins can re-route in-flight docs by appending
// route/skip/force actions — completed steps are immutable.
//
// Doc fields used:  doc.wfRoute  {defId,defVersion,docType,startedAt,steps[]}
//                   doc.wfActions [{at,by,byName,kind,stepIdx,note,steps?}]
//                   doc.wfDone   true once final hooks ran on this device
// ═══════════════════════════════════════════════════════════════

const WF_DOCTYPES = {
  issuanceRequest: {
    label: 'Warehouse Issuance Request', icon: 'fa-warehouse',
    arrayKey: 'issuanceRequests',
    amount: d => 0,
    ref: d => `${d.id} — ${d.itemName || d.itemId || ''} ×${d.qty || ''}`.trim(),
    onApproved: d => { d.status = 'approved'; },
    onRejected: d => { d.status = 'rejected'; },
  },
  procurementPR: {
    label: 'Procurement — PR Approval', icon: 'fa-file-signature',
    arrayKey: 'procurement',
    amount: d => d.amount || 0,
    ref: d => `${d.id} — ${d.description || ''} (₱${(d.amount || 0).toLocaleString()})`,
    onApproved: d => { d.status = 'approved'; },
    onRejected: d => { d.status = 'draft'; },
  },
  procurementPO: {
    label: 'Procurement — PO Approval (before Ordered)', icon: 'fa-shopping-cart',
    arrayKey: 'procurement',
    amount: d => d.amount || 0,
    ref: d => `${d.id} — ${d.description || ''} (₱${(d.amount || 0).toLocaleString()})`,
    onApproved: d => { d.status = 'ordered'; },
    onRejected: d => { /* stays at current stage */ },
  },
  deletionRequest: {
    label: 'Deletion Request', icon: 'fa-clipboard-check',
    arrayKey: 'deletionRequests',
    amount: d => 0,
    ref: d => `${d.recordType || ''} — ${d.recordLabel || d.recordId || ''}`,
    onApproved: d => {
      if (typeof softDelete === 'function' && d.arrayKey && d.recordId) { try { softDelete(d.arrayKey, d.recordId); } catch (e) {} }
      d.status = 'approved';
    },
    onRejected: d => { d.status = 'rejected'; },
  },
};

// ── Definitions ───────────────────────────────────────────────
function wfDefs() { return (AppState.data.workflowDefs || []).filter(d => !d._deleted); }
function wfActiveDef(docType) { return wfDefs().find(d => d.docType === docType && d.active); }
function _wfMe() { return { email: (_currentUserProfile?.email || '').toLowerCase(), name: _currentUserProfile?.name || _currentUserProfile?.email || 'Unknown' }; }
function _wfNow() { return new Date().toISOString(); }

// ── Start a route on a document ───────────────────────────────
// Returns true if a workflow was attached, false → caller keeps legacy behavior.
function wfStart(docType, doc) {
  const def = wfActiveDef(docType);
  if (!def || !def.steps?.length) return false;
  const amt = WF_DOCTYPES[docType]?.amount(doc) || 0;
  // Snapshot steps; drop steps whose amount condition doesn't trigger
  const roles = AppState.data.settings?.approverRoles || [];
  const steps = def.steps
    .filter(s => !s.minAmount || amt >= s.minAmount)
    .map(s => {
      let approvers = (s.approvers || []).map(a => a.toLowerCase());
      if (s.role) { const r = roles.find(x => x.id === s.role); if (r) approvers = [...new Set([...approvers, ...(r.members || []).map(m => m.toLowerCase())])]; }
      return { name: s.name, approvers, mode: s.mode === 'all' ? 'all' : 'any', slaDays: s.slaDays || 0 };
    });
  if (!steps.length) return false;
  // A finished previous route on the same doc (e.g. PR→PO) gets archived
  if (doc.wfRoute) { doc.wfPast = doc.wfPast || []; doc.wfPast.push({ route: doc.wfRoute, actions: doc.wfActions || [], archivedAt: _wfNow() }); }
  doc.wfRoute = { defId: def.id, defVersion: def.version || 1, docType, startedAt: _wfNow(), steps };
  doc.wfActions = [];
  doc.wfDone = false;
  _wfNotifyStep(doc, 0);
  _wfWebhook('route_started', docType, doc, { workflow: def.name, step: steps[0].name, approvers: steps[0].approvers });
  if (typeof spWriteAuditLog === 'function') spWriteAuditLog('wf_start', docType, doc.id, WF_DOCTYPES[docType]?.ref(doc) || doc.id, { workflow: def.name, steps: steps.map(s => s.name).join(' → ') });
  return true;
}

// ── Replay: derive current state from actions (merge-safe) ────
function wfState(doc) {
  if (!doc?.wfRoute) return null;
  let steps = doc.wfRoute.steps.map(s => ({ ...s }));
  let cur = 0, status = 'in-route';
  const approvals = {}; // stepIdx → Set of emails
  const acts = [...(doc.wfActions || [])].sort((a, b) => (a.at || '').localeCompare(b.at || ''));
  const stepAt = { 0: doc.wfRoute.startedAt }; // when each step became current
  for (const a of acts) {
    if (status !== 'in-route') break;
    const adv = () => { cur++; stepAt[cur] = a.at; if (cur >= steps.length) status = 'approved'; };
    if (a.kind === 'approve' && a.stepIdx === cur) {
      (approvals[cur] = approvals[cur] || new Set()).add((a.by || '').toLowerCase());
      const st = steps[cur];
      if (st && (st.mode === 'any' || st.approvers.every(ap => approvals[cur].has(ap)))) adv();
    } else if (a.kind === 'reject' && a.stepIdx === cur) {
      status = 'rejected';
    } else if (a.kind === 'skip' && a.stepIdx === cur) {
      adv();
    } else if (a.kind === 'force') {
      status = a.decision === 'reject' ? 'rejected' : 'approved';
    } else if (a.kind === 'route' && Array.isArray(a.steps)) {
      // Replace steps from `cur` onward; completed steps stay untouched
      steps = [...steps.slice(0, cur), ...a.steps.map(s => ({ ...s, approvers: (s.approvers || []).map(x => x.toLowerCase()) }))];
      if (cur >= steps.length) status = 'approved';
    }
  }
  return { steps, cur, status, approvals, stepAt };
}

// Apply final hooks exactly once per device, keep doc.status coherent
function wfApply(docType, doc) {
  const st = wfState(doc);
  if (!st) return st;
  if ((st.status === 'approved' || st.status === 'rejected') && !doc.wfDone) {
    doc.wfDone = true;
    const reg = WF_DOCTYPES[docType];
    try { st.status === 'approved' ? reg?.onApproved(doc) : reg?.onRejected(doc); } catch (e) { console.error('[wf hook]', e); }
  }
  return st;
}

function wfCanAct(doc, email) {
  const st = wfState(doc);
  if (!st || st.status !== 'in-route') return false;
  const step = st.steps[st.cur];
  if (!step) return false;
  const e = (email || _wfMe().email).toLowerCase();
  if (!step.approvers.includes(e)) return false;
  return !(st.approvals[st.cur]?.has(e)); // can't approve twice
}

// ── Act ───────────────────────────────────────────────────────
function wfAct(docType, id, decision) {
  const reg = WF_DOCTYPES[docType]; if (!reg) return;
  const doc = (AppState.data[reg.arrayKey] || []).find(d => d.id === id); if (!doc) return;
  const me = _wfMe();
  if (!wfCanAct(doc)) { showToast('You are not an approver for the current step', 'error'); return; }
  let note = prompt(decision === 'reject' ? 'Reason for rejection? (visible to requester)' : 'Optional note:', '');
  if (note === null) return; // cancelled
  note = note.trim();
  const st = wfState(doc);
  doc.wfActions.push({ at: _wfNow(), by: me.email, byName: me.name, kind: decision === 'reject' ? 'reject' : 'approve', stepIdx: st.cur, note: (note || '').trim() });
  const after = wfApply(docType, doc);
  AppState.save();
  if (typeof spWriteAuditLog === 'function') spWriteAuditLog('wf_' + decision, docType, doc.id, reg.ref(doc), { step: st.steps[st.cur]?.name, note });
  if (after.status === 'in-route' && after.cur > st.cur) _wfNotifyStep(doc, after.cur);
  _wfWebhook(after.status === 'in-route' ? 'step_' + decision : 'route_' + after.status, docType, doc,
    { by: me.email, step: st.steps[st.cur]?.name, note, nextStep: after.status === 'in-route' ? after.steps[after.cur]?.name : null, nextApprovers: after.status === 'in-route' ? after.steps[after.cur]?.approvers : null });
  showToast(decision === 'reject' ? 'Rejected' : (after.status === 'approved' ? 'Approved — route complete' : 'Approved — moved to next step'), decision === 'reject' ? 'error' : 'success');
  _wfRefresh();
}

function _wfNotifyStep(doc, stepIdx) {
  try {
    const step = doc.wfRoute.steps[stepIdx]; if (!step) return;
    if (!AppState.data.notifications) AppState.data.notifications = [];
    AppState.data.notifications.push({
      id: 'NTF-' + Date.now() + '-' + Math.floor(Math.random() * 999),
      type: 'approval', read: false, at: _wfNow(),
      title: 'Approval needed: ' + (WF_DOCTYPES[doc.wfRoute.docType]?.label || doc.wfRoute.docType),
      message: `${doc.id} — step "${step.name}" awaits ${step.approvers.join(', ')}`,
      targets: step.approvers,
    });
  } catch (e) {}
}

// ── Power Automate / webhook integration ─────────────────────
// POSTs workflow events to the URL in Settings → Integrations. Fire-and-forget:
// failures never block the approval itself.
function _wfWebhook(event, docType, doc, extra) {
  try {
    const url = AppState.data.settings?.webhookUrl; // Settings → Integrations → Webhook URL
    if (!url || !/^https:\/\//i.test(url)) return;
    const reg = WF_DOCTYPES[docType];
    const payload = {
      event, docType, docId: doc.id,
      ref: reg?.ref(doc) || doc.id,
      amount: reg?.amount(doc) || 0,
      appUrl: 'https://synercore.github.io/PM-SUITE/promaster.html',
      at: _wfNow(),
      ...extra,
    };
    fetch(url, { method: 'POST', mode: 'no-cors', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }).catch(() => {});
  } catch (e) {}
}

function _wfRefresh() {
  const active = document.querySelector('.page.active')?.id;
  if (active && typeof renderPage === 'function') renderPage(active);
}

// ── Embeddable UI helpers ─────────────────────────────────────
function wfBadge(doc) {
  const st = wfState(doc);
  if (!st) return '';
  if (st.status === 'approved') return `<span class="badge" style="background:rgba(63,185,80,.15);color:#3fb950;font-size:9px"><i class="fas fa-route"></i> Route complete</span>`;
  if (st.status === 'rejected') return `<span class="badge" style="background:rgba(248,81,73,.15);color:#f85149;font-size:9px"><i class="fas fa-route"></i> Rejected in route</span>`;
  const step = st.steps[st.cur];
  const wait = step.mode === 'all' ? step.approvers.filter(a => !st.approvals[st.cur]?.has(a)) : step.approvers;
  return `<span class="badge" style="background:rgba(56,139,253,.12);color:#79c0ff;font-size:9px" title="Awaiting: ${wait.join(', ')}"><i class="fas fa-route"></i> Step ${st.cur + 1}/${st.steps.length}: ${step.name}</span>`;
}

function wfActionButtonsHTML(docType, doc) {
  const st = wfState(doc);
  if (!st) return '';
  let h = '';
  if (st.status === 'in-route' && wfCanAct(doc)) {
    h += `<button class="btn btn-secondary btn-sm" style="padding:2px 7px;font-size:11px;color:var(--accent-green)" onclick="wfAct('${docType}','${doc.id}','approve')"><i class="fas fa-check"></i> Approve</button>
          <button class="btn btn-secondary btn-sm" style="padding:2px 7px;font-size:11px;color:var(--accent-red)" onclick="wfAct('${docType}','${doc.id}','reject')"><i class="fas fa-times"></i> Reject</button>`;
  }
  if (typeof isAdminUser === 'function' && isAdminUser()) {
    h += `<button class="btn btn-secondary btn-sm" style="padding:2px 7px;font-size:11px;color:var(--accent-cyan)" onclick="wfManageRoute('${docType}','${doc.id}')" title="View / modify route (Admin)"><i class="fas fa-route"></i></button>`;
  } else {
    h += `<button class="btn btn-secondary btn-sm" style="padding:2px 7px;font-size:11px" onclick="wfManageRoute('${docType}','${doc.id}')" title="View route"><i class="fas fa-eye"></i></button>`;
  }
  return h;
}

// ═══ MANAGE / VIEW ROUTE (admin can edit mid-flight) ══════════
function wfManageRoute(docType, id) {
  const reg = WF_DOCTYPES[docType]; if (!reg) return;
  const doc = (AppState.data[reg.arrayKey] || []).find(d => d.id === id); if (!doc || !doc.wfRoute) return;
  const st = wfState(doc);
  const admin = typeof isAdminUser === 'function' && isAdminUser();
  const canEdit = admin && st.status === 'in-route';

  const stepRows = st.steps.map((s, i) => {
    const done = i < st.cur || st.status === 'approved';
    const current = i === st.cur && st.status === 'in-route';
    const approvedBy = [...(st.approvals[i] || [])];
    const col = done ? '#3fb950' : current ? '#79c0ff' : 'var(--text-muted)';
    const icon = done ? 'fa-check-circle' : current ? 'fa-hourglass-half' : 'fa-circle';
    const slaWarn = current && s.slaDays > 0 && st.stepAt[i] && (Date.now() - new Date(st.stepAt[i]).getTime()) > s.slaDays * 864e5;
    return `<div style="display:flex;gap:10px;align-items:flex-start;padding:10px;border:1px solid ${current ? 'rgba(56,139,253,.4)' : 'var(--border)'};border-radius:8px;margin-bottom:7px;background:${current ? 'rgba(56,139,253,.06)' : 'transparent'}">
      <i class="fas ${icon}" style="color:${col};margin-top:2px"></i>
      <div style="flex:1;min-width:0">
        <div style="font-size:12px;font-weight:700;color:${col}">Step ${i + 1}: ${s.name} ${slaWarn ? '<span style="color:var(--accent-red);font-size:10px"><i class="fas fa-exclamation-triangle"></i> SLA overdue</span>' : ''}</div>
        <div style="font-size:11px;color:var(--text-secondary);margin-top:2px">${s.mode === 'all' ? 'ALL must approve' : 'Any one approves'} · ${s.approvers.map(a => `<span style="color:${(st.approvals[i]?.has(a)) ? '#3fb950' : 'inherit'}">${a}${(st.approvals[i]?.has(a)) ? ' ✓' : ''}</span>`).join(', ')}</div>
        ${canEdit && !done ? `<div style="display:flex;gap:5px;margin-top:6px">
          <button class="btn btn-secondary btn-sm" style="font-size:10px;padding:2px 8px" onclick="_wfEditStepApprovers('${docType}','${id}',${i})"><i class="fas fa-user-edit"></i> Change approvers</button>
          ${current ? `<button class="btn btn-secondary btn-sm" style="font-size:10px;padding:2px 8px;color:var(--accent-amber)" onclick="_wfSkipStep('${docType}','${id}')"><i class="fas fa-forward"></i> Skip step</button>` : `<button class="btn btn-secondary btn-sm" style="font-size:10px;padding:2px 8px;color:var(--accent-red)" onclick="_wfRemoveStep('${docType}','${id}',${i})"><i class="fas fa-trash"></i> Remove</button>`}
        </div>` : ''}
      </div>
    </div>`;
  }).join('');

  const history = [...(doc.wfActions || [])].sort((a, b) => (b.at || '').localeCompare(a.at || '')).map(a =>
    `<div style="font-size:10px;color:var(--text-secondary);padding:3px 0;border-bottom:1px solid var(--border)">
      <span style="font-family:var(--font-mono);color:var(--text-muted)">${(a.at || '').replace('T', ' ').substring(0, 16)}</span> —
      <strong>${a.byName || a.by}</strong> ${a.kind === 'approve' ? '<span style="color:#3fb950">approved</span>' : a.kind === 'reject' ? '<span style="color:#f85149">rejected</span>' : a.kind === 'skip' ? '<span style="color:var(--accent-amber)">skipped step</span>' : a.kind === 'force' ? '<span style="color:var(--accent-red)">force-' + (a.decision || 'approve') + 'd</span>' : '<span style="color:var(--accent-cyan)">modified route</span>'}
      ${typeof a.stepIdx === 'number' ? ' (step ' + (a.stepIdx + 1) + ')' : ''}${a.note ? ' — "' + a.note + '"' : ''}
    </div>`).join('') || '<div style="font-size:11px;color:var(--text-muted)">No actions yet.</div>';

  $('#genericModalTitle').textContent = (canEdit ? 'Manage Route — ' : 'Route — ') + doc.id;
  $('#genericModalBody').innerHTML = `
    <div style="font-size:11px;color:var(--text-secondary);margin-bottom:10px">${reg.label}: <strong>${reg.ref(doc)}</strong> · Status: <strong style="color:${st.status === 'approved' ? '#3fb950' : st.status === 'rejected' ? '#f85149' : '#79c0ff'}">${st.status}</strong></div>
    ${stepRows}
    ${canEdit ? `<div style="display:flex;gap:6px;margin:10px 0">
      <button class="btn btn-secondary btn-sm" onclick="_wfAddStep('${docType}','${id}')"><i class="fas fa-plus"></i> Add step</button>
      <button class="btn btn-secondary btn-sm" style="color:var(--accent-green)" onclick="_wfForce('${docType}','${id}','approve')"><i class="fas fa-bolt"></i> Force approve</button>
      <button class="btn btn-secondary btn-sm" style="color:var(--accent-red)" onclick="_wfForce('${docType}','${id}','reject')"><i class="fas fa-bolt"></i> Force reject</button>
    </div>` : ''}
    <div style="font-size:11px;font-weight:700;margin:12px 0 5px;color:var(--text-secondary)">HISTORY</div>
    <div style="max-height:160px;overflow-y:auto">${history}</div>
    <div class="modal-footer"><button class="btn btn-secondary" onclick="closeModal('genericModal')">Close</button></div>`;
  openModal('genericModal');
}

// Admin route edits — every change = appended action + audit entry
function _wfRouteAction(docType, id, mutate, auditNote) {
  const reg = WF_DOCTYPES[docType];
  const doc = (AppState.data[reg.arrayKey] || []).find(d => d.id === id); if (!doc) return;
  const me = _wfMe(); const st = wfState(doc);
  const action = mutate(st); if (!action) return;
  doc.wfActions.push({ at: _wfNow(), by: me.email, byName: me.name, ...action });
  wfApply(docType, doc);
  AppState.save();
  if (typeof spWriteAuditLog === 'function') spWriteAuditLog('wf_route_modified', docType, doc.id, reg.ref(doc), { by: me.name, change: auditNote });
  wfManageRoute(docType, id);
  _wfRefresh();
}

function _wfEditStepApprovers(docType, id, stepIdx) {
  const reg = WF_DOCTYPES[docType];
  const doc = (AppState.data[reg.arrayKey] || []).find(d => d.id === id);
  const st = wfState(doc);
  const cur = st.steps[stepIdx];
  const input = prompt(`Approver emails for step "${cur.name}" (comma-separated):`, cur.approvers.join(', '));
  if (input === null) return;
  const approvers = input.split(',').map(s => s.trim().toLowerCase()).filter(s => s.includes('@'));
  if (!approvers.length) { showToast('At least one valid email required', 'error'); return; }
  _wfRouteAction(docType, id, s => {
    const newSteps = s.steps.slice(s.cur).map((x, i) => (i === stepIdx - s.cur ? { ...x, approvers } : x));
    return { kind: 'route', steps: newSteps, note: `Approvers of "${cur.name}" set to ${approvers.join(', ')}` };
  }, `Step "${cur.name}" approvers → ${approvers.join(', ')}`);
}

function _wfAddStep(docType, id) {
  const name = prompt('New step name:', 'Additional approval'); if (name === null) return;
  const emails = prompt('Approver emails (comma-separated):', ''); if (emails === null) return;
  const approvers = emails.split(',').map(s => s.trim().toLowerCase()).filter(s => s.includes('@'));
  if (!approvers.length) { showToast('At least one valid email required', 'error'); return; }
  _wfRouteAction(docType, id, s => ({ kind: 'route', steps: [...s.steps.slice(s.cur), { name, approvers, mode: 'any', slaDays: 0 }], note: `Added step "${name}"` }), `Added step "${name}" (${approvers.join(', ')})`);
}

function _wfRemoveStep(docType, id, stepIdx) {
  if (!confirm('Remove this pending step from the route?')) return;
  _wfRouteAction(docType, id, s => {
    const rel = stepIdx - s.cur; if (rel < 0) return null;
    const remaining = s.steps.slice(s.cur).filter((_, i) => i !== rel);
    return { kind: 'route', steps: remaining, note: `Removed step "${s.steps[stepIdx]?.name}"` };
  }, `Removed step ${stepIdx + 1}`);
}

function _wfSkipStep(docType, id) {
  const note = prompt('Reason for skipping the current step? (required)', ''); if (!note) { if (note !== null) showToast('Reason required', 'error'); return; }
  _wfRouteAction(docType, id, s => ({ kind: 'skip', stepIdx: s.cur, note }), `Skipped current step: ${note}`);
}

function _wfForce(docType, id, decision) {
  const note = prompt(`Reason for FORCE ${decision.toUpperCase()}? (required, goes to audit log)`, ''); if (!note) { if (note !== null) showToast('Reason required', 'error'); return; }
  if (!confirm(`Force ${decision} this document, bypassing remaining approvers?`)) return;
  _wfRouteAction(docType, id, () => ({ kind: 'force', decision, note }), `Force ${decision}: ${note}`);
}

// ═══ WORKFLOW EDITOR PAGE (admin) ═════════════════════════════
let _wfEdSteps = [];       // working copy while editing a definition
let _wfEdDocType = null;

function renderWorkflows() {
  const el = $('#workflows'); if (!el) return;
  if (!(typeof isAdminUser === 'function' && isAdminUser())) {
    el.innerHTML = '<div class="empty-state" style="padding:50px"><i class="fas fa-lock" style="font-size:30px;opacity:.3;display:block;margin-bottom:10px"></i><p>Workflow Editor is available to Admins only.</p></div>';
    return;
  }
  if (!AppState.data.workflowDefs) AppState.data.workflowDefs = [];
  const cards = Object.entries(WF_DOCTYPES).map(([dt, reg]) => {
    const def = wfActiveDef(dt);
    const anyDef = wfDefs().find(d => d.docType === dt);
    return `<div class="card" style="padding:14px">
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:8px">
        <i class="fas ${reg.icon}" style="color:var(--accent-blue);font-size:16px"></i>
        <div style="flex:1"><div style="font-weight:700;font-size:13px">${reg.label}</div>
          <div style="font-size:10px;color:var(--text-muted)">${def ? `Active: <strong>${def.name}</strong> (v${def.version || 1}) — ${def.steps.length} step(s)` : anyDef ? 'Defined but inactive — legacy approval applies' : 'No workflow — legacy approval applies'}</div></div>
        ${def ? `<span class="badge" style="background:rgba(63,185,80,.15);color:#3fb950;font-size:9px">ACTIVE</span>` : ''}
      </div>
      ${def ? `<div style="font-size:11px;color:var(--text-secondary);margin-bottom:10px">${def.steps.map((s, i) => `<div style="padding:3px 0"><span style="font-family:var(--font-mono);color:var(--text-muted)">${i + 1}.</span> <strong>${s.name}</strong> — ${s.mode === 'all' ? 'ALL of' : 'any of'} ${s.approvers.join(', ')}${s.minAmount ? ` <span style="color:var(--accent-amber)">(if ≥ ₱${s.minAmount.toLocaleString()})</span>` : ''}${s.slaDays ? ` · SLA ${s.slaDays}d` : ''}</div>`).join('')}</div>` : ''}
      <div style="display:flex;gap:6px">
        <button class="btn btn-primary btn-sm" onclick="wfEditDef('${dt}')"><i class="fas fa-${anyDef ? 'edit' : 'plus'}"></i> ${anyDef ? 'Edit' : 'Create'} Workflow</button>
        ${anyDef ? `<button class="btn btn-secondary btn-sm" onclick="wfToggleActive('${dt}')">${anyDef.active ? '<i class="fas fa-pause"></i> Deactivate' : '<i class="fas fa-play"></i> Activate'}</button>` : ''}
      </div>
    </div>`;
  }).join('');
  el.innerHTML = `<div class="section-header" style="margin-bottom:14px">
    <div><div class="section-title">Workflow Editor</div>
    <div class="section-sub">Define multi-step approval routes per document type. In-flight documents keep their snapshot — edit their route from the document itself (<i class="fas fa-route"></i> button).</div></div>
  </div>
  <div class="grid grid-2" style="gap:14px;align-items:start">${cards}</div>`;
}

function wfToggleActive(docType) {
  const def = wfDefs().find(d => d.docType === docType); if (!def) return;
  def.active = !def.active;
  AppState.save();
  if (typeof spWriteAuditLog === 'function') spWriteAuditLog('wf_def_' + (def.active ? 'activated' : 'deactivated'), 'workflowDefs', def.id, def.name, {});
  showToast(def.active ? 'Workflow activated' : 'Workflow deactivated — legacy approval applies', 'success');
  renderWorkflows();
}

function wfEditDef(docType) {
  _wfEdDocType = docType;
  const def = wfDefs().find(d => d.docType === docType);
  _wfEdSteps = def ? def.steps.map(s => ({ ...s, approvers: [...s.approvers] })) : [{ name: 'Approval', approvers: [], mode: 'any', slaDays: 0, minAmount: 0 }];
  // Warm the user cache for the datalist (async, non-blocking)
  if (!window._wfUsersCache && typeof m365GetAllUsers === 'function') {
    m365GetAllUsers().then(u => { window._wfUsersCache = u.filter(x => x.status === 'approved'); _wfEdRenderSteps(); }).catch(() => {});
  }
  $('#genericModalTitle').textContent = 'Workflow — ' + WF_DOCTYPES[docType].label;
  $('#genericModalBody').innerHTML = `
    <div class="form-group" style="margin-bottom:10px"><label class="form-label">Workflow Name</label>
      <input class="form-input" id="wfDefName" value="${def?.name || WF_DOCTYPES[docType].label + ' Route'}"></div>
    <div id="wfEdStepsWrap"></div>
    <button class="btn btn-secondary btn-sm" style="margin-top:4px" onclick="_wfEdAddStep()"><i class="fas fa-plus"></i> Add Step</button>
    <div class="modal-footer">
      <button class="btn btn-secondary" onclick="closeModal('genericModal')">Cancel</button>
      <button class="btn btn-primary" onclick="wfSaveDef()"><i class="fas fa-save"></i> Save ${def ? '(new version)' : ''}</button>
    </div>`;
  openModal('genericModal');
  _wfEdRenderSteps();
}

function _wfEdRenderSteps() {
  const wrap = $('#wfEdStepsWrap'); if (!wrap) return;
  const dl = `<datalist id="wfUserList">${(window._wfUsersCache || []).map(u => `<option value="${u.email}">${u.name}</option>`).join('')}</datalist>`;
  wrap.innerHTML = dl + _wfEdSteps.map((s, i) => `
    <div style="border:1px solid var(--border);border-radius:8px;padding:10px;margin-bottom:8px">
      <div style="display:flex;gap:6px;align-items:center;margin-bottom:6px">
        <span style="font-family:var(--font-mono);font-size:11px;color:var(--text-muted)">${i + 1}</span>
        <input class="form-input" style="flex:1;height:28px;font-size:12px" value="${s.name}" onchange="_wfEdSteps[${i}].name=this.value" placeholder="Step name">
        <button class="btn btn-secondary btn-sm btn-icon" ${i === 0 ? 'disabled' : ''} onclick="_wfEdMove(${i},-1)" title="Move up"><i class="fas fa-arrow-up"></i></button>
        <button class="btn btn-secondary btn-sm btn-icon" ${i === _wfEdSteps.length - 1 ? 'disabled' : ''} onclick="_wfEdMove(${i},1)" title="Move down"><i class="fas fa-arrow-down"></i></button>
        <button class="btn btn-danger btn-sm btn-icon" onclick="_wfEdSteps.splice(${i},1);_wfEdRenderSteps()" title="Remove step"><i class="fas fa-trash"></i></button>
      </div>
      <div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center">
        <select class="form-select" style="width:140px;height:28px;font-size:11px" onchange="_wfEdSteps[${i}].role=this.value||null;_wfEdRenderSteps()">
          <option value="">— No role —</option>
          ${(AppState.data.settings?.approverRoles||[]).map(r=>`<option value="${r.id}" ${s.role===r.id?'selected':''}>${esc(r.name)} (${r.members.length})</option>`).join('')}
        </select>
        <input class="form-input wf-appr-input" data-step="${i}" list="wfUserList" style="flex:2;min-width:180px;height:28px;font-size:11px" placeholder="${s.role?'+ additional emails (optional)':'Type approver email, press Enter'}"
          onkeydown="if(event.key==='Enter'||event.key===','){event.preventDefault();_wfEdCommitEmail(this,${i});}"
          onblur="_wfEdCommitEmail(this,${i})" onchange="_wfEdCommitEmail(this,${i})">
        <select class="form-select" style="width:130px;height:28px;font-size:11px" onchange="_wfEdSteps[${i}].mode=this.value">
          <option value="any" ${s.mode !== 'all' ? 'selected' : ''}>Any one approves</option>
          <option value="all" ${s.mode === 'all' ? 'selected' : ''}>All must approve</option>
        </select>
        <div style="display:flex;align-items:center;gap:3px"><span style="font-size:10px;color:var(--text-muted)">SLA</span>
          <input class="form-input" type="number" min="0" style="width:52px;height:28px;font-size:11px" value="${s.slaDays || 0}" onchange="_wfEdSteps[${i}].slaDays=parseInt(this.value)||0"><span style="font-size:10px;color:var(--text-muted)">d</span></div>
        <div style="display:flex;align-items:center;gap:3px"><span style="font-size:10px;color:var(--text-muted)">only if ≥ ₱</span>
          <input class="form-input" type="number" min="0" style="width:90px;height:28px;font-size:11px" value="${s.minAmount || 0}" onchange="_wfEdSteps[${i}].minAmount=parseFloat(this.value)||0"></div>
      </div>
      <div style="margin-top:6px;display:flex;gap:4px;flex-wrap:wrap">
        ${s.role ? `<span class="badge" style="background:rgba(188,140,255,.15);color:#bc8cff;font-size:10px"><i class="fas fa-users-cog"></i> ${esc((AppState.data.settings?.approverRoles||[]).find(r=>r.id===s.role)?.name||s.role)}</span>` : ''}
        ${s.approvers.map((a, ai) => `<span class="badge" style="background:rgba(56,139,253,.12);color:#79c0ff;font-size:10px;display:inline-flex;align-items:center;gap:4px">${a}<i class="fas fa-times" style="cursor:pointer" onclick="_wfEdSteps[${i}].approvers.splice(${ai},1);_wfEdRenderSteps()"></i></span>`).join('') || (s.role ? '' : '<span style="font-size:10px;color:var(--accent-amber)"><i class="fas fa-exclamation-circle"></i> No approvers yet</span>')}
      </div>
    </div>`).join('');
}

// Commit whatever is typed in an approver input into the step (Enter, comma, blur, or Save)
function _wfEdCommitEmail(inp, i) {
  const v = (inp.value || '').trim().toLowerCase().replace(/,$/, '');
  if (!v) return;
  if (!v.includes('@')) return; // leave partial text in place
  if (!_wfEdSteps[i].approvers.includes(v)) _wfEdSteps[i].approvers.push(v);
  inp.value = '';
  _wfEdRenderSteps();
}
function _wfEdCommitAllEmails() {
  document.querySelectorAll('.wf-appr-input').forEach(inp => {
    const i = parseInt(inp.dataset.step);
    if (!isNaN(i) && _wfEdSteps[i]) _wfEdCommitEmail(inp, i);
  });
}
function _wfEdAddStep() { _wfEdSteps.push({ name: 'Approval ' + (_wfEdSteps.length + 1), approvers: [], mode: 'any', slaDays: 0, minAmount: 0 }); _wfEdRenderSteps(); }
function _wfEdMove(i, dir) { const t = _wfEdSteps[i + dir]; _wfEdSteps[i + dir] = _wfEdSteps[i]; _wfEdSteps[i] = t; _wfEdRenderSteps(); }

function wfSaveDef() {
  _wfEdCommitAllEmails(); // sweep any email still sitting in an input box
  const name = ($('#wfDefName')?.value || '').trim() || WF_DOCTYPES[_wfEdDocType].label + ' Route';
  const steps = _wfEdSteps.filter(s => s.approvers.length && s.name.trim());
  if (!steps.length) { showToast('Add at least one step with an approver', 'error'); return; }
  if (!AppState.data.workflowDefs) AppState.data.workflowDefs = [];
  let def = wfDefs().find(d => d.docType === _wfEdDocType);
  if (def) {
    def.name = name; def.steps = steps; def.version = (def.version || 1) + 1; def.updatedAt = _wfNow(); def.updatedBy = _wfMe().name;
  } else {
    def = { id: 'WFD-' + Date.now(), docType: _wfEdDocType, name, steps, version: 1, active: true, createdAt: _wfNow(), createdBy: _wfMe().name };
    AppState.data.workflowDefs.push(def);
  }
  AppState.save();
  if (typeof spWriteAuditLog === 'function') spWriteAuditLog('wf_def_saved', 'workflowDefs', def.id, name, { version: def.version, steps: steps.map(s => `${s.name}[${s.approvers.join('|')}]`).join(' → ') });
  closeModal('genericModal');
  showToast(`Workflow saved (v${def.version}). In-flight documents keep their current route.`, 'success', 4000);
  renderWorkflows();
}

// ═══ MY APPROVALS PAGE ════════════════════════════════════════
function wfPendingForMe() {
  const me = _wfMe().email; if (!me) return [];
  const out = [];
  Object.entries(WF_DOCTYPES).forEach(([dt, reg]) => {
    (AppState.data[reg.arrayKey] || []).forEach(d => {
      if (d._deleted || !d.wfRoute) return;
      if (d.wfRoute.docType !== dt) return; // procurement PR vs PO share an array
      const st = wfState(d);
      if (st.status !== 'in-route') return;
      const step = st.steps[st.cur];
      if (step && step.approvers.includes(me) && !(st.approvals[st.cur]?.has(me))) out.push({ dt, reg, d, st, step });
    });
  });
  return out;
}

function renderApprovals() {
  const el = $('#approvals'); if (!el) return;
  const mine = wfPendingForMe();
  const me = _wfMe().email;
  // Everything in-route (visibility for all users; act buttons only when eligible)
  const inRoute = [];
  Object.entries(WF_DOCTYPES).forEach(([dt, reg]) => {
    (AppState.data[reg.arrayKey] || []).forEach(d => {
      if (d._deleted || !d.wfRoute || d.wfRoute.docType !== dt) return;
      const st = wfState(d);
      if (st.status === 'in-route') inRoute.push({ dt, reg, d, st });
    });
  });
  const cards = mine.map(({ dt, reg, d, st, step }) => {
    const slaOver = step.slaDays > 0 && st.stepAt[st.cur] && (Date.now() - new Date(st.stepAt[st.cur]).getTime()) > step.slaDays * 864e5;
    return `<div class="card" style="padding:12px;border-left:3px solid ${slaOver ? 'var(--accent-red)' : 'var(--accent-blue)'}">
      <div style="display:flex;align-items:center;gap:8px">
        <i class="fas ${reg.icon}" style="color:var(--accent-blue)"></i>
        <div style="flex:1;min-width:0">
          <div style="font-size:12px;font-weight:700">${reg.ref(d)}</div>
          <div style="font-size:10px;color:var(--text-muted)">${reg.label} · Step ${st.cur + 1}/${st.steps.length}: <strong>${step.name}</strong> ${slaOver ? '· <span style="color:var(--accent-red)">SLA OVERDUE</span>' : ''}</div>
        </div>
        <button class="btn btn-primary btn-sm" onclick="wfAct('${dt}','${d.id}','approve')"><i class="fas fa-check"></i> Approve</button>
        <button class="btn btn-danger btn-sm" onclick="wfAct('${dt}','${d.id}','reject')"><i class="fas fa-times"></i> Reject</button>
        <button class="btn btn-secondary btn-sm btn-icon" onclick="wfManageRoute('${dt}','${d.id}')" title="View route"><i class="fas fa-route"></i></button>
      </div>
    </div>`;
  }).join('');
  const others = inRoute.filter(x => !mine.some(m => m.d === x.d)).map(({ dt, reg, d, st }) =>
    `<div style="display:flex;align-items:center;gap:8px;padding:7px 10px;border-bottom:1px solid var(--border);font-size:11px">
      <i class="fas ${reg.icon}" style="color:var(--text-muted);font-size:11px"></i>
      <span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${reg.ref(d)}</span>
      ${wfBadge(d)}
      <button class="btn btn-secondary btn-sm btn-icon" onclick="wfManageRoute('${dt}','${d.id}')" title="View route"><i class="fas fa-route"></i></button>
    </div>`).join('');
  el.innerHTML = `<div class="section-header" style="margin-bottom:14px">
    <div><div class="section-title">My Approvals</div>
    <div class="section-sub">${mine.length} waiting for you${me ? '' : ' — sign in to see your queue'} · ${inRoute.length} document(s) in route overall</div></div>
  </div>
  ${cards || '<div class="empty-state" style="padding:36px"><i class="fas fa-check-double" style="font-size:28px;opacity:.3;display:block;margin-bottom:10px"></i><p>Nothing waiting for your approval. 🎉</p></div>'}
  ${others ? `<div class="card" style="padding:0;margin-top:14px"><div style="padding:10px 12px;font-size:11px;font-weight:700;color:var(--text-secondary);border-bottom:1px solid var(--border)">OTHER DOCUMENTS IN ROUTE</div>${others}</div>` : ''}`;
}

// ═══ SLA AUTO-ESCALATION ═════════════════════════════════════
function _wfCheckEscalations() {
  const now = Date.now();
  Object.entries(WF_DOCTYPES).forEach(([dt, reg]) => {
    (AppState.data[reg.arrayKey] || []).forEach(d => {
      if (d._deleted || !d.wfRoute || d.wfRoute.docType !== dt) return;
      const st = wfState(d);
      if (st.status !== 'in-route') return;
      const step = st.steps[st.cur];
      if (!step || !step.slaDays || step.slaDays <= 0) return;
      const stepStart = st.stepAt[st.cur];
      if (!stepStart) return;
      const elapsed = now - new Date(stepStart).getTime();
      if (elapsed <= step.slaDays * 864e5) return;
      if (!d.wfEscalatedSteps) d.wfEscalatedSteps = [];
      const key = st.cur + ':' + d.wfRoute.startedAt;
      if (d.wfEscalatedSteps.includes(key)) return;
      d.wfEscalatedSteps.push(key);
      const escEmail = AppState.data.settings?.escalationEmail || '';
      const targets = [...step.approvers];
      if (escEmail && !targets.includes(escEmail.toLowerCase())) targets.push(escEmail.toLowerCase());
      if (!AppState.data.notifications) AppState.data.notifications = [];
      AppState.data.notifications.push({
        id: 'ESC-' + Date.now() + '-' + Math.floor(Math.random() * 999),
        type: 'escalation', read: false, at: _wfNow(),
        title: 'SLA BREACH: ' + (reg.label || dt),
        message: `${d.id} — step "${step.name}" has exceeded its ${step.slaDays}-day SLA. Awaiting: ${step.approvers.join(', ')}`,
        targets,
      });
      _wfWebhook('sla_breach', dt, d, { step: step.name, slaDays: step.slaDays, elapsedDays: Math.round(elapsed / 864e5 * 10) / 10, approvers: step.approvers, escalationEmail: escEmail || null });
      AppState.save();
    });
  });
}

// Sidebar badge refresh: buildSidebar() computes the approvals count itself —
// just rebuild it periodically so the badge tracks new items after syncs.
function wfUpdateBadge() {
  try { if (typeof buildSidebar === 'function' && document.getElementById('sidebarNav')?.innerHTML) buildSidebar(); } catch (e) {}
}
setInterval(wfUpdateBadge, 60000);
setTimeout(wfUpdateBadge, 3000);
