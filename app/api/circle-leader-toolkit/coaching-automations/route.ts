/**
 * POST /api/circle-leader-toolkit/coaching-automations
 *
 * Called by the daily Netlify scheduled function. For every eligible Circle
 * Leader it resolves their effective coaching config (org defaults + per-leader
 * overrides), evaluates which nudges are due, and delivers each as a Circle
 * Summary inbox message. Idempotent: every send is recorded in
 * coaching_automation_sends with a UNIQUE(leader_id, kind, subject_key) guard,
 * so re-running never double-delivers.
 *
 * Authorization: Bearer ${CRON_SECRET} (same pattern as the other cron routes).
 */

import { NextResponse } from 'next/server';
import { createServiceSupabaseClient } from '../../../../lib/server-supabase';
import { deliverToLeaders, isEligibleLeader, LeaderTarget } from '../../../../lib/circle-leader-toolkit/inbox-delivery';
import { CoachingConfigOverride, resolveGlobalDefaults, resolveLeaderConfig } from '../../../../lib/circle-leader-toolkit/coaching/config';
import { CoachingLeader, DueNudge, evaluateLeader } from '../../../../lib/circle-leader-toolkit/coaching/engine';
import { resolveTemplates, type TemplateOverrides } from '../../../../lib/circle-leader-toolkit/coaching/templates';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

interface LeaderRow extends LeaderTarget {
  coaching_automation_overrides: unknown;
}

export async function POST(req: Request) {
  const auth = req.headers.get('authorization') || '';
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || auth !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
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
  if (leadersError) {
    return NextResponse.json({ error: leadersError.message }, { status: 500 });
  }

  const leaders = ((leaderRows || []) as LeaderRow[]).filter(isEligibleLeader);

  let sentCount = 0;
  const sentByKind: Record<string, number> = {};
  const errors: Array<{ leaderId: number | string; error: string }> = [];

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

      const nudges = await evaluateLeader(coachingLeader, config, templates, supabase);
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

  return NextResponse.json({
    ok: true,
    eligibleLeaders: leaders.length,
    sentCount,
    sentByKind,
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
