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
import { isThisResource } from '../lib/mcp/config';
import { assistantName, disconnect, disconnectAll, getAssistantAccess } from '../lib/mcp/connections';
import { readLimitedText } from '../lib/mcp/http';
import { LEADER_COLUMNS, createSupabaseReadRepo, likeTerm } from '../lib/mcp/repo';
import { createSupabaseMcpStore } from '../lib/mcp/store-supabase';
import { handleMcpPost, methodNotAllowed, resetRateLimits, type McpServerDeps } from '../lib/mcp/server';
import { ALL_TOOLS, READ_TOOLS, type ToolDefinition } from '../lib/mcp/tools';
import { CONNECTION_TYPES, CONTACTS, MemoryContactRepo, MemoryRepo, MemoryStore, MemoryWriteRepo, SUMMARIES } from './mcp-test-support';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const Ajv = require('ajv');

const BASE = 'https://radius.example.org';
const RESOURCE = `${BASE}/api/mcp/`;
const REDIRECT = 'https://chatgpt.com/connector_platform_oauth_redirect';
const CLIENT_ID = 'https://chatgpt.com/oauth/client.json';
const USER_A = 'user-a';
const USER_B = 'user-b';
const USER_NO_ACCESS = 'user-c';
const USER_VIEWER = 'user-v';

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
  for (const u of [USER_A, USER_B, USER_NO_ACCESS, USER_VIEWER]) store.users.add(u);
  store.access.set(USER_A, { user_id: USER_A, scopes: ['radius:read'], revoked_at: null });
  store.access.set(USER_B, { user_id: USER_B, scopes: ['radius:read'], revoked_at: null });
  const repo = new MemoryRepo();
  const contacts = new MemoryContactRepo();
  const writes = new MemoryWriteRepo(repo, () => new Date(clock).toISOString());
  clearClientCache();
  const oauth: OAuthDeps = {
    store, config, now,
    resolveClient: (id) => resolveClient(id, config, async () => { fetchCalls++; return clientDocument; }, clock),
  };
  const server: McpServerDeps = { ...oauth, repo, contacts, writes };
  return { store, repo, contacts, writes, oauth, server, config };
}

const authorizeParams = (challenge: string, over: Record<string, string | undefined> = {}) => ({
  response_type: 'code', client_id: CLIENT_ID, redirect_uri: REDIRECT, code_challenge: challenge,
  code_challenge_method: 'S256', scope: 'radius:read', state: 'st-123', resource: RESOURCE, ...over,
});

/** Turns scopes (and optionally a campus allow-list) on for a user, as the SQL grant would. */
function enable(world: ReturnType<typeof makeWorld>, userId: string, scopes: string[], campuses: string[] | null = null) {
  world.store.access.set(userId, { user_id: userId, scopes, campuses, revoked_at: null });
}

async function connect(world: ReturnType<typeof makeWorld>, userId = USER_A, scope?: string) {
  const verifier = base64Url(randomBytes(48));
  const validation = await validateAuthorizeRequest(world.oauth, authorizeParams(pkceS256(verifier), scope ? { scope } : {}));
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
    assert.ok(!v.ok && v.fatal && v.error === 'invalid_request');
  });

  await test('authorize: every pre-redirect failure gives the same answer, so it is not an oracle', async () => {
    const world = makeWorld();
    const challenge = pkceS256('v'.repeat(50));
    const answers = new Set<string>();
    for (const over of [
      { client_id: 'https://evil.example/oauth/client.json' },   // unknown client
      { redirect_uri: 'https://attacker.example/cb' },           // unregistered redirect
      { client_id: 'https://chatgpt.com/oauth/other/client.json', redirect_uri: 'https://attacker.example/cb' },
    ]) {
      const v = await validateAuthorizeRequest(world.oauth, authorizeParams(challenge, over));
      assert.ok(!v.ok && v.fatal);
      answers.add(JSON.stringify([v.error, v.description]));
    }
    assert.strictEqual(answers.size, 1, `expected one indistinguishable answer, got ${Array.from(answers).join(' | ')}`);
  });

  await test('authorize: an unregistered redirect is refused before any outbound fetch', async () => {
    const world = makeWorld();
    await validateAuthorizeRequest(world.oauth, authorizeParams(pkceS256('v'.repeat(50)), { redirect_uri: 'https://attacker.example/cb' }));
    assert.strictEqual(fetchCalls, 0);
  });

  await test('client cache: inventing client ids evicts one entry at a time, never the whole cache', async () => {
    const config = makeConfig();
    clearClientCache();
    const fetcher = async (url: string) => ({ client_id: url, redirect_uris: [REDIRECT] });
    await resolveClient(CLIENT_ID, config, fetcher, clock);
    for (let i = 0; i < 250; i++) await resolveClient(`https://chatgpt.com/oauth/junk${i}/client.json`, config, fetcher, clock);
    let refetched = 0;
    await resolveClient(`https://chatgpt.com/oauth/junk249/client.json`, config, async (u) => { refetched++; return { client_id: u, redirect_uris: [REDIRECT] }; }, clock);
    assert.strictEqual(refetched, 0, 'the most recent entries must still be cached');
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
    advance(11); // past the retry grace window
    const reuse = await exchangeToken(world2.oauth, { grant_type: 'refresh_token', refresh_token: t2.refresh_token, client_id: CLIENT_ID });
    assert.strictEqual(reuse.body.error, 'invalid_grant');
    assert.ok(!(await authenticateBearer(world2.oauth, next.body.access_token as string)).ok, 'reuse must kill the new tokens too');
  });

  await test('refresh: a retry right after rotation is refused but does not end the grant', async () => {
    const world = makeWorld();
    const t = await connect(world);
    const next = await exchangeToken(world.oauth, { grant_type: 'refresh_token', refresh_token: t.refresh_token, client_id: CLIENT_ID });
    assert.strictEqual(next.status, 200);
    advance(3);
    const retry = await exchangeToken(world.oauth, { grant_type: 'refresh_token', refresh_token: t.refresh_token, client_id: CLIENT_ID });
    assert.strictEqual(retry.body.error, 'invalid_grant');
    assert.ok((await authenticateBearer(world.oauth, next.body.access_token as string)).ok, 'the newest tokens must survive a quick retry');
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

  await test('bearer: an unreadable expiry fails closed; the SQL timestamp form still parses', async () => {
    const world = makeWorld();
    const t = await connect(world);
    const stored = world.store.tokens.get(sha256Hex(t.access_token))!;
    stored.expires_at = 'not a timestamp';
    assert.ok(!(await authenticateBearer(world.oauth, t.access_token)).ok, 'garbage expiry must not count as unexpired');
    stored.expires_at = '2026-10-20 16:00:00+00';
    assert.ok((await authenticateBearer(world.oauth, t.access_token)).ok, 'a valid SQL-style timestamp must still work');
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

  await test('mcp: tokens that cannot be ours are rejected without a database read or a log row', async () => {
    const world = makeWorld();
    let reads = 0;
    const getToken = world.store.getToken.bind(world.store);
    world.store.getToken = async (h) => { reads++; return getToken(h); };
    const before = world.store.auditLog.length;
    for (const bad of ['x', 'rmcp_a_forged', 'rmcp_a_' + 'A'.repeat(42), 'rmcp_a_' + 'A'.repeat(44), 'rmcp_r_' + 'A'.repeat(43), 'rmcp_a_' + 'A'.repeat(42) + '!']) {
      const res = await rpc(world, bad, { jsonrpc: '2.0', id: 1, method: 'ping' });
      assert.strictEqual(res.status, 401, bad);
    }
    assert.strictEqual(reads, 0);
    assert.strictEqual(world.store.auditLog.length, before, 'unauthenticated requests must not write audit rows');
    // a well-formed but unknown token does reach the store, still without a log row
    const unknown = await rpc(world, 'rmcp_a_' + 'A'.repeat(43), { jsonrpc: '2.0', id: 1, method: 'ping' });
    assert.strictEqual(unknown.status, 401);
    assert.strictEqual(reads, 1);
    assert.strictEqual(world.store.auditLog.length, before);
  });

  await test('mcp: a read-only connection sees exactly the seven read tools, all read-only, and no write or contact tool', async () => {
    const world = makeWorld();
    const t = await connect(world);
    const res = await (await rpc(world, t.access_token, { jsonrpc: '2.0', id: 1, method: 'tools/list' })).json();
    const tools = res.result.tools as any[];
    assert.deepStrictEqual(tools.map((x) => x.name).sort(), [
      'get_event_summary', 'get_leader', 'list_event_summaries', 'list_follow_ups', 'list_leader_connections', 'list_leader_notes', 'search_leaders',
    ]);
    for (const tool of tools) {
      assert.strictEqual(tool.annotations.readOnlyHint, true, tool.name);
      assert.strictEqual(tool.annotations.destructiveHint, false, tool.name);
      assert.strictEqual(tool.annotations.openWorldHint, false, tool.name);
      assert.strictEqual(tool.inputSchema.additionalProperties, false, tool.name);
      assert.ok(tool.description.length > 40 && tool.outputSchema, tool.name);
      assert.deepStrictEqual(tool.securitySchemes, [{ type: 'oauth2', scopes: ['radius:read'] }]);
    }
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

  await test('rate limit: batching cannot be used to get around it', async () => {
    const world = makeWorld();
    const t = await connect(world);
    const batch = Array.from({ length: 20 }, (_, i) => ({ jsonrpc: '2.0', id: i + 1, method: 'ping' }));
    const statuses: number[] = [];
    for (let i = 0; i < 8; i++) statuses.push((await rpc(world, t.access_token, batch)).status);
    assert.deepStrictEqual(statuses.slice(0, 6), [200, 200, 200, 200, 200, 200], '6 x 20 = 120 messages are allowed');
    assert.strictEqual(statuses[6], 429);
  });

  await test('rate limit: a runaway loop is slowed with 429', async () => {
    const world = makeWorld();
    const t = await connect(world);
    let last = 200;
    for (let i = 0; i < 125; i++) last = (await rpc(world, t.access_token, { jsonrpc: '2.0', id: i + 1, method: 'ping' })).status;
    assert.strictEqual(last, 429);
  });

  await test('audit: a failing audit write stops the response instead of returning unlogged data', async () => {
    const world = makeWorld();
    const t = await connect(world);
    world.store.audit = async () => { throw new Error('audit write failed: relation does not exist'); };
    const res = await rpc(world, t.access_token, { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'list_leader_notes', arguments: { leader_id: 1 } } });
    assert.strictEqual(res.status, 503);
    const body = await res.text();
    assert.ok(!body.includes('Great conversation'), 'note text must not be returned when it could not be logged');
  });

  await test('audit: logged arguments are size-capped', async () => {
    const world = makeWorld();
    const t = await connect(world);
    await call(world, t.access_token, 'search_leaders', { query: 'x'.repeat(50_000) }); // rejected: too long
    const entry = world.store.auditLog.filter((e) => e.event === 'tool_call').pop()!;
    assert.ok(JSON.stringify(entry.args).length < 2200, `logged ${JSON.stringify(entry.args).length} chars`);
    assert.strictEqual((entry.args as any).truncated, true);
  });

  await test('input: a huge resource value cannot pin the CPU (the old regex was quadratic)', async () => {
    const config = makeConfig();
    const started = Date.now();
    assert.strictEqual(isThisResource(config, '/'.repeat(1_000_000) + 'x'), false);
    assert.strictEqual(isThisResource(config, `${BASE}/api/mcp${'/'.repeat(100_000)}`), false, 'over the length cap');
    assert.ok(isThisResource(config, RESOURCE) && isThisResource(config, RESOURCE.slice(0, -1)));
    assert.ok(Date.now() - started < 250, `took ${Date.now() - started}ms`);
    const world = makeWorld();
    const t0 = Date.now();
    const r = await exchangeToken(world.oauth, { grant_type: 'refresh_token', refresh_token: 'x', client_id: CLIENT_ID, resource: '/'.repeat(500_000) + 'x' });
    assert.strictEqual(r.body.error, 'invalid_target');
    assert.ok(Date.now() - t0 < 250);
  });

  await test('input: bodies over the limit are refused by declared length or by actual size', async () => {
    const declared = { headers: { get: () => '999999' }, text: async () => { throw new Error('must not read'); } } as any;
    assert.strictEqual(await readLimitedText(declared, 1000), null);
    const sneaky = { headers: { get: () => null }, text: async () => 'é'.repeat(600) } as any; // 1200 bytes, 600 chars
    assert.strictEqual(await readLimitedText(sneaky, 1000), null, 'limit is in bytes, not characters');
    assert.strictEqual(await readLimitedText({ headers: { get: () => '5' }, text: async () => 'hello' } as any, 1000), 'hello');
  });

  await test('input: tool arguments cannot smuggle prototype keys, absurd ids or loose PKCE challenges', async () => {
    const world = makeWorld();
    const t = await connect(world);
    for (const args of [{ leader_id: 1, toString: 1 }, { leader_id: 1, constructor: {} }, { leader_id: 1, hasOwnProperty: 1 }]) {
      assert.strictEqual((await call(world, t.access_token, 'get_leader', args)).result!.isError, true, JSON.stringify(args));
    }
    assert.strictEqual((await call(world, t.access_token, 'get_leader', { leader_id: 2147483648 })).result!.isError, true);
    assert.strictEqual((await call(world, t.access_token, 'get_leader', { leader_id: 2147483647 })).result!.isError, true, 'valid shape, but no such leader');
    for (const challenge of ['a'.repeat(42), 'a'.repeat(44), 'a'.repeat(42) + '.', 'a'.repeat(42) + '~']) {
      const v = await validateAuthorizeRequest(world.oauth, authorizeParams(challenge));
      assert.ok(!v.ok && !v.fatal && v.error === 'invalid_request', challenge);
    }
  });

  await test('follow-ups: completion is filtered in the database, and a capped source is reported', async () => {
    const world = makeWorld();
    const t = await connect(world);
    await call(world, t.access_token, 'list_follow_ups', { status: 'overdue' });
    assert.strictEqual(world.repo.lastTodoFilter?.completed, false);
    await call(world, t.access_token, 'list_follow_ups', { status: 'completed' });
    assert.strictEqual(world.repo.lastTodoFilter?.completed, true);
    await call(world, t.access_token, 'list_follow_ups', { status: 'all' });
    assert.strictEqual(world.repo.lastTodoFilter?.completed, undefined);
    assert.strictEqual((await call(world, t.access_token, 'list_follow_ups', {})).result!.structuredContent.results_may_be_incomplete, false);
    world.repo.capped = true;
    assert.strictEqual((await call(world, t.access_token, 'list_follow_ups', {})).result!.structuredContent.results_may_be_incomplete, true);
  });

  // ── the real Supabase layer, with the query builder recorded ───────────
  function recordingDb(result: { data: any; error: any; count?: number } = { data: [], error: null, count: 0 }) {
    const queries: { table: string; ops: any[][] }[] = [];
    const db = {
      from(table: string) {
        const q = { table, ops: [] as any[][] };
        queries.push(q);
        const proxy: any = new Proxy(function () {}, {
          get(_t, prop: string) {
            if (prop === 'then') return (resolve: (v: unknown) => void) => resolve(result);
            return (...args: any[]) => { q.ops.push([prop, ...args]); return proxy; };
          },
        });
        return proxy;
      },
    };
    return { db: db as any, queries };
  }

  await test('real repo: personal to-dos are always filtered by the user id it is given', async () => {
    for (const userId of ['user-a', 'user-b']) {
      const { db, queries } = recordingDb();
      await createSupabaseReadRepo(db).personalFollowUps(userId, { completed: false });
      assert.strictEqual(queries.length, 1);
      assert.strictEqual(queries[0].table, 'todo_items');
      assert.ok(queries[0].ops.some((o) => o[0] === 'eq' && o[1] === 'user_id' && o[2] === userId), `no user_id filter for ${userId}`);
      assert.ok(queries[0].ops.some((o) => o[0] === 'eq' && o[1] === 'completed' && o[2] === false));
    }
    const { db, queries } = recordingDb();
    await createSupabaseReadRepo(db).personalFollowUps('user-a', { leaderId: 7 });
    assert.ok(queries[0].ops.some((o) => o[0] === 'eq' && o[1] === 'user_id' && o[2] === 'user-a'), 'a leader filter must not replace the user filter');
  });

  await test('real repo: leader queries select only whitelisted columns and sanitise search text', async () => {
    assert.ok(!/phone|email|birthday|prayer|ccb_profile|password|token/i.test(LEADER_COLUMNS), `LEADER_COLUMNS leaks: ${LEADER_COLUMNS}`);
    const { db, queries } = recordingDb();
    const repo = createSupabaseReadRepo(db);
    await repo.searchLeaders({ query: 'x),or(id.gt.0', campus: 'a%b_c', limit: 5, offset: 0 });
    const q = queries[0];
    const select = q.ops.find((o) => o[0] === 'select')!;
    assert.strictEqual(select[1], LEADER_COLUMNS);
    const or = q.ops.find((o) => o[0] === 'or')![1] as string;
    assert.ok(!/[()]/.test(or) && (or.match(/,/g) || []).length === 1, `unsafe or(): ${or}`);
    const ilike = q.ops.find((o) => o[0] === 'ilike')!;
    assert.ok(!/[%_]/.test(String(ilike[2]).slice(1, -1)), `wildcards survived: ${ilike[2]}`);
    await repo.listNotes(3, { limit: 5, offset: 0 });
    assert.ok(queries[1].ops.some((o) => o[0] === 'eq' && o[1] === 'circle_leader_id' && o[2] === 3));
    const noteSelect = queries[1].ops.find((o) => o[0] === 'select')![1] as string;
    assert.ok(!/phone|email|birthday/.test(noteSelect));
  });

  await test('real store: claiming a code or refresh token is one conditional UPDATE, so a double-spend is impossible', async () => {
    for (const [method, table] of [['claimCode', 'mcp_oauth_codes'], ['claimRefreshToken', 'mcp_oauth_tokens']] as const) {
      const { db, queries } = recordingDb({ data: null, error: null });
      const result = await (createSupabaseMcpStore(db) as any)[method]('hash', new Date());
      assert.strictEqual(result.status, 'missing');
      const claim = queries[0];
      assert.strictEqual(claim.table, table);
      assert.strictEqual(claim.ops[0][0], 'update', 'the first operation must be the claiming UPDATE');
      assert.ok(claim.ops.some((o) => o[0] === 'is' && o[1] === 'used_at' && o[2] === null), 'must only claim rows not yet used');
      assert.ok(claim.ops.some((o) => o[0] === 'select'), 'must read back the claimed row');
      if (method === 'claimRefreshToken') assert.ok(claim.ops.some((o) => o[0] === 'eq' && o[1] === 'kind' && o[2] === 'refresh'), 'an access token must never be claimable as a refresh token');
    }
  });

  await test('real store: a failed audit insert throws instead of being swallowed', async () => {
    const { db } = recordingDb({ data: null, error: { message: 'boom' } });
    await assert.rejects(() => createSupabaseMcpStore(db).audit({ event: 'tool_call' }), /audit write failed/);
  });

  // ── Assistant access page: list and disconnect ────────────────────────
  await test('connections: a user sees only their own, with the enabled flag and no sensitive detail', async () => {
    const world = makeWorld();
    const a = await connect(world, USER_A);
    await connect(world, USER_B);
    await call(world, a.access_token, 'search_leaders', {});
    const asA = await getAssistantAccess(world.oauth, USER_A);
    assert.strictEqual(asA.enabled, true);
    assert.strictEqual(asA.connections.length, 1);
    assert.strictEqual(asA.connections[0].assistant, 'ChatGPT');
    assert.deepStrictEqual(Object.keys(asA.connections[0]).sort(), ['assistant', 'connected_at', 'expires_at', 'id', 'last_used_at']);
    assert.strictEqual(asA.activity.length, 1);
    assert.deepStrictEqual(Object.keys(asA.activity[0]).sort(), ['at', 'ok', 'result_count', 'tool'], 'activity shows names and counts, never arguments');
    const asB = await getAssistantAccess(world.oauth, USER_B);
    assert.strictEqual(asB.connections.length, 1);
    assert.notStrictEqual(asB.connections[0].id, asA.connections[0].id);
    assert.strictEqual(asB.activity.length, 0, "user B must not see user A's activity");
    assert.strictEqual((await getAssistantAccess(world.oauth, USER_NO_ACCESS)).enabled, false);
    world.store.access.set(USER_A, { user_id: USER_A, scopes: ['radius:read'], revoked_at: '2026-10-01T00:00:00Z' });
    assert.strictEqual((await getAssistantAccess(world.oauth, USER_A)).enabled, false);
  });

  await test('connections: disconnecting stops the token immediately', async () => {
    const world = makeWorld();
    const t = await connect(world, USER_A);
    assert.ok((await authenticateBearer(world.oauth, t.access_token)).ok);
    const [mine] = (await getAssistantAccess(world.oauth, USER_A)).connections;
    assert.strictEqual(await disconnect(world.oauth, USER_A, mine.id), true);
    assert.ok(!(await authenticateBearer(world.oauth, t.access_token)).ok, 'the access token must stop working at once');
    const refreshed = await exchangeToken(world.oauth, { grant_type: 'refresh_token', refresh_token: t.refresh_token, client_id: CLIENT_ID });
    assert.strictEqual(refreshed.body.error, 'invalid_grant', 'and the refresh token must not bring it back');
    assert.strictEqual((await getAssistantAccess(world.oauth, USER_A)).connections.length, 0);
    assert.ok(world.store.auditLog.some((e) => e.event === 'disconnected_by_user' && e.user_id === USER_A && e.ok === true));
  });

  await test("connections: one user cannot disconnect (or detect) another user's connection", async () => {
    const world = makeWorld();
    const a = await connect(world, USER_A);
    const [theirs] = (await getAssistantAccess(world.oauth, USER_A)).connections;
    assert.strictEqual(await disconnect(world.oauth, USER_B, theirs.id), false);
    assert.strictEqual(await disconnect(world.oauth, USER_B, 'no-such-grant'), false, 'indistinguishable from a connection that does not exist');
    assert.ok((await authenticateBearer(world.oauth, a.access_token)).ok, "A's token must be untouched");
    assert.strictEqual((await getAssistantAccess(world.oauth, USER_A)).connections.length, 1);
    // ending it twice is harmless
    assert.strictEqual(await disconnect(world.oauth, USER_A, theirs.id), true);
    assert.strictEqual(await disconnect(world.oauth, USER_A, theirs.id), false);
  });

  await test('connections: disconnect everything ends only the caller\'s connections', async () => {
    const world = makeWorld();
    const a1 = await connect(world, USER_A);
    const a2 = await connect(world, USER_A);
    const b = await connect(world, USER_B);
    assert.strictEqual(await disconnectAll(world.oauth, USER_A), 2);
    for (const t of [a1, a2]) assert.ok(!(await authenticateBearer(world.oauth, t.access_token)).ok);
    assert.ok((await authenticateBearer(world.oauth, b.access_token)).ok, "B must not be affected by A's disconnect");
    assert.strictEqual(await disconnectAll(world.oauth, USER_A), 0);
    assert.ok(world.store.auditLog.some((e) => e.event === 'disconnected_all_by_user' && e.result_count === 2));
  });

  await test('connections: assistant names are readable and tolerate junk', () => {
    assert.strictEqual(assistantName('https://chatgpt.com/oauth/client.json'), 'ChatGPT');
    assert.strictEqual(assistantName('https://example.org/oauth/client.json'), 'example.org');
    assert.strictEqual(assistantName('not a url'), 'AI assistant');
  });

  await test('real store: connection queries are scoped to the user inside the query itself', async () => {
    const listQ = recordingDb({ data: [], error: null });
    await createSupabaseMcpStore(listQ.db).listGrantsForUser('user-a', new Date('2026-10-20T15:00:00Z'));
    const list = listQ.queries[0];
    assert.strictEqual(list.table, 'mcp_oauth_grants');
    assert.ok(list.ops.some((o) => o[0] === 'eq' && o[1] === 'user_id' && o[2] === 'user-a'));
    assert.ok(list.ops.some((o) => o[0] === 'is' && o[1] === 'revoked_at' && o[2] === null), 'only live connections');
    assert.ok(list.ops.some((o) => o[0] === 'gt' && o[1] === 'expires_at'), 'not expired ones');

    const oneQ = recordingDb({ data: [{ id: 'g' }], error: null });
    assert.strictEqual(await createSupabaseMcpStore(oneQ.db).revokeGrantForUser('user-a', 'g'), true);
    const one = oneQ.queries[0];
    assert.strictEqual(one.ops[0][0], 'update');
    assert.ok(one.ops.some((o) => o[0] === 'eq' && o[1] === 'id' && o[2] === 'g'));
    assert.ok(one.ops.some((o) => o[0] === 'eq' && o[1] === 'user_id' && o[2] === 'user-a'), 'ownership is part of the UPDATE itself');
    const nothingQ = recordingDb({ data: [], error: null });
    assert.strictEqual(await createSupabaseMcpStore(nothingQ.db).revokeGrantForUser('user-b', 'g'), false);

    const allQ = recordingDb({ data: [{ id: '1' }, { id: '2' }], error: null });
    assert.strictEqual(await createSupabaseMcpStore(allQ.db).revokeAllGrantsForUser('user-a'), 2);
    assert.ok(allQ.queries[0].ops.some((o) => o[0] === 'eq' && o[1] === 'user_id' && o[2] === 'user-a'));

    const actQ = recordingDb({ data: [], error: null });
    await createSupabaseMcpStore(actQ.db).recentToolCalls('user-a', 15);
    const act = actQ.queries[0];
    assert.strictEqual(act.table, 'mcp_audit_log');
    assert.ok(act.ops.some((o) => o[0] === 'eq' && o[1] === 'user_id' && o[2] === 'user-a'));
    assert.strictEqual(act.ops.find((o) => o[0] === 'select')![1], 'at, tool, ok, result_count', 'never selects arguments');
  });

  await test('likeTerm: filter syntax and wildcards cannot survive into a query', () => {
    for (const hostile of ['a,b', 'a)(b', 'a%b', 'a_b', 'a*b', 'a"b', 'a\\b', 'x),or(id.gt.0', 'a\nb']) {
      assert.ok(!/[,()*%_\\"\n]/.test(likeTerm(hostile)), hostile);
    }
    assert.strictEqual(likeTerm("Marcus O'Hale"), "Marcus O'Hale");
    assert.strictEqual(likeTerm('Zoë Müller-Åberg'), 'Zoë Müller-Åberg');
  });

  // ── phase 2: campus scoping, contacts, event summaries, writes ─────────
  const READ = 'radius:read';
  const CONTACTS_SCOPE = 'radius:contacts:read';
  const NOTES_WRITE = 'radius:notes:write';
  const CONN_WRITE = 'radius:connections:write';
  const ALL_SCOPES = [READ, CONTACTS_SCOPE, NOTES_WRITE, CONN_WRITE];
  const sc = (r: Awaited<ReturnType<typeof call>>) => r.result!.structuredContent;
  const errText = (r: Awaited<ReturnType<typeof call>>) => {
    assert.strictEqual(r.result?.isError, true, 'expected a tool error');
    return r.result!.content[0].text;
  };
  const key = (n: number) => `retry-key-${String(n).padStart(4, '0')}`;

  async function fullWorld(over: { userId?: string; scopes?: string[]; campuses?: string[] | null } = {}) {
    const world = makeWorld();
    const userId = over.userId ?? USER_A;
    enable(world, userId, over.scopes ?? ALL_SCOPES, over.campuses ?? null);
    const scope = (over.scopes ?? ALL_SCOPES).join(' ');
    const t = await connect(world, userId, scope);
    return { world, token: t.access_token };
  }

  await test('scopes: a connection that asks for nothing gets read-only; asking for more than the account has is refused', async () => {
    const world = makeWorld();
    const t = await connect(world);
    assert.strictEqual(t.scope, READ);
    const verifier = base64Url(randomBytes(48));
    const v = await validateAuthorizeRequest(world.oauth, authorizeParams(pkceS256(verifier), { scope: ALL_SCOPES.join(' ') }));
    assert.ok(v.ok);
    if (v.ok) {
      const approval = await approveAuthorization(world.oauth, v.request, USER_A);
      assert.strictEqual(approval.ok, false, 'user A only holds radius:read, so the wider approval must be refused');
    }
  });

  await test('scopes: contact reading and writing are separate permissions, and each hides the others', async () => {
    const onlyContacts = await fullWorld({ scopes: [READ, CONTACTS_SCOPE] });
    const names = ((await (await rpc(onlyContacts.world, onlyContacts.token, { jsonrpc: '2.0', id: 1, method: 'tools/list' })).json()).result.tools as any[]).map((x) => x.name);
    assert.ok(names.includes('get_leader_contact'));
    assert.ok(!names.includes('add_leader_note') && !names.includes('log_connection'));
    const refused = await call(onlyContacts.world, onlyContacts.token, 'add_leader_note', { leader_id: 1, content: 'hi there', idempotency_key: key(1) });
    assert.match(errText(refused), /not allowed/);
    assert.strictEqual(onlyContacts.world.writes.writeCalls, 0);

    const onlyNotes = await fullWorld({ scopes: [READ, NOTES_WRITE] });
    const names2 = ((await (await rpc(onlyNotes.world, onlyNotes.token, { jsonrpc: '2.0', id: 1, method: 'tools/list' })).json()).result.tools as any[]).map((x) => x.name);
    assert.ok(names2.includes('add_leader_note') && !names2.includes('get_leader_contact') && !names2.includes('log_connection'));
    errText(await call(onlyNotes.world, onlyNotes.token, 'get_leader_contact', { leader_id: 1 }));
    assert.deepStrictEqual(onlyNotes.world.contacts.reads, [], 'no contact was read');
    errText(await call(onlyNotes.world, onlyNotes.token, 'log_connection', { leader_id: 1, connection_type: 'Text', date_of_connection: '2026-10-18', idempotency_key: key(2) }));
  });

  await test('scopes: the tool set is exactly the five read tools, two summary tools, one contact tool, two write tools', () => {
    assert.deepStrictEqual(ALL_TOOLS.map((t) => t.name).sort(), [
      'add_leader_note', 'get_event_summary', 'get_leader', 'get_leader_contact', 'list_event_summaries', 'list_follow_ups',
      'list_leader_connections', 'list_leader_notes', 'log_connection', 'search_leaders',
    ]);
    assert.ok(!ALL_TOOLS.some((t) => /delete|remove|update|edit|send|message|review|clear|bulk/i.test(t.name)), 'no out-of-scope tool exists');
    for (const tool of ALL_TOOLS) assert.strictEqual(tool.inputSchema.additionalProperties, false, tool.name);
  });

  await test('annotations: write tools are marked as writes (idempotent, non-destructive); read tools stay read-only', async () => {
    const { world, token } = await fullWorld();
    const tools = (await (await rpc(world, token, { jsonrpc: '2.0', id: 1, method: 'tools/list' })).json()).result.tools as any[];
    for (const tool of tools) {
      const isWrite = tool.name === 'add_leader_note' || tool.name === 'log_connection';
      assert.strictEqual(tool.annotations.readOnlyHint, !isWrite, tool.name);
      assert.strictEqual(tool.annotations.destructiveHint, false, tool.name);
      assert.strictEqual(tool.annotations.idempotentHint, true, tool.name);
    }
    const note = tools.find((x) => x.name === 'add_leader_note');
    assert.deepStrictEqual(note.securitySchemes, [{ type: 'oauth2', scopes: [NOTES_WRITE] }]);
    assert.match(note.description, /wait for them to say yes/);
    assert.deepStrictEqual(note.inputSchema.required.sort(), ['content', 'idempotency_key', 'leader_id']);
    assert.ok(!('created_at' in note.inputSchema.properties) && !('user_id' in note.inputSchema.properties), 'attribution and time are server-set');
  });

  await test('role: contact and write tools check the live Radius role on every call', async () => {
    const viewer = await fullWorld({ userId: USER_VIEWER });
    for (const [name, args] of [
      ['get_leader_contact', { leader_id: 1 }],
      ['add_leader_note', { leader_id: 1, content: 'a note', idempotency_key: key(3) }],
    ] as const) {
      assert.match(errText(await call(viewer.world, viewer.token, name, args)), /not allowed/);
    }
    assert.deepStrictEqual(viewer.world.contacts.reads, []);
    assert.strictEqual(viewer.world.writes.writeCalls, 0);
    assert.ok(viewer.world.store.auditLog.some((e) => e.tool === 'add_leader_note' && e.error === 'role_not_allowed'));
    // plain reads are unaffected by role
    assert.strictEqual((await call(viewer.world, viewer.token, 'search_leaders', {})).result!.isError, false);

    const acpd = await fullWorld();
    assert.strictEqual((await call(acpd.world, acpd.token, 'get_leader_contact', { leader_id: 1 })).result!.isError, false);
    acpd.world.repo.roles.set(USER_A, 'viewer'); // demoted after connecting
    assert.match(errText(await call(acpd.world, acpd.token, 'get_leader_contact', { leader_id: 1 })), /not allowed/);
  });

  await test('campus: a restricted user cannot see, read, or write outside their campuses, by any tool', async () => {
    const { world, token } = await fullWorld({ campuses: ['Denton'] });
    const search = sc(await call(world, token, 'search_leaders', {}));
    assert.deepStrictEqual(search.items.map((i: any) => i.id).sort(), [3, 4]);
    // asking for another campus is a narrowing filter, not a way around the permission
    assert.strictEqual(sc(await call(world, token, 'search_leaders', { campus: 'Lake Highlands' })).total, 0);

    for (const [name, args] of [
      ['get_leader', { leader_id: 1 }],
      ['list_leader_notes', { leader_id: 1 }],
      ['list_leader_connections', { leader_id: 1 }],
      ['get_leader_contact', { leader_id: 1 }],
      ['add_leader_note', { leader_id: 1, content: 'sneaky', idempotency_key: key(4) }],
      ['log_connection', { leader_id: 1, connection_type: 'Text', date_of_connection: '2026-10-18', idempotency_key: key(5) }],
    ] as const) {
      assert.strictEqual(errText(await call(world, token, name, args)), 'No Circle Leader with id 1.', name);
    }
    assert.deepStrictEqual(world.contacts.reads, [], 'contact data of a hidden leader was never fetched');
    assert.strictEqual(world.writes.writeCalls, 0, 'nothing was written for a hidden leader');
    assert.strictEqual(errText(await call(world, token, 'list_follow_ups', { leader_id: 1 })), 'No Circle Leader with id 1.');

    const followUps = sc(await call(world, token, 'list_follow_ups', { status: 'all' }));
    assert.ok(followUps.items.every((i: any) => i.leader_id === null || [3, 4].includes(i.leader_id)), 'follow-ups of other campuses are hidden');

    const list = sc(await call(world, token, 'list_event_summaries', { limit: 50 }));
    assert.ok(list.items.length > 0 && list.items.every((i: any) => ['Denton'].includes(i.campus)));
    const hidden = await call(world, token, 'get_event_summary', { summary_id: SUMMARIES[0].id });
    const missing = await call(world, token, 'get_event_summary', { summary_id: '00000000-0000-4000-8000-0000000000ff' });
    assert.strictEqual(errText(hidden).replace(SUMMARIES[0].id, 'X'), errText(missing).replace('00000000-0000-4000-8000-0000000000ff', 'X'), 'hidden looks exactly like missing');
    assert.strictEqual(sc(await call(world, token, 'get_event_summary', { summary_id: SUMMARIES[3].id })).summary_id, SUMMARIES[3].id);
  });

  await test('campus: an empty allow-list sees nothing, and leaders with no campus are hidden from a restricted user', async () => {
    const { world, token } = await fullWorld({ campuses: [] });
    assert.strictEqual(sc(await call(world, token, 'search_leaders', {})).total, 0);
    assert.strictEqual(sc(await call(world, token, 'list_event_summaries', {})).total, 0);
    const second = await fullWorld({ campuses: ['Denton'] });
    second.world.repo.leaders.find((l) => l.id === 3)!.campus = null;
    assert.match(errText(await call(second.world, second.token, 'get_leader', { leader_id: 3 })), /No Circle Leader/);
  });

  await test('contact: primary and additional leader are kept apart, missing values are null, blanks count as missing', async () => {
    const { world, token } = await fullWorld();
    const one = sc(await call(world, token, 'get_leader_contact', { leader_id: 1 }));
    assert.deepStrictEqual(one.primary, { name: 'Jordan Avery', email: 'jordan@example.org', phone: '555-0101' });
    assert.deepStrictEqual(one.additional, { name: 'Casey Avery', email: null, phone: '555-0102' });
    assert.strictEqual(one.radius_url, `${BASE}/circle/1`);
    const two = sc(await call(world, token, 'get_leader_contact', { leader_id: 2 }));
    assert.deepStrictEqual(two.primary, { name: 'Sam and Riley Brooks', email: null, phone: null });
    assert.strictEqual(two.additional, null);
    assert.strictEqual(sc(await call(world, token, 'get_leader_contact', { leader_id: 3 })).additional, null, 'blank additional fields are not a person');
    const four = sc(await call(world, token, 'get_leader_contact', { leader_id: 4 }));
    assert.deepStrictEqual(four.additional, { name: null, email: null, phone: '555-0105' });
    assert.match(errText(await call(world, token, 'get_leader_contact', { leader_id: 99 })), /No Circle Leader/);
    assert.match(errText(await call(world, token, 'get_leader_contact', { leader_id: 1, extra: 1 })), /Unknown argument/);
    assert.match(errText(await call(world, token, 'get_leader_contact', { leader_id: '1' })), /integer/);
  });

  await test('contact: details never appear in searches, leader profiles, summaries or the audit log', async () => {
    const { world, token } = await fullWorld();
    const everything: string[] = [];
    everything.push(JSON.stringify(await call(world, token, 'search_leaders', { limit: 50 })));
    everything.push(JSON.stringify(await call(world, token, 'get_leader', { leader_id: 1 })));
    everything.push(JSON.stringify(await call(world, token, 'list_event_summaries', { limit: 50 })));
    everything.push(JSON.stringify(await call(world, token, 'get_event_summary', { summary_id: SUMMARIES[0].id })));
    await call(world, token, 'get_leader_contact', { leader_id: 1 });
    for (const text of everything) assert.ok(!/jordan@example|555-01|casey/i.test(text), 'a contact detail leaked into a non-contact tool');
    assert.ok(!/jordan@example|555-01/i.test(JSON.stringify(world.store.auditLog)), 'the audit log holds no contact values');
    assert.ok(world.store.auditLog.some((e) => e.tool === 'get_leader_contact' && e.ok === true), 'the contact read itself is audited');
  });

  await test('summaries: list shape, newest meeting first, ties broken the same way every time', async () => {
    const { world, token } = await fullWorld();
    const out = sc(await call(world, token, 'list_event_summaries', { limit: 50 }));
    const order = out.items.map((i: any) => Number(i.summary_id.slice(-12)));
    assert.deepStrictEqual(order, [3, 5, 4, 1, 7, 2, 6]);
    assert.strictEqual(out.total, 7);
    assert.strictEqual(out.next_cursor, null);
    assert.deepStrictEqual(out.items.map((i: any) => i.summary_id), sc(await call(world, token, 'list_event_summaries', { limit: 50 })).items.map((i: any) => i.summary_id), 'stable across calls');
    const s1 = out.items.find((i: any) => i.summary_id === SUMMARIES[0].id);
    assert.deepStrictEqual(
      { leader_id: s1.leader_id, leader_name: s1.leader_name, circle_name: s1.circle_name, campus: s1.campus, submission_status: s1.submission_status, radius_url: s1.radius_url, submitted_at: s1.submitted_at, occurrence: s1.occurrence },
      { leader_id: 1, leader_name: 'Jordan Avery', circle_name: 'LVT | S1 | Jordan Avery', campus: 'Lake Highlands', submission_status: 'submitted', radius_url: `${BASE}/circle/1`, submitted_at: '2026-10-14T15:00:00+00:00', occurrence: '2026-10-13T23:30:00+00:00' }
    );
    assert.strictEqual(s1.event_date, '2026-10-13');
    assert.strictEqual(s1.reporting_week_start, '2026-10-11');
    const late = out.items.find((i: any) => i.summary_id === SUMMARIES[6].id);
    assert.strictEqual(late.event_date, '2026-10-10', 'Saturday evening Central stays Saturday even though it is Sunday in UTC');
    assert.strictEqual(late.reporting_week_start, '2026-10-04');
    assert.strictEqual(out.items.find((i: any) => i.summary_id === SUMMARIES[5].id).submission_status, 'failed');
    assert.ok(!/Topic|Notes |Prayer/.test(JSON.stringify(out)), 'the list carries no written responses');
  });

  await test('summaries: pagination covers every row once, ends cleanly, survives new rows, and rejects forged cursors', async () => {
    const { world, token } = await fullWorld();
    const p1 = sc(await call(world, token, 'list_event_summaries', { limit: 3 }));
    assert.strictEqual(p1.items.length, 3);
    assert.ok(p1.next_cursor);
    // a newer summary arrives between page 1 and page 2: it must not shift page 2
    world.repo.summaries.push({ ...SUMMARIES[2], id: '00000000-0000-4000-8000-000000000099', created_at: '2026-10-16T10:00:00+00:00', occurrence: '2026-10-15T23:30:00+00:00' });
    const p2 = sc(await call(world, token, 'list_event_summaries', { limit: 3, cursor: p1.next_cursor }));
    const p3 = sc(await call(world, token, 'list_event_summaries', { limit: 3, cursor: p2.next_cursor }));
    const ids = [...p1.items, ...p2.items, ...p3.items].map((i: any) => Number(i.summary_id.slice(-12)));
    assert.deepStrictEqual(ids, [3, 5, 4, 1, 7, 2, 6]);
    assert.strictEqual(p3.next_cursor, null);
    assert.strictEqual(p3.total, 8, 'total reflects the whole result, not the page');
    const evil = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url');
    const goodId = '00000000-0000-4000-8000-000000000001';
    for (const cursor of ['nope', evil({ o: '2026-10-01T00:00:00+00:00),id.gt.0,or(x.eq.1', c: '2026-10-01T00:00:00+00:00', i: goodId }), evil({ o: '2026-10-01T00:00:00+00:00', c: '2026-10-01T00:00:00+00:00', i: 'not-a-uuid' }), evil({})]) {
      assert.match(errText(await call(world, token, 'list_event_summaries', { cursor })), /cursor is not valid/);
    }
    assert.ok(!world.repo.calls.includes('listEventSummaries') || world.repo.calls.filter((c) => c === 'listEventSummaries').length === 3, 'a bad cursor never reached the database');
    for (const bad of [{ limit: 0 }, { limit: 51 }, { limit: 'x' }]) assert.strictEqual(errText(await call(world, token, 'list_event_summaries', bad)).length > 0, true);
  });

  await test('summaries: campus, circle, leader, date and reporting-week filters', async () => {
    const { world, token } = await fullWorld();
    const ids = async (args: object) => (sc(await call(world, token, 'list_event_summaries', { limit: 50, ...args })).items as any[]).map((i) => Number(i.summary_id.slice(-12)));
    assert.deepStrictEqual(await ids({ campus: 'Denton' }), [5, 4, 7]);
    assert.deepStrictEqual(await ids({ leader_id: 1 }), [1, 2]);
    assert.deepStrictEqual(await ids({ circle: 'jordan' }), [1, 2]);
    assert.deepStrictEqual(await ids({ campus: 'Denton', circle: 'jordan' }), [], 'filters combine');
    assert.deepStrictEqual(await ids({ week_start: '2026-10-11' }), [3, 5, 4, 1]);
    assert.deepStrictEqual(await ids({ week_start: '2026-10-04' }), [7, 2]);
    assert.deepStrictEqual(await ids({ occurrence_from: '2026-10-13', occurrence_to: '2026-10-13' }), [5, 4, 1], 'a Central-time day, inclusive');
    assert.deepStrictEqual(await ids({ occurrence_from: '2026-10-14' }), [3]);
    assert.match(errText(await call(world, token, 'list_event_summaries', { week_start: '2026-10-12' })), /Sunday/);
    assert.match(errText(await call(world, token, 'list_event_summaries', { week_start: '2026-10-11', occurrence_from: '2026-10-01' })), /not both/);
    assert.match(errText(await call(world, token, 'list_event_summaries', { occurrence_from: '2026-10-20', occurrence_to: '2026-10-01' })), /after/);
    assert.match(errText(await call(world, token, 'list_event_summaries', { occurrence_from: '2026-02-31' })), /real date/);
    assert.match(errText(await call(world, token, 'list_event_summaries', { review_status: 'maybe' })), /one of/);
    world.repo.leaderIdCapped = true;
    assert.match(errText(await call(world, token, 'list_event_summaries', { campus: 'Denton' })), /Narrow/);
  });

  await test('summaries: review status is the signed-in user’s, kept apart from submission status', async () => {
    const a = await fullWorld();
    const ids = async (w: typeof a, args: object) => (sc(await call(w.world, w.token, 'list_event_summaries', { limit: 50, ...args })).items as any[]).map((i) => Number(i.summary_id.slice(-12)));
    assert.deepStrictEqual(await ids(a, { review_status: 'unreviewed' }), [3, 4, 7, 6]);
    assert.deepStrictEqual(await ids(a, { review_status: 'reviewed_by_me' }), [1]);
    assert.deepStrictEqual(await ids(a, { review_status: 'reviewed_by_other' }), [5, 2], 'a stamp whose reviewer is gone still counts as someone else');
    assert.deepStrictEqual(await ids(a, { review_status: 'reviewed_by_anyone' }), [5, 1, 2]);
    const all = sc(await call(a.world, a.token, 'list_event_summaries', { limit: 50 })).items as any[];
    const state = (n: number) => all.find((i) => i.summary_id === SUMMARIES[n - 1].id).review;
    assert.deepStrictEqual(state(1), { state: 'reviewed_by_me', reviewed_at: '2026-10-15T12:00:00+00:00', reviewed_by_name: 'Alex Morgan' });
    assert.strictEqual(state(2).state, 'reviewed_by_other');
    assert.strictEqual(state(2).reviewed_by_name, 'Pat Rivera');
    assert.deepStrictEqual(state(5), { state: 'reviewed_by_other', reviewed_at: '2026-10-15T09:00:00+00:00', reviewed_by_name: null });
    const failed = all.find((i) => i.summary_id === SUMMARIES[5].id);
    assert.strictEqual(failed.submission_status, 'failed');
    assert.strictEqual(failed.review.state, 'unreviewed', 'a failed submission is not the same thing as an unreviewed one');

    const b = await fullWorld({ userId: USER_B });
    assert.deepStrictEqual(await ids(b, { review_status: 'reviewed_by_me' }), [2], 'the same data reads differently for a different user');
  });

  await test('summaries: when no review data exists at all, everything is honestly unreviewed', async () => {
    const { world, token } = await fullWorld();
    for (const s of world.repo.summaries) { s.reviewed_at = null; s.reviewed_by = null; }
    const out = sc(await call(world, token, 'list_event_summaries', { limit: 50 }));
    assert.ok(out.items.every((i: any) => i.review.state === 'unreviewed' && i.review.reviewed_at === null && i.review.reviewed_by_name === null));
    assert.strictEqual(sc(await call(world, token, 'list_event_summaries', { review_status: 'reviewed_by_me' })).total, 0);
    assert.strictEqual(sc(await call(world, token, 'list_event_summaries', { review_status: 'reviewed_by_anyone' })).total, 0);
  });

  await test('summaries: reading never marks anything reviewed', async () => {
    const { world, token } = await fullWorld({ userId: USER_B });
    const before = JSON.stringify(world.repo.summaries);
    await call(world, token, 'list_event_summaries', { limit: 50 });
    for (const s of SUMMARIES) await call(world, token, 'get_event_summary', { summary_id: s.id });
    await call(world, token, 'list_event_summaries', { review_status: 'unreviewed' });
    assert.strictEqual(JSON.stringify(world.repo.summaries), before, 'no summary changed');
    const unreviewed = sc(await call(world, token, 'get_event_summary', { summary_id: SUMMARIES[2].id }));
    assert.strictEqual(unreviewed.review.state, 'unreviewed', 'still unreviewed after being read');
  });

  await test('summaries: get_event_summary returns the full response, submission and review separately, and no private extras', async () => {
    const { world, token } = await fullWorld();
    const out = sc(await call(world, token, 'get_event_summary', { summary_id: SUMMARIES[0].id.toUpperCase() }));
    assert.strictEqual(out.summary_id, SUMMARIES[0].id);
    assert.deepStrictEqual(out.leader, { id: 1, name: 'Jordan Avery', circle_name: 'LVT | S1 | Jordan Avery', campus: 'Lake Highlands' });
    assert.strictEqual(out.event.occurrence, '2026-10-13T23:30:00+00:00');
    assert.strictEqual(out.event.reporting_week_start, '2026-10-11');
    assert.deepStrictEqual(out.responses.dynamic_responses, [{ question_id: 'q1', label: 'How did it go?', value: 'Well' }]);
    assert.strictEqual(out.responses.topic, 'Topic 1');
    assert.strictEqual(out.responses.prayer_requests, 'Prayer 1');
    assert.strictEqual(out.responses.attendee_count, 3);
    assert.strictEqual(out.responses.manual_attendee_count, 1);
    assert.strictEqual(out.submission.status, 'submitted');
    assert.strictEqual(out.submission.submitted_at, '2026-10-14T15:00:00+00:00');
    assert.strictEqual(out.review.state, 'reviewed_by_me');
    const text = JSON.stringify(out);
    assert.ok(!/client_ip|user_agent|ccb_response|555-0199|"Pat"/.test(text), 'no IP, user agent, raw CCB payload or attendee contact details');
    const failed = sc(await call(world, token, 'get_event_summary', { summary_id: SUMMARIES[5].id }));
    assert.strictEqual(failed.submission.status, 'failed');
    assert.strictEqual(failed.submission.ccb_error, 'CCB refused the report');
    assert.strictEqual(failed.review.state, 'unreviewed');
    const dnm = sc(await call(world, token, 'get_event_summary', { summary_id: SUMMARIES[6].id }));
    assert.strictEqual(dnm.responses.did_not_meet, true);
    assert.strictEqual(dnm.responses.did_not_meet_reason, 'Sick');
    assert.match(errText(await call(world, token, 'get_event_summary', { summary_id: 'nope' })), /wrong format/);
    assert.match(errText(await call(world, token, 'get_event_summary', {})), /required/);
    assert.match(errText(await call(world, token, 'get_event_summary', { summary_id: '00000000-0000-4000-8000-0000000000ff' })), /No event summary/);
  });

  // ── writes: add_leader_note ──
  await test('add_leader_note: saves the exact text as the signed-in user with a server time, and verifies it by reading it back', async () => {
    const { world, token } = await fullWorld();
    const text = '  Met for coffee.\r\nShe said "yes" — café ☕  \n';
    const before = { notes: world.repo.notes.length, connections: world.repo.connections.length, leader: JSON.stringify(world.repo.leaders[0]) };
    const out = sc(await call(world, token, 'add_leader_note', { leader_id: 1, content: text, idempotency_key: key(10) }));
    assert.strictEqual(out.note.content, text, 'byte for byte, whitespace included');
    assert.strictEqual(out.note.leader_id, 1);
    assert.strictEqual(out.note.created_by_name, 'Alex Morgan');
    assert.strictEqual(out.note.created_at, new Date(clock).toISOString(), 'the server clock, not the caller');
    assert.strictEqual(out.verified, true);
    assert.strictEqual(out.replayed, false);
    assert.strictEqual(out.radius_url, `${BASE}/circle/1`);
    assert.strictEqual(world.repo.notes.length, before.notes + 1);
    assert.strictEqual(world.repo.connections.length, before.connections, 'a note is not a connection');
    assert.strictEqual(JSON.stringify(world.repo.leaders[0]), before.leader, 'follow-up and contact markers untouched');
    const stored = world.repo.notes.find((n) => n.id === out.note.id)!;
    assert.strictEqual(stored.created_by, USER_A);
    const listed = sc(await call(world, token, 'list_leader_notes', { leader_id: 1 }));
    assert.strictEqual(listed.items[0].id, out.note.id);
    for (const forged of [{ created_at: '2020-01-01T00:00:00Z' }, { user_id: USER_B }, { created_by: USER_B }]) {
      assert.match(errText(await call(world, token, 'add_leader_note', { leader_id: 1, content: 'x'.repeat(10), idempotency_key: key(11), ...forged })), /Unknown argument/);
    }
  });

  await test('add_leader_note: bad input is refused before anything is written', async () => {
    const { world, token } = await fullWorld();
    const base = { leader_id: 1, content: 'A real note', idempotency_key: key(12) };
    const cases: [object, RegExp][] = [
      [{ ...base, content: '   \n\t ' }, /empty/],
      [{ ...base, content: '' }, /too short/],
      [{ ...base, content: 'x'.repeat(5001) }, /too long/],
      [{ ...base, idempotency_key: 'short' }, /wrong format/],
      [{ ...base, idempotency_key: 'has spaces in it!' }, /wrong format/],
      [{ leader_id: 1, content: 'A real note' }, /idempotency_key.*required/],
      [{ ...base, leader_id: 0 }, /at least 1/],
      [{ ...base, leader_id: 1.5 }, /integer/],
      [{ ...base, leader_id: 99 }, /No Circle Leader/],
    ];
    for (const [args, re] of cases) assert.match(errText(await call(world, token, 'add_leader_note', args)), re, JSON.stringify(args).slice(0, 80));
    assert.strictEqual(world.writes.writeCalls, 0);
    assert.strictEqual(sc(await call(world, token, 'add_leader_note', { ...base, content: 'x'.repeat(5000), idempotency_key: key(13) })).note.content.length, 5000, 'the maximum is accepted whole, never truncated');
  });

  await test('add_leader_note: a retry with the same key never duplicates; a different payload under that key is a conflict', async () => {
    const { world, token } = await fullWorld();
    const args = { leader_id: 1, content: 'Prayed together.', idempotency_key: key(20) };
    const first = sc(await call(world, token, 'add_leader_note', args));
    const count = world.repo.notes.length;
    const retry = sc(await call(world, token, 'add_leader_note', args));
    assert.strictEqual(retry.replayed, true);
    assert.strictEqual(retry.note.id, first.note.id);
    assert.strictEqual(world.repo.notes.length, count, 'no second note');
    const conflict = await call(world, token, 'add_leader_note', { ...args, content: 'Something else entirely.' });
    assert.match(errText(conflict), /already used for a different save/);
    assert.strictEqual(world.repo.notes.length, count);
    // the same key on a different leader is also a different save
    assert.match(errText(await call(world, token, 'add_leader_note', { ...args, leader_id: 2 })), /already used/);
    // a new key with the same words is a deliberate second note
    sc(await call(world, token, 'add_leader_note', { ...args, idempotency_key: key(21) }));
    assert.strictEqual(world.repo.notes.length, count + 1);
    // keys belong to the user: another user reusing the string is not a retry
    const b = await fullWorld({ userId: USER_B });
    const other = sc(await call(b.world, b.token, 'add_leader_note', args));
    assert.strictEqual(other.replayed, false);
  });

  await test('add_leader_note: a failed write saves nothing and leaves the key free; a lost reply is safely retried', async () => {
    const { world, token } = await fullWorld();
    const args = { leader_id: 1, content: 'Needs a second look.', idempotency_key: key(30) };
    const n = world.repo.notes.length;
    world.writes.failNext = 'before';
    assert.match(errText(await call(world, token, 'add_leader_note', args)), /may not have been saved.*same idempotency_key/);
    assert.strictEqual(world.repo.notes.length, n, 'nothing saved');
    assert.ok(world.store.auditLog.some((e) => e.tool === 'add_leader_note' && e.ok === false && e.error === 'internal_error'));
    const ok = sc(await call(world, token, 'add_leader_note', args));
    assert.strictEqual(ok.replayed, false, 'the failed attempt did not use up the key');
    assert.strictEqual(world.repo.notes.length, n + 1);

    const lost = { ...args, content: 'Reply gets lost.', idempotency_key: key(31) };
    world.writes.failNext = 'after';
    errText(await call(world, token, 'add_leader_note', lost));
    assert.strictEqual(world.repo.notes.length, n + 2, 'it did commit');
    const again = sc(await call(world, token, 'add_leader_note', lost));
    assert.strictEqual(again.replayed, true);
    assert.strictEqual(world.repo.notes.length, n + 2, 'the retry did not add a third');
  });

  await test('add_leader_note: if the read-back does not match, the tool says so and names the saved record', async () => {
    const { world, token } = await fullWorld();
    world.writes.tamperNote = (note) => { note.content = 'something else'; };
    const message = errText(await call(world, token, 'add_leader_note', { leader_id: 1, content: 'Original words', idempotency_key: key(40) }));
    assert.match(message, /saved as record \d+/);
    assert.match(message, /Do not retry/);
    world.writes.tamperNote = (note) => { note.created_by = USER_B; };
    assert.match(errText(await call(world, token, 'add_leader_note', { leader_id: 1, content: 'Original words', idempotency_key: key(41) })), /did not match/);
  });

  await test('add_leader_note: the audit log records that a note was written, never what it said', async () => {
    const { world, token } = await fullWorld();
    const secret = 'Her marriage is falling apart; keep this private.';
    await call(world, token, 'add_leader_note', { leader_id: 1, content: secret, idempotency_key: key(50) });
    await call(world, token, 'add_leader_note', { leader_id: 1, content: secret, idempotency_key: 'bad key' }); // fails validation
    await call(world, token, 'add_leader_note', { leader_id: 1, content: secret }); // fails validation
    world.writes.failNext = 'before';
    await call(world, token, 'add_leader_note', { leader_id: 1, content: secret, idempotency_key: key(51) });
    const audit = world.store.auditLog.filter((e) => e.tool === 'add_leader_note');
    assert.strictEqual(audit.length, 4);
    const dump = JSON.stringify(world.store.auditLog) + JSON.stringify(Array.from(world.writes.log.values()));
    assert.ok(!dump.includes('marriage') && !dump.includes(secret), 'no copy of the note in any log, success or failure');
    const okEntry = audit[0].args as any;
    assert.strictEqual(okEntry.leader_id, 1);
    assert.strictEqual(okEntry.idempotency_key, key(50));
    assert.strictEqual(okEntry.content_length, secret.length);
    assert.match(okEntry.content_sha256_prefix, /^[0-9a-f]{12}$/);
    assert.ok(audit.every((e) => e.user_id === USER_A && e.client_id === CLIENT_ID), 'every write names who made it');
  });

  await test('writes: at most 20 saves a minute per connection', async () => {
    const { world, token } = await fullWorld();
    for (let i = 0; i < 20; i++) sc(await call(world, token, 'add_leader_note', { leader_id: 1, content: `note number ${i}`, idempotency_key: key(100 + i) }));
    assert.match(errText(await call(world, token, 'add_leader_note', { leader_id: 1, content: 'one too many', idempotency_key: key(200) })), /Too many saves/);
    assert.strictEqual(world.repo.notes.filter((n) => /^note number/.test(n.content ?? '')).length, 20);
    advance(61);
    assert.strictEqual((await call(world, token, 'add_leader_note', { leader_id: 1, content: 'after the wait', idempotency_key: key(201) })).result!.isError, false);
  });

  // ── writes: log_connection ──
  await test('log_connection: records the interaction date separately from the entry time, with the app’s side effects and no more', async () => {
    const { world, token } = await fullWorld();
    const leader = world.repo.leaders.find((l) => l.id === 1)!;
    const followUp = { r: leader.follow_up_required, d: leader.follow_up_date, n: leader.follow_up_note };
    const out = sc(await call(world, token, 'log_connection', { leader_id: 1, connection_type: 'coffee', date_of_connection: '2026-10-18', note: 'Talked about the fall launch', idempotency_key: key(60) }));
    assert.deepStrictEqual(
      { ...out.connection, id: undefined },
      { id: undefined, leader_id: 1, connection_type: 'Coffee', date_of_connection: '2026-10-18', note: 'Talked about the fall launch', entered_at: new Date(clock).toISOString(), entered_by_name: 'Alex Morgan' }
    );
    assert.notStrictEqual(out.connection.date_of_connection, out.connection.entered_at.slice(0, 10), 'what happened and when it was typed in are different fields');
    assert.strictEqual(out.verified, true);
    assert.strictEqual(out.replayed, false);
    assert.ok(out.effects.some((e: string) => /timeline/.test(e)) && out.effects.some((e: string) => /Follow-ups were not changed/.test(e)));
    const mirror = world.repo.notes.find((n) => /^Connection on Oct 18, 2026 via Coffee: Talked/.test(n.content ?? ''));
    assert.ok(mirror, 'the matching timeline note exists');
    assert.strictEqual(mirror!.created_by, USER_A);
    assert.strictEqual(leader.last_check_in_date, '2026-10-18');
    assert.deepStrictEqual({ r: leader.follow_up_required, d: leader.follow_up_date, n: leader.follow_up_note }, followUp, 'the follow-up is untouched');
    const listed = sc(await call(world, token, 'list_leader_connections', { leader_id: 1 }));
    assert.strictEqual(listed.items[0].id, out.connection.id);
  });

  await test('log_connection: a backdated entry never moves the last check-in backwards; the optional note really is optional', async () => {
    const { world, token } = await fullWorld();
    const leader = world.repo.leaders.find((l) => l.id === 1)!;
    sc(await call(world, token, 'log_connection', { leader_id: 1, connection_type: 'Text', date_of_connection: '2026-10-19', idempotency_key: key(61) }));
    const old = sc(await call(world, token, 'log_connection', { leader_id: 1, connection_type: 'Call', date_of_connection: '2026-09-02', idempotency_key: key(62) }));
    assert.strictEqual(old.connection.note, null);
    assert.strictEqual(old.connection.date_of_connection, '2026-09-02');
    assert.strictEqual(leader.last_check_in_date, '2026-10-19');
    assert.ok(world.repo.notes.some((n) => n.content === 'Connection on Sep 2, 2026 via Call'));
    assert.strictEqual(sc(await call(world, token, 'log_connection', { leader_id: 1, connection_type: 'Text', date_of_connection: '2026-10-20', note: '   ', idempotency_key: key(63) })).connection.note, null, 'a blank note is no note');
  });

  await test('log_connection: dates and types are validated, in Central time', async () => {
    const { world, token } = await fullWorld();
    const base = { leader_id: 1, connection_type: 'Text', date_of_connection: '2026-10-18', idempotency_key: key(70) };
    assert.match(errText(await call(world, token, 'log_connection', { ...base, date_of_connection: '2026-10-21' })), /in the future.*2026-10-20/);
    assert.match(errText(await call(world, token, 'log_connection', { ...base, date_of_connection: '2026-02-30' })), /real date/);
    assert.match(errText(await call(world, token, 'log_connection', { ...base, date_of_connection: '10/18/2026' })), /wrong format/);
    assert.match(errText(await call(world, token, 'log_connection', { ...base, date_of_connection: '2026-10-18T10:00:00Z' })), /wrong format/);
    const type = errText(await call(world, token, 'log_connection', { ...base, connection_type: 'Carrier pigeon' }));
    assert.match(type, /not an active connection type.*Text, Coffee, Call/);
    assert.match(errText(await call(world, token, 'log_connection', { ...base, leader_id: 99 })), /No Circle Leader/);
    assert.match(errText(await call(world, token, 'log_connection', { ...base, note: 'x'.repeat(2001) })), /too long/);
    assert.strictEqual(world.writes.writeCalls, 0);
    // 8pm Central on Oct 20 is already Oct 21 in UTC: "today" is still the Central date
    clock = new Date('2026-10-21T01:00:00Z').getTime();
    const late = await fullWorld();
    assert.strictEqual((await call(late.world, late.token, 'log_connection', { ...base, date_of_connection: '2026-10-20', idempotency_key: key(71) })).result!.isError, false);
    assert.match(errText(await call(late.world, late.token, 'log_connection', { ...base, date_of_connection: '2026-10-21', idempotency_key: key(72) })), /in the future/);
  });

  await test('log_connection: retries cannot duplicate, conflicts are explicit, failures save nothing', async () => {
    const { world, token } = await fullWorld();
    const args = { leader_id: 2, connection_type: 'Text', date_of_connection: '2026-10-17', note: 'Sent the schedule', idempotency_key: key(80) };
    const first = sc(await call(world, token, 'log_connection', args));
    const [c, n] = [world.repo.connections.length, world.repo.notes.length];
    const retry = sc(await call(world, token, 'log_connection', args));
    assert.strictEqual(retry.replayed, true);
    assert.strictEqual(retry.connection.id, first.connection.id);
    assert.deepStrictEqual(retry.effects, ['No change: this save had already been made.']);
    assert.deepStrictEqual([world.repo.connections.length, world.repo.notes.length], [c, n], 'no second connection and no second timeline note');
    assert.match(errText(await call(world, token, 'log_connection', { ...args, date_of_connection: '2026-10-16' })), /already used for a different save/);
    assert.deepStrictEqual([world.repo.connections.length, world.repo.notes.length], [c, n]);

    world.writes.failNext = 'before';
    assert.match(errText(await call(world, token, 'log_connection', { ...args, idempotency_key: key(81) })), /may not have been saved/);
    assert.deepStrictEqual([world.repo.connections.length, world.repo.notes.length], [c, n], 'all-or-nothing');
    world.writes.tamperConnection = (x) => { x.connection_type_id = 3; };
    assert.match(errText(await call(world, token, 'log_connection', { ...args, idempotency_key: key(82) })), /saved as record \d+.*Do not retry/);
  });

  await test('log_connection: the audit log keeps the type and date but never the note text', async () => {
    const { world, token } = await fullWorld();
    await call(world, token, 'log_connection', { leader_id: 1, connection_type: 'Text', date_of_connection: '2026-10-18', note: 'She is struggling with her diagnosis', idempotency_key: key(90) });
    const noteLength = 'She is struggling with her diagnosis'.length;
    const dump = JSON.stringify(world.store.auditLog) + JSON.stringify(Array.from(world.writes.log.values()));
    assert.ok(!dump.includes('diagnosis'), 'the pastoral text is not copied into a log');
    const entry = world.store.auditLog.find((e) => e.tool === 'log_connection')!;
    assert.deepStrictEqual({ ...(entry.args as object), note_sha256_prefix: 'x' }, {
      leader_id: 1, connection_type: 'Text', date_of_connection: '2026-10-18', idempotency_key: key(90), note_length: noteLength, note_sha256_prefix: 'x',
    });
    assert.strictEqual(entry.user_id, USER_A);
  });

  await test('writes: adding a note alone is never counted as contacting someone', async () => {
    const { world, token } = await fullWorld();
    const leader = world.repo.leaders.find((l) => l.id === 1)!;
    const connections = world.repo.connections.length;
    sc(await call(world, token, 'add_leader_note', { leader_id: 1, content: 'Thinking about her this week.', idempotency_key: key(95) }));
    assert.strictEqual(leader.last_check_in_date, null);
    assert.strictEqual(world.repo.connections.length, connections);
  });

  await test('new tool outputs conform to their published output schemas (and the schemas reject bad shapes)', async () => {
    const { world, token } = await fullWorld();
    const ajv = new Ajv({ allErrors: true });
    const cases: [string, unknown][] = [
      ['list_event_summaries', { limit: 50 }], ['get_event_summary', { summary_id: SUMMARIES[0].id }],
      ['get_leader_contact', { leader_id: 1 }], ['get_leader_contact', { leader_id: 2 }],
      ['add_leader_note', { leader_id: 1, content: 'schema check', idempotency_key: key(300) }],
      ['log_connection', { leader_id: 1, connection_type: 'Text', date_of_connection: '2026-10-18', idempotency_key: key(301) }],
    ];
    for (const [name, args] of cases) {
      const tool = ALL_TOOLS.find((x) => x.name === name)!;
      const res = await call(world, token, name, args);
      assert.strictEqual(res.result!.isError, false, `${name}: ${res.result?.content[0].text}`);
      const validate = ajv.compile(tool.outputSchema);
      assert.ok(validate(res.result!.structuredContent), `${name}: ${JSON.stringify(validate.errors)}`);
      assert.deepStrictEqual(JSON.parse(res.result!.content[0].text), res.result!.structuredContent, name);
    }
    const note = ALL_TOOLS.find((x) => x.name === 'add_leader_note')!;
    assert.strictEqual(ajv.compile(note.outputSchema)({ replayed: false }), false);
  });

  await test('real repos: contact and summary queries select only whitelisted columns; writes go through the two functions', async () => {
    const { db, queries } = recordingDb({ data: { id: 1 }, error: null });
    const { createSupabaseContactRepo, createSupabaseWriteRepo, WriteError } = require('../lib/mcp/repo-write');
    await createSupabaseContactRepo(db).getLeaderContact(1);
    assert.strictEqual(queries[0].table, 'circle_leaders');
    assert.strictEqual(queries[0].ops.find((o) => o[0] === 'select')![1], 'id, name, email, phone, additional_leader_name, additional_leader_email, additional_leader_phone');
    assert.ok(!/birthday|ccb|prayer/i.test(queries[0].ops.find((o) => o[0] === 'select')![1]));

    const s = recordingDb({ data: null, error: null });
    await createSupabaseReadRepo(s.db).getEventSummary('00000000-0000-4000-8000-000000000001');
    const cols = s.queries[0].ops.find((o) => o[0] === 'select')![1] as string;
    assert.strictEqual(s.queries[0].table, 'circle_event_summaries');
    assert.ok(!/client_ip|user_agent|ccb_response/.test(cols), `summary columns leak: ${cols}`);
    assert.ok(s.queries[0].ops.every((o) => !['insert', 'update', 'upsert', 'delete'].includes(o[0] as string)), 'reading a summary issues no write');

    const camp = recordingDb({ data: [], error: null, count: 0 });
    await createSupabaseReadRepo(camp.db).searchLeaders({ allowedCampuses: ['Denton', 'Flower Mound'], limit: 5, offset: 0 });
    assert.ok(camp.queries[0].ops.some((o) => o[0] === 'or' && o[1] === 'campus.ilike.Denton,campus.ilike.Flower Mound'), 'the allow-list is part of the query itself');
    const none = recordingDb({ data: [], error: null, count: 0 });
    await createSupabaseReadRepo(none.db).searchLeaders({ allowedCampuses: [], limit: 5, offset: 0 });
    assert.ok(none.queries[0].ops.some((o) => o[0] === 'eq' && o[1] === 'id' && o[2] === -1), 'an empty allow-list matches nothing');
    const l = recordingDb({ data: [], error: null, count: 0 });
    await createSupabaseReadRepo(l.db).listEventSummaries({ leaderIds: [1], review: 'reviewed_by_other', userId: 'user-a', limit: 10, after: { occurrence: '2026-10-13T23:30:00+00:00', created_at: '2026-10-14T15:00:00+00:00', id: '00000000-0000-4000-8000-000000000001' } });
    const ops = l.queries[0].ops;
    assert.ok(ops.some((o) => o[0] === 'in' && o[1] === 'leader_id'));
    assert.ok(ops.some((o) => o[0] === 'or' && /reviewed_by\.is\.null,reviewed_by\.neq\.user-a/.test(String(o[1]))), 'someone else = another user or a deleted one');
    assert.ok(ops.some((o) => o[0] === 'and' && /^or\(occurrence\.lt\./.test(String(o[1]))), 'keyset cursor');
    assert.deepStrictEqual(ops.filter((o) => o[0] === 'order').map((o) => o[1]), ['occurrence', 'created_at', 'id']);
    assert.ok(ops.every((o) => !['insert', 'update', 'upsert', 'delete'].includes(o[0] as string)));

    const rpcCalls: any[] = [];
    const rpcDb: any = { rpc: async (fn: string, args: any) => { rpcCalls.push([fn, args]); return { data: { replayed: false, record_id: '7' }, error: null }; } };
    const writes = createSupabaseWriteRepo(rpcDb);
    const ctx = { userId: 'user-a', grantId: 'g1', idempotencyKey: key(1), requestHash: 'h' };
    assert.deepStrictEqual(await writes.addNote(ctx, { leaderId: 1, content: 'hi' }), { recordId: '7', replayed: false });
    assert.strictEqual(rpcCalls[0][0], 'mcp_add_note');
    assert.deepStrictEqual(Object.keys(rpcCalls[0][1]).sort(), ['p_content', 'p_grant_id', 'p_hash', 'p_key', 'p_leader_id', 'p_user_id']);
    await writes.logConnection(ctx, { leaderId: 1, typeId: 2, date: '2026-10-18', note: null, mirrorNote: 'm' });
    assert.strictEqual(rpcCalls[1][0], 'mcp_log_connection');
    for (const [message, code] of [['mcp:idempotency_conflict', 'idempotency_conflict'], ['mcp:leader_not_found', 'leader_not_found'], ['mcp:connection_type_invalid', 'connection_type_invalid']]) {
      const failing: any = { rpc: async () => ({ data: null, error: { message: `P0001 ${message}` } }) };
      await assert.rejects(() => createSupabaseWriteRepo(failing).addNote(ctx, { leaderId: 1, content: 'x' }), (e: any) => e instanceof WriteError && e.code === code);
    }
    const broken: any = { rpc: async () => ({ data: null, error: { message: 'connection refused' } }) };
    await assert.rejects(() => createSupabaseWriteRepo(broken).addNote(ctx, { leaderId: 1, content: 'x' }), (e: any) => !(e instanceof WriteError));
    assert.ok(!Object.keys(writes).some((k) => /delete|update|remove/i.test(k)), 'the write repo has no edit or delete method');
  });

  await test('real store: a missing campuses column (migration not yet applied) means every campus, not a lockout', async () => {
    let calls = 0;
    const db: any = {
      from() {
        const q: any = new Proxy(function () {}, {
          get(_t, prop: string) {
            if (prop === 'then') {
              calls++;
              return (resolve: (v: unknown) => void) =>
                resolve(calls === 1 ? { data: null, error: { message: 'column mcp_access.campuses does not exist' } } : { data: { user_id: 'u', scopes: ['radius:read'], revoked_at: null }, error: null });
            }
            return () => q;
          },
        });
        return q;
      },
    };
    const row = await createSupabaseMcpStore(db).getAccess('u');
    assert.strictEqual(row!.user_id, 'u');
    assert.strictEqual(row!.campuses ?? null, null);
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
