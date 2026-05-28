'use client';

import { useState, useEffect, useCallback } from 'react';
import Modal from '../ui/Modal';
import CCBPersonLookup from '../ui/CCBPersonLookup';
import type { CCBPerson } from '../ui/CCBPersonLookup';
import { supabase } from '../../lib/supabase';

interface ConnectPersonModalProps {
  isOpen: boolean;
  onClose: () => void;
  leaderName: string;
  currentUserName: string;
  onSend: (personName: string, phone: string, email: string, message: string) => Promise<void>;
}

const DEFAULT_TEMPLATE = `Hi {leaderFirstName}!

{personName} would like to connect with your Circle. Please reach out to them at your earliest opportunity and share the details.

Thank you for helping them take a next step on their journey with Jesus. Let me know if you need anything from me.

{personName}{phoneLine}{emailLine}`;

const PLACEHOLDERS: { token: string; description: string }[] = [
  { token: '{leaderFirstName}', description: "Leader's first name" },
  { token: '{personName}', description: "New person's full name" },
  { token: '{phone}', description: "Phone (blank if none)" },
  { token: '{email}', description: "Email (blank if none)" },
  { token: '{phoneLine}', description: "Newline + phone, or nothing" },
  { token: '{emailLine}', description: "Newline + email, or nothing" },
  { token: '{currentUserName}', description: 'Your name' },
];

function applyTemplate(
  template: string,
  vars: { leaderFirstName: string; personName: string; phone: string; email: string; currentUserName: string }
) {
  return template
    .replaceAll('{leaderFirstName}', vars.leaderFirstName)
    .replaceAll('{personName}', vars.personName)
    .replaceAll('{currentUserName}', vars.currentUserName)
    .replaceAll('{phoneLine}', vars.phone ? `\n${vars.phone}` : '')
    .replaceAll('{emailLine}', vars.email ? `\n${vars.email}` : '')
    .replaceAll('{phone}', vars.phone)
    .replaceAll('{email}', vars.email);
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
  const [lookupKey, setLookupKey] = useState(0);

  // Template state
  const [template, setTemplate] = useState<string>(DEFAULT_TEMPLATE);
  const [isCustomTemplate, setIsCustomTemplate] = useState(false);
  const [showTemplateEditor, setShowTemplateEditor] = useState(false);
  const [draftTemplate, setDraftTemplate] = useState<string>(DEFAULT_TEMPLATE);
  const [isSavingTemplate, setIsSavingTemplate] = useState(false);
  const [templateNotice, setTemplateNotice] = useState('');

  useEffect(() => {
    setMounted(true);
  }, []);

  // Get leader's first name
  const leaderFirstName = leaderName.split(' ')[0];

  // Load saved template on open
  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    (async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        const token = session?.access_token;
        if (!token) return;
        const res = await fetch('/api/profile', {
          headers: { Authorization: `Bearer ${token}` }
        });
        if (!res.ok) return;
        const data = await res.json();
        const saved: string | null = data?.profile?.connect_person_template ?? null;
        if (cancelled) return;
        if (saved && saved.trim()) {
          setTemplate(saved);
          setDraftTemplate(saved);
          setIsCustomTemplate(true);
        } else {
          setTemplate(DEFAULT_TEMPLATE);
          setDraftTemplate(DEFAULT_TEMPLATE);
          setIsCustomTemplate(false);
        }
      } catch (e) {
        // Non-fatal — fall back to default
      }
    })();
    return () => { cancelled = true; };
  }, [isOpen]);

  // Regenerate message preview when inputs or template change
  useEffect(() => {
    if (!personName) {
      setMessage('');
      return;
    }
    setMessage(
      applyTemplate(template, {
        leaderFirstName,
        personName,
        phone,
        email,
        currentUserName,
      })
    );
  }, [personName, phone, email, leaderFirstName, currentUserName, template]);

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
      setLookupKey(k => k + 1);
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
    setLookupKey(k => k + 1);
    setShowTemplateEditor(false);
    setTemplateNotice('');
    onClose();
  };

  const handleCCBSelect = (person: CCBPerson) => {
    setPersonName(person.fullName);
    setPhone(person.mobilePhone || person.phone || '');
    setEmail(person.email || '');
  };

  const saveTemplate = useCallback(async (value: string | null) => {
    setIsSavingTemplate(true);
    setTemplateNotice('');
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) throw new Error('No auth token');
      const res = await fetch('/api/profile', {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ preferences: { connect_person_template: value } })
      });
      if (!res.ok) throw new Error('Save failed');
      if (value === null) {
        setTemplate(DEFAULT_TEMPLATE);
        setDraftTemplate(DEFAULT_TEMPLATE);
        setIsCustomTemplate(false);
        setTemplateNotice('Reset to default.');
      } else {
        setTemplate(value);
        setDraftTemplate(value);
        setIsCustomTemplate(true);
        setTemplateNotice('Template saved.');
      }
      setTimeout(() => setTemplateNotice(''), 2500);
    } catch (e) {
      setTemplateNotice('Failed to save template.');
    } finally {
      setIsSavingTemplate(false);
    }
  }, []);

  if (!mounted) return null;

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title="Connect New Person"
      size="lg"
    >
      <div className="space-y-4">
        {/* CCB Person Lookup */}
        <CCBPersonLookup
          key={lookupKey}
          onSelect={handleCCBSelect}
          autoFocus
        />

        {/* Divider */}
        <div className="relative">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-gray-200 dark:border-gray-700"></div>
          </div>
          <div className="relative flex justify-center text-xs">
            <span className="px-2 bg-white dark:bg-gray-800 text-gray-400">or enter manually</span>
          </div>
        </div>

        {/* Form Fields */}
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Person's Name <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            value={personName}
            onChange={(e) => setPersonName(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-vc-500"
            placeholder="Enter name"
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
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-vc-500"
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
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-vc-500"
            placeholder="email@example.com"
          />
        </div>

        {/* Message Preview */}
        {message && (
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                Message Preview (editable)
              </label>
              <button
                type="button"
                onClick={() => {
                  setDraftTemplate(template);
                  setShowTemplateEditor(v => !v);
                  setTemplateNotice('');
                }}
                className="text-xs text-blue-600 dark:text-blue-400 hover:underline"
              >
                {showTemplateEditor ? 'Hide template' : (isCustomTemplate ? 'Edit my default template' : 'Customize default template')}
              </button>
            </div>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={12}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-vc-500 font-mono text-sm"
            />
            <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">
              Edits here only affect this message. To change the default for every Connect, use {isCustomTemplate ? '"Edit my default template"' : '"Customize default template"'} above.
            </p>
          </div>
        )}

        {/* Template Editor */}
        {showTemplateEditor && (
          <div className="border border-blue-200 dark:border-blue-900/40 bg-blue-50/40 dark:bg-blue-900/10 rounded-md p-4 space-y-3">
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                  Your default template
                </label>
                {isCustomTemplate && (
                  <span className="text-xs text-blue-700 dark:text-blue-300">Custom</span>
                )}
              </div>
              <textarea
                value={draftTemplate}
                onChange={(e) => setDraftTemplate(e.target.value)}
                rows={10}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-vc-500 font-mono text-xs"
              />
            </div>

            <div>
              <p className="text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Available placeholders</p>
              <ul className="text-xs text-gray-600 dark:text-gray-400 grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1">
                {PLACEHOLDERS.map(p => (
                  <li key={p.token}>
                    <code className="px-1 py-0.5 rounded bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-200">{p.token}</code>
                    <span className="ml-1">— {p.description}</span>
                  </li>
                ))}
              </ul>
            </div>

            {templateNotice && (
              <div className="text-xs text-gray-600 dark:text-gray-400">{templateNotice}</div>
            )}

            <div className="flex items-center justify-between gap-2 pt-1">
              <button
                type="button"
                onClick={() => saveTemplate(null)}
                disabled={isSavingTemplate || !isCustomTemplate}
                className="text-xs text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Reset to default
              </button>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => { setDraftTemplate(template); setShowTemplateEditor(false); }}
                  disabled={isSavingTemplate}
                  className="btn-ghost px-3 py-1.5 rounded-md text-xs"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => saveTemplate(draftTemplate)}
                  disabled={isSavingTemplate || draftTemplate === template}
                  className="btn-primary px-3 py-1.5 rounded-md text-xs"
                >
                  {isSavingTemplate ? 'Saving...' : 'Save template'}
                </button>
              </div>
            </div>
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
              className="btn-ghost px-4 py-2 rounded-lg text-sm"
            >
              Cancel
            </button>
            <button
              onClick={handleSend}
              disabled={!personName.trim() || !message || isSending}
              className="btn-primary px-4 py-2 rounded-lg text-sm flex items-center gap-2"
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
