/**
 * POST /api/circle-leader-toolkit/inbox/reply
 * Lets the signed-in Circle Leader reply to a message from their Toolkit Inbox. The
 * reply is stored against the leader's record (circle_leader_inbox_replies) so it shows
 * up as an inbound message in the conversation timeline on their Circle Leader Profile.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSessionLeader, unauthorized } from '../../../../../lib/circle-leader-toolkit/session';
import { createServiceSupabaseClient } from '../../../../../lib/server-supabase';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const leader = await getSessionLeader();
  if (!leader) return unauthorized();

  let body: any = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const text = typeof body.body === 'string' ? body.body.trim() : '';
  const messageId = body.message_id ? String(body.message_id) : null;
  if (!text) return NextResponse.json({ error: 'A reply message is required.' }, { status: 400 });
  if (text.length > 4000) return NextResponse.json({ error: 'Reply is too long.' }, { status: 400 });

  const supabase = createServiceSupabaseClient();

  // If a message_id is supplied, only accept it when this leader actually received it.
  let resolvedMessageId: string | null = null;
  if (messageId) {
    const { data: recipient } = await supabase
      .from('circle_summary_inbox_recipients')
      .select('id')
      .eq('message_id', messageId)
      .eq('leader_id', leader.id)
      .maybeSingle();
    resolvedMessageId = recipient ? messageId : null;
  }

  const { data, error } = await supabase
    .from('circle_leader_inbox_replies')
    .insert({ leader_id: leader.id, message_id: resolvedMessageId, body: text })
    .select('id, created_at')
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ reply: data });
}
