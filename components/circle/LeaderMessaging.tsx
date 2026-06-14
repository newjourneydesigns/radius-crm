'use client';

/**
 * Messaging section for the Circle Leader Profile page.
 *
 * A lightweight, CRM-style communication hub scoped to one leader: send a message
 * straight to their Toolkit Inbox, schedule messages for later, send from saved
 * templates, and read a chronological message history with read receipts. All
 * activity is tied to this leader's record via the per-leader messaging API.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { DateTime } from 'luxon';
import { supabase } from '../../lib/supabase';
import { renderMessageHtml } from '../../lib/renderMessageHtml';
import RichTextEditor from '../notes/RichTextEditor';
import ToolkitContentPreview from '../circle-leader-toolkit/ToolkitContentPreview';

interface LeaderMessagingProps {
  leaderId: number;
  leaderName: string;
  accessEnabled?: boolean;
}

type Template = {
  id: string;
  title: string;
  subject: string | null;
  body_html: string;
  category: string | null;
  sort_order: number;
};

type OutboundItem = {
  kind: 'outbound';
  id: string;
  recipient_id: string;
  title: string;
  body_html: string;
  version: number;
  status: 'sent' | 'unsent' | string;
  broadcast: boolean;
  read: boolean;
  read_at: string | null;
  sort_at: string;
  created_at: string;
  updated_at: string;
};

type ConversationItem = OutboundItem;

type ScheduledItem = {
  id: string;
  title: string;
  body_html: string;
  scheduled_at: string;
  created_at: string;
  updated_at: string;
};

type Stats = {
  sent: number;
  read: number;
  scheduled: number;
};

/** Wall-clock value for a <datetime-local> input, in church time (America/Chicago). */
function isoToLocalInput(iso: string | null | undefined): string {
  if (!iso) return '';
  const dt = DateTime.fromISO(iso, { zone: 'utc' }).setZone('America/Chicago');
  return dt.isValid ? dt.toFormat("yyyy-LL-dd'T'HH:mm") : '';
}

/** A church-time wall clock from the input back to a UTC ISO string for the API. */
function localInputToUtcIso(local: string): string | null {
  if (!local) return null;
  const dt = DateTime.fromISO(local, { zone: 'America/Chicago' });
  return dt.isValid ? dt.toUTC().toISO() : null;
}

function formatStamp(iso: string | null | undefined): string {
  if (!iso) return '';
  const dt = DateTime.fromISO(iso).setZone('America/Chicago');
  if (!dt.isValid) return '';
  const now = DateTime.now().setZone('America/Chicago');
  const fmt = dt.hasSame(now, 'year') ? 'LLL d, h:mm a' : 'LLL d, yyyy, h:mm a';
  return dt.toFormat(fmt);
}

function dayLabel(iso: string): string {
  const dt = DateTime.fromISO(iso).setZone('America/Chicago');
  const now = DateTime.now().setZone('America/Chicago');
  if (dt.hasSame(now, 'day')) return 'Today';
  if (dt.hasSame(now.minus({ days: 1 }), 'day')) return 'Yesterday';
  return dt.toFormat(dt.hasSame(now, 'year') ? 'cccc, LLL d' : 'LLL d, yyyy');
}

const emptyDraft = { title: '', body_html: '' };

export default function LeaderMessaging({ leaderId, leaderName, accessEnabled = true }: LeaderMessagingProps) {
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [conversation, setConversation] = useState<ConversationItem[]>([]);
  const [scheduled, setScheduled] = useState<ScheduledItem[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [stats, setStats] = useState<Stats>({ sent: 0, read: 0, scheduled: 0 });

  // Composer state
  const [composerOpen, setComposerOpen] = useState(false);
  const [draft, setDraft] = useState(emptyDraft);
  const [scheduleOn, setScheduleOn] = useState(false);
  const [scheduleLocal, setScheduleLocal] = useState('');
  const [editingScheduledId, setEditingScheduledId] = useState<string | null>(null);
  const [editingSentId, setEditingSentId] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  const [templateMenuOpen, setTemplateMenuOpen] = useState(false);
  const [showTemplateManager, setShowTemplateManager] = useState(false);

  const composerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setToken(data.session?.access_token || null));
  }, []);

  const authHeaders = useCallback(
    (json = false): Record<string, string> => ({
      ...(json ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    }),
    [token]
  );

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/circle-leaders/${leaderId}/messaging`, {
        headers: authHeaders(),
        cache: 'no-store',
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not load messages.');
      setConversation(data.conversation || []);
      setScheduled(data.scheduled || []);
      setTemplates(data.templates || []);
      setStats(data.stats || { sent: 0, read: 0, scheduled: 0 });
    } catch (e: any) {
      setError(e.message || 'Could not load messages.');
    } finally {
      setLoading(false);
    }
  }, [token, leaderId, authHeaders]);

  useEffect(() => {
    load();
  }, [load]);

  function resetComposer() {
    setDraft(emptyDraft);
    setScheduleOn(false);
    setScheduleLocal('');
    setEditingScheduledId(null);
    setEditingSentId(null);
  }

  function openComposer(opts?: { schedule?: boolean }) {
    resetComposer();
    if (opts?.schedule) {
      setScheduleOn(true);
      setScheduleLocal(DateTime.now().setZone('America/Chicago').plus({ hours: 1 }).startOf('hour').toFormat("yyyy-LL-dd'T'HH:mm"));
    }
    setComposerOpen(true);
    setNotice(null);
    setTimeout(() => composerRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 50);
  }

  function applyTemplate(t: Template) {
    const fill = (s: string) => s.replace(/\{\{\s*name\s*\}\}/g, (leaderName || '').split(' ')[0] || leaderName || '');
    setDraft({ title: fill(t.subject || t.title), body_html: fill(t.body_html) });
    setTemplateMenuOpen(false);
    if (!composerOpen) setComposerOpen(true);
  }

  async function handleSend() {
    if (!draft.title.trim()) {
      setError('Add a subject before sending.');
      return;
    }
    setSending(true);
    setError(null);
    setNotice(null);
    const scheduledIso = scheduleOn ? localInputToUtcIso(scheduleLocal) : null;
    if (scheduleOn && !scheduledIso) {
      setError('Pick a valid date and time to schedule this message.');
      setSending(false);
      return;
    }
    try {
      let res: Response;
      if (editingScheduledId) {
        res = await fetch(`/api/circle-leaders/${leaderId}/messaging`, {
          method: 'PATCH',
          headers: authHeaders(true),
          body: JSON.stringify({
            action: 'edit_scheduled',
            id: editingScheduledId,
            title: draft.title,
            body_html: draft.body_html,
            scheduled_at: scheduledIso,
          }),
        });
      } else if (editingSentId) {
        res = await fetch(`/api/circle-leaders/${leaderId}/messaging`, {
          method: 'PATCH',
          headers: authHeaders(true),
          body: JSON.stringify({
            action: 'edit_sent',
            id: editingSentId,
            title: draft.title,
            body_html: draft.body_html,
          }),
        });
      } else {
        res = await fetch(`/api/circle-leaders/${leaderId}/messaging`, {
          method: 'POST',
          headers: authHeaders(true),
          body: JSON.stringify({
            title: draft.title,
            body_html: draft.body_html,
            scheduled_at: scheduledIso,
          }),
        });
      }
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Send failed.');
      setNotice(
        editingSentId
          ? 'Message updated — the leader will see it as new in their inbox.'
          : scheduledIso
          ? `Scheduled for ${formatStamp(scheduledIso)}.`
          : 'Message sent to the leader’s Toolkit Inbox.'
      );
      resetComposer();
      setComposerOpen(false);
      await load();
    } catch (e: any) {
      setError(e.message || 'Send failed.');
    } finally {
      setSending(false);
    }
  }

  async function patchMessage(payload: Record<string, unknown>, successNotice?: string) {
    setError(null);
    try {
      const res = await fetch(`/api/circle-leaders/${leaderId}/messaging`, {
        method: 'PATCH',
        headers: authHeaders(true),
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Action failed.');
      if (successNotice) setNotice(successNotice);
      await load();
    } catch (e: any) {
      setError(e.message || 'Action failed.');
    }
  }

  function editScheduled(item: ScheduledItem) {
    setEditingSentId(null);
    setEditingScheduledId(item.id);
    setDraft({ title: item.title, body_html: item.body_html });
    setScheduleOn(true);
    setScheduleLocal(isoToLocalInput(item.scheduled_at));
    setComposerOpen(true);
    setNotice(null);
    setTimeout(() => composerRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 50);
  }

  function editSent(item: OutboundItem) {
    setEditingScheduledId(null);
    setEditingSentId(item.id);
    setDraft({ title: item.title, body_html: item.body_html });
    setScheduleOn(false);
    setScheduleLocal('');
    setComposerOpen(true);
    setNotice(null);
    setTimeout(() => composerRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 50);
  }

  // Show the most recent messages first; reveal older ones in pages on demand.
  const PAGE_SIZE = 12;
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const olderCount = Math.max(0, conversation.length - visibleCount);

  // Group the visible window of the conversation by day for timeline headers.
  const grouped = useMemo(() => {
    const windowed = conversation.slice(Math.max(0, conversation.length - visibleCount));
    const groups: { day: string; items: ConversationItem[] }[] = [];
    for (const item of windowed) {
      const label = dayLabel(item.sort_at);
      const last = groups[groups.length - 1];
      if (last && last.day === label) last.items.push(item);
      else groups.push({ day: label, items: [item] });
    }
    return groups;
  }, [conversation, visibleCount]);

  const sectionTitle = editingScheduledId ? 'Edit scheduled message' : editingSentId ? 'Edit sent message' : scheduleOn ? 'Schedule a message' : 'Send a message';

  return (
    <div id="leader-messaging" className="bg-brand-dark border border-zinc-700 rounded-xl shadow-card-glass overflow-hidden scroll-mt-24">
      {/* Header + quick actions */}
      <div className="px-4 sm:px-6 py-3.5 border-b border-zinc-700 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Messaging</span>
          <div className="hidden sm:flex items-center gap-1.5 text-[11px] text-slate-400">
            <span className="rounded-full bg-zinc-800/80 border border-zinc-700 px-2 py-0.5">{stats.sent} sent</span>
            <span className="rounded-full bg-zinc-800/80 border border-zinc-700 px-2 py-0.5">{stats.read} read</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => openComposer()}
            className="h-8 px-3 inline-flex items-center gap-1.5 rounded-lg border border-emerald-500/40 bg-emerald-500/10 text-emerald-300 text-xs font-semibold hover:bg-emerald-500/20 transition-colors"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" /></svg>
            Send
          </button>
          <button
            type="button"
            onClick={() => openComposer({ schedule: true })}
            className="h-8 px-3 inline-flex items-center gap-1.5 rounded-lg border border-zinc-600 bg-zinc-700/60 text-slate-200 text-xs font-semibold hover:bg-zinc-700 transition-colors"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
            Schedule
          </button>
          <div className="relative">
            <button
              type="button"
              onClick={() => setTemplateMenuOpen((v) => !v)}
              className="h-8 px-3 inline-flex items-center gap-1.5 rounded-lg border border-zinc-600 bg-zinc-700/60 text-slate-200 text-xs font-semibold hover:bg-zinc-700 transition-colors"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" /></svg>
              Templates
            </button>
            {templateMenuOpen && (
              <>
                <div className="fixed inset-0 z-30" onClick={() => setTemplateMenuOpen(false)} />
                <div className="absolute right-0 mt-1.5 w-72 z-40 rounded-xl border border-zinc-700 bg-zinc-900 shadow-xl overflow-hidden">
                  <div className="max-h-72 overflow-auto divide-y divide-zinc-800">
                    {templates.length === 0 ? (
                      <div className="p-3 text-xs text-slate-400">No templates yet.</div>
                    ) : (
                      templates.map((t) => (
                        <button
                          key={t.id}
                          type="button"
                          onClick={() => applyTemplate(t)}
                          className="w-full text-left px-3 py-2.5 hover:bg-zinc-800 transition-colors"
                        >
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium text-slate-100 truncate">{t.title}</span>
                            {t.category && (
                              <span className="shrink-0 text-[10px] uppercase tracking-wide text-slate-400 bg-zinc-800 border border-zinc-700 rounded px-1.5 py-0.5">{t.category}</span>
                            )}
                          </div>
                          {t.subject && <div className="text-xs text-slate-500 truncate mt-0.5">{t.subject}</div>}
                        </button>
                      ))
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => { setTemplateMenuOpen(false); setShowTemplateManager(true); }}
                    className="w-full text-left px-3 py-2.5 text-xs font-semibold text-emerald-300 hover:bg-zinc-800 border-t border-zinc-800"
                  >
                    Manage templates…
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      <div className="p-4 sm:p-6 space-y-5">
        {!accessEnabled && (
          <div className="rounded-lg border border-amber-700/40 bg-amber-950/30 px-3 py-2 text-xs text-amber-200">
            Toolkit access is disabled for this leader, so new messages can’t be delivered until it’s turned on.
          </div>
        )}
        {error && (
          <div className="rounded-lg border border-red-700/40 bg-red-950/30 px-3 py-2 text-sm text-red-200">{error}</div>
        )}
        {notice && (
          <div className="rounded-lg border border-emerald-700/40 bg-emerald-950/30 px-3 py-2 text-sm text-emerald-200">{notice}</div>
        )}

        {/* Composer */}
        {composerOpen && (
          <div ref={composerRef} className="rounded-xl border border-zinc-700 bg-zinc-900/40 p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-slate-100">{sectionTitle}</h3>
              <button type="button" onClick={() => { resetComposer(); setComposerOpen(false); }} className="text-slate-400 hover:text-white text-xs px-2 py-1 rounded hover:bg-zinc-700">Close</button>
            </div>

            <input
              className="w-full bg-zinc-800 border border-zinc-600 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
              value={draft.title}
              onChange={(e) => setDraft({ ...draft, title: e.target.value })}
              placeholder="Subject — e.g. Checking in this week"
            />

            <RichTextEditor
              value={draft.body_html}
              onChange={(html) => setDraft({ ...draft, body_html: html })}
              placeholder={`Write to ${leaderName.split(' ')[0] || leaderName}…`}
              minHeight="150px"
              allowButton
              toolkitSurface
            />

            {draft.body_html?.trim() && <ToolkitContentPreview variant="inbox" title={draft.title} bodyHtml={draft.body_html} />}

            {!editingSentId && (
              <div className="flex flex-wrap items-center gap-3">
                <label className="inline-flex items-center gap-2 text-xs font-medium text-slate-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={scheduleOn}
                    onChange={(e) => {
                      setScheduleOn(e.target.checked);
                      if (e.target.checked && !scheduleLocal) {
                        setScheduleLocal(DateTime.now().setZone('America/Chicago').plus({ hours: 1 }).startOf('hour').toFormat("yyyy-LL-dd'T'HH:mm"));
                      }
                    }}
                    className="h-4 w-4 rounded border-zinc-500 bg-zinc-800 text-emerald-500"
                  />
                  Schedule for later
                </label>
                {scheduleOn && (
                  <input
                    type="datetime-local"
                    value={scheduleLocal}
                    onChange={(e) => setScheduleLocal(e.target.value)}
                    className="bg-zinc-800 border border-zinc-600 text-white rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                )}
                {scheduleOn && <span className="text-[11px] text-slate-500">Church time (Central)</span>}
              </div>
            )}

            <div className="flex items-center gap-2 pt-1">
              <button
                type="button"
                onClick={handleSend}
                disabled={sending}
                className="h-9 px-4 inline-flex items-center gap-2 rounded-lg border border-emerald-500/40 bg-emerald-500/15 text-emerald-200 text-sm font-semibold hover:bg-emerald-500/25 transition-colors disabled:opacity-50"
              >
                {sending ? 'Working…' : editingScheduledId ? 'Save changes' : editingSentId ? 'Update message' : scheduleOn ? 'Schedule message' : 'Send now'}
              </button>
              <button type="button" onClick={() => { resetComposer(); setComposerOpen(false); }} className="h-9 px-3 rounded-lg text-slate-300 hover:text-white hover:bg-zinc-700 text-sm transition-colors">Cancel</button>
            </div>
          </div>
        )}

        {/* Scheduled messages */}
        {scheduled.length > 0 && (
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-indigo-300">
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
              Scheduled ({scheduled.length})
            </div>
            {scheduled.map((s) => (
              <div key={s.id} className="rounded-lg border border-indigo-700/40 bg-indigo-950/20 px-3 py-2.5">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-slate-100 truncate">{s.title}</div>
                    <div className="text-xs text-indigo-300 mt-0.5">Sends {formatStamp(s.scheduled_at)}</div>
                  </div>
                  <div className="flex shrink-0 items-center gap-1.5">
                    <button type="button" onClick={() => patchMessage({ action: 'send_now', id: s.id }, 'Message sent.')} className="text-xs px-2 py-1 rounded-md border border-emerald-700/40 bg-emerald-900/30 text-emerald-200 hover:bg-emerald-900/50 transition-colors">Send now</button>
                    <button type="button" onClick={() => editScheduled(s)} className="text-xs px-2 py-1 rounded-md border border-zinc-600 bg-zinc-800 text-slate-200 hover:bg-zinc-700 transition-colors">Edit</button>
                    <button type="button" onClick={() => patchMessage({ action: 'cancel_scheduled', id: s.id }, 'Scheduled message canceled.')} className="text-xs px-2 py-1 rounded-md border border-zinc-600 bg-zinc-800 text-slate-300 hover:text-red-200 hover:border-red-700/50 transition-colors">Cancel</button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Conversation timeline */}
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 mb-3">Conversation</div>
          {loading ? (
            <div className="space-y-3">
              <div className="h-16 rounded-xl bg-zinc-800/50 animate-pulse" />
              <div className="h-12 rounded-xl bg-zinc-800/40 animate-pulse w-2/3 ml-auto" />
            </div>
          ) : conversation.length === 0 ? (
            <div className="text-center py-10 border border-dashed border-zinc-700 rounded-xl bg-zinc-900/30">
              <p className="text-sm text-slate-400">No messages yet.</p>
              <button type="button" onClick={() => openComposer()} className="mt-2 text-sm font-semibold text-emerald-300 hover:text-emerald-200">Send the first message →</button>
            </div>
          ) : (
            <div className="space-y-5">
              {olderCount > 0 && (
                <button
                  type="button"
                  onClick={() => setVisibleCount((c) => c + PAGE_SIZE)}
                  className="w-full rounded-lg border border-zinc-700 bg-zinc-900/40 py-2 text-xs font-medium text-slate-300 hover:bg-zinc-800 transition-colors"
                >
                  Show earlier messages ({olderCount})
                </button>
              )}
              {grouped.map((group) => (
                <div key={group.day} className="space-y-3">
                  <div className="flex items-center gap-3">
                    <div className="h-px flex-1 bg-zinc-800" />
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">{group.day}</span>
                    <div className="h-px flex-1 bg-zinc-800" />
                  </div>
                  {group.items.map((item) => (
                    <OutboundBubble key={`o-${item.id}`} item={item} onEdit={() => editSent(item)} onUnsend={() => patchMessage({ action: 'unsend', id: item.id }, 'Message unsent — it’s hidden from the leader’s inbox.')} />
                  ))}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {showTemplateManager && (
        <TemplateManager
          templates={templates}
          authHeaders={authHeaders}
          onClose={() => setShowTemplateManager(false)}
          onChanged={load}
        />
      )}
    </div>
  );
}

function ReadReceipt({ item }: { item: OutboundItem }) {
  if (item.status === 'unsent') {
    return <span className="inline-flex items-center gap-1 text-[11px] text-amber-300/90">Unsent — hidden from inbox</span>;
  }
  if (item.read) {
    return (
      <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-300">
        <span aria-hidden className="font-bold tracking-[-0.15em] pr-0.5">✓✓</span>
        Read {formatStamp(item.read_at)}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-[11px] text-slate-500">
      <span aria-hidden className="font-bold">✓</span>
      Delivered · unread
    </span>
  );
}

function OutboundBubble({ item, onEdit, onUnsend }: { item: OutboundItem; onEdit: () => void; onUnsend: () => void }) {
  return (
    <div className="flex justify-end">
      <div className="max-w-[88%] sm:max-w-[78%] min-w-0">
        <div className="rounded-2xl rounded-tr-sm border border-emerald-800/40 bg-emerald-950/30 overflow-hidden">
          <div className="px-3.5 pt-2.5 pb-1.5 flex items-center justify-between gap-2 border-b border-emerald-900/40">
            <div className="flex items-center gap-2 min-w-0">
              <span className="text-sm font-semibold text-emerald-100 truncate">{item.title}</span>
              {item.broadcast && <span className="shrink-0 text-[10px] uppercase tracking-wide text-sky-300 bg-sky-950/50 border border-sky-800/50 rounded px-1.5 py-0.5">Broadcast</span>}
              {item.version > 1 && <span className="shrink-0 text-[10px] uppercase tracking-wide text-amber-300 bg-amber-950/40 border border-amber-800/50 rounded px-1.5 py-0.5">Edited</span>}
            </div>
            <span className="shrink-0 text-[10px] text-emerald-400/70 uppercase tracking-wide">You</span>
          </div>
          {item.body_html?.trim() && (
            <div
              className="px-3.5 py-2.5 bg-white text-neutral-800 cs-resources text-sm leading-relaxed [&_a]:text-emerald-700 [&_a]:underline [&_p]:my-1 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5"
              dangerouslySetInnerHTML={{ __html: renderMessageHtml(item.body_html) }}
            />
          )}
        </div>
        <div className="flex items-center justify-end gap-3 mt-1 pr-1">
          <span className="text-[11px] text-slate-500">{formatStamp(item.created_at)}</span>
          <ReadReceipt item={item} />
          {!item.broadcast && item.status !== 'unsent' && (
            <span className="flex items-center gap-2">
              <button type="button" onClick={onEdit} className="text-[11px] text-slate-500 hover:text-slate-200">Edit</button>
              <button type="button" onClick={onUnsend} className="text-[11px] text-slate-500 hover:text-red-300">Unsend</button>
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

const emptyTemplateDraft = { title: '', subject: '', body_html: '', category: '' };

function TemplateManager({
  templates,
  authHeaders,
  onClose,
  onChanged,
}: {
  templates: Template[];
  authHeaders: (json?: boolean) => Record<string, string>;
  onClose: () => void;
  onChanged: () => Promise<void> | void;
}) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [tDraft, setTDraft] = useState(emptyTemplateDraft);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  function startNew() {
    setEditingId(null);
    setTDraft(emptyTemplateDraft);
  }
  function startEdit(t: Template) {
    setEditingId(t.id);
    setTDraft({ title: t.title, subject: t.subject || '', body_html: t.body_html, category: t.category || '' });
  }

  async function save() {
    if (!tDraft.title.trim()) {
      setErr('Give the template a name.');
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch('/api/leader-message-templates', {
        method: editingId ? 'PUT' : 'POST',
        headers: authHeaders(true),
        body: JSON.stringify({ ...tDraft, id: editingId || undefined }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not save template.');
      await onChanged();
      startNew();
    } catch (e: any) {
      setErr(e.message || 'Could not save template.');
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch(`/api/leader-message-templates?id=${encodeURIComponent(id)}`, {
        method: 'DELETE',
        headers: authHeaders(),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not delete template.');
      if (editingId === id) startNew();
      await onChanged();
    } catch (e: any) {
      setErr(e.message || 'Could not delete template.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60" onClick={onClose}>
      <div className="w-full max-w-2xl max-h-[88vh] overflow-auto rounded-2xl border border-zinc-700 bg-brand-dark shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="sticky top-0 bg-brand-dark px-5 py-3.5 border-b border-zinc-700 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-100">Message templates</h3>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-white text-sm px-2 py-1 rounded hover:bg-zinc-700">Done</button>
        </div>
        <div className="p-5 grid grid-cols-1 sm:grid-cols-2 gap-5">
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Saved ({templates.length})</span>
              <button type="button" onClick={startNew} className="text-xs font-semibold text-emerald-300 hover:text-emerald-200">+ New</button>
            </div>
            <div className="space-y-1.5 max-h-[60vh] overflow-auto">
              {templates.map((t) => (
                <div key={t.id} className={`rounded-lg border px-3 py-2 ${editingId === t.id ? 'border-emerald-600/50 bg-emerald-950/20' : 'border-zinc-700 bg-zinc-900/40'}`}>
                  <div className="flex items-start justify-between gap-2">
                    <button type="button" onClick={() => startEdit(t)} className="min-w-0 text-left">
                      <div className="text-sm font-medium text-slate-100 truncate">{t.title}</div>
                      {t.subject && <div className="text-xs text-slate-500 truncate">{t.subject}</div>}
                    </button>
                    <button type="button" onClick={() => remove(t.id)} disabled={busy} className="shrink-0 text-[11px] text-slate-500 hover:text-red-300">Delete</button>
                  </div>
                </div>
              ))}
              {templates.length === 0 && <div className="text-xs text-slate-500 py-4 text-center">No templates yet.</div>}
            </div>
          </div>

          <div className="space-y-3">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{editingId ? 'Edit template' : 'New template'}</span>
            {err && <div className="rounded-lg border border-red-700/40 bg-red-950/30 px-3 py-2 text-xs text-red-200">{err}</div>}
            <input className="w-full bg-zinc-800 border border-zinc-600 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500" placeholder="Template name" value={tDraft.title} onChange={(e) => setTDraft({ ...tDraft, title: e.target.value })} />
            <div className="grid grid-cols-2 gap-2">
              <input className="bg-zinc-800 border border-zinc-600 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500" placeholder="Subject" value={tDraft.subject} onChange={(e) => setTDraft({ ...tDraft, subject: e.target.value })} />
              <input className="bg-zinc-800 border border-zinc-600 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500" placeholder="Category" value={tDraft.category} onChange={(e) => setTDraft({ ...tDraft, category: e.target.value })} />
            </div>
            <RichTextEditor value={tDraft.body_html} onChange={(html) => setTDraft({ ...tDraft, body_html: html })} placeholder="Template message… use {{name}} to drop in the leader’s first name." minHeight="120px" allowButton toolkitSurface />
            <div className="flex items-center gap-2">
              <button type="button" onClick={save} disabled={busy} className="h-9 px-4 rounded-lg border border-emerald-500/40 bg-emerald-500/15 text-emerald-200 text-sm font-semibold hover:bg-emerald-500/25 disabled:opacity-50">{busy ? 'Saving…' : editingId ? 'Save changes' : 'Create template'}</button>
              {editingId && <button type="button" onClick={startNew} className="h-9 px-3 rounded-lg text-slate-300 hover:text-white hover:bg-zinc-700 text-sm">New</button>}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
