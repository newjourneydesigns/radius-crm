import { NextResponse } from 'next/server';
import { createServiceSupabaseClient } from '../../../../lib/server-supabase';
import { createCCBClient } from '../../../../lib/ccb/ccb-client';
import { createCCBv2Client } from '../../../../lib/ccb/ccb-v2-client';

export const dynamic = 'force-dynamic';

/** Describe structure (key names + types, array element shape) — strips values (PII-safe). */
function shapeOf(v: any, depth = 2): any {
  if (v === null || v === undefined) return typeof v;
  if (Array.isArray(v)) return v.length ? [shapeOf(v[0], depth - 1)] : [];
  if (typeof v === 'object') {
    if (depth <= 0) return 'object';
    const out: Record<string, any> = {};
    for (const k of Object.keys(v)) out[k] = shapeOf(v[k], depth - 1);
    return out;
  }
  return typeof v;
}

/**
 * Migration verification: runs the v2 endpoint methods alongside the v1 client
 * for the same group/individual and returns both, so field mappings can be
 * confirmed before flipping CCB_API_VERSION for that endpoint.
 *
 * Gated by CRON_SECRET (?secret=). Requires CCB v2 to be connected
 * (/api/ccb/oauth/start) so a token exists.
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  if (!process.env.CRON_SECRET || searchParams.get('secret') !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let groupId = searchParams.get('groupId')?.trim() || '';
  if (!groupId) {
    const supabase = createServiceSupabaseClient();
    const { data } = await supabase
      .from('circle_leaders')
      .select('ccb_group_id')
      .not('ccb_group_id', 'is', null)
      .limit(1);
    groupId = String(data?.[0]?.ccb_group_id || '').trim();
  }
  if (!groupId) return NextResponse.json({ error: 'No ccb_group_id available; pass ?groupId=' }, { status: 400 });

  const ctx = { module: 'CCB v2 Verify', action: 'parity-diff', direction: 'pull' as const };
  const v1 = createCCBClient(ctx);
  const v2 = createCCBv2Client(ctx);

  const safe = async <T>(label: string, fn: () => Promise<T>) => {
    try { return await fn(); } catch (e: any) { return { __error: `${label}: ${e.message}` } as any; }
  };

  // Events/attendance shape discovery (PII-safe) — ?probe=events
  if (searchParams.get('probe') === 'events') {
    const probe = async (path: string, query?: Record<string, any>) => {
      try {
        const r: any = await v2.get(path, query);
        const list = Array.isArray(r) ? r : r?.items ?? r?.data ?? r?.events ?? null;
        return {
          status: 'ok',
          count: Array.isArray(list) ? list.length : (r && typeof r === 'object' ? '(object)' : 0),
          shape: shapeOf(Array.isArray(list) ? list[0] : r, 3),
        };
      } catch (e: any) { return { status: 'error', error: e.message }; }
    };

    // Group events via the CORRECT path (/events?group_id was ignored by v2).
    let sample: any = null;
    try {
      const r: any = await v2.get(`/groups/${encodeURIComponent(groupId)}/events`);
      const list = Array.isArray(r) ? r : r?.items ?? r?.data ?? r?.events ?? [];
      sample = list[0] ?? null;
    } catch {}
    const evId = sample ? String(sample.event_id ?? sample.event?.id ?? sample.id ?? '') : '';
    const occ = sample ? String(sample.occurrence ?? '') : '';

    return NextResponse.json({
      groupId,
      probe: 'events',
      group_events: await probe(`/groups/${encodeURIComponent(groupId)}/events`),
      group_calendar: await probe(`/groups/${encodeURIComponent(groupId)}/calendar`),
      sampleOccurrence: sample ? {
        event_id: sample.event_id ?? sample.event?.id, occurrence: sample.occurrence,
        start: sample.start, end: sample.end,
        eventName: sample.event?.name ?? sample.name, group: sample.event?.group?.id ?? sample.group_id,
      } : null,
      occurrence_attendees: (evId && occ) ? await probe(`/events/${evId}/occurrences/${encodeURIComponent(occ)}/attendees`) : 'n/a',
      event_attendees_plain: evId ? await probe(`/events/${evId}/attendees`) : 'n/a',
      group_attendance: await probe(`/groups/${encodeURIComponent(groupId)}/attendance`),
    });
  }

  // Attendance discovery (PII-safe) — ?probe=attendance — scan recent groups for a
  // record with a SUBMITTED report to reveal status enum + attendee shape + test mapping.
  if (searchParams.get('probe') === 'attendance') {
    const supabase = createServiceSupabaseClient();
    const { data: leaders } = await supabase
      .from('circle_leaders').select('ccb_group_id').not('ccb_group_id', 'is', null).limit(40);
    // Check the explicitly-passed group first (?groupId=), then scan the rest.
    const groupIds = Array.from(new Set([groupId, ...(leaders || []).map((l: any) => String(l.ccb_group_id))].filter(Boolean)));

    let found: any = null;
    let scanned = 0;
    for (const gid of groupIds) {
      scanned++;
      try {
        const r: any = await v2.get(`/groups/${gid}/attendance`);
        const recs = Array.isArray(r) ? r : r?.items ?? r?.data ?? [];
        const pop = recs.find((rec: any) =>
          (typeof rec.total_attendance === 'number' && rec.total_attendance > 0) ||
          rec.topic || rec.notes ||
          (rec.people_information && (Array.isArray(rec.people_information) ? rec.people_information.length : Object.keys(rec.people_information || {}).length)));
        if (pop) { found = { gid, rec: pop }; break; }
      } catch {}
    }

    let mapped: any = null;
    if (found) {
      try {
        const all = await v2.getGroupAttendanceInRange(found.gid);
        mapped = all.find((a) => a.occurrence.replace(/-/g, '') === String(found.rec.occurrence)) ?? all[0] ?? null;
      } catch (e: any) { mapped = { __error: e.message }; }
    }

    return NextResponse.json({
      probe: 'attendance',
      scannedGroups: scanned,
      found: found ? {
        groupId: found.gid,
        occurrence: found.rec.occurrence,
        statusValue: found.rec.status,           // enum, not PII
        total_attendance: found.rec.total_attendance,
        visitors: found.rec.visitors,
        hasTopic: !!found.rec.topic, hasNotes: !!found.rec.notes, hasPrayer: !!found.rec.prayer_requests,
        recordShape: shapeOf(found.rec, 4),
        peopleInformationShape: shapeOf(found.rec.people_information, 3),
        peopleCount: Array.isArray(found.rec.people_information) ? found.rec.people_information.length
          : (found.rec.people_information ? Object.keys(found.rec.people_information).length : 0),
      } : 'no populated attendance found in scanned groups',
      // My mapped output (scalars only) — confirms getGroupAttendanceInRange works.
      mappedSample: mapped && !mapped.__error ? {
        eventId: mapped.eventId, occurrence: mapped.occurrence,
        didNotMeet: mapped.didNotMeet, headCount: mapped.headCount,
        hasTopic: !!mapped.topic, hasNotes: !!mapped.notes,
        attendeeCount: mapped.attendees?.length ?? 0,
        firstAttendeeKeys: mapped.attendees?.[0] ? Object.keys(mapped.attendees[0]) : [],
      } : mapped,
    });
  }

  const [v1Parts, v2Parts] = await Promise.all([
    safe('v1 getGroupParticipants', () => v1.getGroupParticipants(groupId)),
    safe('v2 getGroupParticipants', () => v2.getGroupParticipants(groupId)),
  ]);

  const firstId =
    (Array.isArray(v2Parts) && v2Parts[0]?.id) ||
    (Array.isArray(v1Parts) && v1Parts[0]?.id) ||
    '';

  const [v1Ind, v2Ind, rawInd, rawMembers] = firstId
    ? await Promise.all([
        safe('v1 getIndividualProfile', () => v1.getIndividualProfile(firstId)),
        safe('v2 getIndividualProfile', () => v2.getIndividualProfile(firstId)),
        safe('v2 raw individual', () => v2.get(`/individuals/${firstId}`)),
        safe('v2 raw members', () => v2.get(`/groups/${encodeURIComponent(groupId)}/members`)),
      ])
    : [null, null, null, null];

  const rawMemberList = Array.isArray(rawMembers) ? rawMembers : (rawMembers as any)?.items ?? (rawMembers as any)?.data ?? [];

  return NextResponse.json({
    groupId,
    sampleIndividualId: firstId,
    memberCounts: {
      v1: Array.isArray(v1Parts) ? v1Parts.length : v1Parts,
      v2: Array.isArray(v2Parts) ? v2Parts.length : v2Parts,
    },
    individualProfile: { v1: v1Ind, v2: v2Ind },
    sampleMembers: {
      v1: Array.isArray(v1Parts) ? v1Parts.slice(0, 3) : v1Parts,
      v2: Array.isArray(v2Parts) ? v2Parts.slice(0, 3) : v2Parts,
    },
    // PII-safe structural probes — key names + types only, to confirm field mapping.
    rawShapes: {
      individualKeys: rawInd ? Object.keys(rawInd) : [],
      individualPhoneShape: shapeOf((rawInd as any)?.phone),
      memberKeys: rawMemberList[0] ? Object.keys(rawMemberList[0]) : [],
      memberIndividualKeys: rawMemberList[0]?.individual ? Object.keys(rawMemberList[0].individual) : [],
      memberPhoneShape: shapeOf(rawMemberList[0]?.individual?.phone),
    },
  });
}
