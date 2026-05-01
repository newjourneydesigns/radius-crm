'use client';

import { useState, useEffect } from 'react';
import Modal from '../ui/Modal';
import LeaderCombobox from '../ui/LeaderCombobox';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';

type PrayerType = 'leader' | 'general';
interface Leader { id: number; name: string; }

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onSaved?: () => void;
}

export default function AddPrayerModal({ isOpen, onClose, onSaved }: Props) {
  const { user } = useAuth();
  const [prayerType, setPrayerType] = useState<PrayerType>('leader');
  const [leaders, setLeaders] = useState<Leader[]>([]);
  const [selectedLeaderId, setSelectedLeaderId] = useState('');
  const [content, setContent] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!isOpen) return;
    setPrayerType('leader');
    setSelectedLeaderId('');
    setContent('');
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

  const handleSave = async () => {
    if (!content.trim()) { setError('Prayer content is required.'); return; }
    if (prayerType === 'leader' && !selectedLeaderId) { setError('Please select a circle leader.'); return; }
    if (!user?.id) { setError('You must be authenticated.'); return; }

    setIsSaving(true);
    setError('');
    try {
      if (prayerType === 'leader') {
        const { error: e } = await supabase.from('acpd_prayer_points').insert({
          circle_leader_id: parseInt(selectedLeaderId),
          user_id: user.id,
          content: content.trim(),
          is_answered: false,
          is_shared: false,
        });
        if (e) throw e;
      } else {
        const { error: e } = await supabase.from('general_prayer_points').insert({
          user_id: user.id,
          content: content.trim(),
          is_answered: false,
          is_shared: false,
        });
        if (e) throw e;
      }
      onSaved?.();
      onClose();
    } catch {
      setError('Failed to save prayer. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  const inputClass = "w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-amber-500 dark:bg-gray-700 dark:text-white text-sm";

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Log a Prayer" size="md">
      <div className="space-y-4">
        {error && (
          <div className="bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 p-3 rounded-md text-sm">
            {error}
          </div>
        )}

        {/* Type toggle */}
        <div className="flex gap-1.5 p-1 bg-gray-100 dark:bg-gray-800 rounded-lg">
          <button
            type="button"
            onClick={() => setPrayerType('leader')}
            className={`flex-1 py-1.5 px-3 rounded-md text-sm font-medium transition-colors ${
              prayerType === 'leader'
                ? 'bg-amber-500 text-white shadow-sm'
                : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
            }`}
          >
            For a Leader
          </button>
          <button
            type="button"
            onClick={() => setPrayerType('general')}
            className={`flex-1 py-1.5 px-3 rounded-md text-sm font-medium transition-colors ${
              prayerType === 'general'
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
            }`}
          >
            General Prayer
          </button>
        </div>

        {prayerType === 'leader' && (
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
        )}

        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Prayer <span className="text-red-500">*</span>
          </label>
          <textarea
            rows={3}
            value={content}
            onChange={e => setContent(e.target.value)}
            placeholder={prayerType === 'leader' ? "What are you praying for this leader?" : "What are you praying for?"}
            maxLength={500}
            className={`${inputClass} resize-none`}
            disabled={isSaving}
          />
          <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">{content.length}/500</div>
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
            disabled={isSaving || !content.trim() || (prayerType === 'leader' && !selectedLeaderId)}
            className={`px-4 py-2 text-white rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-sm ${
              prayerType === 'leader' ? 'bg-amber-500 hover:bg-amber-600' : 'bg-indigo-600 hover:bg-indigo-500'
            }`}
          >
            {isSaving ? 'Saving...' : 'Save Prayer'}
          </button>
        </div>
      </div>
    </Modal>
  );
}
