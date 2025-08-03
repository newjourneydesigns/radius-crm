import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const groupId = searchParams.get('groupId') || '';
    const startDate = searchParams.get('startDate') || '2025-07-01';
    const endDate = searchParams.get('endDate') || '2025-08-03';

    console.log('CCB Event Notes API called:', { groupId, startDate, endDate });

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
        endDate
      }, { status: 500 });
    }

    // CCB attendance_profiles service fetches ALL attendance data for date range
    const attendanceUrl = `${CCB_BASE_URL}/attendance_profiles?srv=attendance_profiles&start_date=${startDate}&end_date=${endDate}`;
    console.log('Fetching from:', attendanceUrl);
    
    const attendanceResponse = await fetch(attendanceUrl, {
      method: 'GET',
      headers: {
        'Authorization': `Basic ${Buffer.from(`${CCB_API_USER}:${CCB_API_PASSWORD}`).toString('base64')}`,
        'Content-Type': 'application/xml'
      }
    });

    const xmlData = await attendanceResponse.text();
    console.log('Response status:', attendanceResponse.status);
    console.log('XML Response length:', xmlData.length);

    if (!attendanceResponse.ok) {
      return NextResponse.json({
        success: false,
        error: `CCB API error: ${attendanceResponse.status} ${attendanceResponse.statusText}`,
        debug: {
          attendanceUrl,
          responseStatus: attendanceResponse.status,
          responseData: xmlData.substring(0, 500)
        }
      }, { status: 500 });
    }
    
    // Parse the XML to understand structure and find group 3143
    const eventNotes: any[] = [];
    const sampleEvents: any[] = [];
    
    // Find all event entries
    const eventRegex = /<event[^>]*>[\s\S]*?<\/event>/g;
    const events = xmlData.match(eventRegex) || [];
    
    console.log('Found total events:', events.length);
    
    // Analyze first few events to understand structure
    for (let i = 0; i < Math.min(3, events.length); i++) {
      const event = events[i];
      
      // Extract event ID and name
      const eventIdMatch = event.match(/<event[^>]*id="([^"]*)"[^>]*>/);
      const eventId = eventIdMatch ? eventIdMatch[1] : null;
      
      const eventNameMatch = event.match(/<name>([^<]*)<\/name>/);
      const eventName = eventNameMatch ? eventNameMatch[1] : 'Unknown Event';
      
      sampleEvents.push({
        eventId,
        eventName,
        fullEventXml: event.substring(0, 800) // Show structure
      });
    }

    // Search for any event that contains group ID 3143
    let foundGroup3143Events = 0;
    for (const event of events) {
      if (event.includes('3143')) {
        foundGroup3143Events++;
        
        // Extract event details
        const eventIdMatch = event.match(/<event[^>]*id="([^"]*)"[^>]*>/);
        const eventId = eventIdMatch ? eventIdMatch[1] : null;
        
        const eventNameMatch = event.match(/<name>([^<]*)<\/name>/);
        const eventName = eventNameMatch ? eventNameMatch[1] : 'Unknown Event';
        
        const occurrenceMatch = event.match(/<occurrence>([^<]*)<\/occurrence>/);
        const occurrenceDate = occurrenceMatch ? occurrenceMatch[1] : '';
        
        const notesMatch = event.match(/<notes>([^<]*)<\/notes>/);
        const notes = notesMatch ? notesMatch[1] : '';
        
        const topicMatch = event.match(/<topic>([^<]*)<\/topic>/);
        const topic = topicMatch ? topicMatch[1] : '';
        
        const prayerMatch = event.match(/<prayer_requests>([^<]*)<\/prayer_requests>/);
        const prayerRequests = prayerMatch ? prayerMatch[1] : '';
        
        const combinedNotes = [notes, topic, prayerRequests].filter(n => n.trim()).join(' | ');
        
        eventNotes.push({
          eventId,
          eventName,
          eventDate: occurrenceDate,
          notes: combinedNotes || 'No notes available',
          source: 'attendance_profiles',
          eventXmlSnippet: event.substring(0, 1000)
        });
      }
    }

    return NextResponse.json({
      success: true,
      groupId,
      startDate,
      endDate,
      eventNotes,
      foundGroup3143Events,
      totalEvents: events.length,
      debug: {
        xmlResponseLength: xmlData.length,
        totalEventsFound: events.length,
        foundGroup3143Events,
        sampleEvents,
        xmlStructureSample: xmlData.substring(0, 3000)
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
