import { NextRequest, NextResponse } from 'next/server';

// CCB API credentials - should be moved to environment variables
const CCB_USERNAME = 'vccintra_api';
const CCB_PASSWORD = 'C4x1yAFpDV3h';
const CCB_BASE_URL = 'https://valleycreekchurch.ccbchurch.com/api.php';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    
    // Get query parameters from the request
    const modifiedSince = searchParams.get('modified_since');
    const includeGuestList = searchParams.get('include_guest_list') || 'false';
    const includeImageLink = searchParams.get('include_image_link') || 'false';
    const perPage = searchParams.get('per_page') || '100';
    const page = searchParams.get('page') || '1';
    const groupId = searchParams.get('group_id'); // Optional group filtering

    if (!modifiedSince) {
      return NextResponse.json(
        { error: 'modified_since parameter is required' },
        { status: 400 }
      );
    }

    // Build the CCB API URL
    const ccbUrl = new URL(CCB_BASE_URL);
    ccbUrl.searchParams.set('srv', 'event_profiles');
    ccbUrl.searchParams.set('modified_since', modifiedSince);
    ccbUrl.searchParams.set('include_guest_list', includeGuestList);
    ccbUrl.searchParams.set('include_image_link', includeImageLink);
    ccbUrl.searchParams.set('per_page', perPage);
    ccbUrl.searchParams.set('page', page);

    // Create Basic Auth header
    const credentials = Buffer.from(`${CCB_USERNAME}:${CCB_PASSWORD}`).toString('base64');

    // Make the request to CCB API
    const response = await fetch(ccbUrl.toString(), {
      method: 'GET',
      headers: {
        'Authorization': `Basic ${credentials}`,
        'Accept': 'application/xml',
      },
    });

    if (!response.ok) {
      console.error('CCB API Error:', response.status, response.statusText);
      return NextResponse.json(
        { error: `CCB API Error: ${response.status} ${response.statusText}` },
        { status: response.status }
      );
    }

    const xmlData = await response.text();

    // Return the XML response with proper headers
    return new NextResponse(xmlData, {
      status: 200,
      headers: {
        'Content-Type': 'application/xml',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET',
        'Access-Control-Allow-Headers': 'Content-Type',
      },
    });

  } catch (error) {
    console.error('Error proxying CCB API request:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// Handle preflight requests
export async function OPTIONS() {
  return new NextResponse(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
}
