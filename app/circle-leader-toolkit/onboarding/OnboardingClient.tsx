'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  DynamicQuestionField,
  dynamicValueToString,
  getQuestionOptions,
  getSelectedOption,
  getSelectedOptions,
  optionFollowupKey,
  type DynamicQuestion,
  type DynamicQuestionOption,
  type DynamicValue,
} from '../../../components/circle-leader-toolkit/DynamicQuestionField';
import {
  DID_NOT_MEET_NOTES_KEY,
  DID_NOT_MEET_OTHER_VALUE,
  DID_NOT_MEET_REASON_KEY,
  normalizeQuestionResponseKey,
  type QuestionResponseKey,
} from '../../../lib/circle-leader-toolkit/dynamic-question-response-keys';
import InstallAppGuide from '../InstallAppGuide';

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

type PracticePerson = {
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

type CcbSearchResult = {
  id: string;
  firstName?: string;
  lastName?: string;
  fullName?: string;
  email?: string;
  phone?: string;
};

const FAKE_ROSTER: PracticePerson[] = [
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

function responseKeyForQuestion(question: DynamicQuestion): QuestionResponseKey {
  return normalizeQuestionResponseKey(question.response_key);
}

function ccbResultToPerson(result: CcbSearchResult): PracticePerson {
  const nameParts = (result.fullName || '').trim().split(/\s+/).filter(Boolean);
  return {
    id: String(result.id),
    firstName: result.firstName || nameParts[0] || '',
    lastName: result.lastName || nameParts.slice(1).join(' ') || '',
    email: result.email || '',
    phone: result.phone || '',
  };
}

export default function OnboardingClient({
  groupId,
  leaderName,
  initialOnboarding,
  questions,
}: {
  groupId: string;
  leaderName: string;
  initialOnboarding: ToolkitOnboardingState;
  questions: DynamicQuestion[];
}) {
  const router = useRouter();
  const [onboarding, setOnboarding] = useState(initialOnboarding);
  const [installed, setInstalled] = useState(false);
  const [notificationSettings, setNotificationSettings] = useState<NotificationSettings | null>(null);
  const [permission, setPermission] = useState<NotificationPermission | 'unsupported'>('unsupported');
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Normalize response keys once, mirroring the real event form.
  const activeQuestions = useMemo(
    () => (questions ?? []).map((q) => ({ ...q, response_key: responseKeyForQuestion(q) })),
    [questions]
  );

  const [didNotMeet, setDidNotMeet] = useState(false);
  const [didNotMeetReason, setDidNotMeetReason] = useState('');
  const [didNotMeetReasonOther, setDidNotMeetReasonOther] = useState('');
  const [notes, setNotes] = useState('');
  const [dynamicValues, setDynamicValues] = useState<Record<string, DynamicValue>>({});
  const [optionFollowups, setOptionFollowups] = useState<Record<string, string>>({});

  // Practice roster = fake people plus anyone looked up in CCB (added locally,
  // never persisted). Manual guests are tracked separately with a "New" badge.
  const [practiceRoster, setPracticeRoster] = useState<PracticePerson[]>(FAKE_ROSTER);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(
    () => new Set(FAKE_ROSTER.slice(0, 4).map((person) => person.id))
  );
  const [manualAttendees, setManualAttendees] = useState<ManualAttendee[]>([]);

  // Add-someone panel state (mirrors the real form's roster-add flow).
  const [addOpen, setAddOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<CcbSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [manualForm, setManualForm] = useState<ManualAttendee>({ firstName: '', lastName: '', phone: '', email: '' });
  const [editingManualIdx, setEditingManualIdx] = useState<number | null>(null);
  const searchRequestId = useRef(0);

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
    setInstalled(isStandaloneApp());
    setPermission('Notification' in window ? Notification.permission : 'unsupported');

    const onInstalled = () => setInstalled(true);
    window.addEventListener('appinstalled', onInstalled);
    window.addEventListener('pwaInstalled', onInstalled);
    return () => {
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

  // Live CCB lookup for the practice roster-add flow. Read-only search against
  // the real endpoint — picking a result adds them locally, nothing is saved.
  useEffect(() => {
    if (!addOpen || editingManualIdx !== null) return;
    const q = searchQuery.trim();
    if (q.length < 2) {
      searchRequestId.current += 1;
      setSearchResults([]);
      setSearching(false);
      return;
    }

    const requestId = searchRequestId.current + 1;
    searchRequestId.current = requestId;
    setSearching(true);

    const timer = setTimeout(async () => {
      try {
        const res = await fetch('/api/circle-leader-toolkit/roster/search', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query: q }),
        });
        const data = await res.json();
        if (searchRequestId.current === requestId) {
          setSearchResults(data.results || []);
        }
      } catch {
        if (searchRequestId.current === requestId) setSearchResults([]);
      } finally {
        if (searchRequestId.current === requestId) setSearching(false);
      }
    }, 250);

    return () => clearTimeout(timer);
  }, [addOpen, editingManualIdx, searchQuery]);

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

  const allSelected = practiceRoster.length > 0 && selectedIds.size === practiceRoster.length;
  const totalAttendees = selectedIds.size + manualAttendees.length;
  const visibleQuestions = activeQuestions.filter(
    (q) => (didNotMeet && q.show_when_did_not_meet) || (!didNotMeet && q.show_when_attended)
  );

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
      prev.size === practiceRoster.length ? new Set() : new Set(practiceRoster.map((person) => person.id))
    );
  }

  function addFromCcb(result: CcbSearchResult) {
    if (!result.id) return;
    const person = ccbResultToPerson(result);
    setPracticeRoster((prev) => (prev.some((p) => p.id === person.id) ? prev : [...prev, person]));
    setSelectedIds((prev) => new Set(prev).add(person.id));
    setAddOpen(false);
    setSearchQuery('');
    setSearchResults([]);
  }

  function addManual() {
    const trimmed = {
      firstName: manualForm.firstName.trim(),
      lastName: manualForm.lastName.trim(),
      phone: manualForm.phone.trim(),
      email: manualForm.email.trim(),
    };
    if (!trimmed.firstName || !trimmed.lastName || !trimmed.phone || !trimmed.email) {
      setError('First name, last name, cell phone, and email are required for a new person.');
      return;
    }
    if (editingManualIdx !== null) {
      const idx = editingManualIdx;
      setManualAttendees((prev) => prev.map((m, i) => (i === idx ? trimmed : m)));
    } else {
      setManualAttendees((prev) => [...prev, trimmed]);
    }
    setManualForm({ firstName: '', lastName: '', phone: '', email: '' });
    setEditingManualIdx(null);
    setAddOpen(false);
    setError(null);
  }

  function removeManual(idx: number) {
    setManualAttendees((prev) => prev.filter((_, i) => i !== idx));
    if (editingManualIdx === idx) {
      setEditingManualIdx(null);
      setManualForm({ firstName: '', lastName: '', phone: '', email: '' });
      setAddOpen(false);
    }
  }

  function startEditManual(idx: number) {
    const m = manualAttendees[idx];
    if (!m) return;
    setManualForm({ firstName: m.firstName, lastName: m.lastName, phone: m.phone, email: m.email });
    setEditingManualIdx(idx);
    setAddOpen(true);
  }

  function cancelManualForm() {
    setManualForm({ firstName: '', lastName: '', phone: '', email: '' });
    setEditingManualIdx(null);
    setAddOpen(false);
    setSearchQuery('');
    setSearchResults([]);
  }

  function getQuestionValue(question: DynamicQuestion): DynamicValue | undefined {
    const key = responseKeyForQuestion(question);
    if (key === DID_NOT_MEET_REASON_KEY) return didNotMeetReason;
    if (key === DID_NOT_MEET_NOTES_KEY) return notes;
    return dynamicValues[question.id];
  }

  function setQuestionValue(question: DynamicQuestion, value: DynamicValue) {
    const key = responseKeyForQuestion(question);
    if (key === DID_NOT_MEET_REASON_KEY) {
      const nextValue = dynamicValueToString(value);
      const selectedOption = getSelectedOption(question, nextValue);
      setDidNotMeetReason(nextValue);
      if (!selectedOption?.followup_label && !selectedOption?.followup_required) {
        setDidNotMeetReasonOther('');
      }
      return;
    }
    if (key === DID_NOT_MEET_NOTES_KEY) {
      setNotes(dynamicValueToString(value));
      return;
    }
    setDynamicValues((prev) => ({ ...prev, [question.id]: value }));
  }

  function getOptionFollowupText(question: DynamicQuestion, option: DynamicQuestionOption): string {
    if (responseKeyForQuestion(question) === DID_NOT_MEET_REASON_KEY) {
      return didNotMeetReasonOther;
    }
    return optionFollowups[optionFollowupKey(question.id, option.value)] || '';
  }

  function setOptionFollowupText(question: DynamicQuestion, optionValue: string, text: string) {
    if (responseKeyForQuestion(question) === DID_NOT_MEET_REASON_KEY) {
      setDidNotMeetReasonOther(text);
      return;
    }
    setOptionFollowups((prev) => ({
      ...prev,
      [optionFollowupKey(question.id, optionValue)]: text,
    }));
  }

  function missingRequiredFollowup(question: DynamicQuestion): string | null {
    const selectedOptions = getSelectedOptions(question, getQuestionValue(question));
    for (const option of selectedOptions) {
      if (!option.followup_required) continue;
      if (!getOptionFollowupText(question, option).trim()) {
        return option.followup_label || `${option.label} details`;
      }
    }
    return null;
  }

  function finalDidNotMeetReason() {
    const reasonQuestion = activeQuestions.find(
      (question) => responseKeyForQuestion(question) === DID_NOT_MEET_REASON_KEY
    );
    const selectedOption = reasonQuestion ? getSelectedOption(reasonQuestion, didNotMeetReason) : null;
    const followup = didNotMeetReasonOther.trim();

    if (selectedOption?.followup_label || selectedOption?.followup_required) {
      return followup || selectedOption.label;
    }
    if (didNotMeetReason === DID_NOT_MEET_OTHER_VALUE || didNotMeetReason === 'Other') {
      return followup || selectedOption?.label || 'Other';
    }
    return didNotMeetReason.trim();
  }

  async function submitPracticeSummary() {
    setError(null);

    if (didNotMeet) {
      const reason = finalDidNotMeetReason();
      if (!reason) {
        setError('Please tell us why your Circle did not meet.');
        return;
      }
    }

    for (const q of activeQuestions) {
      const visible = (didNotMeet && q.show_when_did_not_meet) || (!didNotMeet && q.show_when_attended);
      if (visible && q.required) {
        const v = getQuestionValue(q);
        const empty =
          v === undefined || v === null || v === '' || (Array.isArray(v) && v.length === 0);
        if (empty) {
          setError(`Please answer: "${q.label}"`);
          return;
        }
      }
      const missingFollowupLabel = visible ? missingRequiredFollowup(q) : null;
      if (missingFollowupLabel) {
        setError(`Please answer: "${missingFollowupLabel}"`);
        return;
      }
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

        {message && <div className="cs-alert cs-alert-info">{message}</div>}
        {error && <div className="cs-alert cs-alert-error">{error}</div>}

        {activeStep === 1 && (
          <section className="cs-card space-y-4">
            <div className="cs-step mb-0">
              <span className="cs-step-num">1</span>
              <span className="cs-step-title">Add this to your Home Screen</span>
            </div>
            <p className="text-sm leading-relaxed text-neutral-600">
              The Toolkit works best as an app. Adding it to your Home Screen keeps your summary,
              roster, messages, and resources one tap away — and it&apos;s what lets notifications work
              on iPhone and iPad.
            </p>

            <InstallAppGuide />

            {installed ? (
              <button
                type="button"
                onClick={() => markStep('home_screen', 'complete')}
                disabled={busy !== null}
                className="cs-btn cs-btn-primary w-full disabled:opacity-50"
              >
                Continue
              </button>
            ) : (
              <div className="grid gap-2 sm:grid-cols-2">
                <button
                  type="button"
                  onClick={() => markStep('home_screen', 'complete')}
                  disabled={busy !== null}
                  className="cs-btn cs-btn-outline disabled:opacity-50"
                >
                  I&apos;ve added it
                </button>
                <button
                  type="button"
                  onClick={() => markStep('home_screen', 'dismiss')}
                  disabled={busy !== null}
                  className="cs-btn cs-btn-ghost disabled:opacity-50"
                >
                  Skip for now
                </button>
              </div>
            )}
            <p className="text-xs leading-relaxed text-neutral-400">
              Already added it? Open <strong className="font-semibold text-neutral-500">Circles</strong> from
              your Home Screen and this step finishes on its own.
            </p>
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
                <span className="cs-step-title">Try a Circle summary</span>
              </div>
              <p className="text-sm leading-relaxed text-neutral-600">
                This is a practice run. You can look someone up in CCB or add a guest by hand, and
                the questions are the real ones your team asks. Nothing here is saved or submitted
                to CCB, your ACPD, or the RADIUS database.
              </p>
            </div>

            {/* Step 1 — Did your Circle meet? */}
            <div className="cs-card">
              <label className="flex items-center justify-between gap-4 cursor-pointer">
                <div className="flex items-center gap-3 min-w-0">
                  <span className="cs-step-num shrink-0">1</span>
                  <div>
                    <div className="font-semibold text-neutral-900">Did your Circle meet?</div>
                    <div className="text-xs text-neutral-500 mt-0.5">
                      Practice event · Tuesday, 7:00 PM
                    </div>
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

            {!didNotMeet && (
              /* Step 2 — Who came? (roster + add flow) */
              <div className="cs-card">
                <div className="cs-step mb-4">
                  <span className="cs-step-num">2</span>
                  <span className="cs-step-title">Who came?</span>
                </div>

                <div className="space-y-1 mb-4">
                  {practiceRoster.length > 0 && (
                    <div className="flex items-center gap-2.5 py-0.5 border-b border-neutral-200 mb-1 pb-2">
                      <input
                        type="checkbox"
                        className="cs-check"
                        checked={allSelected}
                        onChange={toggleAll}
                        aria-label="Select all"
                      />
                      <label className="flex-1 min-w-0 cursor-pointer" onClick={toggleAll}>
                        <span className="text-sm font-semibold text-neutral-600">Select all</span>
                      </label>
                    </div>
                  )}
                  {practiceRoster.map((person) => {
                    const fullName = `${person.firstName} ${person.lastName}`.trim();
                    const contact = [person.phone, person.email].filter(Boolean).join(' · ');
                    return (
                      <div key={person.id} className="flex items-start gap-2.5 py-1">
                        <input
                          type="checkbox"
                          className="cs-check mt-0.5"
                          checked={selectedIds.has(person.id)}
                          onChange={() => togglePerson(person.id)}
                          aria-label={fullName}
                        />
                        <label
                          className="flex-1 min-w-0 cursor-pointer"
                          onClick={() => togglePerson(person.id)}
                        >
                          <span className="block truncate text-sm font-medium">{fullName}</span>
                          {contact && <span className="text-xs text-neutral-400">{contact}</span>}
                        </label>
                      </div>
                    );
                  })}
                  {manualAttendees.map((person, index) => (
                    <div key={`m-${index}`} className="flex items-center gap-2.5 py-1 pl-[34px]">
                      <span className="flex-1 min-w-0 text-sm font-medium truncate">
                        {person.firstName} {person.lastName}
                        {(person.phone || person.email) && (
                          <span className="text-xs text-neutral-400 ml-1.5 font-normal">
                            {[person.phone, person.email].filter(Boolean).join(' · ')}
                          </span>
                        )}
                      </span>
                      <span className="cs-badge cs-badge-new text-[10px] shrink-0">New</span>
                      <button
                        type="button"
                        onClick={() => startEditManual(index)}
                        className="inline-flex items-center justify-center w-7 h-7 rounded-md text-[color:var(--cs-green-dark)] hover:bg-[color:var(--cs-bg-soft)] shrink-0 transition-colors"
                        aria-label={`Edit ${person.firstName} ${person.lastName}`}
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5">
                          <path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L4 13.172V16h2.828l7.379-7.379-2.828-2.828z" />
                        </svg>
                      </button>
                      <button
                        type="button"
                        onClick={() => removeManual(index)}
                        className="inline-flex items-center justify-center w-7 h-7 rounded-md text-red-500 hover:bg-red-50 shrink-0 transition-colors"
                        aria-label={`Remove ${person.firstName} ${person.lastName}`}
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5">
                          <path fillRule="evenodd" d="M4 10a1 1 0 011-1h10a1 1 0 110 2H5a1 1 0 01-1-1z" clipRule="evenodd" />
                        </svg>
                      </button>
                    </div>
                  ))}
                </div>

                {!addOpen ? (
                  <div className="space-y-2">
                    <p className="text-xs leading-relaxed text-neutral-500">
                      Please report everyone who attended your Circle. First-time guests and one-time
                      guests count too, so add them here even if they aren&apos;t on your regular roster yet.
                    </p>
                    <button
                      type="button"
                      onClick={() => setAddOpen(true)}
                      className="cs-btn cs-btn-outline w-full"
                    >
                      + Add someone to my Circle
                    </button>
                  </div>
                ) : (
                  <div className="rounded-lg border border-[color:var(--cs-border)] bg-[color:var(--cs-bg-soft)] p-4 space-y-3">
                    {editingManualIdx !== null ? (
                      <p className="text-sm font-semibold text-neutral-700">Edit practice guest</p>
                    ) : (
                      <>
                        <div className="cs-search-field">
                          <label className="cs-search-field-label" htmlFor="cs-practice-search">
                            Search by full or partial name or by phone number
                          </label>
                          <input
                            id="cs-practice-search"
                            type="text"
                            placeholder="Start typing a name or phone number..."
                            className="cs-input"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                          />
                        </div>
                        {searchQuery.trim().length >= 2 && (
                          <div className={`cs-search-results-shell${searching ? ' is-searching' : ''}`}>
                            {searchResults.length > 0 ? (
                              <div className="cs-search-results-list">
                                {searchResults.slice(0, 8).map((r) => (
                                  <button
                                    key={r.id}
                                    type="button"
                                    onClick={() => addFromCcb(r)}
                                    className="cs-search-result-item"
                                  >
                                    <div className="font-semibold text-neutral-900">
                                      {r.fullName || `${r.firstName || ''} ${r.lastName || ''}`.trim()}
                                    </div>
                                    {(r.email || r.phone) && (
                                      <div className="text-xs text-neutral-500">
                                        {[r.phone, r.email].filter(Boolean).join(' • ')}
                                      </div>
                                    )}
                                  </button>
                                ))}
                              </div>
                            ) : (
                              <div className="cs-search-results-empty">
                                {searching ? 'Searching...' : 'No matching people found'}
                              </div>
                            )}
                            {searching && searchResults.length > 0 && (
                              <div className="cs-search-results-status">Updating...</div>
                            )}
                          </div>
                        )}
                        <div className="cs-divider">Person not in our system?</div>
                        <p className="text-xs text-neutral-500 -mt-1">
                          Fill in their info to add them to this practice event.
                        </p>
                      </>
                    )}
                    <div className="grid grid-cols-2 gap-2">
                      <div className="flex flex-col gap-1">
                        <label className="text-xs font-medium text-neutral-600">
                          First name <span className="text-red-500">*</span>
                        </label>
                        <input
                          type="text"
                          className="cs-input"
                          required
                          value={manualForm.firstName}
                          onChange={(e) => setManualForm((m) => ({ ...m, firstName: e.target.value }))}
                        />
                      </div>
                      <div className="flex flex-col gap-1">
                        <label className="text-xs font-medium text-neutral-600">
                          Last name <span className="text-red-500">*</span>
                        </label>
                        <input
                          type="text"
                          className="cs-input"
                          required
                          value={manualForm.lastName}
                          onChange={(e) => setManualForm((m) => ({ ...m, lastName: e.target.value }))}
                        />
                      </div>
                      <div className="flex flex-col gap-1">
                        <label className="text-xs font-medium text-neutral-600">
                          Cell phone <span className="text-red-500">*</span>
                        </label>
                        <input
                          type="tel"
                          className="cs-input"
                          required
                          value={manualForm.phone}
                          onChange={(e) => setManualForm((m) => ({ ...m, phone: e.target.value }))}
                        />
                      </div>
                      <div className="flex flex-col gap-1">
                        <label className="text-xs font-medium text-neutral-600">
                          Email <span className="text-red-500">*</span>
                        </label>
                        <input
                          type="email"
                          className="cs-input"
                          required
                          value={manualForm.email}
                          onChange={(e) => setManualForm((m) => ({ ...m, email: e.target.value }))}
                        />
                      </div>
                    </div>
                    <div className="flex gap-2 pt-1">
                      <button type="button" onClick={addManual} className="cs-btn cs-btn-primary flex-1">
                        {editingManualIdx !== null ? 'Save changes' : 'Add to my Circle'}
                      </button>
                      <button type="button" onClick={cancelManualForm} className="cs-btn cs-btn-ghost">
                        Cancel
                      </button>
                    </div>
                  </div>
                )}

                {totalAttendees > 0 && (
                  <div className="mt-4 inline-flex items-center gap-2 rounded-full bg-green-100 px-4 py-2 text-base font-semibold text-green-800 ring-1 ring-green-200">
                    <span className="text-lg">{totalAttendees}</span>
                    <span>{totalAttendees === 1 ? 'person' : 'people'} marked present</span>
                  </div>
                )}
              </div>
            )}

            {/* Tell us more — the real admin-configured leader questions */}
            {visibleQuestions.length > 0 && (
              <div className="cs-card space-y-5">
                <div className="cs-step">
                  <span className="cs-step-num">{didNotMeet ? '2' : '3'}</span>
                  <span className="cs-step-title">Tell us more</span>
                </div>
                {visibleQuestions.map((q) => (
                  <DynamicQuestionField
                    key={q.id}
                    question={q}
                    value={getQuestionValue(q)}
                    getFollowupText={(optionValue) => {
                      const option = getQuestionOptions(q).find((o) => o.value === optionValue);
                      return option ? getOptionFollowupText(q, option) : '';
                    }}
                    onFollowupTextChange={(optionValue, text) =>
                      setOptionFollowupText(q, optionValue, text)
                    }
                    onChange={(v) => setQuestionValue(q, v)}
                  />
                ))}
              </div>
            )}

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
