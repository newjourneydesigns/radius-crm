/**
 * GET /api/circle-leader-toolkit/coaching-runs
 *
 * Recent coaching automation runs for the admin "Run history" panel. ACPD only.
 * Reads coaching_automation_runs (server-only table) via the service client.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServiceSupabaseClient, getUserFromAuthHeader } from '../../../../lib/server-supabase';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const user = await getUserFromAuthHeader(req);
  if (!user) return NextResponse.json({ error: 'Invalid or expired token' }, { status: 401 });

  const supabase = createServiceSupabaseClient();
  const { data: profile } = await supabase.from('users').select('role').eq('id', user.id).maybeSingle();
  if (profile?.role !== 'ACPD') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { data, error } = await supabase
    .from('coaching_automation_runs')
    .select('id, trigger, ok, eligible_leaders, sent_count, sent_by_kind, errors, duration_ms, started_at')
    .order('started_at', { ascending: false })
    .limit(25);

  if (error) {
    // Most likely the migration hasn't run yet — surface that clearly.
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ runs: data ?? [] });
}
