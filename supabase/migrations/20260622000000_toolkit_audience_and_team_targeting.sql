-- Teams Toolkit content separation + team-aware targeting.
--
-- Adds an `audience` discriminator ('circle' | 'host_team') to the three toolkit
-- content surfaces so the Circle Leader Toolkit and the Teams Toolkit no longer
-- share Message Center messages, the Resources doc, or Leader Messages.
--
-- Teams Message Center / Leader Messages also gain combinable Campus + Team +
-- Position targeting (audience_filters) and Leader Messages gains a delivery
-- date range. Existing rows default to 'circle', so the Circles Toolkit is
-- unchanged.

-- ---------------------------------------------------------------------------
-- Message Center
-- ---------------------------------------------------------------------------
ALTER TABLE circle_summary_messages
  ADD COLUMN IF NOT EXISTS audience TEXT NOT NULL DEFAULT 'circle'
    CHECK (audience IN ('circle', 'host_team')),
  -- Combinable AND filters for host_team messages: { campuses, teams, positions }.
  -- NULL for circle messages (they use campus_filter as before).
  ADD COLUMN IF NOT EXISTS audience_filters JSONB;

CREATE INDEX IF NOT EXISTS circle_summary_messages_audience_idx
  ON circle_summary_messages (audience, priority DESC);

-- ---------------------------------------------------------------------------
-- Leader Messages (inbox)
-- ---------------------------------------------------------------------------
ALTER TABLE circle_summary_inbox_messages
  ADD COLUMN IF NOT EXISTS audience TEXT NOT NULL DEFAULT 'circle'
    CHECK (audience IN ('circle', 'host_team')),
  ADD COLUMN IF NOT EXISTS audience_filters JSONB,
  -- Teams date-range delivery: delivered once at delivery_start; delivery_end
  -- bounds the window (a message past its end is not auto-delivered).
  ADD COLUMN IF NOT EXISTS delivery_start DATE,
  ADD COLUMN IF NOT EXISTS delivery_end DATE;

CREATE INDEX IF NOT EXISTS circle_summary_inbox_messages_audience_idx
  ON circle_summary_inbox_messages (audience);

-- ---------------------------------------------------------------------------
-- Resources (one HTML doc per audience instead of a single global singleton)
-- ---------------------------------------------------------------------------
ALTER TABLE circle_leader_resources
  ADD COLUMN IF NOT EXISTS audience TEXT NOT NULL DEFAULT 'circle'
    CHECK (audience IN ('circle', 'host_team'));

-- Existing singleton row becomes the circle audience doc.
UPDATE circle_leader_resources SET audience = 'circle' WHERE audience IS NULL;

-- One resources doc per audience.
CREATE UNIQUE INDEX IF NOT EXISTS circle_leader_resources_audience_idx
  ON circle_leader_resources (audience);
