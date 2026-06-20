import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminAccessDemo } from '../../../../lib/auth-middleware';
import { createCCBv2Client } from '../../../../lib/ccb/ccb-v2-client';
import { getCCBRequestContext } from '../../../../lib/ccb/ccb-api-gateway';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const { isAdmin, error: adminError } = await verifyAdminAccessDemo(request);
  if (!isAdmin) {
    return NextResponse.json({ error: adminError || 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id')?.trim();
  if (!id) {
    return NextResponse.json({ error: 'Missing required parameter: id' }, { status: 400 });
  }

  try {
    const ctx = await getCCBRequestContext(request, {
      module: 'Team Import',
      action: 'Lookup Scheduling Category',
      direction: 'pull',
    });
    const v2 = createCCBv2Client(ctx);
    const category = await v2.getSchedulingCategory(id);

    if (!category) {
      return NextResponse.json({ error: 'Scheduling category not found' }, { status: 404 });
    }

    const positionCount = category.teams?.reduce(
      (sum, t) => sum + (t.positions?.length ?? 0),
      0
    ) ?? 0;

    return NextResponse.json({
      id: category.id,
      name: category.name,
      campus: category.campus,
      organizer: category.organizer,
      recurrence_pattern: category.recurrence_pattern,
      archived: category.archived,
      positionCount,
      activeVolunteers: category.metrics?.total_active_volunteers ?? 0,
      teams: category.teams ?? [],
    });
  } catch (error: any) {
    console.error('Scheduling category lookup error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch scheduling category', details: error.message },
      { status: 500 }
    );
  }
}
