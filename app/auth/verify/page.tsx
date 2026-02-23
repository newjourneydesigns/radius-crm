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
    if (ran.current) return;
    ran.current = true;

    // Determine redirect target from query params or hash
    const raw = searchParams.get('next') || '/dashboard';
    let next = raw;
    if (!next.startsWith('/') || next.startsWith('//') || next.startsWith('/login') || next.startsWith('/auth')) {
      next = '/dashboard';
    }

    const handleSession = async (session: any) => {
      const userId = session.user?.id;
      const email = session.user?.email ?? '';

      // Verify user exists in our invite-only system
      const { data: userProfile, error: profileError } = await supabase
        .from('users')
        .select('id, email, role')
        .eq('id', userId)
        .single();

      if (profileError || !userProfile) {
        console.warn('User not in system:', email);
        await supabase.auth.signOut();
        router.replace('/login?error=unauthorized_user');
        return;
      }

      router.replace(next);
    };

    const verify = async () => {
      try {
        // Add detailed debugging
        console.log('🔍 Verify page loaded');
        console.log('🔍 Full URL:', window.location.href);
        console.log('🔍 Search params:', window.location.search);
        console.log('🔍 Hash:', window.location.hash);
        
        // Check for auth code or error in URL
        const urlParams = new URLSearchParams(window.location.search);
        const authCode = urlParams.get('code');
        const urlError = urlParams.get('error');
        
        console.log('🔍 Auth code present:', !!authCode, authCode?.substring(0, 20));
        console.log('🔍 Error in URL:', urlError);
        
        // Check localStorage for PKCE verifier
        const storageKeys = Object.keys(localStorage).filter(k => k.includes('supabase'));
        console.log('🔍 Supabase storage keys:', storageKeys.length, 'keys');
        storageKeys.forEach(key => {
          const value = localStorage.getItem(key);
          if (value && (key.includes('verifier') || key.includes('pkce'))) {
            console.log(`🔍 ${key}:`, value.substring(0, 30) + '...');
          }
        });
        
        // With implicit flow, Supabase puts tokens in the URL hash (#access_token=…)
        // The Supabase client with detectSessionInUrl: true will automatically
        // pick them up and create a session. We listen for that event.

        let resolved = false;

        const { data: listener } = supabase.auth.onAuthStateChange(async (event, session) => {
          console.log('🔍 Auth state change:', event, session ? 'Has session' : 'No session');
          if (resolved) return;
          if ((event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED' || event === 'USER_UPDATED') && session) {
            console.log('✅ Session established:', session.user.email);
            resolved = true;
            listener?.subscription.unsubscribe();
            await handleSession(session);
          }
        });

        // Check if a session already exists (e.g. tokens were processed before listener attached)
        const { data: { session: existing } } = await supabase.auth.getSession();
        console.log('🔍 Existing session check:', existing ? 'Found' : 'Not found');
        if (existing && !resolved) {
          console.log('✅ Using existing session:', existing.user.email);
          resolved = true;
          listener?.subscription.unsubscribe();
          await handleSession(existing);
          return;
        }

        // Fallback timeout — 8 seconds is generous
        setTimeout(async () => {
          if (resolved) return;
          const { data: { session: lastChance } } = await supabase.auth.getSession();
          if (lastChance) {
            console.log('✅ Session found on final check');
            resolved = true;
            listener?.subscription.unsubscribe();
            await handleSession(lastChance);
          } else {
            console.error('❌ No session after timeout');
            console.log('🔍 Checking localStorage again...');
            const keys = Object.keys(localStorage).filter(k => k.includes('supabase'));
            keys.forEach(k => console.log(`  - ${k}`));
            resolved = true;
            listener?.subscription.unsubscribe();
            setError('Authentication timed out. Redirecting to login…');
            setTimeout(() => router.replace('/login?error=auth_failed'), 1500);
          }
        }, 8000);
      } catch (err) {
        console.error('Verify error:', err);
        setError('Something went wrong. Please try again.');
        setTimeout(() => router.replace('/login?error=auth_failed'), 2000);
      }
    };

    verify();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="min-h-screen bg-gray-900 flex flex-col items-center justify-center gap-4">
      <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500" />
      <p className="text-sm text-gray-400">
        {error || 'Verifying your account…'}
      </p>
    </div>
  );
}

export default function VerifyPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-gray-900 flex items-center justify-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500" />
        </div>
      }
    >
      <VerifyContent />
    </Suspense>
  );
}
