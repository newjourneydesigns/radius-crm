'use client';

// Detects how the Circle Leader Toolkit is being viewed so we can show the
// right "Add to Home Screen" instructions. The hard cases we care about:
//   • iOS only exposes Web Push to a Home-Screen-installed PWA, never a Safari
//     tab — so an un-installed iPhone always needs the install steps.
//   • Leaders arrive via a magic link in email/text, which often opens inside
//     an in-app browser (Gmail, Messages, Instagram) or a non-Safari iOS
//     browser where "Add to Home Screen" either doesn't exist or won't produce
//     a working app. Those users must open the link in Safari first.
//   • Android/desktop Chrome & Edge fire `beforeinstallprompt`, captured in the
//     root layout as `window.installPWA()` — a genuine one-tap install.

import { useEffect, useState } from 'react';

export type InstallPlatform = 'ios' | 'android' | 'desktop';

export type InstallEnv = {
  platform: InstallPlatform;
  /** Already running as the installed app (standalone display) — nothing to do. */
  isStandalone: boolean;
  isIOS: boolean;
  isAndroid: boolean;
  /** Real Safari on iOS — the browser that can Add to Home Screen. */
  isIosSafari: boolean;
  /** iOS, not installed, and NOT Safari (in-app browser or Chrome/Firefox iOS): must open in Safari first. */
  needsSafari: boolean;
  /** A native install prompt (beforeinstallprompt) is available right now. */
  canPrompt: boolean;
};

// Known in-app browser / embedded-webview signatures (they can't install a PWA).
const IN_APP_TOKENS =
  /FBAN|FBAV|FBIOS|Instagram|Line\/|Twitter|LinkedInApp|Snapchat|WhatsApp|GSA\/|MicroMessenger|Pinterest/i;
// Non-Safari browsers on iOS — all WebKit, but the install path is Safari-only.
const IOS_OTHER_BROWSERS = /CriOS|FxiOS|EdgiOS|OPiOS|mercury/i;

type PwaWindow = Window & {
  installPWA?: () => void;
  deferredPrompt?: unknown;
  __radiusPwaInstallAvailable?: boolean;
};

const EMPTY_ENV: InstallEnv = {
  platform: 'desktop',
  isStandalone: false,
  isIOS: false,
  isAndroid: false,
  isIosSafari: false,
  needsSafari: false,
  canPrompt: false,
};

function detectStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  const nav = window.navigator as Navigator & { standalone?: boolean };
  const displayStandalone = window.matchMedia?.('(display-mode: standalone)').matches ?? false;
  return displayStandalone || nav.standalone === true;
}

export function detectInstallEnv(): InstallEnv {
  if (typeof window === 'undefined') return EMPTY_ENV;

  const ua = window.navigator.userAgent || '';
  const nav = window.navigator as Navigator & { maxTouchPoints?: number; platform?: string };
  // iPadOS 13+ reports a desktop Mac UA; the touch-point check catches it.
  const isIOS =
    /iPad|iPhone|iPod/.test(ua) || (nav.platform === 'MacIntel' && (nav.maxTouchPoints || 0) > 1);
  const isAndroid = /Android/i.test(ua);
  const isStandalone = detectStandalone();

  const isSafariEngine =
    /Safari/.test(ua) && !IOS_OTHER_BROWSERS.test(ua) && !IN_APP_TOKENS.test(ua);
  const isIosSafari = isIOS && isSafariEngine;
  const needsSafari = isIOS && !isStandalone && !isIosSafari;

  const pwaWindow = window as PwaWindow;
  const canPrompt = Boolean(pwaWindow.__radiusPwaInstallAvailable || pwaWindow.deferredPrompt);

  const platform: InstallPlatform = isIOS ? 'ios' : isAndroid ? 'android' : 'desktop';

  return { platform, isStandalone, isIOS, isAndroid, isIosSafari, needsSafari, canPrompt };
}

/** Fire the captured native install prompt. Returns false if none is available. */
export function promptInstall(): boolean {
  if (typeof window === 'undefined') return false;
  const pwaWindow = window as PwaWindow;
  if (pwaWindow.installPWA && (pwaWindow.__radiusPwaInstallAvailable || pwaWindow.deferredPrompt)) {
    pwaWindow.installPWA();
    return true;
  }
  return false;
}

/**
 * Reactive install environment. Starts empty for SSR/first paint (so server and
 * client markup match), then resolves on mount and updates when the native
 * prompt arrives or the app gets installed.
 */
export function useInstallEnv(): InstallEnv {
  const [env, setEnv] = useState<InstallEnv>(EMPTY_ENV);

  useEffect(() => {
    const update = () => setEnv(detectInstallEnv());
    update();

    const mq = window.matchMedia?.('(display-mode: standalone)');
    window.addEventListener('pwaInstallAvailable', update);
    window.addEventListener('pwaInstalled', update);
    window.addEventListener('appinstalled', update);
    mq?.addEventListener?.('change', update);

    return () => {
      window.removeEventListener('pwaInstallAvailable', update);
      window.removeEventListener('pwaInstalled', update);
      window.removeEventListener('appinstalled', update);
      mq?.removeEventListener?.('change', update);
    };
  }, []);

  return env;
}
