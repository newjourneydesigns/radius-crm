import { NextResponse } from 'next/server';
import { createCCBClient } from '../../../../lib/ccb/ccb-client';
import { getCCBRequestContext } from '../../../../lib/ccb/ccb-api-gateway';
import { getUserFromAuthHeader } from '../../../../lib/server-supabase';

export async function POST(request: Request) {
  try {
    // Requires a signed-in staff session — this proxies the church directory
    // (names/phones/emails) and consumes the finite CCB API budget.
    const user = await getUserFromAuthHeader(request);
    if (!user) {
      return NextResponse.json({ error: 'Not signed in' }, { status: 401 });
    }

    const { query } = await request.json();

    if (!query || typeof query !== 'string' || query.trim().length < 2) {
      return NextResponse.json(
        { error: 'Search query must be at least 2 characters' },
        { status: 400 }
      );
    }

    const ccbClient = createCCBClient(await getCCBRequestContext(request, {
      module: 'Person Lookup',
      action: 'Search Person',
      direction: 'pull',
    }));
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
