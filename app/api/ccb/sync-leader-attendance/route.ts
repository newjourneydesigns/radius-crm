import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createCCBClient } from '../../../../lib/ccb/ccb-client';

export const dynamic = 'force-dynamic';

function getServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

/**
 * POST /api/ccb/sync-leader-attendance
 *
 * Syncs the last 3 weeks of CCB event attendance for a single leader,
 * upserts into circle_meeting_occurrences, and refreshes the roster cache.
 *
 * Body: { leaderId: number }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const leaderId = Number(body.leaderId);

    if (!leaderId || !Number.isFinite(leaderId)) {
      return NextResponse.json(
        { error: 'Missing or invalid leaderId' },
        { status: 400 }
      );
    }

    const supabase = getServiceClient();

    // Load the leader
    const { data: leader, error: leaderError } = await supabase
      .from('circle_leaders')
      .select('id, name, circle_name, ccb_group_name, ccb_group_id, day, frequency, meeting_start_date')
      .eq('id', leaderId)
      .single();

    if (leaderError || !leader) {
      return NextResponse.json(
        { error: 'Leader not found', details: leaderError },
        { status: 404 }
      );
    }

    if (!leader.ccb_group_id) {
      return NextResponse.json(
        { error: 'Leader has no CCB group ID configured' },
        { status: 400 }
      );
    }

    let ccbClient: ReturnType<typeof createCCBClient>;
    try {
      ccbClient = createCCBClient();
    } catch (err: any) {
      return NextResponse.json(
        { error: 'CCB client initialization failed', details: err.message },
        { status: 500 }
      );
    }

    // Date range: last 3 weeks
    const today = new Date();
    const threeWeeksAgo = new Date(today);
    threeWeeksAgo.setDate(today.getDate() - 21);
    const startDate = threeWeeksAgo.toISOString().split('T')[0];
    const endDate = today.toISOString().split('T')[0];

    // Match priority: ccb_group_name (explicit override) → circle_name → leader.name
    const ccbSearchName = leader.ccb_group_name || leader.circle_name || leader.name;

    console.log(`🔄 Sync leader attendance: ${leader.name} (${leaderId}), CCB name="${ccbSearchName}", range=${startDate} → ${endDate}`);

    // Fetch events from CCB using the circle name so CCB group names match correctly
    const events = await ccbClient.searchEventsByDateAndName(
      ccbSearchName,
      startDate,
      endDate,
      { includeAttendees: true }
    );

    console.log(`📦 Found ${events.length} CCB events for ${ccbSearchName}`);

    const results = {
      synced: 0,
      errors: 0,
      rosterRefreshed: false,
      rosterCount: 0,
      eventsFound: events.length,
      dateRange: { startDate, endDate },
    };

    // Upsert attendance records
    for (const event of events) {
      const att = event.attendance;
      if (!event.occurDate) continue;

      const attendeeCount = att?.attendees?.length || 0;
      const extraHeadCount = att?.headCount || 0;
      const totalCount = (attendeeCount + extraHeadCount) || null;

      const { data: occ, error: occError } = await supabase
        .from('circle_meeting_occurrences')
        .upsert(
          {
            leader_id: leaderId,
            ccb_event_id: event.eventId || null,
            meeting_date: event.occurDate,
            status: att?.didNotMeet ? 'did_not_meet' : 'met',
            headcount: totalCount,
            regular_count: null,
            visitor_count: null,
            source: 'event_summary',
            raw_payload: {
              eventId: event.eventId,
              title: event.title,
              headCount: att?.headCount,
              didNotMeet: att?.didNotMeet,
              topic: att?.topic,
              notes: att?.notes,
              attendeeCount,
            },
            synced_at: new Date().toISOString(),
          },
          { onConflict: 'leader_id,meeting_date' }
        )
        .select('id')
        .single();

      if (occError) {
        console.warn(`⚠️ Upsert error for ${event.occurDate}:`, occError.message);
        results.errors++;
        continue;
      }

      // Upsert attendees
      if (occ && att?.attendees && att.attendees.length > 0) {
        await supabase
          .from('circle_meeting_attendees')
          .delete()
          .eq('occurrence_id', occ.id);

        await supabase.from('circle_meeting_attendees').insert(
          att.attendees.map((a) => ({
            occurrence_id: occ.id,
            ccb_individual_id: a.id || '',
            name: a.name || 'Unknown',
            attendance_type: a.status?.toLowerCase().includes('visit')
              ? 'visitor'
              : 'regular',
          }))
        );
      }

      results.synced++;
    }

    // Refresh roster cache
    try {
      const participants = await ccbClient.getGroupParticipants(String(leader.ccb_group_id));
      if (participants.length > 0) {
        const now = new Date().toISOString();
        const { error: rosterError } = await supabase
          .from('circle_roster_cache')
          .upsert(
            participants.map((p) => ({
              circle_leader_id: leaderId,
              ccb_group_id: String(leader.ccb_group_id),
              ccb_individual_id: p.id,
              first_name: p.firstName,
              last_name: p.lastName,
              full_name: p.fullName,
              email: p.email,
              phone: p.phone,
              mobile_phone: p.mobilePhone,
              fetched_at: now,
            })),
            { onConflict: 'circle_leader_id,ccb_individual_id' }
          );

        if (rosterError) {
          console.error(`Roster cache error for ${leader.name}:`, rosterError);
        } else {
          results.rosterRefreshed = true;
          results.rosterCount = participants.length;
          console.log(`✅ Roster refreshed for ${leader.name}: ${participants.length} members`);
        }
      }
    } catch (rosterErr) {
      console.error(`Roster fetch failed for ${leader.name}:`, rosterErr);
    }

    console.log(`✅ Sync complete for ${leader.name}:`, results);
    return NextResponse.json({ success: true, ...results });
  } catch (error: any) {
    console.error('sync-leader-attendance error:', error);
    return NextResponse.json(
      { error: 'Sync failed', details: error.message },
      { status: 500 }
    );
  }
}
