'use client';

import { useState, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import type { CalendarSubscription } from '../lib/supabase';
import type { CalendarEventItem } from '../app/api/calendar-events/route';

export type { CalendarEventItem };

export function useTodayCalendars() {
  const [subscriptions, setSubscriptions] = useState<CalendarSubscription[]>([]);
  const [events, setEvents] = useState<CalendarEventItem[]>([]);
  const [feedErrors, setFeedErrors] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchEvents = useCallback(async (fresh = false) => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) return;
      const res = await fetch(fresh ? '/api/calendar-events?fresh=1' : '/api/calendar-events', {
        headers: { Authorization: `Bearer ${session.access_token}` },
        cache: 'no-store',
      });
      if (!res.ok) return;
      const data = await res.json();
      setEvents(data.events || []);
      setFeedErrors((data.errors || []).map((e: { calendar_name: string }) => e.calendar_name));
    } catch {
      // Feed problems shouldn't break the page — subscriptions list still renders
    }
  }, []);

  const fetchAll = useCallback(async (fresh = false) => {
    setIsLoading(true);
    setError(null);
    try {
      const { data, error: err } = await supabase
        .from('calendar_subscriptions')
        .select('*')
        .order('created_at', { ascending: true });
      if (err) throw err;
      setSubscriptions((data || []) as CalendarSubscription[]);
      if ((data || []).some((s: CalendarSubscription) => s.is_enabled)) {
        await fetchEvents(fresh);
      } else {
        setEvents([]);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load calendars');
    } finally {
      setIsLoading(false);
    }
  }, [fetchEvents]);

  const addSubscription = useCallback(async (name: string, url: string, color: string) => {
    if (!name.trim() || !url.trim()) return false;
    setIsSaving(true);
    setError(null);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');
      const { data, error: err } = await supabase
        .from('calendar_subscriptions')
        .insert([{ user_id: user.id, name: name.trim(), url: url.trim(), color }])
        .select()
        .single();
      if (err) throw err;
      setSubscriptions(prev => [...prev, data as CalendarSubscription]);
      await fetchEvents();
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add calendar');
      return false;
    } finally {
      setIsSaving(false);
    }
  }, [fetchEvents]);

  const toggleSubscription = useCallback(async (id: string, isEnabled: boolean) => {
    setSubscriptions(prev => prev.map(s => s.id === id ? { ...s, is_enabled: isEnabled } : s));
    try {
      await supabase.from('calendar_subscriptions').update({ is_enabled: isEnabled }).eq('id', id);
      await fetchEvents();
    } catch {
      setSubscriptions(prev => prev.map(s => s.id === id ? { ...s, is_enabled: !isEnabled } : s));
    }
  }, [fetchEvents]);

  const removeSubscription = useCallback(async (id: string) => {
    const prevSubs = subscriptions;
    setSubscriptions(prev => prev.filter(s => s.id !== id));
    setEvents(prev => prev.filter(e => e.subscription_id !== id));
    try {
      const { error: err } = await supabase.from('calendar_subscriptions').delete().eq('id', id);
      if (err) throw err;
    } catch {
      setSubscriptions(prevSubs);
    }
  }, [subscriptions]);

  return {
    subscriptions,
    events,
    feedErrors,
    isLoading,
    isSaving,
    error,
    fetchAll,
    addSubscription,
    toggleSubscription,
    removeSubscription,
  };
}
