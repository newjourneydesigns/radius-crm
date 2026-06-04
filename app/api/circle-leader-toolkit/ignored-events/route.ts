import { NextRequest, NextResponse } from 'next/server';
import { DateTime } from 'luxon';
import { createClient } from '@supabase/supabase-js';
import { verifyAdminAccess } from '../../../../lib/auth-middleware';

export const dynamic = 'force-dynamic';

function getServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

function normalizeOccurrenceDateTime(value: unknown): string | null {
  if (typeof value !== 'string' || !value.trim()) return null;

  const sqlDate = DateTime.fromSQL(value.trim(), { zone: 'America/Chicago' });
  if (sqlDate.isValid) return sqlDate.toUTC().toISO();

  const isoDate = DateTime.fromISO(value.trim().replace(' ', 'T'), {
    zone: 'America/Chicago',
  });
  return isoDate.isValid ? isoDate.toUTC().toISO() : null;
}

export async function POST(request: NextRequest) {
  const auth = await verifyAdminAccess(request);
  if (!auth.isAdmin || !auth.user) {
    return NextResponse.json(
      { error: auth.error || 'Admin access required' },
      { status: auth.error === 'No authentication token provided' ? 401 : 403 }
    );
  }

  let body: Record<string, unknown> = {};
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const leaderId = Number(body.leader_id);
  const ccbEventId = typeof body.ccb_event_id === 'string' ? body.ccb_event_id.trim() : '';
  const occurrenceDate =
    typeof body.occurrence_date === 'string' ? body.occurrence_date.trim().slice(0, 10) : '';

  if (!Number.isFinite(leaderId) || leaderId <= 0 || !ccbEventId || !/^\d{4}-\d{2}-\d{2}$/.test(occurrenceDate)) {
    return NextResponse.json(
      { error: 'leader_id, ccb_event_id, and occurrence_date are required.' },
      { status: 400 }
    );
  }

  const supabase = getServiceClient();
  const { data: leader, error: leaderError } = await supabase
    .from('circle_leaders')
    .select('id, ccb_group_id')
    .eq('id', leaderId)
    .maybeSingle();

  if (leaderError) {
    return NextResponse.json({ error: leaderError.message }, { status: 500 });
  }
  if (!leader) {
    return NextResponse.json({ error: 'Leader not found.' }, { status: 404 });
  }

  const ccbGroupId =
    typeof body.ccb_group_id === 'string' && body.ccb_group_id.trim()
      ? body.ccb_group_id.trim()
      : leader.ccb_group_id != null
      ? String(leader.ccb_group_id)
      : null;

  const eventTitle =
    typeof body.event_title === 'string' && body.event_title.trim()
      ? body.event_title.trim().slice(0, 250)
      : null;
  const reason =
    typeof body.reason === 'string' && body.reason.trim()
      ? body.reason.trim().slice(0, 500)
      : 'Invalid or test CCB event hidden from Circle Summary';

  const { data, error } = await supabase
    .from('circle_summary_ignored_events')
    .upsert(
      {
        leader_id: leaderId,
        ccb_group_id: ccbGroupId,
        ccb_event_id: ccbEventId,
        occurrence_date: occurrenceDate,
        occurrence_datetime: normalizeOccurrenceDateTime(body.occurrence_datetime),
        event_title: eventTitle,
        reason,
        ignored_by: auth.user.id,
        ignored_at: new Date().toISOString(),
      },
      { onConflict: 'leader_id,ccb_event_id,occurrence_date' }
    )
    .select('id, leader_id, ccb_event_id, occurrence_date, ignored_at')
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, ignored: data });
}
