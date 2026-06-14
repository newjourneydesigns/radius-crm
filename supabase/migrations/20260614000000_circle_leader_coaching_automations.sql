-- Circle Leader Coaching Automations
--
-- Proactive, life-giving coaching nudges delivered to a leader's in-app Toolkit
-- inbox when real roster/attendance signals fire (roster size, new members,
-- inactivity, birthdays, did-not-meet streaks, first-time attendees).
--
-- This migration adds:
--   1. circle_roster_cache.added_at  — per-member first-seen timestamp so we can
--      detect brand-new roster members (24h follow-up + first-time baseline).
--   2. coaching_automation_settings  — singleton row of org-wide default config.
--   3. circle_leaders.coaching_automation_overrides — sparse per-leader overrides.
--   4. coaching_automation_sends     — idempotency ledger (one nudge per occurrence).
--   5. circle_summary_inbox_messages.category — badge automated nudges in the inbox.

-- 1. Per-member add timestamp -------------------------------------------------
-- Existing rows are backfilled to the epoch so the very first post-deploy run can
-- never mass-fire "new member" nudges for people who were already on the roster.
-- The roster-refresh upsert must NOT include added_at in its payload: PostgreSQL
-- ON CONFLICT DO UPDATE only touches supplied columns, so existing members keep
-- their original added_at and only brand-new inserts receive NOW().
ALTER TABLE circle_roster_cache ADD COLUMN IF NOT EXISTS added_at TIMESTAMPTZ;
UPDATE circle_roster_cache SET added_at = '1970-01-01T00:00:00Z' WHERE added_at IS NULL;
ALTER TABLE circle_roster_cache ALTER COLUMN added_at SET DEFAULT NOW();
ALTER TABLE circle_roster_cache ALTER COLUMN added_at SET NOT NULL;
COMMENT ON COLUMN circle_roster_cache.added_at IS 'First time this member was seen on the roster. Set once on insert, never updated; epoch for pre-migration rows.';

-- 2. Global default config (singleton, mirrors leadership_snapshot_settings) ---
CREATE TABLE IF NOT EXISTS coaching_automation_settings (
  id INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  config JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL
);
ALTER TABLE coaching_automation_settings ENABLE ROW LEVEL SECURITY;
-- No browser-facing policies: read/write happens through server routes using the
-- service-role client (leader/cron read; ACPD admin write).
COMMENT ON TABLE coaching_automation_settings IS 'Singleton row: org-wide default thresholds for Circle Leader coaching automations. Per-leader overrides live on circle_leaders.coaching_automation_overrides.';

-- Seed the singleton row so the settings API always has a row to read/upsert.
INSERT INTO coaching_automation_settings (id, config) VALUES (1, '{}'::jsonb)
ON CONFLICT (id) DO NOTHING;

-- 3. Sparse per-leader overrides ----------------------------------------------
ALTER TABLE circle_leaders ADD COLUMN IF NOT EXISTS coaching_automation_overrides JSONB;
COMMENT ON COLUMN circle_leaders.coaching_automation_overrides IS 'Sparse per-leader overrides merged over coaching_automation_settings.config. NULL means use the org defaults.';

-- 4. Idempotency ledger (mirrors circle_reminder_sends) -----------------------
CREATE TABLE IF NOT EXISTS coaching_automation_sends (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  leader_id BIGINT NOT NULL REFERENCES circle_leaders(id) ON DELETE CASCADE,
  automation_kind TEXT NOT NULL,            -- multiplication | new_member | inactivity | birthday | did_not_meet | first_time
  subject_key TEXT NOT NULL,                -- per-member id or ISO-week bucket; guarantees one nudge per occurrence
  message_id UUID REFERENCES circle_summary_inbox_messages(id) ON DELETE SET NULL,
  sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (leader_id, automation_kind, subject_key)
);
ALTER TABLE coaching_automation_sends ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS coaching_automation_sends_leader_idx
  ON coaching_automation_sends (leader_id, automation_kind);
COMMENT ON TABLE coaching_automation_sends IS 'One row per delivered coaching nudge. UNIQUE(leader_id, automation_kind, subject_key) makes the daily worker idempotent.';

-- 5. Inbox message category (badge automated coaching nudges) ------------------
ALTER TABLE circle_summary_inbox_messages
  ADD COLUMN IF NOT EXISTS category TEXT NOT NULL DEFAULT 'message';
COMMENT ON COLUMN circle_summary_inbox_messages.category IS 'message (admin-authored) or coaching (automation-generated nudge).';
