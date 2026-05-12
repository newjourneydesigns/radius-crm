/**
 * POST /api/circle-summary/submit
 *
 * The main submission endpoint. Does the following in order:
 *   1. Verify session
 *   2. Validate payload
 *   3. Format the final CCB notes blob (base notes + dynamic responses +
 *      manual roster additions + info update requests)
 *   4. Push to CCB via create_event_attendance with email_notification=leaders
 *   5. Record the submission in circle_event_summaries
 *   6. Record any manual roster additions and info-update requests
 *   7. Mark the leader's event_summary_received flag (best-effort)
 *   8. Clear the draft
 *
 * Body shape:
 * {
 *   eventId: string,
 *   occurrence: string,                    // "YYYY-MM-DD HH:MM:SS"
 *   didNotMeet: boolean,
 *   didNotMeetReason?: string,
 *   topic?: string,
 *   notes?: string,
 *   prayerRequests?: string,
 *   info?: string,
 *   attendeeCcbIds?: string[],
 *   manualAttendees?: Array<{ firstName, lastName, phone?, email? }>,
 *   dynamicResponses?: Array<{ questionId, label, value }>,
 *   infoUpdate?: { day?, time?, location?, current: { day?, time?, location? } }
 * }
 */

import { NextResponse } from 'next/server';
import { getSessionLeader, unauthorized } from '../../../../lib/circle-summary/session';
import { createCCBClient } from '../../../../lib/ccb/ccb-client';
import { getCCBRequestContext } from '../../../../lib/ccb/ccb-api-gateway';
import { createServiceSupabaseClient } from '../../../../lib/server-supabase';
import {
  formatNotesForCCB,
  type DynamicResponse,
  type InfoUpdate,
  type ManualAttendee,
} from '../../../../lib/circle-summary/notes-formatter';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  const leader = await getSessionLeader();
  if (!leader) return unauthorized();

  let body: any = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const {
    eventId,
    occurrence,
    didNotMeet = false,
    didNotMeetReason = '',
    topic = '',
    notes = '',
    prayerRequests = '',
    info = '',
    attendeeCcbIds = [],
    manualAttendees = [],
    dynamicResponses = [],
    infoUpdate,
  } = body as {
    eventId?: string;
    occurrence?: string;
    didNotMeet?: boolean;
    didNotMeetReason?: string;
    topic?: string;
    notes?: string;
    prayerRequests?: string;
    info?: string;
    attendeeCcbIds?: string[];
    manualAttendees?: ManualAttendee[];
    dynamicResponses?: Array<DynamicResponse & { questionId: string }>;
    infoUpdate?: {
      day?: string;
      time?: string;
      location?: string;
      current?: { day?: string; time?: string; location?: string };
    };
  };

  if (!eventId || !occurrence) {
    return NextResponse.json(
      { error: 'eventId and occurrence are required.' },
      { status: 400 }
    );
  }
  if (didNotMeet && !didNotMeetReason.trim()) {
    return NextResponse.json(
      { error: 'Please tell us why your Circle did not meet.' },
      { status: 400 }
    );
  }

  // Build the info-update list for the notes blob (only fields actually changed)
  const infoUpdates: InfoUpdate[] = [];
  if (infoUpdate) {
    const cur = infoUpdate.current || {};
    if (infoUpdate.day && infoUpdate.day !== cur.day) {
      infoUpdates.push({ field: 'Meeting day', current: cur.day || '', requested: infoUpdate.day });
    }
    if (infoUpdate.time && infoUpdate.time !== cur.time) {
      infoUpdates.push({
        field: 'Meeting time',
        current: cur.time || '',
        requested: infoUpdate.time,
      });
    }
    if (infoUpdate.location && infoUpdate.location !== cur.location) {
      infoUpdates.push({
        field: 'Meeting location',
        current: cur.location || '',
        requested: infoUpdate.location,
      });
    }
  }

  const finalNotes = formatNotesForCCB({
    baseNotes: notes,
    manualAttendees,
    dynamicResponses,
    infoUpdates,
    didNotMeetReason: didNotMeet ? didNotMeetReason : undefined,
  });

  // Push to CCB
  const ccb = createCCBClient(
    await getCCBRequestContext(req, { module: 'circle-summary', action: 'submit' })
  );

  let ccbResponse: any = null;
  let ccbError: string | null = null;
  let status: 'submitted' | 'failed' = 'submitted';

  try {
    ccbResponse = await ccb.createEventAttendance({
      eventId,
      occurrence,
      didNotMeet,
      attendeeIds: didNotMeet ? [] : attendeeCcbIds,
      topic: didNotMeet ? '' : topic,
      notes: finalNotes,
      prayerRequests: didNotMeet ? '' : prayerRequests,
      info: didNotMeet ? '' : info,
      emailNotification: 'leaders',
    });
  } catch (e: any) {
    ccbError = e.message || String(e);
    status = 'failed';
  }

  // Write audit row (whether CCB succeeded or not)
  const supabase = createServiceSupabaseClient();
  const clientIp =
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    req.headers.get('x-real-ip') ||
    null;

  const { data: summaryRow, error: summaryError } = await supabase
    .from('circle_event_summaries')
    .upsert(
      {
        leader_id: leader.id,
        ccb_event_id: eventId,
        ccb_group_id: leader.ccb_group_id ?? null,
        occurrence,
        did_not_meet: didNotMeet,
        did_not_meet_reason: didNotMeet ? didNotMeetReason : null,
        topic: didNotMeet ? null : topic,
        notes: finalNotes,
        prayer_requests: didNotMeet ? null : prayerRequests,
        info: didNotMeet ? null : info,
        attendee_ccb_ids: didNotMeet ? [] : attendeeCcbIds,
        manual_attendees: manualAttendees,
        dynamic_responses: dynamicResponses.reduce((acc, r) => {
          acc[r.questionId] = { label: r.label, value: r.value };
          return acc;
        }, {} as Record<string, any>),
        info_update_requested: infoUpdate ?? null,
        ccb_submitted_at: status === 'submitted' ? new Date().toISOString() : null,
        ccb_response: ccbResponse,
        ccb_error: ccbError,
        status,
        submitted_via: 'public_link',
        client_ip: clientIp,
        user_agent: req.headers.get('user-agent') || null,
      },
      { onConflict: 'leader_id,ccb_event_id,occurrence' }
    )
    .select('id')
    .single();

  if (summaryError) {
    console.error('Audit insert failed:', summaryError);
    // CCB push may have succeeded — surface that
    return NextResponse.json(
      {
        ok: status === 'submitted',
        ccbStatus: status,
        ccbError,
        auditError: summaryError.message,
      },
      { status: 500 }
    );
  }

  // Record manual roster + info update child rows
  if (manualAttendees.length) {
    await supabase.from('manual_roster_additions').insert(
      manualAttendees.map((m) => ({
        summary_id: summaryRow.id,
        leader_id: leader.id,
        first_name: m.firstName,
        last_name: m.lastName,
        phone: m.phone ?? null,
        email: m.email ?? null,
        attended: true,
      }))
    );
  }

  if (infoUpdates.length) {
    await supabase.from('circle_info_update_requests').insert({
      summary_id: summaryRow.id,
      leader_id: leader.id,
      existing_day: infoUpdate?.current?.day ?? null,
      existing_time: infoUpdate?.current?.time ?? null,
      existing_location: infoUpdate?.current?.location ?? null,
      proposed_day: infoUpdate?.day ?? null,
      proposed_time: infoUpdate?.time ?? null,
      proposed_location: infoUpdate?.location ?? null,
    });
  }

  // Clear draft on successful CCB submission
  if (status === 'submitted') {
    await supabase
      .from('circle_event_summary_drafts')
      .delete()
      .eq('leader_id', leader.id)
      .eq('ccb_event_id', eventId)
      .eq('occurrence', occurrence);

    // Best-effort: mark leader as having submitted recently
    await supabase
      .from('circle_leaders')
      .update({ event_summary_received: true, event_summary_skipped: false })
      .eq('id', leader.id);
  }

  return NextResponse.json({
    ok: status === 'submitted',
    summaryId: summaryRow.id,
    ccbStatus: status,
    ccbError,
  });
}
