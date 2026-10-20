'use client';

import { useCallback, useEffect, useState } from 'react';
import { apiFetch } from '../lib/apiClient';

const PARAM_KEYS = [
  'response_type', 'client_id', 'redirect_uri', 'code_challenge', 'code_challenge_method', 'scope', 'state', 'resource',
] as const;

export type McpAuthorizationState =
  | { status: 'checking' }
  | { status: 'ready'; clientName: string }
  | { status: 'invalid'; message: string }
  | { status: 'working'; clientName: string }
  | { status: 'not-enabled'; clientName: string }
  | { status: 'error'; clientName: string; message: string }
  | { status: 'leaving' };

/** Drives the consent screen: checks the assistant's request, then sends the user's decision to the server. */
export function useMcpAuthorization(search: { get(name: string): string | null } | null, signedIn: boolean) {
  const [state, setState] = useState<McpAuthorizationState>({ status: 'checking' });

  const params: Record<string, string> = {};
  for (const key of PARAM_KEYS) {
    const value = search?.get(key) ?? null;
    if (value !== null) params[key] = value;
  }
  const paramsKey = JSON.stringify(params);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/mcp-oauth/authorize/', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ params: JSON.parse(paramsKey) }),
        });
        const data = await res.json().catch(() => ({}));
        if (cancelled) return;
        if (data.ok) {
          setState({ status: 'ready', clientName: data.client_name });
        } else if (data.fatal === false && data.redirectTo) {
          // A problem the assistant should hear about (e.g. an unsupported scope): send it back with the error.
          setState({ status: 'leaving' });
          window.location.replace(data.redirectTo);
        } else {
          setState({ status: 'invalid', message: data.error_description || 'This request could not be verified.' });
        }
      } catch {
        if (!cancelled) setState({ status: 'invalid', message: 'Radius could not check this request. Try again from your assistant.' });
      }
    })();
    return () => { cancelled = true; };
  }, [paramsKey]);

  const decide = useCallback(
    async (decision: 'approve' | 'deny') => {
      if (state.status !== 'ready' && state.status !== 'error' && state.status !== 'not-enabled') return;
      const clientName = state.clientName;
      setState({ status: 'working', clientName });
      try {
        const res = await apiFetch('/api/mcp-oauth/authorize/', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ params: JSON.parse(paramsKey), decision }),
        });
        const data = await res.json().catch(() => ({}));
        if (data.ok && data.redirectTo) {
          setState({ status: 'leaving' });
          window.location.assign(data.redirectTo);
        } else if (data.error === 'access_not_enabled') {
          setState({ status: 'not-enabled', clientName });
        } else {
          setState({
            status: 'error',
            clientName,
            message: res.status === 401 ? 'Your Radius session has ended. Sign in again to continue.' : 'Something went wrong. Try again.',
          });
        }
      } catch {
        setState({ status: 'error', clientName, message: 'Could not reach Radius. Check your connection and try again.' });
      }
    },
    [paramsKey, state]
  );

  return { state, decide, canDecide: signedIn };
}
