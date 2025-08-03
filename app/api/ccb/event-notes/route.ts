import { NextRequest, NextResponse } from 'next/server';

// Mark this route as dynamic
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const groupId = searchParams.get('groupId') || '';
    const startDate = searchParams.get('startDate') || '2025-07-01';
    const endDate = searchParams.get('endDate') || '2025-08-03';
    const leaderName = searchParams.get('leaderName') || '';

    console.log('CCB Event Notes API called:', { groupId, startDate, endDate, leaderName });

    // Validate environment variables
    const CCB_BASE_URL = process.env.CCB_BASE_URL;
    const CCB_API_USER = process.env.CCB_API_USER;
    const CCB_API_PASSWORD = process.env.CCB_API_PASSWORD;

    if (!CCB_BASE_URL || !CCB_API_USER || !CCB_API_PASSWORD) {
      console.error('Missing CCB environment variables');
      return NextResponse.json({
        success: false,
        error: 'CCB API configuration missing',
        groupId,
        startDate,
        endDate,
        leaderName
      }, { status: 500 });
    }

    // First, get group profile to understand what events belong to this group
    const groupUrl = `${CCB_BASE_URL}/group_profile_from_id?srv=group_profile_from_id&id=${groupId}&include_participants=false`;
    console.log('Getting group profile:', groupUrl);
    
    const groupResponse = await fetch(groupUrl, {
      method: 'GET',
      headers: {
        'Authorization': `Basic ${Buffer.from(`${CCB_API_USER}:${CCB_API_PASSWORD}`).toString('base64')}`,
        'Content-Type': 'application/xml'
      }
    });

    const groupData = await groupResponse.text();
    console.log('Group response status:', groupResponse.status);
    console.log('Group data length:', groupData.length);

    if (!groupResponse.ok) {
      return NextResponse.json({
        success: false,
        error: `Group lookup failed: ${groupResponse.status} ${groupResponse.statusText}`,
        debug: {
          groupUrl,
          responseStatus: groupResponse.status,
          responseData: groupData.substring(0, 500)
        }
      }, { status: 500 });
    }

    // Now try to get events for all groups in date range and see structure
    const eventUrl = `${CCB_BASE_URL}/event_profiles?srv=event_profiles&modified_since=${startDate}`;
    console.log('Getting event profiles:', eventUrl);
    
    const eventResponse = await fetch(eventUrl, {
      method: 'GET',
      headers: {
        'Authorization': `Basic ${Buffer.from(`${CCB_API_USER}:${CCB_API_PASSWORD}`).toString('base64')}`,
        'Content-Type': 'application/xml'
      }
    });

    const eventData = await eventResponse.text();
    console.log('Event response status:', eventResponse.status);
    console.log('Event data length:', eventData.length);

    // Parse both responses for analysis
    const eventNotes: any[] = [];
    const sampleEvents: any[] = [];
    
    // Look for events that mention our group
    if (eventResponse.ok) {
      const eventRegex = /<event[^>]*>[\s\S]*?<\/event>/g;
      const events = eventData.match(eventRegex) || [];
      
      console.log('Found events from event_profiles:', events.length);
      
      // Check first few events for structure
      for (let i = 0; i < Math.min(3, events.length); i++) {
        const event = events[i];
        
        const eventIdMatch = event.match(/<event[^>]*id="([^"]*)"[^>]*>/);
        const eventId = eventIdMatch ? eventIdMatch[1] : null;
        
        const eventNameMatch = event.match(/<name>([^<]*)<\/name>/);
        const eventName = eventNameMatch ? eventNameMatch[1] : 'Unknown Event';
        
        const groupMatch = event.match(/<group[^>]*id="([^"]*)"[^>]*>/);
        const eventGroupId = groupMatch ? groupMatch[1] : null;
        
        sampleEvents.push({
          eventId,
          eventName,
          eventGroupId,
          fullEventXml: event.substring(0, 800)
        });
      }
      
      // Look for events belonging to our group or matching leader name
      for (const event of events) {
        const groupMatch = event.match(/<group[^>]*id="([^"]*)"[^>]*>/);
        const eventGroupId = groupMatch ? groupMatch[1] : null;
        
        const eventNameMatch = event.match(/<name>([^<]*)<\/name>/);
        const eventName = eventNameMatch ? eventNameMatch[1] : 'Unknown Event';
        
        // Check if event matches our criteria
        const matchesGroup = groupId && eventGroupId === groupId;
        const matchesLeader = leaderName && eventName.toLowerCase().includes(leaderName.toLowerCase());
        
        if (matchesGroup || matchesLeader) {
          const eventIdMatch = event.match(/<event[^>]*id="([^"]*)"[^>]*>/);
          const eventId = eventIdMatch ? eventIdMatch[1] : null;
          
          const startDateMatch = event.match(/<start_datetime>([^<]*)<\/start_datetime>/);
          const eventDate = startDateMatch ? startDateMatch[1] : '';
          
          // Filter by date range if event date is available
          if (eventDate) {
            const eventDateObj = new Date(eventDate);
            const startDateObj = new Date(startDate);
            const endDateObj = new Date(endDate);
            
            if (eventDateObj < startDateObj || eventDateObj > endDateObj) {
              continue; // Skip events outside date range
            }
          }
          
          const descriptionMatch = event.match(/<description>([^<]*)<\/description>/);
          const description = descriptionMatch ? descriptionMatch[1] : '';
          
          const leaderNotesMatch = event.match(/<leader_notes>([^<]*)<\/leader_notes>/);
          const leaderNotes = leaderNotesMatch ? leaderNotesMatch[1] : '';
          
          const combinedNotes = [description, leaderNotes].filter(n => n.trim()).join(' | ');
          
          eventNotes.push({
            eventId,
            eventName,
            eventDate,
            notes: combinedNotes || 'No notes available',
            source: 'event_profiles',
            groupId: eventGroupId,
            matchType: matchesGroup ? (matchesLeader ? 'group_and_leader' : 'group') : 'leader_name'
          });
        }
      }
    }

    return NextResponse.json({
      success: true,
      groupId,
      startDate,
      endDate,
      leaderName,
      eventNotes,
      foundGroupEvents: eventNotes.length,
      debug: {
        groupResponseStatus: groupResponse.status,
        eventResponseStatus: eventResponse.status,
        groupDataLength: groupData.length,
        eventDataLength: eventData.length,
        sampleEvents,
        groupDataSample: groupData.substring(0, 1000),
        eventDataSample: eventData.substring(0, 1000)
      }
    });

  } catch (error) {
    console.error('CCB API debug error:', error);
    return NextResponse.json({
      success: false,
      error: `Internal error: ${error.message}`
    }, { status: 500 });
  }
}
