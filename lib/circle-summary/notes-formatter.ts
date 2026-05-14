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
export function formatNotesForCCB(input: {
  baseNotes: string;
  manualAttendees?: ManualAttendee[];
  dynamicResponses?: DynamicResponse[];
  infoUpdates?: InfoUpdate[];
  didNotMeetReason?: string;
}): string {
  const sections: string[] = [];

  if (input.didNotMeetReason) {
    sections.push(`Reason we didn’t meet: ${input.didNotMeetReason.trim()}`);
  }

  if (input.baseNotes?.trim()) {
    // CCB displays actual newlines as literal "\n" — collapse paragraph breaks
    // to a visual separator and strip lone newlines.
    const flatNotes = input.baseNotes
      .trim()
      .replace(/\n{2,}/g, '  ||  ')
      .replace(/\n/g, ' ');
    sections.push(flatNotes);
  }

  if (input.dynamicResponses?.length) {
    const items = input.dynamicResponses.map((r) => {
      const v = Array.isArray(r.value)
        ? r.value.join(', ')
        : typeof r.value === 'boolean'
          ? (r.value ? 'Yes' : 'No')
          : String(r.value ?? '');
      return `${r.label}: ${v}`;
    });
    sections.push(`Additional questions — ${items.join(' · ')}`);
  }

  if (input.manualAttendees?.length) {
    const items = input.manualAttendees.map((p) => {
      const contact = [p.phone, p.email].filter(Boolean).join(' / ');
      return `${p.firstName} ${p.lastName}${contact ? ` (${contact})` : ''}`;
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
