import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { fetchWeather, WeatherData } from '../../../lib/weatherService';
import type {
  CardDigestItem,
  ChecklistDigestItem,
  VisitItem,
  EncouragementItem,
  FollowUpItem,
  NoteItem,
  CircleMeetingItem,
  BirthdayItem,
} from '../../../lib/emailService';

export interface TodayData {
  today: string;
  user: { id: string; name: string; email: string };
  weather: WeatherData | null;
  birthdays: BirthdayItem[];
  circleVisits: { today: VisitItem[]; thisWeek: VisitItem[] };
  upcomingVisits: VisitItem[];
  encouragements: { dueToday: EncouragementItem[]; overdue: EncouragementItem[] };
  followUps: { dueToday: FollowUpItem[]; overdue: FollowUpItem[] };
  cards: { dueToday: CardDigestItem[]; overdue: CardDigestItem[] };
  focusCards: CardDigestItem[];
  checklistItems: { dueToday: ChecklistDigestItem[]; overdue: ChecklistDigestItem[] };
  upcomingCircles: {
    today: CircleMeetingItem[];
    tomorrow: CircleMeetingItem[];
    thisWeek: { date: string; dayName: string; leaders: CircleMeetingItem[] }[];
  };
  recentNotes: NoteItem[];
}

function getSupabaseServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Missing Supabase credentials');
  return createClient(url, key);
}

function getTodayDate(): string {
  const now = new Date();
  const cst = new Date(now.toLocaleString('en-US', { timeZone: 'America/Chicago' }));
  const y = cst.getFullYear();
  const m = String(cst.getMonth() + 1).padStart(2, '0');
  const d = String(cst.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function getDateOffset(base: string, days: number): string {
  const d = new Date(base + 'T00:00:00');
  d.setDate(d.getDate() + days);
  return d.toISOString().split('T')[0];
}

function getDayName(dateStr: string): string {
  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  return days[new Date(dateStr + 'T00:00:00').getDay()];
}

function getWeekOfMonth(dateStr: string): number {
  return Math.ceil(new Date(dateStr + 'T00:00:00').getDate() / 7);
}

function doesCircleMeetOnDate(dateStr: string, leaderDay: string, frequency: string | null, meetingStartDate: string | null): boolean {
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

async function buildTodayData(
  supabase: ReturnType<typeof getSupabaseServiceClient>,
  user: { id: string; name: string; email: string },
  today: string
): Promise<Omit<TodayData, 'weather'>> {
  const tomorrow    = getDateOffset(today, 1);
  const weekEnd     = getDateOffset(today, 7);
  const monthEnd    = getDateOffset(today, 30);
  const afterWeek   = getDateOffset(today, 8);
  const weekDates    = Array.from({ length: 7 }, (_, i) => getDateOffset(today, i));
  const weekDayNames = Array.from(new Set(weekDates.map(getDayName)));

  // ── Phase 1: all independent queries fire simultaneously ─────────────────
  const [
    { data: visitsRaw },
    { data: upcomingVisitsRaw },
    { data: encsRaw },
    { data: followUpsRaw },
    { data: birthdayLeaders },
    { data: circleLeadersRaw },
    { data: notesRaw },
    { data: userBoards },
    { data: assignmentRows },
  ] = await Promise.all([
    supabase.from('circle_visits')
      .select('id, visit_date, leader_id, previsit_note, circle_leaders!inner(name, campus)')
      .eq('scheduled_by', user.id).eq('status', 'scheduled')
      .gte('visit_date', today).lte('visit_date', weekEnd)
      .order('visit_date', { ascending: true }),

    supabase.from('circle_visits')
      .select('id, visit_date, leader_id, previsit_note, circle_leaders!inner(name, campus)')
      .eq('scheduled_by', user.id).eq('status', 'scheduled')
      .gte('visit_date', afterWeek).lte('visit_date', monthEnd)
      .order('visit_date', { ascending: true }).limit(10),

    supabase.from('acpd_encouragements')
      .select('id, circle_leader_id, encourage_method, message_date, note, circle_leaders!inner(name, campus)')
      .eq('user_id', user.id).eq('message_type', 'planned')
      .lte('message_date', today).order('message_date', { ascending: true }),

    supabase.from('circle_leaders')
      .select('id, name, campus, follow_up_date')
      .eq('acpd', user.name)
      .eq('follow_up_required', true)
      .or(`follow_up_date.lte.${today},follow_up_date.is.null`)
      .order('follow_up_date', { ascending: true }),

    supabase.from('circle_leaders')
      .select('id, name, campus, birthday, phone')
      .eq('acpd', user.name)
      .not('birthday', 'is', null).neq('birthday', '')
      .not('status', 'in', '("Inactive","Removed")'),

    supabase.from('circle_leaders')
      .select('id, name, circle_type, day, time, frequency, campus, meeting_start_date')
      .eq('acpd', user.name).in('day', weekDayNames)
      .not('status', 'in', '("Inactive","Removed")')
      .order('time', { ascending: true }),

    supabase.from('notes')
      .select('id, circle_leader_id, content, created_at, circle_leaders!inner(name, campus)')
      .eq('created_by', user.id)
      .order('created_at', { ascending: false }).limit(5),

    supabase.from('project_boards').select('id, title').eq('user_id', user.id),

    supabase.from('card_assignments').select('card_id').eq('user_id', user.id),
  ]);

  // ── Derive IDs needed for Phase 2 ────────────────────────────────────────
  const boardMap = new Map<string, string>();
  (userBoards || []).forEach(b => boardMap.set(b.id, b.title));
  const boardIds       = Array.from(boardMap.keys());
  const assignedCardIds = (assignmentRows || []).map((a: any) => a.card_id);

  // ── Phase 2: board columns + assigned card rows + focused cards in parallel ─
  const [{ data: colsData }, { data: assignedCardsRaw }, { data: focusCardsRaw }] = await Promise.all([
    boardIds.length > 0
      ? supabase.from('board_columns').select('id, title, board_id').in('board_id', boardIds)
      : Promise.resolve({ data: [] as any[], error: null }),
    assignedCardIds.length > 0
      ? supabase.from('board_cards')
          .select('id, title, due_date, is_complete, column_id, priority')
          .in('id', assignedCardIds)
          .not('due_date', 'is', null).lte('due_date', today).eq('is_complete', false)
      : Promise.resolve({ data: [] as any[], error: null }),
    boardIds.length > 0
      ? supabase.from('board_cards')
          .select('id, title, due_date, board_id, column_id, priority')
          .in('board_id', boardIds)
          .eq('is_focused', true)
          .eq('is_complete', false)
          .order('due_date', { ascending: true, nullsFirst: false })
      : Promise.resolve({ data: [] as any[], error: null }),
  ]);

  const colMap = new Map<string, { title: string; board_id: string }>();
  (colsData || []).forEach((c: any) => colMap.set(c.id, { title: c.title, board_id: c.board_id }));
  const colIds = Array.from(colMap.keys());

  // ── Phase 3: owned cards + extra cols for assigned cards in parallel ──────
  const missingColIds = (assignedCardsRaw || [])
    .filter((c: any) => !colMap.has(c.column_id)).map((c: any) => c.column_id);

  const [{ data: ownedCardsRaw }, { data: extraColsData }] = await Promise.all([
    colIds.length > 0
      ? supabase.from('board_cards')
          .select('id, title, due_date, is_complete, column_id, priority')
          .in('column_id', colIds)
          .not('due_date', 'is', null).lte('due_date', today).eq('is_complete', false)
      : Promise.resolve({ data: [] as any[], error: null }),
    missingColIds.length > 0
      ? supabase.from('board_columns').select('id, title, board_id').in('id', missingColIds)
      : Promise.resolve({ data: [] as any[], error: null }),
  ]);

  // Fold extra cols/boards into maps
  const extraBoardIds1 = new Set<string>();
  (extraColsData || []).forEach((c: any) => {
    colMap.set(c.id, { title: c.title, board_id: c.board_id });
    if (!boardMap.has(c.board_id)) extraBoardIds1.add(c.board_id);
  });
  if (extraBoardIds1.size > 0) {
    const { data: extraBoards } = await supabase.from('project_boards').select('id, title').in('id', Array.from(extraBoardIds1));
    (extraBoards || []).forEach((b: any) => boardMap.set(b.id, b.title));
  }

  // Merge owned + assigned, deduplicate
  const cardDedupe = new Map<string, any>();
  [...(ownedCardsRaw || []), ...(assignedCardsRaw || [])].forEach((c: any) => {
    if (!cardDedupe.has(c.id)) cardDedupe.set(c.id, c);
  });
  const cardIds = Array.from(cardDedupe.keys());

  // ── Phase 4: assignee names + labels + checklist counts + all board card IDs ─
  const focusCardIds = (focusCardsRaw || []).map((c: any) => c.id);
  const allEnrichedIds = Array.from(new Set([...cardIds, ...focusCardIds]));

  const [{ data: assignmentNames }, { data: allBoardCardIds }, { data: labelRows }, { data: checklistRows }] = await Promise.all([
    cardIds.length > 0
      ? supabase.from('card_assignments').select('card_id, users!inner(name)').in('card_id', cardIds)
      : Promise.resolve({ data: [] as any[], error: null }),
    colIds.length > 0
      ? supabase.from('board_cards').select('id').in('column_id', colIds)
      : Promise.resolve({ data: [] as any[], error: null }),
    allEnrichedIds.length > 0
      ? supabase.from('card_label_assignments')
          .select('card_id, board_labels(name, color)')
          .in('card_id', allEnrichedIds)
      : Promise.resolve({ data: [] as any[], error: null }),
    allEnrichedIds.length > 0
      ? supabase.from('card_checklists')
          .select('card_id, is_completed')
          .in('card_id', allEnrichedIds)
      : Promise.resolve({ data: [] as any[], error: null }),
  ]);

  const assigneeMap: Record<string, string[]> = {};
  (assignmentNames || []).forEach((a: any) => {
    if (!assigneeMap[a.card_id]) assigneeMap[a.card_id] = [];
    if (a.users?.name) assigneeMap[a.card_id].push(a.users.name);
  });

  const labelMap: Record<string, { name: string; color: string }[]> = {};
  (labelRows || []).forEach((r: any) => {
    if (!labelMap[r.card_id]) labelMap[r.card_id] = [];
    if (r.board_labels) labelMap[r.card_id].push(r.board_labels);
  });

  const checklistTotalMap: Record<string, number> = {};
  const checklistDoneMap: Record<string, number> = {};
  (checklistRows || []).forEach((r: any) => {
    checklistTotalMap[r.card_id] = (checklistTotalMap[r.card_id] || 0) + 1;
    if (r.is_completed) checklistDoneMap[r.card_id] = (checklistDoneMap[r.card_id] || 0) + 1;
  });

  const allCards: CardDigestItem[] = Array.from(cardDedupe.values()).map((c: any) => {
    const col = colMap.get(c.column_id);
    return {
      id: c.id, title: c.title, due_date: c.due_date,
      board_name: col ? (boardMap.get(col.board_id) || 'Unknown Board') : 'Unknown Board',
      board_id: col?.board_id || '', column_name: col?.title || '',
      assignees: assigneeMap[c.id] || [],
      priority: c.priority,
      labels: labelMap[c.id] || [],
      checklist_total: checklistTotalMap[c.id] || 0,
      checklist_done: checklistDoneMap[c.id] || 0,
    };
  });

  const focusCards: CardDigestItem[] = (focusCardsRaw || []).map((c: any) => ({
    id: c.id, title: c.title, due_date: c.due_date,
    board_name: boardMap.get(c.board_id) || 'Unknown Board',
    board_id: c.board_id,
    column_name: colMap.get(c.column_id)?.title || '',
    assignees: assigneeMap[c.id] || [],
    priority: c.priority,
    labels: labelMap[c.id] || [],
    checklist_total: checklistTotalMap[c.id] || 0,
    checklist_done: checklistDoneMap[c.id] || 0,
  }));

  // ── Phase 5: checklist items ──────────────────────────────────────────────
  const userCardIds = new Set<string>(cardDedupe.keys());
  (allBoardCardIds || []).forEach((c: any) => userCardIds.add(c.id));
  assignedCardIds.forEach((id: string) => userCardIds.add(id));

  let allChecklist: ChecklistDigestItem[] = [];
  if (userCardIds.size > 0) {
    const { data: checklists } = await supabase.from('card_checklists')
      .select('id, title, due_date, is_completed, card_id')
      .eq('is_completed', false).not('due_date', 'is', null).lte('due_date', today)
      .in('card_id', Array.from(userCardIds));

    const clCardIds = Array.from(new Set((checklists || []).map((cl: any) => cl.card_id)));
    if (clCardIds.length > 0) {
      const { data: cardInfos } = await supabase.from('board_cards')
        .select('id, title, column_id').in('id', clCardIds);

      const cardInfoMap = new Map<string, { title: string; column_id: string }>();
      (cardInfos || []).forEach((ci: any) => cardInfoMap.set(ci.id, { title: ci.title, column_id: ci.column_id }));

      const missingClCols = (cardInfos || []).filter((ci: any) => !colMap.has(ci.column_id)).map((ci: any) => ci.column_id);
      if (missingClCols.length > 0) {
        const { data: extraCols } = await supabase.from('board_columns').select('id, title, board_id').in('id', missingClCols);
        const extraBIds = new Set<string>();
        (extraCols || []).forEach((c: any) => {
          colMap.set(c.id, { title: c.title, board_id: c.board_id });
          if (!boardMap.has(c.board_id)) extraBIds.add(c.board_id);
        });
        if (extraBIds.size > 0) {
          const { data: extraBoards } = await supabase.from('project_boards').select('id, title').in('id', Array.from(extraBIds));
          (extraBoards || []).forEach((b: any) => boardMap.set(b.id, b.title));
        }
      }

      allChecklist = (checklists || []).map((cl: any): ChecklistDigestItem => {
        const info = cardInfoMap.get(cl.card_id);
        const col  = info ? colMap.get(info.column_id) : undefined;
        return {
          id: cl.id, text: cl.title, due_date: cl.due_date,
          card_title: info?.title || 'Unknown Card', card_id: cl.card_id,
          board_name: col ? (boardMap.get(col.board_id) || 'Unknown Board') : 'Unknown Board',
          board_id: col?.board_id || '',
        };
      });
    }
  }

  // ── Assemble non-board data ────────────────────────────────────────────────
  const toVisit = (v: any): VisitItem => ({
    id: v.id, visit_date: v.visit_date, leader_id: v.leader_id,
    leader_name: v.circle_leaders?.name ?? 'Unknown',
    leader_campus: v.circle_leaders?.campus, previsit_note: v.previsit_note,
  });
  const toEnc = (e: any): EncouragementItem => ({
    id: e.id, circle_leader_id: e.circle_leader_id,
    leader_name: e.circle_leaders?.name ?? 'Unknown',
    leader_campus: e.circle_leaders?.campus,
    encourage_method: e.encourage_method, message_date: e.message_date, note: e.note,
  });
  const toFU = (f: any): FollowUpItem => ({
    id: f.id, name: f.name, campus: f.campus, follow_up_date: f.follow_up_date,
  });
  const toCircle = (l: any): CircleMeetingItem => ({
    leader_id: l.id, leader_name: l.name, circle_type: l.circle_type ?? undefined,
    day: l.day, time: l.time ?? 'TBD', frequency: l.frequency ?? 'Weekly', campus: l.campus ?? undefined,
  });

  const todayDate  = new Date(today + 'T00:00:00');
  const todayMonth = todayDate.getMonth() + 1;
  const todayDayN  = todayDate.getDate();

  const birthdays: BirthdayItem[] = (birthdayLeaders || []).filter((l: any) => {
    if (!l.birthday) return false;
    const raw = (l.birthday as string).trim();
    let m: number, d: number;
    if (raw.includes('/')) { const p = raw.split('/'); m = +p[0]; d = +p[1]; }
    else if (raw.includes('-')) { const p = raw.split('-'); m = +p[1]; d = +p[2]; }
    else return false;
    return m === todayMonth && d === todayDayN;
  }).map((l: any) => ({ id: l.id, name: l.name, campus: l.campus ?? undefined, birthday: l.birthday, phone: l.phone || undefined }));

  return {
    today, user, birthdays,
    circleVisits: {
      today: (visitsRaw || []).filter((v: any) => v.visit_date === today).map(toVisit),
      thisWeek: (visitsRaw || []).filter((v: any) => v.visit_date >= tomorrow && v.visit_date <= weekEnd).map(toVisit),
    },
    upcomingVisits: (upcomingVisitsRaw || []).map(toVisit),
    encouragements: {
      dueToday: (encsRaw || []).filter((e: any) => e.message_date === today).map(toEnc),
      overdue:  (encsRaw || []).filter((e: any) => e.message_date < today).map(toEnc),
    },
    followUps: {
      dueToday: (followUpsRaw || []).filter((f: any) => f.follow_up_date === today).map(toFU),
      overdue:  (followUpsRaw || []).filter((f: any) => !f.follow_up_date || f.follow_up_date < today).map(toFU),
    },
    cards: {
      dueToday: allCards.filter(c => c.due_date === today),
      overdue:  allCards.filter(c => c.due_date !== null && c.due_date! < today),
    },
    focusCards,
    checklistItems: {
      dueToday: allChecklist.filter(c => c.due_date === today),
      overdue:  allChecklist.filter(c => c.due_date !== null && c.due_date! < today),
    },
    upcomingCircles: {
      today:    (circleLeadersRaw || []).filter((l: any) => doesCircleMeetOnDate(today,    l.day, l.frequency, l.meeting_start_date)).map(toCircle),
      tomorrow: (circleLeadersRaw || []).filter((l: any) => doesCircleMeetOnDate(tomorrow, l.day, l.frequency, l.meeting_start_date)).map(toCircle),
      thisWeek: weekDates.slice(2).map(date => ({
        date,
        dayName: getDayName(date),
        leaders: (circleLeadersRaw || []).filter((l: any) => doesCircleMeetOnDate(date, l.day, l.frequency, l.meeting_start_date)).map(toCircle),
      })).filter(d => d.leaders.length > 0),
    },
    recentNotes: (notesRaw || []).map((n: any) => ({
      id: n.id, circle_leader_id: n.circle_leader_id,
      leader_name: n.circle_leaders?.name ?? 'Unknown',
      leader_campus: n.circle_leaders?.campus,
      content: n.content, created_at: n.created_at,
    })),
  };
}

// ── Server-side response cache (per user, 60s TTL) ───────────────────────────
const responseCache = new Map<string, { payload: object; cachedAt: number }>();
const RESPONSE_CACHE_TTL = 60_000;

/** Decode JWT payload without verifying — used only to fire DB query early. */
function extractSubFromToken(token: string): string | null {
  try {
    return JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString()).sub ?? null;
  } catch { return null; }
}

export async function GET(request: NextRequest) {
  try {
    const token = request.headers.get('authorization')?.replace('Bearer ', '');
    if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const supabaseUrl     = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
    const supabase        = getSupabaseServiceClient();
    const anonClient      = createClient(supabaseUrl, supabaseAnonKey);
    const today           = getTodayDate();

    // Optimistically decode user ID from JWT so we can fire the profile query
    // in parallel with token verification — saves one sequential round trip.
    const optimisticId = extractSubFromToken(token);

    const [authResult, profileResult] = await Promise.all([
      anonClient.auth.getUser(token),
      optimisticId
        ? supabase.from('users')
            .select('id, name, email, weather_city, weather_state, weather_zip, include_weather')
            .eq('id', optimisticId).single()
        : Promise.resolve({ data: null, error: null }),
    ]);

    if (!authResult.data.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const userProfile = profileResult.data;
    if (!userProfile || userProfile.id !== authResult.data.user.id) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // Serve from cache if fresh
    const cached = responseCache.get(userProfile.id);
    if (cached && Date.now() - cached.cachedAt < RESPONSE_CACHE_TTL) {
      return NextResponse.json(cached.payload, {
        headers: { 'X-Cache': 'HIT', 'Cache-Control': 'private, max-age=60, stale-while-revalidate=300' },
      });
    }

    const user = { id: userProfile.id, name: userProfile.name, email: userProfile.email };

    const [data, weather] = await Promise.all([
      buildTodayData(supabase, user, today),
      userProfile.include_weather !== false
        ? fetchWeather({ city: userProfile.weather_city, state: userProfile.weather_state, zip: userProfile.weather_zip })
            .catch((): WeatherData | null => null)
        : Promise.resolve(null as WeatherData | null),
    ]);

    const payload = { ...data, weather };
    responseCache.set(userProfile.id, { payload, cachedAt: Date.now() });

    return NextResponse.json(payload, {
      headers: { 'X-Cache': 'MISS', 'Cache-Control': 'private, max-age=60, stale-while-revalidate=300' },
    });
  } catch (err: any) {
    console.error('Today API error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
