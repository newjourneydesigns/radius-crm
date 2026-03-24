import { NextRequest } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export async function verifyAdminAccess(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization');
    const sessionToken = authHeader?.split(' ')[1];

    if (!sessionToken) {
      return { isAdmin: false, user: null, error: 'No authentication token provided' };
    }

    // Verify the JWT and get the user via the service role client
    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(sessionToken);

    if (authError || !user) {
      return { isAdmin: false, user: null, error: 'Invalid or expired token' };
    }

    // Check role in public.users — valid admin roles are 'ACPD' and 'admin'
    const { data: profile, error: profileError } = await supabaseAdmin
      .from('users')
      .select('role')
      .eq('id', user.id)
      .single();

    if (profileError || !profile) {
      return { isAdmin: false, user: null, error: 'Unable to verify user permissions' };
    }

    const isAdmin = profile.role === 'ACPD' || profile.role === 'admin';
    return { isAdmin, user, error: isAdmin ? null : 'Admin access required' };

  } catch (error) {
    console.error('Error verifying admin access:', error);
    return { isAdmin: false, user: null, error: 'Internal authentication error' };
  }
}

// All endpoints use the real admin check
export async function verifyAdminAccessDemo(request: NextRequest) {
  return verifyAdminAccess(request);
}
