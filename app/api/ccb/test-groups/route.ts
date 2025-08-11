import { NextResponse } from 'next/server';
import { createCCBClient } from '../../../../lib/ccb/ccb-client';

export async function GET() {
  try {
    console.log('🔍 Testing CCB groups API...');
    
    // Create CCB client
    const ccbClient = createCCBClient();

    // Test connection first
    const connected = await ccbClient.testConnection();
    if (!connected) {
      throw new Error('CCB connection failed');
    }

    // Get raw XML from group_profiles (without limit parameter)
    const groupsXml = await (ccbClient as any).getXml({ 
      srv: 'group_profiles'
      // Remove limit parameter as it's not supported
    });

    console.log('📋 Groups XML structure:', JSON.stringify(groupsXml, null, 2));

    // Try to extract group names for debugging
    const response = groupsXml?.ccb_api?.response;
    const groupsRoot = response?.groups;
    
    // Check for errors in the response
    const errors = response?.errors;
    if (errors) {
      console.log('❌ CCB API returned errors:', errors);
    }
    
    let groupsList = [];
    if (groupsRoot) {
      const groupArray = Array.isArray(groupsRoot.group) ? groupsRoot.group : 
                        groupsRoot.group ? [groupsRoot.group] : [];
      
      groupsList = groupArray.slice(0, 10).map((group: any) => ({
        id: group['@_id'] || group.id || 'No ID',
        name: group.name || group.group_name || 'No Name',
        raw: group
      }));
    }

    return NextResponse.json({
      success: true,
      connected: true,
      errors: errors || null,
      totalGroups: groupsList.length,
      sampleGroups: groupsList,
      rawStructure: {
        hasResponse: !!response,
        hasGroups: !!groupsRoot,
        groupsType: Array.isArray(groupsRoot?.group) ? 'array' : typeof groupsRoot?.group,
        keys: Object.keys(groupsXml?.ccb_api?.response || {}),
        fullResponse: response
      }
    });

  } catch (error: any) {
    console.error('❌ Test groups error:', error);
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
