// Development lens for recognized "did not meet" reasons. The editable
// dynamic_questions data owns the form labels/options leaders see; this helper
// only categorizes known values for reporting.

export type DidNotMeetCategory = 'valid' | 'coaching' | 'other';

const KNOWN_DID_NOT_MEET_REASONS = [
  'Holiday weekend',
  'Leader out of town',
  'Low attendance',
  'Weather',
  'Other',
] as const;

export type DidNotMeetReason = (typeof KNOWN_DID_NOT_MEET_REASONS)[number];

export const DID_NOT_MEET_REASON_SET: ReadonlySet<string> = new Set(KNOWN_DID_NOT_MEET_REASONS);

// "valid"    — the break is understandable and outside the leader's control.
// "coaching" — a development signal worth a conversation (circle health, or
//              raising up an apprentice so the circle can meet without the leader).
// Anything not listed here — including any free-text "Other" explanation —
// reports as "other" so it shows up individually and gets read, not bucketed.
const REASON_CATEGORY: Record<string, DidNotMeetCategory> = {
  'Holiday weekend': 'valid',
  Weather: 'valid',
  'Leader out of town': 'coaching',
  'Low attendance': 'coaching',
};

export function categorizeDidNotMeetReason(reason: string | null | undefined): DidNotMeetCategory {
  const text = (reason ?? '').trim();
  if (!text) return 'other';
  return REASON_CATEGORY[text] ?? 'other';
}
