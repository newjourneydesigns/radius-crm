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
 *   7. Mark the leader's weekly event summary state (best-effort)
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
import { DateTime } from 'luxon';
import { getSessionLeader, unauthorized } from '../../../../lib/circle-summary/session';
import { createCCBClient } from '../../../../lib/ccb/ccb-client';
import { getCCBRequestContext } from '../../../../lib/ccb/ccb-api-gateway';
import { createServiceSupabaseClient } from '../../../../lib/server-supabase';
import {
  flattenForCCB,
  cleanManualAttendees,
  formatNotesForCCB,
  normalizeSummaryText,
  type DynamicResponse,
  type InfoUpdate,
  type ManualAttendee,
} from '../../../../lib/circle-summary/notes-formatter';

export const dynamic = 'force-dynamic';

function parseOccurrenceStart(occurrence: string): DateTime | null {
  const sqlDate = DateTime.fromSQL(occurrence, { zone: 'America/Chicago' });
  if (sqlDate.isValid) return sqlDate;

  const isoDate = DateTime.fromISO(occurrence.replace(' ', 'T'), {
    zone: 'America/Chicago',
  });
  return isoDate.isValid ? isoDate : null;
}

function weekStartFromOccurrence(occurrence: string): string | null {
  const parsed = parseOccurrenceStart(occurrence);
  if (!parsed) return null;
  return parsed.minus({ days: parsed.weekday % 7 }).toISODate();
}

export async function POST(req: Request) {
  const leader = await getSessionLeader();
  if (!leader) return unauthorized();

  let body: unknown = {};
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
  const occurrenceStart = parseOccurrenceStart(occurrence);
  if (!occurrenceStart) {
    return NextResponse.json(
      { error: 'Invalid meeting occurrence time.' },
      { status: 400 }
    );
  }
  const now = DateTime.now().setZone('America/Chicago');
  if (now.toMillis() < occurrenceStart.toMillis()) {
    return NextResponse.json(
      {
        ok: false,
        code: 'MEETING_NOT_STARTED',
        error: `You can submit this summary after the Circle meeting starts at ${occurrenceStart.toFormat('h:mm a')} on ${occurrenceStart.toFormat('cccc, LLLL d')}.`,
        unlockAt: occurrenceStart.toISO(),
      },
      { status: 409 }
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

  const cleanNotes = normalizeSummaryText(notes);
  const cleanPrayerRequests = normalizeSummaryText(prayerRequests);
  const cleanInfo = normalizeSummaryText(info);
  const manualAttendeesForSubmit = didNotMeet ? [] : cleanManualAttendees(manualAttendees);
  const supabase = createServiceSupabaseClient();
  const { data: existingSummary } = await supabase
    .from('circle_event_summaries')
    .select('status, ccb_submitted_at')
    .eq('leader_id', leader.id)
    .eq('ccb_event_id', eventId)
    .eq('occurrence', occurrence)
    .maybeSingle();
  const isCCBResubmission = Boolean(
    existingSummary?.ccb_submitted_at && existingSummary?.status === 'submitted'
  );

  const finalNotes = formatNotesForCCB({
    baseNotes: cleanNotes,
    manualAttendees: manualAttendeesForSubmit,
    dynamicResponses,
    infoUpdates,
    didNotMeetReason: didNotMeet ? didNotMeetReason : undefined,
  });

  // Push to CCB
  const ccb = createCCBClient(
    await getCCBRequestContext(req, { module: 'circle-summary', action: 'submit' })
  );

  let ccbResponse: unknown = null;
  let ccbError: string | null = null;
  let status: 'submitted' | 'failed' = 'submitted';

  try {
    const ccbAttendancePayload = {
      eventId,
      occurrence,
      didNotMeet,
      attendeeIds: isCCBResubmission || didNotMeet ? [] : attendeeCcbIds,
      headCount: isCCBResubmission || didNotMeet ? undefined : manualAttendeesForSubmit.length,
      topic: didNotMeet ? undefined : flattenForCCB(topic),
      notes: finalNotes,
      prayerRequests: didNotMeet ? undefined : flattenForCCB(cleanPrayerRequests),
      info: didNotMeet ? undefined : flattenForCCB(cleanInfo),
      emailNotification: 'leaders',
    } as const;

    if (process.env.NODE_ENV !== 'production') {
      console.info('[circle-summary] CCB attendance payload counts', {
        eventId,
        occurrence,
        didNotMeet,
        isCCBResubmission,
        rosterAttendeeCount: ccbAttendancePayload.attendeeIds.length,
        manualAttendeeCount: manualAttendeesForSubmit.length,
        headCount: ccbAttendancePayload.headCount,
        totalExpectedAttendance:
          ccbAttendancePayload.attendeeIds.length + manualAttendeesForSubmit.length,
      });
    }

    try {
      ccbResponse = await ccb.createEventAttendance(ccbAttendancePayload);
    } catch (firstError: unknown) {
      try {
        ccbResponse = await ccb.createEventAttendance({
          ...ccbAttendancePayload,
          emailNotification: 'none',
        });
      } catch (fallbackError: unknown) {
        const firstMessage = firstError instanceof Error ? firstError.message : String(firstError);
        const fallbackMessage =
          fallbackError instanceof Error ? fallbackError.message : String(fallbackError);
        throw new Error(`${firstMessage}; fallback without email notification also failed: ${fallbackMessage}`);
      }
    }
  } catch (e: unknown) {
    ccbError = e instanceof Error ? e.message : String(e);
    status = 'failed';
  }

  // Write audit row (whether CCB succeeded or not)
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
        // Store the user's raw notes so re-edits can repopulate cleanly.
        // The composed blob (finalNotes) is what we send to CCB but only
        // stored on the CCB side, not duplicated here.
        notes: cleanNotes,
        prayer_requests: didNotMeet ? null : cleanPrayerRequests,
        info: didNotMeet ? null : cleanInfo,
        attendee_ccb_ids: didNotMeet ? [] : attendeeCcbIds,
        manual_attendees: manualAttendeesForSubmit,
        dynamic_responses: dynamicResponses.reduce((acc, r) => {
          acc[r.questionId] = { label: r.label, value: r.value };
          return acc;
        }, {} as Record<string, { label: string; value: DynamicResponse['value'] }>),
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

  // Record manual roster + info update child rows. Because the summary row
  // is upserted by occurrence, clear old child rows before re-inserting.
  await supabase.from('manual_roster_additions').delete().eq('summary_id', summaryRow.id);
  await supabase.from('circle_info_update_requests').delete().eq('summary_id', summaryRow.id);

  if (manualAttendeesForSubmit.length) {
    await supabase.from('manual_roster_additions').insert(
      manualAttendeesForSubmit.map((m) => ({
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

  // Clear the draft only after CCB accepted the attendance write. A failed
  // CCB save must stay visible as a failed submission, not as local success.
  if (status === 'submitted') {
    await supabase
      .from('circle_event_summary_drafts')
      .delete()
      .eq('leader_id', leader.id)
      .eq('ccb_event_id', eventId)
      .eq('occurrence', occurrence);

    // Best-effort: mark the leader's weekly summary state. The enum column is
    // canonical; legacy booleans are included for older deployments/fallback.
    const nextState = didNotMeet ? 'did_not_meet' : 'received';
    const legacySummaryState = {
      event_summary_received: !didNotMeet,
      event_summary_skipped: didNotMeet,
    };
    const stateUpdate = await supabase
      .from('circle_leaders')
      .update({
        event_summary_state: nextState,
        event_summary_state_week: weekStartFromOccurrence(occurrence),
        ...legacySummaryState,
      })
      .eq('id', leader.id);

    if (stateUpdate.error && /event_summary_state/i.test(stateUpdate.error.message || '')) {
      await supabase
        .from('circle_leaders')
        .update(legacySummaryState)
        .eq('id', leader.id);
    }
  }

  return NextResponse.json({
    ok: status === 'submitted',
    summaryId: summaryRow.id,
    ccbStatus: status,
    ccbError,
  });
}
