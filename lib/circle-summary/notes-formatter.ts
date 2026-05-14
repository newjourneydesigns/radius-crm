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
 * Note: CCB's display layer escapes apostrophes (`'` → `\'`). We replace
 * straight apostrophes with U+2019 (right single quotation mark) which
 * isn't escaped. Real newlines are preserved so leaders' formatting
 * (paragraph breaks, lists) carries through to CCB and the auto email.
 */
export function flattenForCCB(value: string): string {
  return value.replace(/\r\n/g, '\n').trim();
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
    for (const r of input.dynamicResponses) {
      const v = Array.isArray(r.value)
        ? r.value.map((x) => flattenForCCB(String(x))).join(', ')
        : typeof r.value === 'boolean'
          ? (r.value ? 'Yes' : 'No')
          : flattenForCCB(String(r.value ?? ''));
      if (!v) continue;
      sections.push(`${flattenForCCB(r.label)}:\n${v}`);
    }
  }

  if (input.manualAttendees?.length) {
    for (const p of input.manualAttendees) {
      const name = `${flattenForCCB(p.firstName)} ${flattenForCCB(p.lastName)}`.trim();
      const lines = ['Add New Person to Roster:', name, p.phone ?? '', p.email ?? '']
        .map((s) => (s ? flattenForCCB(String(s)) : ''))
        .filter(Boolean);
      sections.push(lines.join('\n'));
    }
  }

  if (input.infoUpdates?.length) {
    const lines = ['Requested Circle info updates (for ACPD review):'];
    for (const u of input.infoUpdates) {
      lines.push(`${u.field}: ${u.current || '(unset)'} → ${u.requested}`);
    }
    sections.push(lines.join('\n'));
  }

  return sections.join('\n\n').replace(/'/g, '’');
}
