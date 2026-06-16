'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
};

type NotificationSettings = {
  publicKey: string | null;
  pushSupported: boolean;
  preferences?: {
    inbox_push_enabled: boolean;
    summary_reminder_push_enabled: boolean;
    badge_count_enabled: boolean;
    push_nudge_requested_at?: string | null;
  };
  subscriptions?: Array<{ id: string; enabled: boolean; endpoint: string }>;
};

declare global {
  interface Window {
    installPWA?: () => void;
    deferredPrompt?: BeforeInstallPromptEvent | null;
    __radiusPwaInstallAvailable?: boolean;
  }
}

const INSTALL_DISMISS_KEY = 'circle-summary:onboarding:install-dismissed-at';
const NOTIFICATION_DISMISS_KEY = 'circle-summary:onboarding:notifications-dismissed-at';
const DISMISS_DAYS = 14;

function dismissedAtMs(key: string): number | null {
  try {
    const value = window.localStorage.getItem(key);
    if (!value) return null;
    const dismissedAt = Number(value);
    return Number.isFinite(dismissedAt) ? dismissedAt : null;
  } catch {
    return null;
  }
}

function recentlyDismissed(key: string) {
  const dismissedAt = dismissedAtMs(key);
  if (dismissedAt === null) return false;
  return Date.now() - dismissedAt < DISMISS_DAYS * 24 * 60 * 60 * 1000;
}

function markDismissed(key: string) {
  try {
    window.localStorage.setItem(key, String(Date.now()));
  } catch {}
}

function isStandaloneApp() {
  if (typeof window === 'undefined') return false;
  const nav = window.navigator as Navigator & { standalone?: boolean };
  return window.matchMedia('(display-mode: standalone)').matches || nav.standalone === true;
}

function isIOS() {
  if (typeof window === 'undefined') return false;
  return /iPad|iPhone|iPod/.test(window.navigator.userAgent);
}

function urlBase64ToUint8Array(base64String: string) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  return Uint8Array.from(Array.from(rawData).map((char) => char.charCodeAt(0)));
}

export default function CircleOnboardingPrompts({ groupId }: { groupId: string }) {
  const [installAvailable, setInstallAvailable] = useState(false);
  const [installed, setInstalled] = useState(true);
  const [installDismissed, setInstallDismissed] = useState(true);
  const [notificationDismissed, setNotificationDismissed] = useState(true);
  const [settings, setSettings] = useState<NotificationSettings | null>(null);
  const [permission, setPermission] = useState<NotificationPermission | 'unsupported'>('unsupported');
  const [busy, setBusy] = useState<'install' | 'notifications' | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadSettings = useCallback(async () => {
    try {
      const res = await fetch('/api/circle-leader-toolkit/notifications/', { cache: 'no-store' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not load notification settings.');
      setSettings(data);
      setPermission('Notification' in window ? Notification.permission : 'unsupported');
    } catch {
      setSettings(null);
    }
  }, []);

  useEffect(() => {
    setInstalled(isStandaloneApp());
    setInstallAvailable(Boolean(window.__radiusPwaInstallAvailable || window.deferredPrompt));
    setInstallDismissed(recentlyDismissed(INSTALL_DISMISS_KEY));
    setNotificationDismissed(recentlyDismissed(NOTIFICATION_DISMISS_KEY));
    loadSettings();

    const onInstallAvailable = () => {
      setInstallAvailable(true);
      setInstalled(isStandaloneApp());
    };
    const onInstalled = () => {
      setInstalled(true);
      setInstallAvailable(false);
      setMessage('Circles Toolkit is installed.');
    };
    window.addEventListener('pwaInstallAvailable', onInstallAvailable);
    window.addEventListener('pwaInstalled', onInstalled);
    return () => {
      window.removeEventListener('pwaInstallAvailable', onInstallAvailable);
      window.removeEventListener('pwaInstalled', onInstalled);
    };
  }, [loadSettings]);

  const pushAvailable = useMemo(() => {
    return typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window && Boolean(settings?.publicKey);
  }, [settings?.publicKey]);
  const canAskForNotifications = pushAvailable && (!isIOS() || installed);

  const hasEnabledServerSubscription = Boolean(settings?.subscriptions?.some((sub) => sub.enabled));
  const notificationPrefsEnabled = settings?.preferences?.inbox_push_enabled !== false || settings?.preferences?.summary_reminder_push_enabled !== false;

  // An admin can "nudge" a leader to enable push from the Leader Messages page.
  // When the nudge is newer than the leader's local dismissal, re-surface the
  // prompt (and use stronger wording) even within the 14-day quiet window.
  const nudgeRequestedAt = settings?.preferences?.push_nudge_requested_at;
  const nudgeActive = useMemo(() => {
    if (!nudgeRequestedAt) return false;
    const nudgedMs = new Date(nudgeRequestedAt).getTime();
    if (!Number.isFinite(nudgedMs)) return false;
    const dismissedAt = dismissedAtMs(NOTIFICATION_DISMISS_KEY);
    return dismissedAt === null || nudgedMs > dismissedAt;
  }, [nudgeRequestedAt]);

  const shouldPromptInstall = !installed && !installDismissed && (installAvailable || isIOS());
  const shouldPromptNotifications =
    (!notificationDismissed || nudgeActive) &&
    canAskForNotifications &&
    permission !== 'denied' &&
    (!hasEnabledServerSubscription || !notificationPrefsEnabled);

  async function handleInstall() {
    setBusy('install');
    setError(null);
    setMessage(null);
    try {
      if (window.installPWA && (window.__radiusPwaInstallAvailable || window.deferredPrompt)) {
        window.installPWA();
        setInstallDismissed(true);
        markDismissed(INSTALL_DISMISS_KEY);
      } else if (isIOS()) {
        setMessage('Use Share, then Add to Home Screen.');
      } else {
        setMessage('Use your browser install button to add Circles Toolkit.');
      }
    } finally {
      setBusy(null);
    }
  }

  async function enableNotifications() {
    setBusy('notifications');
    setError(null);
    setMessage(null);
    try {
      if (!pushAvailable || !settings?.publicKey) throw new Error('Push notifications are not available in this browser.');
      const permissionResult = await Notification.requestPermission();
      setPermission(permissionResult);
      if (permissionResult !== 'granted') throw new Error('Notifications were not enabled.');

      const registration = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
      const ready = await navigator.serviceWorker.ready;
      const existing = await ready.pushManager.getSubscription();
      const subscription = existing || await ready.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(settings.publicKey),
      });

      const res = await fetch('/api/circle-leader-toolkit/notifications/', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subscription: subscription.toJSON() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not save this device.');

      await fetch('/api/circle-leader-toolkit/notifications/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          inboxPushEnabled: true,
          summaryReminderPushEnabled: true,
          badgeCountEnabled: settings.preferences?.badge_count_enabled !== false,
        }),
      }).catch(() => null);

      setMessage('Notifications are enabled for this browser.');
      setNotificationDismissed(true);
      await loadSettings();
      window.dispatchEvent(new CustomEvent('circle-summary-alerts-updated'));
      registration.update().catch(() => {});
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not enable notifications.');
    } finally {
      setBusy(null);
    }
  }

  function dismissInstall() {
    markDismissed(INSTALL_DISMISS_KEY);
    setInstallDismissed(true);
  }

  function dismissNotifications() {
    markDismissed(NOTIFICATION_DISMISS_KEY);
    setNotificationDismissed(true);
  }

  if (!shouldPromptInstall && !shouldPromptNotifications && !message && !error) return null;

  return (
    <section className="mt-3 space-y-2" aria-label="Circles Toolkit setup">
      {message && (
        <div className="rounded-2xl border border-[#34B233]/30 bg-[#34B233]/10 px-4 py-3 text-sm font-semibold text-neutral-800">
          {message}
        </div>
      )}
      {error && (
        <div className="rounded-2xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-900">
          {error}
        </div>
      )}
      {shouldPromptInstall && (
        <div className="rounded-2xl border border-neutral-200 bg-white px-4 py-3 shadow-sm">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <p className="text-sm font-extrabold text-neutral-900">Install Circles Toolkit</p>
              <p className="text-xs text-neutral-500 mt-0.5">
                {isIOS() ? 'Add it to your Home Screen for the app experience.' : 'Open it faster from your device.'}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button type="button" onClick={dismissInstall} className="rounded-full px-3 py-2 text-xs font-bold text-neutral-500 hover:bg-neutral-100">
                Not now
              </button>
              <button type="button" disabled={busy !== null} onClick={handleInstall} className="cs-inbox-banner-cta rounded-full bg-[#34B233] px-4 py-2 text-xs font-extrabold shadow-sm disabled:opacity-50">
                {busy === 'install' ? 'Working...' : isIOS() ? 'Show how' : 'Install'}
              </button>
            </div>
          </div>
        </div>
      )}
      {shouldPromptNotifications && (
        <div className="rounded-2xl border border-neutral-200 bg-white px-4 py-3 shadow-sm">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <p className="text-sm font-extrabold text-neutral-900">
                {nudgeActive ? 'Turn on notifications to stay in the loop' : 'Enable notifications'}
              </p>
              <p className="text-xs text-neutral-500 mt-0.5">
                {nudgeActive
                  ? 'Your team is sending messages here — turn on notifications so you do not miss them.'
                  : 'Get inbox messages and summary reminders on this device.'}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <LinkLikeSettings groupId={groupId} />
              <button type="button" onClick={dismissNotifications} className="rounded-full px-3 py-2 text-xs font-bold text-neutral-500 hover:bg-neutral-100">
                Not now
              </button>
              <button type="button" disabled={busy !== null} onClick={enableNotifications} className="cs-inbox-banner-cta rounded-full bg-[#34B233] px-4 py-2 text-xs font-extrabold shadow-sm disabled:opacity-50">
                {busy === 'notifications' ? 'Working...' : 'Enable'}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

function LinkLikeSettings({ groupId }: { groupId: string }) {
  return (
    <Link href={`/circle-leader-toolkit/${groupId}/settings`} className="rounded-full px-3 py-2 text-xs font-bold text-neutral-500 hover:bg-neutral-100">
      Settings
    </Link>
  );
}
