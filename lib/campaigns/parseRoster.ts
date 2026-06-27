// Parse a pasted spreadsheet roster into structured people, with column mapping.
//
// Admins receive spreadsheets (e.g. a CCB people export) and paste them in instead
// of pointing at a CCB group. Exports vary in column order and naming, so we parse
// the paste into a generic table, let the admin map each column to a known field,
// and auto-guess that mapping from the header row. Pasting from Excel/Sheets yields
// tab-separated cells; CSV yields commas. We tolerate quoted cells and a header row.

export type RosterFieldKey = 'ccbId' | 'firstName' | 'lastName' | 'phone' | 'email' | 'group';

export interface RosterField {
  key: RosterFieldKey;
  label: string;
  required?: boolean;
  hint?: string;
}

export const ROSTER_FIELDS: RosterField[] = [
  { key: 'firstName', label: 'First name', required: true },
  { key: 'lastName', label: 'Last name', required: true },
  { key: 'ccbId', label: 'CCB Individual ID', hint: 'Best match to form responses' },
  { key: 'email', label: 'Email' },
  { key: 'phone', label: 'Phone' },
  { key: 'group', label: 'Group by', hint: 'e.g. Campus or Team' },
];

export type RosterMapping = Record<RosterFieldKey, number | null>;

export const EMPTY_MAPPING: RosterMapping = {
  ccbId: null,
  firstName: null,
  lastName: null,
  phone: null,
  email: null,
  group: null,
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
  group: string; // campus / team / whatever the admin maps to "Group by"
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
    // Default the grouping column to Campus, falling back to Team — the admin can change it.
    group: find((h) => h.includes('campus')) ?? find((h) => h.includes('team')) ?? find((h) => h.includes('ministry')),
  };
}

export function applyMapping(table: ParsedTable, mapping: RosterMapping): PastedPerson[] {
  const get = (row: string[], idx: number | null) =>
    idx != null && idx >= 0 ? (row[idx] ?? '').trim() : '';

  const people: PastedPerson[] = [];
  for (const row of table.rows) {
    const firstName = get(row, mapping.firstName);
    const lastName = get(row, mapping.lastName);
    if (!firstName && !lastName) continue;
    people.push({
      ccbId: get(row, mapping.ccbId),
      firstName,
      lastName,
      phone: get(row, mapping.phone),
      email: get(row, mapping.email),
      group: get(row, mapping.group),
    });
  }
  return people;
}
