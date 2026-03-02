import { NextRequest, NextResponse } from 'next/server';
import { createCCBClient } from '../../../../lib/ccb/ccb-client';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { groupId } = body;

    if (!groupId) {
      return NextResponse.json(
        { error: 'Missing groupId', details: 'A CCB group ID is required' },
        { status: 400 }
      );
    }

    const client = createCCBClient();
    const participants = await client.getGroupParticipants(String(groupId));

    return NextResponse.json({
      success: true,
      data: participants,
      count: participants.length,
    });
  } catch (error) {
    console.error('CCB group roster error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';

    if (message.includes('Missing CCB env vars')) {
      return NextResponse.json(
        { error: 'CCB not configured', details: message },
        { status: 503 }
      );
    }

    return NextResponse.json(
      { error: 'Failed to fetch group roster', details: message },
      { status: 500 }
    );
  }
}
