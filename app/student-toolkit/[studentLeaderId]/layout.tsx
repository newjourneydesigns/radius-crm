import type { ReactNode } from 'react';
import { redirect } from 'next/navigation';
import {
  getSessionStudentLeader,
  type StudentSessionLeader,
} from '../../../lib/student-toolkit/session';
import { studentToolkitLeaderPath } from '../../../lib/student-toolkit/paths';
import { formatTerm, isValidTerm } from '../../../lib/student-toolkit/terms';
import StudentChrome from './StudentChrome';

export const dynamic = 'force-dynamic';

/**
 * Onboarding state lives on the leader row (same shape as the Circle Leader
 * Toolkit), and the session already selects those columns — so the common path
 * resolves with no extra query. The roster walkthrough is the last step, so its
 * stamp is what marks onboarding finished; a leader who skipped it (dismissed)
 * has still finished.
 */
function isOnboardingComplete(leader: StudentSessionLeader): boolean {
  return Boolean(
    leader.toolkit_onboarding_completed_at ||
      leader.toolkit_roster_completed_at ||
      leader.toolkit_roster_dismissed_at
  );
}

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
  const leader = await getSessionStudentLeader();
  if (!leader) redirect('/student-toolkit/');

  // The URL id is decoration: every page loads data for the session's own
  // leader. A mismatch means a stale bookmark or a shared link, so send them to
  // their own toolkit rather than rendering someone else's id in the address bar.
  const sessionLeaderId = String(leader.id);
  if (params.studentLeaderId !== sessionLeaderId) {
    redirect(`${studentToolkitLeaderPath(sessionLeaderId, 'roster')}/`);
  }

  if (!isOnboardingComplete(leader)) {
    redirect('/student-toolkit/onboarding/');
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
