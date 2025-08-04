import { NextRequest, NextResponse } from 'next/server';
// TODO: Install and use fast-xml-parser for production XML parsing
// import { XMLParser } from 'fast-xml-parser';

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
  attendeeCount?: number;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { groupId, startDate, endDate }: CCBEventNotesParams = body;

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

    if (!CCB_BASE_URL || !CCB_API_USER || !CCB_API_PASSWORD) {
      console.error('Missing CCB API configuration');
      return NextResponse.json(
        { error: 'CCB API not configured' },
        { status: 500 }
      );
    }

    // Create basic auth header
    const auth = Buffer.from(`${CCB_API_USER}:${CCB_API_PASSWORD}`).toString('base64');

    // First, try to get events using event_profiles endpoint
    const eventProfilesParams = new URLSearchParams({
      srv: 'event_profiles',
      modified_since: startDate,
      page: '1',
      per_page: '100',
      include_notes: 'true'
    });

    const eventResponse = await fetch(`${CCB_BASE_URL}?${eventProfilesParams}`, {
      method: 'GET',
      headers: {
        'Authorization': `Basic ${auth}`,
        'Content-Type': 'application/xml',
      },
    });

    if (!eventResponse.ok) {
      console.error('CCB API event_profiles request failed:', eventResponse.status);
      return NextResponse.json(
        { error: 'Failed to fetch events from CCB API' },
        { status: 500 }
      );
    }

    const eventXml = await eventResponse.text();
    
    // Try attendance_profiles as an alternative if event_profiles doesn't have group filtering
    const attendanceParams = new URLSearchParams({
      srv: 'attendance_profiles',
      start_date: startDate,
      end_date: endDate,
      page: '1',
      per_page: '100'
    });

    const attendanceResponse = await fetch(`${CCB_BASE_URL}?${attendanceParams}`, {
      method: 'GET',
      headers: {
        'Authorization': `Basic ${auth}`,
        'Content-Type': 'application/xml',
      },
    });

    let attendanceXml = '';
    if (attendanceResponse.ok) {
      attendanceXml = await attendanceResponse.text();
    }

    // Parse XML and extract event notes
    // Note: In a real implementation, you'd use an XML parser like 'fast-xml-parser'
    // For now, we'll return a structured response that can be parsed client-side
    const eventNotes: CCBEventNote[] = [];

    // Simple regex parsing (replace with proper XML parser in production)
    const eventMatches = eventXml.match(/<event[^>]*>[\s\S]*?<\/event>/g) || [];
    
    for (const eventMatch of eventMatches) {
      // Extract event details using regex (replace with proper XML parsing)
      const eventIdMatch = eventMatch.match(/<event[^>]*id="([^"]*)"/) || eventMatch.match(/<event_id>([^<]*)<\/event_id>/);
      const eventNameMatch = eventMatch.match(/<event_name>([^<]*)<\/event_name>/) || eventMatch.match(/<name>([^<]*)<\/name>/);
      const eventDateMatch = eventMatch.match(/<event_date>([^<]*)<\/event_date>/) || eventMatch.match(/<date>([^<]*)<\/date>/);
      const notesMatch = eventMatch.match(/<notes>([^<]*)<\/notes>/) || eventMatch.match(/<note>([^<]*)<\/note>/);
      const attendeeCountMatch = eventMatch.match(/<attendee_count>([^<]*)<\/attendee_count>/);

      if (eventIdMatch && eventNameMatch && eventDateMatch && notesMatch && notesMatch[1].trim()) {
        // Check if event date is within range
        const eventDate = new Date(eventDateMatch[1]);
        const startDateObj = new Date(startDate);
        const endDateObj = new Date(endDate);

        if (eventDate >= startDateObj && eventDate <= endDateObj) {
          eventNotes.push({
            eventId: eventIdMatch[1],
            eventName: eventNameMatch[1],
            eventDate: eventDateMatch[1],
            notes: notesMatch[1],
            attendeeCount: attendeeCountMatch ? parseInt(attendeeCountMatch[1]) : undefined
          });
        }
      }
    }

    // Filter by group ID if available in the data
    const filteredNotes = eventNotes.filter(note => {
      // This would need to be implemented based on how CCB structures group data
      // For now, return all notes (client can filter if they have group association data)
      return true;
    });

    return NextResponse.json({
      success: true,
      groupId,
      startDate,
      endDate,
      eventNotes: filteredNotes,
      totalEvents: filteredNotes.length
    });

  } catch (error) {
    console.error('CCB API integration error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// GET method for testing/debugging
export async function GET(request: NextRequest) {
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

  // For GET requests, create a mock response for development/testing
  const mockEventNotes: CCBEventNote[] = [
    {
      eventId: '12345',
      eventName: 'Circle Meeting - Week 1',
      eventDate: '2025-07-30T19:00:00Z',
      notes: 'Great discussion about community and fellowship. Everyone participated well. Mary shared about her recent job change.',
      attendeeCount: 8
    },
    {
      eventId: '12346',
      eventName: 'Circle Meeting - Week 2',
      eventDate: '2025-08-06T19:00:00Z',
      notes: 'Focused on prayer requests. John asked for prayers for his family. We spent extra time in group prayer.',
      attendeeCount: 7
    }
  ];

  return NextResponse.json({
    success: true,
    groupId,
    startDate,
    endDate,
    eventNotes: mockEventNotes,
    totalEvents: mockEventNotes.length,
    note: 'This is mock data for development. Configure CCB_BASE_URL, CCB_API_USER, and CCB_API_PASSWORD environment variables for live data.'
  });
}
