'use client';

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '../contexts/AuthContext';
import { getRandomLoadingMessage } from '../lib/loadingMessages';

export default function Page() {
  const router = useRouter();
  const { loading, isAuthenticated } = useAuth();
  const [loadingMessage] = useState(getRandomLoadingMessage);

  useEffect(() => {
    if (loading) return;
    router.replace(isAuthenticated() ? '/event-summary-tracker' : '/login');
  }, [router, loading, isAuthenticated]);

  return (
    <div className="flex items-center justify-center min-h-screen">
      <div className="flex flex-col items-center space-y-4">
        <div className="animate-spin rounded-full h-8 w-8 border-2 border-gray-300/30 border-t-blue-600"></div>
        <p suppressHydrationWarning className="text-sm text-gray-600 dark:text-gray-300">
          {loadingMessage}
        </p>
      </div>
    </div>
  )
}
