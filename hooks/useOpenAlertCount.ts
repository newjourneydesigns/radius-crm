'use client';

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';

// Powers the red "open alert" dot next to Today in the nav. Counts the same
// open items as the app-icon badge — board cards + follow-ups due today or
// overdue — via the lightweight /api/today/badge-count endpoint.
//
// Refreshes on mount, on window focus, and every few minutes so the dot stays
// roughly live wherever you are in the app. The Today page also broadcasts the
// exact count it computes (radius:today-alert-count) as it's marked off, so the
// dot ticks down in real time while you work the list.

const ALERT_COUNT_EVENT = 'radius:today-alert-count';
const REFRESH_INTERVAL_MS = 5 * 60 * 1000;

export function useOpenAlertCount(): number {
  const [count, setCount] = useState(0);

  const refresh = useCallback(async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) return;
      const res = await fetch('/api/today/badge-count', {
        headers: { Authorization: `Bearer ${session.access_token}` },
        cache: 'no-store',
      });
      if (!res.ok) return;
      const body = await res.json();
      if (typeof body?.count === 'number') setCount(body.count);
    } catch {
      // Best-effort: leave the last known count in place on failure.
    }
  }, []);

  useEffect(() => {
    refresh();

    const onFocus = () => refresh();
    const onCount = (e: Event) => {
      const detail = (e as CustomEvent<{ count?: number }>).detail;
      if (detail && typeof detail.count === 'number') setCount(detail.count);
    };

    window.addEventListener('focus', onFocus);
    window.addEventListener(ALERT_COUNT_EVENT, onCount as EventListener);
    const interval = setInterval(refresh, REFRESH_INTERVAL_MS);

    return () => {
      window.removeEventListener('focus', onFocus);
      window.removeEventListener(ALERT_COUNT_EVENT, onCount as EventListener);
      clearInterval(interval);
    };
  }, [refresh]);

  return count;
}
