-- Batch 5 completion patch — triggers + schema_version 6.
-- Standalone and self-contained: run this if 006 was applied by an earlier
-- copy that lacked the trailing trigger block and schema_version marker
-- (tables already exist, but `SELECT ... FROM schema_version` tops out at 5
-- and no trg_*_updated_at triggers are present on the five pools).
--
-- Apply as postgres superuser:
--   psql -U postgres -d proc_master -f 007-batch5-triggers-and-version.sql
-- Idempotent — safe to re-run. Does not touch existing tables, indexes, or data.

BEGIN;

-- set_updated_at() is normally defined in 001. Re-assert it here so this
-- patch stands alone even if 001's function were somehow absent.
CREATE OR REPLACE FUNCTION set_updated_at() RETURNS TRIGGER AS $fn$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$fn$ LANGUAGE plpgsql;

-- Install the updated_at trigger on each Batch 5 pool that exists.
DO $$
DECLARE tbl TEXT;
BEGIN
  FOREACH tbl IN ARRAY ARRAY[
    'equipment','tools','vehicles','consumables','materials'
  ] LOOP
    IF to_regclass(tbl) IS NOT NULL THEN
      EXECUTE format('DROP TRIGGER IF EXISTS trg_%1$s_updated_at ON %1$s', tbl);
      EXECUTE format('CREATE TRIGGER trg_%1$s_updated_at BEFORE UPDATE ON %1$s FOR EACH ROW EXECUTE FUNCTION set_updated_at()', tbl);
    ELSE
      RAISE NOTICE 'Table % not found — skipped (run 006 first)', tbl;
    END IF;
  END LOOP;
END $$;

INSERT INTO schema_version (version) VALUES (6) ON CONFLICT DO NOTHING;

COMMIT;

-- ── Self-verification (prints immediately after the patch applies) ──
SELECT version, applied_at FROM schema_version ORDER BY version;

SELECT event_object_table, trigger_name
FROM information_schema.triggers
WHERE trigger_name LIKE 'trg_%_updated_at'
  AND event_object_table IN ('equipment','tools','vehicles','consumables','materials')
ORDER BY event_object_table;
