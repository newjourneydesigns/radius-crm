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

    console.log('🔍 Verify page loaded');
    console.log('🔍 URL params:', Array.from(searchParams.entries()));

    const verifyAuth = async () => {
      try {
        // With PKCE flow and detectSessionInUrl enabled, Supabase automatically
        // detects auth codes in the URL and exchanges them for a session.
        // We just need to wait for it to complete and then verify the user.
        
        // Listen for auth state changes
        const { data: authListener } = supabase.auth.onAuthStateChange(async (event, session) => {
          console.log('🔍 Auth state change:', event);
          
          if (event === 'SIGNED_IN' && session) {
            console.log('✅ Signed in:', session.user.email);
            await handleSession(session, next);
          } else if (event === 'USER_UPDATED' && session) {
            console.log('✅ User updated:', session.user.email);
            await handleSession(session, next);
          }
        });

        // Also check for existing session (might already be processed)
        setTimeout(async () => {
          const { data: { session } } = await supabase.auth.getSession();
          
          if (session) {
            console.log('✅ Session already exists:', session.user.email);
            authListener?.subscription.unsubscribe();
            await handleSession(session, next);
          } else {
            console.log('⏳ Waiting for auth state change...');
            
            // Timeout after 5 seconds
            setTimeout(async () => {
              const { data: { session: finalSession } } = await supabase.auth.getSession();
              if (!finalSession) {
                console.error('❌ No session after timeout');
                console.log('🔍 Checking localStorage for verifier:', localStorage.getItem('supabase.auth.code_verifier'));
                setError('Authentication timed out. Please try signing in again.');
                authListener?.subscription.unsubscribe();
                setTimeout(() => router.replace('/login?error=auth_failed'), 2000);
              }
            }, 5000);
          }
        }, 1000);
      } catch (err) {
        console.error('❌ Unexpected error:', err);
        setError('An error occurred. Please try again.');
        setTimeout(() => router.replace('/login?error=auth_failed'), 2000);
      }
    };

    const handleSession = async (session: any, next: string) => {
      const userId = session.user?.id;
      const email = session.user?.email ?? '';

      console.log('🔍 Verifying user in system:', email);

      // Verify user exists in our system (invite-only)
      const { data: userProfile, error: profileError } = await supabase
        .from('users')
        .select('id, email, role')
        .eq('id', userId)
        .single();

      if (profileError || !userProfile) {
        console.warn('🚫 User not found in system:', email, profileError);
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
