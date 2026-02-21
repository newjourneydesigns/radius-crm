import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { sendPersonalDigestEmail, PersonalDigestData } from '../../../../lib/emailService';

function createServerClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false } }
  );
}

export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization');
    const token = authHeader?.replace('Bearer ', '');

    if (!token) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = createServerClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const recipientEmail = user.email;
    if (!recipientEmail) {
      return NextResponse.json({ error: 'No email address found' }, { status: 400 });
    }

    const { data: profile } = await supabase
      .from('users')
      .select('name')
      .eq('id', user.id)
      .maybeSingle();

    const userName = profile?.name || recipientEmail.split('@')[0];
    const today = new Date().toISOString().split('T')[0];
    const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];

    // Build a rich demo digest using the real email template
    const testData: PersonalDigestData = {
      user: { id: user.id, name: userName, email: recipientEmail },
      date: today,
      todos: {
        dueToday: [
          { id: 1, text: 'Follow up with circle leader about attendance', due_date: today, notes: null, todo_type: 'manual', linked_leader_id: null, linked_visit_id: null },
          { id: 2, text: 'Prepare discussion questions for Wednesday', due_date: today, notes: 'Focus on application', todo_type: 'manual', linked_leader_id: null, linked_visit_id: null },
        ],
        overdue: [
          { id: 3, text: 'Send monthly encouragement note', due_date: yesterday, notes: null, todo_type: 'encouragement', linked_leader_id: 1, linked_leader_name: 'Sarah Johnson', linked_visit_id: null },
        ],
      },
      circleVisits: {
        today: [
          { id: 'v1', visit_date: today, leader_id: 1, leader_name: 'Sarah Johnson', leader_campus: 'Main Campus', previsit_note: 'Discuss vision for fall semester' },
        ],
        thisWeek: [],
      },
      encouragements: {
        dueToday: [
          { id: 1, circle_leader_id: 1, leader_name: 'Sarah Johnson', leader_campus: 'Main Campus', encourage_method: 'Text', message_date: today, note: 'Great job with last week\'s group!' },
        ],
        overdue: [],
      },
      followUps: {
        dueToday: [
          { id: 2, name: 'James Rivera', campus: 'South Campus', follow_up_date: today },
        ],
        overdue: [],
      },
    };

    const result = await sendPersonalDigestEmail(testData);

    if (!result.success) {
      return NextResponse.json({ error: result.error || 'Failed to send test email' }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      message: `Test email sent successfully to ${recipientEmail}`,
      recipient: recipientEmail,
    });

  } catch (error: any) {
    console.error('Error in test email:', error);
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 });
  }
}
