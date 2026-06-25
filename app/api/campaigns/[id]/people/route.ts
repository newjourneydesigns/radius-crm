import { NextRequest, NextResponse } from 'next/server';
import { createServiceSupabaseClient, getUserFromAuthHeader } from '../../../../../lib/server-supabase';
import { normalizePhone } from '../../../../../lib/phoneUtils';

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

  if (status === 'contacted') {
    // Contacted = anyone we've sent a follow-up to, regardless of form status
    query = query.not('contacted_at', 'is', null);
  } else if (status) {
    query = query.eq('reconcile_status', status);
  }

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ people: data ?? [] });
}

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

// POST /api/campaigns/[id]/people
// Manually add a CCB individual to the campaign's expected list.
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireAdmin(req);
  if (auth.response) return auth.response;

  const body = await req.json();
  const { ccb_individual } = body as {
    ccb_individual?: {
      id?: string;
      firstName?: string;
      lastName?: string;
      email?: string;
      phone?: string;
      mobilePhone?: string;
    };
  };

  if (!ccb_individual) return NextResponse.json({ error: 'ccb_individual is required' }, { status: 400 });
  const firstName = (ccb_individual.firstName || '').trim();
  const lastName = (ccb_individual.lastName || '').trim();
  if (!firstName && !lastName) return NextResponse.json({ error: 'Individual must have a name' }, { status: 400 });

  const supabase = createServiceSupabaseClient();

  // Verify campaign exists
  const { data: campaign } = await supabase
    .from('follow_up_campaigns')
    .select('id')
    .eq('id', params.id)
    .single();
  if (!campaign) return NextResponse.json({ error: 'Campaign not found' }, { status: 404 });

  const ccbId = (ccb_individual.id || '').trim() || null;

  // If they already exist in this campaign (by CCB ID), just return success
  if (ccbId) {
    const { data: existing } = await supabase
      .from('follow_up_campaign_people')
      .select('id')
      .eq('campaign_id', params.id)
      .eq('ccb_individual_id', ccbId)
      .maybeSingle();
    if (existing) {
      // Update to include manually_added flag so it's preserved
      await supabase
        .from('follow_up_campaign_people')
        .update({ manually_added: true })
        .eq('id', existing.id);
      return NextResponse.json({ person: existing });
    }
  }

  const { data: person, error } = await supabase
    .from('follow_up_campaign_people')
    .insert({
      campaign_id: params.id,
      ccb_individual_id: ccbId,
      first_name: firstName,
      last_name: lastName,
      email: (ccb_individual.email || '').trim() || null,
      phone: normalizePhone(ccb_individual.phone || '') || null,
      mobile_phone: normalizePhone(ccb_individual.mobilePhone || '') || null,
      in_group: true,
      in_form: false,
      manually_added: true,
      reconcile_status: 'missing',
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ person }, { status: 201 });
}

// DELETE /api/campaigns/[id]/people?person_id=uuid
// Remove a manually-added individual from the campaign.
export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireAdmin(req);
  if (auth.response) return auth.response;

  const personId = req.nextUrl.searchParams.get('person_id');
  if (!personId) return NextResponse.json({ error: 'person_id is required' }, { status: 400 });

  const supabase = createServiceSupabaseClient();

  // Only allow deleting manually-added rows
  const { data: person } = await supabase
    .from('follow_up_campaign_people')
    .select('id, manually_added')
    .eq('id', personId)
    .eq('campaign_id', params.id)
    .maybeSingle();

  if (!person) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (!person.manually_added) {
    return NextResponse.json({ error: 'Only manually-added people can be removed this way. Use reconcile to remove group members.' }, { status: 400 });
  }

  const { error } = await supabase
    .from('follow_up_campaign_people')
    .delete()
    .eq('id', personId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
