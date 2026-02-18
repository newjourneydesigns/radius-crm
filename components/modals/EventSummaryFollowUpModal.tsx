'use client';

import { useState, useEffect } from 'react';
import Modal from '../ui/Modal';

interface EventSummaryFollowUpModalProps {
  isOpen: boolean;
  onClose: () => void;
  leaderName: string;
  eventTitle: string;
  eventDate: string;
  onSave: (message: string) => Promise<void>;
}

export default function EventSummaryFollowUpModal({
  isOpen,
  onClose,
  leaderName,
  eventTitle,
  eventDate,
  onSave
}: EventSummaryFollowUpModalProps) {
  const [mounted, setMounted] = useState(false);
  const [message, setMessage] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    setMounted(true);
  }, []);

  // Initialize with a default template when modal opens
  useEffect(() => {
    if (isOpen && !message) {
      const dateStr = formatEventDate(eventDate);
      const defaultMessage = `Event Summary Follow Up - ${eventTitle}\nDate: ${dateStr}\n\n`;
      setMessage(defaultMessage);
    }
  }, [isOpen, eventTitle, eventDate]);

  const formatEventDate = (dateStr: string) => {
    try {
      const d = new Date(dateStr + 'T00:00:00');
      if (!isNaN(d.getTime())) {
        return d.toLocaleDateString('en-US', {
          weekday: 'long',
          year: 'numeric',
          month: 'long',
          day: 'numeric',
        });
      }
      return dateStr;
    } catch {
      return dateStr;
    }
  };

  const handleSave = async () => {
    if (!message.trim()) {
      setError('Please enter a message');
      return;
    }

    setError('');
    setIsSaving(true);

    try {
      await onSave(message);
      // Reset form and close
      setMessage('');
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to save. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleClose = () => {
    setMessage('');
    setError('');
    onClose();
  };

  if (!mounted) return null;

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title={`Event Summary Follow Up - ${leaderName}`}
      size="lg"
    >
      <div className="space-y-4">
        {/* Event Info */}
        <div className="bg-blue-50 dark:bg-blue-900/20 p-3 rounded-md text-sm">
          <p className="font-medium text-blue-900 dark:text-blue-300">{eventTitle}</p>
          <p className="text-blue-700 dark:text-blue-400 mt-1">{formatEventDate(eventDate)}</p>
        </div>

        {/* Message Editor */}
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Follow-up Message
          </label>
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            rows={10}
            placeholder="Enter your follow-up notes about this event..."
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm resize-y"
          />
        </div>

        {/* Error Message */}
        {error && (
          <div className="text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 px-3 py-2 rounded-md">
            {error}
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex items-center justify-end gap-2 pt-2">
          <button
            onClick={handleClose}
            disabled={isSaving}
            className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md hover:bg-gray-50 dark:hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={!message.trim() || isSaving}
            className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {isSaving ? (
              <>
                <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                Saving...
              </>
            ) : (
              'Save to Profile Notes'
            )}
          </button>
        </div>
      </div>
    </Modal>
  );
}
