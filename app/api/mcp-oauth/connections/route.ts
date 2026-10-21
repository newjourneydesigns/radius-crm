import { NextResponse } from 'next/server';
import { getUserFromAuthHeader } from '../../../../lib/server-supabase';
import { disconnect, disconnectAll, getAssistantAccess } from '../../../../lib/mcp/connections';
import { readLimitedText, tooLarge } from '../../../../lib/mcp/http';
import { serverMisconfigured } from '../../../../lib/mcp/metadata';
import { createOAuthDeps } from '../../../../lib/mcp/runtime';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * The signed-in user's own assistant connections (for the Assistant access page).
 * GET lists them; POST { action: 'disconnect', grant_id } or { action: 'disconnect_all' } ends them.
 * Needs the user's Radius session token. Every query is filtered by that user's id, never by anything sent.
 */
async function handle(request: Request, act: (deps: ReturnType<typeof createOAuthDeps>, userId: string, body: unknown) => Promise<Response | null>) {
  let deps;
  try {
    deps = createOAuthDeps();
  } catch (err) {
    console.error('MCP is not configured:', err instanceof Error ? err.message : err);
    return serverMisconfigured();
  }
  try {
    const user = await getUserFromAuthHeader(request);
    if (!user) return NextResponse.json({ error: 'not_signed_in' }, { status: 401 });
    const early = await act(deps, user.id, request);
    if (early) return early;
    return NextResponse.json(await getAssistantAccess(deps, user.id), { headers: { 'Cache-Control': 'no-store' } });
  } catch (err) {
    console.error('MCP connections failed:', err instanceof Error ? err.message : err);
    return NextResponse.json({ error: 'server_error' }, { status: 500 });
  }
}

export async function GET(request: Request) {
  return handle(request, async () => null);
}

export async function POST(request: Request) {
  return handle(request, async (deps, userId, req) => {
    const text = await readLimitedText(req as Request, 4 * 1024);
    if (text === null) return tooLarge();
    let body: { action?: unknown; grant_id?: unknown } | null = null;
    try { body = JSON.parse(text); } catch { /* handled below */ }

    if (body?.action === 'disconnect_all') {
      await disconnectAll(deps, userId);
      return null;
    }
    if (body?.action === 'disconnect' && typeof body.grant_id === 'string' && UUID.test(body.grant_id)) {
      const ended = await disconnect(deps, userId, body.grant_id);
      // A connection that isn't theirs looks exactly like one that doesn't exist.
      return ended ? null : NextResponse.json({ error: 'not_found' }, { status: 404 });
    }
    return NextResponse.json({ error: 'invalid_request' }, { status: 400 });
  });
}
