-- Persistent Circle Summary leader sessions
-- Server-side only: public leader auth uses an opaque HTTP-only cookie, and
-- API routes validate that cookie through this table with the service role key.

ALTER TABLE circle_leaders
  ADD COLUMN IF NOT EXISTS circle_summary_access_enabled BOOLEAN NOT NULL DEFAULT TRUE;

UPDATE circle_leaders
SET circle_summary_access_enabled = FALSE
WHERE LOWER(COALESCE(status, '')) IN ('archive', 'archived');

CREATE TABLE IF NOT EXISTS leader_sessions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  leader_id BIGINT NOT NULL REFERENCES circle_leaders(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  user_agent TEXT,
  ip INET,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  revoked_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS leader_sessions_leader_idx
  ON leader_sessions (leader_id, created_at DESC);

CREATE INDEX IF NOT EXISTS leader_sessions_active_idx
  ON leader_sessions (leader_id, last_seen_at DESC)
  WHERE revoked_at IS NULL;

ALTER TABLE leader_sessions ENABLE ROW LEVEL SECURITY;

-- No anon/authenticated policies are added. Circle Summary public auth routes
-- read and write sessions exclusively through the server-side service role.
