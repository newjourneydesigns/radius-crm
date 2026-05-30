import { redirect } from 'next/navigation';
import { getSessionLeader } from '../../../../lib/circle-summary/session';
import { loadLeaderRoster, loadLeaderAttendance } from '../../../../lib/circle-summary/roster-data';
import RosterClient from './RosterClient';

export const dynamic = 'force-dynamic';

// Server-rendered first paint: the roster and the "last attended" map resolve
// server-side from the shared cache (no skeleton on the warm path). RosterClient
// then revalidates contact details / attendance in the background.
export default async function CircleRosterPage() {
  const leader = await getSessionLeader();
  if (!leader) redirect('/circle-summary');

  const groupId = leader.ccb_group_id != null ? String(leader.ccb_group_id) : '';

  const [rosterResult, attendanceResult] = await Promise.all([
    loadLeaderRoster(leader),
    loadLeaderAttendance(leader),
  ]);

  return (
    <RosterClient
      groupId={groupId}
      initialParticipants={rosterResult.participants}
      initialLastAttended={attendanceResult.lastAttended}
      initialError={rosterResult.error ?? null}
    />
  );
}
