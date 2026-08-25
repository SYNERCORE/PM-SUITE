-- Batch 5 — the Item Master inventory pools.
-- These are the catalog/register arrays the app has always kept in
-- localStorage + SharePoint: consumables (~1,316), tools (~642), materials,
-- equipment, and vehicles. Warehouse STOCK records (warehouse_items) and
-- their transactions were migrated earlier; these five are the master lists
-- those stock records and allocations point back to.
--
-- Apply as postgres superuser:
--   psql -U postgres -d proc_master -f 006-batch5-inventory-pools.sql
-- Idempotent — safe to re-run.
--
-- Generated columns must be strictly IMMUTABLE (see 003): ::NUMERIC with a
-- regex guard is, date parsing is not, so any date stays inside the JSONB.
-- project_id is a PLAIN column (not generated) wherever the route lifts it,
-- and never a foreign key — migration pushes rows device by device and a
-- child can legitimately arrive before its parent project.

BEGIN;

-- ── equipment ──
CREATE TABLE IF NOT EXISTS equipment (
    id             TEXT PRIMARY KEY,
    project_id     TEXT,
    data           JSONB NOT NULL,
    eq_status      TEXT GENERATED ALWAYS AS (data->>'status')   STORED,
    category       TEXT GENERATED ALWAYS AS (data->>'category') STORED,
    daily_rate     NUMERIC GENERATED ALWAYS AS (
      CASE WHEN data->>'dailyRate' ~ '^-?[0-9]+(\.[0-9]+)?$'
           THEN (data->>'dailyRate')::NUMERIC ELSE NULL END) STORED,
    deleted        BOOLEAN NOT NULL DEFAULT FALSE,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by     TEXT REFERENCES users(email),
    updated_by     TEXT REFERENCES users(email)
);
CREATE INDEX IF NOT EXISTS equipment_project_idx ON equipment(project_id);
CREATE INDEX IF NOT EXISTS equipment_status_idx  ON equipment(eq_status);
CREATE INDEX IF NOT EXISTS equipment_updated_idx ON equipment(updated_at DESC);
CREATE INDEX IF NOT EXISTS equipment_deleted_idx ON equipment(deleted);
CREATE INDEX IF NOT EXISTS equipment_data_gin    ON equipment USING GIN (data);

-- ── tools ──
CREATE TABLE IF NOT EXISTS tools (
    id             TEXT PRIMARY KEY,
    project_id     TEXT,
    data           JSONB NOT NULL,
    tool_status    TEXT GENERATED ALWAYS AS (data->>'status')   STORED,
    category       TEXT GENERATED ALWAYS AS (data->>'category') STORED,
    deleted        BOOLEAN NOT NULL DEFAULT FALSE,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by     TEXT REFERENCES users(email),
    updated_by     TEXT REFERENCES users(email)
);
CREATE INDEX IF NOT EXISTS tools_project_idx ON tools(project_id);
CREATE INDEX IF NOT EXISTS tools_status_idx  ON tools(tool_status);
CREATE INDEX IF NOT EXISTS tools_updated_idx ON tools(updated_at DESC);
CREATE INDEX IF NOT EXISTS tools_deleted_idx ON tools(deleted);
CREATE INDEX IF NOT EXISTS tools_data_gin    ON tools USING GIN (data);

-- ── vehicles ──
CREATE TABLE IF NOT EXISTS vehicles (
    id             TEXT PRIMARY KEY,
    project_id     TEXT,
    data           JSONB NOT NULL,
    veh_status     TEXT GENERATED ALWAYS AS (data->>'status')   STORED,
    category       TEXT GENERATED ALWAYS AS (data->>'category') STORED,
    deleted        BOOLEAN NOT NULL DEFAULT FALSE,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by     TEXT REFERENCES users(email),
    updated_by     TEXT REFERENCES users(email)
);
CREATE INDEX IF NOT EXISTS vehicles_project_idx ON vehicles(project_id);
CREATE INDEX IF NOT EXISTS vehicles_status_idx  ON vehicles(veh_status);
CREATE INDEX IF NOT EXISTS vehicles_updated_idx ON vehicles(updated_at DESC);
CREATE INDEX IF NOT EXISTS vehicles_deleted_idx ON vehicles(deleted);
CREATE INDEX IF NOT EXISTS vehicles_data_gin    ON vehicles USING GIN (data);

-- ── consumables ──
-- Catalog items (no project scope). Kept as a filterable pool by category.
CREATE TABLE IF NOT EXISTS consumables (
    id             TEXT PRIMARY KEY,
    data           JSONB NOT NULL,
    category       TEXT GENERATED ALWAYS AS (data->>'category') STORED,
    unit_cost      NUMERIC GENERATED ALWAYS AS (
      CASE WHEN data->>'unitCost' ~ '^-?[0-9]+(\.[0-9]+)?$'
           THEN (data->>'unitCost')::NUMERIC ELSE NULL END) STORED,
    min_stock      NUMERIC GENERATED ALWAYS AS (
      CASE WHEN data->>'minStock' ~ '^-?[0-9]+(\.[0-9]+)?$'
           THEN (data->>'minStock')::NUMERIC ELSE NULL END) STORED,
    deleted        BOOLEAN NOT NULL DEFAULT FALSE,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by     TEXT REFERENCES users(email),
    updated_by     TEXT REFERENCES users(email)
);
CREATE INDEX IF NOT EXISTS consumables_category_idx ON consumables(category);
CREATE INDEX IF NOT EXISTS consumables_updated_idx  ON consumables(updated_at DESC);
CREATE INDEX IF NOT EXISTS consumables_deleted_idx  ON consumables(deleted);
CREATE INDEX IF NOT EXISTS consumables_data_gin     ON consumables USING GIN (data);

-- ── materials ──
-- Project-scoped material lines (name, qty, unit, cost, status, supplier).
CREATE TABLE IF NOT EXISTS materials (
    id             TEXT PRIMARY KEY,
    project_id     TEXT,
    data           JSONB NOT NULL,
    mat_status     TEXT GENERATED ALWAYS AS (data->>'status')   STORED,
    category       TEXT GENERATED ALWAYS AS (data->>'category') STORED,
    unit_cost      NUMERIC GENERATED ALWAYS AS (
      CASE WHEN data->>'unitCost' ~ '^-?[0-9]+(\.[0-9]+)?$'
           THEN (data->>'unitCost')::NUMERIC ELSE NULL END) STORED,
    deleted        BOOLEAN NOT NULL DEFAULT FALSE,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by     TEXT REFERENCES users(email),
    updated_by     TEXT REFERENCES users(email)
);
CREATE INDEX IF NOT EXISTS materials_project_idx ON materials(project_id);
CREATE INDEX IF NOT EXISTS materials_status_idx  ON materials(mat_status);
CREATE INDEX IF NOT EXISTS materials_updated_idx ON materials(updated_at DESC);
CREATE INDEX IF NOT EXISTS materials_deleted_idx ON materials(deleted);
CREATE INDEX IF NOT EXISTS materials_data_gin    ON materials USING GIN (data);

COMMIT;
