import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { sendDailySummaryEmail, DailySummaryData } from '../../../../lib/emailService';

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
 * POST /api/profile/test-email
 * Send a test daily summary email to the current user
 */
export async function POST(request: NextRequest) {
  try {
    // Get the current user from the request
    const authHeader = request.headers.get('authorization');
    const token = authHeader?.replace('Bearer ', '');

    if (!token) {
      console.error('No authorization token provided');
      return NextResponse.json({ error: 'Unauthorized - No token' }, { status: 401 });
    }

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

    // Get user's email preferences (if table exists)
    let preferences: any = null;
    try {
      const result = await supabase
        .from('user_email_preferences')
        .select('*')
        .eq('user_id', user.id)
        .single();
      preferences = result.data;
    } catch (error: any) {
      console.log('Email preferences table not accessible, using defaults:', error.message);
      // Table might not exist yet, will use default preferences
    }

    // Determine which email to send to
    const recipientEmail = preferences?.email_address || user.email;

    if (!recipientEmail) {
      return NextResponse.json({ error: 'No email address found' }, { status: 400 });
    }

    // Get user profile for customization
    const { data: profile } = await supabase
      .from('users')
      .select('name')
      .eq('id', user.id)
      .single();

    // Create test data based on user's preferences
    const testData: DailySummaryData = {
      followUpLeaders: [
        {
          id: 1,
          name: 'John Smith',
          campus: 'Main Campus',
          followUpDate: new Date().toISOString().split('T')[0],
          overdueTasks: preferences?.include_overdue_tasks !== false ? [
            {
              id: 1,
              text: 'Follow up about Bible study attendance',
              dueDate: new Date(Date.now() - 86400000).toISOString().split('T')[0] // Yesterday
            },
            {
              id: 2,
              text: 'Send encouragement note',
              dueDate: new Date(Date.now() - 172800000).toISOString().split('T')[0] // 2 days ago
            }
          ] : [],
          plannedEncouragements: preferences?.include_planned_encouragements !== false ? [
            {
              id: 1,
              method: 'Text',
              date: new Date().toISOString().split('T')[0],
              note: 'Great job leading your circle this week!'
            }
          ] : []
        },
        {
          id: 2,
          name: 'Sarah Johnson',
          campus: 'North Campus',
          followUpDate: new Date(Date.now() - 86400000).toISOString().split('T')[0],
          overdueTasks: preferences?.include_overdue_tasks !== false ? [
            {
              id: 3,
              text: 'Schedule coffee meeting',
              dueDate: new Date(Date.now() - 259200000).toISOString().split('T')[0] // 3 days ago
            }
          ] : [],
          plannedEncouragements: preferences?.include_planned_encouragements !== false ? [
            {
              id: 2,
              method: 'Email',
              date: new Date().toISOString().split('T')[0],
              note: 'Praying for your circle today!'
            }
          ] : []
        }
      ],
      date: new Date().toISOString().split('T')[0]
    };

    // Filter leaders based on preferences
    if (!preferences?.include_follow_ups) {
      testData.followUpLeaders = [];
    }

    // Send the test email
    const result = await sendDailySummaryEmail(recipientEmail, testData);

    if (!result.success) {
      return NextResponse.json(
        { error: result.error || 'Failed to send test email' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: `Test email sent successfully to ${recipientEmail}`,
      recipient: recipientEmail
    });

  } catch (error: any) {
    console.error('Error in test email:', error);
    return NextResponse.json({ 
      error: error.message || 'Internal server error' 
    }, { status: 500 });
  }
}
