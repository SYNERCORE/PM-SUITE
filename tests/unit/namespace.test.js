/**
 * Unit tests for the SHIC namespace facade — collision defense +
 * devtools ergonomics for app-owned modules.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const src = readFileSync(path.join(__dirname, '..', '..', 'src', 'js', 'lib', 'namespace.js'), 'utf8');

function loadNamespace(extraGlobals = {}) {
  const window = {};
  const sandbox = { window, ...extraGlobals, console: { error() {} } };
  const wrapped = `with (sandbox) { ${src}; return window.SHIC; }`;
  return new Function('sandbox', wrapped)(sandbox);
}

test('SHIC namespace exists after loading', () => {
  const SHIC = loadNamespace();
  assert.equal(typeof SHIC, 'object');
  assert.equal(typeof SHIC.register, 'function');
  assert.equal(typeof SHIC.list, 'function');
});

test('SHIC.register adds a module', () => {
  const SHIC = loadNamespace();
  const mod = { hello: 'world' };
  SHIC.register('MyModule', mod);
  assert.equal(SHIC.MyModule, mod);
});

test('SHIC.register throws on collision with a different object', () => {
  const SHIC = loadNamespace();
  SHIC.register('MyModule', { a: 1 });
  assert.throws(() => SHIC.register('MyModule', { b: 2 }), /already registered/);
});

test('SHIC.register is idempotent when re-registering the same object', () => {
  const SHIC = loadNamespace();
  const mod = { a: 1 };
  SHIC.register('MyModule', mod);
  assert.doesNotThrow(() => SHIC.register('MyModule', mod));
});

test('SHIC.list omits register/list themselves', () => {
  const SHIC = loadNamespace();
  SHIC.register('Alpha', {});
  SHIC.register('Bravo', {});
  const modules = SHIC.list();
  assert.deepEqual(modules, ['Alpha', 'Bravo']);
});

test('SHIC adopts already-loaded lib globals', () => {
  const Store = { name: 'store' };
  const Audit = { name: 'audit' };
  const SHIC = loadNamespace({ Store, Audit });
  assert.equal(SHIC.Store, Store);
  assert.equal(SHIC.Audit, Audit);
});

test('SHIC.register requires a name', () => {
  const SHIC = loadNamespace();
  assert.throws(() => SHIC.register(null, {}), /name required/);
  assert.throws(() => SHIC.register('', {}), /name required/);
});
