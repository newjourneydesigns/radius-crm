import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createCCBv2Client } from '../../../../../lib/ccb/ccb-v2-client';
import { getCCBRequestContext } from '../../../../../lib/ccb/ccb-api-gateway';
import { verifyAdminAccessDemo } from '../../../../../lib/auth-middleware';

export const dynamic = 'force-dynamic';

function getServiceSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error('Missing Supabase env vars');
  return createClient(url, key);
}

// POST /api/circle-leaders/[id]/resync-ccb
//
// Re-pulls this circle's data from CCB v2 (by its ccb_group_id) and refreshes the
// meeting time/day/frequency/location, leader email/phone/birthday, exact CCB
// group name, and linked event IDs — the same enrichment the importer does.
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { isAdmin, error: authErr } = await verifyAdminAccessDemo(request);
    if (!isAdmin) {
      return NextResponse.json({ error: authErr || 'Admin access required' }, { status: 403 });
    }

    const id = parseInt(params.id, 10);
    if (isNaN(id)) {
      return NextResponse.json({ error: 'Invalid leader id' }, { status: 400 });
    }

    const sb = getServiceSupabase();
    const { data: leader } = await sb
      .from('circle_leaders')
      .select('id, name, ccb_group_id, leader_ccb_profile_link')
      .eq('id', id)
      .maybeSingle();

    if (!leader) {
      return NextResponse.json({ error: 'Circle leader not found' }, { status: 404 });
    }
    if (!leader.ccb_group_id) {
      return NextResponse.json(
        { error: 'This circle has no CCB Group ID set. Add one before re-syncing.' },
        { status: 400 }
      );
    }

    const groupId = String(leader.ccb_group_id);
    const ccbv2 = createCCBv2Client(await getCCBRequestContext(request, {
      module: 'Circle Page',
      action: 'Re-sync from CCB',
      direction: 'pull',
    }));

    const group = await ccbv2.getGroupDetail(groupId);
    if (!group) {
      return NextResponse.json(
        { error: `No CCB group found for Group ID ${groupId}.` },
        { status: 404 }
      );
    }

    // Resolve campus name (single-fetch returns it null).
    let campusName = group.campus?.name || null;
    if (!campusName && group.campus?.id) {
      try {
        const campusesRaw = await ccbv2.get('/campuses');
        const campuses = Array.isArray(campusesRaw) ? campusesRaw : (campusesRaw?.items ?? campusesRaw?.data ?? []);
        campusName = campuses.find((c: any) => String(c.id) === String(group.campus?.id))?.name || null;
      } catch { /* non-fatal */ }
    }

    // Leader profile → email, phone, birthday.
    let leaderEmail: string | null = group.mainLeader?.email || null;
    let leaderPhone: string | null = null;
    let leaderBirthday: string | null = null;
    if (group.mainLeader?.id) {
      try {
        const profile = await ccbv2.getIndividualProfile(group.mainLeader.id);
        if (profile) {
          leaderEmail = leaderEmail || profile.email || null;
          leaderPhone = profile.mobilePhone || profile.phone || null;
          leaderBirthday = profile.birthday || null;
        }
      } catch { /* non-fatal */ }
    }

    // Calendar → meeting time/day/frequency/location + event IDs.
    let meeting = { eventIds: [] as string[], time: null as string | null, day: null as string | null, frequency: null as string | null, location: null as string | null };
    try {
      meeting = await ccbv2.getGroupMeetingDetails(groupId);
    } catch { /* non-fatal */ }

    const fallbackLocation = [group.address?.street, group.address?.city, group.address?.state, group.address?.zip]
      .filter(Boolean).join(', ') || null;

    // Only overwrite fields when CCB has a value, so a re-sync never blanks out
    // data that was hand-entered when CCB is sparse.
    const updates: Record<string, any> = { updated_at: new Date().toISOString() };
    const setIf = (key: string, val: any) => { if (val !== null && val !== undefined && val !== '') updates[key] = val; };

    setIf('campus', campusName);
    setIf('circle_type', group.type?.name || null);
    setIf('day', meeting.day || group.meetDay?.name || null);
    setIf('time', meeting.time);
    setIf('frequency', meeting.frequency);
    setIf('location', meeting.location || fallbackLocation);
    setIf('email', leaderEmail);
    setIf('phone', leaderPhone);
    setIf('birthday', leaderBirthday);
    setIf('ccb_group_name', group.name);
    if (meeting.eventIds.length > 0) updates.ccb_event_ids = meeting.eventIds;

    const { data: updated, error: updErr } = await sb
      .from('circle_leaders')
      .update(updates)
      .eq('id', id)
      .select('id, name, day, time, frequency, location, campus, circle_type, email, phone, birthday, ccb_group_name, ccb_event_ids')
      .single();

    if (updErr) {
      console.error('❌ resync-ccb update error:', updErr);
      return NextResponse.json({ error: updErr.message }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      leader: updated,
      eventIdsLinked: meeting.eventIds.length,
    });
  } catch (error: any) {
    console.error('❌ resync-ccb error:', error);
    return NextResponse.json({ error: error.message || 'Unknown error' }, { status: 500 });
  }
}
