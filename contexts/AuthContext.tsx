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
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string, name: string) => Promise<void>;
  signInWithGoogle: () => Promise<void>;
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
    if (typeof window !== 'undefined') {
      const urlParams = new URLSearchParams(window.location.search);
      if (urlParams.has('code')) {
        console.log('🔍 AuthContext: OAuth callback detected, clearing URL params');
        window.history.replaceState({}, document.title, window.location.pathname);
      }
    }

    // Use onAuthStateChange as the SINGLE source of truth for session state.
    // In @supabase/supabase-js v2.39+, it fires INITIAL_SESSION synchronously
    // on setup, so there is no need for a separate getSession() call (which
    // can deadlock with onAuthStateChange over an internal session lock).
    let debounceTimer: NodeJS.Timeout | null = null;
    let isInitialSession = true;

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      console.log('🔍 AuthContext: Auth state change:', event, session ? 'Session exists' : 'No session');

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
    }, 4000);

    return () => {
      subscription.unsubscribe();
      if (debounceTimer) clearTimeout(debounceTimer);
      clearTimeout(safetyTimeout);
    };
  }, []);

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      throw error;
    }
  };

  const signUp = async (email: string, password: string, name: string) => {
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          name: name
        }
      }
    });

    if (error) {
      throw error;
    }
  };

  const signInWithGoogle = async () => {
    // Determine the correct redirect URL based on environment and domain
    let redirectTo = `${window.location.origin}/auth/callback`;
    
    // If we're on myradiuscrm.com in production, ensure we redirect back to myradiuscrm.com
    if (window.location.hostname === 'myradiuscrm.com') {
      redirectTo = 'https://myradiuscrm.com/auth/callback';
    }
    // Fallback: if we're on a netlify domain, use that
    else if (window.location.hostname.includes('netlify.app')) {
      redirectTo = `${window.location.origin}/auth/callback`;
    }
    
    console.log('🔍 AuthContext: Google OAuth redirect URL:', redirectTo);
    
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: redirectTo,
        // Enable PKCE flow explicitly for better security
        queryParams: {
          access_type: 'offline',
          prompt: 'consent',
        }
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
    
    // Clear browser storage
    if (typeof window !== 'undefined') {
      try {
        localStorage.clear();
        sessionStorage.clear();
        // Also clear specific Supabase keys
        const keysToRemove: string[] = [];
        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i);
          if (key && key.includes('supabase')) {
            keysToRemove.push(key);
          }
        }
        keysToRemove.forEach(key => localStorage.removeItem(key));
        console.log('✅ AuthContext: Browser storage cleared');
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
    signIn,
    signUp,
    signInWithGoogle,
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
