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

      // Add system note to leader's notes
      const noteText = notes?.trim() ? ` — "${notes.trim()}"` : '';
      await supabase
        .from('notes')
        .insert([{
          circle_leader_id: leaderId,
          content: `Developing: Added ${name.trim()} as a development prospect.${noteText}`,
          created_by: 'System',
        }]);
    }
  }, []);

  const updateProspect = useCallback(async (id: number, updates: { name?: string; notes?: string; is_active?: boolean }, leaderId?: number) => {
    const cleanUpdates: Record<string, unknown> = {};
    if (updates.name !== undefined) cleanUpdates.name = updates.name.trim();
    if (updates.notes !== undefined) cleanUpdates.notes = updates.notes.trim() || null;
    if (updates.is_active !== undefined) cleanUpdates.is_active = updates.is_active;

    // Get the current prospect for change context
    const current = prospects.find(p => p.id === id);

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

    // Add system note for name/notes edits (not for active/inactive toggles)
    if (leaderId && current && (updates.name !== undefined || updates.notes !== undefined)) {
      const parts: string[] = [];
      if (updates.name !== undefined && updates.name.trim() !== current.name) {
        parts.push(`name to "${updates.name.trim()}"`);
      }
      if (updates.notes !== undefined) {
        const newNotes = updates.notes.trim();
        if (newNotes && newNotes !== (current.notes || '')) {
          parts.push(`notes to "${newNotes}"`);
        } else if (!newNotes && current.notes) {
          parts.push('cleared notes');
        }
      }
      if (parts.length > 0) {
        const displayName = updates.name?.trim() || current.name;
        await supabase
          .from('notes')
          .insert([{
            circle_leader_id: leaderId,
            content: `Developing: Updated ${displayName} — ${parts.join(', ')}.`,
            created_by: 'System',
          }]);
      }
    }
  }, [prospects]);

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
