import { NextRequest, NextResponse } from 'next/server';
import { XMLBuilder } from 'fast-xml-parser';
import { createCCBClient } from '../../../../lib/ccb/ccb-client';
import { getCCBRequestContext } from '../../../../lib/ccb/ccb-api-gateway';

const builder = new XMLBuilder({ ignoreAttributes: false, attributeNamePrefix: '@_' });

export async function GET(request: NextRequest) {
  try {
    const modifiedSince = request.nextUrl.searchParams.get('modified_since');

    if (!modifiedSince) {
      return NextResponse.json({ error: 'modified_since parameter is required' }, { status: 400 });
    }

    const params: Record<string, string> = {
      srv: 'event_profiles',
      modified_since: modifiedSince,
      include_guest_list: request.nextUrl.searchParams.get('include_guest_list') || 'false',
      include_image_link: request.nextUrl.searchParams.get('include_image_link') || 'false',
      per_page: request.nextUrl.searchParams.get('per_page') || '100',
      page: request.nextUrl.searchParams.get('page') || '1',
    };
    const groupId = request.nextUrl.searchParams.get('group_id');
    if (groupId) params.group_id = groupId;

    const client = createCCBClient(await getCCBRequestContext(request, {
      module: 'CCB Explorer',
      action: 'Fetch Event Profiles',
      direction: 'pull',
    }));
    const data = await client.getXml(params);

    return new NextResponse(builder.build(data), {
      status: 200,
      headers: { 'Content-Type': 'application/xml' },
    });
  } catch (error) {
    console.error('Error proxying CCB event profiles request:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 200 });
}
