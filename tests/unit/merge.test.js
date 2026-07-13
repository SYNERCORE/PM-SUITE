/**
 * Unit tests for the pure merge / overlap logic that has produced repeated
 * silent-data-loss bugs in production. Runs with Node's built-in test runner.
 *
 *   npm run test:unit
 *
 * These tests now exercise the REAL production code in src/js/lib/merge.js
 * (loaded via a script-tag-style eval — the file uses `const Merge = ...`
 * plus `if (typeof module !== 'undefined') module.exports = Merge` at the
 * bottom). If a regression sneaks into the real module, these tests fail.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const src = readFileSync(path.join(__dirname, '..', '..', 'src', 'js', 'lib', 'merge.js'), 'utf8');
const Merge = new Function(src + '; return Merge;')();

// ── Thin adapters that map the older test names onto the Merge API ────────
// Older tests were written before the extraction; this keeps them expressive.
const _projectOverlapsRange = Merge.projectOverlapsRange;
const _spMergeAppendArrays = Merge.appendArrays;
function _spMergeArrays(localArr, remoteArr, localEdited, wasDeleted = () => false) {
  return Merge.arrays(localArr, remoteArr, localEdited, { wasDeleted });
}
const _settingsMergeHasLocalEdits = Merge.settingsWithLocalEdits;
const _settingsMergeNoLocalEdits = Merge.settingsNoLocalEdits;

// ── Tests: _projectOverlapsRange ────────────────────────────────────────────

test('_projectOverlapsRange: current-year project matches', () => {
  const range = { start: new Date('2026-01-01T00:00:00'), end: new Date('2026-12-31T23:59:59') };
  const p = { startDate: '2026-03-01', endDate: '2026-12-31' };
  assert.equal(_projectOverlapsRange(p, range.start, range.end), true);
});

test('_projectOverlapsRange: cross-year completed project (dashboard bug repro)', () => {
  // Regression: dashboard used to exclude these; commit 2725a4d fixed it.
  const range = { start: new Date('2026-01-01T00:00:00'), end: new Date('2026-12-31T23:59:59') };
  const p = { startDate: '2025-12-28', endDate: '2026-01-03', completedDate: '2026-01-03', status: 'completed' };
  assert.equal(_projectOverlapsRange(p, range.start, range.end), true);
});

test('_projectOverlapsRange: future-starting planned project inside period', () => {
  const range = { start: new Date('2026-01-01T00:00:00'), end: new Date('2026-12-31T23:59:59') };
  const p = { startDate: '2026-08-01', endDate: '2026-12-31', status: 'planned' };
  assert.equal(_projectOverlapsRange(p, range.start, range.end), true);
});

test('_projectOverlapsRange: fully past project is excluded', () => {
  const range = { start: new Date('2026-01-01T00:00:00'), end: new Date('2026-12-31T23:59:59') };
  const p = { startDate: '2024-01-01', endDate: '2024-12-31', completedDate: '2024-12-31' };
  assert.equal(_projectOverlapsRange(p, range.start, range.end), false);
});

test('_projectOverlapsRange: project without startDate returns false', () => {
  const range = { start: new Date('2026-01-01T00:00:00'), end: new Date('2026-12-31T23:59:59') };
  assert.equal(_projectOverlapsRange({ name: 'no dates' }, range.start, range.end), false);
});

test('_projectOverlapsRange: monthly filter includes long-running project', () => {
  const range = { start: new Date('2026-07-01T00:00:00'), end: new Date('2026-07-31T23:59:59') };
  const p = { startDate: '2026-03-01', endDate: '2026-12-31' };
  assert.equal(_projectOverlapsRange(p, range.start, range.end), true);
});

test('_projectOverlapsRange: monthly filter excludes project that ends before period', () => {
  const range = { start: new Date('2026-07-01T00:00:00'), end: new Date('2026-07-31T23:59:59') };
  const p = { startDate: '2026-01-01', endDate: '2026-06-30' };
  assert.equal(_projectOverlapsRange(p, range.start, range.end), false);
});

test('_projectOverlapsRange: falls back to _createdAt when no startDate', () => {
  const range = { start: new Date('2026-01-01T00:00:00'), end: new Date('2026-12-31T23:59:59') };
  const p = { _createdAt: '2026-06-01', endDate: '2026-08-01' };
  assert.equal(_projectOverlapsRange(p, range.start, range.end), true);
});

// ── Tests: settings dropdown merge ──────────────────────────────────────────

test('settings merge (has local edits): local dropdowns win when both have equal _adminPushedAt', () => {
  const remote = { dropdowns: { doc_status: ['draft', 'approved'], _adminPushedAt: 1000 } };
  const local = { dropdowns: { doc_status: ['draft', 'approved', 'MyEdit'], _adminPushedAt: 1000 } };
  const merged = _settingsMergeHasLocalEdits(remote, local);
  assert.deepEqual(merged.dropdowns.doc_status, ['draft', 'approved', 'MyEdit']);
});

test('settings merge (has local edits): remote dropdowns win when remote _adminPushedAt is newer', () => {
  const remote = { dropdowns: { doc_status: ['draft', 'approved'], _adminPushedAt: 2000 } };
  const local = { dropdowns: { doc_status: ['MyStale'], _adminPushedAt: 1000 } };
  const merged = _settingsMergeHasLocalEdits(remote, local);
  assert.deepEqual(merged.dropdowns.doc_status, ['draft', 'approved']);
});

test('settings merge (has local edits): local dropdowns win with newer _adminPushedAt (admin edit bug repro)', () => {
  // Regression: commit ebd6899 fixed this — _adminPushedAt bump on _setDropdown
  const remote = { dropdowns: { doc_status: ['draft', 'approved'], _adminPushedAt: 1000 } };
  const local = { dropdowns: { doc_status: ['draft', 'approved', 'JustTyped'], _adminPushedAt: 2000 } };
  const merged = _settingsMergeHasLocalEdits(remote, local);
  assert.deepEqual(merged.dropdowns.doc_status, ['draft', 'approved', 'JustTyped']);
});

test('settings merge (no local edits): local dropdowns preserved when local _adminPushedAt is newer', () => {
  // Regression: commit 4de3011 added this guard — the branch used to do a
  // wholesale replace regardless of timestamps.
  const remote = { settings: { dropdowns: { doc_status: ['draft', 'approved'], _adminPushedAt: 1000 } } };
  const local  = { settings: { dropdowns: { doc_status: ['draft', 'approved', 'JustTyped'], _adminPushedAt: 2000 } } };
  const merged = _settingsMergeNoLocalEdits(remote, local);
  assert.deepEqual(merged.settings.dropdowns.doc_status, ['draft', 'approved', 'JustTyped']);
});

test('settings merge (no local edits): remote wins when remote _adminPushedAt is strictly newer', () => {
  const remote = { settings: { dropdowns: { doc_status: ['fresh'], _adminPushedAt: 3000 } } };
  const local  = { settings: { dropdowns: { doc_status: ['old'], _adminPushedAt: 1000 } } };
  const merged = _settingsMergeNoLocalEdits(remote, local);
  assert.deepEqual(merged.settings.dropdowns.doc_status, ['fresh']);
});

// ── Tests: _spMergeArrays ───────────────────────────────────────────────────

test('_spMergeArrays: empty local + empty remote → empty', () => {
  assert.deepEqual(_spMergeArrays([], [], false), []);
});

test('_spMergeArrays: remote-only record survives', () => {
  const result = _spMergeArrays([], [{ id: 'R1', name: 'Remote' }], false);
  assert.deepEqual(result, [{ id: 'R1', name: 'Remote' }]);
});

test('_spMergeArrays: local-only record survives', () => {
  const result = _spMergeArrays([{ id: 'L1', name: 'Local' }], [], true);
  assert.deepEqual(result, [{ id: 'L1', name: 'Local' }]);
});

test('_spMergeArrays: newer _mAt wins the field values', () => {
  const local = [{ id: 'X', name: 'Local newer', _mAt: '2026-07-08T10:00:00' }];
  const remote = [{ id: 'X', name: 'Remote older', _mAt: '2026-07-07T09:00:00' }];
  const result = _spMergeArrays(local, remote, false);
  assert.equal(result[0].name, 'Local newer');
});

test('_spMergeArrays: remote wins when remote _mAt is newer even with localEdited=true', () => {
  const local = [{ id: 'X', name: 'Local stale', _mAt: '2026-07-01' }];
  const remote = [{ id: 'X', name: 'Remote fresh', _mAt: '2026-07-08' }];
  const result = _spMergeArrays(local, remote, true);
  assert.equal(result[0].name, 'Remote fresh');
});

test('_spMergeArrays: falls back to localEdited flag when both records lack _mAt', () => {
  const local = [{ id: 'X', name: 'Local no ts' }];
  const remote = [{ id: 'X', name: 'Remote no ts' }];
  assert.equal(_spMergeArrays(local, remote, true)[0].name, 'Local no ts');
  assert.equal(_spMergeArrays(local, remote, false)[0].name, 'Remote no ts');
});

test('_spMergeArrays: locally deleted records are dropped from remote result', () => {
  const wasDeleted = id => id === 'GONE';
  const result = _spMergeArrays(
    [],
    [{ id: 'GONE', name: 'Deleted' }, { id: 'KEEP', name: 'Kept' }],
    false,
    wasDeleted
  );
  assert.equal(result.length, 1);
  assert.equal(result[0].id, 'KEEP');
});

test('_spMergeArrays: append-only sub-arrays (updates) union without duplicates', () => {
  const local = [{
    id: 'T1', name: 'Task',
    updates: [{ at: '2026-07-01', text: 'first' }, { at: '2026-07-03', text: 'third' }],
    _mAt: '2026-07-08'
  }];
  const remote = [{
    id: 'T1', name: 'Task',
    updates: [{ at: '2026-07-01', text: 'first' }, { at: '2026-07-02', text: 'second' }],
    _mAt: '2026-07-07'
  }];
  const result = _spMergeArrays(local, remote, false);
  assert.equal(result[0].updates.length, 3);
  assert.deepEqual(result[0].updates.map(u => u.at), ['2026-07-01', '2026-07-02', '2026-07-03']);
});

test('_spMergeAppendArrays: donor with no append fields returns base unchanged', () => {
  const base = { id: 'X', name: 'Base' };
  const donor = { id: 'X', name: 'Donor' };
  const result = _spMergeAppendArrays(base, donor);
  assert.equal(result, base);
});
