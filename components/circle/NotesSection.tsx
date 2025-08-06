/**
 * Notes Section Component for Circle Leader Profile
 * Handles note creation, editing, deletion, and display
 */

import React, { useState, useCallback, useMemo } from 'react';
import { Note } from '../../lib/supabase';
import { formatDateTime } from '../../lib/dateUtils';
import { validateUserInput } from '../../lib/validationUtils';
import { UI_CONSTANTS, VALIDATION_RULES } from '../../lib/circleLeaderConstants';

interface NotesSectionProps {
  notes: Note[];
  isAddingNote: boolean;
  isUpdatingNote: boolean;
  isDeletingNote: boolean;
  noteError: string;
  onAddNote: (content: string) => Promise<boolean>;
  onUpdateNote: (noteId: number, content: string) => Promise<boolean>;
  onDeleteNote: (noteId: number) => Promise<boolean>;
  onClearErrors: () => void;
}

export const NotesSection: React.FC<NotesSectionProps> = React.memo(({
  notes,
  isAddingNote,
  isUpdatingNote,
  isDeletingNote,
  noteError,
  onAddNote,
  onUpdateNote,
  onDeleteNote,
  onClearErrors
}) => {
  // Local state for note management
  const [newNote, setNewNote] = useState('');
  const [editingNoteId, setEditingNoteId] = useState<number | null>(null);
  const [editingNoteContent, setEditingNoteContent] = useState('');
  const [deletingNoteId, setDeletingNoteId] = useState<number | null>(null);

  // Validation states
  const newNoteValid = useMemo(() => {
    return validateUserInput(newNote, 'string') && 
           newNote.trim().length >= VALIDATION_RULES.NOTE_MIN_LENGTH &&
           newNote.trim().length <= VALIDATION_RULES.NOTE_MAX_LENGTH;
  }, [newNote]);

  const editingNoteValid = useMemo(() => {
    return validateUserInput(editingNoteContent, 'string') && 
           editingNoteContent.trim().length >= VALIDATION_RULES.NOTE_MIN_LENGTH &&
           editingNoteContent.trim().length <= VALIDATION_RULES.NOTE_MAX_LENGTH;
  }, [editingNoteContent]);

  // Add note handlers
  const handleAddNote = useCallback(async () => {
    if (!newNoteValid || isAddingNote) return;

    const success = await onAddNote(newNote.trim());
    if (success) {
      setNewNote('');
      onClearErrors();
    }
  }, [newNote, newNoteValid, isAddingNote, onAddNote, onClearErrors]);

  const handleNewNoteKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      handleAddNote();
    }
  }, [handleAddNote]);

  // Edit note handlers
  const handleEditNote = useCallback((note: Note) => {
    setEditingNoteId(note.id);
    setEditingNoteContent(note.content);
    onClearErrors();
  }, [onClearErrors]);

  const handleSaveEditedNote = useCallback(async () => {
    if (!editingNoteValid || !editingNoteId || isUpdatingNote) return;

    const success = await onUpdateNote(editingNoteId, editingNoteContent.trim());
    if (success) {
      setEditingNoteId(null);
      setEditingNoteContent('');
      onClearErrors();
    }
  }, [editingNoteContent, editingNoteId, editingNoteValid, isUpdatingNote, onUpdateNote, onClearErrors]);

  const handleCancelEdit = useCallback(() => {
    setEditingNoteId(null);
    setEditingNoteContent('');
    onClearErrors();
  }, [onClearErrors]);

  const handleEditNoteKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      handleSaveEditedNote();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      handleCancelEdit();
    }
  }, [handleSaveEditedNote, handleCancelEdit]);

  // Delete note handlers
  const handleDeleteNote = useCallback(async (noteId: number) => {
    if (deletingNoteId !== noteId) {
      setDeletingNoteId(noteId);
      return;
    }

    const success = await onDeleteNote(noteId);
    if (success) {
      setDeletingNoteId(null);
      onClearErrors();
    }
  }, [deletingNoteId, onDeleteNote, onClearErrors]);

  // Character count for new note
  const newNoteCharCount = useMemo(() => newNote.trim().length, [newNote]);
  const editingNoteCharCount = useMemo(() => editingNoteContent.trim().length, [editingNoteContent]);

  return (
    <div id="notes" className="mt-8 bg-white dark:bg-gray-800 rounded-lg shadow">
      <div className="px-4 sm:px-6 py-4 border-b border-gray-200 dark:border-gray-700">
        <h2 className="text-lg font-medium text-gray-900 dark:text-white">Notes</h2>
      </div>
      
      <div className="p-4 sm:p-6">
        {/* Add Note Section */}
        <div className="mb-6 sm:mb-8">
          <label htmlFor="newNote" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
            Add a note
          </label>
          <div className="space-y-4">
            <textarea
              id="newNote"
              value={newNote}
              onChange={(e) => setNewNote(e.target.value)}
              onKeyDown={handleNewNoteKeyDown}
              rows={4}
              maxLength={VALIDATION_RULES.NOTE_MAX_LENGTH}
              className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm placeholder-gray-400 dark:placeholder-gray-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 resize-y min-h-[100px] text-base"
              placeholder="Enter your note here... (Cmd/Ctrl + Enter to save)"
            />
            
            {noteError && (
              <div className="flex items-start text-sm text-red-600 dark:text-red-400 p-3 bg-red-50 dark:bg-red-900/20 rounded-md">
                <svg className="w-4 h-4 mr-2 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                </svg>
                <span>{noteError}</span>
              </div>
            )}
            
            <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3">
              <div className="text-sm text-gray-500 dark:text-gray-400">
                {newNoteCharCount > 0 && (
                  <span className={newNoteCharCount > VALIDATION_RULES.NOTE_MAX_LENGTH * 0.9 ? 'text-yellow-600 dark:text-yellow-400' : ''}>
                    {newNoteCharCount} / {VALIDATION_RULES.NOTE_MAX_LENGTH} characters
                  </span>
                )}
              </div>
              <button
                onClick={handleAddNote}
                disabled={!newNoteValid || isAddingNote}
                className="w-full sm:w-auto px-6 py-3 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {isAddingNote ? (
                  <div className="flex items-center justify-center">
                    <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    Adding...
                  </div>
                ) : 'Add Note'}
              </button>
            </div>
          </div>
        </div>

        {/* Notes List */}
        <div className="space-y-4 sm:space-y-6">
          {notes.length === 0 ? (
            <div className="text-center py-12">
              <svg className="mx-auto h-12 w-12 text-gray-400 dark:text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              <p className="mt-4 text-base text-gray-500 dark:text-gray-400">No notes yet.</p>
              <p className="mt-1 text-sm text-gray-400 dark:text-gray-500">Add your first note above to get started.</p>
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between mb-6">
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  {notes.length} {notes.length === 1 ? 'note' : 'notes'}
                </p>
              </div>
              {notes.map((note, index) => (
                <div key={note.id} className="border border-gray-200 dark:border-gray-700 rounded-lg p-4 sm:p-6 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors">
                  <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      {editingNoteId === note.id ? (
                        <div className="space-y-4">
                          <textarea
                            value={editingNoteContent}
                            onChange={(e) => setEditingNoteContent(e.target.value)}
                            onKeyDown={handleEditNoteKeyDown}
                            rows={4}
                            maxLength={VALIDATION_RULES.NOTE_MAX_LENGTH}
                            className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm placeholder-gray-400 dark:placeholder-gray-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 resize-y min-h-[80px] text-base"
                            placeholder="Edit your note... (Cmd/Ctrl + Enter to save, Esc to cancel)"
                          />
                          <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                            <div className="flex items-center space-x-3">
                              <button
                                onClick={handleSaveEditedNote}
                                disabled={!editingNoteValid || isUpdatingNote}
                                className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-md disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                              >
                                {isUpdatingNote ? 'Saving...' : 'Save'}
                              </button>
                              <button
                                onClick={handleCancelEdit}
                                disabled={isUpdatingNote}
                                className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-gray-200 dark:bg-gray-600 hover:bg-gray-300 dark:hover:bg-gray-500 rounded-md disabled:opacity-50"
                              >
                                Cancel
                              </button>
                            </div>
                            <div className="text-sm text-gray-500 dark:text-gray-400">
                              <span className={editingNoteCharCount > VALIDATION_RULES.NOTE_MAX_LENGTH * 0.9 ? 'text-yellow-600 dark:text-yellow-400' : ''}>
                                {editingNoteCharCount} / {VALIDATION_RULES.NOTE_MAX_LENGTH} characters
                              </span>
                            </div>
                          </div>
                        </div>
                      ) : (
                        <>
                          <p className="text-gray-900 dark:text-white whitespace-pre-wrap text-base leading-relaxed mb-4">{note.content}</p>
                          <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4 text-sm text-gray-500 dark:text-gray-400">
                            <div className="flex items-center">
                              <svg className="w-4 h-4 mr-2 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                                <path fillRule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clipRule="evenodd" />
                              </svg>
                              <span className="truncate">{note.users?.name || note.created_by || 'Anonymous'}</span>
                            </div>
                            <div className="flex items-center">
                              <svg className="w-4 h-4 mr-2 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                                <path fillRule="evenodd" d="M6 2a1 1 0 00-1 1v1H4a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V6a2 2 0 00-2-2h-1V3a1 1 0 10-2 0v1H7V3a1 1 0 00-1-1zm0 5a1 1 0 000 2h8a1 1 0 100-2H6z" clipRule="evenodd" />
                              </svg>
                              <span>{formatDateTime(note.created_at)}</span>
                            </div>
                          </div>
                        </>
                      )}
                    </div>
                    
                    <div className="flex items-center justify-between sm:justify-end sm:flex-col sm:items-end gap-3">
                      {/* Note number badge */}
                      <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300">
                        #{notes.length - index}
                      </span>
                      
                      {/* Action buttons */}
                      {editingNoteId !== note.id && (
                        <div className="flex items-center space-x-2">
                          <button
                            onClick={() => handleEditNote(note)}
                            disabled={editingNoteId !== null || isDeletingNote}
                            className="p-2 text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 disabled:opacity-50 disabled:cursor-not-allowed transition-colors rounded-md hover:bg-gray-100 dark:hover:bg-gray-600"
                            title="Edit note"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                            </svg>
                          </button>
                          
                          {deletingNoteId === note.id ? (
                            <div className="flex items-center space-x-1">
                              <button
                                onClick={() => handleDeleteNote(note.id)}
                                disabled={isDeletingNote}
                                className="p-2 text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300 disabled:opacity-50 disabled:cursor-not-allowed transition-colors rounded-md hover:bg-red-100 dark:hover:bg-red-900/20"
                                title="Confirm delete"
                              >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
                                </svg>
                              </button>
                              <button
                                onClick={() => setDeletingNoteId(null)}
                                disabled={isDeletingNote}
                                className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 disabled:opacity-50 disabled:cursor-not-allowed transition-colors rounded-md hover:bg-gray-100 dark:hover:bg-gray-600"
                                title="Cancel delete"
                              >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                                </svg>
                              </button>
                            </div>
                          ) : (
                            <button
                              onClick={() => handleDeleteNote(note.id)}
                              disabled={editingNoteId !== null || isDeletingNote}
                              className="p-2 text-gray-400 hover:text-red-600 dark:hover:text-red-400 disabled:opacity-50 disabled:cursor-not-allowed transition-colors rounded-md hover:bg-gray-100 dark:hover:bg-gray-600"
                              title="Delete note"
                            >
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1-1H8a1 1 0 00-1 1v3M4 7h16" />
                              </svg>
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </>
          )}
        </div>
      </div>
    </div>
  );
});

NotesSection.displayName = 'NotesSection';
