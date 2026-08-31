import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { getSessionStudentLeader } from '../../../lib/student-toolkit/session';
import { getToolkitOnboardingState } from '../../../lib/student-toolkit/onboarding';
import {
  STUDENT_TOOLKIT_PREFIX,
  isStudentToolkitHostName,
  studentToolkitPath,
  studentToolkitLeaderPath,
} from '../../../lib/student-toolkit/paths';
import OnboardingClient from './OnboardingClient';

export const dynamic = 'force-dynamic';

export default async function StudentToolkitOnboardingPage() {
  // On the dedicated student host the toolkit is served at the root, so every
  // link here drops the /student-toolkit prefix instead of eating a 308.
  const hostname = (headers().get('host') || '').split(':')[0];
  const cleanHost = isStudentToolkitHostName(hostname);

  const leader = await getSessionStudentLeader();
  if (!leader) redirect(studentToolkitPath(`${STUDENT_TOOLKIT_PREFIX}/`, { cleanHost }));

  const onboarding = await getToolkitOnboardingState(leader.id);
  if (onboarding.isComplete) {
    redirect(studentToolkitLeaderPath(leader.id, 'home/', { cleanHost }));
  }

  return (
    <OnboardingClient
      leaderName={leader.name}
      initialOnboarding={onboarding}
      homeHref={studentToolkitLeaderPath(leader.id, 'home/', { cleanHost })}
      rosterHref={studentToolkitLeaderPath(leader.id, 'roster/', { cleanHost })}
    />
  );
}
