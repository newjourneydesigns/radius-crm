import { NextRequest, NextResponse } from 'next/server';
import { createCCBClient } from '../../../../lib/ccb/ccb-client';
import { createServiceSupabaseClient, getUserFromAuthHeader } from '../../../../lib/server-supabase';

type GroupBy = 'hour' | 'day' | 'week';

function getDateRange(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const range = params.get('range') || '7d';
  const now = new Date();
  const end = params.get('end') ? new Date(params.get('end')!) : now;
  const start = params.get('start') ? new Date(params.get('start')!) : new Date(now);

  if (!params.get('start')) {
    if (range === 'today') start.setHours(0, 0, 0, 0);
    else if (range === '30d') start.setDate(now.getDate() - 30);
    else start.setDate(now.getDate() - 7);
  }

  return { start, end };
}

function bucketFor(dateValue: string, groupBy: GroupBy) {
  const date = new Date(dateValue);
  if (groupBy === 'hour') {
    date.setMinutes(0, 0, 0);
    return date.toISOString();
  }
  if (groupBy === 'week') {
    const day = date.getDay();
    date.setDate(date.getDate() - day);
    date.setHours(0, 0, 0, 0);
    return date.toISOString().slice(0, 10);
  }
  date.setHours(0, 0, 0, 0);
  return date.toISOString().slice(0, 10);
}

function rateLimitStatus(row: any) {
  if (row.status === 'rate_limited') return 'Rate limited';
  if (row.status === 'at_risk') return 'At risk';
  if (row.status === 'getting_close') return 'Getting close';
  if (row.status === 'healthy') return 'Healthy';
  return 'Unknown';
}

function buildCachingRecommendations(requests: any[]) {
  const counts = new Map<string, number>();
  for (const row of requests) {
    const key = `${row.module}::${row.action}::${row.ccb_service}`;
    counts.set(key, (counts.get(key) || 0) + 1);
  }

  return Array.from(counts.entries())
    .filter(([, count]) => count >= 10)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([key, count]) => {
      const [module, action, service] = key.split('::');
      return {
        module,
        action,
        service,
        count,
        message: `${service} was called ${count} times from ${module} / ${action}. Consider short-lived caching or request coalescing.`,
      };
    });
}

export async function GET(request: NextRequest) {
  const user = await getUserFromAuthHeader(request);
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = createServiceSupabaseClient();
  const { start, end } = getDateRange(request);
  const groupBy = (request.nextUrl.searchParams.get('groupBy') || 'day') as GroupBy;
  const search = request.nextUrl.searchParams.get('search')?.trim().toLowerCase() || '';
  const service = request.nextUrl.searchParams.get('service') || '';
  const status = request.nextUrl.searchParams.get('status') || '';

  let query = supabase
    .from('ccb_api_requests')
    .select('*')
    .gte('created_at', start.toISOString())
    .lte('created_at', end.toISOString())
    .order('created_at', { ascending: false })
    .limit(1000);

  if (service) query = query.eq('ccb_service', service);
  if (status === 'failed') query = query.eq('success', false);
  if (status === '429') query = query.eq('status_code', 429);

  const [{ data: requests, error: requestsError }, { data: rateLimits }, { data: dailyStatus }, { data: alerts }] = await Promise.all([
    query,
    supabase.from('ccb_api_rate_limits').select('*').order('updated_at', { ascending: false }),
    supabase.from('ccb_api_daily_status').select('*').order('created_at', { ascending: false }).limit(1),
    supabase.from('ccb_api_alerts').select('*').is('resolved_at', null).order('created_at', { ascending: false }).limit(20),
  ]);

  if (requestsError) {
    return NextResponse.json({ error: requestsError.message }, { status: 500 });
  }

  const userIds = Array.from(new Set((requests || []).map((row) => row.user_id).filter(Boolean)));
  const { data: users } = userIds.length
    ? await supabase.from('users').select('id, name, email').in('id', userIds)
    : { data: [] as any[] };
  const userMap = new Map((users || []).map((row) => [row.id, row]));

  const filtered = (requests || []).filter((row) => {
    if (!search) return true;
    const userRecord = row.user_id ? userMap.get(row.user_id) : null;
    return [
      userRecord?.name,
      userRecord?.email,
      row.module,
      row.action,
      row.ccb_service,
      row.error_message,
      row.status_code ? String(row.status_code) : '',
    ].some((value) => String(value || '').toLowerCase().includes(search));
  });

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);
  const serviceCounts = new Map<string, number>();
  let durationTotal = 0;

  for (const row of filtered) {
    serviceCounts.set(row.ccb_service, (serviceCounts.get(row.ccb_service) || 0) + 1);
    durationTotal += row.duration_ms || 0;
  }

  const mostUsedService = Array.from(serviceCounts.entries()).sort((a, b) => b[1] - a[1])[0] || null;
  const graphBuckets = new Map<string, { timestamp: string; calls: number; failed: number; rateLimited: number }>();

  for (const row of filtered) {
    const key = bucketFor(row.created_at, groupBy);
    const bucket = graphBuckets.get(key) || { timestamp: key, calls: 0, failed: 0, rateLimited: 0 };
    bucket.calls += 1;
    if (!row.success) bucket.failed += 1;
    if (row.status_code === 429) bucket.rateLimited += 1;
    graphBuckets.set(key, bucket);
  }

  return NextResponse.json({
    summary: {
      totalToday: filtered.filter((row) => new Date(row.created_at) >= todayStart).length,
      totalThisMonth: filtered.filter((row) => new Date(row.created_at) >= monthStart).length,
      failedCalls: filtered.filter((row) => !row.success).length,
      rateLimitErrors: filtered.filter((row) => row.status_code === 429).length,
      averageResponseTime: filtered.length ? Math.round(durationTotal / filtered.length) : 0,
      mostUsedService: mostUsedService ? { service: mostUsedService[0], count: mostUsedService[1] } : null,
      currentDailyUsage: dailyStatus?.[0] || null,
    },
    graph: Array.from(graphBuckets.values()).sort((a, b) => a.timestamp.localeCompare(b.timestamp)),
    rateLimits: (rateLimits || []).map((row) => ({ ...row, label: rateLimitStatus(row) })),
    alerts: alerts || [],
    recommendations: buildCachingRecommendations(filtered),
    logs: filtered.slice(0, 250).map((row) => {
      const userRecord = row.user_id ? userMap.get(row.user_id) : null;
      return {
        ...row,
        user_name: userRecord?.name || userRecord?.email || 'System',
      };
    }),
  });
}

export async function POST(request: NextRequest) {
  const user = await getUserFromAuthHeader(request);
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const client = createCCBClient({
    userId: user.id,
    module: 'CCB Usage Dashboard',
    action: 'Refresh API Status',
    direction: 'pull',
  });

  const status = await client.getApiStatus();
  return NextResponse.json({ success: true, status });
}
