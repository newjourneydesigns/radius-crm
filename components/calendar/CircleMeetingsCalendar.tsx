'use client';

import dynamic from 'next/dynamic';
import { useCallback, useEffect, useMemo, useState, type MouseEvent } from 'react';
import { useRouter } from 'next/navigation';
import type { DatesSetArg, EventClickArg, EventContentArg } from '@fullcalendar/core';
import dayGridPlugin from '@fullcalendar/daygrid';
import timeGridPlugin from '@fullcalendar/timegrid';
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

const CALENDAR_VIEW_STORAGE_KEY = 'radius.calendar.view';
const DEFAULT_CALENDAR_VIEW = 'dayGridMonth';

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
  const [initialView] = useState(() => {
    if (typeof window === 'undefined') return DEFAULT_CALENDAR_VIEW;
    try {
      return window.localStorage.getItem(CALENDAR_VIEW_STORAGE_KEY) || DEFAULT_CALENDAR_VIEW;
    } catch {
      return DEFAULT_CALENDAR_VIEW;
    }
  });
  const [currentViewType, setCurrentViewType] = useState<string>(() => {
    if (typeof window === 'undefined') return DEFAULT_CALENDAR_VIEW;
    try {
      return window.localStorage.getItem(CALENDAR_VIEW_STORAGE_KEY) || DEFAULT_CALENDAR_VIEW;
    } catch {
      return DEFAULT_CALENDAR_VIEW;
    }
  });

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
    return leaders.filter(l => (l.day ?? '').trim() !== '' && (l.time ?? '').trim() !== '');
  }, [leaders]);

  const onDatesSet = useCallback((arg: DatesSetArg) => {
    setVisibleRange({ start: arg.start, end: arg.end });
    setCurrentViewType(arg.view.type);
    if (typeof window !== 'undefined') {
      try {
        window.localStorage.setItem(CALENDAR_VIEW_STORAGE_KEY, arg.view.type);
      } catch {
        // ignore
      }
    }
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
      `Reset event summary status to "No" for all ${leaders.length} visible circle${leaders.length !== 1 ? 's' : ''}?\n\nThis will update all circles currently shown in the calendar.`
    );
    
    if (!confirmed) return;

    setIsResetting(true);
    setActionError(null);
    setActionSuccess(null);

    try {
      const leaderIds = leaders.map(l => l.id);
      
      // Update all visible leaders to 'not_received'
      const { error } = await supabase
        .from('circle_leaders')
        .update({ event_summary_state: 'not_received' })
        .in('id', leaderIds);

      if (error) throw error;

      // Refresh the data by calling the parent's method
      if (onSetEventSummaryState) {
        for (const id of leaderIds) {
          await onSetEventSummaryState(id, 'not_received');
        }
      }

      setActionSuccess(`Successfully reset ${leaderIds.length} circle${leaderIds.length !== 1 ? 's' : ''} to "No"`);
      setTimeout(() => setActionSuccess(null), 5000);
    } catch (error: any) {
      console.error('Error resetting event summaries:', error);
      setActionError(error.message || 'Failed to reset event summaries');
      setTimeout(() => setActionError(null), 5000);
    } finally {
      setIsResetting(false);
    }
  }, [leaders, onSetEventSummaryState]);

  const renderEventSummaryButtons = useCallback((
    leaderId: number,
    state: EventSummaryState,
    opts?: { compact?: boolean }
  ) => {
    const isSaving = savingLeaderIds.has(leaderId);

    const base =
      'h-10 sm:h-8 px-3 sm:px-3 rounded-lg sm:rounded-md text-sm sm:text-xs font-semibold leading-tight border-2 sm:border transition-all disabled:opacity-60 disabled:cursor-not-allowed touch-manipulation select-none flex items-center justify-center min-w-0 text-center whitespace-normal active:scale-95 sm:active:scale-100';

    const btn = (kind: EventSummaryState) => {
      const active = state === kind;
      const colors = getEventSummaryColors(kind);
      return active
        ? `${base} ${colors.bg} ${colors.border} text-white font-bold shadow-md ring-2 ${colors.ring}`
        : `${base} bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600 text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700 font-medium`;
    };

    const onClick = (next: EventSummaryState) => (e: MouseEvent<HTMLButtonElement>) => {
      // Prevent FullCalendar's eventClick navigation.
      e.preventDefault();
      e.stopPropagation();
      void setLeaderEventSummaryState(leaderId, next);
    };

    return (
      <div
        className={`grid grid-cols-2 gap-2 w-full sm:flex sm:items-center sm:gap-1.5 ${opts?.compact ? 'sm:w-auto' : 'sm:w-full'} shrink-0`}
        role="group"
        aria-label="Event summary"
      >
        <button type="button" disabled={isSaving} className={btn('not_received')} onClick={onClick('not_received')} title="Not Received">
          No
        </button>
        <button type="button" disabled={isSaving} className={btn('received')} onClick={onClick('received')} title="Received">
          Yes
        </button>
        <button type="button" disabled={isSaving} className={btn('did_not_meet')} onClick={onClick('did_not_meet')} title="Did Not Meet">
          {opts?.compact ? "Didn't" : "Didn't Meet"}
        </button>
        <button type="button" disabled={isSaving} className={btn('skipped')} onClick={onClick('skipped')} title="Skipped">
          Skip
        </button>
      </div>
    );
  }, [savingLeaderIds, setLeaderEventSummaryState]);

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
          {isLoadingLeaders ? 'Loading schedules…' : `${leadersWithSchedules.length} scheduled circles`}
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

      <div className="calendar-shell">
        {/* Mobile View Toggle Buttons - Moved to top for better UX */}
        {isMobile && (
          <div className="mb-4 flex items-center justify-center gap-2 p-2 bg-gray-50 dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700">
            <button
              onClick={() => {
                const calendarEl = document.querySelector('.calendar-shell .fc');
                if (calendarEl && (calendarEl as any).fcApi) {
                  (calendarEl as any).fcApi.changeView('timeGridDay');
                }
              }}
              className={`flex-1 px-4 py-2.5 text-sm font-medium rounded-lg transition-colors ${
                currentViewType === 'timeGridDay'
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200 border border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700'
              }`}
            >
              Day
            </button>
            <button
              onClick={() => {
                const calendarEl = document.querySelector('.calendar-shell .fc');
                if (calendarEl && (calendarEl as any).fcApi) {
                  (calendarEl as any).fcApi.changeView('timeGridWeek');
                }
              }}
              className={`flex-1 px-4 py-2.5 text-sm font-medium rounded-lg transition-colors ${
                currentViewType === 'timeGridWeek'
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200 border border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700'
              }`}
            >
              Week
            </button>
            <button
              onClick={() => {
                const calendarEl = document.querySelector('.calendar-shell .fc');
                if (calendarEl && (calendarEl as any).fcApi) {
                  (calendarEl as any).fcApi.changeView('dayGridMonth');
                }
              }}
              className={`flex-1 px-4 py-2.5 text-sm font-medium rounded-lg transition-colors ${
                currentViewType === 'dayGridMonth'
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200 border border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700'
              }`}
            >
              Month
            </button>
            <button
              onClick={() => {
                const calendarEl = document.querySelector('.calendar-shell .fc');
                if (calendarEl && (calendarEl as any).fcApi) {
                  (calendarEl as any).fcApi.changeView('listWeek');
                }
              }}
              className={`flex-1 px-4 py-2.5 text-sm font-medium rounded-lg transition-colors ${
                currentViewType === 'listWeek'
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200 border border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700'
              }`}
            >
              List
            </button>
          </div>
        )}
        
        <FullCalendar
          plugins={[dayGridPlugin, timeGridPlugin, listPlugin, interactionPlugin]}
          initialView={initialView}
          headerToolbar={
            isMobile
              ? { left: 'prev,next', center: 'title', right: 'today' }
              : { left: 'prev,next today', center: 'title', right: 'timeGridDay,timeGridWeek,dayGridMonth,listWeek' }
          }
          footerToolbar={undefined}
          buttonText={{
            timeGridDay: 'Day',
            timeGridWeek: 'Week',
            dayGridMonth: 'Month',
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
            const state = ext.eventSummaryState ?? 'not_received';

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

            const toggleExpanded = (e: MouseEvent<HTMLDivElement>) => {
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
                  {/* Collapsed View - Click to Expand */}
                  <div 
                    className="flex items-center justify-between gap-3 py-1 cursor-pointer active:opacity-70 transition-opacity"
                    onClick={toggleExpanded}
                  >
                    <div className="flex-1 min-w-0 space-y-1">
                      {/* Circle Leader Name */}
                      <div className="text-[15px] font-semibold text-gray-900 dark:text-white leading-tight truncate">
                        {arg.event.title}
                      </div>
                      
                      {/* Time and Frequency */}
                      <div className="text-[13px] text-gray-600 dark:text-gray-400 font-medium">
                        {arg.event.start ? DateTime.fromJSDate(arg.event.start).toLocaleString(DateTime.TIME_SIMPLE) : ''}
                        {arg.event.extendedProps?.frequency && (
                          <span className="ml-1.5 text-gray-500 dark:text-gray-500">• {arg.event.extendedProps.frequency}</span>
                        )}
                      </div>
                    </div>
                    
                    {/* Expand/Collapse Icon */}
                    <div className="flex-shrink-0">
                      <svg 
                        className={`w-5 h-5 text-gray-400 transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`}
                        fill="none" 
                        stroke="currentColor" 
                        viewBox="0 0 24 24"
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    </div>
                  </div>
                  
                  {/* Expanded View - Actions */}
                  {isExpanded && (
                    <div className="pt-3 pb-1 border-t border-gray-100 dark:border-gray-700/50 mt-2">
                      {/* Desktop: justify-between — status left, actions right. Mobile: stacked */}
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
                            className="h-8 px-3 rounded-md text-xs font-medium border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors inline-flex items-center"
                          >
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
                            className="h-8 w-8 rounded-md border border-blue-300 dark:border-blue-700 text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/30 transition-colors inline-flex items-center justify-center"
                            title="Send reminder"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
                            </svg>
                          </button>

                          {/* Profile */}
                          <button
                            type="button"
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              router.push(`/circle/${leaderId}`);
                            }}
                            className="h-8 px-3 rounded-md text-xs font-medium border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors inline-flex items-center"
                          >
                            Profile
                          </button>

                          {/* CCB */}
                          {ccbHref ? (
                            <a
                              href={ccbHref}
                              target="_blank"
                              rel="noopener noreferrer"
                              onClick={(e) => e.stopPropagation()}
                              className="h-8 px-3 rounded-md text-xs font-medium border border-blue-300 dark:border-blue-700 text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/30 transition-colors inline-flex items-center"
                            >
                              CCB
                            </a>
                          ) : (
                            <button type="button" disabled className="h-8 px-3 rounded-md text-xs font-medium border border-gray-200 dark:border-gray-700 text-gray-400 cursor-not-allowed opacity-50 inline-flex items-center">
                              CCB
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Mobile: stacked */}
                      <div className="flex flex-col gap-3 sm:hidden">
                        {/* Status buttons — primary action, shown first */}
                        <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">Event Summary Received</p>
                        {renderEventSummaryButtons(leaderId, state, { compact: true })}

                        {/* Action buttons — 2×2 grid */}
                        <div className="grid grid-cols-2 gap-2">
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
                            className="h-11 rounded-lg text-sm font-semibold bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 text-gray-800 dark:text-gray-100 hover:bg-gray-50 dark:hover:bg-gray-700 active:scale-95 transition-all inline-flex items-center justify-center"
                          >
                            Summary
                          </button>

                          {/* Profile */}
                          <button
                            type="button"
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              router.push(`/circle/${leaderId}`);
                            }}
                            className="h-11 rounded-lg text-sm font-semibold bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 text-gray-800 dark:text-gray-100 hover:bg-gray-50 dark:hover:bg-gray-700 active:scale-95 transition-all inline-flex items-center justify-center"
                          >
                            Profile
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
                            className="h-11 rounded-lg text-sm font-semibold bg-white dark:bg-gray-800 border border-blue-300 dark:border-blue-700 text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/30 active:scale-95 transition-all inline-flex items-center justify-center gap-2"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
                            </svg>
                            Reminder
                          </button>

                          {/* CCB Profile */}
                          {ccbHref ? (
                            <a
                              href={ccbHref}
                              target="_blank"
                              rel="noopener noreferrer"
                              onClick={(e) => e.stopPropagation()}
                              className="h-11 rounded-lg text-sm font-semibold bg-white dark:bg-gray-800 border border-blue-300 dark:border-blue-700 text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/30 active:scale-95 transition-all inline-flex items-center justify-center"
                            >
                              CCB Profile
                            </a>
                          ) : (
                            <button type="button" disabled className="h-11 rounded-lg text-sm font-semibold bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-400 dark:text-gray-600 inline-flex items-center justify-center cursor-not-allowed opacity-60">
                              CCB Profile
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
              const eventSummaryState = (ev.extendedProps?.eventSummaryState ?? 'not_received') as EventSummaryState;
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
