/**
 * GET /api/ccb/scheduling-probe?category_id=238[&start=YYYY-MM-DD&end=YYYY-MM-DD]
 *
 * Admin-only discovery probe (read-only) for the Teams Toolkit Schedule tab.
 *
 * Phase 1 confirmed `/scheduling/categories/{id}/events` returns upcoming dated
 * slots, but per-person assignment + accept/decline status isn't at the category
 * level (those returned 405). Phase 2 (this version) auto-discovers an upcoming
 * event + its schedule, then probes per-person endpoints UNDER that event /
 * schedule / serving-rotation to find where the response status lives.
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

function asArray(json: any): any[] {
  if (Array.isArray(json)) return json;
  return json?.items ?? json?.data ?? json?.results ?? [];
}

export async function GET(request: NextRequest) {
  const { isAdmin, error } = await verifyAdminAccess(request);
  if (!isAdmin) return NextResponse.json({ error: error || 'Unauthorized' }, { status: 401 });

  const categoryId = request.nextUrl.searchParams.get('category_id');
  if (!categoryId) return NextResponse.json({ error: 'Missing category_id' }, { status: 400 });
  const start = request.nextUrl.searchParams.get('start') || new Date().toISOString().slice(0, 10);
  const end = request.nextUrl.searchParams.get('end') || plusDays(28);

  const ctx = await getCCBRequestContext(request, {
    module: 'Teams Toolkit Spike',
    action: 'Probe Scheduling Deep',
    direction: 'pull',
  });
  const v2 = createCCBv2Client(ctx);

  const results: any[] = [];
  const tryGet = async (label: string, path: string, query?: Record<string, string>) => {
    try {
      const data = await v2.get(path, query);
      results.push({ label, path, query: query ?? null, ok: true, sample: data });
      return data;
    } catch (e: any) {
      results.push({
        label, path, query: query ?? null, ok: false,
        status: e?.status ?? e?.statusCode ?? null, error: e?.message || String(e),
      });
      return null;
    }
  };

  // Phase 1: discover an upcoming event + its schedule id.
  const events = asArray(
    await tryGet('category events (discover)', `/scheduling/categories/${categoryId}/events`, { start, end })
  );
  const sorted = [...events].sort((a, b) => String(a?.start || '').localeCompare(String(b?.start || '')));
  const pick = sorted.find((e) => e?.id) || null;
  const eventId = pick?.id != null ? String(pick.id) : null;
  const scheduleId = pick?.schedule_id != null ? String(pick.schedule_id) : null;
  const rotationId = pick?.serving_rotation_id != null ? String(pick.serving_rotation_id) : null;

  // Phase 2: per-person endpoints under the specific event / schedule / rotation.
  if (eventId) {
    await tryGet('event detail', `/scheduling/events/${eventId}`);
    await tryGet('event requests', `/scheduling/events/${eventId}/requests`);
    await tryGet('event assignments', `/scheduling/events/${eventId}/assignments`);
    await tryGet('event volunteers', `/scheduling/events/${eventId}/volunteers`);
    await tryGet('event needs', `/scheduling/events/${eventId}/needs`);
    await tryGet('event positions', `/scheduling/events/${eventId}/positions`);
  }
  if (scheduleId) {
    await tryGet('schedule detail', `/scheduling/schedules/${scheduleId}`);
    await tryGet('schedule requests', `/scheduling/schedules/${scheduleId}/requests`);
    await tryGet('schedule assignments', `/scheduling/schedules/${scheduleId}/assignments`);
    await tryGet('schedule volunteers', `/scheduling/schedules/${scheduleId}/volunteers`);
    await tryGet('schedule needs', `/scheduling/schedules/${scheduleId}/needs`);
  }
  if (rotationId) {
    await tryGet('serving-rotation detail', `/scheduling/serving-rotations/${rotationId}`);
    await tryGet('serving-rotation requests', `/scheduling/serving-rotations/${rotationId}/requests`);
    await tryGet('serving-rotation assignments', `/scheduling/serving-rotations/${rotationId}/assignments`);
  }
  // Category-level requests/assignments scoped by date (some CCB APIs accept these as filters).
  await tryGet('category requests (date-scoped)', `/scheduling/categories/${categoryId}/requests`, { start, end });
  await tryGet('category assignments (date-scoped)', `/scheduling/categories/${categoryId}/assignments`, { start, end });

  return NextResponse.json(
    { categoryId, start, end, discovered: { eventId, scheduleId, rotationId, pickedEvent: pick }, results },
    { headers: { 'cache-control': 'no-store' } }
  );
}
