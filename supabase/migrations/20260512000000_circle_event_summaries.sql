-- Circle Event Summaries feature
-- Adds tables for: leader-submitted event summaries, drafts, admin-configurable
-- dynamic questions, manual roster additions, and circle info-update requests.

-- ============================================================================
-- 1. circle_event_summaries — audit/history of every submission
-- ============================================================================
CREATE TABLE IF NOT EXISTS circle_event_summaries (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  leader_id BIGINT REFERENCES circle_leaders(id) ON DELETE CASCADE,
  ccb_event_id TEXT NOT NULL,
  ccb_group_id TEXT,
  occurrence TIMESTAMPTZ NOT NULL,
  did_not_meet BOOLEAN NOT NULL DEFAULT FALSE,
  did_not_meet_reason TEXT,
  topic TEXT,
  notes TEXT,
  prayer_requests TEXT,
  info TEXT,
  attendee_ccb_ids TEXT[] DEFAULT '{}',
  manual_attendees JSONB DEFAULT '[]',
  dynamic_responses JSONB DEFAULT '{}',
  info_update_requested JSONB,
  ccb_submitted_at TIMESTAMPTZ,
  ccb_response JSONB,
  ccb_error TEXT,
  status TEXT NOT NULL DEFAULT 'submitted' CHECK (status IN ('submitted', 'failed', 'retrying')),
  submitted_via TEXT NOT NULL DEFAULT 'public_link',
  client_ip TEXT,
  user_agent TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS circle_event_summaries_unique_occurrence
  ON circle_event_summaries (leader_id, ccb_event_id, occurrence);
CREATE INDEX IF NOT EXISTS circle_event_summaries_leader_idx
  ON circle_event_summaries (leader_id, occurrence DESC);
CREATE INDEX IF NOT EXISTS circle_event_summaries_status_idx
  ON circle_event_summaries (status, occurrence DESC);

-- ============================================================================
-- 2. circle_event_summary_drafts — in-progress drafts (one per leader+event+occur)
-- ============================================================================
CREATE TABLE IF NOT EXISTS circle_event_summary_drafts (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  leader_id BIGINT REFERENCES circle_leaders(id) ON DELETE CASCADE,
  ccb_event_id TEXT NOT NULL,
  occurrence TIMESTAMPTZ NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}',
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS circle_event_summary_drafts_unique
  ON circle_event_summary_drafts (leader_id, ccb_event_id, occurrence);

-- ============================================================================
-- 3. dynamic_questions — admin-configurable questions for the submission form
-- ============================================================================
CREATE TABLE IF NOT EXISTS dynamic_questions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  label TEXT NOT NULL,
  help_text TEXT,
  field_type TEXT NOT NULL CHECK (field_type IN ('text', 'textarea', 'dropdown', 'multiselect', 'checkbox', 'radio')),
  options JSONB DEFAULT '[]',
  required BOOLEAN NOT NULL DEFAULT FALSE,
  active_from DATE,
  active_to DATE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  show_when_did_not_meet BOOLEAN NOT NULL DEFAULT FALSE,
  show_when_attended BOOLEAN NOT NULL DEFAULT TRUE,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS dynamic_questions_sort_idx
  ON dynamic_questions (sort_order);
CREATE INDEX IF NOT EXISTS dynamic_questions_active_window_idx
  ON dynamic_questions (active_from, active_to);

-- ============================================================================
-- 4. manual_roster_additions — people added during submission but not in CCB
-- ============================================================================
CREATE TABLE IF NOT EXISTS manual_roster_additions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  summary_id UUID REFERENCES circle_event_summaries(id) ON DELETE CASCADE,
  leader_id BIGINT REFERENCES circle_leaders(id) ON DELETE CASCADE,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  phone TEXT,
  email TEXT,
  attended BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS manual_roster_additions_leader_idx
  ON manual_roster_additions (leader_id);

-- ============================================================================
-- 5. circle_info_update_requests — meeting day/time/location changes for ACPD review
-- ============================================================================
CREATE TABLE IF NOT EXISTS circle_info_update_requests (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  summary_id UUID REFERENCES circle_event_summaries(id) ON DELETE CASCADE,
  leader_id BIGINT REFERENCES circle_leaders(id) ON DELETE CASCADE,
  existing_day TEXT,
  existing_time TEXT,
  existing_location TEXT,
  proposed_day TEXT,
  proposed_time TEXT,
  proposed_location TEXT,
  reviewed_at TIMESTAMPTZ,
  reviewed_by UUID REFERENCES users(id),
  review_action TEXT CHECK (review_action IN ('applied', 'rejected', 'deferred')),
  review_notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS circle_info_update_requests_pending_idx
  ON circle_info_update_requests (created_at DESC)
  WHERE reviewed_at IS NULL;

-- ============================================================================
-- 6. leader_otp_codes — short-lived 6-digit codes emailed to leaders
-- ============================================================================
CREATE TABLE IF NOT EXISTS leader_otp_codes (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  leader_id BIGINT REFERENCES circle_leaders(id) ON DELETE CASCADE,
  code_hash TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  consumed_at TIMESTAMPTZ,
  request_ip TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS leader_otp_codes_leader_idx
  ON leader_otp_codes (leader_id, created_at DESC);
CREATE INDEX IF NOT EXISTS leader_otp_codes_active_idx
  ON leader_otp_codes (expires_at)
  WHERE consumed_at IS NULL;

-- ============================================================================
-- RLS
-- ============================================================================
ALTER TABLE circle_event_summaries ENABLE ROW LEVEL SECURITY;
ALTER TABLE circle_event_summary_drafts ENABLE ROW LEVEL SECURITY;
ALTER TABLE dynamic_questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE manual_roster_additions ENABLE ROW LEVEL SECURITY;
ALTER TABLE circle_info_update_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE leader_otp_codes ENABLE ROW LEVEL SECURITY;

-- Authenticated RADIUS users (admins) can read everything
CREATE POLICY "Authenticated read circle_event_summaries" ON circle_event_summaries
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated read drafts" ON circle_event_summary_drafts
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated read manual roster" ON manual_roster_additions
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated read info requests" ON circle_info_update_requests
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated read otp_codes" ON leader_otp_codes
  FOR SELECT TO authenticated USING (true);

-- Dynamic questions: anyone authenticated can read; only admins write
CREATE POLICY "Authenticated read dynamic_questions" ON dynamic_questions
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admin manage dynamic_questions" ON dynamic_questions
  FOR ALL TO authenticated USING (
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role::text = 'ACPD')
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role::text = 'ACPD')
  );

-- Admins can manage info update requests (review them)
CREATE POLICY "Admin manage info requests" ON circle_info_update_requests
  FOR UPDATE TO authenticated USING (
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role::text = 'ACPD')
  );

-- All write paths from the public link go through server-side API routes that
-- use the service role key. No public RLS write policies needed here.

-- ============================================================================
-- updated_at trigger
-- ============================================================================
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS set_updated_at_circle_event_summaries ON circle_event_summaries;
CREATE TRIGGER set_updated_at_circle_event_summaries
  BEFORE UPDATE ON circle_event_summaries
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS set_updated_at_dynamic_questions ON dynamic_questions;
CREATE TRIGGER set_updated_at_dynamic_questions
  BEFORE UPDATE ON dynamic_questions
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
