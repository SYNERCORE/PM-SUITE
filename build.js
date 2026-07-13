/**
 * build.js — Inline all src/ files back into a single promaster.html
 *
 * Usage:  node build.js
 * Output: promaster.html (rebuilt from src/)
 *
 * Requires Node.js.  Run from the project root (same folder as this file).
 */
const fs = require('fs');
const path = require('path');

const BASE = __dirname;
const SRC  = path.join(BASE, 'src');

function read(rel) {
  return fs.readFileSync(path.join(SRC, rel), 'utf8');
}

const jsFiles = [
  'js/core.js', 'js/lib/store.js', 'js/lib/merge.js', 'js/ui.js', 'js/auth.js', 'js/sync.js', 'js/hardening.js',
  'js/views/dashboard.js', 'js/views/projects.js', 'js/views/prospects.js',
  'js/views/deletionRequests.js', 'js/views/tasks.js', 'js/views/gantt.js',
  'js/views/resources.js', 'js/views/manpower.js', 'js/views/materials.js',
  'js/views/procurement.js', 'js/views/costs.js', 'js/views/qaqc.js',
  'js/views/risks.js', 'js/views/actions.js', 'js/views/library.js',
  'js/views/documents.js', 'js/views/progress.js', 'js/views/kpi.js',
  'js/views/calendar.js', 'js/views/reports.js', 'js/views/settings.js',
  'js/views/masterlist.js', 'js/views/trash.js'
];

let out = read('index.html');

// Inline CSS
const css = read('css/main.css');
out = out.replace(
  '  <link rel="stylesheet" href="src/css/main.css">',
  `<style>\n${css}\n</style>`
);

// Inline each JS file
for (const f of jsFiles) {
  const tag  = `<script src="src/${f}"></script>`;
  const code = read(f);
  out = out.replace(tag, `<script>\n${code}\n</script>`);
}

fs.writeFileSync(path.join(BASE, 'promaster.html'), out, 'utf8');
console.log('Build complete → promaster.html');

const lines = out.split('\n').length;
console.log(`Output: ${lines} lines, ${out.length} chars`);
