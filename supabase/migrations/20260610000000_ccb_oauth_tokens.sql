-- CCB API v2 OAuth token storage
-- Single-row table holding the current access/refresh token pair for the
-- church's CCB v2 OAuth connection. Server-side only (service role) — no
-- client access is needed, so RLS is enabled with no policies, denying
-- anon/authenticated access entirely.

CREATE TABLE ccb_oauth_tokens (
  id integer PRIMARY KEY DEFAULT 1,
  access_token text NOT NULL,
  refresh_token text NOT NULL,
  token_type text NOT NULL DEFAULT 'Bearer',
  scope text,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ccb_oauth_tokens_singleton CHECK (id = 1)
);

ALTER TABLE ccb_oauth_tokens ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE ccb_oauth_tokens IS 'Singleton row storing the CCB API v2 OAuth access/refresh tokens. Service-role access only.';
