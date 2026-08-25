'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { AuthChangeEvent, Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';

export interface User {
  id: string;
  email: string;
  name: string;
  role: 'ACPD' | 'admin' | 'Viewer';
  acpd?: string;
  ai_assistant_enabled?: boolean;
}

interface AuthContextType {
  user: User | null;
  loading: boolean;
  signInWithMagicLink: (email: string) => Promise<void>;
  signOut: () => Promise<void>;
  clearAuthData: () => Promise<void>;
  isAuthenticated: () => boolean;
  isAdmin: () => boolean;
  refreshUser: () => Promise<void>;
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
    let disposed = false;
    // Only the most recent applySession call may write state — auth events
    // arrive in bursts (SIGNED_IN → INITIAL_SESSION → SIGNED_IN on sign-in).
    let applySeq = 0;
    let debounceTimer: NodeJS.Timeout | null = null;
    let retryTimer: NodeJS.Timeout | null = null;
    let retryCount = 0;
    let isFirstEvent = true;
    // What the current `user` state reflects, so a transient DB failure never
    // downgrades an already-loaded profile and retries know whom to fetch.
    let resolvedUserId: string | null = null;
    let resolvedFromDb = false;

    const PROFILE_TIMEOUT_MS = 5000;
    const RETRY_DELAYS_MS = [3000, 8000, 20000];

    type ProfileFetchResult =
      | { status: 'ok'; profile: User }
      | { status: 'none' }   // definitive answer: no users row for this id
      | { status: 'error' }; // transient: timeout or network — worth retrying

    const fetchProfile = async (userId: string): Promise<ProfileFetchResult> => {
      let timeoutId: NodeJS.Timeout | undefined;
      try {
        const profilePromise = supabase
          .from('users')
          .select('id, email, name, role, acpd, ai_assistant_enabled')
          .eq('id', userId)
          .maybeSingle();
        const timeoutPromise = new Promise<never>((_, reject) => {
          timeoutId = setTimeout(() => reject(new Error('Profile fetch timeout')), PROFILE_TIMEOUT_MS);
        });
        const { data: profile, error } = await Promise.race([profilePromise, timeoutPromise]);
        if (error) {
          console.error('❌ AuthContext: Profile fetch error:', error.message);
          return { status: 'error' };
        }
        if (!profile) return { status: 'none' };
        return { status: 'ok', profile: profile as User };
      } catch {
        console.error('❌ AuthContext: Profile fetch timed out');
        return { status: 'error' };
      } finally {
        if (timeoutId) clearTimeout(timeoutId);
      }
    };

    // Fallback: always default to Viewer — never infer role from email domain.
    // The DB is the source of truth for role; a transient failure should not
    // silently grant elevated permissions.
    const fallbackUser = (authUser: Session['user']): User => ({
      id: authUser.id,
      email: authUser.email || '',
      name: authUser.user_metadata?.name || authUser.email?.split('@')[0] || 'User',
      role: 'Viewer',
      ai_assistant_enabled: false,
    });

    const clearRetry = () => {
      if (retryTimer) {
        clearTimeout(retryTimer);
        retryTimer = null;
      }
    };

    // After a transient failure left the user on the Viewer fallback, retry in
    // the background so their real role comes back without a reload instead of
    // waiting for the next auth event to happen along.
    const scheduleRetry = (authUser: Session['user']) => {
      if (retryTimer || retryCount >= RETRY_DELAYS_MS.length) return;
      const delay = RETRY_DELAYS_MS[retryCount];
      retryTimer = setTimeout(async () => {
        retryTimer = null;
        retryCount += 1;
        const result = await fetchProfile(authUser.id);
        if (disposed || resolvedUserId !== authUser.id || resolvedFromDb) return;
        if (result.status === 'ok') {
          resolvedFromDb = true;
          console.log('✅ AuthContext: User profile loaded on retry:', result.profile.name);
          setUser(result.profile);
        } else if (result.status === 'error') {
          scheduleRetry(authUser);
        }
        // 'none' is a real answer — stay on the Viewer fallback.
      }, delay);
    };

    const applySession = async (event: AuthChangeEvent, session: Session | null) => {
      const seq = ++applySeq;

      if (!session?.user) {
        clearRetry();
        retryCount = 0;
        resolvedUserId = null;
        resolvedFromDb = false;
        if (event !== 'INITIAL_SESSION') {
          console.log('🔍 AuthContext: No session, clearing user');
        }
        setUser(null);
        setLoading(false);
        return;
      }

      const authUser = session.user;

      // A token refresh doesn't change the profile; skip the refetch when the
      // real one is already loaded (refreshUser() covers explicit refreshes).
      if (event === 'TOKEN_REFRESHED' && resolvedFromDb && resolvedUserId === authUser.id) {
        setLoading(false);
        return;
      }

      const result = await fetchProfile(authUser.id);
      if (disposed || seq !== applySeq) return;

      if (result.status === 'ok') {
        clearRetry();
        retryCount = 0;
        resolvedUserId = authUser.id;
        resolvedFromDb = true;
        console.log('✅ AuthContext: User profile loaded:', result.profile.name);
        setUser(result.profile);
      } else if (result.status === 'error' && resolvedFromDb && resolvedUserId === authUser.id) {
        // Transient failure but the real profile is already loaded — keep it
        // rather than downgrading to the Viewer fallback.
        console.warn('⚠️ AuthContext: Profile refetch failed, keeping current profile');
      } else {
        clearRetry();
        if (resolvedUserId !== authUser.id) retryCount = 0;
        resolvedUserId = authUser.id;
        resolvedFromDb = false;
        const fallback = fallbackUser(authUser);
        console.log('🔄 AuthContext: Fallback user created (Viewer):', fallback.name);
        setUser(fallback);
        if (result.status === 'error') scheduleRetry(authUser);
      }
      setLoading(false);
    };

    // Use onAuthStateChange as the SINGLE source of truth for session state.
    // In @supabase/supabase-js v2.39+, it fires INITIAL_SESSION on setup, so
    // there is no need for a separate getSession() call.
    //
    // The callback itself must stay synchronous: auth-js holds its internal
    // session lock while notifying subscribers, and the profile query needs
    // that same lock (its fetch resolves the access token via getSession()).
    // Awaiting the query inside the callback deadlocks until the fetch timeout
    // fires — the "Profile fetch timed out" bug that briefly downgraded every
    // sign-in to Viewer. Deferring to a macrotask lets the lock release first.
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      console.log('🔍 AuthContext: Auth state change:', event, session ? 'Session exists' : 'No session');

      // Clean up OAuth callback URL params AFTER Supabase has processed them
      if (typeof window !== 'undefined' && (event === 'SIGNED_IN' || event === 'INITIAL_SESSION')) {
        const urlParams = new URLSearchParams(window.location.search);
        if (urlParams.has('code')) {
          console.log('🔍 AuthContext: OAuth callback detected, clearing URL params after processing');
          window.history.replaceState({}, document.title, window.location.pathname);
        }
      }

      // Process the first event (INITIAL_SESSION, or the SIGNED_IN emitted
      // while a magic link is consumed) without the debounce so the app
      // doesn't sit on "Checking session…" for an extra beat.
      if (isFirstEvent) {
        isFirstEvent = false;
        setTimeout(() => {
          if (!disposed) void applySession(event, session);
        }, 0);
        return;
      }

      // Subsequent auth events (SIGNED_IN, SIGNED_OUT, TOKEN_REFRESHED, etc.)
      // are debounced to avoid rapid repeated profile fetches.
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        if (!disposed) void applySession(event, session);
      }, 300);
    });

    // Safety net: if onAuthStateChange never fires (e.g. very old client or
    // network issue), ensure we don't stay stuck on the loading screen forever.
    // Must outlast PROFILE_TIMEOUT_MS — forcing loading false while the first
    // profile fetch is still in flight would flash the signed-out state.
    const safetyTimeout = setTimeout(() => {
      setLoading((prev) => {
        if (prev) {
          console.warn('⚠️ AuthContext: Safety timeout — forcing loading to false');
          return false;
        }
        return prev;
      });
    }, 8000);

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
      disposed = true;
      subscription.unsubscribe();
      if (debounceTimer) clearTimeout(debounceTimer);
      clearRetry();
      clearTimeout(safetyTimeout);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);

  const signInWithMagicLink = useCallback(async (email: string) => {
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
  }, []);

  const signOut = useCallback(async () => {
    const { error } = await supabase.auth.signOut();
    if (error) {
      throw error;
    }
    setUser(null);
  }, []);

  const clearAuthData = useCallback(async () => {
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
  }, []);

  const isAuthenticated = useCallback(() => user !== null, [user]);

  const isAdmin = useCallback(() => user?.role === 'ACPD' || user?.role === 'admin', [user]);

  const refreshUser = useCallback(async () => {
    if (!user) return;
    try {
      const { data: profile } = await supabase
        .from('users')
        .select('id, email, name, role, acpd, ai_assistant_enabled')
        .eq('id', user.id)
        .single();
      if (profile) {
        setUser(profile as User);
      }
    } catch (err) {
      console.error('❌ AuthContext: refreshUser failed:', err);
    }
  }, [user]);

  const value = useMemo(() => ({
    user,
    loading,
    signInWithMagicLink,
    signOut,
    clearAuthData,
    isAuthenticated,
    isAdmin,
    refreshUser,
  }), [user, loading, signInWithMagicLink, signOut, clearAuthData, isAuthenticated, isAdmin, refreshUser]);

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}
