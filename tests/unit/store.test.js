/**
 * Unit tests for the Store storage abstraction layer.
 *
 * Store is the single entry point every view SHOULD go through to read and
 * write persisted data. It sits over AppState.data today; when the local SQL
 * server lands it will grow a routing layer. The public API is the contract —
 * these tests lock it down so future backends can be swapped in safely.
 *
 *   npm run test:unit
 */
import test from 'node:test';
import assert from 'node:assert/strict';

// ── Test harness: stub the browser globals Store depends on ────────────────

globalThis.AppState = { data: null, save() { this._saveCount = (this._saveCount || 0) + 1; } };
globalThis.getDefaultData = () => ({});
globalThis.console = console;

// Import Store via the CommonJS export path baked into src/js/lib/store.js.
// We use a dynamic require through vm here because store.js expects to live
// in a script tag with implicit globals — not an ES module. Simplest: read
// the file and eval it into the current context so `const Store = ...` runs.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const src = readFileSync(path.join(__dirname, '..', '..', 'src', 'js', 'lib', 'store.js'), 'utf8');
// Extract the IIFE and evaluate it; capture the Store binding.
const Store = new Function(src + '; return Store;')();

// ── Helpers ────────────────────────────────────────────────────────────────

function reset() {
  AppState.data = {};
  AppState._saveCount = 0;
}

// ── Tests: list ────────────────────────────────────────────────────────────

test('Store.list: returns [] for an unknown entity without throwing', () => {
  reset();
  assert.deepEqual(Store.list('nothing'), []);
});

test('Store.list: filters out soft-deleted records by default', () => {
  reset();
  AppState.data.projects = [
    { id: 'A', name: 'kept' },
    { id: 'B', name: 'gone', _deleted: true },
  ];
  const arr = Store.list('projects');
  assert.equal(arr.length, 1);
  assert.equal(arr[0].id, 'A');
});

test('Store.list: includeDeleted returns soft-deleted records too', () => {
  reset();
  AppState.data.projects = [
    { id: 'A', name: 'kept' },
    { id: 'B', name: 'gone', _deleted: true },
  ];
  assert.equal(Store.list('projects', { includeDeleted: true }).length, 2);
});

test('Store.list: accepts a filter function', () => {
  reset();
  AppState.data.tasks = [
    { id: 'T1', status: 'todo' },
    { id: 'T2', status: 'done' },
    { id: 'T3', status: 'todo' },
  ];
  const todo = Store.list('tasks', { filter: t => t.status === 'todo' });
  assert.equal(todo.length, 2);
});

test('Store.list: accepts an object filter (equality match on each pair)', () => {
  reset();
  AppState.data.tasks = [
    { id: 'T1', status: 'todo', projectId: 'A' },
    { id: 'T2', status: 'done', projectId: 'A' },
    { id: 'T3', status: 'todo', projectId: 'B' },
  ];
  const projA_todo = Store.list('tasks', { filter: { projectId: 'A', status: 'todo' } });
  assert.equal(projA_todo.length, 1);
  assert.equal(projA_todo[0].id, 'T1');
});

test('Store.list: sorts by field ascending / descending', () => {
  reset();
  AppState.data.projects = [
    { id: 'A', name: 'Charlie' },
    { id: 'B', name: 'Alpha' },
    { id: 'C', name: 'Bravo' },
  ];
  assert.deepEqual(Store.list('projects', { sort: 'name' }).map(p => p.name), ['Alpha', 'Bravo', 'Charlie']);
  assert.deepEqual(Store.list('projects', { sort: '-name' }).map(p => p.name), ['Charlie', 'Bravo', 'Alpha']);
});

test('Store.list: limit + offset paginates', () => {
  reset();
  AppState.data.tasks = Array.from({ length: 10 }, (_, i) => ({ id: 'T' + i }));
  const page1 = Store.list('tasks', { limit: 3 });
  const page2 = Store.list('tasks', { limit: 3, offset: 3 });
  assert.deepEqual(page1.map(t => t.id), ['T0', 'T1', 'T2']);
  assert.deepEqual(page2.map(t => t.id), ['T3', 'T4', 'T5']);
});

// ── Tests: get ─────────────────────────────────────────────────────────────

test('Store.get: returns the record with matching id', () => {
  reset();
  AppState.data.projects = [{ id: 'A', name: 'Alpha' }];
  assert.equal(Store.get('projects', 'A').name, 'Alpha');
});

test('Store.get: returns null for missing id or empty entity', () => {
  reset();
  assert.equal(Store.get('projects', 'MISSING'), null);
  assert.equal(Store.get('projects', ''), null);
});

// ── Tests: put ─────────────────────────────────────────────────────────────

test('Store.put: inserts a new record and stamps _mAt / _createdAt', () => {
  reset();
  const rec = Store.put('projects', { name: 'New', budget: 100 });
  assert.ok(rec.id, 'a generated id must be present');
  assert.ok(rec._mAt);
  assert.ok(rec._createdAt);
  assert.equal(rec.name, 'New');
  assert.equal(AppState.data.projects.length, 1);
});

test('Store.put: updates an existing record by id (shallow merge)', () => {
  reset();
  AppState.data.projects = [{ id: 'A', name: 'Original', budget: 100, extra: 'x' }];
  const updated = Store.put('projects', { id: 'A', budget: 200 });
  assert.equal(updated.name, 'Original', 'unspecified fields survive');
  assert.equal(updated.budget, 200, 'specified fields override');
  assert.equal(updated.extra, 'x', 'other fields survive');
  assert.ok(updated._mAt, 'update stamps _mAt');
});

test('Store.put: generated ids carry the entity prefix', () => {
  reset();
  const task = Store.put('tasks', { name: 'T' });
  const project = Store.put('projects', { name: 'P' });
  const other = Store.put('costs', { name: 'C' });
  assert.match(task.id, /^TSK-/);
  assert.match(project.id, /^JO-/);
  assert.match(other.id, /^CST-/);
});

test('Store.put: throws when given a non-object', () => {
  reset();
  assert.throws(() => Store.put('projects', null), /record must be an object/);
});

test('Store.put: triggers AppState.save exactly once per write', () => {
  reset();
  Store.put('projects', { name: 'A' });
  assert.equal(AppState._saveCount, 1);
});

// ── Tests: remove ──────────────────────────────────────────────────────────

test('Store.remove: soft-deletes projects/tasks/etc.', () => {
  reset();
  AppState.data.projects = [{ id: 'A', name: 'p' }];
  const ok = Store.remove('projects', 'A');
  assert.equal(ok, true);
  const rec = AppState.data.projects[0];
  assert.equal(rec._deleted, true, 'soft-delete flag set');
  assert.ok(rec._deletedAt, 'timestamp recorded');
});

test('Store.remove: hard-deletes entities not in the soft-delete list', () => {
  reset();
  AppState.data.notifications = [{ id: 'N1' }];
  Store.remove('notifications', 'N1');
  assert.equal(AppState.data.notifications.length, 0);
});

test('Store.remove: returns false for missing id', () => {
  reset();
  assert.equal(Store.remove('projects', 'MISSING'), false);
});

// ── Tests: subscribe ───────────────────────────────────────────────────────

test('Store.subscribe: fires callback on put and remove', () => {
  reset();
  const calls = [];
  const unsub = Store.subscribe('projects', e => calls.push(e));
  Store.put('projects', { name: 'A' });
  Store.remove('projects', Store.list('projects')[0].id);
  assert.deepEqual(calls, ['projects', 'projects']);
  unsub();
});

test('Store.subscribe: returned function unsubscribes', () => {
  reset();
  const calls = [];
  const unsub = Store.subscribe('projects', () => calls.push(1));
  unsub();
  Store.put('projects', { name: 'A' });
  assert.equal(calls.length, 0);
});

test('Store.subscribe: subscribers to other entities do not fire', () => {
  reset();
  const calls = [];
  Store.subscribe('tasks', () => calls.push(1));
  Store.put('projects', { name: 'A' });
  assert.equal(calls.length, 0);
});

// ── Tests: tx ──────────────────────────────────────────────────────────────

test('Store.tx: batches multiple writes into one save + one notify', () => {
  reset();
  const calls = [];
  Store.subscribe('projects', () => calls.push('n'));
  Store.tx(() => {
    Store.put('projects', { name: 'A' });
    Store.put('projects', { name: 'B' });
    Store.put('projects', { name: 'C' });
  });
  assert.equal(AppState._saveCount, 1, 'one AppState.save for the whole tx');
  assert.equal(calls.length, 1, 'one notification for the dirty entity');
  assert.equal(AppState.data.projects.length, 3);
});

test('Store.tx: notifies each dirty entity exactly once', () => {
  reset();
  const projCalls = [];
  const taskCalls = [];
  Store.subscribe('projects', () => projCalls.push(1));
  Store.subscribe('tasks', () => taskCalls.push(1));
  Store.tx(() => {
    Store.put('projects', { name: 'P1' });
    Store.put('tasks', { name: 'T1' });
    Store.put('tasks', { name: 'T2' });
  });
  assert.equal(projCalls.length, 1);
  assert.equal(taskCalls.length, 1);
});

test('Store.tx: nested tx() folds into the outer transaction', () => {
  reset();
  const calls = [];
  Store.subscribe('projects', () => calls.push(1));
  Store.tx(() => {
    Store.put('projects', { name: 'A' });
    Store.tx(() => {
      Store.put('projects', { name: 'B' });
    });
    Store.put('projects', { name: 'C' });
  });
  assert.equal(AppState._saveCount, 1);
  assert.equal(calls.length, 1);
});

test('Store.tx: throwing inside rolls back the batched notify state', () => {
  reset();
  const calls = [];
  Store.subscribe('projects', () => calls.push(1));
  assert.throws(() => Store.tx(() => {
    Store.put('projects', { name: 'A' });
    throw new Error('rollback');
  }), /rollback/);
  // Records that were put ARE persisted (Store doesn't undo the in-memory
  // writes) but the batched save + notify path was aborted. This is the
  // contract — callers that need atomicity must implement it themselves.
  assert.equal(AppState.data.projects.length, 1);
  assert.equal(calls.length, 0, 'no notify fired on throw');
});
