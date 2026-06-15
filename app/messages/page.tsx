'use client';

import { useCallback, useState } from 'react';
import { MessageSquare } from 'lucide-react';
import ProtectedRoute from '../../components/ProtectedRoute';
import { useAuth } from '../../contexts/AuthContext';
import { usePushReminders } from '../../hooks/usePushReminders';
import { useAcpdMessaging } from '../../hooks/useAcpdMessaging';
import ConversationList from '../../components/messages/ConversationList';
import MessageThread from '../../components/messages/MessageThread';
import NewMessageModal from '../../components/messages/NewMessageModal';

function MessagesContent() {
  const { isAdmin } = useAuth();
  const admin = isAdmin();

  const {
    me,
    conversations,
    directory,
    selectedId,
    selectedConversation,
    messages,
    loadingOverview,
    loadingThread,
    sending,
    error,
    selectConversation,
    sendMessage,
    startDm,
    clearSelection,
  } = useAcpdMessaging(admin);

  const { isSupported, isSubscribed, enable } = usePushReminders();
  const [newOpen, setNewOpen] = useState(false);
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
    <div className="flex h-[calc(100dvh-5.5rem)] overflow-hidden bg-[#0f1117] md:h-[calc(100dvh-3.5rem)]">
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
            onSend={sendMessage}
            onBack={clearSelection}
          />
        ) : (
          <div className="hidden flex-1 flex-col items-center justify-center gap-3 bg-[#0f1117] text-center md:flex">
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
        onStartDm={startDm}
      />
    </div>
  );
}

export default function MessagesPage() {
  return (
    <ProtectedRoute>
      <MessagesContent />
    </ProtectedRoute>
  );
}
