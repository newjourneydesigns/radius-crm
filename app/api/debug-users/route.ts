import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  if (process.env.NODE_ENV !== 'development') {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  try {
    console.log('🔍 Debug Users API called');
    
    // Check environment variables
    const hasServiceKey = !!process.env.SUPABASE_SERVICE_ROLE_KEY && process.env.SUPABASE_SERVICE_ROLE_KEY !== 'demo-key';
    const hasAnonKey = !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    const hasUrl = !!process.env.NEXT_PUBLIC_SUPABASE_URL;
    
    console.log('Environment check:', {
      hasServiceKey,
      hasAnonKey,
      hasUrl,
    });

    // Try with anon key first (for public.users table)
    const supabaseAnon = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );

    const { data: profiles, error: profileError } = await supabaseAnon
      .from('users')
      .select('id')
      .limit(1);

    console.log('Public users table query result:', {
      ok: !profileError,
      error: profileError?.message || null,
    });

    // Try with service role key if available
    let authUsers: any = null;
    let authError: any = null;
    
    if (hasServiceKey) {
      const supabaseAdmin = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!,
        {
          auth: {
            autoRefreshToken: false,
            persistSession: false
          }
        }
      );

      const authResult = await supabaseAdmin.auth.admin.listUsers();
      authUsers = authResult.data;
      authError = authResult.error;

      console.log('Auth users query result:', {
        ok: !authError,
        count: authUsers?.users?.length || 0,
        error: authError?.message || null,
      });
    }

    return NextResponse.json({
      environment: {
        hasServiceKey,
        hasAnonKey,
        hasUrl
      },
      publicUsers: {
        // Do not return user records from a debug endpoint.
        count: Array.isArray(profiles) ? profiles.length : 0,
        users: [],
        error: profileError?.message || null
      },
      authUsers: {
        count: authUsers?.users?.length || 0,
        users: [],
        error: authError?.message || null
      }
    });

  } catch (error) {
    console.error('Error in debug users API:', error);
    return NextResponse.json({ 
      error: 'Internal server error',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}