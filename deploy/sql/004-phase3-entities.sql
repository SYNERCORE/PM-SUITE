-- Phase 3 entities — qaqc, risks, actions, documents, stock_transactions.
-- The first four exist as skeletons from 001; add audit columns + indexes.
-- stock_transactions gets updated_by (the shared route factory writes it)
-- and its hard FKs relaxed: rows arrive from devices in any order during
-- migration, and a tx referencing an item/project the server hasn't seen
-- yet must not 500. The columns stay for joins; enforcement moves to app.
--
-- Apply as postgres superuser:
--   psql -U postgres -d proc_master -f 004-phase3-entities.sql
-- Idempotent — safe to re-run.

BEGIN;

-- ── qaqc / risks / actions / documents: audit cols + indexes ──
DO $$
DECLARE tbl TEXT;
BEGIN
  FOREACH tbl IN ARRAY ARRAY['qaqc','risks','actions','documents'] LOOP
    EXECUTE format('ALTER TABLE %1$s ADD COLUMN IF NOT EXISTS created_by TEXT REFERENCES users(email)', tbl);
    EXECUTE format('ALTER TABLE %1$s ADD COLUMN IF NOT EXISTS updated_by TEXT REFERENCES users(email)', tbl);
    EXECUTE format('CREATE INDEX IF NOT EXISTS %1$s_project_idx ON %1$s(project_id)', tbl);
    EXECUTE format('CREATE INDEX IF NOT EXISTS %1$s_updated_idx ON %1$s(updated_at DESC)', tbl);
    EXECUTE format('CREATE INDEX IF NOT EXISTS %1$s_deleted_idx ON %1$s(deleted)', tbl);
    EXECUTE format('CREATE INDEX IF NOT EXISTS %1$s_data_gin ON %1$s USING GIN (data)', tbl);
  END LOOP;
END $$;

-- ── stock_transactions ──
ALTER TABLE stock_transactions ADD COLUMN IF NOT EXISTS updated_by TEXT REFERENCES users(email);
-- Relax hard FKs — migration pushes rows device-by-device and ordering
-- can't be guaranteed; a dangling reference must not fail the write.
ALTER TABLE stock_transactions DROP CONSTRAINT IF EXISTS stock_transactions_item_id_fkey;
ALTER TABLE stock_transactions DROP CONSTRAINT IF EXISTS stock_transactions_project_id_fkey;
CREATE INDEX IF NOT EXISTS stock_tx_updated_idx  ON stock_transactions(updated_at DESC);
CREATE INDEX IF NOT EXISTS stock_tx_deleted_idx  ON stock_transactions(deleted);
CREATE INDEX IF NOT EXISTS stock_tx_data_gin     ON stock_transactions USING GIN (data);

INSERT INTO schema_version (version) VALUES (4) ON CONFLICT DO NOTHING;

COMMIT;
