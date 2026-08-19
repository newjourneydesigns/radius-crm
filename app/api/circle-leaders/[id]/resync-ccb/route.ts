import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createCCBv2Client } from '../../../../../lib/ccb/ccb-v2-client';
import { getCCBRequestContext } from '../../../../../lib/ccb/ccb-api-gateway';
import {
  CCB_SYNCABLE_FIELDS,
  diffCircleSnapshot,
  fetchCcbCircleSnapshot,
} from '../../../../../lib/ccb/circle-sync';
import { verifyAdminAccessDemo } from '../../../../../lib/auth-middleware';

export const dynamic = 'force-dynamic';

function getServiceSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error('Missing Supabase env vars');
  return createClient(url, key);
}

// POST /api/circle-leaders/[id]/resync-ccb
//
// Re-pulls this circle's data from CCB v2 (by its ccb_group_id) and refreshes the
// meeting time/day/frequency/location, leader email/phone/birthday, exact CCB
// group name, and linked event IDs — the same enrichment the importer does.
// The snapshot + diff logic lives in lib/ccb/circle-sync.ts, shared with the
// Mass Update bulk sync.
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { isAdmin, error: authErr } = await verifyAdminAccessDemo(request);
    if (!isAdmin) {
      return NextResponse.json({ error: authErr || 'Admin access required' }, { status: 403 });
    }

    const id = parseInt(params.id, 10);
    if (isNaN(id)) {
      return NextResponse.json({ error: 'Invalid leader id' }, { status: 400 });
    }

    const body = await request.json().catch(() => ({}));
    const confirmedValues: Record<string, any> | null = body?.apply && typeof body.apply === 'object' ? body.apply : null;

    const sb = getServiceSupabase();
    const { data: leader } = await sb
      .from('circle_leaders')
      .select('id, name, ccb_group_id, leader_ccb_profile_link, campus, circle_type, circle_location, day, time, frequency, location, email, phone, birthday, ccb_group_name, ccb_event_ids')
      .eq('id', id)
      .maybeSingle();

    if (!leader) {
      return NextResponse.json({ error: 'Circle leader not found' }, { status: 404 });
    }

    // ---- APPLY: write the confirmed values (whitelisted) and return. ----
    if (confirmedValues) {
      const updates: Record<string, any> = { updated_at: new Date().toISOString() };
      for (const key of CCB_SYNCABLE_FIELDS) {
        if (key in confirmedValues) updates[key] = confirmedValues[key];
      }
      if (Object.keys(updates).length === 1) {
        return NextResponse.json({ error: 'No changes to apply.' }, { status: 400 });
      }
      const { data: applied, error: applyErr } = await sb
        .from('circle_leaders')
        .update(updates)
        .eq('id', id)
        .select('id, name, day, time, frequency, location, campus, circle_type, circle_location, email, phone, birthday, ccb_group_name, ccb_event_ids, leader_ccb_profile_link')
        .single();
      if (applyErr) {
        console.error('❌ resync-ccb apply error:', applyErr);
        return NextResponse.json({ error: applyErr.message }, { status: 500 });
      }
      return NextResponse.json({ success: true, applied: true, leader: applied });
    }

    if (!leader.ccb_group_id) {
      return NextResponse.json(
        { error: 'This circle has no CCB Group ID set. Add one before re-syncing.' },
        { status: 400 }
      );
    }

    const groupId = String(leader.ccb_group_id);
    const ccbv2 = createCCBv2Client(await getCCBRequestContext(request, {
      module: 'Circle Page',
      action: 'Re-sync from CCB',
      direction: 'pull',
    }));

    const snapshot = await fetchCcbCircleSnapshot({
      request,
      ccbv2,
      groupId,
      telemetry: { module: 'Circle Page', classificationsAction: 'Re-sync Classifications' },
    });

    if (!snapshot) {
      return NextResponse.json(
        { error: `No CCB group found for Group ID ${groupId}.` },
        { status: 404 }
      );
    }

    // ---- PREVIEW: diff the fresh CCB values against the stored row. ----
    const { changes, values } = diffCircleSnapshot(leader as any, snapshot.proposed);

    return NextResponse.json({
      success: true,
      preview: true,
      changes,
      values,
      eventIdsLinked: snapshot.eventIdsLinked,
      ccbInactive: snapshot.ccbInactive,
    });
  } catch (error: any) {
    console.error('❌ resync-ccb error:', error);
    return NextResponse.json({ error: error.message || 'Unknown error' }, { status: 500 });
  }
}
