import { NextRequest, NextResponse } from 'next/server';
import { createServiceSupabaseClient } from '../../../../lib/server-supabase';
import { requireAcpd, renameConversation } from '../../../../lib/acpdMessaging';

export const dynamic = 'force-dynamic';

// POST /api/acpd-messages/rename — set a group conversation's title.
export async function POST(req: NextRequest) {
  const { profile, response } = await requireAcpd(req);
  if (response) return response;

  let payload: { conversationId?: string; title?: string } = {};
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const conversationId = payload.conversationId?.trim();
  if (!conversationId) return NextResponse.json({ error: 'conversationId is required' }, { status: 400 });

  const supabase = createServiceSupabaseClient();
  try {
    await renameConversation(supabase, conversationId, profile.id, payload.title ?? '');
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to rename conversation' },
      { status: 400 }
    );
  }
}
