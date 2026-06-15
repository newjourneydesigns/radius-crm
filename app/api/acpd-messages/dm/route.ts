import { NextRequest, NextResponse } from 'next/server';
import { createServiceSupabaseClient } from '../../../../lib/server-supabase';
import { requireAcpd, getOrCreateDm } from '../../../../lib/acpdMessaging';

export const dynamic = 'force-dynamic';

// POST /api/acpd-messages/dm — find or create the 1-on-1 conversation between
// the signed-in ACPD and another ACPD, returning its id.
export async function POST(req: NextRequest) {
  const { profile, response } = await requireAcpd(req);
  if (response) return response;

  let payload: { userId?: string } = {};
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const otherUserId = payload.userId?.trim();
  if (!otherUserId) return NextResponse.json({ error: 'userId is required' }, { status: 400 });
  if (otherUserId === profile.id) {
    return NextResponse.json({ error: 'Cannot start a conversation with yourself' }, { status: 400 });
  }

  const supabase = createServiceSupabaseClient();

  // The other participant must be an ACPD/admin too.
  const { data: other } = await supabase
    .from('users')
    .select('id, role')
    .eq('id', otherUserId)
    .single();
  if (!other || other.role !== 'ACPD') {
    return NextResponse.json({ error: 'That user is not on the ACPD team' }, { status: 400 });
  }

  try {
    const conversationId = await getOrCreateDm(supabase, profile.id, otherUserId);
    return NextResponse.json({ conversationId });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to start conversation' },
      { status: 500 }
    );
  }
}
