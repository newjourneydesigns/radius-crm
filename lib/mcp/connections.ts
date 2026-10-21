import type { OAuthDeps } from './oauth';
import type { ActivityRow } from './types';

export interface ConnectionSummary {
  id: string;
  assistant: string;
  connected_at: string | null;
  last_used_at: string | null;
  expires_at: string;
}

export interface AssistantAccess {
  /** Whether an administrator has turned assistant access on for this account. */
  enabled: boolean;
  connections: ConnectionSummary[];
  activity: ActivityRow[];
}

const ACTIVITY_LIMIT = 15;

/** A readable name for the assistant behind a client id (a URL such as https://chatgpt.com/oauth/client.json). */
export function assistantName(clientId: string): string {
  try {
    const host = new URL(clientId).hostname;
    return host === 'chatgpt.com' ? 'ChatGPT' : host;
  } catch {
    return 'AI assistant';
  }
}

/** Everything the page shows. Only ever the signed-in user's own connections and activity. */
export async function getAssistantAccess(deps: OAuthDeps, userId: string): Promise<AssistantAccess> {
  const { store } = deps;
  const [access, grants, activity] = await Promise.all([
    store.getAccess(userId),
    store.listGrantsForUser(userId, deps.now()),
    store.recentToolCalls(userId, ACTIVITY_LIMIT),
  ]);
  return {
    enabled: !!access && !access.revoked_at,
    connections: grants.map((g) => ({
      id: g.id,
      assistant: assistantName(g.client_id),
      connected_at: g.created_at ?? null,
      last_used_at: g.last_used_at ?? null,
      expires_at: g.expires_at,
    })),
    activity,
  };
}

/** Ends one connection if it is the caller's own. Its tokens stop working on their next request. */
export async function disconnect(deps: OAuthDeps, userId: string, grantId: string): Promise<boolean> {
  const ended = await deps.store.revokeGrantForUser(userId, grantId);
  await deps.store.audit({ event: 'disconnected_by_user', user_id: userId, grant_id: grantId, ok: ended });
  return ended;
}

export async function disconnectAll(deps: OAuthDeps, userId: string): Promise<number> {
  const count = await deps.store.revokeAllGrantsForUser(userId);
  await deps.store.audit({ event: 'disconnected_all_by_user', user_id: userId, result_count: count, ok: true });
  return count;
}
