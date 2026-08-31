import type { ReactNode } from 'react';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { getSessionStudentLeader } from '../../../lib/student-toolkit/session';
import {
  getToolkitOnboardingState,
  onboardingStateFromRow,
} from '../../../lib/student-toolkit/onboarding';
import {
  STUDENT_TOOLKIT_PREFIX,
  isStudentToolkitHostName,
  studentToolkitLeaderPath,
  studentToolkitPath,
} from '../../../lib/student-toolkit/paths';
import { formatTerm, isValidTerm } from '../../../lib/student-toolkit/terms';
import StudentChrome from './StudentChrome';

export const dynamic = 'force-dynamic';

/**
 * Server component: the leader — and the name in the header — come straight from
 * the session cookie, so there's no client /me round trip and no "Your Circle" →
 * real-name flash. The pathname-dependent chrome lives in the StudentChrome
 * client island.
 */
export default async function StudentLeaderLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: { studentLeaderId: string };
}) {
  // On the dedicated student host the toolkit is served at the root, so
  // redirects drop the /student-toolkit prefix instead of eating a 308.
  const hostname = (headers().get('host') || '').split(':')[0];
  const cleanHost = isStudentToolkitHostName(hostname);

  const leader = await getSessionStudentLeader();
  if (!leader) redirect(studentToolkitPath(`${STUDENT_TOOLKIT_PREFIX}/`, { cleanHost }));

  // The URL id is decoration: every page loads data for the session's own
  // leader. A mismatch means a stale bookmark or a shared link, so send them to
  // their own toolkit rather than rendering someone else's id in the address bar.
  const sessionLeaderId = String(leader.id);
  if (params.studentLeaderId !== sessionLeaderId) {
    redirect(studentToolkitLeaderPath(sessionLeaderId, 'roster/', { cleanHost }));
  }

  // The onboarding timestamps ride along on the session's embedded leader row,
  // so the common path resolves with no extra query. The fallback only runs on
  // a pre-migration session select, which omits them.
  const onboarding =
    leader.toolkit_onboarding_completed_at !== undefined
      ? onboardingStateFromRow(leader as unknown as Record<string, string | null>)
      : await getToolkitOnboardingState(leader.id);
  if (!onboarding.isComplete) {
    redirect(studentToolkitPath(`${STUDENT_TOOLKIT_PREFIX}/onboarding/`, { cleanHost }));
  }

  return (
    <StudentChrome
      leaderId={sessionLeaderId}
      leader={{
        name: leader.name,
        campus: leader.campus ?? null,
        // Formatted here rather than in the client island: terms.ts also holds
        // resolveActiveTerm, which pulls the service-role Supabase client in.
        termLabel: isValidTerm(leader.term) ? formatTerm(leader.term) : null,
      }}
    >
      {children}
    </StudentChrome>
  );
}
