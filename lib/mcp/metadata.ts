import { MCP_SUPPORTED_SCOPES, type McpConfig } from './config';

export function protectedResourceMetadata(config: McpConfig) {
  return {
    resource: config.resourceUrl,
    authorization_servers: [config.baseUrl],
    scopes_supported: [...MCP_SUPPORTED_SCOPES],
    bearer_methods_supported: ['header'],
    resource_name: 'Radius',
  };
}

export function authorizationServerMetadata(config: McpConfig) {
  return {
    issuer: config.baseUrl,
    authorization_endpoint: `${config.baseUrl}/oauth/authorize/`,
    token_endpoint: `${config.baseUrl}/api/mcp-oauth/token/`,
    revocation_endpoint: `${config.baseUrl}/api/mcp-oauth/revoke/`,
    response_types_supported: ['code'],
    grant_types_supported: ['authorization_code', 'refresh_token'],
    code_challenge_methods_supported: ['S256'],
    token_endpoint_auth_methods_supported: ['none'],
    revocation_endpoint_auth_methods_supported: ['none'],
    scopes_supported: [...MCP_SUPPORTED_SCOPES],
    client_id_metadata_document_supported: true,
    authorization_response_iss_parameter_supported: true,
  };
}

/** Discovery documents are public by design; a short cache keeps assistants from re-fetching on every call. */
export function discoveryResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'public, max-age=300',
      'Access-Control-Allow-Origin': '*',
    },
  });
}

export const serverMisconfigured = () =>
  new Response(JSON.stringify({ error: 'server_error', error_description: 'MCP is not configured on this server.' }), {
    status: 503,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
