import { redirect } from 'next/navigation';
import { getSessionStudentLeader } from '../../../../lib/student-toolkit/session';
import ResourcesClient from './ResourcesClient';

export const dynamic = 'force-dynamic';

// Bare /resources shows the first page in nav order; deep links to a specific
// page live at /resources/[slug].
export default async function StudentResourcesPage() {
  const leader = await getSessionStudentLeader();
  if (!leader) redirect('/student-toolkit/');
  return <ResourcesClient />;
}
