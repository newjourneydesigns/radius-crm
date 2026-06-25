-- Follow-Up Campaigns
--
-- Admins create a campaign by pointing it at a CCB group (who is expected to
-- submit) and a CCB form (who actually submitted). Radius reconciles the two
-- lists and surfaces missing people for bulk follow-up. Campaigns are stored
-- in Supabase so they are shared across the whole ACPD team.
--
-- This migration adds:
--   1. follow_up_campaigns        — one campaign per group+form pair
--   2. follow_up_campaign_people  — one row per person per campaign

-- Shared updated_at trigger (defensive: also created by earlier migrations)
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 1. Campaign headers ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS follow_up_campaigns (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,

  -- Admin-supplied config
  name              TEXT NOT NULL,
  ccb_group_id      TEXT NOT NULL,
  ccb_form_id       TEXT NOT NULL,
  -- Explicitly stored so {{form_link}} is always available in message templates
  form_link         TEXT NOT NULL DEFAULT '',
  due_date          DATE NOT NULL,
  message_template  TEXT NOT NULL DEFAULT '',

  -- Cached counts, updated after each reconcile run
  last_reconciled_at TIMESTAMPTZ,
  expected_count     INTEGER,
  submitted_count    INTEGER,
  missing_count      INTEGER,
  completion_pct     NUMERIC(5,2),

  -- Soft delete: NULL = active, set = archived (can be restored)
  archived_at        TIMESTAMPTZ,

  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE follow_up_campaigns ENABLE ROW LEVEL SECURITY;

-- No browser-facing write policies — all mutations go through server routes
-- with the service-role client. Read is open to any signed-in RADIUS user.
CREATE POLICY "Authenticated users can read follow_up_campaigns"
  ON follow_up_campaigns FOR SELECT TO authenticated USING (true);

CREATE INDEX IF NOT EXISTS follow_up_campaigns_created_at_idx
  ON follow_up_campaigns (created_at DESC);
CREATE INDEX IF NOT EXISTS follow_up_campaigns_archived_idx
  ON follow_up_campaigns (archived_at) WHERE archived_at IS NULL;

DROP TRIGGER IF EXISTS set_updated_at_follow_up_campaigns ON follow_up_campaigns;
CREATE TRIGGER set_updated_at_follow_up_campaigns
  BEFORE UPDATE ON follow_up_campaigns
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

COMMENT ON TABLE follow_up_campaigns IS
  'Admin-created follow-up campaigns. Each campaign reconciles a CCB group (expected) against a CCB form (submitted) and tracks follow-up outreach to non-submitters. Shared across the ACPD team.';

-- 2. Per-person reconciliation rows -------------------------------------------
CREATE TABLE IF NOT EXISTS follow_up_campaign_people (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  campaign_id UUID NOT NULL REFERENCES follow_up_campaigns(id) ON DELETE CASCADE,

  -- Identity fields sourced from CCB (group participant or form response or both)
  ccb_individual_id TEXT,
  first_name        TEXT NOT NULL DEFAULT '',
  last_name         TEXT NOT NULL DEFAULT '',
  -- Form-side names stored separately for needs_review rows so admins can
  -- compare group-side vs form-side name before confirming the match
  form_first_name   TEXT,
  form_last_name    TEXT,

  -- Contact info (normalized: phone digits only, e.g. "2145551234")
  email             TEXT,
  phone             TEXT,
  mobile_phone      TEXT,

  -- Which CCB sources contributed this person
  in_group BOOLEAN NOT NULL DEFAULT FALSE,
  in_form  BOOLEAN NOT NULL DEFAULT FALSE,

  -- Full raw form response payload so admins can read what people answered
  form_response_data JSONB,

  -- Reconciliation outcome — the canonical status bucket
  reconcile_status TEXT NOT NULL DEFAULT 'expected'
    CHECK (reconcile_status IN (
      'expected',               -- in group only, reconcile not yet run
      'submitted',              -- matched: in both group and form
      'missing',                -- in group but NOT in form responses
      'submitted_not_in_group', -- in form but NOT in the group
      'needs_review',           -- fuzzy name match, human confirmation needed
      'contacted'               -- admin marked as followed up
    )),

  -- How the match was made (null for unmatched/form-only rows)
  match_method TEXT CHECK (match_method IN ('ccb_id', 'email', 'phone', 'fuzzy', null)),

  -- Admin follow-up tracking
  contact_note  TEXT,
  contacted_at  TIMESTAMPTZ,
  contacted_by  UUID REFERENCES users(id) ON DELETE SET NULL,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- NULL ccb_individual_ids are exempt from the uniqueness check (each NULL is
  -- distinct in PostgreSQL, which is the correct behavior for form-only rows)
  UNIQUE NULLS NOT DISTINCT (campaign_id, ccb_individual_id)
);

ALTER TABLE follow_up_campaign_people ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read follow_up_campaign_people"
  ON follow_up_campaign_people FOR SELECT TO authenticated USING (true);

CREATE INDEX IF NOT EXISTS fup_people_campaign_status_idx
  ON follow_up_campaign_people (campaign_id, reconcile_status);
CREATE INDEX IF NOT EXISTS fup_people_campaign_ccb_idx
  ON follow_up_campaign_people (campaign_id, ccb_individual_id)
  WHERE ccb_individual_id IS NOT NULL;

DROP TRIGGER IF EXISTS set_updated_at_fup_people ON follow_up_campaign_people;
CREATE TRIGGER set_updated_at_fup_people
  BEFORE UPDATE ON follow_up_campaign_people
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

COMMENT ON TABLE follow_up_campaign_people IS
  'One row per person per campaign. Populated and updated by the reconcile API route. reconcile_status is the canonical bucket. form_response_data holds the full CCB form response for submitted people.';
