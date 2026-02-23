'use client';

import { Suspense, useEffect, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { supabase } from '../../../lib/supabase';

function VerifyContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const ran = useRef(false);

  useEffect(() => {
    // Guard against double-invocation in React strict mode
    if (ran.current) return;
    ran.current = true;

    const raw = searchParams.get('next') || '/dashboard';

    // Sanitise the redirect target
    let next = raw;
    if (!next.startsWith('/') || next.startsWith('//') || next.startsWith('/login') || next.startsWith('/auth')) {
      next = '/dashboard';
    }

    // With implicit flow, the session is automatically handled by Supabase client
    // from the URL hash. We just need to wait for it and verify the user.
    const checkSession = async () => {
      try {
        // Get the current session (should be set from URL hash)
        const { data: { session }, error: sessionError } = await supabase.auth.getSession();

        if (sessionError || !session) {
          console.error('❌ No session found:', sessionError?.message);
          router.replace('/login?error=auth_failed');
          return;
        }

        const userId = session.user?.id;
        const email = session.user?.email ?? '';

        console.log('✅ Session found for:', email);

        // Verify user exists in our system (invite-only)
        const { data: userProfile, error: profileError } = await supabase
          .from('users')
          .select('id, email, role')
          .eq('id', userId)
          .single();

        if (profileError || !userProfile) {
          console.warn('🚫 User not found in system:', email);
          await supabase.auth.signOut();
          router.replace('/login?error=unauthorized_user');
          return;
        }

        console.log('✅ User verified, redirecting to', next);
        router.replace(next);
      } catch (err) {
        console.error('❌ Unexpected verify error:', err);
        router.replace('/login?error=auth_failed');
      }
    };

    // Give the Supabase client a moment to process the URL hash
    const timer = setTimeout(checkSession, 500);
    return () => clearTimeout(timer);
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
