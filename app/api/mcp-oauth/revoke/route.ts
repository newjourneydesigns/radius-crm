import { serverMisconfigured } from '../../../../lib/mcp/metadata';
import { revokeToken } from '../../../../lib/mcp/oauth';
import { createOAuthDeps } from '../../../../lib/mcp/runtime';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// RFC 7009: always answers 200 so a caller can't probe which tokens exist.
export async function POST(request: Request) {
  let deps;
  try {
    deps = createOAuthDeps();
  } catch {
    return serverMisconfigured();
  }
  const token = new URLSearchParams(await request.text()).get('token');
  if (token) {
    try {
      await revokeToken(deps, token);
    } catch (err) {
      console.error('MCP revoke failed:', err instanceof Error ? err.message : err);
    }
  }
  return new Response(null, { status: 200, headers: { 'Cache-Control': 'no-store' } });
}
