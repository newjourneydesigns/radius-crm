/**
 * GET /api/ccb/scheduling-probe?category_id=238[&start=YYYY-MM-DD&end=YYYY-MM-DD]
 *
 * Admin-only discovery probe (read-only) for the Teams Toolkit Schedule tab.
 * Tries a spread of candidate CCB scheduling endpoints for a category and
 * returns the raw JSON for each, so we can see which endpoint exposes scheduled
 * occurrences + per-person response status and map it. Server-side twin of
 * scripts/probe-ccb-scheduling.ts (so it can run from the admin UI with the
 * deployed site's CCB credentials — no local terminal needed).
 */

import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminAccess } from '../../../../lib/auth-middleware';
import { createCCBv2Client } from '../../../../lib/ccb/ccb-v2-client';
import { getCCBRequestContext } from '../../../../lib/ccb/ccb-api-gateway';

export const dynamic = 'force-dynamic';

function plusDays(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

export async function GET(request: NextRequest) {
  const { isAdmin, error } = await verifyAdminAccess(request);
  if (!isAdmin) {
    return NextResponse.json({ error: error || 'Unauthorized' }, { status: 401 });
  }

  const categoryId = request.nextUrl.searchParams.get('category_id');
  if (!categoryId) {
    return NextResponse.json({ error: 'Missing category_id' }, { status: 400 });
  }
  const start = request.nextUrl.searchParams.get('start') || new Date().toISOString().slice(0, 10);
  const end = request.nextUrl.searchParams.get('end') || plusDays(42);

  const ctx = await getCCBRequestContext(request, {
    module: 'Teams Toolkit Spike',
    action: 'Probe Scheduling',
    direction: 'pull',
  });
  const v2 = createCCBv2Client(ctx);

  const candidates: Array<{ label: string; path: string; query?: Record<string, string> }> = [
    { label: 'category detail', path: `/scheduling/categories/${categoryId}` },
    { label: 'category volunteers', path: `/scheduling/categories/${categoryId}/volunteers` },
    { label: 'category schedules', path: `/scheduling/categories/${categoryId}/schedules`, query: { start, end } },
    { label: 'category events', path: `/scheduling/categories/${categoryId}/events`, query: { start, end } },
    { label: 'category occurrences', path: `/scheduling/categories/${categoryId}/occurrences`, query: { start, end } },
    { label: 'category needs', path: `/scheduling/categories/${categoryId}/needs`, query: { start, end } },
    { label: 'category assignments', path: `/scheduling/categories/${categoryId}/assignments`, query: { start, end } },
    { label: 'category requests', path: `/scheduling/categories/${categoryId}/requests`, query: { start, end } },
    { label: 'schedules by category_id', path: `/scheduling/schedules`, query: { category_id: String(categoryId), start, end } },
    { label: 'scheduling events by category_id', path: `/scheduling/events`, query: { category_id: String(categoryId), start, end } },
  ];

  const results: any[] = [];
  for (const c of candidates) {
    try {
      const data = await v2.get(c.path, c.query);
      results.push({
        label: c.label,
        path: c.path,
        query: c.query ?? null,
        ok: true,
        sample: data,
      });
    } catch (e: any) {
      results.push({
        label: c.label,
        path: c.path,
        query: c.query ?? null,
        ok: false,
        status: e?.status ?? e?.statusCode ?? null,
        error: e?.message || String(e),
      });
    }
  }

  return NextResponse.json({ categoryId, start, end, results }, {
    headers: { 'cache-control': 'no-store' },
  });
}
