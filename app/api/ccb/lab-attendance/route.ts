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
 * Deliberately narrow. It takes an event, an occurrence and a list of CCB
 * individual IDs, and does exactly one thing with them. It is NOT a generic CCB
 * passthrough, and it shouldn't grow into one — a parameterised `srv` proxy is
 * how a shared API budget and a shared write surface both get away from you.
 *
 * `create_event_attendance` REPLACES an occurrence's attendee list rather than
 * appending, which is the intended behaviour here: attendance answers "did you
 * go", so re-running a push after more people finish is idempotent rather than
 * duplicating anyone.
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
    const { eventId, occurrence, attendeeIds, topic, notes } = body as {
      eventId?: unknown;
      occurrence?: unknown;
      attendeeIds?: unknown;
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

    // Writes go through `postXml`, which does not reserve budget the way the
    // read client does. Reserved here rather than inside the shared client so
    // the live Circle Leader toolkit submit path keeps its current behaviour.
    await reserveCCBDailyBudget();

    const ccb = createCCBClient(
      await getCCBRequestContext(request, {
        module: 'pulse-digital-labs',
        action: 'push-attendance',
        direction: 'push',
      })
    );

    const response = await ccb.createEventAttendance({
      eventId: String(eventId),
      occurrence: occurrence.trim(),
      attendeeIds: ids,
      headCount: ids.length,
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
