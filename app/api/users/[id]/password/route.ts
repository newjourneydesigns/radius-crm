import { NextRequest, NextResponse } from 'next/server';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { verifyAdminAccessDemo } from '../../../../../lib/auth-middleware';

export const dynamic = 'force-dynamic';

// Built on first use rather than at module load. Next evaluates every route
// module while collecting page data during `next build`, and createClient throws
// on an empty URL — so with Supabase env vars absent (a fresh clone with no
// .env.local) this crashed the whole build. Deferring it keeps the build env-free
// and turns a missing credential into a request-time error instead.
let supabaseAdminClient: SupabaseClient | null = null;
function supabaseAdmin(): SupabaseClient {
  if (!supabaseAdminClient) {
    supabaseAdminClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY || 'demo-key',
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false
        }
      }
    );
  }
  return supabaseAdminClient;
}

export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    // Verify admin access
    const { isAdmin, error: adminAuthError } = await verifyAdminAccessDemo(request);
    
    if (!isAdmin) {
      return NextResponse.json({ error: adminAuthError || 'Admin access required' }, { status: 403 });
    }

    const { newPassword } = await request.json();
    const userId = params.id;

    // Validate input
    if (!newPassword) {
      return NextResponse.json({ error: 'New password is required' }, { status: 400 });
    }

    if (newPassword.length < 6) {
      return NextResponse.json({ error: 'Password must be at least 6 characters long' }, { status: 400 });
    }

    // Check if we have a valid service role key
    if (!process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY === 'demo-key') {
      // Return mock success for demo
      return NextResponse.json({ 
        message: 'Password updated successfully (Demo Mode)',
        user: {
          id: userId,
          email: 'demo@example.com'
        }
      });
    }

    // Update user password using admin client
    const { data, error } = await supabaseAdmin().auth.admin.updateUserById(userId, {
      password: newPassword
    });

    if (error) {
      console.error('Error updating user password:', error);
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ 
      message: 'Password updated successfully',
      user: {
        id: data.user.id,
        email: data.user.email
      }
    });

  } catch (error) {
    console.error('Error in update password API:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
