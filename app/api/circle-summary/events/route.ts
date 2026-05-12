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

  // Pull every scheduled occurrence in the window from the group's CCB iCal
  // calendar. Then enrich with attendance_profile per event to flag which
  // already have a summary.
  let events: Array<{
    eventId: string;
    occurrenceDate: string;
    occurrenceDateTime: string;
    title: string;
    hasExistingAttendance: boolean;
    didNotMeet: boolean;
  }> = [];
  try {
    const calEvents = await ccb.getGroupCalendarEvents(
      String(leader.ccb_group_id),
      start.toFormat('yyyy-LL-dd'),
      end.toFormat('yyyy-LL-dd')
    );

    // Look up attendance per (eventId, occurrence) in parallel, capped.
    const attendanceLookups = await Promise.all(
      calEvents.map(async (e) => {
        try {
          const occurYYYYMMDD = e.startDate.replace(/-/g, '');
          const xml: any = await (ccb as any).getXml({
            srv: 'attendance_profile',
            id: e.eventId,
            occurrence: `${e.startDate} ${e.startTime}`,
          });
          const a = xml?.ccb_api?.response?.attendance ?? null;
          const has =
            !!(a?.notes || a?.topic || (a?.attendees?.attendee && (Array.isArray(a.attendees.attendee) ? a.attendees.attendee.length : 1)));
          const dnm = String(a?.did_not_meet ?? '').toLowerCase() === 'true';
          return { hasExistingAttendance: has, didNotMeet: dnm };
        } catch {
          return { hasExistingAttendance: false, didNotMeet: false };
        }
      })
    );

    events = calEvents.map((e, i) => ({
      eventId: e.eventId,
      occurrenceDate: e.startDate,
      occurrenceDateTime: e.startDateTime,
      title: e.title,
      hasExistingAttendance: attendanceLookups[i].hasExistingAttendance,
      didNotMeet: attendanceLookups[i].didNotMeet,
    }));
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
