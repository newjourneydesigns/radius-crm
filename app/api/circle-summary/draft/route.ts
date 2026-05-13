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

export const dynamic = 'force-dynamic';

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

  // Prefer an in-progress draft if one exists
  const { data: draftRow } = await supabase
    .from('circle_event_summary_drafts')
    .select('payload, updated_at')
    .eq('leader_id', leader.id)
    .eq('ccb_event_id', eventId)
    .eq('occurrence', occurrence)
    .maybeSingle();

  if (draftRow?.payload) {
    return NextResponse.json({
      draft: draftRow.payload,
      updatedAt: draftRow.updated_at,
      source: 'draft',
    });
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
    return NextResponse.json({
      draft: {
        didNotMeet: subRow.did_not_meet,
        didNotMeetReason: subRow.did_not_meet_reason ?? '',
        notes: subRow.notes ?? '',
        topic: subRow.topic ?? '',
        prayerRequests: subRow.prayer_requests ?? '',
        info: subRow.info ?? '',
        attendeeCcbIds: subRow.attendee_ccb_ids ?? [],
        manualAttendees: subRow.manual_attendees ?? [],
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
