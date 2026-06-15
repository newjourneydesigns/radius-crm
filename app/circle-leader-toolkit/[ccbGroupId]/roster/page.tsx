import { redirect } from 'next/navigation';
import { getSessionLeader } from '../../../../lib/circle-leader-toolkit/session';
import { loadLeaderRoster, loadLeaderAttendance } from '../../../../lib/circle-leader-toolkit/roster-data';
import { createTimer } from '../../../../lib/circle-leader-toolkit/timing';
import RosterClient from './RosterClient';

export const dynamic = 'force-dynamic';

// Server-rendered first paint: the roster and the "last attended" map resolve
// server-side from the shared cache (no skeleton on the warm path). RosterClient
// then revalidates contact details / attendance in the background.
export default async function CircleRosterPage() {
  const timer = createTimer('roster-page');
  const leader = await getSessionLeader();
  timer.mark('session');
  if (!leader) redirect('/circle-leader-toolkit/');

  const groupId = leader.ccb_group_id != null ? String(leader.ccb_group_id) : '';

  const [rosterResult, attendanceResult] = await Promise.all([
    loadLeaderRoster(leader),
    loadLeaderAttendance(leader),
  ]);
  timer.mark('data');
  timer.end({
    groupId,
    leaderId: leader.id,
    participantCount: rosterResult.participants.length,
    rosterSource: rosterResult.source,
    rosterNeedsRefresh: rosterResult.needsRosterRefresh,
    attendanceSource: attendanceResult.source,
  });

  return (
    <RosterClient
      groupId={groupId}
      initialParticipants={rosterResult.participants}
      initialLastAttended={attendanceResult.lastAttended}
      initialError={rosterResult.error ?? null}
    />
  );
}
