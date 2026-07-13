// Reference route — the pattern every other entity route follows.
// Copy this file, rename table + endpoint, adjust filters.

import { pool } from '../db.js';

const MAX = () => Number(process.env.MAX_PAGE_SIZE || 500);

export default async function routes(app) {
  // GET /api/warehouse-items
  app.get('/', async (req, reply) => {
    const limit  = Math.min(Number(req.query.limit) || 100, MAX());
    const offset = Number(req.query.offset) || 0;
    const includeDeleted = req.query.includeDeleted === 'true';

    const where = [];
    const args = [];
    if (!includeDeleted) where.push('deleted = FALSE');
    if (req.query.category) {
      args.push(req.query.category);
      where.push(`category = $${args.length}`);
    }
    if (req.query.since) {
      args.push(req.query.since);
      where.push(`updated_at > $${args.length}`);
    }
    const clause = where.length ? 'WHERE ' + where.join(' AND ') : '';

    args.push(limit, offset);
    const { rows } = await pool.query(
      `SELECT id, data, updated_at
       FROM warehouse_items ${clause}
       ORDER BY updated_at DESC
       LIMIT $${args.length - 1} OFFSET $${args.length}`,
      args
    );
    return { items: rows, limit, offset };
  });

  // GET /api/warehouse-items/:id
  app.get('/:id', async (req, reply) => {
    const { rows } = await pool.query(
      `SELECT id, data, updated_at FROM warehouse_items WHERE id = $1`,
      [req.params.id]
    );
    if (!rows[0]) return reply.code(404).send({ error: 'not found' });
    return rows[0];
  });

  // PUT /api/warehouse-items/:id  (upsert — the app owns id generation)
  app.put('/:id', async (req, reply) => {
    const { id } = req.params;
    const data = req.body || {};
    const email = req.user?.email || 'unknown';
    if (!data || typeof data !== 'object')
      return reply.code(400).send({ error: 'body must be a JSON object' });

    await pool.query(
      `INSERT INTO warehouse_items (id, data, created_by, updated_by)
       VALUES ($1, $2, $3, $3)
       ON CONFLICT (id) DO UPDATE
         SET data = EXCLUDED.data,
             updated_by = EXCLUDED.updated_by,
             updated_at = NOW(),
             deleted = FALSE`,
      [id, data, email]
    );
    return { ok: true, id };
  });

  // DELETE /api/warehouse-items/:id  (soft delete + tombstone)
  app.delete('/:id', async (req, reply) => {
    const { id } = req.params;
    const email = req.user?.email || 'unknown';
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const upd = await client.query(
        `UPDATE warehouse_items SET deleted = TRUE, updated_by = $2, updated_at = NOW()
         WHERE id = $1 AND deleted = FALSE`,
        [id, email]
      );
      await client.query(
        `INSERT INTO tombstones (entity, id, deleted_by)
         VALUES ('warehouseItems', $1, $2)
         ON CONFLICT (entity, id) DO UPDATE
           SET deleted_at = NOW(), deleted_by = EXCLUDED.deleted_by, restored_at = NULL, restored_by = NULL`,
        [id, email]
      );
      await client.query('COMMIT');
      return { ok: true, changed: upd.rowCount };
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  });
}
