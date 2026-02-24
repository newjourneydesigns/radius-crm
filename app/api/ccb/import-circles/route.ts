import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createCCBClient } from '../../../../lib/ccb/ccb-client';
import { verifyAdminAccessDemo } from '../../../../lib/auth-middleware';
import type { CCBGroup } from '../../../../lib/ccb-types';

export const dynamic = 'force-dynamic';

// ---------------------------------------------------------------------------
// Rate limiter (per-user, 10 req/min) — same pattern as event-attendance
// ---------------------------------------------------------------------------
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT_WINDOW = 60 * 1000;
const RATE_LIMIT_MAX = 10;

function checkRateLimit(userId: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(userId);
  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(userId, { count: 1, resetAt: now + RATE_LIMIT_WINDOW });
    return true;
  }
  if (entry.count >= RATE_LIMIT_MAX) return false;
  entry.count++;
  return true;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getServiceSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error('Missing Supabase env vars');
  return createClient(url, key);
}

// ---------------------------------------------------------------------------
// GET  /api/ccb/import-circles?q=<search>
//
// Returns CCB groups matching the search term, annotated with import status.
// ---------------------------------------------------------------------------
export async function GET(request: NextRequest) {
  try {
    // Auth
    const { isAdmin, error: authErr } = await verifyAdminAccessDemo(request);
    if (!isAdmin) {
      return NextResponse.json({ error: authErr || 'Admin access required' }, { status: 403 });
    }

    // Rate limit
    const userId = request.headers.get('x-forwarded-for') || 'anonymous';
    if (!checkRateLimit(userId)) {
      return NextResponse.json(
        { error: 'Rate limit exceeded. Please try again in a minute.' },
        { status: 429 }
      );
    }

    // Validate query
    const q = request.nextUrl.searchParams.get('q')?.trim() ?? '';
    if (q.length > 0 && q.length < 2) {
      return NextResponse.json(
        { error: 'Search term must be at least 2 characters' },
        { status: 400 }
      );
    }

    // 1. Search CCB via the cached group_profiles call
    const ccb = createCCBClient();
    const ccbGroups = await ccb.searchGroups(q);

    // 2. Check which groups are already imported (by ccb_group_id)
    const sb = getServiceSupabase();
    const ccbIds = ccbGroups.map((g) => g.id);

    // Fetch existing circle_leaders that have a ccb_group_id in the result set
    let importedIds = new Set<string>();
    if (ccbIds.length > 0) {
      const { data: existing } = await sb
        .from('circle_leaders')
        .select('ccb_group_id')
        .in('ccb_group_id', ccbIds);
      importedIds = new Set((existing || []).map((r: any) => r.ccb_group_id));
    }

    // 3. Fuzzy name match — pull all circle_leaders names for comparison
    //    (typically a few hundred rows max, so this is fine)
    const { data: allLeaders } = await sb
      .from('circle_leaders')
      .select('id, name, ccb_group_id');

    const leadersList = allLeaders || [];

    // Build CCB link base from server-side env
    const subdomain = process.env.CCB_SUBDOMAIN || process.env.CCB_BASE_URL || '';
    const ccbBase = subdomain.includes('.')
      ? (subdomain.startsWith('http') ? subdomain : `https://${subdomain}`)
      : subdomain ? `https://${subdomain}.ccbchurch.com` : '';
    const ccbLinkBase = ccbBase.replace(/\/api\.php$/, '');

    // Annotate each CCB group with import/match status
    const annotated = ccbGroups.map((g) => {
      const already = importedIds.has(g.id);

      // Simple fuzzy: check if any circle_leader name contains or is contained
      // in the CCB group name (case-insensitive)
      let possibleMatch: CCBGroup['possibleMatch'] = null;
      if (!already) {
        const gLower = g.name.toLowerCase();
        const leaderName = g.mainLeader?.fullName?.toLowerCase();
        for (const l of leadersList) {
          if (l.ccb_group_id === g.id) continue; // exact match handled above
          const lLower = (l.name || '').toLowerCase();
          if (
            lLower && gLower &&
            (lLower.includes(gLower) || gLower.includes(lLower) ||
             (leaderName && (lLower.includes(leaderName) || leaderName.includes(lLower))))
          ) {
            possibleMatch = { id: l.id, name: l.name };
            break;
          }
        }
      }

      return {
        ...g,
        alreadyImported: already,
        possibleMatch,
        ccbLink: ccbLinkBase ? `${ccbLinkBase}/group_detail.php?group_id=${g.id}` : null,
      };
    });

    return NextResponse.json({
      success: true,
      total: annotated.length,
      groups: annotated,
    });
  } catch (error: any) {
    console.error('❌ import-circles GET error:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Unknown error' },
      { status: 500 }
    );
  }
}

// ---------------------------------------------------------------------------
// POST /api/ccb/import-circles
//
// Body: { groups: CCBGroup[] }
// Inserts selected groups into circle_leaders, auto-skipping duplicates.
// ---------------------------------------------------------------------------
export async function POST(request: NextRequest) {
  try {
    // Auth
    const { isAdmin, error: authErr } = await verifyAdminAccessDemo(request);
    if (!isAdmin) {
      return NextResponse.json({ error: authErr || 'Admin access required' }, { status: 403 });
    }

    const body = await request.json();
    const groups: CCBGroup[] = body.groups;
    if (!Array.isArray(groups) || groups.length === 0) {
      return NextResponse.json(
        { error: 'No groups provided. Send { groups: [...] }' },
        { status: 400 }
      );
    }

    const sb = getServiceSupabase();

    // Fetch existing ccb_group_ids so we can auto-skip
    const ccbIds = groups.map((g) => g.id).filter(Boolean);
    const { data: existing } = await sb
      .from('circle_leaders')
      .select('ccb_group_id')
      .in('ccb_group_id', ccbIds);
    const importedIds = new Set((existing || []).map((r: any) => r.ccb_group_id));

    const toInsert: any[] = [];
    const skipped: Array<{ id: string; name: string; reason: string }> = [];

    // Build the CCB profile link base once
    const subdomain = process.env.CCB_SUBDOMAIN || process.env.CCB_BASE_URL || '';

    for (const g of groups) {
      if (!g.id || !g.name) {
        skipped.push({ id: g.id || '?', name: g.name || '?', reason: 'Missing id or name' });
        continue;
      }

      if (importedIds.has(g.id)) {
        skipped.push({ id: g.id, name: g.name, reason: 'Already imported (ccb_group_id exists)' });
        continue;
      }

      // Determine leader name — prefer mainLeader.fullName, fall back to group name
      const leaderName = g.mainLeader?.fullName || g.name;

      // Build CCB profile link
      let ccbProfileLink: string | null = null;
      if (subdomain) {
        const base = subdomain.includes('.')
          ? (subdomain.startsWith('http') ? subdomain : `https://${subdomain}`)
          : `https://${subdomain}.ccbchurch.com`;
        ccbProfileLink = `${base.replace(/\/api\.php$/, '')}/group_detail.php?group_id=${g.id}`;
      }

      toInsert.push({
        name: leaderName,
        email: g.mainLeader?.email || null,
        phone: g.mainLeader?.phone || null,
        campus: g.campus || null,
        circle_type: g.groupType || null,
        day: g.meetingDay || null,
        time: g.meetingTime || null,
        ccb_group_id: g.id,
        ccb_profile_link: ccbProfileLink,
        status: 'active',
        event_summary_received: false,
      });
    }

    let imported = 0;
    if (toInsert.length > 0) {
      const { data, error: insertError } = await sb
        .from('circle_leaders')
        .insert(toInsert)
        .select('id');

      if (insertError) {
        console.error('❌ circle_leaders insert error:', insertError);
        return NextResponse.json(
          { success: false, error: insertError.message },
          { status: 500 }
        );
      }
      imported = data?.length || toInsert.length;
    }

    return NextResponse.json({
      success: true,
      imported,
      skipped: skipped.length,
      skippedDetails: skipped,
    });
  } catch (error: any) {
    console.error('❌ import-circles POST error:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Unknown error' },
      { status: 500 }
    );
  }
}
