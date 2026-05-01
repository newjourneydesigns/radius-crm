export type TextContact =
  | { type: 'phone'; value: string; digits: string }
  | { type: 'email'; value: string };

const EMAIL_REGEX = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;
const PHONE_REGEX = /(?:\+?1[\s.-]?)?(?:\(\d{3}\)|\d{3})[\s.-]?\d{3}[\s.-]?\d{4}\b/g;

export function stripHtmlToPlainText(content: string): string {
  return content
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<\/div>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/\s+\n/g, '\n')
    .replace(/\n\s+/g, '\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}

export function extractTextContacts(content: string): TextContact[] {
  const plainText = stripHtmlToPlainText(content);
  if (!plainText) return [];

  const contacts: TextContact[] = [];
  const seenPhones = new Set<string>();
  const seenEmails = new Set<string>();

  for (const match of plainText.matchAll(EMAIL_REGEX)) {
    const value = match[0].trim();
    const normalized = value.toLowerCase();
    if (!seenEmails.has(normalized)) {
      seenEmails.add(normalized);
      contacts.push({ type: 'email', value });
    }
  }

  for (const match of plainText.matchAll(PHONE_REGEX)) {
    const value = match[0].trim();
    const digits = value.replace(/\D/g, '');
    if (digits.length < 10 || seenPhones.has(digits)) continue;
    seenPhones.add(digits);
    contacts.push({ type: 'phone', value, digits });
  }

  return contacts;
}