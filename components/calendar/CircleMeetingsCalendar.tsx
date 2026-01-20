'use client';

import dynamic from 'next/dynamic';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { DatesSetArg, EventClickArg } from '@fullcalendar/core';
import dayGridPlugin from '@fullcalendar/daygrid';
import timeGridPlugin from '@fullcalendar/timegrid';
import interactionPlugin from '@fullcalendar/interaction';
import type { DateClickArg } from '@fullcalendar/interaction';
import { DateTime } from 'luxon';
import type { CircleLeader } from '../../lib/supabase';

const FullCalendar = dynamic(() => import('@fullcalendar/react'), { ssr: false });

type CalendarEvent = {
  id: string;
  title: string;
  start: string;
  end?: string;
  allDay?: boolean;
  extendedProps?: {
    leaderId: number;
    ccbProfileLink?: string | null;
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

  const intervalWeeks = parseWeekInterval(leader.frequency);

  const start = DateTime.fromJSDate(rangeStart).startOf('day');
  const end = DateTime.fromJSDate(rangeEnd);

  const dayOffset = (weekday - start.weekday + 7) % 7;
  let cursor = start.plus({ days: dayOffset }).set({ hour: time.hour, minute: time.minute, second: 0, millisecond: 0 });

  // If the first occurrence lands before the visible start instant (e.g. timeGrid)
  const visibleStart = DateTime.fromJSDate(rangeStart);
  if (cursor < visibleStart) {
    cursor = cursor.plus({ weeks: intervalWeeks });
  }

  const title = leader.circle_type ? `${leader.name} (${leader.circle_type})` : leader.name;

  const out: CalendarEvent[] = [];
  while (cursor < end) {
    const eventStart = cursor;
    const eventEnd = cursor.plus({ minutes: durationMinutes });

    out.push({
      id: `${leader.id}-${eventStart.toISODate()}`,
      title,
      start: eventStart.toISO() ?? eventStart.toJSDate().toISOString(),
      end: eventEnd.toISO() ?? eventEnd.toJSDate().toISOString(),
      allDay: false,
      extendedProps: { leaderId: leader.id, ccbProfileLink: leader.ccb_profile_link ?? null },
    });

    cursor = cursor.plus({ weeks: intervalWeeks });
  }

  return out;
};

type CircleMeetingsCalendarProps = {
  leaders: CircleLeader[];
  isLoading?: boolean;
  loadError?: string | null;
};

export default function CircleMeetingsCalendar({
  leaders,
  isLoading: isLoadingLeaders = false,
  loadError = null,
}: CircleMeetingsCalendarProps) {
  const router = useRouter();
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [visibleRange, setVisibleRange] = useState<{ start: Date; end: Date } | null>(null);
  const [isMobile, setIsMobile] = useState(false);
  const [selectedISODate, setSelectedISODate] = useState(() => DateTime.local().toISODate() ?? '');

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
        <FullCalendar
          plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin]}
          initialView="dayGridMonth"
          headerToolbar={
            isMobile
              ? { left: 'prev,next', center: 'title', right: 'today' }
              : { left: 'prev,next today', center: 'title', right: 'timeGridDay,timeGridWeek,dayGridMonth' }
          }
          footerToolbar={
            isMobile
              ? { left: 'timeGridDay,timeGridWeek,dayGridMonth', center: '', right: '' }
              : undefined
          }
          buttonText={{
            timeGridDay: 'Day',
            timeGridWeek: 'Week',
            dayGridMonth: 'Month',
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
          datesSet={onDatesSet}
          dayMaxEvents={3}
          eventDisplay="block"
          stickyHeaderDates
        />
      </div>

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
              const timeLabel = DateTime.fromISO(ev.start).toLocaleString(DateTime.TIME_SIMPLE);
              const ccbHref = ccb && /^https?:\/\//i.test(ccb) ? ccb : null;

              return (
                <div
                  key={ev.id}
                  className="flex items-center justify-between gap-3 rounded-md border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2"
                >
                  <div className="min-w-0">
                    <div className="text-xs text-gray-500 dark:text-gray-400">{timeLabel}</div>
                    {ccbHref ? (
                      <a
                        href={ccbHref}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="block truncate text-sm font-medium text-blue-700 dark:text-blue-300 hover:underline"
                        title="Open CCB profile"
                      >
                        {ev.title}
                      </a>
                    ) : (
                      <div className="block truncate text-sm font-medium text-gray-900 dark:text-white">{ev.title}</div>
                    )}
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    {ccbHref && (
                      <a
                        href={ccbHref}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs px-2 py-1 rounded border border-blue-200 dark:border-blue-800 text-blue-700 dark:text-blue-200 hover:bg-blue-50 dark:hover:bg-blue-900/30"
                      >
                        CCB
                      </a>
                    )}
                    {leaderId && (
                      <button
                        type="button"
                        onClick={() => router.push(`/circle/${leaderId}`)}
                        className="text-xs px-2 py-1 rounded border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700"
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

      <div className="mt-3 text-xs text-gray-600 dark:text-gray-400">
        Tip: click an event to open the circle leader page.
      </div>
    </div>
  );
}
