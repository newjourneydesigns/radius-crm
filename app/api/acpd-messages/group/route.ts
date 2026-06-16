import { NextRequest, NextResponse } from 'next/server';
import { createServiceSupabaseClient } from '../../../../lib/server-supabase';
import { requireAcpd, createGroup } from '../../../../lib/acpdMessaging';

export const dynamic = 'force-dynamic';

// POST /api/acpd-messages/group — start a conversation with the signed-in ACPD
// plus the selected directors. One other person → a DM; more → a group.
export async function POST(req: NextRequest) {
  const { profile, response } = await requireAcpd(req);
  if (response) return response;

  let payload: { userIds?: string[] } = {};
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const requested = Array.isArray(payload.userIds) ? payload.userIds.filter(Boolean) : [];
  if (requested.length === 0) {
    return NextResponse.json({ error: 'Pick at least one person' }, { status: 400 });
  }

  const supabase = createServiceSupabaseClient();

  // Every member must be an ACPD/admin.
  const { data: valid } = await supabase
    .from('users')
    .select('id, role')
    .in('id', requested);
  const memberIds = (valid || []).filter((u) => u.role === 'ACPD').map((u) => u.id);
  if (memberIds.length === 0) {
    return NextResponse.json({ error: 'None of those people are on the ACPD team' }, { status: 400 });
  }

  try {
    const conversationId = await createGroup(supabase, profile.id, memberIds);
    return NextResponse.json({ conversationId });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to start conversation' },
      { status: 500 }
    );
  }
}
