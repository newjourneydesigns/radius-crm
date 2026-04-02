'use client';

import { useState, useEffect } from 'react';
import Modal from '../ui/Modal';
import { supabase } from '../../lib/supabase';

interface EventSummaryReminderModalProps {
  isOpen: boolean;
  onClose: () => void;
  leaderName: string;
  sentMessages: number[]; // Array of message numbers already sent this week (e.g., [1, 2])
  onSend: (messageNumber: number, messageText: string) => Promise<void>;
}

const DEFAULT_TEMPLATES: Record<number, (firstName: string) => string> = {
  1: () => `Hi, When you have a moment, would you mind sending in your event summary?`,
  2: () => `Just checking back in on your event summary when you have a chance. It usually only takes about five minutes and really helps us understand where your Circle and our campus are.`,
  3: (firstName) => `Hey ${firstName}, I wanted to follow up once more on your event summary. Completing it shortly after Circle helps us stay connected to what's happening in your Circle and across the campus.`,
};

const MESSAGE_LABELS: Record<number, string> = {
  1: 'Initial message',
  2: 'Second follow-up',
  3: 'Third follow-up',
};

export default function EventSummaryReminderModal({
  isOpen,
  onClose,
  leaderName,
  sentMessages,
  onSend,
}: EventSummaryReminderModalProps) {
  const [mounted, setMounted] = useState(false);
  const [selectedMessage, setSelectedMessage] = useState<number | null>(null);
  const [editedMessage, setEditedMessage] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState('');
  const [copySuccess, setCopySuccess] = useState(false);

  // Per-user saved templates (null = use default)
  const [userTemplates, setUserTemplates] = useState<Record<number, string | null>>({ 1: null, 2: null, 3: null });
  const [loadingTemplates, setLoadingTemplates] = useState(false);
  const [savingTemplate, setSavingTemplate] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Load user's saved templates when modal opens
  useEffect(() => {
    if (!isOpen) return;
    const load = async () => {
      setLoadingTemplates(true);
      try {
        const { data: { session } } = await supabase.auth.getSession();
        const token = session?.access_token;
        if (!token) return;
        const res = await fetch('/api/reminder-templates', {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          const json = await res.json();
          setUserTemplates(json.templates);
        }
      } catch {
        // Non-fatal — defaults will be used
      } finally {
        setLoadingTemplates(false);
      }
    };
    load();
  }, [isOpen]);

  const leaderFirstName = leaderName.split(' ')[0];

  const resolvedTemplate = (messageNumber: number): string => {
    const saved = userTemplates[messageNumber];
    if (saved) return saved;
    return DEFAULT_TEMPLATES[messageNumber](leaderFirstName);
  };

  const handleSelectMessage = (messageNumber: number) => {
    setSelectedMessage(messageNumber);
    setEditedMessage(resolvedTemplate(messageNumber));
    setError('');
    setCopySuccess(false);
    setSaveSuccess(false);
  };

  const handleSaveAsDefault = async () => {
    if (!selectedMessage || !editedMessage.trim()) return;
    setSavingTemplate(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      const res = await fetch('/api/reminder-templates', {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ messageNumber: selectedMessage, text: editedMessage }),
      });
      if (res.ok) {
        setUserTemplates(prev => ({ ...prev, [selectedMessage]: editedMessage }));
        setSaveSuccess(true);
        setTimeout(() => setSaveSuccess(false), 2500);
      } else {
        setError('Failed to save template');
      }
    } catch {
      setError('Failed to save template');
    } finally {
      setSavingTemplate(false);
    }
  };

  const handleResetToDefault = async () => {
    if (!selectedMessage) return;
    setSavingTemplate(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      const res = await fetch('/api/reminder-templates', {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ messageNumber: selectedMessage, text: '' }),
      });
      if (res.ok) {
        setUserTemplates(prev => ({ ...prev, [selectedMessage]: null }));
        setEditedMessage(DEFAULT_TEMPLATES[selectedMessage](leaderFirstName));
        setSaveSuccess(true);
        setTimeout(() => setSaveSuccess(false), 2500);
      }
    } catch {
      setError('Failed to reset template');
    } finally {
      setSavingTemplate(false);
    }
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
      setSelectedMessage(null);
      setEditedMessage('');
      onClose();
    } catch {
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
      if (selectedMessage) {
        await onSend(selectedMessage, editedMessage);
        setSelectedMessage(null);
        setEditedMessage('');
        onClose();
      }
    } catch {
      setError('Failed to copy message');
    }
  };

  const handleClose = () => {
    setSelectedMessage(null);
    setEditedMessage('');
    setError('');
    setCopySuccess(false);
    setSaveSuccess(false);
    onClose();
  };

  if (!mounted) return null;

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title="Event Summary Reminder" size="lg">
      <div className="space-y-4">
        {/* Message Options */}
        <div className="space-y-2">
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Choose a message template:
          </label>

          {[1, 2, 3].map((num) => {
            const isSent = sentMessages.includes(num);
            const hasCustom = !!userTemplates[num];
            return (
              <button
                key={num}
                onClick={() => handleSelectMessage(num)}
                className={`w-full text-left px-4 py-3 rounded-lg border-2 transition-all ${
                  selectedMessage === num
                    ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/30'
                    : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
                } ${isSent ? 'bg-green-50 dark:bg-green-900/20' : ''}`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-gray-900 dark:text-white">
                      {MESSAGE_LABELS[num]}
                    </span>
                    {hasCustom && (
                      <span className="text-xs text-blue-600 dark:text-blue-400 font-medium">
                        Custom
                      </span>
                    )}
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
                      selectedMessage === num
                        ? 'border-blue-500 bg-blue-500'
                        : 'border-gray-300 dark:border-gray-600'
                    }`}>
                      {selectedMessage === num && (
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

        {/* Message Editor */}
        {selectedMessage && (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                Message (editable)
              </label>
              <div className="flex items-center gap-3">
                {userTemplates[selectedMessage] && (
                  <button
                    onClick={handleResetToDefault}
                    disabled={savingTemplate}
                    className="text-xs text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 disabled:opacity-50"
                  >
                    Reset to default
                  </button>
                )}
                <button
                  onClick={handleSaveAsDefault}
                  disabled={savingTemplate || !editedMessage.trim()}
                  className="text-xs text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-200 font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {savingTemplate ? 'Saving...' : 'Save as my default'}
                </button>
              </div>
            </div>
            <textarea
              value={editedMessage}
              onChange={(e) => setEditedMessage(e.target.value)}
              rows={8}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono text-sm"
            />
            {saveSuccess && (
              <p className="text-xs text-green-600 dark:text-green-400">
                Template saved — this will load by default next time.
              </p>
            )}
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 px-3 py-2 rounded-md">
            {error}
          </div>
        )}

        {/* Copy Success */}
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
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
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
