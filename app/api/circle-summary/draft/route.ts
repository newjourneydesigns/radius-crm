/**
 * GET  /api/circle-summary/draft?event_id=X&occurrence=YYYY-MM-DD HH:MM:SS
 *   Returns the leader's saved draft for that event+occurrence (if any).
 *
 * POST /api/circle-summary/draft
 *   Body: { eventId, occurrence, payload }
 *   Upserts a draft.
 */

import { NextResponse } from 'next/server';
import { getSessionLeader, unauthorized } from '../../../../lib/circle-summary/session';
import { createServiceSupabaseClient } from '../../../../lib/server-supabase';
import { cleanManualAttendees, splitLegacyRosterAdditions } from '../../../../lib/circle-summary/notes-formatter';

export const dynamic = 'force-dynamic';

async function fetchCcbAttendance(req: Request, eventId: string, occurrence: string) {
  try {
    const { createCCBClient } = await import('../../../../lib/ccb/ccb-client');
    const { getCCBRequestContext } = await import('../../../../lib/ccb/ccb-api-gateway');
    const ccb = createCCBClient(
      await getCCBRequestContext(req, { module: 'circle-summary', action: 'draft_ccb_prefill' })
    );
    const occurrenceDateOnly = occurrence.slice(0, 10);
    const xml: any = await (ccb as any).getXml({
      srv: 'attendance_profile',
      id: eventId,
      occurrence: occurrenceDateOnly,
    });
    const response = xml?.ccb_api?.response ?? null;
    const eventsRoot = response?.events ?? null;
    const firstEvent = Array.isArray(eventsRoot?.event)
      ? eventsRoot.event[0]
      : eventsRoot?.event ?? null;
    const a = response?.attendance ?? firstEvent ?? null;
    if (!a) return null;
    const text = (v: any) => (v == null ? '' : typeof v === 'string' ? v : (v['#text'] ?? ''));
    const attendeeNode = a?.attendees?.attendee;
    const attendeeIds: string[] = !attendeeNode
      ? []
      : (Array.isArray(attendeeNode) ? attendeeNode : [attendeeNode])
          .map((x: any) => String(x?.['@_id'] ?? x?.id ?? ''))
          .filter(Boolean);
    return {
      didNotMeet: String(a?.did_not_meet ?? '').toLowerCase() === 'true',
      notes: text(a?.notes),
      topic: text(a?.topic),
      prayerRequests: text(a?.prayer_requests),
      info: text(a?.info),
      attendeeIds,
    };
  } catch {
    return null;
  }
}

function isPayloadEmpty(payload: Record<string, unknown> | null | undefined): boolean {
  if (!payload) return true;
  const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '');
  if (payload.didNotMeet) return false;
  if (str(payload.notes) || str(payload.topic) || str(payload.prayerRequests) || str(payload.info)) return false;
  if (str(payload.didNotMeetReason) || str(payload.didNotMeetReasonOther)) return false;
  if (str(payload.infoUpdateDay) || str(payload.infoUpdateTime) || str(payload.infoUpdateLocation)) return false;
  if (Array.isArray(payload.attendeeCcbIds) && payload.attendeeCcbIds.length > 0) return false;
  if (Array.isArray(payload.manualAttendees) && payload.manualAttendees.length > 0) return false;
  const dv = payload.dynamicValues as Record<string, unknown> | undefined;
  if (dv && Object.values(dv).some((v) => (typeof v === 'string' ? v.trim() !== '' : v != null && !(Array.isArray(v) && v.length === 0)))) return false;
  return true;
}

function referenceNotesFromCcb(ccbData: Awaited<ReturnType<typeof fetchCcbAttendance>>): string {
  if (!ccbData?.notes) return '';
  return splitLegacyRosterAdditions(ccbData.notes).notes;
}

export async function GET(req: Request) {
  const leader = await getSessionLeader();
  if (!leader) return unauthorized();
  const url = new URL(req.url);
  const eventId = url.searchParams.get('event_id');
  const occurrence = url.searchParams.get('occurrence');
  if (!eventId || !occurrence) {
    return NextResponse.json({ error: 'event_id and occurrence are required.' }, { status: 400 });
  }

  const supabase = createServiceSupabaseClient();
  const ccbData = await fetchCcbAttendance(req, eventId, occurrence);
  const ccbReferenceNotes = referenceNotesFromCcb(ccbData);

  // Prefer an in-progress draft if one exists
  const { data: draftRow } = await supabase
    .from('circle_event_summary_drafts')
    .select('payload, updated_at')
    .eq('leader_id', leader.id)
    .eq('ccb_event_id', eventId)
    .eq('occurrence', occurrence)
    .maybeSingle();

  if (draftRow?.payload) {
    const payload = draftRow.payload as Record<string, unknown>;
    if (!isPayloadEmpty(payload)) {
      const parsed = splitLegacyRosterAdditions(String(payload.notes ?? ''));
      const existingManual = cleanManualAttendees(payload.manualAttendees);
      return NextResponse.json({
        draft: {
          ...payload,
          notes: parsed.notes,
          referenceNotes: ccbReferenceNotes || parsed.notes,
          manualAttendees: existingManual.length ? existingManual : parsed.manualAttendees,
        },
        updatedAt: draftRow.updated_at,
        source: 'draft',
      });
    }
    // Empty drafts (auto-saved from a first visit with no data) should not
    // shadow a submitted summary or CCB-prefilled data on subsequent loads.
    await supabase
      .from('circle_event_summary_drafts')
      .delete()
      .eq('leader_id', leader.id)
      .eq('ccb_event_id', eventId)
      .eq('occurrence', occurrence);
  }

  // Fall back to the most recent submitted summary so re-edits start populated
  const { data: subRow } = await supabase
    .from('circle_event_summaries')
    .select(
      'did_not_meet, did_not_meet_reason, topic, notes, prayer_requests, info, attendee_ccb_ids, manual_attendees, dynamic_responses, info_update_requested, status, created_at'
    )
    .eq('leader_id', leader.id)
    .eq('ccb_event_id', eventId)
    .eq('occurrence', occurrence)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (subRow) {
    const dynamicValues: Record<string, any> = {};
    const dr = subRow.dynamic_responses as Record<string, { label?: string; value?: any }> | null;
    if (dr) {
      for (const [qid, entry] of Object.entries(dr)) {
        dynamicValues[qid] = entry?.value;
      }
    }
    const infoUpdate = subRow.info_update_requested as
      | { day?: string; time?: string; location?: string }
      | null;
    const parsed = splitLegacyRosterAdditions(subRow.notes ?? '');
    const existingManual = cleanManualAttendees(subRow.manual_attendees);
    // The new form stores its body in dynamic_responses, so subRow.notes is
    // usually empty for app-submitted records. Pull the composed notes from
    // CCB so the "Notes from your last summary" reference card still appears.
    const referenceNotes = ccbReferenceNotes || parsed.notes;
    return NextResponse.json({
      draft: {
        didNotMeet: subRow.did_not_meet,
        didNotMeetReason: subRow.did_not_meet_reason ?? '',
        notes: parsed.notes,
        referenceNotes,
        topic: subRow.topic ?? '',
        prayerRequests: subRow.prayer_requests ?? '',
        info: subRow.info ?? '',
        attendeeCcbIds: subRow.attendee_ccb_ids ?? [],
        manualAttendees: existingManual.length ? existingManual : parsed.manualAttendees,
        dynamicValues,
        infoUpdateDay: infoUpdate?.day ?? '',
        infoUpdateTime: infoUpdate?.time ?? '',
        infoUpdateLocation: infoUpdate?.location ?? '',
      },
      updatedAt: subRow.created_at,
      source: 'submitted',
      submittedStatus: subRow.status,
    });
  }

  // Final fallback: load whatever's currently in CCB for this event +
  // occurrence so leaders can review/edit a summary that was entered directly
  // in CCB without going through this app.
  if (ccbData) {
    const hasAnything =
      !!ccbData.notes || !!ccbData.topic || ccbData.didNotMeet || ccbData.attendeeIds.length > 0;
    if (hasAnything) {
      const parsed = splitLegacyRosterAdditions(ccbData.notes);
      return NextResponse.json({
        draft: {
          didNotMeet: ccbData.didNotMeet,
          didNotMeetReason: '',
          notes: parsed.notes,
          referenceNotes: parsed.notes,
          topic: ccbData.topic,
          prayerRequests: ccbData.prayerRequests,
          info: ccbData.info,
          attendeeCcbIds: ccbData.attendeeIds,
          manualAttendees: parsed.manualAttendees,
          dynamicValues: {},
          infoUpdateDay: '',
          infoUpdateTime: '',
          infoUpdateLocation: '',
        },
        updatedAt: null,
        source: 'ccb',
      });
    }
  }

  return NextResponse.json({ draft: null, updatedAt: null, source: null });
}

export async function POST(req: Request) {
  const leader = await getSessionLeader();
  if (!leader) return unauthorized();

  let body: { eventId?: string; occurrence?: string; payload?: any } = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  const { eventId, occurrence, payload } = body;
  if (!eventId || !occurrence || !payload) {
    return NextResponse.json({ error: 'eventId, occurrence, and payload are required.' }, { status: 400 });
  }

  const supabase = createServiceSupabaseClient();
  // Don't persist an empty auto-save — it would later shadow CCB-prefill or
  // a submitted summary on the next page load.
  if (isPayloadEmpty(payload as Record<string, unknown>)) {
    await supabase
      .from('circle_event_summary_drafts')
      .delete()
      .eq('leader_id', leader.id)
      .eq('ccb_event_id', eventId)
      .eq('occurrence', occurrence);
    return NextResponse.json({ ok: true, skipped: 'empty' });
  }
  const { error } = await supabase
    .from('circle_event_summary_drafts')
    .upsert(
      {
        leader_id: leader.id,
        ccb_event_id: eventId,
        occurrence,
        payload,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'leader_id,ccb_event_id,occurrence' }
    );

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
