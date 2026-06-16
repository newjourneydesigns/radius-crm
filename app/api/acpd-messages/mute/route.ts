import { NextRequest, NextResponse } from 'next/server';
import { createServiceSupabaseClient } from '../../../../lib/server-supabase';
import { requireAcpd, setMute, isConversationMember } from '../../../../lib/acpdMessaging';

export const dynamic = 'force-dynamic';

// POST /api/acpd-messages/mute — mute/unmute a conversation for the caller.
export async function POST(req: NextRequest) {
  const { profile, response } = await requireAcpd(req);
  if (response) return response;

  let payload: { conversationId?: string; muted?: boolean } = {};
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const conversationId = payload.conversationId?.trim();
  if (!conversationId) return NextResponse.json({ error: 'conversationId is required' }, { status: 400 });
  const muted = Boolean(payload.muted);

  const supabase = createServiceSupabaseClient();
  if (!(await isConversationMember(supabase, conversationId, profile.id))) {
    return NextResponse.json({ error: 'Not a member of this conversation' }, { status: 403 });
  }

  await setMute(supabase, conversationId, profile.id, muted);
  return NextResponse.json({ ok: true, muted });
}
