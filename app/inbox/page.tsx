'use client';

import { useState } from 'react';
import { Settings, CheckCheck, Inbox as InboxIcon } from 'lucide-react';
import ProtectedRoute from '../../components/ProtectedRoute';
import { useNotifications, type InboxView } from '../../hooks/useNotifications';
import { NOTIFICATION_TYPE_META, type NotificationType } from '../../lib/notificationsClient';
import NotificationRow from '../../components/inbox/NotificationRow';
import NotificationPreferencesModal from '../../components/inbox/NotificationPreferencesModal';

const VIEW_TABS: { key: InboxView; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'unread', label: 'Unread' },
  { key: 'archived', label: 'Archived' },
];

const TYPE_OPTIONS: (NotificationType | 'all')[] = [
  'all',
  'message',
  'card_assignment',
  'card_comment',
  'board_share',
  'notebook_share',
  'birthday',
  'follow_up',
];

function InboxContent() {
  const {
    items,
    loading,
    view,
    setView,
    typeFilter,
    setTypeFilter,
    unreadCount,
    markRead,
    markUnread,
    markAllRead,
    archive,
    restore,
    remove,
  } = useNotifications();

  const [prefsOpen, setPrefsOpen] = useState(false);

  return (
    <div className="mx-auto min-h-[60vh] max-w-2xl px-4 py-6 md:py-8">
      {/* Header */}
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <h1 className="text-xl font-semibold text-white">Inbox</h1>
          {unreadCount > 0 && (
            <span className="grid h-5 min-w-5 place-items-center rounded-full bg-vc-500 px-1.5 text-[11px] font-semibold text-white">
              {unreadCount}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={markAllRead}
            disabled={unreadCount === 0}
            className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[12.5px] font-medium text-slate-300 transition-colors hover:bg-white/[0.06] hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
          >
            <CheckCheck className="h-4 w-4" /> Mark all read
          </button>
          <button
            type="button"
            onClick={() => setPrefsOpen(true)}
            aria-label="Notification settings"
            className="grid h-9 w-9 place-items-center rounded-lg text-slate-300 transition-colors hover:bg-white/[0.06] hover:text-white"
          >
            <Settings className="h-[18px] w-[18px]" />
          </button>
        </div>
      </div>

      {/* View tabs */}
      <div className="mb-3 flex gap-1 rounded-xl bg-white/[0.04] p-1">
        {VIEW_TABS.map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => setView(tab.key)}
            className={`flex-1 rounded-lg px-3 py-1.5 text-[13px] font-medium transition-colors ${
              view === tab.key ? 'bg-white/[0.10] text-white' : 'text-slate-400 hover:text-white'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Type filter chips */}
      <div className="mb-4 flex flex-wrap gap-1.5">
        {TYPE_OPTIONS.map((t) => {
          const active = typeFilter === t;
          const label = t === 'all' ? 'All types' : NOTIFICATION_TYPE_META[t].label;
          return (
            <button
              key={t}
              type="button"
              onClick={() => setTypeFilter(t)}
              className={`rounded-full px-3 py-1 text-[12px] font-medium transition-colors ${
                active
                  ? 'bg-vc-500/15 text-vc-200 ring-1 ring-vc-400/30'
                  : 'bg-white/[0.04] text-slate-400 ring-1 ring-white/[0.06] hover:text-white'
              }`}
            >
              {label}
            </button>
          );
        })}
      </div>

      {/* List */}
      {loading ? (
        <div className="space-y-2 pt-2">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="flex animate-pulse items-center gap-3 rounded-xl px-3 py-3">
              <div className="h-9 w-9 rounded-xl bg-white/[0.06]" />
              <div className="flex-1 space-y-2">
                <div className="h-3 w-1/2 rounded bg-white/[0.06]" />
                <div className="h-2.5 w-3/4 rounded bg-white/[0.04]" />
              </div>
            </div>
          ))}
        </div>
      ) : items.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 py-20 text-center">
          <div className="grid h-14 w-14 place-items-center rounded-2xl bg-white/[0.05]">
            <InboxIcon className="h-6 w-6 text-slate-500" strokeWidth={1.6} />
          </div>
          <div>
            <p className="text-[15px] font-semibold text-slate-200">
              {view === 'unread' ? 'You’re all caught up' : view === 'archived' ? 'Nothing archived' : 'No notifications yet'}
            </p>
            <p className="mt-1 text-[13px] text-slate-500">
              {view === 'archived'
                ? 'Archived notifications will show up here.'
                : 'Assignments, comments, shares, messages and alerts will land here.'}
            </p>
          </div>
        </div>
      ) : (
        <div className="space-y-0.5">
          {items.map((item) => (
            <NotificationRow
              key={item.id}
              item={item}
              isArchivedView={view === 'archived'}
              onMarkRead={markRead}
              onMarkUnread={markUnread}
              onArchive={archive}
              onRestore={restore}
              onDelete={remove}
            />
          ))}
        </div>
      )}

      <NotificationPreferencesModal isOpen={prefsOpen} onClose={() => setPrefsOpen(false)} />
    </div>
  );
}

export default function InboxPage() {
  return (
    <ProtectedRoute>
      <InboxContent />
    </ProtectedRoute>
  );
}
