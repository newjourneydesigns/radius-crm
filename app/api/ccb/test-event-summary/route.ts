import { NextResponse } from 'next/server';
import { createCCBClient } from '../../../../lib/ccb/ccb-client';
import { getCCBRequestContext } from '../../../../lib/ccb/ccb-api-gateway';

export const dynamic = 'force-dynamic';

const TEST_GROUP_ID = '3850';

// GET — list upcoming + recent events for the test group with occurrences,
// so you can grab an eventId + occurrence datetime to feed the POST.
export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const mode = url.searchParams.get('mode');
    const client: any = createCCBClient(
      await getCCBRequestContext(req, { module: 'test-event-summary', action: mode || 'event_profile' })
    );

    if (mode === 'participants') {
      const participants = await client.getGroupParticipants(TEST_GROUP_ID);
      return NextResponse.json({
        groupId: TEST_GROUP_ID,
        count: participants.length,
        participants: participants.map((p: any) => ({ id: p.id, name: p.fullName })),
      });
    }

    const eventId = url.searchParams.get('event_id');
    if (!eventId) {
      return NextResponse.json({
        usage: {
          eventProfile: 'GET /api/ccb/test-event-summary?event_id=XXXXX',
          participants: 'GET /api/ccb/test-event-summary?mode=participants',
        },
      });
    }
    const xml = await client.getXml({ srv: 'event_profile', id: eventId });
    return NextResponse.json({ eventId, raw: xml?.ccb_api?.response?.events?.event ?? xml });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || String(e) }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const url = new URL(req.url);
  if (url.searchParams.get('confirm') !== 'yes') {
    return NextResponse.json(
      { error: 'Add ?confirm=yes to fire. This call writes to CCB.' },
      { status: 400 }
    );
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Body must be JSON.' }, { status: 400 });
  }

  const {
    eventId,
    occurrenceDate,
    occurrenceTime = '19:00:00',
    topic,
    notes,
    prayerRequests,
    info,
    headCount,
    didNotMeet,
    attendeeIds,
  } = body || {};

  if (!eventId || !occurrenceDate) {
    return NextResponse.json(
      { error: 'eventId and occurrenceDate ("YYYY-MM-DD") are required.' },
      { status: 400 }
    );
  }

  const occurrence = `${occurrenceDate} ${occurrenceTime}`;

  try {
    const client = createCCBClient(
      await getCCBRequestContext(req, { module: 'test-event-summary', action: 'create_event_attendance' })
    );
    const result = await client.createEventAttendance({
      eventId,
      occurrence,
      didNotMeet: !!didNotMeet,
      headCount,
      attendeeIds,
      topic,
      notes,
      prayerRequests,
      info,
      emailNotification: 'none',
    });
    return NextResponse.json({
      ok: true,
      testGroupId: TEST_GROUP_ID,
      submitted: { eventId, occurrence, topic, notes, prayerRequests, info, headCount, didNotMeet, attendeeIds },
      ccbResponse: result,
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message || String(e) }, { status: 500 });
  }
}
