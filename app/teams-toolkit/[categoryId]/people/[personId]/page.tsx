import { redirect } from 'next/navigation';
import { DateTime } from 'luxon';
import { getSessionLeader } from '../../../../../lib/teams-toolkit/session';
import { loadTeamPerson } from '../../../../../lib/teams-toolkit/person-data';
import type { TeamPersonServing, TeamServeStats } from '../../../../../lib/teams-toolkit/person-data';
import { teamsToolkitGroupPath } from '../../../../../lib/teams-toolkit/paths';
import type { ScheduleServeStatus } from '../../../../../lib/ccb/ccb-v2-client';

export const dynamic = 'force-dynamic';

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

const STATUS_META: Record<ScheduleServeStatus, { label: string; cls: string }> = {
  checked_in: { label: 'Served', cls: 'ts-status-checked_in' },
  accepted: { label: 'Accepted', cls: 'ts-status-accepted' },
  declined: { label: 'Declined', cls: 'ts-status-declined' },
  no_show: { label: 'No show', cls: 'ts-status-no_show' },
  pending: { label: 'Pending', cls: 'ts-status-pending' },
  unknown: { label: 'Unknown', cls: 'ts-status-unknown' },
};

function dateLabel(iso: string): string {
  if (!iso) return '';
  const dt = DateTime.fromISO(iso);
  return dt.isValid ? dt.toFormat('cccc, LLL d') : iso;
}

function ServingRow({ h }: { h: TeamPersonServing }) {
  const meta = STATUS_META[h.status] ?? STATUS_META.unknown;
  return (
    <div className="ts-roster-row">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="ts-roster-name truncate">{dateLabel(h.date)}</span>
          <span className={`ts-status ${meta.cls}`}>{meta.label}</span>
        </div>
        <div className="ts-roster-contact truncate">{h.positionName}</div>
        {h.status === 'declined' && h.declineReason && (
          <div className="ts-roster-contact">Reason: {h.declineReason}</div>
        )}
      </div>
    </div>
  );
}

/** A monthly serving-% card with a progress bar and 50%-commitment marker. */
function ServeStatCard({
  heading,
  noun,
  stats,
}: {
  heading: string;
  noun: string; // "served" | "accepted"
  stats: TeamServeStats;
}) {
  const hasData = stats.pct != null;
  const pctClass = !hasData
    ? 'ts-serve-pct-none'
    : stats.meetsCommitment
    ? 'ts-serve-pct-met'
    : 'ts-serve-pct-miss';
  const fillClass = stats.meetsCommitment ? 'ts-serve-fill-met' : 'ts-serve-fill-miss';

  return (
    <div className="ts-serve-stat">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-xs font-semibold text-neutral-500 uppercase tracking-wide">{heading}</span>
        <span className="text-[11px] text-neutral-400">{stats.monthLabel}</span>
      </div>
      <div className="mt-1.5 flex items-end gap-2">
        <span className={`ts-serve-pct ${pctClass}`}>{hasData ? `${stats.pct}%` : '—'}</span>
        {hasData && (
          <span className="text-xs text-neutral-500 mb-0.5">
            {stats.count} of {stats.requests} {noun}
          </span>
        )}
      </div>
      {hasData ? (
        <div className="ts-serve-track" aria-hidden="true">
          <div className={`ts-serve-fill ${fillClass}`} style={{ width: `${Math.min(stats.pct!, 100)}%` }} />
          <div className="ts-serve-target" />
        </div>
      ) : (
        <p className="text-[11px] text-neutral-400 mt-1">No serving requests {noun === 'served' ? 'last' : 'next'} month.</p>
      )}
      <p className="text-[11px] text-neutral-400 mt-1.5">
        {hasData
          ? stats.meetsCommitment
            ? `Meets the ${stats.commitmentPct}% monthly commitment.`
            : `Below the ${stats.commitmentPct}% monthly commitment.`
          : `Commitment is ${stats.commitmentPct}% of requests.`}
      </p>
    </div>
  );
}

export default async function TeamPersonPage({
  params,
}: {
  params: { categoryId: string; personId: string };
}) {
  const leader = await getSessionLeader();
  if (!leader) redirect('/teams-toolkit/');

  const rosterHref = teamsToolkitGroupPath(params.categoryId, 'roster');
  const { person, notFound, error } = await loadTeamPerson(leader, params.personId);

  if (error) {
    return (
      <main className="max-w-2xl mx-auto px-4 py-6 space-y-5">
        <a href={rosterHref} className="ts-back-link">‹ Back to roster</a>
        <div className="cs-alert cs-alert-warning">{error}</div>
      </main>
    );
  }

  if (notFound || !person) {
    return (
      <main className="max-w-2xl mx-auto px-4 py-6 space-y-5">
        <a href={rosterHref} className="ts-back-link">‹ Back to roster</a>
        <div className="text-center py-12 border border-dashed border-neutral-200 rounded-xl bg-neutral-50">
          <p className="text-neutral-500 text-sm font-medium">Not on your roster</p>
          <p className="text-neutral-400 text-xs mt-1">
            This person isn&apos;t serving in any of the positions you lead.
          </p>
        </div>
      </main>
    );
  }

  const tel = person.mobile.replace(/[^\d+]/g, '');

  return (
    <main className="max-w-2xl mx-auto px-4 py-6 space-y-5">
      <a href={rosterHref} className="ts-back-link">‹ Back to roster</a>

      {/* Identity + contact */}
      <section className="cs-card">
        <div className="flex items-center gap-3.5">
          <span className="ts-person-avatar" aria-hidden="true">{initials(person.name)}</span>
          <div className="min-w-0 flex-1">
            <h2 className="text-lg font-bold text-neutral-900 tracking-tight truncate">{person.name}</h2>
            {(person.mobile || person.email) && (
              <p className="text-xs text-neutral-500 truncate">
                {person.mobile || person.email}
              </p>
            )}
          </div>
        </div>

        {(tel || person.email) && (
          <div className="mt-4 grid grid-cols-2 gap-2">
            {tel ? (
              <a className="ts-action-btn ts-action-btn-primary" href={`tel:${tel}`}>
                Call
              </a>
            ) : null}
            {tel ? (
              <a className="ts-action-btn" href={`sms:${tel}`}>
                Text
              </a>
            ) : null}
            {!tel && person.email ? (
              <a className="ts-action-btn ts-action-btn-primary col-span-2" href={`mailto:${person.email}`}>
                Email
              </a>
            ) : null}
          </div>
        )}
      </section>

      {/* Team + position(s) held */}
      <section className="ts-position-card">
        <div className="ts-position-head">
          <span className="ts-position-name">On your teams</span>
        </div>
        {person.memberships.map((m) => (
          <div key={m.positionId} className="ts-roster-row">
            <div className="min-w-0 flex-1">
              <div className="ts-roster-name truncate">{m.positionName}</div>
              {m.teamName && <div className="ts-roster-contact truncate">{m.teamName}</div>}
            </div>
          </div>
        ))}
      </section>

      {/* Serving % — last & next calendar month */}
      <section className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <ServeStatCard heading="Served last month" noun="served" stats={person.pastMonth} />
        <ServeStatCard heading="Accepted next month" noun="accepted" stats={person.nextMonth} />
      </section>

      {/* Serving requests — last 4 weeks */}
      <section className="ts-position-card">
        <div className="ts-position-head">
          <span className="ts-position-name">Recent serving</span>
          <span className="ts-position-count">Last 4 weeks</span>
        </div>
        {person.history.length === 0 ? (
          <div className="px-4 py-6 text-center">
            <p className="text-neutral-400 text-xs">No scheduled serving in the last 4 weeks.</p>
          </div>
        ) : (
          person.history.map((h) => (
            <ServingRow key={`past-${h.occurrenceId}-${h.positionName}`} h={h} />
          ))
        )}
      </section>

      {/* Serving requests — next 4 weeks */}
      <section className="ts-position-card">
        <div className="ts-position-head">
          <span className="ts-position-name">Upcoming serving</span>
          <span className="ts-position-count">Next 4 weeks</span>
        </div>
        {person.upcoming.length === 0 ? (
          <div className="px-4 py-6 text-center">
            <p className="text-neutral-400 text-xs">No scheduled serving in the next 4 weeks.</p>
          </div>
        ) : (
          person.upcoming.map((h) => (
            <ServingRow key={`next-${h.occurrenceId}-${h.positionName}`} h={h} />
          ))
        )}
      </section>
    </main>
  );
}
