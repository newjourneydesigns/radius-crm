'use client';

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '../contexts/AuthContext';
import AppLoadingScreen from '../components/layout/AppLoadingScreen';

export default function Page() {
  const router = useRouter();
  const { loading, isAuthenticated } = useAuth();

  useEffect(() => {
    if (loading) return;
    router.replace(isAuthenticated() ? '/event-summary-tracker' : '/login');
  }, [router, loading, isAuthenticated]);

  return <AppLoadingScreen />;
}
