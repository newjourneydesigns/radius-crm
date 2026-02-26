'use client';

import { useState, useEffect, useCallback, forwardRef, useImperativeHandle } from 'react';
import { supabase, UserNote } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';

interface PublicNote extends UserNote {
  users?: { name: string };
}

export interface PublicNotesSectionHandle {
  reload: () => void;
}

const PublicNotesSection = forwardRef<PublicNotesSectionHandle>(function PublicNotesSection(_props, ref) {
  const { user } = useAuth();
  const [publicNotes, setPublicNotes] = useState<PublicNote[]>([]);
  const [loading, setLoading] = useState(false);
  const [visible, setVisible] = useState(() => {
    try {
      const saved = localStorage.getItem('publicNotesVisible');
      return saved !== null ? saved === 'true' : true;
    } catch {
      return true;
    }
  });

  const loadPublicNotes = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('user_notes')
        .select('*, users:user_id(name)')
        .eq('is_public', true)
        .order('pinned', { ascending: false })
        .order('created_at', { ascending: false });

      if (error) {
        // Fallback if is_public column doesn't exist yet
        if (error.code === '42703') {
          setPublicNotes([]);
          return;
        }
        console.error('Error loading public notes:', error);
        setPublicNotes([]);
        return;
      }

      setPublicNotes(data || []);
    } catch (e) {
      console.error('Error loading public notes:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadPublicNotes();
  }, [loadPublicNotes]);

  useImperativeHandle(ref, () => ({
    reload: loadPublicNotes
  }), [loadPublicNotes]);

  const toggleVisibility = () => {
    setVisible(prev => {
      const newVisible = !prev;
      try {
        localStorage.setItem('publicNotesVisible', newVisible.toString());
      } catch (error) {
        console.error('Failed to save public notes visibility to localStorage:', error);
      }
      return newVisible;
    });
  };

  // Render note content – HTML notes rendered directly; plain text notes shown as-is
  const renderNoteContent = (content: string): React.ReactNode => {
    if (!content) return null;
    const looksLikeHtml = /<[a-z][\s\S]*>/i.test(content);
    if (looksLikeHtml) {
      return (
        <div
          dangerouslySetInnerHTML={{ __html: content }}
          className="[&_a]:text-blue-600 [&_a]:dark:text-blue-400 [&_a]:underline"
        />
      );
    }
    return content;
  };

  const getAuthorName = (note: PublicNote): string => {
    if (note.user_id === user?.id) return 'You';
    if (note.users && typeof note.users === 'object' && 'name' in note.users) {
      return (note.users as { name: string }).name || 'Unknown';
    }
    return 'Unknown';
  };

  return (
    <div id="public-notes" className="mt-8">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4 sm:p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <svg className="w-5 h-5 text-green-600 dark:text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
              Public Notes
            </h2>
            <span className="text-xs bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 px-2 py-0.5 rounded-full">
              Shared
            </span>
          </div>
          <button
            onClick={toggleVisibility}
            className="text-sm px-3 py-1 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 
                     text-gray-700 dark:text-gray-300 rounded-md transition-colors"
          >
            {visible ? 'Hide' : 'Show'}
          </button>
        </div>

        {visible && (
          <div className="space-y-4">
            {loading ? (
              <div className="flex items-center justify-center py-8">
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-gray-500 mr-2"></div>
                <span className="text-sm text-gray-500 dark:text-gray-400">Loading public notes...</span>
              </div>
            ) : publicNotes.length === 0 ? (
              <div className="text-center py-6">
                <svg className="w-10 h-10 mx-auto text-gray-300 dark:text-gray-600 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
                </svg>
                <span className="text-sm text-gray-500 dark:text-gray-400">
                  No public notes yet. Share a personal note to make it visible to all Radius users!
                </span>
              </div>
            ) : (
              <div className="space-y-3">
                {publicNotes.map((note) => (
                  <div
                    key={note.id}
                    className={`p-3 rounded-md border transition-all ${
                      note.pinned
                        ? 'bg-yellow-50 dark:bg-yellow-900/20 border-yellow-200 dark:border-yellow-800 shadow-md'
                        : 'bg-gray-50 dark:bg-gray-700 border-gray-200 dark:border-gray-600'
                    }`}
                  >
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex items-center gap-2">
                        {note.pinned && (
                          <div className="flex items-center text-yellow-600 dark:text-yellow-400">
                            <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                              <path fillRule="evenodd" d="M17.707 9.293a1 1 0 010 1.414l-7 7a1 1 0 01-1.414 0l-7-7A.997.997 0 012 10V5a3 3 0 013-3h5c.256 0 .512.098.707.293l7 7zM5 6a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
                            </svg>
                          </div>
                        )}
                        <div className="flex items-center gap-2">
                          <span className="inline-flex items-center text-xs font-medium text-green-700 dark:text-green-300 bg-green-100 dark:bg-green-900/30 px-2 py-0.5 rounded-full">
                            <svg className="w-3 h-3 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                            </svg>
                            {getAuthorName(note)}
                          </span>
                          <div className="text-xs text-gray-500 dark:text-gray-400">
                            {new Date(note.updated_at || note.created_at).toLocaleDateString('en-US', {
                              month: 'short',
                              day: 'numeric',
                              year: 'numeric',
                              hour: 'numeric',
                              minute: '2-digit',
                            })}
                          </div>
                        </div>
                      </div>
                    </div>
                    <div className="text-sm text-gray-800 dark:text-gray-200 whitespace-pre-wrap break-words">
                      {renderNoteContent(note.content)}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
});

export default PublicNotesSection;
