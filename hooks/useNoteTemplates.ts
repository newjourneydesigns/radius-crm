import { useState, useCallback, useEffect } from 'react';
import { supabase, NoteTemplate } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';

export const useNoteTemplates = () => {
  const [templates, setTemplates] = useState<NoteTemplate[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { user } = useAuth();

  // Load all templates for the current user
  const loadTemplates = useCallback(async () => {
    if (!user) return;

    setIsLoading(true);
    setError(null);

    try {
      const { data, error } = await supabase
        .from('note_templates')
        .select('*')
        .eq('user_id', user.id)
        .order('name', { ascending: true });

      if (error) {
        throw error;
      }

      setTemplates(data || []);
    } catch (err: any) {
      console.error('Error loading note templates:', err);
      setError(err.message || 'Failed to load templates');
    } finally {
      setIsLoading(false);
    }
  }, [user]);

  // Save a new template
  const saveTemplate = useCallback(async (name: string, content: string) => {
    if (!user) {
      throw new Error('User not authenticated');
    }

    try {
      const { data, error } = await supabase
        .from('note_templates')
        .insert([
          {
            user_id: user.id,
            name: name.trim(),
            content: content.trim(),
          }
        ])
        .select()
        .single();

      if (error) {
        throw error;
      }

      setTemplates(prev => [...prev, data].sort((a, b) => a.name.localeCompare(b.name)));
      return data;
    } catch (err: any) {
      console.error('Error saving note template:', err);
      throw new Error(err.message || 'Failed to save template');
    }
  }, [user]);

  // Update an existing template
  const updateTemplate = useCallback(async (id: number, name: string, content: string) => {
    if (!user) {
      throw new Error('User not authenticated');
    }

    try {
      const { data, error } = await supabase
        .from('note_templates')
        .update({
          name: name.trim(),
          content: content.trim(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', id)
        .eq('user_id', user.id)
        .select()
        .single();

      if (error) {
        throw error;
      }

      setTemplates(prev => 
        prev.map(template => 
          template.id === id ? data : template
        ).sort((a, b) => a.name.localeCompare(b.name))
      );
      
      return data;
    } catch (err: any) {
      console.error('Error updating note template:', err);
      throw new Error(err.message || 'Failed to update template');
    }
  }, [user]);

  // Delete a template
  const deleteTemplate = useCallback(async (id: number) => {
    if (!user) {
      throw new Error('User not authenticated');
    }

    try {
      const { error } = await supabase
        .from('note_templates')
        .delete()
        .eq('id', id)
        .eq('user_id', user.id);

      if (error) {
        throw error;
      }

      setTemplates(prev => prev.filter(template => template.id !== id));
    } catch (err: any) {
      console.error('Error deleting note template:', err);
      throw new Error(err.message || 'Failed to delete template');
    }
  }, [user]);

  // Load templates when user changes
  useEffect(() => {
    if (user) {
      loadTemplates();
    } else {
      setTemplates([]);
    }
  }, [user, loadTemplates]);

  return {
    templates,
    isLoading,
    error,
    loadTemplates,
    saveTemplate,
    updateTemplate,
    deleteTemplate,
  };
};
