import { NextResponse } from 'next/server';
import { getUserFromAuthHeader } from '../../../../lib/server-supabase';
import { readLimitedText, tooLarge } from '../../../../lib/mcp/http';
import { serverMisconfigured } from '../../../../lib/mcp/metadata';
import {
  approveAuthorization,
  buildAuthorizationRedirect,
  denyAuthorization,
  validateAuthorizeRequest,
  type AuthorizeParams,
} from '../../../../lib/mcp/oauth';
import { createOAuthDeps } from '../../../../lib/mcp/runtime';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const PARAM_KEYS = [
  'response_type', 'client_id', 'redirect_uri', 'code_challenge', 'code_challenge_method', 'scope', 'state', 'resource',
] as const;

/**
 * Backs the consent page at /oauth/authorize.
 *  - No `decision`: validates the request and returns what the page should show. No sign-in needed.
 *  - `decision`: needs the signed-in Radius user's session token. Approving also requires that the account
 *    has been enabled in mcp_access.
 * Redirect targets are only ever built from addresses that passed validation against the client's published
 * metadata AND the server's own allow-list, so this can't be used as an open redirect.
 */
export async function POST(request: Request) {
  try {
    return await handleAuthorize(request);
  } catch (err) {
    console.error('MCP authorize failed:', err instanceof Error ? err.message : err);
    return NextResponse.json({ ok: false, error: 'server_error' }, { status: 500 });
  }
}

async function handleAuthorize(request: Request) {
  let deps;
  try {
    deps = createOAuthDeps();
  } catch (err) {
    console.error('MCP is not configured:', err instanceof Error ? err.message : err);
    return serverMisconfigured();
  }

  const text = await readLimitedText(request, 16 * 1024);
  if (text === null) return tooLarge();
  let body: { params?: Record<string, unknown>; decision?: unknown } | null = null;
  try { body = JSON.parse(text); } catch { /* treated as an empty request below */ }
  const rawParams: Record<string, unknown> = (body && typeof body === 'object' ? body.params : null) || {};
  const params: AuthorizeParams = {};
  for (const key of PARAM_KEYS) {
    const value = rawParams[key];
    if (typeof value === 'string') params[key] = value;
  }
  const decision = body?.decision;

  const validation = await validateAuthorizeRequest(deps, params);
  if (!validation.ok) {
    if (validation.fatal) {
      return NextResponse.json(
        { ok: false, fatal: true, error: validation.error, error_description: validation.description },
        { status: 400 }
      );
    }
    return NextResponse.json({
      ok: false,
      fatal: false,
      redirectTo: buildAuthorizationRedirect(deps.config, validation.redirectUri, {
        error: validation.error,
        error_description: validation.description,
        state: validation.state,
      }),
    });
  }
  const { request: authRequest } = validation;

  if (decision === undefined) {
    return NextResponse.json({
      ok: true,
      client_name: authRequest.client.name,
      scope: authRequest.scope,
    });
  }
  if (decision !== 'approve' && decision !== 'deny') {
    return NextResponse.json({ ok: false, error: 'invalid_request' }, { status: 400 });
  }

  const user = await getUserFromAuthHeader(request);
  if (!user) return NextResponse.json({ ok: false, error: 'not_signed_in' }, { status: 401 });

  if (decision === 'deny') {
    return NextResponse.json({ ok: true, redirectTo: await denyAuthorization(deps, authRequest, user.id) });
  }

  const result = await approveAuthorization(deps, authRequest, user.id);
  if (!result.ok) return NextResponse.json({ ok: false, error: result.error }, { status: 403 });
  return NextResponse.json({ ok: true, redirectTo: result.redirectTo });
}
