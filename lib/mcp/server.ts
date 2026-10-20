import { protectedResourceMetadataUrl, MCP_SCOPE_READ } from './config';
import { authenticateBearer, type OAuthDeps, type Principal } from './oauth';
import type { ReadRepo } from './repo';
import { InputError } from './schema';
import { READ_TOOLS, parseToolArguments, type ToolDefinition } from './tools';

export interface McpServerDeps extends OAuthDeps {
  repo: ReadRepo;
  tools?: readonly ToolDefinition[];
}

const SERVER_INFO = { name: 'radius-mcp', title: 'Radius', version: '1.0.0' };
const SUPPORTED_PROTOCOLS = ['2025-11-25', '2025-06-18', '2025-03-26', '2024-11-05'];
const MAX_BODY_BYTES = 100 * 1024;
const RATE_LIMIT_PER_MINUTE = 120;

const INSTRUCTIONS =
  'Read-only access to Radius, the Circle Leader CRM. Start with search_leaders to find a leader id, ' +
  'then use get_leader, list_leader_notes and list_leader_connections for detail, and list_follow_ups for what is due. ' +
  'This is private pastoral information: summarise it for the signed-in user and do not repeat it elsewhere. ' +
  'Nothing here can change Radius.';

// Per-instance, best effort: serverless instances don't share memory, so this slows a runaway loop rather than guaranteeing a cap.
const callCounts = new Map<string, { count: number; resetAt: number }>();

function withinRateLimit(grantId: string, nowMs: number): boolean {
  const entry = callCounts.get(grantId);
  if (!entry || nowMs >= entry.resetAt) {
    callCounts.set(grantId, { count: 1, resetAt: nowMs + 60_000 });
    return true;
  }
  entry.count += 1;
  return entry.count <= RATE_LIMIT_PER_MINUTE;
}

export const resetRateLimits = () => callCounts.clear();

const NO_STORE = { 'Cache-Control': 'no-store' };

function json(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...NO_STORE, ...headers },
  });
}

export function unauthorized(deps: OAuthDeps, invalid: boolean): Response {
  const challenge =
    `Bearer resource_metadata="${protectedResourceMetadataUrl(deps.config)}", scope="${MCP_SCOPE_READ}"` +
    (invalid ? ', error="invalid_token"' : '');
  return json({ error: invalid ? 'invalid_token' : 'unauthorized' }, 401, { 'WWW-Authenticate': challenge });
}

interface RpcRequest {
  jsonrpc?: string;
  id?: string | number | null;
  method?: string;
  params?: Record<string, unknown>;
}

const rpcError = (id: RpcRequest['id'], code: number, message: string) => ({
  jsonrpc: '2.0',
  id: id ?? null,
  error: { code, message },
});

const rpcResult = (id: RpcRequest['id'], result: unknown) => ({ jsonrpc: '2.0', id: id ?? null, result });

function listTools(tools: readonly ToolDefinition[], principal: Principal) {
  return tools
    .filter((tool) => principal.scopes.includes(tool.requiredScope))
    .map((tool) => ({
      name: tool.name,
      title: tool.title,
      description: tool.description,
      inputSchema: tool.inputSchema,
      outputSchema: tool.outputSchema,
      annotations: {
        title: tool.title,
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
      securitySchemes: [{ type: 'oauth2', scopes: [tool.requiredScope] }],
    }));
}

async function callTool(deps: McpServerDeps, principal: Principal, params: Record<string, unknown> | undefined) {
  const tools = deps.tools ?? READ_TOOLS;
  const name = typeof params?.name === 'string' ? params.name : '';
  const tool = tools.find((t) => t.name === name);
  if (!tool) return { error: { code: -32602, message: `Unknown tool: ${name || '(none)'}` } };

  const started = deps.now().getTime();
  const audit = (ok: boolean, count: number | null, error?: string) =>
    deps.store.audit({
      event: 'tool_call',
      user_id: principal.userId,
      grant_id: principal.grantId,
      client_id: principal.clientId,
      tool: tool.name,
      args: params?.arguments ?? null,
      ok,
      result_count: count,
      error: error ?? null,
      duration_ms: deps.now().getTime() - started,
    });
  const failure = (message: string) => ({
    result: { content: [{ type: 'text', text: message }], isError: true },
  });

  if (!principal.scopes.includes(tool.requiredScope)) {
    await audit(false, null, 'insufficient_scope');
    return failure('This connection is not allowed to use that tool.');
  }

  try {
    const args = parseToolArguments(tool, params?.arguments);
    const { structured, count } = await tool.run(args, {
      repo: deps.repo,
      principal,
      config: deps.config,
      now: deps.now,
    });
    await audit(true, count);
    return {
      result: {
        content: [{ type: 'text', text: JSON.stringify(structured) }],
        structuredContent: structured,
        isError: false,
      },
    };
  } catch (err) {
    if (err instanceof InputError) {
      await audit(false, null, err.message);
      return failure(err.message);
    }
    // Database and server details stay in the server log; the assistant only sees a generic message.
    console.error(`MCP tool ${tool.name} failed:`, err instanceof Error ? err.message : err);
    await audit(false, null, 'internal_error');
    return failure('Radius could not complete that read. Try again in a moment.');
  }
}

async function handleMessage(deps: McpServerDeps, principal: Principal, msg: RpcRequest) {
  const tools = deps.tools ?? READ_TOOLS;
  switch (msg.method) {
    case 'initialize': {
      const requested = typeof msg.params?.protocolVersion === 'string' ? msg.params.protocolVersion : '';
      return rpcResult(msg.id, {
        protocolVersion: SUPPORTED_PROTOCOLS.includes(requested) ? requested : '2025-06-18',
        capabilities: { tools: { listChanged: false } },
        serverInfo: SERVER_INFO,
        instructions: INSTRUCTIONS,
      });
    }
    case 'ping':
      return rpcResult(msg.id, {});
    case 'tools/list':
      return rpcResult(msg.id, { tools: listTools(tools, principal) });
    case 'tools/call': {
      const outcome = await callTool(deps, principal, msg.params);
      return 'error' in outcome && outcome.error
        ? rpcError(msg.id, outcome.error.code, outcome.error.message)
        : rpcResult(msg.id, (outcome as { result: unknown }).result);
    }
    default:
      return rpcError(msg.id, -32601, `Method not found: ${msg.method}`);
  }
}

/** POST /api/mcp — Streamable HTTP, stateless, JSON responses only. */
export async function handleMcpPost(request: Request, deps: McpServerDeps): Promise<Response> {
  try {
    return await processMcpPost(request, deps);
  } catch (err) {
    // Typically the database being unreachable. The detail stays in the server log.
    console.error('MCP request failed:', err instanceof Error ? err.message : err);
    return json({ error: 'temporarily_unavailable' }, 503, { 'Retry-After': '30' });
  }
}

async function processMcpPost(request: Request, deps: McpServerDeps): Promise<Response> {
  const header = request.headers.get('authorization') || '';
  const match = /^Bearer\s+(\S+)$/i.exec(header);
  if (!match) return unauthorized(deps, false);

  const auth = await authenticateBearer(deps, match[1]);
  if (!auth.ok) {
    await deps.store.audit({ event: 'auth_failed', ok: false, error: auth.error });
    return unauthorized(deps, true);
  }
  const { principal } = auth;

  if (!withinRateLimit(principal.grantId, deps.now().getTime())) {
    return json({ error: 'rate_limited' }, 429, { 'Retry-After': '60' });
  }

  const protocolHeader = request.headers.get('mcp-protocol-version');
  if (protocolHeader && !SUPPORTED_PROTOCOLS.includes(protocolHeader)) {
    return json(rpcError(null, -32600, `Unsupported MCP-Protocol-Version: ${protocolHeader}`), 400);
  }

  if (!(request.headers.get('content-type') || '').toLowerCase().includes('application/json')) {
    return json(rpcError(null, -32600, 'Content-Type must be application/json.'), 415);
  }
  const text = await request.text();
  if (text.length > MAX_BODY_BYTES) return json(rpcError(null, -32600, 'Request too large.'), 413);

  let payload: unknown;
  try {
    payload = JSON.parse(text);
  } catch {
    return json(rpcError(null, -32700, 'Parse error.'), 400);
  }

  const messages = Array.isArray(payload) ? payload : [payload];
  if (messages.length === 0 || messages.length > 20) {
    return json(rpcError(null, -32600, 'Send between 1 and 20 messages.'), 400);
  }

  const replies: unknown[] = [];
  for (const raw of messages) {
    const msg = raw as RpcRequest;
    if (!msg || typeof msg !== 'object' || msg.jsonrpc !== '2.0') {
      replies.push(rpcError(null, -32600, 'Invalid Request.'));
      continue;
    }
    const isRequest = typeof msg.method === 'string' && msg.id !== undefined && msg.id !== null;
    if (!isRequest) continue; // notifications and client responses need no reply
    replies.push(await handleMessage(deps, principal, msg));
  }

  if (replies.length === 0) return new Response(null, { status: 202, headers: NO_STORE });
  return json(Array.isArray(payload) ? replies : replies[0]);
}

export const methodNotAllowed = () =>
  new Response(null, { status: 405, headers: { Allow: 'POST', ...NO_STORE } });
