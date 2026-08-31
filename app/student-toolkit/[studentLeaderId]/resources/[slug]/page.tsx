import { redirect } from 'next/navigation';
import { getSessionStudentLeader } from '../../../../../lib/student-toolkit/session';
import ResourcesClient from '../ResourcesClient';

export const dynamic = 'force-dynamic';

export default async function StudentResourcePage({
  params,
}: {
  params: { studentLeaderId: string; slug: string };
}) {
  const leader = await getSessionStudentLeader();
  if (!leader) redirect('/student-toolkit/');
  return <ResourcesClient slug={decodeURIComponent(params.slug ?? '')} />;
}
