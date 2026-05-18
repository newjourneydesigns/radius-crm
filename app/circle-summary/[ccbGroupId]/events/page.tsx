'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';

type EventRow = {
  eventId: string;
  occurrenceDate: string;
  occurrenceDateTime: string;
  title: string;
  hasExistingAttendance: boolean;
  didNotMeet: boolean;
  submittedAt: string | null;
  submittedStatus: 'submitted' | 'failed' | null;
};

type Leader = {
  id: number | string;
  name: string;
  campus: string | null;
  status: string | null;
  ccb_group_id: string | number | null;
} | null;

type CenterMessage = {
  id: string;
  header: string;
  body_html: string;
  url: string | null;
  url_label: string | null;
};

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

export default function CircleSummaryEventsPage() {
  const router = useRouter();
  const params = useParams<{ ccbGroupId: string }>();
  const urlGroupId = params.ccbGroupId;
  const [leader, setLeader] = useState<Leader>(null);
  const [events, setEvents] = useState<EventRow[]>([]);
  const [messages, setMessages] = useState<CenterMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [slowLoad, setSlowLoad] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inFlightRef = useRef(false);
  const lastLoadAtRef = useRef(0);

  const cacheKey = `cs:events:${urlGroupId}`;
  const invalidationKey = `cs:events:${urlGroupId}:invalidated`;

  const loadEvents = useCallback(
    async (opts: { force?: boolean; paintCached?: boolean } = {}) => {
      if (inFlightRef.current) return;
      inFlightRef.current = true;

      const { force = false, paintCached = false } = opts;
      let cancelled = false;

      // Stale-while-revalidate: optionally paint cached list immediately, then refresh.
      if (paintCached) {
        try {
          const cached = localStorage.getItem(cacheKey);
          if (cached) {
            const parsed = JSON.parse(cached);
            if (parsed?.leader) setLeader(parsed.leader);
            if (Array.isArray(parsed?.events)) setEvents(parsed.events);
            setLoading(false);
            setRefreshing(true);
          }
        } catch {}
      }

      const slowTimer = setTimeout(() => {
        if (!cancelled) setSlowLoad(true);
      }, 5000);

      try {
        const qs = force ? '?refresh=1' : '';
        const res = await fetch(`/api/circle-summary/events/${qs}`, {
          cache: 'no-store',
        });
        if (res.status === 401) {
          router.replace('/circle-summary');
          return;
        }
        const data = await res.json();
        if (cancelled) return;

        const leaderGroupId =
          data.leader?.ccb_group_id != null ? String(data.leader.ccb_group_id) : null;
        if (leaderGroupId && leaderGroupId !== urlGroupId) {
          router.replace(`/circle-summary/${leaderGroupId}/events`);
          return;
        }

        setLeader(data.leader || null);
        setEvents(data.events || []);
        if (data.error) setError(data.error);
        else setError(null);
        if (data.message && !data.events?.length) setError(data.message);
        try {
          localStorage.setItem(
            cacheKey,
            JSON.stringify({ leader: data.leader, events: data.events || [] })
          );
        } catch {}
        lastLoadAtRef.current = Date.now();
      } catch (e: any) {
        if (!cancelled) setError(e?.message || 'Could not load events.');
      } finally {
        if (!cancelled) {
          setLoading(false);
          setRefreshing(false);
          setSlowLoad(false);
          clearTimeout(slowTimer);
        }
        inFlightRef.current = false;
      }
    },
    [cacheKey, router, urlGroupId]
  );

  useEffect(() => {
    // If we just submitted (or otherwise know the cache is stale), skip the
    // cached paint and force a fresh server fetch — accuracy beats speed here.
    let invalidated = false;
    try {
      invalidated = sessionStorage.getItem(invalidationKey) === '1';
      if (invalidated) sessionStorage.removeItem(invalidationKey);
    } catch {}

    // Fire /me + messages alongside /events so the header and message center
    // paint as soon as their cheap queries return.
    fetch('/api/circle-summary/me/')
      .then((r) => (r.ok ? r.json() : null))
      .then((meData) => {
        if (!meData?.leader) return;
        setLeader((prev) => prev ?? meData.leader);
      })
      .catch(() => {});

    fetch('/api/circle-summary/messages/')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!d?.messages) return;
        setMessages(d.messages);
      })
      .catch(() => {});

    loadEvents({ force: invalidated, paintCached: !invalidated });

    // Re-fetch when the tab returns to focus — leaders often submit, switch
    // apps, then come back; keep the list current without a manual reload.
    // Skip if we just loaded (< 15s ago) so rapid tab switching doesn't
    // pound CCB on every focus event.
    const onFocus = () => {
      if (document.visibilityState !== 'visible') return;
      if (Date.now() - lastLoadAtRef.current < 15_000) return;
      loadEvents({ force: true });
    };
    document.addEventListener('visibilitychange', onFocus);
    window.addEventListener('focus', onFocus);
    return () => {
      document.removeEventListener('visibilitychange', onFocus);
      window.removeEventListener('focus', onFocus);
    };
  }, [invalidationKey, loadEvents]);

  async function signOut() {
    await fetch('/api/circle-summary/auth/logout/', { method: 'POST' });
    router.replace('/circle-summary');
  }

  const submitted = events.filter((e) => !!e.submittedAt || e.hasExistingAttendance).length;
  const pending = events.filter((e) => !e.submittedAt && !e.hasExistingAttendance).length;

  return (
    <>
      <header className="cs-hero px-6 pt-10 pb-8 sm:pt-14 sm:pb-10">
        <div className="max-w-2xl mx-auto">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-white/65 text-xs font-semibold uppercase tracking-[0.14em] mb-1">
                Valley Creek Church
              </p>
              <h1 className="cs-display text-4xl sm:text-5xl">Your Circle</h1>
              {leader && (
                <p className="mt-1.5 text-white/90 font-semibold text-base">
                  {leader.name}
                  {leader.campus ? <span className="font-normal text-white/70"> · {leader.campus}</span> : ''}
                </p>
              )}
            </div>
            <button
              onClick={signOut}
              className="text-white/70 hover:text-white text-xs font-semibold uppercase tracking-wide mt-1 shrink-0"
            >
              Sign out
            </button>
          </div>

          {/* Stats pill — give leaders a quick sense of their status at a glance */}
          {!loading && events.length > 0 && (
            <div className="mt-4 flex items-center gap-3 flex-wrap">
              <div className="flex items-center gap-1.5 bg-white/15 rounded-full px-3 py-1">
                <span className="w-1.5 h-1.5 rounded-full bg-green-300 inline-block" />
                <span className="text-white/90 text-xs font-semibold">{submitted} submitted</span>
              </div>
              {pending > 0 && (
                <div className="flex items-center gap-1.5 bg-white/15 rounded-full px-3 py-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-300 inline-block" />
                  <span className="text-white/90 text-xs font-semibold">{pending} need{pending === 1 ? 's' : ''} summary</span>
                </div>
              )}
              <button
                type="button"
                onClick={() => loadEvents({ force: true })}
                disabled={refreshing}
                aria-label="Refresh events"
                className="flex items-center gap-1.5 bg-white/15 hover:bg-white/25 disabled:opacity-70 rounded-full px-3 py-1 transition-colors"
              >
                <svg
                  className={`w-3 h-3 text-white/90 ${refreshing ? 'cs-spin-reverse' : ''}`}
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v6h6M20 20v-6h-6" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M20 10A8 8 0 006.34 6.34M4 14a8 8 0 0013.66 3.66" />
                </svg>
                <span className="text-white/90 text-xs font-semibold">
                  {refreshing ? 'Refreshing…' : 'Refresh'}
                </span>
              </button>
            </div>
          )}
        </div>
      </header>

      {messages.length > 0 && (
        <section className="max-w-2xl mx-auto px-4 pt-5 -mb-1 space-y-2.5">
          {messages.map((m) => (
            <article
              key={m.id}
              className="bg-white border border-neutral-200 rounded-2xl p-4 shadow-sm"
            >
              <h2 className="text-sm font-bold text-neutral-900 tracking-tight">
                {m.header}
              </h2>
              {m.body_html && (
                <div
                  className="cs-message-body text-sm text-neutral-700 mt-1.5 leading-relaxed"
                  dangerouslySetInnerHTML={{ __html: m.body_html }}
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
            </article>
          ))}
        </section>
      )}

      <main className="max-w-2xl mx-auto px-4 py-6">
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
            <p className="text-neutral-500 font-medium">No events in the last 8 weeks</p>
            <p className="text-neutral-400 text-sm mt-1">Check back after your next meeting.</p>
          </div>
        )}

        {!loading && events.length > 0 && (
          <div className="space-y-2.5">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-neutral-400 mb-3 px-0.5">
              Last 8 weeks
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
                  href={`/circle-summary/${urlGroupId}/events/${e.eventId}/${occurEncoded}`}
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
                      <p className="text-xs text-green-700 font-semibold">Summary on file</p>
                    )}
                    {isSubmitted && e.didNotMeet && (
                      <p className="text-xs text-neutral-500 font-semibold">Did not meet</p>
                    )}
                  </div>

                  {/* Badge + chevron */}
                  <div className="pr-3 flex items-center gap-2 shrink-0">
                    <div className="shrink-0">
                      {isSubmitted && e.didNotMeet && (
                        <span className="cs-badge cs-badge-muted">Skipped</span>
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
