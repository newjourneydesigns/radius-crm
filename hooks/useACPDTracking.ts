import { useState, useCallback } from 'react';
import { supabase, PrayerPoint, Encouragement, CoachingNote, ScorecardDimension } from '../lib/supabase';

export const useACPDTracking = () => {
  const [prayerPoints, setPrayerPoints] = useState<PrayerPoint[]>([]);
  const [encouragements, setEncouragements] = useState<Encouragement[]>([]);
  const [coachingNotes, setCoachingNotes] = useState<CoachingNote[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ─── Prayer Points ─────────────────────────────────────────

  const loadPrayerPoints = useCallback(async (leaderId: number) => {
    try {
      const { data, error: fetchError } = await supabase
        .from('acpd_prayer_points')
        .select('*')
        .eq('circle_leader_id', leaderId)
        .order('created_at', { ascending: false });

      if (fetchError) throw fetchError;
      setPrayerPoints(data || []);
      return data || [];
    } catch (err: any) {
      console.error('Error loading prayer points:', err);
      setError(err.message);
      return [];
    }
  }, []);

  const addPrayerPoint = useCallback(async (leaderId: number, content: string) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const { data, error: insertError } = await supabase
        .from('acpd_prayer_points')
        .insert([{ circle_leader_id: leaderId, user_id: user.id, content, is_answered: false }])
        .select()
        .single();

      if (insertError) throw insertError;
      setPrayerPoints(prev => [data, ...prev]);
      return data;
    } catch (err: any) {
      console.error('Error adding prayer point:', err);
      setError(err.message);
      return null;
    }
  }, []);

  const togglePrayerAnswered = useCallback(async (id: number) => {
    try {
      const current = prayerPoints.find(p => p.id === id);
      if (!current) return;

      const { error: updateError } = await supabase
        .from('acpd_prayer_points')
        .update({ is_answered: !current.is_answered, updated_at: new Date().toISOString() })
        .eq('id', id);

      if (updateError) throw updateError;
      setPrayerPoints(prev =>
        prev.map(p => p.id === id ? { ...p, is_answered: !p.is_answered } : p)
      );
    } catch (err: any) {
      console.error('Error toggling prayer:', err);
      setError(err.message);
    }
  }, [prayerPoints]);

  const deletePrayerPoint = useCallback(async (id: number) => {
    try {
      const { error: deleteError } = await supabase
        .from('acpd_prayer_points')
        .delete()
        .eq('id', id);

      if (deleteError) throw deleteError;
      setPrayerPoints(prev => prev.filter(p => p.id !== id));
    } catch (err: any) {
      console.error('Error deleting prayer point:', err);
      setError(err.message);
    }
  }, []);

  // ─── Encouragements ────────────────────────────────────────

  const loadEncouragements = useCallback(async (leaderId: number) => {
    try {
      const { data, error: fetchError } = await supabase
        .from('acpd_encouragements')
        .select('*')
        .eq('circle_leader_id', leaderId)
        .order('message_date', { ascending: false });

      if (fetchError) throw fetchError;
      setEncouragements(data || []);
      return data || [];
    } catch (err: any) {
      console.error('Error loading encouragements:', err);
      setError(err.message);
      return [];
    }
  }, []);

  const addEncouragement = useCallback(async (
    leaderId: number,
    messageType: 'sent' | 'planned',
    note?: string,
    messageDate?: string
  ) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const { data, error: insertError } = await supabase
        .from('acpd_encouragements')
        .insert([{
          circle_leader_id: leaderId,
          user_id: user.id,
          message_type: messageType,
          message_date: messageDate || new Date().toISOString().split('T')[0],
          note: note || null,
        }])
        .select()
        .single();

      if (insertError) throw insertError;
      setEncouragements(prev => [data, ...prev]);
      return data;
    } catch (err: any) {
      console.error('Error adding encouragement:', err);
      setError(err.message);
      return null;
    }
  }, []);

  const markEncouragementSent = useCallback(async (id: number, leaderId: number) => {
    try {
      // Update the planned message to sent
      const { error: updateError } = await supabase
        .from('acpd_encouragements')
        .update({ message_type: 'sent', message_date: new Date().toISOString().split('T')[0] })
        .eq('id', id);

      if (updateError) throw updateError;
      await loadEncouragements(leaderId);
    } catch (err: any) {
      console.error('Error marking sent:', err);
      setError(err.message);
    }
  }, [loadEncouragements]);

  const deleteEncouragement = useCallback(async (id: number) => {
    try {
      const { error: deleteError } = await supabase
        .from('acpd_encouragements')
        .delete()
        .eq('id', id);

      if (deleteError) throw deleteError;
      setEncouragements(prev => prev.filter(e => e.id !== id));
    } catch (err: any) {
      console.error('Error deleting encouragement:', err);
      setError(err.message);
    }
  }, []);

  // ─── Coaching Notes ────────────────────────────────────────

  const loadCoachingNotes = useCallback(async (leaderId: number) => {
    try {
      const { data, error: fetchError } = await supabase
        .from('acpd_coaching_notes')
        .select('*')
        .eq('circle_leader_id', leaderId)
        .order('created_at', { ascending: false });

      if (fetchError) throw fetchError;
      setCoachingNotes(data || []);
      return data || [];
    } catch (err: any) {
      console.error('Error loading coaching notes:', err);
      setError(err.message);
      return [];
    }
  }, []);

  const addCoachingNote = useCallback(async (
    leaderId: number,
    dimension: ScorecardDimension,
    content: string
  ) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const { data, error: insertError } = await supabase
        .from('acpd_coaching_notes')
        .insert([{
          circle_leader_id: leaderId,
          user_id: user.id,
          dimension,
          content,
          is_resolved: false,
        }])
        .select()
        .single();

      if (insertError) throw insertError;
      setCoachingNotes(prev => [data, ...prev]);
      return data;
    } catch (err: any) {
      console.error('Error adding coaching note:', err);
      setError(err.message);
      return null;
    }
  }, []);

  const toggleCoachingResolved = useCallback(async (id: number) => {
    try {
      const current = coachingNotes.find(n => n.id === id);
      if (!current) return;

      const { error: updateError } = await supabase
        .from('acpd_coaching_notes')
        .update({ is_resolved: !current.is_resolved })
        .eq('id', id);

      if (updateError) throw updateError;
      setCoachingNotes(prev =>
        prev.map(n => n.id === id ? { ...n, is_resolved: !n.is_resolved } : n)
      );
    } catch (err: any) {
      console.error('Error toggling coaching note:', err);
      setError(err.message);
    }
  }, [coachingNotes]);

  const deleteCoachingNote = useCallback(async (id: number) => {
    try {
      const { error: deleteError } = await supabase
        .from('acpd_coaching_notes')
        .delete()
        .eq('id', id);

      if (deleteError) throw deleteError;
      setCoachingNotes(prev => prev.filter(n => n.id !== id));
    } catch (err: any) {
      console.error('Error deleting coaching note:', err);
      setError(err.message);
    }
  }, []);

  // ─── Load All ──────────────────────────────────────────────

  const loadAll = useCallback(async (leaderId: number) => {
    setIsLoading(true);
    setError(null);
    try {
      await Promise.all([
        loadPrayerPoints(leaderId),
        loadEncouragements(leaderId),
        loadCoachingNotes(leaderId),
      ]);
    } finally {
      setIsLoading(false);
    }
  }, [loadPrayerPoints, loadEncouragements, loadCoachingNotes]);

  return {
    prayerPoints,
    encouragements,
    coachingNotes,
    isLoading,
    error,
    loadAll,
    loadPrayerPoints,
    addPrayerPoint,
    togglePrayerAnswered,
    deletePrayerPoint,
    loadEncouragements,
    addEncouragement,
    markEncouragementSent,
    deleteEncouragement,
    loadCoachingNotes,
    addCoachingNote,
    toggleCoachingResolved,
    deleteCoachingNote,
  };
};
