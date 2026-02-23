'use client';

import { Suspense, useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { supabase } from '../../../lib/supabase';

function VerifyContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [error, setError] = useState('');
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

    // Listen for auth state changes - Supabase will automatically process the URL hash
    const { data: authListener } = supabase.auth.onAuthStateChange(async (event, session) => {
      console.log('🔍 Auth event:', event, session ? 'Session exists' : 'No session');

      if (event === 'SIGNED_IN' && session) {
        const userId = session.user?.id;
        const email = session.user?.email ?? '';

        console.log('✅ Signed in:', email);

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
      } else if (event === 'TOKEN_REFRESHED') {
        console.log('🔄 Token refreshed');
      }
    });

    // Also check for existing session (in case auth state change already fired)
    const checkExistingSession = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      
      if (session) {
        const userId = session.user?.id;
        const email = session.user?.email ?? '';

        console.log('✅ Existing session found:', email);

        // Verify user exists in our system
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
      } else {
        // No session yet, wait for auth state change or timeout
        setTimeout(() => {
          supabase.auth.getSession().then(({ data: { session } }) => {
            if (!session) {
              console.error('❌ No session after timeout');
              setError('Authentication timed out. Please try again.');
              setTimeout(() => router.replace('/login?error=auth_failed'), 2000);
            }
          });
        }, 3000);
      }
    };

    // Check after a brief delay to let URL hash processing complete
    setTimeout(checkExistingSession, 1000);

    return () => {
      authListener?.subscription.unsubscribe();
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex flex-col items-center justify-center gap-4">
      <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600" />
      <p className="text-sm text-gray-500 dark:text-gray-400">
        {error || 'Verifying your account…'}
      </p>
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
