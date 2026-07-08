import { NextRequest, NextResponse } from 'next/server';
import { getUserFromAuthHeader } from '../../../../lib/server-supabase';
import { createCCBClient } from '../../../../lib/ccb/ccb-client';
import { getCCBRequestContext } from '../../../../lib/ccb/ccb-api-gateway';

export const dynamic = 'force-dynamic';

type EventRow = { id: string; title: string; startDate: string | null };

// event_profiles returns the whole church's event list (a heavy CCB call), so
// cache it per warm lambda and filter in memory. Search-as-you-type then costs
// one CCB call every ~10 minutes instead of one per keystroke.
let cache: { events: EventRow[]; expiresAt: number } | null = null;
const CACHE_TTL = 10 * 60 * 1000;

// GET /api/campaigns/event-search?q=<partial event name>
// Find CCB events by partial name for the campaign event picker.
export async function GET(req: NextRequest) {
  const user = await getUserFromAuthHeader(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const q = (req.nextUrl.searchParams.get('q') ?? '').trim().toLowerCase();
  if (q.length < 2) return NextResponse.json({ events: [] });

  try {
    if (!cache || Date.now() > cache.expiresAt) {
      const ctx = await getCCBRequestContext(req, {
        module: 'Follow-Up Campaigns',
        action: 'Event Search',
        direction: 'pull',
      });
      const ccb = createCCBClient(ctx);
      cache = { events: await ccb.listAllEvents(), expiresAt: Date.now() + CACHE_TTL };
    }

    // Every query word must appear in the title, so "fuel lvt" works too.
    const words = q.split(/\s+/).filter(Boolean);
    const matches = cache.events
      .filter(ev => {
        const t = ev.title.toLowerCase();
        return words.every(w => t.includes(w));
      })
      .sort((a, b) => (a.startDate ?? '9999') < (b.startDate ?? '9999') ? -1 : 1)
      .slice(0, 30);

    return NextResponse.json({ events: matches });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
