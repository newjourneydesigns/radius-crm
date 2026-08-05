import { NextRequest, NextResponse } from 'next/server';
import { createCCBClient } from '../../../../lib/ccb/ccb-client';
import {
  getCCBRequestContext,
  reserveCCBDailyBudget,
  CCBDailyBudgetError,
} from '../../../../lib/ccb/ccb-api-gateway';
import { getUserFromAuthHeader } from '../../../../lib/server-supabase';

/**
 * Check Digital Lab completers in as CCB event attendance, for Valley Creek Pulse.
 *
 * Pulse holds no CCB credentials — every CCB call it makes proxies through
 * RADIUS so the church's shared daily budget keeps exactly one consumer. The
 * existing `/api/ccb/group-roster` covers the read side (pull a lab's invite
 * list from a group); this is the matching write: someone finishes the video in
 * Pulse, and staff push the finished list here as attendance against one event
 * occurrence.
 *
 * Deliberately narrow. It takes an event, an occurrence, a list of CCB
 * individual IDs and a head count, and does exactly one thing with them. It is
 * NOT a generic CCB passthrough, and it shouldn't grow into one — a
 * parameterised `srv` proxy is how a shared API budget and a shared write
 * surface both get away from you.
 *
 * The head count is CCB's "additional people not on this list" — people who
 * attended but can't be named. It ADDS to the attendee list rather than
 * describing it, so it must only ever carry people who aren't already in
 * `attendeeIds`. Pulse uses it for completers with no CCB record (Plus Ones
 * added by paste, who are never on a group roster): real attendance the API
 * has no ID to file under.
 *
 * `create_event_attendance` is only half-idempotent, and a push here is
 * deliberately re-run as stragglers finish, so the difference matters:
 *
 *   - Named attendees carry an individual ID, so CCB dedupes them. Re-pushing
 *     the same people records them once, which is what attendance means.
 *   - `head_count` carries no ID, so CCB ADDS it to whatever the occurrence
 *     already holds. Confirmed against CCB event 17726 on 2026-08-05: a repeat
 *     push moved head_count from 8 to 11, exactly the 3 attendees re-sent.
 *
 * So the head count is sent as a delta against what CCB currently holds, and a
 * re-push sends 0. Note that 0 *adds* nothing rather than clearing anything —
 * an occurrence already inflated by an earlier version of this endpoint can
 * only be corrected by hand in CCB, and is reported back rather than hidden.
 */

/** Someone signed in, AND a caller that knows the shared secret. */
async function authorize(request: NextRequest): Promise<string | null> {
  const user = await getUserFromAuthHeader(request);
  if (!user) return 'Not signed in';

  // `getUserFromAuthHeader` proves *a* Valley Creek account, which is a fine bar
  // for reading a group roster and much too low for writing into the church's
  // attendance records. Pulse enforces its own admin check before calling; this
  // stops anyone else calling the endpoint directly with a borrowed token.
  const expected = process.env.PULSE_SHARED_SECRET;
  if (!expected) return 'Not configured';
  const presented = request.headers.get('x-pulse-secret');
  if (!presented || presented !== expected) return 'Forbidden';

  return null;
}

export async function POST(request: NextRequest) {
  try {
    const denied = await authorize(request);
    if (denied) {
      const status =
        denied === 'Not signed in' ? 401 : denied === 'Not configured' ? 503 : 403;
      return NextResponse.json({ error: denied }, { status });
    }

    const body = await request.json();
    const { eventId, occurrence, attendeeIds, headCount, topic, notes } = body as {
      eventId?: unknown;
      occurrence?: unknown;
      attendeeIds?: unknown;
      headCount?: unknown;
      topic?: unknown;
      notes?: unknown;
    };

    if (!eventId || typeof occurrence !== 'string' || !occurrence.trim()) {
      return NextResponse.json(
        {
          error: 'Missing eventId or occurrence',
          details: 'Both a CCB event ID and an occurrence timestamp are required',
        },
        { status: 400 }
      );
    }

    // CCB identifies the occurrence by this exact string, in the church's own
    // timezone. A malformed one silently files against nothing.
    if (!/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(occurrence.trim())) {
      return NextResponse.json(
        {
          error: 'Invalid occurrence',
          details: 'Expected "YYYY-MM-DD HH:MM:SS"',
        },
        { status: 400 }
      );
    }

    const ids = Array.isArray(attendeeIds)
      ? Array.from(
          new Set(
            attendeeIds
              .map((id) => String(id).trim())
              .filter((id) => id && id !== 'null' && id !== 'undefined')
          )
        )
      : [];

    if (ids.length === 0) {
      return NextResponse.json(
        {
          error: 'No attendees',
          details:
            'Refusing to write an empty attendee list — that would clear the occurrence',
        },
        { status: 400 }
      );
    }

    // A whole number of extra bodies, or nothing. Anything unparseable becomes
    // 0 rather than an error: a bad head count must never block attendance that
    // is otherwise fine, and 0 is the honest answer when we don't know.
    const extraHeadCount =
      typeof headCount === 'number' && Number.isFinite(headCount) && headCount > 0
        ? Math.floor(headCount)
        : 0;

    // Writes go through `postXml`, which does not reserve budget the way the
    // read client does. Reserved here rather than inside the shared client so
    // the live Circle Leader toolkit submit path keeps its current behaviour.
    // The head-count read below goes through `getXml` and reserves its own
    // unit, so a push that carries unnamed people costs two of the day's calls.
    await reserveCCBDailyBudget();

    const ccb = createCCBClient(
      await getCCBRequestContext(request, {
        module: 'pulse-digital-labs',
        action: 'push-attendance',
        direction: 'push',
      })
    );

    // What to add so CCB lands on `extraHeadCount`, rather than adding that
    // many people again on every re-push. Costs one read, and only when there
    // are unnamed people to account for — a push that is all named attendees
    // sends 0, which adds nothing whether or not we looked first.
    let headCountToSend = 0;
    let headCountInCCB: number | null = null;
    let headCountExcess = 0;
    let headCountNote: string | null = null;

    if (extraHeadCount > 0) {
      try {
        headCountInCCB = (await ccb.getAttendanceHeadCount({
          eventId: String(eventId),
          occurrence: occurrence.trim(),
        })) ?? 0;
        headCountToSend = Math.max(0, extraHeadCount - headCountInCCB);
        headCountExcess = Math.max(0, headCountInCCB - extraHeadCount);
        if (headCountExcess > 0) {
          headCountNote =
            `CCB already counts ${headCountInCCB} unnamed ${headCountInCCB === 1 ? 'person' : 'people'} ` +
            `for this occurrence, more than the ${extraHeadCount} pushed. CCB can only be added to, ` +
            'so the extra has to be corrected on the occurrence in CCB.';
        }
      } catch (e: unknown) {
        // Budget ceiling, rate limit, timeout. Send nothing rather than risk
        // double-counting: the named attendees still land, and the next push
        // reconciles the head count once the read works again.
        headCountNote = `CCB's current head count could not be read (${e instanceof Error ? e.message : String(e)}); sent 0 rather than risk double-counting. Re-push to reconcile.`;
        console.warn('[lab-attendance] head count read failed:', headCountNote);
      }
    }

    const response = await ccb.createEventAttendance({
      eventId: String(eventId),
      occurrence: occurrence.trim(),
      attendeeIds: ids,
      // Only the people NOT in `ids`, and only the ones CCB isn't already
      // counting. This used to be `ids.length`, which counted every named
      // attendee a second time (2 named + 2 extra = "Attendance - 4").
      headCount: headCountToSend,
      topic: typeof topic === 'string' ? topic : '',
      notes: typeof notes === 'string' ? notes : '',
      // Never notify. A push can be re-run several times as stragglers finish,
      // and each one would mail the event's leaders again.
      emailNotification: 'none',
    });

    return NextResponse.json({
      success: true,
      eventId: String(eventId),
      occurrence: occurrence.trim(),
      count: ids.length,
      headCount: extraHeadCount,
      headCountSent: headCountToSend,
      headCountInCCB,
      ...(headCountExcess > 0 ? { headCountExcess } : {}),
      ...(headCountNote ? { headCountNote } : {}),
      total: ids.length + extraHeadCount,
      response,
    });
  } catch (error) {
    console.error('CCB lab attendance error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';

    if (error instanceof CCBDailyBudgetError) {
      return NextResponse.json(
        { error: 'CCB daily budget reached', details: message },
        { status: 429 }
      );
    }

    if (message.includes('Missing CCB env vars')) {
      return NextResponse.json(
        { error: 'CCB not configured', details: message },
        { status: 503 }
      );
    }

    // CCB's own complaint is the useful one — an occurrence that doesn't match a
    // scheduled one is the most likely failure, and only CCB can say so.
    return NextResponse.json(
      { error: 'Failed to push attendance', details: message },
      { status: 500 }
    );
  }
}
