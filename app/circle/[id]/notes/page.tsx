'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { supabase, type Note, type NoteTemplate } from '../../../../lib/supabase';
import { useNoteTemplates } from '../../../../hooks/useNoteTemplates';
import { useAuth } from '../../../../contexts/AuthContext';
import { useScorecard } from '../../../../hooks/useScorecard';
import AlertModal from '../../../../components/ui/AlertModal';
import NoteTemplateModal from '../../../../components/dashboard/NoteTemplateModal';
import DictateAndSummarize from '../../../../components/notes/DictateAndSummarize';
import MeetingPrepAssistant from '../../../../components/notes/MeetingPrepAssistant';
import RichTextEditor from '../../../../components/notes/RichTextEditor';
import ProtectedRoute from '../../../../components/ProtectedRoute';

const stripHtml = (html: string): string =>
  html.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').trim();

const isHtmlContent = (content: string): boolean =>
  Boolean(content) && /<[a-z][\s\S]*?>/i.test(content);

const linkifyText = (text: string): (string | JSX.Element)[] => {
  if (!text) return [text];
  const pattern = /\[([^\]]+)\]\((https?:\/\/[^)]+|mailto:[^)]+)\)|https?:\/\/[^\s<>"']+[^\s<>"'.,;:!?)'"]/g;
  const elements: (string | JSX.Element)[] = [];
  let lastIndex = 0;
  let match;
  let i = 0;
  while ((match = pattern.exec(text)) !== null) {
    if (match.index > lastIndex) elements.push(text.slice(lastIndex, match.index));
    if (match[1] !== undefined) {
      elements.push(
        <a key={i++} href={match[2]} target="_blank" rel="noopener noreferrer"
          className="text-blue-400 hover:text-blue-300 underline font-medium">
          {match[1]}
        </a>
      );
    } else {
      elements.push(
        <a key={i++} href={match[0]} target="_blank" rel="noopener noreferrer"
          className="text-blue-400 hover:text-blue-300 underline break-all">
          {match[0]}
        </a>
      );
    }
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < text.length) elements.push(text.slice(lastIndex));
  return elements.length > 0 ? elements : [text];
};

const formatDateTime = (dateString: string): string => {
  const date = new Date(dateString);
  return date.toLocaleDateString('en-US', {
    year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
  });
};

export default function CircleLeaderNotesPage() {
  const params = useParams();
  const leaderId = params?.id ? parseInt(params.id as string) : 0;
  const { user, isAdmin } = useAuth();
  const { saveTemplate } = useNoteTemplates();
  const { ratings: scorecardRatings, loadRatings: loadScorecardRatings } = useScorecard();

  const latestBig4Scores = useMemo(() => {
    if (!scorecardRatings || scorecardRatings.length === 0) return null;
    const latest = scorecardRatings[0];
    const scores = [latest.reach_score, latest.connect_score, latest.disciple_score, latest.develop_score].filter(Boolean);
    return {
      reach: latest.reach_score || null,
      connect: latest.connect_score || null,
      disciple: latest.disciple_score || null,
      develop: latest.develop_score || null,
      average: scores.length > 0 ? scores.reduce((a: number, b: number) => a + b, 0) / scores.length : null,
      scoredDate: latest.scored_date || null,
    };
  }, [scorecardRatings]);

  const [leader, setLeader] = useState<{ name: string; status: string; campus: string | null; circle_type: string | null; day: string | null; time: string | null; frequency: string | null } | null>(null);
  const [notes, setNotes] = useState<Note[]>([]);
  const [newNote, setNewNote] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSavingNote, setIsSavingNote] = useState(false);
  const [noteError, setNoteError] = useState('');
  const [editingNoteId, setEditingNoteId] = useState<number | null>(null);
  const [editingNoteContent, setEditingNoteContent] = useState('');
  const [isUpdatingNote, setIsUpdatingNote] = useState(false);
  const [deletingNoteId, setDeletingNoteId] = useState<number | null>(null);
  const [isDeletingNote, setIsDeletingNote] = useState(false);
  const [isTemplateModalOpen, setIsTemplateModalOpen] = useState(false);
  const [isSavingAsTemplate, setIsSavingAsTemplate] = useState<number | null>(null);
  const [noteSearchQuery, setNoteSearchQuery] = useState('');
  const [showAlert, setShowAlert] = useState<{
    isOpen: boolean;
    type: 'success' | 'error' | 'warning' | 'info';
    title: string;
    message: string;
  }>({ isOpen: false, type: 'info', title: '', message: '' });

  useEffect(() => {
    const load = async () => {
      try {
        const [leaderResult, notesResult] = await Promise.all([
          supabase.from('circle_leaders').select('name, status, campus, circle_type, day, time, frequency').eq('id', leaderId).single(),
          supabase.from('notes').select(`*, users!notes_created_by_fkey (name)`).eq('circle_leader_id', leaderId).order('created_at', { ascending: false }),
        ]);
        if (leaderResult.data) setLeader(leaderResult.data);
        if (notesResult.data && !notesResult.error) {
          setNotes(notesResult.data);
        } else if (notesResult.error) {
          const { data: fallback } = await supabase.from('notes').select('*').eq('circle_leader_id', leaderId).order('created_at', { ascending: false });
          if (fallback) setNotes(fallback);
        }
      } catch (err) {
        console.error('Error loading notes page:', err);
      } finally {
        setIsLoading(false);
      }
    };
    load();
    loadScorecardRatings(leaderId);
  }, [leaderId]);

  const reloadNotes = useCallback(async () => {
    const { data } = await supabase
      .from('notes')
      .select(`*, users!notes_created_by_fkey (name)`)
      .eq('circle_leader_id', leaderId)
      .order('created_at', { ascending: false });
    if (data) setNotes(data);
  }, [leaderId]);

  const handleAddNote = async () => {
    if (!stripHtml(newNote).trim() || !user?.id) return;
    setIsSavingNote(true);
    setNoteError('');
    try {
      const { data, error } = await supabase
        .from('notes')
        .insert({ circle_leader_id: leaderId, content: newNote.trim(), created_by: user.id })
        .select('*')
        .single();
      if (data && !error) {
        await reloadNotes();
        setNewNote('');
      } else {
        setNoteError(`Failed to save note: ${error?.message || 'Unknown error'}`);
      }
    } catch {
      setNoteError('Failed to save note. Please try again.');
    } finally {
      setIsSavingNote(false);
    }
  };

  const handleInsertMeetingPrep = useCallback(async (prepText: string) => {
    if (!prepText.trim() || !user?.id) return;
    try {
      const { error } = await supabase.from('notes').insert({
        circle_leader_id: leaderId, content: prepText.trim(), created_by: user.id,
      });
      if (!error) await reloadNotes();
    } catch (err) {
      console.error('Error saving meeting prep note:', err);
    }
  }, [leaderId, user?.id, reloadNotes]);

  const handleTemplateSelect = (template: NoteTemplate) => {
    setNewNote(template.content);
    setIsTemplateModalOpen(false);
  };

  const handleEditNote = (note: Note) => {
    setEditingNoteId(note.id);
    setEditingNoteContent(note.content);
  };

  const handleSaveEditedNote = async () => {
    if (!stripHtml(editingNoteContent).trim() || !editingNoteId) return;
    setIsUpdatingNote(true);
    try {
      const { data, error } = await supabase
        .from('notes')
        .update({ content: editingNoteContent.trim() })
        .eq('id', editingNoteId)
        .select()
        .single();
      if (data && !error) {
        setNotes(prev => prev.map(n => n.id === editingNoteId ? { ...n, content: editingNoteContent.trim() } : n));
        setEditingNoteId(null);
        setEditingNoteContent('');
      } else {
        setNoteError('Failed to update note. Please try again.');
        setTimeout(() => setNoteError(''), 5000);
      }
    } catch {
      setNoteError('Failed to update note. Please try again.');
      setTimeout(() => setNoteError(''), 5000);
    } finally {
      setIsUpdatingNote(false);
    }
  };

  const handleCancelEdit = () => {
    setEditingNoteId(null);
    setEditingNoteContent('');
  };

  const handleDeleteNote = async (noteId: number) => {
    if (deletingNoteId !== noteId) {
      setDeletingNoteId(noteId);
      return;
    }
    setIsDeletingNote(true);
    try {
      const { error } = await supabase.from('notes').delete().eq('id', noteId);
      if (!error) {
        setNotes(prev => prev.filter(n => n.id !== noteId));
        setDeletingNoteId(null);
      } else {
        setNoteError('Failed to delete note. Please try again.');
        setTimeout(() => setNoteError(''), 5000);
      }
    } catch {
      setNoteError('Failed to delete note. Please try again.');
      setTimeout(() => setNoteError(''), 5000);
    } finally {
      setIsDeletingNote(false);
    }
  };

  const handleSaveAsTemplate = async (note: Note) => {
    const templateName = window.prompt('Enter a name for this template:');
    if (!templateName?.trim()) return;
    setIsSavingAsTemplate(note.id);
    try {
      await saveTemplate(templateName.trim(), note.content);
      setShowAlert({ isOpen: true, type: 'success', title: 'Template Saved', message: `Note saved as template "${templateName.trim()}"` });
    } catch (error: any) {
      setShowAlert({ isOpen: true, type: 'error', title: 'Save Failed', message: error.message || 'Failed to save note as template' });
    } finally {
      setIsSavingAsTemplate(null);
    }
  };

  if (isLoading) {
    return (
      <ProtectedRoute>
        <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center">
          <div className="animate-spin rounded-full h-8 w-8 border-2 border-gray-600/20 border-t-blue-600" />
        </div>
      </ProtectedRoute>
    );
  }

  const filteredNotes = noteSearchQuery
    ? notes.filter(n => {
        const q = noteSearchQuery.toLowerCase();
        return stripHtml(n.content || '').toLowerCase().includes(q) ||
          n.users?.name?.toLowerCase().includes(q) ||
          n.created_by?.toLowerCase().includes(q);
      })
    : notes;

  return (
    <ProtectedRoute>
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-6 pb-28 lg:pb-6">

          {/* Header */}
          <div className="mb-6">
            <a
              href={`/circle/${leaderId}`}
              className="flex items-center gap-1.5 text-slate-400 hover:text-white transition-colors text-sm mb-3 w-fit"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 19l-7-7 7-7" />
              </svg>
              <span>Back</span>
            </a>
            {leader && (
              <h1 className="text-2xl font-bold text-white">{leader.name}</h1>
            )}
          </div>

          {/* Notes Panel */}
          <div className="section-panel bg-slate-800 border border-slate-700 rounded-xl shadow-card-glass">
            <div className="section-header-row px-4 sm:px-6 py-4">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-violet-500/15 flex items-center justify-center">
                  <svg className="w-4 h-4 text-violet-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                  </svg>
                </div>
                <h2 className="text-lg font-medium text-gray-900 dark:text-white">Notes</h2>
              </div>
            </div>
            <div className="p-4 sm:p-6">

              {/* Add Note */}
              <div className="mb-6 sm:mb-8">
                <div className="flex justify-between items-center mb-3">
                  <label htmlFor="newNote" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                    Add a note
                  </label>
                  <button
                    type="button"
                    onClick={() => setIsTemplateModalOpen(true)}
                    className="text-sm text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300 transition-colors"
                  >
                    Use Template
                  </button>
                </div>
                <div className="space-y-2">
                  {isAdmin() && leader && (
                    <MeetingPrepAssistant
                      leaderName={leader.name}
                      status={leader.status}
                      campus={leader.campus ?? undefined}
                      circleType={leader.circle_type ?? undefined}
                      meetingDay={leader.day ?? undefined}
                      meetingTime={leader.time ?? undefined}
                      meetingFrequency={leader.frequency ?? undefined}
                      latestScores={latestBig4Scores}
                      recentNotes={notes.slice(0, 10).map(n => ({
                        content: n.content,
                        created_at: n.created_at,
                        author: n.users?.name,
                      }))}
                      onInsertNote={handleInsertMeetingPrep}
                      disabled={isSavingNote}
                    />
                  )}
                  <DictateAndSummarize
                    text={stripHtml(newNote)}
                    onTextChange={(plain) => {
                      const html = plain
                        ? '<p>' + plain.replace(/\n\n+/g, '</p><p>').replace(/\n/g, '<br>') + '</p>'
                        : '';
                      setNewNote(html);
                    }}
                    disabled={isSavingNote}
                  />
                  <RichTextEditor
                    value={newNote}
                    onChange={setNewNote}
                    onSubmit={handleAddNote}
                    placeholder="Enter your note here... (Cmd/Ctrl + Enter to save)"
                    disabled={isSavingNote}
                    minHeight="100px"
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
                    <div className="text-sm text-slate-500">
                      {stripHtml(newNote).length > 0 && <div>{stripHtml(newNote).length} characters</div>}
                    </div>
                    <button
                      onClick={handleAddNote}
                      disabled={!stripHtml(newNote).trim() || isSavingNote}
                      className="w-full sm:w-auto px-6 py-3 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                      {isSavingNote ? (
                        <div className="flex items-center justify-center">
                          <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
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
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
                      <p className="text-sm text-slate-500">
                        {noteSearchQuery
                          ? `${filteredNotes.length} of ${notes.length} notes`
                          : `${notes.length} ${notes.length === 1 ? 'note' : 'notes'}`}
                      </p>
                      <div className="relative w-full sm:w-64">
                        <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 dark:text-gray-500 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                        </svg>
                        <input
                          type="text"
                          value={noteSearchQuery}
                          onChange={(e) => setNoteSearchQuery(e.target.value)}
                          placeholder="Search notes..."
                          className="w-full pl-9 pr-8 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-violet-500"
                        />
                        {noteSearchQuery && (
                          <button
                            onClick={() => setNoteSearchQuery('')}
                            className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                            </svg>
                          </button>
                        )}
                      </div>
                    </div>

                    {filteredNotes.map((note, index) => (
                      <div key={note.id} className="border border-gray-200 dark:border-gray-700 rounded-lg p-4 sm:p-6 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors">
                        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
                          <div className="flex-1 min-w-0">
                            {editingNoteId === note.id ? (
                              <div className="space-y-4">
                                <RichTextEditor
                                  value={editingNoteContent}
                                  onChange={setEditingNoteContent}
                                  onSubmit={handleSaveEditedNote}
                                  onEscape={handleCancelEdit}
                                  placeholder="Edit your note... (Cmd/Ctrl + Enter to save, Esc to cancel)"
                                  disabled={isUpdatingNote}
                                  minHeight="80px"
                                />
                                <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                                  <div className="flex items-center space-x-3">
                                    <button
                                      onClick={handleSaveEditedNote}
                                      disabled={!stripHtml(editingNoteContent).trim() || isUpdatingNote}
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
                                  <div className="text-sm text-slate-500">{stripHtml(editingNoteContent).length} characters</div>
                                </div>
                              </div>
                            ) : (
                              <>
                                {/* Mobile layout */}
                                <div className="sm:hidden">
                                  <div className="flex items-center justify-between mb-2">
                                    <div className="flex flex-col gap-1 text-sm text-slate-500">
                                      <div className="flex items-center">
                                        <svg className="w-4 h-4 mr-2 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                                          <path fillRule="evenodd" d="M6 2a1 1 0 00-1 1v1H4a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V6a2 2 0 00-2-2h-1V3a1 1 0 10-2 0v1H7V3a1 1 0 00-1-1zm0 5a1 1 0 000 2h8a1 1 0 100-2H6z" clipRule="evenodd" />
                                        </svg>
                                        <span>{formatDateTime(note.created_at)}</span>
                                      </div>
                                      <div className="flex items-center">
                                        <svg className="w-4 h-4 mr-2 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                                          <path fillRule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clipRule="evenodd" />
                                        </svg>
                                        <span className="truncate">{note.users?.name || note.created_by || 'Anonymous'}</span>
                                      </div>
                                    </div>
                                    <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300">
                                      #{notes.length - index}
                                    </span>
                                  </div>
                                  <div className="flex items-center space-x-2 mb-3">
                                    <button onClick={() => handleEditNote(note)} disabled={editingNoteId !== null || isDeletingNote} className="p-2 text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 disabled:opacity-50 disabled:cursor-not-allowed transition-colors rounded-md hover:bg-gray-100 dark:hover:bg-gray-600" title="Edit note">
                                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                                    </button>
                                    <button onClick={() => handleSaveAsTemplate(note)} disabled={editingNoteId !== null || isDeletingNote || isSavingAsTemplate === note.id} className="p-2 text-gray-400 hover:text-green-600 dark:hover:text-green-400 disabled:opacity-50 disabled:cursor-not-allowed transition-colors rounded-md hover:bg-gray-100 dark:hover:bg-gray-600" title="Save as template">
                                      {isSavingAsTemplate === note.id ? (
                                        <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" /></svg>
                                      ) : (
                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                                      )}
                                    </button>
                                    {deletingNoteId === note.id ? (
                                      <div className="flex items-center space-x-1">
                                        <button onClick={() => handleDeleteNote(note.id)} disabled={isDeletingNote} className="p-2 text-red-600 dark:text-red-400 hover:text-red-700 disabled:opacity-50 transition-colors rounded-md hover:bg-red-100 dark:hover:bg-red-900/20" title="Confirm delete">
                                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" /></svg>
                                        </button>
                                        <button onClick={() => setDeletingNoteId(null)} disabled={isDeletingNote} className="p-2 text-gray-400 hover:text-gray-600 transition-colors rounded-md hover:bg-gray-100 dark:hover:bg-gray-600" title="Cancel delete">
                                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
                                        </button>
                                      </div>
                                    ) : (
                                      <button onClick={() => handleDeleteNote(note.id)} disabled={editingNoteId !== null || isDeletingNote} className="p-2 text-gray-400 hover:text-red-600 dark:hover:text-red-400 disabled:opacity-50 transition-colors rounded-md hover:bg-gray-100 dark:hover:bg-gray-600" title="Delete note">
                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                                      </button>
                                    )}
                                  </div>
                                  {isHtmlContent(note.content) ? (
                                    <div className="rte-display text-gray-900 dark:text-white text-base leading-relaxed" dangerouslySetInnerHTML={{ __html: note.content }} />
                                  ) : (
                                    <div className="text-gray-900 dark:text-white whitespace-pre-wrap text-base leading-relaxed">{linkifyText(note.content)}</div>
                                  )}
                                </div>

                                {/* Desktop layout */}
                                <div className="hidden sm:block">
                                  {isHtmlContent(note.content) ? (
                                    <div className="rte-display text-gray-900 dark:text-white text-base leading-relaxed mb-4" dangerouslySetInnerHTML={{ __html: note.content }} />
                                  ) : (
                                    <div className="text-gray-900 dark:text-white whitespace-pre-wrap text-base leading-relaxed mb-4">{linkifyText(note.content)}</div>
                                  )}
                                  <div className="flex flex-row items-center gap-4 text-sm text-slate-500">
                                    <div className="flex items-center">
                                      <svg className="w-4 h-4 mr-2 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clipRule="evenodd" /></svg>
                                      <span className="truncate">{note.users?.name || note.created_by || 'Anonymous'}</span>
                                    </div>
                                    <div className="flex items-center">
                                      <svg className="w-4 h-4 mr-2 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M6 2a1 1 0 00-1 1v1H4a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V6a2 2 0 00-2-2h-1V3a1 1 0 10-2 0v1H7V3a1 1 0 00-1-1zm0 5a1 1 0 000 2h8a1 1 0 100-2H6z" clipRule="evenodd" /></svg>
                                      <span>{formatDateTime(note.created_at)}</span>
                                    </div>
                                  </div>
                                </div>
                              </>
                            )}
                          </div>

                          {/* Desktop badge + buttons */}
                          <div className="hidden sm:flex items-center justify-between sm:justify-end sm:flex-col sm:items-end gap-3">
                            <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300">
                              #{notes.length - index}
                            </span>
                            {editingNoteId !== note.id && (
                              <div className="flex items-center space-x-2">
                                <button onClick={() => handleEditNote(note)} disabled={editingNoteId !== null || isDeletingNote} className="p-2 text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 disabled:opacity-50 transition-colors rounded-md hover:bg-gray-100 dark:hover:bg-gray-600" title="Edit note">
                                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                                </button>
                                <button onClick={() => handleSaveAsTemplate(note)} disabled={editingNoteId !== null || isDeletingNote || isSavingAsTemplate === note.id} className="p-2 text-gray-400 hover:text-green-600 dark:hover:text-green-400 disabled:opacity-50 transition-colors rounded-md hover:bg-gray-100 dark:hover:bg-gray-600" title="Save as template">
                                  {isSavingAsTemplate === note.id ? (
                                    <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" /></svg>
                                  ) : (
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                                  )}
                                </button>
                                {deletingNoteId === note.id ? (
                                  <div className="flex items-center space-x-1">
                                    <button onClick={() => handleDeleteNote(note.id)} disabled={isDeletingNote} className="p-2 text-red-600 dark:text-red-400 hover:text-red-700 disabled:opacity-50 transition-colors rounded-md hover:bg-red-100 dark:hover:bg-red-900/20" title="Confirm delete">
                                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" /></svg>
                                    </button>
                                    <button onClick={() => setDeletingNoteId(null)} disabled={isDeletingNote} className="p-2 text-gray-400 hover:text-gray-600 transition-colors rounded-md hover:bg-gray-100 dark:hover:bg-gray-600" title="Cancel delete">
                                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
                                    </button>
                                  </div>
                                ) : (
                                  <button onClick={() => handleDeleteNote(note.id)} disabled={editingNoteId !== null || isDeletingNote} className="p-2 text-gray-400 hover:text-red-600 dark:hover:text-red-400 disabled:opacity-50 transition-colors rounded-md hover:bg-gray-100 dark:hover:bg-gray-600" title="Delete note">
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                                  </button>
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}

                    {noteSearchQuery && filteredNotes.length === 0 && (
                      <div className="text-center py-8">
                        <svg className="mx-auto h-10 w-10 text-gray-400 dark:text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                        </svg>
                        <p className="mt-3 text-sm text-slate-500">No notes matching &ldquo;{noteSearchQuery}&rdquo;</p>
                        <button
                          onClick={() => setNoteSearchQuery('')}
                          className="mt-2 text-sm text-violet-600 hover:text-violet-700 dark:text-violet-400 dark:hover:text-violet-300 transition-colors"
                        >
                          Clear search
                        </button>
                      </div>
                    )}
                  </>
                )}
              </div>

            </div>
          </div>
        </div>
      </div>

      <AlertModal
        isOpen={showAlert.isOpen}
        onClose={() => setShowAlert({ ...showAlert, isOpen: false })}
        type={showAlert.type}
        title={showAlert.title}
        message={showAlert.message}
      />

      <NoteTemplateModal
        isOpen={isTemplateModalOpen}
        onClose={() => setIsTemplateModalOpen(false)}
        onTemplateSelect={handleTemplateSelect}
        mode="select"
      />
    </ProtectedRoute>
  );
}
