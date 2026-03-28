import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import type {
  VisitItem,
  EncouragementItem,
  FollowUpItem,
  NoteItem,
  CircleMeetingItem,
  BirthdayItem,
} from '../../../../lib/emailService';

export interface TodayCoreData {
  today: string;
  user: { id: string; name: string; email: string };
  birthdays: BirthdayItem[];
  circleVisits: { today: VisitItem[]; thisWeek: VisitItem[] };
  upcomingVisits: VisitItem[];
  encouragements: { dueToday: EncouragementItem[]; overdue: EncouragementItem[] };
  followUps: { dueToday: FollowUpItem[]; overdue: FollowUpItem[] };
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

function extractSubFromToken(token: string): string | null {
  try {
    return JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString()).sub ?? null;
  } catch { return null; }
}

// ── Server-side response cache (per user, 60s TTL) ───────────────────────────
const responseCache = new Map<string, { payload: object; cachedAt: number }>();
const RESPONSE_CACHE_TTL = 60_000;

export async function GET(request: NextRequest) {
  try {
    const token = request.headers.get('authorization')?.replace('Bearer ', '');
    if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const supabaseUrl     = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
    const supabase        = getSupabaseServiceClient();
    const anonClient      = createClient(supabaseUrl, supabaseAnonKey);
    const today           = getTodayDate();

    const optimisticId = extractSubFromToken(token);

    const [authResult, profileResult] = await Promise.all([
      anonClient.auth.getUser(token),
      optimisticId
        ? supabase.from('users')
            .select('id, name, email')
            .eq('id', optimisticId).single()
        : Promise.resolve({ data: null, error: null }),
    ]);

    if (!authResult.data.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const userProfile = profileResult.data;
    if (!userProfile || userProfile.id !== authResult.data.user.id) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const cached = responseCache.get(`core:${userProfile.id}`);
    if (cached && Date.now() - cached.cachedAt < RESPONSE_CACHE_TTL) {
      return NextResponse.json(cached.payload, { headers: { 'X-Cache': 'HIT' } });
    }

    const user = { id: userProfile.id, name: userProfile.name, email: userProfile.email };

    const tomorrow   = getDateOffset(today, 1);
    const weekEnd    = getDateOffset(today, 7);
    const monthEnd   = getDateOffset(today, 30);
    const afterWeek  = getDateOffset(today, 8);
    const weekDates  = Array.from({ length: 7 }, (_, i) => getDateOffset(today, i));
    const weekDayNames = Array.from(new Set(weekDates.map(getDayName)));

    const [
      { data: visitsRaw },
      { data: upcomingVisitsRaw },
      { data: encsRaw },
      { data: followUpsRaw },
      { data: birthdayLeaders },
      { data: circleLeadersRaw },
      { data: notesRaw },
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
    ]);

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

    const payload: TodayCoreData = {
      today,
      user,
      birthdays,
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

    responseCache.set(`core:${userProfile.id}`, { payload, cachedAt: Date.now() });

    return NextResponse.json(payload, {
      headers: { 'X-Cache': 'MISS', 'Cache-Control': 'private, max-age=60, stale-while-revalidate=300' },
    });
  } catch (err: any) {
    console.error('Today core API error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
