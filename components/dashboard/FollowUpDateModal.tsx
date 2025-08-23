'use client';

import { useState } from 'react';
import Modal from '../ui/Modal';

interface FollowUpDateModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (date: string) => void;
  leaderName: string;
  existingDate?: string;
  isEditing?: boolean;
}

export default function FollowUpDateModal({
  isOpen,
  onClose,
  onConfirm,
  leaderName,
  existingDate,
  isEditing = false
}: FollowUpDateModalProps) {
  const [followUpDate, setFollowUpDate] = useState(existingDate || '');
  const [error, setError] = useState('');

  // Get tomorrow's date as minimum selectable date (unless editing existing date)
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const minDate = isEditing ? undefined : tomorrow.toISOString().split('T')[0];

  // Get max date (6 months from now)
  const maxDate = new Date();
  maxDate.setMonth(maxDate.getMonth() + 6);
  const maxDateString = maxDate.toISOString().split('T')[0];

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!followUpDate) {
      setError('Please select a follow-up date');
      return;
    }

    // Only validate future date for new follow-ups, not when editing
    if (!isEditing) {
      const selectedDate = new Date(followUpDate);
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      if (selectedDate <= today) {
        setError('Follow-up date must be in the future');
        return;
      }
    }

    onConfirm(followUpDate);
    handleClose();
  };

  const handleClose = () => {
    setFollowUpDate(existingDate || '');
    setError('');
    onClose();
  };

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title={isEditing ? "Edit Follow-Up Date" : "Set Follow-Up Date"}>
      <div className="p-6">
        <p className="text-sm text-gray-600 dark:text-gray-400 mb-6">
          {isEditing 
            ? `Editing follow-up date for ${leaderName}. When should you follow up with this Circle Leader?`
            : `Setting follow-up status for ${leaderName}. When should you follow up with this Circle Leader?`
          }
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="followUpDate" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Follow-Up Date
            </label>
            <input
              type="date"
              id="followUpDate"
              value={followUpDate}
              onChange={(e) => {
                setFollowUpDate(e.target.value);
                setError('');
              }}
              min={minDate}
              max={maxDateString}
              className="w-full px-4 py-3 border border-gray-300/30 dark:border-gray-600/30 rounded-xl shadow-sm bg-white/50 dark:bg-gray-700/30 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500/50 backdrop-blur-sm transition-all duration-200"
              required
            />
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              {isEditing 
                ? 'Select a new follow-up date'
                : 'Select a date between tomorrow and 6 months from now'
              }
            </p>
          </div>

          {error && (
            <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-md p-3">
              <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
            </div>
          )}

          <div className="flex justify-end space-x-2 pt-6">
            <button
              type="button"
              onClick={handleClose}
              className="px-6 py-2.5 text-sm font-medium text-gray-700 dark:text-gray-300 bg-gray-50/50 dark:bg-gray-700/30 border border-gray-300/30 dark:border-gray-600/30 rounded-xl hover:bg-gray-100/60 dark:hover:bg-gray-600/40 focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition-all duration-200 hover:scale-[1.02] active:scale-[0.98] backdrop-blur-sm"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-6 py-2.5 text-sm font-medium text-white bg-orange-600/90 hover:bg-orange-600 rounded-xl focus:outline-none focus:ring-2 focus:ring-orange-500/20 transition-all duration-200 hover:scale-[1.02] active:scale-[0.98] shadow-lg hover:shadow-xl"
            >
              {isEditing ? 'Update Follow-Up' : 'Set Follow-Up'}
            </button>
          </div>
        </form>
      </div>
    </Modal>
  );
}
