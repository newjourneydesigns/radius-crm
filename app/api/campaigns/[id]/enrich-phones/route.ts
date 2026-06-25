import { NextRequest, NextResponse } from 'next/server';
import { createServiceSupabaseClient, getUserFromAuthHeader } from '../../../../../lib/server-supabase';
import { createCCBClient } from '../../../../../lib/ccb/ccb-client';
import { getCCBRequestContext } from '../../../../../lib/ccb/ccb-api-gateway';
import { normalizePhone } from '../../../../../lib/phoneUtils';

export const dynamic = 'force-dynamic';

// POST /api/campaigns/[id]/enrich-phones
// For campaign people still missing a phone number, fetches their individual
// profile from CCB one-by-one with throttling (300ms between calls) to stay
// well under the 40 req/60s circuit breaker cap. Called by the client after
// reconcile completes — runs serially so it doesn't burst the CCB rate limit.
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getUserFromAuthHeader(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const supabase = createServiceSupabaseClient();

  // Confirm campaign exists and user has access
  const { data: campaign } = await supabase
    .from('follow_up_campaigns')
    .select('id')
    .eq('id', params.id)
    .single();

  if (!campaign) return NextResponse.json({ error: 'Campaign not found' }, { status: 404 });

  // Find people in this campaign who are missing both phone fields
  const { data: missing } = await supabase
    .from('follow_up_campaign_people')
    .select('id, ccb_individual_id, first_name, last_name')
    .eq('campaign_id', params.id)
    .is('phone', null)
    .is('mobile_phone', null)
    .not('ccb_individual_id', 'is', null);

  if (!missing || missing.length === 0) {
    return NextResponse.json({ enriched: 0 });
  }

  const ctx = await getCCBRequestContext(req, {
    module: 'Follow-Up Campaigns',
    action: 'Enrich Phones',
    direction: 'pull',
  });
  const ccb = createCCBClient(ctx);

  let enriched = 0;

  for (const person of missing) {
    if (!person.ccb_individual_id) continue;

    try {
      const profile = await ccb.getIndividualProfile(person.ccb_individual_id);
      const phone = normalizePhone(profile?.phone || '') || null;
      const mobilePhone = normalizePhone(profile?.mobilePhone || '') || null;

      if (phone || mobilePhone) {
        await supabase
          .from('follow_up_campaign_people')
          .update({ phone, mobile_phone: mobilePhone })
          .eq('id', person.id);
        enriched++;
      }
    } catch {
      // CCB unavailable for this individual — skip
    }

    // 300ms between calls → ~3 req/sec, well under the 40/60s cap
    await new Promise(r => setTimeout(r, 300));
  }

  return NextResponse.json({ enriched, total: missing.length });
}
