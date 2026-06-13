/**
 * Per-leader messaging API for the Circle Leader Profile page.
 *
 * A "profile message" is an inbox message targeted at a single leader, so this route
 * reuses the existing circle_summary_inbox_* tables and delivery helpers for outbound
 * send/schedule and read receipts. It also stitches in inbound replies
 * (circle_leader_inbox_replies) to build a chronological, two-way conversation tied to
 * one leader's record.
 *
 *   GET    → conversation timeline + scheduled messages + templates + stats
 *   POST   → send (or schedule) a message to this leader
 *   PATCH  → edit_scheduled | send_now | cancel_scheduled | edit_sent | unsend | mark_reply_read
 */

import { NextRequest, NextResponse } from 'next/server';
import { DateTime } from 'luxon';
import { createServiceSupabaseClient, getUserFromAuthHeader } from '../../../../../lib/server-supabase';
import {
  deliverToLeaders,
  insertRevision,
  loadTargetLeaders,
  parseLeaderTargetIds,
} from '../../../../../lib/circle-leader-toolkit/inbox-delivery';

export const dynamic = 'force-dynamic';

async function requireRadiusUser(req: NextRequest) {
  const user = await getUserFromAuthHeader(req);
  if (!user) {
    return { user: null, response: NextResponse.json({ error: 'Invalid or expired token' }, { status: 401 }) };
  }
  const supabase = createServiceSupabaseClient();
  const { data: profile, error } = await supabase
    .from('users')
    .select('id, email, name, role')
    .eq('id', user.id)
    .maybeSingle();
  if (error || !profile) {
    return { user: null, response: NextResponse.json({ error: 'Unable to verify user profile' }, { status: 403 }) };
  }
  return { user: { ...user, profile }, response: null };
}

/** Composer sends a UTC ISO scheduled_at (anchored to church time before send). */
function parseScheduledAt(value: unknown): { iso: string | null; valid: boolean; future: boolean } {
  if (value == null || value === '') return { iso: null, valid: true, future: false };
  const dt = DateTime.fromISO(String(value));
  if (!dt.isValid) return { iso: null, valid: false, future: false };
  return { iso: dt.toUTC().toISO(), valid: true, future: dt.toUTC() > DateTime.utc() };
}

/** True when this inbox message is individually targeted at the given leader. */
function isLeaderTargeted(message: { target_type?: string | null; target_value?: string | null }, leaderId: string) {
  return message.target_type === 'leader' && parseLeaderTargetIds(message.target_value || '').includes(leaderId);
}

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireRadiusUser(req);
  if (auth.response) return auth.response;

  const leaderId = String(params.id || '').trim();
  if (!leaderId || Number.isNaN(Number(leaderId))) {
    return NextResponse.json({ error: 'Invalid leader id' }, { status: 400 });
  }

  const supabase = createServiceSupabaseClient();

  // Messages this leader has received (any target — broadcast or individual).
  const { data: recipients, error: recipientsError } = await supabase
    .from('circle_summary_inbox_recipients')
    .select('id, message_id, read_at, read_version, created_at')
    .eq('leader_id', leaderId);
  if (recipientsError) return NextResponse.json({ error: recipientsError.message }, { status: 500 });

  const receivedIds = (recipients || []).map((r: any) => r.message_id);

  // Pull both the received messages and any scheduled messages aimed at this leader.
  const { data: messages, error: messagesError } = await supabase
    .from('circle_summary_inbox_messages')
    .select('id, title, body_html, target_type, target_value, version, status, scheduled_at, created_at, updated_at, created_by')
    .or(
      receivedIds.length > 0
        ? `id.in.(${receivedIds.join(',')}),and(status.eq.scheduled,target_type.eq.leader)`
        : `and(status.eq.scheduled,target_type.eq.leader)`
    );
  if (messagesError) return NextResponse.json({ error: messagesError.message }, { status: 500 });

  const recipientByMessage = new Map((recipients || []).map((r: any) => [r.message_id, r]));

  const conversation: any[] = [];
  const scheduled: any[] = [];

  for (const message of messages || []) {
    if (message.status === 'scheduled') {
      // Only surface scheduled messages individually aimed at this leader.
      if (isLeaderTargeted(message, leaderId)) {
        scheduled.push({
          id: message.id,
          title: message.title,
          body_html: message.body_html,
          scheduled_at: message.scheduled_at,
          created_at: message.created_at,
          updated_at: message.updated_at,
        });
      }
      continue;
    }

    const recipient: any = recipientByMessage.get(message.id);
    if (!recipient) continue; // received-only loop; skip anything not delivered to this leader

    const read = !!recipient.read_at && Number(recipient.read_version || 0) >= Number(message.version || 1);
    conversation.push({
      kind: 'outbound',
      id: message.id,
      recipient_id: recipient.id,
      title: message.title,
      body_html: message.body_html,
      version: message.version,
      status: message.status,
      broadcast: message.target_type !== 'leader',
      target_type: message.target_type,
      read,
      read_at: recipient.read_at,
      sort_at: recipient.created_at || message.created_at,
      created_at: message.created_at,
      updated_at: message.updated_at,
    });
  }

  // Inbound replies from this leader.
  const { data: replies, error: repliesError } = await supabase
    .from('circle_leader_inbox_replies')
    .select('id, message_id, body, read_by_staff_at, created_at')
    .eq('leader_id', leaderId);
  if (repliesError) return NextResponse.json({ error: repliesError.message }, { status: 500 });

  for (const reply of replies || []) {
    conversation.push({
      kind: 'inbound',
      id: reply.id,
      reply_to: reply.message_id,
      body: reply.body,
      read_by_staff_at: reply.read_by_staff_at,
      sort_at: reply.created_at,
      created_at: reply.created_at,
    });
  }

  conversation.sort((a, b) => String(a.sort_at).localeCompare(String(b.sort_at)));
  scheduled.sort((a, b) => String(a.scheduled_at).localeCompare(String(b.scheduled_at)));

  const { data: templates, error: templatesError } = await supabase
    .from('circle_leader_message_templates')
    .select('id, title, subject, body_html, category, sort_order')
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true });
  if (templatesError) return NextResponse.json({ error: templatesError.message }, { status: 500 });

  const outbound = conversation.filter((c) => c.kind === 'outbound');
  const inbound = conversation.filter((c) => c.kind === 'inbound');
  const stats = {
    sent: outbound.length,
    read: outbound.filter((c) => c.read).length,
    received: inbound.length,
    unread_replies: inbound.filter((c) => !c.read_by_staff_at).length,
    scheduled: scheduled.length,
  };

  return NextResponse.json({ conversation, scheduled, templates: templates || [], stats });
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireRadiusUser(req);
  if (auth.response) return auth.response;

  const leaderId = String(params.id || '').trim();
  if (!leaderId || Number.isNaN(Number(leaderId))) {
    return NextResponse.json({ error: 'Invalid leader id' }, { status: 400 });
  }

  let body: any = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const title = typeof body.title === 'string' ? body.title.trim() : '';
  const bodyHtml = typeof body.body_html === 'string' ? body.body_html : '';
  if (!title) return NextResponse.json({ error: 'A subject/title is required.' }, { status: 400 });

  const scheduled = parseScheduledAt(body.scheduled_at);
  if (!scheduled.valid) return NextResponse.json({ error: 'Invalid scheduled time.' }, { status: 400 });
  const isScheduled = scheduled.iso != null && scheduled.future;

  try {
    const leaders = await loadTargetLeaders('leader', leaderId);
    if (leaders.length === 0) {
      return NextResponse.json(
        { error: 'This leader can’t receive Toolkit messages right now (Toolkit access may be disabled or the leader is archived).' },
        { status: 400 }
      );
    }

    const supabase = createServiceSupabaseClient();
    const { data: message, error: messageError } = await supabase
      .from('circle_summary_inbox_messages')
      .insert({
        title,
        body_html: bodyHtml,
        target_type: 'leader',
        target_value: leaderId,
        status: isScheduled ? 'scheduled' : 'sent',
        scheduled_at: isScheduled ? scheduled.iso : null,
        created_by: auth.user!.id,
        edited_by: auth.user!.id,
      })
      .select()
      .single();
    if (messageError) throw messageError;

    if (!isScheduled) {
      await deliverToLeaders(message, leaders);
    }
    await insertRevision({
      messageId: message.id,
      version: 1,
      title,
      bodyHtml,
      editedBy: auth.user!.id,
    });

    return NextResponse.json({ message, scheduled: isScheduled, scheduled_at: isScheduled ? scheduled.iso : null });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'Send failed.' }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireRadiusUser(req);
  if (auth.response) return auth.response;

  const leaderId = String(params.id || '').trim();
  if (!leaderId || Number.isNaN(Number(leaderId))) {
    return NextResponse.json({ error: 'Invalid leader id' }, { status: 400 });
  }

  let body: any = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const action = typeof body.action === 'string' ? body.action : '';
  const supabase = createServiceSupabaseClient();
  const now = new Date().toISOString();

  // Mark an inbound reply as read by staff.
  if (action === 'mark_reply_read') {
    const replyId = body.reply_id ? String(body.reply_id) : '';
    if (!replyId) return NextResponse.json({ error: 'reply_id is required.' }, { status: 400 });
    const { data, error } = await supabase
      .from('circle_leader_inbox_replies')
      .update({ read_by_staff_at: now })
      .eq('id', replyId)
      .eq('leader_id', leaderId)
      .select('id, read_by_staff_at')
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ reply: data });
  }

  const id = body.id ? String(body.id) : '';
  if (!id) return NextResponse.json({ error: 'id is required.' }, { status: 400 });

  // Load the message and confirm it belongs to this leader before mutating.
  const { data: existing, error: loadError } = await supabase
    .from('circle_summary_inbox_messages')
    .select('id, title, body_html, target_type, target_value, version, status')
    .eq('id', id)
    .maybeSingle();
  if (loadError) return NextResponse.json({ error: loadError.message }, { status: 500 });
  if (!existing) return NextResponse.json({ error: 'Message not found.' }, { status: 404 });
  if (!isLeaderTargeted(existing, leaderId)) {
    return NextResponse.json({ error: 'That message is not tied to this leader.' }, { status: 403 });
  }

  if (action === 'cancel_scheduled') {
    if (existing.status !== 'scheduled') {
      return NextResponse.json({ error: 'Only scheduled messages can be canceled.' }, { status: 400 });
    }
    const { error } = await supabase.from('circle_summary_inbox_messages').delete().eq('id', id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  if (action === 'send_now') {
    if (existing.status !== 'scheduled') {
      return NextResponse.json({ error: 'Only scheduled messages can be sent now.' }, { status: 400 });
    }
    try {
      const leaders = await loadTargetLeaders('leader', leaderId);
      if (leaders.length === 0) {
        return NextResponse.json({ error: 'This leader can’t receive Toolkit messages right now.' }, { status: 400 });
      }
      const { data: message, error: updateError } = await supabase
        .from('circle_summary_inbox_messages')
        .update({ status: 'sent', scheduled_at: null, edited_by: auth.user!.id, updated_at: now })
        .eq('id', id)
        .select()
        .single();
      if (updateError) throw updateError;
      await deliverToLeaders({ id, title: existing.title }, leaders);
      return NextResponse.json({ message });
    } catch (e: any) {
      return NextResponse.json({ error: e.message || 'Send failed.' }, { status: 500 });
    }
  }

  if (action === 'edit_scheduled') {
    if (existing.status !== 'scheduled') {
      return NextResponse.json({ error: 'Only scheduled messages can be edited here.' }, { status: 400 });
    }
    const title = typeof body.title === 'string' ? body.title.trim() : '';
    const bodyHtml = typeof body.body_html === 'string' ? body.body_html : '';
    if (!title) return NextResponse.json({ error: 'A subject/title is required.' }, { status: 400 });

    const scheduled = parseScheduledAt(body.scheduled_at);
    if (!scheduled.valid) return NextResponse.json({ error: 'Invalid scheduled time.' }, { status: 400 });
    const stillScheduled = scheduled.iso != null && scheduled.future;

    try {
      const leaders = await loadTargetLeaders('leader', leaderId);
      if (leaders.length === 0) {
        return NextResponse.json({ error: 'This leader can’t receive Toolkit messages right now.' }, { status: 400 });
      }
      const { data: message, error: updateError } = await supabase
        .from('circle_summary_inbox_messages')
        .update({
          title,
          body_html: bodyHtml,
          status: stillScheduled ? 'scheduled' : 'sent',
          scheduled_at: stillScheduled ? scheduled.iso : null,
          edited_by: auth.user!.id,
          updated_at: now,
        })
        .eq('id', id)
        .select()
        .single();
      if (updateError) throw updateError;
      if (!stillScheduled) {
        await deliverToLeaders({ id, title }, leaders);
      }
      return NextResponse.json({ message, scheduled: stillScheduled, delivered: !stillScheduled });
    } catch (e: any) {
      return NextResponse.json({ error: e.message || 'Update failed.' }, { status: 500 });
    }
  }

  if (action === 'edit_sent') {
    const title = typeof body.title === 'string' ? body.title.trim() : '';
    const bodyHtml = typeof body.body_html === 'string' ? body.body_html : '';
    if (!title) return NextResponse.json({ error: 'A subject/title is required.' }, { status: 400 });

    const nextVersion = Number(existing.version || 1) + 1;
    const { data: message, error: updateError } = await supabase
      .from('circle_summary_inbox_messages')
      .update({ title, body_html: bodyHtml, version: nextVersion, edited_by: auth.user!.id, updated_at: now })
      .eq('id', id)
      .select()
      .single();
    if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 });
    try {
      await insertRevision({ messageId: id, version: nextVersion, title, bodyHtml, editedBy: auth.user!.id });
    } catch (e: any) {
      return NextResponse.json({ error: e.message || 'Revision save failed.' }, { status: 500 });
    }
    return NextResponse.json({ message });
  }

  if (action === 'unsend') {
    const { error: updateError } = await supabase
      .from('circle_summary_inbox_messages')
      .update({ status: 'unsent', unsent_at: now, updated_at: now, edited_by: auth.user!.id })
      .eq('id', id);
    if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 });
    const { error: deleteError } = await supabase
      .from('circle_summary_inbox_recipients')
      .delete()
      .eq('message_id', id);
    if (deleteError) return NextResponse.json({ error: deleteError.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: 'Unsupported action.' }, { status: 400 });
}
