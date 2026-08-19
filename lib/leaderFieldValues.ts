import { convertAMPMTo24Hour } from './timeUtils';

/**
 * Canonical forms for the circle-leader fields that CCB and RADIUS both write.
 *
 * The same meeting can be spelled several ways — "7:00 PM" / "19:00",
 * "1st & 3rd" / "1st, 3rd", "Young Adult | Co-Ed" / "YA | Co-Ed" — and RADIUS
 * has settled on one of each. Anything comparing a CCB value against a stored
 * one has to reduce both first, or equivalent values read as differences.
 */

/**
 * The CCB "Circle Location" classification options — where a circle meets.
 * These mirror the pulldown defined in CCB's admin UI; the sync stores whatever
 * CCB sends, so a value outside this list still displays fine.
 */
export const CIRCLE_LOCATION_OPTIONS = ['Campus Circle', 'City Circle', 'Online Circle'] as const;

/** Collapse "Young Adult | X" to the "YA | X" form RADIUS stores. */
export const normalizeCircleTypeValue = (value: string | null | undefined): string => {
  const raw = (value || '').trim();
  if (!raw) return '';
  const m = raw.match(/^Young\s*Adult\s*\|\s*(.+)$/i);
  if (m && m[1]) return `YA | ${m[1].trim()}`;
  return raw;
};

/** "2nd & 4th" → "2nd, 4th"; also tidies spacing around the separators. */
export const normalizeFrequencyValue = (value: string | null | undefined): string => {
  const raw = (value || '').trim();
  if (!raw) return '';
  return raw
    .replace(/\s*&\s*/g, ', ')
    .replace(/\s*,\s*/g, ', ')
    .replace(/\s+/g, ' ');
};

/** "7:00 PM" → "19:00"; drops a trailing ":ss". Passes anything else through. */
export const normalizeTimeValue = (value: string | null | undefined): string => {
  const raw = (value || '').trim();
  if (!raw) return '';
  const asDay = convertAMPMTo24Hour(raw.toUpperCase().replace(/\s+/g, ' '));
  const m = asDay.match(/^(\d{1,2}):(\d{2})/);
  if (!m) return raw;
  return `${m[1].padStart(2, '0')}:${m[2]}`;
};

/** Field-aware canonical form, for both comparison and storage. */
export const normalizeLeaderFieldValue = (field: string, value: unknown): unknown => {
  if (Array.isArray(value)) return value;
  if (value === null || value === undefined) return value;

  const raw = String(value);
  switch (field) {
    case 'circle_type':
      return normalizeCircleTypeValue(raw);
    case 'frequency':
      return normalizeFrequencyValue(raw);
    case 'time':
      return normalizeTimeValue(raw);
    default:
      return raw.trim();
  }
};

/**
 * Do these two values mean the same thing for this field? Case-insensitive:
 * CCB's casing drifts ("Bi-Weekly" vs "Bi-weekly") and a case-only change is
 * never worth showing someone as a pending edit.
 */
export const isSameLeaderFieldValue = (field: string, a: unknown, b: unknown): boolean => {
  const reduce = (v: unknown) => {
    const normalized = normalizeLeaderFieldValue(field, v);
    if (Array.isArray(normalized)) return normalized.map(String).join(', ');
    return String(normalized ?? '').trim().toLowerCase();
  };
  return reduce(a) === reduce(b);
};
