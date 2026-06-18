/**
 * Touchpoints — ACPD-logged interactions with a Circle Leader, tied to the
 * leader's event/debrief summaries.
 *   GET  ?leaderId=  — list a leader's touchpoints (any signed-in RADIUS user).
 *   POST             — log a touchpoint (ACPD admin only). Also mirrors the
 *                      entry into the notes timeline and bumps last_connection,
 *                      matching the existing Log Connection flow.
 */

import { NextRequest, NextResponse } from 'next/server';
import { DateTime } from 'luxon';
import { createServiceSupabaseClient, getUserFromAuthHeader } from '../../../lib/server-supabase';
import { APP_TZ, type TouchpointMethod } from '../../../lib/touchpoints';

export const dynamic = 'force-dynamic';

const METHOD_LABELS: Record<TouchpointMethod, string> = {
  text: 'Text',
  call: 'Call',
  in_person: 'In Person',
  email: 'Email',
  note: 'Note',
  other: 'Other',
};

const VALID_METHODS = Object.keys(METHOD_LABELS) as TouchpointMethod[];

async function requireUser(req: NextRequest) {
  const user = await getUserFromAuthHeader(req);
  if (!user) return { user: null, role: null, response: NextResponse.json({ error: 'Invalid or expired token' }, { status: 401 }) };
  const supabase = createServiceSupabaseClient();
  const { data: profile, error } = await supabase.from('users').select('id, role').eq('id', user.id).maybeSingle();
  if (error || !profile) return { user: null, role: null, response: NextResponse.json({ error: 'Unable to verify user profile' }, { status: 403 }) };
  return { user, role: profile.role as string | null, response: null };
}

export async function GET(req: NextRequest) {
  const auth = await requireUser(req);
  if (auth.response) return auth.response;

  const leaderId = Number(req.nextUrl.searchParams.get('leaderId'));
  if (!Number.isFinite(leaderId) || leaderId <= 0) {
    return NextResponse.json({ error: 'A valid leaderId is required.' }, { status: 400 });
  }

  const supabase = createServiceSupabaseClient();
  const { data, error } = await supabase
    .from('touchpoints')
    .select('*')
    .eq('circle_leader_id', leaderId)
    .order('occurred_at', { ascending: false })
    .limit(200);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ touchpoints: data ?? [] });
}

export async function POST(req: NextRequest) {
  const auth = await requireUser(req);
  if (auth.response) return auth.response;
  if (auth.role !== 'ACPD') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  let body: Record<string, unknown> = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const leaderId = Number(body.circle_leader_id);
  if (!Number.isFinite(leaderId) || leaderId <= 0) {
    return NextResponse.json({ error: 'A valid circle_leader_id is required.' }, { status: 400 });
  }

  const method = (VALID_METHODS as string[]).includes(String(body.method)) ? (body.method as TouchpointMethod) : 'note';
  const notes = typeof body.notes === 'string' && body.notes.trim() ? body.notes.trim() : null;
  const occurredAt = typeof body.occurred_at === 'string' && body.occurred_at
    ? new Date(body.occurred_at).toISOString()
    : new Date().toISOString();
  const summaryId = typeof body.circle_event_summary_id === 'string' && body.circle_event_summary_id ? body.circle_event_summary_id : null;
  const eventOccurrence = typeof body.event_occurrence === 'string' && body.event_occurrence ? new Date(body.event_occurrence).toISOString() : null;
  const eventTopic = typeof body.event_topic === 'string' && body.event_topic.trim() ? body.event_topic.trim() : null;

  const supabase = createServiceSupabaseClient();

  const { data: created, error } = await supabase
    .from('touchpoints')
    .insert({
      circle_leader_id: leaderId,
      occurred_at: occurredAt,
      method,
      notes,
      circle_event_summary_id: summaryId,
      event_occurrence: eventOccurrence,
      event_topic: eventTopic,
      created_by: auth.user!.id,
    })
    .select('*')
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Mirror into the notes timeline so the touchpoint shows in the leader's
  // existing activity feed (same continuity the Log Connection flow gives).
  const occurredLabel = DateTime.fromISO(occurredAt).setZone(APP_TZ).toFormat('LLL d, yyyy');
  const context = eventTopic ? ` (re: "${eventTopic}")` : '';
  const noteContent = `Touchpoint on ${occurredLabel} via ${METHOD_LABELS[method]}${context}${notes ? `: ${notes}` : ''}`;
  await supabase.from('notes').insert({
    circle_leader_id: leaderId,
    user_id: auth.user!.id,
    content: noteContent,
  });

  // Bump last-connection markers (best effort; columns may not exist everywhere).
  const occurredDate = DateTime.fromISO(occurredAt).setZone(APP_TZ).toISODate();
  await supabase
    .from('circle_leaders')
    .update({ last_connection: occurredDate, last_check_in_date: occurredDate })
    .eq('id', leaderId);

  return NextResponse.json({ touchpoint: created });
}
