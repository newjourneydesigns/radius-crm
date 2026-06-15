import { NextRequest, NextResponse } from 'next/server';
import { DateTime } from 'luxon';
import { createServiceSupabaseClient } from '../../../../lib/server-supabase';

export const dynamic = 'force-dynamic';

const TZ = 'America/Chicago';

/** Extract { month, day } from a free-form birthday string, or null. */
function birthdayMonthDay(raw: string | null): { month: number; day: number } | null {
  const value = (raw || '').trim();
  if (!value) return null;
  let m: RegExpMatchArray | null;
  if ((m = value.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/))) return { month: Number(m[2]), day: Number(m[3]) };
  if ((m = value.match(/^(\d{1,2})\/(\d{1,2})/))) return { month: Number(m[1]), day: Number(m[2]) };
  return null;
}

function authorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return req.headers.get('authorization') === `Bearer ${secret}`;
}

type LeaderRow = {
  id: number;
  name: string;
  acpd: string | null;
  birthday: string | null;
  follow_up_required: boolean | null;
  follow_up_date: string | null;
  campus: string | null;
};

// POST /api/notifications/daily-alerts — once-a-day producer for the inbox:
// creates birthday and follow-up notifications for the director (ACPD) each
// circle leader is assigned to. Idempotent within a day via entity_id dedup.
export async function POST(req: NextRequest) {
  if (!authorized(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = createServiceSupabaseClient();
  const now = DateTime.now().setZone(TZ);
  const today = now.toISODate() as string;

  // Map ACPD director name → user id (leaders store the director's name).
  const { data: acpds } = await supabase.from('users').select('id, name').eq('role', 'ACPD');
  const userByName = new Map<string, string>();
  for (const u of (acpds || []) as { id: string; name: string }[]) {
    if (u.name) userByName.set(u.name.trim().toLowerCase(), u.id);
  }

  const { data: leadersRaw } = await supabase
    .from('circle_leaders')
    .select('id, name, acpd, birthday, follow_up_required, follow_up_date, campus');
  const leaders = (leadersRaw || []) as LeaderRow[];

  type Candidate = {
    userId: string;
    type: 'birthday' | 'follow_up';
    title: string;
    body: string;
    entityId: string;
  };
  const candidates: Candidate[] = [];

  for (const leader of leaders) {
    const userId = leader.acpd ? userByName.get(leader.acpd.trim().toLowerCase()) : undefined;
    if (!userId) continue;

    const md = birthdayMonthDay(leader.birthday);
    if (md && md.month === now.month && md.day === now.day) {
      candidates.push({
        userId,
        type: 'birthday',
        title: `🎂 ${leader.name}'s birthday is today`,
        body: leader.campus ? `${leader.name} · ${leader.campus}` : leader.name,
        entityId: `birthday:${leader.id}:${today}`,
      });
    }

    if (leader.follow_up_required && leader.follow_up_date && leader.follow_up_date <= today) {
      const overdue = leader.follow_up_date < today;
      candidates.push({
        userId,
        type: 'follow_up',
        title: overdue ? `Follow-up overdue · ${leader.name}` : `Follow-up due today · ${leader.name}`,
        body: leader.campus ? `${leader.name} · ${leader.campus}` : leader.name,
        entityId: `follow_up:${leader.id}:${leader.follow_up_date}`,
      });
    }
  }

  if (candidates.length === 0) {
    return NextResponse.json({ created: 0, checked: leaders.length });
  }

  // Skip any we already created on a previous run today (dedup by entity_id).
  const entityIds = candidates.map((c) => c.entityId);
  const { data: existing } = await supabase
    .from('notifications')
    .select('entity_id')
    .in('entity_id', entityIds);
  const seen = new Set((existing || []).map((e: { entity_id: string }) => e.entity_id));

  let created = 0;
  for (const c of candidates) {
    if (seen.has(c.entityId)) continue;
    seen.add(c.entityId);
    // create_notification applies the recipient's preferences + FK guards.
    const { error } = await supabase.rpc('create_notification', {
      p_user_id: c.userId,
      p_type: c.type,
      p_title: c.title,
      p_body: c.body,
      p_link: '/today',
      p_actor_id: null,
      p_entity_type: c.type,
      p_entity_id: c.entityId,
    });
    if (!error) created += 1;
  }

  return NextResponse.json({ created, checked: leaders.length });
}
