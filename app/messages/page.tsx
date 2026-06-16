'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { MessageSquare } from 'lucide-react';
import ProtectedRoute from '../../components/ProtectedRoute';
import { useAuth } from '../../contexts/AuthContext';
import { usePushReminders } from '../../hooks/usePushReminders';
import { useAcpdMessaging } from '../../hooks/useAcpdMessaging';
import ConversationList from '../../components/messages/ConversationList';
import MessageThread from '../../components/messages/MessageThread';
import NewMessageModal from '../../components/messages/NewMessageModal';
import ForwardMessageModal from '../../components/messages/ForwardMessageModal';
import type { AcpdMessage } from '../../lib/acpdMessagingClient';
import { MESSAGES_ENABLED } from '../../lib/features';

function MessagesContent() {
  const { isAdmin } = useAuth();
  const admin = isAdmin();
  const router = useRouter();

  // Immersive route — provide our own way back into the app.
  const exit = useCallback(() => {
    if (typeof window !== 'undefined' && window.history.length > 1) router.back();
    else router.push('/dashboard');
  }, [router]);

  const {
    me,
    conversations,
    directory,
    selectedId,
    selectedConversation,
    messages,
    members,
    muted,
    loadingOverview,
    loadingThread,
    sending,
    error,
    selectConversation,
    sendMessage,
    startGroup,
    forwardMessage,
    toggleLike,
    deleteMessage,
    deleteConversation,
    editMessage,
    togglePin,
    toggleMute,
    renameConversation,
    searchMessages,
    clearSelection,
    clearError,
  } = useAcpdMessaging(admin);

  const { isSupported, isSubscribed, enable } = usePushReminders();
  const [newOpen, setNewOpen] = useState(false);
  const [forwarding, setForwarding] = useState<AcpdMessage | null>(null);
  const [notifDismissed, setNotifDismissed] = useState(false);

  const showNotifPrompt =
    admin &&
    isSupported &&
    !isSubscribed &&
    !notifDismissed &&
    typeof Notification !== 'undefined' &&
    Notification.permission !== 'denied';

  const handleEnableNotifications = useCallback(async () => {
    try {
      const permission =
        Notification.permission === 'granted' ? 'granted' : await Notification.requestPermission();
      if (permission === 'granted') await enable();
    } finally {
      setNotifDismissed(true);
    }
  }, [enable]);

  if (!admin) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center px-4">
        <p className="text-sm text-slate-400">Team messaging is available to ACPD directors only.</p>
      </div>
    );
  }

  return (
    <div className="relative flex h-[100dvh] overflow-hidden bg-[#0f1117]">
      {error && (
        <div
          className="absolute inset-x-0 top-0 z-[10020] flex justify-center px-3"
          style={{ paddingTop: 'max(0.5rem, calc(env(safe-area-inset-top) + 0.25rem))' }}
        >
          <button
            type="button"
            onClick={clearError}
            className="mt-1 flex max-w-md items-center gap-2 rounded-xl bg-red-500/95 px-3.5 py-2 text-left text-[12.5px] text-white shadow-lg shadow-black/40"
          >
            <span className="flex-1">{error}</span>
            <span className="shrink-0 text-white/70">Dismiss</span>
          </button>
        </div>
      )}
      {/* Sidebar */}
      <aside
        className={`w-full border-white/[0.06] md:flex md:w-[340px] md:border-r ${
          selectedId ? 'hidden' : 'flex'
        }`}
      >
        <ConversationList
          conversations={conversations}
          selectedId={selectedId}
          meId={me?.id ?? null}
          loading={loadingOverview}
          onSelect={selectConversation}
          onNewMessage={() => setNewOpen(true)}
          onExit={exit}
          onSearchMessages={searchMessages}
          showNotifPrompt={showNotifPrompt}
          onEnableNotifications={handleEnableNotifications}
        />
      </aside>

      {/* Thread */}
      <section className={`flex-1 ${selectedId ? 'flex' : 'hidden md:flex'}`}>
        {selectedConversation ? (
          <MessageThread
            conversation={selectedConversation}
            messages={messages}
            meId={me?.id ?? null}
            loading={loadingThread}
            sending={sending}
            error={error}
            members={members}
            muted={muted}
            meName={me?.name ?? ''}
            onSend={sendMessage}
            onBack={clearSelection}
            onForward={setForwarding}
            onToggleLike={toggleLike}
            onDeleteMessage={deleteMessage}
            onDeleteConversation={deleteConversation}
            onEditMessage={editMessage}
            onTogglePin={togglePin}
            onToggleMute={toggleMute}
            onRename={renameConversation}
          />
        ) : selectedId ? (
          // Selected but not resolved yet (e.g. a DM you just started) — show a
          // visible loading/error state instead of a blank screen on mobile.
          <div className="flex w-full flex-1 flex-col items-center justify-center gap-4 bg-[#0f1117] px-6 text-center">
            {error ? (
              <>
                <p className="text-sm text-red-400">{error}</p>
                <button
                  type="button"
                  onClick={clearSelection}
                  className="rounded-lg bg-white/[0.06] px-4 py-2 text-[13px] font-medium text-slate-200 hover:bg-white/[0.1]"
                >
                  Back to conversations
                </button>
              </>
            ) : (
              <div className="h-7 w-7 animate-spin rounded-full border-2 border-white/15 border-t-vc-500" />
            )}
          </div>
        ) : (
          <div className="hidden w-full flex-1 flex-col items-center justify-center gap-3 bg-[#0f1117] text-center md:flex">
            <div className="grid h-14 w-14 place-items-center rounded-2xl bg-white/[0.05]">
              <MessageSquare className="h-6 w-6 text-slate-500" strokeWidth={1.6} />
            </div>
            <div>
              <p className="text-[15px] font-semibold text-slate-200">Your team conversations</p>
              <p className="mt-1 max-w-xs text-[13px] text-slate-500">
                Pick a conversation, or start a new one to message another director directly.
              </p>
            </div>
          </div>
        )}
      </section>

      <NewMessageModal
        isOpen={newOpen}
        onClose={() => setNewOpen(false)}
        directory={directory}
        onStart={startGroup}
      />

      <ForwardMessageModal
        isOpen={forwarding !== null}
        onClose={() => setForwarding(null)}
        message={forwarding}
        sourceLabel={selectedConversation?.title ?? ''}
        conversations={conversations}
        directory={directory}
        onForward={(target) => forwardMessage(forwarding!, selectedConversation?.title ?? '', target)}
      />
    </div>
  );
}

export default function MessagesPage() {
  const router = useRouter();

  // Messaging is hidden for now (MESSAGES_ENABLED). The page + components stay
  // in the codebase, but visiting the route sends users to the Inbox instead.
  useEffect(() => {
    if (!MESSAGES_ENABLED) router.replace('/inbox');
  }, [router]);

  if (!MESSAGES_ENABLED) return null;

  return (
    <ProtectedRoute>
      <MessagesContent />
    </ProtectedRoute>
  );
}
