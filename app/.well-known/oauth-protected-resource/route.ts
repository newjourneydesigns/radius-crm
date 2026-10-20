import { loadMcpConfig } from '../../../lib/mcp/config';
import { discoveryResponse, protectedResourceMetadata, serverMisconfigured } from '../../../lib/mcp/metadata';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    return discoveryResponse(protectedResourceMetadata(loadMcpConfig()));
  } catch (err) {
    console.error('MCP discovery:', err instanceof Error ? err.message : err);
    return serverMisconfigured();
  }
}
