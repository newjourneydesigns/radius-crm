-- Point-in-time leader attributes on weekly event-summary snapshots.
--
-- A leader's status/campus/circle_type/acpd are temporal facts, but the snapshot
-- only recorded the event_summary_state. Reporting therefore had to fall back to
-- the leader's *current* attributes when describing a *past* week — so a leader
-- who was active-but-unreported in March and is paused today would drop out of
-- March's expected set, overstating historical compliance.
--
-- We capture the leader's attributes onto each snapshot row at write time via a
-- trigger, so every existing and future snapshot writer is covered without app
-- changes. Reporting then reads these as-of-the-week values.

ALTER TABLE event_summary_snapshots
  ADD COLUMN IF NOT EXISTS leader_status TEXT,
  ADD COLUMN IF NOT EXISTS campus TEXT,
  ADD COLUMN IF NOT EXISTS circle_type TEXT,
  ADD COLUMN IF NOT EXISTS acpd TEXT;

-- BEFORE INSERT OR UPDATE: fill any unset attribute from the leader's current
-- value. On INSERT the columns are NULL, so they capture "as of now". On UPDATE
-- the columns already hold the originally-captured value (Postgres carries old
-- column values into NEW when the UPDATE statement doesn't touch them), so a
-- later edit to a past week's state will NOT rewrite its historical attributes.
CREATE OR REPLACE FUNCTION capture_snapshot_leader_attributes()
RETURNS TRIGGER AS $$
BEGIN
  NEW.leader_status := COALESCE(NEW.leader_status, (SELECT status FROM circle_leaders WHERE id = NEW.circle_leader_id));
  NEW.campus        := COALESCE(NEW.campus,        (SELECT campus FROM circle_leaders WHERE id = NEW.circle_leader_id));
  NEW.circle_type   := COALESCE(NEW.circle_type,   (SELECT circle_type FROM circle_leaders WHERE id = NEW.circle_leader_id));
  NEW.acpd          := COALESCE(NEW.acpd,          (SELECT acpd FROM circle_leaders WHERE id = NEW.circle_leader_id));
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_capture_snapshot_leader_attributes ON event_summary_snapshots;
CREATE TRIGGER trg_capture_snapshot_leader_attributes
  BEFORE INSERT OR UPDATE ON event_summary_snapshots
  FOR EACH ROW EXECUTE FUNCTION capture_snapshot_leader_attributes();

-- One-time best-effort backfill for snapshots captured before this migration.
-- These rows predate point-in-time capture, so we can only approximate them with
-- the leader's CURRENT attributes — this is not truly historical, it just gives
-- reporting something to read for old weeks instead of NULL.
UPDATE event_summary_snapshots s
SET leader_status = COALESCE(s.leader_status, cl.status),
    campus        = COALESCE(s.campus, cl.campus),
    circle_type   = COALESCE(s.circle_type, cl.circle_type),
    acpd          = COALESCE(s.acpd, cl.acpd)
FROM circle_leaders cl
WHERE cl.id = s.circle_leader_id;
