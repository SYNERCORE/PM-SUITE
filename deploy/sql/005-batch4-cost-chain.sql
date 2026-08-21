-- Batch 4 — the cost chain.
-- costs was migrated in Phase 2, but the transactions its figures are
-- derived from were not. Restoring the database would have produced cost
-- totals with no supporting records and no way to recalculate them, since
-- the recalc reads resource_usage_logs. These five tables close that gap.
--
-- Apply as postgres superuser:
--   psql -U postgres -d proc_master -f 005-batch4-cost-chain.sql
-- Idempotent — safe to re-run.
--
-- Generated columns must be strictly IMMUTABLE (see 003): ::NUMERIC is,
-- date parsing is not, so dates stay inside the JSONB.

BEGIN;

-- ── resource_allocations ──
-- project_id is a plain column, not a foreign key: migration pushes rows
-- device by device and a child can legitimately arrive before its parent.
CREATE TABLE IF NOT EXISTS resource_allocations (
    id             TEXT PRIMARY KEY,
    project_id     TEXT,
    data           JSONB NOT NULL,
    resource_type  TEXT GENERATED ALWAYS AS (data->>'resourceType') STORED,
    alloc_status   TEXT GENERATED ALWAYS AS (data->>'status') STORED,
    allocated_qty  NUMERIC GENERATED ALWAYS AS (
      CASE WHEN data->>'allocatedQty' ~ '^-?[0-9]+(\.[0-9]+)?$'
           THEN (data->>'allocatedQty')::NUMERIC ELSE NULL END) STORED,
    planned_cost   NUMERIC GENERATED ALWAYS AS (
      CASE WHEN data->>'plannedCost' ~ '^-?[0-9]+(\.[0-9]+)?$'
           THEN (data->>'plannedCost')::NUMERIC ELSE NULL END) STORED,
    actual_cost    NUMERIC GENERATED ALWAYS AS (
      CASE WHEN data->>'actualCost' ~ '^-?[0-9]+(\.[0-9]+)?$'
           THEN (data->>'actualCost')::NUMERIC ELSE NULL END) STORED,
    deleted        BOOLEAN NOT NULL DEFAULT FALSE,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by     TEXT REFERENCES users(email),
    updated_by     TEXT REFERENCES users(email)
);
CREATE INDEX IF NOT EXISTS res_alloc_project_idx ON resource_allocations(project_id);
CREATE INDEX IF NOT EXISTS res_alloc_type_idx    ON resource_allocations(resource_type);
CREATE INDEX IF NOT EXISTS res_alloc_updated_idx ON resource_allocations(updated_at DESC);
CREATE INDEX IF NOT EXISTS res_alloc_deleted_idx ON resource_allocations(deleted);
CREATE INDEX IF NOT EXISTS res_alloc_data_gin    ON resource_allocations USING GIN (data);

-- ── resource_usage_logs ──
-- Carries unit_cost / total_cost as of the issuance-costing change, so this
-- is the audit trail behind every auto-generated Cost Control row.
CREATE TABLE IF NOT EXISTS resource_usage_logs (
    id             TEXT PRIMARY KEY,
    project_id     TEXT,
    allocation_id  TEXT,
    data           JSONB NOT NULL,
    tx_type        TEXT GENERATED ALWAYS AS (data->>'transactionType') STORED,
    resource_type  TEXT GENERATED ALWAYS AS (data->>'resourceType') STORED,
    cost_category  TEXT GENERATED ALWAYS AS (data->>'category') STORED,
    quantity       NUMERIC GENERATED ALWAYS AS (
      CASE WHEN data->>'quantity' ~ '^-?[0-9]+(\.[0-9]+)?$'
           THEN (data->>'quantity')::NUMERIC ELSE NULL END) STORED,
    unit_cost      NUMERIC GENERATED ALWAYS AS (
      CASE WHEN data->>'unitCost' ~ '^-?[0-9]+(\.[0-9]+)?$'
           THEN (data->>'unitCost')::NUMERIC ELSE NULL END) STORED,
    total_cost     NUMERIC GENERATED ALWAYS AS (
      CASE WHEN data->>'totalCost' ~ '^-?[0-9]+(\.[0-9]+)?$'
           THEN (data->>'totalCost')::NUMERIC ELSE NULL END) STORED,
    deleted        BOOLEAN NOT NULL DEFAULT FALSE,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by     TEXT REFERENCES users(email),
    updated_by     TEXT REFERENCES users(email)
);
CREATE INDEX IF NOT EXISTS usage_log_project_idx  ON resource_usage_logs(project_id);
CREATE INDEX IF NOT EXISTS usage_log_alloc_idx    ON resource_usage_logs(allocation_id);
CREATE INDEX IF NOT EXISTS usage_log_type_idx     ON resource_usage_logs(tx_type);
CREATE INDEX IF NOT EXISTS usage_log_updated_idx  ON resource_usage_logs(updated_at DESC);
CREATE INDEX IF NOT EXISTS usage_log_deleted_idx  ON resource_usage_logs(deleted);
CREATE INDEX IF NOT EXISTS usage_log_data_gin     ON resource_usage_logs USING GIN (data);

-- ── manpower ──
CREATE TABLE IF NOT EXISTS manpower (
    id             TEXT PRIMARY KEY,
    project_id     TEXT,
    data           JSONB NOT NULL,
    trade          TEXT GENERATED ALWAYS AS (data->>'trade') STORED,
    planned_qty    NUMERIC GENERATED ALWAYS AS (
      CASE WHEN data->>'planned' ~ '^-?[0-9]+(\.[0-9]+)?$'
           THEN (data->>'planned')::NUMERIC ELSE NULL END) STORED,
    actual_qty     NUMERIC GENERATED ALWAYS AS (
      CASE WHEN data->>'actual' ~ '^-?[0-9]+(\.[0-9]+)?$'
           THEN (data->>'actual')::NUMERIC ELSE NULL END) STORED,
    mp_cost        NUMERIC GENERATED ALWAYS AS (
      CASE WHEN data->>'cost' ~ '^-?[0-9]+(\.[0-9]+)?$'
           THEN (data->>'cost')::NUMERIC ELSE NULL END) STORED,
    deleted        BOOLEAN NOT NULL DEFAULT FALSE,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by     TEXT REFERENCES users(email),
    updated_by     TEXT REFERENCES users(email)
);
CREATE INDEX IF NOT EXISTS manpower_project_idx ON manpower(project_id);
CREATE INDEX IF NOT EXISTS manpower_trade_idx   ON manpower(trade);
CREATE INDEX IF NOT EXISTS manpower_updated_idx ON manpower(updated_at DESC);
CREATE INDEX IF NOT EXISTS manpower_deleted_idx ON manpower(deleted);
CREATE INDEX IF NOT EXISTS manpower_data_gin    ON manpower USING GIN (data);

-- ── procurement_logs ──
-- Stage-change trail for each PO/PR. proc_id points at procurement(id).
CREATE TABLE IF NOT EXISTS procurement_logs (
    id             TEXT PRIMARY KEY,
    proc_id        TEXT,
    data           JSONB NOT NULL,
    action         TEXT GENERATED ALWAYS AS (data->>'action') STORED,
    stage_after    TEXT GENERATED ALWAYS AS (data->>'stageAfter') STORED,
    deleted        BOOLEAN NOT NULL DEFAULT FALSE,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by     TEXT REFERENCES users(email),
    updated_by     TEXT REFERENCES users(email)
);
CREATE INDEX IF NOT EXISTS proc_log_proc_idx    ON procurement_logs(proc_id);
CREATE INDEX IF NOT EXISTS proc_log_updated_idx ON procurement_logs(updated_at DESC);
CREATE INDEX IF NOT EXISTS proc_log_deleted_idx ON procurement_logs(deleted);
CREATE INDEX IF NOT EXISTS proc_log_data_gin    ON procurement_logs USING GIN (data);

-- ── issuance_requests ──
-- Warehouse side of a site issuance: raised by the usage log, fulfilled
-- against a warehouse item.
CREATE TABLE IF NOT EXISTS issuance_requests (
    id             TEXT PRIMARY KEY,
    project_id     TEXT,
    item_id        TEXT,
    data           JSONB NOT NULL,
    req_status     TEXT GENERATED ALWAYS AS (data->>'status') STORED,
    source_log     TEXT GENERATED ALWAYS AS (data->>'sourceLog') STORED,
    qty            NUMERIC GENERATED ALWAYS AS (
      CASE WHEN data->>'qty' ~ '^-?[0-9]+(\.[0-9]+)?$'
           THEN (data->>'qty')::NUMERIC ELSE NULL END) STORED,
    deleted        BOOLEAN NOT NULL DEFAULT FALSE,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by     TEXT REFERENCES users(email),
    updated_by     TEXT REFERENCES users(email)
);
CREATE INDEX IF NOT EXISTS iss_req_project_idx ON issuance_requests(project_id);
CREATE INDEX IF NOT EXISTS iss_req_item_idx    ON issuance_requests(item_id);
CREATE INDEX IF NOT EXISTS iss_req_status_idx  ON issuance_requests(req_status);
CREATE INDEX IF NOT EXISTS iss_req_updated_idx ON issuance_requests(updated_at DESC);
CREATE INDEX IF NOT EXISTS iss_req_deleted_idx ON issuance_requests(deleted);
CREATE INDEX IF NOT EXISTS iss_req_data_gin    ON issuance_requests USING GIN (data);

-- ── updated_at triggers ──
DO $$
DECLARE tbl TEXT;
BEGIN
  FOREACH tbl IN ARRAY ARRAY[
    'resource_allocations','resource_usage_logs','manpower',
    'procurement_logs','issuance_requests'
  ] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_%1$s_updated_at ON %1$s', tbl);
    EXECUTE format('CREATE TRIGGER trg_%1$s_updated_at BEFORE UPDATE ON %1$s FOR EACH ROW EXECUTE FUNCTION set_updated_at()', tbl);
  END LOOP;
END $$;

INSERT INTO schema_version (version) VALUES (5) ON CONFLICT DO NOTHING;

COMMIT;
