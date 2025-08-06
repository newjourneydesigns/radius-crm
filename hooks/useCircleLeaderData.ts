/**
 * Custom hook for managing circle leader data and operations
 * Centralizes data fetching, state management, and CRUD operations
 */

import { useState, useEffect, useCallback } from 'react';
import { supabase, CircleLeader, Note } from '../lib/supabase';
import { validateUserInput } from '../lib/validationUtils';

interface UseCircleLeaderDataProps {
  leaderId: number;
}

interface UseCircleLeaderDataReturn {
  // Data state
  leader: CircleLeader | null;
  notes: Note[];
  directors: Array<{id: number, name: string}>;
  campuses: Array<{id: number, value: string}>;
  statuses: Array<{id: number, value: string}>;
  circleTypes: Array<{id: number, value: string}>;
  frequencies: Array<{id: number, value: string}>;
  
  // Loading states
  isLoading: boolean;
  isSavingLeader: boolean;
  isSavingNote: boolean;
  isUpdatingNote: boolean;
  isDeletingNote: boolean;
  isUpdatingEventSummary: boolean;
  isUpdatingFollowUp: boolean;
  isDeletingLeader: boolean;
  
  // Error states
  leaderError: string;
  noteError: string;
  
  // Operations
  saveLeader: (updatedLeader: Partial<CircleLeader>) => Promise<boolean>;
  addNote: (content: string) => Promise<boolean>;
  updateNote: (noteId: number, content: string) => Promise<boolean>;
  deleteNote: (noteId: number) => Promise<boolean>;
  toggleEventSummary: () => Promise<boolean>;
  toggleFollowUp: () => Promise<boolean>;
  updateFollowUpDate: (date: string | null) => Promise<boolean>;
  deleteLeader: () => Promise<boolean>;
  reloadNotes: () => Promise<void>;
  clearErrors: () => void;
}

export const useCircleLeaderData = ({ 
  leaderId 
}: UseCircleLeaderDataProps): UseCircleLeaderDataReturn => {
  // Data state
  const [leader, setLeader] = useState<CircleLeader | null>(null);
  const [notes, setNotes] = useState<Note[]>([]);
  const [directors, setDirectors] = useState<Array<{id: number, name: string}>>([]);
  const [campuses, setCampuses] = useState<Array<{id: number, value: string}>>([]);
  const [statuses, setStatuses] = useState<Array<{id: number, value: string}>>([]);
  const [circleTypes, setCircleTypes] = useState<Array<{id: number, value: string}>>([]);
  const [frequencies, setFrequencies] = useState<Array<{id: number, value: string}>>([]);
  
  // Loading states
  const [isLoading, setIsLoading] = useState(true);
  const [isSavingLeader, setIsSavingLeader] = useState(false);
  const [isSavingNote, setIsSavingNote] = useState(false);
  const [isUpdatingNote, setIsUpdatingNote] = useState(false);
  const [isDeletingNote, setIsDeletingNote] = useState(false);
  const [isUpdatingEventSummary, setIsUpdatingEventSummary] = useState(false);
  const [isUpdatingFollowUp, setIsUpdatingFollowUp] = useState(false);
  const [isDeletingLeader, setIsDeletingLeader] = useState(false);
  
  // Error states
  const [leaderError, setLeaderError] = useState('');
  const [noteError, setNoteError] = useState('');

  // Load initial data
  useEffect(() => {
    const loadData = async () => {
      try {
        // Load leader data
        const { data: leaderData, error: leaderError } = await supabase
          .from('circle_leaders')
          .select('*')
          .eq('id', leaderId)
          .single();

        if (leaderData && !leaderError) {
          setLeader(leaderData);
        } else {
          // Fallback to mock data if not found
          setLeader({
            id: leaderId,
            name: 'John Smith',
            email: 'john.smith@email.com',
            phone: '(555) 123-4567',
            campus: 'Downtown',
            acpd: 'Jane Doe',
            status: 'active',
            day: 'Tuesday',
            time: '19:00',
            frequency: 'Weekly',
            circle_type: "Men's",
            event_summary_received: true
          });
        }

        // Load reference data in parallel
        const [directorsResult, campusesResult, statusesResult, circleTypesResult, frequenciesResult] = await Promise.all([
          supabase.from('acpd_list').select('id, name').eq('active', true).order('name'),
          supabase.from('campuses').select('*').order('value'),
          supabase.from('statuses').select('*').order('value'),
          supabase.from('circle_types').select('*').order('value'),
          supabase.from('frequencies').select('*').order('value')
        ]);

        if (directorsResult.data) setDirectors(directorsResult.data);
        if (campusesResult.data) setCampuses(campusesResult.data);
        if (statusesResult.data) setStatuses(statusesResult.data);
        if (circleTypesResult.data) setCircleTypes(circleTypesResult.data);
        if (frequenciesResult.data) setFrequencies(frequenciesResult.data);

        // Load notes
        await loadNotes();
        
      } catch (error) {
        console.error('Error loading data:', error);
        setLeaderError('Failed to load leader data');
      } finally {
        setIsLoading(false);
      }
    };

    loadData();
  }, [leaderId]);

  // Load notes function
  const loadNotes = useCallback(async () => {
    try {
      const { data: notesData, error: notesError } = await supabase
        .from('notes')
        .select(`
          *,
          users (name)
        `)
        .eq('circle_leader_id', leaderId)
        .order('created_at', { ascending: false });

      if (notesData && !notesError) {
        setNotes(notesData);
      } else {
        console.error('Error loading notes:', notesError);
      }
    } catch (error) {
      console.error('Error loading notes:', error);
    }
  }, [leaderId]);

  // Reload notes (public interface)
  const reloadNotes = useCallback(() => loadNotes(), [loadNotes]);

  // Save leader function
  const saveLeader = useCallback(async (updatedLeader: Partial<CircleLeader>): Promise<boolean> => {
    if (!leader || !validateUserInput(updatedLeader.name, 'string')) {
      setLeaderError('Name is required');
      return false;
    }

    setIsSavingLeader(true);
    setLeaderError('');

    try {
      const { data, error } = await supabase
        .from('circle_leaders')
        .update({
          name: updatedLeader.name,
          email: updatedLeader.email || null,
          phone: updatedLeader.phone || null,
          campus: updatedLeader.campus || null,
          acpd: updatedLeader.acpd || null,
          status: updatedLeader.status || 'active',
          day: updatedLeader.day || null,
          time: updatedLeader.time || null,
          frequency: updatedLeader.frequency || null,
          circle_type: updatedLeader.circle_type || null,
          follow_up_required: updatedLeader.follow_up_required || false,
          follow_up_date: updatedLeader.follow_up_date || null
        })
        .eq('id', leaderId)
        .select()
        .single();

      if (data && !error) {
        setLeader(data);
        
        // Add system note
        await supabase
          .from('notes')
          .insert([{
            circle_leader_id: leaderId,
            content: 'Circle Leader information updated.',
            created_by: 'System'
          }]);

        await loadNotes();
        return true;
      } else {
        console.error('Error updating leader:', error);
        setLeaderError('Failed to update leader information. Please try again.');
        return false;
      }
    } catch (error) {
      console.error('Error updating leader:', error);
      setLeaderError('Failed to update leader information. Please try again.');
      return false;
    } finally {
      setIsSavingLeader(false);
    }
  }, [leader, leaderId, loadNotes]);

  // Add note function
  const addNote = useCallback(async (content: string): Promise<boolean> => {
    if (!validateUserInput(content, 'string')) {
      setNoteError('Note content is required');
      return false;
    }

    setIsSavingNote(true);
    setNoteError('');
    
    try {
      const { data, error } = await supabase
        .from('notes')
        .insert([{
          circle_leader_id: leaderId,
          content: content.trim()
        }])
        .select('*')
        .single();

      if (data && !error) {
        await loadNotes();
        return true;
      } else {
        console.error('Error saving note:', error);
        setNoteError(`Failed to save note: ${error?.message || 'Unknown error'}`);
        return false;
      }
    } catch (error) {
      console.error('Exception saving note:', error);
      setNoteError('Failed to save note. Please try again.');
      return false;
    } finally {
      setIsSavingNote(false);
    }
  }, [leaderId, loadNotes]);

  // Update note function
  const updateNote = useCallback(async (noteId: number, content: string): Promise<boolean> => {
    if (!validateUserInput(content, 'string') || !validateUserInput(noteId, 'number')) {
      setNoteError('Invalid note data');
      return false;
    }

    setIsUpdatingNote(true);
    try {
      const { data, error } = await supabase
        .from('notes')
        .update({ content: content.trim() })
        .eq('id', noteId)
        .select()
        .single();

      if (data && !error) {
        setNotes(prev => prev.map(note => 
          note.id === noteId 
            ? { ...note, content: content.trim() }
            : note
        ));
        return true;
      } else {
        console.error('Error updating note:', error);
        setNoteError('Failed to update note. Please try again.');
        return false;
      }
    } catch (error) {
      console.error('Error updating note:', error);
      setNoteError('Failed to update note. Please try again.');
      return false;
    } finally {
      setIsUpdatingNote(false);
    }
  }, []);

  // Delete note function
  const deleteNote = useCallback(async (noteId: number): Promise<boolean> => {
    if (!validateUserInput(noteId, 'number')) {
      setNoteError('Invalid note ID');
      return false;
    }

    setIsDeletingNote(true);
    try {
      const { error } = await supabase
        .from('notes')
        .delete()
        .eq('id', noteId);

      if (!error) {
        setNotes(prev => prev.filter(note => note.id !== noteId));
        return true;
      } else {
        console.error('Error deleting note:', error);
        setNoteError('Failed to delete note. Please try again.');
        return false;
      }
    } catch (error) {
      console.error('Error deleting note:', error);
      setNoteError('Failed to delete note. Please try again.');
      return false;
    } finally {
      setIsDeletingNote(false);
    }
  }, []);

  // Toggle event summary function
  const toggleEventSummary = useCallback(async (): Promise<boolean> => {
    if (!leader) return false;

    setIsUpdatingEventSummary(true);
    const newStatus = !leader.event_summary_received;

    try {
      const { error } = await supabase
        .from('circle_leaders')
        .update({ event_summary_received: newStatus })
        .eq('id', leaderId);

      if (!error) {
        setLeader(prev => prev ? { ...prev, event_summary_received: newStatus } : null);
        
        // Add system note
        const statusText = newStatus ? 'marked as received' : 'marked as not received';
        await supabase
          .from('notes')
          .insert([{
            circle_leader_id: leaderId,
            content: `Event summary status ${statusText}.`,
            created_by: 'System'
          }]);

        await loadNotes();
        return true;
      } else {
        console.error('Error updating event summary status:', error);
        return false;
      }
    } catch (error) {
      console.error('Error updating event summary status:', error);
      return false;
    } finally {
      setIsUpdatingEventSummary(false);
    }
  }, [leader, leaderId, loadNotes]);

  // Toggle follow up function
  const toggleFollowUp = useCallback(async (): Promise<boolean> => {
    if (!leader) return false;

    setIsUpdatingFollowUp(true);
    const newStatus = !leader.follow_up_required;

    try {
      const updateData: any = { follow_up_required: newStatus };
      
      // If disabling follow-up, also clear the date
      if (!newStatus) {
        updateData.follow_up_date = null;
      }

      const { error } = await supabase
        .from('circle_leaders')
        .update(updateData)
        .eq('id', leaderId);

      if (!error) {
        setLeader(prev => prev ? { 
          ...prev, 
          follow_up_required: newStatus,
          follow_up_date: newStatus ? prev.follow_up_date : undefined
        } : null);
        
        // Add system note
        const statusText = newStatus ? 'enabled' : 'disabled';
        await supabase
          .from('notes')
          .insert([{
            circle_leader_id: leaderId,
            content: `Follow-up status ${statusText}.`,
            created_by: 'System'
          }]);

        await loadNotes();
        return true;
      } else {
        console.error('Error updating follow-up status:', error);
        return false;
      }
    } catch (error) {
      console.error('Error updating follow-up status:', error);
      return false;
    } finally {
      setIsUpdatingFollowUp(false);
    }
  }, [leader, leaderId, loadNotes]);

  // Update follow up date function
  const updateFollowUpDate = useCallback(async (newDate: string | null): Promise<boolean> => {
    if (!leader) return false;

    try {
      const { error } = await supabase
        .from('circle_leaders')
        .update({ follow_up_date: newDate || null })
        .eq('id', leaderId);

      if (!error) {
        setLeader(prev => prev ? { ...prev, follow_up_date: newDate || undefined } : null);
        
        // Add system note
        const dateText = newDate ? `set to ${newDate}` : 'cleared';
        await supabase
          .from('notes')
          .insert([{
            circle_leader_id: leaderId,
            content: `Follow-up date ${dateText}.`,
            created_by: 'System'
          }]);

        await loadNotes();
        return true;
      } else {
        console.error('Error updating follow-up date:', error);
        return false;
      }
    } catch (error) {
      console.error('Error updating follow-up date:', error);
      return false;
    }
  }, [leader, leaderId, loadNotes]);

  // Delete leader function
  const deleteLeader = useCallback(async (): Promise<boolean> => {
    if (!leader) return false;

    setIsDeletingLeader(true);
    try {
      // First delete all notes associated with the leader
      const { error: notesError } = await supabase
        .from('notes')
        .delete()
        .eq('circle_leader_id', leaderId);

      if (notesError) {
        throw new Error('Failed to delete associated notes');
      }

      // Then delete the leader
      const { error: leaderError } = await supabase
        .from('circle_leaders')
        .delete()
        .eq('id', leaderId);

      if (leaderError) {
        throw new Error('Failed to delete circle leader');
      }

      return true;
    } catch (error) {
      console.error('Error deleting leader:', error);
      return false;
    } finally {
      setIsDeletingLeader(false);
    }
  }, [leader, leaderId]);

  // Clear errors function
  const clearErrors = useCallback(() => {
    setLeaderError('');
    setNoteError('');
  }, []);

  return {
    // Data state
    leader,
    notes,
    directors,
    campuses,
    statuses,
    circleTypes,
    frequencies,
    
    // Loading states
    isLoading,
    isSavingLeader,
    isSavingNote,
    isUpdatingNote,
    isDeletingNote,
    isUpdatingEventSummary,
    isUpdatingFollowUp,
    isDeletingLeader,
    
    // Error states
    leaderError,
    noteError,
    
    // Operations
    saveLeader,
    addNote,
    updateNote,
    deleteNote,
    toggleEventSummary,
    toggleFollowUp,
    updateFollowUpDate,
    deleteLeader,
    reloadNotes,
    clearErrors
  };
};
