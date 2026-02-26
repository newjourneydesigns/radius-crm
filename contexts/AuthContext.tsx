'use client';

import { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

export interface User {
  id: string;
  email: string;
  name: string;
  role: 'ACPD' | 'Viewer';
}

interface AuthContextType {
  user: User | null;
  loading: boolean;
  signInWithMagicLink: (email: string) => Promise<void>;
  signOut: () => Promise<void>;
  clearAuthData: () => Promise<void>;
  isAuthenticated: () => boolean;
  isAdmin: () => boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Helper: fetch user profile from DB with timeout, falling back to auth metadata
    const resolveUser = async (authUser: { id: string; email?: string; user_metadata?: any }) => {
      const profilePromise = supabase
        .from('users')
        .select('id, email, name, role')
        .eq('id', authUser.id)
        .single();

      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Profile fetch timeout')), 2000)
      );

      try {
        const { data: profile, error } = await Promise.race([profilePromise, timeoutPromise]) as any;
        if (profile) {
          console.log('✅ AuthContext: User profile loaded:', profile.name);
          return profile as User;
        }
        if (error) {
          console.error('❌ AuthContext: Profile fetch error, using fallback:', error.message);
        }
      } catch {
        console.error('❌ AuthContext: Profile fetch timed out, using fallback');
      }

      // Fallback user from auth metadata
      const isValleyCreek = authUser.email?.endsWith('@valleycreek.org');
      const fallback: User = {
        id: authUser.id,
        email: authUser.email || '',
        name: authUser.user_metadata?.name || authUser.email?.split('@')[0] || 'User',
        role: isValleyCreek ? 'ACPD' : 'Viewer',
      };
      console.log('🔄 AuthContext: Fallback user created:', fallback.name);
      return fallback;
    };

    // Clean up OAuth code param from URL if present (the auth state change
    // handler below will receive the session once Supabase processes it).
    // NOTE: Don't clean the URL immediately - let Supabase process it first!
    // The cleanup happens in the auth state change handler below.

    // Use onAuthStateChange as the SINGLE source of truth for session state.
    // In @supabase/supabase-js v2.39+, it fires INITIAL_SESSION synchronously
    // on setup, so there is no need for a separate getSession() call (which
    // can deadlock with onAuthStateChange over an internal session lock).
    let debounceTimer: NodeJS.Timeout | null = null;
    let isInitialSession = true;

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      console.log('🔍 AuthContext: Auth state change:', event, session ? 'Session exists' : 'No session');

      // Clean up OAuth callback URL params AFTER Supabase has processed them
      if (typeof window !== 'undefined' && (event === 'SIGNED_IN' || event === 'INITIAL_SESSION')) {
        const urlParams = new URLSearchParams(window.location.search);
        if (urlParams.has('code')) {
          console.log('🔍 AuthContext: OAuth callback detected, clearing URL params after processing');
          window.history.replaceState({}, document.title, window.location.pathname);
        }
      }

      // For INITIAL_SESSION, process immediately (no debounce) so the app
      // doesn't sit on "Checking session…" for an extra second.
      if (isInitialSession) {
        isInitialSession = false;

        try {
          if (session?.user) {
            const resolved = await resolveUser(session.user);
            setUser(resolved);
          } else {
            setUser(null);
          }
        } catch (error) {
          console.error('❌ AuthContext: Error in initial session handler:', error);
          setUser(null);
        }

        setLoading(false);
        return;
      }

      // Subsequent auth events (SIGNED_IN, SIGNED_OUT, TOKEN_REFRESHED, etc.)
      // are debounced to avoid rapid repeated profile fetches.
      if (debounceTimer) clearTimeout(debounceTimer);

      debounceTimer = setTimeout(async () => {
        try {
          if (session?.user) {
            const resolved = await resolveUser(session.user);
            setUser(resolved);
          } else {
            console.log('🔍 AuthContext: No session, clearing user');
            setUser(null);
          }
        } catch (error) {
          console.error('❌ AuthContext: Error in auth change handler:', error);
          setUser(null);
        }
        setLoading(false);
      }, 300); // short debounce for subsequent events
    });

    // Safety net: if onAuthStateChange never fires (e.g. very old client or
    // network issue), ensure we don't stay stuck on the loading screen forever.
    const safetyTimeout = setTimeout(() => {
      setLoading((prev) => {
        if (prev) {
          console.warn('⚠️ AuthContext: Safety timeout — forcing loading to false');
          return false;
        }
        return prev;
      });
    }, 1500);

    // Refresh the session whenever the tab/window becomes visible again.
    // This ensures the token is silently renewed after the device wakes from
    // sleep or the user switches back from another tab, minimising stale-session
    // sign-outs without any visible loading state.
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        supabase.auth.getSession().catch(() => {
          // getSession triggers autoRefreshToken if the access token is expired;
          // we don't need to act on the result here — onAuthStateChange will
          // fire TOKEN_REFRESHED if a refresh happens.
        });
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      subscription.unsubscribe();
      if (debounceTimer) clearTimeout(debounceTimer);
      clearTimeout(safetyTimeout);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);

  const signInWithMagicLink = async (email: string) => {
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim().toLowerCase(),
      options: {
        // Don't create new users - they must be invited by admin first
        shouldCreateUser: false,
        emailRedirectTo: `${window.location.origin}/auth/callback`
      }
    });

    if (error) {
      throw error;
    }
  };

  const signOut = async () => {
    const { error } = await supabase.auth.signOut();
    if (error) {
      throw error;
    }
    setUser(null);
  };

  const clearAuthData = async () => {
    console.log('🧹 AuthContext: Clearing all auth data...');
    try {
      // Force sign out from Supabase with global scope
      await supabase.auth.signOut({ scope: 'global' });
      console.log('✅ AuthContext: Supabase signOut complete');
    } catch (error) {
      console.error('❌ AuthContext: Error during signOut:', error);
    }
    
    // Clear local state immediately
    setUser(null);
    setLoading(false);
    
    // Remove only Supabase-related keys from storage — do NOT call
    // localStorage.clear() as that would also wipe non-auth app data such as
    // theme preferences and the "remember me" setting.
    if (typeof window !== 'undefined') {
      try {
        const stores: Storage[] = [window.localStorage, window.sessionStorage];
        stores.forEach(store => {
          const keysToRemove: string[] = [];
          for (let i = 0; i < store.length; i++) {
            const key = store.key(i);
            if (key && key.includes('supabase')) {
              keysToRemove.push(key);
            }
          }
          keysToRemove.forEach(key => store.removeItem(key));
        });
        console.log('✅ AuthContext: Supabase storage keys cleared');
      } catch (error) {
        console.error('❌ AuthContext: Error clearing storage:', error);
      }
    }
    
    console.log('✅ AuthContext: All auth data cleared');
  };

  const isAuthenticated = () => {
    return user !== null;
  };

  const isAdmin = () => {
    return user?.role === 'ACPD';
  };

  const value = {
    user,
    loading,
    signInWithMagicLink,
    signOut,
    clearAuthData,
    isAuthenticated,
    isAdmin,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}
