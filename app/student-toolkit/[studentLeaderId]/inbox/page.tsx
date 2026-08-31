import { redirect } from 'next/navigation';
import { getSessionStudentLeader } from '../../../../lib/student-toolkit/session';
import InboxClient from './InboxClient';

export const dynamic = 'force-dynamic';

export default async function StudentInboxPage() {
  const leader = await getSessionStudentLeader();
  if (!leader) redirect('/student-toolkit/');
  return <InboxClient />;
}
