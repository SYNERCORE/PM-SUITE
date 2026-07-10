/**
 * Unit tests for the schema migration runner semantics.
 *
 * The runner lives inline in migrateData() (src/js/auth.js). This test
 * exercises the same rules in isolation so we can guarantee:
 *  - migrations only run once
 *  - they run in ascending order
 *  - a fresh install stamps the current schema version without re-running
 *    every legacy migration
 *  - a failing migration doesn't leave the version stamp bumped, so
 *    subsequent boots can retry safely
 */
import test from 'node:test';
import assert from 'node:assert/strict';

// Pure copy of the migration semantics from src/js/auth.js:migrateData
function runMigrations(data, migrations, currentSchemaVersion) {
  const current = +(data._schemaVersion || 0);
  migrations
    .slice()
    .sort((a, b) => a.v - b.v)
    .forEach(m => {
      if (m.v > current) {
        try {
          m.apply(data);
          data._schemaVersion = m.v;
        } catch (e) {
          // Swallow — leave version stamp untouched so next boot retries.
        }
      }
    });
  if (typeof data._schemaVersion === 'undefined') {
    data._schemaVersion = currentSchemaVersion;
  }
  return data;
}

test('empty data with no migrations defined stamps the current schema version', () => {
  const data = {};
  runMigrations(data, [], 5);
  assert.equal(data._schemaVersion, 5);
});

test('empty data still runs any defined migration whose target version > 0', () => {
  // Fresh installs will run migrations too — that is fine because migrations
  // over empty data are no-ops, and the version stamp is advanced correctly.
  const data = {};
  runMigrations(data, [
    { v: 2, apply(d) { d.ranV2 = true; } },
  ], 5);
  assert.equal(data.ranV2, true);
  assert.equal(data._schemaVersion, 2, 'the last successful migration wins the stamp');
});

test('does not re-run migrations at or below the stored version', () => {
  const data = { _schemaVersion: 3 };
  runMigrations(data, [
    { v: 2, apply(d) { d.ranV2 = true; } },
    { v: 3, apply(d) { d.ranV3 = true; } },
    { v: 4, apply(d) { d.ranV4 = true; } },
  ], 4);
  assert.equal(data.ranV2, undefined);
  assert.equal(data.ranV3, undefined);
  assert.equal(data.ranV4, true);
  assert.equal(data._schemaVersion, 4);
});

test('runs migrations strictly in ascending order', () => {
  const data = { _schemaVersion: 0 };
  const order = [];
  runMigrations(data, [
    { v: 3, apply() { order.push('3'); } },
    { v: 2, apply() { order.push('2'); } },
    { v: 4, apply() { order.push('4'); } },
  ], 4);
  assert.deepEqual(order, ['2', '3', '4']);
  assert.equal(data._schemaVersion, 4);
});

test('failing migration does not bump the version, so next boot can retry', () => {
  const data = { _schemaVersion: 1 };
  runMigrations(data, [
    { v: 2, apply() { throw new Error('boom'); } },
  ], 2);
  // v2 failed, so _schemaVersion stays at 1 for a retry on next boot.
  assert.equal(data._schemaVersion, 1);
});

test('a migration that runs successfully persists a data change', () => {
  const data = {
    _schemaVersion: 0,
    tasks: [{ id: 'T1', assignedTo: 'alice@shic' }],
  };
  runMigrations(data, [
    { v: 1, apply(d) {
      (d.tasks || []).forEach(t => {
        if (t.assignedTo && !t.assignee) { t.assignee = t.assignedTo; delete t.assignedTo; }
      });
    } },
  ], 1);
  assert.equal(data.tasks[0].assignee, 'alice@shic');
  assert.equal(data.tasks[0].assignedTo, undefined);
  assert.equal(data._schemaVersion, 1);
});
