'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { DateTime } from 'luxon';
import { AlertTriangle } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import type { CircleLeader, EventSummaryState } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import Modal from '../../components/ui/Modal';
import EventSummaryReminderModal from '../../components/modals/EventSummaryReminderModal';

type SnapshotRow = {
  circle_leader_id: number;
  event_summary_state: EventSummaryState;
  ccb_event_scheduled: boolean;
  ccb_report_available: boolean;
  captured_at: string;
  week_start_date: string;
};

type OccurrenceRow = {
  id: string;
  leader_id: number;
  meeting_date: string;
  status: 'met' | 'did_not_meet';
  headcount: number | null;
  has_notes: boolean;
  guest_count: number;
  topic: string | null;
  notes: string | null;
  prayer_requests: string | null;
  reviewed_at: string | null;
  reviewed_by: string | null;
};

type SubmissionRow = {
  id: string;
  leader_id: number;
  occurrence: string;
  did_not_meet: boolean;
  topic: string | null;
  notes: string | null;
  prayer_requests: string | null;
  reviewed_at: string | null;
  reviewed_by: string | null;
};

type Orphan = {
  id: string;
  ccb_event_id: string;
  occurrence: string;
  ccb_event_name: string;
  ccb_group_id: string | null;
  did_not_meet: boolean;
  head_count: number;
  attendee_count: number;
  matched_leader_id: number | null;
  category: 'inactive' | 'unknown_group';
};

type TrackerData = {
  week_start_date: string;
  week_end_date: string;
  orphans: { inactive: Orphan[]; unknown_group: Orphan[] };
  missed_two_plus_leader_ids: number[];
  reviewers: Record<number, {
    reviewed_at: string;
    reviewed_by_id: string | null;
    reviewed_by_name: string;
    did_not_meet: boolean;
    source: 'app' | 'ccb';
  }>;
  last_sync: {
    last_synced_at: string;
    last_synced_by: string | null;
    last_sync_summary: any;
  } | null;
};

type RowStatus = 'no_ccb_event' | 'no_summary' | 'needs_review' | 'received' | 'did_not_meet';

type Row = {
  leader: CircleLeader;
  status: RowStatus;
  meetingDate: string | null;       // ISO date the meeting happened (CCB) or is scheduled (Radius)
  headcount: number | null;
  guestCount: number;
  attendees: number;
  notes: string | null;
  topic: string | null;
  reviewer: TrackerData['reviewers'][number] | null;
  occurrence: OccurrenceRow | null;
  submission: SubmissionRow | null;
  missedTwoPlus: boolean;
};

const DAY_INDEX: Record<string, number> = {
  Sunday: 0, Monday: 1, Tuesday: 2, Wednesday: 3, Thursday: 4, Friday: 5, Saturday: 6,
};
const CIRCLE_STATUS_OPTIONS = [
  { value: 'active', label: 'Active' },
  { value: 'archive', label: 'Archive' },
  { value: 'follow-up', label: 'Follow-up' },
  { value: 'invited', label: 'Invited' },
  { value: 'on-boarding', label: 'Onboarding' },
  { value: 'paused', label: 'Paused' },
  { value: 'pipeline', label: 'Pipeline' },
] as const;

// True on platforms where the `sms:` protocol reliably opens a Messages app:
// macOS (with Messages.app), iOS, Android. Windows desktops typically have no
// SMS handler (or open Skype unexpectedly), so we hide the Send Reminder button.
function platformSupportsSms(): boolean {
  if (typeof navigator === 'undefined') return true; // SSR — assume yes; resolved on hydration
  const ua = navigator.userAgent || '';
  const platform = (navigator as any).userAgentData?.platform || navigator.platform || '';
  if (/Windows/i.test(ua) || /Win/i.test(platform)) return false;
  // Macs, iOS, Android all have native SMS handlers
  return true;
}

function sundayOfThisWeek(): string {
  const now = DateTime.local();
  const back = now.weekday === 7 ? 0 : now.weekday;
  return now.minus({ days: back }).toISODate()!;
}

function shiftWeek(weekStart: string, weeks: number): string {
  return DateTime.fromISO(weekStart).plus({ weeks }).toISODate()!;
}

function formatWeekLabel(weekStart: string): string {
  const start = DateTime.fromISO(weekStart);
  const end = start.plus({ days: 6 });
  const sameMonth = start.month === end.month;
  return sameMonth
    ? `${start.toFormat('MMM d')} – ${end.toFormat('d, yyyy')}`
    : `${start.toFormat('MMM d')} – ${end.toFormat('MMM d, yyyy')}`;
}

function scheduledMeetingDateForWeek(weekStart: string, meetingDay: string): DateTime | null {
  const meetingDayIndex = DAY_INDEX[meetingDay];
  if (meetingDayIndex === undefined) return null;

  const weekStartDt = DateTime.fromISO(weekStart);
  if (!weekStartDt.isValid) return null;

  return weekStartDt.plus({ days: meetingDayIndex });
}

function meetsOrdinalFrequencyOnDate(frequency: string | undefined, meetingDate: DateTime): boolean | null {
  const normalized = (frequency ?? '').trim().toLowerCase();
  const ordinalChecks = [
    { week: 1, pattern: /\b(1st|first)\b/ },
    { week: 2, pattern: /\b(2nd|second)\b/ },
    { week: 3, pattern: /\b(3rd|third)\b/ },
    { week: 4, pattern: /\b(4th|fourth)\b/ },
    { week: 5, pattern: /\b(5th|fifth)\b/ },
  ];
  const scheduledWeeks = ordinalChecks
    .filter(({ pattern }) => pattern.test(normalized))
    .map(({ week }) => week);

  if (scheduledWeeks.length === 0) return null;

  const mentionsWeekly = normalized.includes('weekly') || normalized.includes('every week');
  const mentionsBiWeekly = normalized.includes('bi-week')
    || normalized.includes('biweekly')
    || normalized.includes('every other');
  if (mentionsWeekly || mentionsBiWeekly) return null;

  return scheduledWeeks.includes(Math.ceil(meetingDate.day / 7));
}

// Returns minutes-from-midnight (0–1440) for sorting. Unknown → 9999 so they
// sort to the end.
function parseTimeToMinutes(raw: string | undefined | null): number {
  if (!raw) return 9999;
  const s = String(raw).trim();
  // 12h: "7:30 PM", "7 PM"
  const m12 = s.match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)$/i);
  if (m12) {
    let h = Number(m12[1]) % 12;
    const min = m12[2] ? Number(m12[2]) : 0;
    if (m12[3].toLowerCase() === 'pm') h += 12;
    return h * 60 + min;
  }
  // 24h: "19:00", "19:00:00"
  const m24 = s.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
  if (m24) return Number(m24[1]) * 60 + Number(m24[2]);
  return 9999;
}

function formatMeetingTime(raw: string | undefined | null): string {
  if (!raw) return '';
  const trimmed = String(raw).trim();
  // Already has am/pm — normalize spacing/case
  if (/(am|pm)/i.test(trimmed)) {
    return trimmed.replace(/\s*(am|pm)/i, (_m, p) => ` ${p.toUpperCase()}`).trim();
  }
  // Try 24h forms: "19:00", "19:00:00", "7:30"
  const m = trimmed.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
  if (m) {
    let h = Number(m[1]);
    const mm = m[2];
    const period = h >= 12 ? 'PM' : 'AM';
    h = h % 12 || 12;
    return `${h}:${mm} ${period}`;
  }
  return trimmed;
}

function formatRelativeTime(iso: string): string {
  const dt = DateTime.fromISO(iso);
  const diff = DateTime.now().diff(dt, ['minutes', 'hours', 'days']).toObject();
  if ((diff.days ?? 0) >= 1) return `${Math.floor(diff.days!)}d ago`;
  if ((diff.hours ?? 0) >= 1) return `${Math.floor(diff.hours!)}h ago`;
  if ((diff.minutes ?? 0) >= 1) return `${Math.floor(diff.minutes!)}m ago`;
  return 'just now';
}

function AiSummaryMarkdown({ text }: { text: string }) {
  const lines = text.split('\n');
  const elements: React.ReactNode[] = [];
  let key = 0;

  const renderInline = (content: string) => {
    const parts = content.split(/(\*\*[^*]+\*\*)/g);
    return parts.map((part, index) =>
      part.startsWith('**') && part.endsWith('**')
        ? <strong key={index} className="font-semibold text-white">{part.slice(2, -2)}</strong>
        : part
    );
  };

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;

    const isMarkdownHeader = /^#{1,3}\s+/.test(line);
    const cleanHeader = isMarkdownHeader
      ? line.replace(/^#{1,3}\s+/, '')
      : line.replace(/^\*\*/, '').replace(/\*\*$/, '');
    const isStyledHeader =
      (line.startsWith('**') && line.endsWith('**') && /\d+\./.test(line)) ||
      /^\d+\.\s+\*\*/.test(line);
    const isPlainHeader =
      /^\d+\.\s+[A-Za-z]/.test(line) &&
      !line.slice(line.indexOf('.') + 1).trim().startsWith('**') &&
      line.length < 80 &&
      !/:\s/.test(line.slice(line.indexOf('.') + 1));

    if (isMarkdownHeader || isStyledHeader || isPlainHeader) {
      const label = cleanHeader.replace(/^\d+\.\s+/, '').replace(/\*\*/g, '');
      const sectionNumber = cleanHeader.match(/^(\d+)/)?.[1];
      elements.push(
        <div key={key++} className="mt-5 flex items-baseline gap-2 border-b border-indigo-500/15 pb-1.5 first:mt-1">
          {sectionNumber && <span className="w-4 shrink-0 text-xs font-bold tabular-nums text-indigo-300/60">{sectionNumber}</span>}
          <h3 className="text-sm font-semibold uppercase text-indigo-100">{label}</h3>
        </div>
      );
      continue;
    }

    if (/^[\*\-•]\s+/.test(line)) {
      const content = line.replace(/^[\*\-•]\s+/, '');
      elements.push(
        <div key={key++} className="flex gap-2 py-0.5">
          <span className="mt-0.5 shrink-0 text-xs text-indigo-300/60">▸</span>
          <p className="text-sm leading-relaxed text-slate-200">{renderInline(content)}</p>
        </div>
      );
      continue;
    }

    if (line.startsWith('"') && /[–—]/.test(line)) {
      const [quote, ...attribution] = line.split(/[–—]/);
      elements.push(
        <blockquote key={key++} className="my-1 border-l-2 border-indigo-400/35 py-1 pl-3">
          <p className="text-sm italic leading-relaxed text-slate-300">{quote.trim()}</p>
          {attribution.length > 0 && <p className="mt-0.5 text-xs text-slate-500">— {attribution.join('—').trim()}</p>}
        </blockquote>
      );
      continue;
    }

    elements.push(
      <p key={key++} className="py-0.5 text-sm leading-relaxed text-slate-200">
        {renderInline(line)}
      </p>
    );
  }

  return <div className="space-y-0.5">{elements}</div>;
}

function StatusPill({ status }: { status: RowStatus }) {
  const map: Record<RowStatus, { label: string; className: string }> = {
    no_summary:   { label: 'No Summary',   className: 'bg-red-500/15 text-red-300 border border-red-500/30' },
    needs_review: { label: 'Needs Review', className: 'bg-amber-500/20 text-amber-300 border border-amber-500/30' },
    received:     { label: 'Received',     className: 'bg-green-500/20 text-green-300 border border-green-500/30' },
    did_not_meet: { label: "Didn't Meet",  className: 'bg-slate-500/25 text-slate-300 border border-slate-500/40' },
  };
  const m = map[status];
  return (
    <span className={`inline-flex items-center text-[11px] font-medium px-2.5 py-0.5 rounded-full ${m.className}`}>
      {m.label}
    </span>
  );
}

function Spinner({ className = '' }: { className?: string }) {
  return <div className={`w-4 h-4 border-2 border-slate-600 border-t-indigo-400 rounded-full animate-spin ${className}`} />;
}

export default function EventSummaryTrackerPage() {
  const { user } = useAuth();
  const [weekStart, setWeekStart] = useState<string>(sundayOfThisWeek());
  const [leaders, setLeaders] = useState<CircleLeader[]>([]);
  const [snapshots, setSnapshots] = useState<SnapshotRow[]>([]);
  const [occurrences, setOccurrences] = useState<OccurrenceRow[]>([]);
  const [submissions, setSubmissions] = useState<SubmissionRow[]>([]);
  const [tracker, setTracker] = useState<TrackerData | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bannerDismissed, setBannerDismissed] = useState(false);
  const [bannerExpanded, setBannerExpanded] = useState(false);

  // Filters — persist across reloads
  const [campusFilter, setCampusFilter] = useState<string>('');
  const [acpdFilter, setAcpdFilter] = useState<string>('');
  const [circleStatusFilters, setCircleStatusFilters] = useState<string[]>([]);
  const [sortMode, setSortMode] = useState<'day_time' | 'name'>('day_time');
  const [filtersHydrated, setFiltersHydrated] = useState(false);
  useEffect(() => {
    if (typeof window === 'undefined') return;
    setCampusFilter(window.localStorage.getItem('est.campusFilter') ?? '');
    setAcpdFilter(window.localStorage.getItem('est.acpdFilter') ?? '');
    const storedCircleStatuses = window.localStorage.getItem('est.circleStatusFilters');
    const legacyCircleStatus = window.localStorage.getItem('est.circleStatusFilter');
    if (storedCircleStatuses) {
      try {
        const parsed = JSON.parse(storedCircleStatuses);
        if (Array.isArray(parsed)) setCircleStatusFilters(parsed.filter((status): status is string => typeof status === 'string'));
      } catch {
        window.localStorage.removeItem('est.circleStatusFilters');
      }
    } else if (legacyCircleStatus) {
      setCircleStatusFilters([legacyCircleStatus]);
    }
    const storedSort = window.localStorage.getItem('est.sortMode');
    if (storedSort === 'day_time' || storedSort === 'name') setSortMode(storedSort);
    setFiltersHydrated(true);
  }, []);
  useEffect(() => {
    if (!filtersHydrated || typeof window === 'undefined') return;
    window.localStorage.setItem('est.sortMode', sortMode);
  }, [sortMode, filtersHydrated]);
  useEffect(() => {
    if (!filtersHydrated || typeof window === 'undefined') return;
    if (campusFilter) window.localStorage.setItem('est.campusFilter', campusFilter);
    else window.localStorage.removeItem('est.campusFilter');
  }, [campusFilter, filtersHydrated]);
  useEffect(() => {
    if (!filtersHydrated || typeof window === 'undefined') return;
    if (acpdFilter) window.localStorage.setItem('est.acpdFilter', acpdFilter);
    else window.localStorage.removeItem('est.acpdFilter');
  }, [acpdFilter, filtersHydrated]);
  useEffect(() => {
    if (!filtersHydrated || typeof window === 'undefined') return;
    if (circleStatusFilters.length > 0) window.localStorage.setItem('est.circleStatusFilters', JSON.stringify(circleStatusFilters));
    else window.localStorage.removeItem('est.circleStatusFilters');
    window.localStorage.removeItem('est.circleStatusFilter');
  }, [circleStatusFilters, filtersHydrated]);

  // AI summary
  const [aiSummary, setAiSummary] = useState<string | null>(null);
  const [aiSummaryAt, setAiSummaryAt] = useState<string | null>(null);
  const [aiBusy, setAiBusy] = useState(false);
  const [aiSaving, setAiSaving] = useState(false);
  const [aiSummarySaved, setAiSummarySaved] = useState(false);
  const [aiOpen, setAiOpen] = useState(false);

  // Review modal
  const [reviewRow, setReviewRow] = useState<Row | null>(null);
  const [reviewBusy, setReviewBusy] = useState(false);

  // Reminder modal
  const [reminderLeader, setReminderLeader] = useState<CircleLeader | null>(null);
  const [reminderSent, setReminderSent] = useState<number[]>([]);
  const [smsSupported, setSmsSupported] = useState(true);
  useEffect(() => { setSmsSupported(platformSupportsSms()); }, []);

  // Optimistic review state — leaders just marked reviewed (forces them into Complete
  // even if the next loadAll roundtrip hasn't returned the new reviewer rows yet).
  // Cleared automatically on week change.
  const [justReviewed, setJustReviewed] = useState<Set<number>>(() => new Set());
  const [justUnreviewed, setJustUnreviewed] = useState<Set<number>>(() => new Set());
  useEffect(() => {
    setJustReviewed(new Set());
    setJustUnreviewed(new Set());
  }, [weekStart]);
  const [reviewLive, setReviewLive] = useState<{
    topic: string | null;
    notes: string | null;
    prayer_requests: string | null;
    headcount: number | null;
    guest_count: number | null;
    did_not_meet: boolean;
    loading: boolean;
  } | null>(null);

  const weekEnd = useMemo(() => DateTime.fromISO(weekStart).plus({ days: 6 }).toISODate()!, [weekStart]);

  // -- Data load ----------------------------------------------------------------
  const loadIdRef = useRef(0);
  const loadAll = useCallback(async () => {
    const myId = ++loadIdRef.current;
    setLoading(true);
    try {
      // Load every circle status so status filtering can inspect the full tracker population.
      const { data: leaderRows } = await supabase
        .from('circle_leaders')
        .select('id, name, phone, campus, acpd, status, day, time, frequency, meeting_start_date, circle_type, ccb_group_id, ccb_group_name, circle_name, follow_up_required');

      // Snapshots for the week
      const snapshotsRes = await fetch(`/api/event-summary-snapshots?week_start_date=${weekStart}`);
      const snapshotsJson = await snapshotsRes.json();

      // Occurrences in week
      const { data: occRows } = await supabase
        .from('circle_meeting_occurrences')
        .select('id, leader_id, meeting_date, status, headcount, has_notes, guest_count, topic, notes, prayer_requests, reviewed_at, reviewed_by')
        .gte('meeting_date', weekStart)
        .lte('meeting_date', weekEnd);

      // App submissions in week
      const { data: subRows } = await supabase
        .from('circle_event_summaries')
        .select('id, leader_id, occurrence, did_not_meet, topic, notes, prayer_requests, reviewed_at, reviewed_by')
        .gte('occurrence', `${weekStart}T00:00:00Z`)
        .lte('occurrence', `${weekEnd}T23:59:59Z`);

      // Composite tracker payload (orphans + missed_2 + reviewers + last_sync)
      const trackerRes = await fetch(`/api/event-summary-tracker?week_start_date=${weekStart}`, { cache: 'no-store' });
      const trackerJson = await trackerRes.json();

      // AI summary (per user, per week)
      let aiText: string | null = null;
      let aiAt: string | null = null;
      if (user?.id) {
        try {
          const aiRes = await fetch(`/api/weekly-ai-summary?week=${weekStart}&userId=${user.id}`);
          const aiJson = await aiRes.json();
          aiText = aiJson?.summary?.summary_text ?? null;
          aiAt = aiJson?.summary?.generated_at ?? null;
        } catch (e) {
          console.warn('[tracker] AI summary fetch failed (non-fatal):', e);
        }
      }

      // Only commit state if this is still the latest load
      if (loadIdRef.current !== myId) return;
      setLeaders(leaderRows ?? []);
      setSnapshots(snapshotsJson?.snapshots ?? []);
      setOccurrences(occRows ?? []);
      setSubmissions(subRows ?? []);
      setTracker(trackerJson?.error ? null : trackerJson);
      setAiSummary(aiText);
      setAiSummaryAt(aiAt);
      setAiSummarySaved(!!aiText);
    } catch (err) {
      console.error('[tracker] loadAll failed:', err);
    } finally {
      if (loadIdRef.current === myId) setLoading(false);
    }
  }, [weekStart, user?.id]);

  useEffect(() => { loadAll(); }, [loadAll]);

  // Reset the dismissible banner when the user navigates to a different week
  useEffect(() => { setBannerDismissed(false); }, [weekStart]);

  // Fetch live event summary for the modal whenever a row is selected
  useEffect(() => {
    if (!reviewRow) {
      setReviewLive(null);
      return;
    }
    let cancelled = false;
    setReviewLive({
      topic: reviewRow.topic,
      notes: reviewRow.notes,
      prayer_requests: reviewRow.occurrence?.prayer_requests ?? reviewRow.submission?.prayer_requests ?? null,
      headcount: reviewRow.headcount,
      guest_count: reviewRow.guestCount,
      did_not_meet: reviewRow.occurrence?.status === 'did_not_meet' || (reviewRow.submission?.did_not_meet ?? false),
      loading: true,
    });
    (async () => {
      try {
        const res = await fetch(
          `/api/circle-summary/leader-week-summary?leader_id=${reviewRow.leader.id}&week_start=${weekStart}&peek=1&force=1`
        );
        if (!res.ok) throw new Error('peek failed');
        const json = await res.json();
        if (cancelled) return;

        // resolveLeaderWeek returns either {status:'submitted',...} or {status:'ccb_only',...} or {status:'did_not_meet'} or {status:'not_submitted'}
        // Use || (not ??) so empty strings from the API don't hide existing row data.
        const next = {
          topic: json.topic || reviewRow.topic || null,
          notes: json.notes || reviewRow.notes || null,
          prayer_requests: json.prayer_requests || reviewRow.occurrence?.prayer_requests || reviewRow.submission?.prayer_requests || null,
          headcount: json.headcount ?? reviewRow.headcount ?? null,
          guest_count: json.guest_count ?? reviewRow.guestCount ?? null,
          did_not_meet: json.did_not_meet === true || json.status === 'did_not_meet',
          loading: false,
        };
        setReviewLive(next);
      } catch (e) {
        if (cancelled) return;
        setReviewLive(prev => prev ? { ...prev, loading: false } : null);
      }
    })();
    return () => { cancelled = true; };
  }, [reviewRow, weekStart]);

  // -- Derived state ------------------------------------------------------------
  const campuses = useMemo(() => Array.from(new Set(leaders.map(l => l.campus).filter(Boolean))).sort() as string[], [leaders]);
  const acpds    = useMemo(() => Array.from(new Set(leaders.map(l => l.acpd).filter(Boolean))).sort() as string[], [leaders]);

  // Which leaders are scheduled to meet this week — by day-of-week + frequency
  const scheduledLeaderIds = useMemo(() => {
    const weekStartDt = DateTime.fromISO(weekStart);
    return new Set(
      leaders
        .filter(l => {
          if (!l.day) return false;
          const meetingDate = scheduledMeetingDateForWeek(weekStart, l.day);
          if (!meetingDate) return false;

          const meetsOrdinalFrequency = meetsOrdinalFrequencyOnDate(l.frequency, meetingDate);
          if (meetsOrdinalFrequency !== null) return meetsOrdinalFrequency;

          // Bi-weekly parity check using meeting_start_date
          if (l.frequency === 'bi-weekly' && l.meeting_start_date) {
            const anchor = DateTime.fromISO(l.meeting_start_date);
            if (!anchor.isValid) return true;
            const weeksDiff = Math.round(weekStartDt.diff(anchor, 'weeks').weeks ?? 0);
            return weeksDiff % 2 === 0;
          }
          if (l.frequency === 'monthly') {
            // Approximate — keep if leader has not met yet this month
            return true; // do not exclude; better surface than hide
          }
          return true;
        })
        .map(l => l.id)
    );
  }, [leaders, weekStart]);

  // Build rows
  const rows: Row[] = useMemo(() => {
    // For each leader, pick the best occurrence row: reviewed first, then
    // latest meeting_date. Prevents duplicate rows from one leader/week
    // (e.g. an old stale row + a freshly backfilled one) from collapsing the
    // reviewed marker.
    const occByLeader = new Map<number, OccurrenceRow>();
    for (const o of occurrences) {
      const existing = occByLeader.get(o.leader_id);
      if (!existing) { occByLeader.set(o.leader_id, o); continue; }
      const oRev = !!o.reviewed_at;
      const eRev = !!existing.reviewed_at;
      if (oRev && !eRev) { occByLeader.set(o.leader_id, o); continue; }
      if (!oRev && eRev) continue;
      if (o.meeting_date > existing.meeting_date) occByLeader.set(o.leader_id, o);
    }
    const subByLeader = new Map<number, SubmissionRow>();
    for (const s of submissions) {
      const existing = subByLeader.get(s.leader_id);
      if (!existing) { subByLeader.set(s.leader_id, s); continue; }
      const sRev = !!s.reviewed_at;
      const eRev = !!existing.reviewed_at;
      if (sRev && !eRev) subByLeader.set(s.leader_id, s);
    }
    const snapByLeader = new Map<number, SnapshotRow>();
    for (const s of snapshots) snapByLeader.set(s.circle_leader_id, s);
    const missedSet = new Set(tracker?.missed_two_plus_leader_ids ?? []);

    const filtered = leaders.filter(l => {
      if (!scheduledLeaderIds.has(l.id)) return false;
      if (campusFilter && l.campus !== campusFilter) return false;
      if (acpdFilter && l.acpd !== acpdFilter) return false;
      if (circleStatusFilters.length > 0) {
        const statusMatch = !!l.status && circleStatusFilters.includes(l.status);
        const followUpMatch = circleStatusFilters.includes('follow-up') && !!l.follow_up_required;
        if (!statusMatch && !followUpMatch) return false;
      }
      return true;
    });

    return filtered.map(l => {
      const occ = occByLeader.get(l.id) ?? null;
      const sub = subByLeader.get(l.id) ?? null;
      const snap = snapByLeader.get(l.id);
      const reviewer = tracker?.reviewers[l.id] ?? null;

      // Status derivation: prefer "needs_review" over "received" when reviewed_at is null
      // and we have a record from CCB/app.
      let status: RowStatus;
      const hasSubmission = !!sub || !!occ;
      // Derive `isReviewed` from the row's own columns first — that's the
      // ground truth. The tracker.reviewers map is just used to display
      // who/when. If either path is missing we don't want to fall through
      // back to "needs review" incorrectly.
      const isReviewed = reviewer !== null || !!occ?.reviewed_at || !!sub?.reviewed_at;
      const didNotMeet = (occ?.status === 'did_not_meet') || (sub?.did_not_meet ?? false);

      if (!hasSubmission) {
        status = 'no_summary';
      } else if (!isReviewed) {
        status = 'needs_review';
      } else if (didNotMeet) {
        status = 'did_not_meet';
      } else {
        status = 'received';
      }

      // Fall back to snapshot state for explicit overrides (e.g. manual mark)
      if (status === 'no_summary' && snap?.ccb_report_available) {
        status = 'needs_review';
      }

      // Optimistic overrides — keep the UI snappy when the user just clicked
      // Mark Reviewed / Unreview, before the next loadAll lands.
      if (justReviewed.has(l.id) && status === 'needs_review') {
        status = didNotMeet ? 'did_not_meet' : 'received';
      }
      if (justUnreviewed.has(l.id) && (status === 'received' || status === 'did_not_meet')) {
        status = 'needs_review';
      }

      const headcount = occ?.headcount ?? null;
      const guestCount = occ?.guest_count ?? 0;
      const attendees = headcount && guestCount ? Math.max(0, headcount - guestCount) : (headcount ?? 0);

      return {
        leader: l,
        status,
        meetingDate: occ?.meeting_date ?? (sub ? DateTime.fromISO(sub.occurrence).toISODate() : null),
        headcount,
        guestCount,
        attendees,
        notes: occ?.notes ?? sub?.notes ?? null,
        topic: occ?.topic ?? sub?.topic ?? null,
        reviewer,
        occurrence: occ,
        submission: sub,
        missedTwoPlus: missedSet.has(l.id),
      };
    });
  }, [leaders, occurrences, submissions, snapshots, scheduledLeaderIds, tracker, campusFilter, acpdFilter, circleStatusFilters]);

  const sortRows = useCallback((arr: Row[]) => {
    const sorted = [...arr];
    if (sortMode === 'name') {
      sorted.sort((a, b) => a.leader.name.localeCompare(b.leader.name));
    } else {
      sorted.sort((a, b) => {
        const da = a.leader.day ? (DAY_INDEX[a.leader.day] ?? 99) : 99;
        const db = b.leader.day ? (DAY_INDEX[b.leader.day] ?? 99) : 99;
        if (da !== db) return da - db;
        const ta = parseTimeToMinutes(a.leader.time);
        const tb = parseTimeToMinutes(b.leader.time);
        if (ta !== tb) return ta - tb;
        return a.leader.name.localeCompare(b.leader.name);
      });
    }
    return sorted;
  }, [sortMode]);

  const needsReview = useMemo(() => sortRows(rows.filter(r => r.status === 'needs_review')), [rows, sortRows]);
  const awaiting    = useMemo(() => sortRows(rows.filter(r => r.status === 'no_summary')), [rows, sortRows]);
  const complete    = useMemo(() => sortRows(rows.filter(r => r.status === 'received' || r.status === 'did_not_meet')), [rows, sortRows]);

  const stats = useMemo(() => {
    const received   = rows.filter(r => r.status === 'received').length;
    const dnm        = rows.filter(r => r.status === 'did_not_meet').length;
    const review     = needsReview.length;
    const notReport  = awaiting.length;
    const inCcb      = received + dnm + review;
    let totalAtt = 0, totalGuest = 0;
    for (const r of rows) {
      if (r.status === 'received') {
        totalAtt += r.attendees ?? 0;
        totalGuest += r.guestCount ?? 0;
      }
    }
    const totalAttended = totalAtt + totalGuest;
    const avgSize = received > 0 ? Math.round((totalAttended / received) * 10) / 10 : null;
    const missedCount = rows.filter(r => r.missedTwoPlus).length;
    return { received, dnm, review, notReport, inCcb, totalAttended, avgSize, missedCount };
  }, [rows, needsReview.length, awaiting.length]);

  const orphanCount = (tracker?.orphans.inactive.length ?? 0) + (tracker?.orphans.unknown_group.length ?? 0);
  const issueCount = orphanCount + (stats.missedCount > 0 ? 1 : 0);

  // -- Actions ------------------------------------------------------------------
  const authHeader = useCallback(async (): Promise<HeadersInit> => {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    return token ? { 'Authorization': `Bearer ${token}` } : {};
  }, []);

  const syncNow = useCallback(async () => {
    if (syncing) return;
    setSyncing(true);
    try {
      const headers = { 'Content-Type': 'application/json', ...(await authHeader()) };
      const res = await fetch('/api/event-summary-tracker/sync', {
        method: 'POST',
        headers,
        body: JSON.stringify({ week_start_date: weekStart }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || 'Sync failed');
      await loadAll();
    } catch (err) {
      console.error(err);
      alert((err as Error).message);
    } finally {
      setSyncing(false);
    }
  }, [syncing, weekStart, loadAll, authHeader]);

  const reviewSingle = useCallback(async (leaderId: number, action: 'mark_reviewed' | 'unmark_reviewed') => {
    // Optimistic flip so the row moves buckets instantly
    if (action === 'mark_reviewed') {
      setJustReviewed(prev => { const n = new Set(prev); n.add(leaderId); return n; });
      setJustUnreviewed(prev => { const n = new Set(prev); n.delete(leaderId); return n; });
    } else {
      setJustUnreviewed(prev => { const n = new Set(prev); n.add(leaderId); return n; });
      setJustReviewed(prev => { const n = new Set(prev); n.delete(leaderId); return n; });
    }

    const headers = { 'Content-Type': 'application/json', ...(await authHeader()) };
    const res = await fetch('/api/circle-summary/leader-week-summary', {
      method: 'POST',
      headers,
      body: JSON.stringify({ action, leader_id: leaderId, week_start_date: weekStart }),
    });
    if (!res.ok) {
      // Roll back the optimistic flip on failure
      if (action === 'mark_reviewed') {
        setJustReviewed(prev => { const n = new Set(prev); n.delete(leaderId); return n; });
      } else {
        setJustUnreviewed(prev => { const n = new Set(prev); n.delete(leaderId); return n; });
      }
      const j = await res.json().catch(() => ({}));
      alert(j?.error || 'Action failed');
      return;
    }
    await loadAll();
  }, [weekStart, loadAll, authHeader]);

  const bulkReview = useCallback(async () => {
    if (bulkBusy || needsReview.length === 0) return;
    const ok = window.confirm(`Mark ${needsReview.length} summaries reviewed?`);
    if (!ok) return;
    setBulkBusy(true);
    try {
      const headers = { 'Content-Type': 'application/json', ...(await authHeader()) };
      const res = await fetch('/api/event-summary-tracker/bulk-review', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          week_start_date: weekStart,
          leader_ids: needsReview.map(r => r.leader.id),
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || 'Bulk review failed');
      await loadAll();
      const totalMarked = json.leaders_total_marked ?? 0;
      const skipped = json.backfill_skipped_no_ccb_match ?? 0;
      const msgs: string[] = [];
      msgs.push(`Marked ${totalMarked} reviewed`);
      if (json.backfilled_and_marked > 0) msgs.push(`(${json.backfilled_and_marked} backfilled from CCB)`);
      if (skipped > 0) msgs.push(`${skipped} skipped — no matching CCB event`);
      alert(msgs.join(' · '));
    } catch (err) {
      alert((err as Error).message);
    } finally {
      setBulkBusy(false);
    }
  }, [bulkBusy, needsReview, weekStart, loadAll, authHeader]);

  const openReminder = useCallback(async (leader: CircleLeader) => {
    try {
      const { data } = await supabase
        .from('event_summary_followups')
        .select('message_number')
        .eq('circle_leader_id', leader.id)
        .eq('week_start_date', weekStart);
      setReminderSent(data ? data.map(r => r.message_number) : []);
    } catch (e) {
      setReminderSent([]);
    }
    setReminderLeader(leader);
  }, [weekStart]);

  const sendReminder = useCallback(async (messageNumber: number, messageText: string) => {
    if (!reminderLeader || !user?.id) return;
    const today = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
    const noteContent = `[Event Summary Reminder ${messageNumber} - ${today}]\n\n${messageText}`;

    const { error: noteError } = await supabase.from('notes').insert({
      circle_leader_id: reminderLeader.id,
      content: noteContent,
      created_by: user.id,
    });
    if (noteError) throw noteError;

    const { error: followupError } = await supabase.from('event_summary_followups').insert({
      circle_leader_id: reminderLeader.id,
      message_number: messageNumber,
      sent_by: user.id,
      week_start_date: weekStart,
    });
    if (followupError) throw followupError;

    setReminderSent(prev => [...prev, messageNumber]);

    if (reminderLeader.phone) {
      const cleanPhone = reminderLeader.phone.replace(/\D/g, '');
      const encoded = encodeURIComponent(messageText);
      // Use a synthetic anchor click — `window.location.href` from inside an
      // async callback can be blocked by some browsers because the user-gesture
      // context is lost. An <a> click reliably triggers the native SMS handler.
      const a = document.createElement('a');
      a.href = `sms:${cleanPhone}?body=${encoded}`;
      a.style.display = 'none';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    }
  }, [reminderLeader, user?.id, weekStart]);

  const generateAi = useCallback(async () => {
    if (aiBusy || !user?.id) return;
    setAiBusy(true);
    try {
      const filterLabel = [campusFilter, acpdFilter].filter(Boolean).join(' · ') || 'All Circles';
      const headers = { 'Content-Type': 'application/json', ...(await authHeader()) };
      const genRes = await fetch('/api/weekly-ai-summary', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          weekStartDate: weekStart,
          weekLabel: formatWeekLabel(weekStart),
          filterLabel,
          leaders: rows.map(r => ({
            id: r.leader.id,
            name: r.leader.name,
            circle_type: r.leader.circle_type,
            campus: r.leader.campus,
            acpd: r.leader.acpd,
            status: r.leader.status,
            eventState: r.status,
          })),
        }),
      });
      const genJson = await genRes.json();
      if (!genRes.ok || !genJson.summary) throw new Error(genJson?.error || 'AI summary failed');

      setAiSummary(genJson.summary);
      setAiSummaryAt(null);
      setAiSummarySaved(false);
      setAiOpen(true);
    } catch (err) {
      alert((err as Error).message);
    } finally {
      setAiBusy(false);
    }
  }, [aiBusy, user?.id, weekStart, rows, campusFilter, acpdFilter, authHeader]);

  const saveAiSummary = useCallback(async () => {
    if (!aiSummary || aiSummarySaved || aiSaving || !user?.id) return;
    setAiSaving(true);
    try {
      const filterLabel = [campusFilter, acpdFilter].filter(Boolean).join(' · ') || 'All Circles';
      const headers = { 'Content-Type': 'application/json', ...(await authHeader()) };
      const saveRes = await fetch('/api/weekly-ai-summary', {
        method: 'PUT',
        headers,
        body: JSON.stringify({
          weekStartDate: weekStart,
          summaryText: aiSummary,
          filterLabel,
          generatedBy: user.id,
        }),
      });
      const saveJson = await saveRes.json();
      if (!saveRes.ok || saveJson.error) throw new Error(saveJson?.error || 'Failed to save AI summary');
      setAiSummary(saveJson.summary?.summary_text ?? aiSummary);
      setAiSummaryAt(saveJson.summary?.generated_at ?? new Date().toISOString());
      setAiSummarySaved(true);
    } catch (err) {
      alert((err as Error).message);
    } finally {
      setAiSaving(false);
    }
  }, [aiSummary, aiSummarySaved, aiSaving, user?.id, weekStart, campusFilter, acpdFilter, authHeader]);

  // -- Render -------------------------------------------------------------------
  return (
    <div className="min-h-screen bg-slate-900 text-white">
      <div className="p-4 sm:p-6 lg:p-8 max-w-screen-2xl mx-auto">

        {/* Header */}
        <div className="mb-5">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-white">
              Event Summary Tracker
            </h1>
            <p className="text-sm text-slate-400 mt-1 sm:hidden">
              <span className="text-slate-200 font-medium">{formatWeekLabel(weekStart)}</span>
              {tracker?.last_sync && (
                <span className="text-slate-500"> · last sync {formatRelativeTime(tracker.last_sync.last_synced_at)}</span>
              )}
            </p>
          </div>

          {/* Filters */}
          <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:justify-end">
            <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-center">
              <select
                value={campusFilter}
                onChange={e => setCampusFilter(e.target.value)}
                className="bg-slate-700 border border-slate-600 text-slate-200 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 w-full sm:w-auto min-w-0"
              >
                <option value="">All campuses</option>
                {campuses.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
              <select
                value={acpdFilter}
                onChange={e => setAcpdFilter(e.target.value)}
                className="bg-slate-700 border border-slate-600 text-slate-200 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 w-full sm:w-auto min-w-0"
              >
                <option value="">All ACPDs</option>
                {acpds.map(a => <option key={a} value={a}>{a}</option>)}
              </select>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {/* Sort: compact icon-only segmented control (fits anywhere) */}
              <div
                className="inline-flex items-center rounded-lg border border-slate-700 bg-slate-800/80 p-0.5 flex-shrink-0"
                role="group"
                aria-label="Sort order"
              >
                <button
                  onClick={() => setSortMode('day_time')}
                  aria-pressed={sortMode === 'day_time'}
                  aria-label="Sort by day and time"
                  title="Sort by day and time"
                  className={`inline-flex items-center justify-center w-8 h-7 rounded-md transition-colors ${
                    sortMode === 'day_time'
                      ? 'bg-indigo-500/20 text-indigo-200'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 0 1 2.25-2.25h13.5A2.25 2.25 0 0 1 21 7.5v11.25m-18 0A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75m-18 0v-7.5A2.25 2.25 0 0 1 5.25 9h13.5A2.25 2.25 0 0 1 21 11.25v7.5" />
                  </svg>
                </button>
                <button
                  onClick={() => setSortMode('name')}
                  aria-pressed={sortMode === 'name'}
                  aria-label="Sort alphabetically"
                  title="Sort A–Z"
                  className={`inline-flex items-center justify-center w-8 h-7 rounded-md transition-colors ${
                    sortMode === 'name'
                      ? 'bg-indigo-500/20 text-indigo-200'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <span className="text-[11px] font-bold tracking-tight">A–Z</span>
                </button>
              </div>
              <StatusFilterDropdown
                selected={circleStatusFilters}
                onChange={setCircleStatusFilters}
              />
            </div>
          </div>

          {/* Row 2: week nav + sync */}
          <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-slate-800/80 pt-3 sm:mt-2 sm:border-0 sm:pt-0">
            <button
              onClick={() => setWeekStart(s => shiftWeek(s, -1))}
              className="bg-slate-700 hover:bg-slate-600 text-slate-200 px-3 py-1.5 rounded-lg text-sm transition-colors"
              aria-label="Previous week"
            >‹</button>
            <button
              onClick={() => setWeekStart(sundayOfThisWeek())}
              className="bg-slate-700 hover:bg-slate-600 text-slate-200 px-3 py-1.5 rounded-lg text-sm transition-colors"
            >Today</button>
            <button
              onClick={() => setWeekStart(s => shiftWeek(s, 1))}
              className="bg-slate-700 hover:bg-slate-600 text-slate-200 px-3 py-1.5 rounded-lg text-sm transition-colors"
              aria-label="Next week"
            >›</button>
            <p className="hidden items-center gap-2 text-sm text-slate-400 sm:flex">
              <span className="rounded-lg border border-slate-700 bg-slate-800/80 px-3 py-1.5 text-base font-semibold text-white shadow-sm">
                {formatWeekLabel(weekStart)}
              </span>
              {tracker?.last_sync && (
                <span className="text-slate-500"> · last sync {formatRelativeTime(tracker.last_sync.last_synced_at)}</span>
              )}
            </p>
            <button
              onClick={syncNow}
              disabled={syncing}
              className="inline-flex items-center gap-1.5 bg-btn-primary text-white px-3 py-1.5 rounded-lg text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-60 ml-auto"
            >
              {syncing ? <Spinner /> : (
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 0 0 4.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 0 1-15.357-2m15.357 2H15" />
                </svg>
              )}
              Sync Now
            </button>
          </div>
        </div>

        {/* Alerts banner */}
        {!bannerDismissed && issueCount > 0 && (
          <div className="mb-4 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3">
            <div className="flex items-center justify-between gap-3">
              <button
                onClick={() => setBannerExpanded(v => !v)}
                className="flex items-center gap-2 text-amber-200 text-sm font-medium"
              >
                <AlertTriangle className="h-4 w-4 shrink-0 text-amber-300" />
                {issueCount} {issueCount === 1 ? 'issue' : 'issues'} need attention
                <svg
                  className={`h-4 w-4 text-amber-200/60 transition-transform duration-200 ${bannerExpanded ? 'rotate-180' : ''}`}
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={1.8}
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
                </svg>
              </button>
              <button
                onClick={() => setBannerDismissed(true)}
                className="text-amber-200/60 hover:text-amber-200 text-xs"
              >Dismiss</button>
            </div>
            {bannerExpanded && (
              <div className="mt-3 space-y-2 text-sm">
                {stats.missedCount > 0 && (
                  <div className="text-amber-200/90 flex items-start gap-2">
                    <AlertTriangle className="w-4 h-4 text-amber-300 flex-shrink-0 mt-0.5" />
                    <span>{stats.missedCount} {stats.missedCount === 1 ? 'circle has' : 'circles have'} not met for 2+ scheduled weeks.</span>
                  </div>
                )}
                {tracker?.orphans.inactive.map(o => (
                  <div key={`i-${o.id}`} className="text-yellow-200/90 flex items-start gap-2">
                    <AlertTriangle className="w-4 h-4 text-yellow-300 flex-shrink-0 mt-0.5" />
                    <span><span className="font-medium">{o.ccb_event_name}</span> is marked inactive in Radius but submitted a summary.</span>
                  </div>
                ))}
                {tracker?.orphans.unknown_group.map(o => (
                  <div key={`u-${o.id}`} className="text-red-200/90 flex items-start gap-2">
                    <AlertTriangle className="w-4 h-4 text-red-300 flex-shrink-0 mt-0.5" />
                    <span><span className="font-medium">{o.ccb_event_name}</span> submitted a summary but isn&apos;t in Radius.</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Stats card */}
        <div className="rounded-xl border border-slate-700 bg-slate-800/60 p-4 sm:p-5 shadow-card-glass mb-4">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 sm:gap-6 text-center">
            <Stat value={stats.received}  label="Received"      color="text-green-400" />
            <Stat value={stats.review}    label="Needs Review"  color="text-amber-400" />
            <Stat value={stats.dnm}       label="Didn't Meet"   color="text-slate-300" />
            <Stat value={stats.notReport} label="No Summary"    color="text-red-400" />
          </div>
          <div className="mt-5 pt-4 border-t border-slate-700/60 flex flex-wrap items-center justify-between gap-3 text-sm">
            <div className="flex w-full justify-center gap-8 sm:w-auto sm:justify-start">
              <SmallStat label="ATTENDED" value={stats.totalAttended} />
              <SmallStat label="AVG SIZE" value={stats.avgSize ?? '–'} />
              <SmallStat label="CIRCLES" value={rows.length} />
            </div>
            <div className="flex w-full items-center justify-center gap-2 sm:w-auto sm:justify-end">
              <button
                onClick={bulkReview}
                disabled={bulkBusy || needsReview.length === 0}
                className="bg-btn-primary text-white px-3 py-1.5 rounded-lg text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
              >
                {bulkBusy ? 'Marking…' : `Mark all reviewed (${needsReview.length})`}
              </button>
            </div>
          </div>
        </div>

        {/* AI Weekly Summary */}
        <div className="rounded-xl border border-indigo-500/20 bg-gradient-to-r from-indigo-500/5 to-purple-500/5 p-3 mb-4">
          <div className="flex items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-2 text-sm">
              <span className="text-indigo-300">✨ AI Weekly Summary</span>
              <span className={`text-slate-500 ${aiOpen ? '' : 'hidden'}`}>·</span>
              <span className={`text-slate-400 text-xs ${aiOpen ? '' : 'hidden'}`}>{[campusFilter, acpdFilter].filter(Boolean).join(' · ') || 'All Circles'}</span>
              {aiSummaryAt && (
                <span className={`text-slate-500 text-xs ml-2 ${aiOpen ? '' : 'hidden'}`}>generated {formatRelativeTime(aiSummaryAt)}</span>
              )}
              {aiSummary && !aiSummarySaved && (
                <span className={`text-amber-300/80 text-xs ml-2 ${aiOpen ? '' : 'hidden'}`}>unsaved</span>
              )}
            </div>
            <div className="flex items-center gap-1.5">
              {aiSummary && !aiSummarySaved && (
                <button
                  onClick={saveAiSummary}
                  disabled={aiSaving || !user?.id}
                  className={`bg-btn-primary text-white text-xs font-medium px-2.5 py-1 rounded-lg hover:opacity-90 transition-opacity disabled:opacity-50 ${aiOpen ? '' : 'hidden'}`}
                >
                  {aiSaving ? 'Saving…' : 'Save'}
                </button>
              )}
              <button
                onClick={generateAi}
                disabled={aiBusy || aiSaving || !user?.id}
                className={`text-xs text-indigo-300 hover:text-indigo-200 px-2 py-1 rounded-lg hover:bg-indigo-500/10 transition-colors disabled:opacity-50 ${aiSummary && !aiOpen ? 'hidden' : ''}`}
              >
                {aiBusy ? 'Generating…' : (aiSummary ? 'Regenerate' : 'Generate')}
              </button>
              {aiSummary && (
                <button
                  onClick={() => setAiOpen(o => !o)}
                  aria-label={aiOpen ? 'Collapse AI weekly summary' : 'Expand AI weekly summary'}
                  aria-expanded={aiOpen}
                  className="inline-flex h-7 items-center gap-1 rounded-md px-1.5 text-xs text-indigo-300 transition-colors hover:bg-slate-700 hover:text-slate-200"
                >
                  {!aiOpen && <span>View</span>}
                  <svg
                    className={`h-4 w-4 transition-transform duration-200 ${aiOpen ? 'rotate-180' : ''}`}
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={1.8}
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
                  </svg>
                </button>
              )}
            </div>
          </div>
          {aiOpen && aiSummary && (
            <div className="mt-3 border-t border-indigo-500/10 pt-3">
              <AiSummaryMarkdown text={aiSummary} />
            </div>
          )}
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-12 text-slate-400 text-sm">
            <Spinner className="mr-2" /> Loading week…
          </div>
        ) : (
          <>
            <Bucket title="Needs Review" tone="amber" rows={needsReview} renderRow={(r) => (
              <RowItem row={r} onReview={() => setReviewRow(r)} reviewLabel="Review" />
            )} />
            <Bucket title="Awaiting Submission" tone="red" rows={awaiting} renderRow={(r) => (
              <RowItem row={r} onSendReminder={smsSupported ? () => openReminder(r.leader) : undefined} />
            )} />
            <Bucket title="Complete" tone="green" rows={complete} renderRow={(r) => (
              <RowItem row={r} onReview={() => setReviewRow(r)} reviewLabel="View Summary" />
            )} collapsedByDefault={complete.length > 12} />
          </>
        )}
      </div>

      <ReviewModal
        row={reviewRow}
        live={reviewLive}
        busy={reviewBusy}
        isReviewed={!!reviewRow?.reviewer}
        onClose={() => reviewRow && !reviewBusy && setReviewRow(null)}
        onConfirm={async () => {
          if (!reviewRow) return;
          setReviewBusy(true);
          try {
            const action = reviewRow.reviewer ? 'unmark_reviewed' : 'mark_reviewed';
            await reviewSingle(reviewRow.leader.id, action);
            setReviewRow(null);
          } finally {
            setReviewBusy(false);
          }
        }}
      />

      {reminderLeader && (
        <EventSummaryReminderModal
          isOpen={!!reminderLeader}
          onClose={() => setReminderLeader(null)}
          leaderName={reminderLeader.name}
          sentMessages={reminderSent}
          onSend={sendReminder}
        />
      )}
    </div>
  );
}

function ReviewModal({
  row,
  live,
  busy,
  isReviewed,
  onClose,
  onConfirm,
}: {
  row: Row | null;
  live: {
    topic: string | null;
    notes: string | null;
    prayer_requests: string | null;
    headcount: number | null;
    guest_count: number | null;
    did_not_meet: boolean;
    loading: boolean;
  } | null;
  busy: boolean;
  isReviewed: boolean;
  onClose: () => void;
  onConfirm: () => void;
}) {
  if (!row) return null;

  const meetingLabel = row.meetingDate
    ? DateTime.fromISO(row.meetingDate).toFormat('cccc, LLL d')
    : (row.leader.day ?? '');
  const dnm = live?.did_not_meet ?? (row.occurrence?.status === 'did_not_meet' || row.submission?.did_not_meet);
  const headcount = live?.headcount ?? row.headcount ?? 0;
  const guestCount = live?.guest_count ?? row.guestCount ?? 0;
  const inRoster = Math.max(0, (headcount ?? 0) - (guestCount ?? 0));
  const totalAttended = (headcount ?? 0);
  const notes = live?.notes || row.notes || null;
  const topic = live?.topic || row.topic || null;
  const prayerRequests = live?.prayer_requests || row.occurrence?.prayer_requests || row.submission?.prayer_requests || null;
  const liveLoading = live?.loading === true;

  return (
    <Modal isOpen={!!row} onClose={onClose} title={row.leader.name} size="lg">
      <div className="space-y-5">
        <div>
          <div className="text-lg font-semibold text-white">
            {meetingLabel}
            {row.leader.time && (
              <span className="text-slate-400 font-normal"> · {formatMeetingTime(row.leader.time)}</span>
            )}
          </div>
          {(row.leader.campus || row.leader.acpd) && (
            <div className="flex flex-wrap items-center gap-2 mt-2 text-[10px]">
              {row.leader.campus && (
                <span className="bg-slate-700/60 text-slate-300 uppercase tracking-wide px-2 py-0.5 rounded">
                  {row.leader.campus}
                </span>
              )}
              {row.leader.acpd && (
                <span className="bg-indigo-500/15 text-indigo-300 uppercase tracking-wide px-2 py-0.5 rounded">
                  {row.leader.acpd}
                </span>
              )}
            </div>
          )}
          {row.reviewer && (
            <div className="text-xs text-slate-500 mt-2">
              Reviewed by <span className="text-slate-300">{row.reviewer.reviewed_by_name}</span> · {DateTime.fromISO(row.reviewer.reviewed_at).toFormat('LLL d, h:mma').replace(/AM|PM/, m => m.toLowerCase())}
            </div>
          )}
        </div>

        {dnm && (
          <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3 flex items-start gap-3">
            <svg className="w-5 h-5 text-amber-300 flex-shrink-0 mt-0.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
            </svg>
            <div>
              <div className="text-sm font-semibold text-amber-200">Reported as Did Not Meet</div>
              <div className="text-xs text-amber-200/80 mt-0.5">
                The Circle Leader marked this week as &quot;did not meet&quot; in CCB.
              </div>
            </div>
          </div>
        )}

        {!dnm && (headcount ?? 0) > 0 && (
          <div className="grid grid-cols-3 gap-3">
            <ModalStat label="Attended" value={totalAttended} />
            <ModalStat label="In-Roster" value={inRoster} />
            <ModalStat label="Guests" value={guestCount ?? 0} />
          </div>
        )}

        {topic && (
          <div>
            <div className="text-[10px] uppercase tracking-wide text-slate-500 mb-1">Topic</div>
            <div className="text-sm text-slate-100">{topic}</div>
          </div>
        )}

        {notes && (
          <div>
            <div className="text-[10px] uppercase tracking-wide text-slate-500 mb-1">Notes</div>
            <div className="text-sm text-slate-200 whitespace-pre-wrap leading-relaxed bg-slate-900/40 border border-slate-700 rounded-lg p-3">
              {notes}
            </div>
          </div>
        )}

        {prayerRequests && (
          <div>
            <div className="text-[10px] uppercase tracking-wide text-slate-500 mb-1">Prayer Requests</div>
            <div className="text-sm text-slate-200 whitespace-pre-wrap leading-relaxed bg-slate-900/40 border border-slate-700 rounded-lg p-3">
              {prayerRequests}
            </div>
          </div>
        )}

        {liveLoading && (
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <Spinner /> Fetching latest from CCB…
          </div>
        )}

        {!liveLoading && !topic && !notes && !prayerRequests && !dnm && (
          <div className="text-sm text-slate-400 italic">
            No notes recorded — the leader submitted attendance only.
          </div>
        )}

        <div
          className="flex items-center justify-end gap-2 sticky bottom-0 -mx-4 sm:-mx-6 -mb-3 sm:-mb-4 px-4 sm:px-6 py-3 sm:py-4 border-t border-slate-700/60 bg-[rgba(9,27,52,0.95)] backdrop-blur-sm"
          style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}
        >
          <button
            onClick={onClose}
            disabled={busy}
            className="text-slate-400 hover:text-white hover:bg-slate-700 px-3 py-1.5 rounded-lg text-sm transition-colors disabled:opacity-50"
          >
            Close
          </button>
          <button
            onClick={onConfirm}
            disabled={busy}
            className={`inline-flex items-center gap-1.5 text-white px-4 py-1.5 rounded-lg text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-60 ${
              isReviewed ? 'bg-slate-600 hover:bg-slate-500' : 'bg-btn-primary'
            }`}
          >
            {busy && <Spinner />}
            {busy ? (isReviewed ? 'Unmarking…' : 'Marking…') : (isReviewed ? 'Mark as Unreviewed' : 'Mark Reviewed')}
          </button>
        </div>
      </div>
    </Modal>
  );
}

function ModalStat({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="bg-slate-900/40 border border-slate-700 rounded-lg px-3 py-2">
      <div className="text-[10px] uppercase tracking-wide text-slate-500">{label}</div>
      <div className="text-xl font-semibold text-slate-100 mt-0.5">{value}</div>
    </div>
  );
}

// ─── subcomponents ────────────────────────────────────────────────────────────

function Stat({ value, label, color }: { value: number | string; label: string; color: string }) {
  return (
    <div>
      <div className={`text-3xl font-bold ${color}`}>{value}</div>
      <div className="text-xs text-slate-400 mt-1">{label}</div>
    </div>
  );
}

function SmallStat({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="flex flex-col items-center gap-0.5">
      <div className="text-2xl font-bold text-white tabular-nums">{value}</div>
      <div className="text-[10px] text-slate-400 uppercase tracking-widest font-medium">{label}</div>
    </div>
  );
}

function StatusFilterDropdown({
  selected,
  onChange,
}: {
  selected: string[];
  onChange: (next: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const selectedLabels = CIRCLE_STATUS_OPTIONS
    .filter(status => selected.includes(status.value))
    .map(status => status.label);
  const label = selectedLabels.length === 0
    ? 'All Statuses'
    : selectedLabels.length === 1
      ? selectedLabels[0]
      : `${selectedLabels.length} Statuses`;

  useEffect(() => {
    if (!open) return;

    const closeOnOutsideClick = (event: MouseEvent | TouchEvent) => {
      if (!dropdownRef.current?.contains(event.target as Node)) setOpen(false);
    };

    document.addEventListener('mousedown', closeOnOutsideClick);
    document.addEventListener('touchstart', closeOnOutsideClick);
    return () => {
      document.removeEventListener('mousedown', closeOnOutsideClick);
      document.removeEventListener('touchstart', closeOnOutsideClick);
    };
  }, [open]);

  const toggleStatus = (value: string) => {
    onChange(
      selected.includes(value)
        ? selected.filter(status => status !== value)
        : [...selected, value]
    );
  };

  return (
    <div ref={dropdownRef} className="relative min-w-0 flex-1 sm:flex-initial">
      <button
        type="button"
        onClick={() => setOpen(current => !current)}
        aria-expanded={open}
        className="bg-slate-700 border border-slate-600 text-slate-200 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 inline-flex w-full sm:w-44 items-center justify-between gap-2"
      >
        <span className="truncate">{label}</span>
        <svg className="h-4 w-4 flex-shrink-0 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}>
          <path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
        </svg>
      </button>
      {open && (
        <div className="absolute left-0 top-[calc(100%+0.4rem)] z-30 w-[min(14rem,calc(100vw-3rem))] rounded-lg border border-slate-600 bg-slate-800 p-1.5 shadow-xl sm:left-auto sm:right-0">
          <div className="max-h-72 space-y-0.5 overflow-y-auto">
            {CIRCLE_STATUS_OPTIONS.map(status => (
              <label
                key={status.value}
                className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm text-slate-200 hover:bg-slate-700/70"
              >
                <input
                  type="checkbox"
                  checked={selected.includes(status.value)}
                  onChange={() => toggleStatus(status.value)}
                  className="h-4 w-4 rounded border-slate-500 bg-slate-700 text-indigo-400 focus:ring-indigo-400"
                />
                <span>{status.label}</span>
              </label>
            ))}
          </div>
          {selected.length > 0 && (
            <button
              type="button"
              onClick={() => onChange([])}
              className="mt-2 w-full rounded-md border border-slate-600 px-2 py-1.5 text-left text-xs font-medium text-slate-300 hover:bg-slate-700 hover:text-white"
            >
              Clear statuses
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function Bucket({
  title,
  tone,
  rows,
  renderRow,
  collapsedByDefault,
}: {
  title: string;
  tone: 'amber' | 'red' | 'green';
  rows: Row[];
  renderRow: (r: Row) => React.ReactNode;
  collapsedByDefault?: boolean;
}) {
  const [open, setOpen] = useState(!collapsedByDefault);
  const toneClass = tone === 'amber' ? 'border-amber-500/30' : tone === 'red' ? 'border-red-500/30' : 'border-green-500/30';
  const dot = tone === 'amber' ? 'bg-amber-400' : tone === 'red' ? 'bg-red-400' : 'bg-green-400';
  return (
    <div className={`mb-4 rounded-xl border ${toneClass} bg-slate-800/40`}>
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full px-4 py-3 flex items-center justify-between hover:bg-slate-700/20 transition-colors rounded-t-xl"
        aria-expanded={open}
      >
        <span className="flex items-center gap-2 text-sm font-semibold text-slate-100">
          <span className={`w-2 h-2 rounded-full ${dot}`} />
          {title}
          <span className="text-slate-500 font-normal">· {rows.length}</span>
        </span>
        <span className="text-slate-400 inline-flex items-center justify-center w-6 h-6 rounded-md hover:bg-slate-700/40">
          <svg
            className={`w-4 h-4 transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={1.8}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
          </svg>
        </span>
      </button>
      {open && (
        rows.length === 0 ? (
          <div className="px-4 pb-4 text-slate-500 text-xs italic">Nothing here.</div>
        ) : (
          <div className="divide-y divide-slate-700/40 border-t border-slate-700/40">
            {rows.map(r => <div key={r.leader.id}>{renderRow(r)}</div>)}
          </div>
        )
      )}
    </div>
  );
}

function RowItem({
  row,
  onReview,
  reviewLabel,
  onSendReminder,
}: {
  row: Row;
  onReview?: () => void;
  reviewLabel?: string;
  onSendReminder?: () => void;
}) {
  const r = row;
  return (
    <div className="px-4 py-3 flex flex-wrap items-center justify-between gap-3 hover:bg-slate-700/20 transition-colors">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          <Link
            href={`/circle/${r.leader.id}`}
            className="text-sm font-medium text-slate-100 hover:text-indigo-300 hover:underline transition-colors"
          >
            {r.leader.name}
          </Link>
          {r.missedTwoPlus && (
            <span className="text-[10px] uppercase tracking-wide text-amber-300 bg-amber-500/15 px-1.5 py-0.5 rounded">
              missed 2+
            </span>
          )}
        </div>
        <div className="mt-1 flex items-center gap-3 text-xs text-slate-400 flex-wrap">
          {r.leader.day && <span>{r.leader.day}{r.leader.time ? ` · ${formatMeetingTime(r.leader.time)}` : ''}</span>}
          {r.status === 'did_not_meet' ? (
            <span>Did Not Meet</span>
          ) : r.headcount != null && r.headcount > 0 && (
            <span>
              {(r.attendees ?? 0) + (r.guestCount ?? 0)}
              {r.guestCount > 0 && (
                <span className="text-slate-500"> ({r.guestCount} guest{r.guestCount === 1 ? '' : 's'})</span>
              )}
            </span>
          )}
        </div>
      </div>
      <div className="flex items-center gap-1.5">
        {onSendReminder && (
          <button
            onClick={onSendReminder}
            className="bg-slate-700 hover:bg-slate-600 text-slate-200 text-xs px-3 py-1.5 rounded-lg transition-colors whitespace-nowrap"
          >
            Send Reminder
          </button>
        )}
        {onReview && (
          <button
            onClick={onReview}
            className="bg-slate-700 hover:bg-slate-600 text-slate-200 text-xs px-3 py-1.5 rounded-lg transition-colors whitespace-nowrap"
          >
            {reviewLabel ?? 'Mark Reviewed'}
          </button>
        )}
      </div>
    </div>
  );
}
