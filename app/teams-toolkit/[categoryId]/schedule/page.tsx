import { redirect } from 'next/navigation';
import { DateTime } from 'luxon';
import { getSessionLeader } from '../../../../lib/teams-toolkit/session';
import { loadTeamSchedule } from '../../../../lib/teams-toolkit/schedule-data';
import type { ScheduleResponseStatus } from '../../../../lib/ccb/ccb-v2-client';

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

function dateHeading(date: string, dateTime: string): string {
  const iso = date || (dateTime ? dateTime.slice(0, 10) : '');
  if (!iso) return 'Upcoming';
  const dt = DateTime.fromISO(iso);
  return dt.isValid ? dt.toFormat('cccc, LLL d') : iso;
}

export default async function TeamSchedulePage() {
  const leader = await getSessionLeader();
  if (!leader) redirect('/teams-toolkit/');

  const { occurrences, error } = await loadTeamSchedule(leader);

  return (
    <main className="max-w-2xl mx-auto px-4 py-6 space-y-5">
      <section className="cs-card">
        <h2 className="text-lg font-bold text-neutral-900 tracking-tight">Schedule</h2>
        <p className="text-xs text-neutral-500 mt-0.5">
          Who's scheduled in your positions, and whether they've responded. Managed in CCB.
        </p>
      </section>

      {error && <div className="cs-alert cs-alert-warning">{error}</div>}

      {!error && occurrences.length === 0 && (
        <div className="text-center py-12 border border-dashed border-neutral-200 rounded-xl bg-neutral-50">
          <p className="text-neutral-500 text-sm font-medium">Nothing scheduled</p>
          <p className="text-neutral-400 text-xs mt-1">
            Upcoming dates with people scheduled in your positions will appear here.
          </p>
        </div>
      )}

      {occurrences.map((occ) => (
        <section key={occ.id} className="ts-position-card">
          <div className="ts-position-head">
            <span className="ts-position-name">{dateHeading(occ.date, occ.dateTime)}</span>
            {occ.title && <span className="ts-position-count">{occ.title}</span>}
          </div>

          {occ.positions.map((position) => (
            <div key={position.positionId}>
              <div className="px-4 pt-3 pb-1 text-[11px] font-bold uppercase tracking-wide text-neutral-500">
                {position.positionName}
              </div>
              {position.people.map((person) => {
                const meta = STATUS_META[person.status] ?? STATUS_META.unknown;
                const tel = person.mobile.replace(/[^\d+]/g, '');
                return (
                  <div key={`${position.positionId}-${person.id}`} className="ts-roster-row">
                    <span className="ts-roster-avatar" aria-hidden="true">
                      {initials(person.name)}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="ts-roster-name truncate">{person.name}</span>
                        <span className={`ts-status ${meta.cls}`}>{meta.label}</span>
                      </div>
                      {person.status === 'declined' && person.declineReason && (
                        <div className="ts-roster-contact">Reason: {person.declineReason}</div>
                      )}
                    </div>
                    {tel && (
                      <div className="flex items-center gap-1.5 shrink-0">
                        <a className="ts-contact-btn" href={`tel:${tel}`} aria-label={`Call ${person.name}`}>
                          Call
                        </a>
                        <a className="ts-contact-btn" href={`sms:${tel}`} aria-label={`Text ${person.name}`}>
                          Text
                        </a>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ))}
        </section>
      ))}
    </main>
  );
}
