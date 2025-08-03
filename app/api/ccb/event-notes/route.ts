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

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const groupId = searchParams.get('groupId');
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');

    if (!groupId || !startDate || !endDate) {
      return NextResponse.json(
        { error: 'Missing required parameters: groupId, startDate, endDate' },
        { status: 400 }
      );
    }

    return await processCCBRequest(groupId, startDate, endDate);
  } catch (error) {
    console.error('CCB API integration error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { groupId, startDate, endDate }: CCBEventNotesParams = body;

    return await processCCBRequest(groupId, startDate, endDate);
  } catch (error) {
    console.error('CCB API integration error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// Helper function to process CCB API request
async function processCCBRequest(groupId: string, startDate: string, endDate: string) {
  try {
    console.log('🔍 CCB API Request:', { groupId, startDate, endDate });

    // Validate required parameters
    if (!groupId || !startDate || !endDate) {
      throw new Error('Missing required parameters: groupId, startDate, endDate');
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

    // Use attendance_profiles service with date range to get all attendance records
    console.log('🔍 Using attendance_profiles service with date range...');
    
    const attendanceProfilesParams = new URLSearchParams({
      srv: 'attendance_profiles',
      start_date: startDate,
      end_date: endDate
    });

    const attendanceProfilesUrl = `${CCB_BASE_URL}?${attendanceProfilesParams}`;
    console.log(`🔍 Fetching attendance profiles:`, attendanceProfilesUrl);

    const attendanceProfilesResponse = await fetch(attendanceProfilesUrl, {
      method: 'GET',
      headers: {
        'Authorization': `Basic ${auth}`,
        'Content-Type': 'application/xml',
      },
    });

    console.log('🔍 Attendance Profiles Response:', {
      status: attendanceProfilesResponse.status,
      statusText: attendanceProfilesResponse.statusText
    });

    if (!attendanceProfilesResponse.ok) {
      console.error('Failed to fetch attendance profiles:', attendanceProfilesResponse.status);
      return NextResponse.json({
        success: false,
        error: `Failed to fetch attendance profiles: ${attendanceProfilesResponse.status}`,
        groupId,
        startDate,
        endDate
      });
    }

    const attendanceProfilesXml = await attendanceProfilesResponse.text();
    console.log(`🔍 Attendance Profiles XML Response (first 2000 chars):`, attendanceProfilesXml.substring(0, 2000));
    
    // Parse the XML to find events for our specific group
    const eventNotes: CCBEventNote[] = [];
    const foundGroupIds = new Set();
    
    // Extract all event blocks from the XML
    const eventMatches = attendanceProfilesXml.match(/<event id="[^"]*">[\s\S]*?<\/event>/g) || [];
    console.log(`🔍 Found ${eventMatches.length} events in attendance profiles`);
    
    for (const eventMatch of eventMatches) {
      const eventIdMatch = eventMatch.match(/<event id="([^"]*)">/);
      const eventNameMatch = eventMatch.match(/<name>([^<]*)<\/name>/);
      const occurrenceMatch = eventMatch.match(/<occurrence>([^<]*)<\/occurrence>/);
      const notesMatch = eventMatch.match(/<notes>([\s\S]*?)<\/notes>/);
      
      if (eventIdMatch && eventNameMatch && occurrenceMatch) {
        const eventId = eventIdMatch[1];
        const eventName = eventNameMatch[1];
        const occurrence = occurrenceMatch[1];
        const notes = notesMatch && notesMatch[1] ? notesMatch[1].trim() : '';
        
        console.log(`� Processing event: ID=${eventId}, Name="${eventName}", Occurrence=${occurrence}`);
        
        // We need to get the group information for this event
        // Use event_profile service to get the group info for this event
        const eventProfileParams = new URLSearchParams({
          srv: 'event_profile',
          id: eventId
        });

        const eventProfileUrl = `${CCB_BASE_URL}?${eventProfileParams}`;
        console.log(`🔍 Getting event profile for event ${eventId}:`, eventProfileUrl);

        const eventProfileResponse = await fetch(eventProfileUrl, {
          method: 'GET',
          headers: {
            'Authorization': `Basic ${auth}`,
            'Content-Type': 'application/xml',
          },
        });

        if (eventProfileResponse.ok) {
          const eventProfileXml = await eventProfileResponse.text();
          const groupIdMatch = eventProfileXml.match(/<group id="([^"]*)">/);
          
          if (groupIdMatch) {
            const eventGroupId = groupIdMatch[1];
            foundGroupIds.add(eventGroupId);
            
            console.log(`🔍 Event ${eventId} belongs to group ${eventGroupId}`);
            
            // Check if this event belongs to our target group
            if (eventGroupId === groupId) {
              console.log(`✅ Found matching event for group ${groupId}: ${eventName} on ${occurrence}`);
              
              if (notes) {
                const eventNote: CCBEventNote = {
                  eventId: eventId,
                  eventName: eventName,
                  eventDate: occurrence,
                  notes: notes
                };
                
                eventNotes.push(eventNote);
                console.log(`📝 Added event with notes: ${eventName} on ${occurrence}`);
              } else {
                console.log(`📝 No notes found for event: ${eventName} on ${occurrence}`);
              }
            }
          } else {
            console.log(`❌ Could not find group ID for event ${eventId}`);
          }
        } else {
          console.log(`❌ Failed to get event profile for event ${eventId}: ${eventProfileResponse.status}`);
        }
        
        // Add a small delay to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }
    
    return NextResponse.json({
      success: true,
      groupId,
      startDate,
      endDate,
      eventNotes: eventNotes,
      totalEvents: eventNotes.length,
      source: 'attendance_profiles',
      debug: {
        attendanceEventsFound: eventMatches.length,
        allGroupIdsFound: Array.from(foundGroupIds).slice(0, 10), // First 10 for debugging
        totalGroupIds: foundGroupIds.size
      }
    });

  } catch (error) {
    console.error('CCB API integration error:', error);
    throw error;
  }
}
