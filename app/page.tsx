'use client';

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '../contexts/AuthContext';

export default function Page() {
  const router = useRouter();
  const { loading, isAuthenticated } = useAuth();

  useEffect(() => {
    if (loading) return;
    router.replace(isAuthenticated() ? '/dashboard' : '/login');
  }, [router, loading, isAuthenticated]);

  return (
    <div className="flex items-center justify-center min-h-screen">
      <div className="flex flex-col items-center space-y-4">
        <div className="animate-spin rounded-full h-8 w-8 border-2 border-gray-300/30 border-t-blue-600"></div>
        <p className="text-sm text-gray-600 dark:text-gray-300">Checking session…</p>
      </div>
    </div>
  )
}
