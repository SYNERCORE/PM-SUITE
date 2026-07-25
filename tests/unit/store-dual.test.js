/**
 * Unit tests for Store's dual-backend layer (shadow-write, hydrate, migrate).
 * The reads/writes stay synchronous against AppState; writes are optionally
 * mirrored to a Local Server via the Api facade, gated by
 * settings.apiEntities and settings.forceSharepointMode.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const src = readFileSync(path.join(__dirname, '..', '..', 'src', 'js', 'lib', 'store.js'), 'utf8');

function freshStore(apiCalls) {
  const AppState = {
    data: {},
    save() { this._saveCount = (this._saveCount || 0) + 1; },
  };
  const Api = {
    enabled: () => true,
    put: (entity, id, data) => { apiCalls.push({ op: 'put', entity, id, data }); return Promise.resolve({ ok: true, id }); },
    remove: (entity, id) => { apiCalls.push({ op: 'remove', entity, id }); return Promise.resolve({ ok: true, changed: 1 }); },
    list: (entity) => Promise.resolve(apiCalls._listResponse || []),
  };
  const Audit = { record() {} };
  const sandbox = { AppState, Api, Audit, console: { error() {}, warn() {}, log() {} } };
  const wrapped = `with (sandbox) { ${src}; return { Store, AppState, Api }; }`;
  return new Function('sandbox', wrapped)(sandbox);
}

test('Store.put mirrors to Api when entity is opted in', async () => {
  const calls = [];
  const { Store, AppState } = freshStore(calls);
  AppState.data.settings = { apiEntities: ['warehouseItems'] };
  Store.put('warehouseItems', { id: 'W1', name: 'Rebar' });
  await new Promise(r => setImmediate(r));
  assert.equal(calls.length, 1);
  assert.equal(calls[0].op, 'put');
  assert.equal(calls[0].id, 'W1');
});

test('Store.put does NOT mirror when entity not opted in', async () => {
  const calls = [];
  const { Store, AppState } = freshStore(calls);
  AppState.data.settings = { apiEntities: [] };
  Store.put('warehouseItems', { id: 'W1', name: 'Rebar' });
  await new Promise(r => setImmediate(r));
  assert.equal(calls.length, 0);
});

test('Store.put does NOT mirror when forceSharepointMode is true', async () => {
  const calls = [];
  const { Store, AppState } = freshStore(calls);
  AppState.data.settings = { apiEntities: ['warehouseItems'], forceSharepointMode: true };
  Store.put('warehouseItems', { id: 'W1', name: 'Rebar' });
  await new Promise(r => setImmediate(r));
  assert.equal(calls.length, 0);
});

test('Store.remove mirrors as DELETE to Api', async () => {
  const calls = [];
  const { Store, AppState } = freshStore(calls);
  AppState.data.settings = { apiEntities: ['warehouseItems'] };
  Store.put('warehouseItems', { id: 'W1', name: 'x' });
  await new Promise(r => setImmediate(r));
  calls.length = 0;
  Store.remove('warehouseItems', 'W1');
  await new Promise(r => setImmediate(r));
  assert.equal(calls.length, 1);
  assert.equal(calls[0].op, 'remove');
  assert.equal(calls[0].id, 'W1');
});

test('Store.hydrate replaces local data with server rows', async () => {
  const calls = [];
  const { Store, AppState } = freshStore(calls);
  AppState.data.warehouseItems = [{ id: 'X', name: 'to be replaced' }];
  calls._listResponse = [
    { id: 'W1', data: { name: 'Server Rebar' }, updated_at: '2026-07-22T00:00:00Z' },
    { id: 'W2', data: { name: 'Server Sand' },  updated_at: '2026-07-22T00:00:00Z' },
  ];
  const n = await Store.hydrate('warehouseItems');
  assert.equal(n, 2);
  assert.equal(AppState.data.warehouseItems.length, 2);
  assert.equal(AppState.data.warehouseItems[0].name, 'Server Rebar');
  assert.equal(AppState.data.warehouseItems[0].id, 'W1');
});

test('Store.migrate pushes every local record to Api', async () => {
  const calls = [];
  const { Store, AppState } = freshStore(calls);
  AppState.data.warehouseItems = [
    { id: 'W1', name: 'a' },
    { id: 'W2', name: 'b' },
    { id: 'W3', name: 'c' },
  ];
  const progress = [];
  const res = await Store.migrate('warehouseItems', p => progress.push(p));
  assert.equal(res.total, 3);
  assert.equal(res.migrated, 3);
  assert.equal(res.failed, 0);
  assert.equal(calls.filter(c => c.op === 'put').length, 3);
  assert.equal(progress.length, 3);
  assert.equal(progress[progress.length - 1].migrated, 3);
});

test('Store.migrate reports failures without throwing', async () => {
  const calls = [];
  const { Store, AppState, Api } = freshStore(calls);
  AppState.data.warehouseItems = [{ id: 'W1' }, { id: 'W2' }];
  Api.put = () => Promise.reject(new Error('boom'));
  const res = await Store.migrate('warehouseItems', () => {});
  assert.equal(res.failed, 2);
  assert.equal(res.migrated, 0);
});

test('Store.hydrate rejects when Api not enabled', async () => {
  const calls = [];
  const { Store, Api } = freshStore(calls);
  Api.enabled = () => false;
  await assert.rejects(() => Store.hydrate('warehouseItems'), /Api not configured/);
});
