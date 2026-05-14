/**
 * Builds the final `notes` string pushed to CCB for an event summary.
 *
 * CCB only has flat text fields (topic, notes, prayer_requests, info), so
 * extras like dynamic question responses, manual roster additions, and
 * info-update requests are appended to the notes blob as structured text
 * so they're visible to leadership in CCB and in the auto email.
 */

export type ManualAttendee = {
  firstName: string;
  lastName: string;
  phone?: string | null;
  email?: string | null;
};

export type DynamicResponse = {
  label: string;
  value: string | string[] | boolean;
};

export type InfoUpdate = {
  field: 'Meeting day' | 'Meeting time' | 'Meeting location';
  current: string;
  requested: string;
};

/**
 * Note: CCB's display layer escapes newlines (showing them as literal "\n")
 * and adds backslashes in front of apostrophes. To keep the output readable,
 * we compose everything as a single line with pipe separators between
 * sections and " · " between list items inside a section.
 *
 * Apostrophes are replaced with U+2019 (right single quotation mark) which
 * isn't escaped by CCB's display layer.
 */
// CCB's display layer renders real newlines as the literal characters "\n".
// Flatten any string heading into the notes blob: paragraph breaks become a
// visible separator, lone newlines become a single space.
export function flattenForCCB(value: string): string {
  return value
    .replace(/\r\n/g, '\n')
    .replace(/\n{2,}/g, '  ||  ')
    .replace(/\n/g, ' ')
    .trim();
}

export function formatNotesForCCB(input: {
  baseNotes: string;
  manualAttendees?: ManualAttendee[];
  dynamicResponses?: DynamicResponse[];
  infoUpdates?: InfoUpdate[];
  didNotMeetReason?: string;
}): string {
  const sections: string[] = [];

  if (input.didNotMeetReason) {
    sections.push(`Reason we didn’t meet: ${flattenForCCB(input.didNotMeetReason)}`);
  }

  if (input.baseNotes?.trim()) {
    sections.push(flattenForCCB(input.baseNotes));
  }

  if (input.dynamicResponses?.length) {
    const items = input.dynamicResponses.map((r) => {
      const v = Array.isArray(r.value)
        ? r.value.map((x) => flattenForCCB(String(x))).join(', ')
        : typeof r.value === 'boolean'
          ? (r.value ? 'Yes' : 'No')
          : flattenForCCB(String(r.value ?? ''));
      return `${flattenForCCB(r.label)}: ${v}`;
    });
    sections.push(`Additional questions — ${items.join(' · ')}`);
  }

  if (input.manualAttendees?.length) {
    const items = input.manualAttendees.map((p) => {
      const contact = [p.phone, p.email].filter(Boolean).map((x) => flattenForCCB(String(x))).join(' / ');
      const name = `${flattenForCCB(p.firstName)} ${flattenForCCB(p.lastName)}`.trim();
      return `${name}${contact ? ` (${contact})` : ''}`;
    });
    sections.push(`New people to add to roster (action needed) — ${items.join(' · ')}`);
  }

  if (input.infoUpdates?.length) {
    const items = input.infoUpdates.map(
      (u) => `${u.field}: ${u.current || '(unset)'} → ${u.requested}`
    );
    sections.push(`Requested Circle info updates (for ACPD review) — ${items.join(' · ')}`);
  }

  // CCB display escapes apostrophes — use the typographic right single quote
  return sections.join('  ||  ').replace(/'/g, '’');
}
