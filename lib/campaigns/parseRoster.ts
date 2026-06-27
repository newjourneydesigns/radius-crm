// Parse a pasted spreadsheet roster into structured people, with column mapping.
//
// Admins receive spreadsheets (e.g. a CCB people export) and paste them in instead
// of pointing at a CCB group. Exports vary in column order and naming, so we parse
// the paste into a generic table, let the admin map each column to a known field,
// and auto-guess that mapping from the header row. Pasting from Excel/Sheets yields
// tab-separated cells; CSV yields commas. We tolerate quoted cells and a header row.

export type RosterFieldKey = 'ccbId' | 'firstName' | 'lastName' | 'phone' | 'email';

export interface RosterField {
  key: RosterFieldKey;
  label: string;
  required?: boolean;
  hint?: string;
}

// The core identity fields we map to dedicated columns (used for matching).
// Every OTHER pasted column is kept as a free-form attribute you can group by.
export const ROSTER_FIELDS: RosterField[] = [
  { key: 'firstName', label: 'First name', required: true },
  { key: 'lastName', label: 'Last name', required: true },
  { key: 'ccbId', label: 'CCB Individual ID', hint: 'Best match to form responses' },
  { key: 'email', label: 'Email' },
  { key: 'phone', label: 'Phone' },
];

export type RosterMapping = Record<RosterFieldKey, number | null>;

export const EMPTY_MAPPING: RosterMapping = {
  ccbId: null,
  firstName: null,
  lastName: null,
  phone: null,
  email: null,
};

export interface ParsedTable {
  headers: string[]; // header labels, or "Column N" when no header row is detected
  rows: string[][]; // data rows, each padded to columnCount
  hasHeader: boolean;
  columnCount: number;
}

export interface PastedPerson {
  ccbId: string;
  firstName: string;
  lastName: string;
  phone: string; // raw as pasted — normalized server-side
  email: string;
  // Every non-core column, keyed by its header (Campus, Team, Age, …). These are
  // group-able dimensions in the campaign view.
  attributes: Record<string, string>;
}

function stripCell(cell: string): string {
  let s = cell.trim();
  if (s.length >= 2 && s.startsWith('"') && s.endsWith('"')) {
    s = s.slice(1, -1).replace(/""/g, '"').trim();
  }
  return s;
}

// Quote-aware comma split so a quoted field with an internal comma
// (e.g. "Flower Mound, North") stays a single cell.
function splitCsv(line: string): string[] {
  const out: string[] = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') { cur += '"'; i++; }
        else inQuotes = false;
      } else cur += ch;
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      out.push(cur);
      cur = '';
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out;
}

// A row is a header if it carries column-name words and no data-like digits.
function isHeaderRow(cells: string[]): boolean {
  if (cells.some((c) => /\d/.test(c))) return false;
  return cells.some((c) =>
    /first|last|name|phone|mobile|cell|email|campus|team|individual|^id$|ministry/i.test(c.trim()),
  );
}

export function parseTable(input: string): ParsedTable {
  const lines = input
    .split(/\r?\n/)
    .map((l) => l.replace(/\r$/, ''))
    .filter((l) => l.trim().length > 0);

  if (lines.length === 0) {
    return { headers: [], rows: [], hasHeader: false, columnCount: 0 };
  }

  // Pick one delimiter from the first line and apply it to every row so columns line up.
  const useTab = lines[0].includes('\t');
  const useComma = !useTab && lines[0].includes(',');
  const split = (line: string): string[] =>
    useTab ? line.split('\t').map(stripCell)
    : useComma ? splitCsv(line).map(stripCell)
    : line.trim().split(/\s{2,}/).map(stripCell);

  const allCells = lines.map(split);
  const columnCount = allCells.reduce((max, c) => Math.max(max, c.length), 0);
  const hasHeader = isHeaderRow(allCells[0]);
  const headerCells = hasHeader ? allCells[0] : [];

  const headers = Array.from({ length: columnCount }, (_, i) =>
    hasHeader && headerCells[i]?.trim() ? headerCells[i].trim() : `Column ${i + 1}`,
  );

  const dataCells = hasHeader ? allCells.slice(1) : allCells;
  const rows = dataCells.map((c) => {
    const r = c.slice(0, columnCount);
    while (r.length < columnCount) r.push('');
    return r;
  });

  return { headers, rows, hasHeader, columnCount };
}

// Best-effort guess of which column feeds each field, from the header labels.
export function guessMapping(headers: string[]): RosterMapping {
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  const normed = headers.map(norm);
  const find = (test: (h: string) => boolean): number | null => {
    const i = normed.findIndex(test);
    return i >= 0 ? i : null;
  };

  return {
    firstName: find((h) => h === 'first name' || h === 'first' || h === 'firstname' || h.startsWith('first ')),
    lastName: find((h) => h === 'last name' || h === 'last' || h === 'lastname' || h.startsWith('last ')),
    ccbId: find((h) => h.includes('individual id') || h === 'id' || h.includes('person id') || h.includes('ccb')),
    email: find((h) => h.includes('email') || h.includes('e mail')),
    phone: find((h) => h.includes('phone') || h.includes('mobile') || h.includes('cell')),
  };
}

export function applyMapping(table: ParsedTable, mapping: RosterMapping): PastedPerson[] {
  const get = (row: string[], idx: number | null) =>
    idx != null && idx >= 0 ? (row[idx] ?? '').trim() : '';

  // Columns claimed by a core field aren't repeated as attributes.
  const mappedIdx = new Set<number>();
  for (const key of Object.keys(mapping) as RosterFieldKey[]) {
    const i = mapping[key];
    if (i != null && i >= 0) mappedIdx.add(i);
  }

  const people: PastedPerson[] = [];
  for (const row of table.rows) {
    const firstName = get(row, mapping.firstName);
    const lastName = get(row, mapping.lastName);
    if (!firstName && !lastName) continue;

    const attributes: Record<string, string> = {};
    for (let i = 0; i < table.headers.length; i++) {
      if (mappedIdx.has(i)) continue;
      const val = (row[i] ?? '').trim();
      if (val) attributes[table.headers[i]] = val;
    }

    people.push({
      ccbId: get(row, mapping.ccbId),
      firstName,
      lastName,
      phone: get(row, mapping.phone),
      email: get(row, mapping.email),
      attributes,
    });
  }
  return people;
}

// Distinct attribute keys (group-able dimensions) across a parsed roster,
// preserving first-seen order.
export function attributeKeys(people: PastedPerson[]): string[] {
  const seen = new Set<string>();
  const keys: string[] = [];
  for (const p of people) {
    for (const k of Object.keys(p.attributes)) {
      if (!seen.has(k)) { seen.add(k); keys.push(k); }
    }
  }
  return keys;
}
