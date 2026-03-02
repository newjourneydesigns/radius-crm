import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createCCBClient, type LinkRow } from '../../../../lib/ccb/ccb-client';

export const dynamic = 'force-dynamic';

// ── Supabase service client (bypasses RLS) ─────────────────────────
function getServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

// ── Types ──────────────────────────────────────────────────────────
interface OccurrenceRow {
  leader_id: number;
  ccb_event_id: string | null;
  meeting_date: string; // YYYY-MM-DD
  status: 'met' | 'did_not_meet' | 'no_record';
  headcount: number | null;
  regular_count: number | null;
  visitor_count: number | null;
  source: 'ccb' | 'manual' | 'event_summary';
  raw_payload: any;
  attendees: { ccb_individual_id: string; name: string; attendance_type: string }[];
}

interface LeaderRow {
  id: number;
  name: string;
  ccb_group_id: string;
  ccb_event_ids: string[] | null;
  day: string | null;
  frequency: string | null;
  meeting_start_date: string | null;
}

// ── Day-of-week helper ─────────────────────────────────────────────
const DAY_MAP: Record<string, number> = {
  sunday: 0, monday: 1, tuesday: 2, wednesday: 3,
  thursday: 4, friday: 5, saturday: 6,
};

/**
 * Determine all dates in [startDate, endDate] that fall on the leader's
 * meeting day. In the future we can incorporate biweekly parity via
 * meeting_start_date.
 */
function getExpectedMeetingDates(
  leader: LeaderRow,
  startDate: string,
  endDate: string
): string[] {
  if (!leader.day) return [];

  const targetDay = DAY_MAP[leader.day.toLowerCase().trim()];
  if (targetDay === undefined) return [];

  const dates: string[] = [];
  const cursor = new Date(startDate + 'T12:00:00');
  const end = new Date(endDate + 'T12:00:00');

  while (cursor <= end) {
    if (cursor.getDay() === targetDay) {
      dates.push(cursor.toISOString().split('T')[0]);
    }
    cursor.setDate(cursor.getDate() + 1);
  }

  // Biweekly filter: keep every other meeting based on anchor date
  if (leader.frequency?.toLowerCase().includes('bi') && leader.meeting_start_date) {
    const anchor = new Date(leader.meeting_start_date + 'T12:00:00');
    const anchorTime = anchor.getTime();
    const oneWeekMs = 7 * 24 * 60 * 60 * 1000;
    return dates.filter(d => {
      const diff = Math.abs(new Date(d + 'T12:00:00').getTime() - anchorTime);
      const weeksDiff = Math.round(diff / oneWeekMs);
      return weeksDiff % 2 === 0;
    });
  }

  return dates;
}

/**
 * Build OccurrenceRow records from pre-fetched LinkRow data for a single leader.
 * No CCB API calls here — all data comes from the bulk fetch.
 */
function buildOccurrenceRows(
  leader: LeaderRow,
  linkRows: LinkRow[]
): OccurrenceRow[] {
  const records: OccurrenceRow[] = [];

  for (const row of linkRows) {
    const att = row.attendance;
    if (!att) continue;

    const meetingDate = row.occurDate;
    if (!meetingDate) continue;

    let regularCount = 0;
    let visitorCount = 0;
    const attendees: OccurrenceRow['attendees'] = [];

    if (att.attendees) {
      for (const a of att.attendees) {
        const isVisitor = a.status?.toLowerCase().includes('visit') || false;
        if (isVisitor) visitorCount++;
        else regularCount++;

        attendees.push({
          ccb_individual_id: a.id || '',
          name: a.name || 'Unknown',
          attendance_type: isVisitor ? 'visitor' : 'regular',
        });
      }
    }

    records.push({
      leader_id: leader.id,
      ccb_event_id: att.eventId || row.eventId || null,
      meeting_date: meetingDate,
      status: att.didNotMeet ? 'did_not_meet' : 'met',
      headcount: att.headCount ?? (attendees.length || null),
      regular_count: regularCount || null,
      visitor_count: visitorCount || null,
      source: 'ccb',
      raw_payload: {
        eventId: att.eventId,
        title: att.title,
        occurrence: att.occurrence,
        headCount: att.headCount,
        didNotMeet: att.didNotMeet,
        topic: att.topic,
        notes: att.notes,
        attendeeCount: att.attendees?.length,
      },
      attendees,
    });
  }

  return records;
}

// Date helpers
function toDateStr(d: Date): string {
  return d.toISOString().split('T')[0];
}
function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return toDateStr(d);
}

// ════════════════════════════════════════════════════════════════════
// POST — trigger attendance sync
//
// Modes (via ?mode= query param):
//   "daily"    (default) — sync last 2 weeks only, 1 API call
//   "backfill"           — sync last 6 months (one-time catch-up)
//
// Requires event IDs to be pre-cached via POST /api/ccb/discover-events.
//
// CCB cost: 1 API call (attendance_profiles with date range)
// ════════════════════════════════════════════════════════════════════

export async function POST(request: NextRequest) {
  // Auth
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const authHeader = request.headers.get('authorization');
    if (authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }

  const supabase = getServiceClient();
  const url = new URL(request.url);
  const mode = url.searchParams.get('mode') || 'daily';
  const singleLeaderId = url.searchParams.get('leaderId');

  // Date range based on mode
  const endDate = toDateStr(new Date());
  const startDate = mode === 'backfill' ? daysAgo(180) : daysAgo(14);

  console.log(`📦 Attendance sync: mode=${mode}, range=${startDate} → ${endDate}`);

  // Load leaders with cached event IDs
  let query = supabase
    .from('circle_leaders')
    .select('id, name, ccb_group_id, ccb_event_ids, day, frequency, meeting_start_date, status')
    .not('ccb_group_id', 'is', null);

  if (singleLeaderId) {
    query = query.eq('id', parseInt(singleLeaderId, 10));
  }

  const { data: leaders, error: leadersError } = await query;

  if (leadersError || !leaders) {
    return NextResponse.json(
      { error: 'Failed to load leaders', details: leadersError },
      { status: 500 }
    );
  }

  // Filter inactive (unless syncing a specific one)
  const activeLeaders = singleLeaderId
    ? (leaders as LeaderRow[])
    : (leaders as any[]).filter(
        (l) => !['Inactive', 'Removed', 'off-boarding'].includes(l.status || '')
      ) as LeaderRow[];

  // Collect unique event IDs across all leaders
  let missingEventIds = 0;
  const eventIdSet = new Set<string>();

  for (const leader of activeLeaders) {
    if (!leader.ccb_event_ids || leader.ccb_event_ids.length === 0) {
      missingEventIds++;
      continue;
    }
    for (const eid of leader.ccb_event_ids) {
      eventIdSet.add(eid);
    }
  }

  console.log(
    `📦 ${activeLeaders.length} leaders, ${eventIdSet.size} unique event IDs, ` +
      `${missingEventIds} leaders need event discovery`
  );

  if (eventIdSet.size === 0) {
    return NextResponse.json({
      success: true,
      warning: 'No cached event IDs found. Run POST /api/ccb/discover-events first.',
      missingEventIds,
    });
  }

  // ── Fetch attendance: single bulk API call ────────────────────────
  let ccbClient: ReturnType<typeof createCCBClient>;
  try {
    ccbClient = createCCBClient();
  } catch (err: any) {
    return NextResponse.json(
      { error: 'CCB client initialization failed', details: err.message },
      { status: 500 }
    );
  }

  console.log(`📦 Fetching attendance_profiles: ${startDate} → ${endDate}…`);
  let attendanceByEventId: Map<string, LinkRow[]>;
  try {
    attendanceByEventId = await ccbClient.fetchAllAttendanceInRange(
      startDate,
      endDate,
      { includeAttendees: true }
    );
  } catch (err: any) {
    return NextResponse.json(
      { error: 'CCB attendance fetch failed', details: err.message },
      { status: 500 }
    );
  }

  let totalCCBEvents = 0;
  attendanceByEventId.forEach((rows) => { totalCCBEvents += rows.length; });
  console.log(`📦 Got ${totalCCBEvents} attendance records across ${attendanceByEventId.size} event IDs`);

  // ── Cross-reference and upsert ────────────────────────────────────
  const results = {
    synced: 0,
    errors: 0,
    noRecordFilled: 0,
    leadersProcessed: 0,
    leadersWithData: 0,
    rosterRefreshed: 0,
    rosterErrors: 0,
    ccbEventsTotal: totalCCBEvents,
    missingEventIds,
    mode,
    dateRange: { startDate, endDate },
  };

  // Build a reverse map: event ID → leader(s) that own it
  const eventToLeaders = new Map<string, LeaderRow[]>();
  for (const leader of activeLeaders) {
    if (!leader.ccb_event_ids) continue;
    for (const eid of leader.ccb_event_ids) {
      const arr = eventToLeaders.get(eid) || [];
      arr.push(leader);
      eventToLeaders.set(eid, arr);
    }
  }

  // Process each leader
  for (const leader of activeLeaders) {
    if (!leader.ccb_event_ids || leader.ccb_event_ids.length === 0) continue;
    results.leadersProcessed++;

    try {
      // Collect attendance rows for this leader's event IDs
      const groupRows: LinkRow[] = [];
      for (const eid of leader.ccb_event_ids) {
        const rows = attendanceByEventId.get(eid);
        if (rows) groupRows.push(...rows);
      }

      if (groupRows.length > 0) results.leadersWithData++;
      console.log(`  → ${leader.name}: ${leader.ccb_event_ids.length} event IDs → ${groupRows.length} attendance records`);

      // 1. Build occurrence rows
      const ccbRecords = buildOccurrenceRows(leader, groupRows);

      // 2. Build set of dates we got from CCB
      const ccbDates = new Set(ccbRecords.map((r) => r.meeting_date));

      // 3. Fill missing expected meeting dates with 'no_record'
      const expectedDates = getExpectedMeetingDates(leader, startDate, endDate);
      const today = toDateStr(new Date());
      const missingRecords: OccurrenceRow[] = expectedDates
        .filter((d) => !ccbDates.has(d) && d <= today)
        .map((d) => ({
          leader_id: leader.id,
          ccb_event_id: null,
          meeting_date: d,
          status: 'no_record' as const,
          headcount: null,
          regular_count: null,
          visitor_count: null,
          source: 'ccb' as const,
          raw_payload: null,
          attendees: [],
        }));

      results.noRecordFilled += missingRecords.length;
      const allRecords = [...ccbRecords, ...missingRecords];

      // 4. Upsert each occurrence
      for (const record of allRecords) {
        const { error: occError, data: occ } = await supabase
          .from('circle_meeting_occurrences')
          .upsert(
            {
              leader_id: record.leader_id,
              ccb_event_id: record.ccb_event_id,
              meeting_date: record.meeting_date,
              status: record.status,
              headcount: record.headcount,
              regular_count: record.regular_count,
              visitor_count: record.visitor_count,
              source: record.source,
              raw_payload: record.raw_payload,
              synced_at: new Date().toISOString(),
            },
            { onConflict: 'leader_id,meeting_date' }
          )
          .select('id')
          .single();

        if (occError) {
          console.error(
            `Upsert error for leader ${leader.id} on ${record.meeting_date}:`,
            occError
          );
          results.errors++;
          continue;
        }

        // 5. Upsert attendees (delete + re-insert)
        if (occ && record.attendees.length > 0) {
          await supabase
            .from('circle_meeting_attendees')
            .delete()
            .eq('occurrence_id', occ.id);

          const { error: attError } = await supabase
            .from('circle_meeting_attendees')
            .insert(
              record.attendees.map((a) => ({
                occurrence_id: occ.id,
                ccb_individual_id: a.ccb_individual_id,
                name: a.name,
                attendance_type: a.attendance_type,
              }))
            );

          if (attError) {
            console.error(`Attendee insert error for occurrence ${occ.id}:`, attError);
          }
        }

        results.synced++;
      }

      // 6. Refresh roster cache for this leader's group (additive only — never remove members)
      try {
        const participants = await ccbClient.getGroupParticipants(String(leader.ccb_group_id));
        if (participants.length > 0) {
          const now = new Date().toISOString();
          const { error: rosterError } = await supabase
            .from('circle_roster_cache')
            .upsert(
              participants.map((p) => ({
                circle_leader_id: leader.id,
                ccb_group_id: String(leader.ccb_group_id),
                ccb_individual_id: p.id,
                first_name: p.firstName,
                last_name: p.lastName,
                full_name: p.fullName,
                email: p.email,
                phone: p.phone,
                mobile_phone: p.mobilePhone,
                fetched_at: now,
              })),
              { onConflict: 'circle_leader_id,ccb_individual_id' }
            );

          if (rosterError) {
            console.error(`Roster cache error for ${leader.name}:`, rosterError);
            results.rosterErrors++;
          } else {
            console.log(`  ✅ Roster refreshed for ${leader.name}: ${participants.length} members`);
            results.rosterRefreshed++;
          }
        }
      } catch (rosterErr) {
        console.error(`Roster fetch failed for ${leader.name}:`, rosterErr);
        results.rosterErrors++;
      }
    } catch (err) {
      console.error(`Sync failed for leader ${leader.name} (${leader.id}):`, err);
      results.errors++;
    }
  }

  console.log(`📦 Sync complete:`, results);
  return NextResponse.json({ success: true, ...results });
}

// ════════════════════════════════════════════════════════════════════
// GET — summary / status check
// ════════════════════════════════════════════════════════════════════

export async function GET(request: NextRequest) {
  const supabase = getServiceClient();

  // Optional: get stats for a specific leader
  const url = new URL(request.url);
  const leaderId = url.searchParams.get('leaderId');

  const sixMonthsAgo = new Date();
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
  const sinceDate = sixMonthsAgo.toISOString().split('T')[0];

  let query = supabase
    .from('circle_meeting_occurrences')
    .select('status, meeting_date, synced_at')
    .gte('meeting_date', sinceDate)
    .order('meeting_date', { ascending: false });

  if (leaderId) {
    query = query.eq('leader_id', parseInt(leaderId, 10));
  }

  const { data: stats, error } = await query;

  if (error) {
    return NextResponse.json({ error: 'Failed to load stats', details: error }, { status: 500 });
  }

  const summary = {
    total: stats?.length || 0,
    met: stats?.filter((s) => s.status === 'met').length || 0,
    did_not_meet: stats?.filter((s) => s.status === 'did_not_meet').length || 0,
    no_record: stats?.filter((s) => s.status === 'no_record').length || 0,
    latestDate: stats?.[0]?.meeting_date || null,
    lastSyncedAt: stats?.[0]?.synced_at || null,
  };

  return NextResponse.json({ summary });
}
