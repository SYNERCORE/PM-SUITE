-- Make every generated column tolerate garbage input.
-- 001 declared strict casts like ((data->>'startDate')::DATE) which crash
-- when the JSON field is empty-string, 'TBD', or any non-parseable value.
-- Real data has plenty of those, so nearly every PUT to projects/tasks was
-- returning 500. Same failure mode ate 2 warehouse rows during Phase 1.
--
-- Apply as postgres superuser:
--   psql -U postgres -d proc_master -f 003-safe-generated-columns.sql
-- Idempotent — safe to re-run.
--
-- Note: Postgres requires generated column expressions to be strictly
-- IMMUTABLE. text::DATE and to_date(text,'YYYY-MM-DD') are both STABLE
-- in Postgres 16 (they depend on datestyle/session state). The only
-- IMMUTABLE date builder is make_date(int,int,int).
--
-- Since none of the DATE generated columns are read by any current query
-- (routes select id/data/updated_at only, no date filters), the pragmatic
-- fix is to DROP them. When a date filter/index is actually needed, add
-- it back with make_date(). NUMERIC casts stay because they are immutable
-- and warehouse relies on qty_on_hand for the reorder index.

BEGIN;

-- ── projects: drop date columns (unused) ──
ALTER TABLE projects DROP COLUMN IF EXISTS start_date;
ALTER TABLE projects DROP COLUMN IF EXISTS end_date;

-- ── tasks: drop start_date (unused) ──
ALTER TABLE tasks DROP COLUMN IF EXISTS start_date;

-- ── warehouse_items: rebuild NUMERIC columns with regex guard ──
ALTER TABLE warehouse_items DROP COLUMN IF EXISTS qty_on_hand;
ALTER TABLE warehouse_items DROP COLUMN IF EXISTS reorder_level;
ALTER TABLE warehouse_items ADD COLUMN qty_on_hand NUMERIC GENERATED ALWAYS AS (
  CASE WHEN data->>'qtyOnHand' ~ '^-?[0-9]+(\.[0-9]+)?$'
       THEN (data->>'qtyOnHand')::NUMERIC ELSE NULL END
) STORED;
ALTER TABLE warehouse_items ADD COLUMN reorder_level NUMERIC GENERATED ALWAYS AS (
  CASE WHEN data->>'reorderLevel' ~ '^-?[0-9]+(\.[0-9]+)?$'
       THEN (data->>'reorderLevel')::NUMERIC ELSE NULL END
) STORED;
CREATE INDEX IF NOT EXISTS warehouse_items_reorder_idx ON warehouse_items(qty_on_hand) WHERE qty_on_hand <= reorder_level;

-- ── stock_transactions: drop date (unused), rebuild qty with regex guard ──
ALTER TABLE stock_transactions DROP COLUMN IF EXISTS tx_date;
ALTER TABLE stock_transactions DROP COLUMN IF EXISTS qty;
ALTER TABLE stock_transactions ADD COLUMN qty NUMERIC GENERATED ALWAYS AS (
  CASE WHEN data->>'qty' ~ '^-?[0-9]+(\.[0-9]+)?$'
       THEN (data->>'qty')::NUMERIC ELSE NULL END
) STORED;

INSERT INTO schema_version (version) VALUES (3) ON CONFLICT DO NOTHING;

COMMIT;
