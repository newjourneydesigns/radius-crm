'use client';

import { useCallback, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Settings, CheckCheck, Inbox as InboxIcon, ChevronLeft, SlidersHorizontal } from 'lucide-react';
import ProtectedRoute from '../../components/ProtectedRoute';
import { useNotifications, type InboxView } from '../../hooks/useNotifications';
import NotificationRow from '../../components/inbox/NotificationRow';
import NotificationPreferencesModal from '../../components/inbox/NotificationPreferencesModal';
import InboxFilterDrawer from '../../components/inbox/InboxFilterDrawer';

const VIEW_TABS: { key: InboxView; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'unread', label: 'Unread' },
  { key: 'archived', label: 'Archived' },
];

function InboxContent() {
  const {
    items,
    loading,
    view,
    setView,
    typeFilters,
    toggleType,
    clearTypes,
    unreadCount,
    markRead,
    markUnread,
    markAllRead,
    archive,
    restore,
    remove,
  } = useNotifications();

  const router = useRouter();
  const [prefsOpen, setPrefsOpen] = useState(false);
  const [filterOpen, setFilterOpen] = useState(false);
  const filterCount = typeFilters.size;

  // Immersive route — provide our own way back into the app.
  const exit = useCallback(() => {
    if (typeof window !== 'undefined' && window.history.length > 1) router.back();
    else router.push('/dashboard');
  }, [router]);

  return (
    <div className="flex h-[100dvh] flex-col bg-[#0f1117]">
      {/* Header */}
      <header
        className="shrink-0 px-4 pb-3"
        style={{ paddingTop: 'max(1.25rem, calc(env(safe-area-inset-top) + 0.5rem))' }}
      >
        <div className="mx-auto flex max-w-2xl items-center justify-between">
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={exit}
              className="-ml-1.5 grid h-8 w-8 place-items-center rounded-full text-slate-300 transition-colors hover:bg-white/[0.06] hover:text-white"
              aria-label="Back"
              title="Back"
            >
              <ChevronLeft className="h-5 w-5" strokeWidth={2.2} />
            </button>
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
              <CheckCheck className="h-4 w-4" /> <span className="hidden sm:inline">Mark all read</span>
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

        {/* View tabs + filter */}
        <div className="mx-auto mt-3 flex max-w-2xl items-center gap-2">
          <div className="flex flex-1 gap-1 rounded-xl bg-white/[0.04] p-1">
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
          <button
            type="button"
            onClick={() => setFilterOpen(true)}
            className={`relative flex shrink-0 items-center gap-1.5 rounded-xl px-3 py-2 text-[13px] font-medium ring-1 transition-colors ${
              filterCount > 0
                ? 'bg-vc-500/15 text-vc-200 ring-vc-400/30'
                : 'bg-white/[0.04] text-slate-300 ring-white/[0.06] hover:text-white'
            }`}
            aria-label="Filter by type"
          >
            <SlidersHorizontal className="h-4 w-4" />
            <span className="hidden sm:inline">Filter</span>
            {filterCount > 0 && (
              <span className="grid h-5 min-w-5 place-items-center rounded-full bg-vc-500 px-1.5 text-[11px] font-semibold text-white">
                {filterCount}
              </span>
            )}
          </button>
        </div>
      </header>

      {/* List */}
      <div className="flex-1 overflow-y-auto px-4 pb-6">
        <div className="mx-auto max-w-2xl">
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
                  {view === 'unread'
                    ? 'You’re all caught up'
                    : view === 'archived'
                      ? 'Nothing archived'
                      : filterCount > 0
                        ? 'Nothing matches this filter'
                        : 'No notifications yet'}
                </p>
                <p className="mt-1 text-[13px] text-slate-500">
                  {view === 'archived'
                    ? 'Archived notifications will show up here.'
                    : filterCount > 0
                      ? 'Try clearing or changing the type filter.'
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
        </div>
      </div>

      <NotificationPreferencesModal isOpen={prefsOpen} onClose={() => setPrefsOpen(false)} />
      <InboxFilterDrawer
        isOpen={filterOpen}
        onClose={() => setFilterOpen(false)}
        selected={typeFilters}
        onToggle={toggleType}
        onClear={clearTypes}
      />
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
