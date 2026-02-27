import { useEffect, useRef } from 'react';
import { supabase } from '../lib/supabase';
import type { RealtimeChannel, RealtimePostgresChangesPayload } from '@supabase/supabase-js';

type PostgresChangeEvent = 'INSERT' | 'UPDATE' | 'DELETE' | '*';

export interface RealtimeSubscriptionConfig {
  /** The Postgres table name to listen to (e.g. 'circle_leaders') */
  table: string;
  /** Schema — defaults to 'public' */
  schema?: string;
  /** Which DML event(s) to listen for — defaults to '*' (all) */
  event?: PostgresChangeEvent;
  /** Optional Postgres filter (e.g. "user_id=eq.abc-123") */
  filter?: string;
}

/**
 * Subscribe to Postgres row-level changes on one or more tables via
 * Supabase Realtime.  All subscriptions share a single channel (one
 * WebSocket), which is torn down on unmount.
 *
 * @param channelName  Unique channel identifier (e.g. "dashboard-<userId>")
 * @param subscriptions  Array of table subscription configs
 * @param onMessage  Callback fired for every matching change event
 * @param enabled  Gate — pass `false` to delay subscription until ready
 *
 * @example
 * ```ts
 * useRealtimeSubscription(
 *   `dashboard-${user.id}`,
 *   [
 *     { table: 'circle_leaders' },
 *     { table: 'todo_items', filter: `user_id=eq.${user.id}` },
 *   ],
 *   (payload) => { console.log(payload.table, payload.eventType); },
 *   !!user?.id,
 * );
 * ```
 */
export function useRealtimeSubscription(
  channelName: string,
  subscriptions: RealtimeSubscriptionConfig[],
  onMessage: (payload: RealtimePostgresChangesPayload<Record<string, unknown>>) => void,
  enabled: boolean = true,
) {
  const channelRef = useRef<RealtimeChannel | null>(null);
  // Keep a stable reference to the latest callback without re-subscribing
  const callbackRef = useRef(onMessage);
  callbackRef.current = onMessage;

  useEffect(() => {
    if (!enabled || subscriptions.length === 0) return;

    // Build a single channel with one `.on()` per subscription config
    let channel = supabase.channel(channelName);

    for (const sub of subscriptions) {
      channel = channel.on(
        'postgres_changes' as any,
        {
          event: sub.event ?? '*',
          schema: sub.schema ?? 'public',
          table: sub.table,
          ...(sub.filter ? { filter: sub.filter } : {}),
        },
        (payload: RealtimePostgresChangesPayload<Record<string, unknown>>) => {
          callbackRef.current(payload);
        },
      ) as unknown as RealtimeChannel;
    }

    channel.subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        console.log(`[Realtime] Channel "${channelName}" subscribed (${subscriptions.length} tables)`);
      } else if (status === 'CHANNEL_ERROR') {
        console.warn(`[Realtime] Channel "${channelName}" error — will auto-retry`);
      }
    });

    channelRef.current = channel;

    return () => {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
    };
    // Re-subscribe when the channel name or subscription shape changes.
    // We intentionally serialise `subscriptions` so the effect only re-runs
    // when the actual config differs — not on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channelName, enabled, JSON.stringify(subscriptions)]);
}
