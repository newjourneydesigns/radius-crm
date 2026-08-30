/**
 * AI Circle Summary — per-circle coaching snapshot for ACPDs.
 *
 * GET  ?leaderId=<n>&timeframe=<key>  — deterministic metrics + any saved AI
 *      summary for that leader/timeframe. No AI call.
 * POST { leaderId, timeframe }        — generates the AI narrative from the
 *      metrics + the circle's meeting-notes corpus, saves it (latest wins,
 *      shared across ACPDs), and returns the saved row.
 *
 * ACPD-only on both verbs. All reads are Supabase (data synced from CCB by the
 * existing cron/sync routes) — no live CCB calls.
 */
import { NextRequest, NextResponse } from 'next/server';
import { DateTime } from 'luxon';
import { createServiceSupabaseClient, getUserFromAuthHeader } from '../../../lib/server-supabase';
import {
  TIMEFRAME_KEYS,
  buildNotesCorpus,
  computeMetrics,
  extractSubmittedAttendance,
  resolveTimeframe,
  type AppSummaryRow,
  type AttendeeRow,
  type CircleMetrics,
  type OccurrenceRow,
  type RosterRow,
  type Timeframe,
  type TimeframeKey,
} from '../../../lib/circleAiSummary';

export const dynamic = 'force-dynamic';

const ZONE = 'America/Chicago';

type Profile = { id: string; email: string | null; name: string | null; role: string | null };

async function requireAcpd(req: NextRequest): Promise<{ profile: Profile; response: null } | { profile: null; response: NextResponse }> {
  const user = await getUserFromAuthHeader(req);
  if (!user) {
    return { profile: null, response: NextResponse.json({ error: 'Invalid or expired token' }, { status: 401 }) };
  }
  const supabase = createServiceSupabaseClient({ noStore: true });
  const { data: profile, error } = await supabase
    .from('users')
    .select('id, email, name, role')
    .eq('id', user.id)
    .maybeSingle();
  if (error || !profile) {
    return { profile: null, response: NextResponse.json({ error: 'Unable to verify user profile' }, { status: 403 }) };
  }
  if (profile.role !== 'ACPD') {
    return { profile: null, response: NextResponse.json({ error: 'ACPD access required' }, { status: 403 }) };
  }
  return { profile: profile as Profile, response: null };
}

function parseParams(leaderIdRaw: string | null, timeframeRaw: string | null):
  | { leaderId: number; timeframe: Timeframe; response: null }
  | { leaderId: null; timeframe: null; response: NextResponse } {
  const leaderId = Number(leaderIdRaw);
  if (!leaderIdRaw || !Number.isFinite(leaderId) || leaderId <= 0) {
    return { leaderId: null, timeframe: null, response: NextResponse.json({ error: 'leaderId is required' }, { status: 400 }) };
  }
  if (!timeframeRaw || !TIMEFRAME_KEYS.includes(timeframeRaw as TimeframeKey)) {
    return { leaderId: null, timeframe: null, response: NextResponse.json({ error: `timeframe must be one of: ${TIMEFRAME_KEYS.join(', ')}` }, { status: 400 }) };
  }
  return { leaderId, timeframe: resolveTimeframe(timeframeRaw as TimeframeKey), response: null };
}

async function chunkedIn<T>(
  query: (chunk: string[]) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
  ids: string[],
  chunkSize = 200
): Promise<T[]> {
  const out: T[] = [];
  for (let i = 0; i < ids.length; i += chunkSize) {
    const { data, error } = await query(ids.slice(i, i + chunkSize));
    if (error) throw new Error(error.message);
    out.push(...(data ?? []));
  }
  return out;
}

async function loadMetrics(
  supabase: ReturnType<typeof createServiceSupabaseClient>,
  leaderId: number,
  timeframe: Timeframe
): Promise<{ metrics: CircleMetrics; occurrences: OccurrenceRow[]; appSummaries: AppSummaryRow[] }> {
  // Leader-submitted summaries: occurrence is a timestamptz stored from a
  // Central-time parse, so read with a half-open CT→UTC window.
  const windowStartUtc = DateTime.fromISO(timeframe.startDate, { zone: ZONE }).startOf('day').toUTC().toISO()!;
  const windowEndExclusiveUtc = DateTime.fromISO(timeframe.endDate, { zone: ZONE }).plus({ days: 1 }).startOf('day').toUTC().toISO()!;

  const [occRes, priorRes, rosterRes, subRes, priorSubRes] = await Promise.all([
    supabase
      .from('circle_meeting_occurrences')
      .select('id, meeting_date, status, headcount, regular_count, visitor_count, topic, notes, prayer_requests')
      .eq('leader_id', leaderId)
      .gte('meeting_date', timeframe.startDate)
      .lte('meeting_date', timeframe.endDate)
      .order('meeting_date', { ascending: true }),
    supabase
      .from('circle_meeting_occurrences')
      .select('id, meeting_date')
      .eq('leader_id', leaderId)
      .lt('meeting_date', timeframe.startDate)
      .order('meeting_date', { ascending: true }),
    supabase
      .from('circle_roster_cache')
      .select('ccb_individual_id, full_name, added_at')
      .eq('circle_leader_id', leaderId)
      .eq('is_active', true),
    supabase
      .from('circle_event_summaries')
      .select('occurrence, did_not_meet, did_not_meet_reason, topic, notes, prayer_requests, dynamic_responses, manual_attendees, attendee_ccb_ids')
      .eq('leader_id', leaderId)
      .gte('occurrence', windowStartUtc)
      .lt('occurrence', windowEndExclusiveUtc)
      .order('occurrence', { ascending: true }),
    // Prior submissions only need to answer "has this person been here before?",
    // so that someone the CCB sync never brought back isn't called a new face.
    supabase
      .from('circle_event_summaries')
      .select('occurrence, did_not_meet, attendee_ccb_ids')
      .eq('leader_id', leaderId)
      .lt('occurrence', windowStartUtc),
  ]);
  if (occRes.error) throw new Error(occRes.error.message);
  if (priorRes.error) throw new Error(priorRes.error.message);
  if (rosterRes.error) throw new Error(rosterRes.error.message);
  if (subRes.error) throw new Error(subRes.error.message);
  if (priorSubRes.error) throw new Error(priorSubRes.error.message);

  const occurrences = (occRes.data ?? []) as OccurrenceRow[];
  const priorOccurrences = (priorRes.data ?? []) as Array<{ id: string; meeting_date: string }>;
  const appSummaries = (subRes.data ?? []) as AppSummaryRow[];

  const attendeeSelect = (chunk: string[]) =>
    supabase
      .from('circle_meeting_attendees')
      .select('occurrence_id, ccb_individual_id, name, attendance_type')
      .in('occurrence_id', chunk);

  const [attendees, priorAttendees] = await Promise.all([
    chunkedIn<AttendeeRow>(attendeeSelect, occurrences.map((o) => o.id)),
    chunkedIn<AttendeeRow>(attendeeSelect, priorOccurrences.map((o) => o.id)),
  ]);

  const normalizeId = (row: AttendeeRow) => ({ ...row, ccb_individual_id: String(row.ccb_individual_id) });
  const priorAttendeeIds = new Set(priorAttendees.map((a) => String(a.ccb_individual_id)));
  for (const prior of extractSubmittedAttendance((priorSubRes.data ?? []) as AppSummaryRow[])) {
    for (const id of prior.attendeeCcbIds) priorAttendeeIds.add(id);
  }

  const rosterRows = ((rosterRes.data ?? []) as Array<{ ccb_individual_id: unknown; full_name: string | null; added_at: string | null }>)
    .map((r): RosterRow => ({ ccb_individual_id: String(r.ccb_individual_id), full_name: r.full_name, added_at: r.added_at }));

  const firstRecordedMeeting = priorOccurrences[0]?.meeting_date ?? occurrences[0]?.meeting_date ?? null;

  const metrics = computeMetrics({
    timeframe,
    occurrences,
    attendees: attendees.map(normalizeId),
    priorAttendeeIds,
    rosterRows,
    firstRecordedMeeting,
    submitted: extractSubmittedAttendance(appSummaries),
  });

  return { metrics, occurrences, appSummaries };
}

async function loadSavedSummary(
  supabase: ReturnType<typeof createServiceSupabaseClient>,
  leaderId: number,
  timeframeKey: TimeframeKey
) {
  const { data, error } = await supabase
    .from('circle_ai_summaries')
    .select('id, leader_id, timeframe_key, start_date, end_date, summary_text, generated_by, generated_at')
    .eq('leader_id', leaderId)
    .eq('timeframe_key', timeframeKey)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data ?? null;
}

// --- GET: metrics snapshot + saved summary (no AI) ---

export async function GET(request: NextRequest) {
  const auth = await requireAcpd(request);
  if (auth.response) return auth.response;

  const params = parseParams(
    request.nextUrl.searchParams.get('leaderId'),
    request.nextUrl.searchParams.get('timeframe')
  );
  if (params.response) return params.response;
  const { leaderId, timeframe } = params;

  try {
    const supabase = createServiceSupabaseClient({ noStore: true });
    const [{ metrics }, savedSummary] = await Promise.all([
      loadMetrics(supabase, leaderId, timeframe),
      loadSavedSummary(supabase, leaderId, timeframe.key),
    ]);
    return NextResponse.json({ timeframe, metrics, savedSummary });
  } catch (err: unknown) {
    console.error('circle-ai-summary GET error:', err);
    const message = err instanceof Error ? err.message : 'Internal server error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// --- Gemini (mirrors /api/weekly-ai-summary) ---

async function callGemini(apiKey: string, systemPrompt: string, text: string): Promise<{ summary?: string; error?: string; status: number; rateLimited?: boolean }> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: `${systemPrompt}\n\n---\n\n${text}` }] }],
          generationConfig: { temperature: 0.4, maxOutputTokens: 8192, topP: 0.85, thinkingConfig: { thinkingBudget: 0 } },
          safetySettings: [
            { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_NONE' },
            { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_NONE' },
            { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_NONE' },
            { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_NONE' },
          ],
        }),
      }
    );

    if (!response.ok) {
      if (response.status === 503 && attempt < 2) {
        await new Promise(r => setTimeout(r, 1000 * (attempt + 1)));
        continue;
      }
      if (response.status === 429) return { status: 429, rateLimited: true };
      const err = await response.json().catch(() => ({}));
      return { error: err?.error?.message || `Gemini error: ${response.status}`, status: response.status };
    }

    const data = await response.json();
    const summary = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!summary) return { error: 'Gemini returned an empty response.', status: 502 };
    return { summary: summary.trim(), status: 200 };
  }
  return { error: 'Gemini is experiencing high demand. Please try again in a moment.', status: 503 };
}

const SYSTEM_PROMPT = `You are preparing a coaching snapshot for an ACPD coach about one Circle (a small group) over a specific timeframe. This is for the coach's eyes only — it will never be sent to the Circle Leader. The coach will use it to prepare for a coaching conversation with the leader.

You are given three inputs:
1. METRICS — computed numbers about the timeframe. Treat these as ground truth.
2. PER-PERSON ATTENDANCE — who attended and how often, including who is new.
3. MEETING NOTES — the leader's own meeting write-ups, topics, and prayer requests in chronological order.

Return your snapshot in this structure:

1. Snapshot Read
2 to 3 sentences giving the honest headline of this timeframe, anchored to the exact metrics provided (e.g. "gone from averaging 4 to 7"). Lead with what the numbers actually say.

2. People
- New faces: name them with when they first showed up.
- The consistent core: who has been there most or all of the timeframe.
- Anyone whose attendance faded in the second half of the window, if the data shows it.

3. Themes in the Notes
The spiritual and relational threads running across the topics, notes, and prayer requests. What is this circle actually walking through?

4. Celebrate
Specific, evidence-backed wins the coach can name in the conversation. Cite what the win is grounded in.

5. Watch For
Honest concerns: attendance declines, stretches with no records or no notes, prayer-request patterns, signs of drift. If the data is thin, say that plainly — a gap in reporting is itself worth naming.

6. Suggested Coaching Questions
3 to 5 questions the coach could ask this leader, drawn from the specifics above — not generic questions.

Important instructions:
- Use only the numbers provided, verbatim. Never invent, round differently, soften, or inflate a metric.
- If a section has no supporting data, say so in one sentence rather than padding.
- Distinguish clearly between what the data shows and what it might mean. Use "seems," "appears," or "suggests" for interpretation.
- Use warm, pastoral language, not corporate analytics language.
- Be concise but perceptive. The coach should be able to read this in two minutes.
- Names matter: refer to people by the names given in the data.`;

function formatMetricsBlock(timeframe: Timeframe, metrics: CircleMetrics, leaderName: string): string {
  const fmt = (iso: string) => DateTime.fromISO(iso, { zone: ZONE }).toFormat('MMM d, yyyy');
  const lines: string[] = [
    `Circle: ${leaderName}`,
    `Timeframe: ${timeframe.label} (${fmt(timeframe.startDate)} – ${fmt(timeframe.endDate)})`,
    '',
    '=== METRICS (computed, treat as ground truth) ===',
    `Current active roster: ${metrics.rosterCount}`,
    `Meetings in window: ${metrics.meetings.total} total — ${metrics.meetings.met} met, ${metrics.meetings.didNotMeet} did not meet, ${metrics.meetings.noRecord} no record`,
    `Average attendance (met meetings): ${metrics.attendance.average ?? 'no headcounts recorded'}`,
  ];
  if (metrics.attendance.trendLabel) {
    lines.push(`Attendance trend (first half vs second half of window): ${metrics.attendance.trendLabel}`);
  }
  if (metrics.rosterShowRate != null) {
    lines.push(`Roster show rate: on average ${metrics.rosterShowRate}% of the current roster attends a given meeting`);
  }
  if (metrics.membersAdded.count > 0) {
    lines.push(`Members added to roster in window${metrics.membersAdded.reliable ? '' : ' (approximate — some join dates unknown)'}: ${metrics.membersAdded.count} (${metrics.membersAdded.names.join(', ')})`);
  } else {
    lines.push('Members added to roster in window: 0 recorded');
  }
  if (metrics.firstRecordedMeeting && metrics.firstRecordedMeeting > timeframe.startDate) {
    lines.push(`Note: attendance records for this circle only begin ${fmt(metrics.firstRecordedMeeting)}, so "new faces" is relative to recorded history, not all time.`);
  }

  lines.push('', '=== PER-PERSON ATTENDANCE ===');
  if (metrics.newFaces.length > 0) {
    lines.push('New faces (first recorded attendance falls inside this window):');
    for (const f of metrics.newFaces) {
      lines.push(`- ${f.name}: first attended ${fmt(f.firstDate)}, attended ${f.timesAttended} time${f.timesAttended === 1 ? '' : 's'}`);
    }
  } else {
    lines.push('New faces: none recorded in this window.');
  }
  if (metrics.consistency.length > 0) {
    lines.push('', `Attendance by person (of ${metrics.meetings.met} met meetings):`);
    for (const c of metrics.consistency) {
      lines.push(`- ${c.name}: ${c.attended} of ${c.ofMeetings}`);
    }
  }
  return lines.join('\n');
}

// --- POST: generate + save ---

export async function POST(request: NextRequest) {
  const auth = await requireAcpd(request);
  if (auth.response) return auth.response;

  const geminiKey = process.env.GEMINI_API_KEY;
  if (!geminiKey) {
    return NextResponse.json({ error: 'AI summarization is not configured.' }, { status: 500 });
  }

  try {
    const body = await request.json().catch(() => ({}));
    const params = parseParams(String(body?.leaderId ?? ''), String(body?.timeframe ?? ''));
    if (params.response) return params.response;
    const { leaderId, timeframe } = params;

    const supabase = createServiceSupabaseClient({ noStore: true });

    const { data: leader, error: leaderError } = await supabase
      .from('circle_leaders')
      .select('id, name, circle_name, ccb_group_name')
      .eq('id', leaderId)
      .maybeSingle();
    if (leaderError) throw new Error(leaderError.message);
    if (!leader) return NextResponse.json({ error: 'Circle Leader not found' }, { status: 404 });
    const leaderName = leader.ccb_group_name || leader.circle_name || leader.name || `Leader ${leaderId}`;

    // Metrics are always recomputed server-side — the client is never trusted.
    const { metrics, occurrences, appSummaries } = await loadMetrics(supabase, leaderId, timeframe);

    if (metrics.meetings.total === 0) {
      return NextResponse.json({ error: 'No meeting records in this timeframe — nothing to summarize.' }, { status: 422 });
    }

    const corpus = buildNotesCorpus(occurrences, appSummaries);
    const promptText = [
      formatMetricsBlock(timeframe, metrics, leaderName),
      '',
      '=== MEETING NOTES (chronological) ===',
      corpus || '(No meeting notes were recorded in this window.)',
    ].join('\n');

    const result = await callGemini(geminiKey, SYSTEM_PROMPT, promptText);
    if (!result.summary) {
      if (result.rateLimited) {
        return NextResponse.json({ error: 'AI rate limit reached. Try again in a minute.', rateLimited: true }, { status: 429 });
      }
      return NextResponse.json({ error: result.error || 'Gemini AI error', provider: 'gemini' }, { status: result.status || 500 });
    }

    const { data: saved, error: saveError } = await supabase
      .from('circle_ai_summaries')
      .upsert(
        {
          leader_id: leaderId,
          timeframe_key: timeframe.key,
          start_date: timeframe.startDate,
          end_date: timeframe.endDate,
          summary_text: result.summary,
          metrics_snapshot: metrics,
          generated_by: auth.profile!.id,
          generated_at: new Date().toISOString(),
        },
        { onConflict: 'leader_id,timeframe_key' }
      )
      .select('id, leader_id, timeframe_key, start_date, end_date, summary_text, generated_by, generated_at')
      .single();
    if (saveError) throw new Error(saveError.message);

    return NextResponse.json({ savedSummary: saved });
  } catch (err: unknown) {
    console.error('circle-ai-summary POST error:', err);
    const message = err instanceof Error ? err.message : 'Internal server error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
