const dotenv = require('dotenv');
const { DateTime } = require('luxon');
const { createCCBv2Client } = require('../lib/ccb/ccb-v2-client');

dotenv.config({ path: '.env.local', quiet: true });
dotenv.config({ quiet: true });

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
      '  npm run ccb:v2-attendance -- --group-id GROUP_ID --date YYYY-MM-DD',
      '  npm run ccb:v2-attendance -- --event-id EVENT_ID --date YYYY-MM-DD',
      '',
      'Or set:',
      '  CCB_GROUP_ID=GROUP_ID CCB_OCCURRENCE=YYYY-MM-DD',
      '  CCB_EVENT_ID=EVENT_ID CCB_OCCURRENCE=YYYY-MM-DD',
    ].join('\n')
  );
  process.exit(1);
}

function yyyymmdd(date: string): string {
  return DateTime.fromFormat(date, 'yyyy-LL-dd').toFormat('yyyyLLdd');
}

function firstPresent<T>(...values: T[]): T | undefined {
  return values.find((value) => value !== undefined && value !== null);
}

function normalizeAttendee(row: any) {
  const individual = row?.individual ?? {};
  return {
    event_id: firstPresent(row?.event_id, row?.event?.id),
    individual_id: firstPresent(row?.individual_id, individual?.id),
    occurrence_date: row?.occurrence_date,
    first_name: firstPresent(individual?.first_name, row?.first_name),
    last_name: firstPresent(individual?.last_name, row?.last_name),
  };
}

function normalizeGroupEvent(row: any) {
  const event = row?.event ?? {};
  return {
    event_id: firstPresent(row?.event_id, row?.id, event?.id),
    event_name: firstPresent(event?.name, row?.name, row?.title),
    occurrence: row?.occurrence,
    start: row?.start,
    end: row?.end,
    status: row?.status,
    topic: row?.topic,
    notesPresent: Boolean(row?.notes),
    prayerRequestsPresent: Boolean(row?.prayer_requests),
    total_attendance: row?.total_attendance,
    visitors: row?.visitors,
  };
}

async function main() {
  const groupId = argValue('group-id') ?? argValue('group') ?? process.env.CCB_GROUP_ID;
  const eventIdArg = argValue('event-id') ?? argValue('event') ?? process.env.CCB_EVENT_ID;
  const date = argValue('date') ?? argValue('occurrence') ?? process.env.CCB_OCCURRENCE;

  if ((!groupId && !eventIdArg) || !date) usage();
  if (groupId && !/^\d+$/.test(groupId)) throw new Error('group-id must be numeric');
  if (eventIdArg && !/^\d+$/.test(eventIdArg)) throw new Error('event-id must be numeric');
  if (!DateTime.fromFormat(date, 'yyyy-LL-dd').isValid) {
    throw new Error('date must use YYYY-MM-DD');
  }

  const ccb = createCCBv2Client({
    module: 'Script',
    action: 'Test v2 event attendance',
    direction: 'pull',
  });

  const groupEvents = groupId
    ? await ccb.get(`/groups/${groupId}/attendance`, { start: date, end: date })
    : [];

  const normalizedEvents = Array.isArray(groupEvents)
    ? groupEvents.map(normalizeGroupEvent)
    : [];

  const eventIds = eventIdArg
    ? [eventIdArg]
    : normalizedEvents
        .map((event: any) => event.event_id)
        .filter((eventId: unknown): eventId is string | number => eventId !== undefined && eventId !== null);

  const attendance: any[] = [];
  for (const eventId of eventIds) {
    const attendees = await ccb.get(
      `/events/${eventId}/attendance/${yyyymmdd(date)}/attendees`,
      { per_page: 100 }
    );
    const normalizedAttendees = Array.isArray(attendees)
      ? attendees.map(normalizeAttendee)
      : [];

    attendance.push({
      request: {
        method: 'GET',
        path: `/events/${eventId}/attendance/${yyyymmdd(date)}/attendees`,
        occurrenceFormat: 'YYYYMMDD',
      },
      event_id: Number(eventId),
      attendeeCount: normalizedAttendees.length,
      attendees: normalizedAttendees,
      attendeeFieldsPresent: {
        event_id: normalizedAttendees.some((attendee: any) => attendee.event_id != null),
        individual_id: normalizedAttendees.some((attendee: any) => attendee.individual_id != null),
        first_name: normalizedAttendees.some((attendee: any) => attendee.first_name != null),
        last_name: normalizedAttendees.some((attendee: any) => attendee.last_name != null),
      },
    });
  }

  console.log(JSON.stringify({
    apiVersion: 'v2',
    baseUrl: 'https://api.ccbchurch.com',
    groupRequest: groupId
      ? {
          method: 'GET',
          path: `/groups/${groupId}/attendance`,
          query: { start: date, end: date },
        }
      : null,
    groupEvents: normalizedEvents,
    attendance,
  }, null, 2));
}

main().catch((error) => {
  console.error('CCB v2 attendance test failed:', error?.message || error);
  process.exit(1);
});
