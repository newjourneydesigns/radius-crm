'use client';

import { useEffect, useMemo, useState } from 'react';
import Modal from '../ui/Modal';
import { supabase, type TouchpointMethod } from '../../lib/supabase';

interface LogTouchpointModalProps {
  isOpen: boolean;
  onClose: () => void;
  circleLeaderId: number;
  circleLeaderName: string;
  leaderPhone?: string | null;
  additionalLeaderPhone?: string | null;
  /** Optional event/debrief context this touchpoint is in response to. */
  eventTopic?: string | null;
  eventOccurrence?: string | null;
  circleEventSummaryId?: string | null;
  onLogged?: () => void;
}

const METHODS: { value: TouchpointMethod; label: string }[] = [
  { value: 'text', label: 'Text' },
  { value: 'call', label: 'Call' },
  { value: 'in_person', label: 'In Person' },
  { value: 'email', label: 'Email' },
  { value: 'note', label: 'Note' },
  { value: 'other', label: 'Other' },
];

export default function LogTouchpointModal({
  isOpen,
  onClose,
  circleLeaderId,
  circleLeaderName,
  leaderPhone = null,
  additionalLeaderPhone = null,
  eventTopic = null,
  eventOccurrence = null,
  circleEventSummaryId = null,
  onLogged,
}: LogTouchpointModalProps) {
  const [method, setMethod] = useState<TouchpointMethod>('text');
  const [date, setDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [note, setNote] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');

  const phone = useMemo(() => {
    const clean = (p?: string | null) => (p ? p.replace(/\D/g, '') : '');
    return clean(leaderPhone) || clean(additionalLeaderPhone);
  }, [leaderPhone, additionalLeaderPhone]);

  useEffect(() => {
    if (isOpen) {
      setMethod(phone ? 'text' : 'note');
      setDate(new Date().toISOString().split('T')[0]);
      setNote('');
      setError('');
    }
  }, [isOpen, phone]);

  const openLink = (href: string) => {
    const a = document.createElement('a');
    a.href = href;
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const handleText = () => {
    if (!phone) return;
    setMethod('text');
    openLink(`sms:${phone}`);
  };

  const handleCall = () => {
    if (!phone) return;
    setMethod('call');
    openLink(`tel:${phone}`);
  };

  const handleSave = async () => {
    setIsSaving(true);
    setError('');
    try {
      const token = (await supabase.auth.getSession()).data.session?.access_token ?? null;
      const res = await fetch('/api/touchpoints', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          circle_leader_id: circleLeaderId,
          method,
          notes: note.trim() || null,
          occurred_at: new Date(`${date}T12:00:00`).toISOString(),
          circle_event_summary_id: circleEventSummaryId,
          event_topic: eventTopic,
          event_occurrence: eventOccurrence,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || 'Failed to log touchpoint.');
      onLogged?.();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to log touchpoint.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Log Touchpoint" size="md">
      <div className="space-y-4">
        <p className="text-sm text-gray-600 dark:text-gray-400">
          Record a touchpoint with <strong className="text-gray-900 dark:text-white">{circleLeaderName}</strong>
          {eventTopic ? (
            <>
              {' '}
              regarding their event summary <span className="text-gray-500 dark:text-gray-400">“{eventTopic}”</span>
            </>
          ) : null}
          .
        </p>

        {error && (
          <div className="text-sm text-red-700 dark:text-red-400 bg-red-100 dark:bg-red-900/30 border border-red-300 dark:border-red-700 rounded-lg px-3 py-2">
            {error}
          </div>
        )}

        {/* Reach out */}
        {phone && (
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Reach out</label>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={handleText}
                className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M8 10h.01M12 10h.01M16 10h.01M21 12a9 9 0 01-9 9c-1.6 0-3.1-.4-4.4-1.1L3 21l1.1-4.6A8.96 8.96 0 013 12a9 9 0 1118 0z" />
                </svg>
                Text
              </button>
              <button
                type="button"
                onClick={handleCall}
                className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.95.68l1.5 4.5a1 1 0 01-.5 1.21l-2.26 1.13a11 11 0 005.52 5.52l1.13-2.26a1 1 0 011.21-.5l4.5 1.5a1 1 0 01.68.95V19a2 2 0 01-2 2h-1C9.72 21 3 14.28 3 6V5z" />
                </svg>
                Call
              </button>
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1.5">
              Opens your phone, then comes back here to save what happened.
            </p>
          </div>
        )}

        {/* Method */}
        <div>
          <label htmlFor="tp-method" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            How did you connect?
          </label>
          <select
            id="tp-method"
            value={method}
            onChange={(e) => setMethod(e.target.value as TouchpointMethod)}
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-vc-500 focus:border-vc-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
          >
            {METHODS.map((m) => (
              <option key={m.value} value={m.value}>
                {m.label}
              </option>
            ))}
          </select>
        </div>

        {/* Date */}
        <div>
          <label htmlFor="tp-date" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Date
          </label>
          <input
            id="tp-date"
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-vc-500 focus:border-vc-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
          />
        </div>

        {/* Note */}
        <div>
          <label htmlFor="tp-note" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Feedback / note (optional)
          </label>
          <textarea
            id="tp-note"
            rows={3}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="What feedback did you give on their event summary?"
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-vc-500 focus:border-vc-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm resize-none"
          />
        </div>

        <div className="flex items-center justify-end gap-3 pt-1">
          <button onClick={onClose} disabled={isSaving} className="btn-ghost px-4 py-2 rounded-lg text-sm">
            Cancel
          </button>
          <button onClick={handleSave} disabled={isSaving} className="btn-primary px-4 py-2 rounded-lg text-sm">
            {isSaving ? 'Saving…' : 'Log Touchpoint'}
          </button>
        </div>
      </div>
    </Modal>
  );
}
