import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// Helper function to verify admin access
export async function verifyAdminAccess(request: NextRequest) {
  try {
    // Get the session token from cookies or headers
    const authHeader = request.headers.get('authorization');
    const sessionToken = authHeader?.split(' ')[1];

    if (!sessionToken) {
      return { isAdmin: false, error: 'No authentication token provided' };
    }

    // Create Supabase client
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );

    // Verify the session
    const { data: { user }, error: authError } = await supabase.auth.getUser(sessionToken);

    if (authError || !user) {
      return { isAdmin: false, error: 'Invalid or expired token' };
    }

    // Check if user has admin role
    const { data: profile, error: profileError } = await supabase
      .from('users')
      .select('role')
      .eq('id', user.id)
      .single();

    if (profileError) {
      return { isAdmin: false, error: 'Unable to verify user permissions' };
    }

    const isAdmin = profile?.role === 'admin';
    return { isAdmin, user, error: null };

  } catch (error) {
    console.error('Error verifying admin access:', error);
    return { isAdmin: false, error: 'Internal authentication error' };
  }
}

// For development/demo purposes, we'll allow access without strict admin checking
// In production, you should enable the admin check
export async function verifyAdminAccessDemo(request: NextRequest) {
  // For demo purposes, allow access
  // In production, uncomment the line below and remove the return statement
  // return verifyAdminAccess(request);
  
  return { isAdmin: true, user: null, error: null };
}
