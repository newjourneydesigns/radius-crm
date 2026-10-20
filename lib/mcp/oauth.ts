import { DateTime } from 'luxon';
import type { ClientInfo } from './clients';
import { MCP_SUPPORTED_SCOPES, isThisResource, type McpConfig } from './config';
import {
  isValidCodeChallenge,
  isValidCodeVerifier,
  pkceS256,
  randomCredential,
  safeEqual,
  sha256Hex,
} from './crypto';
import type { GrantRow, McpStore } from './types';

export interface OAuthDeps {
  store: McpStore;
  config: McpConfig;
  resolveClient: (clientId: string) => Promise<ClientInfo | null>;
  now: () => Date;
}

export interface AuthorizeParams {
  response_type?: string;
  client_id?: string;
  redirect_uri?: string;
  code_challenge?: string;
  code_challenge_method?: string;
  scope?: string;
  state?: string;
  resource?: string;
}

export interface ValidAuthorizeRequest {
  client: ClientInfo;
  redirectUri: string;
  codeChallenge: string;
  scope: string;
  state?: string;
  resource: string;
}

export type AuthorizeValidation =
  | { ok: true; request: ValidAuthorizeRequest }
  /** The client or redirect URI can't be trusted, so the user must see the error; never redirect. */
  | { ok: false; fatal: true; error: string; description: string }
  | { ok: false; fatal: false; error: string; description: string; redirectUri: string; state?: string };

const plusSeconds = (date: Date, seconds: number) =>
  DateTime.fromJSDate(date).plus({ seconds }).toUTC().toISO()!;

const isPast = (iso: string, now: Date) => DateTime.fromISO(iso).toMillis() <= now.getTime();

const fatal = (error: string, description: string): AuthorizeValidation => ({
  ok: false,
  fatal: true,
  error,
  description,
});

/** Builds the browser redirect back to the assistant. `iss` is always included (RFC 9207), errors too. */
export function buildAuthorizationRedirect(
  config: McpConfig,
  redirectUri: string,
  params: { code?: string; error?: string; error_description?: string; state?: string }
): string {
  const url = new URL(redirectUri);
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) url.searchParams.set(key, value);
  }
  url.searchParams.set('iss', config.baseUrl);
  return url.toString();
}

export async function validateAuthorizeRequest(
  deps: OAuthDeps,
  params: AuthorizeParams
): Promise<AuthorizeValidation> {
  const { config } = deps;

  if (!params.client_id) return fatal('invalid_request', 'Missing client_id.');
  const client = await deps.resolveClient(params.client_id);
  if (!client) return fatal('invalid_client', 'This client is not recognised.');

  const redirectUri = params.redirect_uri;
  if (!redirectUri) return fatal('invalid_request', 'Missing redirect_uri.');
  // Must be registered here (env or database, exact match) AND listed in the client's own metadata.
  const registered = config.allowedRedirectUris.has(redirectUri) ||
    (await deps.store.listAllowedRedirectUris()).includes(redirectUri);
  if (!registered || !client.redirectUris.includes(redirectUri)) {
    return fatal('invalid_request', 'This redirect address is not allowed.');
  }

  const state = params.state && params.state.length <= 512 ? params.state : undefined;
  const bounce = (error: string, description: string): AuthorizeValidation => ({
    ok: false,
    fatal: false,
    error,
    description,
    redirectUri,
    state,
  });

  if (params.state && params.state.length > 512) return bounce('invalid_request', 'state is too long.');
  if (params.response_type !== 'code') {
    return bounce('unsupported_response_type', 'Only response_type=code is supported.');
  }
  if (params.code_challenge_method !== 'S256') {
    return bounce('invalid_request', 'PKCE with code_challenge_method=S256 is required.');
  }
  if (!params.code_challenge || !isValidCodeChallenge(params.code_challenge)) {
    return bounce('invalid_request', 'A valid code_challenge is required.');
  }

  const requested = (params.scope || '').split(/\s+/).filter(Boolean);
  const supported = new Set<string>(MCP_SUPPORTED_SCOPES);
  if (requested.some((s) => !supported.has(s))) return bounce('invalid_scope', 'Unsupported scope.');
  const scope = (requested.length ? Array.from(new Set(requested)) : [...MCP_SUPPORTED_SCOPES]).join(' ');

  if (params.resource !== undefined && !isThisResource(config, params.resource)) {
    return bounce('invalid_target', 'resource does not match this server.');
  }

  return {
    ok: true,
    request: { client, redirectUri, codeChallenge: params.code_challenge, scope, state, resource: config.resourceUrl },
  };
}

export type ApprovalResult =
  | { ok: true; redirectTo: string }
  | { ok: false; error: 'access_not_enabled' };

/** The signed-in user approved. Issues a single-use code, but only for an account that has been enabled. */
export async function approveAuthorization(
  deps: OAuthDeps,
  request: ValidAuthorizeRequest,
  userId: string
): Promise<ApprovalResult> {
  const { store, config } = deps;
  const access = await store.getAccess(userId);
  const wanted = request.scope.split(' ');
  if (
    !access ||
    access.revoked_at ||
    !wanted.every((s) => access.scopes.includes(s)) ||
    !(await store.userExists(userId))
  ) {
    await store.audit({ event: 'authorize_refused', user_id: userId, client_id: request.client.clientId, ok: false });
    return { ok: false, error: 'access_not_enabled' };
  }

  const now = deps.now();
  const grant = await store.createGrant({
    user_id: userId,
    client_id: request.client.clientId,
    scope: request.scope,
    resource: request.resource,
    expires_at: plusSeconds(now, config.grantTtlSeconds),
  });

  const code = randomCredential('rmcp_c');
  await store.insertCode({
    code_hash: sha256Hex(code),
    grant_id: grant.id,
    redirect_uri: request.redirectUri,
    code_challenge: request.codeChallenge,
    expires_at: plusSeconds(now, config.codeTtlSeconds),
    used_at: null,
  });

  await store.audit({
    event: 'authorize_approved',
    user_id: userId,
    grant_id: grant.id,
    client_id: request.client.clientId,
    ok: true,
  });

  return {
    ok: true,
    redirectTo: buildAuthorizationRedirect(config, request.redirectUri, { code, state: request.state }),
  };
}

export async function denyAuthorization(
  deps: OAuthDeps,
  request: ValidAuthorizeRequest,
  userId: string | null
): Promise<string> {
  await deps.store.audit({
    event: 'authorize_denied',
    user_id: userId,
    client_id: request.client.clientId,
    ok: false,
  });
  return buildAuthorizationRedirect(deps.config, request.redirectUri, {
    error: 'access_denied',
    error_description: 'The user declined the request.',
    state: request.state,
  });
}

// ── Token endpoint ───────────────────────────────────────────────────────

export interface TokenResponse {
  status: number;
  body: Record<string, unknown>;
}

const tokenError = (error: string, description: string, status = 400): TokenResponse => ({
  status,
  body: { error, error_description: description },
});

async function issueTokens(deps: OAuthDeps, grant: GrantRow): Promise<TokenResponse> {
  const { store, config } = deps;
  const now = deps.now();
  const grantEndsInSeconds = Math.floor((DateTime.fromISO(grant.expires_at).toMillis() - now.getTime()) / 1000);
  const accessTtl = Math.min(config.accessTtlSeconds, grantEndsInSeconds);
  const refreshTtl = Math.min(config.refreshTtlSeconds, grantEndsInSeconds);
  if (accessTtl <= 0) return tokenError('invalid_grant', 'This authorization has expired.');

  const access = randomCredential('rmcp_a');
  const refresh = randomCredential('rmcp_r');
  await store.insertToken({
    token_hash: sha256Hex(access),
    kind: 'access',
    grant_id: grant.id,
    expires_at: plusSeconds(now, accessTtl),
    used_at: null,
  });
  await store.insertToken({
    token_hash: sha256Hex(refresh),
    kind: 'refresh',
    grant_id: grant.id,
    expires_at: plusSeconds(now, refreshTtl),
    used_at: null,
  });

  return {
    status: 200,
    body: {
      access_token: access,
      token_type: 'Bearer',
      expires_in: accessTtl,
      refresh_token: refresh,
      scope: grant.scope,
    },
  };
}

/** The grant must still be live and the user must still be enabled; checked on every token issue. */
async function usableGrant(deps: OAuthDeps, grantId: string): Promise<GrantRow | null> {
  const grant = await deps.store.getGrant(grantId);
  if (!grant || grant.revoked_at || isPast(grant.expires_at, deps.now())) return null;
  const access = await deps.store.getAccess(grant.user_id);
  if (!access || access.revoked_at) return null;
  if (!grant.scope.split(' ').every((s) => access.scopes.includes(s))) return null;
  return grant;
}

export async function exchangeToken(
  deps: OAuthDeps,
  form: Record<string, string | undefined>
): Promise<TokenResponse> {
  const { store, config } = deps;
  const now = deps.now();

  if (form.resource !== undefined && !isThisResource(config, form.resource)) {
    return tokenError('invalid_target', 'resource does not match this server.');
  }

  if (form.grant_type === 'authorization_code') {
    const { code, code_verifier: verifier, client_id: clientId, redirect_uri: redirectUri } = form;
    if (!code || !verifier || !clientId || !redirectUri) {
      return tokenError('invalid_request', 'code, code_verifier, client_id and redirect_uri are required.');
    }
    if (!isValidCodeVerifier(verifier)) return tokenError('invalid_request', 'Invalid code_verifier.');

    const claim = await store.claimCode(sha256Hex(code), now);
    if (claim.status === 'missing') return tokenError('invalid_grant', 'Unknown authorization code.');
    if (claim.status === 'reused') {
      // A replayed code means someone else may hold it: kill whatever it already produced.
      await store.revokeGrant(claim.row.grant_id);
      await store.audit({ event: 'code_replayed', grant_id: claim.row.grant_id, ok: false });
      return tokenError('invalid_grant', 'This authorization code was already used.');
    }
    if (claim.status === 'expired') return tokenError('invalid_grant', 'This authorization code has expired.');

    const grant = await usableGrant(deps, claim.row.grant_id);
    if (!grant) return tokenError('invalid_grant', 'This authorization is no longer valid.');
    if (!safeEqual(grant.client_id, clientId)) return tokenError('invalid_grant', 'client_id does not match.');
    if (!safeEqual(claim.row.redirect_uri, redirectUri)) {
      return tokenError('invalid_grant', 'redirect_uri does not match.');
    }
    if (!safeEqual(pkceS256(verifier), claim.row.code_challenge)) {
      return tokenError('invalid_grant', 'PKCE verification failed.');
    }

    const issued = await issueTokens(deps, grant);
    if (issued.status === 200) {
      await store.audit({ event: 'token_issued', user_id: grant.user_id, grant_id: grant.id, client_id: clientId, ok: true });
    }
    return issued;
  }

  if (form.grant_type === 'refresh_token') {
    const { refresh_token: refreshToken, client_id: clientId } = form;
    if (!refreshToken || !clientId) return tokenError('invalid_request', 'refresh_token and client_id are required.');

    const claim = await store.claimRefreshToken(sha256Hex(refreshToken), now);
    if (claim.status === 'missing' || (claim.status !== 'reused' && claim.row.kind !== 'refresh')) {
      return tokenError('invalid_grant', 'Unknown refresh token.');
    }
    if (claim.status === 'reused') {
      await store.revokeGrant(claim.row.grant_id);
      await store.audit({ event: 'refresh_replayed', grant_id: claim.row.grant_id, ok: false });
      return tokenError('invalid_grant', 'This refresh token was already used.');
    }
    if (claim.status === 'expired') return tokenError('invalid_grant', 'This refresh token has expired.');

    const grant = await usableGrant(deps, claim.row.grant_id);
    if (!grant) return tokenError('invalid_grant', 'This authorization is no longer valid.');
    if (!safeEqual(grant.client_id, clientId)) return tokenError('invalid_grant', 'client_id does not match.');

    if (form.scope) {
      const granted = new Set(grant.scope.split(' '));
      if (form.scope.split(/\s+/).filter(Boolean).some((s) => !granted.has(s))) {
        return tokenError('invalid_scope', 'Cannot widen scope on refresh.');
      }
    }

    const issued = await issueTokens(deps, grant);
    if (issued.status === 200) {
      await store.audit({ event: 'token_refreshed', user_id: grant.user_id, grant_id: grant.id, client_id: clientId, ok: true });
    }
    return issued;
  }

  return tokenError('unsupported_grant_type', 'Only authorization_code and refresh_token are supported.');
}

/** RFC 7009. Revoking any token of a grant ends the whole grant. Always succeeds from the caller's view. */
export async function revokeToken(deps: OAuthDeps, token: string): Promise<void> {
  const row = await deps.store.getToken(sha256Hex(token));
  if (!row) return;
  await deps.store.revokeGrant(row.grant_id);
  await deps.store.audit({ event: 'token_revoked', grant_id: row.grant_id, ok: true });
}

// ── Resource-server side: authenticating an MCP request ──────────────────

export interface Principal {
  userId: string;
  grantId: string;
  clientId: string;
  /** What this request may do: the grant's scopes intersected with the user's *current* access. */
  scopes: string[];
}

export type BearerResult =
  | { ok: true; principal: Principal }
  | { ok: false; status: 401; error: 'invalid_token' };

export async function authenticateBearer(deps: OAuthDeps, token: string): Promise<BearerResult> {
  const reject: BearerResult = { ok: false, status: 401, error: 'invalid_token' };
  const { store, config } = deps;

  const row = await store.getToken(sha256Hex(token));
  if (!row || row.kind !== 'access' || isPast(row.expires_at, deps.now())) return reject;

  const grant = await store.getGrant(row.grant_id);
  if (!grant || grant.revoked_at || isPast(grant.expires_at, deps.now())) return reject;
  // The token is bound to this server; one issued for any other resource is refused.
  if (grant.resource !== config.resourceUrl) return reject;

  const access = await store.getAccess(grant.user_id);
  if (!access || access.revoked_at) return reject;
  if (!(await store.userExists(grant.user_id))) return reject;

  const granted = grant.scope.split(' ');
  const scopes = granted.filter((s) => access.scopes.includes(s));
  if (scopes.length === 0) return reject;

  await store.touchGrant(grant.id);
  return { ok: true, principal: { userId: grant.user_id, grantId: grant.id, clientId: grant.client_id, scopes } };
}
