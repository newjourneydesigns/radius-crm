/**
 * Tests for the Radius MCP integration: OAuth server, MCP protocol, tools, permissions and isolation.
 * Runs against in-memory stand-ins, so it needs no database or network.
 *
 *   TS_NODE_TRANSPILE_ONLY=1 TS_NODE_COMPILER_OPTIONS='{"module":"commonjs","esModuleInterop":true,"ignoreDeprecations":"6.0"}' \
 *     npx ts-node scripts/test-mcp.ts
 */
import assert from 'assert';
import { randomBytes } from 'crypto';
import { clearClientCache, isAcceptableClientIdUrl, resolveClient } from '../lib/mcp/clients';
import { loadMcpConfig, type McpConfig } from '../lib/mcp/config';
import { base64Url, pkceS256, sha256Hex } from '../lib/mcp/crypto';
import { authorizationServerMetadata, protectedResourceMetadata } from '../lib/mcp/metadata';
import {
  approveAuthorization, authenticateBearer, denyAuthorization, exchangeToken, revokeToken,
  validateAuthorizeRequest, type OAuthDeps,
} from '../lib/mcp/oauth';
import { likeTerm } from '../lib/mcp/repo';
import { handleMcpPost, methodNotAllowed, resetRateLimits, type McpServerDeps } from '../lib/mcp/server';
import { READ_TOOLS, type ToolDefinition } from '../lib/mcp/tools';
import { MemoryRepo, MemoryStore } from './mcp-test-support';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const Ajv = require('ajv');

const BASE = 'https://radius.example.org';
const RESOURCE = `${BASE}/api/mcp/`;
const REDIRECT = 'https://chatgpt.com/connector_platform_oauth_redirect';
const CLIENT_ID = 'https://chatgpt.com/oauth/client.json';
const USER_A = 'user-a';
const USER_B = 'user-b';
const USER_NO_ACCESS = 'user-c';

const START = new Date('2026-10-20T15:00:00Z').getTime();
let clock = START;
const now = () => new Date(clock);
const advance = (seconds: number) => { clock += seconds * 1000; };

let fetchCalls = 0;
const clientDocument = {
  client_id: CLIENT_ID,
  client_name: 'ChatGPT',
  redirect_uris: [REDIRECT],
  token_endpoint_auth_method: 'none',
};

function makeConfig(env: Record<string, string | undefined> = {}): McpConfig {
  return loadMcpConfig({
    MCP_PUBLIC_URL: BASE,
    MCP_OAUTH_ALLOWED_REDIRECT_URIS: REDIRECT,
    ...env,
  });
}

function makeWorld(config: McpConfig = makeConfig()) {
  const store = new MemoryStore();
  for (const u of [USER_A, USER_B, USER_NO_ACCESS]) store.users.add(u);
  store.access.set(USER_A, { user_id: USER_A, scopes: ['radius:read'], revoked_at: null });
  store.access.set(USER_B, { user_id: USER_B, scopes: ['radius:read'], revoked_at: null });
  const repo = new MemoryRepo();
  clearClientCache();
  const oauth: OAuthDeps = {
    store, config, now,
    resolveClient: (id) => resolveClient(id, config, async () => { fetchCalls++; return clientDocument; }, clock),
  };
  const server: McpServerDeps = { ...oauth, repo };
  return { store, repo, oauth, server, config };
}

const authorizeParams = (challenge: string, over: Record<string, string | undefined> = {}) => ({
  response_type: 'code', client_id: CLIENT_ID, redirect_uri: REDIRECT, code_challenge: challenge,
  code_challenge_method: 'S256', scope: 'radius:read', state: 'st-123', resource: RESOURCE, ...over,
});

async function connect(world: ReturnType<typeof makeWorld>, userId = USER_A) {
  const verifier = base64Url(randomBytes(48));
  const validation = await validateAuthorizeRequest(world.oauth, authorizeParams(pkceS256(verifier)));
  assert.ok(validation.ok, 'authorize request should validate');
  if (!validation.ok) throw new Error('unreachable');
  const approval = await approveAuthorization(world.oauth, validation.request, userId);
  assert.ok(approval.ok, 'approval should succeed for an enabled user');
  if (!approval.ok) throw new Error('unreachable');
  const code = new URL(approval.redirectTo).searchParams.get('code')!;
  const exchange = await exchangeToken(world.oauth, {
    grant_type: 'authorization_code', code, code_verifier: verifier, client_id: CLIENT_ID,
    redirect_uri: REDIRECT, resource: RESOURCE,
  });
  assert.strictEqual(exchange.status, 200, JSON.stringify(exchange.body));
  return { ...exchange.body, code, verifier, redirectTo: approval.redirectTo } as {
    access_token: string; refresh_token: string; expires_in: number; scope: string; code: string; verifier: string; redirectTo: string;
  };
}

function rpc(world: ReturnType<typeof makeWorld>, token: string | null, body: unknown, headers: Record<string, string> = {}) {
  return handleMcpPost(
    new Request(RESOURCE, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}), ...headers },
      body: JSON.stringify(body),
    }),
    world.server
  );
}

async function call(world: ReturnType<typeof makeWorld>, token: string, name: string, args: unknown = {}) {
  const res = await rpc(world, token, { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } });
  assert.strictEqual(res.status, 200);
  return (await res.json()) as { result?: { isError: boolean; structuredContent?: any; content: { text: string }[] }; error?: { code: number; message: string } };
}

// ── tiny runner ──────────────────────────────────────────────────────────

const results: { name: string; ok: boolean; error?: unknown }[] = [];
async function test(name: string, fn: () => Promise<void> | void) {
  clock = START;
  resetRateLimits();
  fetchCalls = 0;
  try { await fn(); results.push({ name, ok: true }); } catch (error) { results.push({ name, ok: false, error }); }
}

async function main() {
  // ── discovery ──────────────────────────────────────────────────────────
  await test('discovery: issuer, endpoints and RFC 9207 flag line up', () => {
    const config = makeConfig();
    const as = authorizationServerMetadata(config);
    const pr = protectedResourceMetadata(config);
    assert.strictEqual(pr.resource, RESOURCE);
    assert.deepStrictEqual(pr.authorization_servers, [as.issuer]);
    assert.strictEqual(as.issuer, BASE);
    assert.ok(as.code_challenge_methods_supported.includes('S256'));
    assert.strictEqual(as.authorization_response_iss_parameter_supported, true);
    assert.strictEqual(as.client_id_metadata_document_supported, true);
    assert.deepStrictEqual(as.token_endpoint_auth_methods_supported, ['none']);
    // Every endpoint ends in a slash: the site redirects slash-less URLs, and a POST must never be redirected.
    for (const url of [as.authorization_endpoint, as.token_endpoint, as.revocation_endpoint]) {
      assert.ok(url.startsWith(`${BASE}/`) && url.endsWith('/'), url);
    }
    assert.ok(RESOURCE.endsWith('/'));
  });

  await test('config: refuses a non-https or path-bearing site URL', () => {
    assert.throws(() => loadMcpConfig({ MCP_PUBLIC_URL: 'http://radius.example.org' }));
    assert.throws(() => loadMcpConfig({ MCP_PUBLIC_URL: 'https://radius.example.org/app' }));
    assert.throws(() => loadMcpConfig({}));
  });

  // ── client + redirect validation ───────────────────────────────────────
  await test('client: only acceptable chatgpt.com client.json URLs are ever fetched', async () => {
    const config = makeConfig();
    for (const bad of [
      'http://chatgpt.com/oauth/client.json', 'https://evil.example/oauth/client.json',
      'https://chatgpt.com:8443/oauth/client.json', 'https://user@chatgpt.com/oauth/client.json',
      'https://chatgpt.com/oauth/client.json?x=1', 'https://chatgpt.com/other.json',
      'https://chatgpt.com.evil.example/oauth/client.json', 'https://chatgpt.com/oauth/../client.json', 'not a url',
    ]) {
      assert.strictEqual(isAcceptableClientIdUrl(bad, config), null, bad);
    }
    assert.ok(isAcceptableClientIdUrl('https://chatgpt.com/oauth/abc123_-/client.json', config));
    const world = makeWorld();
    assert.strictEqual(await world.oauth.resolveClient('https://evil.example/oauth/client.json'), null);
    assert.strictEqual(fetchCalls, 0, 'no network fetch for a disallowed host');
  });

  await test('client: a document whose client_id does not match its URL is rejected', async () => {
    const config = makeConfig();
    clearClientCache();
    const info = await resolveClient(CLIENT_ID, config, async () => ({ ...clientDocument, client_id: 'https://chatgpt.com/oauth/other/client.json' }));
    assert.strictEqual(info, null);
  });

  await test('authorize: unknown client is a fatal error, never a redirect', async () => {
    const world = makeWorld();
    const v = await validateAuthorizeRequest(world.oauth, authorizeParams('x'.repeat(43), { client_id: 'https://evil.example/oauth/client.json' }));
    assert.ok(!v.ok && v.fatal && v.error === 'invalid_client');
  });

  await test('authorize: redirect URI must be in BOTH the server allow-list and the client document', async () => {
    const world = makeWorld();
    const challenge = pkceS256('v'.repeat(50));
    const other = await validateAuthorizeRequest(world.oauth, authorizeParams(challenge, { redirect_uri: 'https://attacker.example/cb' }));
    assert.ok(!other.ok && other.fatal);
    // listed by the server but not by the client's own document
    const wide = makeWorld(makeConfig({ MCP_OAUTH_ALLOWED_REDIRECT_URIS: `${REDIRECT},https://chatgpt.com/connector/oauth/zzz` }));
    const notInDoc = await validateAuthorizeRequest(wide.oauth, authorizeParams(challenge, { redirect_uri: 'https://chatgpt.com/connector/oauth/zzz' }));
    assert.ok(!notInDoc.ok && notInDoc.fatal);
    // near-miss of a valid URI
    const near = await validateAuthorizeRequest(world.oauth, authorizeParams(challenge, { redirect_uri: `${REDIRECT}/` }));
    assert.ok(!near.ok && near.fatal);
  });

  await test('authorize: a redirect URI registered in the database works without any config change', async () => {
    const world = makeWorld(makeConfig({ MCP_OAUTH_ALLOWED_REDIRECT_URIS: '' }));
    const challenge = pkceS256('v'.repeat(50));
    assert.ok(!(await validateAuthorizeRequest(world.oauth, authorizeParams(challenge))).ok, 'nothing registered yet');
    world.store.allowedRedirects.push(REDIRECT);
    assert.ok((await validateAuthorizeRequest(world.oauth, authorizeParams(challenge))).ok);
    // Exact match only: a longer or different URI under the same host is still refused.
    const other = await validateAuthorizeRequest(world.oauth, authorizeParams(challenge, { redirect_uri: `${REDIRECT}/extra` }));
    assert.ok(!other.ok && other.fatal);
    world.store.allowedRedirects.length = 0;
    assert.ok(!(await validateAuthorizeRequest(world.oauth, authorizeParams(challenge))).ok, 'removing the row closes it again');
  });

  await test('authorize: an empty allow-list fails closed', async () => {
    const world = makeWorld(makeConfig({ MCP_OAUTH_ALLOWED_REDIRECT_URIS: '' }));
    const v = await validateAuthorizeRequest(world.oauth, authorizeParams(pkceS256('v'.repeat(50))));
    assert.ok(!v.ok && v.fatal);
  });

  await test('authorize: the resource may be named with or without the trailing slash', async () => {
    const world = makeWorld();
    const challenge = pkceS256('v'.repeat(50));
    for (const resource of [RESOURCE, RESOURCE.slice(0, -1)]) {
      const v = await validateAuthorizeRequest(world.oauth, authorizeParams(challenge, { resource }));
      assert.ok(v.ok && v.request.resource === RESOURCE, 'the stored audience is always the canonical URL');
    }
    const verifier = base64Url(randomBytes(48));
    const v = await validateAuthorizeRequest(world.oauth, authorizeParams(pkceS256(verifier), { resource: RESOURCE.slice(0, -1) }));
    if (!v.ok) throw new Error('setup');
    const a = await approveAuthorization(world.oauth, v.request, USER_A);
    if (!a.ok) throw new Error('setup');
    const r = await exchangeToken(world.oauth, {
      grant_type: 'authorization_code', code: new URL(a.redirectTo).searchParams.get('code')!, code_verifier: verifier,
      client_id: CLIENT_ID, redirect_uri: REDIRECT, resource: RESOURCE.slice(0, -1),
    });
    assert.strictEqual(r.status, 200);
  });

  await test('authorize: PKCE S256 is mandatory; bad scope/resource bounce with iss and state', async () => {
    const world = makeWorld();
    const challenge = pkceS256('v'.repeat(50));
    for (const [over, error] of [
      [{ code_challenge_method: 'plain' }, 'invalid_request'],
      [{ code_challenge_method: undefined }, 'invalid_request'],
      [{ code_challenge: undefined }, 'invalid_request'],
      [{ code_challenge: 'short' }, 'invalid_request'],
      [{ scope: 'radius:write' }, 'invalid_scope'],
      [{ scope: 'radius:read openid' }, 'invalid_scope'],
      [{ resource: 'https://other.example/api/mcp' }, 'invalid_target'],
      [{ response_type: 'token' }, 'unsupported_response_type'],
    ] as [Record<string, string | undefined>, string][]) {
      const v = await validateAuthorizeRequest(world.oauth, authorizeParams(challenge, over));
      assert.ok(!v.ok && !v.fatal && v.error === error, `${JSON.stringify(over)} -> ${JSON.stringify(v)}`);
    }
  });

  // ── approval, tokens, PKCE ─────────────────────────────────────────────
  await test('approve: an account that has not been enabled gets no code (insufficient permission)', async () => {
    const world = makeWorld();
    const v = await validateAuthorizeRequest(world.oauth, authorizeParams(pkceS256('v'.repeat(50))));
    assert.ok(v.ok);
    if (!v.ok) return;
    assert.deepStrictEqual(await approveAuthorization(world.oauth, v.request, USER_NO_ACCESS), { ok: false, error: 'access_not_enabled' });
    assert.strictEqual(world.store.grants.size, 0);
    assert.strictEqual(world.store.codes.size, 0);
    world.store.access.set(USER_B, { user_id: USER_B, scopes: ['radius:read'], revoked_at: '2026-10-01T00:00:00Z' });
    assert.deepStrictEqual(await approveAuthorization(world.oauth, v.request, USER_B), { ok: false, error: 'access_not_enabled' });
    world.store.access.set(USER_B, { user_id: USER_B, scopes: [], revoked_at: null });
    assert.deepStrictEqual(await approveAuthorization(world.oauth, v.request, USER_B), { ok: false, error: 'access_not_enabled' });
  });

  await test('approve/deny: redirects carry code or error, state and iss', async () => {
    const world = makeWorld();
    const v = await validateAuthorizeRequest(world.oauth, authorizeParams(pkceS256('v'.repeat(50))));
    assert.ok(v.ok);
    if (!v.ok) return;
    const ok = await approveAuthorization(world.oauth, v.request, USER_A);
    assert.ok(ok.ok);
    if (!ok.ok) return;
    const url = new URL(ok.redirectTo);
    assert.strictEqual(`${url.origin}${url.pathname}`, REDIRECT);
    assert.ok(url.searchParams.get('code')!.startsWith('rmcp_c_'));
    assert.strictEqual(url.searchParams.get('state'), 'st-123');
    assert.strictEqual(url.searchParams.get('iss'), BASE);
    const denied = new URL(await denyAuthorization(world.oauth, v.request, USER_A));
    assert.strictEqual(denied.searchParams.get('error'), 'access_denied');
    assert.strictEqual(denied.searchParams.get('iss'), BASE);
    assert.strictEqual(denied.searchParams.get('state'), 'st-123');
  });

  await test('token: full code + PKCE exchange issues bearer tokens bound to the resource', async () => {
    const world = makeWorld();
    const t = await connect(world);
    assert.ok(t.access_token.startsWith('rmcp_a_') && t.refresh_token.startsWith('rmcp_r_'));
    assert.strictEqual(t.expires_in, 3600);
    assert.strictEqual(t.scope, 'radius:read');
    const auth = await authenticateBearer(world.oauth, t.access_token);
    assert.ok(auth.ok && auth.principal.userId === USER_A && auth.principal.scopes.join() === 'radius:read');
    const grant = Array.from(world.store.grants.values())[0];
    assert.strictEqual(grant.resource, RESOURCE);
  });

  await test('token: secrets are stored only as hashes', async () => {
    const world = makeWorld();
    const t = await connect(world);
    const stored = JSON.stringify([Array.from(world.store.tokens.values()), Array.from(world.store.codes.values())]);
    for (const secret of [t.access_token, t.refresh_token, t.code, t.verifier]) assert.ok(!stored.includes(secret));
    assert.ok(world.store.tokens.has(sha256Hex(t.access_token)));
  });

  await test('token: wrong PKCE verifier, redirect_uri or client_id are refused', async () => {
    const world = makeWorld();
    for (const tweak of ['verifier', 'redirect', 'client'] as const) {
      const verifier = base64Url(randomBytes(48));
      const v = await validateAuthorizeRequest(world.oauth, authorizeParams(pkceS256(verifier)));
      if (!v.ok) throw new Error('setup');
      const a = await approveAuthorization(world.oauth, v.request, USER_A);
      if (!a.ok) throw new Error('setup');
      const code = new URL(a.redirectTo).searchParams.get('code')!;
      const r = await exchangeToken(world.oauth, {
        grant_type: 'authorization_code', code, client_id: tweak === 'client' ? 'https://chatgpt.com/oauth/zzz/client.json' : CLIENT_ID,
        redirect_uri: tweak === 'redirect' ? `${REDIRECT}?x=1` : REDIRECT,
        code_verifier: tweak === 'verifier' ? base64Url(randomBytes(48)) : verifier,
      });
      assert.strictEqual(r.status, 400, tweak);
      assert.strictEqual(r.body.error, 'invalid_grant', tweak);
      assert.strictEqual(r.body.access_token, undefined);
    }
  });

  await test('token: resource that is not this server is refused', async () => {
    const world = makeWorld();
    const r = await exchangeToken(world.oauth, { grant_type: 'refresh_token', refresh_token: 'x', client_id: CLIENT_ID, resource: 'https://other.example/api/mcp' });
    assert.strictEqual(r.body.error, 'invalid_target');
    const lookalike = await exchangeToken(world.oauth, { grant_type: 'refresh_token', refresh_token: 'x', client_id: CLIENT_ID, resource: `${BASE}/api/mcp/extra` });
    assert.strictEqual(lookalike.body.error, 'invalid_target');
  });

  await test('token: a replayed code is refused and revokes what it produced', async () => {
    const world = makeWorld();
    const t = await connect(world);
    const replay = await exchangeToken(world.oauth, {
      grant_type: 'authorization_code', code: t.code, code_verifier: t.verifier, client_id: CLIENT_ID, redirect_uri: REDIRECT,
    });
    assert.strictEqual(replay.body.error, 'invalid_grant');
    const auth = await authenticateBearer(world.oauth, t.access_token);
    assert.ok(!auth.ok, 'the access token from the first exchange must die');
  });

  await test('token: codes expire after five minutes', async () => {
    const world = makeWorld();
    const verifier = base64Url(randomBytes(48));
    const v = await validateAuthorizeRequest(world.oauth, authorizeParams(pkceS256(verifier)));
    if (!v.ok) throw new Error('setup');
    const a = await approveAuthorization(world.oauth, v.request, USER_A);
    if (!a.ok) throw new Error('setup');
    advance(5 * 60 + 1);
    const r = await exchangeToken(world.oauth, {
      grant_type: 'authorization_code', code: new URL(a.redirectTo).searchParams.get('code')!, code_verifier: verifier,
      client_id: CLIENT_ID, redirect_uri: REDIRECT,
    });
    assert.strictEqual(r.body.error, 'invalid_grant');
  });

  await test('token: unsupported grant types (client credentials) are refused', async () => {
    const world = makeWorld();
    const r = await exchangeToken(world.oauth, { grant_type: 'client_credentials', client_id: CLIENT_ID });
    assert.strictEqual(r.body.error, 'unsupported_grant_type');
  });

  await test('refresh: rotates, cannot widen scope, and reuse of an old token revokes the grant', async () => {
    const world = makeWorld();
    const t = await connect(world);
    const widened = await exchangeToken(world.oauth, { grant_type: 'refresh_token', refresh_token: t.refresh_token, client_id: CLIENT_ID, scope: 'radius:read radius:write' });
    assert.strictEqual(widened.body.error, 'invalid_scope');
    // the failed attempt consumed that refresh token, so start from a fresh connection
    const world2 = makeWorld();
    const t2 = await connect(world2);
    const next = await exchangeToken(world2.oauth, { grant_type: 'refresh_token', refresh_token: t2.refresh_token, client_id: CLIENT_ID });
    assert.strictEqual(next.status, 200);
    assert.notStrictEqual(next.body.access_token, t2.access_token);
    assert.ok((await authenticateBearer(world2.oauth, next.body.access_token as string)).ok);
    const reuse = await exchangeToken(world2.oauth, { grant_type: 'refresh_token', refresh_token: t2.refresh_token, client_id: CLIENT_ID });
    assert.strictEqual(reuse.body.error, 'invalid_grant');
    assert.ok(!(await authenticateBearer(world2.oauth, next.body.access_token as string)).ok, 'reuse must kill the new tokens too');
  });

  await test('refresh: wrong client_id is refused', async () => {
    const world = makeWorld();
    const t = await connect(world);
    const r = await exchangeToken(world.oauth, { grant_type: 'refresh_token', refresh_token: t.refresh_token, client_id: 'https://chatgpt.com/oauth/zzz/client.json' });
    assert.strictEqual(r.body.error, 'invalid_grant');
  });

  await test('bearer: access tokens expire after an hour; a grant ends after 90 days', async () => {
    const world = makeWorld();
    const t = await connect(world);
    advance(3600 - 1);
    assert.ok((await authenticateBearer(world.oauth, t.access_token)).ok);
    advance(2);
    assert.ok(!(await authenticateBearer(world.oauth, t.access_token)).ok);
    const refreshed = await exchangeToken(world.oauth, { grant_type: 'refresh_token', refresh_token: t.refresh_token, client_id: CLIENT_ID });
    assert.strictEqual(refreshed.status, 200);
    advance(91 * 24 * 3600);
    const late = await exchangeToken(world.oauth, { grant_type: 'refresh_token', refresh_token: refreshed.body.refresh_token as string, client_id: CLIENT_ID });
    assert.strictEqual(late.body.error, 'invalid_grant');
  });

  await test('bearer: disabling the user in mcp_access cuts off already-issued tokens at once', async () => {
    const world = makeWorld();
    const t = await connect(world);
    assert.ok((await authenticateBearer(world.oauth, t.access_token)).ok);
    world.store.access.set(USER_A, { user_id: USER_A, scopes: ['radius:read'], revoked_at: '2026-10-20T15:01:00Z' });
    assert.ok(!(await authenticateBearer(world.oauth, t.access_token)).ok);
    world.store.access.set(USER_A, { user_id: USER_A, scopes: ['radius:read'], revoked_at: null });
    world.store.users.delete(USER_A);
    assert.ok(!(await authenticateBearer(world.oauth, t.access_token)).ok, 'a deleted Radius user loses access');
  });

  await test('bearer: unknown, malformed and refresh tokens are not accepted as access tokens', async () => {
    const world = makeWorld();
    const t = await connect(world);
    for (const bad of ['', 'nonsense', t.refresh_token, t.code]) assert.ok(!(await authenticateBearer(world.oauth, bad)).ok);
  });

  await test('bearer: a token minted for a different resource is refused', async () => {
    const world = makeWorld();
    const t = await connect(world);
    Array.from(world.store.grants.values())[0].resource = 'https://other.example/api/mcp';
    assert.ok(!(await authenticateBearer(world.oauth, t.access_token)).ok);
  });

  await test('revoke: revoking either token ends the whole grant', async () => {
    const world = makeWorld();
    const t = await connect(world);
    await revokeToken(world.oauth, t.refresh_token);
    assert.ok(!(await authenticateBearer(world.oauth, t.access_token)).ok);
    await revokeToken(world.oauth, 'unknown-token'); // never throws
  });

  // ── MCP transport ──────────────────────────────────────────────────────
  await test('mcp: no token -> 401 with a discovery challenge; bad token -> invalid_token', async () => {
    const world = makeWorld();
    const none = await rpc(world, null, { jsonrpc: '2.0', id: 1, method: 'ping' });
    assert.strictEqual(none.status, 401);
    const challenge = none.headers.get('www-authenticate')!;
    assert.ok(challenge.startsWith('Bearer '));
    assert.ok(challenge.includes(`resource_metadata="${BASE}/.well-known/oauth-protected-resource/api/mcp"`));
    assert.ok(!challenge.includes('invalid_token'));
    const bad = await rpc(world, 'rmcp_a_forged', { jsonrpc: '2.0', id: 1, method: 'ping' });
    assert.strictEqual(bad.status, 401);
    assert.ok(bad.headers.get('www-authenticate')!.includes('error="invalid_token"'));
    assert.strictEqual(world.repo.calls.length, 0, 'unauthenticated requests never reach the data layer');
  });

  await test('mcp: initialize, initialized notification, ping, unknown method', async () => {
    const world = makeWorld();
    const t = await connect(world);
    const init = await (await rpc(world, t.access_token, { jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 't', version: '1' } } })).json();
    assert.strictEqual(init.result.protocolVersion, '2025-06-18');
    assert.deepStrictEqual(init.result.capabilities, { tools: { listChanged: false } });
    assert.strictEqual(init.result.serverInfo.name, 'radius-mcp');
    const older = await (await rpc(world, t.access_token, { jsonrpc: '2.0', id: 2, method: 'initialize', params: { protocolVersion: '1999-01-01' } })).json();
    assert.strictEqual(older.result.protocolVersion, '2025-06-18');
    const note = await rpc(world, t.access_token, { jsonrpc: '2.0', method: 'notifications/initialized' });
    assert.strictEqual(note.status, 202);
    assert.deepStrictEqual(await (await rpc(world, t.access_token, { jsonrpc: '2.0', id: 3, method: 'ping' })).json(), { jsonrpc: '2.0', id: 3, result: {} });
    const unknown = await (await rpc(world, t.access_token, { jsonrpc: '2.0', id: 4, method: 'resources/list' })).json();
    assert.strictEqual(unknown.error.code, -32601);
  });

  await test('mcp: malformed requests are rejected cleanly', async () => {
    const world = makeWorld();
    const t = await connect(world);
    const badJson = await handleMcpPost(new Request(RESOURCE, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${t.access_token}` }, body: '{nope' }), world.server);
    assert.strictEqual(badJson.status, 400);
    const wrongType = await handleMcpPost(new Request(RESOURCE, { method: 'POST', headers: { 'content-type': 'text/plain', authorization: `Bearer ${t.access_token}` }, body: 'x' }), world.server);
    assert.strictEqual(wrongType.status, 415);
    const badVersion = await rpc(world, t.access_token, { jsonrpc: '2.0', id: 1, method: 'ping' }, { 'mcp-protocol-version': '1999-01-01' });
    assert.strictEqual(badVersion.status, 400);
    const huge = await handleMcpPost(new Request(RESOURCE, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${t.access_token}` }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'ping', params: { pad: 'x'.repeat(200_000) } }) }), world.server);
    assert.strictEqual(huge.status, 413);
    assert.strictEqual(methodNotAllowed().status, 405);
  });

  await test('mcp: a database outage during authentication is a clean 503 that leaks nothing', async () => {
    const world = makeWorld();
    const t = await connect(world);
    world.store.getToken = async () => { throw new Error('connect ECONNREFUSED 10.0.0.5:5432 password=hunter2'); };
    const res = await rpc(world, t.access_token, { jsonrpc: '2.0', id: 1, method: 'ping' });
    assert.strictEqual(res.status, 503);
    const body = await res.text();
    assert.ok(!body.includes('hunter2') && !body.includes('5432'));
  });

  await test('mcp: tools/list advertises exactly the five read-only tools with schemas and annotations', async () => {
    const world = makeWorld();
    const t = await connect(world);
    const res = await (await rpc(world, t.access_token, { jsonrpc: '2.0', id: 1, method: 'tools/list' })).json();
    const tools = res.result.tools as any[];
    assert.deepStrictEqual(tools.map((x) => x.name).sort(), ['get_leader', 'list_follow_ups', 'list_leader_connections', 'list_leader_notes', 'search_leaders']);
    for (const tool of tools) {
      assert.strictEqual(tool.annotations.readOnlyHint, true, tool.name);
      assert.strictEqual(tool.annotations.destructiveHint, false, tool.name);
      assert.strictEqual(tool.annotations.openWorldHint, false, tool.name);
      assert.strictEqual(tool.inputSchema.additionalProperties, false, tool.name);
      assert.ok(tool.description.length > 40 && tool.outputSchema, tool.name);
      assert.deepStrictEqual(tool.securitySchemes, [{ type: 'oauth2', scopes: ['radius:read'] }]);
    }
    assert.ok(!tools.some((x) => /^(create|add|update|delete|complete|log|set|send)/.test(x.name)), 'no write tools exist');
  });

  await test('mcp: a tool the connection has no scope for is hidden and refused (read/write separation)', async () => {
    const world = makeWorld();
    const writeTool: ToolDefinition = {
      name: 'add_note', title: 'Add note', description: 'x'.repeat(50), requiredScope: 'radius:write',
      inputSchema: { type: 'object', additionalProperties: false, properties: {} },
      outputSchema: { type: 'object', properties: {} },
      run: async () => { throw new Error('must never run'); },
    };
    world.server.tools = [...READ_TOOLS, writeTool];
    const t = await connect(world);
    const list = await (await rpc(world, t.access_token, { jsonrpc: '2.0', id: 1, method: 'tools/list' })).json();
    assert.ok(!list.result.tools.some((x: any) => x.name === 'add_note'));
    const r = await call(world, t.access_token, 'add_note', {});
    assert.strictEqual(r.result?.isError, true);
    assert.ok(world.store.auditLog.some((e) => e.tool === 'add_note' && e.ok === false && e.error === 'insufficient_scope'));
  });

  // ── tools ──────────────────────────────────────────────────────────────
  await test('tool search_leaders: filters, ids, links, pagination and limits', async () => {
    const world = makeWorld();
    const t = await connect(world);
    const all = (await call(world, t.access_token, 'search_leaders', { limit: 2 })).result!.structuredContent;
    assert.strictEqual(all.total, 4);
    assert.strictEqual(all.items.length, 2);
    assert.ok(all.next_cursor);
    const second = (await call(world, t.access_token, 'search_leaders', { limit: 2, cursor: all.next_cursor })).result!.structuredContent;
    assert.strictEqual(second.items.length, 2);
    assert.strictEqual(second.next_cursor, null);
    const ids = [...all.items, ...second.items].map((i: any) => i.id);
    assert.strictEqual(new Set(ids).size, 4, 'pages must not overlap');
    assert.strictEqual(all.items[0].radius_url, `${BASE}/circle/${all.items[0].id}`);
    const byAcpd = (await call(world, t.access_token, 'search_leaders', { acpd: 'pat' })).result!.structuredContent;
    assert.deepStrictEqual(byAcpd.items.map((i: any) => i.id).sort(), [3, 4]);
    const byStatus = (await call(world, t.access_token, 'search_leaders', { status: ['paused'] })).result!.structuredContent;
    assert.deepStrictEqual(byStatus.items.map((i: any) => i.id), [3]);
    const flagged = (await call(world, t.access_token, 'search_leaders', { follow_up_required: true, campus: 'lake' })).result!.structuredContent;
    assert.deepStrictEqual(flagged.items.map((i: any) => i.id), [1]);
    const tooBig = (await call(world, t.access_token, 'search_leaders', { limit: 51 })).result!;
    assert.strictEqual(tooBig.isError, true);
    assert.match(tooBig.content[0].text, /"limit" must be at most 50/, 'validation errors must say what is wrong, not "try again"');
    assert.strictEqual((await call(world, t.access_token, 'search_leaders', { cursor: 'garbage' })).result!.isError, true);
    assert.strictEqual((await call(world, t.access_token, 'search_leaders', { query: '%_,()' })).result!.isError, true);
  });

  await test('tool get_leader: profile and circle info, and never contact details', async () => {
    const world = makeWorld();
    const t = await connect(world);
    const out = (await call(world, t.access_token, 'get_leader', { leader_id: 1 })).result!.structuredContent;
    assert.strictEqual(out.leader.name, 'Jordan Avery');
    assert.strictEqual(out.leader.circle_name, 'LVT | S1 | Jordan Avery');
    assert.strictEqual(out.last_note.created_by_name, 'Alex Morgan');
    assert.strictEqual(out.last_connection.connection_type, 'Text');
    const text = JSON.stringify(out).toLowerCase();
    for (const forbidden of ['phone', 'email', 'birthday', 'prayer', 'password', 'token']) assert.ok(!text.includes(forbidden), `must not expose ${forbidden}`);
    const missing = await call(world, t.access_token, 'get_leader', { leader_id: 999 });
    assert.strictEqual(missing.result!.isError, true);
    assert.strictEqual((await call(world, t.access_token, 'get_leader', {})).result!.isError, true);
    assert.strictEqual((await call(world, t.access_token, 'get_leader', { leader_id: '1' })).result!.isError, true);
  });

  await test('tool list_leader_notes: authors by name, since filter, long notes capped', async () => {
    const world = makeWorld();
    const t = await connect(world);
    const out = (await call(world, t.access_token, 'list_leader_notes', { leader_id: 1 })).result!.structuredContent;
    assert.strictEqual(out.total, 3);
    assert.deepStrictEqual(out.items.map((n: any) => n.id), [11, 12, 13]);
    assert.strictEqual(out.items[0].created_by_name, 'Alex Morgan');
    assert.strictEqual(out.items[2].truncated, true);
    assert.ok(out.items[2].content.length <= 5001);
    const recent = (await call(world, t.access_token, 'list_leader_notes', { leader_id: 1, since: '2026-09-15' })).result!.structuredContent;
    assert.deepStrictEqual(recent.items.map((n: any) => n.id), [11]);
    assert.strictEqual((await call(world, t.access_token, 'list_leader_notes', { leader_id: 1, since: '2026-13-45' })).result!.isError, true);
    assert.strictEqual((await call(world, t.access_token, 'list_leader_notes', { leader_id: 999 })).result!.isError, true);
  });

  await test('tool list_leader_connections: types, dates and notes in order', async () => {
    const world = makeWorld();
    const t = await connect(world);
    const out = (await call(world, t.access_token, 'list_leader_connections', { leader_id: 1 })).result!.structuredContent;
    assert.deepStrictEqual(out.items.map((c: any) => [c.id, c.connection_type, c.date_of_connection]), [[31, 'Text', '2026-10-04'], [32, 'Coffee', '2026-09-20']]);
    assert.strictEqual(out.items[1].note, null);
  });

  await test('tool list_follow_ups: upcoming, overdue and completed are classified by Central time', async () => {
    const world = makeWorld();
    const t = await connect(world); // clock is 2026-10-20 10:00 Central
    const overdue = (await call(world, t.access_token, 'list_follow_ups', { status: 'overdue' })).result!.structuredContent;
    assert.strictEqual(overdue.as_of_date, '2026-10-20');
    assert.strictEqual(overdue.timezone, 'America/Chicago');
    assert.deepStrictEqual(overdue.items.map((i: any) => i.id), ['leader:1', 'todo:101']);
    const upcoming = (await call(world, t.access_token, 'list_follow_ups', { status: 'upcoming' })).result!.structuredContent;
    assert.deepStrictEqual(upcoming.items.map((i: any) => i.id), ['todo:102', 'leader:2', 'leader:4']);
    const done = (await call(world, t.access_token, 'list_follow_ups', { status: 'completed' })).result!.structuredContent;
    assert.deepStrictEqual(done.items.map((i: any) => i.id), ['todo:103']);
    assert.strictEqual(done.items[0].completed_at, '2026-10-02T10:00:00Z');
    const all = (await call(world, t.access_token, 'list_follow_ups', { status: 'all' })).result!.structuredContent;
    assert.strictEqual(all.total, 6);
    const forLeader = (await call(world, t.access_token, 'list_follow_ups', { status: 'all', leader_id: 1 })).result!.structuredContent;
    assert.deepStrictEqual(forLeader.items.map((i: any) => i.id), ['leader:1', 'todo:101', 'todo:103']);
    const ranged = (await call(world, t.access_token, 'list_follow_ups', { status: 'all', from: '2026-10-20', to: '2026-11-01' })).result!.structuredContent;
    assert.deepStrictEqual(ranged.items.map((i: any) => i.id), ['todo:102']);
    // just before and after midnight Central on the due date
    clock = new Date('2026-10-18T04:59:00Z').getTime(); // Oct 17 23:59 Central: not yet overdue
    const eve = (await call(world, t.access_token, 'list_follow_ups', { status: 'overdue' })).result!.structuredContent;
    assert.ok(!eve.items.some((i: any) => i.id === 'todo:101'));
  });

  await test('isolation: personal follow-ups come only from the token\'s user; no argument can change that', async () => {
    const world = makeWorld();
    const a = await connect(world, USER_A);
    const b = await connect(world, USER_B);
    const asA = (await call(world, a.access_token, 'list_follow_ups', { status: 'all' })).result!.structuredContent;
    const asB = (await call(world, b.access_token, 'list_follow_ups', { status: 'all' })).result!.structuredContent;
    assert.ok(asA.items.some((i: any) => i.id === 'todo:101'));
    assert.ok(!JSON.stringify(asA).includes('SECRET'), "user A must never see user B's todo");
    assert.ok(asB.items.some((i: any) => i.id === 'todo:201'));
    assert.ok(!asB.items.some((i: any) => i.id === 'todo:101' || i.id === 'todo:103'), "user B must never see user A's todos");
    for (const arg of [{ user_id: USER_B }, { userId: USER_B }, { as_user: USER_B }]) {
      const r = await call(world, a.access_token, 'list_follow_ups', arg);
      assert.strictEqual(r.result!.isError, true, `${JSON.stringify(arg)} must be rejected as an unknown argument`);
    }
    assert.ok(world.repo.calls.includes(`personalFollowUps:${USER_A}`) && world.repo.calls.includes(`personalFollowUps:${USER_B}`));
    assert.ok(!world.repo.calls.some((c) => c.startsWith('personalFollowUps:') && ![USER_A, USER_B].includes(c.split(':')[1])));
    // a token for one user cannot be used to act as the other
    assert.notStrictEqual((await authenticateBearer(world.oauth, a.access_token) as any).principal.userId, (await authenticateBearer(world.oauth, b.access_token) as any).principal.userId);
  });

  await test('tool outputs conform to their published output schemas', async () => {
    const world = makeWorld();
    const t = await connect(world);
    const ajv = new Ajv({ allErrors: true });
    const cases: [string, unknown][] = [
      ['search_leaders', {}], ['get_leader', { leader_id: 1 }], ['list_leader_notes', { leader_id: 1 }],
      ['list_leader_connections', { leader_id: 1 }], ['list_follow_ups', { status: 'all' }],
    ];
    for (const [name, args] of cases) {
      const tool = READ_TOOLS.find((x) => x.name === name)!;
      const res = await call(world, t.access_token, name, args);
      assert.strictEqual(res.result!.isError, false, name);
      const validate = ajv.compile(tool.outputSchema);
      assert.ok(validate(res.result!.structuredContent), `${name}: ${JSON.stringify(validate.errors)}`);
      assert.deepStrictEqual(JSON.parse(res.result!.content[0].text), res.result!.structuredContent, `${name}: text mirrors structured output`);
    }
  });

  await test('tool errors: unknown tool is a protocol error; internal failures leak nothing', async () => {
    const world = makeWorld();
    const t = await connect(world);
    const unknown = await call(world, t.access_token, 'delete_everything', {});
    assert.strictEqual(unknown.error?.code, -32602);
    world.repo.searchLeaders = async () => { throw new Error('connection to db.internal:5432 refused; password=hunter2'); };
    const failed = await call(world, t.access_token, 'search_leaders', {});
    assert.strictEqual(failed.result!.isError, true);
    assert.ok(!failed.result!.content[0].text.includes('hunter2') && !failed.result!.content[0].text.includes('5432'));
  });

  await test('audit: every call is logged with counts, never with record contents', async () => {
    const world = makeWorld();
    const t = await connect(world);
    await call(world, t.access_token, 'list_leader_notes', { leader_id: 1 });
    await call(world, t.access_token, 'get_leader', { leader_id: 999 });
    const entries = world.store.auditLog.filter((e) => e.event === 'tool_call');
    assert.strictEqual(entries.length, 2);
    assert.deepStrictEqual([entries[0].tool, entries[0].ok, entries[0].result_count, entries[0].user_id], ['list_leader_notes', true, 3, USER_A]);
    assert.strictEqual(entries[1].ok, false);
    assert.ok(!JSON.stringify(world.store.auditLog).includes('Great conversation'), 'note text must not be written to the audit log');
    for (const ev of ['authorize_approved', 'token_issued']) assert.ok(world.store.auditLog.some((e) => e.event === ev), ev);
  });

  await test('rate limit: a runaway loop is slowed with 429', async () => {
    const world = makeWorld();
    const t = await connect(world);
    let last = 200;
    for (let i = 0; i < 125; i++) last = (await rpc(world, t.access_token, { jsonrpc: '2.0', id: i + 1, method: 'ping' })).status;
    assert.strictEqual(last, 429);
  });

  await test('likeTerm: filter syntax and wildcards cannot survive into a query', () => {
    for (const hostile of ['a,b', 'a)(b', 'a%b', 'a_b', 'a*b', 'a"b', 'a\\b', 'x),or(id.gt.0', 'a\nb']) {
      assert.ok(!/[,()*%_\\"\n]/.test(likeTerm(hostile)), hostile);
    }
    assert.strictEqual(likeTerm("Marcus O'Hale"), "Marcus O'Hale");
    assert.strictEqual(likeTerm('Zoë Müller-Åberg'), 'Zoë Müller-Åberg');
  });

  // ── report ─────────────────────────────────────────────────────────────
  const failed = results.filter((r) => !r.ok);
  for (const r of results) console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.name}`);
  for (const r of failed) {
    console.log(`\n--- ${r.name}\n${r.error instanceof Error ? r.error.stack || r.error.message : r.error}`);
  }
  console.log(`\n${results.length - failed.length}/${results.length} passed`);
  if (failed.length) process.exit(1);
}

main().catch((e) => { console.error(e); process.exit(1); });
