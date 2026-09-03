-- 009 — grant the app role privileges on ALL tables, and auto-grant future ones.
--
-- Root cause of the Batch 6 "permission denied for table ..." failures
-- (SQLSTATE 42501, seen on warehouse_locations and business_units):
-- migrations run as the postgres SUPERUSER, so every table they create is
-- OWNED BY postgres. The API connects as the app role (proc_master, via
-- DATABASE_URL) which has NO privileges on a table until explicitly granted.
-- Batches 1–5 were granted by hand at install; Batch 6's tables were created
-- later and never granted, so the app could read/write everything EXCEPT the
-- 12 Batch 6 tables — which is exactly the symptom.
--
-- This migration fixes it for good:
--   1. grants the app role full DML on every EXISTING table + sequence, and
--   2. sets DEFAULT PRIVILEGES so any table/sequence postgres creates in this
--      schema from now on is automatically granted to the app role — so a
--      future batch can never reintroduce this.
--
-- Idempotent — safe to re-run.
--
-- Apply as postgres superuser:
--   psql -U postgres -d proc_master -f 009-grant-app-privileges.sql
--
-- NOTE: the app role is assumed to be "proc_master". If your DATABASE_URL uses
-- a different role, replace proc_master below (4 places) before running. To
-- check the role the API actually connects as:
--   (Get-Content C:\ProcMaster\.env | Select-String DATABASE_URL)

BEGIN;

-- 1. Existing objects ------------------------------------------------------
GRANT USAGE ON SCHEMA public TO proc_master;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES    IN SCHEMA public TO proc_master;
GRANT USAGE, SELECT, UPDATE          ON ALL SEQUENCES IN SCHEMA public TO proc_master;

-- 2. Future objects created by postgres in this schema --------------------
--    (migrations run as postgres, so this covers every future batch)
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO proc_master;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  GRANT USAGE, SELECT, UPDATE ON SEQUENCES TO proc_master;

COMMIT;

-- ── Self-verification: the app role's grants on the Batch 6 tables ──
-- Expect 4 rows (SELECT/INSERT/UPDATE/DELETE) per table listed.
SELECT table_name, string_agg(privilege_type, ', ' ORDER BY privilege_type) AS privileges
FROM information_schema.role_table_grants
WHERE grantee = 'proc_master'
  AND table_name IN ('warehouse_locations','business_units','third_party','trades',
      'project_team','daily_meeting_logs','progress','kpi_data','calendar',
      'asset_history','asset_utilization','library_docs')
GROUP BY table_name
ORDER BY table_name;
