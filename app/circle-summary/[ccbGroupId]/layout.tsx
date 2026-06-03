import type { ReactNode } from 'react';
import { redirect } from 'next/navigation';
import { getSessionLeader } from '../../../lib/circle-summary/session';
import CircleChrome from './CircleChrome';

export const dynamic = 'force-dynamic';

// Server component: the leader (and the header name) come straight from the
// session cookie, so there's no client /api/circle-summary/me round trip and no
// "Your Circle" → real-name flash. The pathname-dependent chrome lives in the
// CircleChrome client island.
export default async function CircleGroupLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: { ccbGroupId: string };
}) {
  const leader = await getSessionLeader();
  if (!leader) redirect('/circle-summary/');
  const leaderGroupId = leader.ccb_group_id != null ? String(leader.ccb_group_id) : null;
  if (leaderGroupId && leaderGroupId !== params.ccbGroupId) {
    redirect(`/circle-summary/${leaderGroupId}/events`);
  }

  return (
    <CircleChrome
      groupId={params.ccbGroupId}
      leader={{
        id: leader.id,
        name: leader.name,
        campus: leader.campus ?? null,
        ccb_group_id: leader.ccb_group_id ?? null,
      }}
    >
      {children}
    </CircleChrome>
  );
}
