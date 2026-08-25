/**
 * POST /api/circle-leader-toolkit/submit
 *
 * The main submission endpoint. Does the following in order:
 *   1. Verify session
 *   2. Validate payload
 *   3. Format the final CCB notes blob (base notes + dynamic responses +
 *      manual roster additions + info update requests)
 *   4. Push to CCB via create_event_attendance with email_notification=leaders,
 *      reconciling the occurrence's head count (see ccb-attendance-push.ts —
 *      CCB adds head counts rather than replacing them)
 *   5. Record the submission in circle_event_summaries
 *   6. Record any manual roster additions and info-update requests, and
 *      flag an ACPD follow-up for manual people not yet added to CCB
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
 *   manualAttendees?: Array<{ firstName, lastName, phone, email }>,
 *   dynamicResponses?: Array<{ questionId, label, value }>,
 *   infoUpdate?: { day?, time?, location?, current: { day?, time?, location? } }
 * }
 */

import { NextResponse } from 'next/server';
import { DateTime } from 'luxon';
import { getSessionLeader, unauthorized } from '../../../../lib/circle-leader-toolkit/session';
import { leaderOwnsEvent } from '../../../../lib/circle-leader-toolkit/events-data';
import { createCCBClient } from '../../../../lib/ccb/ccb-client';
import { getCCBRequestContext, recordCCBAlert } from '../../../../lib/ccb/ccb-api-gateway';
import { createServiceSupabaseClient } from '../../../../lib/server-supabase';
import { pushCircleSummaryToCCB } from '../../../../lib/circle-leader-toolkit/ccb-attendance-push';
import {
  flattenForCCB,
  cleanManualAttendees,
  diffInfoUpdate,
  formatNotesForCCB,
  manualAttendeeKey,
  normalizeSummaryText,
  type DynamicResponse,
  type InfoUpdate,
  type ManualAttendee,
} from '../../../../lib/circle-leader-toolkit/notes-formatter';

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

function isMissingIgnoredEventsTableError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const maybe = err as { code?: string; message?: string; details?: string };
  const text = `${maybe.code || ''} ${maybe.message || ''} ${maybe.details || ''}`.toLowerCase();
  return (
    text.includes('circle_summary_ignored_events') ||
    text.includes('schema cache') ||
    text.includes('does not exist') ||
    text.includes('could not find')
  );
}

function getManualAttendeeValidationError(attendees: ManualAttendee[]): string | null {
  const requiredFields: Array<[keyof ManualAttendee, string]> = [
    ['firstName', 'first name'],
    ['lastName', 'last name'],
    ['phone', 'cell phone'],
    ['email', 'email'],
  ];

  for (let index = 0; index < attendees.length; index += 1) {
    const attendee = attendees[index];
    const missing = requiredFields
      .filter(([key]) => !String(attendee[key] ?? '').trim())
      .map(([, label]) => label);

    if (missing.length > 0) {
      return `Please provide ${missing.join(', ')} for new person #${index + 1}.`;
    }
  }

  return null;
}

/**
 * Manual attendees are first-timers the leader reports who don't exist in CCB
 * yet, and the ACPD has to create each of them in CCB by hand. Until now that
 * ask only lived inside the CCB notes blob, where it was easy to miss — so
 * raise it in the leader's follow-up slot, where ACPDs already work.
 *
 * The note carries one "Add to CCB" line per occurrence date; a resubmission
 * for the same date replaces its line instead of stacking duplicates. An
 * existing follow-up keeps its date/time — we only set the required flag and
 * date when the slot is free.
 */
async function upsertAddToCCBFollowUp(input: {
  supabase: ReturnType<typeof createServiceSupabaseClient>;
  leaderId: number | string;
  occurrenceStart: DateTime;
  now: DateTime;
  newPeople: ManualAttendee[];
}): Promise<void> {
  const { supabase, leaderId, occurrenceStart, now, newPeople } = input;

  const { data: leaderRow, error: leaderError } = await supabase
    .from('circle_leaders')
    .select('follow_up_required, follow_up_date, follow_up_note')
    .eq('id', leaderId)
    .single();
  if (leaderError) throw leaderError;

  const linePrefix = `Add to CCB (from ${occurrenceStart.toFormat('M/d')} Circle summary):`;
  const people = newPeople.map((person) => {
    const name = `${person.firstName} ${person.lastName}`.trim();
    const contact = [person.phone ?? '', person.email ?? '']
      .map((part) => part.trim())
      .filter(Boolean);
    return contact.length ? `${name} (${contact.join(', ')})` : name;
  });
  // Collapse whitespace so the whole entry stays one line — the per-date
  // replace below is a simple line swap.
  const followUpLine = `${linePrefix} ${people.join('; ')}`.replace(/\s+/g, ' ').trim();

  const existingNote = String(leaderRow?.follow_up_note ?? '');
  const noteLines = existingNote.split(/\r?\n/);
  const sameDateLineIndex = noteLines.findIndex((line) => line.trim().startsWith(linePrefix));

  let nextNote: string;
  if (sameDateLineIndex >= 0) {
    noteLines[sameDateLineIndex] = followUpLine;
    nextNote = noteLines.join('\n');
  } else {
    const trimmedExisting = existingNote.trimEnd();
    nextNote = trimmedExisting ? `${trimmedExisting}\n${followUpLine}` : followUpLine;
  }

  const { error: updateError } = await supabase
    .from('circle_leaders')
    .update({
      follow_up_note: nextNote,
      ...(leaderRow?.follow_up_required
        ? {}
        : { follow_up_required: true, follow_up_date: now.toISODate() }),
    })
    .eq('id', leaderId);
  if (updateError) throw updateError;
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

  // eventId/occurrence come from the request body — confirm this meeting is on
  // the signed-in leader's own Circle calendar before touching CCB. Without it,
  // leader A could submit against leader B's eventId and rewrite B's summary
  // (create_event_attendance replaces the notes and merges the attendee list)
  // or inflate B's head count (CCB adds head counts rather than replacing them).
  if (!(await leaderOwnsEvent(leader, eventId, occurrence))) {
    return NextResponse.json(
      { error: 'That meeting is not on your Circle calendar.' },
      { status: 403 }
    );
  }

  // Build the info-update list for the notes blob (only fields actually changed)
  const infoUpdates: InfoUpdate[] = diffInfoUpdate(infoUpdate);

  const cleanNotes = normalizeSummaryText(notes);
  const cleanPrayerRequests = normalizeSummaryText(prayerRequests);
  const cleanInfo = normalizeSummaryText(info);
  const manualAttendeesForSubmit = didNotMeet ? [] : cleanManualAttendees(manualAttendees);
  const manualAttendeeValidationError = getManualAttendeeValidationError(manualAttendeesForSubmit);
  if (manualAttendeeValidationError) {
    return NextResponse.json({ error: manualAttendeeValidationError }, { status: 400 });
  }
  const supabase = createServiceSupabaseClient();
  const { data: ignoredEvent, error: ignoredError } = await supabase
    .from('circle_summary_ignored_events')
    .select('id')
    .eq('leader_id', leader.id)
    .eq('ccb_event_id', eventId)
    .eq('occurrence_date', occurrence.slice(0, 10))
    .maybeSingle();
  if (ignoredError && !isMissingIgnoredEventsTableError(ignoredError)) {
    return NextResponse.json({ error: ignoredError.message }, { status: 500 });
  }
  if (ignoredEvent) {
    return NextResponse.json(
      { error: 'This event was removed from the Circle Summary list.' },
      { status: 410 }
    );
  }

  const { data: existingSummary } = await supabase
    .from('circle_event_summaries')
    .select('status, ccb_submitted_at, did_not_meet, manual_attendees')
    .eq('leader_id', leader.id)
    .eq('ccb_event_id', eventId)
    .eq('occurrence', occurrence)
    .maybeSingle();
  const isCCBResubmission = Boolean(
    existingSummary?.ccb_submitted_at && existingSummary?.status === 'submitted'
  );
  // Head count an earlier submission for this occurrence already pushed into
  // CCB. Counted even when that submission was recorded as failed: it can fail
  // on the read-back check after CCB accepted the write. Only used to explain a
  // count we can no longer reduce, so an over-estimate is the safe direction.
  const previousHeadCount =
    existingSummary && !existingSummary.did_not_meet && Array.isArray(existingSummary.manual_attendees)
      ? existingSummary.manual_attendees.length
      : 0;

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

  // Named attendees are idempotent per person — CCB dedupes them by individual
  // ID — so a resubmission sends the leader's full current selection and can
  // never double-count anyone. The head count is the opposite: CCB ADDS it, so
  // it is reconciled against what CCB already holds inside the push helper.
  // isCCBResubmission only tells the helper that a repeat write is expected.
  const push = await pushCircleSummaryToCCB({
    ccb,
    eventId,
    occurrence,
    didNotMeet,
    attendeeIds: attendeeCcbIds,
    manualAttendeeCount: manualAttendeesForSubmit.length,
    previousHeadCount,
    isResubmission: isCCBResubmission,
    topic: flattenForCCB(topic),
    notes: finalNotes,
    prayerRequests: flattenForCCB(cleanPrayerRequests),
    info: flattenForCCB(cleanInfo),
  });

  const ccbResponse = push.response;
  const ccbError = push.error;
  const status = push.status;
  const ccbVerification = push.verification;

  // CCB can be added to but never reduced, so a head count that is already too
  // high needs a human in CCB. Raise it where staff will see it instead of
  // letting the occurrence quietly disagree with the summary. One open alert
  // per occurrence — a leader resubmitting a drifted meeting shouldn't bury the
  // rest of the CCB dashboard.
  if (push.headCount.excessInCCB) {
    const alertPrefix = `Event ${eventId} on ${occurrence}:`;
    const { data: existingAlerts } = await supabase
      .from('ccb_api_alerts')
      .select('id')
      .is('resolved_at', null)
      .like('message', `${alertPrefix}%`)
      .limit(1);

    if (!existingAlerts?.length) {
      await recordCCBAlert({
        severity: 'warning',
        title: 'CCB head count is higher than the submitted Circle summary',
        message:
          `${alertPrefix} CCB counts ${push.headCount.excessInCCB} more off-roster ` +
          `${push.headCount.excessInCCB === 1 ? 'person' : 'people'} than ` +
          `${leader.name || 'the leader'} reported. CCB's head count can only be added to, so it ` +
          'has to be corrected on the occurrence in CCB.',
        service: 'create_event_attendance',
      });
    }
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
        // Wrap the raw write response with the read-back verification outcome
        // and the head-count reconciliation, so support can see whether a
        // "submitted" row was actually confirmed and what CCB's count did.
        ccb_response: {
          write: ccbResponse,
          verification: ccbVerification,
          headCount: push.headCount,
        },
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
  // ACPDs stamp added_to_ccb_at/_by on manual_roster_additions once they've
  // entered a person into CCB, so read those stamps first and carry them over
  // by person identity — otherwise a leader editing and resubmitting this
  // summary would silently reset people back to "not added yet".
  const { data: priorAdditions, error: priorAdditionsError } = await supabase
    .from('manual_roster_additions')
    .select('id, first_name, last_name, phone, email, added_to_ccb_at, added_to_ccb_by')
    .eq('summary_id', summaryRow.id);
  if (priorAdditionsError) {
    console.error('Could not read prior manual roster additions:', priorAdditionsError);
  }
  const addedToCCBByPerson = new Map<
    string,
    { added_to_ccb_at: string; added_to_ccb_by: string | null }
  >();
  for (const row of priorAdditions ?? []) {
    if (!row.added_to_ccb_at) continue;
    addedToCCBByPerson.set(
      manualAttendeeKey({
        firstName: row.first_name,
        lastName: row.last_name,
        phone: row.phone,
        email: row.email,
      }),
      { added_to_ccb_at: row.added_to_ccb_at, added_to_ccb_by: row.added_to_ccb_by }
    );
  }

  await supabase.from('manual_roster_additions').delete().eq('summary_id', summaryRow.id);
  await supabase.from('circle_info_update_requests').delete().eq('summary_id', summaryRow.id);

  if (manualAttendeesForSubmit.length) {
    await supabase.from('manual_roster_additions').insert(
      manualAttendeesForSubmit.map((m) => {
        const addedToCCB = addedToCCBByPerson.get(manualAttendeeKey(m));
        return {
          summary_id: summaryRow.id,
          leader_id: leader.id,
          first_name: m.firstName,
          last_name: m.lastName,
          phone: m.phone ?? null,
          email: m.email ?? null,
          attended: true,
          // If the stamp read failed — e.g. the tracking migration hasn't been
          // applied yet, so the columns don't exist — the map is empty and
          // these would be null anyway. Omit them so the insert still succeeds
          // on a pre-migration database.
          ...(priorAdditionsError
            ? {}
            : {
                added_to_ccb_at: addedToCCB?.added_to_ccb_at ?? null,
                added_to_ccb_by: addedToCCB?.added_to_ccb_by ?? null,
              }),
        };
      })
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

  // Any manual attendee not yet stamped added-to-CCB needs the ACPD to create
  // them in CCB by hand (see upsertAddToCCBFollowUp). This runs even when the
  // CCB attendance push failed — the people need adding either way — and is
  // best-effort: it must never fail the leader's submission.
  const peopleNotYetInCCB = manualAttendeesForSubmit.filter(
    (m) => !addedToCCBByPerson.has(manualAttendeeKey(m))
  );
  if (peopleNotYetInCCB.length) {
    try {
      await upsertAddToCCBFollowUp({
        supabase,
        leaderId: leader.id,
        occurrenceStart,
        now,
        newPeople: peopleNotYetInCCB,
      });
    } catch (err) {
      console.error('Add-to-CCB follow-up update failed:', err);
    }
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
    ccbVerification: ccbVerification?.status ?? null,
    ...(status === 'failed'
      ? {
          code: 'CCB_SAVE_FAILED',
          retryable: true,
          error:
            "We couldn't confirm your summary was saved to the church system. Nothing you entered was lost — please tap Submit Again. If it still doesn't go through, your Director will see the details and follow up.",
        }
      : {}),
  });
}
