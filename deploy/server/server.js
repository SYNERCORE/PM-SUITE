// ProMaster local API — Fastify 5 + Postgres 16
// Handles auth via Microsoft 365 (Azure AD) JWT verification.
// Routes are registered per-entity in routes/*.js.

import Fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { pool } from './db.js';
import { verifyAzureToken } from './auth.js';
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

const app = Fastify({
  logger: { level: process.env.LOG_LEVEL || 'info' },
  trustProxy: true,
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
  try {
    req.user = await verifyAzureToken(m[1]);
  } catch (e) {
    req.log.warn({ err: e.message }, 'token verification failed');
    return reply.code(401).send({ error: 'invalid token' });
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

// ── Route registration ────────────────────────────────────
await app.register(warehouseItems, { prefix: '/api/warehouse-items' });
await app.register(makeEntityRoutes({ table: 'projects',    entityName: 'projects',    filters: [{ query: 'status', column: 'status' }] }), { prefix: '/api/projects' });
await app.register(makeEntityRoutes({ table: 'tasks',       entityName: 'tasks',       hasProjectId: true, filters: [{ query: 'status', column: 'status' }] }), { prefix: '/api/tasks' });
await app.register(makeEntityRoutes({ table: 'resources',   entityName: 'resources',   filters: [{ query: 'type', column: 'res_type' }] }), { prefix: '/api/resources' });
await app.register(makeEntityRoutes({ table: 'procurement', entityName: 'procurement', hasProjectId: true, filters: [{ query: 'status', column: 'po_status' }] }), { prefix: '/api/procurement' });
await app.register(makeEntityRoutes({ table: 'costs',       entityName: 'costs',       hasProjectId: true, filters: [{ query: 'category', column: 'cost_category' }] }), { prefix: '/api/costs' });

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
