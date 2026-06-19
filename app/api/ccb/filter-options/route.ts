import { NextRequest, NextResponse } from 'next/server';
import { createCCBv2Client } from '../../../../lib/ccb/ccb-v2-client';
import { getCCBRequestContext } from '../../../../lib/ccb/ccb-api-gateway';
import { verifyAdminAccessDemo } from '../../../../lib/auth-middleware';

export const dynamic = 'force-dynamic';

// GET /api/ccb/filter-options
// Returns CCB campuses and departments for filter dropdowns.
export async function GET(request: NextRequest) {
  try {
    const { isAdmin, error: authErr } = await verifyAdminAccessDemo(request);
    if (!isAdmin) {
      return NextResponse.json({ error: authErr || 'Admin access required' }, { status: 403 });
    }

    const ccbv2 = createCCBv2Client(await getCCBRequestContext(request, {
      module: 'Import Circles (v2)',
      action: 'Fetch Filter Options',
      direction: 'pull',
    }));

    const [campusesRaw, deptsRaw] = await Promise.all([
      ccbv2.get('/campuses'),
      ccbv2.get('/departments'),
    ]);

    const asArray = (raw: any) =>
      Array.isArray(raw) ? raw : raw?.items ?? raw?.data ?? [];

    const campuses = asArray(campusesRaw)
      .map((c: any) => ({ id: String(c.id), name: c.name }))
      .sort((a: any, b: any) => a.name.localeCompare(b.name));

    const departments = asArray(deptsRaw)
      .map((d: any) => ({ id: String(d.id), name: d.name }))
      .sort((a: any, b: any) => a.name.localeCompare(b.name));

    return NextResponse.json({ campuses, departments });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || 'Unknown error' },
      { status: 500 }
    );
  }
}
