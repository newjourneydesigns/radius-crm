-- Group -> campus mapping for Follow-Up Campaigns
--
-- Reconcile stamps a "Campus" attribute on every person based on the CCB group
-- they were invited through, so campus becomes a filterable/summarizable
-- dimension on every tab. The campus is auto-guessed from the group name
-- (LVT -> Lewisville, GVT -> Gainesville, FMT -> Flower Mound, DNT -> Denton);
-- this column stores per-group admin overrides: { "<group_id>": "<campus>" }.

ALTER TABLE follow_up_campaigns
  ADD COLUMN IF NOT EXISTS group_campus_map JSONB NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN follow_up_campaigns.group_campus_map IS
  'Per-group campus overrides, keyed by CCB group id. A group with no entry falls back to auto-detection from its name.';
