'use client';

import { useState, useEffect } from 'react';
import Modal from '../ui/Modal';
import LeaderCombobox from '../ui/LeaderCombobox';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';

interface Leader { id: number; name: string; }

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onSaved?: () => void;
}

export default function SetFollowUpModal({ isOpen, onClose, onSaved }: Props) {
  const { user } = useAuth();
  const [leaders, setLeaders] = useState<Leader[]>([]);
  const [selectedLeaderId, setSelectedLeaderId] = useState('');
  const [followUpDate, setFollowUpDate] = useState('');
  const [followUpNote, setFollowUpNote] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!isOpen) return;
    setSelectedLeaderId('');
    setFollowUpDate('');
    setFollowUpNote('');
    setError('');
    loadLeaders();
  }, [isOpen]);

  const loadLeaders = async () => {
    setIsLoading(true);
    try {
      const { data } = await supabase.from('circle_leaders').select('id, name').order('name');
      setLeaders(data || []);
    } finally {
      setIsLoading(false);
    }
  };

  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const minDate = tomorrow.toISOString().split('T')[0];

  const maxDate = new Date();
  maxDate.setMonth(maxDate.getMonth() + 6);
  const maxDateStr = maxDate.toISOString().split('T')[0];

  const handleSave = async () => {
    if (!selectedLeaderId) { setError('Please select a circle leader.'); return; }
    if (!followUpDate) { setError('Please select a follow-up date.'); return; }

    const leaderId = parseInt(selectedLeaderId, 10);

    setIsSaving(true);
    setError('');
    try {
      const { error: e } = await supabase.from('circle_leaders')
        .update({
          follow_up_required: true,
          follow_up_date: followUpDate,
          follow_up_note: followUpNote.trim() || null,
        })
        .eq('id', leaderId);
      if (e) throw e;

      const trimmedFollowUpNote = followUpNote.trim();
      if (trimmedFollowUpNote) {
        const dateLabel = new Date(followUpDate + 'T00:00:00').toLocaleDateString('en-US', {
          month: 'short',
          day: 'numeric',
          year: 'numeric',
        });
        const notePayload: { circle_leader_id: number; content: string; created_by?: string } = {
          circle_leader_id: leaderId,
          content: `Follow-up set for ${dateLabel}:\n${trimmedFollowUpNote}`,
        };

        if (user?.id) {
          notePayload.created_by = user.id;
        }

        const { error: noteError } = await supabase.from('notes').insert(notePayload);
        if (noteError) {
          console.error('Error adding follow-up note to notes timeline:', noteError);
        }
      }

      onSaved?.();
      onClose();
    } catch {
      setError('Failed to set follow-up. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  const inputClass = "w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-orange-500 dark:bg-gray-700 dark:text-white text-sm";

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Set a Follow-Up" size="md">
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
            Follow-Up Date <span className="text-red-500">*</span>
          </label>
          <input
            type="date"
            value={followUpDate}
            onChange={e => setFollowUpDate(e.target.value)}
            min={minDate}
            max={maxDateStr}
            className={inputClass}
            disabled={isSaving}
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Note <span className="text-gray-400 font-normal">(optional)</span>
          </label>
          <input
            type="text"
            value={followUpNote}
            onChange={e => setFollowUpNote(e.target.value)}
            placeholder="What do you need to follow up about?"
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
            disabled={isSaving || !selectedLeaderId || !followUpDate}
            className="px-4 py-2 text-white bg-orange-600 hover:bg-orange-700 rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-sm"
          >
            {isSaving ? 'Saving...' : 'Set Follow-Up'}
          </button>
        </div>
      </div>
    </Modal>
  );
}
