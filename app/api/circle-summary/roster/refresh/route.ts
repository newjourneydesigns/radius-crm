/**
 * POST /api/circle-summary/roster/refresh
 * Body: { ids: string[] }
 * Fetches fresh CCB profile data for the given individual IDs in parallel
 * (capped concurrency), upserts the cache, and returns the fresh profiles.
 */

import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getSessionLeader, unauthorized } from '../../../../../lib/circle-summary/session';
import { createCCBClient } from '../../../../../lib/ccb/ccb-client';
import { getCCBRequestContext } from '../../../../../lib/ccb/ccb-api-gateway';

export const dynamic = 'force-dynamic';

const MAX_CONCURRENCY = 5;
const MAX_IDS_PER_REQUEST = 50;

export async function POST(req: Request) {
  const leader = await getSessionLeader();
  if (!leader) return unauthorized();

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON.' }, { status: 400 });
  }
  const ids: string[] = Array.isArray(body?.ids)
    ? Array.from(new Set(body.ids.map((x: any) => String(x)).filter(Boolean))).slice(0, MAX_IDS_PER_REQUEST) as string[]
    : [];
  if (ids.length === 0) {
    return NextResponse.json({ profiles: [] });
  }

  const ccb = createCCBClient(
    await getCCBRequestContext(req, { module: 'circle-summary', action: 'roster_profile_batch' })
  );

  type Result = { id: string; firstName: string; lastName: string; fullName: string; email: string; phone: string; birthday: string };
  const results: Result[] = [];

  // Run with bounded concurrency to stay friendly to CCB's rate limits.
  let cursor = 0;
  async function worker() {
    while (cursor < ids.length) {
      const i = cursor++;
      const id = ids[i];
      try {
        const profile = await ccb.getIndividualProfile(id);
        if (profile) {
          results.push({
            id: String(profile.id || id),
            firstName: profile.firstName || '',
            lastName: profile.lastName || '',
            fullName: profile.fullName || '',
            email: profile.email || '',
            phone: profile.mobilePhone || profile.phone || '',
            birthday: profile.birthday || '',
          });
        }
      } catch {
        // Skip; client will keep showing whatever it had.
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(MAX_CONCURRENCY, ids.length) }, worker));

  // Upsert into the cache.
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (supabaseUrl && serviceKey && results.length > 0) {
    const admin = createClient(supabaseUrl, serviceKey);
    const nowIso = new Date().toISOString();
    await admin.from('ccb_individual_profiles').upsert(
      results.map((r) => ({
        ccb_individual_id: r.id,
        first_name: r.firstName,
        last_name: r.lastName,
        full_name: r.fullName,
        email: r.email,
        phone: r.phone,
        birthday: r.birthday,
        synced_at: nowIso,
      })),
      { onConflict: 'ccb_individual_id' }
    );
  }

  return NextResponse.json({ profiles: results });
}
