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

// Helper function to process CCB API request - simplified for speed
async function processCCBRequest(groupId: string, startDate: string, endDate: string) {
  try {
    console.log('🔍 CCB API Request (Simple):', { groupId, startDate, endDate });

    // Get CCB API credentials from environment variables
    const CCB_BASE_URL = process.env.CCB_BASE_URL;
    const CCB_API_USER = process.env.CCB_API_USER;
    const CCB_API_PASSWORD = process.env.CCB_API_PASSWORD;

    if (!CCB_BASE_URL || !CCB_API_USER || !CCB_API_PASSWORD) {
      console.error('Missing CCB API configuration');
      return NextResponse.json(
        { error: 'CCB API not configured' },
        { status: 500 }
      );
    }

    // Create Basic Auth header
    const auth = Buffer.from(`${CCB_API_USER}:${CCB_API_PASSWORD}`).toString('base64');
    console.log('🔍 Auth header created for simple test');

    // Try different endpoints to understand the API structure
    console.log('Testing CCB API endpoints...');
    
    // First, test group_profiles to see if the group exists
    const groupUrl = `${CCB_BASE_URL}/group_profiles?srv=group_profiles&group_id=${groupId}`;
    console.log('Testing group URL:', groupUrl);
    
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
        groupId,
        startDate,
        endDate,
        debug: {
          groupUrl,
          responseStatus: groupResponse.status,
          responseData: groupData.substring(0, 500)
        }
      }, { status: 500 });
    }

    // CCB attendance_profiles service fetches ALL attendance data for date range
    // Then we filter for the specific group we want
    const attendanceUrl = `${CCB_BASE_URL}/attendance_profiles?srv=attendance_profiles&start_date=${startDate}&end_date=${endDate}`;
    console.log('Testing attendance URL:', attendanceUrl);
    
    const attendanceResponse = await fetch(attendanceUrl, {
      method: 'GET',
      headers: {
        'Authorization': `Basic ${Buffer.from(`${CCB_API_USER}:${CCB_API_PASSWORD}`).toString('base64')}`,
        'Content-Type': 'application/xml'
      }
    });

    const xmlData = await attendanceResponse.text();
    console.log('Attendance response status:', attendanceResponse.status);
    console.log('XML Response length:', xmlData.length);

    if (!attendanceResponse.ok) {
      return NextResponse.json({
        success: false,
        error: `CCB API error: ${attendanceResponse.status} ${attendanceResponse.statusText}`,
        groupId,
        startDate,
        endDate,
        debug: {
          attendanceUrl,
          responseStatus: attendanceResponse.status,
          responseData: xmlData.substring(0, 500),
          groupTestPassed: true
        }
      }, { status: 500 });
    }
    
    // Parse the XML to extract event information for our specific group
    const eventNotes: any[] = [];
    
    // Find all event entries that match our group ID
    const eventRegex = /<event[^>]*>[\s\S]*?<\/event>/g;
    const events = xmlData.match(eventRegex) || [];
    
    console.log('Found total events:', events.length);
    
    let groupEventsFound = 0;
    for (const event of events) {
      try {
        // Check if this event belongs to our target group
        const groupMatch = event.match(/<group[^>]*id="([^"]*)"[^>]*>/);
        const eventGroupId = groupMatch ? groupMatch[1] : null;
        
        if (eventGroupId === groupId) {
          groupEventsFound++;
          
          // Extract event name
          const eventNameMatch = event.match(/<name>([^<]*)<\/name>/);
          const eventName = eventNameMatch ? eventNameMatch[1] : 'Unknown Event';
          
          // Extract event occurrence/date
          const occurrenceMatch = event.match(/<occurrence>([^<]*)<\/occurrence>/);
          const occurrenceDate = occurrenceMatch ? occurrenceMatch[1] : '';
          
          // Extract notes
          const notesMatch = event.match(/<notes>([^<]*)<\/notes>/);
          const notes = notesMatch ? notesMatch[1] : '';
          
          // Extract topic
          const topicMatch = event.match(/<topic>([^<]*)<\/topic>/);
          const topic = topicMatch ? topicMatch[1] : '';
          
          // Extract prayer requests
          const prayerMatch = event.match(/<prayer_requests>([^<]*)<\/prayer_requests>/);
          const prayerRequests = prayerMatch ? prayerMatch[1] : '';
          
          // Combine all text content for notes
          const combinedNotes = [notes, topic, prayerRequests].filter(n => n.trim()).join(' | ');
          
          if (combinedNotes.trim()) {
            eventNotes.push({
              eventName,
              eventDate: occurrenceDate,
              notes: combinedNotes.trim(),
              source: 'attendance_profiles',
              groupId: eventGroupId
            });
          }
        }
      } catch (parseError) {
        console.error('Error parsing event:', parseError);
      }
    }

    console.log('Group events found:', groupEventsFound);
    console.log('Notes extracted:', eventNotes.length);

    return NextResponse.json({
      success: true,
      groupId,
      startDate,
      endDate,
      eventNotes,
      totalEvents: events.length,
      groupEventsFound,
      totalNotesFound: eventNotes.length,
      source: 'attendance_profiles',
      debug: {
        xmlResponseLength: xmlData.length,
        totalEventsFound: events.length,
        groupEventsFound,
        notesExtracted: eventNotes.length,
        groupTestPassed: true,
        sampleXML: xmlData.substring(0, 1000)
      }
    });  } catch (error) {
    console.error('CCB API integration error:', error);
    return NextResponse.json({
      success: false,
      error: `Internal error: ${error.message}`,
      groupId,
      startDate,
      endDate
    });
  }
}
