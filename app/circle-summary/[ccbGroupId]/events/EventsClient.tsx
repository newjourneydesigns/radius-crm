'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { renderMessageHtml } from '../../../../lib/renderMessageHtml';
import type { CircleEventRow, CircleMessage } from '../../../../lib/circle-summary/events-data';

type EventRow = CircleEventRow;
type CenterMessage = CircleMessage;

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function parseDateStamp(iso: string) {
  const d = new Date(iso + 'T00:00:00');
  return {
    dayNum: d.getDate(),
    month: MONTHS[d.getMonth()],
    dayName: DAYS[d.getDay()],
  };
}

/**
 * Client island for the events tab. First paint is server-rendered (props are
 * seeded from the same loaders the API uses), so there is no post-hydration
 * fetch waterfall. This component only revalidates: on a post-submit
 * invalidation flag, and when the tab regains focus.
 */
export default function EventsClient({
  groupId,
  initialEvents,
  initialMessages,
  initialError,
}: {
  groupId: string;
  initialEvents: EventRow[];
  initialMessages: CenterMessage[];
  initialError: string | null;
}) {
  const router = useRouter();
  const [events, setEvents] = useState<EventRow[]>(initialEvents);
  const [messages, setMessages] = useState<CenterMessage[]>(initialMessages);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [slowLoad, setSlowLoad] = useState(false);
  const [error, setError] = useState<string | null>(initialError);
  const inFlightRef = useRef(false);
  const lastLoadAtRef = useRef(Date.now());

  const cacheKey = `cs:events:${groupId}`;
  const invalidationKey = `cs:events:${groupId}:invalidated`;

  const loadEvents = useCallback(
    async (opts: { force?: boolean } = {}) => {
      if (inFlightRef.current) return;
      inFlightRef.current = true;

      const { force = false } = opts;
      setRefreshing(true);

      const slowTimer = setTimeout(() => setSlowLoad(true), 5000);

      try {
        const qs = force ? '?refresh=1' : '';
        const res = await fetch(`/api/circle-summary/events/${qs}`, { cache: 'no-store' });
        if (res.status === 401) {
          router.replace('/circle-summary');
          return;
        }
        const data = await res.json();

        const leaderGroupId =
          data.leader?.ccb_group_id != null ? String(data.leader.ccb_group_id) : null;
        if (leaderGroupId && leaderGroupId !== groupId) {
          router.replace(`/circle-summary/${leaderGroupId}/events`);
          return;
        }

        setEvents(data.events || []);
        if (Array.isArray(data.messages)) setMessages(data.messages);
        if (data.error) setError(data.error);
        else if (data.message && !data.events?.length) setError(data.message);
        else setError(null);
        try {
          localStorage.setItem(
            cacheKey,
            JSON.stringify({ leader: data.leader, events: data.events || [] })
          );
        } catch {}
        lastLoadAtRef.current = Date.now();
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : 'Could not load events.');
      } finally {
        setLoading(false);
        setRefreshing(false);
        setSlowLoad(false);
        clearTimeout(slowTimer);
        inFlightRef.current = false;
      }
    },
    [cacheKey, router, groupId]
  );

  useEffect(() => {
    // If we just submitted (invalidation flag set by the summary form), bypass
    // every cache and pull fresh from CCB — accuracy beats speed here. Otherwise
    // the server already gave us a fresh list, so don't refetch on mount.
    let invalidated = false;
    try {
      invalidated = sessionStorage.getItem(invalidationKey) === '1';
      if (invalidated) sessionStorage.removeItem(invalidationKey);
    } catch {}
    if (invalidated) loadEvents({ force: true });

    // Re-fetch when the tab returns to focus — leaders often submit, switch
    // apps, then come back. Skip if we loaded < 15s ago so rapid tab switching
    // doesn't pound CCB on every focus event.
    const onFocus = () => {
      if (document.visibilityState !== 'visible') return;
      if (Date.now() - lastLoadAtRef.current < 15_000) return;
      loadEvents();
    };
    document.addEventListener('visibilitychange', onFocus);
    window.addEventListener('focus', onFocus);
    return () => {
      document.removeEventListener('visibilitychange', onFocus);
      window.removeEventListener('focus', onFocus);
    };
  }, [invalidationKey, loadEvents]);

  const submittedEvents = events.filter((e) => !!e.submittedAt || e.hasExistingAttendance);
  const submitted = submittedEvents.length;
  const didNotMeet = submittedEvents.filter((e) => e.didNotMeet).length;
  const pending = events.filter((e) => !e.submittedAt && !e.hasExistingAttendance).length;

  return (
    <>
      {messages.length > 0 && (
        <section className="max-w-2xl mx-auto px-4 pt-5 mb-2">
          <div className="bg-white border border-neutral-200 rounded-2xl shadow-lg overflow-hidden">
            {/* Header */}
            <div className="flex items-center gap-2 px-4 py-2.5 bg-neutral-50 border-b border-neutral-100">
              <svg className="w-3.5 h-3.5 text-neutral-400 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M11 5.882V19.24a1.76 1.76 0 01-3.417.592l-2.147-6.15M18 13a3 3 0 100-6M5.436 13.683A4.001 4.001 0 017 6h1.832c4.1 0 7.625-1.234 9.168-3v14c-1.543-1.766-5.067-3-9.168-3H7a3.988 3.988 0 01-1.564-.317z" />
              </svg>
              <span className="text-xs font-bold uppercase tracking-[0.12em] text-neutral-400">Message Center</span>
            </div>
            {/* Messages */}
            <div className="divide-y divide-neutral-100">
              {messages.map((m) => (
                <div key={m.id} className="px-4 py-4">
                  <h2 className="text-sm font-bold text-neutral-900 tracking-tight">
                    {m.header}
                  </h2>
                  {m.body_html && (
                    <div
                      className="cs-message-body text-sm text-neutral-700 mt-1.5 leading-relaxed"
                      dangerouslySetInnerHTML={{ __html: renderMessageHtml(m.body_html) }}
                    />
                  )}
                  {m.url && (
                    <a
                      href={m.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="cs-message-cta"
                    >
                      <span>{m.url_label || 'Learn more'}</span>
                      <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                      </svg>
                    </a>
                  )}
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      <main className="max-w-2xl mx-auto px-4 py-6">
        {!loading && events.length > 0 && (
          <div className="mb-4 flex items-center gap-2 flex-wrap">
            <div className="flex items-center gap-1.5 bg-white border border-neutral-200 rounded-full px-3 py-1 shadow-sm">
              <span className="w-1.5 h-1.5 rounded-full bg-green-500 inline-block" />
              <span className="text-neutral-700 text-xs font-semibold">{submitted} submitted</span>
            </div>
            {pending > 0 && (
              <div className="flex items-center gap-1.5 bg-white border border-amber-200 rounded-full px-3 py-1 shadow-sm">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-400 inline-block" />
                <span className="text-amber-800 text-xs font-semibold">{pending} need{pending === 1 ? 's' : ''} summary</span>
              </div>
            )}
            {didNotMeet > 0 && (
              <div className="flex items-center gap-1.5 bg-white border border-red-200 rounded-full px-3 py-1 shadow-sm">
                <span className="w-1.5 h-1.5 rounded-full bg-red-500 inline-block" />
                <span className="text-red-800 text-xs font-semibold">{didNotMeet} did not meet</span>
              </div>
            )}
            {refreshing && (
              <div
                aria-live="polite"
                className="flex items-center gap-1.5 bg-white border border-neutral-200 rounded-full px-3 py-1 shadow-sm"
              >
                <svg
                  className="w-3 h-3 text-neutral-500 cs-spin-reverse"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v6h6M20 20v-6h-6" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M20 10A8 8 0 006.34 6.34M4 14a8 8 0 0013.66 3.66" />
                </svg>
                <span className="text-neutral-600 text-xs font-semibold">Refreshing...</span>
              </div>
            )}
          </div>
        )}

        {loading && (
          <div className="space-y-2.5">
            {[0, 1, 2].map((i) => (
              <div key={i} className="cs-card flex items-center gap-4 p-0 overflow-hidden">
                <div className="w-14 h-16 cs-skeleton rounded-none" />
                <div className="flex-1 py-4 pr-4 space-y-2">
                  <div className="cs-skeleton h-4 w-1/3" />
                  <div className="cs-skeleton h-3 w-2/3" />
                </div>
              </div>
            ))}
            <p
              className="text-center text-xs text-neutral-500 pt-3"
              role="status"
              aria-live="polite"
            >
              {slowLoad
                ? 'Still loading — pulling the latest from Church Community Builder. Hang tight.'
                : 'Loading your Circle events…'}
            </p>
          </div>
        )}

        {!loading && error && (
          <div className="cs-alert cs-alert-warning mt-2">{error}</div>
        )}

        {!loading && !error && events.length === 0 && (
          <div className="cs-card text-center py-14">
            <svg className="w-10 h-10 mx-auto mb-3 text-neutral-300" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <rect x="3" y="4" width="18" height="18" rx="2" />
              <path d="M16 2v4M8 2v4M3 10h18" strokeLinecap="round" />
            </svg>
            <p className="text-neutral-500 font-medium">No events in the last 12 weeks</p>
            <p className="text-neutral-400 text-sm mt-1">Check back after your next meeting.</p>
          </div>
        )}

        {!loading && events.length > 0 && (
          <div className="space-y-2.5">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-neutral-400 mb-3 px-0.5">
              Last 12 weeks
            </p>
            {events.map((e) => {
              const occurEncoded = encodeURIComponent(e.occurrenceDateTime);
              const isSubmitted = !!e.submittedAt || e.hasExistingAttendance;
              const statusClass = isSubmitted && e.didNotMeet
                ? 'did-not-meet'
                : isSubmitted
                ? 'submitted'
                : 'needs-summary';
              const { dayNum, month, dayName } = parseDateStamp(e.occurrenceDate);

              return (
                <Link
                  key={`${e.eventId}-${e.occurrenceDate}`}
                  href={`/circle-summary/${groupId}/events/${e.eventId}/${occurEncoded}`}
                  className={`cs-event-row ${statusClass} active:translate-y-[1px]`}
                  style={{ textDecoration: 'none' }}
                >
                  {/* Date stamp */}
                  <div className="cs-date-stamp">
                    <span className="day-name">{dayName}</span>
                    <span className="day-num">{dayNum}</span>
                    <span className="month">{month}</span>
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0 px-3.5 py-3.5 flex flex-col justify-center gap-0.5">
                    <p className="text-xs text-neutral-400 truncate">{e.title}</p>
                    {!isSubmitted && (
                      <p className="text-xs text-amber-700 font-semibold">Tap to submit your summary →</p>
                    )}
                    {isSubmitted && !e.didNotMeet && (
                      <p className="text-xs text-green-700 font-semibold">
                        Summary on file
                        {e.headCount != null && (
                          <span className="text-neutral-500 font-medium">
                            {' · '}{e.headCount} attended
                          </span>
                        )}
                      </p>
                    )}
                    {isSubmitted && e.didNotMeet && (
                      <p className="text-xs text-red-700 font-semibold">Did not meet</p>
                    )}
                  </div>

                  {/* Badge + chevron */}
                  <div className="pr-3 flex items-center gap-2 shrink-0">
                    <div className="shrink-0">
                      {isSubmitted && e.didNotMeet && (
                        <span className="cs-badge cs-badge-danger">Did Not Meet</span>
                      )}
                      {isSubmitted && !e.didNotMeet && (
                        <span className="cs-badge cs-badge-success">Done</span>
                      )}
                      {!isSubmitted && (
                        <span className="cs-badge cs-badge-warning">Pending</span>
                      )}
                    </div>
                    <svg className="w-4 h-4 text-neutral-300 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                    </svg>
                  </div>
                </Link>
              );
            })}
          </div>
        )}

        <p className="text-center text-xs text-neutral-400 mt-8">
          Questions? Email us at <a href="mailto:nextsteps@valleycreek.org" className="cs-footer-link">nextsteps@valleycreek.org</a>.
        </p>
      </main>
    </>
  );
}
