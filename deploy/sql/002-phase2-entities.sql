-- Phase 2 entities — enrich the skeleton tables added in 001 with
-- indexed columns, GIN indexes, deleted flag on the tables that lacked it,
-- and audit user FKs. Idempotent: safe to re-run on a partially applied DB.
--
-- Apply:  psql -U postgres -d procmaster -f 002-phase2-entities.sql

BEGIN;

-- ── projects ── already has all columns from 001; ensure indexes only
CREATE INDEX IF NOT EXISTS projects_deleted_idx ON projects(deleted);

-- ── tasks ── already has columns; add GIN + deleted index
CREATE INDEX IF NOT EXISTS tasks_data_gin      ON tasks USING GIN (data);
CREATE INDEX IF NOT EXISTS tasks_deleted_idx   ON tasks(deleted);

-- ── resources (personnel/equipment/tools/vehicles/etc.) ──
ALTER TABLE resources ADD COLUMN IF NOT EXISTS created_by TEXT REFERENCES users(email);
ALTER TABLE resources ADD COLUMN IF NOT EXISTS updated_by TEXT REFERENCES users(email);
ALTER TABLE resources ADD COLUMN IF NOT EXISTS res_type   TEXT GENERATED ALWAYS AS (data->>'type') STORED;
ALTER TABLE resources ADD COLUMN IF NOT EXISTS res_name   TEXT GENERATED ALWAYS AS (data->>'name') STORED;
CREATE INDEX IF NOT EXISTS resources_type_idx     ON resources(res_type);
CREATE INDEX IF NOT EXISTS resources_updated_idx  ON resources(updated_at DESC);
CREATE INDEX IF NOT EXISTS resources_data_gin     ON resources USING GIN (data);
CREATE INDEX IF NOT EXISTS resources_deleted_idx  ON resources(deleted);

-- ── procurement ──
ALTER TABLE procurement ADD COLUMN IF NOT EXISTS created_by TEXT REFERENCES users(email);
ALTER TABLE procurement ADD COLUMN IF NOT EXISTS updated_by TEXT REFERENCES users(email);
ALTER TABLE procurement ADD COLUMN IF NOT EXISTS po_status TEXT GENERATED ALWAYS AS (data->>'status') STORED;
ALTER TABLE procurement ADD COLUMN IF NOT EXISTS po_number TEXT GENERATED ALWAYS AS (data->>'poNumber') STORED;
CREATE INDEX IF NOT EXISTS procurement_status_idx    ON procurement(po_status);
CREATE INDEX IF NOT EXISTS procurement_project_idx   ON procurement(project_id);
CREATE INDEX IF NOT EXISTS procurement_updated_idx   ON procurement(updated_at DESC);
CREATE INDEX IF NOT EXISTS procurement_data_gin      ON procurement USING GIN (data);
CREATE INDEX IF NOT EXISTS procurement_deleted_idx   ON procurement(deleted);

-- ── costs ──
ALTER TABLE costs ADD COLUMN IF NOT EXISTS created_by TEXT REFERENCES users(email);
ALTER TABLE costs ADD COLUMN IF NOT EXISTS updated_by TEXT REFERENCES users(email);
ALTER TABLE costs ADD COLUMN IF NOT EXISTS cost_category TEXT GENERATED ALWAYS AS (data->>'category') STORED;
ALTER TABLE costs ADD COLUMN IF NOT EXISTS cost_amount   NUMERIC GENERATED ALWAYS AS (
  CASE WHEN data->>'amount' ~ '^-?[0-9]+(\.[0-9]+)?$' THEN (data->>'amount')::NUMERIC ELSE NULL END
) STORED;
CREATE INDEX IF NOT EXISTS costs_project_idx    ON costs(project_id);
CREATE INDEX IF NOT EXISTS costs_category_idx   ON costs(cost_category);
CREATE INDEX IF NOT EXISTS costs_updated_idx    ON costs(updated_at DESC);
CREATE INDEX IF NOT EXISTS costs_data_gin       ON costs USING GIN (data);
CREATE INDEX IF NOT EXISTS costs_deleted_idx    ON costs(deleted);

INSERT INTO schema_version (version) VALUES (2) ON CONFLICT DO NOTHING;

COMMIT;
