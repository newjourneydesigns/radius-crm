/**
 * POST /api/weekly-report-email
 *
 * Sends the Weekly Circle Report — an executive summary of the last completed
 * Sunday–Saturday week (compliance, attendance, campus breakdown, circles
 * needing attention) — to every ACPD/admin user. Triggered by the
 * `weekly-circle-report` Netlify scheduled function on Monday mornings.
 *
 * Auth: Authorization: Bearer {CRON_SECRET} (fail-closed, same as
 * /api/daily-summary). Accepts { testEmail: "..." } to send a single copy to
 * one address instead of the ACPD list.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServiceSupabaseClient } from '../../../lib/server-supabase';
import {
  addDays,
  groupedBreakdown,
  loadCircleReport,
  startOfWeekSunday,
  todayCentralISO,
} from '../../../lib/circleReporting';
import { sendWeeklyCircleReportEmail, type WeeklyCircleReportData } from '../../../lib/emailService';

export const dynamic = 'force-dynamic';

function isAuthorized(request: NextRequest): boolean {
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;
  // Fail closed: a missing CRON_SECRET must never authorize the caller.
  if (!cronSecret) return false;
  return authHeader === `Bearer ${cronSecret}`;
}

export async function POST(request: NextRequest) {
  try {
    if (!isAuthorized(request)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    const testEmail: string | undefined = typeof body.testEmail === 'string' ? body.testEmail : undefined;

    const db = createServiceSupabaseClient();

    const currentWeek = startOfWeekSunday(todayCentralISO());
    const lastCompletedSaturday = addDays(currentWeek, -1);
    const lastCompletedWeek = addDays(currentWeek, -7);

    // Eight completed weeks of context: enough for the week-over-week deltas
    // and a meaningful "missed N in a row" streak in the attention list.
    const report = await loadCircleReport(db, {
      startDate: addDays(lastCompletedSaturday, -55),
      endDate: lastCompletedSaturday,
    });

    const trend = report.weeklyTrend;
    const week = trend[trend.length - 1];
    const prevWeek = trend.length >= 2 ? trend[trend.length - 2] : null;
    if (!week) {
      return NextResponse.json({ error: 'No completed week to report on' }, { status: 422 });
    }

    const lastWeekEvents = report.allEvents.filter((event) => event.week_start_date === lastCompletedWeek);
    const campuses = groupedBreakdown(lastWeekEvents, 'campus').map((row) => ({
      name: row.name,
      expected: row.expected,
      met: row.met,
      compliancePct: row.compliancePct,
    }));

    const emailData: WeeklyCircleReportData = {
      weekStart: lastCompletedWeek,
      weekEnd: lastCompletedSaturday,
      appUrl: process.env.NEXT_PUBLIC_APP_URL || 'https://radius.valleycreek.org',
      week,
      prevWeek,
      campuses,
      attention: report.attentionList.slice(0, 10).map((entry) => ({
        leader_name: entry.leader_name,
        circle_name: entry.circle_name,
        campus: entry.campus,
        missedCount: entry.missedCount,
      })),
      attentionTotal: report.attentionList.length,
    };

    let recipients: string[];
    if (testEmail) {
      recipients = [testEmail];
    } else {
      const { data: admins, error: adminsError } = await db
        .from('users')
        .select('email, role')
        .in('role', ['ACPD', 'admin'])
        .not('email', 'is', null);
      if (adminsError) throw adminsError;
      recipients = Array.from(new Set((admins ?? []).map((row) => row.email as string).filter(Boolean)));
    }

    const errors: Array<{ email: string; error: string }> = [];
    let sent = 0;
    for (const email of recipients) {
      const result = await sendWeeklyCircleReportEmail(email, emailData);
      if (result.success) sent += 1;
      else errors.push({ email, error: result.error ?? 'Unknown error' });
    }

    return NextResponse.json({
      ok: true,
      week: lastCompletedWeek,
      recipients: recipients.length,
      sent,
      errors,
    });
  } catch (err: any) {
    console.error('[weekly-report-email POST]', err);
    return NextResponse.json({ error: err.message || 'Failed to send weekly circle report' }, { status: 500 });
  }
}
