'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
};

type ToolkitOnboardingState = {
  homeScreenCompletedAt: string | null;
  homeScreenDismissedAt: string | null;
  notificationsCompletedAt: string | null;
  notificationsDismissedAt: string | null;
  practiceSummaryCompletedAt: string | null;
  completedAt: string | null;
  isComplete: boolean;
};

type NotificationSettings = {
  publicKey: string | null;
  pushSupported: boolean;
  preferences?: {
    inbox_push_enabled: boolean;
    summary_reminder_push_enabled: boolean;
    badge_count_enabled: boolean;
  };
  subscriptions?: Array<{ id: string; enabled: boolean; endpoint: string }>;
};

type FakePerson = {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
};

type ManualAttendee = {
  firstName: string;
  lastName: string;
  phone: string;
  email: string;
};

declare global {
  interface Window {
    installPWA?: () => void;
    deferredPrompt?: BeforeInstallPromptEvent | null;
    __radiusPwaInstallAvailable?: boolean;
  }
}

const FAKE_ROSTER: FakePerson[] = [
  { id: 'u-001', firstName: 'Avery', lastName: 'Brooks', email: 'avery@example.com', phone: '555-0101' },
  { id: 'u-002', firstName: 'Jordan', lastName: 'Miles', email: 'jordan@example.com', phone: '555-0102' },
  { id: 'u-003', firstName: 'Taylor', lastName: 'Reed', email: 'taylor@example.com', phone: '555-0103' },
  { id: 'u-004', firstName: 'Morgan', lastName: 'Lee', email: 'morgan@example.com', phone: '555-0104' },
  { id: 'u-005', firstName: 'Casey', lastName: 'Parker', email: 'casey@example.com', phone: '555-0105' },
];

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

function homeScreenResolved(state: ToolkitOnboardingState) {
  return Boolean(state.homeScreenCompletedAt || state.homeScreenDismissedAt);
}

function notificationsResolved(state: ToolkitOnboardingState) {
  return Boolean(state.notificationsCompletedAt || state.notificationsDismissedAt);
}

export default function OnboardingClient({
  groupId,
  leaderName,
  initialOnboarding,
}: {
  groupId: string;
  leaderName: string;
  initialOnboarding: ToolkitOnboardingState;
}) {
  const router = useRouter();
  const [onboarding, setOnboarding] = useState(initialOnboarding);
  const [installed, setInstalled] = useState(false);
  const [installAvailable, setInstallAvailable] = useState(false);
  const [notificationSettings, setNotificationSettings] = useState<NotificationSettings | null>(null);
  const [permission, setPermission] = useState<NotificationPermission | 'unsupported'>('unsupported');
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [didNotMeet, setDidNotMeet] = useState(false);
  const [didNotMeetReason, setDidNotMeetReason] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(
    () => new Set(FAKE_ROSTER.slice(0, 4).map((person) => person.id))
  );
  const [topic, setTopic] = useState('Practicing the Circles Toolkit');
  const [notes, setNotes] = useState('');
  const [prayerRequests, setPrayerRequests] = useState('');
  const [leaderInfo, setLeaderInfo] = useState('');
  const [guestForm, setGuestForm] = useState<ManualAttendee>({
    firstName: '',
    lastName: '',
    phone: '',
    email: '',
  });
  const [manualAttendees, setManualAttendees] = useState<ManualAttendee[]>([]);

  const activeStep = useMemo(() => {
    if (!homeScreenResolved(onboarding)) return 1;
    if (!notificationsResolved(onboarding)) return 2;
    if (!onboarding.practiceSummaryCompletedAt) return 3;
    return 4;
  }, [onboarding]);

  const eventsHref = groupId ? `/circle-leader-toolkit/${groupId}/events` : '/circle-leader-toolkit/events';

  const markStep = useCallback(
    async (step: 'home_screen' | 'notifications' | 'practice_summary', action: 'complete' | 'dismiss') => {
      setBusy(`${step}:${action}`);
      setError(null);
      setMessage(null);
      try {
        const res = await fetch('/api/circle-leader-toolkit/onboarding', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ step, action }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Could not update onboarding.');
        setOnboarding(data.onboarding);
        return data.onboarding as ToolkitOnboardingState;
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Could not update onboarding.');
        throw err;
      } finally {
        setBusy(null);
      }
    },
    []
  );

  useEffect(() => {
    const standalone = isStandaloneApp();
    setInstalled(standalone);
    setInstallAvailable(Boolean(window.__radiusPwaInstallAvailable || window.deferredPrompt || isIOS()));
    setPermission('Notification' in window ? Notification.permission : 'unsupported');

    const onInstallAvailable = () => setInstallAvailable(true);
    const onInstalled = () => {
      setInstalled(true);
    };
    window.addEventListener('pwaInstallAvailable', onInstallAvailable);
    window.addEventListener('appinstalled', onInstalled);
    window.addEventListener('pwaInstalled', onInstalled);
    return () => {
      window.removeEventListener('pwaInstallAvailable', onInstallAvailable);
      window.removeEventListener('appinstalled', onInstalled);
      window.removeEventListener('pwaInstalled', onInstalled);
    };
  }, []);

  useEffect(() => {
    if (installed && !homeScreenResolved(onboarding)) {
      markStep('home_screen', 'complete').catch(() => null);
    }
  }, [installed, markStep, onboarding]);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/circle-leader-toolkit/notifications/', { cache: 'no-store' })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!cancelled && data) {
          setNotificationSettings(data);
        }
      })
      .catch(() => null);
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const hasEnabledSubscription = Boolean(
      notificationSettings?.subscriptions?.some((subscription) => subscription.enabled)
    );
    if (
      hasEnabledSubscription &&
      homeScreenResolved(onboarding) &&
      !notificationsResolved(onboarding)
    ) {
      markStep('notifications', 'complete').catch(() => null);
    }
  }, [markStep, notificationSettings, onboarding]);

  async function handleInstallPrompt() {
    setError(null);
    setMessage(null);
    if (window.installPWA && (window.__radiusPwaInstallAvailable || window.deferredPrompt)) {
      window.installPWA();
      setMessage('After the install finishes, come back here and tap I added it.');
      return;
    }
    if (isIOS()) {
      setMessage('Use Share, then Add to Home Screen. Come back here when it is added.');
      return;
    }
    setMessage('Use your browser install button, then tap I added it.');
  }

  async function enableNotifications() {
    setBusy('notifications:enable');
    setError(null);
    setMessage(null);
    try {
      if (!notificationSettings?.publicKey || !('Notification' in window) || !('PushManager' in window)) {
        throw new Error('Notifications are not available in this browser.');
      }
      const permissionResult = await Notification.requestPermission();
      setPermission(permissionResult);
      if (permissionResult !== 'granted') {
        throw new Error('Notifications were not enabled.');
      }

      const registration = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
      const ready = await navigator.serviceWorker.ready;
      const existing = await ready.pushManager.getSubscription();
      const subscription =
        existing ||
        (await ready.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(notificationSettings.publicKey),
        }));

      const saveRes = await fetch('/api/circle-leader-toolkit/notifications/', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subscription: subscription.toJSON() }),
      });
      const saveData = await saveRes.json();
      if (!saveRes.ok) throw new Error(saveData.error || 'Could not save this device.');

      await fetch('/api/circle-leader-toolkit/notifications/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          inboxPushEnabled: true,
          summaryReminderPushEnabled: true,
          badgeCountEnabled: notificationSettings.preferences?.badge_count_enabled !== false,
        }),
      }).catch(() => null);

      registration.update().catch(() => null);
      await markStep('notifications', 'complete');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not enable notifications.');
    } finally {
      setBusy(null);
    }
  }

  function togglePerson(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    setSelectedIds((prev) =>
      prev.size === FAKE_ROSTER.length ? new Set() : new Set(FAKE_ROSTER.map((person) => person.id))
    );
  }

  function addGuest() {
    const trimmed = {
      firstName: guestForm.firstName.trim(),
      lastName: guestForm.lastName.trim(),
      phone: guestForm.phone.trim(),
      email: guestForm.email.trim(),
    };
    if (!trimmed.firstName || !trimmed.lastName || !trimmed.phone || !trimmed.email) {
      setError('First name, last name, cell phone, and email are required for a new person.');
      return;
    }
    setManualAttendees((prev) => [...prev, trimmed]);
    setGuestForm({ firstName: '', lastName: '', phone: '', email: '' });
    setError(null);
  }

  async function submitPracticeSummary() {
    setError(null);
    if (didNotMeet && !didNotMeetReason.trim()) {
      setError('Please choose why this practice Circle did not meet.');
      return;
    }
    if (!didNotMeet && selectedIds.size + manualAttendees.length === 0) {
      setError('Mark at least one person present for this practice summary.');
      return;
    }
    if (!didNotMeet && !topic.trim()) {
      setError('Add a topic for this practice summary.');
      return;
    }
    const next = await markStep('practice_summary', 'complete');
    if (next.isComplete) {
      router.replace(eventsHref);
    }
  }

  return (
    <>
      <header className="cs-hero px-6 py-10">
        <div className="max-w-2xl mx-auto flex items-center gap-4">
          <Image
            src="/Circles Logo V2-White.png"
            alt="Circles"
            width={80}
            height={79}
            priority
            className="h-16 sm:h-20 w-auto shrink-0"
          />
          <div className="min-w-0">
            <p className="mb-1 text-xs font-bold uppercase text-white/75">Circles Toolkit</p>
            <h1 className="cs-display text-4xl sm:text-5xl leading-tight">Get Set Up</h1>
            <p className="mt-1.5 text-white/90 font-semibold text-base truncate">{leaderName}</p>
          </div>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-6 pb-14 space-y-4">
        <div className="flex items-center gap-2" aria-label="Onboarding progress">
          {[1, 2, 3].map((step) => (
            <div
              key={step}
              className={
                'h-2 flex-1 rounded-full ' +
                (activeStep > step
                  ? 'bg-[color:var(--cs-green)]'
                  : activeStep === step
                    ? 'bg-amber-400'
                    : 'bg-neutral-200')
              }
            />
          ))}
        </div>

        {message && (
          <div className="cs-alert cs-alert-info">{message}</div>
        )}
        {error && (
          <div className="cs-alert cs-alert-error">{error}</div>
        )}

        {activeStep === 1 && (
          <section className="cs-card space-y-4">
            <div className="cs-step mb-0">
              <span className="cs-step-num">1</span>
              <span className="cs-step-title">Add this to your Home Screen</span>
            </div>
            <p className="text-sm leading-relaxed text-neutral-600">
              The Toolkit works best as an app. Add it to your Home Screen so your summary,
              roster, messages, and resources are one tap away.
            </p>
            {installed && (
              <div className="rounded-lg border border-[#34B233]/30 bg-[#34B233]/10 px-3 py-2 text-sm font-semibold text-neutral-800">
                You are already using the installed app.
              </div>
            )}
            <div className="grid gap-2 sm:grid-cols-3">
              <button
                type="button"
                onClick={handleInstallPrompt}
                disabled={!installAvailable || busy !== null}
                className="cs-btn cs-btn-primary sm:col-span-1 disabled:opacity-50"
              >
                {isIOS() ? 'Show me how' : 'Install'}
              </button>
              <button
                type="button"
                onClick={() => markStep('home_screen', 'complete')}
                disabled={busy !== null}
                className="cs-btn cs-btn-outline sm:col-span-1 disabled:opacity-50"
              >
                I added it
              </button>
              <button
                type="button"
                onClick={() => markStep('home_screen', 'dismiss')}
                disabled={busy !== null}
                className="cs-btn cs-btn-ghost sm:col-span-1 disabled:opacity-50"
              >
                Skip for now
              </button>
            </div>
          </section>
        )}

        {activeStep === 2 && (
          <section className="cs-card space-y-4">
            <div className="cs-step mb-0">
              <span className="cs-step-num">2</span>
              <span className="cs-step-title">Enable notifications</span>
            </div>
            <p className="text-sm leading-relaxed text-neutral-600">
              Notifications help you catch summary reminders and messages from your team.
              You can change this later in Settings.
            </p>
            {permission === 'denied' && (
              <div className="cs-alert cs-alert-warning">
                Notifications are blocked in this browser. You can skip this step and turn them on later.
              </div>
            )}
            <div className="grid gap-2 sm:grid-cols-2">
              <button
                type="button"
                onClick={enableNotifications}
                disabled={busy !== null || permission === 'denied'}
                className="cs-btn cs-btn-primary disabled:opacity-50"
              >
                {busy === 'notifications:enable' ? 'Working...' : 'Enable notifications'}
              </button>
              <button
                type="button"
                onClick={() => markStep('notifications', 'dismiss')}
                disabled={busy !== null}
                className="cs-btn cs-btn-outline disabled:opacity-50"
              >
                Skip for now
              </button>
            </div>
          </section>
        )}

        {activeStep === 3 && (
          <section className="space-y-4">
            <div className="cs-card space-y-2">
              <div className="cs-step mb-0">
                <span className="cs-step-num">3</span>
                <span className="cs-step-title">Try a U-Event summary</span>
              </div>
              <p className="text-sm leading-relaxed text-neutral-600">
                This practice event uses fake people and fake notes. It will not be submitted
                to CCB, your ACPD, or the RADIUS database.
              </p>
            </div>

            <PracticeSummaryForm
              didNotMeet={didNotMeet}
              setDidNotMeet={setDidNotMeet}
              didNotMeetReason={didNotMeetReason}
              setDidNotMeetReason={setDidNotMeetReason}
              selectedIds={selectedIds}
              togglePerson={togglePerson}
              toggleAll={toggleAll}
              manualAttendees={manualAttendees}
              setManualAttendees={setManualAttendees}
              guestForm={guestForm}
              setGuestForm={setGuestForm}
              addGuest={addGuest}
              topic={topic}
              setTopic={setTopic}
              notes={notes}
              setNotes={setNotes}
              prayerRequests={prayerRequests}
              setPrayerRequests={setPrayerRequests}
              leaderInfo={leaderInfo}
              setLeaderInfo={setLeaderInfo}
            />

            <button
              type="button"
              onClick={submitPracticeSummary}
              disabled={busy !== null}
              className="cs-btn cs-btn-primary w-full disabled:opacity-50"
            >
              {busy === 'practice_summary:complete' ? 'Completing...' : 'Complete practice summary'}
            </button>
          </section>
        )}

        {activeStep === 4 && (
          <section className="cs-card text-center space-y-4">
            <h2 className="cs-step-title">Training complete</h2>
            <p className="text-sm leading-relaxed text-neutral-600">
              Your practice summary was not sent anywhere. You are ready to use the real Toolkit.
            </p>
            <Link href={eventsHref} className="cs-btn cs-btn-primary w-full">
              Go to my Circle events
            </Link>
          </section>
        )}
      </main>
    </>
  );
}

function PracticeSummaryForm({
  didNotMeet,
  setDidNotMeet,
  didNotMeetReason,
  setDidNotMeetReason,
  selectedIds,
  togglePerson,
  toggleAll,
  manualAttendees,
  setManualAttendees,
  guestForm,
  setGuestForm,
  addGuest,
  topic,
  setTopic,
  notes,
  setNotes,
  prayerRequests,
  setPrayerRequests,
  leaderInfo,
  setLeaderInfo,
}: {
  didNotMeet: boolean;
  setDidNotMeet: (value: boolean) => void;
  didNotMeetReason: string;
  setDidNotMeetReason: (value: string) => void;
  selectedIds: Set<string>;
  togglePerson: (id: string) => void;
  toggleAll: () => void;
  manualAttendees: ManualAttendee[];
  setManualAttendees: Dispatch<SetStateAction<ManualAttendee[]>>;
  guestForm: ManualAttendee;
  setGuestForm: Dispatch<SetStateAction<ManualAttendee>>;
  addGuest: () => void;
  topic: string;
  setTopic: (value: string) => void;
  notes: string;
  setNotes: (value: string) => void;
  prayerRequests: string;
  setPrayerRequests: (value: string) => void;
  leaderInfo: string;
  setLeaderInfo: (value: string) => void;
}) {
  const allSelected = selectedIds.size === FAKE_ROSTER.length;

  return (
    <>
      <div className="cs-card">
        <label className="flex items-center justify-between gap-4 cursor-pointer">
          <div className="flex items-center gap-3 min-w-0">
            <span className="cs-step-num shrink-0">1</span>
            <div>
              <div className="font-semibold text-neutral-900">Did your Circle meet?</div>
              <div className="text-xs text-neutral-500 mt-0.5">Practice event: Tuesday, 7:00 PM</div>
            </div>
          </div>
          <input
            type="checkbox"
            className="cs-toggle"
            checked={!didNotMeet}
            onChange={(event) => setDidNotMeet(!event.target.checked)}
          />
        </label>
      </div>

      {didNotMeet ? (
        <div className="cs-card space-y-3">
          <label className="text-sm font-semibold text-neutral-700">Why did this Circle not meet?</label>
          <select
            className="cs-input"
            value={didNotMeetReason}
            onChange={(event) => setDidNotMeetReason(event.target.value)}
          >
            <option value="">Choose a reason...</option>
            <option value="Holiday or school break">Holiday or school break</option>
            <option value="Weather">Weather</option>
            <option value="Leader unavailable">Leader unavailable</option>
            <option value="Other">Other</option>
          </select>
        </div>
      ) : (
        <>
          <div className="cs-card space-y-4">
            <div className="flex items-center justify-between gap-3">
              <div className="cs-step mb-0">
                <span className="cs-step-num">2</span>
                <span className="cs-step-title">Who came?</span>
              </div>
              <button type="button" onClick={toggleAll} className="text-xs font-bold text-[color:var(--cs-green-dark)]">
                {allSelected ? 'Clear all' : 'Select all'}
              </button>
            </div>
            <div className="space-y-1">
              {FAKE_ROSTER.map((person) => {
                const fullName = `${person.firstName} ${person.lastName}`;
                return (
                  <label key={person.id} className="flex items-start gap-2.5 py-1 cursor-pointer">
                    <input
                      type="checkbox"
                      className="cs-check mt-0.5"
                      checked={selectedIds.has(person.id)}
                      onChange={() => togglePerson(person.id)}
                    />
                    <span className="flex-1 min-w-0">
                      <span className="block truncate text-sm font-medium">{fullName}</span>
                      <span className="text-xs text-neutral-400">{person.phone} · {person.email}</span>
                    </span>
                  </label>
                );
              })}
              {manualAttendees.map((person, index) => (
                <div key={`${person.email}-${index}`} className="flex items-center gap-2.5 py-1 pl-[34px]">
                  <span className="flex-1 min-w-0 text-sm font-medium truncate">
                    {person.firstName} {person.lastName}
                    <span className="text-xs text-neutral-400 ml-1.5 font-normal">
                      {person.phone} · {person.email}
                    </span>
                  </span>
                  <span className="cs-badge cs-badge-new text-[10px] shrink-0">New</span>
                  <button
                    type="button"
                    onClick={() => setManualAttendees((prev) => prev.filter((_, i) => i !== index))}
                    className="inline-flex items-center justify-center w-7 h-7 rounded-md text-red-500 hover:bg-red-50 shrink-0 transition-colors"
                    aria-label={`Remove ${person.firstName} ${person.lastName}`}
                  >
                    -
                  </button>
                </div>
              ))}
            </div>
          </div>

          <div className="cs-card space-y-3">
            <h3 className="text-sm font-extrabold text-neutral-900">Add a practice guest</h3>
            <div className="grid grid-cols-2 gap-2">
              <input
                type="text"
                className="cs-input"
                placeholder="First name"
                value={guestForm.firstName}
                onChange={(event) => setGuestForm((prev) => ({ ...prev, firstName: event.target.value }))}
              />
              <input
                type="text"
                className="cs-input"
                placeholder="Last name"
                value={guestForm.lastName}
                onChange={(event) => setGuestForm((prev) => ({ ...prev, lastName: event.target.value }))}
              />
              <input
                type="tel"
                className="cs-input"
                placeholder="Cell phone"
                value={guestForm.phone}
                onChange={(event) => setGuestForm((prev) => ({ ...prev, phone: event.target.value }))}
              />
              <input
                type="email"
                className="cs-input"
                placeholder="Email"
                value={guestForm.email}
                onChange={(event) => setGuestForm((prev) => ({ ...prev, email: event.target.value }))}
              />
            </div>
            <button type="button" onClick={addGuest} className="cs-btn cs-btn-outline w-full">
              Add practice guest
            </button>
          </div>

          <div className="cs-card space-y-3">
            <div className="cs-step mb-0">
              <span className="cs-step-num">3</span>
              <span className="cs-step-title">Summary details</span>
            </div>
            <label className="grid gap-1">
              <span className="text-xs font-semibold text-neutral-600">Topic</span>
              <input className="cs-input" value={topic} onChange={(event) => setTopic(event.target.value)} />
            </label>
            <label className="grid gap-1">
              <span className="text-xs font-semibold text-neutral-600">Notes</span>
              <textarea
                className="cs-input min-h-[96px]"
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                placeholder="What stood out from the conversation?"
              />
            </label>
            <label className="grid gap-1">
              <span className="text-xs font-semibold text-neutral-600">Prayer requests</span>
              <textarea
                className="cs-input min-h-[80px]"
                value={prayerRequests}
                onChange={(event) => setPrayerRequests(event.target.value)}
                placeholder="Any requests your team should know about?"
              />
            </label>
            <label className="grid gap-1">
              <span className="text-xs font-semibold text-neutral-600">Information for leaders</span>
              <textarea
                className="cs-input min-h-[80px]"
                value={leaderInfo}
                onChange={(event) => setLeaderInfo(event.target.value)}
                placeholder="Anything you would want staff to know?"
              />
            </label>
          </div>
        </>
      )}
    </>
  );
}
