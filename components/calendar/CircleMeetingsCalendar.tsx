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
import type { CircleLeader } from '../../lib/supabase';

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
    eventSummaryState?: 'received' | 'not_received' | 'skipped';
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
  const eventSummaryState: 'received' | 'not_received' | 'skipped' =
    leader.event_summary_skipped === true
      ? 'skipped'
      : leader.event_summary_received === true
        ? 'received'
        : 'not_received';

  // FullCalendar supports per-event colors; using that avoids needing extra CSS overrides.
  const backgroundColor = eventSummaryState === 'received'
    ? '#16a34a'
    : eventSummaryState === 'skipped'
      ? '#f59e0b'
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
  onSetEventSummaryState?: (leaderId: number, state: 'received' | 'not_received' | 'skipped') => Promise<void> | void;
};

export default function CircleMeetingsCalendar({
  leaders,
  isLoading: isLoadingLeaders = false,
  loadError = null,
  onSetEventSummaryState,
}: CircleMeetingsCalendarProps) {
  const router = useRouter();
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [visibleRange, setVisibleRange] = useState<{ start: Date; end: Date } | null>(null);
  const [isMobile, setIsMobile] = useState(false);
  const [savingLeaderIds, setSavingLeaderIds] = useState<Set<number>>(new Set());
  const [selectedISODate, setSelectedISODate] = useState(() => DateTime.local().toISODate() ?? '');
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
  }, [leadersWithSchedules, visibleRange]);

  const onEventClick = useCallback((click: EventClickArg) => {
    const leaderId = (click.event.extendedProps as any)?.leaderId as number | undefined;
    if (!leaderId) return;
    router.push(`/circle/${leaderId}`);
  }, [router]);

  const setLeaderEventSummaryState = useCallback(async (leaderId: number, state: 'received' | 'not_received' | 'skipped') => {
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

  const renderEventSummaryButtons = useCallback((leaderId: number, state: 'received' | 'not_received' | 'skipped') => {
    const isSaving = savingLeaderIds.has(leaderId);

    const base =
      'h-10 sm:h-8 px-2 sm:px-2 rounded text-[11px] sm:text-xs leading-none border transition-colors disabled:opacity-60 disabled:cursor-not-allowed touch-manipulation select-none flex items-center justify-center min-w-0';

    const btn = (kind: 'not_received' | 'received' | 'skipped') => {
      const active = state === kind;

      if (kind === 'received') {
        return active
          ? `${base} bg-green-600 border-green-700 text-white`
          : `${base} bg-white dark:bg-gray-800 border-green-300 dark:border-green-700 text-green-700 dark:text-green-200 hover:bg-green-50 dark:hover:bg-green-900/30`;
      }
      if (kind === 'skipped') {
        return active
          ? `${base} bg-amber-500 border-amber-600 text-white`
          : `${base} bg-white dark:bg-gray-800 border-amber-300 dark:border-amber-700 text-amber-700 dark:text-amber-200 hover:bg-amber-50 dark:hover:bg-amber-900/30`;
      }
      // not_received
      return active
        ? `${base} bg-red-600 border-red-700 text-white`
        : `${base} bg-white dark:bg-gray-800 border-red-300 dark:border-red-700 text-red-700 dark:text-red-200 hover:bg-red-50 dark:hover:bg-red-900/30`;
    };

    const onClick = (next: 'not_received' | 'received' | 'skipped') => (e: MouseEvent<HTMLButtonElement>) => {
      // Prevent FullCalendar's eventClick navigation.
      e.preventDefault();
      e.stopPropagation();
      void setLeaderEventSummaryState(leaderId, next);
    };

    return (
      <div
        className="grid grid-cols-3 gap-1 w-full sm:flex sm:w-auto sm:items-center sm:gap-1 shrink-0"
        role="group"
        aria-label="Event summary"
      >
        <button type="button" disabled={isSaving} className={btn('not_received')} onClick={onClick('not_received')}>
          No
        </button>
        <button type="button" disabled={isSaving} className={btn('received')} onClick={onClick('received')}>
          Yes
        </button>
        <button type="button" disabled={isSaving} className={btn('skipped')} onClick={onClick('skipped')}>
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
                const calendarApi = document.querySelector('.calendar-shell .fc')?.['__fc_calendar_api__'] || 
                  (window as any).fullCalendarApi;
                if (calendarApi) calendarApi.changeView('timeGridDay');
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
                const calendarApi = document.querySelector('.calendar-shell .fc')?.['__fc_calendar_api__'] || 
                  (window as any).fullCalendarApi;
                if (calendarApi) calendarApi.changeView('timeGridWeek');
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
                const calendarApi = document.querySelector('.calendar-shell .fc')?.['__fc_calendar_api__'] || 
                  (window as any).fullCalendarApi;
                if (calendarApi) calendarApi.changeView('dayGridMonth');
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
                const calendarApi = document.querySelector('.calendar-shell .fc')?.['__fc_calendar_api__'] || 
                  (window as any).fullCalendarApi;
                if (calendarApi) calendarApi.changeView('listWeek');
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
              eventSummaryState?: 'received' | 'not_received' | 'skipped';
            };
            const leaderId = ext.leaderId;
            const state = ext.eventSummaryState ?? 'not_received';

            if (!isList || !leaderId || !onSetEventSummaryState) {
              return <div className="truncate">{arg.event.title}</div>;
            }

            return (
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 w-full">
                <div className="min-w-0 text-sm leading-snug break-words sm:truncate">{arg.event.title}</div>
                {renderEventSummaryButtons(leaderId, state)}
              </div>
            );
          }}
          datesSet={onDatesSet}
          dayMaxEvents={3}
          eventDisplay="block"
          stickyHeaderDates
          ref={(ref) => {
            if (ref && isMobile) {
              (window as any).fullCalendarApi = ref.getApi();
            }
          }}
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
              const eventSummaryState = ev.extendedProps?.eventSummaryState ?? 'not_received';
              const timeLabel = DateTime.fromISO(ev.start).toLocaleString(DateTime.TIME_SIMPLE);
              const ccbHref = ccb && /^https?:\/\//i.test(ccb) ? ccb : null;

              const stateBorderClass =
                eventSummaryState === 'received'
                  ? 'border-l-green-500'
                  : eventSummaryState === 'skipped'
                    ? 'border-l-amber-500'
                    : 'border-l-red-500';

              const stateBadgeClass =
                eventSummaryState === 'received'
                  ? 'bg-green-600'
                  : eventSummaryState === 'skipped'
                    ? 'bg-amber-600'
                    : 'bg-red-600';

              const stateLabel =
                eventSummaryState === 'received'
                  ? 'Summary received'
                  : eventSummaryState === 'skipped'
                    ? 'Did not meet'
                    : 'Summary not received';

              return (
                <div
                  key={ev.id}
                  className={
                    `flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 rounded-md border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 border-l-4 ${stateBorderClass}`
                  }
                >
                  <div className="min-w-0">
                    <div className="text-xs text-gray-500 dark:text-gray-400">{timeLabel}</div>
                    {ccbHref ? (
                      <a
                        href={ccbHref}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="block text-sm font-medium text-blue-700 dark:text-blue-300 hover:underline break-words sm:truncate"
                        title="Open CCB profile"
                      >
                        {ev.title}
                      </a>
                    ) : (
                      <div className="block text-sm font-medium text-gray-900 dark:text-white break-words sm:truncate">{ev.title}</div>
                    )}
                    {ev.extendedProps?.frequency && (
                      <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                        {ev.extendedProps.frequency}
                      </div>
                    )}
                  </div>

                  <div className="w-full sm:w-auto flex flex-col sm:flex-row items-stretch sm:items-center gap-2 shrink-0">
                    {leaderId && onSetEventSummaryState && (
                      <div className="order-2 sm:order-1">
                        {renderEventSummaryButtons(leaderId, eventSummaryState)}
                      </div>
                    )}

                    <span
                      className={`order-1 sm:order-2 text-[11px] px-2 py-1 rounded text-white ${stateBadgeClass} self-start sm:self-auto`}
                      title={stateLabel}
                    >
                      {stateLabel}
                    </span>
                    {ccbHref && (
                      <a
                        href={ccbHref}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs px-2 py-2 sm:py-1 rounded border border-blue-200 dark:border-blue-800 text-blue-700 dark:text-blue-200 hover:bg-blue-50 dark:hover:bg-blue-900/30"
                      >
                        CCB
                      </a>
                    )}
                    {leaderId && (
                      <button
                        type="button"
                        onClick={() => router.push(`/circle/${leaderId}`)}
                        className="text-xs px-2 py-2 sm:py-1 rounded border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700"
                        title="Open circle leader page"
                      >
                        Open
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
      )}
    </div>
  );
}
