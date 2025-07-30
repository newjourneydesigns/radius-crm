import { useState, useCallback, useRef } from 'react';
import { supabase, CircleLeader } from '../lib/supabase';

export const useCircleLeaders = () => {
  const [circleLeaders, setCircleLeaders] = useState<CircleLeader[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const loadingRef = useRef(false);

  const loadCircleLeaders = useCallback(async () => {
    if (loadingRef.current) {
      console.log('Load already in progress, skipping');
      return;
    }

    console.log('Starting to load circle leaders...');
    console.log('Supabase URL:', process.env.NEXT_PUBLIC_SUPABASE_URL);
    console.log('Supabase key exists:', !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
    
    loadingRef.current = true;
    setIsLoading(true);
    setError(null);

    try {
      // Load circle leaders
      console.log('Querying circle_leaders table...');
      const { data: leaders, error: leadersError } = await supabase
        .from('circle_leaders')
        .select('*')
        .order('name');

      console.log('Supabase response:', { leaders, leadersError });

      if (leadersError) {
        console.error('Error loading circle leaders:', leadersError);
        throw leadersError;
      }

      // Now get the latest note for each leader
      const leadersWithNotes = await Promise.all(
        (leaders || []).map(async (leader) => {
          const { data: notes, error: notesError } = await supabase
            .from('notes')
            .select('id, content, created_at, created_by')
            .eq('circle_leader_id', leader.id)
            .order('created_at', { ascending: false })
            .limit(1);

          if (notesError) {
            console.error(`Error loading notes for leader ${leader.id}:`, notesError);
          }

          return {
            ...leader,
            last_note: notes && notes.length > 0 ? notes[0] : null
          };
        })
      );

      console.log('Loaded leaders with notes count:', leadersWithNotes.length);

      // Set the leaders data
      setCircleLeaders(leadersWithNotes);
      console.log('Circle leaders set successfully');

    } catch (error: any) {
      console.error('Error loading circle leaders:', error);
      console.error('Error details:', {
        message: error.message,
        code: error.code,
        details: error.details,
        hint: error.hint,
        status: error.status
      });
      
      // Check if this is a configuration issue
      if (error.message?.includes('Invalid API key') || error.message?.includes('Project not found')) {
        setError('Database configuration error. Please check environment variables.');
      } else if (error.message?.includes('timeout')) {
        setError('Loading taking longer than expected. Please refresh if needed.');
      } else if (error.message?.includes('network') || error.message?.includes('fetch')) {
        setError('Network error. Please check your connection and try again.');
      } else if (error.message?.includes('auth') || error.code === 'PGRST301') {
        setError('Authentication error. Please log in again.');
      } else {
        setError('Error loading circle leaders. Please refresh the page.');
      }
    } finally {
      setIsLoading(false);
      loadingRef.current = false;
    }
  }, []);

  const toggleEventSummary = async (leaderId: number, isChecked: boolean) => {
    try {
      // Update in database
      const { error } = await supabase
        .from('circle_leaders')
        .update({ event_summary_received: isChecked })
        .eq('id', leaderId);

      if (error) {
        console.error('Error updating event summary:', error);
        throw error;
      }

      // Update local state
      setCircleLeaders(prev => 
        prev.map(leader => 
          leader.id === leaderId 
            ? { ...leader, event_summary_received: isChecked }
            : leader
        )
      );

    } catch (error) {
      console.error('Error in toggleEventSummary:', error);
      setError('Error updating event summary');
      throw error;
    }
  };

  const resetEventSummaryCheckboxes = async (leaderIds: number[]) => {
    try {
      // Update in database
      const { error } = await supabase
        .from('circle_leaders')
        .update({ event_summary_received: false })
        .in('id', leaderIds);

      if (error) {
        console.error('Error resetting event summaries:', error);
        throw error;
      }

      // Update local state
      setCircleLeaders(prev => 
        prev.map(leader => 
          leaderIds.includes(leader.id)
            ? { ...leader, event_summary_received: false }
            : leader
        )
      );

    } catch (error) {
      console.error('Error in resetEventSummaryCheckboxes:', error);
      setError('Error resetting event summaries');
      throw error;
    }
  };

  return {
    circleLeaders,
    isLoading,
    error,
    loadCircleLeaders,
    toggleEventSummary,
    resetEventSummaryCheckboxes
  };
};
