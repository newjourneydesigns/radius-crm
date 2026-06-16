import { NextRequest, NextResponse } from 'next/server';
import { createServiceSupabaseClient } from '../../../../lib/server-supabase';
import { requireAcpd } from '../../../../lib/acpdMessaging';

export const dynamic = 'force-dynamic';

// GET /api/acpd-messages/search?q=… — search message bodies across the caller's
// conversations. The client maps each hit's conversationId to its title.
export async function GET(req: NextRequest) {
  const { profile, response } = await requireAcpd(req);
  if (response) return response;

  const raw = (req.nextUrl.searchParams.get('q') || '').trim();
  if (raw.length < 2) return NextResponse.json({ results: [] });
  // Escape LIKE wildcards so user input is matched literally.
  const pattern = `%${raw.replace(/[\\%_]/g, '\\$&')}%`;

  const supabase = createServiceSupabaseClient();

  const { data: memberships } = await supabase
    .from('acpd_conversation_members')
    .select('conversation_id')
    .eq('user_id', profile.id);
  const convIds = (memberships || []).map((m: { conversation_id: string }) => m.conversation_id);
  if (convIds.length === 0) return NextResponse.json({ results: [] });

  const { data: msgs } = await supabase
    .from('acpd_messages')
    .select('id, conversation_id, sender_id, body, created_at, users:sender_id (name)')
    .in('conversation_id', convIds)
    .ilike('body', pattern)
    .order('created_at', { ascending: false })
    .limit(40);

  const results = ((msgs || []) as any[]).map((m) => ({
    id: m.id,
    conversationId: m.conversation_id,
    senderId: m.sender_id,
    senderName: m.users?.name || 'Unknown',
    body: m.body,
    createdAt: m.created_at,
  }));

  return NextResponse.json({ results });
}
