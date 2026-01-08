import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export async function GET(request: NextRequest) {
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
      serviceKeyLength: process.env.SUPABASE_SERVICE_ROLE_KEY?.length || 0,
      anonKeyLength: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.length || 0,
      urlValid: process.env.NEXT_PUBLIC_SUPABASE_URL?.includes('supabase.co') || false
    });

    // Try with anon key first (for public.users table)
    const supabaseAnon = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );

    const { data: profiles, error: profileError } = await supabaseAnon
      .from('users')
      .select('*');

    console.log('Public users table query result:', {
      count: profiles?.length || 0,
      error: profileError?.message || null,
      sample: profiles?.slice(0, 2) || []
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
        count: authUsers?.users?.length || 0,
        error: authError?.message || null,
        sample: authUsers?.users?.slice(0, 2).map((u: any) => ({
          id: u.id,
          email: u.email,
          provider: u.app_metadata?.provider
        })) || []
      });
    }

    return NextResponse.json({
      environment: {
        hasServiceKey,
        hasAnonKey,
        hasUrl
      },
      publicUsers: {
        count: profiles?.length || 0,
        users: profiles || [],
        error: profileError?.message || null
      },
      authUsers: {
        count: authUsers?.users?.length || 0,
        users: authUsers?.users?.map((u: any) => ({
          id: u.id,
          email: u.email,
          created_at: u.created_at,
          last_sign_in_at: u.last_sign_in_at,
          provider: u.app_metadata?.provider
        })) || [],
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