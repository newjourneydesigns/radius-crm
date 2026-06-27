-- Free-form per-person attributes for follow_up_campaign_people.
--
-- A pasted roster can carry arbitrary columns (Campus, Team, Age, Birthdate, …)
-- beyond the core identity fields. We keep them all here as a JSON map keyed by
-- the spreadsheet header, so the campaign view can group/filter people by any
-- header the admin chooses, and switch the grouping dimension on the fly.

ALTER TABLE follow_up_campaign_people
  ADD COLUMN IF NOT EXISTS attributes JSONB;

COMMENT ON COLUMN follow_up_campaign_people.attributes IS
  'Free-form columns from a pasted roster (header -> value), e.g. {"Campus":"Flower Mound","Team":"Hosts"}. Used as group-able dimensions in the campaign view.';
