-- Follow-Up Campaigns
--
-- Admins create a campaign by pointing it at a CCB Group (who is *expected*
-- to submit) and a CCB Form (who *actually submitted*). Radius reconciles the
-- two lists and surfaces missing people for bulk follow-up.
--
-- Tables:
--   1. follow_up_campaigns        — one row per campaign
--   2. follow_up_campaign_people  — one row per person per campaign

-- Shared updated_at trigger (defensive: may already exist from prior migrations).
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 1. Campaign headers -----------------------------------------------------------
CREATE TABLE IF NOT EXISTS follow_up_campaigns (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by          UUID        REFERENCES users(id) ON DELETE SET NULL,

  name                TEXT        NOT NULL,
  ccb_group_id        TEXT        NOT NULL,
  ccb_form_id         TEXT        NOT NULL,
  -- Full URL to the CCB form pasted by the admin; substituted into {{form_link}}
  -- in message templates. Stored explicitly so it is never derived at send time.
  form_link           TEXT        NOT NULL DEFAULT '',
  due_date            DATE        NOT NULL,
  message_template    TEXT        NOT NULL DEFAULT '',

  -- NULL = active; set = soft-archived. Archived campaigns are hidden from the
  -- default list but can be restored at any time.
  archived_at         TIMESTAMPTZ,

  -- Cached aggregate counts written after each reconcile run.
  last_reconciled_at  TIMESTAMPTZ,
  expected_count      INTEGER,
  submitted_count     INTEGER,
  missing_count       INTEGER,
  not_in_group_count  INTEGER,
  needs_review_count  INTEGER,
  contacted_count     INTEGER,
  completion_pct      NUMERIC(5,2)
);

ALTER TABLE follow_up_campaigns ENABLE ROW LEVEL SECURITY;

-- All reads go through authenticated users. Writes are server-side via
-- service-role client only — no browser-facing INSERT/UPDATE policies needed.
CREATE POLICY "authenticated_read_follow_up_campaigns"
  ON follow_up_campaigns FOR SELECT TO authenticated USING (true);

CREATE INDEX IF NOT EXISTS follow_up_campaigns_created_at_idx
  ON follow_up_campaigns (created_at DESC);
CREATE INDEX IF NOT EXISTS follow_up_campaigns_archived_idx
  ON follow_up_campaigns (archived_at)
  WHERE archived_at IS NULL;

DROP TRIGGER IF EXISTS set_updated_at_follow_up_campaigns ON follow_up_campaigns;
CREATE TRIGGER set_updated_at_follow_up_campaigns
  BEFORE UPDATE ON follow_up_campaigns
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

COMMENT ON TABLE follow_up_campaigns IS
  'Admin-created follow-up campaigns that reconcile a CCB group (expected) against a CCB form (submitted). archived_at IS NOT NULL = soft-deleted.';

-- 2. Per-person reconciliation rows --------------------------------------------
CREATE TABLE IF NOT EXISTS follow_up_campaign_people (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id         UUID        NOT NULL REFERENCES follow_up_campaigns(id) ON DELETE CASCADE,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Identity sourced from CCB (group participant side, canonical)
  ccb_individual_id   TEXT,
  first_name          TEXT        NOT NULL DEFAULT '',
  last_name           TEXT        NOT NULL DEFAULT '',
  email               TEXT,
  phone               TEXT,         -- normalized digits (strip [^+\d], 10-digit US)
  mobile_phone        TEXT,

  -- For needs_review rows: the form-side name may differ from the group-side name.
  -- Stored here so admins can compare both versions side by side.
  form_first_name     TEXT,
  form_last_name      TEXT,

  -- Which CCB source contributed this person
  in_group            BOOLEAN     NOT NULL DEFAULT FALSE,
  in_form             BOOLEAN     NOT NULL DEFAULT FALSE,

  -- Full raw form response payload — rendered in the submission detail view.
  form_response_data  JSONB,

  -- Reconciliation outcome
  reconcile_status    TEXT        NOT NULL DEFAULT 'expected'
    CHECK (reconcile_status IN (
      'expected',               -- in group only, reconcile not yet run
      'submitted',              -- matched in both group and form
      'missing',                -- in group, NOT in form
      'submitted_not_in_group', -- in form only, no group match
      'needs_review',           -- fuzzy name match only, needs human confirmation
      'contacted'               -- admin manually marked as followed-up
    )),

  -- How the match was made (null = unmatched / group-only)
  match_method        TEXT
    CHECK (match_method IN ('ccb_id', 'email', 'phone', 'fuzzy', NULL)),

  -- Admin contact tracking
  contact_note        TEXT,
  contacted_at        TIMESTAMPTZ,
  contacted_by        UUID        REFERENCES users(id) ON DELETE SET NULL,

  -- Unique on (campaign_id, ccb_individual_id). PostgreSQL treats each NULL as
  -- distinct for unique constraints, so form-only rows with no CCB ID don't
  -- collide. DEFERRABLE to allow bulk upserts in a single transaction.
  UNIQUE (campaign_id, ccb_individual_id) DEFERRABLE INITIALLY DEFERRED
);

ALTER TABLE follow_up_campaign_people ENABLE ROW LEVEL SECURITY;

CREATE POLICY "authenticated_read_follow_up_campaign_people"
  ON follow_up_campaign_people FOR SELECT TO authenticated USING (true);

CREATE INDEX IF NOT EXISTS fup_people_campaign_status_idx
  ON follow_up_campaign_people (campaign_id, reconcile_status);
CREATE INDEX IF NOT EXISTS fup_people_campaign_ccb_id_idx
  ON follow_up_campaign_people (campaign_id, ccb_individual_id)
  WHERE ccb_individual_id IS NOT NULL;

DROP TRIGGER IF EXISTS set_updated_at_fup_people ON follow_up_campaign_people;
CREATE TRIGGER set_updated_at_fup_people
  BEFORE UPDATE ON follow_up_campaign_people
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

COMMENT ON TABLE follow_up_campaign_people IS
  'One row per person per campaign. reconcile_status is the canonical bucket. form_response_data holds the full CCB form payload for the submission detail view.';
