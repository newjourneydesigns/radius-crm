import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import {
  sendPersonalDigestEmail,
  PersonalDigestData,
  TodoItem,
  VisitItem,
  EncouragementItem,
  FollowUpItem,
} from '../../../lib/emailService';

function getSupabaseServiceClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !supabaseServiceKey) throw new Error('Missing Supabase credentials');
  return createClient(supabaseUrl, supabaseServiceKey);
}

function getTodayDate(): string {
  return new Date().toISOString().split('T')[0];
}

function getDateOffset(baseDate: string, days: number): string {
  const d = new Date(baseDate + 'T00:00:00');
  d.setDate(d.getDate() + days);
  return d.toISOString().split('T')[0];
}

/**
 * Build PersonalDigestData for a single user
 */
async function buildDigestForUser(
  supabase: ReturnType<typeof getSupabaseServiceClient>,
  user: { id: string; name: string; email: string },
  today: string
): Promise<PersonalDigestData> {
  const weekEnd = getDateOffset(today, 7);
  const tomorrow = getDateOffset(today, 1);

  // 1. All incomplete todos for this user
  const { data: allTodos } = await supabase
    .from('todo_items')
    .select('id, text, due_date, notes, todo_type, linked_leader_id, linked_visit_id')
    .eq('user_id', user.id)
    .eq('completed', false)
    .not('due_date', 'is', null)
    .lte('due_date', today)
    .order('due_date', { ascending: true });

  // Fetch leader names for todos that have linked_leader_id
  const leaderIdsForTodos = Array.from(new Set(
    (allTodos || []).filter(t => t.linked_leader_id).map(t => t.linked_leader_id)
  ));
  let leaderNamesMap: Record<number, string> = {};
  if (leaderIdsForTodos.length > 0) {
    const { data: leaderRows } = await supabase
      .from('circle_leaders')
      .select('id, name')
      .in('id', leaderIdsForTodos);
    (leaderRows || []).forEach(l => { leaderNamesMap[l.id] = l.name; });
  }

  const todosRaw: TodoItem[] = (allTodos || []).map(t => ({
    id: t.id,
    text: t.text,
    due_date: t.due_date,
    notes: t.notes,
    todo_type: t.todo_type,
    linked_leader_id: t.linked_leader_id,
    linked_leader_name: t.linked_leader_id ? leaderNamesMap[t.linked_leader_id] ?? null : null,
    linked_visit_id: t.linked_visit_id,
  }));

  const todosDueToday = todosRaw.filter(t => t.due_date === today);
  const todosOverdue = todosRaw.filter(t => t.due_date !== null && t.due_date < today);

  // 2. Circle visits for this user
  const { data: visitsRaw } = await supabase
    .from('circle_visits')
    .select(`
      id,
      visit_date,
      leader_id,
      previsit_note,
      circle_leaders!inner(name, campus)
    `)
    .eq('scheduled_by', user.id)
    .eq('status', 'scheduled')
    .gte('visit_date', today)
    .lte('visit_date', weekEnd)
    .order('visit_date', { ascending: true });

  const toVisit = (v: any): VisitItem => ({
    id: v.id,
    visit_date: v.visit_date,
    leader_id: v.leader_id,
    leader_name: v.circle_leaders?.name ?? 'Unknown',
    leader_campus: v.circle_leaders?.campus,
    previsit_note: v.previsit_note,
  });

  const visitsToday: VisitItem[] = (visitsRaw || []).filter(v => v.visit_date === today).map(toVisit);
  const visitsThisWeek: VisitItem[] = (visitsRaw || []).filter(v => v.visit_date >= tomorrow && v.visit_date <= weekEnd).map(toVisit);

  // 3. Encouragements for this user (planned, due today or overdue)
  const { data: encsRaw } = await supabase
    .from('acpd_encouragements')
    .select(`
      id,
      circle_leader_id,
      encourage_method,
      message_date,
      note,
      circle_leaders!inner(name, campus)
    `)
    .eq('user_id', user.id)
    .eq('message_type', 'planned')
    .lte('message_date', today)
    .order('message_date', { ascending: true });

  const toEnc = (e: any): EncouragementItem => ({
    id: e.id,
    circle_leader_id: e.circle_leader_id,
    leader_name: e.circle_leaders?.name ?? 'Unknown',
    leader_campus: e.circle_leaders?.campus,
    encourage_method: e.encourage_method,
    message_date: e.message_date,
    note: e.note,
  });

  const encsDueToday: EncouragementItem[] = (encsRaw || []).filter(e => e.message_date === today).map(toEnc);
  const encsOverdue: EncouragementItem[] = (encsRaw || []).filter(e => e.message_date < today).map(toEnc);

  // 4. Follow-ups from circle_leaders (all with follow_up_required, due today or overdue)
  const { data: followUpsRaw } = await supabase
    .from('circle_leaders')
    .select('id, name, campus, follow_up_date')
    .eq('follow_up_required', true)
    .or(`follow_up_date.lte.${today},follow_up_date.is.null`)
    .order('follow_up_date', { ascending: true });

  const toFU = (f: any): FollowUpItem => ({
    id: f.id,
    name: f.name,
    campus: f.campus,
    follow_up_date: f.follow_up_date,
  });

  const fuDueToday: FollowUpItem[] = (followUpsRaw || []).filter(f => f.follow_up_date === today).map(toFU);
  const fuOverdue: FollowUpItem[] = (followUpsRaw || []).filter(f => !f.follow_up_date || f.follow_up_date < today).map(toFU);

  return {
    user,
    date: today,
    todos: { dueToday: todosDueToday, overdue: todosOverdue },
    circleVisits: { today: visitsToday, thisWeek: visitsThisWeek },
    encouragements: { dueToday: encsDueToday, overdue: encsOverdue },
    followUps: { dueToday: fuDueToday, overdue: fuOverdue },
  };
}

/**
 * Build a demo digest with fake data (for testing when real DB has nothing due)
 */
function buildDemoDigest(user: { id: string; name: string; email: string }, today: string): PersonalDigestData {
  const yesterday = getDateOffset(today, -1);
  const threeDaysAgo = getDateOffset(today, -3);
  const tomorrow = getDateOffset(today, 1);

  return {
    user,
    date: today,
    todos: {
      dueToday: [
        { id: 1, text: 'Prepare for small group debrief', due_date: today, notes: 'Review last week\'s notes first', todo_type: 'manual', linked_leader_id: null, linked_leader_name: null, linked_visit_id: null },
        { id: 2, text: 'Call Sarah about leadership training', due_date: today, notes: null, todo_type: 'follow_up', linked_leader_id: 42, linked_leader_name: 'Sarah Johnson', linked_visit_id: null },
      ],
      overdue: [
        { id: 3, text: 'Submit monthly report', due_date: threeDaysAgo, notes: 'Q3 summary needed', todo_type: 'manual', linked_leader_id: null, linked_leader_name: null, linked_visit_id: null },
      ],
    },
    circleVisits: {
      today: [
        { id: 'demo-1', visit_date: today, leader_id: 42, leader_name: 'Sarah Johnson', leader_campus: 'Main Campus', previsit_note: 'Discuss vision for fall semester' },
      ],
      thisWeek: [
        { id: 'demo-2', visit_date: tomorrow, leader_id: 67, leader_name: 'Mike Chen', leader_campus: 'North Campus', previsit_note: null },
      ],
    },
    encouragements: {
      dueToday: [
        { id: 1, circle_leader_id: 42, leader_name: 'Sarah Johnson', leader_campus: 'Main Campus', encourage_method: 'text', message_date: today, note: 'Great job with last week\'s group!' },
      ],
      overdue: [
        { id: 2, circle_leader_id: 67, leader_name: 'Mike Chen', leader_campus: 'North Campus', encourage_method: 'email', message_date: yesterday, note: null },
      ],
    },
    followUps: {
      dueToday: [
        { id: 89, name: 'James Rivera', campus: 'South Campus', follow_up_date: today },
      ],
      overdue: [
        { id: 94, name: 'Lisa Park', campus: 'East Campus', follow_up_date: threeDaysAgo },
      ],
    },
  };
}

/** Verify request is from the cron job or an admin */
function isAuthorized(request: NextRequest): boolean {
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) return true; // No secret configured - allow all (dev mode)
  return authHeader === `Bearer ${cronSecret}`;
}

/**
 * POST /api/daily-summary
 * Sends personal digest emails to all subscribed users.
 * Accepts { force: true, testEmail: "..." } to send a demo to a specific address.
 */
export async function POST(request: NextRequest) {
  try {
    if (!isAuthorized(request)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    const force: boolean = body.force === true;
    const testEmail: string | undefined = body.testEmail;

    const today = getTodayDate();

    // Test mode: send demo digest to a specified address
    if (force && testEmail) {
      const demoData = buildDemoDigest({ id: 'test', name: 'Test User', email: testEmail }, today);
      const result = await sendPersonalDigestEmail(demoData);
      return NextResponse.json({
        success: result.success,
        message: result.success ? `Demo digest sent to ${testEmail}` : result.error,
        mode: 'demo',
      });
    }

    const supabase = getSupabaseServiceClient();

    // Fetch all subscribed users
    const { data: users, error: usersError } = await supabase
      .from('users')
      .select('id, name, email')
      .eq('daily_email_subscribed', true)
      .not('email', 'is', null);

    if (usersError) {
      console.error('Error fetching subscribed users:', usersError);
      return NextResponse.json({ error: usersError.message }, { status: 500 });
    }

    if (!users || users.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'No users are subscribed to daily digests.',
        sent: 0,
        skipped: 0,
      });
    }

    let sent = 0;
    let skipped = 0;
    const errors: string[] = [];

    for (const user of users) {
      try {
        const digestData = await buildDigestForUser(supabase, user, today);
        const hasContent =
          digestData.todos.dueToday.length > 0 ||
          digestData.todos.overdue.length > 0 ||
          digestData.circleVisits.today.length > 0 ||
          digestData.circleVisits.thisWeek.length > 0 ||
          digestData.encouragements.dueToday.length > 0 ||
          digestData.encouragements.overdue.length > 0 ||
          digestData.followUps.dueToday.length > 0 ||
          digestData.followUps.overdue.length > 0;

        // Always send even if no content (the email will show the "all clear" message)
        const result = await sendPersonalDigestEmail(digestData);
        if (result.success) {
          sent++;
          console.log(`Digest sent to ${user.email} (${hasContent ? 'with items' : 'all clear'})`);
        } else {
          errors.push(`${user.email}: ${result.error}`);
        }
      } catch (err: any) {
        console.error(`Error building digest for ${user.email}:`, err);
        errors.push(`${user.email}: ${err.message}`);
      }
    }

    return NextResponse.json({
      success: true,
      message: `Daily digests processed`,
      sent,
      skipped,
      errors: errors.length > 0 ? errors : undefined,
      total: users.length,
    });
  } catch (error: any) {
    console.error('Error in daily summary POST:', error);
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 });
  }
}

/**
 * GET /api/daily-summary
 * Preview the digest data for the current user (or all users if admin).
 * Requires Authorization: Bearer {CRON_SECRET}
 */
export async function GET(request: NextRequest) {
  try {
    if (!isAuthorized(request)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const today = getTodayDate();
    const supabase = getSupabaseServiceClient();

    const { data: users, error } = await supabase
      .from('users')
      .select('id, name, email, daily_email_subscribed')
      .not('email', 'is', null);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({
      success: true,
      today,
      subscribedCount: (users || []).filter(u => u.daily_email_subscribed).length,
      totalUsers: (users || []).length,
      users: (users || []).map(u => ({
        id: u.id,
        name: u.name,
        email: u.email,
        subscribed: u.daily_email_subscribed,
      })),
    });
  } catch (error: any) {
    console.error('Error in daily summary GET:', error);
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 });
  }
}
