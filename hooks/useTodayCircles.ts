import { useState, useCallback, useEffect } from 'react';
import { supabase, CircleLeader } from '../lib/supabase';

export const useTodayCircles = (campusFilters: string[] = []) => {
  const [todayCircles, setTodayCircles] = useState<CircleLeader[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadTodayCircles = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      // Get today's day name
      const today = new Date();
      const daysOfWeek = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
      const todayName = daysOfWeek[today.getDay()];

      // Build query for circle leaders that meet today
      let query = supabase
        .from('circle_leaders')
        .select('id, name, email, phone, campus, acpd, status, day, time, frequency, circle_type, event_summary_received, follow_up_required, follow_up_date, ccb_profile_link')
        .eq('day', todayName);

      // Apply campus filter if provided
      if (campusFilters.length > 0) {
        query = query.in('campus', campusFilters);
      }

      const { data: leaders, error: leadersError } = await query.order('time', { ascending: true });

      if (leadersError) {
        console.error('Error loading today\'s circles:', leadersError);
        throw leadersError;
      }

      console.log('Loaded', leaders?.length || 0, 'circles for today');

      // Load notes only for today's leaders
      let allNotes: any[] = [];
      if (leaders && leaders.length > 0) {
        const leaderIds = leaders.map(leader => leader.id);
        const { data: notesData, error: notesError } = await supabase
          .from('notes')
          .select('*')
          .in('circle_leader_id', leaderIds)
          .order('created_at', { ascending: false });

        if (notesError) {
          console.error('Error loading notes for today\'s circles:', notesError);
        } else {
          allNotes = notesData || [];
        }
      }

      // Create a map of leader_id to their latest note
      const latestNotesMap = new Map();
      if (allNotes && allNotes.length > 0) {
        allNotes.forEach((note: any) => {
          if (!latestNotesMap.has(note.circle_leader_id)) {
            latestNotesMap.set(note.circle_leader_id, note);
          }
        });
      }

      // Combine leaders with their latest notes
      const leadersWithNotes = (leaders || []).map(leader => ({
        ...leader,
        last_note: latestNotesMap.get(leader.id) || null
      }));

      setTodayCircles(leadersWithNotes);

    } catch (error: any) {
      console.error('Error loading today\'s circles:', error);
      setError('Error loading today\'s circles.');
    } finally {
      setIsLoading(false);
    }
  }, [campusFilters]); // Re-run when campus filters change

  // Load today's circles when hook is first used
  useEffect(() => {
    loadTodayCircles();
  }, [loadTodayCircles]);

  return {
    todayCircles,
    isLoading,
    error,
    refreshTodayCircles: loadTodayCircles
  };
};
