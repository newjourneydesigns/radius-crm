'use client';

import { useState } from 'react';
import Modal from '../ui/Modal';

const TIME_OPTIONS_15_MIN = Array.from({ length: 96 }, (_, index) => {
  const totalMinutes = index * 15;
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  const period = hours >= 12 ? 'PM' : 'AM';
  const hour12 = hours % 12 || 12;
  const label = `${hour12}:${minutes.toString().padStart(2, '0')} ${period}`;
  const value = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
  return { label, value };
});

interface FollowUpDateModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (date: string, time?: string) => void;
  leaderName: string;
  existingDate?: string;
  existingTime?: string;
  isEditing?: boolean;
}

export default function FollowUpDateModal({
  isOpen,
  onClose,
  onConfirm,
  leaderName,
  existingDate,
  existingTime,
  isEditing = false
}: FollowUpDateModalProps) {
  const [followUpDate, setFollowUpDate] = useState(existingDate || '');
  const [followUpTime, setFollowUpTime] = useState(existingTime || '');
  const [error, setError] = useState('');

  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const minDate = isEditing ? undefined : tomorrow.toISOString().split('T')[0];

  const maxDate = new Date();
  maxDate.setMonth(maxDate.getMonth() + 6);
  const maxDateString = maxDate.toISOString().split('T')[0];

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!followUpDate) {
      setError('Please select a follow-up date');
      return;
    }

    if (!isEditing) {
      const selectedDate = new Date(followUpDate);
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      if (selectedDate <= today) {
        setError('Follow-up date must be in the future');
        return;
      }
    }

    onConfirm(followUpDate, followUpTime || undefined);
    handleClose();
  };

  const handleClose = () => {
    setFollowUpDate(existingDate || '');
    setFollowUpTime(existingTime || '');
    setError('');
    onClose();
  };

  const inputClass = "w-full px-4 py-3 border border-gray-300/30 dark:border-gray-600/30 rounded-xl shadow-sm bg-white/50 dark:bg-gray-700/30 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-vc-500/20 focus:border-vc-500/50 backdrop-blur-sm transition-all duration-200";

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
          <div className="flex gap-3">
            <div className="flex-1">
              <label htmlFor="followUpDate" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Date
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
                className={inputClass}
                required
              />
            </div>
            <div className="flex-1">
              <label htmlFor="followUpTime" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Time <span className="text-gray-400 font-normal">(optional)</span>
              </label>
              <select
                id="followUpTime"
                value={followUpTime}
                onChange={(e) => setFollowUpTime(e.target.value)}
                className={inputClass}
              >
                <option value="">No time</option>
                {TIME_OPTIONS_15_MIN.map(option => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </div>
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
              className="px-6 py-2.5 text-sm font-medium text-gray-700 dark:text-gray-300 bg-gray-50/50 dark:bg-gray-700/30 border border-gray-300/30 dark:border-gray-600/30 rounded-xl hover:bg-gray-100/60 dark:hover:bg-gray-600/40 focus:outline-none focus:ring-2 focus:ring-vc-500/20 transition-all duration-200 hover:scale-[1.02] active:scale-[0.98] backdrop-blur-sm"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="btn-success px-6 py-2.5 text-sm rounded-xl"
            >
              {isEditing ? 'Update Follow-Up' : 'Set Follow-Up'}
            </button>
          </div>
        </form>
      </div>
    </Modal>
  );
}
