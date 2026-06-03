-- Submission window for the Leadership Snapshot. A single settings row holds the
-- open/close dates. While open, leaders can take/reassess; when closed they can
-- still view their past results but not submit. Admins can always add/edit
-- submissions from the back end (the RADIUS routes are not window-gated).
--
-- opens_on / closes_on are inclusive calendar dates (church-local). NULL means
-- "no bound" on that side, so both NULL = always open.

CREATE TABLE IF NOT EXISTS leadership_snapshot_settings (
  id INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1), -- singleton: only one row
  opens_on  DATE,
  closes_on DATE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

ALTER TABLE leadership_snapshot_settings ENABLE ROW LEVEL SECURITY;

-- No browser-facing policies. The window is read/written through server routes
-- (leader session for the read on submit; ACPD admin for edits) using the
-- service-role client.

COMMENT ON TABLE leadership_snapshot_settings IS 'Singleton row: Leadership Snapshot submission window (opens_on/closes_on). NULL = unbounded on that side.';
