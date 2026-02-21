import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';

// Create admin client
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

/**
 * Create a Supabase client with the user's session from cookies
 */
function createServerClient(request: NextRequest) {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      auth: {
        persistSession: false
      }
    }
  );
}

/**
 * GET /api/profile
 * Get current user's profile and email preferences
 */
export async function GET(request: NextRequest) {
  try {
    // Try to get token from Authorization header first
    const authHeader = request.headers.get('authorization');
    console.log('Auth header:', authHeader ? 'Present' : 'Missing');
    
    const token = authHeader?.replace('Bearer ', '');
    console.log('Token extracted:', token ? `Yes (${token.substring(0, 20)}...)` : 'No');

    if (!token) {
      console.error('No authorization token provided');
      return NextResponse.json({ error: 'Unauthorized - No token' }, { status: 401 });
    }

    // Create Supabase client and verify the token
    console.log('Creating Supabase client and verifying token...');
    const supabase = createServerClient(request);
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError) {
      console.error('Auth error:', authError);
      return NextResponse.json({ error: `Unauthorized - ${authError.message}` }, { status: 401 });
    }

    if (!user) {
      console.error('No user found');
      return NextResponse.json({ error: 'Unauthorized - No user' }, { status: 401 });
    }

    console.log('User authenticated:', user.id);

    // Get user profile (may not exist yet)
    const { data: profile, error: profileError } = await supabase
      .from('users')
      .select('*')
      .eq('id', user.id)
      .maybeSingle(); // Use maybeSingle() instead of single() to handle 0 rows gracefully

    // If no profile exists, create a basic one from auth data
    let userProfile = profile;
    if (!profile && !profileError) {
      console.log('No profile found in users table, creating basic profile from auth data');
      userProfile = {
        id: user.id,
        email: user.email || '',
        name: user.user_metadata?.name || user.email?.split('@')[0] || 'User',
        role: 'user'
      };
    } else if (profileError) {
      console.error('Error fetching profile:', profileError);
      return NextResponse.json({ error: 'Failed to fetch profile' }, { status: 500 });
    }

    // Get email preferences (or return defaults if not set or table doesn't exist)
    let emailPrefs = null;
    let prefsError: any = null;
    
    try {
      const result = await supabase
        .from('user_email_preferences')
        .select('*')
        .eq('user_id', user.id)
        .single();
      
      emailPrefs = result.data;
      prefsError = result.error;
    } catch (error: any) {
      // Table might not exist yet, that's okay
      console.log('Email preferences table not accessible:', error.message);
      prefsError = error;
    }

    // If no preferences exist or table doesn't exist, return default values
    const preferences = (prefsError || !emailPrefs) ? {
      email_enabled: true,
      email_address: null,
      include_follow_ups: true,
      include_overdue_tasks: true,
      include_planned_encouragements: true,
      include_upcoming_meetings: false,
      preferred_time: '08:00',
      timezone: 'UTC'
    } : emailPrefs;

    return NextResponse.json({
      profile: userProfile,
      preferences,
      hasPreferences: !prefsError && !!emailPrefs
    });

  } catch (error: any) {
    console.error('Error in profile GET:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * PUT /api/profile
 * Update current user's profile and/or email preferences
 */
export async function PUT(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization');
    const token = authHeader?.replace('Bearer ', '');

    if (!token) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = createServerClient(request);
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { profile, preferences, password } = body;

    // Update profile if provided
    if (profile) {
      const { name } = profile;
      
      // Use upsert to either update existing row or insert new one
      const { error: profileError } = await supabase
        .from('users')
        .upsert({
          id: user.id,
          email: user.email,
          name,
          role: 'user'
        }, {
          onConflict: 'id'
        });

      if (profileError) {
        console.error('Error updating profile:', profileError);
        return NextResponse.json({ error: 'Failed to update profile' }, { status: 500 });
      }
    }

    // Update email preferences if provided
    if (preferences) {
      try {
        const {
          email_enabled,
          email_address,
          include_follow_ups,
          include_overdue_tasks,
          include_planned_encouragements,
          include_upcoming_meetings,
          preferred_time,
          timezone
        } = preferences;

        // Check if preferences already exist
        const { data: existingPrefs } = await supabase
          .from('user_email_preferences')
          .select('id')
          .eq('user_id', user.id)
          .single();

        if (existingPrefs) {
          // Update existing preferences
          const { error: updateError } = await supabase
            .from('user_email_preferences')
            .update({
              email_enabled,
              email_address,
              include_follow_ups,
              include_overdue_tasks,
              include_planned_encouragements,
              include_upcoming_meetings,
              preferred_time,
              timezone
            })
            .eq('user_id', user.id);

          if (updateError) {
            console.error('Error updating preferences:', updateError);
            return NextResponse.json({ error: 'Failed to update preferences' }, { status: 500 });
          }
        } else {
          // Insert new preferences
          const { error: insertError } = await supabase
            .from('user_email_preferences')
            .insert({
              user_id: user.id,
              email_enabled,
              email_address,
              include_follow_ups,
              include_overdue_tasks,
              include_planned_encouragements,
              include_upcoming_meetings,
              preferred_time,
              timezone
            });

          if (insertError) {
            console.error('Error inserting preferences:', insertError);
            return NextResponse.json({ error: 'Failed to create preferences' }, { status: 500 });
          }
        }
      } catch (error: any) {
        // Table might not exist yet
        console.error('Error updating email preferences (table may not exist):', error.message);
        return NextResponse.json({ 
          error: 'Email preferences feature not available. Please run the database migration first.' 
        }, { status: 503 });
      }
    }

    // Update password if provided (requires admin client)
    if (password && password.newPassword) {
      if (!process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY === 'demo-key') {
        return NextResponse.json({ 
          message: 'Password update skipped (Demo Mode)',
        });
      }

      const { error: passwordError } = await supabaseAdmin.auth.admin.updateUserById(user.id, {
        password: password.newPassword
      });

      if (passwordError) {
        console.error('Error updating password:', passwordError);
        return NextResponse.json({ error: 'Failed to update password' }, { status: 500 });
      }
    }

    return NextResponse.json({ 
      message: 'Profile updated successfully'
    });

  } catch (error: any) {
    console.error('Error in profile PUT:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
