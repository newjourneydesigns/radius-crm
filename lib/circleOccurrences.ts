/**
 * Picking the right `circle_meeting_occurrences` row for a leader's week.
 *
 * A circle can end up with more than one row inside a single week. The hourly
 * CCB sync (`/api/ccb/sync-attendance`) walks the group's calendar and keys
 * rows on (leader, date) with the event id attached, while the week matcher
 * behind Sync Now / peek / the snapshot pulls writes whichever single event
 * `checkReportsForLeaders` picked — with no event id, because that matcher
 * doesn't return one. When those two land on different days (a bare attendance
 * record on one, the leader's write-up on another), readers that took the
 * latest `meeting_date` could land on the attendance-only row and render the
 * week as "No notes recorded" while the real summary sat one row over.
 *
 * So: rank a row by what the leader actually reported, and fall back to
 * recency only to break a tie.
 */

export type OccurrenceRawPayload = {
  notes?: string | null;
  topic?: string | null;
  prayerRequests?: string | null;
  headCount?: number | null;
  attendeeCount?: number | null;
  didNotMeet?: boolean | null;
} | null;

export type RankableOccurrence = {
  meeting_date: string;
  status?: string | null;
  headcount?: number | null;
  has_notes?: boolean | null;
  topic?: string | null;
  notes?: string | null;
  prayer_requests?: string | null;
  raw_payload?: OccurrenceRawPayload;
  reviewed_at?: string | null;
};

function text(value: unknown): string {
  return value == null ? '' : String(value).trim();
}

/**
 * How much of a report this row represents:
 *   2 — the leader wrote something (topic, notes, or prayer requests)
 *   1 — an explicit submission with no text: did-not-meet, or a head count
 *   0 — the empty record CCB pre-creates for every scheduled occurrence
 *
 * Text is read from the flat columns *and* `raw_payload`, because the two
 * writers disagree about where it goes: the hourly sync stores the write-up
 * only in `raw_payload`, the week matcher only in the columns. A row is
 * ranked on whichever one carries it.
 */
export function occurrenceEvidenceRank(occ: RankableOccurrence): number {
  const raw = occ.raw_payload ?? {};

  const hasText =
    occ.has_notes === true ||
    !!text(occ.notes) ||
    !!text(occ.topic) ||
    !!text(occ.prayer_requests) ||
    !!text(raw.notes) ||
    !!text(raw.topic) ||
    !!text(raw.prayerRequests);
  if (hasText) return 2;

  const headcount = Number(occ.headcount ?? raw.headCount ?? 0);
  const didNotMeet = occ.status === 'did_not_meet' || raw.didNotMeet === true;
  if (didNotMeet || (Number.isFinite(headcount) && headcount > 0)) return 1;

  return 0;
}

/**
 * The one occurrence to show for a leader's week.
 *
 * Reviewed rows win outright — a duplicate must never collapse the reviewed
 * marker, which is what the tracker's original "reviewed first, then latest"
 * rule protected. Within the same reviewed state, the fuller report wins, and
 * only an exact tie falls through to the later date.
 */
export function pickWeekOccurrence<T extends RankableOccurrence>(rows: T[]): T | null {
  let best: T | null = null;

  for (const row of rows) {
    if (!best) {
      best = row;
      continue;
    }

    const rowReviewed = !!row.reviewed_at;
    const bestReviewed = !!best.reviewed_at;
    if (rowReviewed !== bestReviewed) {
      if (rowReviewed) best = row;
      continue;
    }

    const rowRank = occurrenceEvidenceRank(row);
    const bestRank = occurrenceEvidenceRank(best);
    if (rowRank !== bestRank) {
      if (rowRank > bestRank) best = row;
      continue;
    }

    if (row.meeting_date > best.meeting_date) best = row;
  }

  return best;
}

/**
 * Display text for an occurrence. Falls back to `raw_payload` for the same
 * reason the rank does — a row the hourly sync wrote carries the leader's
 * write-up there and nowhere else, so reading the column alone renders a
 * real summary as blank.
 */
export function occurrenceNotes(occ: RankableOccurrence | null | undefined): string | null {
  if (!occ) return null;
  return text(occ.notes) || text(occ.raw_payload?.notes) || null;
}

export function occurrenceTopic(occ: RankableOccurrence | null | undefined): string | null {
  if (!occ) return null;
  return text(occ.topic) || text(occ.raw_payload?.topic) || null;
}

export function occurrencePrayerRequests(occ: RankableOccurrence | null | undefined): string | null {
  if (!occ) return null;
  return text(occ.prayer_requests) || text(occ.raw_payload?.prayerRequests) || null;
}
