/**
 * One-time import: fill gaps in circle_leaders from Tasha's "Active Summer Circles" CSV.
 *
 * Usage:
 *   npx ts-node scripts/import-summer-circles.ts <path-to-csv> [--apply] [--no-ccb]
 *
 * By default this runs as a DRY RUN and only prints what it *would* do.
 * Pass --apply to actually write to Supabase.
 * Pass --no-ccb to skip the CCB lookups for exact meeting times (faster, useful for a dry run).
 *
 * Requires (in .env.local or the environment):
 *   NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *   CCB_SUBDOMAIN, CCB_API_USERNAME, CCB_API_PASSWORD (unless --no-ccb)
 */

import 'dotenv/config';
import fs from 'fs';
import axios from 'axios';
import { XMLParser } from 'fast-xml-parser';
import { DateTime } from 'luxon';
import { createClient } from '@supabase/supabase-js';
import { extractCcbGroupId } from '../lib/ccbGroupId';

const APPLY = process.argv.includes('--apply');
const SKIP_CCB = process.argv.includes('--no-ccb');
const csvPath = process.argv.find((a, i) => i >= 2 && !a.startsWith('--'));

if (!csvPath) {
  console.error('Usage: npx ts-node scripts/import-summer-circles.ts <path-to-csv> [--apply] [--no-ccb]');
  process.exit(1);
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!supabaseUrl || !serviceKey) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// ---------- CSV parsing (handles quoted fields with embedded commas) ----------

function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current.trim());
  return result;
}

function parseCSV(text: string): { headers: string[]; rows: string[][] } {
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  const headers = parseCSVLine(lines[0]);
  const rows = lines.slice(1).map(parseCSVLine);
  return { headers, rows };
}

// ---------- Field mapping helpers ----------

const CIRCLE_TYPE_MAP: Record<string, string> = {
  "men's": "Men's",
  "women's": "Women's",
  'couples': 'Couples',
  "young adult men's": "YA | Men's",
  "young adult women's": "YA | Women's",
  'young adult coed': 'YA | Coed',
  'young adult couples': 'YA | Couples',
};

function mapCircleType(raw: string): string | null {
  const v = raw.trim().toLowerCase();
  return CIRCLE_TYPE_MAP[v] || (raw.trim() || null);
}

function mapFrequency(raw: string): string | null {
  const v = raw.trim();
  return v || null;
}

// CSV dates look like "6/7/26"
function parseStartDate(raw: string): string | null {
  const v = raw.trim();
  if (!v) return null;
  const dt = DateTime.fromFormat(v, 'M/d/yy');
  return dt.isValid ? dt.toISODate() : null;
}

function normalize(value: string | undefined | null): string | null {
  const v = (value ?? '').trim();
  return v.length > 0 ? v : null;
}

// ---------- CCB meeting time lookup ----------

const ccbCache = new Map<string, string | null>();

async function fetchMeetingTimeFromCCB(groupId: string): Promise<string | null> {
  if (ccbCache.has(groupId)) return ccbCache.get(groupId)!;

  const sub = process.env.CCB_SUBDOMAIN;
  const user = process.env.CCB_API_USERNAME;
  const pass = process.env.CCB_API_PASSWORD;
  if (!sub || !user || !pass) {
    ccbCache.set(groupId, null);
    return null;
  }

  try {
    const res = await axios.get(`https://${sub}.ccbchurch.com/api.php`, {
      params: { srv: 'group_profile_from_id', id: groupId, include_participants: 'false' },
      auth: { username: user, password: pass },
    });
    const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_' });
    const data = parser.parse(res.data);
    const g = data?.ccb_api?.response?.groups?.group;
    const rawTime = String(g?.meeting_time?.['#text'] ?? g?.meeting_time ?? '').trim();
    const hhmm = convertCCBTimeToHHMM(rawTime);
    ccbCache.set(groupId, hhmm);
    return hhmm;
  } catch (err: any) {
    console.warn(`  CCB lookup failed for group ${groupId}: ${err.message}`);
    ccbCache.set(groupId, null);
    return null;
  }
}

// Converts CCB's meeting_time (e.g. "7:00 PM", "07:00:00", "19:00") to "HH:MM:SS"
function convertCCBTimeToHHMM(raw: string): string | null {
  if (!raw) return null;

  // Already 24hr "HH:MM" or "HH:MM:SS"
  if (the24Match(raw)) {
    const [h, m] = raw.split(':');
    return `${h.padStart(2, '0')}:${m.padStart(2, '0')}:00`;
  }

  // "7:00 PM" / "7:00 AM"
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

// Helper to disambiguate the "already 24hr" case without AM/PM suffix
function the24Match(raw: string): boolean {
  return /^\d{1,2}:\d{2}(:\d{2})?$/.test(raw) && !/AM|PM/i.test(raw);
}

// ---------- Row shape ----------

interface SummerCircleRow {
  circleName: string | null;
  leaderName: string | null;
  coLeaderName: string | null;
  email: string | null;
  phone: string | null;
  campus: string | null;
  acpd: string | null;
  status: string | null;
  circleType: string | null;
  day: string | null;
  frequency: string | null;
  meetingStartDate: string | null;
  ccbGroupLink: string | null;
  ccbGroupId: string | null;
  leaderCcbProfileLink: string | null;
}

// Fields we'll fill in on an existing record only if currently blank.
const FILL_GAP_FIELDS: string[] = [
  'email', 'phone', 'campus', 'acpd', 'status', 'circle_type', 'day',
  'frequency', 'meeting_start_date', 'time', 'circle_name',
  'additional_leader_name', 'leader_ccb_profile_link', 'ccb_profile_link', 'ccb_group_id',
];

async function main() {
  const text = fs.readFileSync(csvPath!, 'utf-8');
  const { headers, rows } = parseCSV(text);

  // "Leader Name" appears twice (First Last, then Last, First) — use the first occurrence.
  const leaderNameIdx = headers.indexOf('Leader Name');
  const idx = (col: string) => headers.indexOf(col);

  const parsed: SummerCircleRow[] = rows.map((cols) => {
    const ccbGroupLink = normalize(cols[idx('CCB Circle/Group Link')]);
    return {
      circleName: normalize(cols[idx('Circle Name')]),
      leaderName: normalize(cols[leaderNameIdx]),
      coLeaderName: normalize(cols[idx('Co-Leader Name')]),
      email: normalize(cols[idx('Email')]),
      phone: normalize(cols[idx('Phone')]),
      campus: normalize(cols[idx('Campus')]),
      acpd: normalize(cols[idx('Director / ACPD')]),
      status: cols[idx('Status')] ? cols[idx('Status')].trim().toLowerCase() : null,
      circleType: mapCircleType(cols[idx('Circle Type')] || ''),
      day: normalize(cols[idx('Meeting Day')]),
      frequency: mapFrequency(cols[idx('Frequency')] || ''),
      meetingStartDate: parseStartDate(cols[idx('Bi-weekly Start Date')] || ''),
      ccbGroupLink,
      ccbGroupId: extractCcbGroupId(ccbGroupLink),
      leaderCcbProfileLink: normalize(cols[idx('Leader CCB Profile Link')]),
    };
  });

  console.log(`Parsed ${parsed.length} rows from ${csvPath}`);
  console.log(APPLY ? '*** APPLY MODE: writes will be made to Supabase ***' : 'Dry run (pass --apply to write changes)');

  // Pull all existing circle leaders once.
  const { data: existing, error } = await supabase
    .from('circle_leaders')
    .select('id, name, campus, ccb_group_id, email, phone, acpd, status, circle_type, day, frequency, meeting_start_date, time, circle_name, additional_leader_name, leader_ccb_profile_link, ccb_profile_link');

  if (error) {
    console.error('Failed to load circle_leaders:', error.message);
    process.exit(1);
  }

  let updated = 0;
  let inserted = 0;
  let ambiguous = 0;
  let unchanged = 0;

  for (const row of parsed) {
    if (!row.leaderName) continue;

    let matches = (existing || []).filter((l) => l.ccb_group_id && row.ccbGroupId && l.ccb_group_id === row.ccbGroupId);

    if (matches.length === 0) {
      matches = (existing || []).filter(
        (l) =>
          l.name?.trim().toLowerCase() === row.leaderName!.toLowerCase() &&
          (l.campus || '').trim().toLowerCase() === (row.campus || '').trim().toLowerCase()
      );
    }

    if (matches.length > 1) {
      console.log(`AMBIGUOUS: "${row.leaderName}" (${row.campus}) matched ${matches.length} existing records — skipping.`);
      ambiguous++;
      continue;
    }

    let time: string | null = null;
    if (!SKIP_CCB && row.ccbGroupId) {
      time = await fetchMeetingTimeFromCCB(row.ccbGroupId);
    }

    const newValues: Record<string, any> = {
      email: row.email,
      phone: row.phone,
      campus: row.campus,
      acpd: row.acpd,
      status: row.status,
      circle_type: row.circleType,
      day: row.day,
      frequency: row.frequency,
      meeting_start_date: row.meetingStartDate,
      time,
      circle_name: row.circleName,
      additional_leader_name: row.coLeaderName,
      leader_ccb_profile_link: row.leaderCcbProfileLink,
      ccb_profile_link: row.ccbGroupLink,
      ccb_group_id: row.ccbGroupId,
    };

    if (matches.length === 1) {
      const existingRow = matches[0] as Record<string, any>;
      const patch: Record<string, any> = {};

      for (const field of FILL_GAP_FIELDS) {
        const current = existingRow[field];
        const incoming = newValues[field];
        const isBlank = current === null || current === undefined || current === '';
        if (isBlank && incoming !== null && incoming !== undefined && incoming !== '') {
          patch[field] = incoming;
        }
      }

      if (Object.keys(patch).length === 0) {
        unchanged++;
        continue;
      }

      console.log(`UPDATE "${row.leaderName}" (${row.campus}, id=${existingRow.id}):`, patch);
      if (APPLY) {
        const { error: updateErr } = await supabase.from('circle_leaders').update(patch).eq('id', existingRow.id);
        if (updateErr) console.error(`  failed: ${updateErr.message}`);
      }
      updated++;
    } else {
      const insertRow: Record<string, any> = {
        leader_type: 'circle',
        name: row.leaderName,
        ...newValues,
        status: newValues.status || 'active',
        circle_name: newValues.circle_name || row.leaderName,
        event_summary_received: false,
      };

      console.log(`INSERT "${row.leaderName}" (${row.campus}):`, insertRow);
      if (APPLY) {
        const { error: insertErr } = await supabase.from('circle_leaders').insert([insertRow]);
        if (insertErr) console.error(`  failed: ${insertErr.message}`);
      }
      inserted++;
    }
  }

  console.log('\n--- Summary ---');
  console.log(`Matched & updated: ${updated}`);
  console.log(`Already up to date (no gaps): ${unchanged}`);
  console.log(`New circles inserted: ${inserted}`);
  console.log(`Ambiguous (skipped): ${ambiguous}`);
  if (!APPLY) console.log('\nThis was a dry run — re-run with --apply to write these changes.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
