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

    console.log('🔍 Verify page loaded, full URL:', window.location.href);
    console.log('🔍 URL search params:', Array.from(searchParams.entries()));
    console.log('🔍 URL hash:', window.location.hash);

    const verifyAuth = async () => {
      try {
        // With implicit flow, Supabase automatically processes URL hash on page load
        // Wait a moment for it to complete
        await new Promise(resolve => setTimeout(resolve, 1000));

        // Check if we have a session
        const { data: { session }, error: sessionError } = await supabase.auth.getSession();

        if (sessionError) {
          console.error('❌ Session error:', sessionError);
          setError('Authentication failed. Please try again.');
          setTimeout(() => router.replace('/login?error=auth_failed'), 2000);
          return;
        }

        if (!session) {
          console.log('⏳ No session yet, waiting for auth state change...');
          
          // Set up listener for auth state changes
          const { data: authListener } = supabase.auth.onAuthStateChange(async (event, newSession) => {
            console.log('🔍 Auth state change:', event);
            
            if (event === 'SIGNED_IN' && newSession) {
              await handleSession(newSession, next);
            }
          });

          // Timeout after 5 seconds
          setTimeout(async () => {
            const { data: { session: finalSession } } = await supabase.auth.getSession();
            if (!finalSession) {
              console.error('❌ No session after timeout');
              setError('Authentication timed out. Please try again.');
              setTimeout(() => router.replace('/login?error=auth_failed'), 2000);
            }
            authListener?.subscription.unsubscribe();
          }, 5000);

          return;
        }

        // We have a session, verify the user
        await handleSession(session, next);
      } catch (err) {
        console.error('❌ Unexpected error:', err);
        setError('An error occurred. Please try again.');
        setTimeout(() => router.replace('/login?error=auth_failed'), 2000);
      }
    };

    const handleSession = async (session: any, next: string) => {
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
    };

    verifyAuth();
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
