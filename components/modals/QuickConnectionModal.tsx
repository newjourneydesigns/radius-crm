'use client';

import { useState, useEffect } from 'react';
import Modal from '../ui/Modal';
import LeaderCombobox from '../ui/LeaderCombobox';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';

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
  const [date, setDate] = useState('');
  const [connectionTypeId, setConnectionTypeId] = useState('');
  const [note, setNote] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!isOpen) return;
    setDate(new Date().toISOString().split('T')[0]);
    setSelectedLeaderId('');
    setConnectionTypeId('');
    setNote('');
    setError('');
    loadData();
  }, [isOpen]);

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
      const formattedDate = new Date(date + 'T00:00:00').toLocaleDateString('en-US', {
        year: 'numeric', month: 'short', day: 'numeric',
      });

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
            className="px-4 py-2 text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-600 hover:bg-gray-200 dark:hover:bg-gray-500 rounded-md transition-colors text-sm"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={isSaving || !selectedLeaderId || !date || !connectionTypeId}
            className="px-4 py-2 text-white bg-teal-600 hover:bg-teal-700 rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-sm"
          >
            {isSaving ? 'Saving...' : 'Save Connection'}
          </button>
        </div>
      </div>
    </Modal>
  );
}
