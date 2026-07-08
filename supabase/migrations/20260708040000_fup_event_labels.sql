-- Human-readable labels for a campaign's CCB events.
--
-- CCB Event IDs are opaque numbers, so admins can attach a note to each one
-- ("LVT Fuel the Fire 7/12") to remember what it is. Stored as a map keyed by
-- event id: { "16902": "LVT Fuel the Fire 7/12" }.

ALTER TABLE follow_up_campaigns
  ADD COLUMN IF NOT EXISTS ccb_event_labels JSONB NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN follow_up_campaigns.ccb_event_labels IS
  'Optional human-readable label per CCB event id, so admins can remember which event each id is.';
