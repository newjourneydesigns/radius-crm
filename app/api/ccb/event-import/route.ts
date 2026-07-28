import { NextResponse } from 'next/server';
import { DateTime } from 'luxon';
import { createCCBClient } from '../../../../lib/ccb/ccb-client';
import { getCCBRequestContext } from '../../../../lib/ccb/ccb-api-gateway';
import { getUserFromAuthHeader } from '../../../../lib/server-supabase';

export const dynamic = 'force-dynamic';

// Above this many attendees, per-person profile lookups would crowd the CCB
// circuit breaker (40 calls/min), so we switch to the bulk
// individual_profiles?modified_since sweep instead.
const PER_PERSON_LOOKUP_LIMIT = 20;

export interface EventImportPerson {
  ccbId: string;
  name: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  mobilePhone: string;
  /** ISO timestamp the CCB profile was created */
  created: string;
  /** ISO date of the most recent occurrence this person checked in to */
  attendedDate: string | null;
}

// POST /api/ccb/event-import
// Body: { eventId: string, createdAfter: 'YYYY-MM-DD' }
// Returns the event's checked-in attendees whose CCB profile was created on or
// after `createdAfter`, with contact info — the preview for the boards import.
export async function POST(request: Request) {
  try {
    const user = await getUserFromAuthHeader(request);
    if (!user) {
      return NextResponse.json({ error: 'Not signed in' }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    const eventId = String(body.eventId ?? '').trim();
    const createdAfter = String(body.createdAfter ?? '').trim();

    if (!/^\d+$/.test(eventId)) {
      return NextResponse.json({ error: 'eventId must be the numeric CCB event ID' }, { status: 400 });
    }
    const cutoff = DateTime.fromISO(createdAfter);
    if (!cutoff.isValid) {
      return NextResponse.json({ error: 'createdAfter must be a date (YYYY-MM-DD)' }, { status: 400 });
    }
    const cutoffStart = cutoff.startOf('day');

    const ccb = createCCBClient(await getCCBRequestContext(request, {
      module: 'Boards',
      action: 'CCB Event Import',
      direction: 'pull',
    }));

    const { eventName, occurrencesChecked, attendees } = await ccb.getEventAttendeesWithOccurrences(eventId);

    if (attendees.length === 0) {
      return NextResponse.json({
        success: true,
        event: { id: eventId, name: eventName },
        occurrencesChecked,
        totalAttendees: 0,
        matches: [],
        filteredOut: 0,
        truncated: false,
      });
    }

    // Resolve profile created-dates + contact info.
    const matches: EventImportPerson[] = [];
    let profilesResolved = 0;
    let profilesWithCreated = 0;
    let truncated = false;

    const withId = attendees.filter(a => a.id);

    if (withId.length <= PER_PERSON_LOOKUP_LIMIT) {
      // Small set: one profile call per attendee, limited concurrency.
      const CONCURRENCY = 4;
      for (let i = 0; i < withId.length; i += CONCURRENCY) {
        const chunk = withId.slice(i, i + CONCURRENCY);
        const profiles = await Promise.all(chunk.map(a => ccb.getIndividualProfile(a.id)));
        chunk.forEach((a, j) => {
          const p = profiles[j];
          if (!p) return;
          profilesResolved++;
          if (!p.created) return;
          profilesWithCreated++;
          if (DateTime.fromISO(p.created) < cutoffStart) return;
          matches.push({
            ccbId: p.id,
            name: p.fullName || a.name,
            firstName: p.firstName,
            lastName: p.lastName,
            email: p.email,
            phone: p.phone,
            mobilePhone: p.mobilePhone,
            created: p.created,
            attendedDate: a.attendedDate,
          });
        });
      }

      // If CCB gave us profiles but no created-dates at all, the filter can't
      // work — surface that instead of silently returning zero matches.
      if (profilesResolved > 0 && profilesWithCreated === 0) {
        return NextResponse.json({
          error: 'CCB did not return profile created-dates, so the date filter cannot be applied.',
          code: 'CCB_NO_CREATED_DATES',
        }, { status: 502 });
      }
    } else {
      // Large set: one bulk sweep of profiles modified since the cutoff.
      // Created-after-cutoff implies modified-after-cutoff, so every match is in here.
      const sweep = await ccb.getIndividualsModifiedSince(cutoffStart.toISODate()!);
      truncated = sweep.truncated;
      const byId = new Map(sweep.individuals.map(p => [p.id, p]));
      profilesResolved = withId.length;
      for (const a of withId) {
        const p = byId.get(a.id);
        if (!p || !p.created) continue;
        if (DateTime.fromISO(p.created) < cutoffStart) continue;
        matches.push({
          ccbId: p.id,
          name: p.fullName || a.name,
          firstName: p.firstName,
          lastName: p.lastName,
          email: p.email,
          phone: p.phone,
          mobilePhone: p.mobilePhone,
          created: p.created,
          attendedDate: a.attendedDate,
        });
      }
    }

    matches.sort((a, b) => a.name.localeCompare(b.name));

    return NextResponse.json({
      success: true,
      event: { id: eventId, name: eventName },
      occurrencesChecked,
      totalAttendees: attendees.length,
      matches,
      filteredOut: attendees.length - matches.length,
      truncated,
    });
  } catch (error: any) {
    const message = (error?.message || '').toString();
    console.error('❌ CCB event import preview failed:', message);

    if (/Missing CCB env vars/i.test(message)) {
      return NextResponse.json({
        error: 'CCB is not configured on the server',
        code: 'CCB_MISSING_ENV',
      }, { status: 503 });
    }
    if (/was not found in CCB/i.test(message)) {
      return NextResponse.json({ error: message, code: 'CCB_EVENT_NOT_FOUND' }, { status: 404 });
    }
    if (/circuit breaker|rate limit|429/i.test(message)) {
      return NextResponse.json({
        error: 'CCB rate limit reached — wait a minute and try again.',
        code: 'CCB_RATE_LIMITED',
      }, { status: 429 });
    }
    if (/timeout|ECONNABORTED/i.test(message)) {
      return NextResponse.json({
        error: 'CCB timed out. Try again in a moment.',
        code: 'CCB_TIMEOUT',
      }, { status: 504 });
    }
    return NextResponse.json({
      error: 'Failed to read event attendees from CCB',
      code: 'CCB_FETCH_FAILED',
    }, { status: 500 });
  }
}
