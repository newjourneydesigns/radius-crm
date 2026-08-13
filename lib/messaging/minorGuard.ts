/**
 * Age gate for outbound texting (Bulk Message + Campaigns).
 *
 * RADIUS texts from rosters that mix adults and students, so anyone we can
 * establish is under 18 is held back from every send path — manual send,
 * per-person send, and Auto Send — and listed separately with the reason.
 *
 * The gate is only as good as the data behind it. Someone with no birthdate and
 * no age on file is NOT blocked, because there is nothing to block on; callers
 * surface that count so the list never implies more verification than happened.
 */

import { DateTime } from 'luxon';
import { APP_TIME_ZONE } from '../dateUtils';

/** Age at which someone can be texted. Below this, sending is blocked. */
export const ADULT_AGE = 18;

/** Nobody in a church roster is older than this — a bigger number is bad data. */
const MAX_PLAUSIBLE_AGE = 120;

const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
};

/** Normalize a spreadsheet header for matching: "Birth Date" -> "birth date". */
function normalizeHeader(header: string): string {
  return header.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

const BIRTHDATE_HEADERS = new Set([
  'birthdate', 'birth date', 'birthday', 'date of birth', 'dob', 'b day', 'bday',
]);

const AGE_HEADERS = new Set([
  'age', 'current age', 'age years', 'years old', 'age in years',
]);

export function isBirthdateHeader(header: string): boolean {
  return BIRTHDATE_HEADERS.has(normalizeHeader(header));
}

export function isAgeHeader(header: string): boolean {
  return AGE_HEADERS.has(normalizeHeader(header));
}

/**
 * Expand a two-digit year. A birthdate is always in the past, so a year at or
 * below the current two-digit year is this century ("08" -> 2008) and anything
 * above it is last century ("95" -> 1995).
 */
function expandTwoDigitYear(yy: number, currentYear: number): number {
  const currentYY = currentYear % 100;
  return yy <= currentYY ? 2000 + yy : 1900 + yy;
}

/**
 * Parse a birthdate into calendar parts. Handles the formats these lists
 * actually arrive in: CCB's `YYYY-MM-DD`, spreadsheet `M/D/YYYY` and `M/D/YY`,
 * and written-out `Mar 4, 1998`.
 *
 * Returns null for a birthdate with no year (CCB stores month/day-only
 * birthdays for people who withheld the year) — a year-less date says nothing
 * about age.
 */
export function parseBirthdate(
  raw: string | null | undefined,
  now: DateTime = DateTime.now().setZone(APP_TIME_ZONE),
): { year: number; month: number; day: number } | null {
  if (!raw) return null;
  const trimmed = String(raw).trim();
  if (!trimmed) return null;

  let year: number | undefined;
  let month: number | undefined;
  let day: number | undefined;

  // ISO-ish: 1998-03-04 (also matches a leading date in a timestamp)
  const iso = trimmed.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (iso) {
    year = Number(iso[1]);
    month = Number(iso[2]);
    day = Number(iso[3]);
  }

  // US slash/dot format: 3/4/1998, 03-04-98, 3.4.1998
  if (year === undefined) {
    const us = trimmed.match(/^(\d{1,2})[/.-](\d{1,2})(?:[/.-](\d{2,4}))?$/);
    if (us) {
      month = Number(us[1]);
      day = Number(us[2]);
      if (!us[3]) return null; // month/day only — no age to derive
      const rawYear = Number(us[3]);
      year = us[3].length <= 2 ? expandTwoDigitYear(rawYear, now.year) : rawYear;
    }
  }

  // Written out: "Mar 4, 1998" / "4 March 1998"
  if (year === undefined) {
    const named = trimmed.match(/^([a-z]+)\s+(\d{1,2}),?\s+(\d{4})$/i);
    const namedAlt = trimmed.match(/^(\d{1,2})\s+([a-z]+),?\s+(\d{4})$/i);
    if (named) {
      month = MONTHS[named[1].slice(0, 3).toLowerCase()];
      day = Number(named[2]);
      year = Number(named[3]);
    } else if (namedAlt) {
      day = Number(namedAlt[1]);
      month = MONTHS[namedAlt[2].slice(0, 3).toLowerCase()];
      year = Number(namedAlt[3]);
    }
  }

  if (!year || !month || !day) return null;
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  // CCB writes 1900-01-01 for "unknown"; a future year is bad data either way.
  if (year <= 1900 || year > now.year) return null;

  return { year, month, day };
}

/** Whole years between a birthdate and today, or null when it can't be read. */
export function ageFromBirthdate(
  raw: string | null | undefined,
  now: DateTime = DateTime.now().setZone(APP_TIME_ZONE),
): number | null {
  const parts = parseBirthdate(raw, now);
  if (!parts) return null;
  const born = DateTime.fromObject(parts, { zone: APP_TIME_ZONE });
  if (!born.isValid) return null;
  const age = Math.floor(now.diff(born, 'years').years);
  if (age < 0 || age > MAX_PLAUSIBLE_AGE) return null;
  return age;
}

/** Read an explicit age cell: "17", "17.0", "17 yrs". */
export function parseAgeValue(raw: string | number | null | undefined): number | null {
  if (raw === null || raw === undefined) return null;
  const match = String(raw).trim().match(/^(\d{1,3})(?:\.\d+)?\s*(?:y(?:ea)?rs?(?:\s*old)?)?$/i);
  if (!match) return null;
  const age = Number(match[1]);
  if (!Number.isFinite(age) || age < 0 || age > MAX_PLAUSIBLE_AGE) return null;
  return age;
}

/**
 * Pull an age out of a free-form column map (a pasted roster's extra columns).
 * A birthdate column wins over an age column: it stays correct as time passes,
 * while a typed-in age is a snapshot from whenever the sheet was exported.
 */
export function ageFromAttributes(
  attributes: Record<string, unknown> | null | undefined,
  now: DateTime = DateTime.now().setZone(APP_TIME_ZONE),
): number | null {
  if (!attributes) return null;

  // Multi-valued cells (the same person listed twice) — the youngest value is
  // the safe read, since blocking is the conservative outcome.
  const cells = (value: unknown): string[] =>
    (Array.isArray(value) ? value : [value])
      .map(v => (v == null ? '' : String(v).trim()))
      .filter(Boolean);

  let youngest: number | null = null;
  const consider = (age: number | null) => {
    if (age === null) return;
    if (youngest === null || age < youngest) youngest = age;
  };

  for (const [key, value] of Object.entries(attributes)) {
    if (!isBirthdateHeader(key)) continue;
    for (const cell of cells(value)) consider(ageFromBirthdate(cell, now));
  }
  if (youngest !== null) return youngest;

  for (const [key, value] of Object.entries(attributes)) {
    if (!isAgeHeader(key)) continue;
    for (const cell of cells(value)) consider(parseAgeValue(cell));
  }
  return youngest;
}

/** True only when we know the age AND it is under 18. Unknown is not a minor. */
export function isMinor(age: number | null | undefined): boolean {
  return typeof age === 'number' && age < ADULT_AGE;
}

// ─── Why a person can't be texted ─────────────────────────────────────────────

export type SendBlockReason = 'minor' | 'no_phone';

export interface SendBlock {
  reason: SendBlockReason;
  /** The reason itself, short enough for a pill next to the name. */
  label: string;
  /** What the reason rests on ("16 years old"). Empty when there's nothing to add. */
  evidence: string;
}

export const MINOR_BLOCK_LABEL = 'Under 18';

export function minorBlock(age: number | null): SendBlock {
  return {
    reason: 'minor',
    label: MINOR_BLOCK_LABEL,
    evidence: age === null ? '' : `${age} years old`,
  };
}

export function noPhoneBlock(): SendBlock {
  return { reason: 'no_phone', label: 'No phone', evidence: '' };
}

/** Reason and evidence as one string, for exports and tooltips. */
export function blockSummary(block: SendBlock): string {
  return block.evidence ? `${block.label} (${block.evidence})` : block.label;
}

/**
 * Why this person can't be texted, or null when they can be.
 *
 * Age is checked first: a minor stays blocked whether or not we have a number
 * for them, and that's the reason worth showing.
 */
export function sendBlockFor(input: { age: number | null; phone: string }): SendBlock | null {
  if (isMinor(input.age)) return minorBlock(input.age);
  if (!input.phone.trim()) return noPhoneBlock();
  return null;
}
