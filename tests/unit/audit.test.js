/**
 * Unit tests for the Audit facade — unifies the two legacy auditLog
 * signatures and persists entries to localStorage with a cap.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const src = readFileSync(path.join(__dirname, '..', '..', 'src', 'js', 'lib', 'audit.js'), 'utf8');

function loadAudit() {
  const store = {};
  const localStorage = {
    getItem: k => (k in store ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v); },
    removeItem: k => { delete store[k]; },
  };
  const sandbox = { localStorage, console: { log() {}, warn() {}, error() {} } };
  const wrapped = `with (sandbox) { ${src}; return Audit; }`;
  return new Function('sandbox', wrapped)(sandbox);
}

test('Audit.record (Family A) normalizes 3-arg call', () => {
  const A = loadAudit();
  A.record('sync', 'Full sync done', { renamed: 2 });
  const [e] = A.all();
  assert.equal(e.category, 'sync');
  assert.equal(e.message, 'Full sync done');
  assert.deepEqual(e.details, { renamed: 2 });
});

test('Audit.record (Family B) normalizes 7-arg call', () => {
  const A = loadAudit();
  A.record('CREATE', 'Warehouse', 'StockTransaction', 'TX-1', null, { qty: 5 }, 'Receive');
  const [e] = A.all();
  assert.equal(e.category, 'create');
  assert.match(e.message, /Warehouse · StockTransaction TX-1/);
  assert.equal(e.details.module, 'Warehouse');
  assert.equal(e.details.entity, 'StockTransaction');
  assert.equal(e.details.entityId, 'TX-1');
  assert.equal(e.details.notes, 'Receive');
});

test('Audit distinguishes 3-arg with object details from 4-arg Family B', () => {
  const A = loadAudit();
  A.record('delete', 'Removed by admin', { id: 'PRJ-1' });
  A.record('DELETE', 'Warehouse', 'WarehouseItem', 'WH-1');
  const [a, b] = A.all();
  assert.equal(a.category, 'delete');
  assert.equal(a.details.id, 'PRJ-1');
  assert.equal(b.category, 'delete');
  assert.equal(b.details.entity, 'WarehouseItem');
});

test('Audit.clear wipes the log', () => {
  const A = loadAudit();
  A.record('boot', 'x');
  A.record('boot', 'y');
  assert.equal(A.all().length, 2);
  A.clear();
  assert.equal(A.all().length, 0);
});

test('Audit.errorCount and conflictCount', () => {
  const A = loadAudit();
  A.record('error', 'boom');
  A.record('error', 'boom2');
  A.record('conflict', 'race');
  A.record('collision', 'id reuse');
  A.record('sync', 'ok');
  assert.equal(A.errorCount(), 2);
  assert.equal(A.conflictCount(), 2);
});

test('Audit.all returns a copy — external mutation does not leak', () => {
  const A = loadAudit();
  A.record('sync', 'ok');
  A.all().push({ fake: true });
  assert.equal(A.all().length, 1);
});
