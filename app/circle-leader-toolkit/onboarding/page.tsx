import { redirect } from 'next/navigation';
import { getSessionLeader } from '../../../lib/circle-leader-toolkit/session';
import { getToolkitOnboardingState } from '../../../lib/circle-leader-toolkit/onboarding';
import { loadActiveDynamicQuestions } from '../../../lib/circle-leader-toolkit/questions-data';
import OnboardingClient from './OnboardingClient';
import type { DynamicQuestion } from '../../../components/circle-leader-toolkit/DynamicQuestionField';

export const dynamic = 'force-dynamic';

export default async function CircleToolkitOnboardingPage() {
  const leader = await getSessionLeader();
  if (!leader) redirect('/circle-leader-toolkit/');

  const groupId = leader.ccb_group_id != null ? String(leader.ccb_group_id) : '';
  const onboarding = await getToolkitOnboardingState(leader.id);
  if (onboarding.isComplete) {
    redirect(groupId ? `/circle-leader-toolkit/${groupId}/events` : '/circle-leader-toolkit/events');
  }

  // Load the same admin-configured questions the real summary form uses so the
  // practice event mirrors the leader's actual "Tell us more" questions.
  const { questions } = await loadActiveDynamicQuestions();

  return (
    <OnboardingClient
      groupId={groupId}
      leaderName={leader.name}
      initialOnboarding={onboarding}
      questions={(questions ?? []) as DynamicQuestion[]}
    />
  );
}
