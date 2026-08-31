import { redirect } from 'next/navigation';
import { getSessionStudentLeader } from '../../../../lib/student-toolkit/session';
import { loadStudentRoster } from '../../../../lib/student-toolkit/roster-data';
import { formatTerm } from '../../../../lib/student-toolkit/terms';
import RosterClient from './RosterClient';

export const dynamic = 'force-dynamic';

/**
 * Server-rendered first paint. The roster and both attendance dates resolve
 * server-side from the synced tables — no skeleton on the warm path, and no
 * CCB call. RosterClient revalidates in the background.
 */
export default async function StudentRosterPage() {
  const leader = await getSessionStudentLeader();
  if (!leader) redirect('/student-toolkit/');

  const { rows, term, attendanceConnected, error } = await loadStudentRoster(leader);

  return (
    <RosterClient
      leaderId={String(leader.id)}
      campus={leader.campus ?? null}
      termLabel={formatTerm(term)}
      initialRows={rows}
      initialAttendanceConnected={attendanceConnected}
      initialError={error ?? null}
    />
  );
}
