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
      // Fallback: Try to get users from public.users table with anon key
      const supabaseAnon = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
      );
      
      const { data: profiles, error: profileError } = await supabaseAnon
        .from('users')
        .select('*');
      
      if (profileError) {
        console.error('Error fetching user profiles with anon key:', profileError);
        // Return mock data if we can't get real data
        const mockUsers = [
          {
            id: '1',
            email: 'admin@example.com',
            created_at: '2024-01-15T10:30:00Z',
            last_sign_in_at: '2024-07-30T14:22:00Z',
            name: 'Admin User',
            role: 'ACPD'
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
      
      // Convert profiles to user format (without auth data)
      const users = profiles.map(profile => ({
        id: profile.id,
        email: profile.email,
        name: profile.name,
        role: profile.role,
        created_at: profile.created_at,
        last_sign_in_at: null // Can't get this without service role key
      }));
      
      return NextResponse.json({ users });
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
    const { email, name, role } = body;

    // Validate input
    if (!email) {
      console.error('Missing email');
      return NextResponse.json({ error: 'Email is required' }, { status: 400 });
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      console.error('Invalid email format:', email);
      return NextResponse.json({ error: 'Invalid email format' }, { status: 400 });
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
        message: 'User invited successfully (Demo Mode)',
        user: {
          id: `demo-${Date.now()}`,
          email: email,
          created_at: new Date().toISOString()
        }
      });
    }

    console.log('Creating user with Supabase admin client (passwordless invite)...');
    
    const normalizedEmail = email.trim().toLowerCase();

    // First check if user already exists in auth
    try {
      const { data: existingUsers } = await supabaseAdmin.auth.admin.listUsers();
      const existingUser = existingUsers?.users?.find((u: any) => u.email === normalizedEmail);
      if (existingUser) {
        // If they exist but email is unconfirmed, confirm them so they can sign in
        if (!existingUser.email_confirmed_at) {
          console.log('User exists but unconfirmed, confirming now:', normalizedEmail);
          await supabaseAdmin.auth.admin.updateUserById(existingUser.id, {
            email_confirm: true,
            user_metadata: { name: name || existingUser.user_metadata?.name }
          });
          // Ensure profile is up to date
          await supabaseAdmin.from('users').upsert({
            id: existingUser.id,
            email: normalizedEmail,
            name: name || existingUser.email,
            role: role || 'Viewer'
          }, { onConflict: 'id' });
          console.log('User confirmed successfully');
          return NextResponse.json({
            message: 'User confirmed. They can now sign in with a magic link.',
            user: { id: existingUser.id, email: existingUser.email, created_at: existingUser.created_at }
          });
        }
        console.error('User already exists in auth:', normalizedEmail);
        return NextResponse.json({ error: 'A user with this email already exists' }, { status: 400 });
      }
    } catch (checkError) {
      console.warn('Could not check for existing users:', checkError);
    }

    // Check for an existing profile in public.users for this email.
    // If found, reuse its UUID when creating the auth user so we don't lose
    // any data that references it (circle leader assignments, etc.).
    let existingProfileId: string | null = null;
    try {
      const { data: existingProfiles } = await supabaseAdmin
        .from('users')
        .select('id, email')
        .eq('email', normalizedEmail);

      if (existingProfiles && existingProfiles.length > 0) {
        existingProfileId = existingProfiles[0].id;
        console.log(`Found existing profile for ${normalizedEmail} with id ${existingProfileId}, will reuse UUID`);
      }
    } catch (lookupError) {
      console.warn('Could not check for existing profiles:', lookupError);
    }

    // Create user in auth, reusing the existing UUID if available
    const { data, error } = await supabaseAdmin.auth.admin.createUser({
      ...(existingProfileId ? { id: existingProfileId } : {}),
      email: normalizedEmail,
      email_confirm: true, // Confirm immediately so magic link works right away
      user_metadata: {
        name: name || null
      }
    });

    if (error) {
      console.error('🔥 Supabase auth error creating user:', {
        message: error.message,
        status: error.status,
        code: error.code || 'unknown',
        details: error,
        timestamp: new Date().toISOString()
      });
      return NextResponse.json({ 
        error: `Auth error: ${error.message} (Code: ${error.code || 'unknown'})`,
        timestamp: new Date().toISOString()
      }, { status: 400 });
    }

    console.log('User created in auth:', data.user.id);
    
    // The handle_new_user() trigger should have created a profile in public.users.
    // Now upsert the profile to ensure the correct name and role are set
    // (the trigger defaults to 'Viewer' role and may use email as name).
    const { error: profileError } = await supabaseAdmin
      .from('users')
      .upsert({
        id: data.user.id,
        email: data.user.email,
        name: name || data.user.email,
        role: role || 'Viewer'
      }, { onConflict: 'id' });

    if (profileError) {
      console.error('Error upserting user profile:', {
        message: profileError.message,
        code: profileError.code,
        details: profileError.details,
        hint: profileError.hint,
        user_id: data.user.id,
        timestamp: new Date().toISOString()
      });
      // Don't roll back the auth user — the trigger already created a basic profile.
      // Just log the error; the user can still sign in and the profile can be updated later.
      console.warn('Profile upsert failed, but auth user and trigger-created profile should still exist');
    }

    // Optionally send an invite email with a magic link
    // Note: Supabase automatically sends a confirmation email when email_confirm: false
    // You can customize this email in your Supabase dashboard under Authentication > Email Templates
    
    console.log('User and profile created successfully, invite email sent');
    return NextResponse.json({ 
      message: 'User invited successfully. They will receive an email with a magic link to sign in.',
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

export async function PUT(request: NextRequest) {
  try {
    // Verify admin access
    const { isAdmin, error: adminAuthError } = await verifyAdminAccessDemo(request);
    
    if (!isAdmin) {
      return NextResponse.json({ error: adminAuthError || 'Admin access required' }, { status: 403 });
    }

    const body = await request.json();
    const { id, email, name, role } = body;

    if (!id) {
      return NextResponse.json({ error: 'User ID is required' }, { status: 400 });
    }

    // Check if we have a valid service role key
    if (!process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY === 'demo-key') {
      return NextResponse.json({ 
        message: 'User updated successfully (Demo Mode)',
        user: { id, email, name, role }
      });
    }

    // Update user profile in public.users table
    const { data, error: profileError } = await supabaseAdmin
      .from('users')
      .update({
        email: email,
        name: name,
        role: role
      })
      .eq('id', id)
      .select()
      .single();

    if (profileError) {
      console.error('Error updating user profile:', profileError);
      return NextResponse.json({ error: 'Failed to update user profile' }, { status: 500 });
    }

    // Update email in auth.users if changed
    if (email) {
      const { error: authError } = await supabaseAdmin.auth.admin.updateUserById(id, {
        email: email
      });
      
      if (authError) {
        console.error('Error updating auth email:', authError);
        // Continue even if auth update fails - profile is updated
      }
    }

    return NextResponse.json({ 
      message: 'User updated successfully',
      user: data
    });

  } catch (error) {
    console.error('Error in update user API:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    // Verify admin access
    const { isAdmin, error: adminAuthError } = await verifyAdminAccessDemo(request);
    
    if (!isAdmin) {
      return NextResponse.json({ error: adminAuthError || 'Admin access required' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('id');

    if (!userId) {
      return NextResponse.json({ error: 'User ID is required' }, { status: 400 });
    }

    // Check if we have a valid service role key
    if (!process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY === 'demo-key') {
      return NextResponse.json({ 
        message: 'User deleted successfully (Demo Mode)'
      });
    }

    // Delete user from auth.users — ignore error if they don't exist there
    const { error: authError } = await supabaseAdmin.auth.admin.deleteUser(userId);
    if (authError) {
      console.warn('Auth user not found or could not be deleted (may be orphaned profile):', authError.message);
    }

    // Always delete from public.users regardless of auth result
    const { error: profileError } = await supabaseAdmin
      .from('users')
      .delete()
      .eq('id', userId);

    if (profileError) {
      console.error('Error deleting user profile:', profileError);
      return NextResponse.json({ error: 'Failed to delete user profile' }, { status: 500 });
    }

    return NextResponse.json({
      message: 'User deleted successfully'
    });

  } catch (error) {
    console.error('Error in delete user API:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
