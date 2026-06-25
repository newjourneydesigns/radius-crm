import { NextRequest, NextResponse } from 'next/server';
import { createServiceSupabaseClient, getUserFromAuthHeader } from '../../../../../lib/server-supabase';
import { computeCounts } from '../../../../../lib/campaigns/reconcile';

export const dynamic = 'force-dynamic';

async function requireAdmin(req: NextRequest) {
  const user = await getUserFromAuthHeader(req);
  if (!user) return { user: null, response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  const supabase = createServiceSupabaseClient();
  const { data: profile } = await supabase.from('users').select('id, role').eq('id', user.id).maybeSingle();
  if (!profile || profile.role !== 'ACPD') {
    return { user: null, response: NextResponse.json({ error: 'Admin access required' }, { status: 403 }) };
  }
  return { user, response: null };
}

// POST /api/campaigns/[id]/contact
// Body: { person_ids: string[], note?: string }
// Marks selected people as contacted and updates campaign counts.
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireAdmin(req);
  if (auth.response) return auth.response;

  const body = await req.json();
  const { person_ids, note } = body;

  if (!Array.isArray(person_ids) || person_ids.length === 0) {
    return NextResponse.json({ error: 'person_ids must be a non-empty array' }, { status: 400 });
  }

  const supabase = createServiceSupabaseClient();

  const { error } = await supabase
    .from('follow_up_campaign_people')
    .update({
      contacted_at: new Date().toISOString(),
      contacted_by: auth.user!.id,
      contact_note: note?.trim() || null,
    })
    .eq('campaign_id', params.id)
    .in('id', person_ids);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Refresh aggregate counts on the campaign
  const { data: allPeople } = await supabase
    .from('follow_up_campaign_people')
    .select('reconcile_status, contacted_at')
    .eq('campaign_id', params.id);

  const counts = computeCounts(allPeople ?? []);

  await supabase
    .from('follow_up_campaigns')
    .update({
      missing_count: counts.missing,
      contacted_count: counts.contacted,
      completion_pct: counts.completion_pct,
    })
    .eq('id', params.id);

  return NextResponse.json({ success: true, counts });
}
