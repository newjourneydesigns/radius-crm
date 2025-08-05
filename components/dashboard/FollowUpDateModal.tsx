'use client';

import { useState } from 'react';
import Modal from '../ui/Modal';

interface FollowUpDateModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (date: string) => void;
  leaderName: string;
}

export default function FollowUpDateModal({
  isOpen,
  onClose,
  onConfirm,
  leaderName
}: FollowUpDateModalProps) {
  const [followUpDate, setFollowUpDate] = useState('');
  const [error, setError] = useState('');

  // Get tomorrow's date as minimum selectable date
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const minDate = tomorrow.toISOString().split('T')[0];

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

    const selectedDate = new Date(followUpDate);
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    if (selectedDate <= today) {
      setError('Follow-up date must be in the future');
      return;
    }

    onConfirm(followUpDate);
    handleClose();
  };

  const handleClose = () => {
    setFollowUpDate('');
    setError('');
    onClose();
  };

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title="Set Follow-Up Date">
      <div className="p-6">
        <p className="text-sm text-gray-600 dark:text-gray-400 mb-6">
          Setting follow-up status for <span className="font-medium">{leaderName}</span>. 
          When should you follow up with this Circle Leader?
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
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-blue-500 focus:border-blue-500"
              required
            />
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              Select a date between tomorrow and 6 months from now
            </p>
          </div>

          {error && (
            <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-md p-3">
              <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
            </div>
          )}

          <div className="flex justify-end space-x-3 pt-4">
            <button
              type="button"
              onClick={handleClose}
              className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md hover:bg-gray-50 dark:hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 text-sm font-medium text-white bg-orange-600 hover:bg-orange-700 rounded-md focus:outline-none focus:ring-2 focus:ring-orange-500"
            >
              Set Follow-Up
            </button>
          </div>
        </form>
      </div>
    </Modal>
  );
}
