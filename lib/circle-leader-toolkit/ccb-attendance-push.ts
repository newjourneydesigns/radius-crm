/**
 * Pushes one Circle summary into CCB and reconciles the occurrence's head
 * count while doing it.
 *
 * WHY THIS IS ITS OWN MODULE
 *
 * CCB's `create_event_attendance` is only half-idempotent. Named attendees
 * carry an individual ID, so CCB dedupes them and the attendee list behaves
 * like a replace. `head_count` carries no ID, so CCB has nothing to dedupe on
 * and ADDS the number it is given to whatever the occurrence already holds.
 * Confirmed against CCB event 17726 on 2026-08-05: re-pushing the same three
 * attendees moved head_count from 8 to 11.
 *
 * A single Circle summary can write to that occurrence up to three times — the
 * initial write, a retry without the leader email if that throws, and a rewrite
 * when the read-back check says CCB didn't save — and the leader can submit
 * again on top of all that. Sending the same head count each time silently
 * multiplied it, while the attendee list and notes looked perfectly correct.
 *
 * So the number sent here is always a DELTA: what CCB is currently holding,
 * subtracted from what the leader is reporting, re-resolved immediately before
 * every write. A repeat write sends 0 and changes nothing.
 *
 * The one thing this cannot do is lower a count. Adding is the only operation
 * CCB offers — sending 0 adds nothing, it doesn't clear — so when CCB already
 * holds more people than the leader reported, the excess is reported back to
 * the caller (`headCount.excessInCCB`) rather than being papered over. Only a
 * human can correct it, in CCB.
 */

import type { CCBClient } from '../ccb/ccb-client';

export type HeadCountReconciliation = {
  /** Off-roster people the leader reported — where CCB should end up. */
  desired: number;
  /** What CCB was asked to add, one entry per write attempt. */
  sent: number[];
  /** CCB's head count before the first write; null when we couldn't read it. */
  ccbBefore: number | null;
  /** People CCB counts that the leader didn't report, and we can't remove. */
  excessInCCB: number | null;
  /** Why the numbers above are what they are, when it isn't obvious. */
  note: string | null;
};

export type CCBAttendancePushResult = {
  status: 'submitted' | 'failed';
  response: unknown;
  verification: { status: 'verified' | 'failed' | 'inconclusive'; reason: string } | null;
  error: string | null;
  headCount: HeadCountReconciliation;
};

export type CCBAttendancePushArgs = {
  ccb: CCBClient;
  eventId: string;
  occurrence: string;
  didNotMeet: boolean;
  /** Roster people the leader ticked. Idempotent — CCB dedupes by individual ID. */
  attendeeIds: string[];
  /** Off-roster people the leader listed by hand; CCB has no ID to file them under. */
  manualAttendeeCount: number;
  /** Head count a previous submission for this same occurrence already sent. */
  previousHeadCount: number;
  isResubmission: boolean;
  topic?: string;
  notes: string;
  prayerRequests?: string;
  info?: string;
};

export async function pushCircleSummaryToCCB(
  args: CCBAttendancePushArgs
): Promise<CCBAttendancePushResult> {
  const {
    ccb,
    eventId,
    occurrence,
    didNotMeet,
    attendeeIds,
    manualAttendeeCount,
    previousHeadCount,
    isResubmission,
  } = args;

  const desired = didNotMeet ? 0 : Math.max(0, manualAttendeeCount);
  const headCount: HeadCountReconciliation = {
    desired,
    sent: [],
    ccbBefore: null,
    excessInCCB: null,
    note: null,
  };

  // True once a write has been attempted, whether or not it threw. From that
  // point on we can't assume CCB is untouched, so a head count we can't read
  // resolves to 0 rather than to the full number.
  let hasAttemptedWrite = false;

  /**
   * How many people to add so CCB lands on `desired`.
   *
   * `observed` lets a caller that has just read the occurrence for another
   * reason (the read-back check) pay for that read once: pass the head count it
   * saw, or `null` for "read, and CCB had no record". Omit it to read here.
   */
  const resolveHeadCountToSend = async (
    observed?: number | null
  ): Promise<number> => {
    if (desired === 0) {
      // Nothing to add, and CCB offers no way to subtract. If one of our own
      // earlier submissions left a count behind, say so — our audit trail
      // knows it without spending a CCB read to rediscover it.
      if (previousHeadCount > 0 && headCount.excessInCCB === null) {
        headCount.excessInCCB = previousHeadCount;
        headCount.note =
          `A previous submission recorded ${previousHeadCount} off-roster ` +
          `${previousHeadCount === 1 ? 'person' : 'people'} in CCB. CCB can only be ` +
          'added to, never reduced, so that count stays until someone edits the ' +
          'occurrence in CCB.';
      }
      return 0;
    }

    let current: number | null;
    if (observed !== undefined) {
      current = observed ?? 0;
    } else {
      try {
        current = await ccb.getAttendanceHeadCount({ eventId, occurrence });
        current = current ?? 0;
      } catch (e: unknown) {
        // Budget ceiling, rate limit, timeout. Never block the leader's
        // submission over it — pick the safer number and record why.
        current = null;
        console.warn(
          '[circle-summary] could not read CCB head count before writing:',
          e instanceof Error ? e.message : e
        );
      }
    }

    if (current === null) {
      const repeatWrite = isResubmission || hasAttemptedWrite;
      headCount.note =
        `CCB's current head count could not be read; sent ${repeatWrite ? '0' : String(desired)} ` +
        `because this ${repeatWrite ? 'may be a repeat write (under-counting beats double-counting)' : 'is a first write for the occurrence'}.`;
      return repeatWrite ? 0 : desired;
    }

    if (headCount.ccbBefore === null) headCount.ccbBefore = current;

    if (current > desired) {
      headCount.excessInCCB = current - desired;
      headCount.note =
        `CCB already counts ${current} off-roster ${current === 1 ? 'person' : 'people'} for this ` +
        `occurrence but the summary reports ${desired}. CCB can only be added to, never reduced, ` +
        'so nothing was sent and the extra stays until someone edits the occurrence in CCB.';
      return 0;
    }

    return desired - current;
  };

  const basePayload = {
    eventId,
    occurrence,
    didNotMeet,
    attendeeIds: didNotMeet ? [] : attendeeIds,
    topic: didNotMeet ? undefined : args.topic,
    notes: args.notes,
    prayerRequests: didNotMeet ? undefined : args.prayerRequests,
    info: didNotMeet ? undefined : args.info,
  } as const;

  const write = async (
    toSend: number,
    emailNotification: 'leaders' | 'none'
  ): Promise<unknown> => {
    hasAttemptedWrite = true;
    // Recorded before the call, not after: a write whose response never
    // arrives may still have landed in CCB, and the audit trail should show
    // what CCB was asked to add rather than only what it acknowledged.
    headCount.sent.push(toSend);
    return await ccb.createEventAttendance({
      ...basePayload,
      headCount: toSend,
      emailNotification,
    });
  };

  const runVerification = async (): Promise<
    { verified: boolean; reason: string; observedHeadCount: number | null } | { error: string }
  > => {
    try {
      return await ccb.verifyEventAttendance({
        eventId,
        occurrence,
        expectedAttendeeIds: didNotMeet ? [] : attendeeIds,
        expectedNotes: args.notes,
      });
    } catch (e: unknown) {
      return { error: e instanceof Error ? e.message : String(e) };
    }
  };

  let response: unknown = null;
  let error: string | null = null;
  let status: 'submitted' | 'failed' = 'submitted';
  let verification: CCBAttendancePushResult['verification'] = null;

  try {
    if (process.env.NODE_ENV !== 'production') {
      console.info('[circle-summary] CCB attendance payload counts', {
        eventId,
        occurrence,
        didNotMeet,
        isResubmission,
        rosterAttendeeCount: basePayload.attendeeIds.length,
        manualAttendeeCount,
        desiredHeadCount: desired,
        totalExpectedAttendance: basePayload.attendeeIds.length + desired,
      });
    }

    try {
      response = await write(await resolveHeadCountToSend(), 'leaders');
    } catch (firstError: unknown) {
      try {
        // The failed write may still have landed in CCB (a timeout says
        // nothing about what CCB did with the request), so re-resolve rather
        // than re-sending the first attempt's number.
        response = await write(await resolveHeadCountToSend(), 'none');
      } catch (fallbackError: unknown) {
        const firstMessage = firstError instanceof Error ? firstError.message : String(firstError);
        const fallbackMessage =
          fallbackError instanceof Error ? fallbackError.message : String(fallbackError);
        throw new Error(
          `${firstMessage}; fallback without email notification also failed: ${fallbackMessage}`
        );
      }
    }

    // CCB has been seen answering create_event_attendance with a clean 200
    // while silently not saving anything. Read the occurrence back and confirm
    // the data landed; if CCB shows it missing, write once more (without the
    // leader email, which may already have gone out) and check again.
    let outcome = await runVerification();
    if ('verified' in outcome && !outcome.verified) {
      // The check just read the occurrence — size the rewrite from what it saw
      // instead of paying for the same read twice.
      response = await write(await resolveHeadCountToSend(outcome.observedHeadCount), 'none');
      outcome = await runVerification();
    }
    if ('error' in outcome) {
      // Only the verification *read* failed — the write itself was accepted.
      // Treat the submission as good rather than trapping the leader in a
      // resubmit loop over a rate limit or timeout on the check.
      verification = { status: 'inconclusive', reason: outcome.error };
    } else if (outcome.verified) {
      verification = { status: 'verified', reason: outcome.reason };
    } else {
      verification = { status: 'failed', reason: outcome.reason };
      status = 'failed';
      error = `CCB accepted the write but the summary is not visible in CCB after a retry: ${outcome.reason}`;
    }
  } catch (e: unknown) {
    error = e instanceof Error ? e.message : String(e);
    status = 'failed';
  }

  if (headCount.excessInCCB) {
    console.warn('[circle-summary] CCB head count is higher than the submitted summary', {
      eventId,
      occurrence,
      desired,
      excessInCCB: headCount.excessInCCB,
    });
  }

  return { status, response, verification, error, headCount };
}
