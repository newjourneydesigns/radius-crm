/**
 * Authenticated API client — automatically attaches the current Supabase
 * access token as an Authorization: Bearer header so server-side route
 * handlers can verify the caller's identity and role.
 */
import { supabase } from './supabase';

async function getAccessToken(): Promise<string | null> {
  const { data: { session } } = await supabase.auth.getSession();
  return session?.access_token ?? null;
}

export async function apiFetch(
  input: string,
  init: RequestInit = {}
): Promise<Response> {
  const token = await getAccessToken();
  return fetch(input, {
    ...init,
    headers: {
      ...(init.headers ?? {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });
}
