import { NextRequest, NextResponse } from 'next/server';
import { getTodayDateString } from '../../../../lib/dateUtils';
import { createClient } from '@supabase/supabase-js';
import { createCCBClient, type LinkRow } from '../../../../lib/ccb/ccb-client';
import { getCCBRequestContext } from '../../../../lib/ccb/ccb-api-gateway';
import { getUserFromAuthHeader } from '../../../../lib/server-supabase';
import { syncRosterCacheForLeader } from '../../../../lib/ccb/roster-cache';
import { factsFromAttendanceRows, recordAttendanceFacts } from '../../../../lib/ccb/attendance-facts';

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
      // CCB splits a meeting's attendance across two fields: `attendees` are
      // the people named on the roster, and `head_count` is only the extras
      // nobody filed individually. The total is the sum — which is what
      // getEventAttendanceBatch and the /api/ccb/event-attendance write-through
      // both compute.
      //
      // This read used `??`, which takes head_count *instead of* the attendee
      // list whenever head_count is present. `??` does not fall through on 0,
      // and 0 is the normal head_count for a circle with no off-roster guests,
      // so the usual case — nine people checked off, no extras — was stored as
      // 0 and every one of those attendees was dropped. The row then rendered
      // blank (the list hides a non-positive count) and contributed nothing to
      // the week's total.
      //
      // This runs hourly over a 14-day window and upserts on
      // (leader_id, meeting_date), so it silently overwrote the correct counts
      // that Sync Now and the daily pass had already written. That is the
      // "attendance keeps drifting down" symptom.
      headcount: ((att.headCount ?? 0) + attendees.length) || null,
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
        prayerRequests: att.prayerRequests,
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

// Semester start date — the floor for every sync, narrowed or not
const SEMESTER_START = '2026-01-18';

// Clamp a `?lookbackDays=` value to a sane window. Anything missing or
// unparseable means "no narrowing" — the full semester range.
function parseLookbackDays(raw: string | null): number | null {
  if (!raw) return null;
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n) || n < 1 || n > 365) return null;
  return n;
}

// ════════════════════════════════════════════════════════════════════
// POST — trigger attendance sync
//
// Syncs from semester start (2026-01-18) to today. Single CCB API call.
//
// `?lookbackDays=N` narrows the range to the last N days, for the hourly
// scheduled run that only needs recent weeks. The narrowed range drives both
// the CCB fetch and the expected-meeting-date fill below, so a narrowed run
// leaves occurrences outside the window untouched.
//
// Requires event IDs in circle_leaders.ccb_event_ids — kept current by the
// nightly netlify/functions/discover-events.ts run (10:15 UTC, before this).
//
// CCB cost: 1 API call (attendance_profiles with date range)
// ════════════════════════════════════════════════════════════════════

export async function POST(request: NextRequest) {
  // Auth — fail closed. Called only by the Netlify scheduled function, which
  // sends `Bearer ${CRON_SECRET}`. If the secret is unconfigured we must reject,
  // not run the sync unauthenticated.
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return NextResponse.json({ error: 'Server not configured' }, { status: 500 });
  }
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = getServiceClient();
  const url = new URL(request.url);
  const singleLeaderId = url.searchParams.get('leaderId');

  // Sync from semester start to today unless the caller narrowed the window
  // (1 API call either way).
  const lookbackDays = parseLookbackDays(url.searchParams.get('lookbackDays'));
  const endDate = toDateStr(new Date());
  const lookbackStart = lookbackDays === null ? null : daysAgo(lookbackDays);
  const startDate =
    lookbackStart && lookbackStart > SEMESTER_START ? lookbackStart : SEMESTER_START;

  console.log(`📦 Attendance sync: range=${startDate} → ${endDate}`);

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
    ccbClient = createCCBClient(await getCCBRequestContext(request, {
      module: 'Admin',
      action: 'Sync Attendance',
      direction: 'pull',
    }));
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

  // ── Durable per-person attendance ─────────────────────────────────
  //
  // Store the whole payload before it is narrowed to leaders and their cached
  // event ids. That narrowing is where attendance used to be lost: an event
  // absent from ccb_event_ids became invisible, then a placeholder erased the
  // meeting it had recorded. These rows are keyed on CCB's own identifiers and
  // are never deleted for a date this run did not cover, so they survive both.
  //
  // Runs on the payload we already fetched — no extra CCB call. The daily
  // semester-wide pass therefore backfills the whole term on its first run.
  const { facts, occurrenceKeys } = factsFromAttendanceRows(attendanceByEventId);
  const factsResult = await recordAttendanceFacts(supabase, facts, occurrenceKeys);
  if (factsResult.error) {
    console.error(`📦 Attendance facts write failed: ${factsResult.error}`);
  } else {
    console.log(
      `📦 Attendance facts: ${factsResult.written} rows across ${factsResult.occurrences} occurrences`
    );
  }

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
      // Only stub days that are fully behind us in church time. `toDateStr` is UTC,
      // which rolls over at 7pm CT — on an hourly schedule that would record "CCB
      // had nothing" for tonight's circle before it has even met. Today is left
      // alone for the same reason; the next run picks it up once the day is done.
      const today = getTodayDateString();
      const missingRecords: OccurrenceRow[] = expectedDates
        .filter((d) => !ccbDates.has(d) && d < today)
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

      // A stub says "we looked and CCB had nothing", so it may only ever ADD a
      // placeholder — never overwrite a meeting we already recorded. It used to
      // go through the same upsert as a real record, which meant any date CCB
      // omitted this run (a stale entry in ccb_event_ids, a partial payload, a
      // record deleted in CCB) had its `met` row flattened to `no_record` with
      // a null headcount and a null raw_payload. Its `circle_meeting_attendees`
      // rows survived, orphaned under a status every reader filters out. This
      // runs hourly over 14 days and again daily over the whole semester, so a
      // single omission erased that meeting until someone re-synced by hand.
      //
      // ON CONFLICT DO NOTHING keeps the placeholder's real job — marking a
      // meeting date CCB has no record for — and makes it incapable of
      // destroying one that it does.
      if (missingRecords.length > 0) {
        const { data: stubRows, error: stubError } = await supabase
          .from('circle_meeting_occurrences')
          .upsert(
            missingRecords.map((record) => ({
              leader_id: record.leader_id,
              ccb_event_id: null,
              meeting_date: record.meeting_date,
              status: record.status,
              headcount: null,
              regular_count: null,
              visitor_count: null,
              source: record.source,
              raw_payload: null,
              synced_at: new Date().toISOString(),
            })),
            { onConflict: 'leader_id,meeting_date', ignoreDuplicates: true }
          )
          .select('id');

        if (stubError) {
          console.error(`Stub upsert error for leader ${leader.id}:`, stubError);
          results.errors++;
        } else {
          // With ignoreDuplicates the select returns only the rows actually
          // inserted, so this counts new placeholders rather than attempts.
          results.noRecordFilled += stubRows?.length ?? 0;
        }
      }

      // 4. Upsert each occurrence CCB actually reported
      for (const record of ccbRecords) {
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

      // 6. Refresh roster cache for this leader's group. Members absent from
      // the fresh CCB roster are deactivated (see roster-cache.ts).
      try {
        const participants = await ccbClient.getGroupParticipants(String(leader.ccb_group_id));
        const roster = await syncRosterCacheForLeader(supabase, leader.id, String(leader.ccb_group_id), participants);

        if (roster.error) {
          console.error(`Roster cache error for ${leader.name}:`, roster.error);
          results.rosterErrors++;
        } else if (roster.upserted > 0) {
          console.log(`  ✅ Roster refreshed for ${leader.name}: ${roster.upserted} members, ${roster.deactivated} departed`);
          results.rosterRefreshed++;
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
  // Requires a signed-in staff session (service-role read, RLS bypassed).
  const user = await getUserFromAuthHeader(request);
  if (!user) {
    return NextResponse.json({ error: 'Not signed in' }, { status: 401 });
  }

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
