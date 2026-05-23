'use client';

import { useEffect, useState } from 'react';
import { getRandomLoadingMessage } from '../lib/loadingMessages';

export function useRandomLoadingMessage(): string {
  const [loadingMessage, setLoadingMessage] = useState('');

  useEffect(() => {
    setLoadingMessage(getRandomLoadingMessage());
  }, []);

  return loadingMessage;
}
