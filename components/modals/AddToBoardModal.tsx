'use client';

import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import Modal from '../ui/Modal';

interface AddToBoardModalProps {
  isOpen: boolean;
  onClose: () => void;
  leaderId: number;
  leaderName: string;
  followUpDate: string;
}

interface Board {
  id: string;
  title: string;
}

interface BoardColumn {
  id: string;
  title: string;
  position: number;
}

export default function AddToBoardModal({
  isOpen,
  onClose,
  leaderId,
  leaderName,
  followUpDate,
}: AddToBoardModalProps) {
  const [boards, setBoards] = useState<Board[]>([]);
  const [columns, setColumns] = useState<BoardColumn[]>([]);
  const [selectedBoardId, setSelectedBoardId] = useState('');
  const [selectedColumnId, setSelectedColumnId] = useState('');
  const [cardTitle, setCardTitle] = useState(`Follow up with ${leaderName}`);
  const [isLoadingBoards, setIsLoadingBoards] = useState(false);
  const [isLoadingColumns, setIsLoadingColumns] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');

  // Fetch boards when modal opens
  useEffect(() => {
    if (!isOpen) return;
    setSelectedBoardId('');
    setSelectedColumnId('');
    setColumns([]);
    setCardTitle(`Follow up with ${leaderName}`);
    setSaved(false);
    setError('');

    const fetchBoards = async () => {
      setIsLoadingBoards(true);
      const { data, error: err } = await supabase
        .from('project_boards')
        .select('id, title')
        .eq('is_archived', false)
        .order('created_at', { ascending: false });
      if (!err && data) setBoards(data);
      setIsLoadingBoards(false);
    };
    fetchBoards();
  }, [isOpen, leaderName]);

  // Fetch columns when board changes
  useEffect(() => {
    if (!selectedBoardId) {
      setColumns([]);
      setSelectedColumnId('');
      return;
    }
    const fetchColumns = async () => {
      setIsLoadingColumns(true);
      setSelectedColumnId('');
      const { data, error: err } = await supabase
        .from('board_columns')
        .select('id, title, position')
        .eq('board_id', selectedBoardId)
        .order('position', { ascending: true });
      if (!err && data) setColumns(data);
      setIsLoadingColumns(false);
    };
    fetchColumns();
  }, [selectedBoardId]);

  const handleCreate = async () => {
    if (!selectedBoardId || !selectedColumnId || !cardTitle.trim()) return;
    setIsSaving(true);
    setError('');

    try {
      const { data: { user } } = await supabase.auth.getUser();

      // Determine next position in the column
      const { data: existingCards } = await supabase
        .from('board_cards')
        .select('position')
        .eq('column_id', selectedColumnId);
      const maxPos = (existingCards || []).reduce((m, c) => Math.max(m, c.position ?? -1), -1);

      const { error: insertErr } = await supabase
        .from('board_cards')
        .insert({
          board_id: selectedBoardId,
          column_id: selectedColumnId,
          title: cardTitle.trim(),
          description: `Follow-up scheduled for ${followUpDate}. View leader profile: /circle/${leaderId}`,
          due_date: followUpDate,
          linked_leader_id: leaderId,
          position: maxPos + 1,
          created_by: user?.id || null,
        });

      if (insertErr) throw insertErr;
      setSaved(true);
    } catch (err: any) {
      setError(err.message || 'Failed to create card. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  const formattedDate = followUpDate
    ? new Date(followUpDate + 'T00:00:00').toLocaleDateString('en-US', {
        month: 'long',
        day: 'numeric',
        year: 'numeric',
      })
    : '';

  if (saved) {
    return (
      <Modal isOpen={isOpen} onClose={onClose} title="Card Created">
        <div className="p-6 space-y-4">
          <div className="flex items-start gap-3">
            <div className="flex-shrink-0 w-10 h-10 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
              <svg className="w-5 h-5 text-green-600 dark:text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <div>
              <p className="text-sm font-medium text-gray-900 dark:text-white">Board card created!</p>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
                &ldquo;{cardTitle}&rdquo; was added to{' '}
                <span className="font-medium text-gray-700 dark:text-gray-300">
                  {boards.find(b => b.id === selectedBoardId)?.title}
                </span>{' '}
                →{' '}
                <span className="font-medium text-gray-700 dark:text-gray-300">
                  {columns.find(c => c.id === selectedColumnId)?.title}
                </span>
                . The card is linked to this leader&apos;s profile.
              </p>
            </div>
          </div>
          <div className="flex justify-end pt-2">
            <button
              onClick={onClose}
              className="btn-primary px-5 py-2.5 rounded-xl text-sm"
            >
              Done
            </button>
          </div>
        </div>
      </Modal>
    );
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Follow-Up Set">
      <div className="p-6 space-y-5">
        {/* Success confirmation */}
        <div className="flex items-start gap-3 p-3 bg-green-50 dark:bg-green-900/20 border border-green-200/50 dark:border-green-800/50 rounded-xl">
          <div className="flex-shrink-0 mt-0.5">
            <svg className="w-5 h-5 text-green-600 dark:text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <div>
            <p className="text-sm font-medium text-green-800 dark:text-green-300">Follow-up scheduled</p>
            <p className="text-xs text-green-700 dark:text-green-400 mt-0.5">
              {leaderName} — {formattedDate}
            </p>
          </div>
        </div>

        {/* Prompt */}
        <div>
          <p className="text-sm font-medium text-gray-900 dark:text-white">Add this to a board?</p>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
            Create a linked board card to track this action. The card will reference this leader&apos;s profile.
          </p>
        </div>

        {/* Board selector */}
        <div className="space-y-1">
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Board</label>
          {isLoadingBoards ? (
            <div className="h-10 bg-gray-100 dark:bg-gray-700/40 rounded-xl animate-pulse" />
          ) : (
            <select
              value={selectedBoardId}
              onChange={e => setSelectedBoardId(e.target.value)}
              className="w-full px-3 py-2.5 text-sm border border-gray-300/40 dark:border-gray-600/40 rounded-xl bg-white/60 dark:bg-gray-700/30 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500/50 backdrop-blur-sm"
            >
              <option value="">Select a board…</option>
              {boards.map(b => (
                <option key={b.id} value={b.id}>{b.title}</option>
              ))}
            </select>
          )}
        </div>

        {/* Column selector — only show after board is selected */}
        {selectedBoardId && (
          <div className="space-y-1">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">List / Column</label>
            {isLoadingColumns ? (
              <div className="h-10 bg-gray-100 dark:bg-gray-700/40 rounded-xl animate-pulse" />
            ) : (
              <select
                value={selectedColumnId}
                onChange={e => setSelectedColumnId(e.target.value)}
                className="w-full px-3 py-2.5 text-sm border border-gray-300/40 dark:border-gray-600/40 rounded-xl bg-white/60 dark:bg-gray-700/30 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500/50 backdrop-blur-sm"
              >
                <option value="">Select a column…</option>
                {columns.map(c => (
                  <option key={c.id} value={c.id}>{c.title}</option>
                ))}
              </select>
            )}
          </div>
        )}

        {/* Card title — only show when both board and column are selected */}
        {selectedBoardId && selectedColumnId && (
          <div className="space-y-1">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Card Title</label>
            <input
              type="text"
              value={cardTitle}
              onChange={e => setCardTitle(e.target.value)}
              maxLength={120}
              className="w-full px-3 py-2.5 text-sm border border-gray-300/40 dark:border-gray-600/40 rounded-xl bg-white/60 dark:bg-gray-700/30 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500/50 backdrop-blur-sm"
            />
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Due date will be set to {formattedDate} and the card will be linked to {leaderName}&apos;s profile.
            </p>
          </div>
        )}

        {error && (
          <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
        )}

        {/* Actions */}
        <div className="flex items-center justify-between pt-2">
          <button
            type="button"
            onClick={onClose}
            className="text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition-colors"
          >
            No thanks, I&apos;m done
          </button>
          <button
            type="button"
            onClick={handleCreate}
            disabled={!selectedBoardId || !selectedColumnId || !cardTitle.trim() || isSaving}
            className="btn-primary px-5 py-2.5 rounded-xl text-sm"
          >
            {isSaving ? 'Creating…' : 'Add to Board'}
          </button>
        </div>
      </div>
    </Modal>
  );
}
