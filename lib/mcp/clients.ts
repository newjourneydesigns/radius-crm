import type { McpConfig } from './config';

export interface ClientInfo {
  clientId: string;
  name: string;
  redirectUris: string[];
}

export type ClientMetadataFetcher = (url: string) => Promise<unknown>;

const CLIENT_PATH_RE = /^\/oauth\/(?:[A-Za-z0-9_-]+\/)?client\.json$/;
const MAX_DOCUMENT_BYTES = 64 * 1024;
const CACHE_TTL_MS = 10 * 60 * 1000;
// Failures are remembered briefly too, so repeated requests with a bad client_id can't make us fetch over and over.
const FAILURE_TTL_MS = 60 * 1000;

const cache = new Map<string, { info: ClientInfo | null; expiresAt: number }>();

/** The only URLs we will ever fetch: https, no credentials/port/query, an allowed host, a client.json path. */
export function isAcceptableClientIdUrl(clientId: string, config: McpConfig): URL | null {
  let url: URL;
  try {
    url = new URL(clientId);
  } catch {
    return null;
  }
  if (url.protocol !== 'https:') return null;
  if (url.username || url.password || url.port || url.search || url.hash) return null;
  if (!config.allowedClientHosts.has(url.hostname)) return null;
  if (!CLIENT_PATH_RE.test(url.pathname)) return null;
  // Compare against the re-serialised form so look-alikes can't slip through.
  if (url.toString() !== clientId) return null;
  return url;
}

/** Fetches a client-metadata document without following redirects and with a size cap. */
export const fetchClientMetadata: ClientMetadataFetcher = async (url) => {
  const response = await fetch(url, {
    redirect: 'error',
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(5000),
    cache: 'no-store',
  });
  if (!response.ok) throw new Error(`client metadata HTTP ${response.status}`);
  const text = await response.text();
  if (text.length > MAX_DOCUMENT_BYTES) throw new Error('client metadata too large');
  return JSON.parse(text);
};

export function parseClientDocument(clientId: string, doc: unknown): ClientInfo | null {
  if (!doc || typeof doc !== 'object') return null;
  const d = doc as Record<string, unknown>;
  if (d.client_id !== clientId) return null;
  if (!Array.isArray(d.redirect_uris) || d.redirect_uris.length === 0) return null;
  const redirectUris = d.redirect_uris.filter((u): u is string => typeof u === 'string');
  if (redirectUris.length !== d.redirect_uris.length) return null;
  const method = d.token_endpoint_auth_method;
  if (method !== undefined && method !== 'none' && method !== 'private_key_jwt') return null;
  const name = typeof d.client_name === 'string' && d.client_name.trim()
    ? d.client_name.trim().slice(0, 100)
    : 'AI assistant';
  return { clientId, name, redirectUris };
}

/** Resolves a CIMD client_id to its verified metadata, or null when it isn't an acceptable client. */
export async function resolveClient(
  clientId: string,
  config: McpConfig,
  fetcher: ClientMetadataFetcher = fetchClientMetadata,
  now: number = Date.now()
): Promise<ClientInfo | null> {
  const url = isAcceptableClientIdUrl(clientId, config);
  if (!url) return null;

  const cached = cache.get(clientId);
  if (cached && cached.expiresAt > now) return cached.info;
  // Bound the memory an attacker can use by inventing client ids.
  if (cache.size > 200) cache.clear();

  try {
    const info = parseClientDocument(clientId, await fetcher(url.toString()));
    cache.set(clientId, { info, expiresAt: now + (info ? CACHE_TTL_MS : FAILURE_TTL_MS) });
    return info;
  } catch {
    cache.set(clientId, { info: null, expiresAt: now + FAILURE_TTL_MS });
    return null;
  }
}

export const clearClientCache = () => cache.clear();
