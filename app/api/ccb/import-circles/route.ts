import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createCCBClient } from '../../../../lib/ccb/ccb-client';
import { createCCBv2Client } from '../../../../lib/ccb/ccb-v2-client';
import { getCCBRequestContext } from '../../../../lib/ccb/ccb-api-gateway';
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
// GET  /api/ccb/import-circles?campus=<campusId>&department=<deptId>
//
// Fetches active circles from CCB v2 with optional filtering.
// Returns circles not yet imported to RADIUS, with auto-populated leader info.
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

    const campusId = request.nextUrl.searchParams.get('campus');
    const deptId = request.nextUrl.searchParams.get('department');

    // Fetch circles from CCB v2 (paginated, non-inactive circles)
    const ccbv2 = createCCBv2Client(await getCCBRequestContext(request, {
      module: 'Import Circles (v2)',
      action: 'Fetch Active Circles',
      direction: 'pull',
    }));

    // Fetch all active circles with optional campus filter
    const allCircles: any[] = [];
    let page = 1;
    let hasMore = true;

    while (hasMore && page <= 10) {
      const result = await ccbv2.listGroups({
        page,
        perPage: 100,
        campusId: campusId || undefined,
        inactive: false,
      });

      allCircles.push(...result.items);
      hasMore = (result.items.length === 100);
      page++;
    }

    // Filter by department if specified
    let circles = allCircles;
    if (deptId) {
      circles = circles.filter(c => String(c.department?.id) === deptId);
    }

    // Check which groups are already imported
    const sb = getServiceSupabase();
    const ccbIds = circles.map((c) => c.id);

    let importedIds = new Set<string>();
    if (ccbIds.length > 0) {
      const { data: existing } = await sb
        .from('circle_leaders')
        .select('ccb_group_id')
        .in('ccb_group_id', ccbIds);
      importedIds = new Set((existing || []).map((r: any) => r.ccb_group_id));
    }

    // Build CCB link base
    const subdomain = process.env.CCB_SUBDOMAIN || process.env.CCB_BASE_URL || '';
    const ccbBase = subdomain.includes('.')
      ? (subdomain.startsWith('http') ? subdomain : `https://${subdomain}`)
      : subdomain ? `https://${subdomain}.ccbchurch.com` : '';
    const ccbLinkBase = ccbBase.replace(/\/api\.php$/, '');

    // Format response
    const annotated = circles
      .filter(c => !importedIds.has(c.id))
      .map((c) => ({
        id: c.id,
        name: c.name,
        description: c.description,
        campus: c.campus?.name,
        campusId: c.campus?.id,
        department: c.department?.name,
        departmentId: c.department?.id,
        groupType: c.type?.name,
        meetingDay: c.meetDay?.name,
        meetingTime: c.meetTime?.name,
        address: c.address?.street,
        city: c.address?.city,
        mainLeader: c.mainLeader ? {
          id: c.mainLeader.id,
          firstName: c.mainLeader.firstName,
          lastName: c.mainLeader.lastName,
          fullName: c.mainLeader.fullName,
          email: c.mainLeader.email,
          phone: c.mainLeader.mobilePhone || c.mainLeader.phone,
        } : null,
        ccbLink: ccbLinkBase ? `${ccbLinkBase}/group_detail.php?group_id=${c.id}` : null,
      }));

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
// Body: { groups: Array<{ id, name, mainLeader?, campus?, groupType?, meetingDay?, meetingTime?, acpd? }> }
// Inserts selected groups into circle_leaders with optional ACPD assignment.
// Auto-creates leaders if they don't exist.
// ---------------------------------------------------------------------------
export async function POST(request: NextRequest) {
  try {
    // Auth
    const { isAdmin, error: authErr } = await verifyAdminAccessDemo(request);
    if (!isAdmin) {
      return NextResponse.json({ error: authErr || 'Admin access required' }, { status: 403 });
    }

    const body = await request.json();
    const groups: any[] = body.groups;
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

    // Build CCB link base
    const subdomain = process.env.CCB_SUBDOMAIN || process.env.CCB_BASE_URL || '';

    for (const g of groups) {
      if (!g.id || !g.name) {
        skipped.push({ id: g.id || '?', name: g.name || '?', reason: 'Missing id or name' });
        continue;
      }

      if (importedIds.has(g.id)) {
        skipped.push({ id: g.id, name: g.name, reason: 'Already imported' });
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
        acpd: g.acpd || null,
        circle_type: g.groupType || null,
        day: g.meetingDay || null,
        time: g.meetingTime || null,
        ccb_group_id: g.id,
        ccb_profile_link: ccbProfileLink,
        ccb_individual_id: g.mainLeader?.id || null,
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
