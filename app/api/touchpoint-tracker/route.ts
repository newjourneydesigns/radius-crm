/**
 * Touchpoint Tracker data — per-leader coverage for the current period, broken
 * down by touchpoint type so the page can filter coverage to any subset of
 * types. Any signed-in RADIUS user may read; the page filters/sorts and rolls up.
 *
 * Sources, unified under one "type" taxonomy:
 *   - logged touchpoints (from the event-summary modal) → "Event Summary Follow-up"
 *   - connections logged on the Circle Leader page → their connection-type name
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServiceSupabaseClient, getUserFromAuthHeader } from '../../../lib/server-supabase';
import { normalizeTouchpointConfig, resolveCurrentPeriod } from '../../../lib/touchpoints';

export const dynamic = 'force-dynamic';

const FOLLOWUP_TYPE_NAME = 'Event Summary Follow-up';

type Acc = { count: number; ms: number; iso: string | null };

export async function GET(req: NextRequest) {
  const user = await getUserFromAuthHeader(req);
  if (!user) return NextResponse.json({ error: 'Invalid or expired token' }, { status: 401 });

  const supabase = createServiceSupabaseClient();

  const { data: settingsRow } = await supabase.from('touchpoint_settings').select('config').eq('id', 1).maybeSingle();
  const config = normalizeTouchpointConfig(settingsRow?.config);
  const period = resolveCurrentPeriod(config);

  const { data: leaders, error: leadersError } = await supabase
    .from('circle_leaders')
    .select('id, name, campus, acpd, status, leader_type')
    .or('leader_type.is.null,leader_type.eq.circle')
    .neq('status', 'archived');
  if (leadersError) return NextResponse.json({ error: leadersError.message }, { status: 500 });

  const { data: connTypes } = await supabase.from('connection_types').select('id, name, active');
  const typeNameById = new Map<number, string>();
  const activeTypeNames: string[] = [];
  for (const t of connTypes ?? []) {
    typeNameById.set(t.id as number, t.name as string);
    if (t.active) activeTypeNames.push(t.name as string);
  }

  const [tpRes, connRes] = await Promise.all([
    supabase
      .from('touchpoints')
      .select('circle_leader_id, occurred_at')
      .gte('occurred_at', period.startISO)
      .lte('occurred_at', period.endISO),
    supabase
      .from('connections')
      .select('circle_leader_id, date_of_connection, connection_type_id')
      .gte('date_of_connection', period.startDate)
      .lte('date_of_connection', period.endDate),
  ]);
  if (tpRes.error) return NextResponse.json({ error: tpRes.error.message }, { status: 500 });
  // connections is best-effort (table may be absent in some envs) — don't fail.

  // Per leader → per type → { count, last }.
  const byLeader = new Map<number, Map<string, Acc>>();
  const seenTypeNames = new Set<string>();
  const bump = (leaderId: number, type: string, iso: string) => {
    seenTypeNames.add(type);
    let types = byLeader.get(leaderId);
    if (!types) {
      types = new Map<string, Acc>();
      byLeader.set(leaderId, types);
    }
    let a = types.get(type);
    if (!a) {
      a = { count: 0, ms: 0, iso: null };
      types.set(type, a);
    }
    const ms = new Date(iso).getTime();
    a.count += 1;
    if (ms > a.ms) {
      a.ms = ms;
      a.iso = iso;
    }
  };

  for (const tp of tpRes.data ?? []) bump(tp.circle_leader_id as number, FOLLOWUP_TYPE_NAME, tp.occurred_at as string);
  for (const c of connRes.data ?? []) {
    const name = typeNameById.get(c.connection_type_id as number) || 'Other';
    bump(c.circle_leader_id as number, name, c.date_of_connection as string);
  }

  const rows = (leaders ?? []).map((l) => {
    const types = byLeader.get(l.id as number);
    const by_type: Record<string, { count: number; last: string | null }> = {};
    if (types) for (const [name, a] of Array.from(types)) by_type[name] = { count: a.count, last: a.iso };
    return {
      id: l.id as number,
      name: l.name as string,
      campus: l.campus as string | null,
      acpd: l.acpd as string | null,
      status: l.status as string | null,
      by_type,
    };
  });

  // The selectable type list: active connection types + any type seen in data,
  // and always the event-summary follow-up bucket.
  const types = Array.from(new Set([...activeTypeNames, ...Array.from(seenTypeNames), FOLLOWUP_TYPE_NAME])).sort();

  return NextResponse.json({
    config: {
      target_per_period: config.target_per_period,
      period_label: period.label,
      period_start: period.startDate,
      period_end: period.endDate,
    },
    types,
    leaders: rows,
    generated_at: new Date().toISOString(),
  });
}
