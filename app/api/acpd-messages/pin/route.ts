import { NextRequest, NextResponse } from 'next/server';
import { createServiceSupabaseClient } from '../../../../lib/server-supabase';
import { requireAcpd, setPin } from '../../../../lib/acpdMessaging';

export const dynamic = 'force-dynamic';

// POST /api/acpd-messages/pin — pin or unpin a message in a thread.
export async function POST(req: NextRequest) {
  const { profile, response } = await requireAcpd(req);
  if (response) return response;

  let payload: { messageId?: string; pinned?: boolean } = {};
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const messageId = payload.messageId?.trim();
  if (!messageId) return NextResponse.json({ error: 'messageId is required' }, { status: 400 });
  const pinned = Boolean(payload.pinned);

  const supabase = createServiceSupabaseClient();
  try {
    await setPin(supabase, messageId, profile.id, pinned);
    return NextResponse.json({ ok: true, pinned });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to pin message' },
      { status: 400 }
    );
  }
}
