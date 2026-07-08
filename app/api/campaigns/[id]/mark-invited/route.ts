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

// POST /api/campaigns/[id]/mark-invited
// Body: { person_ids: string[], source_group_name?: string }
// Count "Not in Group" submitters as invited: someone who was on the invite
// list, submitted, and was later removed from the CCB group (so an earlier
// reconcile demoted them), or an edge case the admin wants counted. Sets
// in_group + left_group, promotes to submitted, optionally re-attributes their
// source group, and recomputes counts. The sticky-invite logic in reconcile
// keeps the decision from then on.
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireAdmin(req);
  if (auth.response) return auth.response;

  const body = await req.json();
  const personIds: string[] = Array.isArray(body.person_ids)
    ? body.person_ids.filter((x: unknown) => typeof x === 'string')
    : [];
  const sourceGroupName: string | null =
    typeof body.source_group_name === 'string' && body.source_group_name.trim()
      ? body.source_group_name.trim()
      : null;

  if (personIds.length === 0) {
    return NextResponse.json({ error: 'person_ids must be a non-empty array' }, { status: 400 });
  }

  const supabase = createServiceSupabaseClient();

  const updates: Record<string, unknown> = {
    in_group: true,
    left_group: true,
    reconcile_status: 'submitted',
  };
  if (sourceGroupName) updates.source_group_name = sourceGroupName;

  // Only form-side rows qualify — this action promotes submitters.
  const { error } = await supabase
    .from('follow_up_campaign_people')
    .update(updates)
    .eq('campaign_id', params.id)
    .eq('in_form', true)
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
