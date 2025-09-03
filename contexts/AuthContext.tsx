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
    // Get initial session
    const getSession = async () => {
      console.log('🔍 AuthContext: Getting initial session...');
      try {
        const { data: { session } } = await supabase.auth.getSession();
        console.log('🔍 AuthContext: Initial session:', session ? 'Found' : 'None');
        
        if (session?.user) {
          console.log('🔍 AuthContext: Initial session user found, fetching profile');
          
          // Optimize query by selecting only necessary fields
          const profilePromise = supabase
            .from('users')
            .select('id, email, name, role')
            .eq('id', session.user.id)
            .single();

          const timeoutPromise = new Promise((_, reject) =>
            setTimeout(() => reject(new Error('Profile fetch timeout')), 2000)
          );

          try {
            const { data: profile, error } = await Promise.race([profilePromise, timeoutPromise]) as any;
            
            if (profile) {
              console.log('🔍 AuthContext: User profile loaded:', profile.name);
              setUser(profile);
            } else if (error) {
              console.error('❌ AuthContext: Error fetching user profile:', error);
              
              // Fallback: Create a basic user object from auth data
              console.log('🔄 AuthContext: Using fallback user data from auth');
              // If valleycreek.org email, assign ACPD role (admin)
              const isValleyCreek = session.user.email?.endsWith('@valleycreek.org');
              const fallbackUser = {
                id: session.user.id,
                email: session.user.email || '',
                name: session.user.user_metadata?.name || session.user.email?.split('@')[0] || 'User',
                role: (isValleyCreek ? 'ACPD' : 'Viewer') as 'ACPD' | 'Viewer'
              };
              setUser(fallbackUser);
            }
          } catch (timeoutError) {
            console.error('❌ AuthContext: Initial profile fetch timed out, using fallback');
            console.log('🔄 AuthContext: Creating fallback user from initial session data');
            
            // Fallback: Create a basic user object from auth data
            // If valleycreek.org email, assign ACPD role (admin)
            const isValleyCreek = session.user.email?.endsWith('@valleycreek.org');
            const fallbackUser = {
              id: session.user.id,
              email: session.user.email || '',
              name: session.user.user_metadata?.name || session.user.email?.split('@')[0] || 'User',
              role: (isValleyCreek ? 'ACPD' : 'Viewer') as 'ACPD' | 'Viewer'
            };
            console.log('✅ AuthContext: Initial fallback user created:', fallbackUser.name);
            setUser(fallbackUser);
          }
        }
      } catch (error) {
        console.error('❌ AuthContext: Error getting session:', error);
        // Clear any bad session data
        setUser(null);
      }
      console.log('✅ AuthContext: Initial session check complete');
      setLoading(false);
    };

    getSession();

    // Listen for auth changes with debouncing to prevent rapid repeated calls
    let authChangeTimeout: NodeJS.Timeout | null = null;
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      console.log('🔍 AuthContext: Auth state change:', event, session ? 'Session exists' : 'No session');
      
      // Clear any existing timeout to debounce rapid auth changes
      if (authChangeTimeout) {
        clearTimeout(authChangeTimeout);
      }

      // Debounce auth changes by 1 second to prevent repeated calls
      authChangeTimeout = setTimeout(async () => {
        try {
          if (session?.user) {
            console.log('🔍 AuthContext: Auth change - fetching user profile');
            
            // Optimize query by selecting only necessary fields
            const profilePromise = supabase
              .from('users')
              .select('id, email, name, role')
              .eq('id', session.user.id)
              .single();

            // Reduce timeout to 2 seconds for faster response
            const timeoutPromise = new Promise((_, reject) =>
              setTimeout(() => reject(new Error('Profile fetch timeout')), 2000)
            );

            try {
              const { data: profile, error } = await Promise.race([profilePromise, timeoutPromise]) as any;
              
              if (profile) {
                console.log('🔍 AuthContext: Auth change - profile loaded:', profile.name);
                setUser(profile);
              } else if (error) {
                console.error('❌ AuthContext: Error fetching user profile in auth change:', error);
                
                // Fallback: Create a basic user object from auth data
                console.log('🔄 AuthContext: Auth change - using fallback user data');
                const isValleyCreek = session.user.email?.endsWith('@valleycreek.org');
                const fallbackUser = {
                  id: session.user.id,
                  email: session.user.email || '',
                  name: session.user.user_metadata?.name || session.user.email?.split('@')[0] || 'User',
                  role: (isValleyCreek ? 'ACPD' : 'Viewer') as 'ACPD' | 'Viewer'
                };
                setUser(fallbackUser);
              }
            } catch (timeoutError) {
              console.error('❌ AuthContext: Auth change profile fetch timed out, using fallback');
              console.log('🔄 AuthContext: Creating fallback user from session data');
              
              // Fallback: Create a basic user object from auth data
              const isValleyCreek = session.user.email?.endsWith('@valleycreek.org');
              const fallbackUser = {
                id: session.user.id,
                email: session.user.email || '',
                name: session.user.user_metadata?.name || session.user.email?.split('@')[0] || 'User',
                role: (isValleyCreek ? 'ACPD' : 'Viewer') as 'ACPD' | 'Viewer'
              };
              console.log('✅ AuthContext: Fallback user created:', fallbackUser.name);
              setUser(fallbackUser);
            }
          } else {
            console.log('🔍 AuthContext: No session, clearing user');
            setUser(null);
          }
        } catch (error) {
          console.error('❌ AuthContext: Error in auth change handler:', error);
          setUser(null);
        }
        setLoading(false);
      }, 1000); // 1 second debounce
    });

    return () => {
      subscription.unsubscribe();
      if (authChangeTimeout) {
        clearTimeout(authChangeTimeout);
      }
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
        redirectTo: redirectTo
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
