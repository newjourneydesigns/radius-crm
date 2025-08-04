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
    
    loadingRef.current = true;
    setIsLoading(true);
    setError(null);

    try {
      // Load circle leaders with only needed fields
      console.log('Querying circle_leaders table...');
      const { data: leaders, error: leadersError } = await supabase
        .from('circle_leaders')
        .select('id, name, email, phone, campus, acpd, status, day, time, frequency, circle_type, event_summary_received')
        .order('name');

      if (leadersError) {
        console.error('Error loading circle leaders:', leadersError);
        throw leadersError;
      }

      console.log('Loaded', leaders?.length || 0, 'circle leaders');

      // Get all notes in one query and map to leaders
      console.log('Fetching notes...');
      const { data: allNotes, error: notesError } = await supabase
        .from('notes')
        .select('id, content, created_at, created_by, circle_leader_id')
        .order('created_at', { ascending: false });

      if (notesError) {
        console.error('Error loading notes:', notesError);
      }

      // Create a map of leader_id to their latest note
      const latestNotesMap = new Map();
      if (allNotes) {
        allNotes.forEach(note => {
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

      console.log('Setting circle leaders:', leadersWithNotes.length);
      setCircleLeaders(leadersWithNotes);

    } catch (error: any) {
      console.error('Error loading circle leaders:', error);
      setError('Error loading circle leaders. Please refresh the page.');
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

  const bulkUpdateStatus = async (leaderIds: number[], newStatus: string) => {
    try {
      // Update in database
      const { error } = await supabase
        .from('circle_leaders')
        .update({ status: newStatus })
        .in('id', leaderIds);

      if (error) {
        console.error('Error updating status:', error);
        throw error;
      }

      // Update local state
      setCircleLeaders(prev => 
        prev.map(leader => 
          leaderIds.includes(leader.id)
            ? { ...leader, status: newStatus as CircleLeader['status'] }
            : leader
        )
      );

    } catch (error) {
      console.error('Error in bulkUpdateStatus:', error);
      setError('Error updating status');
      throw error;
    }
  };

  const deleteCircleLeader = async (leaderId: number) => {
    try {
      // First delete associated notes
      const { error: notesError } = await supabase
        .from('notes')
        .delete()
        .eq('circle_leader_id', leaderId);

      if (notesError) {
        console.error('Error deleting notes:', notesError);
        throw notesError;
      }

      // Then delete the circle leader
      const { error } = await supabase
        .from('circle_leaders')
        .delete()
        .eq('id', leaderId);

      if (error) {
        console.error('Error deleting circle leader:', error);
        throw error;
      }

      // Update local state
      setCircleLeaders(prev => prev.filter(leader => leader.id !== leaderId));

    } catch (error) {
      console.error('Error in deleteCircleLeader:', error);
      setError('Error deleting circle leader');
      throw error;
    }
  };

  return {
    circleLeaders,
    isLoading,
    error,
    loadCircleLeaders,
    toggleEventSummary,
    resetEventSummaryCheckboxes,
    bulkUpdateStatus,
    deleteCircleLeader
  };
};
