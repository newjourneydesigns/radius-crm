import { NextRequest, NextResponse } from 'next/server';
import { createServiceSupabaseClient } from '../../../../lib/server-supabase';
import { requireAcpd, toggleReaction, isConversationMember } from '../../../../lib/acpdMessaging';

export const dynamic = 'force-dynamic';

// POST /api/acpd-messages/react — toggle the caller's 💚 like on a message.
export async function POST(req: NextRequest) {
  const { profile, response } = await requireAcpd(req);
  if (response) return response;

  let payload: { messageId?: string } = {};
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const messageId = payload.messageId?.trim();
  if (!messageId) return NextResponse.json({ error: 'messageId is required' }, { status: 400 });

  const supabase = createServiceSupabaseClient();
  const { data: msg } = await supabase
    .from('acpd_messages')
    .select('conversation_id')
    .eq('id', messageId)
    .maybeSingle();
  if (!msg) return NextResponse.json({ error: 'Message not found' }, { status: 404 });

  if (!(await isConversationMember(supabase, msg.conversation_id, profile.id))) {
    return NextResponse.json({ error: 'Not a member of this conversation' }, { status: 403 });
  }

  const result = await toggleReaction(supabase, messageId, profile.id);
  return NextResponse.json(result);
}
