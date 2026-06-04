/**
 * GET /api/circle-leader-toolkit/submission?id=UUID
 *
 * Returns the signed-in leader's submitted summary for the thank-you page.
 */

import { NextResponse } from 'next/server';
import { getSessionLeader, unauthorized } from '../../../../lib/circle-leader-toolkit/session';
import { createServiceSupabaseClient } from '../../../../lib/server-supabase';
import { cleanManualAttendees, splitLegacyRosterAdditions } from '../../../../lib/circle-leader-toolkit/notes-formatter';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const leader = await getSessionLeader();
  if (!leader) return unauthorized();

  const url = new URL(req.url);
  const id = url.searchParams.get('id');
  if (!id) {
    return NextResponse.json({ error: 'id is required.' }, { status: 400 });
  }

  const supabase = createServiceSupabaseClient();
  const { data, error } = await supabase
    .from('circle_event_summaries')
    .select(
      'id, occurrence, did_not_meet, did_not_meet_reason, topic, notes, prayer_requests, info, attendee_ccb_ids, manual_attendees, dynamic_responses, info_update_requested, created_at'
    )
    .eq('id', id)
    .eq('leader_id', leader.id)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json({ error: 'Submission not found.' }, { status: 404 });
  }

  const dynamicResponses = data.dynamic_responses
    ? Object.entries(data.dynamic_responses as Record<string, { label?: string; value?: unknown }>).map(
        ([questionId, response]) => ({
          questionId,
          label: response?.label || 'Question',
          value: response?.value ?? '',
        })
      )
    : [];
  const parsed = splitLegacyRosterAdditions(data.notes ?? '');
  const existingManual = cleanManualAttendees(data.manual_attendees);
  const manualAttendees = existingManual.length ? existingManual : parsed.manualAttendees;

  return NextResponse.json({
    submission: {
      summaryId: data.id,
      submittedAt: data.created_at,
      occurrence: data.occurrence,
      didNotMeet: data.did_not_meet,
      didNotMeetReason: data.did_not_meet_reason ?? '',
      attendeeCount: Array.isArray(data.attendee_ccb_ids) ? data.attendee_ccb_ids.length : 0,
      manualAttendees,
      topic: data.topic ?? '',
      notes: parsed.notes,
      prayerRequests: data.prayer_requests ?? '',
      info: data.info ?? '',
      dynamicResponses,
      infoUpdate: data.info_update_requested ?? null,
    },
  });
}
