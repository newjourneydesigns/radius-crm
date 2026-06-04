'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { createClient } from '@supabase/supabase-js';
import { useMarkCircleAppEntered } from '../../../../lib/circle-leader-toolkit/appEntered';
import { setCircleSummaryAppBadge } from '../../../../lib/circle-leader-toolkit/badging';

type Preferences = {
  inbox_push_enabled: boolean;
  summary_reminder_push_enabled: boolean;
  badge_count_enabled: boolean;
};

type PushSubscriptionInfo = {
  id: string;
  endpoint: string;
  enabled: boolean;
  device_label: string | null;
  updated_at: string;
  last_successful_delivery_at: string | null;
  last_failed_delivery_at: string | null;
};

type MagicLinkInfo = {
  url: string;
  expiresAt: string;
  expiresInDays: number;
};

function urlBase64ToUint8Array(base64String: string) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  return Uint8Array.from(Array.from(rawData).map((char) => char.charCodeAt(0)));
}

async function getCurrentPushEndpoint(): Promise<string | null> {
  try {
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return null;
    const registration = await navigator.serviceWorker.getRegistration();
    const subscription = await registration?.pushManager.getSubscription();
    return subscription?.endpoint ?? null;
  } catch {
    return null;
  }
}

function getDevicePushNote() {
  if (typeof window === 'undefined') return 'Push notifications are opt-in per browser or installed app.';
  if (/iPad|iPhone|iPod/.test(window.navigator.userAgent)) {
    return 'On iPhone and iPad, push works only after adding Circle Leader Toolkit to the Home Screen on iOS/iPadOS 16.4 or newer.';
  }
  if (/Android/i.test(window.navigator.userAgent)) {
    return 'On Android, push works in Chrome and installed PWAs after you allow notifications.';
  }
  return 'Push works in supported desktop browsers and installed PWAs after you allow notifications.';
}

export default function CircleSummaryNotificationSettingsPage() {
  useMarkCircleAppEntered();
  const router = useRouter();
  const params = useParams<{ ccbGroupId: string }>();
  const groupId = params?.ccbGroupId ?? '';
  const [preferences, setPreferences] = useState<Preferences | null>(null);
  const [subscriptions, setSubscriptions] = useState<PushSubscriptionInfo[]>([]);
  const [publicKey, setPublicKey] = useState<string | null>(null);
  const [permission, setPermission] = useState<NotificationPermission | 'unsupported'>('unsupported');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [magicLink, setMagicLink] = useState<MagicLinkInfo | null>(null);
  const [magicLinkBusy, setMagicLinkBusy] = useState(false);
  const [magicLinkCopied, setMagicLinkCopied] = useState(false);
  const [magicLinkError, setMagicLinkError] = useState<string | null>(null);
  const [devicePushNote, setDevicePushNote] = useState('Push notifications are opt-in per browser or installed app.');
  const [thisDeviceEnabled, setThisDeviceEnabled] = useState(false);
  const [testPushLoading, setTestPushLoading] = useState(false);
  const [testEmailLoading, setTestEmailLoading] = useState(false);

  const pushAvailable = useMemo(() => {
    return typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window && Boolean(publicKey);
  }, [publicKey]);

  async function loadSettings() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/circle-leader-toolkit/notifications/', { cache: 'no-store' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not load notification settings.');
      setPreferences(data.preferences);
      setSubscriptions(data.subscriptions || []);
      setPublicKey(data.publicKey || null);
      setPermission('Notification' in window ? Notification.permission : 'unsupported');
      const endpoint = await getCurrentPushEndpoint();
      setThisDeviceEnabled(
        !!endpoint && (data.subscriptions || []).some((s: PushSubscriptionInfo) => s.endpoint === endpoint && s.enabled),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load notification settings.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    setDevicePushNote(getDevicePushNote());
    loadSettings();
  }, []);

  async function savePreference(key: keyof Preferences, value: boolean) {
    if (!preferences) return;
    const next = { ...preferences, [key]: value };
    setPreferences(next);
    setError(null);
    try {
      const res = await fetch('/api/circle-leader-toolkit/notifications/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          inboxPushEnabled: next.inbox_push_enabled,
          summaryReminderPushEnabled: next.summary_reminder_push_enabled,
          badgeCountEnabled: next.badge_count_enabled,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not save settings.');
      setPreferences(data.preferences);
      if (key === 'badge_count_enabled') {
        const counts = await fetch('/api/circle-leader-toolkit/alerts/', { cache: 'no-store' }).then((r) => r.json()).catch(() => null);
        await setCircleSummaryAppBadge(Number(counts?.totalAlertCount || 0), value);
      }
      window.dispatchEvent(new CustomEvent('circle-summary-alerts-updated'));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save settings.');
      setPreferences(preferences);
    }
  }

  async function enablePush() {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      if (!pushAvailable || !publicKey) throw new Error('Push notifications are not available in this browser yet.');
      const permissionResult = await Notification.requestPermission();
      setPermission(permissionResult);
      if (permissionResult !== 'granted') throw new Error('Notification permission was not granted.');
      const registration = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
      const ready = await navigator.serviceWorker.ready;
      const existing = await ready.pushManager.getSubscription();
      const subscription = existing || await ready.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey),
      });
      const res = await fetch('/api/circle-leader-toolkit/notifications/', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subscription: subscription.toJSON() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not save this device.');
      setMessage('Push notifications are enabled for this browser.');
      await loadSettings();
      window.dispatchEvent(new CustomEvent('circle-summary-alerts-updated'));
      registration.update().catch(() => {});
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not enable push notifications.');
    } finally {
      setBusy(false);
    }
  }

  async function disableCurrentDevice() {
    setBusy(true);
    setError(null);
    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      if (subscription) {
        await fetch(`/api/circle-leader-toolkit/notifications/?endpoint=${encodeURIComponent(subscription.endpoint)}`, { method: 'DELETE' });
        await subscription.unsubscribe().catch(() => false);
      }
      setMessage('Push notifications are disabled for this browser.');
      await loadSettings();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not disable push notifications.');
    } finally {
      setBusy(false);
    }
  }

  async function copyMagicLink(url: string) {
    await navigator.clipboard.writeText(url);
    setMagicLinkCopied(true);
    window.setTimeout(() => setMagicLinkCopied(false), 2500);
  }

  async function generateMagicLink() {
    setMagicLinkBusy(true);
    setMagicLinkError(null);
    setMagicLinkCopied(false);
    try {
      const res = await fetch('/api/circle-leader-toolkit/magic-link/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not create a magic link.');
      if (!data.url) throw new Error('Could not create a magic link.');
      const nextLink: MagicLinkInfo = {
        url: data.url,
        expiresAt: data.expiresAt,
        expiresInDays: Number(data.expiresInDays || 7),
      };
      setMagicLink(nextLink);
      try {
        await copyMagicLink(nextLink.url);
      } catch {
        setMagicLinkError('Link created. Copy it from the field below.');
      }
    } catch (err) {
      setMagicLinkError(err instanceof Error ? err.message : 'Could not create a magic link.');
    } finally {
      setMagicLinkBusy(false);
    }
  }

  async function signOut() {
    await fetch('/api/circle-leader-toolkit/auth/logout/', { method: 'POST' });
    router.replace('/circle-leader-toolkit');
  }

  async function sendTestPush() {
    setTestPushLoading(true);
    setError(null);
    setMessage(null);
    try {
      const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
      );
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();
      if (sessionError || !session) throw new Error('Authentication required');

      const res = await fetch('/api/circle-leader-toolkit/notifications/test', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to send test push');
      setMessage('Test push notification sent! Check your enabled devices.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send test push');
    } finally {
      setTestPushLoading(false);
    }
  }

  async function sendTestEmail() {
    setTestEmailLoading(true);
    setError(null);
    setMessage(null);
    try {
      const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
      );
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();
      if (sessionError || !session) throw new Error('Authentication required');

      const res = await fetch('/api/circle-leader-toolkit/notifications/test-email', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to send test email');
      setMessage('Test email sent! Check your inbox.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send test email');
    } finally {
      setTestEmailLoading(false);
    }
  }

  const toggles: Array<{ key: keyof Preferences; title: string; desc: string }> = [
    { key: 'inbox_push_enabled', title: 'Inbox messages', desc: 'Notify me when a new Leader Hub inbox message arrives.' },
    { key: 'summary_reminder_push_enabled', title: 'Event summary reminders', desc: 'Notify me after Circle when a summary still needs submission.' },
    { key: 'badge_count_enabled', title: 'Badge count', desc: 'Use app icon badges where supported, plus reliable in-app counts everywhere.' },
  ];

  return (
    <main className="max-w-2xl mx-auto px-4 py-6 space-y-4">
      <section className="cs-card p-0 overflow-hidden">
        <div className="border-b border-neutral-100 px-5 py-4">
          <div className="flex items-center gap-2.5">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#34B233]/10 text-[#1f7320]">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="h-[18px] w-[18px]" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" d="M14.857 17.082a23.848 23.848 0 0 0 5.454-1.31A8.967 8.967 0 0 1 18 9.75V9A6 6 0 0 0 6 9v.75a8.967 8.967 0 0 1-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 0 1-5.714 0m5.714 0a3 3 0 1 1-5.714 0" />
              </svg>
            </span>
            <h2 className="text-lg font-bold text-neutral-900 tracking-tight">Notifications</h2>
          </div>
          <p className="text-xs text-neutral-500 mt-1.5">Push notifications are opt-in per browser or installed app. Email reminders stay separate.</p>
        </div>

        <div className="p-4 sm:p-5 space-y-4">
          {loading && <div className="cs-skeleton h-40 w-full rounded-2xl" />}
          {!loading && error && <div className="cs-alert cs-alert-warning">{error}</div>}
          {!loading && message && (
            <div className="flex items-start gap-2 rounded-2xl border border-[#34B233]/30 bg-[#34B233]/10 p-3 text-sm text-neutral-800">
              <svg viewBox="0 0 24 24" fill="none" stroke="#1f7320" strokeWidth={2} className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
              </svg>
              <span>{message}</span>
            </div>
          )}

          {!loading && preferences && (
            <>
              <div className="rounded-2xl border border-neutral-200 bg-neutral-50/70 p-4 space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm font-extrabold text-neutral-900">This device</p>
                      <PermissionPill permission={permission} enabled={thisDeviceEnabled} />
                    </div>
                    <p className="text-xs text-neutral-500 mt-1.5 leading-relaxed">
                      {thisDeviceEnabled ? 'This browser is set up to receive push notifications.' : devicePushNote}
                    </p>
                  </div>
                  {thisDeviceEnabled ? (
                    <span className="inline-flex h-11 min-w-[8.5rem] shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-full bg-[#34B233]/10 px-5 text-sm font-extrabold text-[#1f7320] ring-1 ring-[#34B233]/25">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4} className="h-4 w-4" aria-hidden="true">
                        <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
                      </svg>
                      Push on
                    </span>
                  ) : (
                    <button
                      type="button"
                      disabled={busy || !pushAvailable}
                      onClick={enablePush}
                      className="inline-flex h-11 min-w-[8.5rem] shrink-0 items-center justify-center whitespace-nowrap rounded-full bg-[#34B233] px-5 text-sm font-extrabold text-white shadow-sm ring-1 ring-[#2ca52b]/20 transition-colors hover:bg-[#2fa62e] disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {busy ? 'Working…' : 'Enable push'}
                    </button>
                  )}
                </div>
                {thisDeviceEnabled && (
                  <button type="button" disabled={busy} onClick={disableCurrentDevice} className="text-xs font-semibold text-neutral-500 underline underline-offset-2 transition-colors hover:text-neutral-700 disabled:opacity-50">
                    {busy ? 'Working…' : 'Disable push on this browser'}
                  </button>
                )}
                {!pushAvailable && <p className="text-xs text-amber-700">Push is unavailable here or VAPID keys are not configured.</p>}
              </div>

              <div className="overflow-hidden rounded-2xl border border-neutral-200 bg-white divide-y divide-neutral-100">
                {toggles.map(({ key, title, desc }) => (
                  <label key={key} className="flex cursor-pointer items-center justify-between gap-4 p-4 transition-colors hover:bg-neutral-50">
                    <span className="min-w-0">
                      <span className="block text-sm font-bold text-neutral-900">{title}</span>
                      <span className="mt-0.5 block text-xs leading-relaxed text-neutral-500">{desc}</span>
                    </span>
                    <input
                      type="checkbox"
                      className="cs-toggle"
                      checked={preferences[key]}
                      onChange={(e) => savePreference(key, e.target.checked)}
                    />
                  </label>
                ))}
              </div>

              <div className="rounded-2xl border border-neutral-200 bg-neutral-50 p-4">
                <p className="text-sm font-bold text-neutral-900">Enabled devices</p>
                <div className="mt-3 space-y-2">
                  {subscriptions.length === 0 ? (
                    <p className="text-xs text-neutral-500">No devices saved yet.</p>
                  ) : subscriptions.map((sub) => (
                    <div key={sub.id} className="flex items-center justify-between gap-3 rounded-xl border border-neutral-200 bg-white px-3 py-2.5">
                      <div className="flex min-w-0 items-center gap-2.5">
                        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-neutral-100 text-neutral-500">
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="h-4 w-4" aria-hidden="true">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M9 17.25v1.007a3 3 0 0 1-.879 2.122L7.5 21h9l-.621-.621A3 3 0 0 1 15 18.257V17.25m6-12V15a2.25 2.25 0 0 1-2.25 2.25H5.25A2.25 2.25 0 0 1 3 15V5.25m18 0A2.25 2.25 0 0 0 18.75 3H5.25A2.25 2.25 0 0 0 3 5.25m18 0V12a2.25 2.25 0 0 1-2.25 2.25H5.25A2.25 2.25 0 0 1 3 12V5.25" />
                          </svg>
                        </span>
                        <div className="min-w-0">
                          <span className="block truncate text-sm font-semibold text-neutral-800">{sub.device_label || 'Browser'}</span>
                          {sub.last_failed_delivery_at && (
                            <span className="block text-[11px] text-amber-700">Last failed {new Date(sub.last_failed_delivery_at).toLocaleDateString()}</span>
                          )}
                        </div>
                      </div>
                      <span className={`cs-badge shrink-0 ${sub.enabled ? 'cs-badge-success' : 'cs-badge-muted'}`}>{sub.enabled ? 'Enabled' : 'Disabled'}</span>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>
      </section>

      <section className="cs-card p-4 sm:p-5">
        <p className="text-sm font-bold text-neutral-900">Temporary Circle link</p>
        <p className="text-xs text-neutral-500 mt-0.5">
          Create a copyable sign-in link for your Circle. It works for Circle Summary pages only and expires after 7 days, including any device session opened from it.
        </p>
        <p className="mt-2 text-[11px] leading-relaxed text-amber-700">
          Anyone with this link can open your Circle Summary until it expires.
        </p>

        <button
          type="button"
          onClick={generateMagicLink}
          disabled={magicLinkBusy}
          className="cs-settings-green-action mt-4"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="h-[18px] w-[18px]" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d="M13.19 8.688a4.5 4.5 0 0 1 1.242 7.244l-4.5 4.5a4.5 4.5 0 0 1-6.364-6.364l1.757-1.757m13.35-.622 1.757-1.757a4.5 4.5 0 0 0-6.364-6.364l-4.5 4.5a4.5 4.5 0 0 0 1.242 7.244" />
          </svg>
          {magicLinkBusy ? 'Creating link...' : magicLink ? 'Create new link' : 'Create and copy link'}
        </button>

        {magicLinkError && (
          <div className="cs-alert cs-alert-warning mt-3">{magicLinkError}</div>
        )}

        {magicLink && (
          <div className="mt-4 rounded-2xl border border-neutral-200 bg-neutral-50 p-3">
            <label htmlFor="circle-summary-magic-link" className="block text-[11px] font-bold uppercase tracking-wide text-neutral-500">
              Magic link
            </label>
            <div className="mt-2 flex flex-col gap-2 sm:flex-row">
              <input
                id="circle-summary-magic-link"
                value={magicLink.url}
                readOnly
                className="min-w-0 flex-1 rounded-xl border border-neutral-200 bg-white px-3 py-2 text-xs text-neutral-700 shadow-sm focus:outline-none focus:ring-2 focus:ring-[#34B233]/30"
                onFocus={(e) => e.currentTarget.select()}
              />
              <button
                type="button"
                onClick={() => copyMagicLink(magicLink.url).catch(() => setMagicLinkError('Copy failed. Select the link and copy it manually.'))}
                className="inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-full border border-[#34B233]/40 bg-white px-4 text-xs font-extrabold text-[#1f7320] transition-colors hover:bg-[#34B233]/10"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="h-4 w-4" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M8 8h8v8H8z" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 14H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h7a2 2 0 0 1 2 2v1M10 21h7a2 2 0 0 0 2-2v-7a2 2 0 0 0-2-2h-7a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2Z" />
                </svg>
                {magicLinkCopied ? 'Copied' : 'Copy'}
              </button>
            </div>
            <p className="mt-2 text-[11px] text-neutral-500">
              Expires {new Date(magicLink.expiresAt).toLocaleString()}.
            </p>
          </div>
        )}
      </section>

      <section className="cs-card p-4 sm:p-5">
        <p className="text-sm font-bold text-neutral-900">Test notifications</p>
        <p className="text-xs text-neutral-500 mt-0.5">Send yourself a test push notification or email to verify they're working.</p>
        <div className="mt-4 flex flex-col gap-3 sm:flex-row">
          <button
            type="button"
            onClick={sendTestPush}
            disabled={testPushLoading}
            className="flex-1 inline-flex h-11 items-center justify-center gap-2 rounded-full border border-[#34B233]/40 bg-white px-4 text-sm font-extrabold text-[#1f7320] transition-colors hover:bg-[#34B233]/10 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="h-4 w-4" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M14.857 17.082a23.848 23.848 0 0 0 5.454-1.31A8.967 8.967 0 0 1 18 9.75V9A6 6 0 0 0 6 9v.75a8.967 8.967 0 0 1-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 0 1-5.714 0m5.714 0a3 3 0 1 1-5.714 0" />
            </svg>
            {testPushLoading ? 'Sending...' : 'Test push'}
          </button>
          <button
            type="button"
            onClick={sendTestEmail}
            disabled={testEmailLoading}
            className="flex-1 inline-flex h-11 items-center justify-center gap-2 rounded-full border border-[#34B233]/40 bg-white px-4 text-sm font-extrabold text-[#1f7320] transition-colors hover:bg-[#34B233]/10 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="h-4 w-4" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 0 1-2.25 2.25H4.5a2.25 2.25 0 0 1-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0 0 19.5 4.5h-15a2.25 2.25 0 0 0-2.25 2.25m19.5 0v.243a2.25 2.25 0 0 1-1.07 1.972l-7.5 4.5m0 0l-7.5-4.5a2.25 2.25 0 0 1-1.07-1.972V6.75" />
            </svg>
            {testEmailLoading ? 'Sending...' : 'Test email'}
          </button>
        </div>
      </section>

      <section className="cs-card p-4 sm:p-5">
        <p className="text-sm font-bold text-neutral-900">Account</p>
        <p className="text-xs text-neutral-500 mt-0.5">Sign out of the Leader Hub on this device.</p>
        <button
          type="button"
          onClick={signOut}
          className="mt-4 inline-flex h-11 w-full items-center justify-center rounded-full border border-neutral-300 bg-white px-5 text-sm font-extrabold text-neutral-800 shadow-sm transition-colors hover:border-red-200 hover:bg-red-50 hover:text-red-700"
        >
          Sign out
        </button>
      </section>

      <section className="cs-card p-4 sm:p-5">
        <p className="text-sm font-bold text-neutral-900">Help &amp; guide</p>
        <p className="text-xs text-neutral-500 mt-0.5">New here, or need a refresher? See step-by-step instructions for everything in the app.</p>
        <Link
          href={`/circle-leader-toolkit/${groupId}/help`}
          className="cs-settings-green-action mt-4"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="h-[18px] w-[18px]" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d="M9.879 7.519c1.171-1.025 3.071-1.025 4.242 0 1.172 1.025 1.172 2.687 0 3.712-.203.179-.43.326-.67.442-.745.361-1.45.999-1.45 1.827v.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 5.25h.008v.008H12v-.008Z" />
          </svg>
          View the help guide
        </Link>
      </section>
    </main>
  );
}

function PermissionPill({ permission, enabled }: { permission: NotificationPermission | 'unsupported'; enabled: boolean }) {
  // When push is live on this browser the "Push on" status already says so —
  // a redundant "Allowed" permission pill would just add noise.
  if (enabled) return null;
  const config: Record<string, { label: string; className: string }> = {
    granted: { label: 'Allowed', className: 'cs-badge-success' },
    denied: { label: 'Blocked', className: 'cs-badge-danger' },
    default: { label: 'Not set', className: 'cs-badge-muted' },
    unsupported: { label: 'Unsupported', className: 'cs-badge-muted' },
  };
  const { label, className } = config[permission] ?? config.default;
  return <span className={`cs-badge ${className}`}>{label}</span>;
}
