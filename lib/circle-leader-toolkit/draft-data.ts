/**
 * Shared loader for a leader's saved/submitted/CCB-prefilled draft for one
 * event occurrence. Lives here (not inline in the API route) so the route AND
 * the server-rendered event form page share one implementation — the form can
 * resolve its initial draft server-side instead of waiting on a client fetch.
 *
 * Resolution order: in-progress draft → most recent submitted summary → live
 * CCB attendance prefill.
 */

import type { SessionLeader } from './session';
import { createServiceSupabaseClient } from '../server-supabase';
import { cleanManualAttendees, splitLegacyRosterAdditions } from './notes-formatter';
import { DID_NOT_MEET_REASON_SET } from './did-not-meet-reasons';
import { DID_NOT_MEET_OTHER_VALUE } from './dynamic-question-response-keys';

type CcbAttendanceData = {
  didNotMeet: boolean;
  notes: string;
  topic: string;
  prayerRequests: string;
  info: string;
  attendeeIds: string[];
};

type XmlRecord = Record<string, unknown>;

const REASON_PREFIX_RE = /^reason\s+we\s+did(?:n['’]t| not)\s+meet:\s*/i;

export type EventDraft = Record<string, unknown>;

export type LoadDraftResult = {
  /** True when the event has been removed from the leader's summary list. */
  ignored?: boolean;
  draft: EventDraft | null;
  updatedAt: string | null;
  source: 'draft' | 'submitted' | 'ccb' | null;
  submittedStatus?: string;
};

function asRecord(value: unknown): XmlRecord | null {
  return value && typeof value === 'object' ? (value as XmlRecord) : null;
}

function readText(value: unknown): string {
  if (value == null) return '';
  if (typeof value === 'string') return value;
  return String(asRecord(value)?.['#text'] ?? '');
}

function normalizeDidNotMeetReason(reason: unknown, other: unknown = '') {
  const reasonText = typeof reason === 'string' ? reason.trim() : '';
  const otherText = typeof other === 'string' && other.trim() !== DID_NOT_MEET_OTHER_VALUE
    ? other.trim()
    : '';
  if (!reasonText) {
    return { didNotMeetReason: '', didNotMeetReasonOther: otherText };
  }
  if (reasonText === DID_NOT_MEET_OTHER_VALUE) {
    return { didNotMeetReason: DID_NOT_MEET_OTHER_VALUE, didNotMeetReasonOther: otherText };
  }
  if (DID_NOT_MEET_REASON_SET.has(reasonText)) {
    return {
      didNotMeetReason: reasonText,
      didNotMeetReasonOther: reasonText === 'Other' ? otherText : '',
    };
  }
  return { didNotMeetReason: 'Other', didNotMeetReasonOther: reasonText };
}

function extractDidNotMeetReasonFromNotes(notes: string) {
  const trimmed = notes.trim();
  if (!REASON_PREFIX_RE.test(trimmed)) return null;
  return trimmed.replace(REASON_PREFIX_RE, '').trim();
}

async function fetchCcbAttendance(eventId: string, occurrence: string) {
  try {
    const { createCCBClient } = await import('../ccb/ccb-client');
    // Leaders authenticate via the opaque session cookie, not a Bearer token,
    // so the CCB request context carries no userId — the default context here
    // matches what the API route built from the request.
    const ccb = createCCBClient({ module: 'circle-summary', action: 'draft_ccb_prefill' });
    const occurrenceDateOnly = occurrence.slice(0, 10);
    const xml = await ccb.getXml<unknown>({
      srv: 'attendance_profile',
      id: eventId,
      occurrence: occurrenceDateOnly,
    });
    const response = asRecord(asRecord(asRecord(xml)?.ccb_api)?.response);
    const eventsRoot = asRecord(response?.events);
    const rawEvent = eventsRoot?.event;
    const firstEvent = Array.isArray(rawEvent) ? rawEvent[0] : rawEvent ?? null;
    const a = asRecord(response?.attendance) ?? asRecord(firstEvent);
    if (!a) return null;
    const attendees = asRecord(a.attendees);
    const attendeeNode = attendees?.attendee;
    const attendeeIds: string[] = !attendeeNode
      ? []
      : (Array.isArray(attendeeNode) ? attendeeNode : [attendeeNode])
          .map((x) => {
            const attendee = asRecord(x);
            return String(attendee?.['@_id'] ?? attendee?.id ?? '');
          })
          .filter(Boolean);
    return {
      didNotMeet: String(a?.did_not_meet ?? '').toLowerCase() === 'true',
      notes: readText(a?.notes),
      topic: readText(a?.topic),
      prayerRequests: readText(a?.prayer_requests),
      info: readText(a?.info),
      attendeeIds,
    } satisfies CcbAttendanceData;
  } catch {
    return null;
  }
}

export function isPayloadEmpty(payload: Record<string, unknown> | null | undefined): boolean {
  if (!payload) return true;
  const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '');
  if (payload.didNotMeet) return false;
  if (str(payload.notes) || str(payload.topic) || str(payload.prayerRequests) || str(payload.info)) return false;
  if (str(payload.didNotMeetReason) || str(payload.didNotMeetReasonOther)) return false;
  if (str(payload.infoUpdateDay) || str(payload.infoUpdateTime) || str(payload.infoUpdateLocation)) return false;
  if (Array.isArray(payload.attendeeCcbIds) && payload.attendeeCcbIds.length > 0) return false;
  if (Array.isArray(payload.manualAttendees) && payload.manualAttendees.length > 0) return false;
  const dv = payload.dynamicValues as Record<string, unknown> | undefined;
  if (dv && Object.values(dv).some((v) => (typeof v === 'string' ? v.trim() !== '' : v != null && !(Array.isArray(v) && v.length === 0)))) return false;
  const optionFollowups = payload.optionFollowups as Record<string, unknown> | undefined;
  if (
    optionFollowups &&
    Object.values(optionFollowups).some((v) => typeof v === 'string' && v.trim() !== '')
  ) {
    return false;
  }
  return true;
}

function isMissingIgnoredEventsTableError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const maybe = err as { code?: string; message?: string; details?: string };
  const text = `${maybe.code || ''} ${maybe.message || ''} ${maybe.details || ''}`.toLowerCase();
  return (
    text.includes('circle_summary_ignored_events') ||
    text.includes('schema cache') ||
    text.includes('does not exist') ||
    text.includes('could not find')
  );
}

export async function isIgnoredEvent(
  supabase: ReturnType<typeof createServiceSupabaseClient>,
  leaderId: string | number,
  eventId: string,
  occurrence: string
): Promise<boolean> {
  const { data, error } = await supabase
    .from('circle_summary_ignored_events')
    .select('id')
    .eq('leader_id', leaderId)
    .eq('ccb_event_id', eventId)
    .eq('occurrence_date', occurrence.slice(0, 10))
    .maybeSingle();

  if (error) {
    if (!isMissingIgnoredEventsTableError(error)) {
      console.warn('[circle-summary/draft] ignored event lookup failed:', error.message);
    }
    return false;
  }

  return !!data;
}

function draftFromCcbData(ccbData: Awaited<ReturnType<typeof fetchCcbAttendance>>) {
  if (!ccbData) return null;
  const ccbReason = extractDidNotMeetReasonFromNotes(ccbData.notes);
  const reason = normalizeDidNotMeetReason(ccbReason ?? '');
  const didNotMeet = ccbData.didNotMeet || !!ccbReason;
  const notes = ccbReason ? '' : ccbData.notes;
  const hasAnything =
    !!ccbData.notes || !!ccbData.topic || didNotMeet || ccbData.attendeeIds.length > 0;
  if (!hasAnything) return null;

  const parsed = splitLegacyRosterAdditions(notes);
  return {
    didNotMeet,
    ...reason,
    notes: parsed.notes,
    referenceNotes: parsed.notes,
    topic: ccbData.topic,
    prayerRequests: ccbData.prayerRequests,
    info: ccbData.info,
    attendeeCcbIds: ccbData.attendeeIds,
    manualAttendees: parsed.manualAttendees,
    dynamicValues: {},
    infoUpdateDay: '',
    infoUpdateTime: '',
    infoUpdateLocation: '',
  };
}

/**
 * Resolve the draft/submitted/CCB-prefilled form data for one event occurrence.
 * Returns `{ ignored: true }` when the event has been removed from the list;
 * callers map that to a 410 (route) or a redirect (server page).
 */
export async function loadEventDraft(
  leader: SessionLeader,
  eventId: string,
  occurrence: string
): Promise<LoadDraftResult> {
  const supabase = createServiceSupabaseClient();

  if (await isIgnoredEvent(supabase, leader.id, eventId, occurrence)) {
    return { ignored: true, draft: null, updatedAt: null, source: null };
  }

  // Prefer an in-progress draft if one exists.
  const { data: draftRow } = await supabase
    .from('circle_event_summary_drafts')
    .select('payload, updated_at')
    .eq('leader_id', leader.id)
    .eq('ccb_event_id', eventId)
    .eq('occurrence', occurrence)
    .maybeSingle();

  if (draftRow?.payload) {
    const payload = draftRow.payload as Record<string, unknown>;
    if (!isPayloadEmpty(payload)) {
      const parsed = splitLegacyRosterAdditions(String(payload.notes ?? ''));
      const existingManual = cleanManualAttendees(payload.manualAttendees);
      const reason = normalizeDidNotMeetReason(payload.didNotMeetReason, payload.didNotMeetReasonOther);
      return {
        draft: {
          ...payload,
          ...reason,
          notes: parsed.notes,
          referenceNotes: parsed.notes,
          manualAttendees: existingManual.length ? existingManual : parsed.manualAttendees,
        },
        updatedAt: draftRow.updated_at,
        source: 'draft',
      };
    }
    // Empty drafts (auto-saved from a first visit with no data) should not
    // shadow a submitted summary or CCB-prefilled data on subsequent loads.
    await supabase
      .from('circle_event_summary_drafts')
      .delete()
      .eq('leader_id', leader.id)
      .eq('ccb_event_id', eventId)
      .eq('occurrence', occurrence);
  }

  // Fall back to the most recent submitted summary so re-edits start populated.
  const { data: subRow } = await supabase
    .from('circle_event_summaries')
    .select(
      'did_not_meet, did_not_meet_reason, topic, notes, prayer_requests, info, attendee_ccb_ids, manual_attendees, dynamic_responses, info_update_requested, status, created_at'
    )
    .eq('leader_id', leader.id)
    .eq('ccb_event_id', eventId)
    .eq('occurrence', occurrence)
    .eq('status', 'submitted')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (subRow) {
    const dynamicValues: Record<string, unknown> = {};
    const dr = subRow.dynamic_responses as Record<string, { label?: string; value?: unknown }> | null;
    if (dr) {
      for (const [qid, entry] of Object.entries(dr)) {
        dynamicValues[qid] = entry?.value;
      }
    }
    const infoUpdate = subRow.info_update_requested as
      | { day?: string; time?: string; location?: string }
      | null;
    const parsed = splitLegacyRosterAdditions(subRow.notes ?? '');
    const existingManual = cleanManualAttendees(subRow.manual_attendees);
    const reason = normalizeDidNotMeetReason(subRow.did_not_meet_reason ?? '');
    return {
      draft: {
        didNotMeet: subRow.did_not_meet,
        ...reason,
        notes: parsed.notes,
        referenceNotes: parsed.notes,
        topic: subRow.topic ?? '',
        prayerRequests: subRow.prayer_requests ?? '',
        info: subRow.info ?? '',
        attendeeCcbIds: subRow.attendee_ccb_ids ?? [],
        manualAttendees: existingManual.length ? existingManual : parsed.manualAttendees,
        dynamicValues,
        infoUpdateDay: infoUpdate?.day ?? '',
        infoUpdateTime: infoUpdate?.time ?? '',
        infoUpdateLocation: infoUpdate?.location ?? '',
      },
      updatedAt: subRow.created_at,
      source: 'submitted',
      submittedStatus: subRow.status,
    };
  }

  // Final fallback: load whatever's currently in CCB for this event +
  // occurrence so leaders can review/edit a summary that was entered directly
  // in CCB without going through this app.
  const ccbData = await fetchCcbAttendance(eventId, occurrence);
  const ccbDraft = draftFromCcbData(ccbData);
  if (ccbDraft) {
    return { draft: ccbDraft, updatedAt: null, source: 'ccb' };
  }

  return { draft: null, updatedAt: null, source: null };
}
