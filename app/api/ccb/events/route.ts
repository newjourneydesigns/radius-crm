import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const groupId = searchParams.get('groupId');
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');

    if (!groupId || !startDate || !endDate) {
      return NextResponse.json({ 
        success: false, 
        error: 'Missing required parameters: groupId, startDate, endDate' 
      }, { status: 400 });
    }

    const CCB_BASE_URL = process.env.CCB_BASE_URL;
    const CCB_API_USER = process.env.CCB_API_USER;
    const CCB_API_PASSWORD = process.env.CCB_API_PASSWORD;

    if (!CCB_BASE_URL || !CCB_API_USER || !CCB_API_PASSWORD) {
      return NextResponse.json({ 
        success: false, 
        error: 'CCB API credentials not configured' 
      }, { status: 500 });
    }

    console.log('Fetching events for group:', groupId, 'from', startDate, 'to', endDate);

    const authHeader = 'Basic ' + Buffer.from(`${CCB_API_USER}:${CCB_API_PASSWORD}`).toString('base64');
    
    // Get events in date range using event_profiles service
    const response = await fetch(`${CCB_BASE_URL}/event_profiles?srv=event_profiles&modified_since=${startDate}`, {
      headers: {
        'Authorization': authHeader,
        'Content-Type': 'application/xml'
      }
    });

    if (!response.ok) {
      console.error('CCB API error:', response.status, response.statusText);
      return NextResponse.json({ 
        success: false, 
        error: `CCB API error: ${response.status} ${response.statusText}` 
      }, { status: response.status });
    }

    const xmlData = await response.text();
    console.log('CCB Events response length:', xmlData.length);
    
    // Parse events and filter by group
    const events = [];
    
    // Look for event elements in the XML
    const eventRegex = /<event[^>]*>[\s\S]*?<\/event>/g;
    const eventMatches = xmlData.match(eventRegex) || [];
    
    console.log('Found event matches:', eventMatches.length);
    
    for (const match of eventMatches) {
      const idMatch = match.match(/<event[^>]*id="([^"]*)"[^>]*>/);
      const nameMatch = match.match(/<name>([^<]*)<\/name>/);
      const dateMatch = match.match(/<start_datetime>([^<]*)<\/start_datetime>/);
      const descMatch = match.match(/<description>([^<]*)<\/description>/);
      const notesMatch = match.match(/<leader_notes>([^<]*)<\/leader_notes>/);
      const groupMatch = match.match(/<group[^>]*id="([^"]*)"[^>]*>/);
      
      // Filter by group ID and date range
      if (groupMatch && groupMatch[1] === groupId && idMatch && nameMatch && dateMatch) {
        const eventDate = new Date(dateMatch[1]);
        const startDateObj = new Date(startDate);
        const endDateObj = new Date(endDate);
        
        // Check if event is within date range
        if (eventDate >= startDateObj && eventDate <= endDateObj) {
          events.push({
            eventId: idMatch[1],
            eventName: nameMatch[1],
            eventDate: dateMatch[1],
            description: descMatch ? descMatch[1].trim() : '',
            notes: notesMatch ? notesMatch[1].trim() : '',
            groupId: groupMatch[1]
          });
        }
      }
    }

    // Sort by date (newest first)
    events.sort((a, b) => new Date(b.eventDate).getTime() - new Date(a.eventDate).getTime());

    console.log('Filtered events for group', groupId, ':', events.length);

    return NextResponse.json({
      success: true,
      events,
      totalEvents: events.length,
      dateRange: { startDate, endDate },
      groupId,
      debug: {
        xmlLength: xmlData.length,
        eventMatches: eventMatches.length,
        filteredEvents: events.length
      }
    });

  } catch (error) {
    console.error('CCB Events API Error:', error);
    return NextResponse.json({ 
      success: false, 
      error: `Failed to fetch events from CCB: ${error.message}` 
    }, { status: 500 });
  }
}
