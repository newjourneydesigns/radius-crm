/**
 * CCB head-count accumulation: reproduction + regression guard.
 *
 *   npx ts-node scripts/ccb-head-count-repro.ts
 *
 * Runs entirely against a fake CCB served on localhost. It needs no
 * credentials and never touches the church's CCB or its API budget.
 *
 * THE BEHAVIOUR BEING MODELLED
 *
 * `create_event_attendance` is only half-idempotent:
 *   - named attendees carry an individual ID, so CCB dedupes them — the
 *     attendee list behaves like a replace;
 *   - `head_count` carries no ID, so CCB ADDS it to whatever the occurrence
 *     already holds, and sending 0 clears nothing.
 *
 * Confirmed against the real CCB event 17726 on 2026-08-05: re-pushing the
 * same 3 attendees moved head_count from 8 to 11. Scenario 1 below asserts the
 * fake behaves the same way, so the rest of the file is testing the real thing.
 *
 * Everything after scenario 1 drives the Circle Leader toolkit's own push path
 * (`pushCircleSummaryToCCB`) through the ways it can write more than once for
 * one meeting, and asserts CCB lands on the number of off-roster people the
 * leader actually reported.
 */

import http from 'http';
import type { AddressInfo } from 'net';
import { XMLParser } from 'fast-xml-parser';
import { CCBClient } from '../lib/ccb/ccb-client';
import { pushCircleSummaryToCCB } from '../lib/circle-leader-toolkit/ccb-attendance-push';

// ---- Fake CCB ----

type StoredOccurrence = {
  headCount: number;
  attendees: string[];
  notes: string;
  topic: string;
  didNotMeet: boolean;
};

/** Knobs for the failure modes the toolkit has to survive. */
type FailureModes = {
  /** Accept the write, change nothing — CCB's silent no-save. */
  dropNextWrite?: boolean;
  /** Apply the write, then kill the connection so the client sees a failure. */
  killAfterNextWrite?: boolean;
  /** Individual IDs CCB refuses to record, so the read-back never verifies. */
  unsavableAttendees?: string[];
};

const store = new Map<string, StoredOccurrence>();
const modes: FailureModes = {};
const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_', trimValues: true });

const key = (eventId: string, occurrence: string) => `${eventId}|${occurrence.slice(0, 10)}`;

const asArray = (value: unknown): any[] =>
  Array.isArray(value) ? value : value == null || value === '' ? [] : [value];

const escapeXml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function readBody(req: http.IncomingMessage): Promise<string> {
  return new Promise((resolve) => {
    const chunks: Buffer[] = [];
    req.on('data', (c) => chunks.push(Buffer.from(c)));
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
  });
}

function applyWrite(xmlText: string): void {
  const parsed = parser.parse(xmlText);
  const event = parsed?.events?.event;
  if (!event) return;

  const eventId = String(event['@_id']);
  const occurrence = String(event['@_occurrence']);
  const record = store.get(key(eventId, occurrence)) ?? {
    headCount: 0,
    attendees: [],
    notes: '',
    topic: '',
    didNotMeet: false,
  };

  const submittedHeadCount = Number(String(event.head_count ?? '').trim() || 0) || 0;
  const submittedAttendees = asArray(event.attendees?.attendee)
    .map((a) => String(a?.['@_id'] ?? '').trim())
    .filter(Boolean)
    .filter((id) => !(modes.unsavableAttendees ?? []).includes(id));

  // The whole point: head_count is ADDED, attendees are merged by ID.
  record.headCount += submittedHeadCount;
  record.attendees = Array.from(new Set([...record.attendees, ...submittedAttendees]));
  record.notes = String(event.notes ?? '');
  record.topic = String(event.topic ?? '');
  record.didNotMeet = String(event.did_not_meet ?? '') === '1';

  store.set(key(eventId, occurrence), record);
}

function attendanceProfileXml(eventId: string, occurrence: string): string {
  const record = store.get(key(eventId, occurrence));
  if (!record) {
    return '<?xml version="1.0" encoding="UTF-8"?><ccb_api><response></response></ccb_api>';
  }
  const attendees = record.attendees
    .map((id) => `<attendee id="${id}"><first_name>Test</first_name><last_name>Person</last_name></attendee>`)
    .join('');
  return `<?xml version="1.0" encoding="UTF-8"?>
<ccb_api><response>
  <attendance id="${eventId}" occurrence="${occurrence.slice(0, 10)}">
    <head_count>${record.headCount}</head_count>
    <did_not_meet>${record.didNotMeet ? 'true' : 'false'}</did_not_meet>
    <topic>${escapeXml(record.topic)}</topic>
    <notes>${escapeXml(record.notes)}</notes>
    <attendees>${attendees}</attendees>
  </attendance>
</response></ccb_api>`;
}

async function startFakeCCB(): Promise<{ baseUrl: string; close: () => Promise<void> }> {
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url || '/', 'http://localhost');
    const srv = url.searchParams.get('srv');

    if (req.method === 'POST' && srv === 'create_event_attendance') {
      const body = await readBody(req);
      const start = body.indexOf('<?xml');
      const end = body.lastIndexOf('</events>');
      const xmlText = start >= 0 && end > start ? body.slice(start, end + '</events>'.length) : '';

      if (modes.dropNextWrite) {
        modes.dropNextWrite = false; // accepted, saved nothing
      } else if (xmlText) {
        applyWrite(xmlText);
      }

      if (modes.killAfterNextWrite) {
        modes.killAfterNextWrite = false;
        req.socket.destroy(); // saved, but the client never hears back
        return;
      }

      res.writeHead(200, { 'Content-Type': 'text/xml' });
      res.end('<?xml version="1.0" encoding="UTF-8"?><ccb_api><response><events></events></response></ccb_api>');
      return;
    }

    if (srv === 'attendance_profile') {
      res.writeHead(200, { 'Content-Type': 'text/xml' });
      res.end(
        attendanceProfileXml(url.searchParams.get('id') || '', url.searchParams.get('occurrence') || '')
      );
      return;
    }

    res.writeHead(400, { 'Content-Type': 'text/xml' });
    res.end(`<ccb_api><response><errors><error>unsupported srv ${srv}</error></errors></response></ccb_api>`);
  });

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  return {
    baseUrl: `http://127.0.0.1:${port}`,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}

// ---- Assertions ----

let failures = 0;

function check(label: string, actual: unknown, expected: unknown): void {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) failures += 1;
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}: ${JSON.stringify(actual)}${ok ? '' : ` (expected ${JSON.stringify(expected)})`}`);
}

const headCountOf = (eventId: string, occurrence: string) =>
  store.get(key(eventId, occurrence))?.headCount ?? null;

// ---- Scenarios ----

async function main() {
  const fake = await startFakeCCB();
  const ccb = new CCBClient({ subdomain: '', baseUrl: fake.baseUrl, username: 'test', password: 'test' });

  // One summary: 2 people ticked off the roster, 3 walk-ins the leader typed in.
  const summary = (eventId: string, occurrence: string, overrides: Partial<Parameters<typeof pushCircleSummaryToCCB>[0]> = {}) => ({
    ccb,
    eventId,
    occurrence,
    didNotMeet: false,
    attendeeIds: ['101', '102'],
    manualAttendeeCount: 3,
    previousHeadCount: 0,
    isResubmission: false,
    topic: 'Week 3',
    notes: 'Good discussion tonight.',
    prayerRequests: '',
    info: '',
    ...overrides,
  });

  console.log('\n1. The fake CCB adds head counts, the way the real one does');
  {
    const [id, occ] = ['9001', '2026-08-05 19:00:00'];
    const payload = { eventId: id, occurrence: occ, attendeeIds: ['101', '102', '103'], headCount: 3, notes: 'x' };
    await ccb.createEventAttendance(payload);
    check('head_count after the first write', headCountOf(id, occ), 3);
    await ccb.createEventAttendance(payload);
    check('head_count after re-sending the same payload', headCountOf(id, occ), 6);
    check('attendees are still deduped', store.get(key(id, occ))!.attendees.length, 3);
    await ccb.createEventAttendance({ ...payload, headCount: 0 });
    check('sending 0 does not clear the count', headCountOf(id, occ), 6);
  }

  console.log('\n2. A first submission lands the leader’s 3 walk-ins');
  {
    const [id, occ] = ['9002', '2026-08-05 19:00:00'];
    const result = await pushCircleSummaryToCCB(summary(id, occ));
    check('status', result.status, 'submitted');
    check('sent to CCB', result.headCount.sent, [3]);
    check('CCB head_count', headCountOf(id, occ), 3);
  }

  console.log('\n3. The leader submits the same summary again');
  {
    const [id, occ] = ['9003', '2026-08-05 19:00:00'];
    await pushCircleSummaryToCCB(summary(id, occ));
    const again = await pushCircleSummaryToCCB(
      summary(id, occ, { isResubmission: true, previousHeadCount: 3 })
    );
    check('the second submission adds nothing', again.headCount.sent, [0]);
    check('CCB head_count', headCountOf(id, occ), 3);
  }

  console.log('\n4. The write lands but the response never arrives (retry path)');
  {
    const [id, occ] = ['9004', '2026-08-05 19:00:00'];
    modes.killAfterNextWrite = true;
    const result = await pushCircleSummaryToCCB(summary(id, occ));
    check('status', result.status, 'submitted');
    check('the retry adds nothing on top', result.headCount.sent, [3, 0]);
    check('CCB head_count', headCountOf(id, occ), 3);
  }

  console.log('\n5. CCB accepts the write and saves nothing (rewrite path)');
  {
    const [id, occ] = ['9005', '2026-08-05 19:00:00'];
    modes.dropNextWrite = true;
    const result = await pushCircleSummaryToCCB(summary(id, occ));
    check('status', result.status, 'submitted');
    check('the rewrite carries the full count', result.headCount.sent, [3, 3]);
    check('CCB head_count', headCountOf(id, occ), 3);
  }

  console.log('\n6. CCB refuses an attendee, so the read-back can never verify');
  {
    const [id, occ] = ['9006', '2026-08-05 19:00:00'];
    modes.unsavableAttendees = ['102'];
    const result = await pushCircleSummaryToCCB(summary(id, occ));
    check('verification', result.verification?.status, 'failed');
    check('the rewrite adds nothing', result.headCount.sent, [3, 0]);
    check('CCB head_count', headCountOf(id, occ), 3);

    // …and the leader taps "Submit Again" on the failure they were shown.
    const retry = await pushCircleSummaryToCCB(summary(id, occ, { isResubmission: true, previousHeadCount: 3 }));
    check('resubmitting after the failure adds nothing', retry.headCount.sent, [0, 0]);
    check('CCB head_count', headCountOf(id, occ), 3);
    modes.unsavableAttendees = [];
  }

  console.log('\n7. CCB holds more than the leader reports — surfaced, not hidden');
  {
    const [id, occ] = ['9007', '2026-08-05 19:00:00'];
    store.set(key(id, occ), { headCount: 5, attendees: [], notes: '', topic: '', didNotMeet: false });
    const result = await pushCircleSummaryToCCB(summary(id, occ, { manualAttendeeCount: 2 }));
    check('nothing is sent', result.headCount.sent, [0]);
    check('the excess is reported', result.headCount.excessInCCB, 3);
    check('CCB head_count is left alone', headCountOf(id, occ), 5);
  }

  console.log('\n8. "Did not meet" after a summary that had walk-ins');
  {
    const [id, occ] = ['9008', '2026-08-05 19:00:00'];
    await pushCircleSummaryToCCB(summary(id, occ));
    const dnm = await pushCircleSummaryToCCB(
      summary(id, occ, { didNotMeet: true, manualAttendeeCount: 0, isResubmission: true, previousHeadCount: 3 })
    );
    check('nothing is sent', dnm.headCount.sent, [0]);
    check('the stale count is reported', dnm.headCount.excessInCCB, 3);
    check('CCB head_count cannot be cleared through the API', headCountOf(id, occ), 3);
  }

  await fake.close();

  console.log(failures === 0 ? '\nAll checks passed.\n' : `\n${failures} check(s) FAILED.\n`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
