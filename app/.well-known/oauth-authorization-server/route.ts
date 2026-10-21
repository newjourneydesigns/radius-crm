import { loadMcpConfig } from '../../../lib/mcp/config';
import { authorizationServerMetadata, discoveryResponse, serverMisconfigured } from '../../../lib/mcp/metadata';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    return discoveryResponse(authorizationServerMetadata(loadMcpConfig()));
  } catch (err) {
    console.error('MCP discovery:', err instanceof Error ? err.message : err);
    return serverMisconfigured();
  }
}
