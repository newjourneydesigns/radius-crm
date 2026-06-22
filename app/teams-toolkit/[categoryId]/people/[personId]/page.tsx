import { redirect } from 'next/navigation';
import { DateTime } from 'luxon';
import { getSessionLeader } from '../../../../../lib/teams-toolkit/session';
import { loadTeamPerson } from '../../../../../lib/teams-toolkit/person-data';
import { teamsToolkitGroupPath } from '../../../../../lib/teams-toolkit/paths';
import type { ScheduleResponseStatus } from '../../../../../lib/ccb/ccb-v2-client';

export const dynamic = 'force-dynamic';

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

const STATUS_META: Record<ScheduleResponseStatus, { label: string; cls: string }> = {
  accepted: { label: 'Accepted', cls: 'ts-status-accepted' },
  declined: { label: 'Declined', cls: 'ts-status-declined' },
  pending: { label: 'Pending', cls: 'ts-status-pending' },
  unknown: { label: 'Unknown', cls: 'ts-status-pending' },
};

function dateLabel(iso: string): string {
  if (!iso) return '';
  const dt = DateTime.fromISO(iso);
  return dt.isValid ? dt.toFormat('cccc, LLL d') : iso;
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

      {/* Serving history — last 4 weeks */}
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
          person.history.map((h) => {
            const meta = STATUS_META[h.status] ?? STATUS_META.unknown;
            return (
              <div key={`${h.occurrenceId}-${h.positionName}`} className="ts-roster-row">
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
          })
        )}
      </section>
    </main>
  );
}
