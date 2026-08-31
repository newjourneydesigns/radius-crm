'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { DateTime } from 'luxon';
import RichTextEditor from '../../components/notes/RichTextEditor';
import ToolkitContentPreview from '../../components/circle-leader-toolkit/ToolkitContentPreview';
import { csOpenSans } from '../../lib/circle-leader-toolkit/csFont';
import { renderMessageHtml } from '../../lib/renderMessageHtml';

const CHURCH_TZ = 'America/Chicago';

/** Students target by campus only — no ACPD, no team/position filters. */
type StudentTargetType = 'all' | 'campus';

type PushStatus = 'enabled' | 'pref_off' | 'no_device';

type Recipient = {
  id: number | string;
  name: string;
  campus: string | null;
  push_status?: PushStatus;
};

type InboxMessage = {
  id: string;
  title: string;
  body_html: string;
  target_type: StudentTargetType;
  target_value: string | null;
  target_label?: string | null;
  status: 'sent' | 'unsent' | 'scheduled';
  scheduled_at?: string | null;
  delivery_start?: string | null;
  delivery_end?: string | null;
  version: number;
  created_at: string;
  updated_at: string;
  stats?: { recipients: number; unread: number; read: number };
};

type Draft = {
  id?: string;
  title: string;
  body_html: string;
  target_type: StudentTargetType;
  campus: string;
  delivery_start: string;
  delivery_end: string;
};

const PUSH_BADGE: Record<PushStatus, { label: string; className: string; title: string }> = {
  enabled: {
    label: 'Push',
    className: 'bg-emerald-500/20 text-emerald-300',
    title: 'Notifications on and a device registered — will get a push.',
  },
  pref_off: {
    label: 'In-app only',
    className: 'bg-amber-500/20 text-amber-300',
    title: 'Notifications turned off in their settings.',
  },
  no_device: {
    label: 'In-app only',
    className: 'bg-amber-500/20 text-amber-300',
    title: 'No device registered for push.',
  },
};

const inputClass =
  'w-full bg-zinc-700 border border-zinc-600 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-vc-500';

function emptyDraft(): Draft {
  return {
    title: '',
    body_html: '',
    target_type: 'all',
    campus: '',
    delivery_start: '',
    delivery_end: '',
  };
}

function startDateToScheduledAt(deliveryStart: string): string | null {
  if (!deliveryStart) return null;
  const dt = DateTime.fromISO(deliveryStart, { zone: CHURCH_TZ }).startOf('day');
  return dt.isValid ? dt.toUTC().toISO() : null;
}

function formatChurchDate(iso: string | null | undefined): string {
  if (!iso) return '';
  const dt = DateTime.fromISO(iso, { zone: 'utc' }).setZone(CHURCH_TZ);
  return dt.isValid ? dt.toFormat('ccc, LLL d') : '';
}

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

export default function StudentLeaderMessagesPage() {
  const [token, setToken] = useState<string | null>(null);
  const [messages, setMessages] = useState<InboxMessage[]>([]);
  const [campuses, setCampuses] = useState<string[]>([]);
  const [recipients, setRecipients] = useState<Recipient[]>([]);
  const [draft, setDraft] = useState<Draft>(emptyDraft());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [loading, setLoading] = useState(true);
  const [previewing, setPreviewing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [actingId, setActingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const editorSectionRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      const accessToken = data.session?.access_token || null;
      setToken(accessToken);
      setAuthChecked(true);
      if (!accessToken) setLoading(false);
    });
  }, []);

  const loadMessages = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/circle-leader-toolkit-inbox/?audience=student', {
        headers: { Authorization: `Bearer ${token}` },
        cache: 'no-store',
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to load messages.');
      setMessages(data.messages || []);
    } catch (err: unknown) {
      setError(getErrorMessage(err, 'Failed to load messages.'));
    } finally {
      setLoading(false);
    }
  }, [token]);

  const loadCampuses = useCallback(async () => {
    const { data, error: campusError } = await supabase
      .from('campuses')
      .select('value')
      .order('value');
    if (campusError) return;
    setCampuses(
      ((data || []) as { value: string | null }[])
        .map((row) => row.value)
        .filter((value): value is string => Boolean(value))
    );
  }, []);

  useEffect(() => {
    if (!token) return;
    loadMessages();
    loadCampuses();
  }, [token, loadMessages, loadCampuses]);

  // Recipient preview — re-runs when the target changes. Recipients are locked
  // once a message is sent, so only a new/unsent/scheduled draft previews.
  useEffect(() => {
    if (!token) return;
    const editingMessage = draft.id ? messages.find((m) => m.id === draft.id) : null;
    if (draft.id && editingMessage?.status !== 'unsent' && editingMessage?.status !== 'scheduled') return;
    if (draft.target_type === 'campus' && !draft.campus) {
      setRecipients([]);
      return;
    }

    let cancelled = false;
    setPreviewing(true);
    const params = new URLSearchParams({
      preview: '1',
      audience: 'student',
      target_type: draft.target_type,
    });
    if (draft.target_type === 'campus') params.set('target_value', draft.campus);

    fetch(`/api/admin/circle-leader-toolkit-inbox/?${params.toString()}`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: 'no-store',
    })
      .then((r) => r.json().then((data) => ({ ok: r.ok, data })))
      .then(({ ok, data }) => {
        if (cancelled) return;
        if (!ok) throw new Error(data.error || 'Preview failed.');
        setRecipients(data.recipients || []);
      })
      .catch(() => {
        if (!cancelled) setRecipients([]);
      })
      .finally(() => {
        if (!cancelled) setPreviewing(false);
      });

    return () => {
      cancelled = true;
    };
  }, [draft.id, draft.target_type, draft.campus, messages, token]);

  function resetDraft() {
    setEditingId(null);
    setDraft(emptyDraft());
    setRecipients([]);
    setError(null);
  }

  function startEdit(message: InboxMessage) {
    setEditingId(message.id);
    setDraft({
      id: message.id,
      title: message.title,
      body_html: message.body_html,
      target_type: message.target_type === 'campus' ? 'campus' : 'all',
      campus: message.target_type === 'campus' ? message.target_value || '' : '',
      delivery_start: message.delivery_start || '',
      delivery_end: message.delivery_end || '',
    });
    setRecipients([]);
    setError(null);
    setSuccess(null);
  }

  function duplicateMessage(message: InboxMessage) {
    setEditingId(null);
    setDraft({
      title: message.title,
      body_html: message.body_html,
      target_type: message.target_type === 'campus' ? 'campus' : 'all',
      campus: message.target_type === 'campus' ? message.target_value || '' : '',
      delivery_start: '',
      delivery_end: '',
    });
    setError(null);
    setSuccess('Message duplicated. Check the audience and dates, then send.');
    window.requestAnimationFrame(() => {
      editorSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }

  async function save() {
    if (!token) return;
    if (!draft.title.trim()) {
      setError('Title is required.');
      return;
    }
    if (draft.target_type === 'campus' && !draft.campus) {
      setError('Choose a campus, or switch to all student leaders.');
      return;
    }

    const editingMessage = draft.id ? messages.find((m) => m.id === draft.id) : null;
    const isResend = editingMessage?.status === 'unsent';
    const canSchedule = !draft.id || editingMessage?.status === 'scheduled';
    const scheduling = canSchedule && !!draft.delivery_start;

    if (scheduling) {
      const startDt = DateTime.fromISO(draft.delivery_start, { zone: CHURCH_TZ }).startOf('day');
      const today = DateTime.now().setZone(CHURCH_TZ).startOf('day');
      if (startDt < today) {
        setError('Delivery start date must be today or in the future.');
        return;
      }
      if (draft.delivery_end && draft.delivery_end < draft.delivery_start) {
        setError('Delivery end date must be on or after the start date.');
        return;
      }
    }

    const scheduledIso = scheduling ? startDateToScheduledAt(draft.delivery_start) : null;

    setSaving(true);
    setError(null);
    setSuccess(null);

    try {
      const isEdit = !!draft.id;
      const res = await fetch('/api/admin/circle-leader-toolkit-inbox/', {
        method: isResend ? 'PATCH' : isEdit ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          action: isResend ? 'resend' : undefined,
          id: draft.id,
          title: draft.title,
          body_html: draft.body_html,
          target_type: draft.target_type,
          target_value: draft.target_type === 'campus' ? draft.campus : null,
          audience: 'student',
          scheduled_at: scheduledIso,
          delivery_start: draft.delivery_start || null,
          delivery_end: draft.delivery_end || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || (isEdit ? 'Edit failed.' : 'Send failed.'));

      const count = data.recipients?.length || 0;
      const plural = count === 1 ? '' : 's';
      if (scheduling) {
        setSuccess(`Message scheduled for delivery starting ${formatChurchDate(scheduledIso)}.`);
      } else if (isResend) {
        setSuccess(`Message resent to ${count} student leader${plural}.`);
      } else if (isEdit && editingMessage?.status === 'scheduled') {
        setSuccess(`Schedule cleared — message sent now to ${count} student leader${plural}.`);
      } else if (isEdit) {
        setSuccess('Message updated. Student leaders will see it as unread again.');
      } else {
        setSuccess(`Message sent to ${count} student leader${plural}.`);
      }
      resetDraft();
      await loadMessages();
    } catch (err: unknown) {
      setError(getErrorMessage(err, 'Save failed.'));
    } finally {
      setSaving(false);
    }
  }

  async function messageAction(message: InboxMessage, action: 'send_now' | 'unsend', confirmText: string, done: string) {
    if (!token) return;
    if (!confirm(confirmText)) return;
    setActingId(message.id);
    setError(null);
    setSuccess(null);
    try {
      const res = await fetch('/api/admin/circle-leader-toolkit-inbox/', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ id: message.id, action }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'That did not work.');
      const count = data.recipients?.length || 0;
      setSuccess(action === 'send_now' ? `Message sent now to ${count} student leader${count === 1 ? '' : 's'}.` : done);
      await loadMessages();
      if (action === 'unsend') {
        startEdit({ ...message, status: 'unsent', stats: { recipients: 0, unread: 0, read: 0 } });
      }
    } catch (err: unknown) {
      setError(getErrorMessage(err, 'That did not work.'));
    } finally {
      setActingId(null);
    }
  }

  async function deleteMessage(message: InboxMessage) {
    if (!token) return;
    if (!confirm('Delete this message permanently? It disappears from every student inbox.')) return;
    setActingId(message.id);
    setError(null);
    setSuccess(null);
    try {
      const res = await fetch(
        `/api/admin/circle-leader-toolkit-inbox/?id=${encodeURIComponent(message.id)}`,
        { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } }
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Delete failed.');
      if (editingId === message.id) resetDraft();
      setSuccess('Message deleted and removed from student inboxes.');
      await loadMessages();
    } catch (err: unknown) {
      setError(getErrorMessage(err, 'Delete failed.'));
    } finally {
      setActingId(null);
    }
  }

  const editingMessage = editingId ? messages.find((m) => m.id === editingId) : null;
  const editingUnsent = editingMessage?.status === 'unsent';
  const editingScheduled = editingMessage?.status === 'scheduled';
  const targetLocked = !!editingId && editingMessage?.status === 'sent';
  const canSchedule = !editingId || editingScheduled;

  const pushCount = useMemo(
    () => recipients.filter((r) => r.push_status === 'enabled').length,
    [recipients]
  );

  if (authChecked && !token) {
    return (
      <div className="min-h-screen bg-[#0f1117] p-4 sm:p-6 lg:p-8">
        <div className="max-w-xl mx-auto bg-zinc-800 border border-zinc-700 rounded-xl p-6 shadow-card-glass">
          <h1 className="text-xl font-semibold text-white tracking-tight">Student Leader Messages</h1>
          <p className="text-sm text-slate-400 mt-2">
            Sign in to Radius before sending messages to student leaders.
          </p>
          <a
            href="/login/"
            className="inline-flex mt-5 bg-btn-primary text-white px-4 py-2 rounded-lg text-sm font-medium hover:opacity-90 transition-opacity"
          >
            Sign in
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className={`min-h-screen bg-[#0f1117] p-4 sm:p-6 lg:p-8 ${csOpenSans.variable}`}>
      <div className="max-w-6xl mx-auto">
        <div className="mb-6">
          <h1 className="text-xl font-semibold text-white tracking-tight">Student Leader Messages</h1>
          <p className="text-sm text-slate-400 mt-1">
            Send rich-text messages to student leaders. They appear in the Student Toolkit inbox.
          </p>
        </div>

        {error && (
          <div className="bg-red-500/10 border border-red-500/30 text-red-300 text-sm rounded-lg p-3 mb-4">
            {error}
          </div>
        )}
        {success && (
          <div className="bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-sm rounded-lg p-3 mb-4">
            {success}
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_380px] gap-5">
          <section
            ref={editorSectionRef}
            className="bg-zinc-800 border border-zinc-700 rounded-xl p-5 shadow-card-glass"
          >
            <div className="flex items-center justify-between gap-4 mb-4">
              <div>
                <h2 className="text-base font-semibold text-white">
                  {editingUnsent
                    ? 'Edit and resend message'
                    : editingScheduled
                    ? 'Edit scheduled message'
                    : editingId
                    ? 'Edit sent message'
                    : 'Compose message'}
                </h2>
                {editingMessage?.status === 'sent' && (
                  <p className="text-xs text-amber-300 mt-1">
                    Editing this message marks it unread again for every recipient.
                  </p>
                )}
                {editingUnsent && (
                  <p className="text-xs text-amber-300 mt-1">
                    This message is unsent and is not visible until you resend it.
                  </p>
                )}
                {editingScheduled && (
                  <p className="text-xs text-indigo-300 mt-1">
                    This message is scheduled and is not visible until it is delivered.
                  </p>
                )}
              </div>
              {editingId && (
                <button
                  onClick={resetDraft}
                  className="text-slate-400 hover:text-white hover:bg-zinc-700 px-3 py-1.5 rounded-lg text-sm transition-colors"
                >
                  Cancel edit
                </button>
              )}
            </div>

            <div className="space-y-4">
              <Field label="Title" required>
                <input
                  className={inputClass}
                  value={draft.title}
                  onChange={(e) => setDraft({ ...draft, title: e.target.value })}
                  placeholder="e.g. Leader huddle moved to Sunday"
                />
              </Field>

              <Field label="Message" hint="Rich text supports headings, links, bold, italics, and lists.">
                <RichTextEditor
                  value={draft.body_html}
                  onChange={(html) => setDraft({ ...draft, body_html: html })}
                  placeholder="Write the message student leaders should see..."
                  minHeight="180px"
                  allowButton
                  toolkitSurface
                />
              </Field>

              <ToolkitContentPreview variant="inbox" title={draft.title} bodyHtml={draft.body_html} />

              <Field
                label="Audience"
                hint={
                  targetLocked
                    ? 'Recipients are locked after send. Unsend first if you need to change who gets it.'
                    : undefined
                }
              >
                <div className="flex gap-2 mb-4">
                  {(
                    [
                      ['all', 'All student leaders'],
                      ['campus', 'One campus'],
                    ] as [StudentTargetType, string][]
                  ).map(([value, label]) => (
                    <button
                      key={value}
                      type="button"
                      disabled={targetLocked}
                      onClick={() => setDraft({ ...draft, target_type: value })}
                      className={`px-3 py-2 rounded-lg text-sm font-medium border transition-colors disabled:opacity-60 ${
                        draft.target_type === value
                          ? 'bg-vc-500/20 text-vc-200 border-vc-500/50'
                          : 'bg-zinc-700/50 text-slate-300 border-zinc-600 hover:bg-zinc-700'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>

                {draft.target_type === 'campus' && !targetLocked && (
                  <select
                    className={`${inputClass} sm:w-64`}
                    value={draft.campus}
                    onChange={(e) => setDraft({ ...draft, campus: e.target.value })}
                  >
                    <option value="">Select a campus</option>
                    {campuses.map((campus) => (
                      <option key={campus} value={campus}>
                        {campus}
                      </option>
                    ))}
                  </select>
                )}
              </Field>

              {canSchedule && (
                <Field
                  label="Delivery date range"
                  hint="Leave the start date blank to send immediately. The end date stops delivery after that day."
                >
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <p className="text-xs text-slate-500 mb-1">Start date (blank sends now)</p>
                      <input
                        type="date"
                        value={draft.delivery_start}
                        min={DateTime.now().setZone(CHURCH_TZ).toFormat('yyyy-LL-dd')}
                        onChange={(e) => setDraft({ ...draft, delivery_start: e.target.value })}
                        className={`${inputClass} [color-scheme:dark]`}
                      />
                    </div>
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <p className="text-xs text-slate-500">End date (optional)</p>
                        {draft.delivery_end && (
                          <button
                            type="button"
                            onClick={() => setDraft({ ...draft, delivery_end: '' })}
                            className="text-xs text-slate-400 hover:text-white"
                          >
                            Clear
                          </button>
                        )}
                      </div>
                      <input
                        type="date"
                        value={draft.delivery_end}
                        min={draft.delivery_start || DateTime.now().setZone(CHURCH_TZ).toFormat('yyyy-LL-dd')}
                        onChange={(e) => setDraft({ ...draft, delivery_end: e.target.value })}
                        className={`${inputClass} [color-scheme:dark]`}
                      />
                    </div>
                  </div>
                </Field>
              )}

              <div className="flex items-center gap-3 pt-1">
                <button
                  onClick={save}
                  disabled={saving}
                  className="bg-btn-primary text-white px-4 py-2 rounded-lg text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
                >
                  {saving
                    ? 'Saving...'
                    : editingUnsent
                    ? 'Resend message'
                    : draft.delivery_start && canSchedule
                    ? editingScheduled
                      ? 'Update schedule'
                      : 'Schedule message'
                    : editingScheduled
                    ? 'Send now'
                    : editingId
                    ? 'Update message'
                    : 'Send message'}
                </button>
                {(!editingId || editingUnsent || editingScheduled) && (
                  <span className="text-xs text-slate-500">
                    {previewing
                      ? 'Checking recipients...'
                      : `${recipients.length} eligible recipient${recipients.length === 1 ? '' : 's'}`}
                  </span>
                )}
              </div>
            </div>
          </section>

          <aside className="bg-zinc-800 border border-zinc-700 rounded-xl p-5 shadow-card-glass lg:sticky lg:top-6 h-fit">
            <h2 className="text-base font-semibold text-white">Recipient preview</h2>
            <p className="text-xs text-slate-400 mt-1">
              Everyone here gets the message in their Student Toolkit inbox. Archived leaders and
              anyone with toolkit access turned off are already excluded.
            </p>

            {targetLocked ? (
              <div className="mt-4 rounded-lg bg-zinc-900/60 border border-zinc-700 p-3 text-sm text-slate-300">
                Recipients are already set for this message.
              </div>
            ) : recipients.length === 0 ? (
              <div className="mt-4 rounded-lg bg-zinc-900/60 border border-zinc-700 p-3 text-sm text-slate-400">
                {previewing
                  ? 'Checking recipients…'
                  : draft.target_type === 'campus' && !draft.campus
                  ? 'Choose a campus to see who gets this.'
                  : 'Nobody is eligible yet. Import student leaders, then check their toolkit access.'}
              </div>
            ) : (
              <>
                <div className="mt-4 rounded-lg bg-zinc-900/60 border border-zinc-700 p-3">
                  <p className="text-sm text-slate-200">
                    <span className="font-semibold text-emerald-300">{pushCount}</span> of{' '}
                    {recipients.length} will also get a push notification.
                  </p>
                </div>
                <div className="mt-3 max-h-[420px] overflow-auto rounded-lg border border-zinc-700 divide-y divide-zinc-700">
                  {recipients.map((leader) => {
                    const badge = PUSH_BADGE[leader.push_status || 'no_device'];
                    return (
                      <div
                        key={leader.id}
                        className="p-3 bg-zinc-900/40 flex items-start justify-between gap-3"
                      >
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-slate-100">{leader.name}</p>
                          <p className="text-xs text-slate-500 mt-0.5">{leader.campus || 'No campus'}</p>
                        </div>
                        <span
                          title={badge.title}
                          className={`shrink-0 text-xs font-medium px-2 py-0.5 rounded-full ${badge.className}`}
                        >
                          {badge.label}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </aside>
        </div>

        <section className="mt-6">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-base font-semibold text-white">Messages</h2>
            <button
              onClick={loadMessages}
              disabled={loading}
              className="text-slate-400 hover:text-white hover:bg-zinc-800 px-3 py-1.5 rounded-lg text-sm transition-colors disabled:opacity-50"
            >
              Refresh
            </button>
          </div>

          {loading ? (
            <div className="space-y-2">
              <div className="animate-pulse bg-zinc-800 rounded-xl h-20" />
              <div className="animate-pulse bg-zinc-800 rounded-xl h-20" />
            </div>
          ) : messages.length === 0 ? (
            <div className="text-center py-12 bg-zinc-800 border border-zinc-700 rounded-xl">
              <p className="text-slate-400 text-sm">No messages sent to student leaders yet.</p>
              <p className="text-slate-500 text-xs mt-1">
                Write one above — it lands in their toolkit inbox straight away.
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {messages.map((message) => {
                const deliveryRange = [
                  message.delivery_start && `from ${message.delivery_start}`,
                  message.delivery_end && `to ${message.delivery_end}`,
                ]
                  .filter(Boolean)
                  .join(' ');
                return (
                  <article
                    key={message.id}
                    className="bg-zinc-800 border border-zinc-700 rounded-xl p-4 flex flex-col sm:flex-row sm:items-start justify-between gap-4"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="text-sm font-semibold text-white">{message.title}</h3>
                        <span
                          className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                            message.status === 'unsent'
                              ? 'bg-amber-500/20 text-amber-300'
                              : message.status === 'scheduled'
                              ? 'bg-indigo-500/20 text-indigo-300'
                              : 'bg-emerald-500/20 text-emerald-300'
                          }`}
                        >
                          {message.status}
                        </span>
                        {message.version > 1 && (
                          <span className="bg-amber-500/20 text-amber-300 text-xs font-medium px-2 py-0.5 rounded-full">
                            v{message.version}
                          </span>
                        )}
                        {message.target_label && (
                          <span className="bg-vc-500/20 text-vc-300 text-xs font-medium px-2 py-0.5 rounded-full">
                            {message.target_label}
                          </span>
                        )}
                      </div>
                      {message.body_html && (
                        <div
                          className="text-xs text-slate-400 mt-1 line-clamp-2 prose prose-invert prose-sm max-w-none"
                          dangerouslySetInnerHTML={{ __html: renderMessageHtml(message.body_html) }}
                        />
                      )}
                      {message.status === 'scheduled' ? (
                        <p className="text-xs mt-2">
                          <span className="text-indigo-300 font-medium">
                            Scheduled for delivery starting{' '}
                            {formatChurchDate(message.scheduled_at) || 'a later date'}
                          </span>
                          {deliveryRange && <span className="text-slate-500"> · {deliveryRange}</span>}
                        </p>
                      ) : (
                        <p className="text-xs text-slate-500 mt-2">
                          {message.stats?.recipients || 0} recipient
                          {message.stats?.recipients === 1 ? '' : 's'} · {message.stats?.unread || 0} unread ·{' '}
                          {message.stats?.read || 0} read
                          {deliveryRange && ` · ${deliveryRange}`} · Updated{' '}
                          {new Date(message.updated_at).toLocaleString()}
                        </p>
                      )}
                    </div>
                    <div className="shrink-0 flex items-center gap-2 flex-wrap sm:justify-end">
                      <button
                        onClick={() => duplicateMessage(message)}
                        disabled={actingId === message.id}
                        className="text-slate-300 hover:text-white hover:bg-zinc-700 px-3 py-1.5 rounded-lg text-sm transition-colors disabled:opacity-50"
                      >
                        Duplicate
                      </button>
                      <button
                        onClick={() => startEdit(message)}
                        disabled={actingId === message.id}
                        className="text-slate-300 hover:text-white hover:bg-zinc-700 px-3 py-1.5 rounded-lg text-sm transition-colors disabled:opacity-50"
                      >
                        Edit
                      </button>
                      {message.status === 'scheduled' && (
                        <button
                          onClick={() =>
                            messageAction(
                              message,
                              'send_now',
                              'Send this scheduled message now instead of waiting?',
                              'Message sent.'
                            )
                          }
                          disabled={actingId === message.id}
                          className="text-indigo-300 hover:text-indigo-200 hover:bg-indigo-500/10 px-3 py-1.5 rounded-lg text-sm transition-colors disabled:opacity-50"
                        >
                          Send now
                        </button>
                      )}
                      {message.status === 'sent' && (
                        <button
                          onClick={() =>
                            messageAction(
                              message,
                              'unsend',
                              'Unsend this message? It disappears from student inboxes until you resend it.',
                              'Message unsent. Removed from student inboxes.'
                            )
                          }
                          disabled={actingId === message.id}
                          className="text-amber-300 hover:text-amber-200 hover:bg-amber-500/10 px-3 py-1.5 rounded-lg text-sm transition-colors disabled:opacity-50"
                        >
                          Unsend
                        </button>
                      )}
                      <button
                        onClick={() => deleteMessage(message)}
                        disabled={actingId === message.id}
                        className="text-red-300 hover:text-red-200 hover:bg-red-500/10 px-3 py-1.5 rounded-lg text-sm transition-colors disabled:opacity-50"
                      >
                        Delete
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function Field({
  label,
  required,
  hint,
  children,
}: {
  label: string;
  required?: boolean;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="block text-sm font-medium text-slate-200 mb-1">
        {label}
        {required && <span className="text-red-300"> *</span>}
      </span>
      {children}
      {hint && <span className="block text-xs text-slate-500 mt-1">{hint}</span>}
    </label>
  );
}
