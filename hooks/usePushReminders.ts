'use client';

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';

// Registers this device for Web Push so timed Today items can notify the user
// even when the app is closed. Subscriptions are stored per device in
// user_push_subscriptions (RLS: own rows only); the today-push-reminders cron
// does the sending.

const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_WEB_PUSH_VAPID_PUBLIC_KEY || '';

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const output = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i++) output[i] = rawData.charCodeAt(i);
  return output;
}

async function getServiceWorkerRegistration(): Promise<ServiceWorkerRegistration | null> {
  if (!('serviceWorker' in navigator)) return null;
  try {
    return (await navigator.serviceWorker.getRegistration()) || null;
  } catch {
    return null;
  }
}

export function usePushReminders() {
  const [isSupported, setIsSupported] = useState(false);
  const [isSubscribed, setIsSubscribed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (typeof window === 'undefined') return;
      const supported = 'serviceWorker' in navigator && 'PushManager' in window
        && 'Notification' in window && Boolean(VAPID_PUBLIC_KEY);
      if (cancelled) return;
      setIsSupported(supported);
      if (!supported) return;

      const registration = await getServiceWorkerRegistration();
      const subscription = await registration?.pushManager.getSubscription();
      if (!cancelled) setIsSubscribed(Boolean(subscription));
    })();
    return () => { cancelled = true; };
  }, []);

  /** Subscribe this device. Assumes notification permission is already granted. */
  const enable = useCallback(async (): Promise<boolean> => {
    if (!VAPID_PUBLIC_KEY) return false;
    try {
      const registration = await getServiceWorkerRegistration();
      if (!registration) return false;

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return false;

      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY) as BufferSource,
      });
      const json = subscription.toJSON();
      if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) return false;

      const { error } = await supabase
        .from('user_push_subscriptions')
        .upsert({
          user_id: user.id,
          endpoint: json.endpoint,
          p256dh: json.keys.p256dh,
          auth: json.keys.auth,
          user_agent: navigator.userAgent.slice(0, 300),
          enabled: true,
          failure_count: 0,
          disabled_at: null,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'endpoint' });
      if (error) throw error;

      setIsSubscribed(true);
      return true;
    } catch (err) {
      console.error('Failed to enable push reminders:', err);
      return false;
    }
  }, []);

  /** Unsubscribe this device and remove its stored subscription. */
  const disable = useCallback(async (): Promise<void> => {
    try {
      const registration = await getServiceWorkerRegistration();
      const subscription = await registration?.pushManager.getSubscription();
      if (subscription) {
        await supabase.from('user_push_subscriptions').delete().eq('endpoint', subscription.endpoint);
        await subscription.unsubscribe();
      }
      setIsSubscribed(false);
    } catch (err) {
      console.error('Failed to disable push reminders:', err);
    }
  }, []);

  return { isSupported, isSubscribed, enable, disable };
}
