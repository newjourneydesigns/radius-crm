'use client';

import { useState, useEffect } from 'react';
import Modal from '../ui/Modal';

interface ConnectPersonModalProps {
  isOpen: boolean;
  onClose: () => void;
  leaderName: string;
  currentUserName: string;
  onSend: (personName: string, phone: string, email: string, message: string) => Promise<void>;
}

export default function ConnectPersonModal({
  isOpen,
  onClose,
  leaderName,
  currentUserName,
  onSend
}: ConnectPersonModalProps) {
  const [mounted, setMounted] = useState(false);
  const [personName, setPersonName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState('');
  const [copySuccess, setCopySuccess] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Get leader's first name
  const leaderFirstName = leaderName.split(' ')[0];

  // Generate message template
  useEffect(() => {
    if (!personName) {
      setMessage('');
      return;
    }

    let template = `Hi ${leaderFirstName}!

${personName} would like to connect with your Circle. Please reach out to them at your earliest opportunity and share the details.

Thank you for helping them take a next step on their journey with Jesus. Let me know if you need anything from me.

${personName}`;

    if (phone) {
      template += `\n${phone}`;
    }
    
    if (email) {
      template += `\n${email}`;
    }

    setMessage(template);
  }, [personName, phone, email, leaderFirstName]);

  const handleSend = async () => {
    if (!personName.trim()) {
      setError('Please enter the person\'s name');
      return;
    }

    setError('');
    setIsSending(true);

    try {
      await onSend(personName.trim(), phone.trim(), email.trim(), message);
      // Reset form
      setPersonName('');
      setPhone('');
      setEmail('');
      setMessage('');
      onClose();
    } catch (err) {
      setError('Failed to send. Please try again.');
    } finally {
      setIsSending(false);
    }
  };

  const handleCopyOnly = async () => {
    try {
      await navigator.clipboard.writeText(message);
      setCopySuccess(true);
      setTimeout(() => setCopySuccess(false), 2000);
    } catch (err) {
      setError('Failed to copy message');
    }
  };

  const handleClose = () => {
    setPersonName('');
    setPhone('');
    setEmail('');
    setMessage('');
    setError('');
    setCopySuccess(false);
    onClose();
  };

  if (!mounted) return null;

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title="Connect New Person"
      size="lg"
    >
      <div className="space-y-4">
        {/* Form Fields */}
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Person's Name <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            value={personName}
            onChange={(e) => setPersonName(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="Enter name"
            autoFocus
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Phone <span className="text-gray-400 text-xs">(optional)</span>
          </label>
          <input
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="(555) 555-5555"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Email <span className="text-gray-400 text-xs">(optional)</span>
          </label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="email@example.com"
          />
        </div>

        {/* Message Preview */}
        {message && (
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Message Preview (editable)
            </label>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={12}
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
            disabled={!message || isSending}
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
              disabled={!personName.trim() || !message || isSending}
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
