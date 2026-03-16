import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import {
  sendPersonalDigestEmail,
  PersonalDigestData,
  CardDigestItem,
  ChecklistDigestItem,
  VisitItem,
  EncouragementItem,
  FollowUpItem,
  NoteItem,
  CircleMeetingItem,
  BirthdayItem,
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

function getDayName(dateStr: string): string {
  const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  return dayNames[new Date(dateStr + 'T00:00:00').getDay()];
}

function getWeekOfMonth(dateStr: string): number {
  const d = new Date(dateStr + 'T00:00:00');
  return Math.ceil(d.getDate() / 7);
}

function doesCircleMeetOnDate(
  dateStr: string,
  leaderDay: string,
  frequency: string | null,
  meetingStartDate: string | null,
): boolean {
  if (getDayName(dateStr).toLowerCase() !== leaderDay.trim().toLowerCase()) return false;
  const freq = (frequency ?? '').trim().toLowerCase();
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
    if (!meetingStartDate) return true;
    const target = new Date(dateStr + 'T00:00:00').getTime();
    const anchor = new Date(meetingStartDate + 'T00:00:00').getTime();
    const diffWeeks = Math.round((target - anchor) / (7 * 86400000));
    return diffWeeks % 2 === 0;
  }
  if (freq.includes('quarter')) return false;
  if (freq.includes('month')) return getWeekOfMonth(dateStr) === 1;
  return true;
}

/**
 * GET /api/profile/test-email
 * Returns the status of required env vars — no auth needed, no email sent.
 */
export async function GET(_request: NextRequest) {
  return NextResponse.json({
    env: {
      RESEND_API_KEY: process.env.RESEND_API_KEY ? 'SET ✓' : 'MISSING ✗',
      EMAIL_FROM: process.env.EMAIL_FROM ? `SET ✓ (${process.env.EMAIL_FROM})` : 'MISSING ✗ (will use onboarding@resend.dev)',
      EMAIL_FROM_NAME: process.env.EMAIL_FROM_NAME ? `SET ✓ (${process.env.EMAIL_FROM_NAME})` : 'MISSING ✗',
      NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL ? `SET ✓ (${process.env.NEXT_PUBLIC_APP_URL})` : 'MISSING ✗ (will default to https://myradiuscrm.com)',
      SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY ? 'SET ✓' : 'MISSING ✗',
      CRON_SECRET: process.env.CRON_SECRET ? 'SET ✓' : 'MISSING ✗',
    }
  });
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
    // Use CST so date logic matches the church's timezone
    const nowCST = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Chicago' }));
    const today = `${nowCST.getFullYear()}-${String(nowCST.getMonth() + 1).padStart(2, '0')}-${String(nowCST.getDate()).padStart(2, '0')}`;
    const weekEnd = getDateOffset(today, 7);
    const tomorrow = getDateOffset(today, 1);

    // ── 1. Circle visits ──────────────────────────────────────────────────
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

    // ── 5. Upcoming visits (8–30 days out) ────────────────────────────────
    const day8 = getDateOffset(today, 8);
    const day30 = getDateOffset(today, 30);
    const { data: upcomingVisitsRaw } = await supabase
      .from('circle_visits')
      .select('id, visit_date, leader_id, previsit_note, circle_leaders!inner(name, campus)')
      .eq('scheduled_by', user.id)
      .eq('status', 'scheduled')
      .gte('visit_date', day8)
      .lte('visit_date', day30)
      .order('visit_date', { ascending: true })
      .limit(10);

    const upcomingVisits: VisitItem[] = (upcomingVisitsRaw || []).map(toVisit);

    // ── 6. Recent notes (last 5) ──────────────────────────────────────────
    const { data: notesRaw } = await supabase
      .from('notes')
      .select('id, circle_leader_id, content, created_at, circle_leaders!inner(name, campus)')
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

    // ── 7. Upcoming circles (meetings today & tomorrow) ──────────────────
    const todayDayName = getDayName(today);
    const tomorrowDayName = getDayName(tomorrow);
    const dayNames = [todayDayName, tomorrowDayName];
    const { data: circleLeadersRaw } = await supabase
      .from('circle_leaders')
      .select('id, name, circle_type, day, time, frequency, campus, meeting_start_date')
      .eq('acpd', userName)
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

    // ── 8. Birthdays today ─────────────────────────────────────────────
    const { data: birthdayLeaders } = await supabase
      .from('circle_leaders')
      .select('id, name, campus, birthday, phone')
      .not('birthday', 'is', null)
      .neq('birthday', '')
      .not('status', 'in', '("Inactive","Removed")');

    const todayDate = new Date(today + 'T00:00:00');
    const todayMonth = todayDate.getMonth() + 1;
    const todayDay = todayDate.getDate();

    const birthdays: BirthdayItem[] = (birthdayLeaders || []).filter(l => {
      if (!l.birthday) return false;
      const raw = (l.birthday as string).trim();
      let month: number, day: number;
      if (raw.includes('/')) {
        const parts = raw.split('/');
        month = parseInt(parts[0], 10);
        day = parseInt(parts[1], 10);
      } else if (raw.includes('-')) {
        const parts = raw.split('-');
        month = parseInt(parts[1], 10);
        day = parseInt(parts[2], 10);
      } else {
        return false;
      }
      return month === todayMonth && day === todayDay;
    }).map(l => ({ id: l.id, name: l.name, campus: l.campus ?? undefined, birthday: l.birthday, phone: l.phone || undefined }));

    // ── Fetch section preferences ──────────────────────────────────────
    const { data: userPrefs } = await supabase
      .from('users')
      .select('include_follow_ups, include_overdue_tasks, include_planned_encouragements, include_upcoming_meetings, include_birthdays, include_board_cards_owned, include_board_cards_assigned, include_checklist_items')
      .eq('id', user.id)
      .single();

    const sectionPrefs = {
      include_follow_ups: userPrefs?.include_follow_ups ?? true,
      include_overdue_tasks: userPrefs?.include_overdue_tasks ?? true,
      include_planned_encouragements: userPrefs?.include_planned_encouragements ?? true,
      include_upcoming_meetings: userPrefs?.include_upcoming_meetings ?? false,
      include_birthdays: userPrefs?.include_birthdays ?? true,
      include_board_cards_owned: userPrefs?.include_board_cards_owned ?? true,
      include_board_cards_assigned: userPrefs?.include_board_cards_assigned ?? true,
      include_checklist_items: userPrefs?.include_checklist_items ?? true,
    };

    // ── 9. Board cards due today or overdue ─────────────────────────────
    // Use a two-step approach: first get board/column IDs, then query cards by column
    let allCards: CardDigestItem[] = [];
    let colMap = new Map<string, { title: string; board_id: string }>();
    let boardMap = new Map<string, string>();
    if (sectionPrefs.include_board_cards_owned || sectionPrefs.include_board_cards_assigned) {
      // Step 1: Get user's boards and their columns
      const { data: userBoards } = await supabase
        .from('project_boards')
        .select('id, title')
        .eq('user_id', user.id);
      (userBoards || []).forEach(b => boardMap.set(b.id, b.title));
      const boardIds = Array.from(boardMap.keys());

      if (boardIds.length > 0) {
        const { data: cols } = await supabase
          .from('board_columns')
          .select('id, title, board_id')
          .in('board_id', boardIds);
        (cols || []).forEach(c => colMap.set(c.id, { title: c.title, board_id: c.board_id }));
      }
      const colIds = Array.from(colMap.keys());

      // Step 2: Get cards on owned boards
      let ownedCards: any[] = [];
      if (sectionPrefs.include_board_cards_owned && colIds.length > 0) {
        const { data } = await supabase
          .from('board_cards')
          .select('id, title, due_date, is_complete, column_id')
          .in('column_id', colIds)
          .not('due_date', 'is', null)
          .lte('due_date', today)
          .eq('is_complete', false);
        ownedCards = data || [];
      }

      // Step 3: Get cards assigned to the user
      let assignedCards: any[] = [];
      if (sectionPrefs.include_board_cards_assigned) {
        const { data: assignmentRows } = await supabase
          .from('card_assignments')
          .select('card_id')
          .eq('user_id', user.id);
        const assignedCardIds = (assignmentRows || []).map(a => a.card_id);
        if (assignedCardIds.length > 0) {
          const { data } = await supabase
            .from('board_cards')
            .select('id, title, due_date, is_complete, column_id')
            .in('id', assignedCardIds)
            .not('due_date', 'is', null)
            .lte('due_date', today)
            .eq('is_complete', false);
          assignedCards = data || [];

          // For assigned cards, we may need columns/boards not already in our maps
          const missingColIds = (assignedCards || [])
            .filter(c => !colMap.has(c.column_id))
            .map(c => c.column_id);
          if (missingColIds.length > 0) {
            const { data: extraCols } = await supabase
              .from('board_columns')
              .select('id, title, board_id')
              .in('id', missingColIds);
            const extraBoardIds = new Set<string>();
            (extraCols || []).forEach(c => {
              colMap.set(c.id, { title: c.title, board_id: c.board_id });
              if (!boardMap.has(c.board_id)) extraBoardIds.add(c.board_id);
            });
            if (extraBoardIds.size > 0) {
              const { data: extraBoards } = await supabase
                .from('project_boards')
                .select('id, title')
                .in('id', Array.from(extraBoardIds));
              (extraBoards || []).forEach(b => boardMap.set(b.id, b.title));
            }
          }
        }
      }

      // Merge and deduplicate by card id
      const cardDedupe = new Map<string, any>();
      [...ownedCards, ...assignedCards].forEach(c => { if (!cardDedupe.has(c.id)) cardDedupe.set(c.id, c); });

      // Fetch assignee names for all cards
      const cardIds = Array.from(cardDedupe.keys());
      let assigneeMap: Record<string, string[]> = {};
      if (cardIds.length > 0) {
        const { data: assignments } = await supabase
          .from('card_assignments')
          .select('card_id, users!inner(name)')
          .in('card_id', cardIds);
        (assignments || []).forEach((a: any) => {
          if (!assigneeMap[a.card_id]) assigneeMap[a.card_id] = [];
          if (a.users?.name) assigneeMap[a.card_id].push(a.users.name);
        });
      }

      allCards = Array.from(cardDedupe.values()).map((c: any): CardDigestItem => {
        const col = colMap.get(c.column_id);
        return {
          id: c.id,
          title: c.title,
          due_date: c.due_date,
          board_name: col ? (boardMap.get(col.board_id) || 'Unknown Board') : 'Unknown Board',
          board_id: col?.board_id || '',
          column_name: col?.title || '',
          assignees: assigneeMap[c.id] || [],
        };
      });
    }
    const cardsDueToday = allCards.filter(c => c.due_date === today);
    const cardsOverdue = allCards.filter(c => c.due_date !== null && c.due_date! < today);

    // ── 10. Checklist items with due dates ────────────────────────────────
    let allChecklist: ChecklistDigestItem[] = [];
    if (sectionPrefs.include_checklist_items) {
      const userCardIds = new Set<string>(allCards.map(c => c.id));

      // Include all cards from owned boards
      if (colMap.size > 0) {
        const { data: allBoardCards } = await supabase
          .from('board_cards')
          .select('id')
          .in('column_id', Array.from(colMap.keys()));
        (allBoardCards || []).forEach(c => userCardIds.add(c.id));
      }

      const { data: assignedRows } = await supabase
        .from('card_assignments')
        .select('card_id')
        .eq('user_id', user.id);
      (assignedRows || []).forEach(a => userCardIds.add(a.card_id));

      if (userCardIds.size > 0) {
        const { data: checklists, error: clError } = await supabase
          .from('card_checklists')
          .select('id, title, due_date, is_completed, card_id')
          .eq('is_completed', false)
          .not('due_date', 'is', null)
          .lte('due_date', today)
          .in('card_id', Array.from(userCardIds));

        const clCardIds = Array.from(new Set((checklists || []).map(cl => cl.card_id)));
        let cardInfoMap = new Map<string, { title: string; column_id: string }>();
        if (clCardIds.length > 0) {
          const { data: cardInfos } = await supabase
            .from('board_cards')
            .select('id, title, column_id')
            .in('id', clCardIds);
          (cardInfos || []).forEach(ci => cardInfoMap.set(ci.id, { title: ci.title, column_id: ci.column_id }));

          // Ensure we have column/board info
          const missingCols = (cardInfos || []).filter(ci => !colMap.has(ci.column_id)).map(ci => ci.column_id);
          if (missingCols.length > 0) {
            const { data: extraCols } = await supabase
              .from('board_columns')
              .select('id, title, board_id')
              .in('id', missingCols);
            const extraBoardIds = new Set<string>();
            (extraCols || []).forEach(c => {
              colMap.set(c.id, { title: c.title, board_id: c.board_id });
              if (!boardMap.has(c.board_id)) extraBoardIds.add(c.board_id);
            });
            if (extraBoardIds.size > 0) {
              const { data: extraBoards } = await supabase
                .from('project_boards')
                .select('id, title')
                .in('id', Array.from(extraBoardIds));
              (extraBoards || []).forEach(b => boardMap.set(b.id, b.title));
            }
          }
        }

        allChecklist = (checklists || []).map((cl: any): ChecklistDigestItem => {
          const cardInfo = cardInfoMap.get(cl.card_id);
          const col = cardInfo ? colMap.get(cardInfo.column_id) : undefined;
          return {
            id: cl.id,
            text: cl.title,
            due_date: cl.due_date,
            card_title: cardInfo?.title || 'Unknown Card',
            card_id: cl.card_id,
            board_name: col ? (boardMap.get(col.board_id) || 'Unknown Board') : 'Unknown Board',
            board_id: col?.board_id || '',
          };
        });
      }
    }
    const checklistDueToday = allChecklist.filter(c => c.due_date === today);
    const checklistOverdue = allChecklist.filter(c => c.due_date !== null && c.due_date! < today);

    const digestData: PersonalDigestData = {
      user: { id: user.id, name: userName, email: recipientEmail },
      date: today,
      birthdays: sectionPrefs.include_birthdays ? birthdays : [],
      cards: { dueToday: cardsDueToday, overdue: cardsOverdue },
      checklistItems: { dueToday: checklistDueToday, overdue: checklistOverdue },
      circleVisits: {
        today: (visitsRaw || []).filter(v => v.visit_date === today).map(toVisit),
        thisWeek: (visitsRaw || []).filter(v => v.visit_date >= tomorrow && v.visit_date <= weekEnd).map(toVisit),
      },
      encouragements: sectionPrefs.include_planned_encouragements
        ? {
            dueToday: (encsRaw || []).filter(e => e.message_date === today).map(toEnc),
            overdue: (encsRaw || []).filter(e => e.message_date < today).map(toEnc),
          }
        : { dueToday: [], overdue: [] },
      followUps: sectionPrefs.include_follow_ups
        ? {
            dueToday: (followUpsRaw || []).filter(f => f.follow_up_date === today).map(toFU),
            overdue: (followUpsRaw || []).filter(f => !f.follow_up_date || f.follow_up_date < today).map(toFU),
          }
        : { dueToday: [], overdue: [] },
      upcomingVisits,
      recentNotes,
      upcomingCircles: sectionPrefs.include_upcoming_meetings
        ? { today: circlesToday, tomorrow: circlesTomorrow }
        : { today: [], tomorrow: [] },
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
        cardsDueToday: digestData.cards.dueToday.length,
        cardsOverdue: digestData.cards.overdue.length,
        checklistDueToday: digestData.checklistItems.dueToday.length,
        checklistOverdue: digestData.checklistItems.overdue.length,
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
