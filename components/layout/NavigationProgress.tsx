'use client';

import { usePathname } from 'next/navigation';
import { useEffect, useState, useRef, useCallback } from 'react';

export default function NavigationProgress() {
  const pathname = usePathname();
  const [width, setWidth] = useState(0);
  const [opacity, setOpacity] = useState(1);
  const [active, setActive] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const startedRef = useRef(false);

  const clear = () => {
    if (timerRef.current) clearTimeout(timerRef.current);
  };

  const start = useCallback(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    clear();
    setOpacity(1);
    setActive(true);
    setWidth(12);

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
      const link = (e.target as HTMLElement).closest('a');
      if (
        link &&
        link.href &&
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

  // Finish when pathname changes
  useEffect(() => {
    finish();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  if (!active) return null;

  return (
    <div
      aria-hidden="true"
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        height: '2px',
        width: `${width}%`,
        opacity,
        background: 'linear-gradient(90deg, #4c6785 0%, #8da9c4 100%)',
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
  );
}
