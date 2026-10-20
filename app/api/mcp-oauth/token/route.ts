import { serverMisconfigured } from '../../../../lib/mcp/metadata';
import { exchangeToken } from '../../../../lib/mcp/oauth';
import { createOAuthDeps } from '../../../../lib/mcp/runtime';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const NO_CACHE = { 'Cache-Control': 'no-store', Pragma: 'no-cache' };

export async function POST(request: Request) {
  let deps;
  try {
    deps = createOAuthDeps();
  } catch (err) {
    console.error('MCP is not configured:', err instanceof Error ? err.message : err);
    return serverMisconfigured();
  }

  const body = new URLSearchParams(await request.text());
  const form: Record<string, string | undefined> = {};
  for (const key of [
    'grant_type', 'code', 'code_verifier', 'client_id', 'redirect_uri', 'refresh_token', 'scope', 'resource',
  ]) {
    form[key] = body.get(key) ?? undefined;
  }

  try {
    const { status, body: payload } = await exchangeToken(deps, form);
    return new Response(JSON.stringify(payload), {
      status,
      headers: { 'Content-Type': 'application/json', ...NO_CACHE },
    });
  } catch (err) {
    console.error('MCP token endpoint failed:', err instanceof Error ? err.message : err);
    return new Response(JSON.stringify({ error: 'server_error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...NO_CACHE },
    });
  }
}
