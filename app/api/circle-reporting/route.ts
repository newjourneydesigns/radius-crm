import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getUserFromAuthHeader } from '../../../lib/server-supabase';
import {
  addDays,
  buildExportRecord,
  loadCircleReport,
  startOfWeekSunday,
  todayCentralISO,
} from '../../../lib/circleReporting';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

function getDB() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

function monthIndex(dateISO: string): number {
  return new Date(`${dateISO}T00:00:00Z`).getUTCMonth();
}

export async function GET(request: Request) {
  try {
    // Requires a signed-in staff session — reads leader attendance/reporting
    // data via the service-role client (RLS bypassed).
    const user = await getUserFromAuthHeader(request);
    if (!user) {
      return NextResponse.json({ error: 'Not signed in' }, { status: 401 });
    }

    const db = getDB();
    const { searchParams } = new URL(request.url);

    const today = todayCentralISO();
    const currentWeek = startOfWeekSunday(today);
    const lastCompletedWeek = addDays(currentWeek, -7);
    const selectedWeek = searchParams.get('week_start_date') || lastCompletedWeek;
    const rangePreset = searchParams.get('range') || 'semester_to_date';
    const customStart = searchParams.get('start_date');
    const customEnd = searchParams.get('end_date');
    const campusFilter = searchParams.getAll('campus').filter(Boolean);
    const acpdFilter = searchParams.getAll('acpd').filter(Boolean);
    const circleTypeFilter = searchParams.getAll('circle_type').filter(Boolean);
    const statusFilter = searchParams.getAll('status').filter((value) => value && value !== 'all');
    const exportMode = searchParams.get('export') === '1';

    let startDate = customStart || addDays(currentWeek, -84);
    let endDate = customEnd || addDays(currentWeek, 6);

    if (!customStart && !customEnd) {
      if (rangePreset === 'current_week') {
        startDate = selectedWeek;
        endDate = addDays(selectedWeek, 6);
      } else if (rangePreset === 'previous_week') {
        startDate = addDays(selectedWeek, -7);
        endDate = addDays(selectedWeek, -1);
      } else if (rangePreset === 'year_to_date') {
        startDate = `${today.slice(0, 4)}-01-01`;
        endDate = today;
      } else if (rangePreset === 'semester_to_date') {
        const month = monthIndex(today);
        const year = today.slice(0, 4);
        const semesterStart = month <= 4 ? `${year}-01-01` : month <= 7 ? `${year}-05-01` : `${year}-08-01`;
        startDate = semesterStart;
        endDate = today;
      }
    }

    if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate) || !/^\d{4}-\d{2}-\d{2}$/.test(endDate)) {
      return NextResponse.json({ error: 'Dates must be YYYY-MM-DD' }, { status: 400 });
    }

    // The export carries every circle's notes and prayer requests — pastoral
    // content that viewers don't need in bulk. Admin (ACPD) only.
    if (exportMode) {
      const { data: profile } = await db.from('users').select('role').eq('id', user.id).maybeSingle();
      if (!profile || !['ACPD', 'admin'].includes(profile.role ?? '')) {
        return NextResponse.json({ error: 'Exporting summaries requires admin access' }, { status: 403 });
      }
    }

    const report = await loadCircleReport(db, {
      startDate,
      endDate,
      campusFilter,
      acpdFilter,
      circleTypeFilter,
      statusFilter,
    });

    // Export mode: return full summary content for every expected event in the
    // range so it can be downloaded as JSON/CSV and handed to AI for analysis.
    if (exportMode) {
      const records = report.expectedEvents
        .filter((event) => event.expected_date >= report.startDate && event.expected_date <= report.endDate)
        .map((event) => buildExportRecord(event, report.indexes))
        .sort(
          (a, b) =>
            a.scheduled_date.localeCompare(b.scheduled_date) ||
            a.campus.localeCompare(b.campus) ||
            a.leader_name.localeCompare(b.leader_name)
        );

      return NextResponse.json(
        {
          generatedAt: new Date().toISOString(),
          filters: {
            startDate: report.startDate,
            endDate: report.endDate,
            campuses: campusFilter,
            acpds: acpdFilter,
            circleTypes: circleTypeFilter,
            statuses: statusFilter,
          },
          summary: report.summary,
          totalRecords: records.length,
          events: records,
        },
        { headers: { 'Cache-Control': 'no-store' } }
      );
    }

    const selectedWeekEnd = addDays(selectedWeek, 6);
    const selectedWeekEvents = report.allEvents
      .filter((event) => event.week_start_date === selectedWeek && event.scheduled_date <= selectedWeekEnd)
      .sort(
        (a, b) =>
          a.scheduled_date.localeCompare(b.scheduled_date) ||
          a.scheduled_time.localeCompare(b.scheduled_time) ||
          a.leader_name.localeCompare(b.leader_name)
      );

    return NextResponse.json(
      {
        filters: {
          rangePreset,
          startDate: report.startDate,
          endDate: report.endDate,
          selectedWeek,
          lastCompletedWeek: report.lastCompletedWeek,
          campuses: report.filterOptions.campuses,
          acpds: report.filterOptions.acpds,
          circleTypes: report.filterOptions.circleTypes,
          statuses: report.filterOptions.statuses,
        },
        summary: report.summary,
        weeklyEvents: selectedWeekEvents,
        weeklyTrend: report.weeklyTrend,
        reasonTrend: report.reasonTrend,
        campusBreakdown: report.campusBreakdown,
        circleTypeBreakdown: report.circleTypeBreakdown,
        acpdBreakdown: report.acpdBreakdown,
        didNotMeetInsights: report.didNotMeetInsights,
        attentionList: report.attentionList,
      },
      { headers: { 'Cache-Control': 'no-store' } }
    );
  } catch (err: any) {
    console.error('[circle-reporting GET]', err);
    return NextResponse.json({ error: err.message || 'Failed to load circle reporting data' }, { status: 500 });
  }
}
