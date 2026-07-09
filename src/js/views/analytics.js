// ── ADVANCED ANALYTICS MODULE ──────────────────────────────
// Spend, supplier performance, warehouse turnover, procurement cycle time,
// manpower cost trends, project cost-at-completion variance

let _analyticsTab = 'spend';

function renderAnalytics() {
  AppState.ensureData();
  const el = $('#analytics');
  if (!el) return;
  el.innerHTML = `
  <div class="section-header" style="flex-wrap:wrap;gap:10px">
    <div>
      <h2 style="margin:0;font-size:18px;font-weight:700">Advanced Analytics</h2>
      <div style="font-size:11px;color:var(--text-muted);margin-top:2px">Spend, suppliers, warehouse turnover, procurement, manpower · <strong>${_tfRange().label}</strong></div>
    </div>
    <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap">
      ${_tfFilterHTML('renderAnalytics()')}
      <button class="btn btn-secondary btn-sm" onclick="_analyticsExportCSV()"><i class="fas fa-download"></i> Export CSV</button>
    </div>
  </div>
  <div class="wh-tabs-wrap" style="display:flex;gap:4px;margin-bottom:16px;border-bottom:1px solid var(--border);padding-bottom:0">
    ${[
      ['spend','Spend Analysis','fas fa-dollar-sign'],
      ['suppliers','Supplier Performance','fas fa-truck'],
      ['turnover','Warehouse Turnover','fas fa-boxes'],
      ['procurement','Procurement Cycle','fas fa-shopping-cart'],
      ['manpower','Manpower Cost','fas fa-hard-hat'],
      ['projects','Project Variance','fas fa-briefcase'],
    ].map(([id,label,icon])=>`
    <button class="btn btn-sm ${_analyticsTab===id?'btn-primary':'btn-secondary'}"
      style="border-radius:6px 6px 0 0;border-bottom:none;font-size:11px"
      onclick="_analyticsTab='${id}';renderAnalytics()">
      <i class="${icon}" style="margin-right:4px"></i>${label}
    </button>`).join('')}
  </div>
  <div id="analytics-body"></div>`;
  _analyticsRenderTab();
}

function _analyticsRenderTab() {
  const el = $('#analytics-body');
  if (!el) return;
  try {
    const fn = {
      spend: _analyticsSpend,
      suppliers: _analyticsSuppliers,
      turnover: _analyticsTurnover,
      procurement: _analyticsProcurement,
      manpower: _analyticsManpower,
      projects: _analyticsProjects,
    }[_analyticsTab];
    if (fn) el.innerHTML = fn();
    else el.innerHTML = '<div class="empty-state">Coming soon</div>';
  } catch (e) {
    console.error('[Analytics]', e);
    el.innerHTML = `<div class="empty-state"><p style="color:var(--accent-red)"><i class="fas fa-exclamation-triangle"></i> ${e.message}</p><p style="font-size:11px;color:var(--text-muted)">Check browser console for details.</p></div>`;
  }
}

// ── SPEND ANALYSIS ──────────────────────────────────────────
function _analyticsSpend() {
  const _r = _tfRange();
  const _inR = (d)=>{ if(!d) return false; const dt=new Date(d.length>10?d:(d+'T00:00:00')); return !isNaN(dt) && dt>=_r.start && dt<=_r.end; };
  const tx = (AppState.data.whTransactions || []).filter(t => !t._deleted && t.type === 'receive' && _inR(t.date || t.postedAt));
  const procItems = (AppState.data.procurement || []).filter(p => !p._deleted && _inR(p.date || p.createdAt));

  // Monthly spend from warehouse receives
  const byMonth = {};
  tx.forEach(t => {
    const mo = (t.date || t.postedAt || '').slice(0, 7);
    if (!mo) return;
    const cost = (t.lines || []).reduce((s, l) => s + (parseFloat(l.qty) || 0) * (parseFloat(l.unitCost) || 0), 0);
    byMonth[mo] = (byMonth[mo] || 0) + cost;
  });
  const months = Object.keys(byMonth).sort();
  const values = months.map(m => byMonth[m]);
  const total = values.reduce((a, b) => a + b, 0);
  const avg = months.length ? total / months.length : 0;

  // By category
  const byCat = {};
  tx.forEach(t => {
    (t.lines || []).forEach(l => {
      const item = (AppState.data.warehouseItems || []).find(i => i.id === l.itemId);
      const cat = item?.category || 'Uncategorized';
      const cost = (parseFloat(l.qty) || 0) * (parseFloat(l.unitCost) || 0);
      byCat[cat] = (byCat[cat] || 0) + cost;
    });
  });
  const topCats = Object.entries(byCat).sort((a, b) => b[1] - a[1]).slice(0, 8);

  const procTotal = procItems.reduce((s, p) => s + (parseFloat(p.amount) || 0), 0);

  return `
  <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-bottom:16px">
    ${_aKpi('Total WH Spend', _fmt(total), 'fas fa-warehouse', 'var(--accent-blue)')}
    ${_aKpi('Monthly Avg', _fmt(avg), 'fas fa-calendar', 'var(--accent-green)')}
    ${_aKpi('Procurement Value', _fmt(procTotal), 'fas fa-shopping-cart', 'var(--accent-amber)')}
  </div>
  <div style="display:grid;grid-template-columns:2fr 1fr;gap:16px">
    <div class="card">
      <div style="font-weight:600;font-size:13px;margin-bottom:12px"><i class="fas fa-chart-bar" style="color:var(--accent-blue);margin-right:6px"></i>Monthly Warehouse Spend</div>
      ${months.length ? _aBarChart(months, values, 'var(--accent-blue)') : '<div class="empty-state" style="padding:20px">No receive transactions yet</div>'}
    </div>
    <div class="card">
      <div style="font-weight:600;font-size:13px;margin-bottom:12px"><i class="fas fa-tags" style="color:var(--accent-amber);margin-right:6px"></i>Spend by Category</div>
      ${topCats.length ? _aPieList(topCats, total) : '<div class="empty-state" style="padding:20px">No data</div>'}
    </div>
  </div>`;
}

// ── SUPPLIER PERFORMANCE ────────────────────────────────────
function _analyticsSuppliers() {
  const _r = _tfRange();
  const _inR = (d)=>{ if(!d) return false; const dt=new Date(d.length>10?d:(d+'T00:00:00')); return !isNaN(dt) && dt>=_r.start && dt<=_r.end; };
  const tx = (AppState.data.whTransactions || []).filter(t => !t._deleted && t.type === 'receive' && t.vendor && _inR(t.date || t.postedAt));
  const byVendor = {};
  tx.forEach(t => {
    if (!byVendor[t.vendor]) byVendor[t.vendor] = { deliveries: 0, items: 0, spend: 0, lastDate: '' };
    const v = byVendor[t.vendor];
    v.deliveries++;
    (t.lines || []).forEach(l => {
      v.items += parseFloat(l.qty) || 0;
      v.spend += (parseFloat(l.qty) || 0) * (parseFloat(l.unitCost) || 0);
    });
    if ((t.date || '') > v.lastDate) v.lastDate = t.date || '';
  });

  const procVendors = {};
  (AppState.data.procurement || []).filter(p => !p._deleted && p.supplier).forEach(p => {
    if (!procVendors[p.supplier]) procVendors[p.supplier] = { orders: 0, value: 0 };
    procVendors[p.supplier].orders++;
    procVendors[p.supplier].value += parseFloat(p.amount) || 0;
  });

  const rows = Object.entries(byVendor).sort((a, b) => b[1].spend - a[1].spend);
  if (!rows.length) return '<div class="empty-state" style="padding:40px"><p>No supplier data yet. Add a Vendor when receiving stock.</p></div>';

  return `
  <div class="card">
    <div style="font-weight:600;font-size:13px;margin-bottom:12px"><i class="fas fa-truck" style="color:var(--accent-blue);margin-right:6px"></i>Supplier Summary</div>
    <div class="table-wrap"><table>
      <thead><tr><th>Supplier</th><th style="text-align:right">Deliveries</th><th style="text-align:right">Units Received</th><th style="text-align:right">Total Spend</th><th style="text-align:right">PO Count</th><th style="text-align:right">PO Value</th><th>Last Delivery</th></tr></thead>
      <tbody>
        ${rows.map(([vendor, v]) => {
          const po = procVendors[vendor] || { orders: 0, value: 0 };
          return `<tr>
            <td style="font-weight:600;font-size:12px">${vendor}</td>
            <td style="text-align:right;font-family:var(--font-mono)">${v.deliveries}</td>
            <td style="text-align:right;font-family:var(--font-mono)">${v.items.toLocaleString()}</td>
            <td style="text-align:right;font-family:var(--font-mono);color:var(--accent-green)">${_fmt(v.spend)}</td>
            <td style="text-align:right;font-family:var(--font-mono)">${po.orders}</td>
            <td style="text-align:right;font-family:var(--font-mono);color:var(--accent-amber)">${_fmt(po.value)}</td>
            <td style="font-size:11px;color:var(--text-secondary)">${v.lastDate || '—'}</td>
          </tr>`;
        }).join('')}
      </tbody>
    </table></div>
  </div>`;
}

// ── WAREHOUSE TURNOVER ──────────────────────────────────────
function _analyticsTurnover() {
  if (typeof _whItems !== 'function') return '<div class="empty-state"><p>Warehouse module not loaded.</p></div>';
  const items = _whItems();
  const now = new Date();
  const yr = now.getFullYear();
  const mo = now.getMonth();
  const ytdStart = new Date(yr, 0, 1).toISOString().slice(0, 10);
  const mtdStart = new Date(yr, mo, 1).toISOString().slice(0, 10);

  const rows = items.map(it => {
    const q = _whCalcQty(it.id);
    const txAll = (AppState.data.whTransactions || []).filter(t => !t._deleted && t.type !== 'receive');
    const issued = txAll.filter(t => (t.lines || []).some(l => l.itemId === it.id));
    const ytdIssued = issued.filter(t => (t.date || t.postedAt || '') >= ytdStart)
      .reduce((s, t) => s + (t.lines || []).filter(l => l.itemId === it.id).reduce((a, l) => a + (parseFloat(l.qty) || 0), 0), 0);
    const mtdIssued = issued.filter(t => (t.date || t.postedAt || '') >= mtdStart)
      .reduce((s, t) => s + (t.lines || []).filter(l => l.itemId === it.id).reduce((a, l) => a + (parseFloat(l.qty) || 0), 0), 0);
    const wac = typeof _whCalcWAC === 'function' ? _whCalcWAC(it.id) : 0;
    const onHandValue = q.qtyOnHand * wac;
    const cogs = ytdIssued * wac;
    const avgInv = onHandValue > 0 ? onHandValue : 1;
    const turnover = cogs / avgInv;
    return { it, q, ytdIssued, mtdIssued, wac, onHandValue, turnover };
  }).sort((a, b) => b.ytdIssued - a.ytdIssued);

  const totalOnHandValue = rows.reduce((s, r) => s + r.onHandValue, 0);
  const totalYtdIssued = rows.reduce((s, r) => s + r.ytdIssued, 0);

  return `
  <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-bottom:16px">
    ${_aKpi('Total Inventory Value', _fmt(totalOnHandValue), 'fas fa-boxes', 'var(--accent-blue)')}
    ${_aKpi('Items in Stock', rows.filter(r=>r.q.qtyOnHand>0).length+'', 'fas fa-archive', 'var(--accent-green)')}
    ${_aKpi('YTD Units Issued', totalYtdIssued.toLocaleString(), 'fas fa-arrow-right', 'var(--accent-amber)')}
  </div>
  <div class="card">
    <div style="font-weight:600;font-size:13px;margin-bottom:12px"><i class="fas fa-sync-alt" style="color:var(--accent-blue);margin-right:6px"></i>Item Turnover (YTD)</div>
    <div class="table-wrap"><table>
      <thead><tr><th>Item</th><th>Category</th><th style="text-align:right">On Hand</th><th style="text-align:right">WAC</th><th style="text-align:right">Inv. Value</th><th style="text-align:right">YTD Issued</th><th style="text-align:right">MTD Issued</th><th style="text-align:right">Turnover</th></tr></thead>
      <tbody>
        ${rows.map(r=>`<tr>
          <td style="font-weight:600;font-size:12px">${r.it.name}</td>
          <td style="font-size:11px;color:var(--text-secondary)">${r.it.category||'—'}</td>
          <td style="text-align:right;font-family:var(--font-mono);${r.q.qtyOnHand<=0?'color:var(--accent-red)':''}">${r.q.qtyOnHand.toLocaleString()}</td>
          <td style="text-align:right;font-family:var(--font-mono)">${_fmt(r.wac)}</td>
          <td style="text-align:right;font-family:var(--font-mono);color:var(--accent-blue)">${_fmt(r.onHandValue)}</td>
          <td style="text-align:right;font-family:var(--font-mono)">${r.ytdIssued.toLocaleString()}</td>
          <td style="text-align:right;font-family:var(--font-mono)">${r.mtdIssued.toLocaleString()}</td>
          <td style="text-align:right;font-family:var(--font-mono);${r.turnover>3?'color:var(--accent-green)':r.turnover>1?'color:var(--accent-amber)':'color:var(--accent-red)'}">${r.turnover.toFixed(2)}x</td>
        </tr>`).join('')}
      </tbody>
    </table></div>
  </div>`;
}

// ── PROCUREMENT CYCLE TIME ──────────────────────────────────
function _analyticsProcurement() {
  const _r = _tfRange();
  const _inR = (d)=>{ if(!d) return false; const dt=new Date(d.length>10?d:(d+'T00:00:00')); return !isNaN(dt) && dt>=_r.start && dt<=_r.end; };
  const items = (AppState.data.procurement || []).filter(p => !p._deleted && _inR(p.date||p.createdAt||p.completedDate));
  if (!items.length) return '<div class="empty-state" style="padding:40px"><p>No procurement records in '+_r.label+'.</p></div>';

  const stageOrder = ['prospect','rfq','po_issued','delivery','received','closed'];
  const cycleItems = items.filter(p => p.createdAt && p.updatedAt);
  const avgCycle = cycleItems.length ?
    cycleItems.reduce((s, p) => s + (new Date(p.updatedAt) - new Date(p.createdAt)) / 86400000, 0) / cycleItems.length : 0;

  const byStage = {};
  stageOrder.forEach(s => { byStage[s] = 0; });
  items.forEach(p => { if (p.stage) byStage[p.stage] = (byStage[p.stage] || 0) + 1; });

  const totalValue = items.reduce((s, p) => s + (parseFloat(p.amount) || 0), 0);
  const openValue = items.filter(p => !['received','closed','cancelled'].includes(p.stage))
    .reduce((s, p) => s + (parseFloat(p.amount) || 0), 0);

  const top10 = [...items].sort((a, b) => (parseFloat(b.amount) || 0) - (parseFloat(a.amount) || 0)).slice(0, 10);

  return `
  <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:16px">
    ${_aKpi('Total POs', items.length+'', 'fas fa-file-invoice', 'var(--accent-blue)')}
    ${_aKpi('Total Value', _fmt(totalValue), 'fas fa-dollar-sign', 'var(--accent-green)')}
    ${_aKpi('Open Value', _fmt(openValue), 'fas fa-clock', 'var(--accent-amber)')}
    ${_aKpi('Avg Cycle (days)', avgCycle.toFixed(1), 'fas fa-stopwatch', 'var(--accent-red)')}
  </div>
  <div style="display:grid;grid-template-columns:1fr 2fr;gap:16px">
    <div class="card">
      <div style="font-weight:600;font-size:13px;margin-bottom:12px"><i class="fas fa-layer-group" style="color:var(--accent-amber);margin-right:6px"></i>By Stage</div>
      ${stageOrder.map(s=>`
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;font-size:12px">
        <span style="text-transform:capitalize">${s.replace('_',' ')}</span>
        <span class="badge badge-blue">${byStage[s]||0}</span>
      </div>`).join('')}
    </div>
    <div class="card">
      <div style="font-weight:600;font-size:13px;margin-bottom:12px"><i class="fas fa-list-ol" style="color:var(--accent-blue);margin-right:6px"></i>Top 10 by Value</div>
      <div class="table-wrap"><table>
        <thead><tr><th>Description</th><th>Supplier</th><th>Stage</th><th style="text-align:right">Amount</th></tr></thead>
        <tbody>
          ${top10.map(p=>`<tr>
            <td style="font-size:11px;max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${p.description||p.id}</td>
            <td style="font-size:11px;color:var(--text-secondary)">${p.supplier||'—'}</td>
            <td><span class="badge badge-blue" style="font-size:9px;text-transform:capitalize">${(p.stage||'').replace('_',' ')}</span></td>
            <td style="text-align:right;font-family:var(--font-mono);font-size:11px;color:var(--accent-green)">${_fmt(parseFloat(p.amount)||0)}</td>
          </tr>`).join('')}
        </tbody>
      </table></div>
    </div>
  </div>`;
}

// ── MANPOWER COST TREND ─────────────────────────────────────
function _analyticsManpower() {
  const _r = _tfRange();
  const _inR = (d)=>{ if(!d) return false; const dt=new Date(d.length>10?d:(d+'T00:00:00')); return !isNaN(dt) && dt>=_r.start && dt<=_r.end; };
  const records = (AppState.data.manpower || []).filter(r => !r._deleted && _inR(r.date||r.startDate||r.createdAt));
  if (!records.length) return '<div class="empty-state" style="padding:40px"><p>No manpower records in '+_r.label+'.</p></div>';

  const byMonth = {};
  const byProject = {};
  const byDiscipline = {};
  records.forEach(r => {
    const mo = (r.date || r.weekStart || '').slice(0, 7);
    const proj = r.projectId || r.project || 'General';
    const disc = r.discipline || r.position || 'Other';
    const cost = parseFloat(r.totalCost || r.cost || 0);
    const mandays = parseFloat(r.mandays || r.headcount || 0);
    if (mo) byMonth[mo] = { cost: (byMonth[mo]?.cost || 0) + cost, mandays: (byMonth[mo]?.mandays || 0) + mandays };
    byProject[proj] = (byProject[proj] || 0) + cost;
    byDiscipline[disc] = (byDiscipline[disc] || 0) + cost;
  });

  const months = Object.keys(byMonth).sort();
  const costVals = months.map(m => byMonth[m].cost);
  const totalCost = costVals.reduce((a, b) => a + b, 0);
  const totalMandays = Object.values(byMonth).reduce((s, v) => s + v.mandays, 0);
  const topProjects = Object.entries(byProject).sort((a, b) => b[1] - a[1]).slice(0, 6);
  const topDisc = Object.entries(byDiscipline).sort((a, b) => b[1] - a[1]).slice(0, 6);

  return `
  <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-bottom:16px">
    ${_aKpi('Total Manpower Cost', _fmt(totalCost), 'fas fa-dollar-sign', 'var(--accent-red)')}
    ${_aKpi('Total Mandays', totalMandays.toLocaleString(), 'fas fa-user-clock', 'var(--accent-blue)')}
    ${_aKpi('Avg Cost/Manday', totalMandays ? _fmt(totalCost / totalMandays) : '—', 'fas fa-calculator', 'var(--accent-amber)')}
  </div>
  <div class="card" style="margin-bottom:16px">
    <div style="font-weight:600;font-size:13px;margin-bottom:12px"><i class="fas fa-chart-line" style="color:var(--accent-red);margin-right:6px"></i>Monthly Manpower Cost</div>
    ${months.length ? _aBarChart(months, costVals, 'var(--accent-red)') : '<div class="empty-state" style="padding:20px">No dated records</div>'}
  </div>
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px">
    <div class="card">
      <div style="font-weight:600;font-size:13px;margin-bottom:10px"><i class="fas fa-briefcase" style="color:var(--accent-blue);margin-right:6px"></i>Cost by Project</div>
      ${_aPieList(topProjects, totalCost)}
    </div>
    <div class="card">
      <div style="font-weight:600;font-size:13px;margin-bottom:10px"><i class="fas fa-hard-hat" style="color:var(--accent-amber);margin-right:6px"></i>Cost by Discipline</div>
      ${_aPieList(topDisc, totalCost)}
    </div>
  </div>`;
}

// ── PROJECT VARIANCE ────────────────────────────────────────
function _analyticsProjects() {
  const projects = (AppState.data.projects || []).filter(p => !p._deleted && p.status !== 'prospect' && _tfProjectInRange(p));
  if (!projects.length) return '<div class="empty-state" style="padding:40px"><p>No active projects.</p></div>';

  const rows = projects.map(p => {
    const budget = parseFloat(p.budget || p.contractValue || 0);
    const spent = parseFloat(p.actualCost || p.costToDate || 0);
    const progress = parseFloat(p.progress || p.completion || 0);
    const eac = progress > 0 ? (spent / (progress / 100)) : budget;
    const variance = budget - eac;
    const cpi = spent > 0 && progress > 0 ? (progress / 100 * budget) / spent : 1;
    return { p, budget, spent, progress, eac, variance, cpi };
  }).sort((a, b) => a.variance - b.variance); // worst first

  const totalBudget = rows.reduce((s, r) => s + r.budget, 0);
  const totalSpent = rows.reduce((s, r) => s + r.spent, 0);
  const overBudget = rows.filter(r => r.variance < 0).length;

  return `
  <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:16px">
    ${_aKpi('Total Budget', _fmt(totalBudget), 'fas fa-wallet', 'var(--accent-blue)')}
    ${_aKpi('Total Spent', _fmt(totalSpent), 'fas fa-receipt', 'var(--accent-amber)')}
    ${_aKpi('Over Budget', overBudget+'', 'fas fa-exclamation-triangle', 'var(--accent-red)')}
    ${_aKpi('Avg CPI', rows.length ? (rows.reduce((s,r)=>s+r.cpi,0)/rows.length).toFixed(2) : '—', 'fas fa-tachometer-alt', 'var(--accent-green)')}
  </div>
  <div class="card">
    <div style="font-weight:600;font-size:13px;margin-bottom:12px"><i class="fas fa-balance-scale" style="color:var(--accent-blue);margin-right:6px"></i>Project Cost-at-Completion Variance</div>
    <div class="table-wrap"><table>
      <thead><tr><th>Project</th><th>Status</th><th style="text-align:right">Progress</th><th style="text-align:right">Budget</th><th style="text-align:right">Spent</th><th style="text-align:right">EAC</th><th style="text-align:right">Variance</th><th style="text-align:right">CPI</th></tr></thead>
      <tbody>
        ${rows.map(r=>{
          const varColor = r.variance < 0 ? 'var(--accent-red)' : 'var(--accent-green)';
          const cpiColor = r.cpi < 0.9 ? 'var(--accent-red)' : r.cpi < 1 ? 'var(--accent-amber)' : 'var(--accent-green)';
          return`<tr>
            <td style="font-weight:600;font-size:12px;max-width:160px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${r.p.name}">${r.p.name}</td>
            <td><span class="badge badge-blue" style="font-size:9px;text-transform:capitalize">${r.p.status}</span></td>
            <td style="text-align:right">
              <div style="display:flex;align-items:center;gap:6px;justify-content:flex-end">
                <div style="width:50px;height:5px;background:var(--border);border-radius:3px">
                  <div style="width:${Math.min(100,r.progress)}%;height:100%;background:var(--accent-blue);border-radius:3px"></div>
                </div>
                <span style="font-size:11px;font-family:var(--font-mono)">${r.progress.toFixed(0)}%</span>
              </div>
            </td>
            <td style="text-align:right;font-family:var(--font-mono);font-size:11px">${_fmt(r.budget)}</td>
            <td style="text-align:right;font-family:var(--font-mono);font-size:11px">${_fmt(r.spent)}</td>
            <td style="text-align:right;font-family:var(--font-mono);font-size:11px">${_fmt(r.eac)}</td>
            <td style="text-align:right;font-family:var(--font-mono);font-size:11px;color:${varColor};font-weight:600">${r.variance<0?'-':'+'}${_fmt(Math.abs(r.variance))}</td>
            <td style="text-align:right;font-family:var(--font-mono);font-size:11px;color:${cpiColor};font-weight:600">${r.cpi.toFixed(2)}</td>
          </tr>`;
        }).join('')}
      </tbody>
    </table></div>
    <div style="margin-top:10px;font-size:10px;color:var(--text-muted)">
      <i class="fas fa-info-circle" style="margin-right:4px"></i>EAC = Estimate at Completion. CPI &lt; 1.0 = over budget. Requires budget + actual cost fields on project records.
    </div>
  </div>`;
}

// ── SHARED HELPERS ──────────────────────────────────────────
function _fmt(v) {
  if (typeof v !== 'number' || isNaN(v)) return '₱0';
  return '₱' + v.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function _aKpi(label, value, icon, color) {
  return `<div class="card" style="text-align:center;padding:14px">
    <i class="${icon}" style="color:${color};font-size:20px;margin-bottom:6px;display:block"></i>
    <div style="font-size:18px;font-weight:700;color:${color}">${value}</div>
    <div style="font-size:10px;color:var(--text-muted);margin-top:2px">${label}</div>
  </div>`;
}

function _aBarChart(labels, values, color = 'var(--accent-blue)') {
  const max = Math.max(...values, 1);
  const barW = Math.max(14, Math.floor(420 / labels.length) - 6);
  const h = 120;
  const bars = labels.map((l, i) => {
    const barH = Math.max(2, (values[i] / max) * h);
    const x = i * (barW + 6);
    const shortL = l.slice(2); // "2024-03" → "24-03"
    return `<g>
      <rect x="${x}" y="${h - barH}" width="${barW}" height="${barH}" rx="3" fill="${color}" opacity="0.85"/>
      <text x="${x + barW / 2}" y="${h + 14}" text-anchor="middle" font-size="8" fill="var(--text-muted)">${shortL}</text>
    </g>`;
  }).join('');
  const totalW = labels.length * (barW + 6);
  return `<div style="overflow-x:auto"><svg viewBox="0 0 ${totalW} ${h + 20}" style="width:100%;min-width:${totalW}px;height:${h + 20}px">${bars}</svg></div>`;
}

function _aPieList(entries, total) {
  const colors = ['var(--accent-blue)', 'var(--accent-green)', 'var(--accent-amber)', 'var(--accent-red)', 'var(--accent-purple)', '#06b6d4', '#f59e0b', '#10b981'];
  return entries.map(([label, val], i) => {
    const pct = total > 0 ? (val / total * 100).toFixed(1) : 0;
    return `<div style="margin-bottom:8px">
      <div style="display:flex;justify-content:space-between;font-size:11px;margin-bottom:3px">
        <span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:60%">${label}</span>
        <span style="color:${colors[i % colors.length]};font-weight:600">${pct}%</span>
      </div>
      <div style="height:5px;background:var(--border);border-radius:3px">
        <div style="width:${pct}%;height:100%;background:${colors[i % colors.length]};border-radius:3px"></div>
      </div>
    </div>`;
  }).join('');
}

function _analyticsExportCSV() {
  let rows = [];
  const esc = v => {
    const s = String(v === null || v === undefined ? '' : v);
    return s.includes(',') || s.includes('"') || s.includes('\n') ? `"${s.replace(/"/g,'""')}"` : s;
  };
  const row = cols => cols.map(esc).join(',');

  if (_analyticsTab === 'spend') {
    const tx = (AppState.data.whTransactions || []).filter(t => !t._deleted && t.type === 'receive');
    rows.push(row(['Month', 'Vendor', 'Item', 'Category', 'Qty', 'Unit Cost', 'Total Cost']));
    tx.forEach(t => {
      const mo = (t.date || t.postedAt || '').slice(0, 7);
      (t.lines || []).forEach(l => {
        const item = (AppState.data.warehouseItems || []).find(i => i.id === l.itemId);
        const cost = (parseFloat(l.qty) || 0) * (parseFloat(l.unitCost) || 0);
        rows.push(row([mo, t.vendor || '', item?.name || l.itemId || '', item?.category || '', l.qty || 0, l.unitCost || 0, cost.toFixed(2)]));
      });
    });

  } else if (_analyticsTab === 'suppliers') {
    const tx = (AppState.data.whTransactions || []).filter(t => !t._deleted && t.type === 'receive' && t.vendor);
    const byVendor = {};
    tx.forEach(t => {
      if (!byVendor[t.vendor]) byVendor[t.vendor] = { deliveries: 0, items: 0, spend: 0, lastDate: '' };
      const v = byVendor[t.vendor];
      v.deliveries++;
      (t.lines || []).forEach(l => { v.items += parseFloat(l.qty) || 0; v.spend += (parseFloat(l.qty)||0)*(parseFloat(l.unitCost)||0); });
      if ((t.date||'') > v.lastDate) v.lastDate = t.date||'';
    });
    rows.push(row(['Supplier', 'Deliveries', 'Units Received', 'Total Spend', 'Last Delivery']));
    Object.entries(byVendor).sort((a,b)=>b[1].spend-a[1].spend).forEach(([vendor,v]) =>
      rows.push(row([vendor, v.deliveries, v.items, v.spend.toFixed(2), v.lastDate])));

  } else if (_analyticsTab === 'turnover') {
    const items = typeof _whItems === 'function' ? _whItems() : (AppState.data.warehouseItems||[]).filter(i=>!i._deleted);
    rows.push(row(['Item', 'Code', 'Category', 'On Hand', 'WAC', 'Inv. Value', 'YTD Issued', 'MTD Issued', 'Turnover']));
    const ytdStart = new Date(new Date().getFullYear(), 0, 1).toISOString().slice(0,10);
    const mtdStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0,10);
    items.forEach(it => {
      const onHand = typeof getQtyOnHand === 'function' ? getQtyOnHand(it.id) : 0;
      const wac = typeof getWAC === 'function' ? getWAC(it.id) : 0;
      const txAll = (AppState.data.whTransactions||[]).filter(t=>!t._deleted && t.type!=='receive');
      const ytd = txAll.filter(t=>(t.date||t.postedAt||'')>=ytdStart).reduce((s,t)=>s+(t.lines||[]).filter(l=>l.itemId===it.id).reduce((a,l)=>a+(parseFloat(l.qty)||0),0),0);
      const mtd = txAll.filter(t=>(t.date||t.postedAt||'')>=mtdStart).reduce((s,t)=>s+(t.lines||[]).filter(l=>l.itemId===it.id).reduce((a,l)=>a+(parseFloat(l.qty)||0),0),0);
      const invVal = onHand * wac;
      const turnover = invVal > 0 ? (ytd * wac / invVal).toFixed(2) : '0.00';
      rows.push(row([it.name, it.code||'', it.category||'', onHand, wac.toFixed(2), invVal.toFixed(2), ytd, mtd, turnover]));
    });

  } else if (_analyticsTab === 'procurement') {
    const items = (AppState.data.procurement||[]).filter(p=>!p._deleted);
    rows.push(row(['ID', 'Description', 'Supplier', 'Stage', 'Amount', 'Created', 'Updated']));
    items.forEach(p => rows.push(row([p.id||'', p.description||'', p.supplier||'', p.stage||'', parseFloat(p.amount||0).toFixed(2), p.createdAt||'', p.updatedAt||''])));

  } else if (_analyticsTab === 'manpower') {
    const records = (AppState.data.manpower||[]).filter(r=>!r._deleted);
    rows.push(row(['ID', 'Project', 'Trade/Discipline', 'Date', 'Mandays', 'Total Cost']));
    records.forEach(r => rows.push(row([r.id||'', r.projectId||r.project||'', r.discipline||r.position||r.trade||'', r.date||r.weekStart||'', r.mandays||r.headcount||0, parseFloat(r.totalCost||r.cost||0).toFixed(2)])));

  } else if (_analyticsTab === 'projects') {
    const projects = (AppState.data.projects||[]).filter(p=>!p._deleted&&p.status!=='prospect');
    rows.push(row(['Project', 'Status', 'Progress%', 'Budget', 'Spent', 'EAC', 'Variance', 'CPI']));
    projects.forEach(p => {
      const budget = parseFloat(p.budget||p.contractValue||0);
      const spent = parseFloat(p.actualCost||p.costToDate||0);
      const progress = parseFloat(p.progress||p.completion||0);
      const eac = progress > 0 ? (spent / (progress/100)) : budget;
      const variance = budget - eac;
      const cpi = spent > 0 && progress > 0 ? (progress/100*budget)/spent : 1;
      rows.push(row([p.name||p.id, p.status, progress.toFixed(0), budget.toFixed(2), spent.toFixed(2), eac.toFixed(2), variance.toFixed(2), cpi.toFixed(2)]));
    });
  }

  if (!rows.length) { showToast('No data to export for this tab', 'warning'); return; }
  const csv = rows.join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'analytics_' + _analyticsTab + '_' + new Date().toISOString().slice(0, 10) + '.csv';
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
  showToast(`Exported ${rows.length - 1} rows`, 'success');
}
