import type { ReactNode } from 'react';
import { redirect } from 'next/navigation';
import { getSessionLeader } from '../../../lib/circle-leader-toolkit/session';
import {
  getToolkitOnboardingState,
  onboardingStateFromRow,
} from '../../../lib/circle-leader-toolkit/onboarding';
import CircleChrome from './CircleChrome';

export const dynamic = 'force-dynamic';

// Server component: the leader (and the header name) come straight from the
// session cookie, so there's no client /api/circle-leader-toolkit/me round trip and no
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
  if (!leader) redirect('/circle-leader-toolkit/');
  const leaderGroupId = leader.ccb_group_id != null ? String(leader.ccb_group_id) : null;
  if (leaderGroupId && leaderGroupId !== params.ccbGroupId) {
    redirect(`/circle-leader-toolkit/${leaderGroupId}/events`);
  }
  // The onboarding timestamps ride along on the session's embedded leader row,
  // so the common path resolves with no extra query. The fallback only runs on
  // the pre-migration session select, which omits them.
  const onboarding =
    leader.toolkit_onboarding_completed_at !== undefined
      ? onboardingStateFromRow(leader as unknown as Record<string, string | null>)
      : await getToolkitOnboardingState(leader.id);
  if (!onboarding.isComplete) {
    redirect('/circle-leader-toolkit/onboarding');
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
