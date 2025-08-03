import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  try {
    const CCB_BASE_URL = process.env.CCB_BASE_URL;
    const CCB_API_USER = process.env.CCB_API_USER;
    const CCB_API_PASSWORD = process.env.CCB_API_PASSWORD;

    if (!CCB_BASE_URL || !CCB_API_USER || !CCB_API_PASSWORD) {
      console.error('Missing CCB environment variables');
      return NextResponse.json({ 
        success: false, 
        error: 'CCB API credentials not configured' 
      }, { status: 500 });
    }

    console.log('Fetching groups from CCB API');

    // Get all groups
    const authHeader = 'Basic ' + Buffer.from(`${CCB_API_USER}:${CCB_API_PASSWORD}`).toString('base64');
    
    const response = await fetch(`${CCB_BASE_URL}/group_profiles?srv=group_profiles`, {
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
    console.log('CCB Groups response length:', xmlData.length);
    
    // Parse XML to extract groups
    const groups = [];
    
    // Look for group elements in the XML
    const groupRegex = /<group[^>]*>[\s\S]*?<\/group>/g;
    const groupMatches = xmlData.match(groupRegex) || [];
    
    console.log('Found group matches:', groupMatches.length);
    
    for (const match of groupMatches) {
      const idMatch = match.match(/<group[^>]*id="([^"]*)"[^>]*>/);
      const nameMatch = match.match(/<name>([^<]*)<\/name>/);
      const leaderMatch = match.match(/<main_leader>([^<]*)<\/main_leader>/);
      
      if (idMatch && nameMatch) {
        const groupId = idMatch[1];
        const groupName = nameMatch[1];
        const leader = leaderMatch ? leaderMatch[1] : 'No Leader Assigned';
        
        // Skip empty or invalid groups
        if (groupName.trim() && groupId.trim()) {
          groups.push({
            groupId,
            groupName,
            leader
          });
        }
      }
    }

    // Sort by leader name
    groups.sort((a, b) => a.leader.localeCompare(b.leader));

    console.log('Parsed groups:', groups.length);

    return NextResponse.json({
      success: true,
      groups,
      totalGroups: groups.length,
      debug: {
        xmlLength: xmlData.length,
        groupMatches: groupMatches.length,
        sampleXml: xmlData.substring(0, 1000)
      }
    });

  } catch (error) {
    console.error('CCB Groups API Error:', error);
    return NextResponse.json({ 
      success: false, 
      error: `Failed to fetch groups from CCB: ${error.message}` 
    }, { status: 500 });
  }
}
