'use client';

import dynamic from 'next/dynamic';
import { useCallback, useEffect, useMemo, useState, type MouseEvent, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import type { DatesSetArg, EventClickArg, EventContentArg } from '@fullcalendar/core';
import listPlugin from '@fullcalendar/list';
import interactionPlugin from '@fullcalendar/interaction';
import type { DateClickArg } from '@fullcalendar/interaction';
import { DateTime } from 'luxon';
import type { CircleLeader, EventSummaryState } from '../../lib/supabase';
import { getEventSummaryState, getEventSummaryColors } from '../../lib/event-summary-utils';
import EventExplorerModal from '../modals/EventExplorerModal';
import EventSummaryReminderModal from '../modals/EventSummaryReminderModal';
import WeeklySummaryChatModal from '../modals/WeeklySummaryChatModal';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';

const FullCalendar = dynamic(() => import('@fullcalendar/react'), { ssr: false });

const DEFAULT_CALENDAR_VIEW = 'listWeek';

function renderAISummary(text: string) {
  const lines = text.split('\n');
  const elements: ReactNode[] = [];
  let key = 0;

  const renderInline = (str: string): ReactNode => {
    const parts = str.split(/(\*\*[^*]+\*\*)/g);
    return parts.map((part, i) =>
      part.startsWith('**') && part.endsWith('**')
        ? <strong key={i} className="text-white font-semibold">{part.slice(2, -2)}</strong>
        : part
    );
  };

  let i = 0;
  while (i < lines.length) {
    const raw = lines[i];
    const line = raw.trim();

    if (!line) { i++; continue; }

    // Section header: **N. Title**, N. **Title**, or plain N. Title (handles both Gemini and Groq output)
    const cleanHeader = line.replace(/^\*\*/, '').replace(/\*\*$/, '');
    const isStyledHeader = (line.startsWith('**') && line.endsWith('**') && /\d+\./.test(line)) || /^\d+\.\s+\*\*/.test(line);
    const isPlainHeader = /^\d+\.\s+[A-Za-z]/.test(line) && !line.slice(line.indexOf('.') + 1).trim().startsWith('**') && line.length < 80 && !/:\s/.test(line.slice(line.indexOf('.') + 1));
    if (isStyledHeader || isPlainHeader) {
      const label = cleanHeader.replace(/^\d+\.\s+/, '').replace(/\*\*/g, '');
      const num = cleanHeader.match(/^(\d+)/)?.[1];
      elements.push(
        <div key={key++} className={`flex items-baseline gap-2 mt-5 mb-2 pb-1.5 border-b border-purple-500/20 ${i === 0 || elements.length === 0 ? 'mt-2' : ''}`}>
          {num && <span className="text-xs font-bold text-purple-400/60 tabular-nums w-4 shrink-0">{num}</span>}
          <h3 className="text-sm font-semibold text-purple-200 uppercase tracking-wide">{label}</h3>
        </div>
      );
      i++; continue;
    }

    // Bullet: starts with * or - or •
    if (/^[\*\-•]\s+/.test(line)) {
      const content = line.replace(/^[\*\-•]\s+/, '');
      elements.push(
        <div key={key++} className="flex gap-2 py-0.5">
          <span className="text-purple-400/50 mt-0.5 shrink-0 text-xs">▸</span>
          <p className="text-sm text-slate-200 leading-relaxed">{renderInline(content)}</p>
        </div>
      );
      i++; continue;
    }

    // Pull quote: line starts with " or is a quoted statement with an em dash attribution
    if (line.startsWith('"') && line.includes('–')) {
      const [quote, ...rest] = line.split('–');
      elements.push(
        <div key={key++} className="border-l-2 border-purple-500/40 pl-3 py-1 my-1">
          <p className="text-sm text-slate-300 italic leading-relaxed">{quote.trim()}</p>
          {rest.length > 0 && <p className="text-xs text-slate-500 mt-0.5">— {rest.join('–').trim()}</p>}
        </div>
      );
      i++; continue;
    }

    // Regular paragraph
    elements.push(
      <p key={key++} className="text-sm text-slate-200 leading-relaxed py-0.5">{renderInline(line)}</p>
    );
    i++;
  }

  return <div className="space-y-0.5">{elements}</div>;
}

type CalendarEvent = {
  id: string;
  title: string;
  start: string;
  end?: string;
  allDay?: boolean;
  backgroundColor?: string;
  borderColor?: string;
  textColor?: string;
  extendedProps?: {
    leaderId: number;
    ccbProfileLink?: string | null;
    eventSummaryState?: EventSummaryState;
    frequency?: string | null;
  };
};

const dayToWeekday = (raw: string): number | null => {
  const day = raw.trim().toLowerCase();
  if (!day) return null;

  const map: Record<string, number> = {
    mon: 1,
    monday: 1,
    tue: 2,
    tues: 2,
    tuesday: 2,
    wed: 3,
    weds: 3,
    wednesday: 3,
    thu: 4,
    thur: 4,
    thurs: 4,
    thursday: 4,
    fri: 5,
    friday: 5,
    sat: 6,
    saturday: 6,
    sun: 7,
    sunday: 7,
  };

  return map[day] ?? null;
};

const parseTimeToHourMinute = (raw: string): { hour: number; minute: number } | null => {
  const t = raw.trim();
  if (!t) return null;

  const formats = [
    'H:mm',
    'HH:mm',
    'h:mm a',
    'h a',
    'h:mma',
    'ha',
  ];

  for (const fmt of formats) {
    const dt = DateTime.fromFormat(t.replace(/\s+/g, ' '), fmt, { locale: 'en-US' });
    if (dt.isValid) {
      return { hour: dt.hour, minute: dt.minute };
    }
  }

  // Last resort: try ISO-ish time
  const iso = DateTime.fromISO(t);
  if (iso.isValid) {
    return { hour: iso.hour, minute: iso.minute };
  }

  return null;
};

const parseWeekInterval = (freq?: string | null): number => {
  const s = (freq ?? '').trim().toLowerCase();
  if (!s) return 1;
  if (s.includes('every other') || s.includes('biweek') || s.includes('bi-week') || s.includes('bi weekly') || s.includes('biweekly')) return 2;
  if (s.includes('2 week') || s.includes('2-week')) return 2;
  return 1;
};

type ParsedFrequency =
  | { kind: 'weekly'; intervalWeeks: number }
  | { kind: 'weekOfMonth'; weeks: Array<1 | 2 | 3 | 4 | 5> }
  | { kind: 'monthly'; intervalMonths: number };

const parseFrequencyPattern = (raw?: string | null): ParsedFrequency => {
  const s = (raw ?? '').trim().toLowerCase();

  // Week-of-month patterns (nth weekday of month)
  const has1st = /\b(1st|first)\b/.test(s);
  const has2nd = /\b(2nd|second)\b/.test(s);
  const has3rd = /\b(3rd|third)\b/.test(s);
  const has4th = /\b(4th|fourth)\b/.test(s);
  const has5th = /\b(5th|fifth)\b/.test(s);

  // e.g. "1st & 3rd", "1st, 3rd & 5th", "2nd & 4th"
  if ((has1st || has2nd || has3rd || has4th || has5th) && (has1st || has2nd || has3rd || has4th)) {
    const mentionsWeekly = s.includes('weekly') || s.includes('every week');
    const mentionsBiWeekly = s.includes('bi-week') || s.includes('biweekly') || s.includes('every other');

    if (!mentionsWeekly && !mentionsBiWeekly) {
      const weeks: Array<1 | 2 | 3 | 4 | 5> = [];
      if (has1st) weeks.push(1);
      if (has2nd) weeks.push(2);
      if (has3rd) weeks.push(3);
      if (has4th) weeks.push(4);
      if (has5th) weeks.push(5);
      if (weeks.length > 0) return { kind: 'weekOfMonth', weeks };
    }
  }

  // Simple monthly intervals
  if (s.includes('quarter')) return { kind: 'monthly', intervalMonths: 3 };
  if (s.includes('month')) return { kind: 'monthly', intervalMonths: 1 };

  return { kind: 'weekly', intervalWeeks: parseWeekInterval(raw) };
};

const buildWeekdayOccurrencesForMonth = (args: {
  year: number;
  month: number; // 1-12
  weekday: number; // Luxon weekday: 1=Mon..7=Sun
  hour: number;
  minute: number;
}): DateTime[] => {
  const { year, month, weekday, hour, minute } = args;
  let cursor = DateTime.fromObject({ year, month, day: 1 }).startOf('day');
  if (!cursor.isValid) return [];

  const offset = (weekday - cursor.weekday + 7) % 7;
  cursor = cursor.plus({ days: offset }).set({ hour, minute, second: 0, millisecond: 0 });

  const out: DateTime[] = [];
  while (cursor.month === month) {
    out.push(cursor);
    cursor = cursor.plus({ days: 7 });
  }
  return out;
};

const buildOccurrencesForLeader = (args: {
  leader: CircleLeader;
  rangeStart: Date;
  rangeEnd: Date;
  durationMinutes: number;
}): CalendarEvent[] => {
  const { leader, rangeStart, rangeEnd, durationMinutes } = args;

  const weekday = leader.day ? dayToWeekday(leader.day) : null;
  const time = leader.time ? parseTimeToHourMinute(leader.time) : null;

  if (!weekday || !time) return [];

  const parsedFrequency = parseFrequencyPattern(leader.frequency);

  const start = DateTime.fromJSDate(rangeStart);
  const end = DateTime.fromJSDate(rangeEnd);

  const title = leader.circle_type ? `${leader.name} (${leader.circle_type})` : leader.name;
  const eventSummaryState = getEventSummaryState(leader);

  // FullCalendar supports per-event colors; using that avoids needing extra CSS overrides.
  const backgroundColor = eventSummaryState === 'received'
    ? '#16a34a'
    : eventSummaryState === 'did_not_meet'
      ? '#2563eb'
      : eventSummaryState === 'skipped'
        ? '#eab308'
        : '#dc2626';
  const borderColor = backgroundColor;
  const textColor = '#ffffff';

  const out: CalendarEvent[] = [];

  const pushEvent = (eventStart: DateTime) => {
    if (eventStart < start || eventStart >= end) return;
    const eventEnd = eventStart.plus({ minutes: durationMinutes });

    out.push({
      id: `${leader.id}-${eventStart.toISODate()}`,
      title,
      start: eventStart.toISO() ?? eventStart.toJSDate().toISOString(),
      end: eventEnd.toISO() ?? eventEnd.toJSDate().toISOString(),
      allDay: false,
      backgroundColor,
      borderColor,
      textColor,
      extendedProps: {
        leaderId: leader.id,
        ccbProfileLink: leader.ccb_profile_link ?? null,
        eventSummaryState,
        frequency: leader.frequency ?? null,
      },
    });
  };

  if (parsedFrequency.kind === 'weekOfMonth') {
    let monthCursor = start.startOf('month');
    const lastMonth = end.startOf('month');

    while (monthCursor <= lastMonth) {
      const occurrences = buildWeekdayOccurrencesForMonth({
        year: monthCursor.year,
        month: monthCursor.month,
        weekday,
        hour: time.hour,
        minute: time.minute,
      });

      for (const weekNum of parsedFrequency.weeks) {
        const dt = occurrences[weekNum - 1];
        if (dt) pushEvent(dt);
      }

      monthCursor = monthCursor.plus({ months: 1 });
    }
  } else if (parsedFrequency.kind === 'monthly') {
    // Best-effort: use the 1st occurrence of the weekday each month (or every N months).
    const intervalMonths = parsedFrequency.intervalMonths;
    let monthCursor = start.startOf('month');
    const lastMonth = end.startOf('month');
    let monthIndex = 0;

    while (monthCursor <= lastMonth) {
      if (monthIndex % intervalMonths === 0) {
        const occurrences = buildWeekdayOccurrencesForMonth({
          year: monthCursor.year,
          month: monthCursor.month,
          weekday,
          hour: time.hour,
          minute: time.minute,
        });
        if (occurrences[0]) pushEvent(occurrences[0]);
      }

      monthIndex += 1;
      monthCursor = monthCursor.plus({ months: 1 });
    }
  } else {
    // Weekly / bi-weekly interval schedule.
    const intervalWeeks = parsedFrequency.intervalWeeks;
    const startDay = start.startOf('day');
    const dayOffset = (weekday - startDay.weekday + 7) % 7;
    let cursor = startDay.plus({ days: dayOffset }).set({ hour: time.hour, minute: time.minute, second: 0, millisecond: 0 });

    if (cursor < start) {
      cursor = cursor.plus({ weeks: intervalWeeks });
    }

    // If bi-weekly, optionally anchor the parity to a saved start date so the schedule
    // doesn't shift depending on the visible range.
    if (intervalWeeks === 2 && leader.meeting_start_date) {
      const anchor = DateTime.fromISO(leader.meeting_start_date)
        .startOf('day')
        .set({ hour: time.hour, minute: time.minute, second: 0, millisecond: 0 });

      if (anchor.isValid) {
        const anchorWeek = anchor.startOf('week');
        const cursorWeek = cursor.startOf('week');
        const diffWeeks = Math.round(cursorWeek.diff(anchorWeek, 'days').days / 7);

        if (Math.abs(diffWeeks) % 2 === 1) {
          cursor = cursor.plus({ weeks: 1 });
        }
      }
    }

    while (cursor < end) {
      pushEvent(cursor);
      cursor = cursor.plus({ weeks: intervalWeeks });
    }
  }

  return out;
};

type CircleMeetingsCalendarProps = {
  leaders: CircleLeader[];
  isLoading?: boolean;
  loadError?: string | null;
  onSetEventSummaryState?: (leaderId: number, state: EventSummaryState) => Promise<void> | void;
  activeFilterLabel?: string;
};

export default function CircleMeetingsCalendar({
  leaders,
  isLoading: isLoadingLeaders = false,
  loadError = null,
  onSetEventSummaryState,
  activeFilterLabel = 'All Circles',
}: CircleMeetingsCalendarProps) {
  const router = useRouter();
  const { user } = useAuth();
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [visibleRange, setVisibleRange] = useState<{ start: Date; end: Date } | null>(null);
  const [isMobile, setIsMobile] = useState(false);
  const [savingLeaderIds, setSavingLeaderIds] = useState<Set<number>>(new Set());
  const [selectedISODate, setSelectedISODate] = useState(() => DateTime.local().toISODate() ?? '');
  const [showEventExplorer, setShowEventExplorer] = useState(false);
  const [selectedEventDate, setSelectedEventDate] = useState<string>('');
  const [showReminderModal, setShowReminderModal] = useState(false);
  const [selectedLeader, setSelectedLeader] = useState<CircleLeader | null>(null);
  const [sentReminderMessages, setSentReminderMessages] = useState<number[]>([]);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [selectedEventGroupName, setSelectedEventGroupName] = useState<string>('');
  const [selectedCcbProfileLink, setSelectedCcbProfileLink] = useState<string | null>(null);
  const [expandedEventIds, setExpandedEventIds] = useState<Set<string>>(new Set());
  const [initialView] = useState(DEFAULT_CALENDAR_VIEW);
  const [currentViewType, setCurrentViewType] = useState(DEFAULT_CALENDAR_VIEW);

  // Snapshot state — stores archived weekly event summary data for past-week views
  const [snapshotMap, setSnapshotMap] = useState<Map<number, EventSummaryState> | null>(null);
  const [ccbReportMap, setCcbReportMap] = useState<Map<number, boolean> | null>(null);
  const [isLoadingSnapshot, setIsLoadingSnapshot] = useState(false);
  // Leaders with 2+ did_not_meet in the 4-week window ending on the visible week
  const [dnmLeaderIds, setDnmLeaderIds] = useState<Set<number>>(new Set());
  const [showDnmList, setShowDnmList] = useState(false);
  const [showNotReportedList, setShowNotReportedList] = useState(false);
  const [showOffScheduleList, setShowOffScheduleList] = useState(false);
  const [isPullingCCB, setIsPullingCCB] = useState(false);
  const [isAutoUpdating, setIsAutoUpdating] = useState(false);
  const [autoUpdateConflicts, setAutoUpdateConflicts] = useState<Array<{ leader_id: number; leader_name: string; current_state: EventSummaryState; ccb_state: EventSummaryState }> | null>(null);
  const [snapshotSavingLeaderIds, setSnapshotSavingLeaderIds] = useState<Set<number>>(new Set());

  // Attendance data — headcount + roster size per leader for the visible week
  type AttendanceEntry = { headcount: number | null; rosterCount: number | null; hasNotes: boolean | null; guestCount: number | null };
  const [attendanceData, setAttendanceData] = useState<Map<number, AttendanceEntry> | null>(null);

  // AI weekly summary state
  type SavedSummary = { id: string; summary_text: string; filter_label: string; generated_at: string };
  const [savedSummary, setSavedSummary] = useState<SavedSummary | null>(null);
  const [generatedSummary, setGeneratedSummary] = useState<string | null>(null);
  const [isGeneratingSummary, setIsGeneratingSummary] = useState(false);
  const [isSavingSummary, setIsSavingSummary] = useState(false);
  const [showAiSummary, setShowAiSummary] = useState(false);
  const [summaryError, setSummaryError] = useState<string | null>(null);
  const [summaryCopied, setSummaryCopied] = useState(false);
  const [showSummaryChatModal, setShowSummaryChatModal] = useState(false);

  // Default meeting length; can be made configurable later.
  const durationMinutes = 60;

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const mq = window.matchMedia('(max-width: 640px)');
    const update = () => setIsMobile(mq.matches);
    update();
    mq.addEventListener?.('change', update);
    return () => mq.removeEventListener?.('change', update);
  }, []);

  const leadersWithSchedules = useMemo(() => {
    return leaders.filter(l => {
      const day = (l.day ?? '').trim();
      const time = (l.time ?? '').trim();
      if (!day || !time) return false;
      // Also verify the values actually parse
      return dayToWeekday(day) !== null && parseTimeToHourMinute(time) !== null;
    });
  }, [leaders]);

  const leadersWithoutSchedules = useMemo(() => {
    return leaders.filter(l => {
      const day = (l.day ?? '').trim();
      const time = (l.time ?? '').trim();
      if (!day || !time) return true;
      // Include leaders whose day/time can't be parsed
      return dayToWeekday(day) === null || parseTimeToHourMinute(time) === null;
    });
  }, [leaders]);

  // Set of filtered leader IDs for filtering snapshot data to match active filters
  const filteredLeaderIds = useMemo(() => {
    return new Set(leaders.map(l => l.id));
  }, [leaders]);

  const [showMissingSchedules, setShowMissingSchedules] = useState(false);

  // ISO date string (YYYY-MM-DD) of the Sunday that starts the currently-visible week.
  const visibleWeekSundayISO = useMemo(() => {
    if (!visibleRange) return null;
    return DateTime.fromJSDate(visibleRange.start).toISODate();
  }, [visibleRange]);

  // True when the calendar is showing a week that is before the current one.
  const isViewingSnapshot = useMemo(() => {
    if (!visibleWeekSundayISO) return false;
    const now = DateTime.local();
    const daysBack = now.weekday === 7 ? 0 : now.weekday;
    const currentWeekSundayISO = now.minus({ days: daysBack }).toISODate()!;
    return visibleWeekSundayISO < currentWeekSundayISO;
  }, [visibleWeekSundayISO]);

  const onDatesSet = useCallback((arg: DatesSetArg) => {
    setVisibleRange({ start: arg.start, end: arg.end });
    setCurrentViewType(arg.view.type);
    try {
      const focused = arg.view?.calendar?.getDate?.();
      if (focused) {
        setSelectedISODate(DateTime.fromJSDate(focused).toISODate() ?? '');
      }
    } catch {
      // ignore
    }
  }, []);

  const onDateClick = useCallback((arg: DateClickArg) => {
    const next = DateTime.fromJSDate(arg.date).toISODate();
    if (next) setSelectedISODate(next);
  }, []);

  useEffect(() => {
    if (!visibleRange) return;
    const next = leadersWithSchedules.flatMap(leader =>
      buildOccurrencesForLeader({
        leader,
        rangeStart: visibleRange.start,
        rangeEnd: visibleRange.end,
        durationMinutes,
      })
    );
    setEvents(next);
  }, [leadersWithSchedules, visibleRange, leaders]);

  // Fetch archived snapshot whenever the user navigates to a past week.
  // Also fetches the 4-week window to detect leaders with 2+ did_not_meet weeks.
  useEffect(() => {
    if (!visibleWeekSundayISO || !isViewingSnapshot) {
      setSnapshotMap(null);
      setCcbReportMap(null);
      setDnmLeaderIds(new Set());
      setShowDnmList(false);
      setShowNotReportedList(false);
      setShowOffScheduleList(false);
      return;
    }
    let cancelled = false;
    setIsLoadingSnapshot(true);

    const windowStart = DateTime.fromISO(visibleWeekSundayISO).minus({ weeks: 3 }).toISODate()!;
    const url = `/api/event-summary-snapshots?week_start_date=${encodeURIComponent(visibleWeekSundayISO)}&from_date=${encodeURIComponent(windowStart)}`;

    fetch(url)
      .then(r => r.json())
      .then(({ snapshots }: { snapshots: Array<{ circle_leader_id: number; event_summary_state: EventSummaryState; ccb_report_available?: boolean; week_start_date: string }> }) => {
        if (cancelled) return;

        const stateMap = new Map<number, EventSummaryState>();
        const reportMap = new Map<number, boolean>();
        const dnmCounts = new Map<number, number>();

        for (const s of snapshots ?? []) {
          if (s.week_start_date === visibleWeekSundayISO) {
            stateMap.set(s.circle_leader_id, s.event_summary_state);
            reportMap.set(s.circle_leader_id, s.ccb_report_available ?? false);
          }
          if (s.event_summary_state === 'did_not_meet') {
            dnmCounts.set(s.circle_leader_id, (dnmCounts.get(s.circle_leader_id) ?? 0) + 1);
          }
        }

        setSnapshotMap(stateMap);
        setCcbReportMap(reportMap);
        setDnmLeaderIds(new Set(
          Array.from(dnmCounts.entries()).filter(([, count]) => count >= 2).map(([id]) => id)
        ));
      })
      .catch(err => { if (!cancelled) console.error('Failed to load snapshot:', err); })
      .finally(() => { if (!cancelled) setIsLoadingSnapshot(false); });
    return () => { cancelled = true; };
  }, [visibleWeekSundayISO, isViewingSnapshot]);

  // Fetch attendance (headcounts + roster sizes) for the visible week.
  // Extracted as a callback so it can be called manually after CCB syncs write new data.
  const fetchAttendanceData = useCallback(() => {
    if (!visibleWeekSundayISO || leaders.length === 0) {
      setAttendanceData(null);
      return;
    }
    const weekEnd = DateTime.fromISO(visibleWeekSundayISO).plus({ days: 6 }).toISODate()!;
    const leaderIds = leaders.map(l => l.id);
    Promise.all([
      supabase
        .from('circle_meeting_occurrences')
        .select('leader_id, headcount, has_notes, guest_count')
        .eq('status', 'met')
        .gte('meeting_date', visibleWeekSundayISO)
        .lte('meeting_date', weekEnd),
      supabase
        .from('circle_roster_cache')
        .select('circle_leader_id')
        .in('circle_leader_id', leaderIds),
    ]).then(([occRes, rosterRes]) => {
      const rosterCounts = new Map<number, number>();
      for (const row of (rosterRes.data ?? [])) {
        rosterCounts.set(row.circle_leader_id, (rosterCounts.get(row.circle_leader_id) ?? 0) + 1);
      }
      const map = new Map<number, AttendanceEntry>();
      for (const leader of leaders) {
        map.set(leader.id, { headcount: null, rosterCount: rosterCounts.get(leader.id) ?? null, hasNotes: null, guestCount: null });
      }
      for (const occ of (occRes.data ?? [])) {
        const existing = map.get(occ.leader_id);
        if (existing) map.set(occ.leader_id, { ...existing, headcount: occ.headcount, hasNotes: occ.has_notes ?? null, guestCount: occ.guest_count ?? null });
      }
      setAttendanceData(map);
    }).catch(err => console.error('Failed to load attendance data:', err));
  }, [visibleWeekSundayISO, leaders]);

  useEffect(() => {
    fetchAttendanceData();
  }, [fetchAttendanceData]);

  // Fetch saved AI summary when the visible week changes
  useEffect(() => {
    if (!visibleWeekSundayISO) {
      setSavedSummary(null);
      setGeneratedSummary(null);
      setShowAiSummary(false);
      return;
    }
    let cancelled = false;
    setSavedSummary(null);
    setGeneratedSummary(null);
    setShowAiSummary(false);

    fetch(`/api/weekly-ai-summary?week=${encodeURIComponent(visibleWeekSundayISO)}&userId=${encodeURIComponent(user?.id ?? '')}`)
      .then(r => r.json())
      .then(({ summary }) => {
        if (!cancelled && summary) {
          setSavedSummary(summary);
          setShowAiSummary(false); // collapsed by default
        }
      })
      .catch(err => { if (!cancelled) console.error('Failed to load saved AI summary:', err); });

    return () => { cancelled = true; };
  }, [visibleWeekSundayISO]);

  const handleGenerateSummary = useCallback(async () => {
    if (!visibleWeekSundayISO || leaders.length === 0) return;
    setIsGeneratingSummary(true);
    setSummaryError(null);
    setGeneratedSummary(null);
    setShowAiSummary(true);

    const weekStart = DateTime.fromISO(visibleWeekSundayISO);
    const weekEnd = weekStart.plus({ days: 6 });
    const weekLabel = `${weekStart.toFormat('MMM d')}–${weekEnd.toFormat('MMM d, yyyy')}`;

    // Compute scheduled IDs inline (same logic as scheduledLeaderIds useMemo, but defined later)
    const scheduled = new Set(events.map(e => e.extendedProps?.leaderId).filter((id): id is number => id != null));

    const leaderPayload = leaders.map(l => {
      const state = snapshotMap
        ? (snapshotMap.get(l.id) ?? (scheduled.has(l.id) ? 'not_received' : undefined))
        : l.event_summary_state;
      return {
        id: l.id,
        name: l.name,
        circle_type: l.circle_type,
        campus: l.campus,
        acpd: l.acpd,
        status: l.status,
        eventState: state ?? 'not_received',
        followUpRequired: l.follow_up_required ?? false,
        followUpNote: l.follow_up_note,
      };
    });

    try {
      const res = await fetch('/api/weekly-ai-summary', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ weekStartDate: visibleWeekSundayISO, weekLabel, leaders: leaderPayload, filterLabel: activeFilterLabel }),
      });
      const data = await res.json();
      if (!res.ok || data.error) {
        setSummaryError(data.error || 'Failed to generate summary.');
      } else {
        setGeneratedSummary(data.summary);
      }
    } catch {
      setSummaryError('Failed to generate summary. Please try again.');
    } finally {
      setIsGeneratingSummary(false);
    }
  }, [visibleWeekSundayISO, leaders, snapshotMap, events, activeFilterLabel]);

  const handleSaveSummary = useCallback(async () => {
    if (!generatedSummary || !visibleWeekSundayISO || !user?.id) return;
    setIsSavingSummary(true);
    try {
      const res = await fetch('/api/weekly-ai-summary', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          weekStartDate: visibleWeekSundayISO,
          summaryText: generatedSummary,
          filterLabel: activeFilterLabel,
          generatedBy: user.id,
        }),
      });
      const data = await res.json();
      if (!res.ok || data.error) {
        setSummaryError(data.error || 'Failed to save summary.');
      } else {
        setSavedSummary(data.summary);
        setGeneratedSummary(null);
      }
    } catch {
      setSummaryError('Failed to save summary. Please try again.');
    } finally {
      setIsSavingSummary(false);
    }
  }, [generatedSummary, visibleWeekSundayISO, activeFilterLabel, user]);

  const openEventExplorerForLeader = useCallback((leaderId: number, isoDate?: string | null) => {
    const leader = leaders.find(l => l.id === leaderId);
    if (!leader) return;

    const fallbackDate = DateTime.local().toISODate();
    const date = isoDate || fallbackDate || '';

    setSelectedEventDate(date);
    setSelectedEventGroupName(leader.name || '');
    setSelectedCcbProfileLink(leader.ccb_profile_link || null);
    setShowEventExplorer(true);
  }, [leaders]);

  const onEventClick = useCallback((click: EventClickArg) => {
    const leaderId = (click.event.extendedProps as any)?.leaderId as number | undefined;
    if (!leaderId) return;

    const eventDate = click.event.start
      ? DateTime.fromJSDate(click.event.start).toISODate()
      : DateTime.local().toISODate();

    openEventExplorerForLeader(leaderId, eventDate);
  }, [openEventExplorerForLeader]);

  const setLeaderEventSummaryState = useCallback(async (leaderId: number, state: EventSummaryState) => {
    if (!onSetEventSummaryState) return;

    setSavingLeaderIds(prev => {
      const next = new Set(prev);
      next.add(leaderId);
      return next;
    });

    try {
      await onSetEventSummaryState(leaderId, state);
    } finally {
      setSavingLeaderIds(prev => {
        const next = new Set(prev);
        next.delete(leaderId);
        return next;
      });
    }
  }, [onSetEventSummaryState]);

  const getWeekStartDate = useCallback(() => {
    const now = new Date();
    const ctTime = new Date(now.toLocaleString('en-US', { timeZone: 'America/Chicago' }));
    const dayOfWeek = ctTime.getDay();
    let daysToLastSaturday = dayOfWeek === 6 ? 0 : (dayOfWeek + 1);
    const lastSaturday = new Date(ctTime);
    lastSaturday.setDate(ctTime.getDate() - daysToLastSaturday);
    lastSaturday.setHours(23, 59, 59, 999);
    if (ctTime < lastSaturday) {
      lastSaturday.setDate(lastSaturday.getDate() - 7);
    }
    return lastSaturday.toISOString().split('T')[0];
  }, []);

  /** Returns the effective event summary state for a leader — uses snapshot data when viewing a past week.
   *  For the current week, treats the state as not_received if it was set in a prior week. */
  const getEffectiveLeaderState = useCallback((leaderId: number): EventSummaryState => {
    if (isViewingSnapshot && snapshotMap) {
      return snapshotMap.get(leaderId) ?? 'not_received';
    }
    const leader = leaders.find(l => l.id === leaderId);
    if (!leader) return 'not_received';
    // If the state has no week stamp, or was set in a different week, treat it as not_received.
    if (!leader.event_summary_state_week ||
        (visibleWeekSundayISO && leader.event_summary_state_week !== visibleWeekSundayISO)) {
      return 'not_received';
    }
    return getEventSummaryState(leader);
  }, [isViewingSnapshot, snapshotMap, leaders, visibleWeekSundayISO]);

  // Leader IDs who had a scheduled occurrence in the visible week.
  // Used to exclude unscheduled leaders from the "Not Reported" count.
  const scheduledLeaderIds = useMemo(
    () => new Set(events.map(e => e.extendedProps?.leaderId).filter((id): id is number => id != null)),
    [events]
  );

  /** Aggregate attendance stats for the visible week — counts received leaders, plus unreported circles that have CCB data. */
  const weeklyAttendanceStats = useMemo(() => {
    if (!attendanceData) return null;
    let totalAttended = 0;
    let rosterPctSum = 0;
    let rosterPctCount = 0;
    let receivedWithData = 0;
    let totalReceived = 0;
    let unreportedWithData = 0;
    let totalUnreportedAttended = 0;
    const unreportedLeaders: Array<{ id: number; name: string; headcount: number; rosterCount: number | null }> = [];
    for (const leader of leaders) {
      const state = getEffectiveLeaderState(leader.id);
      const att = attendanceData.get(leader.id);
      if (state === 'received') {
        totalReceived++;
        if (!att?.headcount) continue;
        receivedWithData++;
        totalAttended += att.headcount;
        if (att.rosterCount && att.rosterCount > 0) {
          rosterPctSum += Math.round((att.headcount / att.rosterCount) * 100);
          rosterPctCount++;
        }
      } else if (att?.headcount) {
        unreportedWithData++;
        totalUnreportedAttended += att.headcount;
        unreportedLeaders.push({ id: leader.id, name: leader.name, headcount: att.headcount, rosterCount: att.rosterCount ?? null });
      }
    }
    if (receivedWithData === 0 && unreportedWithData === 0) return null;
    return {
      totalAttended,
      avgRosterPct: rosterPctCount > 0 ? Math.round(rosterPctSum / rosterPctCount) : null,
      receivedWithData,
      totalReceived,
      unreportedWithData,
      totalUnreportedAttended,
      unreportedLeaders,
    };
  }, [attendanceData, leaders, getEffectiveLeaderState]);

  /** Updates a single leader's state in the archived snapshot for the currently-viewed past week. */
  const updateSnapshotEntry = useCallback(async (leaderId: number, state: EventSummaryState) => {
    if (!visibleWeekSundayISO) return;
    setSnapshotSavingLeaderIds(prev => { const next = new Set(prev); next.add(leaderId); return next; });
    try {
      const res = await fetch('/api/event-summary-snapshots', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ week_start_date: visibleWeekSundayISO, circle_leader_id: leaderId, event_summary_state: state }),
      });
      if (!res.ok) throw new Error('Failed to update snapshot');
      setSnapshotMap(prev => { if (!prev) return prev; const next = new Map(prev); next.set(leaderId, state); return next; });
    } catch (err: any) {
      console.error('Error updating snapshot entry:', err);
      setActionError(err.message || 'Failed to update snapshot entry');
      setTimeout(() => setActionError(null), 5000);
    } finally {
      setSnapshotSavingLeaderIds(prev => { const next = new Set(prev); next.delete(leaderId); return next; });
    }
  }, [visibleWeekSundayISO]);

  /** Pulls CCB attendance data for the visible past week and marks which leaders have a report. */
  const handlePullFromCCB = useCallback(async () => {
    if (!visibleWeekSundayISO || leaders.length === 0) return;
    const weekEnd = DateTime.fromISO(visibleWeekSundayISO).plus({ days: 6 }).toISODate()!;
    setIsPullingCCB(true);
    setActionError(null);
    try {
      const res = await fetch('/api/ccb/pull-week-summaries', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          week_start_date: visibleWeekSundayISO,
          week_end_date: weekEnd,
          leader_ids: leaders.map(l => l.id),
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Pull failed');

      // Update local ccbReportMap from results
      const newReportMap = new Map<number, boolean>(ccbReportMap ?? []);
      for (const r of json.results ?? []) {
        newReportMap.set(r.circle_leader_id, r.ccb_report_available);
      }
      setCcbReportMap(newReportMap);

      // If snapshotMap was empty, seed it with not_received so the page shows
      if (!snapshotMap || snapshotMap.size === 0) {
        const seedMap = new Map<number, EventSummaryState>();
        for (const l of leaders) seedMap.set(l.id, 'not_received');
        setSnapshotMap(seedMap);
      }

      const withReport = json.with_report ?? 0;
      setActionSuccess(
        `CCB data pulled — ${withReport} of ${json.pulled} leader${json.pulled !== 1 ? 's' : ''} have a report this week.`
      );
      setTimeout(() => setActionSuccess(null), 6000);
      fetchAttendanceData();
    } catch (err: any) {
      console.error('Error pulling from CCB:', err);
      setActionError(err.message || 'Failed to pull from CCB');
      setTimeout(() => setActionError(null), 5000);
    } finally {
      setIsPullingCCB(false);
    }
  }, [visibleWeekSundayISO, leaders, ccbReportMap, snapshotMap, fetchAttendanceData]);

  /** Auto-applies CCB states to leaders still marked not_received. Flags conflicts without overwriting. */
  const handleAutoUpdate = useCallback(async () => {
    if (!visibleWeekSundayISO || leaders.length === 0) return;
    const fullWeekEnd = DateTime.fromISO(visibleWeekSundayISO).plus({ days: 6 }).toISODate()!;
    const weekEnd = !isViewingSnapshot
      ? DateTime.min(DateTime.fromISO(fullWeekEnd), DateTime.now()).toISODate()!
      : fullWeekEnd;
    setIsAutoUpdating(true);
    setActionError(null);
    setAutoUpdateConflicts(null);
    try {
      const res = await fetch('/api/ccb/auto-update-summaries', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          week_start_date: visibleWeekSundayISO,
          week_end_date: weekEnd,
          leader_ids: leaders.map(l => l.id),
          is_current_week: !isViewingSnapshot,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Auto-update failed');

      if (json.conflicts?.length > 0) setAutoUpdateConflicts(json.conflicts);

      // Refresh snapshot map for past weeks
      if (isViewingSnapshot && json.updated > 0) {
        const refreshRes = await fetch(`/api/event-summary-snapshots?week_start_date=${encodeURIComponent(visibleWeekSundayISO)}`);
        const { snapshots } = await refreshRes.json();
        const stateMap = new Map<number, EventSummaryState>();
        const reportMap = new Map<number, boolean>();
        for (const s of snapshots ?? []) {
          stateMap.set(s.circle_leader_id, s.event_summary_state);
          reportMap.set(s.circle_leader_id, s.ccb_report_available ?? false);
        }
        setSnapshotMap(stateMap);
        setCcbReportMap(reportMap);
      }

      // For current week: update local state immediately instead of relying on realtime.
      // Run in parallel so per-leader CCB syncs don't serialize.
      if (!isViewingSnapshot && json.updated_leaders?.length > 0) {
        await Promise.all(json.updated_leaders.map(({ id, state }: { id: number; state: EventSummaryState }) =>
          setLeaderEventSummaryState(id, state)
        ));
      }

      // Refetch attendance after all syncs complete so counts reflect the latest data
      if (json.updated > 0) fetchAttendanceData();

      const conflictCount = json.conflicts?.length ?? 0;
      const msg = json.updated > 0
        ? `${json.updated} leader${json.updated !== 1 ? 's' : ''} updated from CCB.${conflictCount > 0 ? ` ${conflictCount} conflict${conflictCount !== 1 ? 's' : ''} need review.` : ''}`
        : conflictCount > 0
          ? `No updates applied — ${conflictCount} conflict${conflictCount !== 1 ? 's' : ''} need review.`
          : 'No changes needed — all leaders already have a status.';
      setActionSuccess(msg);
      setTimeout(() => setActionSuccess(null), 8000);
    } catch (err: any) {
      console.error('Error auto-updating from CCB:', err);
      setActionError(err.message || 'Failed to auto-update from CCB');
      setTimeout(() => setActionError(null), 5000);
    } finally {
      setIsAutoUpdating(false);
    }
  }, [visibleWeekSundayISO, leaders, isViewingSnapshot, setLeaderEventSummaryState, fetchAttendanceData]);

  /** Routes a state-button click to either the live update or the snapshot update depending on the current view mode. */
  const handleEventSummaryButtonClick = useCallback(async (leaderId: number, state: EventSummaryState) => {
    if (isViewingSnapshot) {
      await updateSnapshotEntry(leaderId, state);
    } else {
      await setLeaderEventSummaryState(leaderId, state);
    }
    // CCB sync (for 'received') is now awaited in the hook, so data is in DB here — refetch attendance
    fetchAttendanceData();
  }, [isViewingSnapshot, updateSnapshotEntry, setLeaderEventSummaryState, fetchAttendanceData]);

  const handleOpenReminderModal = useCallback(async (leader: CircleLeader) => {
    setSelectedLeader(leader);
    setActionSuccess(null);
    setActionError(null);

    // Load sent messages for this leader
    try {
      const weekStartStr = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Chicago' })).toISOString().split('T')[0];
      const { data } = await supabase
        .from('event_summary_followups')
        .select('message_number')
        .eq('circle_leader_id', leader.id)
        .eq('week_start_date', weekStartStr);
      setSentReminderMessages(data ? data.map(row => row.message_number) : []);
    } catch (error) {
      console.error('Error loading sent messages:', error);
      setSentReminderMessages([]);
    }

    setShowReminderModal(true);
  }, []);

  const handleSendEventSummaryReminder = useCallback(async (messageNumber: number, messageText: string) => {
    if (!selectedLeader || !user?.id) return;

    try {
      const today = new Date().toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
      });

      const noteContent = `[Event Summary Reminder ${messageNumber} - ${today}]\n\n${messageText}`;

      const { error: noteError } = await supabase
        .from('notes')
        .insert({
          circle_leader_id: selectedLeader.id,
          content: noteContent,
          created_by: user.id
        });

      if (noteError) throw noteError;

      const { error: followupError } = await supabase
        .from('event_summary_followups')
        .insert({
          circle_leader_id: selectedLeader.id,
          message_number: messageNumber,
          sent_by: user.id,
          week_start_date: getWeekStartDate()
        });

      if (followupError) throw followupError;

      setSentReminderMessages(prev => [...prev, messageNumber]);

      if (selectedLeader.phone) {
        const cleanPhone = selectedLeader.phone.replace(/\D/g, '');
        const encodedMessage = encodeURIComponent(messageText);
        const smsUrl = `sms:${cleanPhone}&body=${encodedMessage}`;
        window.location.href = smsUrl;
      }

      setActionSuccess(`Reminder sent to ${selectedLeader.name}`);
      setTimeout(() => setActionSuccess(null), 5000);
    } catch (error: any) {
      console.error('Error sending reminder:', error);
      throw error;
    }
  }, [selectedLeader, user, getWeekStartDate]);
  const renderEventSummaryButtons = useCallback((
    leaderId: number,
    state: EventSummaryState,
    opts?: { compact?: boolean }
  ) => {
    const isSaving = savingLeaderIds.has(leaderId) || snapshotSavingLeaderIds.has(leaderId);

    const base =
      'h-9 sm:h-8 px-1.5 sm:px-3 rounded-lg sm:rounded-md text-[13px] sm:text-xs font-semibold leading-tight transition-all disabled:opacity-60 disabled:cursor-not-allowed touch-manipulation select-none flex items-center justify-center min-w-0 whitespace-nowrap flex-1 active:scale-95 sm:active:scale-100';

    const btnColors: Record<EventSummaryState, string> = {
      not_received: '#ef4444',
      received: '#22c55e',
      did_not_meet: '#3b82f6',
      skipped: '#f59e0b',
    };

    const btn = (kind: EventSummaryState) => {
      const active = state === kind;
      return active
        ? `${base} es-active border text-white font-bold shadow-md`
        : `${base} bg-white/20 border border-white/20 sm:bg-white sm:dark:bg-gray-800 sm:border-gray-300 sm:dark:border-gray-600 text-white sm:text-gray-500 sm:dark:text-gray-400 sm:hover:bg-gray-50 sm:dark:hover:bg-gray-700 font-medium`;
    };

    const btnStyle = (kind: EventSummaryState): React.CSSProperties | undefined => {
      const active = state === kind;
      if (!active) return undefined;
      return {
        backgroundColor: btnColors[kind],
        borderColor: btnColors[kind],
        boxShadow: `0 0 10px ${btnColors[kind]}50`,
      };
    };

    const onClick = (next: EventSummaryState) => (e: MouseEvent<HTMLButtonElement>) => {
      // Prevent FullCalendar's eventClick navigation.
      e.preventDefault();
      e.stopPropagation();
      void handleEventSummaryButtonClick(leaderId, next);
    };

    return (
      <div
        className={`flex items-center gap-1 w-full overflow-hidden ${opts?.compact ? 'sm:w-auto' : 'sm:w-full'} shrink-0`}
        role="group"
        aria-label="Event summary"
      >
        <button type="button" disabled={isSaving} className={btn('not_received')} style={btnStyle('not_received')} onClick={onClick('not_received')} title="Not Received">
          No
        </button>
        <button type="button" disabled={isSaving} className={btn('received')} style={btnStyle('received')} onClick={onClick('received')} title="Received">
          Yes
        </button>
        <button type="button" disabled={isSaving} className={btn('did_not_meet')} style={btnStyle('did_not_meet')} onClick={onClick('did_not_meet')} title="Did Not Meet">
          {opts?.compact ? "Didn't" : "Didn't Meet"}
        </button>
        <button type="button" disabled={isSaving} className={btn('skipped')} style={btnStyle('skipped')} onClick={onClick('skipped')} title="Skipped">
          Skip
        </button>
      </div>
    );
  }, [savingLeaderIds, snapshotSavingLeaderIds, handleEventSummaryButtonClick]);

  const selectedDateLabel = useMemo(() => {
    if (!selectedISODate) return '';
    const dt = DateTime.fromISO(selectedISODate);
    if (!dt.isValid) return selectedISODate;
    return dt.toLocaleString({ weekday: 'long', month: 'short', day: 'numeric', year: 'numeric' });
  }, [selectedISODate]);

  const selectedDayEvents = useMemo(() => {
    if (!selectedISODate) return [];

    const list = events
      .filter(e => (DateTime.fromISO(e.start).toISODate() ?? '') === selectedISODate)
      .sort((a, b) => DateTime.fromISO(a.start).toMillis() - DateTime.fromISO(b.start).toMillis());

    return list;
  }, [events, selectedISODate]);

  const isListView = currentViewType.startsWith('list');

  return (
    <div className="bg-slate-800 border border-slate-700 rounded-xl shadow-card-glass p-4 sm:p-6">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-xl font-semibold text-white tracking-tight">Calendar</h1>
          <p className="text-sm text-slate-400">Circle meetings based on leader schedule (day/time/frequency).</p>
        </div>
        <div className="text-xs text-slate-400">
          {isLoadingLeaders ? 'Loading schedules…' : (
            <>
              {leadersWithSchedules.length} scheduled
              {leadersWithoutSchedules.length > 0 && (
                <span className="text-amber-500 dark:text-amber-400 ml-1">
                  · {leadersWithoutSchedules.length} missing info
                </span>
              )}
            </>
          )}
        </div>
      </div>

      {/* Success Message */}
      {actionSuccess && (
        <div className="mb-4 p-3 rounded-xl bg-green-500/10 border border-green-500/20 text-green-300 text-sm flex items-center gap-2">
          <svg className="h-5 w-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
          {actionSuccess}
        </div>
      )}

      {/* Error Message */}
      {actionError && (
        <div className="mb-4 p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-300 text-sm">
          {actionError}
        </div>
      )}

      {loadError && (
        <div className="mb-4 p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-300 text-sm">
          {loadError}
        </div>
      )}

      {!isLoadingLeaders && !loadError && leadersWithSchedules.length === 0 && (
        <div className="mb-4 p-3 rounded-xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-300 text-sm">
          No circles have both a meeting day and time set yet.
        </div>
      )}

      {/* Current week dashboard */}
      {!isViewingSnapshot && visibleWeekSundayISO && (() => {
        // Calculate status counts for the current week
        const currentWeekCounts = { received: 0, did_not_meet: 0, skipped: 0, not_received: 0 };
        for (const leader of leaders) {
          if (!scheduledLeaderIds.has(leader.id)) continue;
          const state = getEffectiveLeaderState(leader.id);
          if (state === 'received') currentWeekCounts.received++;
          else if (state === 'did_not_meet') currentWeekCounts.did_not_meet++;
          else if (state === 'skipped') currentWeekCounts.skipped++;
          else currentWeekCounts.not_received++;
        }
        // Only show the dashboard if there are scheduled leaders
        const hasScheduledLeaders = leadersWithSchedules.length > 0;
        if (!hasScheduledLeaders) return null;
        return (
          <div className="mb-4 rounded-xl overflow-hidden border bg-slate-800/60 border-slate-700 text-sm">
            {/* Header */}
            <div className="px-4 py-3 flex items-center justify-between gap-3 flex-wrap">
              <div className="flex items-center gap-2.5">
                <svg className="w-4 h-4 text-slate-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.8}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
                <div className="flex items-baseline gap-2">
                  <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Current Week</span>
                  <span className="text-sm font-medium text-white">
                    {`${DateTime.fromISO(visibleWeekSundayISO).toFormat('MMM d')} – ${DateTime.fromISO(visibleWeekSundayISO).plus({ days: 6 }).toFormat('MMM d, yyyy')}`}
                  </span>
                </div>
              </div>
            </div>

            {/* Status band */}
            <div className="grid grid-cols-2 sm:grid-cols-4 divide-x divide-slate-700/60 border-t border-slate-700/60 bg-slate-900/30">
              <div className="px-3 sm:px-4 py-2.5 sm:py-3 text-center">
                <p className="text-xl sm:text-2xl font-bold text-green-400 leading-none">{currentWeekCounts.received}</p>
                <p className="text-xs text-green-300/60 mt-1">Received</p>
              </div>
              <div className="px-3 sm:px-4 py-2.5 sm:py-3 text-center">
                <p className="text-xl sm:text-2xl font-bold text-blue-400 leading-none">{currentWeekCounts.did_not_meet}</p>
                <p className="text-xs text-blue-300/60 mt-1">Didn&apos;t Meet</p>
              </div>
              <div className="px-3 sm:px-4 py-2.5 sm:py-3 text-center">
                <p className="text-xl sm:text-2xl font-bold text-amber-400 leading-none">{currentWeekCounts.skipped}</p>
                <p className="text-xs text-amber-300/60 mt-1">Skipped</p>
              </div>
              <div className="px-3 sm:px-4 py-2.5 sm:py-3 text-center">
                <p className="text-xl sm:text-2xl font-bold text-red-400 leading-none">{currentWeekCounts.not_received}</p>
                <p className="text-xs text-red-300/60 mt-1">Not Reported</p>
              </div>
            </div>

            {/* Footer: attendance stats + action buttons */}
            <div className="px-3 sm:px-4 py-2.5 border-t border-slate-700/60 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 flex-wrap">
              {weeklyAttendanceStats ? (
                <div className="flex items-center gap-3 sm:gap-5 text-xs sm:text-sm">
                  <div>
                    <p className="text-xs text-slate-500">Circles</p>
                    <p className="font-semibold text-slate-200 leading-tight">
                      {weeklyAttendanceStats.receivedWithData}
                      {weeklyAttendanceStats.receivedWithData < weeklyAttendanceStats.totalReceived && (
                        <span className="text-slate-500 font-normal"> of {weeklyAttendanceStats.totalReceived}</span>
                      )}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-500">Attended</p>
                    <p className="font-semibold text-slate-200 leading-tight">{weeklyAttendanceStats.totalAttended}</p>
                  </div>
                  {weeklyAttendanceStats.avgRosterPct !== null && (
                    <div>
                      <p className="text-xs text-slate-500">Avg Roster</p>
                      <p className="font-semibold text-slate-200 leading-tight">{weeklyAttendanceStats.avgRosterPct}%</p>
                    </div>
                  )}
                </div>
              ) : <div />}
              <button
                type="button"
                onClick={handleAutoUpdate}
                disabled={isAutoUpdating}
                className="inline-flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-lg text-xs font-semibold bg-indigo-600/80 hover:bg-indigo-600 disabled:opacity-60 disabled:cursor-not-allowed text-white transition-colors"
              >
                {isAutoUpdating ? (
                  <><svg className="animate-spin w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" /></svg>Updating…</>
                ) : (
                  <><svg className="w-3.5 h-3.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>Auto-update from CCB</>
                )}
              </button>
            </div>

            {/* Conflict list — current week */}
            {autoUpdateConflicts && autoUpdateConflicts.length > 0 && (
              <div className="border-t border-slate-700/60 px-4 py-3">
                <div className="rounded-lg border border-orange-500/30 bg-orange-500/10 p-3">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-semibold text-orange-300 flex items-center gap-1.5">
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
                      {autoUpdateConflicts.length} conflict{autoUpdateConflicts.length !== 1 ? 's' : ''} — not overwritten
                    </span>
                    <button type="button" onClick={() => setAutoUpdateConflicts(null)} className="text-orange-400 hover:text-orange-200 transition-colors">
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                    </button>
                  </div>
                  <div className="space-y-1">
                    {autoUpdateConflicts.map(c => {
                      const stateLabel: Record<EventSummaryState, string> = { not_received: 'Not Reported', received: 'Received', did_not_meet: "Didn't Meet", skipped: 'Skipped' };
                      return (
                        <div key={c.leader_id} className="text-xs text-orange-200/90 flex flex-wrap items-center gap-1">
                          <span className="font-medium">{c.leader_name}</span>
                          <span className="text-orange-400/60">—</span>
                          <span>marked <strong>{stateLabel[c.current_state]}</strong></span>
                          <span className="text-orange-400/60">·</span>
                          <span>CCB says <strong>{stateLabel[c.ccb_state]}</strong></span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}
          </div>
        );
      })()}

      {/* Past-week snapshot banner */}
      {isViewingSnapshot && (
        <div className={`mb-4 rounded-xl overflow-hidden border text-sm ${
          isLoadingSnapshot
            ? 'bg-slate-800/60 border-slate-700/60 text-slate-400'
            : snapshotMap !== null && snapshotMap.size > 0
              ? 'bg-slate-800/60 border-slate-700'
              : 'bg-slate-800/60 border-slate-700/60 text-slate-400'
        }`}>
          {isLoadingSnapshot ? (
            <div className="px-4 py-3 flex items-center gap-2.5">
              <svg className="animate-spin h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
              Loading archived results…
            </div>
          ) : snapshotMap !== null && snapshotMap.size > 0 ? (
            <>
              {/* Header */}
              <div className="px-4 py-3 flex items-center justify-between gap-3 flex-wrap">
                <div className="flex items-center gap-2.5">
                  <svg className="w-4 h-4 text-slate-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.8}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" />
                  </svg>
                  <div className="flex items-baseline gap-2">
                    <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Archived Week</span>
                    <span className="text-sm font-medium text-white">
                      {visibleWeekSundayISO
                        ? `${DateTime.fromISO(visibleWeekSundayISO).toFormat('MMM d')} – ${DateTime.fromISO(visibleWeekSundayISO).plus({ days: 6 }).toFormat('MMM d, yyyy')}`
                        : ''}
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  {(() => {
                    const reportCount = ccbReportMap
                      ? Array.from(ccbReportMap.entries())
                          .filter(([leaderId]) => filteredLeaderIds.has(leaderId))
                          .filter(([, hasReport]) => hasReport)
                          .length
                      : 0;
                    return reportCount > 0 ? (
                      <span className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-400/30">
                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        {reportCount} in CCB
                      </span>
                    ) : null;
                  })()}
                  {(() => {
                    const filteredDnmIds = new Set(
                      Array.from(dnmLeaderIds).filter(id => filteredLeaderIds.has(id))
                    );
                    return filteredDnmIds.size > 0 ? (
                      <button
                        type="button"
                        onClick={() => setShowDnmList(v => !v)}
                        className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full bg-orange-500/15 text-orange-300 border border-orange-500/30 hover:bg-orange-500/25 transition-colors leading-none"
                      >
                        <svg className="w-3 h-3 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                        </svg>
                        {filteredDnmIds.size} didn&apos;t meet 2+ weeks
                        <svg className={`w-3 h-3 shrink-0 transition-transform duration-150 ${showDnmList ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                        </svg>
                      </button>
                    ) : null;
                  })()}
                  {(() => {
                    const offSchedule = leaders.filter(l => ccbReportMap?.get(l.id) === true && !scheduledLeaderIds.has(l.id));
                    return offSchedule.length > 0 ? (
                      <button
                        type="button"
                        onClick={() => setShowOffScheduleList(v => !v)}
                        className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full bg-cyan-500/15 text-cyan-300 border border-cyan-500/30 hover:bg-cyan-500/25 transition-colors leading-none"
                      >
                        <svg className="w-3 h-3 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                        </svg>
                        {offSchedule.length} reported, not on calendar
                        <svg className={`w-3 h-3 shrink-0 transition-transform duration-150 ${showOffScheduleList ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                        </svg>
                      </button>
                    ) : null;
                  })()}
                </div>
              </div>

              {/* Status band */}
              {(() => {
                const counts = { received: 0, did_not_meet: 0, skipped: 0, not_received: 0 };
                for (const [leaderId, state] of Array.from(snapshotMap.entries())) {
                  // Only count leaders that are in the current filtered set
                  if (!filteredLeaderIds.has(leaderId)) continue;

                  if (state === 'received') counts.received++;
                  else if (state === 'did_not_meet') counts.did_not_meet++;
                  else if (state === 'skipped') counts.skipped++;
                  else if (scheduledLeaderIds.has(leaderId)) counts.not_received++;
                }
                // Also count scheduled+filtered leaders with no snapshot row — they're implicitly not_received
                for (const leaderId of filteredLeaderIds) {
                  if (scheduledLeaderIds.has(leaderId) && !snapshotMap.has(leaderId)) counts.not_received++;
                }
                return (
                  <div className="grid grid-cols-4 divide-x divide-slate-700/60 border-t border-slate-700/60 bg-slate-900/30">
                    <div className="px-4 py-3 text-center">
                      <p className="text-2xl font-bold text-green-400 leading-none">{counts.received}</p>
                      <p className="text-xs text-green-300/60 mt-1">Received</p>
                    </div>
                    <div className="px-4 py-3 text-center">
                      <p className="text-2xl font-bold text-blue-400 leading-none">{counts.did_not_meet}</p>
                      <p className="text-xs text-blue-300/60 mt-1">Didn&apos;t Meet</p>
                    </div>
                    <div className="px-4 py-3 text-center">
                      <p className="text-2xl font-bold text-amber-400 leading-none">{counts.skipped}</p>
                      <p className="text-xs text-amber-300/60 mt-1">Skipped</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setShowNotReportedList(v => !v)}
                      className="px-4 py-3 text-center hover:bg-slate-700/30 transition-colors duration-150"
                    >
                      <p className="text-2xl font-bold text-red-400 leading-none">{counts.not_received}</p>
                      <p className="text-xs text-red-300/60 mt-1 flex items-center justify-center gap-0.5">
                        Not Reported
                        <svg className={`w-3 h-3 shrink-0 transition-transform duration-150 ${showNotReportedList ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                        </svg>
                      </p>
                    </button>
                  </div>
                );
              })()}

              {/* Footer: attendance stats + action buttons */}
              <div className="px-4 py-2.5 border-t border-slate-700/60 flex items-center justify-between gap-4 flex-wrap">
                {weeklyAttendanceStats ? (
                  <div className="flex items-center gap-5">
                    <div>
                      <p className="text-xs text-slate-500">Circles</p>
                      <p className="text-sm font-semibold text-slate-200 leading-tight">
                        {weeklyAttendanceStats.receivedWithData}
                        {weeklyAttendanceStats.receivedWithData < weeklyAttendanceStats.totalReceived && (
                          <span className="text-slate-500 font-normal"> of {weeklyAttendanceStats.totalReceived}</span>
                        )}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-slate-500">Attended</p>
                      <p className="text-sm font-semibold text-slate-200 leading-tight">{weeklyAttendanceStats.totalAttended}</p>
                    </div>
                    {weeklyAttendanceStats.avgRosterPct !== null && (
                      <div>
                        <p className="text-xs text-slate-500">Avg Roster</p>
                        <p className="text-sm font-semibold text-slate-200 leading-tight">{weeklyAttendanceStats.avgRosterPct}%</p>
                      </div>
                    )}
                  </div>
                ) : <div />}
                <button
                  type="button"
                  onClick={handleAutoUpdate}
                  disabled={isAutoUpdating}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-indigo-600/80 hover:bg-indigo-600 disabled:opacity-60 disabled:cursor-not-allowed text-white transition-colors"
                >
                  {isAutoUpdating ? (
                    <><svg className="animate-spin w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" /></svg>Updating…</>
                  ) : (
                    <><svg className="w-3.5 h-3.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>Auto-update from CCB</>
                  )}
                </button>
              </div>

              {/* Expandable lists */}
              {(showDnmList && dnmLeaderIds.size > 0) || (showNotReportedList && snapshotMap) || showOffScheduleList ? (
                <div className="border-t border-slate-700/60 px-4 py-3 space-y-2">
                  {showDnmList && dnmLeaderIds.size > 0 && (
                    <div className="rounded-lg border border-orange-500/25 bg-orange-500/8 p-2.5">
                      <p className="text-xs font-semibold text-orange-300 mb-1.5">Didn&apos;t meet in 2+ of the last 4 weeks</p>
                      <div className="flex flex-wrap gap-x-4 gap-y-1">
                        {leaders
                          .filter(l => dnmLeaderIds.has(l.id))
                          .sort((a, b) => (a.name || '').localeCompare(b.name || ''))
                          .map(l => (
                            <button
                              key={l.id}
                              type="button"
                              onClick={() => router.push(`/circle/${l.id}`)}
                              className="text-xs text-orange-200 hover:text-white hover:underline transition-colors text-left"
                            >
                              {l.name}
                            </button>
                          ))
                        }
                      </div>
                    </div>
                  )}
                  {showNotReportedList && snapshotMap && (
                    <div className="rounded-lg border border-red-500/25 bg-red-500/8 p-2.5">
                      <p className="text-xs font-semibold text-red-300 mb-1.5">Did not submit an event summary</p>
                      <div className="flex flex-wrap gap-x-4 gap-y-1">
                        {leaders
                          .filter(l => (snapshotMap.get(l.id) === 'not_received' || !snapshotMap.has(l.id)) && scheduledLeaderIds.has(l.id) && filteredLeaderIds.has(l.id))
                          .sort((a, b) => (a.name || '').localeCompare(b.name || ''))
                          .map(l => (
                            <button
                              key={l.id}
                              type="button"
                              onClick={() => router.push(`/circle/${l.id}`)}
                              className="text-xs text-red-200 hover:text-white hover:underline transition-colors text-left"
                            >
                              {l.name}
                            </button>
                          ))
                        }
                      </div>
                    </div>
                  )}
                  {showOffScheduleList && ccbReportMap && (
                    <div className="rounded-lg border border-cyan-500/25 bg-cyan-500/8 p-2.5">
                      <p className="text-xs font-semibold text-cyan-300 mb-1.5">Reported to CCB but not on the calendar this week</p>
                      <div className="flex flex-wrap gap-x-4 gap-y-1">
                        {leaders
                          .filter(l => ccbReportMap.get(l.id) === true && !scheduledLeaderIds.has(l.id))
                          .sort((a, b) => (a.name || '').localeCompare(b.name || ''))
                          .map(l => (
                            <button
                              key={l.id}
                              type="button"
                              onClick={() => router.push(`/circle/${l.id}`)}
                              className="text-xs text-cyan-200 hover:text-white hover:underline transition-colors text-left"
                            >
                              {l.name}
                            </button>
                          ))
                        }
                      </div>
                    </div>
                  )}
                </div>
              ) : null}

              {/* Conflict list */}
              {autoUpdateConflicts && autoUpdateConflicts.length > 0 && (
                <div className="border-t border-slate-700/60 px-4 py-3">
                  <div className="rounded-lg border border-orange-500/30 bg-orange-500/10 p-3">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-semibold text-orange-300 flex items-center gap-1.5">
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
                        {autoUpdateConflicts.length} conflict{autoUpdateConflicts.length !== 1 ? 's' : ''} — not overwritten
                      </span>
                      <button type="button" onClick={() => setAutoUpdateConflicts(null)} className="text-orange-400 hover:text-orange-200 transition-colors">
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                      </button>
                    </div>
                    <div className="space-y-1">
                      {autoUpdateConflicts.map(c => {
                        const stateLabel: Record<EventSummaryState, string> = { not_received: 'Not Reported', received: 'Received', did_not_meet: "Didn't Meet", skipped: 'Skipped' };
                        return (
                          <div key={c.leader_id} className="text-xs text-orange-200/90 flex flex-wrap items-center gap-1">
                            <span className="font-medium">{c.leader_name}</span>
                            <span className="text-orange-400/60">—</span>
                            <span>marked <strong>{stateLabel[c.current_state]}</strong></span>
                            <span className="text-orange-400/60">·</span>
                            <span>CCB says <strong>{stateLabel[c.ccb_state]}</strong></span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}
            </>
          ) : (
            <div className="px-4 py-3 flex items-center gap-2 text-slate-400">
              <svg className="h-4 w-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span className="text-sm">No snapshot for this week. Use Auto-update from CCB below to fetch and apply reports.</span>
            </div>
          )}
        </div>
      )}


      {/* AI Weekly Summary Panel */}
      {isListView && visibleWeekSundayISO && (
        <div className="mb-4">
          {/* Header bar — always visible */}
          <div className="flex items-center justify-between gap-3 px-3 py-2 rounded-xl border border-purple-500/25 bg-purple-500/8">
            <div className="flex items-center gap-2 min-w-0">
              {/* Sparkle icon */}
              <svg className="w-4 h-4 shrink-0 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.8}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
              </svg>
              <span className="text-xs font-semibold text-purple-300">AI Weekly Summary</span>
              {savedSummary && !generatedSummary && (
                <span className="text-xs text-purple-400/60 truncate hidden sm:block">
                  · {savedSummary.filter_label}
                </span>
              )}
              {generatedSummary && (
                <span className="text-xs font-medium px-1.5 py-0.5 rounded-full bg-purple-500/20 text-purple-300 border border-purple-500/30 leading-none">
                  unsaved
                </span>
              )}
            </div>

            <div className="flex items-center gap-2 shrink-0">
              {/* Save / Discard for freshly generated */}
              {generatedSummary && !isSavingSummary && (
                <>
                  <button
                    type="button"
                    onClick={handleSaveSummary}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-semibold bg-purple-600/70 hover:bg-purple-600 text-white transition-colors border border-purple-500/40"
                  >
                    <svg className="w-3 h-3 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M17 3H5a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2V7l-4-4z" />
                      <path strokeLinecap="round" strokeLinejoin="round" d="M17 3v4H7V3" />
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 17v-5h6v5" />
                    </svg>
                    Save
                  </button>
                  <button
                    type="button"
                    onClick={() => { setGeneratedSummary(null); setShowAiSummary(!!savedSummary); }}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium text-purple-400 hover:text-purple-200 hover:bg-purple-500/15 transition-colors"
                  >
                    Discard
                  </button>
                </>
              )}
              {isSavingSummary && (
                <svg className="animate-spin w-4 h-4 text-purple-400 shrink-0" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
              )}

              {/* Generate Summary button — only when no summary exists yet */}
              {!generatedSummary && !savedSummary && (
                <button
                  type="button"
                  onClick={handleGenerateSummary}
                  disabled={isGeneratingSummary || leaders.length === 0}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold bg-purple-600/70 hover:bg-purple-600 disabled:opacity-50 disabled:cursor-not-allowed text-white transition-colors border border-purple-500/40"
                >
                  {isGeneratingSummary ? (
                    <>
                      <svg className="animate-spin w-3 h-3 shrink-0" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                      </svg>
                      Generating…
                    </>
                  ) : (
                    <>
                      <svg className="w-3 h-3 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.8}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
                      </svg>
                      Generate Summary
                    </>
                  )}
                </button>
              )}

              {/* Chat button — opens follow-up dialog */}
              {(savedSummary || generatedSummary) && !isGeneratingSummary && (
                <button
                  type="button"
                  onClick={() => setShowSummaryChatModal(true)}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium text-purple-300 hover:text-purple-100 hover:bg-purple-500/15 transition-colors border border-purple-500/25 hover:border-purple-500/40"
                  title="Ask follow-up questions about this summary"
                >
                  <svg className="w-3 h-3 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                  </svg>
                  Chat
                </button>
              )}

              {/* Expand / collapse toggle */}
              {(savedSummary || generatedSummary || isGeneratingSummary) && (
                <button
                  type="button"
                  onClick={() => setShowAiSummary(v => !v)}
                  className="p-1 rounded-md text-purple-400 hover:text-purple-200 hover:bg-purple-500/15 transition-colors"
                  title={showAiSummary ? 'Collapse' : 'Expand'}
                >
                  <svg className={`w-4 h-4 transition-transform duration-200 ${showAiSummary ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                  </svg>
                </button>
              )}
            </div>
          </div>

          {/* Expandable content */}
          {showAiSummary && (
            <div className="mt-1 rounded-xl border border-purple-500/20 bg-slate-900/60 overflow-hidden">
              {/* Error state */}
              {summaryError && (
                <div className="px-4 py-3 text-sm text-red-300 flex items-start gap-2">
                  <svg className="w-4 h-4 shrink-0 mt-0.5 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                  {summaryError}
                </div>
              )}

              {/* Generating skeleton */}
              {isGeneratingSummary && !summaryError && (
                <div className="px-4 py-4 space-y-2.5">
                  <div className="animate-pulse space-y-2">
                    <div className="h-3.5 bg-purple-500/20 rounded w-3/4" />
                    <div className="h-3.5 bg-purple-500/15 rounded w-full" />
                    <div className="h-3.5 bg-purple-500/15 rounded w-5/6" />
                    <div className="h-3.5 bg-purple-500/10 rounded w-2/3" />
                  </div>
                </div>
              )}

              {/* Summary text — generated (unsaved) */}
              {generatedSummary && !isGeneratingSummary && (
                <div className="px-4 py-4">
                  {renderAISummary(generatedSummary)}
                </div>
              )}

              {/* Summary text — saved */}
              {savedSummary && !generatedSummary && !isGeneratingSummary && (
                <>
                  <div className="px-4 py-4">
                    {renderAISummary(savedSummary.summary_text)}
                  </div>
                  <div className="px-4 py-2 border-t border-purple-500/15 flex items-center gap-2 text-xs text-purple-500/70">
                    <svg className="w-3 h-3 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.8}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    Generated for: {savedSummary.filter_label} · {DateTime.fromISO(savedSummary.generated_at).toFormat('MMM d, yyyy')}
                  </div>
                </>
              )}

              {/* Bottom action bar — Regenerate + Copy */}
              {(savedSummary || generatedSummary) && !isGeneratingSummary && (
                <div className="px-4 py-2.5 border-t border-purple-500/15 flex items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={handleGenerateSummary}
                    disabled={isGeneratingSummary || leaders.length === 0}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold bg-purple-600/70 hover:bg-purple-600 disabled:opacity-50 disabled:cursor-not-allowed text-white transition-colors border border-purple-500/40"
                  >
                    <svg className="w-3 h-3 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                    Regenerate
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const text = generatedSummary ?? savedSummary?.summary_text ?? '';
                      navigator.clipboard.writeText(text).then(() => {
                        setSummaryCopied(true);
                        setTimeout(() => setSummaryCopied(false), 2000);
                      });
                    }}
                    className="p-1 rounded-md text-purple-400 hover:text-purple-200 hover:bg-purple-500/15 transition-colors"
                    title="Copy summary"
                  >
                    {summaryCopied ? (
                      <svg className="w-4 h-4 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                    ) : (
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                      </svg>
                    )}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      <div className="calendar-shell">
        <FullCalendar
          plugins={[listPlugin, interactionPlugin]}
          initialView={initialView}
          headerToolbar={
            isMobile
              ? { left: 'prev,next', center: 'title', right: 'today' }
              : { left: 'prev,next today', center: 'title', right: '' }
          }
          footerToolbar={undefined}
          buttonText={{
            listWeek: 'List',
          }}
          titleFormat={
            isMobile
              ? ({ year: 'numeric', month: 'short', day: 'numeric' } as any)
              : ({ year: 'numeric', month: 'long' } as any)
          }
          height="auto"
          nowIndicator
          weekends
          selectable={false}
          editable={false}
          eventClick={onEventClick}
          dateClick={onDateClick}
          events={events}
          eventContent={(arg: EventContentArg) => {
            const isList = arg.view.type.startsWith('list');
            const ext = arg.event.extendedProps as unknown as {
              leaderId?: number;
              ccbProfileLink?: string | null;
              eventSummaryState?: EventSummaryState;
            };
            const leaderId = ext.leaderId;
            const state = leaderId ? getEffectiveLeaderState(leaderId) : (ext.eventSummaryState ?? 'not_received');

            const ccbHref = (() => {
              const raw = ext.ccbProfileLink;
              if (!raw) return null;
              return /^https?:\/\//i.test(raw) ? raw : null;
            })();

            if (!isList || !leaderId || !onSetEventSummaryState) {
              return <div className="truncate">{arg.event.title}</div>;
            }

            const eventId = arg.event.id;
            const isExpanded = expandedEventIds.has(eventId);
            const colors = getEventSummaryColors(state);

            // Inline dot colors — safe against Tailwind purging
            const dotColor: Record<EventSummaryState, string> = {
              received:      '#22c55e',
              did_not_meet:  '#3b82f6',
              skipped:       '#f59e0b',
              not_received:  '#ef4444',
            };

            const toggleExpanded = (e: MouseEvent<HTMLButtonElement>) => {
              e.preventDefault();
              e.stopPropagation();
              setExpandedEventIds(prev => {
                const next = new Set(prev);
                if (next.has(eventId)) {
                  next.delete(eventId);
                } else {
                  next.add(eventId);
                }
                return next;
              });
            };

            return (
              <>
                {/* Unified Collapsible Design - Mobile & Desktop */}
                <div className="flex flex-col w-full">

                  {/* ── Collapsed row ── */}
                  <button
                    type="button"
                    className="flex items-center gap-2.5 w-full text-left py-2"
                    onClick={toggleExpanded}
                  >
                    {/* Status pill */}
                    <div
                      className="status-pill w-2.5 h-10 rounded-full shrink-0"
                      style={{ backgroundColor: dotColor[state], boxShadow: `0 0 8px ${dotColor[state]}50` }}
                    />

                    {/* Name + meta */}
                    <div className="flex-1 min-w-0">
                      <div className="text-[15px] sm:text-base font-semibold text-white leading-snug">
                        {arg.event.title}
                      </div>
                      <div className="text-[12px] sm:text-[13px] text-slate-400 mt-0.5 leading-snug">
                        {arg.event.start ? DateTime.fromJSDate(arg.event.start).toLocaleString(DateTime.TIME_SIMPLE) : ''}
                        {arg.event.extendedProps?.frequency && (
                          <span className="ml-1 text-slate-500">· {arg.event.extendedProps.frequency}</span>
                        )}
                      </div>
                      {/* Attendance indicator — only shown when event summary was Received */}
                      {state === 'received' && leaderId && (() => {
                        const att = attendanceData?.get(leaderId);
                        if (!att?.headcount) return null;
                        const pct = att.rosterCount && att.rosterCount > 0
                          ? Math.round((att.headcount / att.rosterCount) * 100)
                          : null;
                        return (
                          <div className="text-[11px] text-green-400/80 mt-0.5 leading-snug">
                            {att.headcount} attended{pct !== null ? ` · ${pct}% of roster` : ''}
                          </div>
                        );
                      })()}
                      {/* Missing Attendance badge — CCB report exists but no headcount */}
                      {leaderId && ccbReportMap?.get(leaderId) && !attendanceData?.get(leaderId)?.headcount && state !== 'not_received' && (
                        <div className="inline-flex items-center gap-1 mt-0.5">
                          <span className="inline-flex items-center gap-1 text-[11px] font-medium px-1.5 py-0.5 rounded-full bg-slate-500/20 text-slate-400 border border-slate-500/25 leading-none">
                            <svg className="w-2.5 h-2.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
                            </svg>
                            Missing Attendance
                          </span>
                        </div>
                      )}
                      {/* CCB report available indicator */}
                      {isViewingSnapshot && leaderId && state === 'not_received' && ccbReportMap?.get(leaderId) && (
                        <div className="inline-flex items-center gap-1 mt-0.5">
                          <span className="inline-flex items-center gap-1 text-[11px] font-medium px-1.5 py-0.5 rounded-full bg-amber-500/15 text-amber-400 border border-amber-500/25 leading-none">
                            <svg className="w-2.5 h-2.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                            Report in CCB
                          </span>
                        </div>
                      )}
                      {/* Didn't meet 2+ weeks indicator */}
                      {leaderId && dnmLeaderIds.has(leaderId) && (
                        <div className="inline-flex items-center gap-1 mt-0.5">
                          <span className="inline-flex items-center gap-1 text-[11px] font-medium px-1.5 py-0.5 rounded-full bg-orange-500/15 text-orange-300 border border-orange-500/25 leading-none">
                            <svg className="w-2.5 h-2.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                            </svg>
                            2+ weeks didn&apos;t meet
                          </span>
                        </div>
                      )}
                    </div>

                    {/* Chevron */}
                    <svg
                      className={`w-5 h-5 text-gray-500 shrink-0 transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`}
                      fill="none" stroke="currentColor" viewBox="0 0 24 24"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>

                  {/* ── Expanded panel ── */}
                  {isExpanded && (
                    <div className="mt-3 pt-3 border-t border-white/10">
                      {/* Desktop row */}
                      <div className="hidden sm:flex sm:items-center sm:justify-between sm:gap-4">
                        {/* Left: Status buttons */}
                        {renderEventSummaryButtons(leaderId, state, { compact: true })}

                        {/* Right: Action buttons */}
                        <div className="flex items-center gap-2 shrink-0">
                          {/* Summary */}
                          <button
                            type="button"
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              const eventDate = arg.event.start
                                ? DateTime.fromJSDate(arg.event.start).toISODate()
                                : DateTime.local().toISODate();
                              openEventExplorerForLeader(leaderId, eventDate);
                            }}
                            className="h-9 px-3 rounded-lg text-xs font-semibold bg-white/8 border border-white/10 text-white hover:bg-white/15 active:scale-[0.97] transition-all inline-flex items-center gap-1.5"
                          >
                            <svg className="w-4 h-4 text-blue-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                            </svg>
                            Summary
                          </button>

                          {/* Reminder */}
                          <button
                            type="button"
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              const leader = leaders.find(l => l.id === leaderId);
                              if (leader) handleOpenReminderModal(leader);
                            }}
                            className="h-9 px-3 rounded-lg text-xs font-semibold bg-white/8 border border-white/10 text-white hover:bg-white/15 active:scale-[0.97] transition-all inline-flex items-center gap-1.5"
                          >
                            <svg className="w-4 h-4 text-amber-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
                            </svg>
                            Reminder
                          </button>

                          {/* Profile */}
                          <button
                            type="button"
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              router.push(`/circle/${leaderId}`);
                            }}
                            className="h-9 px-3 rounded-lg text-xs font-semibold bg-white/8 border border-white/10 text-white hover:bg-white/15 active:scale-[0.97] transition-all inline-flex items-center gap-1.5"
                          >
                            <svg className="w-4 h-4 text-green-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                            </svg>
                            Profile
                          </button>

                          {/* CCB */}
                          {ccbHref ? (
                            <a
                              href={ccbHref}
                              target="_blank"
                              rel="noopener noreferrer"
                              onClick={(e) => e.stopPropagation()}
                              className="h-9 px-3 rounded-lg text-xs font-semibold bg-white/8 border border-white/10 text-white hover:bg-white/15 active:scale-[0.97] transition-all inline-flex items-center gap-1.5"
                            >
                              <svg className="w-4 h-4 text-purple-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                              </svg>
                              CCB
                            </a>
                          ) : (
                            <button type="button" disabled className="h-9 px-3 rounded-lg text-xs font-semibold bg-slate-700/50 text-slate-600 cursor-not-allowed opacity-50 inline-flex items-center gap-1.5">
                              <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                              </svg>
                              CCB
                            </button>
                          )}
                        </div>
                      </div>

                      {/* ── Mobile expanded ── */}
                      <div className="flex flex-col gap-2.5 sm:hidden">

                        {/* EVENT SUMMARY RECEIVED — label + 4 buttons */}
                        <div>
                          <div className="text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-1.5">Event Summary</div>
                          <div className="grid grid-cols-4 gap-1.5">
                            {(['not_received', 'received', 'did_not_meet', 'skipped'] as EventSummaryState[]).map(kind => {
                              const active = state === kind;
                              const kindColors = getEventSummaryColors(kind);
                              const labels: Record<EventSummaryState, string> = {
                                not_received: 'No',
                                received: 'Yes',
                                did_not_meet: "Didn't",
                                skipped: 'Skip',
                              };
                              const activeColors: Record<EventSummaryState, string> = {
                                not_received: '#ef4444',
                                received: '#22c55e',
                                did_not_meet: '#3b82f6',
                                skipped: '#f59e0b',
                              };
                              return (
                                <button
                                  key={kind}
                                  type="button"
                                  disabled={savingLeaderIds.has(leaderId) || snapshotSavingLeaderIds.has(leaderId)}
                                  onClick={(e) => { e.preventDefault(); e.stopPropagation(); void handleEventSummaryButtonClick(leaderId, kind); }}
                                  className={`h-10 rounded-lg text-[13px] font-bold transition-all active:scale-95 ${
                                    active
                                      ? 'es-active border-2 text-white shadow-lg'
                                      : 'bg-white/10 border border-white/15 text-slate-400'
                                  }`}
                                  style={active ? {
                                    backgroundColor: activeColors[kind],
                                    borderColor: activeColors[kind],
                                    boxShadow: `0 0 12px ${activeColors[kind]}60`,
                                  } : undefined}
                                >
                                  {labels[kind]}
                                </button>
                              );
                            })}
                          </div>
                        </div>

                        {/* ── Divider ── */}
                        <div className="h-px bg-white/10" />

                        {/* ── Action buttons — 2×2 grid ── */}
                        <div className="grid grid-cols-2 gap-2">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.preventDefault(); e.stopPropagation();
                              openEventExplorerForLeader(leaderId, arg.event.start ? DateTime.fromJSDate(arg.event.start).toISODate() : DateTime.local().toISODate());
                            }}
                            className="h-11 rounded-lg text-[13px] font-semibold bg-white/8 border border-white/10 text-white hover:bg-white/15 active:scale-[0.97] transition-all flex items-center justify-center gap-1.5"
                          >
                            <svg className="w-4 h-4 text-blue-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                            </svg>
                            Summary
                          </button>

                          <button
                            type="button"
                            onClick={(e) => { e.preventDefault(); e.stopPropagation(); const leader = leaders.find(l => l.id === leaderId); if (leader) handleOpenReminderModal(leader); }}
                            className="h-11 rounded-lg text-[13px] font-semibold bg-white/8 border border-white/10 text-white hover:bg-white/15 active:scale-[0.97] transition-all flex items-center justify-center gap-1.5"
                          >
                            <svg className="w-4 h-4 text-amber-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
                            </svg>
                            Reminder
                          </button>

                          <button
                            type="button"
                            onClick={(e) => { e.preventDefault(); e.stopPropagation(); router.push(`/circle/${leaderId}`); }}
                            className="h-11 rounded-lg text-[13px] font-semibold bg-white/8 border border-white/10 text-white hover:bg-white/15 active:scale-[0.97] transition-all flex items-center justify-center gap-1.5"
                          >
                            <svg className="w-4 h-4 text-green-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                            </svg>
                            Profile
                          </button>

                          {ccbHref ? (
                            <a
                              href={ccbHref} target="_blank" rel="noopener noreferrer"
                              onClick={(e) => e.stopPropagation()}
                              className="h-11 rounded-lg text-[13px] font-semibold bg-white/8 border border-white/10 text-white hover:bg-white/15 active:scale-[0.97] transition-all flex items-center justify-center gap-1.5"
                            >
                              <svg className="w-4 h-4 text-purple-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                              </svg>
                              CCB
                            </a>
                          ) : (
                            <button type="button" disabled
                              className="h-11 rounded-lg text-[13px] font-semibold bg-slate-700/50 text-slate-600 cursor-not-allowed flex items-center justify-center gap-1.5">
                              <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                              </svg>
                              CCB
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </>
            );
          }}
          datesSet={(arg) => {
            onDatesSet(arg);
            // Store calendar API reference after mount
            const calendarEl = document.querySelector('.calendar-shell .fc');
            if (calendarEl && arg.view.calendar) {
              (calendarEl as any).fcApi = arg.view.calendar;
            }
          }}
          dayMaxEvents={3}
          eventDisplay="block"
        />
      </div>

      {!isListView && (
      <div className="mt-5 border-t border-slate-700 pt-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-white">Events for {selectedDateLabel || selectedISODate}</h2>
            <p className="text-xs text-slate-400">Click a day on the calendar to change the list.</p>
          </div>
          <div className="text-xs text-slate-400">{selectedDayEvents.length} item{selectedDayEvents.length === 1 ? '' : 's'}</div>
        </div>

        {selectedDayEvents.length === 0 ? (
          <div className="mt-3 text-sm text-slate-400">No events for this day.</div>
        ) : (
          <div className="mt-3 space-y-2">
            {selectedDayEvents.map(ev => {
              const leaderId = ev.extendedProps?.leaderId;
              const ccb = ev.extendedProps?.ccbProfileLink ?? null;
              const rawEventSummaryState = (ev.extendedProps?.eventSummaryState ?? 'not_received') as EventSummaryState;
              const eventSummaryState = leaderId ? getEffectiveLeaderState(leaderId) : rawEventSummaryState;
              const timeLabel = DateTime.fromISO(ev.start).toLocaleString(DateTime.TIME_SIMPLE);
              const ccbHref = ccb && /^https?:\/\//i.test(ccb) ? ccb : null;
              const isoDate = DateTime.fromISO(ev.start).toISODate() ?? '';

              const colors = getEventSummaryColors(eventSummaryState);
              const stateBorderClass = colors.borderLeft;
              const stateBadgeClass = colors.bg;
              const stateLabel = colors.label;

              return (
                <div
                  key={ev.id}
                  className={
                    `flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 rounded-xl border border-slate-700 bg-slate-700/40 hover:bg-slate-700/60 transition-colors px-3 py-2.5 border-l-4 ${stateBorderClass}`
                  }
                  role={leaderId ? 'button' : undefined}
                  tabIndex={leaderId ? 0 : undefined}
                  onClick={() => {
                    if (!leaderId) return;
                    openEventExplorerForLeader(leaderId, isoDate);
                  }}
                  onKeyDown={(e) => {
                    if (!leaderId) return;
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      openEventExplorerForLeader(leaderId, isoDate);
                    }
                  }}
                >
                  {/* Mobile Layout */}
                  <div className="flex flex-col gap-2 sm:hidden">
                    {/* Row 1: Circle Leader Name */}
                    <div className="flex items-center gap-2">
                      {leaderId ? (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            router.push(`/circle/${leaderId}`);
                          }}
                          className="text-base font-bold text-white hover:text-indigo-400 transition-colors text-left group"
                          title="Open circle leader profile"
                        >
                          <span className="group-hover:underline">{ev.title}</span>
                        </button>
                      ) : (
                        <div className="text-base font-bold text-white">{ev.title}</div>
                      )}
                    </div>

                    {/* Row 2: Time of Meeting */}
                    <div className="text-xs text-slate-400">{timeLabel}</div>
                    
                    {/* Row 3: Actions (mobile-first, uses full width) */}
                    <div className="space-y-2">
                      <div className="grid grid-cols-3 gap-2">
                        {leaderId ? (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              openEventExplorerForLeader(leaderId, isoDate);
                            }}
                            className="h-9 col-span-1 rounded-lg text-xs font-semibold leading-none border border-slate-600 text-slate-200 hover:bg-slate-600 transition-colors inline-flex items-center justify-center"
                            title="Open attendance summary"
                          >
                            Summary
                          </button>
                        ) : (
                          <button
                            type="button"
                            disabled
                            className="h-9 col-span-1 rounded-lg text-xs font-semibold leading-none border border-slate-700 text-slate-500 cursor-not-allowed opacity-50"
                            title="Summary unavailable"
                          >
                            Summary
                          </button>
                        )}

                        {ccbHref ? (
                          <a
                            href={ccbHref}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            className="h-9 col-span-2 rounded-lg text-xs font-semibold leading-none border border-indigo-500/30 text-indigo-300 hover:bg-indigo-500/15 transition-colors inline-flex items-center justify-center"
                            title="Open CCB profile"
                          >
                            CCB
                          </a>
                        ) : (
                          <button
                            type="button"
                            disabled
                            className="h-9 col-span-2 rounded-lg text-xs font-semibold leading-none border border-slate-700 text-slate-500 cursor-not-allowed opacity-50"
                            title="No CCB profile link"
                          >
                            CCB
                          </button>
                        )}
                      </div>

                      {leaderId && onSetEventSummaryState && (
                        <div className="w-full">
                          {renderEventSummaryButtons(leaderId, eventSummaryState, { compact: true })}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Desktop Layout */}
                  <div className="hidden sm:flex sm:items-center sm:justify-between gap-6 w-full min-w-0">
                    {/* Left: name + time/frequency */}
                    <div className="min-w-0 flex-1">
                      {leaderId ? (
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); router.push(`/circle/${leaderId}`); }}
                          className="block text-sm font-semibold text-white hover:text-indigo-400 transition-colors truncate text-left group"
                          title="Open circle leader profile"
                        >
                          <span className="group-hover:underline">{ev.title}</span>
                        </button>
                      ) : (
                        <div className="block text-sm font-semibold text-white truncate">{ev.title}</div>
                      )}
                      <div className="text-xs text-slate-400 mt-0.5">
                        {timeLabel}
                        {ev.extendedProps?.frequency && (
                          <span className="ml-1.5">• {ev.extendedProps.frequency}</span>
                        )}
                      </div>
                    </div>

                    {/* Center: status buttons */}
                    {leaderId && onSetEventSummaryState && (
                      <div className="shrink-0">
                        {renderEventSummaryButtons(leaderId, eventSummaryState, { compact: true })}
                      </div>
                    )}

                    {/* Right: action buttons */}
                    <div className="flex items-center gap-2 shrink-0">
                      {/* Summary */}
                      {leaderId && (
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); openEventExplorerForLeader(leaderId, isoDate); }}
                          className="h-8 px-3 text-xs font-medium rounded-lg border border-slate-600 text-slate-200 hover:bg-slate-600 transition-colors"
                          title="Open attendance summary"
                        >
                          Summary
                        </button>
                      )}

                      {/* Profile */}
                      {leaderId && (
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); router.push(`/circle/${leaderId}`); }}
                          className="h-8 px-3 text-xs font-medium rounded-lg border border-slate-600 text-slate-200 hover:bg-slate-600 transition-colors"
                          title="Open circle leader profile"
                        >
                          Profile
                        </button>
                      )}

                      {/* CCB */}
                      {ccbHref ? (
                        <a
                          href={ccbHref}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          className="h-8 px-3 text-xs font-medium rounded-lg border border-indigo-500/30 text-indigo-300 hover:bg-indigo-500/15 transition-colors inline-flex items-center"
                          title="Open CCB profile"
                        >
                          CCB
                        </a>
                      ) : (
                        <button
                          type="button"
                          disabled
                          className="h-8 px-3 text-xs font-medium rounded-lg border border-slate-700 text-slate-500 cursor-not-allowed opacity-50"
                          title="No CCB profile link"
                        >
                          CCB
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
      )}

      {/* Event Explorer Modal */}
      <EventExplorerModal
        isOpen={showEventExplorer}
        onClose={() => setShowEventExplorer(false)}
        initialDate={selectedEventDate}
        initialGroupName={selectedEventGroupName}
        ccbProfileLink={selectedCcbProfileLink}
      />

      {/* Event Summary Reminder Modal */}
      {selectedLeader && (
        <EventSummaryReminderModal
          isOpen={showReminderModal}
          onClose={() => {
            setShowReminderModal(false);
            setSelectedLeader(null);
          }}
          leaderName={selectedLeader.name || 'Unknown'}
          sentMessages={sentReminderMessages}
          onSend={handleSendEventSummaryReminder}
        />
      )}

      {/* Weekly Summary Chat Modal */}
      <WeeklySummaryChatModal
        isOpen={showSummaryChatModal}
        onClose={() => setShowSummaryChatModal(false)}
        summary={generatedSummary ?? savedSummary?.summary_text ?? null}
        weekLabel={visibleWeekSundayISO
          ? (() => {
              const ws = DateTime.fromISO(visibleWeekSundayISO);
              const we = ws.plus({ days: 6 });
              return `${ws.toFormat('MMM d')}–${we.toFormat('MMM d, yyyy')}`;
            })()
          : ''}
        filterLabel={activeFilterLabel}
        leaderCount={leaders.length}
      />

      {/* Missing Schedule Info */}
      {!isLoadingLeaders && leadersWithoutSchedules.length > 0 && (
        <div className="mt-5 border-t border-slate-700 pt-5">
          <button
            type="button"
            onClick={() => setShowMissingSchedules(prev => !prev)}
            className="flex items-center gap-2 w-full text-left group"
          >
            <svg
              className={`w-4 h-4 text-slate-500 shrink-0 transition-transform duration-200 ${showMissingSchedules ? 'rotate-180' : ''}`}
              fill="none" stroke="currentColor" viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
            <span className="text-sm font-semibold text-white">
              Missing Schedule Info
            </span>
            <span className="text-xs font-medium text-amber-400 bg-amber-500/15 border border-amber-500/25 px-2 py-0.5 rounded-full">
              {leadersWithoutSchedules.length}
            </span>
          </button>
          <p className="text-xs text-slate-500 mt-1 ml-6">
            These circles are missing a meeting day or time and won&apos;t appear on the calendar.
          </p>

          {showMissingSchedules && (
            <div className="mt-3 ml-6 space-y-1.5 max-h-96 overflow-y-auto">
              {leadersWithoutSchedules.map(leader => (
                <div
                  key={leader.id}
                  className="flex items-center justify-between gap-3 rounded-xl border border-slate-700 bg-slate-700/40 px-3 py-2.5 border-l-4 border-l-amber-500"
                >
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-semibold text-white truncate">
                      {leader.name}
                      {leader.circle_type && (
                        <span className="ml-1.5 text-xs font-normal text-slate-400">({leader.circle_type})</span>
                      )}
                    </div>
                    <div className="text-xs text-slate-400 mt-0.5">
                      {(() => {
                        const day = (leader.day ?? '').trim();
                        const time = (leader.time ?? '').trim();
                        if (!day && !time) return 'No day or time set';
                        if (!day) return 'No meeting day set';
                        if (!time) return 'No meeting time set';
                        if (dayToWeekday(day) === null) return `Day "${day}" not recognized`;
                        if (parseTimeToHourMinute(time) === null) return `Time "${time}" not recognized`;
                        return 'Schedule not parseable';
                      })()}
                      {leader.campus && <span className="ml-1.5">· {leader.campus}</span>}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => router.push(`/circle/${leader.id}`)}
                    className="h-8 px-3 text-xs font-medium rounded-lg border border-slate-600 text-slate-200 hover:bg-slate-600 transition-colors shrink-0"
                  >
                    Edit
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

    </div>
  );
}
