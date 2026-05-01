'use client';

import { useState, useEffect } from 'react';
import Modal from '../ui/Modal';
import LeaderCombobox from '../ui/LeaderCombobox';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';

interface Leader { id: number; name: string; }
interface Board { id: string; title: string; }
interface Column { id: string; title: string; position: number; }

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onSaved?: () => void;
}

export default function AddCardModal({ isOpen, onClose, onSaved }: Props) {
  const { user } = useAuth();
  const [boards, setBoards] = useState<Board[]>([]);
  const [columns, setColumns] = useState<Column[]>([]);
  const [leaders, setLeaders] = useState<Leader[]>([]);
  const [title, setTitle] = useState('');
  const [selectedBoardId, setSelectedBoardId] = useState('');
  const [selectedColumnId, setSelectedColumnId] = useState('');
  const [selectedLeaderId, setSelectedLeaderId] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [isLoadingBoards, setIsLoadingBoards] = useState(false);
  const [isLoadingColumns, setIsLoadingColumns] = useState(false);
  const [saved, setSaved] = useState(false);
  const [savedTitle, setSavedTitle] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (!isOpen) return;
    setTitle('');
    setSelectedBoardId('');
    setSelectedColumnId('');
    setSelectedLeaderId('');
    setDueDate('');
    setError('');
    setSaved(false);
    setSavedTitle('');
    loadInitialData();
  }, [isOpen]);

  const loadInitialData = async () => {
    setIsLoadingBoards(true);
    try {
      const [boardsRes, leadersRes] = await Promise.all([
        supabase.from('project_boards').select('id, title').eq('is_archived', false).order('title'),
        supabase.from('circle_leaders').select('id, name').order('name'),
      ]);
      setBoards(boardsRes.data || []);
      setLeaders(leadersRes.data || []);
    } finally {
      setIsLoadingBoards(false);
    }
  };

  useEffect(() => {
    if (!selectedBoardId) {
      setColumns([]);
      setSelectedColumnId('');
      return;
    }
    const loadColumns = async () => {
      setIsLoadingColumns(true);
      try {
        const { data } = await supabase
          .from('board_columns')
          .select('id, title, position')
          .eq('board_id', selectedBoardId)
          .order('position');
        setColumns(data || []);
        if (data && data.length > 0) setSelectedColumnId(data[0].id);
      } finally {
        setIsLoadingColumns(false);
      }
    };
    loadColumns();
  }, [selectedBoardId]);

  const handleSave = async () => {
    if (!title.trim()) { setError('Card title is required.'); return; }
    if (!selectedBoardId) { setError('Please select a board.'); return; }
    if (!selectedColumnId) { setError('Please select a column.'); return; }

    setIsSaving(true);
    setError('');
    try {
      const { data: existingCards } = await supabase
        .from('board_cards')
        .select('position')
        .eq('column_id', selectedColumnId);
      const maxPos = (existingCards || []).reduce(
        (m: number, c: { position: number }) => Math.max(m, c.position ?? -1),
        -1
      );

      const { error: e } = await supabase.from('board_cards').insert({
        board_id: selectedBoardId,
        column_id: selectedColumnId,
        title: title.trim(),
        due_date: dueDate || null,
        linked_leader_id: selectedLeaderId ? parseInt(selectedLeaderId) : null,
        position: maxPos + 1,
        created_by: user?.id || null,
      });
      if (e) throw e;

      setSavedTitle(title.trim());
      setSaved(true);
      onSaved?.();
    } catch {
      setError('Failed to save card. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  const inputClass = "w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:text-white text-sm";

  if (saved) {
    return (
      <Modal isOpen={isOpen} onClose={onClose} title="Add Board Card" size="md">
        <div className="py-6 text-center">
          <div className="w-12 h-12 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center mx-auto mb-3">
            <svg className="w-6 h-6 text-green-600 dark:text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <p className="text-base font-medium text-gray-900 dark:text-white mb-1">Card Added</p>
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">"{savedTitle}" was added to the board.</p>
          <button
            onClick={onClose}
            className="px-6 py-2 text-white bg-blue-600 hover:bg-blue-700 rounded-md transition-colors text-sm"
          >
            Done
          </button>
        </div>
      </Modal>
    );
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Add Board Card" size="md">
      <div className="space-y-4">
        {error && (
          <div className="bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 p-3 rounded-md text-sm">
            {error}
          </div>
        )}

        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Card Title <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            value={title}
            onChange={e => setTitle(e.target.value)}
            maxLength={120}
            placeholder="What needs to be done?"
            className={inputClass}
            disabled={isSaving}
            autoFocus
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Board <span className="text-red-500">*</span>
          </label>
          {isLoadingBoards ? (
            <div className="text-sm text-gray-500 dark:text-gray-400">Loading boards...</div>
          ) : (
            <select
              value={selectedBoardId}
              onChange={e => setSelectedBoardId(e.target.value)}
              className={inputClass}
              disabled={isSaving}
            >
              <option value="">Select a board...</option>
              {boards.map(b => <option key={b.id} value={b.id}>{b.title}</option>)}
            </select>
          )}
        </div>

        {selectedBoardId && (
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Column <span className="text-red-500">*</span>
            </label>
            {isLoadingColumns ? (
              <div className="text-sm text-gray-500 dark:text-gray-400">Loading columns...</div>
            ) : (
              <select
                value={selectedColumnId}
                onChange={e => setSelectedColumnId(e.target.value)}
                className={inputClass}
                disabled={isSaving}
              >
                <option value="">Select a column...</option>
                {columns.map(c => <option key={c.id} value={c.id}>{c.title}</option>)}
              </select>
            )}
          </div>
        )}

        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Link to Leader <span className="text-gray-400 font-normal">(optional)</span>
          </label>
          <LeaderCombobox
            leaders={leaders}
            value={selectedLeaderId}
            onChange={setSelectedLeaderId}
            disabled={isSaving}
            optional
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Due Date <span className="text-gray-400 font-normal">(optional)</span>
          </label>
          <input
            type="date"
            value={dueDate}
            onChange={e => setDueDate(e.target.value)}
            className={inputClass}
            disabled={isSaving}
          />
        </div>

        <div className="flex justify-end gap-3 pt-2">
          <button
            type="button"
            onClick={onClose}
            disabled={isSaving}
            className="px-4 py-2 text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-600 hover:bg-gray-200 dark:hover:bg-gray-500 rounded-md transition-colors text-sm"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={isSaving || !title.trim() || !selectedBoardId || !selectedColumnId}
            className="px-4 py-2 text-white bg-blue-600 hover:bg-blue-700 rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-sm"
          >
            {isSaving ? 'Adding...' : 'Add Card'}
          </button>
        </div>
      </div>
    </Modal>
  );
}
