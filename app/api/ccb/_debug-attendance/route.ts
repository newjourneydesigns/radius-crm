import { NextResponse } from 'next/server';
import { createCCBClient } from '../../../../lib/ccb/ccb-client';
import { getCCBRequestContext } from '../../../../lib/ccb/ccb-api-gateway';

export const dynamic = 'force-dynamic';

// Temporary diagnostic — calls attendance_profiles raw so we can see what CCB
// is actually returning for a date range, without any filtering or error
// swallowing. Remove once the Event Explorer issue is resolved.
export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const start = url.searchParams.get('start');
    const end = url.searchParams.get('end');
    if (!start || !end) {
      return NextResponse.json({ error: 'start and end query params required (YYYY-MM-DD)' }, { status: 400 });
    }

    const ccb = createCCBClient(await getCCBRequestContext(request, {
      module: 'CCB Diagnostics',
      action: 'Debug Attendance Profiles',
      direction: 'pull',
    }));

    const xml: any = await (ccb as any).getXml({
      srv: 'attendance_profiles',
      start_date: start,
      end_date: end,
    });

    const response = xml?.ccb_api?.response ?? null;
    const eventsRoot = response?.events ?? null;
    const rawEvents: any[] = Array.isArray(eventsRoot?.event)
      ? eventsRoot.event
      : eventsRoot?.event ? [eventsRoot.event] : [];

    return NextResponse.json({
      responseKeys: response ? Object.keys(response) : null,
      eventsRootType: eventsRoot === null ? 'null' : typeof eventsRoot,
      eventsRootKeys: eventsRoot && typeof eventsRoot === 'object' ? Object.keys(eventsRoot) : null,
      rawEventCount: rawEvents.length,
      sampleEvents: rawEvents.slice(0, 25).map((e: any) => ({
        id: e?.['@_id'] ?? e?.id ?? null,
        occurrence: e?.['@_occurrence'] ?? e?.occurrence ?? null,
        name: String(e?.name || e?.event_name || ''),
        groupName: String(e?.group?.name || ''),
        groupId: e?.group?.['@_id'] ?? e?.group?.id ?? null,
        headCount: e?.head_count ?? null,
        didNotMeet: e?.did_not_meet ?? null,
        hasNotes: Boolean(e?.notes),
        hasPrayer: Boolean(e?.prayers || e?.prayer_requests),
        hasTopic: Boolean(e?.topic),
      })),
    });
  } catch (err: any) {
    return NextResponse.json(
      {
        error: 'Debug call failed',
        message: err?.message || String(err),
        ccbErrorType: err?.ccbErrorType,
        ccbErrorNumber: err?.ccbErrorNumber,
      },
      { status: 500 }
    );
  }
}
