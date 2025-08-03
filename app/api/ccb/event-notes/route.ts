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

    // Now try attendance profiles with proper service parameter
    const attendanceUrl = `${CCB_BASE_URL}/attendance_profiles?srv=attendance_profiles&start_date=${startDate}&end_date=${endDate}&group_id=${groupId}&limit=50`;
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
    
    // Parse the XML to extract event information
    const eventNotes: any[] = [];
    
    // Find all attendance_profile entries
    const profileRegex = /<attendance_profile[^>]*>[\s\S]*?<\/attendance_profile>/g;
    const profiles = xmlData.match(profileRegex) || [];
    
    console.log('Found profiles:', profiles.length);
    
    for (const profile of profiles) {
      try {
        // Extract event name
        const eventNameMatch = profile.match(/<event[^>]*name="([^"]*)"[^>]*>/);
        const eventName = eventNameMatch ? eventNameMatch[1] : 'Unknown Event';
        
        // Extract event date
        const eventDateMatch = profile.match(/<event[^>]*start_datetime="([^"]*)"[^>]*>/);
        const eventDate = eventDateMatch ? eventDateMatch[1] : '';
        
        // Extract event occurrence
        const eventOccurrenceMatch = profile.match(/<event_occurrence[^>]*>[\s\S]*?<\/event_occurrence>/);
        let occurrenceDate = '';
        if (eventOccurrenceMatch) {
          const occurrenceDateMatch = eventOccurrenceMatch[0].match(/<start_datetime>([^<]*)<\/start_datetime>/);
          occurrenceDate = occurrenceDateMatch ? occurrenceDateMatch[1] : '';
        }
        
        // Extract notes
        const notesMatch = profile.match(/<note>([^<]*)<\/note>/);
        const notes = notesMatch ? notesMatch[1] : '';
        
        if (notes.trim()) {
          eventNotes.push({
            eventName,
            eventDate: eventDate || occurrenceDate,
            occurrenceDate,
            notes: notes.trim(),
            source: 'attendance_profiles'
          });
        }
      } catch (parseError) {
        console.error('Error parsing profile:', parseError);
      }
    }

    console.log('Extracted notes:', eventNotes.length);

    return NextResponse.json({
      success: true,
      groupId,
      startDate,
      endDate,
      eventNotes,
      totalEvents: profiles.length,
      totalNotesFound: eventNotes.length,
      source: 'attendance_profiles',
      debug: {
        xmlResponseLength: xmlData.length,
        profilesFound: profiles.length,
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
