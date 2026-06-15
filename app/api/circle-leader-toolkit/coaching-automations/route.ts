/**
 * POST /api/circle-leader-toolkit/coaching-automations
 *
 * Evaluates every eligible Circle Leader and delivers due coaching nudges to
 * their Toolkit inbox. Idempotent: every send is recorded in
 * coaching_automation_sends with a UNIQUE(leader_id, kind, subject_key) guard.
 *
 * All per-leader inputs (roster, attendance, prior sends) are batch-loaded in a
 * handful of queries up front so the daily sweep stays fast at scale.
 *
 * Auth: Bearer ${CRON_SECRET} (the daily cron) OR an ACPD admin token (manual
 * "Run now" from the admin page). Body { dryRun: true } evaluates without
 * delivering or recording — used for the admin preview.
 */

import { NextResponse } from 'next/server';
import { createServiceSupabaseClient, getUserFromAuthHeader } from '../../../../lib/server-supabase';
import { deliverToLeaders, isEligibleLeader, LeaderTarget } from '../../../../lib/circle-leader-toolkit/inbox-delivery';
import { CoachingConfigOverride, resolveGlobalDefaults, resolveLeaderConfig } from '../../../../lib/circle-leader-toolkit/coaching/config';
import { CoachingLeader, DueNudge, RosterRow, evaluateLeader } from '../../../../lib/circle-leader-toolkit/coaching/engine';
import { resolveTemplates, type TemplateOverrides } from '../../../../lib/circle-leader-toolkit/coaching/templates';
import { loadLeaderAttendanceBatch } from '../../../../lib/circle-leader-toolkit/roster-data';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

interface LeaderRow extends LeaderTarget {
  coaching_automation_overrides: unknown;
}

/**
 * Authorize the request and report how it arrived: the daily cron (bearer
 * CRON_SECRET) or a manual run from an ACPD admin. Used to tag the run log.
 */
async function authorize(req: Request): Promise<{ ok: boolean; viaCron: boolean }> {
  const authHeader = req.headers.get('authorization') || '';
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader === `Bearer ${cronSecret}`) return { ok: true, viaCron: true };

  const user = await getUserFromAuthHeader(req);
  if (!user) return { ok: false, viaCron: false };
  const supabase = createServiceSupabaseClient();
  const { data: profile } = await supabase.from('users').select('role').eq('id', user.id).maybeSingle();
  return { ok: profile?.role === 'ACPD', viaCron: false };
}

/**
 * Record a run in coaching_automation_runs. Best-effort: a logging failure (e.g.
 * the table not migrated yet) must never break delivery, so errors are swallowed.
 */
async function logRun(
  supabase: ReturnType<typeof createServiceSupabaseClient>,
  row: {
    trigger: string;
    ok: boolean;
    eligible_leaders: number;
    sent_count: number;
    sent_by_kind: Record<string, number>;
    errors: Array<{ leaderId: number | string; error: string }>;
    duration_ms: number;
    started_at: string;
  }
): Promise<void> {
  try {
    await supabase.from('coaching_automation_runs').insert({ ...row, finished_at: new Date().toISOString() });
  } catch (e) {
    console.error('[coaching-automations] failed to log run:', e);
  }
}

export async function POST(req: Request) {
  const auth = await authorize(req);
  if (!auth.ok) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const startedAtMs = Date.now();
  const startedAtIso = new Date().toISOString();

  let dryRun = false;
  try {
    const body = await req.json();
    dryRun = body?.dryRun === true;
  } catch {
    // No body / not JSON → live run.
  }

  const supabase = createServiceSupabaseClient();

  // Org-wide defaults (singleton row).
  const { data: settingsRow } = await supabase
    .from('coaching_automation_settings')
    .select('config')
    .eq('id', 1)
    .maybeSingle();
  const defaults = resolveGlobalDefaults((settingsRow?.config as Record<string, unknown>) ?? null);

  // Editable message templates (override layer; falls back to built-in copy).
  const { data: templateRows } = await supabase
    .from('coaching_automation_templates')
    .select('automation_kind, title, body_html');
  const storedTemplates: TemplateOverrides = {};
  for (const row of (templateRows || []) as Array<{ automation_kind: string; title: string; body_html: string }>) {
    storedTemplates[row.automation_kind as keyof TemplateOverrides] = { title: row.title, body_html: row.body_html };
  }
  const templates = resolveTemplates(storedTemplates);

  const { data: leaderRows, error: leadersError } = await supabase
    .from('circle_leaders')
    .select('id, name, campus, acpd, ccb_group_id, status, circle_summary_access_enabled, coaching_automation_overrides')
    .not('ccb_group_id', 'is', null);
  const trigger = dryRun ? 'dry_run' : auth.viaCron ? 'cron' : 'manual';
  if (leadersError) {
    await logRun(supabase, {
      trigger,
      ok: false,
      eligible_leaders: 0,
      sent_count: 0,
      sent_by_kind: {},
      errors: [{ leaderId: '*', error: leadersError.message }],
      duration_ms: Date.now() - startedAtMs,
      started_at: startedAtIso,
    });
    return NextResponse.json({ error: leadersError.message }, { status: 500 });
  }

  const leaders = ((leaderRows || []) as LeaderRow[]).filter(isEligibleLeader);
  const leaderIds = leaders.map((l) => l.id);

  // --- Batch-load every per-leader input in a few queries --------------------
  const rosterByLeader = new Map<string, RosterRow[]>();
  const sentByLeader = new Map<string, Set<string>>();
  let attendanceByLeader = new Map<string, Record<string, string>>();

  if (leaderIds.length > 0) {
    const [{ data: rosterRows }, { data: sendRows }, attendance] = await Promise.all([
      supabase
        .from('circle_roster_cache')
        .select('circle_leader_id, ccb_group_id, ccb_individual_id, full_name, first_name, birthday, added_at')
        .in('circle_leader_id', leaderIds)
        .eq('is_active', true),
      supabase
        .from('coaching_automation_sends')
        .select('leader_id, automation_kind, subject_key')
        .in('leader_id', leaderIds),
      loadLeaderAttendanceBatch(leaders.map((l) => ({ id: l.id, ccb_group_id: l.ccb_group_id }))),
    ]);
    attendanceByLeader = attendance;

    for (const row of (rosterRows || []) as Array<Record<string, unknown>>) {
      const key = String(row.circle_leader_id);
      const list = rosterByLeader.get(key) || [];
      list.push({
        ccb_individual_id: String(row.ccb_individual_id),
        full_name: (row.full_name as string) ?? null,
        first_name: (row.first_name as string) ?? null,
        birthday: (row.birthday as string) ?? null,
        added_at: (row.added_at as string) ?? null,
      });
      rosterByLeader.set(key, list);
    }
    for (const row of (sendRows || []) as Array<{ leader_id: number | string; automation_kind: string; subject_key: string }>) {
      const key = String(row.leader_id);
      const set = sentByLeader.get(key) || new Set<string>();
      set.add(`${row.automation_kind}:${row.subject_key}`);
      sentByLeader.set(key, set);
    }
  }

  let sentCount = 0;
  const sentByKind: Record<string, number> = {};
  const errors: Array<{ leaderId: number | string; error: string }> = [];
  const preview: Array<{ leaderId: number | string; name: string; kinds: string[] }> = [];

  for (const leader of leaders) {
    try {
      const config = resolveLeaderConfig(
        defaults,
        (leader.coaching_automation_overrides as CoachingConfigOverride | null) ?? null
      );
      if (!config.enabled) continue;

      const coachingLeader: CoachingLeader = {
        id: leader.id,
        name: leader.name,
        campus: leader.campus,
        acpd: leader.acpd,
        ccb_group_id: leader.ccb_group_id,
        status: leader.status,
        circle_summary_access_enabled: leader.circle_summary_access_enabled,
      };

      const nudges = evaluateLeader(coachingLeader, config, templates, {
        roster: rosterByLeader.get(String(leader.id)) || [],
        lastAttended: attendanceByLeader.get(String(leader.id)) || {},
        sentKeys: sentByLeader.get(String(leader.id)) || new Set<string>(),
      });

      if (nudges.length === 0) continue;

      if (dryRun) {
        preview.push({ leaderId: leader.id, name: leader.name, kinds: nudges.map((n) => n.kind) });
        nudges.forEach((n) => {
          sentByKind[n.kind] = (sentByKind[n.kind] || 0) + 1;
          sentCount += 1;
        });
        continue;
      }

      for (const nudge of nudges) {
        const delivered = await deliverNudge(supabase, leader, nudge);
        if (delivered) {
          sentCount += 1;
          sentByKind[nudge.kind] = (sentByKind[nudge.kind] || 0) + 1;
        }
      }
    } catch (e: unknown) {
      errors.push({ leaderId: leader.id, error: e instanceof Error ? e.message : String(e) });
      console.error('[coaching-automations] leader failed:', leader.id, e);
    }
  }

  await logRun(supabase, {
    trigger,
    ok: errors.length === 0,
    eligible_leaders: leaders.length,
    sent_count: sentCount,
    sent_by_kind: sentByKind,
    errors,
    duration_ms: Date.now() - startedAtMs,
    started_at: startedAtIso,
  });

  return NextResponse.json({
    ok: true,
    dryRun,
    eligibleLeaders: leaders.length,
    sentCount,
    sentByKind,
    ...(dryRun ? { preview } : {}),
    errors,
  });
}

/**
 * Records the dedupe rows first (UNIQUE-guarded). If every subjectKey was already
 * recorded, the nudge was delivered on a prior run — skip. Otherwise create the
 * inbox message, deliver it to the leader, and stamp the rows with its id.
 */
async function deliverNudge(
  supabase: ReturnType<typeof createServiceSupabaseClient>,
  leader: LeaderTarget,
  nudge: DueNudge
): Promise<boolean> {
  // Reserve the subjectKeys atomically; ignore-on-conflict tells us which are new.
  const { data: reserved, error: reserveError } = await supabase
    .from('coaching_automation_sends')
    .upsert(
      nudge.subjectKeys.map((subject_key) => ({
        leader_id: leader.id,
        automation_kind: nudge.kind,
        subject_key,
      })),
      { onConflict: 'leader_id,automation_kind,subject_key', ignoreDuplicates: true }
    )
    .select('id');
  if (reserveError) throw reserveError;

  // Nothing newly reserved → already delivered previously.
  if (!reserved || reserved.length === 0) return false;

  const { data: message, error: messageError } = await supabase
    .from('circle_summary_inbox_messages')
    .insert({
      title: nudge.content.title,
      body_html: nudge.content.bodyHtml,
      target_type: 'leader',
      target_value: String(leader.id),
      category: 'coaching',
      status: 'sent',
    })
    .select('id, title')
    .single();
  if (messageError) {
    // Roll back the reservation so a later run can retry this occurrence.
    await supabase
      .from('coaching_automation_sends')
      .delete()
      .in('id', reserved.map((r) => r.id));
    throw messageError;
  }

  await deliverToLeaders(message, [leader]);

  await supabase
    .from('coaching_automation_sends')
    .update({ message_id: message.id })
    .in('id', reserved.map((r) => r.id));

  return true;
}
