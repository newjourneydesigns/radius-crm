import { redirect } from 'next/navigation';
import { getSessionStudentLeader } from '../../../../lib/student-toolkit/session';
import HomeClient from './HomeClient';

export const dynamic = 'force-dynamic';

/**
 * Home is the Student Toolkit's message center.
 *
 * The Circle Leader Toolkit hangs its message center off the events page,
 * because circle leaders land there to submit summaries. Student leaders submit
 * none, so there is no events page and the message center is the landing tab in
 * its own right. A static calendar block will sit under it later.
 */
export default async function StudentHomePage() {
  const leader = await getSessionStudentLeader();
  // The layout already guards this; repeated here so the page can never render
  // without a leader if it is ever reached directly.
  if (!leader) redirect('/student-toolkit/');

  return <HomeClient />;
}
