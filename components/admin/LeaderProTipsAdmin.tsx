'use client';

import { useCallback, useEffect, useState } from 'react';
import { createClient } from '@supabase/supabase-js';
import { DateTime } from 'luxon';
import RichTextEditor from '../notes/RichTextEditor';
import ToolkitContentPreview from '../circle-leader-toolkit/ToolkitContentPreview';
import { csOpenSans } from '../../lib/circle-leader-toolkit/csFont';
import type { LeaderProTip, ResourcePageAudience } from '../../lib/supabase';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

type TipWithStatus = LeaderProTip & { inbox_status: string | null };

type Props = {
  audience: ResourcePageAudience;
  title: string;
  /** Short sentence describing who sees this content (e.g. "all Circle Leaders"). */
  audienceLabel: string;
};

type Draft = {
  id: string | null; // null = new tip
  title: string;
  youtubeUrl: string;
  publishLocal: string; // datetime-local input value, browser-local time
  bodyHtml: string;
  sendToInbox: boolean;
};

function emptyDraft(): Draft {
  return {
    id: null,
    title: '',
    youtubeUrl: '',
    publishLocal: DateTime.local().plus({ days: 1 }).startOf('hour').toFormat("yyyy-LL-dd'T'HH:mm"),
    bodyHtml: '',
    sendToInbox: true,
  };
}

function draftFromTip(tip: TipWithStatus): Draft {
  return {
    id: tip.id,
    title: tip.title,
    youtubeUrl: tip.youtube_url,
    publishLocal: DateTime.fromISO(tip.publish_at).toLocal().toFormat("yyyy-LL-dd'T'HH:mm"),
    bodyHtml: tip.body_html,
    sendToInbox: tip.send_to_inbox,
  };
}

/**
 * Admin manager for weekly Pro Tips videos. Each tip is a YouTube link plus a
 * rich-text write-up with a publish date: it appears in the toolkit's
 * Resources → Pro Tips catalog when that date arrives, and (optionally) lands
 * in every leader's inbox at the same time via the scheduled Message Center
 * pipeline (see /api/admin/leader-pro-tips).
 */
export default function LeaderProTipsAdmin({ audience, title, audienceLabel }: Props) {
  const [token, setToken] = useState<string | null>(null);
  const [tips, setTips] = useState<TipWithStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<TipWithStatus | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setToken(data.session?.access_token || null));
  }, []);

  const loadTips = useCallback(
    async (tok: string, opts: { showSpinner?: boolean } = {}) => {
      if (opts.showSpinner) setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/admin/leader-pro-tips?audience=${audience}&t=${Date.now()}`, {
          headers: { Authorization: `Bearer ${tok}` },
          cache: 'no-store',
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed to load.');
        setTips(data.tips || []);
      } catch (e: any) {
        setError(e.message);
      } finally {
        if (opts.showSpinner) setLoading(false);
      }
    },
    [audience]
  );

  useEffect(() => {
    if (!token) return;
    loadTips(token, { showSpinner: true });
  }, [token, loadTips]);

  const uploadImage = useCallback(
    async (file: File): Promise<string> => {
      if (!token) throw new Error('Not signed in.');
      const form = new FormData();
      form.append('file', file);
      const res = await fetch('/api/admin/resource-images', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: form,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Image upload failed.');
      return data.url;
    },
    [token]
  );

  async function saveDraft() {
    if (!token || !draft) return;
    const publishDt = DateTime.fromISO(draft.publishLocal);
    if (!publishDt.isValid) {
      setError('Enter a valid publish date and time.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const payload = {
        id: draft.id || undefined,
        audience,
        title: draft.title,
        youtube_url: draft.youtubeUrl,
        body_html: draft.bodyHtml,
        publish_at: publishDt.toUTC().toISO(),
        send_to_inbox: draft.sendToInbox,
      };
      const res = await fetch('/api/admin/leader-pro-tips', {
        method: draft.id ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Save failed.');
      setDraft(null);
      await loadTips(token);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  }

  async function deleteTip() {
    if (!token || !deleteTarget) return;
    setDeleting(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/leader-pro-tips?id=${deleteTarget.id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Delete failed.');
      setDeleteTarget(null);
      if (draft?.id === deleteTarget.id) setDraft(null);
      await loadTips(token);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setDeleting(false);
    }
  }

  const editingTip = draft?.id ? tips.find((t) => t.id === draft.id) : null;
  const inboxAlreadySent = editingTip?.inbox_status === 'sent';
  const previewHtml = draft
    ? `<p>${draft.youtubeUrl}</p>${draft.bodyHtml || ''}`
    : '';

  return (
    <div className={`min-h-screen bg-[#0f1117] p-4 sm:p-6 lg:p-8 ${csOpenSans.variable}`}>
      <div className="max-w-4xl mx-auto">
        <div className="mb-6 flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-xl font-semibold text-white tracking-tight">{title}</h1>
            <p className="text-sm text-slate-400 mt-1 max-w-2xl">
              Short weekly videos for {audienceLabel}. Each tip shows up in the Pro Tips catalog
              on their Resources tab when its publish date arrives, and can also land in every
              leader’s inbox (with a push notification) at the same time.
            </p>
          </div>
          {!draft && (
            <button
              onClick={() => setDraft(emptyDraft())}
              className="bg-btn-primary text-white px-4 py-2 rounded-lg text-sm font-medium hover:opacity-90 transition-opacity"
            >
              New Pro Tip
            </button>
          )}
        </div>

        {error && (
          <div className="bg-red-500/10 border border-red-500/30 text-red-300 text-sm rounded-lg p-3 mb-4">
            {error}
          </div>
        )}

        {draft && (
          <div className="bg-zinc-800 border border-zinc-700 rounded-xl p-4 shadow-card-glass mb-6">
            <h2 className="text-sm font-semibold text-white mb-4">
              {draft.id ? 'Edit Pro Tip' : 'New Pro Tip'}
            </h2>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <label className="block text-xs font-semibold uppercase tracking-wide text-slate-400 mb-1.5">
                  Title
                </label>
                <input
                  value={draft.title}
                  onChange={(e) => setDraft((d) => d && { ...d, title: e.target.value })}
                  maxLength={120}
                  placeholder="e.g. Asking better questions"
                  className="w-full bg-zinc-900 border border-zinc-600 rounded-lg px-3 py-2 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-zinc-400"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wide text-slate-400 mb-1.5">
                  YouTube link
                </label>
                <input
                  value={draft.youtubeUrl}
                  onChange={(e) => setDraft((d) => d && { ...d, youtubeUrl: e.target.value })}
                  placeholder="https://youtu.be/…"
                  className="w-full bg-zinc-900 border border-zinc-600 rounded-lg px-3 py-2 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-zinc-400"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wide text-slate-400 mb-1.5">
                  Publish date &amp; time
                </label>
                <input
                  type="datetime-local"
                  value={draft.publishLocal}
                  onChange={(e) => setDraft((d) => d && { ...d, publishLocal: e.target.value })}
                  className="w-full bg-zinc-900 border border-zinc-600 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-zinc-400 [color-scheme:dark]"
                />
              </div>
              <div className="sm:col-span-2">
                <label className="block text-xs font-semibold uppercase tracking-wide text-slate-400 mb-1.5">
                  Write-up
                </label>
                <RichTextEditor
                  value={draft.bodyHtml}
                  onChange={(html) => setDraft((d) => d && { ...d, bodyHtml: html })}
                  placeholder="A short intro for the video…"
                  minHeight="160px"
                  allowButton
                  onUploadImage={uploadImage}
                  toolkitSurface
                />
              </div>
              <div className="sm:col-span-2">
                <label className="inline-flex items-center gap-2.5 text-sm text-slate-300">
                  <input
                    type="checkbox"
                    checked={draft.sendToInbox}
                    disabled={inboxAlreadySent}
                    onChange={(e) => setDraft((d) => d && { ...d, sendToInbox: e.target.checked })}
                    className="w-4 h-4 rounded border-zinc-600 bg-zinc-900 accent-[#34B233]"
                  />
                  Also send to the leader inbox on the publish date (includes a push notification)
                </label>
                {inboxAlreadySent && (
                  <p className="text-xs text-slate-500 mt-1.5 ml-6">
                    The inbox message already went out — edits here update the catalog only.
                  </p>
                )}
              </div>
            </div>

            {(draft.youtubeUrl.trim() || draft.bodyHtml.trim()) && (
              <ToolkitContentPreview variant="resources" bodyHtml={previewHtml} className="mt-5" />
            )}

            <div className="flex items-center gap-3 mt-5">
              <button
                onClick={saveDraft}
                disabled={saving || !draft.title.trim() || !draft.youtubeUrl.trim()}
                className="bg-btn-primary text-white px-4 py-2 rounded-lg text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
              >
                {saving ? 'Saving…' : draft.id ? 'Save changes' : 'Create Pro Tip'}
              </button>
              <button
                onClick={() => setDraft(null)}
                disabled={saving}
                className="text-slate-300 hover:text-white hover:bg-zinc-700 px-3 py-2 rounded-lg text-sm transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {loading ? (
          <div className="animate-pulse bg-zinc-700 rounded-xl h-40" />
        ) : tips.length === 0 && !draft ? (
          <div className="bg-zinc-800/60 border border-dashed border-zinc-700 rounded-xl p-10 text-center">
            <p className="text-slate-400 text-sm">
              No Pro Tips yet — create the first one and schedule it for this week.
            </p>
          </div>
        ) : (
          <ul className="space-y-2">
            {tips.map((tip) => {
              const publishDt = DateTime.fromISO(tip.publish_at);
              const published = publishDt <= DateTime.now();
              return (
                <li
                  key={tip.id}
                  className="bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 flex items-center gap-3 flex-wrap"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-white truncate">{tip.title}</p>
                    <p className="text-xs text-slate-500 mt-0.5">
                      {publishDt.toLocal().toFormat("LLL d, yyyy 'at' h:mm a")}
                    </p>
                  </div>
                  <span
                    className={
                      'text-[11px] font-semibold uppercase tracking-wide px-2 py-1 rounded-full ' +
                      (published
                        ? 'bg-emerald-500/15 text-emerald-300'
                        : 'bg-amber-500/15 text-amber-300')
                    }
                  >
                    {published ? 'Published' : 'Scheduled'}
                  </span>
                  {tip.inbox_message_id && (
                    <span className="text-[11px] font-semibold uppercase tracking-wide px-2 py-1 rounded-full bg-sky-500/15 text-sky-300">
                      {tip.inbox_status === 'scheduled' ? 'Inbox scheduled' : 'Inbox sent'}
                    </span>
                  )}
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => {
                        setDraft(draftFromTip(tip));
                        window.scrollTo({ top: 0, behavior: 'smooth' });
                      }}
                      className="text-slate-300 hover:text-white hover:bg-zinc-700 px-2.5 py-1.5 rounded-lg text-xs transition-colors"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => setDeleteTarget(tip)}
                      className="text-red-300 hover:text-red-200 hover:bg-red-500/10 px-2.5 py-1.5 rounded-lg text-xs transition-colors"
                    >
                      Delete
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {deleteTarget && (
        <div
          className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="delete-tip-title"
        >
          <div className="bg-zinc-800 border border-zinc-700 rounded-xl shadow-2xl max-w-md w-full p-6">
            <h2 id="delete-tip-title" className="text-base font-semibold text-white">
              Delete “{deleteTarget.title}”?
            </h2>
            <p className="text-sm text-slate-300 mt-2">
              This removes the tip from the Pro Tips catalog
              {deleteTarget.inbox_status === 'scheduled'
                ? ' and cancels its scheduled inbox message'
                : ''}
              . Inbox messages that already went out stay in leaders’ inboxes. This can’t be
              undone.
            </p>
            <div className="flex items-center justify-end gap-2 mt-5">
              <button
                onClick={() => setDeleteTarget(null)}
                disabled={deleting}
                className="text-slate-300 hover:text-white hover:bg-zinc-700 px-3 py-2 rounded-lg text-sm transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={deleteTip}
                disabled={deleting}
                className="bg-red-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-red-500 transition-colors disabled:opacity-50"
              >
                {deleting ? 'Deleting…' : 'Delete Pro Tip'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
