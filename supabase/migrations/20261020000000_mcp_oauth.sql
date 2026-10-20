-- ============================================================================
-- MCP assistant access: OAuth server tables for the private Radius MCP endpoint
-- ============================================================================
-- Backs /api/mcp and the /api/mcp-oauth/* routes, which let an AI assistant
-- (ChatGPT "dot") read Radius on behalf of one signed-in user.
--
-- Every table here is reached ONLY through the server's service-role key. RLS is
-- enabled with no policies, so the anon and authenticated roles (including any
-- Supabase user token) can neither read nor write them. Tokens and codes are
-- stored as SHA-256 hashes; the plaintext values never touch the database.
--
-- This migration grants nobody access. A user can authorize the assistant only
-- once a row exists in mcp_access — see docs/MCP_SETUP.md for the grant SQL.

-- ── Who may connect an assistant, and with which scopes ────────────────────
CREATE TABLE IF NOT EXISTS public.mcp_access (
  user_id     uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  scopes      text[] NOT NULL DEFAULT ARRAY['radius:read'],
  granted_at  timestamptz NOT NULL DEFAULT now(),
  granted_by  text,
  revoked_at  timestamptz
);

-- ── Exact redirect URIs an assistant may be sent back to ───────────────────
-- Filled in by hand with the address ChatGPT shows during connection setup, so no redeploy is
-- needed. Empty means nothing is accepted. Matching is exact, never by prefix or pattern.
CREATE TABLE IF NOT EXISTS public.mcp_allowed_redirects (
  redirect_uri  text PRIMARY KEY CHECK (redirect_uri ~ '^https://[^[:space:]#]+$'),
  added_at      timestamptz NOT NULL DEFAULT now(),
  note          text
);

-- ── One approval = one grant. Revoking a grant kills every token under it ──
CREATE TABLE IF NOT EXISTS public.mcp_oauth_grants (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  client_id     text NOT NULL,
  scope         text NOT NULL,
  resource      text NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  expires_at    timestamptz NOT NULL,
  revoked_at    timestamptz,
  last_used_at  timestamptz
);
CREATE INDEX IF NOT EXISTS idx_mcp_oauth_grants_user ON public.mcp_oauth_grants(user_id);

-- ── Single-use authorization codes (PKCE-bound) ────────────────────────────
CREATE TABLE IF NOT EXISTS public.mcp_oauth_codes (
  code_hash       text PRIMARY KEY,
  grant_id        uuid NOT NULL REFERENCES public.mcp_oauth_grants(id) ON DELETE CASCADE,
  redirect_uri    text NOT NULL,
  code_challenge  text NOT NULL,
  expires_at      timestamptz NOT NULL,
  used_at         timestamptz
);

-- ── Access and refresh tokens (refresh tokens rotate; reuse revokes the grant)
CREATE TABLE IF NOT EXISTS public.mcp_oauth_tokens (
  token_hash  text PRIMARY KEY,
  kind        text NOT NULL CHECK (kind IN ('access', 'refresh')),
  grant_id    uuid NOT NULL REFERENCES public.mcp_oauth_grants(id) ON DELETE CASCADE,
  expires_at  timestamptz NOT NULL,
  used_at     timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_mcp_oauth_tokens_grant ON public.mcp_oauth_tokens(grant_id);

-- ── Audit trail: every tool call and every connection event ────────────────
CREATE TABLE IF NOT EXISTS public.mcp_audit_log (
  id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  at            timestamptz NOT NULL DEFAULT now(),
  event         text NOT NULL,
  user_id       uuid,
  grant_id      uuid,
  client_id     text,
  tool          text,
  args          jsonb,
  ok            boolean,
  result_count  integer,
  error         text,
  duration_ms   integer
);
CREATE INDEX IF NOT EXISTS idx_mcp_audit_log_at ON public.mcp_audit_log(at DESC);
CREATE INDEX IF NOT EXISTS idx_mcp_audit_log_user ON public.mcp_audit_log(user_id, at DESC);

-- ── Lock everything down: service role only ────────────────────────────────
ALTER TABLE public.mcp_access            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mcp_allowed_redirects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mcp_oauth_grants  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mcp_oauth_codes   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mcp_oauth_tokens  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mcp_audit_log     ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.mcp_access,
              public.mcp_allowed_redirects,
              public.mcp_oauth_grants,
              public.mcp_oauth_codes,
              public.mcp_oauth_tokens,
              public.mcp_audit_log
  FROM anon, authenticated;
