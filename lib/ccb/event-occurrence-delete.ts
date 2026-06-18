import { CCBv2Client } from './ccb-v2-client';

export type MatchMode = 'contains' | 'starts_with' | 'exact';

export interface EventOccurrenceSearchParams {
  groupName: string;
  groupMatchMode: MatchMode;
  eventName: string;
  eventMatchMode: MatchMode;
  startDate: string;
  endDate: string;
  includeInactiveGroups: boolean;
  includeOccurrencesWithAttendance: boolean;
}

export interface EventOccurrenceGroupInput {
  group_id: string;
  group_name: string;
  radius_circle_id?: number;
  radius_circle_name?: string;
}

export interface RadiusCircleOccurrenceSearchParams {
  acpd: string;
  status?: string;
  startDate: string;
  endDate: string;
  includeOccurrencesWithAttendance: boolean;
  groups: EventOccurrenceGroupInput[];
}

export interface EventOccurrenceDeleteCandidate {
  group_id: string;
  group_name: string;
  event_id: string;
  event_name: string;
  occurrence: string;
  start: string | null;
  end: string | null;
  status: string | null;
  total_attendance: number | null;
  had_attendance: boolean;
  notes_indicators: string[];
  is_recurring: boolean | null;
  recurrence_label: string;
}

export interface EventOccurrenceSearchResult {
  occurrences: EventOccurrenceDeleteCandidate[];
  groupsMatched: number;
  groupsSearched: number;
  skippedInactiveGroups: number;
  skippedAttendance: number;
  calendarErrors: Array<{ group_id: string; group_name: string; error: string }>;
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const OCCURRENCE_RE = /^\d{8}$/;
type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function asRecord(value: unknown): UnknownRecord {
  return isRecord(value) ? value : {};
}

export function validateIsoDate(value: string, label: string) {
  if (!DATE_RE.test(value)) throw new Error(`${label} must use YYYY-MM-DD`);
  const date = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
    throw new Error(`${label} is not a valid date`);
  }
}

export function validateSearchParams(input: Partial<EventOccurrenceSearchParams>): EventOccurrenceSearchParams {
  const params: EventOccurrenceSearchParams = {
    groupName: String(input.groupName || '').trim(),
    groupMatchMode: normalizeMatchMode(input.groupMatchMode),
    eventName: String(input.eventName || '').trim(),
    eventMatchMode: normalizeMatchMode(input.eventMatchMode),
    startDate: String(input.startDate || '').trim(),
    endDate: String(input.endDate || '').trim(),
    includeInactiveGroups: input.includeInactiveGroups === true,
    includeOccurrencesWithAttendance: input.includeOccurrencesWithAttendance === true,
  };

  if (!params.groupName) throw new Error('groupName is required');
  validateIsoDate(params.startDate, 'startDate');
  validateIsoDate(params.endDate, 'endDate');
  if (params.endDate < params.startDate) throw new Error('endDate must be on or after startDate');

  return params;
}

export function validateRadiusCircleSearchParams(input: Partial<RadiusCircleOccurrenceSearchParams>): RadiusCircleOccurrenceSearchParams {
  const params: RadiusCircleOccurrenceSearchParams = {
    acpd: String(input.acpd || '').trim(),
    status: input.status ? String(input.status).trim() : undefined,
    startDate: String(input.startDate || '').trim(),
    endDate: String(input.endDate || '').trim(),
    includeOccurrencesWithAttendance: input.includeOccurrencesWithAttendance === true,
    groups: Array.isArray(input.groups) ? input.groups : [],
  };

  if (!params.acpd) throw new Error('acpd is required');
  validateIsoDate(params.startDate, 'startDate');
  validateIsoDate(params.endDate, 'endDate');
  if (params.endDate < params.startDate) throw new Error('endDate must be on or after startDate');
  if (params.groups.length === 0) throw new Error('Select at least one Radius circle with a CCB group ID');
  if (params.groups.length > 100) throw new Error('Search at most 100 circles at a time');

  params.groups = params.groups.map((group) => {
    const groupId = String(group?.group_id || '').trim();
    const groupName = String(group?.group_name || '').trim();
    if (!groupId) throw new Error('Every selected circle must include a CCB group ID');
    if (!groupName) throw new Error('Every selected circle must include a group name');
    return {
      group_id: groupId,
      group_name: groupName,
      radius_circle_id: typeof group?.radius_circle_id === 'number' ? group.radius_circle_id : undefined,
      radius_circle_name: group?.radius_circle_name ? String(group.radius_circle_name) : undefined,
    };
  });

  return params;
}

export function validateOccurrence(value: string): string {
  if (!OCCURRENCE_RE.test(value)) throw new Error('occurrence must use YYYYMMDD');
  const iso = `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}`;
  validateIsoDate(iso, 'occurrence');
  return value;
}

function normalizeMatchMode(value: unknown): MatchMode {
  return value === 'starts_with' || value === 'exact' ? value : 'contains';
}

function firstPresent<T>(...values: T[]): T | undefined {
  return values.find((value) => value !== undefined && value !== null && value !== '');
}

function stringValue(value: unknown): string | null {
  const found = firstPresent(value);
  if (found === undefined) return null;
  if (typeof found === 'object') {
    const record = found as Record<string, unknown>;
    return stringValue(firstPresent(record.name, record.label, record.value, record.text, record['#text']));
  }
  const trimmed = String(found).trim();
  return trimmed || null;
}

function numberValue(value: unknown): number | null {
  if (value === undefined || value === null || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function booleanValue(value: unknown): boolean | null {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;
  const normalized = String(value).trim().toLowerCase();
  if (['true', 'yes', 'y', '1', 'active'].includes(normalized)) return true;
  if (['false', 'no', 'n', '0', 'inactive', 'archived', 'deleted', 'cancelled', 'canceled'].includes(normalized)) return false;
  return null;
}

function rowsFromPayload(payload: unknown): unknown[] {
  if (!payload) return [];
  if (Array.isArray(payload)) return payload;
  if (!isRecord(payload)) return [];

  const directKeys = ['data', 'groups', 'group', 'calendar', 'events', 'event', 'items', 'results'];
  for (const key of directKeys) {
    const value = payload[key];
    if (Array.isArray(value)) return value;
    if (value && typeof value === 'object') {
      const nested = rowsFromPayload(value);
      if (nested.length) return nested;
    }
  }

  const arrayEntry = Object.values(payload).find(Array.isArray);
  return Array.isArray(arrayEntry) ? arrayEntry : [];
}

function matchesMode(value: string, search: string, mode: MatchMode) {
  const normalizedValue = value.trim().toLowerCase();
  const normalizedSearch = search.trim().toLowerCase();
  if (!normalizedSearch) return true;
  if (mode === 'exact') return normalizedValue === normalizedSearch;
  if (mode === 'starts_with') return normalizedValue.startsWith(normalizedSearch);
  return normalizedValue.includes(normalizedSearch);
}

function isoDateFromValue(value: unknown): string | null {
  const raw = stringValue(value);
  if (!raw) return null;
  if (/^\d{8}$/.test(raw)) return `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}`;
  const isoPrefix = raw.slice(0, 10);
  return DATE_RE.test(isoPrefix) ? isoPrefix : null;
}

function occurrenceFromRow(input: unknown): string | null {
  const row = asRecord(input);
  const raw = stringValue(firstPresent(
    row.occurrence,
    row.occurrence_date,
    row.date,
    row.start,
    row.starts_at,
    row.start_date,
    row.start_time,
  ));
  if (!raw) return null;
  if (/^\d{8}$/.test(raw)) return raw;

  const iso = isoDateFromValue(raw);
  return iso ? iso.replaceAll('-', '') : null;
}

function groupIsInactive(input: unknown): boolean {
  const row = asRecord(input);
  const group = asRecord(row.group);
  const explicitActive = booleanValue(firstPresent(row.active, row.is_active, group.active, group.is_active));
  if (explicitActive === false) return true;

  const explicitInactive = booleanValue(firstPresent(row.inactive, row.is_inactive, row.archived, row.deleted));
  if (explicitInactive === true) return true;

  const status = stringValue(firstPresent(row.status, row.status_name, group.status, row.group_status));
  return Boolean(status && ['inactive', 'archived', 'deleted', 'closed', 'cancelled', 'canceled'].includes(status.toLowerCase()));
}

function normalizeGroup(input: unknown) {
  const row = asRecord(input);
  const group = asRecord(row.group);
  const id = stringValue(firstPresent(row.id, row.group_id, row.ccb_group_id, group.id, group.group_id));
  const name = stringValue(firstPresent(row.name, row.group_name, row.title, group.name, group.group_name));
  if (!id || !name) return null;
  return { id, name, inactive: groupIsInactive(row) };
}

function attendanceTotal(input: unknown): number | null {
  const row = asRecord(input);
  const attendance = asRecord(row.attendance);
  return numberValue(firstPresent(
    row.total_attendance,
    row.attendance_total,
    row.attendance_count,
    row.attendee_count,
    row.attendees_count,
    row.head_count,
    attendance.total,
    attendance.count,
  ));
}

function notesIndicators(input: unknown): string[] {
  const row = asRecord(input);
  const indicators: string[] = [];
  if (stringValue(row.notes)) indicators.push('notes');
  if (stringValue(row.topic)) indicators.push('topic');
  if (stringValue(row.prayer_requests)) indicators.push('prayer_requests');
  if (stringValue(row.attendance_notes)) indicators.push('attendance_notes');
  if (booleanValue(row.did_not_meet) === true) indicators.push('did_not_meet');
  return indicators;
}

function normalizeOccurrence(input: unknown, group: { id: string; name: string }): EventOccurrenceDeleteCandidate | null {
  const row = asRecord(input);
  const event = asRecord(row.event);
  const attendance = asRecord(row.attendance);
  const eventId = stringValue(firstPresent(row.event_id, event.id, row.id));
  const eventName = stringValue(firstPresent(event.name, row.event_name, row.name, row.title, event.title));
  const occurrence = occurrenceFromRow(row);
  if (!eventId || !eventName || !occurrence) return null;

  const start = stringValue(firstPresent(row.start, row.starts_at, row.start_date, row.start_time, event.start));
  const end = stringValue(firstPresent(row.end, row.ends_at, row.end_date, row.end_time, event.end));
  const totalAttendance = attendanceTotal(row);
  const hasAttendanceFlag = booleanValue(firstPresent(row.has_attendance, row.attendance_recorded, attendance.recorded));
  const recurringFlag = booleanValue(firstPresent(
    row.is_recurring,
    row.recurring,
    row.repeat,
    row.repeats,
    event.is_recurring,
    event.recurring,
    event.repeat,
  ));
  const hasRecurrenceObject = Boolean(firstPresent(row.recurrence, row.recurrence_id, row.series_id, event.recurrence, event.recurrence_id, event.series_id));
  const isRecurring = recurringFlag ?? (hasRecurrenceObject ? true : null);

  return {
    group_id: group.id,
    group_name: group.name,
    event_id: eventId,
    event_name: eventName,
    occurrence,
    start,
    end,
    status: stringValue(firstPresent(row.status, row.event_status, event.status)),
    total_attendance: totalAttendance,
    had_attendance: (totalAttendance !== null && totalAttendance > 0) || hasAttendanceFlag === true,
    notes_indicators: notesIndicators(row),
    is_recurring: isRecurring,
    recurrence_label: isRecurring === true ? 'Recurring occurrence' : isRecurring === false ? 'Single event' : 'Unknown',
  };
}

export function candidateKey(candidate: Pick<EventOccurrenceDeleteCandidate, 'group_id' | 'event_id' | 'occurrence'>) {
  return `${candidate.group_id}:${candidate.event_id}:${candidate.occurrence}`;
}

export async function searchEventOccurrences(
  ccb: CCBv2Client,
  input: Partial<EventOccurrenceSearchParams>,
): Promise<EventOccurrenceSearchResult> {
  const params = validateSearchParams(input);
  const groupsPayload = await ccb.get('/groups', { name: params.groupName });
  const groups = rowsFromPayload(groupsPayload)
    .map(normalizeGroup)
    .filter((group): group is { id: string; name: string; inactive: boolean } => Boolean(group));

  let skippedInactiveGroups = 0;
  const matchingGroups = groups.filter((group) => {
    if (!params.includeInactiveGroups && group.inactive) {
      skippedInactiveGroups += 1;
      return false;
    }
    return matchesMode(group.name, params.groupName, params.groupMatchMode);
  });

  const occurrences: EventOccurrenceDeleteCandidate[] = [];
  const calendarErrors: EventOccurrenceSearchResult['calendarErrors'] = [];
  let skippedAttendance = 0;
  const seen = new Set<string>();

  for (const group of matchingGroups) {
    try {
      const calendarPayload = await ccb.get(`/groups/${encodeURIComponent(group.id)}/calendar`, {
        start: params.startDate,
        end: params.endDate,
      });

      for (const row of rowsFromPayload(calendarPayload)) {
        const occurrence = normalizeOccurrence(row, group);
        if (!occurrence) continue;

        const occurrenceDate = isoDateFromValue(occurrence.occurrence);
        const fallbackStartDate = isoDateFromValue(occurrence.start);
        const dateForRange = occurrenceDate || fallbackStartDate;
        if (dateForRange && (dateForRange < params.startDate || dateForRange > params.endDate)) continue;
        if (!matchesMode(occurrence.event_name, params.eventName, params.eventMatchMode)) continue;

        if (occurrence.had_attendance && !params.includeOccurrencesWithAttendance) {
          skippedAttendance += 1;
          continue;
        }

        const key = candidateKey(occurrence);
        if (seen.has(key)) continue;
        seen.add(key);
        occurrences.push(occurrence);
      }
    } catch (error) {
      calendarErrors.push({
        group_id: group.id,
        group_name: group.name,
        error: error instanceof Error ? error.message : 'Failed to fetch group calendar',
      });
    }
  }

  occurrences.sort((a, b) => {
    const startCompare = String(a.start || a.occurrence).localeCompare(String(b.start || b.occurrence));
    if (startCompare !== 0) return startCompare;
    const groupCompare = a.group_name.localeCompare(b.group_name);
    if (groupCompare !== 0) return groupCompare;
    return a.event_name.localeCompare(b.event_name);
  });

  return {
    occurrences,
    groupsMatched: matchingGroups.length,
    groupsSearched: groups.length,
    skippedInactiveGroups,
    skippedAttendance,
    calendarErrors,
  };
}

export async function searchEventOccurrencesForGroups(
  ccb: CCBv2Client,
  input: Partial<RadiusCircleOccurrenceSearchParams>,
): Promise<EventOccurrenceSearchResult> {
  const params = validateRadiusCircleSearchParams(input);
  const groups = params.groups.map((group) => ({
    id: group.group_id,
    name: group.group_name,
    inactive: false,
  }));

  const occurrences: EventOccurrenceDeleteCandidate[] = [];
  const calendarErrors: EventOccurrenceSearchResult['calendarErrors'] = [];
  let skippedAttendance = 0;
  const seen = new Set<string>();

  for (const group of groups) {
    try {
      const calendarPayload = await ccb.get(`/groups/${encodeURIComponent(group.id)}/calendar`, {
        start: params.startDate,
        end: params.endDate,
      });

      for (const row of rowsFromPayload(calendarPayload)) {
        const occurrence = normalizeOccurrence(row, group);
        if (!occurrence) continue;

        const occurrenceDate = isoDateFromValue(occurrence.occurrence);
        const fallbackStartDate = isoDateFromValue(occurrence.start);
        const dateForRange = occurrenceDate || fallbackStartDate;
        if (dateForRange && (dateForRange < params.startDate || dateForRange > params.endDate)) continue;

        if (occurrence.had_attendance && !params.includeOccurrencesWithAttendance) {
          skippedAttendance += 1;
          continue;
        }

        const key = candidateKey(occurrence);
        if (seen.has(key)) continue;
        seen.add(key);
        occurrences.push(occurrence);
      }
    } catch (error) {
      calendarErrors.push({
        group_id: group.id,
        group_name: group.name,
        error: error instanceof Error ? error.message : 'Failed to fetch group calendar',
      });
    }
  }

  occurrences.sort((a, b) => {
    const startCompare = String(a.start || a.occurrence).localeCompare(String(b.start || b.occurrence));
    if (startCompare !== 0) return startCompare;
    const groupCompare = a.group_name.localeCompare(b.group_name);
    if (groupCompare !== 0) return groupCompare;
    return a.event_name.localeCompare(b.event_name);
  });

  return {
    occurrences,
    groupsMatched: groups.length,
    groupsSearched: groups.length,
    skippedInactiveGroups: 0,
    skippedAttendance,
    calendarErrors,
  };
}
