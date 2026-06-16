-- Coaching Automation Run Log
--
-- One row per evaluation sweep of the coaching automations worker (the daily
-- cron, a manual "Run now", or a dry-run preview). Without this, a failed or
-- empty run left no trace — the route computed a rich summary and threw it away.
-- The admin "Run history" panel reads from here so an ACPD can see, at a glance,
-- that the worker ran, what it sent, and whether anything errored.

CREATE TABLE IF NOT EXISTS coaching_automation_runs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  trigger TEXT NOT NULL DEFAULT 'cron',         -- cron | manual | dry_run
  ok BOOLEAN NOT NULL DEFAULT true,             -- false if any leader errored
  eligible_leaders INTEGER NOT NULL DEFAULT 0,
  sent_count INTEGER NOT NULL DEFAULT 0,
  sent_by_kind JSONB NOT NULL DEFAULT '{}'::jsonb,
  errors JSONB NOT NULL DEFAULT '[]'::jsonb,
  duration_ms INTEGER,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finished_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE coaching_automation_runs ENABLE ROW LEVEL SECURITY;
-- No browser-facing policies: read/write happens through server routes using the
-- service-role client (the worker writes; the admin page reads via an ACPD route).

CREATE INDEX IF NOT EXISTS coaching_automation_runs_started_idx
  ON coaching_automation_runs (started_at DESC);

COMMENT ON TABLE coaching_automation_runs IS 'One row per coaching automations sweep (cron, manual, or dry_run). Powers the admin Run history panel and makes failed/empty runs visible.';
