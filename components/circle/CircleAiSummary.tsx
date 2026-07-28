'use client';

/**
 * AI Circle Summary — ACPD-only coaching snapshot for one circle.
 *
 * Top half: deterministic metrics for a selectable timeframe (loads instantly,
 * no AI). Bottom half: on-demand AI narrative generated from the metrics + the
 * circle's meeting notes; saved server-side and shared across ACPDs so viewing
 * a saved summary costs no Gemini quota.
 */
import { useCallback, useEffect, useState } from 'react';
import { DateTime } from 'luxon';
import { apiFetch } from '../../lib/apiClient';
import AiSummaryMarkdown from '../ai/AiSummaryMarkdown';

type TimeframeKey = 'last_month' | 'last_3_months' | 'last_6_months' | 'semester';

const TIMEFRAMES: Array<{ key: TimeframeKey; label: string }> = [
  { key: 'last_month', label: 'Last month' },
  { key: 'last_3_months', label: 'Last 3 months' },
  { key: 'last_6_months', label: 'Last 6 months' },
  { key: 'semester', label: 'This semester' },
];

interface Metrics {
  rosterCount: number;
  membersAdded: { count: number; names: string[]; reliable: boolean };
  meetings: { met: number; didNotMeet: number; noRecord: number; total: number };
  attendance: {
    average: number | null;
    firstHalfAvg: number | null;
    secondHalfAvg: number | null;
    trendLabel: string | null;
  };
  rosterShowRate: number | null;
  newFaces: Array<{ ccbId: string; name: string; firstDate: string; timesAttended: number }>;
  consistency: Array<{ ccbId: string; name: string; attended: number; ofMeetings: number }>;
  firstRecordedMeeting: string | null;
}

interface SavedSummary {
  summary_text: string;
  generated_at: string;
  start_date: string;
  end_date: string;
}

interface SnapshotResponse {
  timeframe: { key: TimeframeKey; label: string; startDate: string; endDate: string };
  metrics: Metrics;
  savedSummary: SavedSummary | null;
}

const fmtDate = (iso: string) => DateTime.fromISO(iso).toFormat('MMM d');
const fmtDateYear = (iso: string) => DateTime.fromISO(iso).toFormat('MMM d, yyyy');

function StatTile({ label, value, sub, subClass = 'text-slate-500' }: { label: string; value: React.ReactNode; sub?: string | null; subClass?: string }) {
  return (
    <div className="bg-zinc-800/60 border border-zinc-700 rounded-xl p-4">
      <p className="text-xs text-slate-500 uppercase tracking-wide">{label}</p>
      <p className="text-2xl font-bold text-white mt-1">{value}</p>
      {sub && <p className={`text-xs mt-1 ${subClass}`}>{sub}</p>}
    </div>
  );
}

export default function CircleAiSummary({ leaderId, refreshKey = 0 }: { leaderId: number; refreshKey?: number }) {
  const [timeframe, setTimeframe] = useState<TimeframeKey>('semester');
  const [data, setData] = useState<SnapshotResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [genError, setGenError] = useState<string | null>(null);
  const [showAllConsistency, setShowAllConsistency] = useState(false);

  const loadSnapshot = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      // Trailing slash avoids the Next trailingSlash 308 redirect on API calls
      const res = await apiFetch(`/api/circle-ai-summary/?leaderId=${leaderId}&timeframe=${timeframe}`);
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error || 'Failed to load circle snapshot');
      setData(body as SnapshotResponse);
    } catch (err) {
      setData(null);
      setLoadError(err instanceof Error ? err.message : 'Failed to load circle snapshot');
    } finally {
      setLoading(false);
    }
  }, [leaderId, timeframe]);

  useEffect(() => {
    loadSnapshot();
    setShowAllConsistency(false);
    // refreshKey re-fires the load after a manual attendance sync
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadSnapshot, refreshKey]);

  const generate = async () => {
    setGenerating(true);
    setGenError(null);
    try {
      const res = await apiFetch('/api/circle-ai-summary/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ leaderId, timeframe }),
      });
      const body = await res.json();
      if (!res.ok) {
        throw new Error(
          body?.rateLimited
            ? 'AI rate limit reached — give it a minute and try again.'
            : body?.error || 'Failed to generate summary'
        );
      }
      setData((prev) => (prev ? { ...prev, savedSummary: body.savedSummary as SavedSummary } : prev));
    } catch (err) {
      setGenError(err instanceof Error ? err.message : 'Failed to generate summary');
    } finally {
      setGenerating(false);
    }
  };

  const metrics = data?.metrics ?? null;
  const saved = data?.savedSummary ?? null;
  const hasHistoryGap =
    metrics?.firstRecordedMeeting != null &&
    data != null &&
    metrics.firstRecordedMeeting > data.timeframe.startDate;
  const consistentCore = metrics?.consistency ?? [];
  const visibleCore = showAllConsistency ? consistentCore : consistentCore.slice(0, 8);

  return (
    <div>
      {/* Header + timeframe pills */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-base font-semibold text-white">Circle Snapshot</h2>
        <div className="flex gap-1.5 overflow-x-auto -mx-1 px-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {TIMEFRAMES.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => setTimeframe(t.key)}
              className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                timeframe === t.key
                  ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/40'
                  : 'text-slate-400 hover:text-white hover:bg-zinc-700/60 border border-zinc-700'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {data && (
        <p className="text-xs text-slate-500 mt-1">
          {fmtDateYear(data.timeframe.startDate)} – {fmtDateYear(data.timeframe.endDate)}
        </p>
      )}

      {/* Snapshot */}
      {loading ? (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mt-4">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="animate-pulse bg-zinc-800/60 border border-zinc-700 rounded-xl h-24" />
          ))}
        </div>
      ) : loadError ? (
        <div className="mt-4 bg-red-500/10 border border-red-500/30 rounded-lg px-4 py-3 text-sm text-red-300">
          {loadError}
        </div>
      ) : metrics && metrics.meetings.total === 0 ? (
        <div className="text-center py-10">
          <p className="text-slate-400 text-sm">No meeting records in this timeframe</p>
          <p className="text-slate-500 text-xs mt-1">Try a longer timeframe, or pull an event summary to sync attendance</p>
        </div>
      ) : metrics ? (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mt-4">
            <StatTile
              label="Avg Attendance"
              value={metrics.attendance.average ?? '—'}
              sub={metrics.attendance.trendLabel}
              subClass={
                metrics.attendance.firstHalfAvg != null && metrics.attendance.secondHalfAvg != null
                  ? metrics.attendance.secondHalfAvg > metrics.attendance.firstHalfAvg
                    ? 'text-green-400'
                    : metrics.attendance.secondHalfAvg < metrics.attendance.firstHalfAvg
                      ? 'text-amber-400'
                      : 'text-slate-500'
                  : 'text-slate-500'
              }
            />
            <StatTile
              label="Roster Show Rate"
              value={metrics.rosterShowRate != null ? `${metrics.rosterShowRate}%` : '—'}
              sub={metrics.rosterCount > 0 ? `of current roster (${metrics.rosterCount})` : 'no roster synced'}
            />
            <StatTile
              label="Meetings"
              value={metrics.meetings.met}
              sub={`met · ${metrics.meetings.didNotMeet} skipped · ${metrics.meetings.noRecord} no record`}
            />
            <StatTile
              label="Added to Roster"
              value={`${metrics.membersAdded.reliable ? '' : '~'}${metrics.membersAdded.count}`}
              sub={
                metrics.membersAdded.count > 0
                  ? metrics.membersAdded.names.slice(0, 3).join(', ') + (metrics.membersAdded.count > 3 ? '…' : '')
                  : 'in this window'
              }
            />
          </div>

          {(metrics.newFaces.length > 0 || consistentCore.length > 0) && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4">
              {metrics.newFaces.length > 0 && (
                <div>
                  <p className="text-xs text-slate-500 uppercase tracking-wide mb-2">
                    New Faces
                    {hasHistoryGap && metrics.firstRecordedMeeting && (
                      <span className="normal-case tracking-normal text-slate-600"> · since records began {fmtDate(metrics.firstRecordedMeeting)}</span>
                    )}
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {metrics.newFaces.map((f) => (
                      <span key={f.ccbId} className="bg-indigo-500/15 text-indigo-300 text-xs font-medium px-2.5 py-1 rounded-full">
                        {f.name} <span className="text-indigo-400/60">· {fmtDate(f.firstDate)}</span>
                      </span>
                    ))}
                  </div>
                </div>
              )}
              {consistentCore.length > 0 && (
                <div>
                  <p className="text-xs text-slate-500 uppercase tracking-wide mb-2">Who&apos;s Showing Up</p>
                  <div className="space-y-1">
                    {visibleCore.map((c) => (
                      <div key={c.ccbId} className="flex items-center justify-between text-sm">
                        <span className="text-slate-200 truncate">{c.name}</span>
                        <span className="text-xs text-slate-500 shrink-0 ml-3 tabular-nums">
                          {c.attended} of {c.ofMeetings}
                        </span>
                      </div>
                    ))}
                  </div>
                  {consistentCore.length > 8 && (
                    <button
                      type="button"
                      onClick={() => setShowAllConsistency((v) => !v)}
                      className="text-xs text-slate-400 hover:text-white mt-2 transition-colors"
                    >
                      {showAllConsistency ? 'Show less' : `Show all ${consistentCore.length}`}
                    </button>
                  )}
                </div>
              )}
            </div>
          )}

          {/* AI narrative */}
          <div className="mt-5 pt-4 border-t border-zinc-700">
            {genError && (
              <div className="mb-3 bg-red-500/10 border border-red-500/30 rounded-lg px-4 py-3 text-sm text-red-300 flex items-start justify-between gap-3">
                <span>{genError}</span>
                <button type="button" onClick={() => setGenError(null)} className="text-red-400 hover:text-red-300 shrink-0">✕</button>
              </div>
            )}

            {generating ? (
              <div className="flex items-center gap-3 py-3">
                <div className="w-5 h-5 border-2 border-zinc-600 border-t-indigo-500 rounded-full animate-spin shrink-0" />
                <div>
                  <p className="text-sm text-slate-200">Reading {metrics.meetings.met} meeting{metrics.meetings.met === 1 ? '' : 's'} of notes…</p>
                  <p className="text-xs text-slate-500">Building the coaching snapshot</p>
                </div>
              </div>
            ) : saved ? (
              <div>
                <div className="max-h-[500px] overflow-y-auto pr-1">
                  <AiSummaryMarkdown text={saved.summary_text} />
                </div>
                <div className="flex flex-wrap items-center justify-between gap-2 mt-3 pt-3 border-t border-zinc-700/60">
                  <p className="text-xs text-slate-500">
                    Generated {fmtDateYear(saved.generated_at)} · {fmtDate(saved.start_date)} – {fmtDate(saved.end_date)}
                  </p>
                  <button
                    type="button"
                    onClick={generate}
                    className="text-slate-400 hover:text-white hover:bg-zinc-700 px-3 py-1.5 rounded-lg text-xs transition-colors"
                  >
                    Regenerate (uses AI quota)
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-sm text-slate-400 flex-1 min-w-[240px]">
                  Get an AI coaching read on this timeframe — new people, themes in the notes, what to celebrate, what to watch.
                </p>
                <button
                  type="button"
                  onClick={generate}
                  className="bg-btn-primary text-white px-4 py-2 rounded-lg text-sm font-medium hover:opacity-90 transition-opacity shrink-0"
                >
                  Generate AI Summary
                </button>
              </div>
            )}
          </div>
        </>
      ) : null}
    </div>
  );
}
