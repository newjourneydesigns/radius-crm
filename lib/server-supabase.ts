import { createClient } from '@supabase/supabase-js';
import WebSocket from 'ws';

type SupabaseWebSocketTransport = typeof globalThis.WebSocket;
const websocketTransport = WebSocket as unknown as SupabaseWebSocketTransport;

export function createServiceSupabaseClient(options?: { noStore?: boolean }) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error('Missing Supabase service credentials');
  }

  return createClient(url, key, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
    realtime: {
      transport: websocketTransport,
    },
    // Next.js instruments global fetch and caches GET responses by URL, so a
    // service read can return stale rows (e.g. an empty roster cached from
    // before positions were assigned). `noStore` forces every query to bypass
    // that cache — use it for reads of admin-mutable config that must be fresh.
    ...(options?.noStore
      ? { global: { fetch: (input: any, init: any) => fetch(input, { ...init, cache: 'no-store' }) } }
      : {}),
  });
}

export function createAnonSupabaseClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key) {
    throw new Error('Missing Supabase anon credentials');
  }

  return createClient(url, key, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
    realtime: {
      transport: websocketTransport,
    },
  });
}

export async function getUserFromAuthHeader(request: Request) {
  const authHeader = request.headers.get('authorization');
  const token = authHeader?.replace(/^Bearer\s+/i, '');

  if (!token) return null;

  const supabase = createAnonSupabaseClient();
  const { data, error } = await supabase.auth.getUser(token);

  if (error || !data.user) return null;
  return data.user;
}
