import { redirect } from 'next/navigation';
import { getSessionStudentLeader } from '../../../../lib/student-toolkit/session';
import SettingsClient from './SettingsClient';

export const dynamic = 'force-dynamic';

export default async function StudentSettingsPage() {
  const leader = await getSessionStudentLeader();
  if (!leader) redirect('/student-toolkit/');
  return <SettingsClient />;
}
