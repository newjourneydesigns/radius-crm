import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { verifyAdminAccessDemo } from '../../../lib/auth-middleware';

// Create admin client with service role key
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || 'demo-key',
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  }
);

export async function GET(request: NextRequest) {
  try {
    // Verify admin access
    const { isAdmin, error: adminAuthError } = await verifyAdminAccessDemo(request);
    
    if (!isAdmin) {
      return NextResponse.json({ error: adminAuthError || 'Admin access required' }, { status: 403 });
    }

    // Check if we have a valid service role key
    if (!process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY === 'demo-key') {
      // Return mock data for demo
      const mockUsers = [
        {
          id: '1',
          email: 'admin@example.com',
          created_at: '2024-01-15T10:30:00Z',
          last_sign_in_at: '2024-07-30T14:22:00Z',
          name: 'Admin User',
          role: 'admin'
        },
        {
          id: '2', 
          email: 'user@example.com',
          created_at: '2024-02-20T09:15:00Z',
          last_sign_in_at: '2024-07-29T11:45:00Z',
          name: 'Regular User',
          role: 'user'
        }
      ];
      
      return NextResponse.json({ users: mockUsers });
    }

    // Get users from auth.users and join with public.users for profile data
    const { data: authUsers, error: supabaseAuthError } = await supabaseAdmin.auth.admin.listUsers();
    
    if (supabaseAuthError) {
      console.error('Error fetching auth users:', supabaseAuthError);
      return NextResponse.json({ error: 'Failed to fetch users' }, { status: 500 });
    }

    // Get profile data from public.users table
    const { data: profiles, error: profileError } = await supabaseAdmin
      .from('users')
      .select('*');

    if (profileError) {
      console.error('Error fetching user profiles:', profileError);
      // Continue without profiles if there's an error
    }

    // Combine auth data with profile data
    const users = authUsers.users.map(authUser => {
      const profile = profiles?.find(p => p.id === authUser.id);
      return {
        id: authUser.id,
        email: authUser.email,
        created_at: authUser.created_at,
        last_sign_in_at: authUser.last_sign_in_at,
        name: profile?.name || null,
        role: profile?.role || 'user'
      };
    });

    return NextResponse.json({ users });

  } catch (error) {
    console.error('Error in users API:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  console.log('🚀 User creation API called at:', new Date().toISOString());
  try {
    // Verify admin access
    const { isAdmin, error: adminAuthError } = await verifyAdminAccessDemo(request);
    
    if (!isAdmin) {
      console.error('Admin access denied:', adminAuthError);
      return NextResponse.json({ error: adminAuthError || 'Admin access required' }, { status: 403 });
    }

    const body = await request.json();
    console.log('Create user request body:', body);
    const { email, password } = body;

    // Validate input more thoroughly
    if (!email || !password) {
      console.error('Missing email or password:', { email: !!email, password: !!password });
      return NextResponse.json({ error: 'Email and password are required' }, { status: 400 });
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      console.error('Invalid email format:', email);
      return NextResponse.json({ error: 'Invalid email format' }, { status: 400 });
    }

    if (password.length < 6) {
      console.error('Password too short:', password.length);
      return NextResponse.json({ error: 'Password must be at least 6 characters long' }, { status: 400 });
    }

    // Check if we have a valid service role key
    const hasServiceKey = !!process.env.SUPABASE_SERVICE_ROLE_KEY && process.env.SUPABASE_SERVICE_ROLE_KEY !== 'demo-key';
    console.log('Service role key status:', {
      exists: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
      isDemo: process.env.SUPABASE_SERVICE_ROLE_KEY === 'demo-key',
      hasValidKey: hasServiceKey,
      keyLength: process.env.SUPABASE_SERVICE_ROLE_KEY?.length || 0
    });

    if (!hasServiceKey) {
      console.log('Demo mode - returning mock user creation');
      // Return mock success for demo
      return NextResponse.json({ 
        message: 'User created successfully (Demo Mode)',
        user: {
          id: `demo-${Date.now()}`,
          email: email,
          created_at: new Date().toISOString()
        }
      });
    }

    console.log('Creating user with Supabase admin client...');
    
    // First check if user already exists
    try {
      const { data: existingUsers } = await supabaseAdmin.auth.admin.listUsers();
      const existingUser = existingUsers?.users?.find((u: any) => u.email === email);
      if (existingUser) {
        console.error('User already exists:', email);
        return NextResponse.json({ error: 'A user with this email already exists' }, { status: 400 });
      }
    } catch (checkError) {
      console.warn('Could not check for existing users:', checkError);
    }

    // Create user with admin client
    const { data, error } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true // Auto-confirm email
    });

    if (error) {
      console.error('🔥 Supabase auth error creating user (v2.0):', {
        message: error.message,
        status: error.status,
        code: error.code || 'unknown',
        details: error,
        timestamp: new Date().toISOString()
      });
      return NextResponse.json({ 
        error: `Auth error v2.0: ${error.message} (Code: ${error.code || 'unknown'})`,
        timestamp: new Date().toISOString()
      }, { status: 400 });
    }

    console.log('User created in auth, creating profile...', data.user.id);
    // Create user profile in public.users table
    const { error: profileError } = await supabaseAdmin
      .from('users')
      .insert({
        id: data.user.id,
        email: data.user.email,
        name: null,
        role: 'user'
      });

    if (profileError) {
      console.error('Error creating user profile (v2.0):', profileError);
      return NextResponse.json({ 
        error: `Database error creating user profile v2.0: ${profileError.message}`,
        timestamp: new Date().toISOString()
      }, { status: 400 });
    }

    console.log('User and profile created successfully');
    return NextResponse.json({ 
      message: 'User created successfully',
      user: {
        id: data.user.id,
        email: data.user.email,
        created_at: data.user.created_at
      }
    });

  } catch (error) {
    console.error('Error in create user API:', error);
    return NextResponse.json({ error: `Internal server error: ${error}` }, { status: 500 });
  }
}
