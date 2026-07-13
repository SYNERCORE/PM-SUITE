/**
 * Unit tests for Deletions facade — the first-class tombstone tracker
 * that replaces the loose _spDeletedIds map.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const src = readFileSync(path.join(__dirname, '..', '..', 'src', 'js', 'lib', 'deletions.js'), 'utf8');

function loadDeletions() {
  const store = {};
  const localStorage = {
    getItem: k => (k in store ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v); },
    removeItem: k => { delete store[k]; },
  };
  const sandbox = { localStorage };
  const wrapped = `with (sandbox) { ${src}; return Deletions; }`;
  return new Function('sandbox', wrapped)(sandbox);
}

test('Deletions.track then was returns true', () => {
  const D = loadDeletions();
  D.track('projects', 'PRJ-1', 'alice');
  assert.equal(D.was('projects', 'PRJ-1'), true);
});

test('Deletions.was returns false for untracked entity/id', () => {
  const D = loadDeletions();
  D.track('projects', 'PRJ-1', 'alice');
  assert.equal(D.was('tasks', 'PRJ-1'), false);
  assert.equal(D.was('projects', 'PRJ-2'), false);
});

test('Deletions.get exposes {at, by}', () => {
  const D = loadDeletions();
  D.track('projects', 'PRJ-1', 'alice');
  const e = D.get('projects', 'PRJ-1');
  assert.equal(e.by, 'alice');
  assert.equal(typeof e.at, 'number');
});

test('Deletions.list returns live tombstones only', () => {
  const D = loadDeletions();
  D.track('projects', 'PRJ-1', 'alice');
  D.track('projects', 'PRJ-2', 'alice');
  D.restore('projects', 'PRJ-2', 'bob');
  assert.deepEqual(D.list('projects'), ['PRJ-1']);
});

test('Deletions.forget removes a tombstone entirely', () => {
  const D = loadDeletions();
  D.track('projects', 'PRJ-1', 'alice');
  D.forget('projects', 'PRJ-1');
  assert.equal(D.get('projects', 'PRJ-1'), null);
});

test('Deletions.restore marks restoredAt but preserves record', () => {
  const D = loadDeletions();
  D.track('projects', 'PRJ-1', 'alice');
  D.restore('projects', 'PRJ-1', 'bob');
  const e = D.get('projects', 'PRJ-1');
  assert.equal(typeof e.restoredAt, 'number');
  assert.equal(e.restoredBy, 'bob');
  assert.equal(D.was('projects', 'PRJ-1'), false);
});

test('Deletions.mergeRemote takes the newer tombstone', () => {
  const D = loadDeletions();
  D.track('projects', 'PRJ-1', 'alice');
  const olderAt = D.get('projects', 'PRJ-1').at;
  D.mergeRemote({ projects: { 'PRJ-1': { at: olderAt + 1000, by: 'bob' } } });
  assert.equal(D.get('projects', 'PRJ-1').by, 'bob');
});

test('Deletions.mergeRemote keeps local if older', () => {
  const D = loadDeletions();
  D.track('projects', 'PRJ-1', 'alice');
  const localAt = D.get('projects', 'PRJ-1').at;
  D.mergeRemote({ projects: { 'PRJ-1': { at: localAt - 1000, by: 'bob' } } });
  assert.equal(D.get('projects', 'PRJ-1').by, 'alice');
});

test('Deletions.mergeRemote adds new entities from remote', () => {
  const D = loadDeletions();
  D.mergeRemote({ tasks: { 'TSK-1': { at: 5000, by: 'bob' } } });
  assert.equal(D.was('tasks', 'TSK-1'), true);
});

test('Deletions accepts legacy numeric-timestamp shape', () => {
  // Legacy _spDeletedIds stored entries as bare numbers.
  const D = loadDeletions();
  D.mergeRemote({ projects: { 'PRJ-OLD': 4242 } });
  assert.equal(D.was('projects', 'PRJ-OLD'), true);
  assert.equal(D.get('projects', 'PRJ-OLD').at, 4242);
});

test('Deletions.prune drops entries older than cutoff', () => {
  const D = loadDeletions();
  // Inject an ancient tombstone via mergeRemote (bypasses fresh timestamp)
  D.mergeRemote({ projects: { 'OLD': { at: 1000, by: 'alice' } } });
  D.track('projects', 'NEW', 'alice');
  D.prune(60 * 1000); // 1 minute cutoff
  assert.equal(D.was('projects', 'OLD'), false);
  assert.equal(D.was('projects', 'NEW'), true);
});

test('Deletions.raw is the live underlying map', () => {
  const D = loadDeletions();
  D.track('projects', 'PRJ-1', 'alice');
  const map = D.raw();
  assert.ok(map.projects);
  assert.ok(map.projects['PRJ-1']);
});
