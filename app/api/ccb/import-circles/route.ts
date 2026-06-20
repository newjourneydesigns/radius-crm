import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createCCBClient } from '../../../../lib/ccb/ccb-client';
import { createCCBv2Client } from '../../../../lib/ccb/ccb-v2-client';
import { getCCBRequestContext } from '../../../../lib/ccb/ccb-api-gateway';
import { verifyAdminAccessDemo } from '../../../../lib/auth-middleware';

export const dynamic = 'force-dynamic';

// ---------------------------------------------------------------------------
// Rate limiter (per-user, 10 req/min) — same pattern as event-attendance
// ---------------------------------------------------------------------------
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT_WINDOW = 60 * 1000;
const RATE_LIMIT_MAX = 10;

interface CCBGroupProfileCustomField {
  name?: unknown;
  label?: unknown;
  selection?: unknown;
  value?: unknown;
}

interface CCBGroupProfileResponse {
  ccb_api?: {
    response?: {
      groups?: {
        group?: {
          user_defined_fields?: {
            user_defined_field?: CCBGroupProfileCustomField | CCBGroupProfileCustomField[];
          };
        };
      };
    };
  };
}

function checkRateLimit(userId: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(userId);
  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(userId, { count: 1, resetAt: now + RATE_LIMIT_WINDOW });
    return true;
  }
  if (entry.count >= RATE_LIMIT_MAX) return false;
  entry.count++;
  return true;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getServiceSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error('Missing Supabase env vars');
  return createClient(url, key);
}

function ccbText(value: unknown): string {
  if (value == null) return '';
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return String(value).trim().replace(/\\'/g, "'");
  }

  const rec = value as Record<string, unknown>;
  return ccbText(rec['#text'] ?? rec.text ?? rec.value);
}

function asArray<T>(value: T | T[] | null | undefined): T[] {
  if (Array.isArray(value)) return value;
  return value ? [value] : [];
}

function getCircleTypeFromGroupProfile(xml: CCBGroupProfileResponse): string | null {
  const group = xml?.ccb_api?.response?.groups?.group;
  const customFields = asArray(group?.user_defined_fields?.user_defined_field);

  for (const field of customFields) {
    const label = ccbText(field?.label).toLowerCase();
    const name = ccbText(field?.name).toLowerCase();
    if (label !== 'circle type' && name !== 'udf_3') continue;

    return ccbText(field?.selection) || ccbText(field?.value) || null;
  }

  return null;
}

async function fetchCcbCircleType(request: NextRequest, groupId: string): Promise<string | null> {
  try {
    const ccb = createCCBClient(await getCCBRequestContext(request, {
      module: 'Import Circles (v1)',
      action: 'Lookup Group Circle Type',
      direction: 'pull',
    }));

    const xml = await ccb.getXml<CCBGroupProfileResponse>({
      srv: 'group_profile_from_id',
      id: groupId,
      include_participants: 'false',
    });

    return getCircleTypeFromGroupProfile(xml);
  } catch (error) {
    console.warn('⚠️ Unable to resolve CCB Circle Type from group profile:', error);
    return null;
  }
}

// ---------------------------------------------------------------------------
// GET  /api/ccb/import-circles?group_id=<id>
//
// Looks up a single CCB group by its Group ID and returns a preview with the
// leader's name, email, phone, and birthday. Flags whether it's already in RADIUS.
// ---------------------------------------------------------------------------
export async function GET(request: NextRequest) {
  try {
    // Auth
    const { isAdmin, error: authErr } = await verifyAdminAccessDemo(request);
    if (!isAdmin) {
      return NextResponse.json({ error: authErr || 'Admin access required' }, { status: 403 });
    }

    // Rate limit
    const userId = request.headers.get('x-forwarded-for') || 'anonymous';
    if (!checkRateLimit(userId)) {
      return NextResponse.json(
        { error: 'Rate limit exceeded. Please try again in a minute.' },
        { status: 429 }
      );
    }

    const groupId = (request.nextUrl.searchParams.get('group_id') || '').trim();
    if (!groupId || !/^\d+$/.test(groupId)) {
      return NextResponse.json(
        { error: 'Enter a valid numeric CCB Group ID.' },
        { status: 400 }
      );
    }

    const ccbv2 = createCCBv2Client(await getCCBRequestContext(request, {
      module: 'Import Circles (v2)',
      action: 'Lookup Group by ID',
      direction: 'pull',
    }));

    // 1. Fetch the group detail.
    const group = await ccbv2.getGroupDetail(groupId);
    if (!group) {
      return NextResponse.json(
        { error: `No CCB group found for Group ID ${groupId}.` },
        { status: 404 }
      );
    }

    // 2. Resolve the campus name (single-group fetch returns campus.name as null).
    let campusName = group.campus?.name || null;
    if (!campusName && group.campus?.id) {
      try {
        const campusesRaw = await ccbv2.get('/campuses');
        const campuses = Array.isArray(campusesRaw) ? campusesRaw : (campusesRaw?.items ?? campusesRaw?.data ?? []);
        const match = campuses.find((c: any) => String(c.id) === String(group.campus?.id));
        campusName = match?.name || null;
      } catch { /* non-fatal */ }
    }

    // 3. Pull the leader's full profile for phone + birthday (group payload omits them).
    let leader = group.mainLeader || null;
    if (leader?.id) {
      try {
        const profile = await ccbv2.getIndividualProfile(leader.id);
        if (profile) {
          leader = {
            ...leader,
            email: leader.email || profile.email,
            phone: profile.mobilePhone || profile.phone || (leader as any).phone,
            mobilePhone: profile.mobilePhone,
            birthday: profile.birthday,
          } as any;
        }
      } catch { /* non-fatal */ }
    }

    // 4. Pull precise meeting time/day/frequency/location from the group's calendar.
    let meeting = { eventIds: [] as string[], time: null as string | null, day: null as string | null, frequency: null as string | null, location: null as string | null };
    try {
      meeting = await ccbv2.getGroupMeetingDetails(groupId);
    } catch { /* non-fatal */ }

    // 5. Already imported?
    const sb = getServiceSupabase();
    const { data: existing } = await sb
      .from('circle_leaders')
      .select('id, name')
      .eq('ccb_group_id', groupId)
      .maybeSingle();

    // 6. CCB deep link.
    const subdomain = process.env.CCB_SUBDOMAIN || process.env.CCB_BASE_URL || '';
    const ccbBase = subdomain.includes('.')
      ? (subdomain.startsWith('http') ? subdomain : `https://${subdomain}`)
      : subdomain ? `https://${subdomain}.ccbchurch.com` : '';
    const ccbLinkBase = ccbBase.replace(/\/api\.php$/, '');

    const fallbackLocation = [group.address?.street, group.address?.city, group.address?.state, group.address?.zip]
      .filter(Boolean).join(', ') || null;
    const circleType = await fetchCcbCircleType(request, groupId);

    return NextResponse.json({
      success: true,
      group: {
        id: group.id,
        name: group.name,
        description: group.description || null,
        groupType: group.type?.name || null,
        circleType,
        campus: campusName,
        campusId: group.campus?.id || null,
        meetingDay: meeting.day || group.meetDay?.name || null,
        meetingTime: meeting.time || group.meetTime?.name || null,
        meetingFrequency: meeting.frequency,
        location: meeting.location || fallbackLocation,
        eventCount: meeting.eventIds.length,
        address: group.address?.street || null,
        city: group.address?.city || null,
        state: group.address?.state || null,
        zip: group.address?.zip || null,
        childcare: group.childcare ?? null,
        inactive: group.inactive ?? null,
        mainLeader: leader ? {
          id: leader.id,
          fullName: leader.fullName,
          email: leader.email || null,
          phone: (leader as any).phone || (leader as any).mobilePhone || null,
          birthday: (leader as any).birthday || null,
        } : null,
        ccbLink: ccbLinkBase ? `${ccbLinkBase}/group_detail.php?group_id=${group.id}` : null,
        alreadyImported: !!existing,
        existingLeader: existing ? { id: existing.id, name: existing.name } : null,
      },
    });
  } catch (error: any) {
    console.error('❌ import-circles GET error:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Unknown error' },
      { status: 500 }
    );
  }
}

// ---------------------------------------------------------------------------
// POST /api/ccb/import-circles
//
// Body: { group_id: string, acpd?: string }
// Re-fetches the group from CCB (authoritative), then inserts a single new
// circle into circle_leaders — including the leader's birthday, the exact CCB
// group name (for summary matching), and the group's CCB event IDs (so the
// event-summary / attendance sync works immediately).
// ---------------------------------------------------------------------------
export async function POST(request: NextRequest) {
  try {
    // Auth
    const { isAdmin, error: authErr } = await verifyAdminAccessDemo(request);
    if (!isAdmin) {
      return NextResponse.json({ error: authErr || 'Admin access required' }, { status: 403 });
    }

    const body = await request.json();
    const groupId = String(body.group_id || '').trim();
    const acpd = body.acpd ? String(body.acpd) : null;

    if (!groupId || !/^\d+$/.test(groupId)) {
      return NextResponse.json(
        { error: 'A valid numeric group_id is required.' },
        { status: 400 }
      );
    }
    if (!acpd) {
      return NextResponse.json(
        { error: 'A director (ACPD) must be assigned before importing.' },
        { status: 400 }
      );
    }

    const sb = getServiceSupabase();

    // Guard against duplicates.
    const { data: dup } = await sb
      .from('circle_leaders')
      .select('id, name')
      .eq('ccb_group_id', groupId)
      .maybeSingle();
    if (dup) {
      return NextResponse.json(
        { error: `This circle is already in RADIUS as "${dup.name}".`, existingLeaderId: dup.id },
        { status: 409 }
      );
    }

    // Re-fetch from CCB so the import is based on authoritative data, not the
    // client's (possibly stale) preview.
    const ccbv2 = createCCBv2Client(await getCCBRequestContext(request, {
      module: 'Import Circles (v2)',
      action: 'Import Circle',
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

    // Leader profile → phone + birthday (omitted from the group payload).
    let leaderEmail = group.mainLeader?.email || null;
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

    // Group calendar → precise meeting time/day/frequency/location + event IDs.
    // The event detail is authoritative; the group's meet_day/meet_time labels
    // (e.g. "Evening") are coarse and lack a real clock time. Fall back to them
    // only when the group has no calendar events yet.
    let meeting = { eventIds: [] as string[], time: null as string | null, day: null as string | null, frequency: null as string | null, location: null as string | null };
    try {
      meeting = await ccbv2.getGroupMeetingDetails(groupId);
    } catch { /* non-fatal — discover-events / sync will backfill later */ }

    const meetingTime = meeting.time;                       // real "HH:mm" or null
    const meetingDay = meeting.day || group.meetDay?.name || null;
    const meetingLocation = meeting.location
      || [group.address?.street, group.address?.city, group.address?.state, group.address?.zip].filter(Boolean).join(', ')
      || null;
    const circleType = await fetchCcbCircleType(request, groupId);

    const subdomain = process.env.CCB_SUBDOMAIN || process.env.CCB_BASE_URL || '';
    const base = subdomain
      ? (subdomain.includes('.')
          ? (subdomain.startsWith('http') ? subdomain : `https://${subdomain}`)
          : `https://${subdomain}.ccbchurch.com`)
      : '';
    const linkBase = base ? base.replace(/\/api\.php$/, '') : '';
    const ccbProfileLink = linkBase ? `${linkBase}/group_detail.php?group_id=${groupId}` : null;
    const leaderProfileLink = linkBase && group.mainLeader?.id
      ? `${linkBase}/goto/individuals/${group.mainLeader.id}`
      : null;

    const row = {
      name: group.mainLeader?.fullName || group.name,
      email: leaderEmail,
      phone: leaderPhone,
      birthday: leaderBirthday,
      campus: campusName,
      acpd,
      circle_type: circleType,
      day: meetingDay,
      time: meetingTime,
      frequency: meeting.frequency,
      location: meetingLocation,
      circle_name: group.name,
      ccb_group_id: groupId,
      ccb_group_name: group.name,
      ccb_profile_link: ccbProfileLink,
      leader_ccb_profile_link: leaderProfileLink,
      ccb_event_ids: meeting.eventIds.length > 0 ? meeting.eventIds : null,
      status: 'active',
      event_summary_received: false,
    };

    const { data: inserted, error: insertError } = await sb
      .from('circle_leaders')
      .insert(row)
      .select('id, name')
      .single();

    if (insertError) {
      console.error('❌ circle_leaders insert error:', insertError);
      return NextResponse.json({ success: false, error: insertError.message }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      leader: inserted,
      eventIdsLinked: meeting.eventIds.length,
    });
  } catch (error: any) {
    console.error('❌ import-circles POST error:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Unknown error' },
      { status: 500 }
    );
  }
}
