'use client';

import { usePathname } from 'next/navigation';
import { useEffect, useState, useRef, useCallback } from 'react';
import AppLoadingScreen from './AppLoadingScreen';

export default function NavigationProgress() {
  const pathname = usePathname();
  const [width, setWidth] = useState(0);
  const [opacity, setOpacity] = useState(1);
  const [active, setActive] = useState(false);
  const [showOverlay, setShowOverlay] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const overlayTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const startedRef = useRef(false);

  const clear = () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    if (overlayTimerRef.current) clearTimeout(overlayTimerRef.current);
  };

  const start = useCallback(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    clear();
    setOpacity(1);
    setActive(true);
    setWidth(12);
    setShowOverlay(false);

    overlayTimerRef.current = setTimeout(() => {
      setShowOverlay(true);
    }, 450);

    timerRef.current = setTimeout(() => {
      setWidth(35);
      timerRef.current = setTimeout(() => {
        setWidth(58);
        timerRef.current = setTimeout(() => {
          setWidth(75);
          timerRef.current = setTimeout(() => {
            setWidth(88);
          }, 600);
        }, 400);
      }, 300);
    }, 120);
  }, []);

  const finish = useCallback(() => {
    if (!startedRef.current) return;
    startedRef.current = false;
    clear();
    setShowOverlay(false);
    setWidth(100);
    timerRef.current = setTimeout(() => {
      setOpacity(0);
      timerRef.current = setTimeout(() => {
        setActive(false);
        setWidth(0);
        setOpacity(1);
      }, 300);
    }, 180);
  }, []);

  // Start on internal link click
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) {
        return;
      }

      const link = (e.target as HTMLElement).closest('a');
      if (
        link &&
        link.href &&
        !link.hasAttribute('download') &&
        (!link.target || link.target === '_self') &&
        !link.href.startsWith('#') &&
        !link.href.startsWith('mailto:') &&
        !link.href.startsWith('tel:') &&
        link.origin === window.location.origin &&
        link.pathname !== window.location.pathname
      ) {
        start();
      }
    };
    document.addEventListener('click', handleClick);
    return () => document.removeEventListener('click', handleClick);
  }, [start]);

  // Catch programmatic router.push/router.replace calls that use the History API.
  useEffect(() => {
    const originalPushState = window.history.pushState;
    const originalReplaceState = window.history.replaceState;

    const shouldStartForUrl = (url?: string | URL | null) => {
      if (!url) return false;
      try {
        const next = new URL(url, window.location.href);
        return next.origin === window.location.origin && next.pathname !== window.location.pathname;
      } catch {
        return false;
      }
    };

    window.history.pushState = function pushState(...args) {
      if (shouldStartForUrl(args[2])) start();
      return originalPushState.apply(this, args);
    };

    window.history.replaceState = function replaceState(...args) {
      if (shouldStartForUrl(args[2])) start();
      return originalReplaceState.apply(this, args);
    };

    return () => {
      window.history.pushState = originalPushState;
      window.history.replaceState = originalReplaceState;
    };
  }, [start]);

  // Finish when pathname changes
  useEffect(() => {
    finish();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  if (!active) return null;

  return (
    <>
      {showOverlay && <AppLoadingScreen />}
      <div
        aria-hidden="true"
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          height: '2px',
          width: `${width}%`,
          opacity,
          background: 'linear-gradient(90deg, #52525b 0%, #a1a1aa 100%)',
          boxShadow: '0 0 10px rgba(141, 169, 196, 0.55)',
          borderRadius: '0 2px 2px 0',
          zIndex: 100001,
          pointerEvents: 'none',
          transition:
            width === 100
              ? 'width 0.2s ease-out'
              : 'width 0.45s cubic-bezier(0.4, 0, 0.2, 1)',
        }}
      />
    </>
  );
}
