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
});

// ── Route registration ────────────────────────────────────
await app.register(warehouseItems, { prefix: '/api/warehouse-items' });

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
