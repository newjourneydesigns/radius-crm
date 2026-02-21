import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import {
  sendPersonalDigestEmail,
  PersonalDigestData,
  TodoItem,
  VisitItem,
  EncouragementItem,
  FollowUpItem,
} from '../../../../lib/emailService';

function getSupabaseServiceClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !supabaseServiceKey) throw new Error('Missing Supabase credentials');
  return createClient(supabaseUrl, supabaseServiceKey);
}

function getDateOffset(baseDate: string, days: number): string {
  const d = new Date(baseDate + 'T00:00:00');
  d.setDate(d.getDate() + days);
  return d.toISOString().split('T')[0];
}

export async function POST(request: NextRequest) {
  try {
    // Authenticate the user via Bearer token
    const authHeader = request.headers.get('authorization');
    const token = authHeader?.replace('Bearer ', '');
    if (!token) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Use anon client just for verifying the token
    const anonClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { auth: { persistSession: false } }
    );
    const { data: { user }, error: authError } = await anonClient.auth.getUser(token);
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const recipientEmail = user.email;
    if (!recipientEmail) {
      return NextResponse.json({ error: 'No email address found' }, { status: 400 });
    }

    // Use service client for all DB queries (same as the real cron)
    const supabase = getSupabaseServiceClient();

    const { data: profileRow } = await supabase
      .from('users')
      .select('name')
      .eq('id', user.id)
      .maybeSingle();

    const userName = profileRow?.name || recipientEmail.split('@')[0];
    const today = new Date().toISOString().split('T')[0];
    const weekEnd = getDateOffset(today, 7);
    const tomorrow = getDateOffset(today, 1);

    // ── 1. Todos (manual/untyped only — typed todos appear in their own sections) ──
    const { data: allTodos } = await supabase
      .from('todo_items')
      .select('id, text, due_date, notes, todo_type, linked_leader_id, linked_visit_id')
      .eq('user_id', user.id)
      .eq('completed', false)
      .not('due_date', 'is', null)
      .lte('due_date', today)
      .or('todo_type.eq.manual,todo_type.is.null')
      .order('due_date', { ascending: true });

    const { data: noDateTodosData } = await supabase
      .from('todo_items')
      .select('id, text, due_date, notes, todo_type, linked_leader_id, linked_visit_id')
      .eq('user_id', user.id)
      .eq('completed', false)
      .is('due_date', null)
      .or('todo_type.eq.manual,todo_type.is.null')
      .order('id', { ascending: true });

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

    // ── 2. Circle visits ──────────────────────────────────────────────────
    const { data: visitsRaw } = await supabase
      .from('circle_visits')
      .select('id, visit_date, leader_id, previsit_note, circle_leaders!inner(name, campus)')
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

    // ── 3. Encouragements ────────────────────────────────────────────────
    const { data: encsRaw } = await supabase
      .from('acpd_encouragements')
      .select('id, circle_leader_id, encourage_method, message_date, note, circle_leaders!inner(name, campus)')
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

    // ── 4. Follow-ups ────────────────────────────────────────────────────
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

    const digestData: PersonalDigestData = {
      user: { id: user.id, name: userName, email: recipientEmail },
      date: today,
      todos: {
        dueToday: todosRaw.filter(t => t.due_date === today),
        overdue: todosRaw.filter(t => t.due_date !== null && t.due_date < today),
        noDate: todosNoDate,
      },
      circleVisits: {
        today: (visitsRaw || []).filter(v => v.visit_date === today).map(toVisit),
        thisWeek: (visitsRaw || []).filter(v => v.visit_date >= tomorrow && v.visit_date <= weekEnd).map(toVisit),
      },
      encouragements: {
        dueToday: (encsRaw || []).filter(e => e.message_date === today).map(toEnc),
        overdue: (encsRaw || []).filter(e => e.message_date < today).map(toEnc),
      },
      followUps: {
        dueToday: (followUpsRaw || []).filter(f => f.follow_up_date === today).map(toFU),
        overdue: (followUpsRaw || []).filter(f => !f.follow_up_date || f.follow_up_date < today).map(toFU),
      },
    };

    const result = await sendPersonalDigestEmail(digestData);

    if (!result.success) {
      return NextResponse.json({ error: result.error || 'Failed to send email' }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      message: `Live digest sent to ${recipientEmail}`,
      recipient: recipientEmail,
      counts: {
        todayTodos: digestData.todos.dueToday.length,
        overdueTodos: digestData.todos.overdue.length,
        noDateTodos: digestData.todos.noDate.length,
        visitsToday: digestData.circleVisits.today.length,
        visitsThisWeek: digestData.circleVisits.thisWeek.length,
        encouragementsToday: digestData.encouragements.dueToday.length,
        encouragementsOverdue: digestData.encouragements.overdue.length,
        followUpsToday: digestData.followUps.dueToday.length,
        followUpsOverdue: digestData.followUps.overdue.length,
      },
    });

  } catch (error: any) {
    console.error('Error in test email:', error);
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 });
  }
}
