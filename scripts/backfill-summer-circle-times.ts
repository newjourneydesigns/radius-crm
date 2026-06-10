/**
 * One-time backfill: pull exact meeting times from CCB for the circles
 * imported via scripts/sql/import-summer-circles.sql, and write them to
 * circle_leaders.time (replacing placeholder values like "Morning",
 * "Afternoon", "Evening", or blanks).
 *
 * Usage:
 *   npx ts-node scripts/backfill-summer-circle-times.ts [--apply]
 *
 * By default this runs as a DRY RUN and only prints what it *would* do.
 * Pass --apply to actually write to Supabase.
 *
 * Requires (in .env.local or the environment):
 *   NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *   CCB_SUBDOMAIN, CCB_API_USERNAME, CCB_API_PASSWORD
 */

import 'dotenv/config';
import axios from 'axios';
import { XMLParser } from 'fast-xml-parser';
import { createClient } from '@supabase/supabase-js';
import { DateTime } from 'luxon';
import WS from 'ws';

if (typeof globalThis.WebSocket === 'undefined') {
  (globalThis as any).WebSocket = WS;
}

const APPLY = process.argv.includes('--apply');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!supabaseUrl || !serviceKey) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const sub = process.env.CCB_SUBDOMAIN;
const user = process.env.CCB_API_USERNAME;
const pass = process.env.CCB_API_PASSWORD;
if (!sub || !user || !pass) {
  console.error('Missing CCB_SUBDOMAIN, CCB_API_USERNAME, or CCB_API_PASSWORD');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// CCB group IDs for the 161 circles imported via import-summer-circles.sql
const GROUP_IDS = [
  '145','148','154','155','158','162','163','198','200','205','206','208','211','212','213','219',
  '222','230','236','244','255','257','265','271','274','287','295','300','316','324','330','506',
  '507','575','580','600','620','625','641','655','672','674','675','678','679','708','711','714',
  '715','744','748','775','778','859','1054','1072','1079','1118','1132','1151','1245','1257','1330',
  '1360','1404','1407','1475','1489','1509','1572','1613','1754','1839','1847','1848','1849','1860',
  '1866','1888','1996','2108','2110','2139','2164','2255','2300','2307','2319','2323','2347','2403',
  '2420','2554','2555','2598','2599','2601','2602','2604','2732','2816','2834','2838','2839','2845',
  '2846','2913','2914','3000','3005','3007','3008','3088','3090','3091','3134','3143','3180','3212',
  '3221','3222','3233','3267','3304','3357','3358','3365','3371','3381','3383','3387','3388','3389',
  '3406','3415','3433','3436','3465','3516','3520','3540','3552','3663','3664','3666','3674','3679',
  '3680','3681','3682','3734','3736','3743','3796','3797','3798','3807','3831','3848','3887','3899',
];

// Placeholder values that should be overwritten even though they're "non-blank"
const PLACEHOLDER_TIMES = new Set(['morning', 'afternoon', 'evening']);

// Converts CCB's meeting_time (e.g. "7:00 PM", "07:00:00", "19:00") to "HH:MM:SS"
function convertCCBTimeToHHMM(raw: string): string | null {
  if (!raw) return null;

  if (the24Match(raw)) {
    const [h, m] = raw.split(':');
    return `${h.padStart(2, '0')}:${m.padStart(2, '0')}:00`;
  }

  const ampm = raw.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (ampm) {
    let hour = parseInt(ampm[1], 10);
    const minute = ampm[2];
    const meridiem = ampm[3].toUpperCase();
    if (meridiem === 'PM' && hour !== 12) hour += 12;
    if (meridiem === 'AM' && hour === 12) hour = 0;
    return `${String(hour).padStart(2, '0')}:${minute}:00`;
  }

  return null;
}

function the24Match(raw: string): boolean {
  return /^\d{1,2}:\d{2}(:\d{2})?$/.test(raw) && !/AM|PM/i.test(raw);
}

async function fetchGroupInfo(groupId: string): Promise<{ time: string | null; calendarFeed: string | null }> {
  try {
    const res = await axios.get(`https://${sub}.ccbchurch.com/api.php`, {
      params: { srv: 'group_profile_from_id', id: groupId, include_participants: 'false' },
      auth: { username: user!, password: pass! },
    });
    const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_' });
    const data = parser.parse(res.data);
    const g = data?.ccb_api?.response?.groups?.group;
    const rawTime = String(g?.meeting_time?.['#text'] ?? g?.meeting_time ?? '').trim();
    const calendarFeed = String(g?.calendar_feed ?? '').trim() || null;
    return { time: convertCCBTimeToHHMM(rawTime), calendarFeed };
  } catch (err: any) {
    console.warn(`  CCB lookup failed for group ${groupId}: ${err.message}`);
    return { time: null, calendarFeed: null };
  }
}

// One recurring meeting event parsed out of an iCal feed.
interface IcsEvent {
  dtstart: string; // YYYYMMDDTHHMMSS, local wall-clock time
  until?: string; // YYYYMMDD, end of recurrence (if any)
  created?: string; // YYYYMMDDTHHMMSS
}

function parseIcsEvents(ics: string): IcsEvent[] {
  const events: IcsEvent[] = [];
  for (const block of ics.split('BEGIN:VEVENT').slice(1)) {
    const dtstart = block.match(/DTSTART(?:;[^:\r\n]*)?:(\d{8}T\d{6})/)?.[1];
    if (!dtstart) continue;
    const until = block.match(/RRULE:[^\r\n]*UNTIL=(\d{8})/)?.[1];
    const created = block.match(/CREATED:(\d{8}T\d{6})/)?.[1];
    events.push({ dtstart, until, created });
  }
  return events;
}

// Picks the event whose recurrence covers today, falling back to the
// most recently created event if none are currently active.
function pickBestEvent(events: IcsEvent[]): IcsEvent | null {
  if (events.length === 0) return null;
  const today = DateTime.now().toFormat('yyyyMMdd');
  const active = events.filter((e) => e.dtstart.slice(0, 8) <= today && today <= (e.until || '99991231'));
  const pool = active.length > 0 ? active : events;
  return pool.reduce((best, cur) => ((cur.created || cur.dtstart) > (best.created || best.dtstart) ? cur : best));
}

async function fetchMeetingTimeFromIcs(feedUrl: string): Promise<string | null> {
  try {
    const httpsUrl = feedUrl.replace(/^webcal:/, 'https:');
    const res = await axios.get(httpsUrl, { auth: { username: user!, password: pass! } });
    const best = pickBestEvent(parseIcsEvents(String(res.data)));
    if (!best) return null;
    const time = best.dtstart.split('T')[1];
    return `${time.slice(0, 2)}:${time.slice(2, 4)}:${time.slice(4, 6)}`;
  } catch (err: any) {
    console.warn(`  iCal lookup failed: ${err.message}`);
    return null;
  }
}

async function main() {
  console.log(APPLY ? '*** APPLY MODE: writes will be made to Supabase ***' : 'Dry run (pass --apply to write changes)');
  console.log(`Checking ${GROUP_IDS.length} circles...\n`);

  const { data: existing, error } = await supabase
    .from('circle_leaders')
    .select('id, name, circle_name, ccb_group_id, time')
    .in('ccb_group_id', GROUP_IDS);

  if (error) {
    console.error('Failed to load circle_leaders:', error.message);
    process.exit(1);
  }

  const byGroupId = new Map((existing || []).map((r: any) => [r.ccb_group_id, r]));

  let updated = 0;
  let skipped = 0;
  let noTimeFromCcb = 0;
  let notFound = 0;

  for (const groupId of GROUP_IDS) {
    const row = byGroupId.get(groupId) as Record<string, any> | undefined;
    if (!row) {
      console.log(`NOT FOUND: ccb_group_id=${groupId}`);
      notFound++;
      continue;
    }

    const current = (row.time || '').trim().toLowerCase();
    if (current && !PLACEHOLDER_TIMES.has(current)) {
      skipped++;
      continue;
    }

    const { time: ccbTime, calendarFeed } = await fetchGroupInfo(groupId);
    const time = ccbTime || (calendarFeed ? await fetchMeetingTimeFromIcs(calendarFeed) : null);
    if (!time) {
      console.log(`NO CCB TIME: "${row.circle_name || row.name}" (ccb_group_id=${groupId})`);
      noTimeFromCcb++;
      continue;
    }

    console.log(`UPDATE "${row.circle_name || row.name}" (id=${row.id}, ccb_group_id=${groupId}): time "${row.time || ''}" -> "${time}"`);
    if (APPLY) {
      const { error: updateErr } = await supabase.from('circle_leaders').update({ time }).eq('id', row.id);
      if (updateErr) console.error(`  failed: ${updateErr.message}`);
    }
    updated++;
  }

  console.log('\n--- Summary ---');
  console.log(`Updated: ${updated}`);
  console.log(`Already had a real time (skipped): ${skipped}`);
  console.log(`CCB had no meeting time set: ${noTimeFromCcb}`);
  console.log(`Not found in circle_leaders: ${notFound}`);
  if (!APPLY) console.log('\nThis was a dry run — re-run with --apply to write these changes.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
