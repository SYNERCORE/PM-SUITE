-- Batch 6 — the remainder: reference masters, project sub-records, and logs.
-- Closes the migration. Everything here is real business data that benefits
-- from the DB; deliberately NOT migrated (transient / per-device / workflow
-- control) are: notifications, activities, idChangeRequests, projectIdHistory,
-- deletionRequests, userPerms, workflowDefs.
--
-- Apply as postgres superuser:
--   psql -U postgres -d proc_master -f 008-batch6-reference-and-logs.sql
-- Idempotent — safe to re-run.
--
-- All generated columns are plain jsonb text extractions (data->>'key'),
-- which are IMMUTABLE and STORED — no date/number casts here. project_id and
-- asset_id are PLAIN columns (lifted by the route), never foreign keys.

BEGIN;

-- ── warehouse_locations (location master) ──
CREATE TABLE IF NOT EXISTS warehouse_locations (
    id         TEXT PRIMARY KEY,
    data       JSONB NOT NULL,
    loc_type   TEXT GENERATED ALWAYS AS (data->>'type') STORED,
    loc_code   TEXT GENERATED ALWAYS AS (data->>'code') STORED,
    deleted    BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by TEXT REFERENCES users(email),
    updated_by TEXT REFERENCES users(email)
);
CREATE INDEX IF NOT EXISTS wh_loc_type_idx    ON warehouse_locations(loc_type);
CREATE INDEX IF NOT EXISTS wh_loc_updated_idx ON warehouse_locations(updated_at DESC);
CREATE INDEX IF NOT EXISTS wh_loc_deleted_idx ON warehouse_locations(deleted);
CREATE INDEX IF NOT EXISTS wh_loc_data_gin    ON warehouse_locations USING GIN (data);

-- ── progress (project progress snapshots) ──
CREATE TABLE IF NOT EXISTS progress (
    id         TEXT PRIMARY KEY,
    project_id TEXT,
    data       JSONB NOT NULL,
    deleted    BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by TEXT REFERENCES users(email),
    updated_by TEXT REFERENCES users(email)
);
CREATE INDEX IF NOT EXISTS progress_project_idx ON progress(project_id);
CREATE INDEX IF NOT EXISTS progress_updated_idx ON progress(updated_at DESC);
CREATE INDEX IF NOT EXISTS progress_deleted_idx ON progress(deleted);
CREATE INDEX IF NOT EXISTS progress_data_gin    ON progress USING GIN (data);

-- ── kpi_data (KPI snapshots) ──
CREATE TABLE IF NOT EXISTS kpi_data (
    id         TEXT PRIMARY KEY,
    project_id TEXT,
    data       JSONB NOT NULL,
    deleted    BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by TEXT REFERENCES users(email),
    updated_by TEXT REFERENCES users(email)
);
CREATE INDEX IF NOT EXISTS kpi_project_idx ON kpi_data(project_id);
CREATE INDEX IF NOT EXISTS kpi_updated_idx ON kpi_data(updated_at DESC);
CREATE INDEX IF NOT EXISTS kpi_deleted_idx ON kpi_data(deleted);
CREATE INDEX IF NOT EXISTS kpi_data_gin    ON kpi_data USING GIN (data);

-- ── calendar (events) ──
CREATE TABLE IF NOT EXISTS calendar (
    id         TEXT PRIMARY KEY,
    project_id TEXT,
    data       JSONB NOT NULL,
    event_type TEXT GENERATED ALWAYS AS (data->>'type') STORED,
    deleted    BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by TEXT REFERENCES users(email),
    updated_by TEXT REFERENCES users(email)
);
CREATE INDEX IF NOT EXISTS calendar_project_idx ON calendar(project_id);
CREATE INDEX IF NOT EXISTS calendar_type_idx    ON calendar(event_type);
CREATE INDEX IF NOT EXISTS calendar_updated_idx ON calendar(updated_at DESC);
CREATE INDEX IF NOT EXISTS calendar_deleted_idx ON calendar(deleted);
CREATE INDEX IF NOT EXISTS calendar_data_gin    ON calendar USING GIN (data);

-- ── asset_history (asset event log) ──
CREATE TABLE IF NOT EXISTS asset_history (
    id         TEXT PRIMARY KEY,
    asset_id   TEXT,
    data       JSONB NOT NULL,
    event_type TEXT GENERATED ALWAYS AS (data->>'event') STORED,
    deleted    BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by TEXT REFERENCES users(email),
    updated_by TEXT REFERENCES users(email)
);
CREATE INDEX IF NOT EXISTS asset_hist_asset_idx   ON asset_history(asset_id);
CREATE INDEX IF NOT EXISTS asset_hist_event_idx   ON asset_history(event_type);
CREATE INDEX IF NOT EXISTS asset_hist_updated_idx ON asset_history(updated_at DESC);
CREATE INDEX IF NOT EXISTS asset_hist_deleted_idx ON asset_history(deleted);
CREATE INDEX IF NOT EXISTS asset_hist_data_gin    ON asset_history USING GIN (data);

-- ── asset_utilization (utilization log) ──
CREATE TABLE IF NOT EXISTS asset_utilization (
    id         TEXT PRIMARY KEY,
    asset_id   TEXT,
    data       JSONB NOT NULL,
    deleted    BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by TEXT REFERENCES users(email),
    updated_by TEXT REFERENCES users(email)
);
CREATE INDEX IF NOT EXISTS asset_util_asset_idx   ON asset_utilization(asset_id);
CREATE INDEX IF NOT EXISTS asset_util_updated_idx ON asset_utilization(updated_at DESC);
CREATE INDEX IF NOT EXISTS asset_util_deleted_idx ON asset_utilization(deleted);
CREATE INDEX IF NOT EXISTS asset_util_data_gin    ON asset_utilization USING GIN (data);

-- ── third_party (subcontractor / vendor master) ──
CREATE TABLE IF NOT EXISTS third_party (
    id         TEXT PRIMARY KEY,
    data       JSONB NOT NULL,
    tp_status  TEXT GENERATED ALWAYS AS (data->>'status')   STORED,
    category   TEXT GENERATED ALWAYS AS (data->>'category') STORED,
    deleted    BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by TEXT REFERENCES users(email),
    updated_by TEXT REFERENCES users(email)
);
CREATE INDEX IF NOT EXISTS tp_status_idx   ON third_party(tp_status);
CREATE INDEX IF NOT EXISTS tp_category_idx  ON third_party(category);
CREATE INDEX IF NOT EXISTS tp_updated_idx   ON third_party(updated_at DESC);
CREATE INDEX IF NOT EXISTS tp_deleted_idx   ON third_party(deleted);
CREATE INDEX IF NOT EXISTS tp_data_gin      ON third_party USING GIN (data);

-- ── project_team (team assignments) ──
CREATE TABLE IF NOT EXISTS project_team (
    id         TEXT PRIMARY KEY,
    project_id TEXT,
    data       JSONB NOT NULL,
    deleted    BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by TEXT REFERENCES users(email),
    updated_by TEXT REFERENCES users(email)
);
CREATE INDEX IF NOT EXISTS pteam_project_idx ON project_team(project_id);
CREATE INDEX IF NOT EXISTS pteam_updated_idx ON project_team(updated_at DESC);
CREATE INDEX IF NOT EXISTS pteam_deleted_idx ON project_team(deleted);
CREATE INDEX IF NOT EXISTS pteam_data_gin    ON project_team USING GIN (data);

-- ── trades (manpower trade reference) ──
CREATE TABLE IF NOT EXISTS trades (
    id         TEXT PRIMARY KEY,
    data       JSONB NOT NULL,
    trade_name TEXT GENERATED ALWAYS AS (data->>'name') STORED,
    deleted    BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by TEXT REFERENCES users(email),
    updated_by TEXT REFERENCES users(email)
);
CREATE INDEX IF NOT EXISTS trades_name_idx    ON trades(trade_name);
CREATE INDEX IF NOT EXISTS trades_updated_idx ON trades(updated_at DESC);
CREATE INDEX IF NOT EXISTS trades_deleted_idx ON trades(deleted);
CREATE INDEX IF NOT EXISTS trades_data_gin    ON trades USING GIN (data);

-- ── business_units (org reference) ──
CREATE TABLE IF NOT EXISTS business_units (
    id         TEXT PRIMARY KEY,
    data       JSONB NOT NULL,
    bu_name    TEXT GENERATED ALWAYS AS (data->>'name') STORED,
    deleted    BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by TEXT REFERENCES users(email),
    updated_by TEXT REFERENCES users(email)
);
CREATE INDEX IF NOT EXISTS bu_name_idx    ON business_units(bu_name);
CREATE INDEX IF NOT EXISTS bu_updated_idx ON business_units(updated_at DESC);
CREATE INDEX IF NOT EXISTS bu_deleted_idx ON business_units(deleted);
CREATE INDEX IF NOT EXISTS bu_data_gin    ON business_units USING GIN (data);

-- ── daily_meeting_logs (daily site logs) ──
CREATE TABLE IF NOT EXISTS daily_meeting_logs (
    id         TEXT PRIMARY KEY,
    project_id TEXT,
    data       JSONB NOT NULL,
    log_status TEXT GENERATED ALWAYS AS (data->>'status') STORED,
    deleted    BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by TEXT REFERENCES users(email),
    updated_by TEXT REFERENCES users(email)
);
CREATE INDEX IF NOT EXISTS dml_project_idx ON daily_meeting_logs(project_id);
CREATE INDEX IF NOT EXISTS dml_status_idx  ON daily_meeting_logs(log_status);
CREATE INDEX IF NOT EXISTS dml_updated_idx ON daily_meeting_logs(updated_at DESC);
CREATE INDEX IF NOT EXISTS dml_deleted_idx ON daily_meeting_logs(deleted);
CREATE INDEX IF NOT EXISTS dml_data_gin    ON daily_meeting_logs USING GIN (data);

-- ── library_docs (document library metadata) ──
CREATE TABLE IF NOT EXISTS library_docs (
    id         TEXT PRIMARY KEY,
    data       JSONB NOT NULL,
    doc_status TEXT GENERATED ALWAYS AS (data->>'status')   STORED,
    category   TEXT GENERATED ALWAYS AS (data->>'category') STORED,
    deleted    BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by TEXT REFERENCES users(email),
    updated_by TEXT REFERENCES users(email)
);
CREATE INDEX IF NOT EXISTS lib_status_idx   ON library_docs(doc_status);
CREATE INDEX IF NOT EXISTS lib_category_idx  ON library_docs(category);
CREATE INDEX IF NOT EXISTS lib_updated_idx   ON library_docs(updated_at DESC);
CREATE INDEX IF NOT EXISTS lib_deleted_idx   ON library_docs(deleted);
CREATE INDEX IF NOT EXISTS lib_data_gin      ON library_docs USING GIN (data);

-- ── updated_at triggers (set_updated_at() defined in 001) ──
DO $$
DECLARE tbl TEXT;
BEGIN
  FOREACH tbl IN ARRAY ARRAY[
    'warehouse_locations','progress','kpi_data','calendar','asset_history',
    'asset_utilization','third_party','project_team','trades',
    'business_units','daily_meeting_logs','library_docs'
  ] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_%1$s_updated_at ON %1$s', tbl);
    EXECUTE format('CREATE TRIGGER trg_%1$s_updated_at BEFORE UPDATE ON %1$s FOR EACH ROW EXECUTE FUNCTION set_updated_at()', tbl);
  END LOOP;
END $$;

INSERT INTO schema_version (version) VALUES (7) ON CONFLICT DO NOTHING;

COMMIT;

-- ── Self-verification ──
SELECT version FROM schema_version ORDER BY version;
SELECT count(*) AS batch6_triggers
FROM information_schema.triggers
WHERE trigger_name LIKE 'trg_%_updated_at'
  AND event_object_table IN ('warehouse_locations','progress','kpi_data','calendar',
      'asset_history','asset_utilization','third_party','project_team','trades',
      'business_units','daily_meeting_logs','library_docs');
