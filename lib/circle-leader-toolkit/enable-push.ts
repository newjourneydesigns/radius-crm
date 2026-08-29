'use client';

// Turning on notifications means awaiting three browser APIs that are each
// allowed to stay pending forever, with no rejection and no timeout of their own:
//
//   • Notification.requestPermission() — never settles when the OS suppresses
//     the prompt (common in an iOS Home Screen app that was backgrounded).
//   • navigator.serviceWorker.ready — resolves only once a worker is active for
//     the page's scope. If none ever activates it simply stays pending.
//   • pushManager.subscribe() — stalls when the push service can't be reached.
//
// Any one of those left leaders staring at a "Working..." button with nothing
// happening and no way to recover. Every step below is time-boxed and reports
// which stage it's on, so the button always comes back with either a working
// subscription or a message that says what to do next.

import { detectInstallEnv } from './installEnv';

export type PushStage = 'permission' | 'service-worker' | 'subscribe' | 'saving';

export const PUSH_STAGE_LABEL: Record<PushStage, string> = {
  permission: 'Waiting for permission...',
  'service-worker': 'Setting up...',
  subscribe: 'Registering this device...',
  saving: 'Saving...',
};

/** Same stages, sized for a pill-width button. */
export const PUSH_STAGE_SHORT_LABEL: Record<PushStage, string> = {
  permission: 'Asking...',
  'service-worker': 'Setting up...',
  subscribe: 'Registering...',
  saving: 'Saving...',
};

const PERMISSION_TIMEOUT_MS = 45_000;
const SERVICE_WORKER_TIMEOUT_MS = 20_000;
const SUBSCRIBE_TIMEOUT_MS = 30_000;

const DENIED_MESSAGE =
  'Notifications are blocked for Circles. Turn them back on in your device settings, then try again.';
const PROMPT_STALLED_MESSAGE =
  'The permission prompt never appeared. Close Circles completely, reopen it from your Home Screen, and try again.';
const SERVICE_WORKER_TIMEOUT_MESSAGE =
  'Circles could not finish setting up notifications on this device. Close it completely, reopen it, and try again.';
const SUBSCRIBE_TIMEOUT_MESSAGE =
  'This device did not finish registering for notifications. Check your connection and try again.';
const KEY_MISSING_MESSAGE =
  'Notifications aren’t ready on the server yet. Wait a moment and try again.';

function urlBase64ToUint8Array(base64String: string) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  return Uint8Array.from(Array.from(rawData).map((char) => char.charCodeAt(0)));
}

function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(message)), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      }
    );
  });
}

/** Why this device can't do push at all — or null when it can. */
function environmentBlockedReason(): string | null {
  if (typeof window === 'undefined') return 'Notifications can only be turned on from your browser.';

  const env = detectInstallEnv();
  if (env.needsSafari) {
    return 'Open this link in Safari to turn on notifications — this browser can’t add Circles to your Home Screen.';
  }
  if (env.isIOS && !env.isStandalone) {
    return 'Add Circles to your Home Screen first (Share → Add to Home Screen). On iPhone and iPad, notifications only work from the installed app.';
  }
  if (!('Notification' in window) || !('serviceWorker' in navigator) || !('PushManager' in window)) {
    return 'This browser doesn’t support notifications. Try Safari on iPhone or iPad, or Chrome on Android.';
  }
  return null;
}

/**
 * Why push can't be turned on here, in words a leader can act on — or null when
 * it can. Checked before any prompt so the button never asks for something the
 * browser is incapable of granting.
 */
export function pushBlockedReason(publicKey: string | null | undefined): string | null {
  return environmentBlockedReason() || (publicKey ? null : KEY_MISSING_MESSAGE);
}

/** Read through a call so the live value is used, not a stale narrowed one. */
function currentPermission(): NotificationPermission {
  return Notification.permission;
}

/** Safari before 16 only supports the callback form and returns undefined. */
function requestPermission(): Promise<NotificationPermission> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const done = (result: NotificationPermission) => {
      if (settled) return;
      settled = true;
      resolve(result);
    };
    try {
      const maybePromise = Notification.requestPermission(done);
      if (maybePromise && typeof maybePromise.then === 'function') {
        maybePromise.then(done, reject);
      }
    } catch (err) {
      reject(err instanceof Error ? err : new Error('Could not ask for notification permission.'));
    }
  });
}

async function ensurePermission(
  onPermission?: (permission: NotificationPermission) => void
): Promise<void> {
  const existing = currentPermission();
  if (existing === 'granted' || existing === 'denied') {
    onPermission?.(existing);
    if (existing === 'denied') throw new Error(DENIED_MESSAGE);
    return;
  }

  let result: NotificationPermission;
  try {
    result = await withTimeout(requestPermission(), PERMISSION_TIMEOUT_MS, PROMPT_STALLED_MESSAGE);
  } catch {
    // The prompt never came back. The leader may still have answered it, so
    // trust the live permission value before giving up.
    result = currentPermission();
    if (result !== 'granted' && result !== 'denied') {
      throw new Error(PROMPT_STALLED_MESSAGE);
    }
  }

  onPermission?.(result);
  if (result === 'denied') throw new Error(DENIED_MESSAGE);
  if (result !== 'granted') {
    throw new Error('Notifications stay off until you choose Allow. Tap Enable notifications to try again.');
  }
}

/**
 * `navigator.serviceWorker.ready` never rejects, so pair it with a poll on the
 * registration we just made and give the whole wait a deadline.
 */
function waitForActiveWorker(
  registration: ServiceWorkerRegistration,
  timeoutMs: number
): Promise<ServiceWorkerRegistration> {
  return new Promise((resolve, reject) => {
    let done = false;
    const finish = (ready: ServiceWorkerRegistration) => {
      if (done) return;
      done = true;
      clearInterval(poll);
      clearTimeout(timer);
      resolve(ready);
    };
    const poll = setInterval(() => {
      if (registration.active) finish(registration);
    }, 250);
    const timer = setTimeout(() => {
      if (done) return;
      done = true;
      clearInterval(poll);
      reject(new Error(SERVICE_WORKER_TIMEOUT_MESSAGE));
    }, timeoutMs);

    navigator.serviceWorker.ready.then(finish).catch(() => null);
  });
}

async function activeRegistration(): Promise<ServiceWorkerRegistration> {
  const registration = await withTimeout(
    navigator.serviceWorker.register('/sw.js', { scope: '/' }),
    SERVICE_WORKER_TIMEOUT_MS,
    SERVICE_WORKER_TIMEOUT_MESSAGE
  );
  if (registration.active) return registration;
  return waitForActiveWorker(registration, SERVICE_WORKER_TIMEOUT_MS);
}

export type EnablePushOptions = {
  publicKey: string | null | undefined;
  /**
   * Fetches the VAPID key when it wasn't loaded yet. Called after the permission
   * prompt, never before: Safari only honours requestPermission() inside the
   * click that triggered it, and an await beforehand forfeits that gesture.
   */
  resolvePublicKey?: () => Promise<string | null | undefined>;
  onStage?: (stage: PushStage) => void;
  onPermission?: (permission: NotificationPermission) => void;
};

export type EnablePushResult = {
  subscription: PushSubscription;
  registration: ServiceWorkerRegistration;
};

/**
 * Ask for permission, make sure a service worker is active, and subscribe this
 * device to push. Throws with a message that tells the leader what to do next;
 * never hangs.
 */
export async function enablePushForThisDevice({
  publicKey,
  resolvePublicKey,
  onStage,
  onPermission,
}: EnablePushOptions): Promise<EnablePushResult> {
  const blocked = environmentBlockedReason();
  if (blocked) throw new Error(blocked);

  // Nothing may be awaited before this — the click's gesture has to survive.
  onStage?.('permission');
  await ensurePermission(onPermission);

  onStage?.('service-worker');
  const registration = await activeRegistration();

  const key = publicKey || (resolvePublicKey ? await resolvePublicKey() : null);
  if (!key) throw new Error(KEY_MISSING_MESSAGE);

  onStage?.('subscribe');
  const subscription = await withTimeout(
    (async () => {
      const existing = await registration.pushManager.getSubscription();
      if (existing) return existing;
      return registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(key),
      });
    })(),
    SUBSCRIBE_TIMEOUT_MS,
    SUBSCRIBE_TIMEOUT_MESSAGE
  );

  return { subscription, registration };
}
