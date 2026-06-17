-- CCB API v2 OAuth token storage (refresh-token model)
--
-- Verified against the live CCB v2 API on 2026-06-17: the token endpoint issues
-- a long-lived refresh_token alongside a short-lived access_token (TTL ~7200s).
-- An admin authorizes once (authorization_code grant); thereafter every request
-- mints/renews the access token via the refresh_token — no further human action.
--
-- Singleton row (id = 1). Tokens are stored encrypted at rest by the app layer
-- (AES-256-GCM, key derived from the service-role secret) so a DB-only leak
-- (backup/dump) can't yield a usable refresh token. Service-role access only —
-- RLS is enabled with NO policies, denying anon/authenticated entirely.

CREATE TABLE IF NOT EXISTS ccb_oauth_tokens (
  id              integer PRIMARY KEY DEFAULT 1,
  refresh_token   text NOT NULL,        -- AES-256-GCM ciphertext
  access_token    text NOT NULL,        -- AES-256-GCM ciphertext
  expires_at      timestamptz NOT NULL, -- access-token expiry (UTC)
  scope           text,
  connected_at    timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ccb_oauth_tokens_singleton CHECK (id = 1)
);

ALTER TABLE ccb_oauth_tokens ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE ccb_oauth_tokens IS
  'Singleton (id=1) CCB API v2 OAuth tokens. refresh_token/access_token are AES-256-GCM encrypted by the app. Service-role access only (RLS enabled, no policies).';
