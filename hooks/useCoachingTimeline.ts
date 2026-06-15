import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import type { TimelineEvent } from '../app/api/circle-leader-toolkit/coaching-timeline/route';

export type { TimelineEvent } from '../app/api/circle-leader-toolkit/coaching-timeline/route';

/**
 * Loads a leader's merged coaching timeline (automation nudges, coaching notes,
 * encouragements, prayer, scorecard changes) from the aggregation route.
 */
export function useCoachingTimeline(leaderId: number) {
  const [events, setEvents] = useState<TimelineEvent[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (!leaderId) return;
    setIsLoading(true);
    setError(null);
    try {
      const token = (await supabase.auth.getSession()).data.session?.access_token ?? null;
      const res = await fetch(`/api/circle-leader-toolkit/coaching-timeline?leaderId=${leaderId}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        cache: 'no-store',
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Failed to load the timeline.');
      setEvents((data.events ?? []) as TimelineEvent[]);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load the timeline.');
    } finally {
      setIsLoading(false);
    }
  }, [leaderId]);

  useEffect(() => {
    reload();
  }, [reload]);

  return { events, isLoading, error, reload };
}
