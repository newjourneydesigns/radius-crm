const dotenv = require('dotenv');
const { DateTime } = require('luxon');
const { createCCBClient } = require('../lib/ccb/ccb-client');

dotenv.config({ path: '.env.local', quiet: true });
dotenv.config({ quiet: true });

type AttendeeSummary = {
  id?: string;
  first_name?: string;
  last_name?: string;
  name?: string;
  status?: string;
};

function argValue(name: string): string | undefined {
  const prefix = `--${name}=`;
  const withEquals = process.argv.find((arg) => arg.startsWith(prefix));
  if (withEquals) return withEquals.slice(prefix.length);

  const index = process.argv.indexOf(`--${name}`);
  if (index >= 0) return process.argv[index + 1];

  return undefined;
}

function usage(): never {
  console.error(
    [
      'Usage:',
      '  npx ts-node scripts/test-ccb-attendance-profile.ts --event-id EVENT_ID --occurrence YYYY-MM-DD',
      '',
      'Or set:',
      '  CCB_EVENT_ID=EVENT_ID CCB_OCCURRENCE=YYYY-MM-DD',
    ].join('\n')
  );
  process.exit(1);
}

function asArray<T>(value: T | T[] | undefined | null): T[] {
  if (value == null) return [];
  return Array.isArray(value) ? value : [value];
}

function text(value: unknown): string | undefined {
  if (value == null) return undefined;
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    const trimmed = String(value).trim();
    return trimmed || undefined;
  }
  const rec = value as Record<string, unknown>;
  const nested = rec['#text'] ?? rec.text;
  return typeof nested === 'string' || typeof nested === 'number' || typeof nested === 'boolean'
    ? String(nested).trim() || undefined
    : undefined;
}

function normalizeAttendees(attendance: any): AttendeeSummary[] {
  const root = attendance?.attendees ?? attendance?.attendee ?? null;
  const attendees = asArray(root?.attendee ?? root);

  return attendees.map((attendee: any) => ({
    id: text(attendee?.['@_id'] ?? attendee?.id),
    first_name: text(attendee?.first_name),
    last_name: text(attendee?.last_name),
    name: text(attendee?.name),
    status: text(attendee?.status),
  }));
}

function findAttendanceRecord(response: any): any {
  if (response?.attendance) return response.attendance;

  const events = asArray(response?.events?.event ?? response?.event);
  return events[0] ?? null;
}

async function main() {
  const eventId = argValue('event-id') ?? argValue('id') ?? process.env.CCB_EVENT_ID;
  const occurrence = argValue('occurrence') ?? process.env.CCB_OCCURRENCE;

  if (!eventId || !occurrence) usage();
  if (!/^\d+$/.test(eventId)) throw new Error('event-id must be numeric');
  if (!DateTime.fromFormat(occurrence, 'yyyy-LL-dd').isValid) {
    throw new Error('occurrence must use YYYY-MM-DD');
  }

  const ccb = createCCBClient({
    module: 'Script',
    action: 'Test attendance_profile',
    direction: 'pull',
  });

  const xml: any = await ccb.getXml({
    srv: 'attendance_profile',
    id: eventId,
    occurrence,
  });

  const response = xml?.ccb_api?.response;
  const attendance = findAttendanceRecord(response);
  const attendees = normalizeAttendees(attendance);

  const summary = {
    request: {
      service: 'attendance_profile',
      id: eventId,
      occurrence,
    },
    response: {
      rootKeys: Object.keys(response || {}),
      hasAttendanceNode: response?.attendance != null,
      hasEventsEventNode: Boolean(response?.events?.event ?? response?.event),
      hasAttendeesNode: attendance?.attendees != null || attendance?.attendee != null,
      eventId: text(attendance?.['@_id'] ?? attendance?.id),
      eventOccurrenceAttribute: text(attendance?.['@_occurrence'] ?? attendance?.occurrence),
      eventName: text(attendance?.name ?? attendance?.event_name),
      did_not_meet: text(attendance?.did_not_meet),
      head_count: text(attendance?.head_count),
      attendeeCount: attendees.length,
      firstFiveAttendees: attendees.slice(0, 5),
      attendeeFieldsPresent: {
        id: attendees.some((a) => Boolean(a.id)),
        first_name: attendees.some((a) => Boolean(a.first_name)),
        last_name: attendees.some((a) => Boolean(a.last_name)),
      },
    },
  };

  console.log(JSON.stringify(summary, null, 2));
}

main().catch((error) => {
  console.error('attendance_profile test failed:', error?.message || error);
  process.exit(1);
});
