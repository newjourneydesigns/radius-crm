import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { DateTime } from 'luxon';
import { createCCBClient } from '../../../../lib/ccb/ccb-client';
import { getCCBRequestContext } from '../../../../lib/ccb/ccb-api-gateway';
import type { EventSummaryState } from '../../../../lib/supabase';

export const dynamic = 'force-dynamic';

function getServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

async function getAuthUserId(request: NextRequest): Promise<string | null> {
  const token = request.headers.get('authorization')?.replace('Bearer ', '');
  if (!token) return null;
  const anon = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false } }
  );
  const { data: { user } } = await anon.auth.getUser(token);
  return user?.id ?? null;
}

const INACTIVE_STATUSES = new Set(['paused', 'off-boarding', 'pipeline', 'invited']);

/**
 * POST /api/event-summary-tracker/sync
 *
 * Single-call Sync Now for the Event Summary Tracker page. Does in one shot:
 *   1. Pulls the entire week of attendance_profiles from CCB (one API call)
 *   2. Matches each CCB event against every Radius circle leader
 *   3. Persists matched results into circle_meeting_occurrences + event_summary_snapshots
 *   4. Persists unmatched / inactive matches into ccb_orphan_summaries so the
 *      page banner can surface them without a re-pull
 *   5. Stamps ccb_week_sync_log so the existing throttle/audit stays accurate
 *
 * Body: { week_start_date: "YYYY-MM-DD" }
 *   week_end_date is derived as +6 days. We always pull every leader, not just
 *   the filtered set, because orphan detection requires the full picture and
 *   one API call covers all of them.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const { week_start_date } = body as { week_start_date?: string };

    if (!week_start_date || !/^\d{4}-\d{2}-\d{2}$/.test(week_start_date)) {
      return NextResponse.json(
        { error: 'week_start_date (YYYY-MM-DD) required' },
        { status: 400 }
      );
    }

    const week_end_date = DateTime.fromISO(week_start_date).plus({ days: 6 }).toISODate()!;
    const supabase = getServiceClient();
    const userId = await getAuthUserId(request);

    // 1. Fetch every leader once. The matcher in checkReportsForLeaders walks
    //    this list, and we need it again for orphan classification.
    const { data: leaders, error: leaderErr } = await supabase
      .from('circle_leaders')
      .select('id, name, circle_name, ccb_group_id, ccb_group_name, status')
      .order('id');

    if (leaderErr || !leaders) {
      return NextResponse.json({ error: leaderErr?.message || 'Failed to load leaders' }, { status: 500 });
    }

    const leadersById = new Map(leaders.map(l => [l.id, l]));
    const leadersByGroupId = new Map<string, typeof leaders[number]>();
    for (const l of leaders) {
      if (l.ccb_group_id) leadersByGroupId.set(String(l.ccb_group_id), l);
    }

    // 2. Single CCB call for the whole week. checkReportsForLeaders returns
    //    only matched rows; we also pull the raw XML to enumerate every event
    //    for orphan detection.
    const ccb = createCCBClient(await getCCBRequestContext(request, {
      module: 'EventSummaryTracker',
      action: 'Sync Now',
      direction: 'pull',
    }));

    const reportMap = await ccb.checkReportsForLeaders(
      leaders.map(l => ({
        id: l.id,
        name: l.name,
        ccb_group_name: l.ccb_group_name || l.circle_name || null,
        ccb_group_id: l.ccb_group_id || null,
      })),
      week_start_date,
      week_end_date
    );

    // The XML for orphan classification — re-fetch via the public getter.
    const rawXml: any = await (ccb as any).getXml({
      srv: 'attendance_profiles',
      start_date: week_start_date,
      end_date: week_end_date,
    });

    const eventsRoot = rawXml?.ccb_api?.response?.events ?? null;
    const rawEvents: any[] = Array.isArray(eventsRoot?.event)
      ? eventsRoot.event
      : eventsRoot?.event ? [eventsRoot.event] : [];

    // 3. Upsert occurrences + snapshots for matched leaders (same logic as the
    //    existing pull-week-summaries route, kept here for one-stop sync).
    const { data: existingSnapshots } = await supabase
      .from('event_summary_snapshots')
      .select('circle_leader_id, event_summary_state')
      .eq('week_start_date', week_start_date);

    const existingStateMap = new Map<number, EventSummaryState>();
    for (const row of existingSnapshots ?? []) {
      existingStateMap.set(row.circle_leader_id, row.event_summary_state as EventSummaryState);
    }

    const snapshotRows = leaders.map(l => {
      const ccbData = reportMap.get(l.id);
      return {
        week_start_date,
        week_end_date,
        circle_leader_id: l.id,
        event_summary_state: existingStateMap.get(l.id) ?? ('not_received' as EventSummaryState),
        ccb_event_scheduled: !!ccbData?.occurrenceDate,
        ccb_report_available: ccbData?.hasReport ?? false,
        captured_at: new Date().toISOString(),
      };
    });

    const snapshotRes = await supabase
      .from('event_summary_snapshots')
      .upsert(snapshotRows, { onConflict: 'week_start_date,circle_leader_id' });
    if (snapshotRes.error) {
      console.error('[sync] snapshot upsert failed:', snapshotRes.error);
    }

    const occurrenceRows = leaders
      .map(l => {
        const ccbData = reportMap.get(l.id);
        if (!ccbData?.hasReport || !ccbData.occurrenceDate) return null;
        return {
          leader_id: l.id,
          meeting_date: ccbData.occurrenceDate,
          status: (ccbData.didNotMeet ? 'did_not_meet' : 'met') as 'met' | 'did_not_meet',
          headcount: ccbData.headcount,
          has_notes: ccbData.hasNotes,
          guest_count: ccbData.guestCount,
          topic: ccbData.topic ?? null,
          notes: ccbData.notes ?? null,
          prayer_requests: ccbData.prayerRequests ?? null,
          source: 'ccb' as const,
          synced_at: new Date().toISOString(),
        };
      })
      .filter((r): r is NonNullable<typeof r> => r !== null);

    if (occurrenceRows.length > 0) {
      // Try with full columns first; if topic/notes columns are missing in
      // some envs, retry with the minimal row.
      const fullRes = await supabase
        .from('circle_meeting_occurrences')
        .upsert(occurrenceRows, { onConflict: 'leader_id,meeting_date' });
      if (fullRes.error) {
        const minimal = occurrenceRows.map(({ topic, notes, prayer_requests, ...rest }) => rest);
        await supabase
          .from('circle_meeting_occurrences')
          .upsert(minimal, { onConflict: 'leader_id,meeting_date' });
      }
    }

    // 4. Orphan classification. Walk every CCB event; for each, decide whether
    //    it cleanly mapped to an *active* Radius leader. If not, record it.
    const matchedLeaderIds = new Set(
      Array.from(reportMap.entries())
        .filter(([, v]) => v.hasReport)
        .map(([id]) => id)
    );

    type OrphanRow = {
      week_start_date: string;
      ccb_event_id: string;
      occurrence: string;
      ccb_event_name: string;
      ccb_group_id: string | null;
      did_not_meet: boolean;
      head_count: number;
      attendee_count: number;
      matched_leader_id: number | null;
      category: 'matched' | 'inactive' | 'unknown_group';
    };

    const orphanRows: OrphanRow[] = [];

    for (const ev of rawEvents) {
      const eventId = String(ev?.['@_id'] ?? ev?.id ?? '').trim();
      if (!eventId) continue;

      const occRaw = String(ev?.['@_occurrence'] ?? ev?.occurrence ?? '').trim();
      if (!occRaw) continue;
      const occIso = occRaw.replace(' ', 'T');
      const occDt = DateTime.fromISO(occIso);
      if (!occDt.isValid) continue;
      const occDate = occDt.toISODate()!;
      if (occDate < week_start_date || occDate > week_end_date) continue;

      const groupId = (() => {
        const candidates = [
          ev?.group?.['@_id'],
          ev?.group?.id,
          ev?.group_id,
          ev?.['@_group_id'],
        ];
        for (const c of candidates) {
          const v = String(c ?? '').trim();
          if (v) return v;
        }
        return null;
      })();

      const eventName = String(ev?.name || '');
      const groupName = String(ev?.group?.name || ev?.group?.['#text'] || ev?.group_name || '');
      const displayName = `${eventName}${groupName ? ' · ' + groupName : ''}`.trim();

      const didNotMeet = String(ev?.did_not_meet ?? '').toLowerCase() === 'true';
      const headCount = Number(ev?.head_count ?? 0) || 0;
      const attendees = ev?.attendees?.attendee;
      const attendeeCount = Array.isArray(attendees) ? attendees.length : attendees ? 1 : 0;

      // Try to resolve back to a Radius leader. Prefer group_id; if that's
      // missing, scan reportMap for a leader whose matched event_id equals
      // this one. That's slow but only ~378 events x ~315 leaders worst case.
      let matchedLeader = groupId ? leadersByGroupId.get(groupId) ?? null : null;

      let category: 'matched' | 'inactive' | 'unknown_group';
      if (matchedLeader) {
        if (INACTIVE_STATUSES.has(matchedLeader.status ?? '')) {
          category = 'inactive';
        } else {
          category = 'matched';
        }
      } else {
        // If no group_id resolution worked but checkReportsForLeaders DID match
        // this event by name to some leader, treat it as matched.
        let matchedById: number | null = null;
        for (const [lid, v] of reportMap.entries()) {
          if (!v.hasReport) continue;
          if (v.occurrenceDate === occDate) {
            const leaderForId = leadersById.get(lid);
            // Name-based fuzz: skip — we don't have the matched_event_id in the
            // public return shape, and adding it would require client changes.
            // Treat this as matched if anything in reportMap shares the date AND
            // the leader's ccb_group_name appears in the event title.
            const title = (eventName + ' ' + groupName).toLowerCase();
            const ln = (leaderForId?.ccb_group_name || leaderForId?.circle_name || '').toLowerCase();
            if (ln && title.includes(ln)) {
              matchedById = lid;
              matchedLeader = leaderForId ?? null;
              break;
            }
          }
        }
        if (matchedById && matchedLeader) {
          category = INACTIVE_STATUSES.has(matchedLeader.status ?? '') ? 'inactive' : 'matched';
        } else {
          category = 'unknown_group';
        }
      }

      orphanRows.push({
        week_start_date,
        ccb_event_id: eventId,
        occurrence: occDt.toISO()!,
        ccb_event_name: displayName,
        ccb_group_id: groupId,
        did_not_meet: didNotMeet,
        head_count: headCount,
        attendee_count: attendeeCount,
        matched_leader_id: matchedLeader?.id ?? null,
        category,
      });
    }

    if (orphanRows.length > 0) {
      const orphanRes = await supabase
        .from('ccb_orphan_summaries')
        .upsert(orphanRows, { onConflict: 'week_start_date,ccb_event_id,occurrence' });
      if (orphanRes.error) {
        console.error('[sync] orphan upsert failed:', orphanRes.error);
      }
    }

    // 5. Stamp the sync log
    const syncedAt = new Date().toISOString();
    const syncLogRes = await supabase
      .from('ccb_week_sync_log')
      .upsert({
        week_start_date,
        week_end_date,
        last_synced_at: syncedAt,
        last_synced_by: userId,
        last_ccb_source: 'event_summary_tracker',
        last_sync_summary: {
          events_pulled: rawEvents.length,
          leaders_checked: leaders.length,
          with_report: Array.from(reportMap.values()).filter(v => v.hasReport).length,
          orphans_total: orphanRows.length,
          orphans_unknown: orphanRows.filter(r => r.category === 'unknown_group').length,
          orphans_inactive: orphanRows.filter(r => r.category === 'inactive').length,
        },
      }, { onConflict: 'week_start_date' });
    if (syncLogRes.error) throw syncLogRes.error;

    const orphanCounts = {
      matched: orphanRows.filter(r => r.category === 'matched').length,
      inactive: orphanRows.filter(r => r.category === 'inactive').length,
      unknown_group: orphanRows.filter(r => r.category === 'unknown_group').length,
    };

    return NextResponse.json({
      week_start_date,
      week_end_date,
      events_pulled: rawEvents.length,
      leaders_checked: leaders.length,
      with_report: Array.from(reportMap.values()).filter(v => v.hasReport).length,
      orphans: orphanCounts,
      synced_at: syncedAt,
    });
  } catch (err: any) {
    console.error('[event-summary-tracker/sync POST]', err);
    return NextResponse.json(
      { error: err.message || 'Sync failed' },
      { status: 500 }
    );
  }
}
