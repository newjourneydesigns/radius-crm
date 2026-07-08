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

// POST /api/campaigns/[id]/exclude
// Body: { person_ids: string[], excluded: boolean }
// Off-board people (excluded=true → reconcile_status 'excluded') so they drop out
// of the unsubmitted pool and the completion percentage, or restore them back to
// the unsubmitted pool (excluded=false → 'missing'). Recomputes campaign counts.
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireAdmin(req);
  if (auth.response) return auth.response;

  const body = await req.json();
  const personIds: string[] = Array.isArray(body.person_ids)
    ? body.person_ids.filter((x: unknown) => typeof x === 'string')
    : [];
  const excluded: boolean = body.excluded === true;

  if (personIds.length === 0) {
    return NextResponse.json({ error: 'person_ids must be a non-empty array' }, { status: 400 });
  }

  const supabase = createServiceSupabaseClient();

  // Restoring puts a person back into the unsubmitted pool; the next reconcile
  // re-derives their true status (e.g. submitted) if they've since responded.
  const { error } = await supabase
    .from('follow_up_campaign_people')
    .update({ reconcile_status: excluded ? 'excluded' : 'missing' })
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
