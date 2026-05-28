'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import Modal from '../ui/Modal';
import CCBPersonLookup from '../ui/CCBPersonLookup';
import type { CCBPerson } from '../ui/CCBPersonLookup';
import { formatFrequencyLabel } from '../../lib/frequencyUtils';
import { supabase } from '../../lib/supabase';

interface CircleContext {
  leaderName: string;
  campus?: string;
  day?: string;
  time?: string;
  frequency?: string;
  location?: string;
  acpdName?: string;
}

interface InviteToCircleModalProps {
  isOpen: boolean;
  onClose: () => void;
  circle: CircleContext;
  onSend: (personName: string, phone: string, email: string, message: string) => Promise<void>;
}

const DEFAULT_TEMPLATE =
  "Hi {personFirstName}! This is {acpdName} from Valley Creek. Thanks for reaching out about Circles. There's one that meets at {location}, {day} and {time} every {frequency}. Let me know if that works for your schedule.";

const PLACEHOLDERS: { token: string; description: string }[] = [
  { token: '{personName}', description: "Person's full name" },
  { token: '{personFirstName}', description: "Person's first name" },
  { token: '{acpdName}', description: 'ACPD name' },
  { token: '{leaderName}', description: 'Circle leader name' },
  { token: '{day}', description: 'Circle day' },
  { token: '{time}', description: 'Circle time' },
  { token: '{frequency}', description: 'Circle frequency' },
  { token: '{location}', description: 'Circle location' },
];

const formatTime = (time?: string | null): string => {
  if (!time) return '';
  if (time.toLowerCase().includes('am') || time.toLowerCase().includes('pm')) return time;
  const m = time.match(/^(\d{1,2}):(\d{2})/);
  if (!m) return time;
  let hours = parseInt(m[1], 10);
  const minutes = m[2];
  const ampm = hours >= 12 ? 'PM' : 'AM';
  if (hours === 0) hours = 12;
  else if (hours > 12) hours = hours - 12;
  return minutes === '00' ? `${hours} ${ampm}` : `${hours}:${minutes} ${ampm}`;
};

type TemplateVars = {
  personName: string;
  personFirstName: string;
  acpdName: string;
  leaderName: string;
  day: string;
  time: string;
  frequency: string;
  location: string;
};

function applyTemplate(template: string, vars: TemplateVars) {
  return template
    .replaceAll('{personFirstName}', vars.personFirstName)
    .replaceAll('{personName}', vars.personName)
    .replaceAll('{acpdName}', vars.acpdName)
    .replaceAll('{leaderName}', vars.leaderName)
    .replaceAll('{day}', vars.day)
    .replaceAll('{time}', vars.time)
    .replaceAll('{frequency}', vars.frequency)
    .replaceAll('{location}', vars.location);
}

const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Walk substitutions backwards: rendered message → template with placeholders.
// Longer values first to avoid partial-match collisions (e.g., personName before personFirstName).
function reverseTemplate(rendered: string, vars: TemplateVars): string {
  const pairs: [string, string][] = [
    [vars.personName, '{personName}'],
    [vars.leaderName, '{leaderName}'],
    [vars.acpdName, '{acpdName}'],
    [vars.location, '{location}'],
    [vars.personFirstName, '{personFirstName}'],
    [vars.day, '{day}'],
    [vars.time, '{time}'],
    [vars.frequency, '{frequency}'],
  ];
  pairs.sort((a, b) => b[0].length - a[0].length);
  let out = rendered;
  for (const [value, token] of pairs) {
    if (!value || value.length < 2) continue;
    out = out.replace(new RegExp(escapeRegex(value), 'g'), token);
  }
  return out;
}

export default function InviteToCircleModal({
  isOpen,
  onClose,
  circle,
  onSend,
}: InviteToCircleModalProps) {
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
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const [template, setTemplate] = useState<string>(DEFAULT_TEMPLATE);
  const [workingTemplate, setWorkingTemplate] = useState<string>(DEFAULT_TEMPLATE);
  const [isCustomTemplate, setIsCustomTemplate] = useState(false);
  const [showPlaceholders, setShowPlaceholders] = useState(false);
  const [isSavingTemplate, setIsSavingTemplate] = useState(false);
  const [templateNotice, setTemplateNotice] = useState('');

  useEffect(() => {
    setMounted(true);
  }, []);

  const personFirstName = personName.trim().split(/\s+/)[0] || '';

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
        const saved: string | null = data?.profile?.invite_person_template ?? null;
        if (cancelled) return;
        if (saved && saved.trim()) {
          setTemplate(saved);
          setWorkingTemplate(saved);
          setIsCustomTemplate(true);
        } else {
          setTemplate(DEFAULT_TEMPLATE);
          setWorkingTemplate(DEFAULT_TEMPLATE);
          setIsCustomTemplate(false);
        }
      } catch {
        /* non-fatal */
      }
    })();
    return () => { cancelled = true; };
  }, [isOpen]);

  const vars = useMemo<TemplateVars>(() => ({
    personName: personName.trim(),
    personFirstName,
    acpdName: circle.acpdName || '',
    leaderName: circle.leaderName || '',
    day: circle.day || '',
    time: formatTime(circle.time),
    frequency: circle.frequency ? formatFrequencyLabel(circle.frequency).toLowerCase() : '',
    location: circle.location || '',
  }), [
    personName,
    personFirstName,
    circle.acpdName,
    circle.leaderName,
    circle.day,
    circle.time,
    circle.frequency,
    circle.location,
  ]);

  const renderedFromTemplate = useMemo(
    () => applyTemplate(workingTemplate, vars),
    [workingTemplate, vars]
  );

  // Regenerate message whenever inputs or template change (only in rendered mode)
  useEffect(() => {
    if (showPlaceholders) return;
    if (!personName) {
      setMessage('');
      return;
    }
    setMessage(renderedFromTemplate);
  }, [personName, showPlaceholders, renderedFromTemplate]);

  // Detect any divergence from the saved default — either via template edits
  // or via inline message edits that we can reverse-sub back to a template.
  const reversedFromMessage = useMemo(
    () => (personName ? reverseTemplate(message, vars) : ''),
    [message, vars, personName]
  );
  const candidateTemplate = showPlaceholders ? workingTemplate : (personName ? reversedFromMessage : workingTemplate);
  const templateChanged = candidateTemplate !== template && candidateTemplate.trim().length > 0;

  const resetForm = () => {
    setPersonName('');
    setPhone('');
    setEmail('');
    setMessage('');
    setError('');
    setCopySuccess(false);
    setLookupKey((k) => k + 1);
    setShowPlaceholders(false);
    setWorkingTemplate(template);
    setTemplateNotice('');
  };

  const handleSend = async () => {
    if (!personName.trim()) {
      setError("Please enter the person's name");
      return;
    }

    setError('');
    setIsSending(true);

    try {
      await onSend(personName.trim(), phone.trim(), email.trim(), message);
      resetForm();
      onClose();
    } catch {
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
    } catch {
      setError('Failed to copy message');
    }
  };

  const handleClose = () => {
    resetForm();
    onClose();
  };

  const handleCCBSelect = (person: CCBPerson) => {
    setPersonName(person.fullName);
    setPhone(person.mobilePhone || person.phone || '');
    setEmail(person.email || '');
  };

  const insertPlaceholder = useCallback((token: string) => {
    const ta = textareaRef.current;
    setWorkingTemplate((prev) => {
      const isFocused = ta && document.activeElement === ta;
      if (!ta || !isFocused) {
        const needsSpace = prev.length > 0 && !/\s$/.test(prev);
        return prev + (needsSpace ? ' ' : '') + token;
      }
      const start = ta.selectionStart ?? prev.length;
      const end = ta.selectionEnd ?? prev.length;
      const next = prev.slice(0, start) + token + prev.slice(end);
      requestAnimationFrame(() => {
        if (!textareaRef.current) return;
        const pos = start + token.length;
        textareaRef.current.focus();
        textareaRef.current.setSelectionRange(pos, pos);
      });
      return next;
    });
  }, []);

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
        body: JSON.stringify({ preferences: { invite_person_template: value } })
      });
      if (!res.ok) throw new Error('Save failed');
      if (value === null) {
        setTemplate(DEFAULT_TEMPLATE);
        setWorkingTemplate(DEFAULT_TEMPLATE);
        setIsCustomTemplate(false);
        setTemplateNotice('Reset to default.');
      } else {
        setTemplate(value);
        setWorkingTemplate(value);
        setIsCustomTemplate(true);
        setTemplateNotice('Saved as default.');
      }
      setTimeout(() => setTemplateNotice(''), 2500);
    } catch {
      setTemplateNotice('Failed to save template.');
    } finally {
      setIsSavingTemplate(false);
    }
  }, []);

  if (!mounted) return null;

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title="Invite a Person" size="lg">
      <div className="space-y-4">
        {/* Circle context summary */}
        <div className="rounded-md border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/40 px-3 py-2 text-xs text-gray-600 dark:text-gray-300">
          <div className="font-medium text-gray-700 dark:text-gray-200 mb-0.5">
            {circle.leaderName || 'Circle'}
          </div>
          <div className="flex flex-wrap gap-x-3 gap-y-0.5">
            {circle.acpdName && <span>ACPD: {circle.acpdName}</span>}
            {circle.campus && <span>{circle.campus}</span>}
            {circle.location && <span>{circle.location}</span>}
            {circle.day && <span>{circle.day}</span>}
            {circle.time && <span>{formatTime(circle.time)}</span>}
            {circle.frequency && <span>{formatFrequencyLabel(circle.frequency)}</span>}
          </div>
        </div>

        {/* CCB Person Lookup */}
        <CCBPersonLookup key={lookupKey} onSelect={handleCCBSelect} autoFocus />

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
            Phone <span className="text-gray-400 text-xs">(required to text)</span>
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

        {/* Message Preview / Template Editor */}
        {(message || showPlaceholders) && (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                {showPlaceholders ? 'Template' : 'Message Preview'}
                <span className="ml-1.5 text-xs font-normal text-gray-400 dark:text-gray-500">
                  (editable)
                </span>
              </label>
              <button
                type="button"
                onClick={() => setShowPlaceholders((v) => !v)}
                className="inline-flex items-center gap-1 text-xs text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 hover:underline"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  {showPlaceholders ? (
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                  ) : (
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
                  )}
                </svg>
                {showPlaceholders ? 'Show rendered' : 'Show placeholders'}
              </button>
            </div>

            <textarea
              ref={textareaRef}
              value={showPlaceholders ? workingTemplate : message}
              onChange={(e) => {
                if (showPlaceholders) setWorkingTemplate(e.target.value);
                else setMessage(e.target.value);
              }}
              rows={7}
              className="w-full px-3 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-900/40 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-vc-500/40 focus:border-vc-500 font-mono text-sm leading-relaxed"
            />

            {showPlaceholders && (
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-xs text-gray-500 dark:text-gray-400 mr-1">Insert:</span>
                {PLACEHOLDERS.map((p) => (
                  <button
                    key={p.token}
                    type="button"
                    onClick={() => insertPlaceholder(p.token)}
                    title={p.description}
                    className="px-2 py-0.5 rounded-full border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-gray-700 dark:text-gray-300 font-mono text-[11px] hover:border-blue-300 dark:hover:border-blue-700 hover:bg-blue-50 dark:hover:bg-blue-900/30 hover:text-blue-700 dark:hover:text-blue-300 transition-colors"
                  >
                    {p.token}
                  </button>
                ))}
              </div>
            )}

            {/* Save-as-default prompt */}
            {templateChanged && (
              <div className="flex items-center justify-between gap-3 rounded-lg border border-blue-200 dark:border-blue-900/40 bg-blue-50 dark:bg-blue-950/30 px-3 py-2">
                <div className="flex items-center gap-2 text-xs text-blue-900 dark:text-blue-200">
                  <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" />
                  </svg>
                  <span>Save this wording as your default for future invites?</span>
                </div>
                <div className="flex items-center gap-1.5 flex-shrink-0">
                  <button
                    type="button"
                    onClick={() => setWorkingTemplate(template)}
                    disabled={isSavingTemplate}
                    className="px-2 py-1 text-xs text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200"
                  >
                    Not now
                  </button>
                  <button
                    type="button"
                    onClick={() => saveTemplate(candidateTemplate)}
                    disabled={isSavingTemplate}
                    className="btn-primary px-3 py-1 rounded-md text-xs font-medium"
                  >
                    {isSavingTemplate ? 'Saving…' : 'Save as default'}
                  </button>
                </div>
              </div>
            )}

            <div className="flex items-center justify-between text-[11px] text-gray-400 dark:text-gray-500">
              <span>
                {showPlaceholders
                  ? 'Edits to your template apply to every future invite.'
                  : 'Edits here only change this message.'}
              </span>
              {isCustomTemplate && !templateChanged && (
                <button
                  type="button"
                  onClick={() => saveTemplate(null)}
                  disabled={isSavingTemplate}
                  className="hover:text-gray-600 dark:hover:text-gray-300 hover:underline"
                >
                  Reset default
                </button>
              )}
            </div>

            {templateNotice && (
              <div className="text-xs text-green-700 dark:text-green-400">{templateNotice}</div>
            )}
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
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                    ></path>
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
