import type { SupabaseClient } from '@supabase/supabase-js';
import { createServiceSupabaseClient } from '../server-supabase';
import { resolveClient } from './clients';
import { loadMcpConfig } from './config';
import type { OAuthDeps } from './oauth';
import { createSupabaseReadRepo } from './repo';
import { createSupabaseContactRepo, createSupabaseWriteRepo } from './repo-write';
import type { McpServerDeps } from './server';
import { createSupabaseMcpStore } from './store-supabase';

/** Production wiring. Throws if the site URL is not configured, so a misconfigured deploy fails loudly. */
export function createOAuthDeps(db: SupabaseClient = createServiceSupabaseClient({ noStore: true })): OAuthDeps {
  const config = loadMcpConfig();
  return {
    config,
    store: createSupabaseMcpStore(db),
    resolveClient: (clientId) => resolveClient(clientId, config),
    now: () => new Date(),
  };
}

export function createMcpServerDeps(): McpServerDeps {
  const db = createServiceSupabaseClient({ noStore: true });
  return {
    ...createOAuthDeps(db),
    repo: createSupabaseReadRepo(db),
    contacts: createSupabaseContactRepo(db),
    writes: createSupabaseWriteRepo(db),
  };
}
