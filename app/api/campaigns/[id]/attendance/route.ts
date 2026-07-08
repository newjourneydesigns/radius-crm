import { NextRequest, NextResponse } from 'next/server';
import { createServiceSupabaseClient, getUserFromAuthHeader } from '../../../../../lib/server-supabase';
import { createCCBClient } from '../../../../../lib/ccb/ccb-client';
import { getCCBRequestContext } from '../../../../../lib/ccb/ccb-api-gateway';
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

const normName = (s: string | null | undefined) => (s || '').toLowerCase().trim().replace(/\s+/g, ' ');

// POST /api/campaigns/[id]/attendance
// Pulls day-of check-ins from the campaign's CCB events and marks matching
// campaign people as attended. Split out of reconcile so the (slow, per-event)
// attendance sweep runs on demand instead of on every reconcile. All events are
// fetched in parallel. Additive: never clears an existing check-in.
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireAdmin(req);
  if (auth.response) return auth.response;

  const supabase = createServiceSupabaseClient();

  const { data: campaign, error: campaignError } = await supabase
    .from('follow_up_campaigns')
    .select('id, ccb_event_ids')
    .eq('id', params.id)
    .single();

  if (campaignError || !campaign) {
    return NextResponse.json({ error: 'Campaign not found' }, { status: 404 });
  }

  const eventIds: string[] = Array.isArray(campaign.ccb_event_ids)
    ? campaign.ccb_event_ids.filter(Boolean)
    : [];
  if (eventIds.length === 0) {
    return NextResponse.json({ error: 'no_events', message: 'Add CCB Event IDs to this campaign first (Edit Campaign).' }, { status: 400 });
  }

  const ctx = await getCCBRequestContext(req, {
    module: 'Follow-Up Campaigns',
    action: 'Check Attendance',
    direction: 'pull',
  });
  const ccb = createCCBClient(ctx);

  // One fetch per event, all in parallel — wall time ≈ the slowest event.
  const results = await Promise.all(
    eventIds.map(async (evId) => {
      try {
        return { evId, attendees: await ccb.getEventAttendees(evId), error: null as string | null };
      } catch (err) {
        return { evId, attendees: [], error: err instanceof Error ? err.message : 'Unknown error' };
      }
    }),
  );

  const failed = results.filter(r => r.error);
  if (failed.length === eventIds.length) {
    return NextResponse.json({
      error: 'attendance_fetch_failed',
      message: `Could not read attendance from any event. First error (event ${failed[0].evId}): ${failed[0].error}`,
    }, { status: 502 });
  }

  const attendedCcbIds = new Set<string>();
  const attendedNames = new Set<string>();
  for (const r of results) {
    for (const a of r.attendees) {
      if (a.id) attendedCcbIds.add(a.id);
      else if (a.name) attendedNames.add(normName(a.name));
    }
  }

  // Match check-ins to campaign people by CCB id, falling back to name.
  const people = await fetchAllRows<{
    id: string;
    ccb_individual_id: string | null;
    first_name: string | null;
    last_name: string | null;
    attended: boolean;
  }>((from, to) =>
    supabase
      .from('follow_up_campaign_people')
      .select('id, ccb_individual_id, first_name, last_name, attended')
      .eq('campaign_id', params.id)
      .range(from, to),
  );

  const newlyAttended = people
    .filter(p => !p.attended)
    .filter(p =>
      (p.ccb_individual_id && attendedCcbIds.has(p.ccb_individual_id)) ||
      attendedNames.has(normName(`${p.first_name ?? ''} ${p.last_name ?? ''}`)),
    )
    .map(p => p.id);

  if (newlyAttended.length > 0) {
    const { error } = await supabase
      .from('follow_up_campaign_people')
      .update({ attended: true })
      .eq('campaign_id', params.id)
      .in('id', newlyAttended);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Refresh the cached attended count (other counts are untouched by this op).
  const allPeople = await fetchAllRows<{ reconcile_status: string; contacted_at: string | null; attended: boolean | null }>((from, to) =>
    supabase
      .from('follow_up_campaign_people')
      .select('reconcile_status, contacted_at, attended')
      .eq('campaign_id', params.id)
      .range(from, to),
  );
  const counts = computeCounts(allPeople);

  await supabase
    .from('follow_up_campaigns')
    .update({ attended_count: counts.attended })
    .eq('id', params.id);

  return NextResponse.json({
    success: true,
    counts,
    newly_attended: newlyAttended.length,
    events_checked: eventIds.length - failed.length,
    events_failed: failed.map(f => f.evId),
  });
}
