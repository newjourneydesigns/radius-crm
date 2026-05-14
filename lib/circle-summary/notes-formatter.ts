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

const ROSTER_ADD_HEADER = 'Add New Person to Roster:';

/**
 * Note: CCB's display layer escapes apostrophes (`'` → `\'`). We replace
 * straight apostrophes with U+2019 (right single quotation mark) which
 * isn't escaped. Real newlines are preserved so leaders' formatting
 * (paragraph breaks, lists) carries through to CCB and the auto email.
 */
export function flattenForCCB(value: string): string {
  return normalizeSummaryText(value).trim();
}

export function normalizeSummaryText(value: string | null | undefined): string {
  return String(value ?? '')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/\\n/g, '\n');
}

function inlineForCCBEmail(value: string | null | undefined): string {
  return normalizeSummaryText(value)
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .join(' ')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

export function splitLegacyRosterAdditions(notes: string | null | undefined): {
  notes: string;
  manualAttendees: ManualAttendee[];
} {
  const lines = normalizeSummaryText(notes).split('\n');
  const kept: string[] = [];
  const manualAttendees: ManualAttendee[] = [];

  for (let i = 0; i < lines.length; i += 1) {
    if (lines[i].trim() !== ROSTER_ADD_HEADER) {
      kept.push(lines[i]);
      continue;
    }

    const block: string[] = [];
    i += 1;
    while (i < lines.length) {
      const line = lines[i].trim();
      if (line === ROSTER_ADD_HEADER) {
        i -= 1;
        break;
      }
      if (!line) break;
      block.push(line);
      i += 1;
    }

    const [nameLine = '', ...contactLines] = block;
    const [firstName = '', ...lastParts] = nameLine.split(/\s+/).filter(Boolean);
    const lastName = lastParts.join(' ');
    const email = contactLines.find((line) => line.includes('@')) || '';
    const phone = contactLines.find((line) => !line.includes('@')) || '';

    if (firstName || lastName || phone || email) {
      manualAttendees.push({ firstName, lastName, phone, email });
    }
  }

  return {
    notes: kept.join('\n').replace(/\n{3,}/g, '\n\n').trim(),
    manualAttendees,
  };
}

export function mergeManualAttendees(
  existing: unknown,
  parsed: ManualAttendee[]
): ManualAttendee[] {
  const combined = [
    ...(Array.isArray(existing) ? (existing as ManualAttendee[]) : []),
    ...parsed,
  ];
  const seen = new Set<string>();
  const merged: ManualAttendee[] = [];

  for (const person of combined) {
    const firstName = normalizeSummaryText(person?.firstName).trim();
    const lastName = normalizeSummaryText(person?.lastName).trim();
    const phone = normalizeSummaryText(person?.phone).trim();
    const email = normalizeSummaryText(person?.email).trim();
    if (!firstName && !lastName && !phone && !email) continue;

    const key = [
      `${firstName} ${lastName}`.trim().toLowerCase(),
      phone.replace(/\D/g, ''),
      email.toLowerCase(),
    ]
      .filter(Boolean)
      .join('|');

    if (seen.has(key)) continue;
    seen.add(key);
    merged.push({ firstName, lastName, phone, email });
  }

  return merged;
}

export function cleanManualAttendees(attendees: unknown): ManualAttendee[] {
  return mergeManualAttendees(attendees, []);
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
    sections.push(`Reason we didn’t meet: ${inlineForCCBEmail(input.didNotMeetReason)}`);
  }

  if (input.baseNotes?.trim()) {
    sections.push(inlineForCCBEmail(input.baseNotes));
  }

  if (input.dynamicResponses?.length) {
    for (const r of input.dynamicResponses) {
      const v = Array.isArray(r.value)
        ? r.value.map((x) => inlineForCCBEmail(String(x))).join(', ')
        : typeof r.value === 'boolean'
          ? (r.value ? 'Yes' : 'No')
          : inlineForCCBEmail(String(r.value ?? ''));
      if (!v) continue;
      sections.push(`${inlineForCCBEmail(r.label)}: ${v}`);
    }
  }

  if (input.manualAttendees?.length) {
    const people: string[] = [];
    for (const p of input.manualAttendees) {
      const name = `${inlineForCCBEmail(p.firstName)} ${inlineForCCBEmail(p.lastName)}`.trim();
      if (!name && !p.phone && !p.email) continue;
      const details = [
        name || 'New person',
        p.phone ? `Phone: ${inlineForCCBEmail(String(p.phone))}` : '',
        p.email ? `Email: ${inlineForCCBEmail(String(p.email))}` : '',
      ].filter(Boolean);
      people.push(details.join(', '));
    }
    if (people.length) sections.push(`Roster add requests: ${people.join('; ')}`);
  }

  if (input.infoUpdates?.length) {
    const lines: string[] = [];
    for (const u of input.infoUpdates) {
      lines.push(`${u.field}: ${u.current || '(unset)'} → ${u.requested}`);
    }
    if (lines.length) {
      sections.push(`Requested Circle info updates (for ACPD review): ${lines.join('; ')}`);
    }
  }

  return sections.filter(Boolean).join(' | ').replace(/'/g, '’');
}
