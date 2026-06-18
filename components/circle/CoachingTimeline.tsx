'use client';

import { useMemo } from 'react';
import { DateTime } from 'luxon';
import { HandHeart, Heart, MessageCircle, NotebookPen, Sparkles, TrendingUp, type LucideIcon } from 'lucide-react';
import { useCoachingTimeline, type TimelineEvent } from '../../hooks/useCoachingTimeline';

interface CoachingTimelineProps {
  leaderId: number;
}

// Per-dimension accent, matching the ACPD tracking section's palette.
const DIMENSION_ACCENT: Record<string, string> = {
  reach: 'text-blue-400 bg-blue-500/10 ring-blue-500/30',
  connect: 'text-green-400 bg-green-500/10 ring-green-500/30',
  disciple: 'text-purple-400 bg-purple-500/10 ring-purple-500/30',
  develop: 'text-orange-400 bg-orange-500/10 ring-orange-500/30',
};

const TYPE_META: Record<TimelineEvent['type'], { icon: LucideIcon; accent: string }> = {
  automation: { icon: Sparkles, accent: 'text-emerald-400 bg-emerald-500/10 ring-emerald-500/30' },
  coaching_note: { icon: NotebookPen, accent: 'text-slate-300 bg-slate-500/10 ring-slate-500/30' },
  encouragement: { icon: Heart, accent: 'text-rose-400 bg-rose-500/10 ring-rose-500/30' },
  prayer: { icon: HandHeart, accent: 'text-violet-400 bg-violet-500/10 ring-violet-500/30' },
  score: { icon: TrendingUp, accent: 'text-sky-400 bg-sky-500/10 ring-sky-500/30' },
  touchpoint: { icon: MessageCircle, accent: 'text-teal-400 bg-teal-500/10 ring-teal-500/30' },
};

function accentFor(event: TimelineEvent): string {
  if (event.dimension && DIMENSION_ACCENT[event.dimension]) return DIMENSION_ACCENT[event.dimension];
  return TYPE_META[event.type].accent;
}

function relativeTime(iso: string): string {
  const dt = DateTime.fromISO(iso);
  return dt.isValid ? dt.toRelative({ base: DateTime.now() }) ?? '' : '';
}

function exactTime(iso: string): string {
  const dt = DateTime.fromISO(iso);
  return dt.isValid ? dt.toFormat('MMM d, yyyy · h:mm a') : '';
}

export default function CoachingTimeline({ leaderId }: CoachingTimelineProps) {
  const { events, isLoading, error } = useCoachingTimeline(leaderId);

  // Group events under day headers so a long history stays scannable.
  const groups = useMemo(() => {
    const byDay = new Map<string, { label: string; events: TimelineEvent[] }>();
    for (const e of events) {
      const dt = DateTime.fromISO(e.timestamp);
      const key = dt.isValid ? dt.toFormat('yyyy-MM-dd') : 'unknown';
      const label = dt.isValid ? dt_label(dt) : 'Earlier';
      if (!byDay.has(key)) byDay.set(key, { label, events: [] });
      byDay.get(key)!.events.push(e);
    }
    return Array.from(byDay.values());
  }, [events]);

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 py-6 text-sm text-slate-400">
        <span className="w-4 h-4 border-2 border-zinc-600 border-t-vc-500 rounded-full animate-spin" />
        Loading timeline…
      </div>
    );
  }

  if (error) {
    return <p className="py-4 text-sm text-red-400">{error}</p>;
  }

  if (events.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-zinc-700 p-8 text-center">
        <p className="text-sm text-slate-400">
          Nothing yet. Coaching nudges, notes, encouragements, and scorecard changes will appear here as they happen.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {groups.map((group) => (
        <div key={group.label}>
          <p className="mb-3 text-xs font-medium uppercase tracking-wide text-slate-500">{group.label}</p>
          <ul className="relative space-y-3 before:absolute before:left-[15px] before:top-2 before:bottom-2 before:w-px before:bg-zinc-800">
            {group.events.map((event) => {
              const Icon = TYPE_META[event.type].icon;
              return (
                <li key={event.id} className="relative flex gap-3">
                  <span
                    className={`relative z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full ring-1 ${accentFor(event)}`}
                  >
                    <Icon className="h-4 w-4" />
                  </span>
                  <div className="min-w-0 flex-1 rounded-lg border border-zinc-800 bg-zinc-900/40 px-3.5 py-2.5">
                    <div className="flex items-start justify-between gap-3">
                      <p className="text-sm font-medium text-slate-100">
                        {event.title}
                        {event.resolved && (
                          <span className="ml-2 align-middle text-[10px] uppercase tracking-wide text-emerald-400">
                            Resolved
                          </span>
                        )}
                      </p>
                      <time
                        className="shrink-0 text-[11px] text-slate-500"
                        title={exactTime(event.timestamp)}
                      >
                        {relativeTime(event.timestamp)}
                      </time>
                    </div>
                    {event.detail && (
                      <p className="mt-1 whitespace-pre-line text-sm leading-relaxed text-slate-400">{event.detail}</p>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </div>
  );
}

/** "Today" / "Yesterday" / a full date, for the day header. */
function dt_label(dt: DateTime): string {
  const today = DateTime.now().startOf('day');
  const day = dt.startOf('day');
  const diff = today.diff(day, 'days').days;
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Yesterday';
  return dt.toFormat('cccc, LLL d');
}
