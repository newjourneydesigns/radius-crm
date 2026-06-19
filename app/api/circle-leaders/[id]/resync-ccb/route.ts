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

    // Columns this sync may touch. Apply only writes within this whitelist.
    const SYNCABLE = ['name', 'campus', 'circle_type', 'day', 'time', 'frequency', 'location', 'email', 'phone', 'birthday', 'leader_ccb_profile_link', 'ccb_group_name', 'ccb_event_ids'] as const;
    const FIELD_LABELS: Record<string, string> = {
      name: 'Leader Name', campus: 'Campus', circle_type: 'Circle Type', day: 'Meeting Day',
      time: 'Meeting Time', frequency: 'Frequency', location: 'Location', email: 'Email',
      phone: 'Phone', birthday: 'Birthday', leader_ccb_profile_link: 'Leader CCB Profile',
      ccb_group_name: 'CCB Group Name', ccb_event_ids: 'CCB Event IDs',
    };

    const body = await request.json().catch(() => ({}));
    const confirmedValues: Record<string, any> | null = body?.apply && typeof body.apply === 'object' ? body.apply : null;

    const sb = getServiceSupabase();
    const { data: leader } = await sb
      .from('circle_leaders')
      .select('id, name, ccb_group_id, leader_ccb_profile_link, campus, circle_type, day, time, frequency, location, email, phone, birthday, ccb_group_name, ccb_event_ids')
      .eq('id', id)
      .maybeSingle();

    if (!leader) {
      return NextResponse.json({ error: 'Circle leader not found' }, { status: 404 });
    }

    // ---- APPLY: write the confirmed values (whitelisted) and return. ----
    if (confirmedValues) {
      const updates: Record<string, any> = { updated_at: new Date().toISOString() };
      for (const key of SYNCABLE) {
        if (key in confirmedValues) updates[key] = confirmedValues[key];
      }
      if (Object.keys(updates).length === 1) {
        return NextResponse.json({ error: 'No changes to apply.' }, { status: 400 });
      }
      const { data: applied, error: applyErr } = await sb
        .from('circle_leaders')
        .update(updates)
        .eq('id', id)
        .select('id, name, day, time, frequency, location, campus, circle_type, email, phone, birthday, ccb_group_name, ccb_event_ids, leader_ccb_profile_link')
        .single();
      if (applyErr) {
        console.error('❌ resync-ccb apply error:', applyErr);
        return NextResponse.json({ error: applyErr.message }, { status: 500 });
      }
      return NextResponse.json({ success: true, applied: true, leader: applied });
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

    // ---- PREVIEW: compute the CCB-derived values, then diff against current. ----
    // Only propose fields where CCB has a value, so a re-sync never blanks out
    // data that was hand-entered when CCB is sparse.
    const proposed: Record<string, any> = {};
    const setIf = (key: string, val: any) => { if (val !== null && val !== undefined && val !== '') proposed[key] = val; };

    const subdomain = process.env.CCB_SUBDOMAIN || process.env.CCB_BASE_URL || '';
    const sBase = subdomain
      ? (subdomain.includes('.')
          ? (subdomain.startsWith('http') ? subdomain : `https://${subdomain}`)
          : `https://${subdomain}.ccbchurch.com`)
      : '';
    const linkBase = sBase ? sBase.replace(/\/api\.php$/, '') : '';
    const leaderProfileLink = linkBase && group.mainLeader?.id
      ? `${linkBase}/goto/individuals/${group.mainLeader.id}`
      : null;

    setIf('name', group.mainLeader?.fullName || null);
    setIf('campus', campusName);
    setIf('circle_type', group.type?.name || null);
    setIf('day', meeting.day || group.meetDay?.name || null);
    setIf('time', meeting.time);
    setIf('frequency', meeting.frequency);
    setIf('location', meeting.location || fallbackLocation);
    setIf('email', leaderEmail);
    setIf('phone', leaderPhone);
    setIf('birthday', leaderBirthday);
    setIf('leader_ccb_profile_link', leaderProfileLink);
    setIf('ccb_group_name', group.name);
    if (meeting.eventIds.length > 0) proposed.ccb_event_ids = meeting.eventIds;

    // Build the diff: only fields whose proposed value differs from the current one.
    const norm = (v: any) => Array.isArray(v) ? v.map(String).join(', ') : (v ?? '') === '' ? '' : String(v);
    const changes: Array<{ field: string; label: string; from: string; to: string }> = [];
    const values: Record<string, any> = {};
    for (const key of SYNCABLE) {
      if (!(key in proposed)) continue;
      const current = (leader as any)[key];
      if (norm(current) === norm(proposed[key])) continue;
      changes.push({
        field: key,
        label: FIELD_LABELS[key] || key,
        from: norm(current) || '—',
        to: norm(proposed[key]) || '—',
      });
      values[key] = proposed[key];
    }

    return NextResponse.json({
      success: true,
      preview: true,
      changes,
      values,
      eventIdsLinked: meeting.eventIds.length,
    });
  } catch (error: any) {
    console.error('❌ resync-ccb error:', error);
    return NextResponse.json({ error: error.message || 'Unknown error' }, { status: 500 });
  }
}
