import { redirect } from 'next/navigation';
import { getSessionLeader } from '../../../../../../lib/circle-leader-toolkit/session';
import { loadLeaderRoster, loadLeaderAttendance } from '../../../../../../lib/circle-leader-toolkit/roster-data';
import { loadActiveDynamicQuestions } from '../../../../../../lib/circle-leader-toolkit/questions-data';
import { loadEventDraft } from '../../../../../../lib/circle-leader-toolkit/draft-data';
import { createTimer } from '../../../../../../lib/circle-leader-toolkit/timing';
import EventFormClient, { type EventFormInitialData } from './EventFormClient';

export const dynamic = 'force-dynamic';

// Server-rendered first paint: the leader, roster, active questions, draft, and
// attendance all resolve server-side in parallel so the form is interactive on
// load with no /me, /roster, /dynamic-questions, /draft client fetch waterfall.
// If any server load throws, we render the client without initial data and it
// falls back to its own fetch path — the form still works, just a touch slower.
export default async function CircleSummaryFormPage({
  params,
}: {
  params: { ccbGroupId: string; eventId: string; occurrence: string };
}) {
  const timer = createTimer('event-form-page');
  const leader = await getSessionLeader();
  timer.mark('session');
  if (!leader) redirect('/circle-leader-toolkit');

  const urlGroupId = params.ccbGroupId ?? '';
  const eventId = params.eventId ?? '';
  const occurrence = decodeURIComponent(params.occurrence ?? '');

  // Guard against URL tampering — bounce to the leader's own events list if the
  // URL group ID doesn't match their circle.
  const leaderGroupId = leader.ccb_group_id != null ? String(leader.ccb_group_id) : null;
  if (leaderGroupId && leaderGroupId !== urlGroupId) {
    redirect(`/circle-leader-toolkit/${leaderGroupId}/events`);
  }

  let initial: EventFormInitialData | undefined;
  try {
    const [rosterResult, questionsResult, draftResult, attendanceResult] = await Promise.all([
      loadLeaderRoster(leader),
      loadActiveDynamicQuestions(),
      loadEventDraft(leader, eventId, occurrence),
      loadLeaderAttendance(leader),
    ]);
    timer.mark('data');

    // Event was removed from the leader's summary list — send them back rather
    // than render a stale form.
    if (draftResult.ignored) {
      redirect(`/circle-leader-toolkit/${urlGroupId}/events`);
    }

    initial = {
      leader: {
        id: leader.id,
        name: leader.name,
        day: leader.day ?? null,
        time: leader.time ?? null,
        ccb_group_id: leader.ccb_group_id ?? null,
      },
      participants: (rosterResult.participants ?? []) as EventFormInitialData['participants'],
      questions: (questionsResult.questions ?? []) as EventFormInitialData['questions'],
      draft: {
        draft: draftResult.draft,
        updatedAt: draftResult.updatedAt,
        source: draftResult.source,
        ...(draftResult.submittedStatus ? { submittedStatus: draftResult.submittedStatus } : {}),
      },
      lastAttended: attendanceResult.lastAttended ?? {},
    };
  } catch (err) {
    // `redirect()` throws internally — let it propagate. Anything else falls
    // back to the client fetch path.
    if (err && typeof err === 'object' && 'digest' in err && String((err as { digest?: string }).digest).startsWith('NEXT_REDIRECT')) {
      throw err;
    }
    console.warn('[circle-summary/event-form] server prefetch failed, falling back to client fetch:', err instanceof Error ? err.message : err);
    initial = undefined;
  }

  timer.end({ groupId: urlGroupId, leaderId: leader.id, eventId, serverRendered: Boolean(initial) });

  return <EventFormClient initial={initial} />;
}
