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
-- Note: Postgres requires generated column expressions to be IMMUTABLE.
--   * text::DATE is STABLE (depends on DateStyle) → rejected
--   * to_date(text, 'YYYY-MM-DD') is IMMUTABLE → OK
--   * text::NUMERIC is IMMUTABLE → OK

BEGIN;

-- ── projects: startDate / endDate ──
ALTER TABLE projects DROP COLUMN IF EXISTS start_date;
ALTER TABLE projects DROP COLUMN IF EXISTS end_date;
ALTER TABLE projects ADD COLUMN start_date DATE GENERATED ALWAYS AS (
  CASE WHEN data->>'startDate' ~ '^\d{4}-\d{2}-\d{2}$'
       THEN to_date(data->>'startDate', 'YYYY-MM-DD') ELSE NULL END
) STORED;
ALTER TABLE projects ADD COLUMN end_date DATE GENERATED ALWAYS AS (
  CASE WHEN data->>'endDate' ~ '^\d{4}-\d{2}-\d{2}$'
       THEN to_date(data->>'endDate', 'YYYY-MM-DD') ELSE NULL END
) STORED;

-- ── tasks: startDate ──
ALTER TABLE tasks DROP COLUMN IF EXISTS start_date;
ALTER TABLE tasks ADD COLUMN start_date DATE GENERATED ALWAYS AS (
  CASE WHEN data->>'startDate' ~ '^\d{4}-\d{2}-\d{2}$'
       THEN to_date(data->>'startDate', 'YYYY-MM-DD') ELSE NULL END
) STORED;

-- ── warehouse_items: qtyOnHand / reorderLevel ──
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
-- Re-create the reorder index that referenced the dropped columns
CREATE INDEX IF NOT EXISTS warehouse_items_reorder_idx ON warehouse_items(qty_on_hand) WHERE qty_on_hand <= reorder_level;

-- ── stock_transactions: date + qty ──
ALTER TABLE stock_transactions DROP COLUMN IF EXISTS tx_date;
ALTER TABLE stock_transactions DROP COLUMN IF EXISTS qty;
ALTER TABLE stock_transactions ADD COLUMN tx_date DATE GENERATED ALWAYS AS (
  CASE WHEN data->>'date' ~ '^\d{4}-\d{2}-\d{2}$'
       THEN to_date(data->>'date', 'YYYY-MM-DD') ELSE NULL END
) STORED;
ALTER TABLE stock_transactions ADD COLUMN qty NUMERIC GENERATED ALWAYS AS (
  CASE WHEN data->>'qty' ~ '^-?[0-9]+(\.[0-9]+)?$'
       THEN (data->>'qty')::NUMERIC ELSE NULL END
) STORED;

INSERT INTO schema_version (version) VALUES (3) ON CONFLICT DO NOTHING;

COMMIT;
