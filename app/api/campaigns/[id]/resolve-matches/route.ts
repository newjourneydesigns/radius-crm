import { NextRequest, NextResponse } from 'next/server';
import { createServiceSupabaseClient, getUserFromAuthHeader } from '../../../../../lib/server-supabase';
import { computeCounts } from '../../../../../lib/campaigns/reconcile';
import { fetchAllRows } from '../../../../../lib/campaigns/fetchAllRows';

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

// POST /api/campaigns/[id]/resolve-matches
// Body: { personIds: string[], resolution: 'confirmed' | 'rejected' }
// Confirm a fuzzy needs_review match (-> submitted) or reject it (-> missing),
// persisting the decision so reconcile keeps honoring it. Recomputes counts.
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireAdmin(req);
  if (auth.response) return auth.response;

  const body = await req.json();
  const personIds: string[] = Array.isArray(body.personIds) ? body.personIds.filter((x: unknown) => typeof x === 'string') : [];
  const resolution: string = body.resolution;

  if (personIds.length === 0) return NextResponse.json({ error: 'No people selected' }, { status: 400 });
  if (resolution !== 'confirmed' && resolution !== 'rejected') {
    return NextResponse.json({ error: "resolution must be 'confirmed' or 'rejected'" }, { status: 400 });
  }

  const supabase = createServiceSupabaseClient();

  const updates = resolution === 'confirmed'
    ? { match_resolution: 'confirmed', reconcile_status: 'submitted' }
    : {
        match_resolution: 'rejected',
        reconcile_status: 'missing',
        in_form: false,
        form_response_data: null,
        form_first_name: null,
        form_last_name: null,
      };

  const { error } = await supabase
    .from('follow_up_campaign_people')
    .update(updates)
    .eq('campaign_id', params.id)
    .in('id', personIds);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Recompute aggregate counts so the campaign cards stay accurate without a full reconcile.
  const allPeople = await fetchAllRows<{ reconcile_status: string; contacted_at: string | null }>((from, to) =>
    supabase
      .from('follow_up_campaign_people')
      .select('reconcile_status, contacted_at')
      .eq('campaign_id', params.id)
      .range(from, to),
  );
  const counts = computeCounts(allPeople);

  await supabase
    .from('follow_up_campaigns')
    .update({
      expected_count: counts.submitted + counts.missing + counts.needs_review,
      submitted_count: counts.submitted,
      missing_count: counts.missing,
      not_in_group_count: counts.submitted_not_in_group,
      needs_review_count: counts.needs_review,
      contacted_count: counts.contacted,
      completion_pct: counts.completion_pct,
    })
    .eq('id', params.id);

  return NextResponse.json({ success: true, counts });
}
