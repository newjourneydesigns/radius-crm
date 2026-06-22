import { redirect } from 'next/navigation';
import { getSessionLeader } from '../../../../lib/teams-toolkit/session';
import { loadTeamRoster } from '../../../../lib/teams-toolkit/roster-data';
import { loadTeamMessages } from '../../../../lib/teams-toolkit/messages-data';
import { renderMessageHtml } from '../../../../lib/renderMessageHtml';
import TeamRosterList from './TeamRosterList';

export const dynamic = 'force-dynamic';

export default async function TeamRosterPage({
  params,
}: {
  params: { categoryId: string };
}) {
  const leader = await getSessionLeader();
  if (!leader) redirect('/teams-toolkit/');

  const [roster, messages] = await Promise.all([
    loadTeamRoster(leader),
    loadTeamMessages(leader),
  ]);

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

      <TeamRosterList
        categoryId={params.categoryId}
        positions={roster.positions}
        error={roster.error}
      />
    </main>
  );
}
