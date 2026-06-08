'use client';

import { useEffect, useState, useCallback } from 'react';
import { DateTime } from 'luxon';
import { supabase } from '../../lib/supabase';

interface Props {
  open: boolean;
  onClose: () => void;
  leaderId: number | null;
  leaderName: string | null;
  /** CCB group name to use for the live attendance lookup. Parent resolves
   *  `leader.ccb_group_name || leader.circle_name || leader.name`. */
  ccbGroupName: string | null;
  weekStartDate: string | null; // YYYY-MM-DD (Sunday)
  /** Called after "mark as reviewed" succeeds. Includes the new state so the parent can update the UI. */
  onReviewed?: (leaderId: number, newState: 'received' | 'did_not_meet' | null) => void;
}

/** A single CCB event returned by /api/ccb/event-attendance */
type CCBEvent = {
  eventId: string;
  title: string;
  date: string;
  link?: string | null;
  notes: string | null;
  prayerRequests: string | null;
  topic: string | null;
  headCount: number | null;
  didNotMeet: boolean;
  attendees: Array<{ id: string; name: string; status?: string }>;
};

/** App-submitted summary from circle_event_summaries (if leader used the Radius form). */
type AppSummary = {
  submission_id: string;
  occurrence: string;
  did_not_meet: boolean;
  topic: string | null;
  notes: string | null;
  prayer_requests: string | null;
  info: string | null;
  submitted_at: string;
  reviewed_at: string | null;
};

async function authHeaders(): Promise<Record<string, string>> {
  const { data: { session } } = await supabase.auth.getSession();
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (session?.access_token) headers['Authorization'] = `Bearer ${session.access_token}`;
  return headers;
}

export default function EventSummaryModal({ open, onClose, leaderId, leaderName, ccbGroupName, weekStartDate, onReviewed }: Props) {
  const [ccbEvents, setCcbEvents] = useState<CCBEvent[] | null>(null);
  const [appSummary, setAppSummary] = useState<AppSummary | null>(null);
  const [reviewedAt, setReviewedAt] = useState<string | null>(null);
  const [loadingCcb, setLoadingCcb] = useState(false);
  const [loadingDb, setLoadingDb] = useState(false);
  const [ccbError, setCcbError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [marking, setMarking] = useState(false);

  const weekEndDate = weekStartDate
    ? DateTime.fromISO(weekStartDate).plus({ days: 6 }).toISODate()!
    : null;

  /** Pull live CCB attendance data for this leader's group + visible week. */
  const loadCcb = useCallback(async () => {
    if (!ccbGroupName || !weekStartDate || !weekEndDate) return;
    setLoadingCcb(true);
    setCcbError(null);
    try {
      const res = await fetch('/api/ccb/event-attendance', {
        method: 'POST',
        headers: await authHeaders(),
        body: JSON.stringify({
          date: weekStartDate,
          endDate: weekEndDate,
          groupName: ccbGroupName,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to load CCB data');
      setCcbEvents((json.data ?? []) as CCBEvent[]);
    } catch (e: any) {
      setCcbError(e.message || 'Failed to load CCB data');
      setCcbEvents([]);
    } finally {
      setLoadingCcb(false);
    }
  }, [ccbGroupName, weekStartDate, weekEndDate]);

  /** Pull review status + any Radius app submission for this leader + week. */
  const loadDb = useCallback(async () => {
    if (!leaderId || !weekStartDate) return;
    setLoadingDb(true);
    try {
      const url = `/api/circle-leader-toolkit/leader-week-summary?leader_id=${leaderId}&week_start=${weekStartDate}`;
      const res = await fetch(url, { headers: await authHeaders() });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to load');

      if (json.status === 'submitted') {
        setAppSummary({
          submission_id: json.submission_id,
          occurrence: json.occurrence,
          did_not_meet: json.did_not_meet,
          topic: json.topic,
          notes: json.notes,
          prayer_requests: json.prayer_requests,
          info: json.info,
          submitted_at: json.submitted_at,
          reviewed_at: json.reviewed_at,
        });
        setReviewedAt(json.reviewed_at ?? null);
      } else if (json.status === 'ccb_only' || json.status === 'did_not_meet') {
        setReviewedAt(json.reviewed_at ?? null);
      }
    } catch (e: any) {
      console.warn('[EventSummaryModal] DB lookup failed:', e);
    } finally {
      setLoadingDb(false);
    }
  }, [leaderId, weekStartDate]);

  useEffect(() => {
    if (!open) {
      setCcbEvents(null);
      setAppSummary(null);
      setReviewedAt(null);
      setError(null);
      setCcbError(null);
      return;
    }
    void loadCcb();
    void loadDb();
  }, [open, loadCcb, loadDb]);

  const handleMarkReviewed = useCallback(async () => {
    if (!leaderId || !weekStartDate) return;
    setMarking(true);
    setError(null);
    try {
      // If there's no DB row yet (CCB-only submission the matcher hasn't paired),
      // pass the first CCB event so the server can backfill before marking reviewed.
      let ccbEventPayload: Record<string, any> | undefined;
      if (!appSummary && ccbEvents && ccbEvents.length > 0) {
        const ev = ccbEvents[0];
        const meetingDate = ev.date.split(' ')[0]; // CCB returns "YYYY-MM-DD HH:mm:ss"
        ccbEventPayload = {
          meeting_date: meetingDate,
          topic: ev.topic,
          notes: ev.notes,
          prayer_requests: ev.prayerRequests,
          headcount: ev.headCount,
          did_not_meet: ev.didNotMeet,
          has_notes: !!(ev.topic || ev.notes || ev.prayerRequests),
          guest_count: 0,
        };
      }

      const res = await fetch('/api/circle-leader-toolkit/leader-week-summary', {
        method: 'POST',
        headers: await authHeaders(),
        body: JSON.stringify({
          action: 'mark_reviewed',
          leader_id: leaderId,
          week_start_date: weekStartDate,
          ...(ccbEventPayload ? { ccb_event: ccbEventPayload } : {}),
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed');
      setReviewedAt(json.reviewed_at ?? new Date().toISOString());
      onReviewed?.(leaderId, json.new_state ?? null);
    } catch (e: any) {
      setError(e.message || 'Failed to mark reviewed');
    } finally {
      setMarking(false);
    }
  }, [leaderId, weekStartDate, appSummary, ccbEvents, onReviewed]);

  if (!open) return null;

  const weekLabel = weekStartDate
    ? (() => {
        const s = DateTime.fromISO(weekStartDate);
        const e = s.plus({ days: 6 });
        return `${s.toFormat('MMM d')} – ${e.toFormat('MMM d, yyyy')}`;
      })()
    : '';

  const hasAnySubmission = !!appSummary || (ccbEvents != null && ccbEvents.some(e => e.didNotMeet || e.headCount != null || e.topic || e.notes || e.prayerRequests || e.attendees.length > 0));
  const isLoading = loadingCcb || loadingDb;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm" onClick={onClose}>
      <div
        className="w-full max-w-lg bg-zinc-900 border border-zinc-700 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-3 px-5 py-4 border-b border-zinc-800">
          <div className="min-w-0">
            <h2 className="text-sm font-semibold text-white truncate">{leaderName || 'Leader'}</h2>
            <p className="text-xs text-slate-400 mt-0.5">Event summary · {weekLabel}</p>
          </div>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-white transition-colors shrink-0" aria-label="Close">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="px-5 py-4 overflow-y-auto flex-1 space-y-4">
          {isLoading && !ccbEvents && !appSummary && (
            <div className="flex items-center gap-2 text-slate-400 text-sm py-6 justify-center">
              <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              Loading…
            </div>
          )}

          {error && (
            <div className="rounded-lg border border-red-500/30 bg-red-500/10 text-red-200 text-xs px-3 py-2">
              {error}
            </div>
          )}
          {ccbError && (
            <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 text-amber-200 text-xs px-3 py-2">
              CCB lookup failed: {ccbError}
            </div>
          )}

          {/* Radius app submission, if any (highest priority — admin-attested) */}
          {appSummary && (
            <div className="space-y-3 text-sm">
              <div className="rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-200 text-xs px-3 py-2 flex items-center gap-2">
                <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
                {appSummary.did_not_meet ? 'Reported did not meet' : 'Submitted via Radius'}
                <span className="ml-auto text-emerald-300/70">
                  {DateTime.fromISO(appSummary.submitted_at).toFormat('MMM d, h:mm a')}
                </span>
              </div>
              {appSummary.did_not_meet ? (
                <FieldBlock label="Reason">
                  <span className="italic text-slate-400">Leader reported the circle did not meet this week.</span>
                </FieldBlock>
              ) : (
                <>
                  {appSummary.topic && <FieldBlock label="Topic">{appSummary.topic}</FieldBlock>}
                  {appSummary.notes && <FieldBlock label="Notes">{appSummary.notes}</FieldBlock>}
                  {appSummary.prayer_requests && <FieldBlock label="Prayer requests">{appSummary.prayer_requests}</FieldBlock>}
                  {appSummary.info && <FieldBlock label="Other info">{appSummary.info}</FieldBlock>}
                </>
              )}
            </div>
          )}

          {/* CCB events (live) */}
          {ccbEvents && ccbEvents.length > 0 && (
            <div className="space-y-4">
              {ccbEvents.map(ev => (
                <div key={ev.eventId} className="space-y-3 text-sm">
                  <div className="rounded-lg bg-vc-500/10 border border-vc-500/30 text-vc-200 text-xs px-3 py-2 flex items-center justify-between gap-2 flex-wrap">
                    <div className="flex items-center gap-2 min-w-0">
                      <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                      </svg>
                      <span className="truncate">{ev.title}</span>
                    </div>
                    <span className="text-vc-300/70 text-[11px] shrink-0">
                      {DateTime.fromISO(ev.date.split(' ')[0]).toFormat('EEE, MMM d')}
                    </span>
                  </div>
                  {ev.didNotMeet ? (
                    <FieldBlock label="Status">
                      <span className="italic text-slate-400">Marked as did not meet in CCB.</span>
                    </FieldBlock>
                  ) : (
                    <>
                      {ev.topic && <FieldBlock label="Topic">{ev.topic}</FieldBlock>}
                      {ev.notes && <FieldBlock label="Notes">{ev.notes}</FieldBlock>}
                      {ev.prayerRequests && <FieldBlock label="Prayer requests">{ev.prayerRequests}</FieldBlock>}
                      {ev.headCount != null && <FieldBlock label="Headcount">{ev.headCount}</FieldBlock>}
                      {ev.attendees.length > 0 && (
                        <FieldBlock label={`Attendees (${ev.attendees.length})`}>
                          <div className="flex flex-wrap gap-1.5 mt-1">
                            {ev.attendees.map(a => (
                              <span key={a.id} className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] bg-zinc-800 border border-zinc-700 text-slate-200">
                                {a.name}
                              </span>
                            ))}
                          </div>
                        </FieldBlock>
                      )}
                      {!ev.topic && !ev.notes && !ev.prayerRequests && ev.headCount == null && ev.attendees.length === 0 && (
                        <span className="text-slate-500 italic text-xs">CCB has an event scheduled but no attendance has been recorded yet.</span>
                      )}
                    </>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Empty state */}
          {!isLoading && !appSummary && (ccbEvents?.length ?? 0) === 0 && (
            <div className="rounded-lg bg-zinc-500/10 border border-zinc-500/30 text-slate-300 text-xs px-3 py-2 flex items-center gap-2">
              <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              No event found in CCB or Radius for the week of {weekLabel}.
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-zinc-800 flex items-center justify-between gap-2">
          <div className="text-xs text-slate-500">
            {reviewedAt ? (
              <span className="text-emerald-400/80">Reviewed {DateTime.fromISO(reviewedAt).toRelative()}</span>
            ) : hasAnySubmission ? (
              <span>Not yet reviewed</span>
            ) : null}
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => { void loadCcb(); void loadDb(); }}
              disabled={isLoading}
              className="px-3 py-1.5 text-xs font-medium rounded-lg border border-zinc-700 text-slate-300 hover:bg-zinc-800 transition-colors disabled:opacity-50"
              title="Refresh from CCB"
            >
              {isLoading ? 'Refreshing…' : 'Refresh'}
            </button>
            {hasAnySubmission && !reviewedAt && (
              <button
                type="button"
                onClick={handleMarkReviewed}
                disabled={marking}
                className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white transition-colors disabled:opacity-60"
              >
                {marking ? 'Marking…' : 'Mark as reviewed'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function FieldBlock({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-slate-500 font-medium mb-0.5">{label}</div>
      <div className="text-sm text-slate-200 whitespace-pre-wrap">{children}</div>
    </div>
  );
}
