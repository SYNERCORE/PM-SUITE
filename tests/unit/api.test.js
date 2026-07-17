/**
 * Unit tests for the Api facade — the client that talks to the local
 * ProMaster server (deploy/). Verifies URL shape, auth header, and
 * the { items } unwrap for list responses.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const src = readFileSync(path.join(__dirname, '..', '..', 'src', 'js', 'lib', 'api.js'), 'utf8');

function loadApi(fetchImpl) {
  const sandbox = { fetch: fetchImpl };
  const wrapped = `with (sandbox) { ${src}; return Api; }`;
  return new Function('sandbox', wrapped)(sandbox);
}

function mockFetch(handler) {
  const calls = [];
  const fetchImpl = async (url, init = {}) => {
    calls.push({ url, init });
    const res = await handler(url, init);
    return {
      ok: res.status < 400,
      status: res.status,
      statusText: res.statusText || '',
      json: async () => res.body,
      text: async () => JSON.stringify(res.body),
    };
  };
  fetchImpl.calls = calls;
  return fetchImpl;
}

test('Api.enabled false until configured', () => {
  const Api = loadApi(mockFetch(() => ({ status: 200, body: {} })));
  assert.equal(Api.enabled(), false);
  Api.configure({ baseUrl: 'https://x.local', getToken: () => 't' });
  assert.equal(Api.enabled(), true);
});

test('Api.configure strips trailing slashes', async () => {
  const fetchImpl = mockFetch(() => ({ status: 200, body: { items: [] } }));
  const Api = loadApi(fetchImpl);
  Api.configure({ baseUrl: 'https://x.local/', getToken: () => 't' });
  await Api.list('projects');
  assert.equal(fetchImpl.calls[0].url, 'https://x.local/api/projects');
});

test('Api.list camelCase entity becomes kebab-case URL', async () => {
  const fetchImpl = mockFetch(() => ({ status: 200, body: { items: [{ id: 'X' }] } }));
  const Api = loadApi(fetchImpl);
  Api.configure({ baseUrl: 'https://x.local', getToken: () => 't' });
  const rows = await Api.list('warehouseItems');
  assert.equal(fetchImpl.calls[0].url, 'https://x.local/api/warehouse-items');
  assert.deepEqual(rows, [{ id: 'X' }]);
});

test('Api.list forwards query params', async () => {
  const fetchImpl = mockFetch(() => ({ status: 200, body: { items: [] } }));
  const Api = loadApi(fetchImpl);
  Api.configure({ baseUrl: 'https://x.local', getToken: () => 't' });
  await Api.list('projects', { limit: 50, since: '2026-01-01' });
  assert.match(fetchImpl.calls[0].url, /limit=50/);
  assert.match(fetchImpl.calls[0].url, /since=2026-01-01/);
});

test('Api sends Authorization: Bearer with the token', async () => {
  const fetchImpl = mockFetch(() => ({ status: 200, body: { items: [] } }));
  const Api = loadApi(fetchImpl);
  Api.configure({ baseUrl: 'https://x.local', getToken: async () => 'TOKEN_XYZ' });
  await Api.list('projects');
  assert.equal(fetchImpl.calls[0].init.headers.Authorization, 'Bearer TOKEN_XYZ');
});

test('Api.get returns null on 404', async () => {
  const fetchImpl = mockFetch(() => ({ status: 404, statusText: 'Not Found', body: {} }));
  const Api = loadApi(fetchImpl);
  Api.configure({ baseUrl: 'https://x.local', getToken: () => 't' });
  const r = await Api.get('projects', 'nope');
  assert.equal(r, null);
});

test('Api.put sends JSON body with PUT method', async () => {
  const fetchImpl = mockFetch(() => ({ status: 200, body: { ok: true, id: 'X' } }));
  const Api = loadApi(fetchImpl);
  Api.configure({ baseUrl: 'https://x.local', getToken: () => 't' });
  await Api.put('projects', 'X', { name: 'hello' });
  assert.equal(fetchImpl.calls[0].init.method, 'PUT');
  assert.equal(fetchImpl.calls[0].init.body, '{"name":"hello"}');
});

test('Api.remove sends DELETE', async () => {
  const fetchImpl = mockFetch(() => ({ status: 200, body: { ok: true, changed: 1 } }));
  const Api = loadApi(fetchImpl);
  Api.configure({ baseUrl: 'https://x.local', getToken: () => 't' });
  const r = await Api.remove('projects', 'X');
  assert.equal(fetchImpl.calls[0].init.method, 'DELETE');
  assert.deepEqual(r, { ok: true, changed: 1 });
});

test('Api.health hits /health without an Authorization header', async () => {
  const fetchImpl = mockFetch(() => ({ status: 200, body: { status: 'ok', db: 'connected' } }));
  const Api = loadApi(fetchImpl);
  Api.configure({ baseUrl: 'https://x.local', getToken: () => 't' });
  const r = await Api.health();
  assert.equal(fetchImpl.calls[0].url, 'https://x.local/health');
  // Health is public — no Authorization header should have been added
  assert.equal(fetchImpl.calls[0].init.headers, undefined);
  assert.equal(r.status, 'ok');
});

test('Api surfaces network failure as Api unreachable', async () => {
  const fetchImpl = async () => { throw new Error('ENOTFOUND'); };
  const Api = loadApi(fetchImpl);
  Api.configure({ baseUrl: 'https://x.local', getToken: () => 't' });
  await assert.rejects(() => Api.list('projects'), /Api unreachable/);
});
