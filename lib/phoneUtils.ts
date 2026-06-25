/**
 * Normalize a phone number string to digits only (E.164 compatible subset).
 * Strips formatting characters and collapses 11-digit US numbers to 10 digits
 * so that "+12145551234", "12145551234", "(214) 555-1234", and "214-555-1234"
 * all produce the same string for matching purposes.
 */
export function normalizePhone(raw: string): string {
  let digits = raw.replace(/[^+\d]/g, '');
  // Strip leading country code for US numbers
  if (digits.startsWith('+1') && digits.length === 12) digits = digits.slice(2);
  if (digits.startsWith('1') && digits.length === 11) digits = digits.slice(1);
  return digits;
}
