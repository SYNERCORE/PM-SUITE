// ProMaster local API — Fastify 5 + Postgres 16
// Handles auth via Microsoft 365 (Azure AD) JWT verification.
// Routes are registered per-entity in routes/*.js.

import Fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

import { pool } from './db.js';
import { verifyAzureToken, signLanPass, verifyLanPass, setLanSecret } from './auth.js';
import warehouseItems from './routes/warehouseItems.js';
import { makeEntityRoutes } from './routes/_entityRoutes.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ── Load .env manually so we don't need dotenv ───────────────
const envPath = path.join(__dirname, '.env');
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}

// ── LAN pass secret + revocations ────────────────────────────
// The server signs its own offline session tokens with this secret. Prefer
// SESSION_SECRET from .env; otherwise generate one and persist it to
// session.key so it survives restarts with zero manual setup. Keep this file
// admin-readable only.
const OFFLINE_PASS_DAYS = Number(process.env.OFFLINE_PASS_DAYS || 14);
(function initLanSecret() {
  let secret = process.env.SESSION_SECRET || '';
  if (!secret) {
    const keyPath = path.join(__dirname, 'session.key');
    try {
      if (fs.existsSync(keyPath)) secret = fs.readFileSync(keyPath, 'utf8').trim();
      if (!secret) { secret = crypto.randomBytes(48).toString('hex'); fs.writeFileSync(keyPath, secret, { mode: 0o600 }); }
    } catch (e) { secret = crypto.randomBytes(48).toString('hex'); } // last resort: in-memory only
  }
  setLanSecret(new TextEncoder().encode(secret));
})();

// Revocation: passes issued for an email BEFORE its revocation time are rejected.
// Stored as { email: unixSeconds } in revocations.json (no DB migration needed).
const _revPath = path.join(__dirname, 'revocations.json');
let _revocations = {};
try { if (fs.existsSync(_revPath)) _revocations = JSON.parse(fs.readFileSync(_revPath, 'utf8') || '{}'); } catch (e) {}
function _isRevoked(email, iatSeconds) {
  const cut = _revocations[String(email || '').toLowerCase()];
  return !!(cut && iatSeconds && iatSeconds < cut);
}
function _revoke(email) {
  _revocations[String(email || '').toLowerCase()] = Math.floor(Date.now() / 1000);
  try { fs.writeFileSync(_revPath, JSON.stringify(_revocations), { mode: 0o600 }); } catch (e) {}
}

const app = Fastify({
  logger: { level: process.env.LOG_LEVEL || 'info' },
  trustProxy: true,
});

// ── Keep the API alive through transient outbound network errors ──────
// The Azure AD JWKS fetch (auth.js) is an outbound TLS request. On this
// LAN server the internet to Microsoft can blip mid-request; the reset
// socket emits an 'error' event ASYNCHRONOUSLY, outside the try/catch
// around verifyAzureToken. Node's default for an unhandled 'error' event
// is to throw and kill the process — which took the whole API down and
// 500'd every in-flight write. Here we log such errors and, for known
// transient network codes, stay up (the next request re-tries, and once
// the JWKS is cached in memory most requests never touch the network at
// all). Anything genuinely unexpected we log and exit(1) so NSSM restarts
// from a clean state rather than limping on in an unknown one.
const TRANSIENT_NET = new Set([
  'ECONNRESET', 'ETIMEDOUT', 'EAI_AGAIN', 'ENOTFOUND', 'ECONNREFUSED',
  'EPIPE', 'ECONNABORTED', 'UND_ERR_SOCKET', 'UND_ERR_CONNECT_TIMEOUT',
]);
function isTransientNet(err) {
  const code = err && (err.code || (err.cause && err.cause.code));
  return TRANSIENT_NET.has(code);
}
process.on('uncaughtException', (err) => {
  if (isTransientNet(err)) {
    app.log.warn({ code: err.code || err.cause?.code, msg: err.message },
      'transient outbound network error — API staying up');
    return;
  }
  app.log.error({ err }, 'uncaughtException — exiting for a clean restart');
  process.exit(1);
});
process.on('unhandledRejection', (err) => {
  if (isTransientNet(err)) {
    app.log.warn({ code: err?.code || err?.cause?.code, msg: err?.message },
      'transient outbound network rejection — ignored');
    return;
  }
  app.log.error({ err }, 'unhandledRejection');
});

await app.register(helmet, { contentSecurityPolicy: false });
await app.register(cors, {
  origin: (process.env.CORS_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean),
  credentials: true,
});

// Chrome Private Network Access preflight — allows browsers that
// loaded the app from a public origin (SharePoint / GitHub Pages) to
// fetch this LAN server. Without this the browser rejects the request
// with 'Failed to fetch' before the CORS layer even runs.
app.addHook('onSend', async (req, reply, payload) => {
  reply.header('Access-Control-Allow-Private-Network', 'true');
  return payload;
});
await app.register(rateLimit, {
  max: 600,
  timeWindow: '1 minute',
  hook: 'preHandler',
});

// ── Health check — no auth required so IT can smoke-test ───
app.get('/health', async () => {
  let dbStatus = 'unknown';
  try { await pool.query('SELECT 1'); dbStatus = 'connected'; }
  catch (e) { dbStatus = 'error: ' + e.message; }
  return { status: 'ok', db: dbStatus, version: '0.1.0', ts: new Date().toISOString() };
});

// ── Auth guard for everything under /api ───────────────────
app.addHook('preHandler', async (req, reply) => {
  if (!req.url.startsWith('/api/')) return;
  const auth = req.headers.authorization || '';
  const m = auth.match(/^Bearer\s+(.+)$/i);
  if (!m) return reply.code(401).send({ error: 'missing bearer token' });
  // Try the LAN pass FIRST — it validates locally with no internet, so a device
  // that signed in days ago keeps working through an outage. Fall back to a live
  // Microsoft token (needs cached/online JWKS) for the sign-in/exchange path.
  try {
    req.user = await verifyLanPass(m[1], _isRevoked);
  } catch (eLan) {
    try {
      req.user = await verifyAzureToken(m[1]);
    } catch (eM365) {
      req.log.warn({ lan: eLan.message, m365: eM365.message }, 'token verification failed');
      return reply.code(401).send({ error: 'invalid token' });
    }
  }
  // Upsert the user so FK constraints (created_by / updated_by) always resolve.
  // Cheap: one INSERT ... ON CONFLICT per request; Postgres treats a duplicate
  // as a no-op after the first successful insert.
  try {
    const email = req.user?.email;
    if (email) {
      await pool.query(
        `INSERT INTO users (email, name, last_seen_at)
         VALUES ($1, $2, NOW())
         ON CONFLICT (email) DO UPDATE
           SET name = COALESCE(EXCLUDED.name, users.name),
               last_seen_at = NOW()`,
        [email, req.user.name || email]
      );
    }
  } catch (e) {
    req.log.warn({ err: e.message }, 'user upsert failed');
    // Don't 500 — let the route try; if it needs the FK it'll fail with a clearer error
  }
});

// ── Admin check: explicit allowlist (ADMIN_EMAILS in .env) or users.role ──
const ADMIN_EMAILS = (process.env.ADMIN_EMAILS || '').split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
async function _isAdminEmail(email) {
  const e = String(email || '').toLowerCase();
  if (!e) return false;
  if (ADMIN_EMAILS.includes(e)) return true;
  try {
    const { rows } = await pool.query('SELECT role FROM users WHERE lower(email)=lower($1)', [e]);
    return !!(rows[0] && ['admin', 'manager'].includes(rows[0].role));
  } catch (err) { return false; }
}

// ── Offline session (LAN pass) endpoints ──────────────────────────────
// exchange: a live Microsoft sign-in (online) → a LAN pass valid OFFLINE_PASS_DAYS.
// A LAN pass cannot renew itself here — renewal requires a fresh Microsoft
// sign-in, which enforces periodic re-validation against Microsoft.
app.post('/api/session/exchange', async (req, reply) => {
  if (req.user?.viaLanPass) return reply.code(403).send({ error: 'sign in with Microsoft to get or renew an offline pass' });
  const isAdmin = await _isAdminEmail(req.user.email);
  const pass = await signLanPass(
    { email: req.user.email, name: req.user.name, oid: req.user.oid, isAdmin, role: isAdmin ? 'admin' : 'user' },
    OFFLINE_PASS_DAYS, true);
  return { pass, days: OFFLINE_PASS_DAYS, email: req.user.email, isAdmin };
});

// issue-for: an admin (online) pre-issues a pass for another user, so a brand-new
// device can work through an outage without that user ever signing in online first.
app.post('/api/session/issue-for', async (req, reply) => {
  if (!(await _isAdminEmail(req.user.email))) return reply.code(403).send({ error: 'admin only' });
  const email = (req.body && req.body.email || '').trim();
  const name = (req.body && req.body.name || '').trim();
  if (!email) return reply.code(400).send({ error: 'email required' });
  try {
    await pool.query(`INSERT INTO users (email, name, last_seen_at) VALUES ($1, $2, NOW())
      ON CONFLICT (email) DO UPDATE SET name = COALESCE(EXCLUDED.name, users.name)`, [email, name || email]);
  } catch (e) {}
  const isAdmin = await _isAdminEmail(email);
  const pass = await signLanPass({ email, name: name || email, oid: email, isAdmin, role: isAdmin ? 'admin' : 'user' }, OFFLINE_PASS_DAYS, false);
  req.log.info({ by: req.user.email, for: email }, 'admin pre-issued offline pass');
  return { pass, days: OFFLINE_PASS_DAYS, email };
});

// revoke: an admin cuts off a user — every pass issued before now is rejected.
app.post('/api/session/revoke', async (req, reply) => {
  if (!(await _isAdminEmail(req.user.email))) return reply.code(403).send({ error: 'admin only' });
  const email = (req.body && req.body.email || '').trim();
  if (!email) return reply.code(400).send({ error: 'email required' });
  _revoke(email);
  req.log.warn({ by: req.user.email, revoked: email }, 'admin revoked offline passes');
  return { ok: true, revoked: email };
});

// whoami: how the server sees the caller (handy for validating offline mode).
app.get('/api/session/whoami', async (req) => {
  return { email: req.user.email, name: req.user.name, isAdmin: !!req.user.isAdmin, viaLanPass: !!req.user.viaLanPass, exp: req.user.exp || null };
});

// ── Route registration ────────────────────────────────────
await app.register(warehouseItems, { prefix: '/api/warehouse-items' });
await app.register(makeEntityRoutes({ table: 'projects',    entityName: 'projects',    filters: [{ query: 'status', column: 'status' }] }), { prefix: '/api/projects' });
await app.register(makeEntityRoutes({ table: 'tasks',       entityName: 'tasks',       hasProjectId: true, filters: [{ query: 'status', column: 'status' }] }), { prefix: '/api/tasks' });
await app.register(makeEntityRoutes({ table: 'resources',   entityName: 'resources',   filters: [{ query: 'type', column: 'res_type' }] }), { prefix: '/api/resources' });
await app.register(makeEntityRoutes({ table: 'procurement', entityName: 'procurement', hasProjectId: true, filters: [{ query: 'status', column: 'po_status' }] }), { prefix: '/api/procurement' });
await app.register(makeEntityRoutes({ table: 'costs',       entityName: 'costs',       hasProjectId: true, filters: [{ query: 'category', column: 'cost_category' }] }), { prefix: '/api/costs' });
await app.register(makeEntityRoutes({ table: 'qaqc',        entityName: 'qaqc',        hasProjectId: true }), { prefix: '/api/qaqc' });
await app.register(makeEntityRoutes({ table: 'risks',       entityName: 'risks',       hasProjectId: true }), { prefix: '/api/risks' });
await app.register(makeEntityRoutes({ table: 'actions',     entityName: 'actions',     hasProjectId: true }), { prefix: '/api/actions' });
await app.register(makeEntityRoutes({ table: 'documents',   entityName: 'documents',   hasProjectId: true }), { prefix: '/api/documents' });
await app.register(makeEntityRoutes({ table: 'stock_transactions', entityName: 'stockTransactions', hasProjectId: true, extraCols: [{ column: 'item_id', dataKey: 'itemId' }], filters: [{ query: 'type', column: 'tx_type' }] }), { prefix: '/api/stock-transactions' });

// Batch 4 — the cost chain behind Cost Control's figures
await app.register(makeEntityRoutes({ table: 'resource_allocations', entityName: 'resourceAllocations', hasProjectId: true, filters: [{ query: 'type', column: 'resource_type' }, { query: 'status', column: 'alloc_status' }] }), { prefix: '/api/resource-allocations' });
await app.register(makeEntityRoutes({ table: 'resource_usage_logs', entityName: 'resourceUsageLogs', hasProjectId: true, extraCols: [{ column: 'allocation_id', dataKey: 'allocationId' }], filters: [{ query: 'type', column: 'tx_type' }, { query: 'allocationId', column: 'allocation_id' }] }), { prefix: '/api/resource-usage-logs' });
await app.register(makeEntityRoutes({ table: 'manpower',    entityName: 'manpower',    hasProjectId: true, filters: [{ query: 'trade', column: 'trade' }] }), { prefix: '/api/manpower' });
await app.register(makeEntityRoutes({ table: 'procurement_logs', entityName: 'procurementLogs', extraCols: [{ column: 'proc_id', dataKey: 'procId' }], filters: [{ query: 'procId', column: 'proc_id' }] }), { prefix: '/api/procurement-logs' });
await app.register(makeEntityRoutes({ table: 'issuance_requests', entityName: 'issuanceRequests', hasProjectId: true, extraCols: [{ column: 'item_id', dataKey: 'itemId' }], filters: [{ query: 'status', column: 'req_status' }] }), { prefix: '/api/issuance-requests' });

// ── Batch 5 — Item Master inventory pools ──
await app.register(makeEntityRoutes({ table: 'equipment',   entityName: 'equipment',   hasProjectId: true, filters: [{ query: 'status', column: 'eq_status' }, { query: 'category', column: 'category' }] }), { prefix: '/api/equipment' });
await app.register(makeEntityRoutes({ table: 'tools',       entityName: 'tools',       hasProjectId: true, filters: [{ query: 'status', column: 'tool_status' }, { query: 'category', column: 'category' }] }), { prefix: '/api/tools' });
await app.register(makeEntityRoutes({ table: 'vehicles',    entityName: 'vehicles',    hasProjectId: true, filters: [{ query: 'status', column: 'veh_status' }, { query: 'category', column: 'category' }] }), { prefix: '/api/vehicles' });
await app.register(makeEntityRoutes({ table: 'consumables', entityName: 'consumables', filters: [{ query: 'category', column: 'category' }] }), { prefix: '/api/consumables' });
await app.register(makeEntityRoutes({ table: 'materials',   entityName: 'materials',   hasProjectId: true, filters: [{ query: 'status', column: 'mat_status' }, { query: 'category', column: 'category' }] }), { prefix: '/api/materials' });

// ── Batch 6 — reference masters, project sub-records, and logs ──
await app.register(makeEntityRoutes({ table: 'warehouse_locations', entityName: 'warehouseLocations', filters: [{ query: 'type', column: 'loc_type' }] }), { prefix: '/api/warehouse-locations' });
await app.register(makeEntityRoutes({ table: 'progress',           entityName: 'progress',           hasProjectId: true }), { prefix: '/api/progress' });
await app.register(makeEntityRoutes({ table: 'kpi_data',           entityName: 'kpiData',            hasProjectId: true }), { prefix: '/api/kpi-data' });
await app.register(makeEntityRoutes({ table: 'calendar',           entityName: 'calendar',           hasProjectId: true, filters: [{ query: 'type', column: 'event_type' }] }), { prefix: '/api/calendar' });
await app.register(makeEntityRoutes({ table: 'asset_history',      entityName: 'assetHistory',       extraCols: [{ column: 'asset_id', dataKey: 'assetId' }], filters: [{ query: 'assetId', column: 'asset_id' }] }), { prefix: '/api/asset-history' });
await app.register(makeEntityRoutes({ table: 'asset_utilization',  entityName: 'assetUtilization',   extraCols: [{ column: 'asset_id', dataKey: 'assetId' }], filters: [{ query: 'assetId', column: 'asset_id' }] }), { prefix: '/api/asset-utilization' });
await app.register(makeEntityRoutes({ table: 'third_party',        entityName: 'thirdParty',         filters: [{ query: 'status', column: 'tp_status' }, { query: 'category', column: 'category' }] }), { prefix: '/api/third-party' });
await app.register(makeEntityRoutes({ table: 'project_team',       entityName: 'projectTeam',        hasProjectId: true }), { prefix: '/api/project-team' });
await app.register(makeEntityRoutes({ table: 'trades',             entityName: 'trades' }), { prefix: '/api/trades' });
await app.register(makeEntityRoutes({ table: 'business_units',     entityName: 'businessUnits' }), { prefix: '/api/business-units' });
await app.register(makeEntityRoutes({ table: 'daily_meeting_logs', entityName: 'dailyMeetingLogs',   hasProjectId: true, filters: [{ query: 'status', column: 'log_status' }] }), { prefix: '/api/daily-meeting-logs' });
await app.register(makeEntityRoutes({ table: 'library_docs',       entityName: 'libraryDocs',        filters: [{ query: 'status', column: 'doc_status' }, { query: 'category', column: 'category' }] }), { prefix: '/api/library-docs' });

// ── Start ─────────────────────────────────────────────────
const port = Number(process.env.PORT || 3000);
try {
  await app.listen({ port, host: '127.0.0.1' });
  app.log.info(`ProMaster API listening on ${port}`);
} catch (err) {
  app.log.error(err);
  process.exit(1);
}

// Graceful shutdown so systemd/NSSM can restart us cleanly.
for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, async () => {
    app.log.info(`received ${sig}, shutting down`);
    await app.close();
    await pool.end();
    process.exit(0);
  });
}
