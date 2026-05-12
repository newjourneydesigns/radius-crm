/**
 * GET /api/circle-summary/events
 *
 * Returns the current leader's circle events for the last 8 weeks, each tagged
 * with whether a summary has already been submitted (so the UI can show
 * "needs submission" vs "submitted").
 *
 * Sources:
 *   - CCB: attendance_profile / event occurrences via existing client
 *   - Supabase: circle_event_summaries audit log
 */

import { NextResponse } from 'next/server';
import { DateTime } from 'luxon';
import { getSessionLeader, unauthorized } from '../../../../lib/circle-summary/session';
import { createCCBClient } from '../../../../lib/ccb/ccb-client';
import { getCCBRequestContext } from '../../../../lib/ccb/ccb-api-gateway';
import { createServiceSupabaseClient } from '../../../../lib/server-supabase';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const leader = await getSessionLeader();
  if (!leader) return unauthorized();
  if (!leader.ccb_group_id) {
    return NextResponse.json({
      leader,
      events: [],
      message: 'No CCB group is linked to your profile yet. Please contact your ACPD.',
    });
  }

  const end = DateTime.now().setZone('America/Chicago');
  const start = end.minus({ weeks: 8 });

  const ccb = createCCBClient(
    await getCCBRequestContext(req, { module: 'circle-summary', action: 'list_events' })
  );

  // Pull all attendance profiles in window, then filter to this leader's group
  // by event title match (CCB doesn't return group on attendance_profiles).
  let events: Array<{
    eventId: string;
    occurrenceDate: string;
    occurrenceDateTime: string;
    title: string;
    hasExistingAttendance: boolean;
    didNotMeet: boolean;
  }> = [];
  try {
    const map = await ccb.fetchAllAttendanceInRange(
      start.toFormat('yyyy-LL-dd'),
      end.toFormat('yyyy-LL-dd')
    );

    // Build candidate list — we'd ideally know the leader's group's event IDs.
    // Falling back to title-match against the leader's name + "Radius"/"Circle".
    const leaderNameLower = (leader.name || '').toLowerCase();
    const groupId = leader.ccb_group_id;

    for (const links of map.values()) {
      for (const link of links) {
        const titleLower = (link.title || '').toLowerCase();
        const matches =
          (groupId && (link as any).groupId === groupId) ||
          (leaderNameLower && titleLower.includes(leaderNameLower));
        if (!matches) continue;
        const dt = DateTime.fromFormat(link.occurDate, 'yyyy-LL-dd', { zone: 'America/Chicago' });
        events.push({
          eventId: link.eventId,
          occurrenceDate: link.occurDate,
          occurrenceDateTime: dt.toFormat('yyyy-LL-dd HH:mm:ss'),
          title: link.title,
          hasExistingAttendance:
            !!(link.attendance?.notes || link.attendance?.topic || link.attendance?.attendees?.length),
          didNotMeet: !!link.attendance?.didNotMeet,
        });
      }
    }
  } catch (e: any) {
    console.error('CCB fetch failed for circle-summary events:', e);
    return NextResponse.json({ leader, events: [], error: 'Could not load events from CCB.' });
  }

  // Cross-check Supabase audit log
  const supabase = createServiceSupabaseClient();
  const { data: submissions } = await supabase
    .from('circle_event_summaries')
    .select('ccb_event_id, occurrence, status, did_not_meet, submitted_via, created_at')
    .eq('leader_id', leader.id)
    .gte('occurrence', start.toISO()!);

  const submittedSet = new Map<string, any>();
  for (const s of submissions || []) {
    const key = `${s.ccb_event_id}|${DateTime.fromISO(s.occurrence as any).toFormat('yyyy-LL-dd')}`;
    submittedSet.set(key, s);
  }

  const enriched = events
    .map((e) => {
      const key = `${e.eventId}|${e.occurrenceDate}`;
      const sub = submittedSet.get(key);
      return {
        ...e,
        submittedAt: sub?.created_at ?? null,
        submittedStatus: sub?.status ?? null,
      };
    })
    .sort((a, b) => (a.occurrenceDate < b.occurrenceDate ? 1 : -1));

  return NextResponse.json({ leader, events: enriched });
}
