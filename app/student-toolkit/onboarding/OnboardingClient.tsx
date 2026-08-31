'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useInstallEnv } from '../../../lib/circle-leader-toolkit/installEnv';
import {
  enablePushForThisDevice,
  PUSH_STAGE_LABEL,
  type PushStage,
} from '../../../lib/circle-leader-toolkit/enable-push';
import type {
  ToolkitOnboardingAction,
  ToolkitOnboardingState,
  ToolkitOnboardingStep,
} from '../../../lib/student-toolkit/onboarding';

type NotificationSettings = {
  publicKey: string | null;
  pushSupported?: boolean;
  subscriptions?: Array<{ id: string; enabled: boolean; endpoint: string }>;
};

function isStandaloneApp() {
  if (typeof window === 'undefined') return false;
  const nav = window.navigator as Navigator & { standalone?: boolean };
  return window.matchMedia('(display-mode: standalone)').matches || nav.standalone === true;
}

function homeScreenResolved(state: ToolkitOnboardingState) {
  return Boolean(state.homeScreenCompletedAt || state.homeScreenDismissedAt);
}

function notificationsResolved(state: ToolkitOnboardingState) {
  return Boolean(state.notificationsCompletedAt || state.notificationsDismissedAt);
}

function rosterResolved(state: ToolkitOnboardingState) {
  return Boolean(state.rosterCompletedAt || state.rosterDismissedAt);
}

export default function OnboardingClient({
  leaderName,
  initialOnboarding,
  homeHref,
  rosterHref,
}: {
  leaderName: string;
  initialOnboarding: ToolkitOnboardingState;
  homeHref: string;
  rosterHref: string;
}) {
  const router = useRouter();
  const env = useInstallEnv();
  const [onboarding, setOnboarding] = useState(initialOnboarding);
  const [installed, setInstalled] = useState(false);
  const [notificationSettings, setNotificationSettings] = useState<NotificationSettings | null>(null);
  const [permission, setPermission] = useState<NotificationPermission | 'unsupported'>('unsupported');
  const [pushStage, setPushStage] = useState<PushStage | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const activeStep = useMemo(() => {
    if (!homeScreenResolved(onboarding)) return 1;
    if (!notificationsResolved(onboarding)) return 2;
    if (!rosterResolved(onboarding)) return 3;
    return 4;
  }, [onboarding]);

  const markStep = useCallback(
    async (step: ToolkitOnboardingStep, action: ToolkitOnboardingAction) => {
      setBusy(`${step}:${action}`);
      setError(null);
      try {
        const res = await fetch('/api/student-toolkit/onboarding/', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ step, action }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Could not update setup.');
        setOnboarding(data.onboarding);
        return data.onboarding as ToolkitOnboardingState;
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Could not update setup.');
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
    fetch('/api/student-toolkit/notifications/', { cache: 'no-store' })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!cancelled && data) setNotificationSettings(data);
      })
      .catch(() => null);
    return () => {
      cancelled = true;
    };
  }, []);

  // Say up front when this device can't turn notifications on. An iPhone in a
  // Safari tab can't, and tapping Enable there only produces a dead end.
  const pushBlocked = useMemo(() => {
    if (env.needsSafari) {
      return 'Open this link in Safari to turn on notifications — this browser can’t add the Student Toolkit to your Home Screen.';
    }
    if (env.isIOS && !env.isStandalone) {
      return 'Add the Student Toolkit to your Home Screen first. On iPhone and iPad, notifications only work from the installed app.';
    }
    if (permission === 'unsupported') {
      return 'This browser doesn’t support notifications. Try Safari on iPhone or iPad, or Chrome on Android.';
    }
    // Only a loaded settings response can tell us the key is genuinely missing;
    // a fetch still in flight is not a blocker.
    if (notificationSettings && !notificationSettings.publicKey) {
      return 'Notifications aren’t ready on the server yet. Skip this step — you can turn them on later.';
    }
    return null;
  }, [env, notificationSettings, permission]);

  async function enableNotifications() {
    setBusy('notifications:enable');
    setError(null);
    setPushStage('permission');
    let settings = notificationSettings;
    try {
      const { subscription } = await enablePushForThisDevice({
        publicKey: settings?.publicKey,
        // The settings fetch can still be in flight on a fresh setup. Load the
        // key on demand rather than telling the leader their browser is at fault.
        resolvePublicKey: async () => {
          settings = await fetch('/api/student-toolkit/notifications/', { cache: 'no-store' })
            .then((res) => (res.ok ? res.json() : null))
            .catch(() => null);
          if (settings) setNotificationSettings(settings);
          return settings?.publicKey;
        },
        onStage: setPushStage,
        onPermission: setPermission,
      });

      setPushStage('saving');
      const saveRes = await fetch('/api/student-toolkit/notifications/', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subscription: subscription.toJSON() }),
      });
      const saveData = await saveRes.json().catch(() => ({}));
      if (!saveRes.ok) throw new Error(saveData.error || 'Could not save this device.');

      await markStep('notifications', 'complete');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not turn on notifications.');
    } finally {
      setPushStage(null);
      setBusy(null);
    }
  }

  async function goToRoster() {
    try {
      await markStep('roster', 'complete');
      router.push(rosterHref);
    } catch {
      // markStep already surfaced the reason; stay put so they can retry.
    }
  }

  return (
    <>
      <header className="cs-hero px-6 py-10">
        <div className="max-w-2xl mx-auto">
          <p className="mb-1 text-xs font-bold uppercase text-white/75">Student Toolkit</p>
          <h1 className="cs-display text-4xl sm:text-5xl leading-tight">Get Set Up</h1>
          <p className="mt-1.5 text-white/90 font-semibold text-base truncate">{leaderName}</p>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-6 pb-14 space-y-4">
        <div className="flex items-center gap-2" aria-label="Setup progress">
          {[1, 2, 3].map((step) => (
            <div
              key={step}
              className={
                'st-progress-step' +
                (activeStep > step
                  ? ' st-progress-step-done'
                  : activeStep === step
                    ? ' st-progress-step-current'
                    : '')
              }
            />
          ))}
        </div>

        {error && <div className="cs-alert cs-alert-error">{error}</div>}

        {activeStep === 1 && (
          <section className="cs-card space-y-4">
            <div className="cs-step mb-0">
              <span className="cs-step-num">1</span>
              <span className="cs-step-title">Add this to your Home Screen</span>
            </div>
            <p className="text-sm leading-relaxed text-neutral-600">
              The Toolkit works best as an app. Adding it to your Home Screen keeps your students,
              messages, and resources one tap away — and it&apos;s what lets notifications work on
              iPhone and iPad.
            </p>

            <div className="rounded-2xl border border-[#34B233]/25 bg-[#34B233]/[0.06] p-4">
              {env.needsSafari ? (
                <p className="text-sm leading-relaxed text-neutral-700">
                  You&apos;re in an in-app browser. Tap the menu and choose{' '}
                  <strong className="font-bold text-neutral-900">Open in Safari</strong>, then come
                  back to this page to add it.
                </p>
              ) : env.isIOS ? (
                <p className="text-sm leading-relaxed text-neutral-700">
                  Tap <strong className="font-bold text-neutral-900">Share</strong>, then{' '}
                  <strong className="font-bold text-neutral-900">Add to Home Screen</strong>, then{' '}
                  <strong className="font-bold text-neutral-900">Add</strong>.
                </p>
              ) : (
                <p className="text-sm leading-relaxed text-neutral-700">
                  Open your browser menu and choose{' '}
                  <strong className="font-bold text-neutral-900">Install</strong> or{' '}
                  <strong className="font-bold text-neutral-900">Add to Home Screen</strong>.
                </p>
              )}
            </div>

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
              Already added it? Open{' '}
              <strong className="font-semibold text-neutral-500">Students</strong> from your Home
              Screen and this step finishes on its own.
            </p>
          </section>
        )}

        {activeStep === 2 && (
          <section className="cs-card space-y-4">
            <div className="cs-step mb-0">
              <span className="cs-step-num">2</span>
              <span className="cs-step-title">Turn on notifications</span>
            </div>
            <p className="text-sm leading-relaxed text-neutral-600">
              Notifications are how you hear about messages from your student pastor. You can change
              this later in Settings.
            </p>
            {permission === 'denied' ? (
              <div className="cs-alert cs-alert-warning">
                Notifications are blocked for this app. Turn them back on in your device settings, or
                skip this step and come back to it in Settings.
              </div>
            ) : (
              pushBlocked && <div className="cs-alert cs-alert-warning">{pushBlocked}</div>
            )}
            <div className="grid gap-2 sm:grid-cols-2">
              <button
                type="button"
                onClick={enableNotifications}
                disabled={busy !== null || permission === 'denied' || pushBlocked !== null}
                className="cs-btn cs-btn-primary disabled:opacity-50"
              >
                {busy === 'notifications:enable'
                  ? PUSH_STAGE_LABEL[pushStage ?? 'permission']
                  : 'Turn on notifications'}
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
          <section className="cs-card space-y-4">
            <div className="cs-step mb-0">
              <span className="cs-step-num">3</span>
              <span className="cs-step-title">Add the students you lead</span>
            </div>
            <p className="text-sm leading-relaxed text-neutral-600">
              Your roster is the list of students in your group. Everything else in the Toolkit is
              built around it, so this is the one thing worth doing before you close this.
            </p>
            <button
              type="button"
              onClick={goToRoster}
              disabled={busy !== null}
              className="cs-btn cs-btn-primary w-full disabled:opacity-50"
            >
              {busy === 'roster:complete' ? 'Opening…' : 'Build my roster'}
            </button>
            <button
              type="button"
              onClick={() => markStep('roster', 'dismiss')}
              disabled={busy !== null}
              className="cs-btn cs-btn-ghost w-full disabled:opacity-50"
            >
              I&apos;ll do this later
            </button>
          </section>
        )}

        {activeStep === 4 && (
          <section className="cs-card text-center space-y-4">
            <h2 className="cs-step-title">You&apos;re set up</h2>
            <p className="text-sm leading-relaxed text-neutral-600">
              You can add students and change your notification settings any time from the Toolkit.
            </p>
            <Link href={rosterHref} className="cs-btn cs-btn-primary w-full">
              Build my roster
            </Link>
            <Link href={homeHref} className="cs-btn cs-btn-ghost w-full">
              Go to my home page
            </Link>
          </section>
        )}
      </main>
    </>
  );
}
