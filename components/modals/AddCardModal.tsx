'use client';

import { useState, useEffect, useMemo } from 'react';
import Modal from '../ui/Modal';
import LeaderCombobox from '../ui/LeaderCombobox';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { buildTimeOptions15Min } from '../../lib/timeUtils';
import { parseQuickAdd } from '../../lib/quickAddParser';
import { PRIORITY_CONFIG } from '../boards/CardDetailModal';
import type { CardPriority } from '../../lib/supabase';

interface Leader { id: number; name: string; }
interface Board { id: string; title: string; }
interface Column { id: string; title: string; position: number; }
interface Label { id: string; name: string; color: string; }

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onSaved?: () => void;
}

function getStoredCardValue(key: string) {
  if (typeof window === 'undefined') return '';
  return window.localStorage.getItem(key) || '';
}

/** "Now" in Central time, as a JS Date, so chrono resolves "tomorrow" against the app's day. */
function nowCST(): Date {
  return new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Chicago' }));
}

const TIME_OPTIONS_15_MIN = buildTimeOptions15Min('08:00');
const PRIORITY_ORDER: CardPriority[] = ['low', 'medium', 'high', 'urgent'];

export default function AddCardModal({ isOpen, onClose, onSaved }: Props) {
  const { user } = useAuth();
  const [boards, setBoards] = useState<Board[]>([]);
  const [columns, setColumns] = useState<Column[]>([]);
  const [leaders, setLeaders] = useState<Leader[]>([]);
  const [labels, setLabels] = useState<Label[]>([]);
  const [quickInput, setQuickInput] = useState('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [selectedBoardId, setSelectedBoardId] = useState(() => getStoredCardValue('addCard:lastBoardId'));
  const [selectedColumnId, setSelectedColumnId] = useState(() => getStoredCardValue('addCard:lastColumnId'));
  const [selectedLeaderId, setSelectedLeaderId] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [dueTime, setDueTime] = useState('');
  const [priority, setPriority] = useState<CardPriority | null>(null);
  const [selectedLabelIds, setSelectedLabelIds] = useState<string[]>([]);
  const [pendingLabelTokens, setPendingLabelTokens] = useState<string[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [isLoadingBoards, setIsLoadingBoards] = useState(false);
  const [isLoadingColumns, setIsLoadingColumns] = useState(false);
  const [saved, setSaved] = useState(false);
  const [savedTitle, setSavedTitle] = useState('');
  const [error, setError] = useState('');

  const parsed = useMemo(
    () => (quickInput.trim() ? parseQuickAdd(quickInput, nowCST()) : null),
    [quickInput]
  );

  useEffect(() => {
    if (!isOpen) return;
    setQuickInput('');
    setTitle('');
    setDescription('');
    setSelectedBoardId(getStoredCardValue('addCard:lastBoardId'));
    setSelectedColumnId(getStoredCardValue('addCard:lastColumnId'));
    setSelectedLeaderId('');
    setDueDate('');
    setDueTime('');
    setPriority(null);
    setSelectedLabelIds([]);
    setPendingLabelTokens([]);
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

  // Parse the quick-add line into structured fields. Fields stay editable below.
  const handleQuickInputChange = (value: string) => {
    setQuickInput(value);
    const result = value.trim() ? parseQuickAdd(value, nowCST()) : null;
    setTitle(result ? result.title : '');
    if (result?.dueDate) {
      setDueDate(result.dueDate);
      setDueTime(result.dueTime || '');
    } else if (!value.trim()) {
      setDueDate('');
      setDueTime('');
    }
    setPriority(result?.priority ?? null);
    setPendingLabelTokens(result?.labelTokens ?? []);
  };

  useEffect(() => {
    if (!selectedBoardId) {
      setColumns([]);
      setSelectedColumnId('');
      setLabels([]);
      return;
    }
    const loadBoardData = async () => {
      setIsLoadingColumns(true);
      try {
        const [colsRes, labelsRes] = await Promise.all([
          supabase.from('board_columns').select('id, title, position').eq('board_id', selectedBoardId).order('position'),
          supabase.from('board_labels').select('id, name, color').eq('board_id', selectedBoardId).order('name'),
        ]);
        const cols = colsRes.data || [];
        setColumns(cols);
        setLabels(labelsRes.data || []);
        const savedColumnId = localStorage.getItem('addCard:lastColumnId');
        const match = cols.find(c => c.id === savedColumnId);
        if (match) setSelectedColumnId(match.id);
        else if (cols.length > 0) setSelectedColumnId(cols[0].id);
      } finally {
        setIsLoadingColumns(false);
      }
    };
    loadBoardData();
  }, [selectedBoardId]);

  // Once labels for the board are loaded, auto-select any matched by #tokens.
  useEffect(() => {
    if (!pendingLabelTokens.length || !labels.length) return;
    const matched = labels
      .filter(l => pendingLabelTokens.includes(l.name.toLowerCase()))
      .map(l => l.id);
    if (matched.length) {
      setSelectedLabelIds(prev => Array.from(new Set([...prev, ...matched])));
    }
  }, [pendingLabelTokens, labels]);

  const toggleLabel = (id: string) => {
    setSelectedLabelIds(prev => (prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]));
  };

  const unmatchedTokens = useMemo(() => {
    if (!pendingLabelTokens.length) return [];
    const known = new Set(labels.map(l => l.name.toLowerCase()));
    return pendingLabelTokens.filter(t => !known.has(t));
  }, [pendingLabelTokens, labels]);

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

      localStorage.setItem('addCard:lastBoardId', selectedBoardId);
      localStorage.setItem('addCard:lastColumnId', selectedColumnId);

      const { data: card, error: e } = await supabase.from('board_cards').insert({
        board_id: selectedBoardId,
        column_id: selectedColumnId,
        title: title.trim(),
        description: description.trim() || null,
        due_date: dueDate || null,
        due_time: dueDate ? (dueTime || null) : null,
        priority: priority || 'medium',
        linked_leader_id: selectedLeaderId ? parseInt(selectedLeaderId) : null,
        position: maxPos + 1,
        created_by: user?.id || null,
      }).select('id').single();
      if (e) throw e;

      if (card && selectedLabelIds.length) {
        const assignments = selectedLabelIds.map(label_id => ({ card_id: card.id, label_id }));
        await supabase.from('card_label_assignments').insert(assignments);
      }

      // Let open pages (e.g. Today) refresh immediately. Realtime can be slow or
      // suspended on mobile, so we don't rely on it alone to surface the new card.
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('radius:card-saved', { detail: { dueDate: dueDate || null } }));
      }

      setSavedTitle(title.trim());
      setSaved(true);
      onSaved?.();
    } catch {
      setError('Failed to save card. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  const inputClass = "w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-vc-500 focus:border-vc-500 dark:bg-gray-700 dark:text-white text-sm";

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
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
            &ldquo;{savedTitle}&rdquo; was added to the board.
          </p>
          <button
            onClick={onClose}
            className="btn-primary px-6 py-2 rounded-lg text-sm"
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

        {/* Natural-language quick-add line */}
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Quick add
          </label>
          <input
            type="text"
            value={quickInput}
            onChange={e => handleQuickInputChange(e.target.value)}
            placeholder="Call Sarah tomorrow 3pm !p1 #followup"
            className={inputClass}
            disabled={isSaving}
            autoFocus
          />
          {parsed && parsed.tokens.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-2">
              {parsed.tokens.map((t, i) => (
                <span
                  key={`${t.type}-${i}`}
                  className={
                    'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ' +
                    (t.type === 'date' || t.type === 'time'
                      ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300'
                      : t.type === 'priority'
                        ? 'bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300'
                        : 'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300')
                  }
                >
                  {t.text}
                </span>
              ))}
            </div>
          )}
          <p className="text-xs text-gray-400 dark:text-gray-500 mt-1.5">
            Type a date/time (&ldquo;next Friday 3pm&rdquo;), priority (<code>!p1</code>&ndash;<code>!p4</code>),
            or a label (<code>#name</code>). Everything below stays editable.
          </p>
        </div>

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
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Description <span className="text-gray-400 font-normal">(optional)</span>
          </label>
          <textarea
            value={description}
            onChange={e => setDescription(e.target.value)}
            rows={3}
            maxLength={1000}
            placeholder="Add details, context, or notes..."
            className={inputClass + ' resize-none'}
            disabled={isSaving}
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
            Priority
          </label>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setPriority(null)}
              disabled={isSaving}
              className={
                'px-3 py-1 rounded-full text-xs font-medium border transition ' +
                (priority === null
                  ? 'border-gray-400 dark:border-gray-300 text-gray-700 dark:text-gray-200'
                  : 'border-gray-200 dark:border-gray-600 text-gray-400 dark:text-gray-500')
              }
            >
              None
            </button>
            {PRIORITY_ORDER.slice().reverse().map(p => {
              const cfg = PRIORITY_CONFIG[p];
              const active = priority === p;
              return (
                <button
                  key={p}
                  type="button"
                  onClick={() => setPriority(p)}
                  disabled={isSaving}
                  className="px-3 py-1 rounded-full text-xs font-medium border transition"
                  style={{
                    color: active ? '#fff' : cfg.color,
                    backgroundColor: active ? cfg.color : 'transparent',
                    borderColor: cfg.color,
                  }}
                >
                  {cfg.label}
                </button>
              );
            })}
          </div>
        </div>

        {selectedBoardId && labels.length > 0 && (
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Labels <span className="text-gray-400 font-normal">(optional)</span>
            </label>
            <div className="flex flex-wrap gap-2">
              {labels.map(l => {
                const active = selectedLabelIds.includes(l.id);
                return (
                  <button
                    key={l.id}
                    type="button"
                    onClick={() => toggleLabel(l.id)}
                    disabled={isSaving}
                    className="px-3 py-1 rounded-full text-xs font-medium border transition"
                    style={{
                      color: active ? '#fff' : l.color,
                      backgroundColor: active ? l.color : 'transparent',
                      borderColor: l.color,
                    }}
                  >
                    {l.name}
                  </button>
                );
              })}
            </div>
            {unmatchedTokens.length > 0 && (
              <p className="text-xs text-gray-400 dark:text-gray-500 mt-1.5">
                No label on this board for: {unmatchedTokens.map(t => `#${t}`).join(', ')}
              </p>
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
          <div className="grid grid-cols-2 gap-2">
            <input
              type="date"
              value={dueDate}
              onChange={e => {
                const next = e.target.value;
                setDueDate(next);
                if (!next) setDueTime('');
              }}
              className={inputClass}
              disabled={isSaving}
            />
            <select
              value={dueTime}
              onChange={e => setDueTime(e.target.value)}
              className={inputClass}
              disabled={isSaving || !dueDate}
              title="Due time in Central Time"
            >
              <option value="">No time</option>
              {TIME_OPTIONS_15_MIN.map(option => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="flex justify-end gap-3 pt-2">
          <button
            type="button"
            onClick={onClose}
            disabled={isSaving}
            className="btn-ghost px-4 py-2 rounded-lg text-sm"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={isSaving || !title.trim() || !selectedBoardId || !selectedColumnId}
            className="btn-primary px-4 py-2 rounded-lg text-sm"
          >
            {isSaving ? 'Adding...' : 'Add Card'}
          </button>
        </div>
      </div>
    </Modal>
  );
}
