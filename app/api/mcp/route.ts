import { serverMisconfigured } from '../../../lib/mcp/metadata';
import { createMcpServerDeps } from '../../../lib/mcp/runtime';
import { handleMcpPost, methodNotAllowed } from '../../../lib/mcp/server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// Radius's private MCP endpoint (Streamable HTTP, stateless). Every request needs an OAuth access token
// issued by /api/mcp-oauth/*; the tools it exposes are read-only.
export async function POST(request: Request) {
  let deps;
  try {
    deps = createMcpServerDeps();
  } catch (err) {
    console.error('MCP is not configured:', err instanceof Error ? err.message : err);
    return serverMisconfigured();
  }
  return handleMcpPost(request, deps);
}

// There is no server-initiated stream, so the spec's "405 Method Not Allowed" applies to GET and DELETE.
export const GET = methodNotAllowed;
export const DELETE = methodNotAllowed;
