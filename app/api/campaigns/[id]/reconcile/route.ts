import { NextRequest, NextResponse } from 'next/server';
import { createServiceSupabaseClient, getUserFromAuthHeader } from '../../../../../lib/server-supabase';
import { createCCBClient } from '../../../../../lib/ccb/ccb-client';
import { getCCBRequestContext } from '../../../../../lib/ccb/ccb-api-gateway';
import { reconcile, computeCounts } from '../../../../../lib/campaigns/reconcile';

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

// POST /api/campaigns/[id]/reconcile
// Pulls group participants and form responses from CCB, reconciles them,
// persists results to follow_up_campaign_people, and updates aggregate counts.
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireAdmin(req);
  if (auth.response) return auth.response;

  const supabase = createServiceSupabaseClient();

  // 1. Load campaign
  const { data: campaign, error: campaignError } = await supabase
    .from('follow_up_campaigns')
    .select('*')
    .eq('id', params.id)
    .single();

  if (campaignError || !campaign) {
    return NextResponse.json({ error: 'Campaign not found' }, { status: 404 });
  }

  // 2. Create CCB client
  const ctx = await getCCBRequestContext(req, {
    module: 'Follow-Up Campaigns',
    action: 'Reconcile',
    direction: 'pull',
  });
  const ccb = createCCBClient(ctx);

  // 3. Fetch group participants
  let groupParticipants: Awaited<ReturnType<typeof ccb.getGroupParticipants>>;
  try {
    groupParticipants = await ccb.getGroupParticipants(campaign.ccb_group_id);
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    if (msg.toLowerCase().includes('permission')) {
      return NextResponse.json({
        error: 'ccb_permission',
        message: 'The CCB API user lacks permission to read group participants. Grant "Group" API access in CCB Admin → API → Permissions.',
      }, { status: 403 });
    }
    return NextResponse.json({ error: 'ccb_group_fetch_failed', message: msg }, { status: 502 });
  }

  if (groupParticipants.length === 0) {
    return NextResponse.json({
      error: 'empty_group',
      message: `CCB group ${campaign.ccb_group_id} returned 0 participants. Check that the Group ID is correct.`,
    }, { status: 422 });
  }

  // 4. Fetch form responses
  let formRespondents: Awaited<ReturnType<typeof ccb.getFormResponses>>;
  try {
    formRespondents = await ccb.getFormResponses(campaign.ccb_form_id);
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    if (msg.toLowerCase().includes('permission')) {
      return NextResponse.json({
        error: 'ccb_permission',
        message: 'The CCB API user lacks permission to read form responses. Grant "Form" API access in CCB Admin → API → Permissions.',
      }, { status: 403 });
    }
    return NextResponse.json({ error: 'ccb_form_fetch_failed', message: msg }, { status: 502 });
  }

  // 5. Reconcile
  const reconciledPeople = reconcile(groupParticipants, formRespondents);

  // 6. Load existing contacted rows so we preserve their status
  const { data: existingContacted } = await supabase
    .from('follow_up_campaign_people')
    .select('id, ccb_individual_id, first_name, last_name')
    .eq('campaign_id', params.id)
    .eq('reconcile_status', 'contacted');

  const contactedIds = new Set((existingContacted ?? []).map(r => r.ccb_individual_id).filter(Boolean));

  // 7. Upsert all people
  // For each reconciled person, if they were previously contacted, keep that status
  const rows = reconciledPeople.map((p) => {
    const wasContacted = p.ccbIndividualId && contactedIds.has(p.ccbIndividualId);
    return {
      campaign_id: params.id,
      ccb_individual_id: p.ccbIndividualId || null,
      first_name: p.firstName,
      last_name: p.lastName,
      form_first_name: p.formFirstName || null,
      form_last_name: p.formLastName || null,
      email: p.email || null,
      phone: p.phone || null,
      mobile_phone: p.mobilePhone || null,
      in_group: p.inGroup,
      in_form: p.inForm,
      form_response_data: p.formResponseData || null,
      reconcile_status: wasContacted ? 'contacted' : p.status,
      match_method: p.matchMethod || null,
    };
  });

  // Delete stale rows (NOT contacted) before upserting fresh ones
  const currentCcbIds = reconciledPeople
    .map(p => p.ccbIndividualId)
    .filter(Boolean) as string[];

  // Delete people who have a CCB ID but are no longer in either list,
  // and were not contacted
  if (currentCcbIds.length > 0) {
    await supabase
      .from('follow_up_campaign_people')
      .delete()
      .eq('campaign_id', params.id)
      .not('reconcile_status', 'eq', 'contacted')
      .not('ccb_individual_id', 'in', `(${currentCcbIds.map(id => `"${id}"`).join(',')})`);
  }

  // Upsert current rows. The unique constraint is on (campaign_id, ccb_individual_id).
  // Rows with null ccb_individual_id (form-only without CCB id) get inserted fresh.
  const rowsWithId = rows.filter(r => r.ccb_individual_id);
  const rowsWithoutId = rows.filter(r => !r.ccb_individual_id);

  if (rowsWithId.length > 0) {
    const { error: upsertError } = await supabase
      .from('follow_up_campaign_people')
      .upsert(rowsWithId, {
        onConflict: 'campaign_id,ccb_individual_id',
        ignoreDuplicates: false,
      });
    if (upsertError) {
      console.error('Upsert error (with CCB ID):', upsertError);
      return NextResponse.json({ error: 'db_upsert_failed', message: upsertError.message }, { status: 500 });
    }
  }

  if (rowsWithoutId.length > 0) {
    // For rows without CCB id, delete existing non-contacted nulls and re-insert
    await supabase
      .from('follow_up_campaign_people')
      .delete()
      .eq('campaign_id', params.id)
      .is('ccb_individual_id', null)
      .not('reconcile_status', 'eq', 'contacted');

    const { error: insertError } = await supabase
      .from('follow_up_campaign_people')
      .insert(rowsWithoutId);
    if (insertError) {
      console.error('Insert error (no CCB ID):', insertError);
      return NextResponse.json({ error: 'db_insert_failed', message: insertError.message }, { status: 500 });
    }
  }

  // 8. Re-read all people to compute accurate counts (includes any pre-existing contacted rows)
  const { data: allPeople } = await supabase
    .from('follow_up_campaign_people')
    .select('reconcile_status')
    .eq('campaign_id', params.id);

  const counts = computeCounts(allPeople ?? []);

  // 9. Update campaign aggregate counts
  await supabase
    .from('follow_up_campaigns')
    .update({
      last_reconciled_at: new Date().toISOString(),
      expected_count: counts.submitted + counts.missing + counts.needs_review + counts.contacted,
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
