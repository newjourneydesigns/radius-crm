'use client';

import Image from 'next/image';
import { useRandomLoadingMessage } from '../../hooks/useRandomLoadingMessage';

interface AppLoadingScreenProps {
  fullScreen?: boolean;
  compact?: boolean;
}

export default function AppLoadingScreen({
  fullScreen = true,
  compact = false,
}: AppLoadingScreenProps) {
  const loadingMessage = useRandomLoadingMessage();

  return (
    <div
      className={fullScreen ? 'app-loading-screen' : 'app-loading-screen app-loading-screen-inline'}
      role="status"
      aria-live="polite"
      aria-label="Loading"
    >
      <div className={compact ? 'app-loading-content app-loading-content-compact' : 'app-loading-content'}>
        <div className="app-loading-mark-wrap" aria-hidden="true">
          <Image src="/icon-192x192.png" alt="" width={42} height={42} className="app-loading-mark" />
          <span className="app-loading-ring" />
        </div>
        <p
          key={loadingMessage}
          suppressHydrationWarning
          className="loading-message-build-in app-loading-message"
        >
          {loadingMessage}
        </p>
      </div>
    </div>
  );
}
