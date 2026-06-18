/**
 * GET /api/circle-leader-toolkit/coaching-timeline?leaderId=123
 *
 * A single merged, newest-first feed of everything that has happened in one
 * leader's coaching: automated nudges that were sent, coaching notes,
 * encouragements, prayer points, and scorecard changes. ACPD only.
 *
 * Aggregated server-side with the service client because the automation send
 * ledger is server-only (no browser RLS policies); pulling the rest here too
 * keeps the timeline one request and one consistent shape.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServiceSupabaseClient, getUserFromAuthHeader } from '../../../../lib/server-supabase';
import { AUTOMATION_LABELS } from '../../../../lib/circle-leader-toolkit/coaching/templates';
import type { AutomationKind } from '../../../../lib/circle-leader-toolkit/coaching/config';

export const dynamic = 'force-dynamic';

const EVENT_CAP = 120;

const DIMENSION_LABELS: Record<string, string> = {
  reach: 'Reach',
  connect: 'Connect',
  disciple: 'Disciple',
  develop: 'Develop',
};

const METHOD_LABELS: Record<string, string> = {
  text: 'Text',
  email: 'Email',
  call: 'Call',
  in_person: 'In person',
  card: 'Card',
  note: 'Note',
  other: 'Other',
};

export type TimelineEventType = 'automation' | 'coaching_note' | 'encouragement' | 'prayer' | 'score' | 'touchpoint';

export interface TimelineEvent {
  id: string;
  type: TimelineEventType;
  timestamp: string;
  title: string;
  detail?: string | null;
  /** Scorecard dimension, where relevant — drives the accent color. */
  dimension?: string | null;
  resolved?: boolean;
}

export async function GET(req: NextRequest) {
  const user = await getUserFromAuthHeader(req);
  if (!user) return NextResponse.json({ error: 'Invalid or expired token' }, { status: 401 });

  const supabase = createServiceSupabaseClient();
  const { data: profile } = await supabase.from('users').select('role').eq('id', user.id).maybeSingle();
  if (profile?.role !== 'ACPD') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const leaderId = Number(req.nextUrl.searchParams.get('leaderId'));
  if (!Number.isFinite(leaderId) || leaderId <= 0) {
    return NextResponse.json({ error: 'A valid leaderId is required.' }, { status: 400 });
  }

  const [sends, notes, encouragements, prayers, scores, touchpoints] = await Promise.all([
    supabase
      .from('coaching_automation_sends')
      .select('id, automation_kind, sent_at, message_id, circle_summary_inbox_messages ( title )')
      .eq('leader_id', leaderId)
      .order('sent_at', { ascending: false })
      .limit(EVENT_CAP),
    supabase
      .from('acpd_coaching_notes')
      .select('id, dimension, content, is_resolved, created_at')
      .eq('circle_leader_id', leaderId)
      .order('created_at', { ascending: false })
      .limit(EVENT_CAP),
    supabase
      .from('acpd_encouragements')
      .select('id, message_type, encourage_method, note, created_at')
      .eq('circle_leader_id', leaderId)
      .order('created_at', { ascending: false })
      .limit(EVENT_CAP),
    supabase
      .from('acpd_prayer_points')
      .select('id, content, is_answered, created_at, updated_at')
      .eq('circle_leader_id', leaderId)
      .order('created_at', { ascending: false })
      .limit(EVENT_CAP),
    supabase
      .from('scorecard_score_history')
      .select('id, dimension, score, source, recorded_at')
      .eq('circle_leader_id', leaderId)
      .order('recorded_at', { ascending: false })
      .limit(EVENT_CAP),
    supabase
      .from('touchpoints')
      .select('id, method, notes, event_topic, occurred_at')
      .eq('circle_leader_id', leaderId)
      .order('occurred_at', { ascending: false })
      .limit(EVENT_CAP),
  ]);

  const events: TimelineEvent[] = [];

  // Automation nudges — each delivered nudge is one inbox message; collapse the
  // per-subject ledger rows that share a message_id into a single event.
  const seenMessages = new Set<string>();
  for (const row of (sends.data || []) as Array<Record<string, any>>) {
    const messageId = row.message_id as string | null;
    const dedupeKey = messageId || `${row.automation_kind}:${row.sent_at}`;
    if (seenMessages.has(dedupeKey)) continue;
    seenMessages.add(dedupeKey);
    const kind = row.automation_kind as AutomationKind;
    const messageTitle = row.circle_summary_inbox_messages?.title as string | undefined;
    events.push({
      id: `send-${row.id}`,
      type: 'automation',
      timestamp: row.sent_at,
      title: messageTitle || AUTOMATION_LABELS[kind] || 'Coaching nudge',
      detail: `Automated ${(AUTOMATION_LABELS[kind] || kind).toLowerCase()} nudge sent to the leader’s inbox`,
    });
  }

  for (const n of (notes.data || []) as Array<Record<string, any>>) {
    events.push({
      id: `note-${n.id}`,
      type: 'coaching_note',
      timestamp: n.created_at,
      title: `Coaching note · ${DIMENSION_LABELS[n.dimension] || n.dimension}`,
      detail: n.content,
      dimension: n.dimension,
      resolved: n.is_resolved,
    });
  }

  for (const e of (encouragements.data || []) as Array<Record<string, any>>) {
    const method = METHOD_LABELS[e.encourage_method] || e.encourage_method;
    events.push({
      id: `enc-${e.id}`,
      type: 'encouragement',
      timestamp: e.created_at,
      title: `Encouragement ${e.message_type === 'sent' ? 'sent' : 'planned'} · ${method}`,
      detail: e.note,
    });
  }

  for (const p of (prayers.data || []) as Array<Record<string, any>>) {
    events.push({
      id: `prayer-${p.id}`,
      type: 'prayer',
      timestamp: p.created_at,
      title: 'Prayer point added',
      detail: p.content,
    });
    if (p.is_answered && p.updated_at && p.updated_at !== p.created_at) {
      events.push({
        id: `prayer-${p.id}-answered`,
        type: 'prayer',
        timestamp: p.updated_at,
        title: 'Prayer answered',
        detail: p.content,
        resolved: true,
      });
    }
  }

  for (const s of (scores.data || []) as Array<Record<string, any>>) {
    events.push({
      id: `score-${s.id}`,
      type: 'score',
      timestamp: s.recorded_at,
      title: `${DIMENSION_LABELS[s.dimension] || s.dimension} scored ${s.score}/5`,
      detail: s.source === 'evaluation' ? 'From evaluation' : s.source === 'direct' ? 'Direct score' : 'Manual override',
      dimension: s.dimension,
    });
  }

  for (const t of (touchpoints.data || []) as Array<Record<string, any>>) {
    const method = METHOD_LABELS[t.method] || t.method;
    events.push({
      id: `touchpoint-${t.id}`,
      type: 'touchpoint',
      timestamp: t.occurred_at,
      title: `Touchpoint · ${method}`,
      detail: t.event_topic ? `Re: “${t.event_topic}”${t.notes ? ` — ${t.notes}` : ''}` : t.notes,
    });
  }

  events.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

  return NextResponse.json({ events: events.slice(0, EVENT_CAP) });
}
