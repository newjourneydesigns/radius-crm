'use client';

import { useState, useCallback } from 'react';
import { supabase, type DevelopmentProspect } from '../lib/supabase';

export function useDevelopmentProspects() {
  const [prospects, setProspects] = useState<DevelopmentProspect[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadProspects = useCallback(async (leaderId: number) => {
    const { data, error: fetchError } = await supabase
      .from('development_prospects')
      .select('*')
      .eq('circle_leader_id', leaderId)
      .order('created_at', { ascending: false });

    if (fetchError) {
      console.error('Error loading development prospects:', fetchError);
      setError(fetchError.message);
      return;
    }
    setProspects(data || []);
  }, []);

  const loadAll = useCallback(async (leaderId: number) => {
    setIsLoading(true);
    setError(null);
    try {
      await loadProspects(leaderId);
    } finally {
      setIsLoading(false);
    }
  }, [loadProspects]);

  const addProspect = useCallback(async (leaderId: number, name: string, notes?: string) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data, error: insertError } = await supabase
      .from('development_prospects')
      .insert([{
        circle_leader_id: leaderId,
        user_id: user.id,
        name: name.trim(),
        notes: notes?.trim() || null,
        is_active: true,
      }])
      .select()
      .single();

    if (insertError) {
      console.error('Error adding development prospect:', insertError);
      setError(insertError.message);
      return;
    }
    if (data) {
      setProspects(prev => [data, ...prev]);
    }
  }, []);

  const updateProspect = useCallback(async (id: number, updates: { name?: string; notes?: string; is_active?: boolean }) => {
    const cleanUpdates: Record<string, unknown> = {};
    if (updates.name !== undefined) cleanUpdates.name = updates.name.trim();
    if (updates.notes !== undefined) cleanUpdates.notes = updates.notes.trim() || null;
    if (updates.is_active !== undefined) cleanUpdates.is_active = updates.is_active;

    const { error: updateError } = await supabase
      .from('development_prospects')
      .update(cleanUpdates)
      .eq('id', id);

    if (updateError) {
      console.error('Error updating development prospect:', updateError);
      setError(updateError.message);
      return;
    }

    setProspects(prev => prev.map(p => p.id === id ? { ...p, ...cleanUpdates } as DevelopmentProspect : p));
  }, []);

  const toggleActive = useCallback(async (id: number) => {
    const prospect = prospects.find(p => p.id === id);
    if (!prospect) return;

    await updateProspect(id, { is_active: !prospect.is_active });
  }, [prospects, updateProspect]);

  const deleteProspect = useCallback(async (id: number) => {
    const { error: deleteError } = await supabase
      .from('development_prospects')
      .delete()
      .eq('id', id);

    if (deleteError) {
      console.error('Error deleting development prospect:', deleteError);
      setError(deleteError.message);
      return;
    }
    setProspects(prev => prev.filter(p => p.id !== id));
  }, []);

  return {
    prospects,
    isLoading,
    error,
    loadAll,
    addProspect,
    updateProspect,
    toggleActive,
    deleteProspect,
  };
}
