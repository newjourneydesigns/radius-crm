import { NextRequest, NextResponse } from 'next/server';
import { createServiceSupabaseClient, getUserFromAuthHeader } from '../../../../../../lib/server-supabase';

export const dynamic = 'force-dynamic';

// PATCH /api/campaigns/[id]/people/[personId]
// Body: { note: string }
// Saves a free-form note on a campaign person row.
export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string; personId: string } },
) {
  const user = await getUserFromAuthHeader(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  const note: string = typeof body.note === 'string' ? body.note : '';

  const supabase = createServiceSupabaseClient();

  const { error } = await supabase
    .from('follow_up_campaign_people')
    .update({ note: note.trim() || null })
    .eq('id', params.personId)
    .eq('campaign_id', params.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ success: true });
}
