-- Campaign favorites
--
-- Admins can star a campaign to pin it in a Favorites section at the top of
-- the Campaigns page. Favorites are shared across the ACPD team, matching the
-- team-shared campaign model (same soft-flag pattern as archived_at).

ALTER TABLE follow_up_campaigns ADD COLUMN IF NOT EXISTS favorited_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS follow_up_campaigns_favorited_idx
  ON follow_up_campaigns (favorited_at) WHERE favorited_at IS NOT NULL;

COMMENT ON COLUMN follow_up_campaigns.favorited_at IS
  'NULL = not favorited. Set = pinned to the Favorites section on the Campaigns page (shared across the team).';
