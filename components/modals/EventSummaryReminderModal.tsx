'use client';

import { useState, useEffect } from 'react';
import Modal from '../ui/Modal';

interface EventSummaryReminderModalProps {
  isOpen: boolean;
  onClose: () => void;
  leaderName: string;
  sentMessages: number[]; // Array of message numbers already sent this week (e.g., [1, 2])
  onSend: (messageNumber: number, messageText: string) => Promise<void>;
}

const MESSAGE_OPTIONS = [
  {
    number: 1,
    label: 'Initial message',
    template: (leaderFirstName: string) => 
      `Hi, When you have a moment, would you mind sending in your event summary?`
  },
  {
    number: 2,
    label: 'Second follow-up',
    template: (leaderFirstName: string) => 
      `Just checking back in on your event summary when you have a chance. It usually only takes about five minutes and really helps us understand where your Circle and our campus are.`
  },
  {
    number: 3,
    label: 'Third follow-up',
    template: (leaderFirstName: string) => 
      `Hey ${leaderFirstName}, I wanted to follow up once more on your event summary. Completing it shortly after Circle helps us stay connected to what’s happening in your Circle and across the campus.`
  }
];

export default function EventSummaryReminderModal({
  isOpen,
  onClose,
  leaderName,
  sentMessages,
  onSend
}: EventSummaryReminderModalProps) {
  const [mounted, setMounted] = useState(false);
  const [selectedMessage, setSelectedMessage] = useState<number | null>(null);
  const [editedMessage, setEditedMessage] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState('');
  const [copySuccess, setCopySuccess] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Get leader's first name
  const leaderFirstName = leaderName.split(' ')[0];

  // Handle message selection
  const handleSelectMessage = (messageNumber: number) => {
    setSelectedMessage(messageNumber);
    const option = MESSAGE_OPTIONS.find(opt => opt.number === messageNumber);
    if (option) {
      setEditedMessage(option.template(leaderFirstName));
    }
    setError('');
    setCopySuccess(false);
  };

  const handleSend = async () => {
    if (!selectedMessage || !editedMessage.trim()) {
      setError('Please select a message');
      return;
    }

    setError('');
    setIsSending(true);

    try {
      await onSend(selectedMessage, editedMessage);
      // Reset form
      setSelectedMessage(null);
      setEditedMessage('');
      onClose();
    } catch (err) {
      setError('Failed to send. Please try again.');
    } finally {
      setIsSending(false);
    }
  };

  const handleCopyOnly = async () => {
    if (!editedMessage.trim()) {
      setError('Please select a message');
      return;
    }

    try {
      await navigator.clipboard.writeText(editedMessage);
      setCopySuccess(true);
      setTimeout(() => setCopySuccess(false), 2000);
      
      // Still track as sent
      if (selectedMessage) {
        await onSend(selectedMessage, editedMessage);
        setSelectedMessage(null);
        setEditedMessage('');
        onClose();
      }
    } catch (err) {
      setError('Failed to copy message');
    }
  };

  const handleClose = () => {
    setSelectedMessage(null);
    setEditedMessage('');
    setError('');
    setCopySuccess(false);
    onClose();
  };

  if (!mounted) return null;

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title="Event Summary Reminder"
      size="lg"
    >
      <div className="space-y-4">
        {/* Message Options */}
        <div className="space-y-2">
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Choose a message template:
          </label>
          
          {MESSAGE_OPTIONS.map((option) => {
            const isSent = sentMessages.includes(option.number);
            return (
              <button
                key={option.number}
                onClick={() => handleSelectMessage(option.number)}
                className={`w-full text-left px-4 py-3 rounded-lg border-2 transition-all ${
                  selectedMessage === option.number
                    ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/30'
                    : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
                } ${isSent ? 'bg-green-50 dark:bg-green-900/20' : ''}`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-gray-900 dark:text-white">
                      {option.label}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    {isSent && (
                      <span className="inline-flex items-center gap-1 text-xs font-medium text-green-700 dark:text-green-400 bg-green-100 dark:bg-green-900/40 px-2 py-0.5 rounded-full">
                        <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                        </svg>
                        Sent
                      </span>
                    )}
                    <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${
                      selectedMessage === option.number
                        ? 'border-blue-500 bg-blue-500'
                        : 'border-gray-300 dark:border-gray-600'
                    }`}>
                      {selectedMessage === option.number && (
                        <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                        </svg>
                      )}
                    </div>
                  </div>
                </div>
              </button>
            );
          })}
        </div>

        {/* Message Preview/Editor */}
        {selectedMessage && (
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Message (editable)
            </label>
            <textarea
              value={editedMessage}
              onChange={(e) => setEditedMessage(e.target.value)}
              rows={8}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono text-sm"
            />
          </div>
        )}

        {/* Error Message */}
        {error && (
          <div className="text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 px-3 py-2 rounded-md">
            {error}
          </div>
        )}

        {/* Copy Success Message */}
        {copySuccess && (
          <div className="text-sm text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-900/20 px-3 py-2 rounded-md">
            Message copied to clipboard!
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex items-center justify-between gap-3 pt-2">
          <button
            onClick={handleCopyOnly}
            disabled={!selectedMessage || isSending}
            className="text-sm text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Copy Only
          </button>

          <div className="flex gap-2">
            <button
              onClick={handleClose}
              disabled={isSending}
              className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md hover:bg-gray-50 dark:hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Cancel
            </button>
            <button
              onClick={handleSend}
              disabled={!selectedMessage || isSending}
              className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {isSending ? (
                <>
                  <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Sending...
                </>
              ) : (
                'Send Message'
              )}
            </button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
