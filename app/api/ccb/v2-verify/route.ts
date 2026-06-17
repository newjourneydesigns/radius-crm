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

    // Pull a sample occurrence row (the GET /events item) to drill into attendance shape.
    let sample: any = null;
    try {
      const r: any = await v2.get('/events', { group_id: groupId, per_page: 10 });
      const list = Array.isArray(r) ? r : r?.items ?? r?.data ?? r?.events ?? [];
      sample = list[0] ?? null;
    } catch {}
    const evId = sample ? String(sample.event_id ?? sample.event?.id ?? '') : '';
    const occ = sample ? String(sample.occurrence ?? '') : '';

    return NextResponse.json({
      groupId,
      probe: 'events',
      events_by_group: await probe('/events', { group_id: groupId, per_page: 3 }),
      // Sample VALUES (dates + event name) to learn the occurrence/date format.
      sampleOccurrence: sample ? {
        event_id: sample.event_id, occurrence: sample.occurrence,
        start: sample.start, end: sample.end,
        eventName: sample.event?.name, groupId: sample.group_id,
      } : null,
      event_attendees: evId ? await probe(`/events/${evId}/attendees`) : 'no event id',
      event_attendees_byOccurrence: (evId && occ) ? await probe(`/events/${evId}/attendees`, { occurrence: occ }) : 'n/a',
      event_occurrence_detail: (evId && occ) ? await probe(`/events/${evId}/occurrences/${encodeURIComponent(occ)}`) : 'n/a',
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
