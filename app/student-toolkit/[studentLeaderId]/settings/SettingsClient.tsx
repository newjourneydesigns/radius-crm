'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { setCircleSummaryAppBadge } from '../../../../lib/circle-leader-toolkit/badging';
import {
  enablePushForThisDevice,
  PUSH_STAGE_SHORT_LABEL,
  type PushStage,
} from '../../../../lib/circle-leader-toolkit/enable-push';
import { useInstallEnv } from '../../../../lib/circle-leader-toolkit/installEnv';

type Preferences = {
  inbox_push_enabled: boolean;
  roster_absence_push_enabled: boolean;
  badge_count_enabled: boolean;
};

type PushSubscriptionInfo = {
  id: number | string;
  endpoint: string;
  enabled: boolean;
  device_label: string | null;
  created_at: string;
  last_successful_delivery_at: string | null;
  last_failed_delivery_at: string | null;
};

const TOGGLES: Array<{ key: keyof Preferences; title: string; desc: string }> = [
  {
    key: 'inbox_push_enabled',
    title: 'Inbox messages',
    desc: 'Get notified when your staff team sends you a message.',
  },
  {
    key: 'roster_absence_push_enabled',
    title: 'Roster reminders',
    desc: 'Get notified when someone in your circle has been missing.',
  },
  {
    key: 'badge_count_enabled',
    title: 'Badge count',
    desc: 'Show unread counts on the app icon where your device supports it.',
  },
];

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
  if (typeof window === 'undefined') return 'Notifications are turned on per device.';
  if (/iPad|iPhone|iPod/.test(window.navigator.userAgent)) {
    return 'On iPhone and iPad, add Student Toolkit to your Home Screen first — notifications only work from the installed app.';
  }
  if (/Android/i.test(window.navigator.userAgent)) {
    return 'On Android, notifications work in Chrome and in the installed app once you allow them.';
  }
  return 'Notifications work in supported browsers and installed apps once you allow them.';
}

export default function SettingsClient() {
  const router = useRouter();
  const installEnv = useInstallEnv();

  const [preferences, setPreferences] = useState<Preferences | null>(null);
  const [subscriptions, setSubscriptions] = useState<PushSubscriptionInfo[]>([]);
  const [publicKey, setPublicKey] = useState<string | null>(null);
  const [permission, setPermission] = useState<NotificationPermission | 'unsupported'>('unsupported');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [pushStage, setPushStage] = useState<PushStage | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [devicePushNote, setDevicePushNote] = useState('Notifications are turned on per device.');
  const [thisDeviceEnabled, setThisDeviceEnabled] = useState(false);
  const [testPushLoading, setTestPushLoading] = useState(false);

  const pushAvailable = useMemo(
    () =>
      typeof window !== 'undefined' &&
      'serviceWorker' in navigator &&
      'PushManager' in window &&
      'Notification' in window &&
      Boolean(publicKey),
    [publicKey]
  );

  // When push can't run here only because the app isn't installed, the install
  // note is the useful next step — not a disabled button.
  const showInstallNote = !thisDeviceEnabled && !pushAvailable && !installEnv.isStandalone;

  async function loadSettings() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/student-toolkit/notifications/', { cache: 'no-store' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not load your notification settings.');
      setPreferences(data.prefs);
      setSubscriptions(data.subscriptions || []);
      setPublicKey(data.publicKey || null);
      setPermission('Notification' in window ? Notification.permission : 'unsupported');
      const endpoint = await getCurrentPushEndpoint();
      setThisDeviceEnabled(
        !!endpoint &&
          (data.subscriptions || []).some(
            (sub: PushSubscriptionInfo) => sub.endpoint === endpoint && sub.enabled
          )
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load your notification settings.');
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
    const previous = preferences;
    const next = { ...preferences, [key]: value };
    // Optimistic: a toggle that lags behind the tap feels broken.
    setPreferences(next);
    setError(null);
    try {
      const res = await fetch('/api/student-toolkit/notifications/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          inboxPushEnabled: next.inbox_push_enabled,
          rosterAbsencePushEnabled: next.roster_absence_push_enabled,
          badgeCountEnabled: next.badge_count_enabled,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not save that setting.');
      setPreferences(data.prefs);
      if (key === 'badge_count_enabled') {
        const counts = await fetch('/api/student-toolkit/alerts/', { cache: 'no-store' })
          .then((r) => r.json())
          .catch(() => null);
        await setCircleSummaryAppBadge(Number(counts?.totalAlertCount || 0), value);
      }
      window.dispatchEvent(new CustomEvent('student-toolkit-alerts-updated'));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save that setting.');
      setPreferences(previous);
    }
  }

  async function enablePush() {
    setBusy(true);
    setError(null);
    setMessage(null);
    setPushStage('permission');
    try {
      const { subscription, registration } = await enablePushForThisDevice({
        publicKey,
        onStage: setPushStage,
        onPermission: setPermission,
      });
      setPushStage('saving');
      const res = await fetch('/api/student-toolkit/notifications/', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subscription: subscription.toJSON() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not save this device.');
      setMessage('Notifications are on for this device.');
      await loadSettings();
      window.dispatchEvent(new CustomEvent('student-toolkit-alerts-updated'));
      registration.update().catch(() => {});
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not turn on notifications.');
    } finally {
      setPushStage(null);
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
        await fetch(
          `/api/student-toolkit/notifications/?endpoint=${encodeURIComponent(subscription.endpoint)}`,
          { method: 'DELETE' }
        );
        await subscription.unsubscribe().catch(() => false);
      }
      setMessage('Notifications are off for this device.');
      await loadSettings();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not turn off notifications.');
    } finally {
      setBusy(false);
    }
  }

  async function sendTestPush() {
    setTestPushLoading(true);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch('/api/student-toolkit/notifications/test/', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not send a test notification.');
      setMessage('Test sent. Check your device.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not send a test notification.');
    } finally {
      setTestPushLoading(false);
    }
  }

  async function signOut() {
    await fetch('/api/student-toolkit/auth/logout/', { method: 'POST' });
    router.replace('/student-toolkit/');
  }

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
            <h1 className="text-lg font-bold text-neutral-900 tracking-tight">Notifications</h1>
          </div>
          <p className="text-xs text-neutral-500 mt-1.5">
            Turn notifications on for each device you use.
          </p>
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
                      {(pushAvailable || installEnv.isStandalone) && (
                        <PermissionPill permission={permission} enabled={thisDeviceEnabled} />
                      )}
                    </div>
                    <p className="text-xs text-neutral-500 mt-1.5 leading-relaxed">
                      {thisDeviceEnabled
                        ? 'This device is set up to receive notifications.'
                        : devicePushNote}
                    </p>
                  </div>
                  {thisDeviceEnabled ? (
                    <span className="inline-flex h-11 min-w-[8.5rem] shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-full bg-[#34B233]/10 px-5 text-sm font-extrabold text-[#1f7320] ring-1 ring-[#34B233]/25">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4} className="h-4 w-4" aria-hidden="true">
                        <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
                      </svg>
                      Notifications on
                    </span>
                  ) : pushAvailable ? (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={enablePush}
                      className="inline-flex h-11 min-w-[8.5rem] shrink-0 items-center justify-center whitespace-nowrap rounded-full bg-[#34B233] px-5 text-sm font-extrabold text-white shadow-sm ring-1 ring-[#2ca52b]/20 transition-colors hover:bg-[#2fa62e] disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {busy ? PUSH_STAGE_SHORT_LABEL[pushStage ?? 'permission'] : 'Turn on'}
                    </button>
                  ) : null}
                </div>
                {thisDeviceEnabled && (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={disableCurrentDevice}
                    className="text-xs font-semibold text-neutral-500 underline underline-offset-2 transition-colors hover:text-neutral-700 disabled:opacity-50"
                  >
                    {busy ? 'Working…' : 'Turn off on this device'}
                  </button>
                )}
                {showInstallNote && (
                  <p className="text-xs text-neutral-500">
                    Add Student Toolkit to your Home Screen, open it from there, and this button
                    will turn notifications on.
                  </p>
                )}
                {!thisDeviceEnabled && !pushAvailable && installEnv.isStandalone && (
                  <p className="text-xs text-neutral-500">
                    Notifications aren&apos;t available on this device right now.
                  </p>
                )}
              </div>

              <div className="overflow-hidden rounded-2xl border border-neutral-200 bg-white divide-y divide-neutral-100">
                {TOGGLES.map(({ key, title, desc }) => (
                  <label
                    key={key}
                    className="flex cursor-pointer items-center justify-between gap-4 p-4 transition-colors hover:bg-neutral-50"
                  >
                    <span className="min-w-0">
                      <span className="block text-sm font-bold text-neutral-900">{title}</span>
                      <span className="mt-0.5 block text-xs leading-relaxed text-neutral-500">
                        {desc}
                      </span>
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

              <button
                type="button"
                onClick={sendTestPush}
                disabled={testPushLoading}
                className="w-full inline-flex h-11 items-center justify-center gap-2 rounded-full border border-[#34B233]/40 bg-white px-4 text-sm font-extrabold text-[#1f7320] transition-colors hover:bg-[#34B233]/10 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="h-4 w-4" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M14.857 17.082a23.848 23.848 0 0 0 5.454-1.31A8.967 8.967 0 0 1 18 9.75V9A6 6 0 0 0 6 9v.75a8.967 8.967 0 0 1-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 0 1-5.714 0m5.714 0a3 3 0 1 1-5.714 0" />
                </svg>
                {testPushLoading ? 'Sending...' : 'Send a test notification'}
              </button>

              <div className="rounded-2xl border border-neutral-200 bg-neutral-50 p-4">
                <p className="text-sm font-bold text-neutral-900">Your devices</p>
                <div className="mt-3 space-y-2">
                  {subscriptions.length === 0 ? (
                    <p className="text-xs text-neutral-500">
                      No devices yet. Turn notifications on above to add this one.
                    </p>
                  ) : (
                    subscriptions.map((sub) => (
                      <div
                        key={String(sub.id)}
                        className="flex items-center justify-between gap-3 rounded-xl border border-neutral-200 bg-white px-3 py-2.5"
                      >
                        <div className="flex min-w-0 items-center gap-2.5">
                          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-neutral-100 text-neutral-500">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="h-4 w-4" aria-hidden="true">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M9 17.25v1.007a3 3 0 0 1-.879 2.122L7.5 21h9l-.621-.621A3 3 0 0 1 15 18.257V17.25m6-12V15a2.25 2.25 0 0 1-2.25 2.25H5.25A2.25 2.25 0 0 1 3 15V5.25m18 0A2.25 2.25 0 0 0 18.75 3H5.25A2.25 2.25 0 0 0 3 5.25m18 0V12a2.25 2.25 0 0 1-2.25 2.25H5.25A2.25 2.25 0 0 1 3 12V5.25" />
                            </svg>
                          </span>
                          <div className="min-w-0">
                            <span className="block truncate text-sm font-semibold text-neutral-800">
                              {sub.device_label || 'Browser'}
                            </span>
                            {sub.last_failed_delivery_at && (
                              <span className="block text-[11px] text-amber-700">
                                Last failed{' '}
                                {new Date(sub.last_failed_delivery_at).toLocaleDateString()}
                              </span>
                            )}
                          </div>
                        </div>
                        <span
                          className={`cs-badge shrink-0 ${sub.enabled ? 'cs-badge-success' : 'cs-badge-muted'}`}
                        >
                          {sub.enabled ? 'On' : 'Off'}
                        </span>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </>
          )}
        </div>
      </section>

      <section className="cs-card p-4 sm:p-5">
        <p className="text-sm font-bold text-neutral-900">Account</p>
        <p className="text-xs text-neutral-500 mt-0.5">
          Sign out of the Student Toolkit on this device.
        </p>
        <button
          type="button"
          onClick={signOut}
          className="mt-4 inline-flex h-11 w-full items-center justify-center rounded-full border border-neutral-300 bg-white px-5 text-sm font-extrabold text-neutral-800 shadow-sm transition-colors hover:border-red-200 hover:bg-red-50 hover:text-red-700"
        >
          Sign out
        </button>
      </section>
    </main>
  );
}

function PermissionPill({
  permission,
  enabled,
}: {
  permission: NotificationPermission | 'unsupported';
  enabled: boolean;
}) {
  // "Notifications on" already says it — a second pill would only add noise.
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
