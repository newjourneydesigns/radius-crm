export const MCP_SCOPE_READ = 'radius:read';
export const MCP_SUPPORTED_SCOPES = [MCP_SCOPE_READ] as const;

export interface McpConfig {
  /** Public origin of the Radius site; also the OAuth issuer. No trailing slash. */
  baseUrl: string;
  /**
   * Canonical MCP endpoint — the OAuth `resource` and the token audience. It ends in a slash because the site
   * runs with `trailingSlash: true`: a slash-less POST would be answered with a 308 redirect, which an external
   * client is not required to follow.
   */
  resourceUrl: string;
  /** Exact redirect URIs an assistant may be sent back to. Empty = nothing is accepted. */
  allowedRedirectUris: ReadonlySet<string>;
  /** Hosts a client-metadata document (CIMD client_id) may be fetched from. */
  allowedClientHosts: ReadonlySet<string>;
  codeTtlSeconds: number;
  accessTtlSeconds: number;
  refreshTtlSeconds: number;
  /** Hard cap on one approval's lifetime; after this the user must approve again. */
  grantTtlSeconds: number;
}

const splitList = (value: string | undefined) =>
  (value || '').split(',').map((v) => v.trim()).filter(Boolean);

export function loadMcpConfig(env: Record<string, string | undefined> = process.env): McpConfig {
  const baseUrl = (env.MCP_PUBLIC_URL || env.NEXT_PUBLIC_APP_URL || '').trim().replace(/\/+$/, '');
  if (!/^https:\/\/[^/]+$/.test(baseUrl)) {
    throw new Error('MCP_PUBLIC_URL (or NEXT_PUBLIC_APP_URL) must be the site origin over https, with no path');
  }
  return {
    baseUrl,
    resourceUrl: `${baseUrl}/api/mcp/`,
    allowedRedirectUris: new Set(splitList(env.MCP_OAUTH_ALLOWED_REDIRECT_URIS)),
    allowedClientHosts: new Set(
      splitList(env.MCP_OAUTH_ALLOWED_CLIENT_HOSTS).length
        ? splitList(env.MCP_OAUTH_ALLOWED_CLIENT_HOSTS)
        : ['chatgpt.com']
    ),
    codeTtlSeconds: 5 * 60,
    accessTtlSeconds: 60 * 60,
    refreshTtlSeconds: 30 * 24 * 60 * 60,
    grantTtlSeconds: 90 * 24 * 60 * 60,
  };
}

export const protectedResourceMetadataUrl = (config: McpConfig) =>
  `${config.baseUrl}/.well-known/oauth-protected-resource/api/mcp`;

const MAX_RESOURCE_LENGTH = 2048;

// A loop, not /\/+$/: that regex is quadratic on a long run of slashes, and this runs on unauthenticated input.
function trimTrailingSlashes(value: string): string {
  let end = value.length;
  while (end > 0 && value.charCodeAt(end - 1) === 47) end--;
  return value.slice(0, end);
}

/** Clients may name the resource with or without the trailing slash; both mean this server. */
export const isThisResource = (config: McpConfig, value: string) =>
  value.length <= MAX_RESOURCE_LENGTH && trimTrailingSlashes(value) === trimTrailingSlashes(config.resourceUrl);
