import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminAccessDemo } from '../../../../lib/auth-middleware';
import { createCCBv2Client } from '../../../../lib/ccb/ccb-v2-client';
import { getCCBRequestContext } from '../../../../lib/ccb/ccb-api-gateway';

export const dynamic = 'force-dynamic';

// Lists all CCB scheduling categories (id + name + campus) for the category
// picker. Excludes archived categories. Cached at the edge for 10 minutes since
// categories change rarely.
export async function GET(request: NextRequest) {
  const { isAdmin, error: adminError } = await verifyAdminAccessDemo(request);
  if (!isAdmin) {
    return NextResponse.json({ error: adminError || 'Unauthorized' }, { status: 401 });
  }

  try {
    const ctx = await getCCBRequestContext(request, {
      module: 'Team Import',
      action: 'List Scheduling Categories',
      direction: 'pull',
    });
    const v2 = createCCBv2Client(ctx);
    const categories = await v2.listSchedulingCategories();

    const result = categories
      .filter(c => !c.archived)
      .map(c => ({ id: c.id, name: c.name, campus: c.campus?.name ?? '' }))
      .sort((a, b) => a.name.localeCompare(b.name));

    return NextResponse.json(result, {
      headers: { 'Cache-Control': 's-maxage=600, stale-while-revalidate=120' },
    });
  } catch (error: any) {
    console.error('Scheduling categories list error:', error);
    return NextResponse.json(
      { error: 'Failed to list scheduling categories', details: error.message },
      { status: 500 }
    );
  }
}
