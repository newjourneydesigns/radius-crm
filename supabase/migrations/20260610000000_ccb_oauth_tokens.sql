-- CCB API v2 OAuth token storage
--
-- CCB's v2 OAuth flow has no refresh token: the authorization `code` issued
-- on the initial consent redirect is reusable to mint new access tokens once
-- the current one expires. This singleton row stores that code alongside the
-- current access token/expiry. Server-side only (service role) — no client
-- access is needed, so RLS is enabled with no policies, denying
-- anon/authenticated access entirely.

CREATE TABLE ccb_oauth_tokens (
  id integer PRIMARY KEY DEFAULT 1,
  authorization_code text NOT NULL,
  access_token text NOT NULL,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ccb_oauth_tokens_singleton CHECK (id = 1)
);

ALTER TABLE ccb_oauth_tokens ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE ccb_oauth_tokens IS 'Singleton row storing the CCB API v2 OAuth authorization code and current access token. Service-role access only.';
