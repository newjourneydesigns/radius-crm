'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createClient } from '@supabase/supabase-js';
import RichTextEditor from '../../components/notes/RichTextEditor';
import { renderMessageHtml } from '../../lib/renderMessageHtml';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

type TargetType = 'all' | 'campus' | 'acpd' | 'leader';

type Leader = {
  id: number | string;
  name: string;
  campus: string | null;
  acpd: string | null;
  ccb_group_id?: string | number | null;
};

type LeaderRow = Leader & {
  status?: string | null;
  circle_summary_access_enabled?: boolean | null;
};

type PushStatus = 'enabled' | 'pref_off' | 'no_device';

type RecipientLeader = Leader & {
  push_status?: PushStatus;
};

type PushSummary = {
  enabled: number;
  pref_off: number;
  no_device: number;
};

type RecipientFilter = 'all' | 'push' | 'no_push';

const PUSH_BADGE: Record<PushStatus, { label: string; className: string; title: string }> = {
  enabled: {
    label: 'Push',
    className: 'bg-emerald-500/20 text-emerald-300',
    title: 'Has notifications on and an active device — will get a push.',
  },
  pref_off: {
    label: 'In-app only',
    className: 'bg-amber-500/20 text-amber-300',
    title: 'Notifications turned off in their settings — message lands in their inbox, no push.',
  },
  no_device: {
    label: 'In-app only',
    className: 'bg-amber-500/20 text-amber-300',
    title: 'No device registered for push — message lands in their inbox, no push.',
  },
};

type InboxMessage = {
  id: string;
  title: string;
  body_html: string;
  target_type: TargetType;
  target_value: string | null;
  target_label?: string | null;
  status: 'sent' | 'unsent';
  version: number;
  created_at: string;
  updated_at: string;
  unsent_at?: string | null;
  resent_at?: string | null;
  stats?: {
    recipients: number;
    unread: number;
    read: number;
  };
};

type Draft = {
  id?: string;
  title: string;
  body_html: string;
  target_type: TargetType;
  target_value: string;
};

function emptyDraft(): Draft {
  return {
    title: '',
    body_html: '',
    target_type: 'leader',
    target_value: '',
  };
}

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

export default function LeaderMessagesPage() {
  const [token, setToken] = useState<string | null>(null);
  const [messages, setMessages] = useState<InboxMessage[]>([]);
  const [leaders, setLeaders] = useState<Leader[]>([]);
  const [recipients, setRecipients] = useState<RecipientLeader[]>([]);
  const [pushSummary, setPushSummary] = useState<PushSummary | null>(null);
  const [recipientFilter, setRecipientFilter] = useState<RecipientFilter>('all');
  const [nudging, setNudging] = useState(false);
  const [draft, setDraft] = useState<Draft>(emptyDraft());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [loading, setLoading] = useState(true);
  const [previewing, setPreviewing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [actingId, setActingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [leaderSearch, setLeaderSearch] = useState('');
  const editorSectionRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      const accessToken = data.session?.access_token || null;
      setToken(accessToken);
      setAuthChecked(true);
      if (!accessToken) setLoading(false);
    });
  }, []);

  const campuses = useMemo(
    () => Array.from(new Set(leaders.map((l) => l.campus).filter(Boolean) as string[])).sort(),
    [leaders]
  );

  const acpds = useMemo(
    () => Array.from(new Set(leaders.map((l) => l.acpd).filter(Boolean) as string[])).sort(),
    [leaders]
  );

  const selectedLeaderIds = useMemo(
    () => draft.target_value.split(',').map((id) => id.trim()).filter(Boolean),
    [draft.target_value]
  );

  const selectedLeaderIdSet = useMemo(() => new Set(selectedLeaderIds), [selectedLeaderIds]);

  const selectedLeaders = useMemo(
    () => leaders.filter((leader) => selectedLeaderIdSet.has(String(leader.id))),
    [leaders, selectedLeaderIdSet]
  );

  const filteredLeaderOptions = useMemo(() => {
    const query = leaderSearch.trim().toLowerCase();
    const matches = query
      ? leaders.filter((leader) =>
          [leader.name, leader.campus, leader.acpd]
            .filter(Boolean)
            .join(' ')
            .toLowerCase()
            .includes(query)
        )
      : leaders;

    return matches.slice(0, 50);
  }, [leaderSearch, leaders]);

  const loadMessages = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/circle-summary-inbox', {
        headers: { Authorization: `Bearer ${token}` },
        cache: 'no-store',
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to load messages.');
      setMessages(data.messages || []);
    } catch (error: unknown) {
      setError(getErrorMessage(error, 'Failed to load messages.'));
    } finally {
      setLoading(false);
    }
  }, [token]);

  const loadLeaders = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('circle_leaders')
        .select('id, name, campus, acpd, ccb_group_id, status, circle_summary_access_enabled')
        .order('name');
      if (error) throw error;
      setLeaders(
        ((data || []) as LeaderRow[]).filter((leader) => {
          const status = String(leader.status || '').toLowerCase();
          if (status === 'archive' || status === 'archived') return false;
          return leader.circle_summary_access_enabled !== false;
        })
      );
    } catch {
      setLeaders([]);
    }
  }, []);

  useEffect(() => {
    if (!token) return;
    loadMessages();
    loadLeaders();
  }, [token, loadMessages, loadLeaders]);

  useEffect(() => {
    if (!token) return;
    const editingMessage = draft.id ? messages.find((m) => m.id === draft.id) : null;
    if (draft.id && editingMessage?.status !== 'unsent') return;
    if (draft.target_type !== 'all' && !draft.target_value) {
      setRecipients([]);
      setPushSummary(null);
      return;
    }

    let cancelled = false;
    setPreviewing(true);
    const params = new URLSearchParams({
      preview: '1',
      target_type: draft.target_type,
    });
    if (draft.target_value) params.set('target_value', draft.target_value);

    fetch(`/api/admin/circle-summary-inbox?${params.toString()}`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: 'no-store',
    })
      .then((r) => r.json().then((data) => ({ ok: r.ok, data })))
      .then(({ ok, data }) => {
        if (cancelled) return;
        if (!ok) throw new Error(data.error || 'Preview failed.');
        setRecipients(data.recipients || []);
        setPushSummary(data.pushSummary || null);
      })
      .catch(() => {
        if (!cancelled) {
          setRecipients([]);
          setPushSummary(null);
        }
      })
      .finally(() => {
        if (!cancelled) setPreviewing(false);
      });

    return () => {
      cancelled = true;
    };
  }, [draft.id, draft.target_type, draft.target_value, messages, token]);

  function resetDraft() {
    setEditingId(null);
    setDraft(emptyDraft());
    setRecipients([]);
    setPushSummary(null);
    setRecipientFilter('all');
    setError(null);
  }

  function startEdit(message: InboxMessage) {
    setEditingId(message.id);
    setDraft({
      id: message.id,
      title: message.title,
      body_html: message.body_html,
      target_type: message.target_type,
      target_value: message.target_value || '',
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
      target_type: 'leader',
      target_value: '',
    });
    setRecipients([]);
    setLeaderSearch('');
    setError(null);
    setSuccess('Message duplicated. Choose recipients and send it when ready.');
    window.requestAnimationFrame(() => {
      editorSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }

  function updateTargetType(targetType: TargetType) {
    setDraft((current) => ({
      ...current,
      target_type: targetType,
      target_value: targetType === 'all' ? '' : '',
    }));
    setLeaderSearch('');
  }

  function updateSelectedLeaders(nextIds: string[]) {
    setDraft((current) => ({
      ...current,
      target_value: Array.from(new Set(nextIds)).join(','),
    }));
  }

  function toggleSelectedLeader(leaderId: string) {
    if (targetLocked) return;
    if (selectedLeaderIdSet.has(leaderId)) {
      updateSelectedLeaders(selectedLeaderIds.filter((id) => id !== leaderId));
      return;
    }
    updateSelectedLeaders([...selectedLeaderIds, leaderId]);
  }

  async function save() {
    if (!token) return;
    if (!draft.title.trim()) {
      setError('Title is required.');
      return;
    }
    if (!draft.id && draft.target_type !== 'all' && !draft.target_value) {
      setError('Choose a target before sending.');
      return;
    }

    setSaving(true);
    setError(null);
    setSuccess(null);

    try {
      const isEdit = !!draft.id;
      const editingMessage = draft.id ? messages.find((m) => m.id === draft.id) : null;
      const isResend = editingMessage?.status === 'unsent';
      const res = await fetch('/api/admin/circle-summary-inbox', {
        method: isResend ? 'PATCH' : isEdit ? 'PUT' : 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          action: isResend ? 'resend' : undefined,
          id: draft.id,
          title: draft.title,
          body_html: draft.body_html,
          target_type: draft.target_type,
          target_value: draft.target_type === 'all' ? null : draft.target_value,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || (isEdit ? 'Edit failed.' : 'Send failed.'));

      setSuccess(
        isResend
          ? `Message resent to ${data.recipients?.length || 0} leader${data.recipients?.length === 1 ? '' : 's'}.`
          : isEdit
          ? 'Message updated. Leaders will see it as unread again.'
          : `Message sent to ${data.recipients?.length || 0} leader${data.recipients?.length === 1 ? '' : 's'}.`
      );
      resetDraft();
      await loadMessages();
    } catch (error: unknown) {
      setError(getErrorMessage(error, 'Save failed.'));
    } finally {
      setSaving(false);
    }
  }

  const noPushRecipients = useMemo(
    () => recipients.filter((leader) => leader.push_status !== 'enabled'),
    [recipients]
  );

  const filteredRecipients = useMemo(() => {
    if (recipientFilter === 'push') return recipients.filter((l) => l.push_status === 'enabled');
    if (recipientFilter === 'no_push') return noPushRecipients;
    return recipients;
  }, [recipients, noPushRecipients, recipientFilter]);

  async function nudgeNoPushRecipients() {
    if (!token || noPushRecipients.length === 0) return;
    setNudging(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await fetch('/api/admin/circle-summary-inbox', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          action: 'nudge_push',
          leader_ids: noPushRecipients.map((leader) => String(leader.id)),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Nudge failed.');
      setSuccess(
        `Nudged ${data.nudged} leader${data.nudged === 1 ? '' : 's'} to turn on notifications. They'll see a prompt next time they open the Hub.`
      );
    } catch (error: unknown) {
      setError(getErrorMessage(error, 'Nudge failed.'));
    } finally {
      setNudging(false);
    }
  }

  const editingMessage = editingId ? messages.find((m) => m.id === editingId) : null;
  const editingUnsent = editingMessage?.status === 'unsent';
  const targetLocked = !!editingId && !editingUnsent;

  async function unsendMessage(message: InboxMessage) {
    if (!token) return;
    if (!confirm('Unsend this message? It will disappear from leader inboxes until you resend it.')) return;
    setActingId(message.id);
    setError(null);
    setSuccess(null);
    try {
      const res = await fetch('/api/admin/circle-summary-inbox', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ id: message.id, action: 'unsend' }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Unsend failed.');
      setSuccess('Message unsent. It has been removed from leader inboxes.');
      await loadMessages();
      startEdit({ ...message, status: 'unsent', stats: { recipients: 0, unread: 0, read: 0 } });
    } catch (error: unknown) {
      setError(getErrorMessage(error, 'Unsend failed.'));
    } finally {
      setActingId(null);
    }
  }

  async function deleteMessage(message: InboxMessage) {
    if (!token) return;
    if (!confirm('Delete this message permanently? It will be removed from every leader inbox.')) return;
    setActingId(message.id);
    setError(null);
    setSuccess(null);
    try {
      const res = await fetch(`/api/admin/circle-summary-inbox?id=${encodeURIComponent(message.id)}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Delete failed.');
      if (editingId === message.id) resetDraft();
      setSuccess('Message deleted and removed from leader inboxes.');
      await loadMessages();
    } catch (error: unknown) {
      setError(getErrorMessage(error, 'Delete failed.'));
    } finally {
      setActingId(null);
    }
  }

  if (authChecked && !token) {
    return (
      <div className="min-h-screen bg-[#0f1117] p-4 sm:p-6 lg:p-8">
        <div className="max-w-xl mx-auto bg-zinc-800 border border-zinc-700 rounded-xl p-6 shadow-card-glass">
          <h1 className="text-xl font-semibold text-white tracking-tight">Leader Messages</h1>
          <p className="text-sm text-slate-400 mt-2">
            Sign in to RADIUS before sending messages to Circle Leaders.
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
    <div className="min-h-screen bg-[#0f1117] p-4 sm:p-6 lg:p-8">
      <div className="max-w-6xl mx-auto">
        <div className="mb-6">
          <h1 className="text-xl font-semibold text-white tracking-tight">Leader Messages</h1>
          <p className="text-sm text-slate-400 mt-1">
            Send rich-text messages to Circle Leaders. Messages appear in their Circle Summary Resources inbox.
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
                  {editingUnsent ? 'Edit and resend message' : editingId ? 'Edit sent message' : 'Compose message'}
                </h2>
                {editingMessage?.status === 'sent' && (
                  <p className="text-xs text-amber-300 mt-1">
                    Editing this message will mark it unread again for every recipient.
                  </p>
                )}
                {editingUnsent && (
                  <p className="text-xs text-amber-300 mt-1">
                    This message is unsent and is not visible to leaders until you resend it.
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
                  className="w-full bg-zinc-700 border border-zinc-600 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-vc-500"
                  value={draft.title}
                  onChange={(e) => setDraft({ ...draft, title: e.target.value })}
                  placeholder="e.g. Updated Leader Night details"
                />
              </Field>

              <Field label="Message" hint="Rich text supports headings, links, bold, italics, and lists.">
                <div className="rte-on-dark">
                  <RichTextEditor
                    value={draft.body_html}
                    onChange={(html) => setDraft({ ...draft, body_html: html })}
                    placeholder="Write the message leaders should see..."
                    minHeight="180px"
                    allowButton
                  />
                </div>
              </Field>

              <Field
                label="Target"
                hint={targetLocked ? 'Recipients are locked after send. Unsend first if you need to change the target.' : undefined}
              >
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-3">
                  {[
                    ['leader', 'Circle'],
                    ['campus', 'Campus'],
                    ['acpd', 'ACPD'],
                    ['all', 'All leaders'],
                  ].map(([value, label]) => (
                    <button
                      key={value}
                      type="button"
                      disabled={targetLocked}
                      onClick={() => updateTargetType(value as TargetType)}
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

                {draft.target_type === 'leader' && (
                  <div className="space-y-3">
                    {selectedLeaders.length > 0 && (
                      <div className="flex flex-wrap gap-2">
                        {selectedLeaders.map((leader) => (
                          <span
                            key={leader.id}
                            className="inline-flex items-center gap-2 rounded-full border border-vc-500/30 bg-vc-500/15 px-3 py-1 text-xs font-medium text-vc-100"
                          >
                            {leader.name}
                            {!targetLocked && (
                              <button
                                type="button"
                                onClick={() => toggleSelectedLeader(String(leader.id))}
                                className="text-vc-200 hover:text-white"
                                aria-label={`Remove ${leader.name}`}
                              >
                                x
                              </button>
                            )}
                          </span>
                        ))}
                      </div>
                    )}

                    <input
                      disabled={targetLocked}
                      className="w-full bg-zinc-700 border border-zinc-600 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-vc-500 disabled:opacity-60"
                      value={leaderSearch}
                      onChange={(e) => setLeaderSearch(e.target.value)}
                      placeholder="Search leaders by name, campus, or ACPD..."
                    />

                    <div className="max-h-64 overflow-auto rounded-lg border border-zinc-700 bg-zinc-900/60 divide-y divide-zinc-700">
                      {filteredLeaderOptions.length === 0 ? (
                        <div className="p-3 text-sm text-slate-400">No leaders match that search.</div>
                      ) : (
                        filteredLeaderOptions.map((leader) => {
                          const leaderId = String(leader.id);
                          const checked = selectedLeaderIdSet.has(leaderId);
                          return (
                            <button
                              key={leader.id}
                              type="button"
                              disabled={targetLocked}
                              onClick={() => toggleSelectedLeader(leaderId)}
                              className={
                                'flex w-full items-start gap-3 px-3 py-2.5 text-left transition-colors disabled:opacity-60 ' +
                                (checked ? 'bg-vc-500/15' : 'hover:bg-zinc-800')
                              }
                            >
                              <input
                                type="checkbox"
                                checked={checked}
                                readOnly
                                className="mt-0.5 h-4 w-4 shrink-0 rounded border-zinc-500 bg-zinc-800 text-vc-500"
                              />
                              <span className="min-w-0">
                                <span className="block text-sm font-medium text-slate-100">{leader.name}</span>
                                <span className="block text-xs text-slate-500 mt-0.5">
                                  {[leader.campus, leader.acpd].filter(Boolean).join(' · ') || 'No campus/ACPD'}
                                </span>
                              </span>
                            </button>
                          );
                        })
                      )}
                    </div>

                    <p className="text-xs text-slate-500">
                      {selectedLeaders.length} selected
                      {leaderSearch.trim() ? ` · showing ${filteredLeaderOptions.length} result${filteredLeaderOptions.length === 1 ? '' : 's'}` : ''}
                    </p>
                  </div>
                )}

                {draft.target_type === 'campus' && (
                  <select
                    disabled={targetLocked}
                    className="w-full bg-zinc-700 border border-zinc-600 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-vc-500 disabled:opacity-60"
                    value={draft.target_value}
                    onChange={(e) => setDraft({ ...draft, target_value: e.target.value })}
                  >
                    <option value="">Choose a campus...</option>
                    {campuses.map((campus) => (
                      <option key={campus} value={campus}>{campus}</option>
                    ))}
                  </select>
                )}

                {draft.target_type === 'acpd' && (
                  <select
                    disabled={targetLocked}
                    className="w-full bg-zinc-700 border border-zinc-600 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-vc-500 disabled:opacity-60"
                    value={draft.target_value}
                    onChange={(e) => setDraft({ ...draft, target_value: e.target.value })}
                  >
                    <option value="">Choose an ACPD...</option>
                    {acpds.map((acpd) => (
                      <option key={acpd} value={acpd}>{acpd}</option>
                    ))}
                  </select>
                )}
              </Field>

              <div className="flex items-center gap-3 pt-1">
                <button
                  onClick={save}
                  disabled={saving}
                  className="bg-btn-primary text-white px-4 py-2 rounded-lg text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
                >
                  {saving ? 'Saving...' : editingUnsent ? 'Resend message' : editingId ? 'Update message' : 'Send message'}
                </button>
                {(!editingId || editingUnsent) && (
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
              Everyone here gets the message in their Hub inbox. The badge shows who will also get a push notification.
            </p>

            {targetLocked ? (
              <div className="mt-4 rounded-lg bg-zinc-900/60 border border-zinc-700 p-3 text-sm text-slate-300">
                Recipients are already set for this message.
              </div>
            ) : recipients.length === 0 ? (
              <div className="mt-4 rounded-lg bg-zinc-900/60 border border-zinc-700 p-3 text-sm text-slate-400">
                Choose a target to see who will receive it.
              </div>
            ) : (
              <>
                {pushSummary && (
                  <div className="mt-4 rounded-lg bg-zinc-900/60 border border-zinc-700 p-3">
                    <p className="text-sm text-slate-200">
                      <span className="font-semibold text-emerald-300">{pushSummary.enabled}</span> of{' '}
                      {recipients.length} will get a push
                      {noPushRecipients.length > 0 && (
                        <>
                          {' · '}
                          <span className="font-semibold text-amber-300">{noPushRecipients.length}</span> in-app only
                        </>
                      )}
                    </p>
                    {noPushRecipients.length > 0 && (
                      <button
                        type="button"
                        onClick={nudgeNoPushRecipients}
                        disabled={nudging}
                        className="mt-2.5 w-full bg-btn-primary text-white px-3 py-2 rounded-lg text-xs font-semibold hover:opacity-90 transition-opacity disabled:opacity-50"
                      >
                        {nudging
                          ? 'Nudging...'
                          : `Nudge ${noPushRecipients.length} to enable push`}
                      </button>
                    )}
                  </div>
                )}

                {noPushRecipients.length > 0 && (
                  <div className="mt-3 inline-flex rounded-lg border border-zinc-700 bg-zinc-900/60 p-0.5 text-xs">
                    {([
                      ['all', `All ${recipients.length}`],
                      ['push', `Push ${pushSummary?.enabled ?? 0}`],
                      ['no_push', `In-app ${noPushRecipients.length}`],
                    ] as [RecipientFilter, string][]).map(([value, label]) => (
                      <button
                        key={value}
                        type="button"
                        onClick={() => setRecipientFilter(value)}
                        className={`px-2.5 py-1 rounded-md font-medium transition-colors ${
                          recipientFilter === value
                            ? 'bg-vc-500/20 text-vc-200'
                            : 'text-slate-400 hover:text-slate-200'
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                )}

                <div className="mt-3 max-h-[420px] overflow-auto rounded-lg border border-zinc-700 divide-y divide-zinc-700">
                  {filteredRecipients.length === 0 ? (
                    <div className="p-3 bg-zinc-900/40 text-sm text-slate-400">No leaders in this filter.</div>
                  ) : (
                    filteredRecipients.map((leader) => {
                      const badge = PUSH_BADGE[leader.push_status || 'no_device'];
                      return (
                        <div key={leader.id} className="p-3 bg-zinc-900/40 flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-slate-100">{leader.name}</p>
                            <p className="text-xs text-slate-500 mt-0.5">
                              {[leader.campus, leader.acpd].filter(Boolean).join(' · ') || 'No campus/ACPD'}
                            </p>
                          </div>
                          <span
                            title={badge.title}
                            className={`shrink-0 text-xs font-medium px-2 py-0.5 rounded-full ${badge.className}`}
                          >
                            {badge.label}
                          </span>
                        </div>
                      );
                    })
                  )}
                </div>
              </>
            )}
          </aside>
        </div>

        <section className="mt-6">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-base font-semibold text-white">Sent messages</h2>
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
              <p className="text-slate-400 text-sm">No inbox messages have been sent yet.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {messages.map((message) => (
                <article
                  key={message.id}
                  className="bg-zinc-800 border border-zinc-700 rounded-xl p-4 flex items-start justify-between gap-4"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="text-sm font-semibold text-white">{message.title}</h3>
                      <span
                        className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                          message.status === 'unsent'
                            ? 'bg-amber-500/20 text-amber-300'
                            : 'bg-emerald-500/20 text-emerald-300'
                        }`}
                      >
                        {message.status === 'unsent' ? 'unsent' : 'sent'}
                      </span>
                      {message.version > 1 && (
                        <span className="bg-amber-500/20 text-amber-300 text-xs font-medium px-2 py-0.5 rounded-full">
                          v{message.version}
                        </span>
                      )}
                    </div>
                    {message.body_html && (
                      <div
                        className="text-xs text-slate-400 mt-1 line-clamp-2 prose prose-invert prose-sm max-w-none"
                        dangerouslySetInnerHTML={{ __html: renderMessageHtml(message.body_html) }}
                      />
                    )}
                    <p className="text-xs text-slate-500 mt-2">
                      {message.stats?.recipients || 0} recipient{message.stats?.recipients === 1 ? '' : 's'}
                      {' · '}
                      {message.stats?.unread || 0} unread
                      {' · '}
                      {message.stats?.read || 0} read
                      {' · '}
                      Updated {new Date(message.updated_at).toLocaleString()}
                    </p>
                  </div>
                  <div className="shrink-0 flex items-center gap-2 flex-wrap justify-end">
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
                    {message.status === 'sent' && (
                      <button
                        onClick={() => unsendMessage(message)}
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
              ))}
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
