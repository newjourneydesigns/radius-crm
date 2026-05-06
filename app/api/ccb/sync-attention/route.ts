import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createCCBClient } from '../../../../lib/ccb/ccb-client';
import { getCCBRequestContext } from '../../../../lib/ccb/ccb-api-gateway';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

function getServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

function toDateStr(d: Date): string {
  return d.toISOString().split('T')[0];
}

/**
 * Match a CCB event title to a circle leader.
 * CCB titles: "LVT | S1 | Trip Ochenski"
 * DB leaders: "Trip Ochenski"
 */
function findLeaderForEvent(
  eventTitle: string,
  leaders: { id: number; name: string }[]
): number | null {
  if (eventTitle.includes('|')) {
    const namePart = eventTitle.split('|').pop()!.trim().toLowerCase();
    if (namePart) {
      const match = leaders.find(
        (l) =>
          l.name.toLowerCase() === namePart ||
          namePart.includes(l.name.toLowerCase()) ||
          l.name.toLowerCase().includes(namePart)
      );
      if (match) return match.id;
    }
  }
  const titleLower = eventTitle.toLowerCase();
  const titleMatch = leaders.find((l) => titleLower.includes(l.name.toLowerCase()));
  if (titleMatch) return titleMatch.id;
  return null;
}

// ════════════════════════════════════════════════════════════════════
// POST — Targeted sync for specific leader IDs (last 4 weeks)
//
// Body: { leaderIds: number[] }
//
// Uses name-based search via attendance_profiles (same approach as
// the /api/ccb/event-attendance endpoint) instead of event-id
// discovery which returns empty for most groups.
// ════════════════════════════════════════════════════════════════════

export async function POST(request: NextRequest) {
  const supabase = getServiceClient();

  let body: { leaderIds?: number[] };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const leaderIds = body.leaderIds;
  if (!Array.isArray(leaderIds) || leaderIds.length === 0) {
    return NextResponse.json({ error: 'leaderIds array required' }, { status: 400 });
  }

  if (leaderIds.length > 200) {
    return NextResponse.json({ error: 'Maximum 200 leaders per request' }, { status: 400 });
  }

  // 4-week date range
  const endDate = toDateStr(new Date());
  const start = new Date();
  start.setDate(start.getDate() - 28);
  const startDate = toDateStr(start);

  console.log(`🔄 Attention sync: ${leaderIds.length} leaders, range=${startDate} → ${endDate}`);

  // Load the requested leaders
  const { data: leaders, error: leadersError } = await supabase
    .from('circle_leaders')
    .select('id, name')
    .in('id', leaderIds);

  if (leadersError || !leaders || leaders.length === 0) {
    return NextResponse.json(
      { error: 'Failed to load leaders', details: leadersError },
      { status: 500 }
    );
  }

  // Initialize CCB client
  let ccbClient: ReturnType<typeof createCCBClient>;
  try {
    ccbClient = createCCBClient(await getCCBRequestContext(request, {
      module: 'Dashboard',
      action: 'Sync Leader Info',
      direction: 'pull',
    }));
  } catch (err: any) {
    return NextResponse.json(
      { error: 'CCB client initialization failed', details: err.message },
      { status: 500 }
    );
  }

  // ── Fetch ALL circle events from CCB for the date range (one API call) ──
  // Uses attendance_profiles API. Searching "|" matches all pipe-delimited
  // circle event titles like "LVT | S1 | Trip Ochenski".
  let allEvents: Awaited<ReturnType<typeof ccbClient.searchEventsByDateAndName>>;
  try {
    allEvents = await ccbClient.searchEventsByDateAndName(
      '|',
      startDate,
      endDate,
      { includeAttendees: true }
    );
    console.log(`🔄 CCB returned ${allEvents.length} events in date range`);
  } catch (err: any) {
    return NextResponse.json(
      { error: 'CCB attendance fetch failed', details: err.message },
      { status: 500 }
    );
  }

  // ── Match events to our target leaders and upsert ─────────────────
  const leaderList = leaders as { id: number; name: string }[];
  const targetLeaderIds = new Set(leaderList.map((l) => l.id));

  const results = {
    leadersRequested: leaderIds.length,
    leadersProcessed: leaderList.length,
    leadersWithData: 0,
    synced: 0,
    errors: 0,
    ccbEventsTotal: allEvents.length,
    dateRange: { startDate, endDate },
  };

  const matchedLeaderIds = new Set<number>();

  for (const event of allEvents) {
    const att = event.attendance;
    if (!att || !event.occurDate) continue;

    const leaderId = findLeaderForEvent(event.title, leaderList);
    if (!leaderId || !targetLeaderIds.has(leaderId)) continue;

    matchedLeaderIds.add(leaderId);

    const attendeeCount = att.attendees?.length || 0;
    const extraHeadCount = att.headCount || 0;
    const totalCount = (attendeeCount + extraHeadCount) || null;

    try {
      const { error: occError, data: occ } = await supabase
        .from('circle_meeting_occurrences')
        .upsert(
          {
            leader_id: leaderId,
            ccb_event_id: event.eventId || null,
            meeting_date: event.occurDate,
            status: att.didNotMeet ? 'did_not_meet' : 'met',
            headcount: totalCount,
            regular_count: null,
            visitor_count: null,
            source: 'event_summary',
            raw_payload: {
              eventId: event.eventId,
              title: event.title,
              headCount: att.headCount,
              didNotMeet: att.didNotMeet,
              topic: att.topic,
              notes: att.notes,
              attendeeCount,
            },
            synced_at: new Date().toISOString(),
          },
          { onConflict: 'leader_id,meeting_date' }
        )
        .select('id')
        .single();

      if (occError) {
        console.warn(`⚠️ Upsert failed for event "${event.title}" on ${event.occurDate}:`, occError.message);
        results.errors++;
        continue;
      }

      results.synced++;

      if (occ && att.attendees && att.attendees.length > 0) {
        await supabase
          .from('circle_meeting_attendees')
          .delete()
          .eq('occurrence_id', occ.id);

        await supabase
          .from('circle_meeting_attendees')
          .insert(
            att.attendees.map((a) => ({
              occurrence_id: occ.id,
              ccb_individual_id: a.id || '',
              name: a.name || 'Unknown',
              attendance_type: a.status?.toLowerCase().includes('visit')
                ? 'visitor'
                : 'regular',
            }))
          );
      }
    } catch (err: any) {
      console.error(`Attention sync failed for event "${event.title}":`, err);
      results.errors++;
    }
  }

  results.leadersWithData = matchedLeaderIds.size;
  console.log(`🔄 Attention sync complete:`, results);
  return NextResponse.json({ success: true, ...results });
}
