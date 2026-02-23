import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import {
  sendPersonalDigestEmail,
  PersonalDigestData,
  TodoItem,
  VisitItem,
  EncouragementItem,
  FollowUpItem,
  NoteItem,
  CircleMeetingItem,
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

/** Get the weekday name for a date string (YYYY-MM-DD) */
function getDayName(dateStr: string): string {
  const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  return dayNames[new Date(dateStr + 'T00:00:00').getDay()];
}

/** Which Nth occurrence of that weekday is this in its month? (1–5) */
function getWeekOfMonth(dateStr: string): number {
  const d = new Date(dateStr + 'T00:00:00');
  return Math.ceil(d.getDate() / 7);
}

/**
 * Determines whether a circle actually meets on a given date based on its
 * frequency pattern (Weekly, Bi-weekly, 1st & 3rd, etc.)
 */
function doesCircleMeetOnDate(
  dateStr: string,
  leaderDay: string,
  frequency: string | null,
  meetingStartDate: string | null,
): boolean {
  // Day name must match
  if (getDayName(dateStr).toLowerCase() !== leaderDay.trim().toLowerCase()) return false;

  const freq = (frequency ?? '').trim().toLowerCase();

  // Week-of-month ordinal patterns ("1st, 3rd", "2nd & 4th", etc.)
  const has1st = /\b(1st|first)\b/.test(freq);
  const has2nd = /\b(2nd|second)\b/.test(freq);
  const has3rd = /\b(3rd|third)\b/.test(freq);
  const has4th = /\b(4th|fourth)\b/.test(freq);
  const has5th = /\b(5th|fifth)\b/.test(freq);
  const hasOrdinal = has1st || has2nd || has3rd || has4th || has5th;
  const mentionsWeekly = freq.includes('weekly') || freq.includes('every week');
  const isBiWeekly = freq.includes('bi-week') || freq.includes('biweekly') || freq.includes('every other') || freq.includes('2-week') || freq.includes('2 week');

  if (hasOrdinal && !mentionsWeekly && !isBiWeekly) {
    const weekNum = getWeekOfMonth(dateStr);
    const allowed: number[] = [];
    if (has1st) allowed.push(1);
    if (has2nd) allowed.push(2);
    if (has3rd) allowed.push(3);
    if (has4th) allowed.push(4);
    if (has5th) allowed.push(5);
    return allowed.includes(weekNum);
  }

  if (isBiWeekly) {
    if (!meetingStartDate) return true; // No anchor — include anyway
    const target = new Date(dateStr + 'T00:00:00').getTime();
    const anchor = new Date(meetingStartDate + 'T00:00:00').getTime();
    const diffWeeks = Math.round((target - anchor) / (7 * 86400000));
    return diffWeeks % 2 === 0;
  }

  // Monthly / quarterly — first occurrence of that weekday in the month
  if (freq.includes('quarter')) return false; // too infrequent
  if (freq.includes('month')) return getWeekOfMonth(dateStr) === 1;

  // Default: weekly
  return true;
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

  // 1a. Incomplete todos with a due date (due today or overdue)
  // Only include manual/untyped todos — follow_up, encouragement, and circle_visit
  // types are already shown in their own dedicated sections to avoid double-counting.
  const { data: allTodos } = await supabase
    .from('todo_items')
    .select('id, text, due_date, notes, todo_type, linked_leader_id, linked_visit_id')
    .eq('user_id', user.id)
    .eq('completed', false)
    .not('due_date', 'is', null)
    .lte('due_date', today)
    .or('todo_type.eq.manual,todo_type.is.null')
    .order('due_date', { ascending: true });

  // 1b. Incomplete todos with NO due date (manual/untyped only)
  const { data: noDateTodosData } = await supabase
    .from('todo_items')
    .select('id, text, due_date, notes, todo_type, linked_leader_id, linked_visit_id')
    .eq('user_id', user.id)
    .eq('completed', false)
    .is('due_date', null)
    .or('todo_type.eq.manual,todo_type.is.null')
    .order('id', { ascending: true });

  // Fetch leader names for todos that have linked_leader_id
  const allTodosForLeaders = [...(allTodos || []), ...(noDateTodosData || [])];
  const leaderIdsForTodos = Array.from(new Set(
    allTodosForLeaders.filter(t => t.linked_leader_id).map(t => t.linked_leader_id)
  ));
  let leaderNamesMap: Record<number, string> = {};
  if (leaderIdsForTodos.length > 0) {
    const { data: leaderRows } = await supabase
      .from('circle_leaders')
      .select('id, name')
      .in('id', leaderIdsForTodos);
    (leaderRows || []).forEach(l => { leaderNamesMap[l.id] = l.name; });
  }

  const mapTodo = (t: any): TodoItem => ({
    id: t.id,
    text: t.text,
    due_date: t.due_date,
    notes: t.notes,
    todo_type: t.todo_type,
    linked_leader_id: t.linked_leader_id,
    linked_leader_name: t.linked_leader_id ? leaderNamesMap[t.linked_leader_id] ?? null : null,
    linked_visit_id: t.linked_visit_id,
  });

  const todosRaw: TodoItem[] = (allTodos || []).map(mapTodo);
  const todosNoDate: TodoItem[] = (noDateTodosData || []).map(mapTodo);

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

  // 5. Upcoming scheduled circle visits (beyond this week, next 30 days)
  const monthEnd = getDateOffset(today, 30);
  const afterWeek = getDateOffset(today, 8); // day after weekEnd
  const { data: upcomingVisitsRaw } = await supabase
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
    .gte('visit_date', afterWeek)
    .lte('visit_date', monthEnd)
    .order('visit_date', { ascending: true })
    .limit(10);

  const upcomingVisits: VisitItem[] = (upcomingVisitsRaw || []).map(toVisit);

  // 6. Last 5 notes created by this user for circle leaders
  const { data: notesRaw } = await supabase
    .from('notes')
    .select(`
      id,
      circle_leader_id,
      content,
      created_at,
      circle_leaders!inner(name, campus)
    `)
    .eq('created_by', user.id)
    .order('created_at', { ascending: false })
    .limit(5);

  const recentNotes: NoteItem[] = (notesRaw || []).map((n: any) => ({
    id: n.id,
    circle_leader_id: n.circle_leader_id,
    leader_name: n.circle_leaders?.name ?? 'Unknown',
    leader_campus: n.circle_leaders?.campus,
    content: n.content,
    created_at: n.created_at,
  }));

  // 7. Upcoming circles (meetings today & tomorrow based on recurring schedule)
  const todayDayName = getDayName(today);
  const tomorrowDayName = getDayName(tomorrow);
  const dayNames = [todayDayName, tomorrowDayName];
  // Query leaders whose day field matches today or tomorrow
  const { data: circleLeadersRaw } = await supabase
    .from('circle_leaders')
    .select('id, name, circle_type, day, time, frequency, campus, meeting_start_date')
    .in('day', dayNames)
    .not('status', 'in', '("Inactive","Removed")')
    .order('time', { ascending: true });

  const toCircleMeeting = (l: any): CircleMeetingItem => ({
    leader_id: l.id,
    leader_name: l.name,
    circle_type: l.circle_type ?? undefined,
    day: l.day,
    time: l.time ?? 'TBD',
    frequency: l.frequency ?? 'Weekly',
    campus: l.campus ?? undefined,
  });

  const circlesToday: CircleMeetingItem[] = (circleLeadersRaw || [])
    .filter(l => doesCircleMeetOnDate(today, l.day, l.frequency, l.meeting_start_date))
    .map(toCircleMeeting);
  const circlesTomorrow: CircleMeetingItem[] = (circleLeadersRaw || [])
    .filter(l => doesCircleMeetOnDate(tomorrow, l.day, l.frequency, l.meeting_start_date))
    .map(toCircleMeeting);

  return {
    user,
    date: today,
    todos: { dueToday: todosDueToday, overdue: todosOverdue, noDate: todosNoDate },
    circleVisits: { today: visitsToday, thisWeek: visitsThisWeek },
    upcomingVisits,
    recentNotes,
    upcomingCircles: { today: circlesToday, tomorrow: circlesTomorrow },
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
      noDate: [
        { id: 4, text: 'Review new leader applications', due_date: null, notes: 'Check portal for pending applications', todo_type: 'manual', linked_leader_id: null, linked_leader_name: null, linked_visit_id: null },
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
    upcomingVisits: [
      { id: 'demo-3', visit_date: getDateOffset(today, 10), leader_id: 42, leader_name: 'Sarah Johnson', leader_campus: 'Main Campus', previsit_note: 'Follow up on fall plans' },
      { id: 'demo-4', visit_date: getDateOffset(today, 14), leader_id: 67, leader_name: 'Mike Chen', leader_campus: 'North Campus', previsit_note: null },
    ],
    recentNotes: [
      { id: 1, circle_leader_id: 42, leader_name: 'Sarah Johnson', leader_campus: 'Main Campus', content: 'Discussed fall semester plans and leadership development goals for the team.', created_at: yesterday },
      { id: 2, circle_leader_id: 67, leader_name: 'Mike Chen', leader_campus: 'North Campus', content: 'Checked in about new member integration process.', created_at: threeDaysAgo },
    ],
    upcomingCircles: {
      today: [
        { leader_id: 42, leader_name: 'Sarah Johnson', circle_type: 'Women', day: getDayName(today), time: '7:00 PM', frequency: 'Weekly', campus: 'Main Campus' },
        { leader_id: 89, leader_name: 'James Rivera', circle_type: 'Men', day: getDayName(today), time: '6:30 PM', frequency: '1st, 3rd', campus: 'South Campus' },
      ],
      tomorrow: [
        { leader_id: 67, leader_name: 'Mike Chen', circle_type: 'Mixed', day: getDayName(tomorrow), time: '6:00 PM', frequency: 'Weekly', campus: 'North Campus' },
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
 * Get the current hour in CST (America/Chicago).
 * Returns 0-23.
 */
function getCurrentCSTHour(): number {
  const now = new Date();
  // Use Intl to get the current hour in CST
  const cstHourStr = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Chicago',
    hour: 'numeric',
    hour12: false,
  }).format(now);
  return parseInt(cstHourStr, 10);
}

/**
 * Check if a user should receive a digest right now based on their frequency setting.
 * Emails are sent every N hours starting at 12am CST.
 * e.g. frequency=8 → send at hours 0, 8, 16 CST
 *      frequency=12 → send at hours 0, 12 CST
 *      frequency=24 → send at hour 0 CST
 */
function shouldSendDigest(frequencyHours: number, currentCSTHour: number): boolean {
  const freq = frequencyHours || 24;
  return currentCSTHour % freq === 0;
}

/**
 * POST /api/daily-summary
 * Sends personal digest emails to subscribed users whose frequency interval matches
 * the current CST hour. The Netlify cron calls this every hour.
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
    const currentCSTHour = getCurrentCSTHour();

    // Fetch all subscribed users with their frequency setting
    const { data: users, error: usersError } = await supabase
      .from('users')
      .select('id, name, email, daily_email_frequency_hours, last_digest_sent_at')
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
        currentCSTHour,
      });
    }

    let sent = 0;
    let skipped = 0;
    const errors: string[] = [];

    for (const user of users) {
      const frequencyHours = user.daily_email_frequency_hours || 24;

      // Check if this user's frequency matches the current CST hour
      if (!force && !shouldSendDigest(frequencyHours, currentCSTHour)) {
        skipped++;
        continue;
      }

      // Guard against double-sends: skip if we sent within the last (frequency - 1) hours
      if (!force && user.last_digest_sent_at) {
        const lastSent = new Date(user.last_digest_sent_at);
        const hoursSinceLastSend = (Date.now() - lastSent.getTime()) / (1000 * 60 * 60);
        if (hoursSinceLastSend < frequencyHours - 0.5) {
          skipped++;
          continue;
        }
      }

      try {
        const digestData = await buildDigestForUser(supabase, user, today);
        const hasContent =
          digestData.todos.dueToday.length > 0 ||
          digestData.todos.overdue.length > 0 ||
          digestData.todos.noDate.length > 0 ||
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
          console.log(`Digest sent to ${user.email} (freq=${frequencyHours}h, ${hasContent ? 'with items' : 'all clear'})`);

          // Update last_digest_sent_at
          await supabase
            .from('users')
            .update({ last_digest_sent_at: new Date().toISOString() })
            .eq('id', user.id);
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
      currentCSTHour,
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
