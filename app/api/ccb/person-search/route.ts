import { NextResponse } from 'next/server';
import { createCCBClient } from '../../../../lib/ccb/ccb-client';

export async function POST(request: Request) {
  try {
    const { query } = await request.json();

    if (!query || typeof query !== 'string' || query.trim().length < 2) {
      return NextResponse.json(
        { error: 'Search query must be at least 2 characters' },
        { status: 400 }
      );
    }

    const ccbClient = createCCBClient();
    const results = await ccbClient.searchIndividuals(query.trim());

    return NextResponse.json({
      success: true,
      data: results,
      count: results.length,
    });
  } catch (error: any) {
    console.error('CCB Person Search Error:', error);
    return NextResponse.json(
      {
        error: 'Failed to search CCB individuals',
        details: error.message,
      },
      { status: 500 }
    );
  }
}
