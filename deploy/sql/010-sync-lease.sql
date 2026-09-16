-- 010 — SharePoint reconciler lease (distributed, admin-coordinated sync).
--
-- Why this exists:
--   Off-site users read the app straight from SharePoint, so the LAN Postgres
--   and the SharePoint mirror must be reconciled periodically (two-way merge,
--   last-write-wins by _mAt). We want ANY admin device that is on the LAN AND
--   has internet to be able to do that reconcile — but exactly ONE at a time,
--   or they'd storm SharePoint and fight each other's writes.
--
--   This single-row table is that coordination point. An eligible device
--   (Server-First ON + admin + online + SP connected) asks the server for the
--   lease; the server hands it out atomically with a short TTL (~90s). The
--   holder renews every cycle while it works; if it goes away (tab closed,
--   laptop sleeps, internet drops) the lease simply expires and the next
--   eligible device picks it up. No device is special — this is automatic
--   failover with no single point of truth on the client side.
--
--   last_sync_at records when a full SharePoint reconcile last COMPLETED, so a
--   fresh lease holder can tell whether a sync is actually due (>= ~15 min)
--   rather than re-pushing on every hand-off.
--
-- Apply as postgres superuser:
--   psql -U postgres -d proc_master -f 010-sync-lease.sql
-- Idempotent — safe to re-run.
--
-- NOTE: 009 set ALTER DEFAULT PRIVILEGES so tables postgres creates here are
-- auto-granted to the app role (proc_master). The explicit GRANT below is a
-- belt-and-suspenders repeat in case 010 is applied on a box where 009 wasn't.

BEGIN;

CREATE TABLE IF NOT EXISTS sync_lease (
    id            TEXT PRIMARY KEY,        -- lease name; we use 'sharepoint'
    holder        TEXT,                    -- opaque device id currently holding it
    holder_email  TEXT,                    -- who (for visibility / debugging)
    acquired_at   TIMESTAMPTZ,             -- when the current holder first took it
    expires_at    TIMESTAMPTZ,             -- lease is free once NOW() > this
    last_sync_at  TIMESTAMPTZ,             -- when a full SP reconcile last completed
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Seed the single row we coordinate on. ON CONFLICT keeps an existing lease.
INSERT INTO sync_lease (id) VALUES ('sharepoint') ON CONFLICT (id) DO NOTHING;

-- Belt-and-suspenders grant (see NOTE above).
GRANT SELECT, INSERT, UPDATE, DELETE ON sync_lease TO proc_master;

INSERT INTO schema_version (version) VALUES (8) ON CONFLICT DO NOTHING;

COMMIT;

-- ── Self-verification ──
SELECT version FROM schema_version ORDER BY version;
SELECT id, holder, holder_email, expires_at, last_sync_at FROM sync_lease;
