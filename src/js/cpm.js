// ── SHIC CPM Engine ───────────────────────────────────────────
// Pure JS — no UI dependencies. Registered as window.SHICCPMEngine.
// All dates are YYYY-MM-DD strings. Durations are in working days.
//
// Duration model (MS Project style — inclusive):
//   EF = addWorkingDays(ES, dur - 1)
//   A 1-day task starting Monday finishes Monday (ES = EF).
//   A 5-day task starting Monday finishes Friday.
//
// FS lag model:
//   Successor ES = addWorkingDays(pred.EF, lag + 1)
//   lag=0  → next working day after pred finishes  (Mon finish → Tue start)
//   lag=+1 → two working days after pred finishes
//   lag=-1 → same day pred finishes (1-day overlap / lead)
(function () {

const DEFAULT_CALENDAR = { workDays: [1, 2, 3, 4, 5], hoursPerDay: 8, mode: 'standard' };

function getCalendar(project) {
  return (project && project.calendar) ? project.calendar : DEFAULT_CALENDAR;
}

// Format a Date object as YYYY-MM-DD using LOCAL time (not UTC).
function _localDateStr(dt) {
  return dt.getFullYear() + '-' +
    String(dt.getMonth() + 1).padStart(2, '0') + '-' +
    String(dt.getDate()).padStart(2, '0');
}

// Advance (or retreat) `workingDays` working days from a date string.
// Returns a YYYY-MM-DD string. Snaps non-working start dates to nearest working day first.
function addWorkingDays(dateStr, workingDays, calendar) {
  if (!dateStr) return dateStr;
  const cal = calendar || DEFAULT_CALENDAR;
  const sign = workingDays >= 0 ? 1 : -1;
  let remaining = Math.abs(workingDays);
  const dt = new Date(dateStr + 'T00:00:00');

  // Snap to nearest working day in the travel direction first
  while (!cal.workDays.includes(dt.getDay())) {
    dt.setDate(dt.getDate() + sign);
  }

  if (remaining === 0) return _localDateStr(dt);

  while (remaining > 0) {
    dt.setDate(dt.getDate() + sign);
    if (cal.workDays.includes(dt.getDay())) remaining--;
  }
  return _localDateStr(dt);
}

// Count working days between two YYYY-MM-DD strings (exclusive of start, inclusive of end).
// workingDaysBetween(Mon, Mon) = 0
// workingDaysBetween(Mon, Tue) = 1
// Duration of a task = workingDaysBetween(ES, EF) + 1  (inclusive both ends)
function workingDaysBetween(startStr, endStr, calendar) {
  if (!startStr || !endStr) return 0;
  const cal = calendar || DEFAULT_CALENDAR;
  const start = new Date(startStr + 'T00:00:00');
  const end   = new Date(endStr   + 'T00:00:00');
  if (start.getTime() === end.getTime()) return 0;
  const sign = end > start ? 1 : -1;
  let count = 0;
  const dt = new Date(start);
  while (sign > 0 ? dt < end : dt > end) {
    dt.setDate(dt.getDate() + sign);
    if (cal.workDays.includes(dt.getDay())) count += sign;
  }
  return count;
}

// Parse "TSK-001 FS, TSK-002 SS+2d, TSK-003 FF-1d" into array of objects.
function parsePredecessors(predStr) {
  if (!predStr || !predStr.trim()) return [];
  return predStr.split(',').map(s => {
    s = s.trim();
    if (!s) return null;
    // Groups: 1=id (must end with digit), 2=link type (optional), 3=lag (optional)
    const m = s.match(/^([A-Za-z0-9_-]*[0-9])\s*(FS|SS|FF|SF)?\s*([+-]\d+d?)?$/i);
    if (!m) return null;
    const lagStr = (m[3] || '').replace(/d$/i, '');
    return {
      id:      m[1].trim(),
      type:    (m[2] || 'FS').toUpperCase(),
      lagDays: lagStr ? parseInt(lagStr, 10) : 0,
    };
  }).filter(Boolean);
}

// Build topological order using Kahn's algorithm.
// Returns { order, hasCycle, cycleInfo }
function buildTopoOrder(tasks) {
  const taskIds  = new Set(tasks.map(t => t.id));
  const inDegree = new Map(tasks.map(t => [t.id, 0]));
  const succs    = new Map(tasks.map(t => [t.id, []]));

  for (const task of tasks) {
    for (const p of parsePredecessors(task.predecessors || '')) {
      if (!taskIds.has(p.id)) continue;
      succs.get(p.id).push(task.id);
      inDegree.set(task.id, (inDegree.get(task.id) || 0) + 1);
    }
  }

  const queue = [...inDegree.entries()].filter(([, d]) => d === 0).map(([id]) => id);
  const order = [];

  while (queue.length) {
    const id = queue.shift();
    order.push(id);
    for (const sid of (succs.get(id) || [])) {
      const nd = inDegree.get(sid) - 1;
      inDegree.set(sid, nd);
      if (nd === 0) queue.push(sid);
    }
  }

  const remaining = tasks.filter(t => !order.includes(t.id));
  const hasCycle  = remaining.length > 0;
  const cycleInfo = hasCycle
    ? 'Circular dependency detected: ' + remaining.map(t => t.id + ' (' + (t.name || '') + ')').join(', ')
    : '';

  return { order, hasCycle, cycleInfo };
}

// Full CPM: forward + backward pass on the tasks belonging to one project.
// Returns { tasks, hasCycle, cycleInfo, projectFinish }
// Computed fields added: _ES, _EF, _LS, _LF, _TF (working days), _isCritical
// These fields are NEVER saved — recalculated every render.
function runFullCPM(tasks, project) {
  const cal          = getCalendar(project);
  const projectStart = (project && project.startDate) ? project.startDate : new Date().toISOString().split('T')[0];

  const ptasks = tasks.filter(t =>
    (!project || t.projectId === project.id) && !t._deleted
  );

  if (!ptasks.length) return { tasks: [], hasCycle: false, cycleInfo: '' };

  const { order, hasCycle, cycleInfo } = buildTopoOrder(ptasks);
  if (hasCycle) return { tasks: ptasks, hasCycle, cycleInfo };

  // Work on copies so we don't mutate AppState
  const map = new Map(ptasks.map(t => [t.id, { ...t }]));

  // Duration in working days (inclusive: dur=1 → task spans 1 day, ES=EF)
  function getDurDays(t) {
    if (t.milestone) return 0;
    if (t.durationHrs && t.durationHrs > 0) return t.durationHrs / cal.hoursPerDay;
    // Fallback: derive from stored start/end — inclusive count (+1)
    if (t.startDate && (t.endDate || t.dueDate)) {
      const s = t.startDate;
      const e = t.endDate || t.dueDate;
      return Math.max(1, workingDaysBetween(s, e, cal) + 1);
    }
    return 1;
  }

  // ── Forward Pass ──────────────────────────────────────────────
  for (const id of order) {
    const t    = map.get(id);
    const preds = parsePredecessors(t.predecessors || '');
    const dur  = getDurDays(t);

    // FIX: Anchor tasks use their stored startDate.
    // Successor tasks start from null — predecessor constraints are the ONLY
    // determinant. projectStart must NOT act as a floor for successor tasks.
    let es = (preds.length === 0 && t.startDate) ? t.startDate : null;

    for (const p of preds) {
      const pred = map.get(p.id);
      if (!pred || pred._ES === undefined) continue;
      const lag = p.lagDays || 0;
      let constraint;

      switch (p.type) {
        case 'FS':
          // Successor starts the working day AFTER predecessor finishes (+ lag)
          // lag=0 → next day; lag=-1 → same day (1-day lead/overlap)
          constraint = addWorkingDays(pred._EF, lag + 1, cal);
          break;
        case 'SS':
          // Successor starts same day as predecessor (+ lag)
          constraint = addWorkingDays(pred._ES, lag, cal);
          break;
        case 'FF':
          // Both finish together: succ.EF >= pred.EF + lag
          // succ.ES = succ.EF - (dur-1)
          constraint = addWorkingDays(addWorkingDays(pred._EF, lag, cal), -Math.max(0, dur - 1), cal);
          break;
        case 'SF':
          // succ.EF >= pred.ES + lag → succ.ES = succ.EF - (dur-1)
          constraint = addWorkingDays(addWorkingDays(pred._ES, lag, cal), -Math.max(0, dur - 1), cal);
          break;
        default:
          constraint = addWorkingDays(pred._EF, lag + 1, cal);
      }

      if (es === null || constraint > es) es = constraint;
    }

    // Fallback: if no valid predecessor constraints resolved, use project start
    if (!es) es = projectStart;

    t._ES = es;
    // FIX: Inclusive duration model — EF = ES + (dur-1) working days
    // dur=0 (milestone): EF = ES  |  dur=1: EF = ES  |  dur=5 Mon: EF = Fri
    t._EF = addWorkingDays(es, Math.max(0, dur - 1), cal);
    map.set(id, t);
  }

  // Project finish = latest EF across all tasks
  const allEFs        = [...map.values()].map(t => t._EF).filter(Boolean);
  const projectFinish = allEFs.reduce((a, b) => (a > b ? a : b), projectStart);

  // Build successor map for backward pass
  const succMap = new Map(ptasks.map(t => [t.id, []]));
  for (const t of ptasks) {
    for (const p of parsePredecessors(t.predecessors || '')) {
      if (succMap.has(p.id)) succMap.get(p.id).push({ id: t.id, type: p.type, lagDays: p.lagDays });
    }
  }

  // ── Backward Pass ─────────────────────────────────────────────
  for (const id of [...order].reverse()) {
    const t     = map.get(id);
    const dur   = getDurDays(t);
    const succs = succMap.get(id) || [];
    let   lf    = projectFinish;

    for (const s of succs) {
      const succ = map.get(s.id);
      if (!succ || succ._LS === undefined) continue;
      const lag = s.lagDays || 0;
      let constraint;

      switch (s.type) {
        case 'FS':
          // pred.LF = the working day BEFORE succ.LS (mirror of forward +1)
          constraint = addWorkingDays(succ._LS, -(lag + 1), cal);
          break;
        case 'SS':
          // pred.LS = succ.LS - lag  →  pred.LF = pred.LS + (dur-1)
          constraint = addWorkingDays(addWorkingDays(succ._LS, -lag, cal), Math.max(0, dur - 1), cal);
          break;
        case 'FF':
          // pred.LF = succ.LF - lag
          constraint = addWorkingDays(succ._LF, -lag, cal);
          break;
        case 'SF':
          // pred.ES = succ.LF - lag  →  pred.LF = pred.ES + (dur-1)
          constraint = addWorkingDays(addWorkingDays(succ._LF, -lag, cal), Math.max(0, dur - 1), cal);
          break;
        default:
          constraint = addWorkingDays(succ._LS, -(lag + 1), cal);
      }

      if (constraint < lf) lf = constraint;
    }

    t._LF = lf;
    // FIX: LS = LF - (dur-1) to match inclusive model
    // dur=0 or dur=1: LS = LF (same day)  |  dur=5: LS = LF - 4 working days
    t._LS = addWorkingDays(lf, -Math.max(0, dur - 1), cal);
    t._TF = workingDaysBetween(t._ES, t._LS, cal); // total float
    t._isCritical = t._TF <= 0;
    map.set(id, t);
  }

  return {
    tasks: [...map.values()],
    hasCycle: false,
    cycleInfo: '',
    projectFinish,
  };
}

window.SHICCPMEngine = {
  DEFAULT_CALENDAR,
  getCalendar,
  addWorkingDays,
  workingDaysBetween,
  parsePredecessors,
  buildTopoOrder,
  runFullCPM,
};

})();
