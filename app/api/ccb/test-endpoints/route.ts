import { NextResponse } from 'next/server';
import { createCCBClient } from '../../../../lib/ccb/ccb-client';

export async function GET() {
  try {
    console.log('🔍 Testing alternative CCB endpoints...');
    
    // Create CCB client
    const ccbClient = createCCBClient();

    // Test connection first
    const connected = await ccbClient.testConnection();
    if (!connected) {
      throw new Error('CCB connection failed');
    }

    const results: any = {};

    // Try different endpoints to see what we can access
    const endpointsToTry = [
      { name: 'group_profiles', params: { srv: 'group_profiles' } },
      { name: 'group_profile_from_id', params: { srv: 'group_profile_from_id', id: '2406' } },
      { name: 'public_calendar_listing', params: { srv: 'public_calendar_listing', date_start: '2025-08-01', date_end: '2025-08-31' } },
      { name: 'event_profiles', params: { srv: 'event_profiles', modified_since: '2025-08-01' } }
    ];

    for (const endpoint of endpointsToTry) {
      try {
        console.log(`🔍 Testing endpoint: ${endpoint.name}`);
        const result = await (ccbClient as any).getXml(endpoint.params);
        
        results[endpoint.name] = {
          success: true,
          hasResponse: !!result?.ccb_api?.response,
          responseKeys: Object.keys(result?.ccb_api?.response || {}),
          errors: result?.ccb_api?.response?.errors || null,
          sampleData: JSON.stringify(result, null, 2).slice(0, 500) + '...'
        };
      } catch (error) {
        results[endpoint.name] = {
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error'
        };
      }
    }

    return NextResponse.json({
      success: true,
      connected: true,
      endpointTests: results
    });

  } catch (error: any) {
    console.error('❌ Test endpoints error:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: error.message,
        connected: false
      },
      { status: 500 }
    );
  }
}
