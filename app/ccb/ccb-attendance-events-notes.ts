/**
 * get-ccb-event-links.ts
 *
 * Given a CCB (Pushpay Church Community Builder) GROUP (aka Circle) ID and a date range,
 * fetch the group's events/occurrences and output event-detail links like:
 *   https://{SUB}.ccbchurch.com/event_detail.php?event_id={EVENT_ID}&occur=YYYYMMDD
 *
 * Optionally, add attendance notes for each occurrence via `attendance_profile` using --withNotes
 * (and --includeAttendees to include attendee roster when available).
 *
 * Setup:
 *   npm i axios fast-xml-parser yargs dotenv luxon ts-node typescript
 *
 * .env:
 *   CCB_SUBDOMAIN=valleycreekchurch
 *   CCB_API_USERNAME=circlesreportingapi
 *   CCB_API_PASSWORD=********
 *
 * Run:
 *   npx ts-node get-ccb-event-links.ts --group 12345 --start 2025-08-01 --end 2025-09-01
 *   npx ts-node get-ccb-event-links.ts --group 12345 --start 2025-08-01 --end 2025-09-01 --withNotes
 *   npx ts-node get-ccb-event-links.ts --group 12345 --start 2025-08-01 --end 2025-09-01 --withNotes --includeAttendees
 */

import axios, { AxiosRequestConfig } from "axios";
import { XMLParser } from "fast-xml-parser";
import * as yargs from "yargs";
import * as dotenv from "dotenv";
import { DateTime, Interval } from "luxon";

dotenv.config();

// ---- Types ----

type EventOccurrence = {
  start: string; // ISO
  end?: string;  // ISO or undefined
};

type NormalizedEvent = {
  eventId: string;
  title: string;
  groupId?: string;
  occurrences: EventOccurrence[];
};

type LinkRow = {
  eventId: string;
  title: string;
  occurDate: string; // YYYY-MM-DD
  link: string;
  attendance?: AttendanceSummary; // present when --withNotes
};

type AttendanceSummary = {
  eventId: string;
  occurrence: string; // YYYY-MM-DD
  title?: string;
  didNotMeet?: boolean;
  headCount?: number;
  topic?: string;
  notes?: string;
  prayerRequests?: string;
  info?: string;
  attendees?: Array<{ id?: string; name?: string; status?: string }>;
};

// ---- CLI ----

const argv = yargs
  .option("group", { type: "string", demandOption: true, describe: "CCB Group ID" })
  .option("start", { type: "string", demandOption: true, describe: "Start date (YYYY-MM-DD)" })
  .option("end", { type: "string", demandOption: true, describe: "End date (YYYY-MM-DD)" })
  .option("withNotes", { type: "boolean", default: false, describe: "Attach attendance notes for each occurrence" })
  .option("includeAttendees", { type: "boolean", default: false, describe: "Include attendee roster when using --withNotes" })
  .strict()
  .help().argv as unknown as { group: string; start: string; end: string; withNotes: boolean; includeAttendees: boolean };

const SUB = process.env.CCB_SUBDOMAIN;
const USER = process.env.CCB_API_USERNAME;
const PASS = process.env.CCB_API_PASSWORD;

if (!SUB || !USER || !PASS) {
  console.error("Missing CCB env vars. Please set CCB_SUBDOMAIN, CCB_API_USERNAME, CCB_API_PASSWORD in .env");
  process.exit(1);
}

const BASE = `https://${SUB}.ccbchurch.com/api.php`;

const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "@_", trimValues: true });

// ---- HTTP helpers ----

async function getXml<T = any>(params: Record<string, string | number | boolean>, maxRetries = 3): Promise<T> {
  const cfg: AxiosRequestConfig = {
    method: "GET",
    url: BASE,
    params,
    auth: { username: USER!, password: PASS! },
    timeout: 30000,
    validateStatus: (s) => s >= 200 && s < 500,
  };

  let attempt = 0;
  while (true) {
    try {
      const res = await axios(cfg);
      if (res.status === 429) throw new Error("Rate limited (429)");
      if (res.status >= 400) throw new Error(`HTTP ${res.status}: ${typeof res.data === 'string' ? res.data.slice(0,200) : 'error'}`);
      const data = typeof res.data === "string" ? parser.parse(res.data) : res.data;
      return data as T;
    } catch (e: any) {
      attempt++;
      if (attempt > maxRetries) throw e;
      const delayMs = 500 * Math.pow(2, attempt - 1);
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }
}

// ---- Normalizers ----

/** Normalize event XML from `event_profiles` */
function normalizeFromEventProfiles(xml: any): NormalizedEvent[] {
  const eventsRoot = xml?.ccb_api?.response?.events ?? xml?.ccb_api?.response?.event ?? null;
  const rawEvents: any[] = Array.isArray(eventsRoot?.event) ? eventsRoot.event : eventsRoot?.event ? [eventsRoot.event] : [];

  return rawEvents.map((ev) => {
    const id = String(ev?.["@_id"] ?? ev?.id ?? "");
    const title = String(ev?.name ?? ev?.title ?? "").trim();
    const groupId = String(ev?.group?.["@_id"] ?? ev?.group?.id ?? ev?.group_id ?? "").trim();

    const occRoot = ev?.occurrences ?? ev?.occurrence ?? null;
    const occList: any[] = Array.isArray(occRoot?.occurrence) ? occRoot.occurrence : occRoot?.occurrence ? [occRoot.occurrence] : Array.isArray(occRoot) ? occRoot : [];

    const occurrences: EventOccurrence[] = occList
      .map((o) => {
        const start = o?.start_datetime ?? o?.start_dt ?? o?.start ?? o?.date ?? null;
        const end = o?.end_datetime ?? o?.end_dt ?? o?.end ?? null;
        return start ? { start: DateTime.fromISO(String(start)).toISO()!, end: end ? DateTime.fromISO(String(end)).toISO()! : undefined } : null;
      })
      .filter(Boolean) as EventOccurrence[];

    return { eventId: id, title, groupId, occurrences };
  });
}

/** Normalize from `public_calendar_listing` */
function normalizeFromPublicCalendar(xml: any): NormalizedEvent[] {
  const eventsRoot = xml?.ccb_api?.response?.events ?? null;
  const rawEvents: any[] = Array.isArray(eventsRoot?.event) ? eventsRoot.event : eventsRoot?.event ? [eventsRoot.event] : [];

  return rawEvents.map((ev) => {
    const id = String(ev?.["@_id"] ?? ev?.id ?? "");
    const title = String(ev?.name ?? ev?.title ?? "").trim();
    const groupId = String(ev?.group?.["@_ccb_id"] ?? ev?.group?.ccb_id ?? ev?.group_id ?? "").trim();

    const occRoot = ev?.occurrences ?? ev?.occurrence ?? null;
    const occList: any[] = Array.isArray(occRoot?.occurrence) ? occRoot.occurrence : occRoot?.occurrence ? [occRoot.occurrence] : Array.isArray(occRoot) ? occRoot : [];

    const occurrences: EventOccurrence[] = occList
      .map((o) => {
        const date = o?.date ?? o?.start_date ?? null;
        const time = o?.start_time ?? "00:00:00";
        if (!date) return null;
        const start = DateTime.fromISO(`${date}T${time}`).toISO();
        return start ? { start } : null;
      })
      .filter(Boolean) as EventOccurrence[];

    return { eventId: id, title, groupId, occurrences };
  });
}

/** attendance_profile normalizer */
function normalizeAttendance(xml: any, wantAttendees: boolean): AttendanceSummary | undefined {
  const a = xml?.ccb_api?.response?.attendance ?? {};
  const eventId = String(a?.["@_id"] ?? a?.id ?? "").trim();
  const occurrence = String(a?.["@_occurrence"] ?? a?.occurrence ?? "").trim();
  if (!eventId || !occurrence) return undefined;

  const title = (a?.name ?? a?.event_name ?? "").toString().trim() || undefined;

  const dnmRaw = (a?.did_not_meet ?? "").toString().trim().toLowerCase();
  const didNotMeet = dnmRaw === "true" || dnmRaw === "1" ? true : dnmRaw === "false" || dnmRaw === "0" ? false : undefined;

  const headCountNum = Number(a?.head_count);
  const headCount = Number.isFinite(headCountNum) ? headCountNum : undefined;

  const topic = (a?.topic ?? "").toString().trim() || undefined;
  const notes = (a?.notes ?? "").toString().trim() || undefined;
  const prayerRequests = (a?.prayer_requests ?? "").toString().trim() || undefined;
  const info = (a?.info ?? "").toString().trim() || undefined;

  let attendees: AttendanceSummary["attendees"];
  if (wantAttendees) {
    const attRoot = a?.attendees ?? a?.attendee ?? null;
    const list: any[] = Array.isArray(attRoot?.attendee) ? attRoot.attendee : attRoot?.attendee ? [attRoot.attendee] : Array.isArray(attRoot) ? attRoot : [];
    attendees = list.map((p) => ({
      id: String(p?.["@_id"] ?? p?.id ?? "").trim() || undefined,
      name: (p?.name ?? "").toString().trim() || undefined,
      status: (p?.status ?? "").toString().trim() || undefined,
    }));
  }

  return { eventId, occurrence, title, didNotMeet, headCount, topic, notes, prayerRequests, info, attendees };
}

// ---- Core logic ----

function expandToLinks(events: NormalizedEvent[], wantedGroupId: string, startDate: string, endDate: string): LinkRow[] {
  const range = Interval.fromDateTimes(DateTime.fromISO(startDate).startOf("day"), DateTime.fromISO(endDate).endOf("day"));

  const rows: LinkRow[] = [];
  for (const ev of events) {
    if (ev.groupId && ev.groupId !== wantedGroupId) continue;

    for (const occ of ev.occurrences) {
      const start = DateTime.fromISO(occ.start);
      if (!start.isValid) continue;
      const end = occ.end ? DateTime.fromISO(occ.end) : start;
      const occInterval = Interval.fromDateTimes(start, end);
      if (!occInterval.isValid || !occInterval.overlaps(range)) continue;

      const occurDate = start.toFormat("yyyy-LL-dd");
      const occurParam = start.toFormat("yyyyLLdd");
      const link = `https://${SUB}.ccbchurch.com/event_detail.php?event_id=${encodeURIComponent(ev.eventId)}&occur=${occurParam}`;

      rows.push({ eventId: ev.eventId, title: ev.title || "(untitled)", occurDate, link });
    }
  }

  // de-dupe by eventId + occurDate
  const seen = new Set<string>();
  return rows.filter((r) => {
    const key = `${r.eventId}|${r.occurDate}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

async function fetchEventSet(group: string, start: string, end: string): Promise<NormalizedEvent[]> {
  // 1) Try private API: event_profiles (auth required)
  try {
    const xml = await getXml({ srv: "event_profiles" /* Optionally: date_start: start, date_end: end */ });
    const norm = normalizeFromEventProfiles(xml);
    if (norm.length) return norm;
    // else fall through to public
  } catch (_) {
    // continue to public
  }

  // 2) Public-only fallback
  const xml = await getXml({ srv: "public_calendar_listing", dateStart: start, dateEnd: end });
  return normalizeFromPublicCalendar(xml);
}

async function fetchAttendance(eventId: string, occurYYYYMMDD: string, includeAttendees: boolean): Promise<AttendanceSummary | undefined> {
  const occurIso = DateTime.fromFormat(occurYYYYMMDD, "yyyyLLdd").toFormat("yyyy-LL-dd");
  const xml = await getXml({ srv: "attendance_profile", id: eventId, occurrence: occurIso });
  return normalizeAttendance(xml, includeAttendees);
}

async function main() {
  const { group, start, end, withNotes, includeAttendees } = argv;

  // Validate dates
  for (const [label, val] of [["start", start], ["end", end]] as const) {
    if (!DateTime.fromFormat(val, "yyyy-LL-dd").isValid) {
      console.error(`Invalid --${label} date. Use YYYY-MM-DD`);
      process.exit(1);
    }
  }

  const events = await fetchEventSet(group, start, end);
  const links = expandToLinks(events, group, start, end);

  if (withNotes && links.length) {
    // Throttle attendance_profile calls (sequential or light concurrency)
    const MAX_CONCURRENCY = 3;
    const queue = Array.from(links.entries());
    let active = 0;

    await new Promise<void>((resolve) => {
      const next = () => {
        if (queue.length === 0 && active === 0) return resolve();
        while (active < MAX_CONCURRENCY && queue.length) {
          const [idx, row] = queue.shift()!;
          active++;
          (async () => {
            try {
              const summary = await fetchAttendance(row.eventId, DateTime.fromFormat(row.occurDate, "yyyy-LL-dd").toFormat("yyyyLLdd"), includeAttendees);
              if (summary) links[idx].attendance = summary;
            } catch (e) {
              // swallow per-occurrence errors but keep going
            } finally {
              active--;
              // small gap to be nice to the API
              setTimeout(next, 200);
            }
          })();
        }
      };
      next();
    });
  }

  // Output JSON first (pretty)
  console.log(JSON.stringify(links, null, 2));

  // Then a simple list of links
  if (links.length) {
    console.log("");
    for (const r of links) console.log(r.link);
  } else {
    console.error(`No events found for group ${group} in range ${start} to ${end}.`);
  }
}

main().catch((err) => {
  console.error("Failed:", err?.message || err);
  process.exit(1);
});
