-- Editable coaching automation message templates.
--
-- One row per automation kind holds the admin-edited title + body (with
-- {{placeholders}}). When a row is absent, the app falls back to the built-in
-- copy in lib/circle-leader-toolkit/coaching/templates.ts, so this table is
-- purely an override layer.

CREATE TABLE IF NOT EXISTS coaching_automation_templates (
  automation_kind TEXT PRIMARY KEY,   -- multiplication | new_member | inactivity | birthday | did_not_meet | first_time
  title TEXT NOT NULL,
  body_html TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL
);
ALTER TABLE coaching_automation_templates ENABLE ROW LEVEL SECURITY;
-- No browser-facing policies: read/write through server routes (cron read,
-- ACPD admin write) using the service-role client.
COMMENT ON TABLE coaching_automation_templates IS 'Admin overrides for coaching nudge copy, keyed by automation kind. Missing row = use the built-in default template.';
