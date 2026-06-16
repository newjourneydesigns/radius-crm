import { NextRequest, NextResponse } from 'next/server';
import { createServiceSupabaseClient } from '../../../../lib/server-supabase';
import { requireAcpd, deleteConversation, isConversationMember } from '../../../../lib/acpdMessaging';

export const dynamic = 'force-dynamic';

// POST /api/acpd-messages/conversation — permanently delete a DM/group
// conversation (and its messages) for everyone in it. Uses POST rather than
// DELETE because some hosting blocks the DELETE method. Members only; the
// shared team channel can't be deleted.
export async function POST(req: NextRequest) {
  const { profile, response } = await requireAcpd(req);
  if (response) return response;

  let payload: { conversationId?: string } = {};
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const conversationId = payload.conversationId?.trim();
  if (!conversationId) return NextResponse.json({ error: 'conversationId is required' }, { status: 400 });

  const supabase = createServiceSupabaseClient();
  if (!(await isConversationMember(supabase, conversationId, profile.id))) {
    return NextResponse.json({ error: 'Not a member of this conversation' }, { status: 403 });
  }

  try {
    await deleteConversation(supabase, conversationId);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to delete conversation' },
      { status: 400 }
    );
  }
}
