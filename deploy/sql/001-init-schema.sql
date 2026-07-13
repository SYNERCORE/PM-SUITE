-- ProMaster local server schema — initial version
-- Import with:
--   psql -U postgres -d procmaster -f 001-init-schema.sql
--
-- Design notes:
--   * One table per entity, mirroring src/js/core.js SHIC_LIST_CONFIG
--   * `data` is JSONB — the record shape lives in the app; server-side
--     indexed columns are extracted from it via generated columns
--   * All entities carry an audit timestamp trio + soft-delete flag
--   * Tombstones live in their own table so tombstone GC is a
--     separate concern from row lifecycle

BEGIN;

-- ── Users (identity comes from Azure AD; we cache display info) ──
CREATE TABLE IF NOT EXISTS users (
    email          TEXT PRIMARY KEY,
    name           TEXT NOT NULL,
    role           TEXT NOT NULL DEFAULT 'user',        -- 'admin' | 'manager' | 'user'
    perms          JSONB NOT NULL DEFAULT '{}'::jsonb,
    last_seen_at   TIMESTAMPTZ,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Generic entity table factory ──
-- Every business entity gets: id (client-generated PRJ-001 etc),
-- data JSONB, timestamps, deleted flag, created_by, updated_by.
-- Server does NOT invent ids — the app does — because offline devices
-- must be able to mint ids without round-tripping.

CREATE TABLE IF NOT EXISTS projects (
    id             TEXT PRIMARY KEY,
    data           JSONB NOT NULL,
    status         TEXT GENERATED ALWAYS AS (data->>'status') STORED,
    name           TEXT GENERATED ALWAYS AS (data->>'name') STORED,
    start_date     DATE GENERATED ALWAYS AS ((data->>'startDate')::DATE) STORED,
    end_date       DATE GENERATED ALWAYS AS ((data->>'endDate')::DATE) STORED,
    deleted        BOOLEAN NOT NULL DEFAULT FALSE,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by     TEXT REFERENCES users(email),
    updated_by     TEXT REFERENCES users(email)
);
CREATE INDEX IF NOT EXISTS projects_status_idx     ON projects(status);
CREATE INDEX IF NOT EXISTS projects_updated_at_idx ON projects(updated_at DESC);
CREATE INDEX IF NOT EXISTS projects_data_gin       ON projects USING GIN (data);

CREATE TABLE IF NOT EXISTS tasks (
    id             TEXT PRIMARY KEY,
    project_id     TEXT REFERENCES projects(id) ON DELETE CASCADE,
    data           JSONB NOT NULL,
    status         TEXT GENERATED ALWAYS AS (data->>'status') STORED,
    start_date     DATE GENERATED ALWAYS AS ((data->>'startDate')::DATE) STORED,
    deleted        BOOLEAN NOT NULL DEFAULT FALSE,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by     TEXT REFERENCES users(email),
    updated_by     TEXT REFERENCES users(email)
);
CREATE INDEX IF NOT EXISTS tasks_project_idx      ON tasks(project_id);
CREATE INDEX IF NOT EXISTS tasks_updated_at_idx   ON tasks(updated_at DESC);

CREATE TABLE IF NOT EXISTS warehouse_items (
    id             TEXT PRIMARY KEY,
    data           JSONB NOT NULL,
    category       TEXT GENERATED ALWAYS AS (data->>'category') STORED,
    qty_on_hand    NUMERIC GENERATED ALWAYS AS ((data->>'qtyOnHand')::NUMERIC) STORED,
    reorder_level  NUMERIC GENERATED ALWAYS AS ((data->>'reorderLevel')::NUMERIC) STORED,
    deleted        BOOLEAN NOT NULL DEFAULT FALSE,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by     TEXT REFERENCES users(email),
    updated_by     TEXT REFERENCES users(email)
);
CREATE INDEX IF NOT EXISTS warehouse_items_category_idx     ON warehouse_items(category);
CREATE INDEX IF NOT EXISTS warehouse_items_reorder_idx      ON warehouse_items(qty_on_hand) WHERE qty_on_hand <= reorder_level;
CREATE INDEX IF NOT EXISTS warehouse_items_data_gin         ON warehouse_items USING GIN (data);

CREATE TABLE IF NOT EXISTS stock_transactions (
    id             TEXT PRIMARY KEY,
    item_id        TEXT REFERENCES warehouse_items(id),
    project_id     TEXT REFERENCES projects(id),
    data           JSONB NOT NULL,
    tx_type        TEXT GENERATED ALWAYS AS (data->>'type') STORED,
    tx_date        DATE GENERATED ALWAYS AS ((data->>'date')::DATE) STORED,
    qty            NUMERIC GENERATED ALWAYS AS ((data->>'qty')::NUMERIC) STORED,
    deleted        BOOLEAN NOT NULL DEFAULT FALSE,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by     TEXT REFERENCES users(email)
);
CREATE INDEX IF NOT EXISTS stock_tx_item_idx      ON stock_transactions(item_id, tx_date DESC);
CREATE INDEX IF NOT EXISTS stock_tx_project_idx   ON stock_transactions(project_id, tx_date DESC);

-- Remaining entities follow the same pattern. Add them incrementally as
-- each module cuts over from SharePoint. Skeletons are provided below —
-- fill in indexed columns per your query load.

CREATE TABLE IF NOT EXISTS costs           (id TEXT PRIMARY KEY, project_id TEXT REFERENCES projects(id), data JSONB NOT NULL, deleted BOOLEAN NOT NULL DEFAULT FALSE, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW());
CREATE TABLE IF NOT EXISTS qaqc            (id TEXT PRIMARY KEY, project_id TEXT REFERENCES projects(id), data JSONB NOT NULL, deleted BOOLEAN NOT NULL DEFAULT FALSE, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW());
CREATE TABLE IF NOT EXISTS risks           (id TEXT PRIMARY KEY, project_id TEXT REFERENCES projects(id), data JSONB NOT NULL, deleted BOOLEAN NOT NULL DEFAULT FALSE, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW());
CREATE TABLE IF NOT EXISTS actions         (id TEXT PRIMARY KEY, project_id TEXT REFERENCES projects(id), data JSONB NOT NULL, deleted BOOLEAN NOT NULL DEFAULT FALSE, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW());
CREATE TABLE IF NOT EXISTS documents       (id TEXT PRIMARY KEY, project_id TEXT REFERENCES projects(id), data JSONB NOT NULL, deleted BOOLEAN NOT NULL DEFAULT FALSE, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW());
CREATE TABLE IF NOT EXISTS resources       (id TEXT PRIMARY KEY, data JSONB NOT NULL, deleted BOOLEAN NOT NULL DEFAULT FALSE, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW());
CREATE TABLE IF NOT EXISTS procurement     (id TEXT PRIMARY KEY, project_id TEXT REFERENCES projects(id), data JSONB NOT NULL, deleted BOOLEAN NOT NULL DEFAULT FALSE, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW());

-- ── Deletion tombstones ──
CREATE TABLE IF NOT EXISTS tombstones (
    entity         TEXT NOT NULL,
    id             TEXT NOT NULL,
    deleted_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_by     TEXT,
    restored_at    TIMESTAMPTZ,
    restored_by    TEXT,
    PRIMARY KEY (entity, id)
);
CREATE INDEX IF NOT EXISTS tombstones_deleted_at_idx ON tombstones(deleted_at);

-- ── Audit log ──
CREATE TABLE IF NOT EXISTS audit_log (
    id             BIGSERIAL PRIMARY KEY,
    ts             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    user_email     TEXT,
    category       TEXT NOT NULL,           -- 'create' | 'update' | 'delete' | 'sync' | 'error' | ...
    message        TEXT NOT NULL,
    details        JSONB,
    entity         TEXT,
    entity_id      TEXT
);
CREATE INDEX IF NOT EXISTS audit_log_ts_idx        ON audit_log(ts DESC);
CREATE INDEX IF NOT EXISTS audit_log_entity_idx    ON audit_log(entity, entity_id);
CREATE INDEX IF NOT EXISTS audit_log_user_idx      ON audit_log(user_email, ts DESC);

-- ── Trigger: updated_at ──
CREATE OR REPLACE FUNCTION set_updated_at() RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

DO $$
DECLARE tbl TEXT;
BEGIN
  FOREACH tbl IN ARRAY ARRAY[
    'projects','tasks','warehouse_items','stock_transactions',
    'costs','qaqc','risks','actions','documents','resources','procurement'
  ] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_%1$s_updated_at ON %1$s', tbl);
    EXECUTE format('CREATE TRIGGER trg_%1$s_updated_at BEFORE UPDATE ON %1$s FOR EACH ROW EXECUTE FUNCTION set_updated_at()', tbl);
  END LOOP;
END $$;

-- ── Seed: an initial admin ──
-- Replace this with the real admin's email before running in production.
INSERT INTO users (email, name, role)
VALUES ('admin@example.com', 'Initial Admin', 'admin')
ON CONFLICT (email) DO NOTHING;

COMMIT;

-- Schema version marker for future migrations
CREATE TABLE IF NOT EXISTS schema_version (
    version    INT PRIMARY KEY,
    applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
INSERT INTO schema_version (version) VALUES (1) ON CONFLICT DO NOTHING;
