import { NextRequest, NextResponse } from 'next/server';
import { createServiceSupabaseClient } from '../../../../lib/server-supabase';
import { requireAcpd, editMessage } from '../../../../lib/acpdMessaging';

export const dynamic = 'force-dynamic';

const MAX_BODY_LENGTH = 4000;

// POST /api/acpd-messages/message — delete or edit your own message.
// Uses POST (not DELETE/PATCH) because some hosting blocks those methods.
//   { op: 'delete', messageId }
//   { op: 'edit',   messageId, body }
export async function POST(req: NextRequest) {
  const { profile, response } = await requireAcpd(req);
  if (response) return response;

  let payload: { op?: string; messageId?: string; body?: string } = {};
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const messageId = payload.messageId?.trim();
  if (!messageId) return NextResponse.json({ error: 'messageId is required' }, { status: 400 });

  const supabase = createServiceSupabaseClient();

  if (payload.op === 'delete') {
    const { data: msg } = await supabase
      .from('acpd_messages')
      .select('id, sender_id')
      .eq('id', messageId)
      .maybeSingle();
    if (!msg) return NextResponse.json({ ok: true }); // already gone
    if (msg.sender_id !== profile.id) {
      return NextResponse.json({ error: 'You can only delete your own messages' }, { status: 403 });
    }
    const { error } = await supabase.from('acpd_messages').delete().eq('id', messageId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  if (payload.op === 'edit') {
    const body = payload.body?.trim();
    if (!body) return NextResponse.json({ error: 'Message cannot be empty' }, { status: 400 });
    if (body.length > MAX_BODY_LENGTH) return NextResponse.json({ error: 'Message is too long' }, { status: 400 });
    try {
      const updated = await editMessage(supabase, messageId, profile.id, body);
      if (!updated) return NextResponse.json({ error: 'Message not found' }, { status: 404 });
      return NextResponse.json({ message: updated });
    } catch (err) {
      return NextResponse.json(
        { error: err instanceof Error ? err.message : 'Failed to edit message' },
        { status: 400 }
      );
    }
  }

  return NextResponse.json({ error: 'Unknown op' }, { status: 400 });
}
