'use client';

import { useState, useEffect, useMemo } from 'react';
import Modal from '../ui/Modal';
import LeaderCombobox from '../ui/LeaderCombobox';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { formatDateOnlyForDisplay, getTodayDateString } from '../../lib/dateUtils';
import { clearTodayCache } from '../../hooks/useTodayData';
import { parseQuickAdd } from '../../lib/quickAddParser';

function nowCST(): Date {
  return new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Chicago' }));
}

interface Leader { id: number; name: string; }
interface ConnectionType { id: number; name: string; active: boolean; }

const DEFAULT_CONNECTION_TYPES: ConnectionType[] = [
  { id: 1, name: 'In-Person', active: true },
  { id: 2, name: 'Phone Call', active: true },
  { id: 3, name: 'Text', active: true },
  { id: 4, name: 'Email', active: true },
  { id: 5, name: 'One-on-One', active: true },
  { id: 6, name: 'Circle Visit', active: true },
  { id: 7, name: 'Circle Leader Equipping', active: true },
  { id: 9, name: 'Event Summary Follow-up', active: true },
  { id: 8, name: 'Other', active: true },
];

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onSaved?: () => void;
}

export default function QuickConnectionModal({ isOpen, onClose, onSaved }: Props) {
  const { user } = useAuth();
  const [leaders, setLeaders] = useState<Leader[]>([]);
  const [connectionTypes, setConnectionTypes] = useState<ConnectionType[]>(DEFAULT_CONNECTION_TYPES);
  const [selectedLeaderId, setSelectedLeaderId] = useState('');
  const [quickInput, setQuickInput] = useState('');
  const [date, setDate] = useState('');
  const [connectionTypeId, setConnectionTypeId] = useState('');
  const [note, setNote] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  const parsed = useMemo(
    () => (quickInput.trim() ? parseQuickAdd(quickInput, nowCST()) : null),
    [quickInput]
  );

  useEffect(() => {
    if (!isOpen) return;
    setDate(getTodayDateString());
    setSelectedLeaderId('');
    setQuickInput('');
    setConnectionTypeId('');
    setNote('');
    setError('');
    loadData();
  }, [isOpen]);

  const handleQuickInputChange = (value: string) => {
    setQuickInput(value);
    const result = value.trim() ? parseQuickAdd(value, nowCST()) : null;
    setNote(result ? result.title : '');
    if (result?.dueDate) {
      setDate(result.dueDate);
    } else if (!value.trim()) {
      setDate(getTodayDateString());
    }
  };

  const loadData = async () => {
    setIsLoading(true);
    try {
      const [leadersRes, typesRes] = await Promise.all([
        supabase.from('circle_leaders').select('id, name').order('name'),
        supabase.from('connection_types').select('*').eq('active', true).order('name'),
      ]);
      if (leadersRes.data) setLeaders(leadersRes.data);
      if (typesRes.data && !typesRes.error) setConnectionTypes(typesRes.data);
    } catch {
      // leaders stay empty, connection types keep defaults
    } finally {
      setIsLoading(false);
    }
  };

  const handleSave = async () => {
    if (!selectedLeaderId || !date || !connectionTypeId) {
      setError('Please fill in all required fields.');
      return;
    }
    setIsSaving(true);
    setError('');
    try {
      const leaderId = parseInt(selectedLeaderId);
      const typeId = parseInt(connectionTypeId);
      const typeName = connectionTypes.find(t => t.id === typeId)?.name || 'Unknown';
      const formattedDate = formatDateOnlyForDisplay(date);

      await supabase.from('connections').insert({
        circle_leader_id: leaderId,
        date_of_connection: date,
        connection_type_id: typeId,
        note: note.trim() || null,
      });

      const { error: noteError } = await supabase.from('notes').insert({
        circle_leader_id: leaderId,
        content: `Connection on ${formattedDate} via ${typeName}${note.trim() ? `: ${note.trim()}` : ''}`,
        user_id: user?.id || null,
      });
      if (noteError) throw noteError;

      await supabase.from('circle_leaders')
        .update({ last_connection: date, last_check_in_date: date })
        .eq('id', leaderId);

      clearTodayCache();
      // Notify any subscribed page (Connection Tracker, Today) to reload
      window.dispatchEvent(new CustomEvent('radius:connection-saved'));
      onSaved?.();
      onClose();
    } catch {
      setError('Failed to save connection. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  const inputClass = "w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-teal-500 dark:bg-gray-700 dark:text-white text-sm";

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Log a Connection" size="md">
      <div className="space-y-4">
        {error && (
          <div className="bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 p-3 rounded-md text-sm">
            {error}
          </div>
        )}

        {/* Quick add */}
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Quick add
          </label>
          <input
            type="text"
            value={quickInput}
            onChange={e => handleQuickInputChange(e.target.value)}
            placeholder="Called Sarah yesterday"
            className={inputClass}
            disabled={isSaving}
            autoFocus
          />
          {parsed && parsed.tokens.filter(t => t.type === 'date' || t.type === 'time').length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-2">
              {parsed.tokens.filter(t => t.type === 'date' || t.type === 'time').map((t, i) => (
                <span
                  key={`${t.type}-${i}`}
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300"
                >
                  {t.text}
                </span>
              ))}
            </div>
          )}
          <p className="text-xs text-gray-400 dark:text-gray-500 mt-1.5">
            Type a date (&ldquo;yesterday&rdquo;, &ldquo;last week&rdquo;) to set the connection date. Everything below stays editable.
          </p>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Circle Leader <span className="text-red-500">*</span>
          </label>
          <LeaderCombobox
            leaders={leaders}
            value={selectedLeaderId}
            onChange={setSelectedLeaderId}
            disabled={isSaving}
            isLoading={isLoading}
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Date <span className="text-red-500">*</span>
          </label>
          <input
            type="date"
            value={date}
            onChange={e => setDate(e.target.value)}
            className={inputClass}
            disabled={isSaving}
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Connection Type <span className="text-red-500">*</span>
          </label>
          <select
            value={connectionTypeId}
            onChange={e => setConnectionTypeId(e.target.value)}
            className={inputClass}
            disabled={isSaving}
          >
            <option value="">Select connection type...</option>
            {connectionTypes.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Note <span className="text-gray-400 font-normal">(optional)</span>
          </label>
          <textarea
            rows={2}
            value={note}
            onChange={e => setNote(e.target.value)}
            placeholder="Any additional details..."
            className={`${inputClass} resize-none`}
            disabled={isSaving}
          />
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
            disabled={isSaving || !selectedLeaderId || !date || !connectionTypeId}
            className="btn-primary px-4 py-2 rounded-lg text-sm"
          >
            {isSaving ? 'Saving...' : 'Save Connection'}
          </button>
        </div>
      </div>
    </Modal>
  );
}
