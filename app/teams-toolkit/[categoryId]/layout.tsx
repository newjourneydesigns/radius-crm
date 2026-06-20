import type { ReactNode } from 'react';
import { redirect } from 'next/navigation';
import { getSessionLeader } from '../../../lib/teams-toolkit/session';
import TeamChrome from './TeamChrome';

export const dynamic = 'force-dynamic';

// Server component: the leader (and the header name) come straight from the
// session cookie, so there's no client /me round trip and no name flash.
export default async function TeamsGroupLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: { categoryId: string };
}) {
  const leader = await getSessionLeader();
  if (!leader) redirect('/teams-toolkit/');

  const leaderCategoryId = leader.ccb_category_id != null ? String(leader.ccb_category_id) : null;
  if (leaderCategoryId && leaderCategoryId !== params.categoryId) {
    redirect(`/teams-toolkit/${leaderCategoryId}/roster`);
  }

  return (
    <TeamChrome
      categoryId={params.categoryId}
      leader={{
        id: leader.id,
        name: leader.name,
        campus: leader.campus ?? null,
        team_name: leader.team_name ?? null,
        ccb_category_id: leader.ccb_category_id ?? null,
      }}
    >
      {children}
    </TeamChrome>
  );
}
