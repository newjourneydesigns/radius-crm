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

    // For now, let's just test basic connectivity and return debug info
    console.log('🔍 Testing basic CCB API connectivity...');
    
    try {
      // Test with a simple service first
      const testUrl = `${CCB_BASE_URL}?srv=campus_list`;
      console.log('🔍 Testing with campus_list service:', testUrl);

      const testResponse = await fetch(testUrl, {
        method: 'GET',
        headers: {
          'Authorization': `Basic ${auth}`,
        },
      });

      console.log('🔍 Campus List Response:', {
        status: testResponse.status,
        statusText: testResponse.statusText
      });

      if (testResponse.ok) {
        const testXml = await testResponse.text();
        console.log('🔍 Campus List XML Response length:', testXml.length);
        
        return NextResponse.json({
          success: true,
          message: 'CCB API connection successful',
          groupId,
          startDate,
          endDate,
          eventNotes: [],
          totalEvents: 0,
          source: 'connectivity_test',
          debug: {
            apiStatus: 'connected',
            responseSize: testXml.length,
            testEndpoint: 'campus_list',
            nextStep: 'Need to implement event fetching without timeout'
          }
        });
      } else {
        return NextResponse.json({
          success: false,
          error: `CCB API test failed: ${testResponse.status}`,
          groupId,
          startDate,
          endDate,
          debug: {
            apiStatus: 'failed',
            testEndpoint: 'campus_list',
            httpStatus: testResponse.status
          }
        });
      }
    } catch (fetchError) {
      console.error('Fetch error:', fetchError);
      return NextResponse.json({
        success: false,
        error: `Network error: ${fetchError.message}`,
        groupId,
        startDate,
        endDate,
        debug: {
          apiStatus: 'network_error',
          errorMessage: fetchError.message
        }
      });
    }

  } catch (error) {
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
