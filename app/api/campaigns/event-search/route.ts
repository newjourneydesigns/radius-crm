import { NextRequest, NextResponse } from 'next/server';
import { DateTime } from 'luxon';
import { getUserFromAuthHeader } from '../../../../lib/server-supabase';
import { createCCBClient } from '../../../../lib/ccb/ccb-client';
import { getCCBRequestContext } from '../../../../lib/ccb/ccb-api-gateway';

export const dynamic = 'force-dynamic';

type EventRow = { id: string; title: string; startDate: string | null };

// event_profiles is a heavy CCB call, so two speedups stack here:
//  1. Scope: by default only events created/modified in the last 6 months
//     (modified_since) — campaign events are always recent. ?all=true widens
//     to the full church history for the rare older event.
//  2. Cache: each scope's list is cached per warm lambda for 10 minutes, so
//     search-as-you-type filters in memory instead of re-calling CCB.
const cache = new Map<string, { events: EventRow[]; expiresAt: number }>();
const CACHE_TTL = 10 * 60 * 1000;
const RECENT_MONTHS = 6;

// GET /api/campaigns/event-search?q=<partial event name>[&all=true]
export async function GET(req: NextRequest) {
  const user = await getUserFromAuthHeader(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const q = (req.nextUrl.searchParams.get('q') ?? '').trim().toLowerCase();
  if (q.length < 2) return NextResponse.json({ events: [] });
  const scope = req.nextUrl.searchParams.get('all') === 'true' ? 'all' : 'recent';

  try {
    let entry = cache.get(scope);
    if (!entry || Date.now() > entry.expiresAt) {
      const ctx = await getCCBRequestContext(req, {
        module: 'Follow-Up Campaigns',
        action: 'Event Search',
        direction: 'pull',
      });
      const ccb = createCCBClient(ctx);
      const modifiedSince = scope === 'recent'
        ? DateTime.now().minus({ months: RECENT_MONTHS }).toFormat('yyyy-MM-dd')
        : undefined;
      entry = { events: await ccb.listAllEvents({ modifiedSince }), expiresAt: Date.now() + CACHE_TTL };
      cache.set(scope, entry);
    }

    // Every query word must appear in the title, so "fuel lvt" works too.
    const words = q.split(/\s+/).filter(Boolean);
    const matches = entry.events
      .filter(ev => {
        const t = ev.title.toLowerCase();
        return words.every(w => t.includes(w));
      })
      .sort((a, b) => (a.startDate ?? '9999') < (b.startDate ?? '9999') ? -1 : 1)
      .slice(0, 30);

    return NextResponse.json({ events: matches, scope });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
