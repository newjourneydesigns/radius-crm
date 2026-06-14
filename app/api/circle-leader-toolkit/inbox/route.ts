/**
 * GET /api/circle-leader-toolkit/inbox
 * Returns the signed-in Circle Leader's inbox messages.
 *
 * POST /api/circle-leader-toolkit/inbox
 * Marks a message recipient row read for the current message version.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSessionLeader, unauthorized } from '../../../../lib/circle-leader-toolkit/session';
import { createServiceSupabaseClient } from '../../../../lib/server-supabase';

export const dynamic = 'force-dynamic';

function isMissingStatusColumn(error: unknown): boolean {
  const text =
    error && typeof error === 'object' && 'message' in error
      ? String((error as { message?: unknown }).message || '')
      : '';
  return text.toLowerCase().includes('status') && text.toLowerCase().includes('does not exist');
}

function isMissingCategoryColumn(error: unknown): boolean {
  const text =
    error && typeof error === 'object' && 'message' in error
      ? String((error as { message?: unknown }).message || '')
      : '';
  return text.toLowerCase().includes('category') && text.toLowerCase().includes('does not exist');
}

export async function GET() {
  const leader = await getSessionLeader();
  if (!leader) return unauthorized();

  const supabase = createServiceSupabaseClient();
  const { data: recipients, error } = await supabase
    .from('circle_summary_inbox_recipients')
    .select('id, message_id, read_at, read_version, created_at, updated_at')
    .eq('leader_id', leader.id)
    .order('updated_at', { ascending: false });

  if (error) {
    return NextResponse.json({ messages: [], error: error.message }, { status: 500 });
  }

  const messageIds = (recipients || []).map((r: any) => r.message_id);
  if (messageIds.length === 0) {
    return NextResponse.json({ messages: [], unreadCount: 0, readCount: 0 });
  }

  let { data: messages, error: messageError } = await supabase
    .from('circle_summary_inbox_messages')
    .select('id, title, body_html, version, created_at, updated_at, status, category')
    .in('id', messageIds)
    .eq('status', 'sent');

  if (messageError && (isMissingStatusColumn(messageError) || isMissingCategoryColumn(messageError))) {
    const fallback = await supabase
      .from('circle_summary_inbox_messages')
      .select('id, title, body_html, version, created_at, updated_at')
      .in('id', messageIds);
    messages = (fallback.data || []).map((message: any) => ({ ...message, status: 'sent', category: 'message' }));
    messageError = fallback.error;
  }

  if (messageError) {
    return NextResponse.json({ messages: [], error: messageError.message }, { status: 500 });
  }

  const messageById = new Map((messages || []).map((m: any) => [m.id, m]));
  const rows = (recipients || [])
    .map((recipient: any) => {
      const message: any = messageById.get(recipient.message_id);
      if (!message) return null;
      const unread = !recipient.read_at || Number(recipient.read_version || 0) < Number(message.version || 1);
      return {
        recipient_id: recipient.id,
        message_id: message.id,
        title: message.title,
        body_html: message.body_html,
        category: message.category || 'message',
        version: message.version,
        created_at: message.created_at,
        updated_at: message.updated_at,
        read_at: recipient.read_at,
        read_version: recipient.read_version,
        unread,
      };
    })
    .filter(Boolean);

  const unreadCount = rows.filter((m: any) => m.unread).length;
  return NextResponse.json({
    messages: rows,
    unreadCount,
    readCount: rows.length - unreadCount,
  });
}

export async function POST(req: NextRequest) {
  const leader = await getSessionLeader();
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
    .from('circle_summary_inbox_recipients')
    .select('id, message_id, leader_id')
    .eq('id', recipientId)
    .eq('leader_id', leader.id)
    .maybeSingle();

  if (recipientError) return NextResponse.json({ error: recipientError.message }, { status: 500 });
  if (!recipient) return NextResponse.json({ error: 'Message not found.' }, { status: 404 });

  const { data: message, error: messageError } = await supabase
    .from('circle_summary_inbox_messages')
    .select('version')
    .eq('id', recipient.message_id)
    .maybeSingle();

  if (messageError) return NextResponse.json({ error: messageError.message }, { status: 500 });
  if (!message) return NextResponse.json({ error: 'Message not found.' }, { status: 404 });

  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from('circle_summary_inbox_recipients')
    .update({
      read_at: now,
      read_version: message.version || 1,
      updated_at: now,
    })
    .eq('id', recipientId)
    .eq('leader_id', leader.id)
    .select('id, read_at, read_version')
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ recipient: data });
}
