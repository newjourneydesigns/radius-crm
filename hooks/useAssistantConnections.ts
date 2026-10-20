'use client';

import { useCallback, useEffect, useState } from 'react';
import { apiFetch } from '../lib/apiClient';

export interface AssistantConnection {
  id: string;
  assistant: string;
  connected_at: string | null;
  last_used_at: string | null;
  expires_at: string;
}

export interface AssistantActivity {
  at: string;
  tool: string | null;
  ok: boolean | null;
  result_count: number | null;
}

interface AssistantAccessState {
  enabled: boolean;
  connections: AssistantConnection[];
  activity: AssistantActivity[];
}

const ENDPOINT = '/api/mcp-oauth/connections/';

/** The signed-in user's assistant connections, with Disconnect and Disconnect everything. */
export function useAssistantConnections() {
  const [data, setData] = useState<AssistantAccessState | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const apply = useCallback(async (res: Response) => {
    if (res.ok) {
      setData(await res.json());
      setError(null);
      return;
    }
    setError(
      res.status === 401
        ? 'Your Radius session has ended. Sign in again.'
        : res.status === 404
          ? 'That connection was already gone.'
          : 'Something went wrong. Try again.'
    );
  }, []);

  const refresh = useCallback(async () => {
    try {
      await apply(await apiFetch(ENDPOINT));
    } catch {
      setError('Could not reach Radius. Check your connection.');
    } finally {
      setLoading(false);
    }
  }, [apply]);

  useEffect(() => { refresh(); }, [refresh]);

  const send = useCallback(
    async (payload: Record<string, string>) => {
      setBusy(true);
      try {
        await apply(
          await apiFetch(ENDPOINT, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          })
        );
      } catch {
        setError('Could not reach Radius. Check your connection.');
      } finally {
        setBusy(false);
      }
    },
    [apply]
  );

  return {
    data,
    loading,
    busy,
    error,
    refresh,
    disconnect: (grantId: string) => send({ action: 'disconnect', grant_id: grantId }),
    disconnectAll: () => send({ action: 'disconnect_all' }),
  };
}
