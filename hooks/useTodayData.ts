'use client';

import { useState, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import type { TodayData } from '../app/api/today/route';

export type { TodayData };

const CACHE_KEY = 'today_data_cache_v1';
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

export function useTodayData() {
  const [data, setData] = useState<TodayData | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isFetching, setIsFetching] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setError(null);
    setIsFetching(true);

    // Serve cached data immediately so the page renders without a spinner
    let hasCachedData = false;
    try {
      const raw = localStorage.getItem(CACHE_KEY);
      if (raw) {
        const { data: cachedData, timestamp } = JSON.parse(raw);
        if (Date.now() - timestamp < CACHE_TTL) {
          setData(cachedData);
          hasCachedData = true;
        }
      }
    } catch {}

    // Only block with a spinner on the first load
    if (!hasCachedData) setIsLoading(true);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        setError('Not authenticated');
        return;
      }
      const res = await fetch('/api/today', {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (!res.ok) {
        const body = await res.json();
        setError(body.error || 'Failed to load today data');
        return;
      }
      const json = await res.json();
      setData(json);
      try {
        localStorage.setItem(CACHE_KEY, JSON.stringify({ data: json, timestamp: Date.now() }));
      } catch {}
    } catch (err: any) {
      setError(err.message || 'Unknown error');
    } finally {
      setIsLoading(false);
      setIsFetching(false);
    }
  }, []);

  // Mark an encouragement as sent — removes from local state optimistically
  const markEncouragementSent = useCallback(async (id: number) => {
    setData(prev => {
      if (!prev) return prev;
      return {
        ...prev,
        encouragements: {
          dueToday: prev.encouragements.dueToday.filter(e => e.id !== id),
          overdue: prev.encouragements.overdue.filter(e => e.id !== id),
        },
      };
    });
    try {
      await fetch(`/api/acpd-tracking?type=encourage&id=${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message_type: 'sent' }),
      });
    } catch (err) {
      console.error('Failed to mark encouragement sent:', err);
    }
  }, []);

  // Clear a follow-up — removes from local state optimistically
  const clearFollowUp = useCallback(async (leaderId: number) => {
    setData(prev => {
      if (!prev) return prev;
      return {
        ...prev,
        followUps: {
          dueToday: prev.followUps.dueToday.filter(f => f.id !== leaderId),
          overdue: prev.followUps.overdue.filter(f => f.id !== leaderId),
        },
      };
    });
    try {
      await supabase
        .from('circle_leaders')
        .update({ follow_up_required: false })
        .eq('id', leaderId);
    } catch (err) {
      console.error('Failed to clear follow-up:', err);
    }
  }, []);

  // Mark a board card as complete — removes from local state optimistically
  const markCardComplete = useCallback(async (cardId: string) => {
    setData(prev => {
      if (!prev) return prev;
      return {
        ...prev,
        cards: {
          dueToday: prev.cards.dueToday.filter(c => c.id !== cardId),
          overdue: prev.cards.overdue.filter(c => c.id !== cardId),
        },
      };
    });
    try {
      await supabase
        .from('board_cards')
        .update({ is_complete: true })
        .eq('id', cardId);
    } catch (err) {
      console.error('Failed to mark card complete:', err);
    }
  }, []);

  // Mark a checklist item as done — removes from local state optimistically
  const markChecklistDone = useCallback(async (itemId: string) => {
    setData(prev => {
      if (!prev) return prev;
      return {
        ...prev,
        checklistItems: {
          dueToday: prev.checklistItems.dueToday.filter(c => c.id !== itemId),
          overdue: prev.checklistItems.overdue.filter(c => c.id !== itemId),
        },
      };
    });
    try {
      await supabase
        .from('card_checklists')
        .update({ is_completed: true })
        .eq('id', itemId);
    } catch (err) {
      console.error('Failed to mark checklist item done:', err);
    }
  }, []);

  return {
    data,
    isLoading,
    isFetching,
    error,
    fetchData,
    markEncouragementSent,
    clearFollowUp,
    markCardComplete,
    markChecklistDone,
  };
}
