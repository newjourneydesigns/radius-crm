import { NextRequest, NextResponse } from 'next/server';
import { createServiceSupabaseClient, getUserFromAuthHeader } from '../../../../../lib/server-supabase';

export const dynamic = 'force-dynamic';

const VALID_STATUSES = ['expected', 'submitted', 'missing', 'submitted_not_in_group', 'needs_review', 'contacted'];

// GET /api/campaigns/[id]/people
// ?status=missing|submitted|... (optional filter)
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getUserFromAuthHeader(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const status = req.nextUrl.searchParams.get('status');
  if (status && !VALID_STATUSES.includes(status)) {
    return NextResponse.json({ error: `Invalid status. Valid: ${VALID_STATUSES.join(', ')}` }, { status: 400 });
  }

  const supabase = createServiceSupabaseClient();
  let query = supabase
    .from('follow_up_campaign_people')
    .select('*')
    .eq('campaign_id', params.id)
    .order('last_name', { ascending: true })
    .order('first_name', { ascending: true });

  if (status) {
    query = query.eq('reconcile_status', status);
  }

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ people: data ?? [] });
}
