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

    // Get email preferences from users table columns
    let emailPrefs: Record<string, unknown> | null = null;
    try {
      const { data: userPrefs } = await supabase
        .from('users')
        .select('daily_email_subscribed, daily_email_time')
        .eq('id', user.id)
        .maybeSingle();
      if (userPrefs) {
        emailPrefs = {
          email_enabled: userPrefs.daily_email_subscribed ?? false,
          email_address: null,
          include_follow_ups: true,
          include_overdue_tasks: true,
          include_planned_encouragements: true,
          include_upcoming_meetings: false,
          preferred_time: userPrefs.daily_email_time || '08:00',
          timezone: 'UTC'
        };
      }
    } catch (error: any) {
      console.log('Could not load email prefs from users table:', error.message);
    }

    // Fall back to defaults
    const preferences = emailPrefs ?? {
      email_enabled: false,
      email_address: null,
      include_follow_ups: true,
      include_overdue_tasks: true,
      include_planned_encouragements: true,
      include_upcoming_meetings: false,
      preferred_time: '08:00',
      timezone: 'UTC'
    };

    return NextResponse.json({
      profile: userProfile,
      preferences,
      hasPreferences: !!emailPrefs
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
    // Stored in the users table (daily_email_subscribed, daily_email_time columns)
    if (preferences) {
      try {
        const updatePayload: Record<string, unknown> = {};

        // Map legacy preference fields to our actual columns
        if (typeof preferences.email_enabled === 'boolean') {
          updatePayload.daily_email_subscribed = preferences.email_enabled;
        }
        if (preferences.preferred_time) {
          updatePayload.daily_email_time = preferences.preferred_time;
        }

        // Only update if there's something to write
        if (Object.keys(updatePayload).length > 0) {
          const { error: prefUpdateError } = await supabase
            .from('users')
            .update(updatePayload)
            .eq('id', user.id);

          if (prefUpdateError) {
            console.error('Error updating email preferences:', prefUpdateError);
            // Non-fatal — continue without failing the whole request
          }
        }
      } catch (error: any) {
        console.error('Error updating email preferences:', error.message);
        // Non-fatal — don't fail the request
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
