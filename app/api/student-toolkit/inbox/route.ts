/**
 * GET  /api/student-toolkit/inbox — the signed-in student leader's messages.
 * POST /api/student-toolkit/inbox — mark one message read at its current version.
 *
 * Read receipts are the point of this toolkit: staff used to post an update and
 * then text everyone to go look at it, with no way to know who had. Every row
 * here is scoped to the session leader's own id — the recipient id in the body
 * is checked against it before anything is written.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSessionStudentLeader, unauthorized } from '../../../../lib/student-toolkit/session';
import { createServiceSupabaseClient } from '../../../../lib/server-supabase';

export const dynamic = 'force-dynamic';

export async function GET() {
  const leader = await getSessionStudentLeader();
  if (!leader) return unauthorized();

  const supabase = createServiceSupabaseClient();
  const { data: recipients, error } = await supabase
    .from('student_inbox_recipients')
    .select('id, message_id, read_at, read_version, created_at')
    .eq('student_leader_id', leader.id)
    .order('created_at', { ascending: false });

  if (error) {
    return NextResponse.json({ messages: [], error: error.message }, { status: 500 });
  }

  const messageIds = (recipients || []).map((recipient: any) => recipient.message_id);
  if (messageIds.length === 0) {
    return NextResponse.json({ messages: [], unreadCount: 0, readCount: 0 });
  }

  // Only 'sent' messages are visible — an unsent or still-scheduled message has
  // no business appearing in a leader's inbox even if a recipient row survives.
  const { data: messages, error: messageError } = await supabase
    .from('circle_summary_inbox_messages')
    .select('id, title, body_html, version, created_at, updated_at, status')
    .in('id', messageIds)
    .eq('status', 'sent');

  if (messageError) {
    return NextResponse.json({ messages: [], error: messageError.message }, { status: 500 });
  }

  const messageById = new Map((messages || []).map((message: any) => [message.id, message]));
  const rows = (recipients || [])
    .map((recipient: any) => {
      const message: any = messageById.get(recipient.message_id);
      if (!message) return null;
      // A version bump (staff edited the message) makes it unread again.
      const unread =
        !recipient.read_at || Number(recipient.read_version || 0) < Number(message.version || 1);
      return {
        recipient_id: recipient.id,
        message_id: message.id,
        title: message.title,
        body_html: message.body_html,
        version: message.version,
        created_at: message.created_at,
        updated_at: message.updated_at,
        read_at: recipient.read_at,
        read_version: recipient.read_version,
        unread,
      };
    })
    .filter(Boolean);

  const unreadCount = rows.filter((message: any) => message.unread).length;
  return NextResponse.json({
    messages: rows,
    unreadCount,
    readCount: rows.length - unreadCount,
  });
}

export async function POST(req: NextRequest) {
  const leader = await getSessionStudentLeader();
  if (!leader) return unauthorized();

  let body: any = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const recipientId = body.recipient_id ? String(body.recipient_id) : '';
  if (!recipientId) {
    return NextResponse.json({ error: 'recipient_id is required.' }, { status: 400 });
  }

  const supabase = createServiceSupabaseClient();
  const { data: recipient, error: recipientError } = await supabase
    .from('student_inbox_recipients')
    .select('id, message_id')
    .eq('id', recipientId)
    // Scoped to the session leader, so a guessed id reads as "not found".
    .eq('student_leader_id', leader.id)
    .maybeSingle();

  if (recipientError) {
    return NextResponse.json({ error: recipientError.message }, { status: 500 });
  }
  if (!recipient) return NextResponse.json({ error: 'Message not found.' }, { status: 404 });

  const { data: message, error: messageError } = await supabase
    .from('circle_summary_inbox_messages')
    .select('version')
    .eq('id', recipient.message_id)
    .maybeSingle();

  if (messageError) return NextResponse.json({ error: messageError.message }, { status: 500 });
  if (!message) return NextResponse.json({ error: 'Message not found.' }, { status: 404 });

  // Stamping the version, not just the time, is what lets an edited message go
  // unread again instead of staying silently read at an older wording.
  const { data, error } = await supabase
    .from('student_inbox_recipients')
    .update({ read_at: new Date().toISOString(), read_version: message.version || 1 })
    .eq('id', recipientId)
    .eq('student_leader_id', leader.id)
    .select('id, read_at, read_version')
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ recipient: data });
}
