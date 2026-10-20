import type { SupabaseClient } from '@supabase/supabase-js';
import { hasPassed } from './time';
import type { AccessRow, ActivityRow, AuditEntry, ClaimResult, CodeRow, GrantRow, McpStore, TokenRow } from './types';

const isPast = hasPassed;

function must<T>(result: { data: T; error: { message: string } | null }, what: string): T {
  if (result.error) throw new Error(`${what}: ${result.error.message}`);
  return result.data;
}

/** Service-role backed store. The service key never leaves the server; these tables have no RLS policies. */
export function createSupabaseMcpStore(db: SupabaseClient): McpStore {
  return {
    async getAccess(userId) {
      const res = await db
        .from('mcp_access')
        .select('user_id, scopes, revoked_at')
        .eq('user_id', userId)
        .maybeSingle();
      return must(res, 'mcp_access lookup') as AccessRow | null;
    },

    async listAllowedRedirectUris() {
      const res = await db.from('mcp_allowed_redirects').select('redirect_uri');
      return (must(res, 'allowed redirects') as { redirect_uri: string }[]).map((r) => r.redirect_uri);
    },

    async userExists(userId) {
      const res = await db.from('users').select('id').eq('id', userId).maybeSingle();
      return !!must(res, 'users lookup');
    },

    async createGrant(grant) {
      const res = await db.from('mcp_oauth_grants').insert(grant).select().single();
      return must(res, 'create grant') as GrantRow;
    },

    async getGrant(id) {
      const res = await db.from('mcp_oauth_grants').select().eq('id', id).maybeSingle();
      return must(res, 'grant lookup') as GrantRow | null;
    },

    async revokeGrant(id) {
      const res = await db
        .from('mcp_oauth_grants')
        .update({ revoked_at: new Date().toISOString() })
        .eq('id', id)
        .is('revoked_at', null);
      must(res, 'revoke grant');
    },

    async touchGrant(id) {
      // Best effort: a failed timestamp must not fail the request.
      await db.from('mcp_oauth_grants').update({ last_used_at: new Date().toISOString() }).eq('id', id);
    },

    async listGrantsForUser(userId, now) {
      const res = await db
        .from('mcp_oauth_grants')
        .select('id, user_id, client_id, scope, resource, created_at, expires_at, revoked_at, last_used_at')
        .eq('user_id', userId)
        .is('revoked_at', null)
        .gt('expires_at', now.toISOString())
        .order('created_at', { ascending: false });
      return must(res, 'list grants') as GrantRow[];
    },

    async revokeGrantForUser(userId, grantId) {
      // The user id is part of the UPDATE's own condition, so one person can never end another's connection.
      const res = await db
        .from('mcp_oauth_grants')
        .update({ revoked_at: new Date().toISOString() })
        .eq('id', grantId)
        .eq('user_id', userId)
        .is('revoked_at', null)
        .select('id');
      return (must(res, 'revoke grant for user') as { id: string }[]).length > 0;
    },

    async revokeAllGrantsForUser(userId) {
      const res = await db
        .from('mcp_oauth_grants')
        .update({ revoked_at: new Date().toISOString() })
        .eq('user_id', userId)
        .is('revoked_at', null)
        .select('id');
      return (must(res, 'revoke all grants') as { id: string }[]).length;
    },

    async recentToolCalls(userId, limit) {
      const res = await db
        .from('mcp_audit_log')
        .select('at, tool, ok, result_count')
        .eq('user_id', userId)
        .eq('event', 'tool_call')
        .order('at', { ascending: false })
        .limit(limit);
      return must(res, 'recent tool calls') as ActivityRow[];
    },

    async insertCode(code) {
      must(await db.from('mcp_oauth_codes').insert(code), 'insert code');
    },

    async claimCode(codeHash, now): Promise<ClaimResult<CodeRow>> {
      const claimed = await db
        .from('mcp_oauth_codes')
        .update({ used_at: now.toISOString() })
        .eq('code_hash', codeHash)
        .is('used_at', null)
        .select()
        .maybeSingle();
      const row = must(claimed, 'claim code') as CodeRow | null;
      if (row) return isPast(row.expires_at, now) ? { status: 'expired', row } : { status: 'claimed', row };

      const existing = must(
        await db.from('mcp_oauth_codes').select().eq('code_hash', codeHash).maybeSingle(),
        'code lookup'
      ) as CodeRow | null;
      return existing ? { status: 'reused', row: existing } : { status: 'missing' };
    },

    async insertToken(token) {
      must(await db.from('mcp_oauth_tokens').insert(token), 'insert token');
    },

    async getToken(tokenHash) {
      const res = await db.from('mcp_oauth_tokens').select().eq('token_hash', tokenHash).maybeSingle();
      return must(res, 'token lookup') as TokenRow | null;
    },

    async claimRefreshToken(tokenHash, now): Promise<ClaimResult<TokenRow>> {
      const claimed = await db
        .from('mcp_oauth_tokens')
        .update({ used_at: now.toISOString() })
        .eq('token_hash', tokenHash)
        .eq('kind', 'refresh')
        .is('used_at', null)
        .select()
        .maybeSingle();
      const row = must(claimed, 'claim refresh token') as TokenRow | null;
      if (row) return isPast(row.expires_at, now) ? { status: 'expired', row } : { status: 'claimed', row };

      const existing = must(
        await db.from('mcp_oauth_tokens').select().eq('token_hash', tokenHash).eq('kind', 'refresh').maybeSingle(),
        'refresh token lookup'
      ) as TokenRow | null;
      return existing ? { status: 'reused', row: existing } : { status: 'missing' };
    },

    async audit(entry: AuditEntry) {
      const { error } = await db.from('mcp_audit_log').insert({
        event: entry.event,
        user_id: entry.user_id ?? null,
        grant_id: entry.grant_id ?? null,
        client_id: entry.client_id ?? null,
        tool: entry.tool ?? null,
        args: entry.args ?? null,
        ok: entry.ok ?? null,
        result_count: entry.result_count ?? null,
        error: entry.error ? entry.error.slice(0, 500) : null,
        duration_ms: entry.duration_ms ?? null,
      });
      // Not swallowed: the consent screen promises every request is logged, so a request that can't be
      // logged must not succeed. Callers let this surface as a 503 / 500.
      if (error) throw new Error(`audit write failed: ${error.message}`);
    },
  };
}
