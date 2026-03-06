import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export async function GET(request: Request) {
  const supabase = createClient(supabaseUrl, serviceKey || anonKey!);

  const { searchParams } = new URL(request.url);
  const campusFilter = searchParams.getAll('campus');
  const circleTypeFilter = searchParams.getAll('circleType');
  const dayFilter = searchParams.getAll('day');
  const acpdFilter = searchParams.getAll('acpd');
  const timeFilter = searchParams.get('time'); // 'morning' | 'afternoon' | 'evening' | 'all'
  const monthsBack = parseInt(searchParams.get('months') || '6', 10);

  try {
    // 1. Fetch all active circle leaders
    let leadersQuery = supabase
      .from('circle_leaders')
      .select('id, name, campus, circle_type, day, time, status, frequency, acpd')
      .eq('status', 'active');

    if (campusFilter.length > 0) {
      leadersQuery = leadersQuery.in('campus', campusFilter);
    }
    if (circleTypeFilter.length > 0) {
      leadersQuery = leadersQuery.in('circle_type', circleTypeFilter);
    }
    if (dayFilter.length > 0) {
      leadersQuery = leadersQuery.in('day', dayFilter);
    }
    if (acpdFilter.length > 0) {
      leadersQuery = leadersQuery.in('acpd', acpdFilter);
    }

    const { data: leaders, error: leadersError } = await leadersQuery;
    if (leadersError) throw leadersError;

    if (!leaders || leaders.length === 0) {
      return NextResponse.json({
        leaders: [],
        occurrences: [],
        summary: {
          totalActiveCircles: 0,
          avgAttendance: 0,
          avgCircleSize: 0,
          totalMeetings: 0,
          totalHeadcount: 0,
        },
      });
    }

    // Apply time filter on the client side (use getTimeBucket for consistency with breakdown)
    let filteredLeaders = leaders;
    if (timeFilter && timeFilter !== 'all') {
      const bucketMap: Record<string, string> = { morning: 'Morning', afternoon: 'Afternoon', evening: 'Evening' };
      const targetBucket = bucketMap[timeFilter];
      filteredLeaders = leaders.filter((l) => getTimeBucket(l.time) === targetBucket);
    }

    const leaderIds = filteredLeaders.map((l) => l.id);

    // 2. Fetch meeting occurrences for the filtered leaders
    const startDate = new Date();
    startDate.setMonth(startDate.getMonth() - monthsBack);
    const startStr = startDate.toISOString().split('T')[0];

    const { data: occurrences, error: occError } = await supabase
      .from('circle_meeting_occurrences')
      .select('id, leader_id, meeting_date, status, headcount, regular_count, visitor_count, source, synced_at')
      .in('leader_id', leaderIds)
      .gte('meeting_date', startStr)
      .order('meeting_date', { ascending: true });

    if (occError) throw occError;

    // 3. Compute aggregated metrics
    const allOccurrences = occurrences || [];
    const metOccurrences = allOccurrences.filter((o) => o.status === 'met' && o.headcount != null && o.headcount > 0);
    const totalHeadcount = metOccurrences.reduce((sum, o) => sum + (o.headcount || 0), 0);

    // Find most recent sync timestamp and latest meeting date
    const syncTimes = allOccurrences.map((o) => o.synced_at).filter(Boolean) as string[];
    const lastSyncedAt = syncTimes.length > 0 ? syncTimes.sort().pop()! : null;
    const meetingDates = allOccurrences.map((o) => o.meeting_date).filter(Boolean);
    const latestMeetingDate = meetingDates.length > 0 ? meetingDates.sort().pop()! : null;
    const avgAttendance = metOccurrences.length > 0 ? Math.round((totalHeadcount / metOccurrences.length) * 10) / 10 : 0;

    // Average circle size: for each leader, find their avg headcount
    const leaderAvgs: Record<number, { sum: number; count: number }> = {};
    for (const occ of metOccurrences) {
      if (!leaderAvgs[occ.leader_id]) leaderAvgs[occ.leader_id] = { sum: 0, count: 0 };
      leaderAvgs[occ.leader_id].sum += occ.headcount || 0;
      leaderAvgs[occ.leader_id].count += 1;
    }
    const leaderAvgList = Object.entries(leaderAvgs).map(([id, { sum, count }]) => ({
      leaderId: parseInt(id),
      avg: count > 0 ? sum / count : 0,
    }));
    const avgCircleSize = leaderAvgList.length > 0
      ? Math.round((leaderAvgList.reduce((s, l) => s + l.avg, 0) / leaderAvgList.length) * 10) / 10
      : 0;

    // Top 5 and bottom 5 by average size
    const sortedBySize = [...leaderAvgList].sort((a, b) => b.avg - a.avg);
    const leaderMap = new Map(filteredLeaders.map((l) => [l.id, l]));

    const topFive = sortedBySize.slice(0, 5).map((l) => {
      const leader = leaderMap.get(l.leaderId);
      return { id: l.leaderId, name: leader?.name || 'Unknown', campus: leader?.campus, avg: Math.round(l.avg * 10) / 10 };
    });
    const bottomFive = sortedBySize.slice(-5).reverse().map((l) => {
      const leader = leaderMap.get(l.leaderId);
      return { id: l.leaderId, name: leader?.name || 'Unknown', campus: leader?.campus, avg: Math.round(l.avg * 10) / 10 };
    });

    // Weekly trend data (aggregate by week)
    const weekBuckets = new Map<string, { met: number; headcount: number; didNotMeet: number; noRecord: number }>();
    for (const occ of occurrences || []) {
      const weekKey = getWeekKey(occ.meeting_date);
      if (!weekBuckets.has(weekKey)) weekBuckets.set(weekKey, { met: 0, headcount: 0, didNotMeet: 0, noRecord: 0 });
      const bucket = weekBuckets.get(weekKey)!;
      if (occ.status === 'met') {
        bucket.met += 1;
        bucket.headcount += occ.headcount || 0;
      } else if (occ.status === 'did_not_meet') {
        bucket.didNotMeet += 1;
      } else {
        bucket.noRecord += 1;
      }
    }

    const weeklyTrend = Array.from(weekBuckets.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([week, data]) => ({
        week,
        label: formatWeekLabel(week),
        avgAttendance: data.met > 0 ? Math.round((data.headcount / data.met) * 10) / 10 : 0,
        totalHeadcount: data.headcount,
        meetingsHeld: data.met,
        didNotMeet: data.didNotMeet,
        noRecord: data.noRecord,
      }));

    // Attendance trend (last 4 weeks vs prior 4 weeks)
    const recentWeeks = weeklyTrend.slice(-4);
    const priorWeeks = weeklyTrend.slice(-8, -4);
    const recentAvg = recentWeeks.length > 0
      ? recentWeeks.reduce((s, w) => s + w.avgAttendance, 0) / recentWeeks.length
      : 0;
    const priorAvg = priorWeeks.length > 0
      ? priorWeeks.reduce((s, w) => s + w.avgAttendance, 0) / priorWeeks.length
      : 0;

    let attendanceTrend: 'up' | 'down' | 'flat' = 'flat';
    if (priorAvg > 0) {
      if (recentAvg > priorAvg * 1.05) attendanceTrend = 'up';
      else if (recentAvg < priorAvg * 0.95) attendanceTrend = 'down';
    }

    const growthPct = priorAvg > 0 ? Math.round(((recentAvg - priorAvg) / priorAvg) * 100) : 0;

    // By campus breakdown
    const byCampus: Record<string, { totalHeadcount: number; meetings: number; circles: Set<number> }> = {};
    for (const occ of metOccurrences) {
      const leader = leaderMap.get(occ.leader_id);
      const campus = leader?.campus || 'Unknown';
      if (!byCampus[campus]) byCampus[campus] = { totalHeadcount: 0, meetings: 0, circles: new Set() };
      byCampus[campus].totalHeadcount += occ.headcount || 0;
      byCampus[campus].meetings += 1;
      byCampus[campus].circles.add(occ.leader_id);
    }
    const campusBreakdown = Object.entries(byCampus)
      .map(([campus, data]) => ({
        campus,
        avgAttendance: data.meetings > 0 ? Math.round((data.totalHeadcount / data.meetings) * 10) / 10 : 0,
        avgCircleSize: data.circles.size > 0 ? Math.round((data.totalHeadcount / data.meetings) * 10) / 10 : 0,
        circleCount: data.circles.size,
      }))
      .sort((a, b) => b.avgAttendance - a.avgAttendance);

    // By circle type
    const byType: Record<string, { totalHeadcount: number; meetings: number; circles: Set<number> }> = {};
    for (const occ of metOccurrences) {
      const leader = leaderMap.get(occ.leader_id);
      const circleType = leader?.circle_type || 'Unknown';
      if (!byType[circleType]) byType[circleType] = { totalHeadcount: 0, meetings: 0, circles: new Set() };
      byType[circleType].totalHeadcount += occ.headcount || 0;
      byType[circleType].meetings += 1;
      byType[circleType].circles.add(occ.leader_id);
    }
    const typeBreakdown = Object.entries(byType)
      .map(([type, data]) => ({
        type,
        avgAttendance: data.meetings > 0 ? Math.round((data.totalHeadcount / data.meetings) * 10) / 10 : 0,
        circleCount: data.circles.size,
      }))
      .sort((a, b) => b.avgAttendance - a.avgAttendance);

    // By day
    const byDay: Record<string, { totalHeadcount: number; meetings: number; circles: Set<number> }> = {};
    for (const occ of metOccurrences) {
      const leader = leaderMap.get(occ.leader_id);
      const day = leader?.day || 'Unknown';
      if (!byDay[day]) byDay[day] = { totalHeadcount: 0, meetings: 0, circles: new Set() };
      byDay[day].totalHeadcount += occ.headcount || 0;
      byDay[day].meetings += 1;
      byDay[day].circles.add(occ.leader_id);
    }
    const dayOrder = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const dayBreakdown = Object.entries(byDay)
      .map(([day, data]) => ({
        day,
        avgAttendance: data.meetings > 0 ? Math.round((data.totalHeadcount / data.meetings) * 10) / 10 : 0,
        circleCount: data.circles.size,
      }))
      .sort((a, b) => dayOrder.indexOf(a.day) - dayOrder.indexOf(b.day));

    // By time of day
    const byTime: Record<string, { totalHeadcount: number; meetings: number; circles: Set<number> }> = {};
    for (const occ of metOccurrences) {
      const leader = leaderMap.get(occ.leader_id);
      const bucket = getTimeBucket(leader?.time);
      if (!byTime[bucket]) byTime[bucket] = { totalHeadcount: 0, meetings: 0, circles: new Set() };
      byTime[bucket].totalHeadcount += occ.headcount || 0;
      byTime[bucket].meetings += 1;
      byTime[bucket].circles.add(occ.leader_id);
    }
    const timeBreakdown = Object.entries(byTime)
      .map(([time, data]) => ({
        time,
        avgAttendance: data.meetings > 0 ? Math.round((data.totalHeadcount / data.meetings) * 10) / 10 : 0,
        circleCount: data.circles.size,
      }))
      .sort((a, b) => {
        const order = ['Morning', 'Afternoon', 'Evening', 'Unknown'];
        return order.indexOf(a.time) - order.indexOf(b.time);
      });

    // ── "Needs Attention" alerts ──────────────────────────────────
    // Use the latest meeting date as reference point (not today) so alerts
    // are relative to the most recent data, not stale-looking when sync lags.
    const refDate = latestMeetingDate ? new Date(latestMeetingDate + 'T00:00:00') : new Date();
    const twoWeeksBefore = new Date(refDate);
    twoWeeksBefore.setDate(twoWeeksBefore.getDate() - 14);
    const twoWeeksStr = twoWeeksBefore.toISOString().split('T')[0];

    type AlertItem = {
      id: number;
      name: string;
      campus?: string;
      reason: 'declining' | 'no_report' | 'low_attendance';
      detail: string;
    };
    const alerts: AlertItem[] = [];
    const alertIds = new Set<number>();

    const occByLeader = new Map<number, typeof allOccurrences>();
    for (const occ of allOccurrences) {
      if (!occByLeader.has(occ.leader_id)) occByLeader.set(occ.leader_id, []);
      occByLeader.get(occ.leader_id)!.push(occ);
    }

    for (const leader of filteredLeaders) {
      const leaderOccs = (occByLeader.get(leader.id) || []).sort(
        (a, b) => b.meeting_date.localeCompare(a.meeting_date)
      );

      // 1. No report in 2+ weeks
      const lastOcc = leaderOccs[0];
      if (!lastOcc || lastOcc.meeting_date < twoWeeksStr) {
        if (!alertIds.has(leader.id)) {
          const weeksAgo = lastOcc
            ? Math.floor((refDate.getTime() - new Date(lastOcc.meeting_date + 'T00:00:00').getTime()) / (7 * 24 * 60 * 60 * 1000))
            : null;
          alerts.push({
            id: leader.id,
            name: leader.name,
            campus: leader.campus,
            reason: 'no_report',
            detail: weeksAgo ? `No report in ${weeksAgo} weeks` : 'No reports found',
          });
          alertIds.add(leader.id);
        }
        continue;
      }

      // 2. Declining: 3+ consecutive meetings of decreasing headcount
      const metOccsDesc = leaderOccs.filter((o) => o.status === 'met' && o.headcount != null);
      if (metOccsDesc.length >= 4 && !alertIds.has(leader.id)) {
        const recent4 = metOccsDesc.slice(0, 4);
        let declining = true;
        for (let i = 0; i < recent4.length - 1; i++) {
          if ((recent4[i].headcount || 0) >= (recent4[i + 1].headcount || 0)) {
            declining = false;
            break;
          }
        }
        if (declining) {
          const drop = (recent4[recent4.length - 1].headcount || 0) - (recent4[0].headcount || 0);
          alerts.push({
            id: leader.id,
            name: leader.name,
            campus: leader.campus,
            reason: 'declining',
            detail: `Down ${drop} over last ${recent4.length} meetings`,
          });
          alertIds.add(leader.id);
        }
      }

      // 3. Below threshold (avg < 4)
      const leaderData = leaderAvgs[leader.id];
      if (leaderData && leaderData.count >= 2 && !alertIds.has(leader.id)) {
        const avg = leaderData.sum / leaderData.count;
        if (avg < 4) {
          alerts.push({
            id: leader.id,
            name: leader.name,
            campus: leader.campus,
            reason: 'low_attendance',
            detail: `Avg ${Math.round(avg * 10) / 10} (below 4)`,
          });
          alertIds.add(leader.id);
        }
      }
    }

    const reasonOrder = { no_report: 0, declining: 1, low_attendance: 2 };
    alerts.sort((a, b) => reasonOrder[a.reason] - reasonOrder[b.reason]);

    return NextResponse.json({
      summary: {
        totalActiveCircles: filteredLeaders.length,
        avgAttendance,
        avgCircleSize,
        totalMeetings: metOccurrences.length,
        totalHeadcount,
        attendanceTrend,
        growthPct,
        peakAttendance: metOccurrences.length > 0 ? Math.max(...metOccurrences.map((o) => o.headcount || 0)) : 0,
        lastSyncedAt,
        latestMeetingDate,
      },
      weeklyTrend,
      campusBreakdown,
      typeBreakdown,
      dayBreakdown,
      timeBreakdown,
      topFive,
      bottomFive,
      alerts,
    });
  } catch (err: any) {
    console.error('Circle dashboard API error:', err);
    return NextResponse.json({ error: err.message || 'Failed to load dashboard data' }, { status: 500 });
  }
}

// ── Helpers ─────────────────────────────────────────────────────

function getWeekKey(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1); // Monday start
  const monday = new Date(d);
  monday.setDate(diff);
  return monday.toISOString().split('T')[0];
}

function formatWeekLabel(weekKey: string): string {
  const d = new Date(weekKey + 'T00:00:00');
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function parseTimeHour(timeStr: string): number {
  const match = timeStr.match(/(\d{1,2})/);
  if (!match) return 12;
  let hour = parseInt(match[1]);
  if (timeStr.toLowerCase().includes('pm') && hour < 12) hour += 12;
  if (timeStr.toLowerCase().includes('am') && hour === 12) hour = 0;
  return hour;
}

function getTimeBucket(time?: string | null): string {
  if (!time) return 'Unknown';
  const timeLower = time.toLowerCase();
  if (timeLower.includes('morning') || timeLower.includes('am')) return 'Morning';
  if (timeLower.includes('afternoon')) return 'Afternoon';
  if (timeLower.includes('evening') || timeLower.includes('night')) return 'Evening';
  const hour = parseTimeHour(time);
  if (hour < 12) return 'Morning';
  if (hour < 17) return 'Afternoon';
  return 'Evening';
}
