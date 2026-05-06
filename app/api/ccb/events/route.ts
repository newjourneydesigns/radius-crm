import { NextResponse } from 'next/server';
import { createCCBClient } from '../../../../lib/ccb/ccb-client';
import { getCCBRequestContext } from '../../../../lib/ccb/ccb-api-gateway';

export async function POST(request: Request) {
  try {
    const { groupName, startDate, endDate, includeAttendance, includeAttendees } = await request.json();

    // Validate required fields - Group Name is the primary requirement now
    if (!groupName || !startDate || !endDate) {
      return NextResponse.json(
        { error: 'Missing required fields: groupName, startDate, endDate' },
        { status: 400 }
      );
    }

    // Create CCB client
    const ccbClient = createCCBClient(await getCCBRequestContext(request, {
      module: 'CCB Events',
      action: 'Fetch Events',
      direction: 'pull',
    }));

    console.log(`🔍 API Request: Group Name "${groupName}", Date Range: ${startDate} to ${endDate}`);
    console.log(`📋 Options: Attendance=${includeAttendance}, Attendees=${includeAttendees}`);

    // Use the new group name search method
    const events = await ccbClient.searchGroupEventsByName(groupName, startDate, endDate, {
      includeAttendance: includeAttendance || false,
      includeAttendees: includeAttendees || false
    });

    return NextResponse.json({
      success: true,
      data: events,
      count: events.length
    });

  } catch (error: any) {
    console.error('CCB API Error:', error);
    return NextResponse.json(
      { 
        error: 'Failed to fetch CCB events', 
        details: error.message 
      },
      { status: 500 }
    );
  }
}

export async function GET(request: Request) {
  try {
    // Test CCB connection
    const ccbClient = createCCBClient(await getCCBRequestContext(request, {
      module: 'CCB Events',
      action: 'Test Connection',
      direction: 'pull',
    }));
    const isConnected = await ccbClient.testConnection();
    
    return NextResponse.json({
      connected: isConnected,
      message: isConnected ? 'CCB connection successful' : 'CCB connection failed'
    });
  } catch (error: any) {
    return NextResponse.json(
      { 
        connected: false, 
        error: error.message 
      },
      { status: 500 }
    );
  }
}
