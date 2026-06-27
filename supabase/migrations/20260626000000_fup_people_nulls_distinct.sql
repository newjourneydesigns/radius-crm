-- Fix the follow_up_campaign_people uniqueness rule for rows without a CCB id.
--
-- The original constraint was `UNIQUE NULLS NOT DISTINCT (campaign_id,
-- ccb_individual_id)`, which contradicts its own comment ("each NULL is distinct
-- ... the correct behavior for form-only rows"). NULLS NOT DISTINCT treats two
-- NULLs as equal, so only ONE row per campaign may have a null ccb_individual_id.
-- That breaks pasted rosters and form-only people that legitimately have no CCB id.
--
-- Switch to NULLS DISTINCT so multiple null-id rows can coexist, while still
-- enforcing one row per (campaign, ccb_individual_id) for real CCB ids. The
-- reconcile upsert targets these same columns, so onConflict still resolves here.

DO $$
DECLARE
  con record;
BEGIN
  FOR con IN
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'follow_up_campaign_people'::regclass
      AND contype = 'u'
  LOOP
    EXECUTE format('ALTER TABLE follow_up_campaign_people DROP CONSTRAINT %I', con.conname);
  END LOOP;
END $$;

ALTER TABLE follow_up_campaign_people
  ADD CONSTRAINT follow_up_campaign_people_campaign_ccb_key
  UNIQUE NULLS DISTINCT (campaign_id, ccb_individual_id);
