import { NextRequest, NextResponse } from 'next/server';
import { XMLBuilder } from 'fast-xml-parser';
import { createCCBClient } from '../../../../lib/ccb/ccb-client';
import { getCCBRequestContext } from '../../../../lib/ccb/ccb-api-gateway';

const builder = new XMLBuilder({ ignoreAttributes: false, attributeNamePrefix: '@_' });

export async function GET(request: NextRequest) {
  try {
    const eventId = request.nextUrl.searchParams.get('event_id');

    if (!eventId) {
      return NextResponse.json({ error: 'event_id parameter is required' }, { status: 400 });
    }

    const client = createCCBClient(await getCCBRequestContext(request, {
      module: 'CCB Explorer',
      action: 'Fetch Event Profile',
      direction: 'pull',
    }));
    const data = await client.getXml({ srv: 'event_profile', id: eventId });

    return new NextResponse(builder.build(data), {
      status: 200,
      headers: { 'Content-Type': 'application/xml' },
    });
  } catch (error) {
    console.error('Error proxying CCB event profile request:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 200 });
}
