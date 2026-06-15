'use client';

import { useEffect, useState } from 'react';
import Modal from '../ui/Modal';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import {
  PREFERENCE_ROWS,
  type NotificationPreferences,
} from '../../lib/notificationsClient';

type PrefKey = keyof Omit<NotificationPreferences, 'user_id'>;

const DEFAULTS: Record<PrefKey, boolean> = {
  notify_messages: true,
  notify_card_assignments: true,
  notify_card_comments: true,
  notify_board_shares: true,
  notify_notebook_shares: true,
  notify_birthdays: true,
  notify_follow_ups: true,
};

export default function NotificationPreferencesModal({
  isOpen,
  onClose,
}: {
  isOpen: boolean;
  onClose: () => void;
}) {
  const { user } = useAuth();
  const [prefs, setPrefs] = useState<Record<PrefKey, boolean>>(DEFAULTS);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isOpen || !user?.id) return;
    let cancelled = false;
    setLoading(true);
    (async () => {
      const { data } = await supabase
        .from('notification_preferences')
        .select('*')
        .eq('user_id', user.id)
        .maybeSingle();
      if (cancelled) return;
      if (data) {
        setPrefs({
          notify_messages: data.notify_messages,
          notify_card_assignments: data.notify_card_assignments,
          notify_card_comments: data.notify_card_comments,
          notify_board_shares: data.notify_board_shares,
          notify_notebook_shares: data.notify_notebook_shares,
          notify_birthdays: data.notify_birthdays,
          notify_follow_ups: data.notify_follow_ups,
        });
      } else {
        setPrefs(DEFAULTS);
      }
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [isOpen, user?.id]);

  const toggle = async (key: PrefKey) => {
    if (!user?.id) return;
    const next = { ...prefs, [key]: !prefs[key] };
    setPrefs(next); // optimistic
    await supabase
      .from('notification_preferences')
      .upsert(
        { user_id: user.id, ...next, updated_at: new Date().toISOString() },
        { onConflict: 'user_id' }
      );
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Notification settings" size="md">
      <p className="mb-4 text-[13px] text-slate-400">Choose which activity shows up in your inbox.</p>
      <div className="space-y-2">
        {PREFERENCE_ROWS.map(({ prefKey, label, description }) => {
          const on = prefs[prefKey];
          return (
            <div
              key={prefKey}
              className="flex items-center justify-between gap-4 rounded-xl border border-white/[0.06] bg-white/[0.03] px-4 py-3"
            >
              <div className="min-w-0">
                <p className="text-[13.5px] font-medium text-slate-200">{label}</p>
                <p className="mt-0.5 text-[12px] text-slate-500">{description}</p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={on}
                aria-label={label}
                disabled={loading}
                onClick={() => toggle(prefKey)}
                className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-vc-500 focus:ring-offset-2 focus:ring-offset-[#15171d] disabled:opacity-50 ${
                  on ? 'bg-vc-600' : 'bg-gray-600'
                }`}
              >
                <span
                  className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow transition duration-200 ${
                    on ? 'translate-x-5' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>
          );
        })}
      </div>
    </Modal>
  );
}
