'use client';

import { Suspense, useEffect, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { supabase } from '../../../lib/supabase';

const ALLOWED_DOMAIN = 'valleycreek.org';

function VerifyContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const ran = useRef(false);

  useEffect(() => {
    // Guard against double-invocation in React strict mode
    if (ran.current) return;
    ran.current = true;

    const code = searchParams.get('code');
    const raw = searchParams.get('next') || '/dashboard';

    // Sanitise the redirect target
    let next = raw;
    if (!next.startsWith('/') || next.startsWith('//') || next.startsWith('/login') || next.startsWith('/auth')) {
      next = '/dashboard';
    }

    if (!code) {
      router.replace('/login');
      return;
    }

    supabase.auth
      .exchangeCodeForSession(code)
      .then(async ({ data, error }) => {
        if (error || !data.session) {
          console.error('❌ Code exchange failed:', error?.message);
          router.replace('/login?error=auth_failed');
          return;
        }

        const email = data.session.user?.email ?? '';
        if (!email.toLowerCase().endsWith(`@${ALLOWED_DOMAIN}`)) {
          console.warn('🚫 Unauthorized domain:', email);
          await supabase.auth.signOut();
          router.replace('/login?error=unauthorized_domain');
          return;
        }

        console.log('✅ Domain verified, redirecting to', next);
        router.replace(next);
      })
      .catch((err) => {
        console.error('❌ Unexpected verify error:', err);
        router.replace('/login?error=auth_failed');
      });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex flex-col items-center justify-center gap-4">
      <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600" />
      <p className="text-sm text-gray-500 dark:text-gray-400">Verifying your account…</p>
    </div>
  );
}

export default function VerifyPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600" />
        </div>
      }
    >
      <VerifyContent />
    </Suspense>
  );
}
