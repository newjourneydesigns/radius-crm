/**
 * GET  /api/circle-leader-toolkit/draft?event_id=X&occurrence=YYYY-MM-DD HH:MM:SS
 *   Returns the leader's saved draft for that event+occurrence (if any).
 *
 * POST /api/circle-leader-toolkit/draft
 *   Body: { eventId, occurrence, payload }
 *   Upserts a draft.
 *
 * The GET resolution logic lives in lib/circle-leader-toolkit/draft-data.ts so
 * this route and the server-rendered event form page share one implementation.
 */

import { NextResponse } from 'next/server';
import { getSessionLeader, unauthorized } from '../../../../lib/circle-leader-toolkit/session';
import { createServiceSupabaseClient } from '../../../../lib/server-supabase';
import { isIgnoredEvent, isPayloadEmpty, loadEventDraft } from '../../../../lib/circle-leader-toolkit/draft-data';

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

  const result = await loadEventDraft(leader, eventId, occurrence);

  if (result.ignored) {
    return NextResponse.json(
      { error: 'This event was removed from the Circle Summary list.' },
      { status: 410 }
    );
  }

  return NextResponse.json({
    draft: result.draft,
    updatedAt: result.updatedAt,
    source: result.source,
    ...(result.submittedStatus ? { submittedStatus: result.submittedStatus } : {}),
  });
}

export async function POST(req: Request) {
  const leader = await getSessionLeader();
  if (!leader) return unauthorized();

  let body: { eventId?: string; occurrence?: string; payload?: Record<string, unknown> } = {};
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
  if (await isIgnoredEvent(supabase, leader.id, eventId, occurrence)) {
    return NextResponse.json(
      { error: 'This event was removed from the Circle Summary list.' },
      { status: 410 }
    );
  }

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
