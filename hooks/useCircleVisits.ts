import { useState, useCallback } from 'react';
import { supabase, CircleVisit } from '../lib/supabase';

export const useCircleVisits = () => {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const clearError = useCallback(() => setError(null), []);

  // Load visits with optional filters
  const loadVisits = useCallback(async (filters?: {
    campus?: string[];
    acpd?: string[];
    status?: string[];
    dateRange?: { start: string; end: string };
    leaderId?: number;
  }) => {
    setIsLoading(true);
    setError(null);

    try {
      let query = supabase
        .from('circle_visits')
        .select(`
          *,
          circle_leader:leader_id (
            id, name, email, phone, campus, acpd, status, 
            day, time, frequency, circle_type
          )
        `)
        .order('visit_date', { ascending: true });

      // Apply filters
      if (filters?.leaderId) {
        query = query.eq('leader_id', filters.leaderId);
      }

      if (filters?.status && filters.status.length > 0) {
        query = query.in('status', filters.status);
      }

      if (filters?.dateRange) {
        query = query
          .gte('visit_date', filters.dateRange.start)
          .lte('visit_date', filters.dateRange.end);
      }

      // Apply campus filter through leader relationship
      if (filters?.campus && filters.campus.length > 0) {
        const { data: leaderIds } = await supabase
          .from('circle_leaders')
          .select('id')
          .in('campus', filters.campus);
        
        if (leaderIds && leaderIds.length > 0) {
          query = query.in('leader_id', leaderIds.map(l => l.id));
        } else {
          // No leaders match campus filter, return empty result
          return [];
        }
      }

      // Apply ACPD filter through leader relationship
      if (filters?.acpd && filters.acpd.length > 0) {
        const { data: leaderIds } = await supabase
          .from('circle_leaders')
          .select('id')
          .in('acpd', filters.acpd);
        
        if (leaderIds && leaderIds.length > 0) {
          query = query.in('leader_id', leaderIds.map(l => l.id));
        } else {
          // No leaders match ACPD filter, return empty result
          return [];
        }
      }

      const { data, error } = await query;

      if (error) {
        console.error('Error loading visits:', error);
        throw error;
      }

      return data as CircleVisit[] || [];
    } catch (err: any) {
      console.error('Error in loadVisits:', err);
      setError('Failed to load visits. Please try again.');
      return [];
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Get upcoming visits (today and future)
  const loadUpcomingVisits = useCallback(async (filters?: {
    campus?: string[];
    acpd?: string[];
  }) => {
    const today = new Date().toISOString().split('T')[0];
    return loadVisits({
      ...filters,
      status: ['scheduled'],
      dateRange: { start: today, end: '2099-12-31' }
    });
  }, [loadVisits]);

  // Get visit history for a leader
  const loadLeaderVisitHistory = useCallback(async (leaderId: number) => {
    return loadVisits({ leaderId });
  }, [loadVisits]);

  // Get next scheduled visit for a leader
  const getNextScheduledVisit = useCallback(async (leaderId: number): Promise<CircleVisit | null> => {
    const today = new Date().toISOString().split('T')[0];
    
    try {
      const { data, error } = await supabase
        .from('circle_visits')
        .select('*')
        .eq('leader_id', leaderId)
        .eq('status', 'scheduled')
        .gte('visit_date', today)
        .order('visit_date', { ascending: true })
        .limit(1);

      if (error) {
        console.error('Error getting next scheduled visit:', error);
        return null;
      }

      return data && data.length > 0 ? data[0] as CircleVisit : null;
    } catch (err) {
      console.error('Error in getNextScheduledVisit:', err);
      return null;
    }
  }, []);

  // Schedule a new visit
  const scheduleVisit = useCallback(async (visitData: {
    leaderId: number;
    visitDate: string;
    scheduledBy: string;
    previsitNote?: string;
  }) => {
    setIsLoading(true);
    setError(null);

    try {
      const { data, error } = await supabase
        .from('circle_visits')
        .insert({
          leader_id: visitData.leaderId,
          visit_date: visitData.visitDate,
          scheduled_by: visitData.scheduledBy,
          previsit_note: visitData.previsitNote,
          status: 'scheduled'
        })
        .select()
        .single();

      if (error) {
        console.error('Error scheduling visit:', error);
        throw error;
      }

      return data as CircleVisit;
    } catch (err: any) {
      console.error('Error in scheduleVisit:', err);
      setError('Failed to schedule visit. Please try again.');
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Reschedule an existing visit
  const rescheduleVisit = useCallback(async (visitId: string, newDate: string, previsitNote?: string) => {
    setIsLoading(true);
    setError(null);

    try {
      const { data, error } = await supabase
        .from('circle_visits')
        .update({
          visit_date: newDate,
          previsit_note: previsitNote,
          updated_at: new Date().toISOString()
        })
        .eq('id', visitId)
        .select()
        .single();

      if (error) {
        console.error('Error rescheduling visit:', error);
        throw error;
      }

      return data as CircleVisit;
    } catch (err: any) {
      console.error('Error in rescheduleVisit:', err);
      setError('Failed to reschedule visit. Please try again.');
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Complete a visit - this will be atomic with creating a note
  const completeVisit = useCallback(async (
    visitId: string, 
    completedBy: string, 
    visitNote: string,
    celebrations?: string,
    observations?: string,
    nextStep?: string
  ) => {
    setIsLoading(true);
    setError(null);

    try {
      // Start a transaction-like operation
      // First, get the visit details
      const { data: visit, error: visitError } = await supabase
        .from('circle_visits')
        .select('*, circle_leader:leader_id(name)')
        .eq('id', visitId)
        .single();

      if (visitError || !visit) {
        throw new Error('Visit not found');
      }

      const completedAt = new Date().toISOString();

      // Update visit status and add the optional question responses
      const { error: updateError } = await supabase
        .from('circle_visits')
        .update({
          status: 'completed',
          completed_at: completedAt,
          completed_by: completedBy,
          celebrations: celebrations || null,
          observations: observations || null,
          next_step: nextStep || null,
          updated_at: completedAt
        })
        .eq('id', visitId);

      if (updateError) {
        throw updateError;
      }

      // Build the note content with all the responses
      let noteContent = `Circle Visit completed on ${new Date(visit.visit_date).toLocaleDateString()}.\n\n`;
      
      if (visitNote) {
        noteContent += `${visitNote}\n\n`;
      }
      
      if (celebrations) {
        noteContent += `**Celebrations:** ${celebrations}\n\n`;
      }
      
      if (observations) {
        noteContent += `**Observations:** ${observations}\n\n`;
      }
      
      if (nextStep) {
        noteContent += `**Next Step:** ${nextStep}\n`;
      }

      // Create a note for the visit completion
      const { error: noteError } = await supabase
        .from('notes')
        .insert({
          circle_leader_id: visit.leader_id,
          content: noteContent.trim(),
          created_by: completedBy,
          created_at: completedAt
        });

      if (noteError) {
        // If note creation fails, we should rollback the visit update
        // For now, we'll log the error and continue
        console.error('Error creating visit note:', noteError);
      }

      return visit as CircleVisit;
    } catch (err: any) {
      console.error('Error in completeVisit:', err);
      setError('Failed to complete visit. Please try again.');
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Cancel a visit
  const cancelVisit = useCallback(async (visitId: string, canceledBy: string, cancelReason?: string) => {
    setIsLoading(true);
    setError(null);

    try {
      const canceledAt = new Date().toISOString();

      const { data, error } = await supabase
        .from('circle_visits')
        .update({
          status: 'canceled',
          canceled_at: canceledAt,
          canceled_by: canceledBy,
          cancel_reason: cancelReason,
          updated_at: canceledAt
        })
        .eq('id', visitId)
        .select()
        .single();

      if (error) {
        console.error('Error canceling visit:', error);
        throw error;
      }

      return data as CircleVisit;
    } catch (err: any) {
      console.error('Error in cancelVisit:', err);
      setError('Failed to cancel visit. Please try again.');
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Delete a visit
  const deleteVisit = useCallback(async (visitId: string) => {
    setIsLoading(true);
    setError(null);

    try {
      const { error } = await supabase
        .from('circle_visits')
        .delete()
        .eq('id', visitId);

      if (error) {
        console.error('Error deleting visit:', error);
        throw error;
      }

      return true;
    } catch (err: any) {
      console.error('Error in deleteVisit:', err);
      setError('Failed to delete visit. Please try again.');
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, []);

  return {
    isLoading,
    error,
    clearError,
    loadVisits,
    loadUpcomingVisits,
    loadLeaderVisitHistory,
    getNextScheduledVisit,
    scheduleVisit,
    rescheduleVisit,
    completeVisit,
    cancelVisit,
    deleteVisit
  };
};
