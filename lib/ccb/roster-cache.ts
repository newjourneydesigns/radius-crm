import type { SupabaseClient } from '@supabase/supabase-js';

/** Shape returned by CCBClient.getGroupParticipants / CCBv2Client.getGroupParticipants. */
export interface CcbRosterParticipant {
  id: string;
  firstName: string;
  lastName: string;
  fullName: string;
  email: string;
  phone: string;
  mobilePhone: string;
  status: string;
  statusId: string;
  isActive: boolean;
}

export interface RosterCacheSyncResult {
  upserted: number;
  deactivated: number;
  error?: string;
}

/**
 * Write a leader's freshly fetched CCB roster into circle_roster_cache and
 * deactivate cached members who are no longer in the group.
 *
 * getGroupParticipants only returns current, active group members — someone
 * removed from the group in CCB is simply ABSENT from the payload, never
 * flagged inactive. The cache writers used to be additive-only, so departed
 * members stayed active in RADIUS forever: on roster pages, in member counts,
 * and in the coaching automations. Absent members are soft-deactivated rather
 * than deleted so a bad pull is self-healing — if CCB returns them again
 * later, the upsert flips them back to active.
 *
 * Deliberately a no-op when the payload is EMPTY: an empty list is far more
 * likely a failed or partial CCB response than a genuinely empty circle, and
 * deactivating a whole roster on it would be destructive.
 *
 * `added_at` is intentionally absent from the payload — it defaults to NOW()
 * on first insert, and ON CONFLICT only touches supplied columns, so each
 * member's original join time survives. The coaching automations rely on it
 * to spot genuinely new members.
 */
export async function syncRosterCacheForLeader(
  supabase: SupabaseClient,
  leaderId: number,
  ccbGroupId: string,
  participants: CcbRosterParticipant[]
): Promise<RosterCacheSyncResult> {
  if (participants.length === 0) return { upserted: 0, deactivated: 0 };

  const now = new Date().toISOString();
  const rows = participants.map((p) => ({
    circle_leader_id: leaderId,
    ccb_group_id: ccbGroupId,
    ccb_individual_id: p.id,
    first_name: p.firstName,
    last_name: p.lastName,
    full_name: p.fullName,
    email: p.email,
    phone: p.phone,
    mobile_phone: p.mobilePhone,
    status: p.status || '',
    status_id: p.statusId || '',
    is_active: p.isActive !== false,
    fetched_at: now,
  }));

  const { error: upsertError } = await supabase
    .from('circle_roster_cache')
    .upsert(rows, { onConflict: 'circle_leader_id,ccb_individual_id' });
  if (upsertError) {
    return { upserted: 0, deactivated: 0, error: upsertError.message };
  }

  // Members absent from a successful pull have left the group in CCB. Scoped
  // by leader only (not group), so members of a previously linked group fall
  // away too when a circle's CCB group changes.
  const freshIds = participants
    .map((p) => String(p.id).trim())
    .filter((id) => /^[\w-]+$/.test(id));
  if (freshIds.length === 0) return { upserted: rows.length, deactivated: 0 };

  const { data: departed, error: deactivateError } = await supabase
    .from('circle_roster_cache')
    .update({ is_active: false, fetched_at: now })
    .eq('circle_leader_id', leaderId)
    .eq('is_active', true)
    .not('ccb_individual_id', 'in', `(${freshIds.map((id) => `"${id}"`).join(',')})`)
    .select('ccb_individual_id');

  if (deactivateError) {
    // The fresh data is saved; only the removal pass failed. Report it so the
    // caller can count it, but don't undo the successful upsert.
    return { upserted: rows.length, deactivated: 0, error: deactivateError.message };
  }

  return { upserted: rows.length, deactivated: departed?.length ?? 0 };
}
