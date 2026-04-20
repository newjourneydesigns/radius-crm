'use client';

import dynamic from 'next/dynamic';
import { useCallback, useEffect, useMemo, useState, type MouseEvent } from 'react';
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
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';

const FullCalendar = dynamic(() => import('@fullcalendar/react'), { ssr: false });

const DEFAULT_CALENDAR_VIEW = 'listWeek';

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
};

export default function CircleMeetingsCalendar({
  leaders,
  isLoading: isLoadingLeaders = false,
  loadError = null,
  onSetEventSummaryState,
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
  const [isResetting, setIsResetting] = useState(false);
  const [selectedEventGroupName, setSelectedEventGroupName] = useState<string>('');
  const [selectedCcbProfileLink, setSelectedCcbProfileLink] = useState<string | null>(null);
  const [expandedEventIds, setExpandedEventIds] = useState<Set<string>>(new Set());
  const [initialView] = useState(DEFAULT_CALENDAR_VIEW);
  const [currentViewType, setCurrentViewType] = useState(DEFAULT_CALENDAR_VIEW);

  // Snapshot state — stores archived weekly event summary data for past-week views
  const [snapshotMap, setSnapshotMap] = useState<Map<number, EventSummaryState> | null>(null);
  const [ccbReportMap, setCcbReportMap] = useState<Map<number, boolean> | null>(null);
  const [isLoadingSnapshot, setIsLoadingSnapshot] = useState(false);
  const [isPullingCCB, setIsPullingCCB] = useState(false);
  const [isAutoUpdating, setIsAutoUpdating] = useState(false);
  const [autoUpdateConflicts, setAutoUpdateConflicts] = useState<Array<{ leader_id: number; leader_name: string; current_state: EventSummaryState; ccb_state: EventSummaryState }> | null>(null);
  const [snapshotSavingLeaderIds, setSnapshotSavingLeaderIds] = useState<Set<number>>(new Set());

  // Attendance data — headcount + roster size per leader for the visible week
  type AttendanceEntry = { headcount: number | null; rosterCount: number | null };
  const [attendanceData, setAttendanceData] = useState<Map<number, AttendanceEntry> | null>(null);

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
  useEffect(() => {
    if (!visibleWeekSundayISO || !isViewingSnapshot) {
      setSnapshotMap(null);
      setCcbReportMap(null);
      return;
    }
    let cancelled = false;
    setIsLoadingSnapshot(true);
    fetch(`/api/event-summary-snapshots?week_start_date=${encodeURIComponent(visibleWeekSundayISO)}`)
      .then(r => r.json())
      .then(({ snapshots }: { snapshots: Array<{ circle_leader_id: number; event_summary_state: EventSummaryState; ccb_report_available?: boolean }> }) => {
        if (cancelled) return;
        const stateMap = new Map<number, EventSummaryState>();
        const reportMap = new Map<number, boolean>();
        for (const s of snapshots ?? []) {
          stateMap.set(s.circle_leader_id, s.event_summary_state);
          reportMap.set(s.circle_leader_id, s.ccb_report_available ?? false);
        }
        setSnapshotMap(stateMap);
        setCcbReportMap(reportMap);
      })
      .catch(err => { if (!cancelled) console.error('Failed to load snapshot:', err); })
      .finally(() => { if (!cancelled) setIsLoadingSnapshot(false); });
    return () => { cancelled = true; };
  }, [visibleWeekSundayISO, isViewingSnapshot]);

  // Fetch attendance (headcounts + roster sizes) for the visible week — runs for any week.
  useEffect(() => {
    if (!visibleWeekSundayISO || leaders.length === 0) {
      setAttendanceData(null);
      return;
    }
    let cancelled = false;
    const weekEnd = DateTime.fromISO(visibleWeekSundayISO).plus({ days: 6 }).toISODate()!;
    const leaderIds = leaders.map(l => l.id);

    Promise.all([
      supabase
        .from('circle_meeting_occurrences')
        .select('leader_id, headcount')
        .eq('status', 'met')
        .gte('meeting_date', visibleWeekSundayISO)
        .lte('meeting_date', weekEnd),
      supabase
        .from('circle_roster_cache')
        .select('circle_leader_id')
        .in('circle_leader_id', leaderIds),
    ]).then(([occRes, rosterRes]) => {
      if (cancelled) return;
      const rosterCounts = new Map<number, number>();
      for (const row of (rosterRes.data ?? [])) {
        rosterCounts.set(row.circle_leader_id, (rosterCounts.get(row.circle_leader_id) ?? 0) + 1);
      }
      const map = new Map<number, AttendanceEntry>();
      for (const leader of leaders) {
        map.set(leader.id, { headcount: null, rosterCount: rosterCounts.get(leader.id) ?? null });
      }
      for (const occ of (occRes.data ?? [])) {
        const existing = map.get(occ.leader_id);
        if (existing) map.set(occ.leader_id, { ...existing, headcount: occ.headcount });
      }
      setAttendanceData(map);
    }).catch(err => { if (!cancelled) console.error('Failed to load attendance data:', err); });
    return () => { cancelled = true; };
  }, [visibleWeekSundayISO, leaders]);

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

  /** Returns the effective event summary state for a leader — uses snapshot data when viewing a past week. */
  const getEffectiveLeaderState = useCallback((leaderId: number): EventSummaryState => {
    if (isViewingSnapshot && snapshotMap) {
      return snapshotMap.get(leaderId) ?? 'not_received';
    }
    const leader = leaders.find(l => l.id === leaderId);
    return leader ? getEventSummaryState(leader) : 'not_received';
  }, [isViewingSnapshot, snapshotMap, leaders]);

  /** Aggregate attendance stats for the visible week — counts received leaders, plus unreported circles that have CCB data. */
  const weeklyAttendanceStats = useMemo(() => {
    if (!attendanceData) return null;
    let totalAttended = 0;
    let rosterPctSum = 0;
    let rosterPctCount = 0;
    let receivedWithData = 0;
    let unreportedWithData = 0;
    let totalUnreportedAttended = 0;
    const unreportedLeaders: Array<{ id: number; name: string; headcount: number; rosterCount: number | null }> = [];
    for (const leader of leaders) {
      const state = getEffectiveLeaderState(leader.id);
      const att = attendanceData.get(leader.id);
      if (state === 'received') {
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
    } catch (err: any) {
      console.error('Error pulling from CCB:', err);
      setActionError(err.message || 'Failed to pull from CCB');
      setTimeout(() => setActionError(null), 5000);
    } finally {
      setIsPullingCCB(false);
    }
  }, [visibleWeekSundayISO, leaders, ccbReportMap, snapshotMap]);

  /** Auto-applies CCB states to leaders still marked not_received. Flags conflicts without overwriting. */
  const handleAutoUpdate = useCallback(async () => {
    if (!visibleWeekSundayISO || leaders.length === 0) return;
    const weekEnd = DateTime.fromISO(visibleWeekSundayISO).plus({ days: 6 }).toISODate()!;
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
  }, [visibleWeekSundayISO, leaders, isViewingSnapshot]);

  /** Routes a state-button click to either the live update or the snapshot update depending on the current view mode. */
  const handleEventSummaryButtonClick = useCallback(async (leaderId: number, state: EventSummaryState) => {
    if (isViewingSnapshot) {
      await updateSnapshotEntry(leaderId, state);
    } else {
      await setLeaderEventSummaryState(leaderId, state);
    }
  }, [isViewingSnapshot, updateSnapshotEntry, setLeaderEventSummaryState]);

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

  const handleBulkResetEventSummaries = useCallback(async () => {
    if (!leaders || leaders.length === 0) return;

    const confirmed = window.confirm(
      `Reset event summary status to "No" for all ${leaders.length} visible circle${leaders.length !== 1 ? 's' : ''}?\n\nThis will save an archived snapshot of this week's results before resetting everyone to Not Received.`
    );

    if (!confirmed) return;

    setIsResetting(true);
    setActionError(null);
    setActionSuccess(null);

    try {
      // 1. Compute the current week's Sunday → Saturday date range.
      const now = DateTime.local();
      const daysBack = now.weekday === 7 ? 0 : now.weekday;
      const weekSunday = now.minus({ days: daysBack }).toISODate()!;
      const weekSaturday = now.minus({ days: daysBack }).plus({ days: 6 }).toISODate()!;

      // 2. Archive the current states as a snapshot before resetting.
      const snapshotPayload = leaders.map(l => ({
        circle_leader_id: l.id,
        event_summary_state: (l.event_summary_state ?? 'not_received') as EventSummaryState,
      }));

      const snapshotRes = await fetch('/api/event-summary-snapshots', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          week_start_date: weekSunday,
          week_end_date: weekSaturday,
          snapshots: snapshotPayload,
          captured_by: user?.id,
        }),
      });
      if (!snapshotRes.ok) {
        console.warn('Snapshot save failed (non-fatal):', await snapshotRes.text());
      }

      // 3. Reset all visible leaders to 'not_received'.
      const leaderIds = leaders.map(l => l.id);
      const { error } = await supabase
        .from('circle_leaders')
        .update({ event_summary_state: 'not_received' })
        .in('id', leaderIds);

      if (error) throw error;

      // 4. Refresh local state via the parent's setter.
      if (onSetEventSummaryState) {
        for (const id of leaderIds) {
          await onSetEventSummaryState(id, 'not_received');
        }
      }

      setActionSuccess(`Week archived & ${leaderIds.length} circle${leaderIds.length !== 1 ? 's' : ''} reset to "No"`);
      setTimeout(() => setActionSuccess(null), 5000);
    } catch (error: any) {
      console.error('Error resetting event summaries:', error);
      setActionError(error.message || 'Failed to reset event summaries');
      setTimeout(() => setActionError(null), 5000);
    } finally {
      setIsResetting(false);
    }
  }, [leaders, onSetEventSummaryState, user]);

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
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 p-3 sm:p-4">
      <div className="flex items-center justify-between mb-3">
        <div>
          <h1 className="text-lg sm:text-xl font-semibold text-gray-900 dark:text-white">Calendar</h1>
          <p className="text-xs sm:text-sm text-gray-600 dark:text-gray-400">Circle meetings based on leader schedule (day/time/frequency).</p>
        </div>
        <div className="text-xs text-gray-600 dark:text-gray-400">
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
        <div className="mb-3 p-3 rounded-md bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 text-green-700 dark:text-green-200 text-sm flex items-center gap-2">
          <svg className="h-5 w-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
          {actionSuccess}
        </div>
      )}

      {/* Error Message */}
      {actionError && (
        <div className="mb-3 p-3 rounded-md bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-200 text-sm">
          {actionError}
        </div>
      )}

      {loadError && (
        <div className="mb-3 p-3 rounded-md bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-200 text-sm">
          {loadError}
        </div>
      )}

      {!isLoadingLeaders && !loadError && leadersWithSchedules.length === 0 && (
        <div className="mb-3 p-3 rounded-md bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 text-blue-900 dark:text-blue-100 text-sm">
          No circles have both a meeting day and time set yet.
        </div>
      )}

      {/* Past-week snapshot banner */}
      {isViewingSnapshot && (
        <div className={`mb-3 p-3 rounded-md flex items-start gap-2.5 text-sm ${
          isLoadingSnapshot
            ? 'bg-gray-50 dark:bg-gray-900/20 border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400'
            : snapshotMap !== null && snapshotMap.size > 0
              ? 'bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 text-amber-900 dark:text-amber-200'
              : 'bg-gray-50 dark:bg-gray-900/30 border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400'
        }`}>
          {isLoadingSnapshot ? (
            <>
              <svg className="animate-spin h-4 w-4 mt-0.5 shrink-0" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
              Loading archived results…
            </>
          ) : snapshotMap !== null && snapshotMap.size > 0 ? (
            <>
              <svg className="h-4 w-4 mt-0.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" />
              </svg>
              <div className="flex-1 min-w-0">
                {/* Header row */}
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <span className="text-sm">
                    <strong>Archived week</strong>{' '}
                    {visibleWeekSundayISO ? `(${DateTime.fromISO(visibleWeekSundayISO).toFormat('MMM d')} – ${DateTime.fromISO(visibleWeekSundayISO).plus({ days: 6 }).toFormat('MMM d, yyyy')})` : ''}
                  </span>
                  {(() => {
                    const reportCount = ccbReportMap ? Array.from(ccbReportMap.values()).filter(Boolean).length : 0;
                    return reportCount > 0 ? (
                      <span className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-700 dark:text-amber-300 border border-amber-400/30">
                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        {reportCount} in CCB
                      </span>
                    ) : null;
                  })()}
                </div>

                {/* Scoreboard */}
                {(() => {
                  const counts = { received: 0, did_not_meet: 0, skipped: 0, not_received: 0 };
                  for (const state of Array.from(snapshotMap.values())) {
                    if (state === 'received') counts.received++;
                    else if (state === 'did_not_meet') counts.did_not_meet++;
                    else if (state === 'skipped') counts.skipped++;
                    else counts.not_received++;
                  }
                  return (
                    <div className="mt-2 flex flex-wrap gap-2">
                      <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-green-500/15 border border-green-500/25">
                        <span className="text-lg font-bold text-green-400 leading-none">{counts.received}</span>
                        <span className="text-xs font-medium text-green-300/80">Received</span>
                      </div>
                      <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-500/15 border border-blue-500/25">
                        <span className="text-lg font-bold text-blue-400 leading-none">{counts.did_not_meet}</span>
                        <span className="text-xs font-medium text-blue-300/80">Didn't Meet</span>
                      </div>
                      <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-500/15 border border-amber-500/25">
                        <span className="text-lg font-bold text-amber-400 leading-none">{counts.skipped}</span>
                        <span className="text-xs font-medium text-amber-300/80">Skipped</span>
                      </div>
                      {counts.not_received > 0 && (
                        <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-500/15 border border-red-500/30">
                          <span className="text-lg font-bold text-red-400 leading-none">{counts.not_received}</span>
                          <span className="text-xs font-medium text-red-300/80">Not Reported</span>
                        </div>
                      )}
                    </div>
                  );
                })()}

                {/* Attendance stats */}
                {weeklyAttendanceStats && (
                  <div className="mt-2 text-xs opacity-70 flex flex-wrap gap-x-3 gap-y-0.5">
                    <span>{weeklyAttendanceStats.receivedWithData} circle{weeklyAttendanceStats.receivedWithData !== 1 ? 's' : ''} reported · <strong>{weeklyAttendanceStats.totalAttended}</strong> total attended</span>
                    {weeklyAttendanceStats.avgRosterPct !== null && (
                      <span>avg <strong>{weeklyAttendanceStats.avgRosterPct}%</strong> of roster</span>
                    )}
                  </div>
                )}

                {/* Action buttons row */}
                <div className="mt-2 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={handlePullFromCCB}
                    disabled={isPullingCCB || isAutoUpdating}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-700 hover:bg-slate-600 disabled:opacity-60 disabled:cursor-not-allowed text-white transition-colors"
                  >
                    {isPullingCCB ? (
                      <><svg className="animate-spin w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" /></svg>Pulling…</>
                    ) : (
                      <><svg className="w-3.5 h-3.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>Pull from CCB</>
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={handleAutoUpdate}
                    disabled={isPullingCCB || isAutoUpdating}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-indigo-600/80 hover:bg-indigo-600 disabled:opacity-60 disabled:cursor-not-allowed text-white transition-colors"
                  >
                    {isAutoUpdating ? (
                      <><svg className="animate-spin w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" /></svg>Updating…</>
                    ) : (
                      <><svg className="w-3.5 h-3.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>Auto-update from CCB</>
                    )}
                  </button>
                </div>

                {/* Conflict list */}
                {autoUpdateConflicts && autoUpdateConflicts.length > 0 && (
                  <div className="mt-3 rounded-lg border border-orange-500/30 bg-orange-500/10 p-3">
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
                )}
              </div>
            </>
          ) : (
            <div className="flex-1 min-w-0">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                <div className="flex items-center gap-2">
                  <svg className="h-4 w-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <span>No snapshot for this week. Pull from CCB to check who submitted a report.</span>
                </div>
                <button
                  type="button"
                  onClick={handlePullFromCCB}
                  disabled={isPullingCCB}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-700 hover:bg-slate-600 disabled:opacity-60 disabled:cursor-not-allowed text-white transition-colors shrink-0"
                >
                  {isPullingCCB ? (
                    <>
                      <svg className="animate-spin w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                      </svg>
                      Pulling from CCB…
                    </>
                  ) : (
                    <>
                      <svg className="w-3.5 h-3.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.8}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                      </svg>
                      Pull from CCB
                    </>
                  )}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Current-week attendance summary (shown when data is available) */}
      {!isViewingSnapshot && weeklyAttendanceStats && (
        <div className="mb-3 rounded-md bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 text-green-900 dark:text-green-200 text-xs overflow-hidden">
          <div className="px-3 py-2 flex flex-wrap gap-x-3 gap-y-0.5 items-center">
            <span className="font-semibold">{weeklyAttendanceStats.receivedWithData} circle{weeklyAttendanceStats.receivedWithData !== 1 ? 's' : ''} reported</span>
            <span>· <strong>{weeklyAttendanceStats.totalAttended}</strong> total attended</span>
            {weeklyAttendanceStats.avgRosterPct !== null && (
              <span>· avg <strong>{weeklyAttendanceStats.avgRosterPct}%</strong> of roster</span>
            )}
            {weeklyAttendanceStats.unreportedWithData > 0 && (
              <span className="opacity-60">· +{weeklyAttendanceStats.totalUnreportedAttended} from {weeklyAttendanceStats.unreportedWithData} unreported</span>
            )}
            <button
              type="button"
              onClick={handleAutoUpdate}
              disabled={isAutoUpdating}
              className="ml-auto inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-semibold bg-green-700/40 hover:bg-green-700/60 disabled:opacity-60 disabled:cursor-not-allowed text-green-100 transition-colors border border-green-600/30"
            >
              {isAutoUpdating ? (
                <><svg className="animate-spin w-3 h-3 shrink-0" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" /></svg>Updating…</>
              ) : (
                <><svg className="w-3 h-3 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>Auto-update from CCB</>
              )}
            </button>
          </div>
          {weeklyAttendanceStats.unreportedLeaders.length > 0 && (
            <div className="border-t border-green-200 dark:border-green-800 px-3 py-1.5 flex flex-wrap gap-x-4 gap-y-0.5 opacity-70">
              <span className="font-medium text-green-700 dark:text-green-400 mr-1">Not reported:</span>
              {weeklyAttendanceStats.unreportedLeaders.map(l => (
                <span key={l.id}>
                  {l.name} — {l.headcount} attended{l.rosterCount && l.rosterCount > 0 ? ` · ${Math.round((l.headcount / l.rosterCount) * 100)}% of roster` : ''}
                </span>
              ))}
            </div>
          )}
          {/* Conflict list for current week */}
          {autoUpdateConflicts && autoUpdateConflicts.length > 0 && !isViewingSnapshot && (
            <div className="border-t border-green-200 dark:border-green-800 px-3 py-2">
              <div className="flex items-center justify-between mb-1.5">
                <span className="font-semibold text-orange-600 dark:text-orange-300 flex items-center gap-1">
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
                  {autoUpdateConflicts.length} conflict{autoUpdateConflicts.length !== 1 ? 's' : ''} — not overwritten
                </span>
                <button type="button" onClick={() => setAutoUpdateConflicts(null)} className="text-orange-400 hover:text-orange-600 dark:hover:text-orange-200 transition-colors">
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
              </div>
              <div className="space-y-0.5">
                {autoUpdateConflicts.map(c => {
                  const stateLabel: Record<EventSummaryState, string> = { not_received: 'Not Reported', received: 'Received', did_not_meet: "Didn't Meet", skipped: 'Skipped' };
                  return (
                    <div key={c.leader_id} className="flex flex-wrap items-center gap-1 text-orange-700 dark:text-orange-200">
                      <span className="font-medium">{c.leader_name}</span>
                      <span className="opacity-50">—</span>
                      <span>marked <strong>{stateLabel[c.current_state]}</strong></span>
                      <span className="opacity-50">·</span>
                      <span>CCB says <strong>{stateLabel[c.ccb_state]}</strong></span>
                    </div>
                  );
                })}
              </div>
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
                      <div className="text-[12px] sm:text-[13px] text-gray-400 mt-0.5 leading-snug">
                        {arg.event.start ? DateTime.fromJSDate(arg.event.start).toLocaleString(DateTime.TIME_SIMPLE) : ''}
                        {arg.event.extendedProps?.frequency && (
                          <span className="ml-1 text-gray-500">· {arg.event.extendedProps.frequency}</span>
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
                            <button type="button" disabled className="h-9 px-3 rounded-lg text-xs font-semibold bg-gray-800/50 text-gray-600 cursor-not-allowed opacity-50 inline-flex items-center gap-1.5">
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
                          <div className="text-[11px] font-bold text-gray-400 uppercase tracking-widest mb-1.5">Event Summary</div>
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
                                      : 'bg-white/10 border border-white/15 text-gray-400'
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
                              className="h-11 rounded-lg text-[13px] font-semibold bg-gray-800/50 text-gray-600 cursor-not-allowed flex items-center justify-center gap-1.5">
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
      <div className="mt-4 border-t border-gray-200 dark:border-gray-700 pt-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-gray-900 dark:text-white">Events for {selectedDateLabel || selectedISODate}</h2>
            <p className="text-xs text-gray-600 dark:text-gray-400">Click a day on the calendar to change the list.</p>
          </div>
          <div className="text-xs text-gray-600 dark:text-gray-400">{selectedDayEvents.length} item{selectedDayEvents.length === 1 ? '' : 's'}</div>
        </div>

        {selectedDayEvents.length === 0 ? (
          <div className="mt-3 text-sm text-gray-600 dark:text-gray-400">No events for this day.</div>
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
                    `flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 rounded-md border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 border-l-4 ${stateBorderClass}`
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
                          className="text-base font-bold text-gray-900 dark:text-white hover:text-blue-600 dark:hover:text-blue-400 transition-colors text-left group"
                          title="Open circle leader profile"
                        >
                          <span className="group-hover:underline">{ev.title}</span>
                        </button>
                      ) : (
                        <div className="text-base font-bold text-gray-900 dark:text-white">{ev.title}</div>
                      )}
                    </div>
                    
                    {/* Row 2: Time of Meeting */}
                    <div className="text-xs text-gray-500 dark:text-gray-400">{timeLabel}</div>
                    
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
                            className="h-9 col-span-1 rounded text-xs font-semibold leading-none border border-gray-200 dark:border-gray-700 text-gray-900 dark:text-gray-100 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors inline-flex items-center justify-center"
                            title="Open attendance summary"
                          >
                            Summary
                          </button>
                        ) : (
                          <button
                            type="button"
                            disabled
                            className="h-9 col-span-1 rounded text-xs font-semibold leading-none border border-gray-300 dark:border-gray-600 text-gray-400 dark:text-gray-500 cursor-not-allowed opacity-50"
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
                            className="h-9 col-span-2 rounded text-xs font-semibold leading-none border border-blue-200 dark:border-blue-800 text-blue-700 dark:text-blue-200 hover:bg-blue-50 dark:hover:bg-blue-900/30 transition-colors inline-flex items-center justify-center"
                            title="Open CCB profile"
                          >
                            CCB
                          </a>
                        ) : (
                          <button
                            type="button"
                            disabled
                            className="h-9 col-span-2 rounded text-xs font-semibold leading-none border border-gray-300 dark:border-gray-600 text-gray-400 dark:text-gray-500 cursor-not-allowed opacity-50"
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
                          className="block text-sm font-semibold text-gray-900 dark:text-white hover:text-blue-600 dark:hover:text-blue-400 transition-colors truncate text-left group"
                          title="Open circle leader profile"
                        >
                          <span className="group-hover:underline">{ev.title}</span>
                        </button>
                      ) : (
                        <div className="block text-sm font-semibold text-gray-900 dark:text-white truncate">{ev.title}</div>
                      )}
                      <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
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
                          className="h-8 px-3 text-xs font-medium rounded-md border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
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
                          className="h-8 px-3 text-xs font-medium rounded-md border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
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
                          className="h-8 px-3 text-xs font-medium rounded-md border border-blue-300 dark:border-blue-700 text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/30 transition-colors inline-flex items-center"
                          title="Open CCB profile"
                        >
                          CCB
                        </a>
                      ) : (
                        <button
                          type="button"
                          disabled
                          className="h-8 px-3 text-xs font-medium rounded-md border border-gray-200 dark:border-gray-700 text-gray-400 dark:text-gray-600 cursor-not-allowed opacity-50"
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

      {/* Missing Schedule Info */}
      {!isLoadingLeaders && leadersWithoutSchedules.length > 0 && (
        <div className="mt-4 border-t border-gray-200 dark:border-gray-700 pt-4">
          <button
            type="button"
            onClick={() => setShowMissingSchedules(prev => !prev)}
            className="flex items-center gap-2 w-full text-left group"
          >
            <svg
              className={`w-4 h-4 text-gray-500 shrink-0 transition-transform duration-200 ${showMissingSchedules ? 'rotate-180' : ''}`}
              fill="none" stroke="currentColor" viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
            <span className="text-sm font-semibold text-gray-900 dark:text-white">
              Missing Schedule Info
            </span>
            <span className="text-xs font-medium text-amber-600 dark:text-amber-400 bg-amber-100 dark:bg-amber-900/30 px-2 py-0.5 rounded-full">
              {leadersWithoutSchedules.length}
            </span>
          </button>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 ml-6">
            These circles are missing a meeting day or time and won&apos;t appear on the calendar.
          </p>

          {showMissingSchedules && (
            <div className="mt-3 ml-6 space-y-1.5 max-h-96 overflow-y-auto">
              {leadersWithoutSchedules.map(leader => (
                <div
                  key={leader.id}
                  className="flex items-center justify-between gap-3 rounded-md border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 border-l-4 border-l-amber-400 dark:border-l-amber-500"
                >
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-semibold text-gray-900 dark:text-white truncate">
                      {leader.name}
                      {leader.circle_type && (
                        <span className="ml-1.5 text-xs font-normal text-gray-500 dark:text-gray-400">({leader.circle_type})</span>
                      )}
                    </div>
                    <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
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
                    className="h-8 px-3 text-xs font-medium rounded-md border border-blue-300 dark:border-blue-700 text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/30 transition-colors shrink-0"
                  >
                    Edit
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Action Buttons - Bottom of page */}
      {!isLoadingLeaders && leadersWithSchedules.length > 0 && (
        <div className="mt-6 flex flex-wrap gap-2 border-t border-gray-200 dark:border-gray-700 pt-4">
          <button
            onClick={handleBulkResetEventSummaries}
            disabled={isResetting}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-orange-600 hover:bg-orange-700 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isResetting ? (
              <>
                <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                Resetting...
              </>
            ) : (
              <>
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                Reset All Event Summaries to No
              </>
            )}
          </button>
        </div>
      )}
    </div>
  );
}
