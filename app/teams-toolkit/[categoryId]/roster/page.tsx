import { redirect } from 'next/navigation';
import { getSessionLeader } from '../../../../lib/teams-toolkit/session';
import { loadTeamRoster } from '../../../../lib/teams-toolkit/roster-data';
import { loadTeamMessages } from '../../../../lib/teams-toolkit/messages-data';
import { renderMessageHtml } from '../../../../lib/renderMessageHtml';

export const dynamic = 'force-dynamic';

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export default async function TeamRosterPage() {
  const leader = await getSessionLeader();
  if (!leader) redirect('/teams-toolkit/');

  const [roster, messages] = await Promise.all([
    loadTeamRoster(leader),
    loadTeamMessages(leader),
  ]);

  const totalVolunteers = roster.positions.reduce((sum, p) => sum + p.volunteers.length, 0);

  return (
    <main className="max-w-2xl mx-auto px-4 py-6 space-y-5">
      {/* Message Center — admin-managed announcements for this campus */}
      {messages.map((message) => (
        <section key={message.id} className="cs-card">
          <h2 className="text-sm font-extrabold text-neutral-900 tracking-tight">{message.header}</h2>
          {message.body_html && (
            <div
              className="cs-message-body mt-2 text-sm text-neutral-700"
              dangerouslySetInnerHTML={{ __html: renderMessageHtml(message.body_html) }}
            />
          )}
          {message.url && (
            <a className="cs-message-cta" href={message.url} target="_blank" rel="noopener noreferrer">
              {message.url_label || 'Open link'}
            </a>
          )}
        </section>
      ))}

      <section className="cs-card">
        <div className="mb-1 flex items-baseline justify-between gap-3">
          <h2 className="text-lg font-bold text-neutral-900 tracking-tight">Team Roster</h2>
          {totalVolunteers > 0 && (
            <span className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
              {totalVolunteers} {totalVolunteers === 1 ? 'person' : 'people'}
            </span>
          )}
        </div>
        <p className="text-xs text-neutral-500">The volunteers serving in the positions you lead.</p>
      </section>

      {roster.error && (
        <div className="cs-alert cs-alert-warning">{roster.error}</div>
      )}

      {!roster.error && roster.positions.length === 0 && (
        <div className="text-center py-12 border border-dashed border-neutral-200 rounded-xl bg-neutral-50">
          <p className="text-neutral-500 text-sm font-medium">No roster yet</p>
          <p className="text-neutral-400 text-xs mt-1">
            Once positions are assigned to your team, your roster will appear here.
          </p>
        </div>
      )}

      {roster.positions.map((position) => (
        <section key={position.positionId} className="ts-position-card">
          <div className="ts-position-head">
            <span className="ts-position-name">{position.positionName}</span>
            <span className="ts-position-count">
              {position.volunteers.length} {position.volunteers.length === 1 ? 'person' : 'people'}
            </span>
          </div>
          {position.volunteers.map((volunteer) => (
            <div key={volunteer.id} className="ts-roster-row">
              <span className="ts-roster-avatar" aria-hidden="true">
                {initials(volunteer.name)}
              </span>
              <div className="min-w-0 flex-1">
                <div className="ts-roster-name truncate">{volunteer.name}</div>
                <div className="ts-roster-contact truncate">
                  {volunteer.mobile ? (
                    <a className="ts-roster-contact-link" href={`tel:${volunteer.mobile}`}>
                      {volunteer.mobile}
                    </a>
                  ) : null}
                  {volunteer.mobile && volunteer.email ? ' · ' : ''}
                  {volunteer.email ? (
                    <a className="ts-roster-contact-link" href={`mailto:${volunteer.email}`}>
                      {volunteer.email}
                    </a>
                  ) : null}
                  {!volunteer.mobile && !volunteer.email ? 'No contact on file' : ''}
                </div>
              </div>
            </div>
          ))}
        </section>
      ))}
    </main>
  );
}
