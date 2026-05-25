'use client';

import { useEffect, useState } from 'react';
import { getRandomLoadingMessage } from '../lib/loadingMessages';

export function useRandomLoadingMessage(intervalMs = 4200): string {
  const [loadingMessage, setLoadingMessage] = useState('');

  useEffect(() => {
    setLoadingMessage(getRandomLoadingMessage());

    if (intervalMs <= 0) return;

    const interval = window.setInterval(() => {
      setLoadingMessage(getRandomLoadingMessage());
    }, intervalMs);

    return () => window.clearInterval(interval);
  }, [intervalMs]);

  return loadingMessage;
}
