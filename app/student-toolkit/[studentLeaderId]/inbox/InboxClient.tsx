'use client';

import { useEffect, useMemo, useState } from 'react';
import Fuse from 'fuse.js';
import { renderMessageHtml } from '../../../../lib/renderMessageHtml';

type InboxMessage = {
  recipient_id: string;
  message_id: string;
  title: string;
  body_html: string;
  version: number;
  created_at: string;
  updated_at: string;
  read_at: string | null;
  read_version: number | null;
  unread: boolean;
};

type InboxFolder = 'all' | 'unread' | 'read';

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

/** Strip markup so search matches what a leader actually reads. */
function bodyHtmlToSearchText(html: string) {
  if (!html) return '';
  if (typeof window !== 'undefined' && typeof DOMParser !== 'undefined') {
    return new DOMParser().parseFromString(html, 'text/html').body.textContent || '';
  }
  return html
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

export default function InboxClient() {
  const [messages, setMessages] = useState<InboxMessage[]>([]);
  const [folder, setFolder] = useState<InboxFolder>('unread');
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [markingId, setMarkingId] = useState<string | null>(null);

  async function loadInbox() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/student-toolkit/inbox/', { cache: 'no-store' });
      if (!res.ok) throw new Error('Could not load messages.');
      const data = await res.json();
      setMessages(Array.isArray(data.messages) ? data.messages : []);
    } catch (err: unknown) {
      setError(getErrorMessage(err, 'Could not load messages.'));
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
      const res = await fetch('/api/student-toolkit/inbox/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ recipient_id: message.recipient_id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not mark this message read.');
      setMessages((current) =>
        current.map((item) =>
          item.recipient_id === message.recipient_id
            ? {
                ...item,
                unread: false,
                read_at: data.recipient?.read_at || new Date().toISOString(),
                read_version: data.recipient?.read_version ?? item.version,
              }
            : item
        )
      );
      // The tab dot and app badge are owned by the chrome — tell it to recount.
      window.dispatchEvent(new CustomEvent('student-toolkit-inbox-updated'));
      window.dispatchEvent(new CustomEvent('student-toolkit-alerts-updated'));
      setFolder('read');
    } catch (err: unknown) {
      setError(getErrorMessage(err, 'Could not mark this message read.'));
    } finally {
      setMarkingId(null);
    }
  }

  function handleSearchQueryChange(value: string) {
    setSearchQuery(value);
    // A search that only looked inside the current folder would silently hide
    // matches, so searching widens the view to everything.
    if (value.trim()) setFolder('all');
  }

  const indexedMessages = useMemo(
    () =>
      messages.map((message) => ({
        ...message,
        body_text: bodyHtmlToSearchText(message.body_html),
      })),
    [messages]
  );

  const searchedMessages = useMemo(() => {
    const query = searchQuery.trim();
    if (!query) return indexedMessages;
    const fuse = new Fuse(indexedMessages, {
      keys: [
        { name: 'title', weight: 3 },
        { name: 'body_text', weight: 2 },
      ],
      threshold: 0.35,
      ignoreLocation: true,
      minMatchCharLength: 2,
    });
    return fuse.search(query).map((result) => result.item);
  }, [indexedMessages, searchQuery]);

  const unreadMessages = searchedMessages.filter((message) => message.unread);
  const readMessages = searchedMessages.filter((message) => !message.unread);
  const visibleMessages =
    folder === 'all' ? searchedMessages : folder === 'unread' ? unreadMessages : readMessages;
  const totalUnreadCount = messages.filter((message) => message.unread).length;
  const totalReadCount = messages.length - totalUnreadCount;
  const hasSearchQuery = searchQuery.trim().length > 0;

  const folderTabs: Array<{ key: InboxFolder; label: string; count: number }> = [
    { key: 'all', label: 'All', count: hasSearchQuery ? searchedMessages.length : messages.length },
    {
      key: 'unread',
      label: 'Unread',
      count: hasSearchQuery ? unreadMessages.length : totalUnreadCount,
    },
    { key: 'read', label: 'Read', count: hasSearchQuery ? readMessages.length : totalReadCount },
  ];

  return (
    <main className="max-w-2xl mx-auto px-4 py-6">
      <section className="cs-card p-4 sm:p-5">
        <div className="mb-4">
          <h1 className="text-lg font-bold text-neutral-900 tracking-tight">Inbox</h1>
          <p className="text-xs text-neutral-500 mt-0.5">Messages from your staff team</p>
        </div>

        <div className="cs-search-field mb-4">
          <label className="cs-search-field-label" htmlFor="student-inbox-search">
            Search messages
          </label>
          <div className="relative">
            <input
              id="student-inbox-search"
              type="search"
              className="cs-input"
              style={{ paddingRight: '2.5rem' }}
              placeholder="Search title or message..."
              value={searchQuery}
              onChange={(e) => handleSearchQueryChange(e.target.value)}
            />
            {hasSearchQuery && (
              <button
                type="button"
                aria-label="Clear search"
                onClick={() => setSearchQuery('')}
                className="absolute right-2 top-1/2 grid h-8 w-8 -translate-y-1/2 place-items-center rounded-full text-neutral-500 transition-colors hover:bg-neutral-100 hover:text-neutral-900"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" className="h-4 w-4" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                </svg>
              </button>
            )}
          </div>
        </div>

        <div className="grid grid-cols-3 gap-1 bg-neutral-100 border border-neutral-200 rounded-full p-1 mb-4">
          {folderTabs.map((tab) => (
            <button
              key={tab.key}
              type="button"
              aria-pressed={folder === tab.key}
              onClick={() => setFolder(tab.key)}
              className={
                'cs-inbox-folder-tab rounded-full py-2 text-sm font-semibold transition-all ' +
                (folder === tab.key
                  ? 'cs-inbox-folder-tab-active shadow-sm'
                  : 'cs-inbox-folder-tab-inactive')
              }
            >
              {tab.label} ({tab.count})
            </button>
          ))}
        </div>

        {loading && (
          <div className="space-y-2">
            <div className="cs-skeleton h-20 w-full rounded-xl" />
            <div className="cs-skeleton h-20 w-full rounded-xl" />
          </div>
        )}

        {!loading && error && <div className="cs-alert cs-alert-warning">{error}</div>}

        {!loading && !error && visibleMessages.length === 0 && (
          <div className="text-center py-12 border border-dashed border-neutral-200 rounded-xl bg-neutral-50">
            <p className="text-neutral-500 text-sm font-medium">
              {hasSearchQuery
                ? 'No messages match this search'
                : folder === 'unread'
                  ? 'You are all caught up'
                  : folder === 'read'
                    ? 'Nothing read yet'
                    : 'No messages yet'}
            </p>
            {hasSearchQuery ? (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="mt-3 rounded-full border border-neutral-200 bg-white px-3 py-1.5 text-xs font-bold text-neutral-700 shadow-sm transition-colors hover:bg-neutral-100"
              >
                Clear search
              </button>
            ) : (
              <p className="text-neutral-400 text-xs mt-1">
                {folder === 'all'
                  ? 'Messages from your staff team land here.'
                  : 'Turn on notifications in Settings so you never miss one.'}
              </p>
            )}
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
                      <h2 className="text-sm font-extrabold text-neutral-950">{message.title}</h2>
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
                      {markingId === message.recipient_id ? 'Marking as read...' : 'Mark as read'}
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
