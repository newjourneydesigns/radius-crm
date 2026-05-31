import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { DateTime } from 'luxon';
import { createCCBClient, CCBCircuitBreakerError } from '../../../../lib/ccb/ccb-client';
import { getCCBRequestContext } from '../../../../lib/ccb/ccb-api-gateway';
import type { EventSummaryState } from '../../../../lib/supabase';

export const dynamic = 'force-dynamic';

const LEADER_PEEK_THROTTLE_MS = 2 * 60_000;

function getServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

async function getAuthUserId(request: NextRequest): Promise<string | null> {
  const token = request.headers.get('authorization')?.replace('Bearer ', '');
  if (!token) return null;
  const anon = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false } }
  );
  const { data: { user } } = await anon.auth.getUser(token);
  return user?.id ?? null;
}

function weekEndOf(weekStart: string): string {
  return DateTime.fromISO(weekStart).plus({ days: 6 }).toISODate()!;
}

/**
 * The circle-summary form captures the leader's narrative as configurable
 * "dynamic questions" (e.g. "Tell us about your Circle gathering"), stored in
 * circle_event_summaries.dynamic_responses — NOT the base `notes` column, which
 * holds only the did-not-meet reason. The composed blob is pushed to CCB, but
 * RADIUS's read path historically returned only `notes`, so submitted summaries
 * with dynamic answers rendered as "No notes recorded". This rebuilds a display
 * string from the base notes + dynamic responses so the modal shows the full
 * write-up the same way CCB does.
 */
function composeSubmittedNotes(
  baseNotes: string | null | undefined,
  dynamicResponses: unknown
): string | null {
  const sections: string[] = [];

  const base = String(baseNotes ?? '').trim();
  if (base) sections.push(base);

  if (dynamicResponses && typeof dynamicResponses === 'object') {
    for (const entry of Object.values(dynamicResponses as Record<string, any>)) {
      const label = String(entry?.label ?? '').trim();
      const rawValue = entry?.value;
      const value = Array.isArray(rawValue)
        ? rawValue.map((v) => String(v).trim()).filter(Boolean).join(', ')
        : typeof rawValue === 'boolean'
          ? (rawValue ? 'Yes' : 'No')
          : String(rawValue ?? '').trim();
      if (!value) continue;
      sections.push(label ? `${label}: ${value}` : value);
    }
  }

  return sections.length ? sections.join('\n\n') : null;
}

type Resolved =
  | {
      status: 'submitted';
      source: 'app';
      submission_id: string;
      occurrence: string;
      did_not_meet: boolean;
      topic: string | null;
      notes: string | null;
      prayer_requests: string | null;
      info: string | null;
      headcount: number | null;
      submitted_at: string;
      reviewed_at: string | null;
      reviewed_by: string | null;
    }
  | {
      status: 'ccb_only';
      source: 'ccb';
      occurrence_id: string;
      meeting_date: string;
      met: boolean;
      headcount: number | null;
      has_notes: boolean;
      guest_count: number | null;
      topic: string | null;
      notes: string | null;
      prayer_requests: string | null;
      synced_at: string | null;
      reviewed_at: string | null;
      reviewed_by: string | null;
    }
  | { status: 'did_not_meet'; source: 'ccb'; meeting_date: string; reviewed_at: string | null; reviewed_by: string | null }
  | { status: 'not_submitted'; expected_meeting_date: string | null };

async function resolveLeaderWeek(
  supabase: ReturnType<typeof getServiceClient>,
  leaderId: number,
  weekStart: string,
  weekEnd: string
): Promise<Resolved> {
  // 1) App submission has highest priority.
  const { data: sub } = await supabase
    .from('circle_event_summaries')
    .select(
      'id, occurrence, did_not_meet, topic, notes, prayer_requests, info, dynamic_responses, did_not_meet_reason, ccb_submitted_at, created_at, reviewed_at, reviewed_by'
    )
    .eq('leader_id', leaderId)
    .gte('occurrence', `${weekStart}T00:00:00`)
    .lt('occurrence', `${DateTime.fromISO(weekEnd).plus({ days: 1 }).toISODate()}T00:00:00`)
    .eq('status', 'submitted')
    .order('occurrence', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (sub) {
    return {
      status: 'submitted',
      source: 'app',
      submission_id: sub.id,
      occurrence: sub.occurrence,
      did_not_meet: !!sub.did_not_meet,
      topic: sub.topic ?? null,
      // The leader's narrative lives in dynamic_responses, not the base notes
      // column. Compose the full displayable write-up so the modal shows it the
      // same way CCB does. For did-not-meet, prefix the reason.
      notes: composeSubmittedNotes(
        sub.did_not_meet
          ? [(sub as any).did_not_meet_reason, sub.notes].map((s) => String(s ?? '').trim()).filter(Boolean).join('\n\n') || null
          : sub.notes,
        (sub as any).dynamic_responses
      ),
      prayer_requests: sub.prayer_requests ?? null,
      info: sub.info ?? null,
      headcount: null,
      submitted_at: sub.ccb_submitted_at ?? sub.created_at,
      reviewed_at: sub.reviewed_at ?? null,
      reviewed_by: sub.reviewed_by ?? null,
    };
  }

  // 2) CCB-derived occurrence.
  const { data: occ } = await supabase
    .from('circle_meeting_occurrences')
    .select('id, meeting_date, status, headcount, has_notes, guest_count, topic, notes, prayer_requests, synced_at, reviewed_at, reviewed_by')
    .eq('leader_id', leaderId)
    .gte('meeting_date', weekStart)
    .lte('meeting_date', weekEnd)
    .order('meeting_date', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (occ) {
    if (occ.status === 'did_not_meet') {
      return {
        status: 'did_not_meet',
        source: 'ccb',
        meeting_date: occ.meeting_date,
        reviewed_at: occ.reviewed_at ?? null,
        reviewed_by: occ.reviewed_by ?? null,
      };
    }
    if (occ.status === 'met') {
      return {
        status: 'ccb_only',
        source: 'ccb',
        occurrence_id: occ.id,
        meeting_date: occ.meeting_date,
        met: true,
        headcount: occ.headcount ?? null,
        has_notes: !!occ.has_notes,
        guest_count: occ.guest_count ?? null,
        topic: (occ as any).topic ?? null,
        notes: (occ as any).notes ?? null,
        prayer_requests: (occ as any).prayer_requests ?? null,
        synced_at: occ.synced_at ?? null,
        reviewed_at: occ.reviewed_at ?? null,
        reviewed_by: occ.reviewed_by ?? null,
      };
    }
  }

  // 3) Nothing yet — compute expected meeting date from leader.day.
  const { data: leader } = await supabase
    .from('circle_leaders')
    .select('day')
    .eq('id', leaderId)
    .maybeSingle();

  const expected = leader?.day ? expectedMeetingDate(leader.day, weekStart) : null;
  return { status: 'not_submitted', expected_meeting_date: expected };
}

function expectedMeetingDate(dayName: string, weekStartISO: string): string | null {
  const days: Record<string, number> = {
    Sunday: 0, Monday: 1, Tuesday: 2, Wednesday: 3, Thursday: 4, Friday: 5, Saturday: 6,
  };
  const target = days[dayName];
  if (target === undefined) return null;
  // weekStart is the Sunday that starts the week.
  return DateTime.fromISO(weekStartISO).plus({ days: target }).toISODate();
}

/**
 * GET /api/circle-summary/leader-week-summary?leader_id=X&week_start=YYYY-MM-DD&peek=1
 *
 * DB-only read of a leader's event summary for a given week. Resolution order:
 *   1. circle_event_summaries row (app submission)
 *   2. circle_meeting_occurrences row (CCB-derived)
 *   3. "not_submitted" with expected_meeting_date
 *
 * If `peek=1` AND result is `not_submitted` AND last_peeked_at for this leader
 * is > 2 min ago, makes ONE attendance_profiles call to close the
 * "leader-submitted-in-CCB-not-yet-synced" gap. Throttled per-leader-per-week.
 */
export async function GET(request: NextRequest) {
  try {
    const url = new URL(request.url);
    const leaderIdParam = url.searchParams.get('leader_id');
    const weekStart = url.searchParams.get('week_start');
    const peek = url.searchParams.get('peek') === '1';
    const force = url.searchParams.get('force') === '1';

    if (!leaderIdParam || !weekStart || !/^\d{4}-\d{2}-\d{2}$/.test(weekStart)) {
      return NextResponse.json({ error: 'leader_id and week_start (YYYY-MM-DD) required' }, { status: 400 });
    }
    const leaderId = parseInt(leaderIdParam, 10);
    if (!Number.isFinite(leaderId)) {
      return NextResponse.json({ error: 'invalid leader_id' }, { status: 400 });
    }

    const supabase = getServiceClient();
    const weekEnd = weekEndOf(weekStart);
    let resolved = await resolveLeaderWeek(supabase, leaderId, weekStart, weekEnd);
    let peekResult: { attempted: boolean; throttled: boolean; circuit_open: boolean; found_evidence: boolean } | null = null;

    // Fetch roster size by counting cached members for this leader.
    let rosterSize: number | null = null;
    const { count: rosterCount } = await supabase
      .from('circle_roster_cache')
      .select('*', { count: 'exact', head: true })
      .eq('circle_leader_id', leaderId);
    if (typeof rosterCount === 'number' && rosterCount > 0) {
      rosterSize = rosterCount;
    }

    // Peek runs in two scenarios:
    //  (1) Auto-peek when we resolved to `not_submitted` — closes the gap if
    //      the leader submitted directly in CCB and sync hasn't caught up yet.
    //  (2) Explicit user-triggered refresh — fetches the latest CCB data so
    //      notes/topic/prayer text gets pulled in even if a stale occurrence
    //      row already exists (e.g. from before we stored note fields).
    const shouldPeek = peek && resolved.status !== 'submitted';

    if (shouldPeek) {
      peekResult = { attempted: false, throttled: false, circuit_open: false, found_evidence: false };

      const { data: peekLog } = await supabase
        .from('ccb_leader_peek_log')
        .select('last_peeked_at')
        .eq('leader_id', leaderId)
        .eq('week_start_date', weekStart)
        .maybeSingle();

      const fresh =
        peekLog?.last_peeked_at &&
        Date.now() - new Date(peekLog.last_peeked_at).getTime() < LEADER_PEEK_THROTTLE_MS;

      if (fresh && !force) {
        peekResult.throttled = true;
      } else {
        const { data: leader } = await supabase
          .from('circle_leaders')
          .select('id, name, circle_name, ccb_group_name, ccb_group_id, ccb_event_ids')
          .eq('id', leaderId)
          .maybeSingle();

        if (leader) {
          peekResult.attempted = true;
          await supabase
            .from('ccb_leader_peek_log')
            .upsert({ leader_id: leaderId, week_start_date: weekStart, last_peeked_at: new Date().toISOString() }, { onConflict: 'leader_id,week_start_date' });

          const ccb = createCCBClient(await getCCBRequestContext(request, {
            module: 'EventSummaryModal',
            action: 'Leader Peek',
            direction: 'pull',
          }));

          try {
            const map = await ccb.checkReportsForLeaders(
              [{
                id: leader.id,
                name: leader.name,
                ccb_group_name: leader.ccb_group_name || leader.circle_name || null,
                ccb_group_id: leader.ccb_group_id || null,
                ccb_event_ids: (leader as any).ccb_event_ids || null,
              }],
              weekStart,
              weekEnd
            );

            const ccbData = map.get(leaderId);
            if (ccbData?.hasReport) {
              peekResult.found_evidence = true;
              await supabase
                .from('circle_meeting_occurrences')
                .upsert({
                  leader_id: leaderId,
                  meeting_date: ccbData.occurrenceDate ?? weekStart,
                  status: ccbData.didNotMeet ? 'did_not_meet' : 'met',
                  headcount: ccbData.headcount,
                  has_notes: ccbData.hasNotes,
                  guest_count: ccbData.guestCount,
                  topic: ccbData.topic ?? null,
                  notes: ccbData.notes ?? null,
                  prayer_requests: ccbData.prayerRequests ?? null,
                  source: 'ccb',
                  synced_at: new Date().toISOString(),
                }, { onConflict: 'leader_id,meeting_date' });

              // Re-resolve from DB so the response reflects the new state.
              resolved = await resolveLeaderWeek(supabase, leaderId, weekStart, weekEnd);
            }
          } catch (e: any) {
            if (e instanceof CCBCircuitBreakerError) {
              peekResult.circuit_open = true;
            } else {
              console.error('[leader-week-summary peek]', e);
            }
          }
        }
      }
    }

    return NextResponse.json({ leader_id: leaderId, week_start_date: weekStart, week_end_date: weekEnd, ...resolved, roster_size: rosterSize, peek: peekResult });
  } catch (err: any) {
    console.error('[leader-week-summary GET]', err);
    return NextResponse.json({ error: err.message || 'Failed to load leader summary' }, { status: 500 });
  }
}

/**
 * POST /api/circle-summary/leader-week-summary
 *
 * Mutations on a leader's week-summary record. Action is dispatched on `action`:
 *   - "mark_reviewed":     stamp reviewed_at / reviewed_by on the underlying row
 *   - "unmark_reviewed":   clear reviewed_at / reviewed_by
 *   - "override_with_ccb": admin chose to apply CCB state over current; writes
 *                         circle_leaders.event_summary_state + audit row
 *   - "dismiss_conflict":  admin chose "keep current"; writes a row into
 *                         event_summary_conflict_dismissals so the conflict
 *                         doesn't keep re-surfacing
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action, leader_id, week_start_date } = body as {
      action: 'mark_reviewed' | 'unmark_reviewed' | 'override_with_ccb' | 'dismiss_conflict';
      leader_id: number;
      week_start_date: string;
    };

    if (
      !action ||
      typeof leader_id !== 'number' ||
      !week_start_date ||
      !/^\d{4}-\d{2}-\d{2}$/.test(week_start_date)
    ) {
      return NextResponse.json({ error: 'action, leader_id, week_start_date required' }, { status: 400 });
    }

    const supabase = getServiceClient();
    const userId = await getAuthUserId(request);
    const weekEnd = weekEndOf(week_start_date);

    if (action === 'mark_reviewed' || action === 'unmark_reviewed') {
      const reviewed_at = action === 'mark_reviewed' ? new Date().toISOString() : null;
      const reviewed_by = action === 'mark_reviewed' ? userId : null;

      let resolved = await resolveLeaderWeek(supabase, leader_id, week_start_date, weekEnd);

      // The modal pulls live CCB data via /api/ccb/event-attendance, so a
      // submission may exist in CCB even if we don't have a row in
      // circle_meeting_occurrences yet (sync matcher couldn't pair it). When
      // the admin marks reviewed, the modal passes the live CCB event data so
      // we can backfill the occurrence row here and then mark it reviewed.
      const ccbEvent = (body as any).ccb_event as
        | {
            meeting_date: string; // YYYY-MM-DD
            topic?: string | null;
            notes?: string | null;
            prayer_requests?: string | null;
            headcount?: number | null;
            did_not_meet?: boolean;
            has_notes?: boolean;
            guest_count?: number | null;
          }
        | undefined;

      if (action === 'mark_reviewed' && resolved.status === 'not_submitted' && ccbEvent && /^\d{4}-\d{2}-\d{2}$/.test(ccbEvent.meeting_date)) {
        // Build the upsert payload. If the optional note-text columns haven't been
        // added to the schema yet, we'd get a PostgREST 400; retry without them.
        const fullRow = {
          leader_id,
          meeting_date: ccbEvent.meeting_date,
          status: ccbEvent.did_not_meet ? 'did_not_meet' : 'met',
          headcount: ccbEvent.headcount ?? null,
          has_notes: ccbEvent.has_notes ?? !!(ccbEvent.topic || ccbEvent.notes || ccbEvent.prayer_requests),
          guest_count: ccbEvent.guest_count ?? 0,
          topic: ccbEvent.topic ?? null,
          notes: ccbEvent.notes ?? null,
          prayer_requests: ccbEvent.prayer_requests ?? null,
          source: 'ccb',
          synced_at: new Date().toISOString(),
        };

        const upsertRes = await supabase
          .from('circle_meeting_occurrences')
          .upsert(fullRow, { onConflict: 'leader_id,meeting_date' });

        if (upsertRes.error) {
          console.error('[leader-week-summary] backfill upsert failed (full row):', upsertRes.error);
          // Retry without the columns that might not exist yet.
          const { topic, notes, prayer_requests, ...minimalRow } = fullRow as any;
          const retryRes = await supabase
            .from('circle_meeting_occurrences')
            .upsert(minimalRow, { onConflict: 'leader_id,meeting_date' });
          if (retryRes.error) {
            console.error('[leader-week-summary] backfill upsert failed (minimal row):', retryRes.error);
            return NextResponse.json({
              error: `Failed to record CCB event: ${retryRes.error.message}`,
              hint: retryRes.error.hint ?? null,
              details: retryRes.error.details ?? null,
            }, { status: 500 });
          }
        }

        // Re-resolve so the rest of the flow sees the new row.
        resolved = await resolveLeaderWeek(supabase, leader_id, week_start_date, weekEnd);
      }

      // Derive the implied state from what we resolved. When the admin marks a
      // summary reviewed, they are confirming what's in front of them — so we
      // also flip the leader's state to match. (Unmark leaves state alone.)
      let derivedState: EventSummaryState | null = null;
      if (resolved.status === 'submitted') {
        derivedState = resolved.did_not_meet ? 'did_not_meet' : 'received';
        await supabase
          .from('circle_event_summaries')
          .update({ reviewed_at, reviewed_by })
          .eq('id', resolved.submission_id);
      } else if (resolved.status === 'ccb_only') {
        derivedState = 'received';
        await supabase
          .from('circle_meeting_occurrences')
          .update({ reviewed_at, reviewed_by })
          .eq('id', resolved.occurrence_id);
      } else if (resolved.status === 'did_not_meet') {
        derivedState = 'did_not_meet';
        await supabase
          .from('circle_meeting_occurrences')
          .update({ reviewed_at, reviewed_by })
          .eq('leader_id', leader_id)
          .eq('meeting_date', resolved.meeting_date);
      } else {
        return NextResponse.json({ error: 'No summary to mark reviewed' }, { status: 400 });
      }

      // Flip the leader's state to match the reviewed summary, in the right
      // place (live row vs snapshot) based on whether this is the current week.
      if (action === 'mark_reviewed' && derivedState) {
        const nowCT = DateTime.now().setZone('America/Chicago');
        const dow = nowCT.weekday % 7;
        const currentSundayISO = nowCT.minus({ days: dow }).toISODate();
        const isCurrent = currentSundayISO === week_start_date;

        let fromState: EventSummaryState = 'not_received';
        if (isCurrent) {
          const { data: leaderRow } = await supabase
            .from('circle_leaders')
            .select('event_summary_state, event_summary_state_week')
            .eq('id', leader_id)
            .maybeSingle();

          fromState = leaderRow?.event_summary_state_week === week_start_date
            ? ((leaderRow?.event_summary_state ?? 'not_received') as EventSummaryState)
            : 'not_received';

          await supabase
            .from('circle_leaders')
            .update({ event_summary_state: derivedState, event_summary_state_week: week_start_date })
            .eq('id', leader_id);
        } else {
          const { data: snap } = await supabase
            .from('event_summary_snapshots')
            .select('event_summary_state')
            .eq('circle_leader_id', leader_id)
            .eq('week_start_date', week_start_date)
            .maybeSingle();

          fromState = (snap?.event_summary_state ?? 'not_received') as EventSummaryState;

          await supabase
            .from('event_summary_snapshots')
            .upsert({
              week_start_date,
              week_end_date: weekEnd,
              circle_leader_id: leader_id,
              event_summary_state: derivedState,
              ccb_report_available: resolved.status !== 'submitted',
              captured_at: new Date().toISOString(),
            }, { onConflict: 'week_start_date,circle_leader_id' });
        }

        if (fromState !== derivedState) {
          await supabase.from('event_summary_state_audit').insert({
            leader_id,
            week_start_date,
            from_state: fromState,
            to_state: derivedState,
            source: 'conflict_override',
            changed_by: userId,
            metadata: { trigger: 'mark_reviewed', is_current_week: isCurrent },
          });
        }
      }

      return NextResponse.json({ ok: true, reviewed_at, new_state: action === 'mark_reviewed' ? derivedState : null });
    }

    if (action === 'override_with_ccb') {
      const { ccb_state, is_current_week } = body as { ccb_state: EventSummaryState; is_current_week?: boolean };
      if (!ccb_state) return NextResponse.json({ error: 'ccb_state required' }, { status: 400 });

      // Auto-detect current vs past week if caller didn't say. Current week =
      // the week_start matches the most recent Sunday in America/Chicago.
      const isCurrent = typeof is_current_week === 'boolean'
        ? is_current_week
        : (() => {
            const nowCT = DateTime.now().setZone('America/Chicago');
            const dow = nowCT.weekday % 7; // luxon: 1=Mon..7=Sun → 0=Sun..6=Sat
            const sundayISO = nowCT.minus({ days: dow }).toISODate();
            return sundayISO === week_start_date;
          })();

      let fromState: EventSummaryState = 'not_received';

      if (isCurrent) {
        const { data: leaderRow } = await supabase
          .from('circle_leaders')
          .select('event_summary_state, event_summary_state_week')
          .eq('id', leader_id)
          .maybeSingle();

        fromState = leaderRow?.event_summary_state_week === week_start_date
          ? ((leaderRow?.event_summary_state ?? 'not_received') as EventSummaryState)
          : 'not_received';

        await supabase
          .from('circle_leaders')
          .update({ event_summary_state: ccb_state, event_summary_state_week: week_start_date })
          .eq('id', leader_id);
      } else {
        const { data: snap } = await supabase
          .from('event_summary_snapshots')
          .select('event_summary_state')
          .eq('circle_leader_id', leader_id)
          .eq('week_start_date', week_start_date)
          .maybeSingle();

        fromState = (snap?.event_summary_state ?? 'not_received') as EventSummaryState;

        await supabase
          .from('event_summary_snapshots')
          .upsert({
            week_start_date,
            week_end_date: weekEnd,
            circle_leader_id: leader_id,
            event_summary_state: ccb_state,
            ccb_report_available: true,
            captured_at: new Date().toISOString(),
          }, { onConflict: 'week_start_date,circle_leader_id' });
      }

      await supabase.from('event_summary_state_audit').insert({
        leader_id,
        week_start_date,
        from_state: fromState,
        to_state: ccb_state,
        source: 'conflict_override',
        changed_by: userId,
        metadata: { is_current_week: isCurrent },
      });

      // Clear any prior dismissal — admin explicitly resolved the conflict.
      await supabase
        .from('event_summary_conflict_dismissals')
        .delete()
        .eq('leader_id', leader_id)
        .eq('week_start_date', week_start_date);

      return NextResponse.json({ ok: true, new_state: ccb_state });
    }

    if (action === 'dismiss_conflict') {
      const { ccb_state, current_state } = body as {
        ccb_state: EventSummaryState;
        current_state: EventSummaryState;
      };
      if (!ccb_state || !current_state) {
        return NextResponse.json({ error: 'ccb_state and current_state required' }, { status: 400 });
      }

      await supabase
        .from('event_summary_conflict_dismissals')
        .upsert({
          leader_id,
          week_start_date,
          dismissed_at: new Date().toISOString(),
          dismissed_by: userId,
          ccb_state_at_dismissal: ccb_state,
          current_state_at_dismissal: current_state,
        }, { onConflict: 'leader_id,week_start_date' });

      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  } catch (err: any) {
    console.error('[leader-week-summary POST]', err);
    return NextResponse.json({ error: err.message || 'Failed' }, { status: 500 });
  }
}
