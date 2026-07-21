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

// Bundle order comes from src/bundle.json — single source of truth
// shared with build.ps1. Add new modules there, not here.
const jsFiles = JSON.parse(fs.readFileSync(path.join(SRC, 'bundle.json'), 'utf8')).js;

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
