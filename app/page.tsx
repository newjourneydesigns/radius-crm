'use client';

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '../contexts/AuthContext';
import AppLoadingScreen from '../components/layout/AppLoadingScreen';
import { getLastVisitedPage, isStandalonePWA } from '../lib/lastVisitedPage';

export default function Page() {
  const router = useRouter();
  const { loading, isAuthenticated } = useAuth();

  useEffect(() => {
    if (loading) return;
    if (!isAuthenticated()) {
      router.replace('/login');
      return;
    }
    // When launched as an installed PWA, reopen to the last page the user was
    // on; otherwise fall back to the default dashboard.
    const lastPage = isStandalonePWA() ? getLastVisitedPage() : null;
    router.replace(lastPage ?? '/event-summary-tracker');
  }, [router, loading, isAuthenticated]);

  return <AppLoadingScreen />;
}
