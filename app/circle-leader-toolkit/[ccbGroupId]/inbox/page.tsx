'use client';

import { useEffect, useState } from 'react';
import { renderMessageHtml } from '../../../../lib/renderMessageHtml';
import { useMarkCircleAppEntered } from '../../../../lib/circle-leader-toolkit/appEntered';

type InboxMessage = {
  recipient_id: string;
  message_id: string;
  title: string;
  body_html: string;
  category?: string;
  version: number;
  created_at: string;
  updated_at: string;
  read_at: string | null;
  read_version: number;
  unread: boolean;
};

type InboxFolder = 'unread' | 'read';

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

export default function CircleSummaryInboxPage() {
  useMarkCircleAppEntered();
  const [messages, setMessages] = useState<InboxMessage[]>([]);
  const [folder, setFolder] = useState<InboxFolder>('unread');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [markingId, setMarkingId] = useState<string | null>(null);

  async function loadInbox() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/circle-leader-toolkit/inbox/', { cache: 'no-store' });
      if (!res.ok) throw new Error('Could not load messages.');
      const data = await res.json();
      setMessages(data.messages || []);
    } catch (error: unknown) {
      setError(getErrorMessage(error, 'Could not load messages.'));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadInbox();
  }, []);

  async function markRead(message: InboxMessage) {
    setMarkingId(message.recipient_id);
    setError(null);
    try {
      const res = await fetch('/api/circle-leader-toolkit/inbox/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ recipient_id: message.recipient_id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not mark message read.');
      setMessages((current) =>
        current.map((item) =>
          item.recipient_id === message.recipient_id
            ? {
                ...item,
                unread: false,
                read_at: data.recipient?.read_at || new Date().toISOString(),
                read_version: data.recipient?.read_version || item.version,
              }
            : item
        )
      );
      window.dispatchEvent(new CustomEvent('circle-summary-inbox-updated'));
      window.dispatchEvent(new CustomEvent('circle-summary-alerts-updated'));
      setFolder('read');
    } catch (error: unknown) {
      setError(getErrorMessage(error, 'Could not mark message read.'));
    } finally {
      setMarkingId(null);
    }
  }

  const unreadMessages = messages.filter((m) => m.unread);
  const readMessages = messages.filter((m) => !m.unread);
  const visibleMessages = folder === 'unread' ? unreadMessages : readMessages;

  return (
    <main className="max-w-2xl mx-auto px-4 py-6">
      <section className="cs-card p-4 sm:p-5">
        <div className="mb-4">
          <h2 className="text-lg font-bold text-neutral-900 tracking-tight">Inbox</h2>
          <p className="text-xs text-neutral-500 mt-0.5">Updates from your Circle team</p>
        </div>

        <div className="grid grid-cols-2 gap-1 bg-neutral-100 border border-neutral-200 rounded-full p-1 mb-4">
          <button
            type="button"
            aria-pressed={folder === 'unread'}
            onClick={() => setFolder('unread')}
            className={
              'cs-inbox-folder-tab rounded-full py-2 text-sm font-semibold transition-all ' +
              (folder === 'unread'
                ? 'cs-inbox-folder-tab-active shadow-sm'
                : 'cs-inbox-folder-tab-inactive')
            }
          >
            Unread ({unreadMessages.length})
          </button>
          <button
            type="button"
            aria-pressed={folder === 'read'}
            onClick={() => setFolder('read')}
            className={
              'cs-inbox-folder-tab rounded-full py-2 text-sm font-semibold transition-all ' +
              (folder === 'read'
                ? 'cs-inbox-folder-tab-active shadow-sm'
                : 'cs-inbox-folder-tab-inactive')
            }
          >
            Read ({readMessages.length})
          </button>
        </div>

        {loading && (
          <div className="space-y-2">
            <div className="cs-skeleton h-20 w-full rounded-xl" />
            <div className="cs-skeleton h-20 w-full rounded-xl" />
          </div>
        )}

        {!loading && error && (
          <div className="cs-alert cs-alert-warning">{error}</div>
        )}

        {!loading && !error && visibleMessages.length === 0 && (
          <div className="text-center py-12 border border-dashed border-neutral-200 rounded-xl bg-neutral-50">
            <p className="text-neutral-500 text-sm font-medium">
              {folder === 'unread' ? 'No unread messages' : 'No read messages yet'}
            </p>
          </div>
        )}

        {!loading && !error && visibleMessages.length > 0 && (
          <div className="space-y-5">
            {visibleMessages.map((message) => (
              <article
                key={message.recipient_id}
                className={
                  'overflow-hidden rounded-2xl border bg-white shadow-sm ring-1 ' +
                  (message.unread
                    ? 'border-[#34B233]/60 ring-[#34B233]/20'
                    : 'border-neutral-200 ring-neutral-100')
                }
              >
                <div
                  className={
                    'flex items-start justify-between gap-3 border-b px-4 py-3 ' +
                    (message.unread
                      ? 'border-[#34B233]/20 bg-[#34B233]/5'
                      : 'border-neutral-100 bg-neutral-50')
                  }
                >
                  <div className="min-w-0 space-y-1">
                    <div className="flex items-center gap-2">
                      {message.unread && (
                        <span className="shrink-0 w-2.5 h-2.5 rounded-full bg-[#34B233]" />
                      )}
                      <h3 className="text-sm font-extrabold text-neutral-950">{message.title}</h3>
                      {message.category === 'coaching' && (
                        <span className="shrink-0 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-emerald-700">
                          Coaching
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-neutral-500">
                      {message.unread ? 'Unread' : 'Read'}
                      {' · '}
                      {message.unread && message.version > 1 ? 'Updated ' : ''}
                      {new Date(message.updated_at).toLocaleString()}
                    </p>
                  </div>
                  {message.version > 1 && (
                    <span className="shrink-0 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-bold text-amber-800">
                      Updated
                    </span>
                  )}
                </div>
                <div className="p-4">
                  {message.body_html && (
                    <div
                      className="cs-resources text-sm"
                      dangerouslySetInnerHTML={{ __html: renderMessageHtml(message.body_html) }}
                    />
                  )}
                  {message.unread ? (
                    <button
                      type="button"
                      onClick={() => markRead(message)}
                      disabled={markingId === message.recipient_id}
                      className="cs-inbox-mark-read-btn mt-4 w-full bg-[#34B233] text-white rounded-xl py-2.5 text-sm font-bold shadow-sm disabled:opacity-60"
                    >
                      {markingId === message.recipient_id ? 'Marking as read...' : 'Mark as Read'}
                    </button>
                  ) : message.read_at ? (
                    <p className="border-t border-neutral-100 pt-3 text-[11px] font-medium text-neutral-400 mt-4">
                      Read {new Date(message.read_at).toLocaleString()}
                    </p>
                  ) : null}
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
