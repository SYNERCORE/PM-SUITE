// Generic entity route factory — same shape as warehouseItems.js.
// Every entity that just needs GET-list / GET-one / PUT-upsert / DELETE-soft
// registers through here. Entities with special logic (extra filters,
// generated-column casts, custom validations) can copy warehouseItems.js
// instead and register directly.
//
// Usage in server.js:
//   await app.register(makeEntityRoutes({ table:'projects', entityName:'projects' }), { prefix:'/api/projects' });

import { pool } from '../db.js';

const MAX = () => Number(process.env.MAX_PAGE_SIZE || 500);

export function makeEntityRoutes(opts) {
  const table = opts.table;                    // SQL table name, e.g. 'projects'
  const entityName = opts.entityName || table; // Client-side entity slug for tombstones
  const filters = opts.filters || [];          // Extra ?column=value filters mapped to real columns

  return async function routes(app) {
    // GET /
    app.get('/', async (req) => {
      const limit  = Math.min(Number(req.query.limit) || 100, MAX());
      const offset = Number(req.query.offset) || 0;
      const includeDeleted = req.query.includeDeleted === 'true';

      const where = [];
      const args = [];
      if (!includeDeleted) where.push('deleted = FALSE');
      for (const f of filters) {
        if (req.query[f.query] !== undefined) {
          args.push(req.query[f.query]);
          where.push(`${f.column} = $${args.length}`);
        }
      }
      if (req.query.since) {
        args.push(req.query.since);
        where.push(`updated_at > $${args.length}`);
      }
      const clause = where.length ? 'WHERE ' + where.join(' AND ') : '';

      args.push(limit, offset);
      const { rows } = await pool.query(
        `SELECT id, data, updated_at FROM ${table} ${clause}
         ORDER BY updated_at DESC
         LIMIT $${args.length - 1} OFFSET $${args.length}`,
        args
      );
      return { items: rows, limit, offset };
    });

    // GET /:id
    app.get('/:id', async (req, reply) => {
      const { rows } = await pool.query(
        `SELECT id, data, updated_at FROM ${table} WHERE id = $1`,
        [req.params.id]
      );
      if (!rows[0]) return reply.code(404).send({ error: 'not found' });
      return rows[0];
    });

    // PUT /:id
    app.put('/:id', async (req, reply) => {
      const { id } = req.params;
      const data = req.body || {};
      const email = req.user?.email || 'unknown';
      if (typeof data !== 'object')
        return reply.code(400).send({ error: 'body must be a JSON object' });

      // Optional real columns lifted out of the JSON for joins/indexes.
      // hasProjectId is shorthand for the common project_id case; extraCols
      // handles anything else, e.g. [{ column:'item_id', dataKey:'itemId' }].
      const lifted = [];
      if (opts.hasProjectId === true) lifted.push({ column: 'project_id', dataKey: 'projectId' });
      for (const c of (opts.extraCols || [])) lifted.push(c);

      // Pass each value exactly once — postgres rejects bind messages whose
      // parameter count exceeds the highest placeholder number.
      const cols = ['id', 'data', 'created_by', 'updated_by'];
      const vals = [id, data, email];
      const placeholders = ['$1', '$2', '$3', '$3'];
      const updateSet = [
        'data = EXCLUDED.data',
        'updated_by = EXCLUDED.updated_by',
        'updated_at = NOW()',
        'deleted = FALSE',
      ];
      for (const { column, dataKey } of lifted) {
        cols.push(column);
        vals.push(data[dataKey] || null);
        placeholders.push('$' + vals.length);
        updateSet.push(`${column} = EXCLUDED.${column}`);
      }

      await pool.query(
        `INSERT INTO ${table} (${cols.join(', ')})
         VALUES (${placeholders.join(', ')})
         ON CONFLICT (id) DO UPDATE SET ${updateSet.join(', ')}`,
        vals
      );
      return { ok: true, id };
    });

    // DELETE /:id  (soft delete + tombstone)
    app.delete('/:id', async (req) => {
      const { id } = req.params;
      const email = req.user?.email || 'unknown';
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const upd = await client.query(
          `UPDATE ${table} SET deleted = TRUE, updated_by = $2, updated_at = NOW()
           WHERE id = $1 AND deleted = FALSE`,
          [id, email]
        );
        await client.query(
          `INSERT INTO tombstones (entity, id, deleted_by) VALUES ($1, $2, $3)
           ON CONFLICT (entity, id) DO UPDATE
             SET deleted_at = NOW(), deleted_by = EXCLUDED.deleted_by,
                 restored_at = NULL, restored_by = NULL`,
          [entityName, id, email]
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
  };
}
