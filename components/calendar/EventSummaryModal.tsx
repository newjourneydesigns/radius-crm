'use client';

import { useEffect, useState, useCallback } from 'react';
import { DateTime } from 'luxon';
import { supabase } from '../../lib/supabase';
import CopyTextButton from '../ui/CopyTextButton';

interface Props {
  open: boolean;
  onClose: () => void;
  leaderId: number | null;
  leaderName: string | null;
  /** CCB group name to use for the live attendance lookup. Parent resolves
   *  `leader.ccb_group_name || leader.circle_name || leader.name`. */
  ccbGroupName: string | null;
  /** Circle's CCB group id — powers the Open CCB shortcut in the roster-add box; optional. */
  ccbGroupId?: string | null;
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

/** A person the leader reported but couldn't find in CCB — the ACPD must create them there. */
type RosterAddRequest = {
  /** null = legacy row from before per-person tracking; display only, no checkbox. */
  id: string | null;
  first_name: string;
  last_name: string;
  phone: string | null;
  email: string | null;
  /** Non-null = someone already entered this person into CCB. */
  added_to_ccb_at: string | null;
  added_to_ccb_by_name: string | null;
};

/** A change the leader requested to the circle's meeting details. */
type InfoUpdateRequest = {
  field: 'Meeting day' | 'Meeting time' | 'Meeting location';
  current: string;
  requested: string;
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
  roster_add_requests: RosterAddRequest[];
  info_update_requests: InfoUpdateRequest[];
};

async function authHeaders(): Promise<Record<string, string>> {
  const { data: { session } } = await supabase.auth.getSession();
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (session?.access_token) headers['Authorization'] = `Bearer ${session.access_token}`;
  return headers;
}

export default function EventSummaryModal({ open, onClose, leaderId, leaderName, ccbGroupName, ccbGroupId = null, weekStartDate, onReviewed }: Props) {
  const [ccbEvents, setCcbEvents] = useState<CCBEvent[] | null>(null);
  const [appSummary, setAppSummary] = useState<AppSummary | null>(null);
  const [reviewedAt, setReviewedAt] = useState<string | null>(null);
  const [loadingCcb, setLoadingCcb] = useState(false);
  const [loadingDb, setLoadingDb] = useState(false);
  const [ccbError, setCcbError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [marking, setMarking] = useState(false);
  /** Roster-add rows with a set_roster_add_status POST in flight (by addition id). */
  const [rosterSavingIds, setRosterSavingIds] = useState<Set<string>>(new Set());
  /** Per-row save errors for the "Added to CCB" toggle (by addition id). */
  const [rosterErrors, setRosterErrors] = useState<Record<string, string>>({});

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
          roster_add_requests: Array.isArray(json.roster_add_requests) ? json.roster_add_requests : [],
          info_update_requests: Array.isArray(json.info_update_requests) ? json.info_update_requests : [],
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
      setRosterSavingIds(new Set());
      setRosterErrors({});
      return;
    }
    void loadCcb();
    void loadDb();
  }, [open, loadCcb, loadDb]);

  /** Toggle "Added to CCB" for one manual roster addition. Optimistic; reverts on failure. */
  const handleToggleRosterAdd = useCallback(async (person: RosterAddRequest, added: boolean) => {
    const additionId = person.id;
    if (!additionId || !leaderId || !weekStartDate) return;

    const previous = {
      added_to_ccb_at: person.added_to_ccb_at,
      added_to_ccb_by_name: person.added_to_ccb_by_name,
    };
    const applyPatch = (patch: Pick<RosterAddRequest, 'added_to_ccb_at' | 'added_to_ccb_by_name'>) => {
      setAppSummary(cur => cur
        ? {
            ...cur,
            roster_add_requests: cur.roster_add_requests.map(r => (r.id === additionId ? { ...r, ...patch } : r)),
          }
        : cur);
    };

    setRosterErrors(errs => {
      const next = { ...errs };
      delete next[additionId];
      return next;
    });
    setRosterSavingIds(ids => new Set(ids).add(additionId));
    // Optimistic: show the new state immediately; the response supplies the real name/date.
    applyPatch(added
      ? { added_to_ccb_at: new Date().toISOString(), added_to_ccb_by_name: 'you' }
      : { added_to_ccb_at: null, added_to_ccb_by_name: null });

    try {
      const res = await fetch('/api/circle-leader-toolkit/leader-week-summary', {
        method: 'POST',
        headers: await authHeaders(),
        body: JSON.stringify({
          action: 'set_roster_add_status',
          leader_id: leaderId,
          week_start_date: weekStartDate,
          addition_id: additionId,
          added,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to save');
      applyPatch({
        added_to_ccb_at: json.added_to_ccb_at ?? null,
        added_to_ccb_by_name: json.added_to_ccb_by_name ?? null,
      });
    } catch (e) {
      applyPatch(previous);
      const message = e instanceof Error ? e.message : '';
      setRosterErrors(errs => ({ ...errs, [additionId]: message || 'Couldn’t save — try again.' }));
    } finally {
      setRosterSavingIds(ids => {
        const next = new Set(ids);
        next.delete(additionId);
        return next;
      });
    }
  }, [leaderId, weekStartDate]);

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

                  {/* People the leader added by hand — they don't exist in CCB until an ACPD creates them. */}
                  {appSummary.roster_add_requests.length > 0 && (
                    <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3">
                      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5">
                        <div className="text-xs font-semibold text-amber-200 flex items-center gap-1.5 min-w-0">
                          <svg className="w-3.5 h-3.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
                          </svg>
                          New people to add to CCB
                        </div>
                        {ccbGroupId && (
                          <a
                            href={`https://valleycreekchurch.ccbchurch.com/goto/groups/${encodeURIComponent(ccbGroupId)}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 shrink-0 rounded-md border border-amber-500/40 px-2 py-0.5 text-[11px] font-medium text-amber-200 hover:bg-amber-500/20 transition-colors"
                          >
                            <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 0 0 3 8.25v10.5A2.25 2.25 0 0 0 5.25 21h10.5A2.25 2.25 0 0 0 18 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
                            </svg>
                            Open CCB
                          </a>
                        )}
                      </div>
                      <p className="text-[11px] text-amber-200/70 mt-1 mb-2.5">
                        The leader couldn&apos;t find these people in CCB — add them, then check them off.
                        Click a name, phone, or email to copy it.
                      </p>
                      <div className="space-y-2">
                        {appSummary.roster_add_requests.map((person, i) => {
                          const added = !!person.added_to_ccb_at;
                          const saving = person.id != null && rosterSavingIds.has(person.id);
                          const rowError = person.id != null ? rosterErrors[person.id] : undefined;
                          const phone = (person.phone || '').trim();
                          const phoneDigits = phone.replace(/\D/g, '');
                          const email = (person.email || '').trim();
                          return (
                            <div
                              key={person.id ?? `legacy-${i}`}
                              className={`rounded-md border p-2.5 ${added ? 'border-emerald-500/30 bg-emerald-500/5' : 'border-zinc-700/60 bg-zinc-900/40'}`}
                            >
                              <div className="flex items-start gap-2.5">
                                {person.id != null && (
                                  <input
                                    type="checkbox"
                                    checked={added}
                                    disabled={saving}
                                    onChange={e => { void handleToggleRosterAdd(person, e.target.checked); }}
                                    aria-label={`${person.first_name} ${person.last_name} added to CCB`}
                                    className="mt-0.5 h-4 w-4 shrink-0 rounded border-zinc-600 bg-zinc-700 accent-emerald-500 cursor-pointer disabled:opacity-50"
                                  />
                                )}
                                <div className="min-w-0 flex-1">
                                  <CopyTextButton
                                    value={`${person.first_name} ${person.last_name}`.trim()}
                                    className="text-sm font-medium text-white"
                                  />
                                  {phone || email ? (
                                    <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 mt-0.5 text-xs">
                                      {phone && (
                                        <CopyTextButton
                                          value={phone}
                                          copyValue={phoneDigits || phone}
                                          className="text-blue-400 hover:text-blue-300"
                                        />
                                      )}
                                      {email && (
                                        <CopyTextButton value={email} className="text-blue-400 hover:text-blue-300" />
                                      )}
                                    </div>
                                  ) : (
                                    <div className="text-xs text-slate-500 italic mt-0.5">No contact info provided</div>
                                  )}
                                  {added && (
                                    <div className="text-[11px] text-emerald-400/90 mt-1">
                                      Added{person.added_to_ccb_by_name ? ` by ${person.added_to_ccb_by_name}` : ''}
                                      {person.added_to_ccb_at ? ` · ${DateTime.fromISO(person.added_to_ccb_at).toFormat('MMM d')}` : ''}
                                    </div>
                                  )}
                                  {rowError && <div className="text-[11px] text-red-300 mt-1">{rowError}</div>}
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Meeting day/time/location changes the leader asked for. */}
                  {appSummary.info_update_requests.length > 0 && (
                    <div className="rounded-lg border border-zinc-700 bg-zinc-800/40 p-3">
                      <div className="text-xs font-semibold text-slate-200 flex items-center gap-1.5 mb-2">
                        <svg className="w-3.5 h-3.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                        </svg>
                        Requested Circle info changes
                      </div>
                      <div className="space-y-2">
                        {appSummary.info_update_requests.map(req => (
                          <div key={req.field}>
                            <div className="text-[10px] uppercase tracking-wider text-slate-500 font-medium mb-0.5">{req.field}</div>
                            <div className="text-sm flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
                              {req.current ? (
                                <span className="max-w-full break-words text-slate-400 line-through">{req.current}</span>
                              ) : (
                                <span className="text-slate-500 italic">(unset)</span>
                              )}
                              <svg className="w-3.5 h-3.5 text-slate-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M14 5l7 7m0 0l-7 7m7-7H3" />
                              </svg>
                              <span className="max-w-full break-words text-emerald-300 font-medium">{req.requested}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
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
