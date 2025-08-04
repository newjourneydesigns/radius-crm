import { createContext, useContext, useEffect, useState } from 'react';
import { supabase, User } from '../lib/supabase';

interface AuthContextType {
  user: User | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  clearAuthData: () => Promise<void>;
  isAuthenticated: () => boolean;
  isAdmin: () => boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
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
          console.log('🔍 AuthContext: Fetching user profile for:', session.user.id);
          // Get user profile from our users table
          const { data: profile, error } = await supabase
            .from('users')
            .select('*')
            .eq('id', session.user.id)
            .single();
          
          if (profile) {
            console.log('🔍 AuthContext: User profile loaded:', profile.name);
            setUser(profile);
          } else if (error) {
            console.error('❌ AuthContext: Error fetching user profile:', error);
            // If profile fetch fails, sign out to clear bad session
            await supabase.auth.signOut();
            setUser(null);
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

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      console.log('🔍 AuthContext: Auth state change:', event, session ? 'Session exists' : 'No session');
      try {
        if (session?.user) {
          console.log('🔍 AuthContext: Auth change - fetching user profile');
          // Get user profile
          const { data: profile, error } = await supabase
            .from('users')
            .select('*')
            .eq('id', session.user.id)
            .single();
          
          if (profile) {
            console.log('🔍 AuthContext: Auth change - profile loaded:', profile.name);
            setUser(profile);
          } else if (error) {
            console.error('❌ AuthContext: Error fetching user profile in auth change:', error);
            // If profile fetch fails, sign out to clear bad session
            await supabase.auth.signOut();
            setUser(null);
          }
        } else {
          console.log('🔍 AuthContext: Auth change - clearing user');
          setUser(null);
        }
      } catch (error) {
        console.error('❌ AuthContext: Error in auth state change:', error);
        setUser(null);
      }
      setLoading(false);
    });

    return () => subscription.unsubscribe();
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

  const signOut = async () => {
    const { error } = await supabase.auth.signOut();
    if (error) {
      throw error;
    }
    setUser(null);
  };

  const clearAuthData = async () => {
    try {
      // Sign out from Supabase
      await supabase.auth.signOut();
      // Clear local state
      setUser(null);
      // Clear any localStorage data (if any)
      if (typeof window !== 'undefined') {
        localStorage.clear();
        sessionStorage.clear();
      }
    } catch (error) {
      console.error('Error clearing auth data:', error);
      // Force clear local state even if signOut fails
      setUser(null);
    }
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
};
