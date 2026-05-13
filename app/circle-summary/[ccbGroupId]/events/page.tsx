'use client';

import { useEffect, useState } from 'react';
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

function formatDate(iso: string): string {
  return new Date(iso + 'T00:00:00').toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export default function CircleSummaryEventsPage() {
  const router = useRouter();
  const params = useParams<{ ccbGroupId: string }>();
  const urlGroupId = params.ccbGroupId;
  const [leader, setLeader] = useState<Leader>(null);
  const [events, setEvents] = useState<EventRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/circle-summary/events');
        if (res.status === 401) {
          router.replace('/circle-summary');
          return;
        }
        const data = await res.json();
        if (cancelled) return;

        // Guard: if the URL's groupId doesn't match the logged-in leader's
        // ccb_group_id, silently redirect to their own circle. The API already
        // refuses to serve another circle's data — this just keeps the URL
        // honest.
        const leaderGroupId = data.leader?.ccb_group_id != null ? String(data.leader.ccb_group_id) : null;
        if (leaderGroupId && leaderGroupId !== urlGroupId) {
          router.replace(`/circle-summary/${leaderGroupId}/events`);
          return;
        }

        setLeader(data.leader || null);
        setEvents(data.events || []);
        if (data.error) setError(data.error);
        if (data.message && !data.events?.length) setError(data.message);
      } catch (e: any) {
        if (!cancelled) setError(e?.message || 'Could not load events.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [router, urlGroupId]);

  async function signOut() {
    await fetch('/api/circle-summary/auth/logout', { method: 'POST' });
    router.replace('/circle-summary');
  }

  return (
    <>
      <header className="cs-hero py-10 sm:py-14 px-6">
        <div className="max-w-2xl mx-auto flex items-start justify-between gap-4">
          <div>
            <h1 className="cs-display text-4xl sm:text-5xl">Your Circle</h1>
            {leader && (
              <p className="mt-2 text-white/90 font-medium">
                {leader.name}
                {leader.campus ? ` • ${leader.campus}` : ''}
              </p>
            )}
          </div>
          <button onClick={signOut} className="text-white/80 hover:text-white text-sm underline underline-offset-4">
            Sign out
          </button>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-8">
        {loading && (
          <div className="space-y-3">
            {[0, 1, 2].map((i) => (
              <div key={i} className="cs-card">
                <div className="cs-skeleton h-5 w-2/3 mb-2" />
                <div className="cs-skeleton h-4 w-1/3" />
              </div>
            ))}
          </div>
        )}

        {!loading && error && <div className="cs-alert cs-alert-warning">{error}</div>}

        {!loading && !error && events.length === 0 && (
          <div className="cs-card text-center py-10">
            <p className="text-neutral-600">No Circle events found in the last 8 weeks.</p>
          </div>
        )}

        {!loading && events.length > 0 && (
          <div className="space-y-3">
            <h2 className="text-xs uppercase tracking-[0.18em] text-neutral-500 font-semibold mb-3">
              Last 8 weeks
            </h2>
            {events.map((e) => {
              const occurEncoded = encodeURIComponent(e.occurrenceDateTime);
              // "Submitted" if EITHER we have an audit row in Supabase OR CCB
              // already has notes/topic/attendees on the attendance_profile.
              // The latter catches summaries entered directly in CCB.
              const submitted = !!e.submittedAt || e.hasExistingAttendance;
              return (
                <Link
                  key={`${e.eventId}-${e.occurrenceDate}`}
                  href={`/circle-summary/${urlGroupId}/events/${e.eventId}/${occurEncoded}`}
                  className="cs-card flex items-center gap-3 hover:border-[color:var(--cs-green)] hover:shadow-md transition-all active:translate-y-[1px]"
                  style={{ textDecoration: 'none' }}
                >
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-neutral-900 truncate">
                      {formatDate(e.occurrenceDate)}
                    </p>
                    <p className="text-xs text-neutral-500 truncate mt-0.5">{e.title}</p>
                  </div>
                  <div className="shrink-0">
                    {submitted && e.didNotMeet && (
                      <span className="cs-badge cs-badge-muted">Didn't meet</span>
                    )}
                    {submitted && !e.didNotMeet && (
                      <span className="cs-badge cs-badge-success">Submitted</span>
                    )}
                    {!submitted && <span className="cs-badge cs-badge-warning">Needs summary</span>}
                  </div>
                  <svg className="w-4 h-4 text-neutral-400 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                  </svg>
                </Link>
              );
            })}
          </div>
        )}
      </main>
    </>
  );
}
