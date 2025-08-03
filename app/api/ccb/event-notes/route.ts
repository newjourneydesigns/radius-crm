import { NextRequest, NextResponse } from 'next/server';

interface CCBEventNotesParams {
  groupId: string;
  startDate: string;
  endDate: string;
}

interface CCBEventNote {
  eventId: string;
  eventName: string;
  eventDate: string;
  notes: string;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { groupId, startDate, endDate }: CCBEventNotesParams = body;

    console.log('🔍 CCB API Request:', { groupId, startDate, endDate });

    // Validate required parameters
    if (!groupId || !startDate || !endDate) {
      return NextResponse.json(
        { error: 'Missing required parameters: groupId, startDate, endDate' },
        { status: 400 }
      );
    }

    // Get CCB API credentials from environment variables
    const CCB_BASE_URL = process.env.CCB_BASE_URL;
    const CCB_API_USER = process.env.CCB_API_USER;
    const CCB_API_PASSWORD = process.env.CCB_API_PASSWORD;

    console.log('🔍 CCB Environment Check:', {
      CCB_BASE_URL: CCB_BASE_URL ? 'SET' : 'MISSING',
      CCB_API_USER: CCB_API_USER ? 'SET' : 'MISSING',
      CCB_API_PASSWORD: CCB_API_PASSWORD ? 'SET' : 'MISSING'
    });

    if (!CCB_BASE_URL || !CCB_API_USER || !CCB_API_PASSWORD) {
      console.error('Missing CCB API configuration');
      return NextResponse.json(
        { error: 'CCB API not configured' },
        { status: 500 }
      );
    }

    // Create Basic Auth header
    const auth = Buffer.from(`${CCB_API_USER}:${CCB_API_PASSWORD}`).toString('base64');
    console.log('🔍 Auth header created:', auth.substring(0, 20) + '...');

    // Test basic API access
    console.log('🔍 Testing basic API access...');
    const testUrl = `${CCB_BASE_URL}?srv=api_status`;
    console.log('🔍 Testing with:', testUrl);

    const testResponse = await fetch(testUrl, {
      method: 'GET',
      headers: {
        'Authorization': `Basic ${auth}`,
      },
    });

    console.log('🔍 Test API Response:', {
      status: testResponse.status,
      statusText: testResponse.statusText
    });

    if (testResponse.ok) {
      const testXml = await testResponse.text();
      console.log('🔍 Test API XML Response:', testXml.substring(0, 1000));
    }

    // Try attendance_profile endpoint with pagination to find all events
    console.log('🔍 Trying attendance_profile endpoint for specific events...');
    
    // First, we need to get events from event_profiles to get event IDs and dates
    // Use July 1, 2025 as the search start date to capture July 28 event
    // Check multiple pages to ensure we find all events
    console.log('🔍 Getting events from event_profiles with pagination...');
    
    const relevantEvents = [];
    const foundGroupIds = new Set();
    let page = 1;
    let hasMorePages = true;
    
    while (hasMorePages && page <= 10) { // Limit to 10 pages for safety
      const eventProfilesParams = new URLSearchParams({
        srv: 'event_profiles',
        modified_since: '2025-07-01',
        page: page.toString(),
        per_page: '100'
      });

      const eventProfilesUrl = `${CCB_BASE_URL}?${eventProfilesParams}`;
      console.log(`🔍 Checking page ${page}:`, eventProfilesUrl);

      const eventProfilesResponse = await fetch(eventProfilesUrl, {
        method: 'GET',
        headers: {
          'Authorization': `Basic ${auth}`,
          'Content-Type': 'application/xml',
        },
      });

      if (eventProfilesResponse.ok) {
        const eventProfilesXml = await eventProfilesResponse.text();
        console.log(`🔍 Page ${page} XML Response length:`, eventProfilesXml.length);
        
        // Extract events that match our group ID
        const eventMatches = eventProfilesXml.match(/<event id="[^"]*">[\s\S]*?<\/event>/g) || [];
        console.log(`🔍 Found ${eventMatches.length} events on page ${page}`);
        
        for (const eventMatch of eventMatches) {
          const eventIdMatch = eventMatch.match(/<event id="([^"]*)">/);
          const groupIdMatch = eventMatch.match(/<group id="([^"]*)">/);
          const startDateTimeMatch = eventMatch.match(/<start_datetime>([^<]*)<\/start_datetime>/);
          const eventNameMatch = eventMatch.match(/<name>([^<]*)<\/name>/);
          
          if (groupIdMatch) {
            foundGroupIds.add(groupIdMatch[1]);
          }
          
          if (eventIdMatch && groupIdMatch && startDateTimeMatch && eventNameMatch) {
            if (groupIdMatch[1] === groupId) {
              // Convert datetime to date format for occurrence parameter
              const eventDate = startDateTimeMatch[1].split(' ')[0]; // Get just the date part
              relevantEvents.push({
                id: eventIdMatch[1],
                name: eventNameMatch[1],
                occurrence: eventDate,
                datetime: startDateTimeMatch[1]
              });
              console.log(`📅 Found relevant event: ${eventNameMatch[1]} on ${eventDate} (Event ID: ${eventIdMatch[1]})`);
            }
          }
        }
        
        // Check if we have more events (if we got 100 events, there might be more)
        hasMorePages = eventMatches.length === 100;
        page++;
      } else {
        console.error(`Failed to fetch page ${page}:`, eventProfilesResponse.status);
        hasMorePages = false;
      }
    }
    
    console.log(`🔍 All group IDs found across all pages:`, Array.from(foundGroupIds).sort());
    console.log(`🔍 Looking for group ID: ${groupId}`);
    console.log(`🔍 Found ${relevantEvents.length} total events for group ${groupId}`);
    
    // Now get attendance_profile for each relevant event
    const eventNotes: CCBEventNote[] = [];
    
    for (const event of relevantEvents) {
      const attendanceProfileParams = new URLSearchParams({
        srv: 'attendance_profile',
        id: event.id,
        occurrence: event.occurrence
      });

      const attendanceProfileUrl = `${CCB_BASE_URL}?${attendanceProfileParams}`;
      console.log(`🔍 Getting attendance for event ${event.id} on ${event.occurrence}:`, attendanceProfileUrl);

      const attendanceProfileResponse = await fetch(attendanceProfileUrl, {
        method: 'GET',
        headers: {
          'Authorization': `Basic ${auth}`,
          'Content-Type': 'application/xml',
        },
      });

      if (attendanceProfileResponse.ok) {
        const attendanceProfileXml = await attendanceProfileResponse.text();
        console.log(`🔍 Attendance Profile XML for event ${event.id}:`, attendanceProfileXml.substring(0, 1000));
        
        // Extract notes from the attendance XML
        const notesMatch = attendanceProfileXml.match(/<notes>([\s\S]*?)<\/notes>/);
        const notes = notesMatch && notesMatch[1] ? notesMatch[1].trim() : '';
        
        if (notes) {
          const eventNote: CCBEventNote = {
            eventId: event.id,
            eventName: event.name,
            eventDate: event.datetime,
            notes: notes
          };
          
          eventNotes.push(eventNote);
          console.log(`✅ Added event with attendance notes: ${event.name}`);
        } else {
          console.log(`📝 No notes found for event: ${event.name}`);
        }
      } else {
        console.log(`❌ Failed to get attendance for event ${event.id}: ${attendanceProfileResponse.status}`);
      }
    }
    
    return NextResponse.json({
      success: true,
      groupId,
      startDate,
      endDate,
      eventNotes: eventNotes,
      totalEvents: eventNotes.length,
      source: 'attendance_profile'
    });

  } catch (error) {
    console.error('CCB API integration error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
