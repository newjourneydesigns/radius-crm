/**
 * CCB group cache sweep — rebuilds the `ccb_group_cache` table from CCB v1's
 * `group_profiles` service so /api/ccb/group-search can answer from Postgres
 * without spending CCB API budget.
 *
 * Every CCB call here goes through CCBClient.getXml, i.e. through the shared
 * daily budget guard and the per-instance circuit breaker. If either trips,
 * the sweep stops where it is and reports `complete: false` — the rows already
 * upserted are newer copies of groups that were already cached, and stale-row
 * deletion only ever runs after a COMPLETE sweep, so a partial sweep can never
 * shrink the cache.
 */

import { createCCBClient, CCBDailyBudgetError, CCBCircuitBreakerError } from './ccb-client';
import type { CCBApiRequestContext } from './ccb-api-gateway';
import { createServiceSupabaseClient } from '../server-supabase';

// CCB honors page/per_page on its paginated v1 services (see
// getIndividualsModifiedSince in ccb-client.ts, verified live with
// individual_profiles). 100/page keeps a full church sweep to tens of calls.
const PER_PAGE = 100;
// Termination backstop: 100 pages = 10,000 groups, far above any real church.
const MAX_PAGES = 100;
const UPSERT_CHUNK = 500;

export interface CachedGroupRow {
  id: string;
  name: string;
  campus: string | null;
  group_type: string | null;
  main_leader: string | null;
  member_count: number | null;
  inactive: boolean;
  synced_at: string;
}

export interface GroupCacheSweepResult {
  complete: boolean;
  pagesFetched: number;
  groupsUpserted: number;
  staleDeleted: number;
  /** Stamped only when the sweep completed; mirrors ccb_group_cache_state.last_full_sync_at. */
  syncedAt: string | null;
  reason?: string;
}

function text(value: unknown): string {
  if (value == null) return '';
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return String(value).trim();
  }
  const rec = value as Record<string, unknown>;
  return String(rec['#text'] ?? '').trim();
}

function bool(value: unknown): boolean | null {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value === 1 ? true : value === 0 ? false : null;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (['true', '1', 'yes', 'y'].includes(normalized)) return true;
    if (['false', '0', 'no', 'n'].includes(normalized)) return false;
  }
  return null;
}

function intOrNull(value: unknown): number | null {
  const raw = text(value);
  if (!raw) return null;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? Math.round(parsed) : null;
}

/**
 * Parse one page of group_profiles XML into cache rows (without synced_at).
 * Unlike CCBClient.searchGroups' parser, inactive groups are KEPT — the cache
 * carries an `inactive` flag so the search endpoint can filter, and
 * group_profiles does return inactive groups (searchGroups filters them out
 * as "a fallback filter if CCB doesn't honour include_inactive=false").
 */
type XmlRecord = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any -- fast-xml-parser output is untyped, as everywhere else in lib/ccb

export function parseGroupProfilesPage(xml: XmlRecord): Array<Omit<CachedGroupRow, 'synced_at'>> {
  const groupsRoot = xml?.ccb_api?.response?.groups;
  const groupArray: XmlRecord[] = Array.isArray(groupsRoot?.group)
    ? groupsRoot.group
    : groupsRoot?.group
      ? [groupsRoot.group]
      : [];

  const rows: Array<Omit<CachedGroupRow, 'synced_at'>> = [];
  for (const g of groupArray) {
    const id = String(g?.['@_id'] ?? g?.id ?? '').trim();
    const name = text(g?.name) || text(g?.group_name);
    if (!id || !name) continue;

    // Main leader — nested object; keep a display name only. Same fallbacks as
    // CCBClient.parseGroupDetails, including dropping email-like "names".
    const leader = g?.main_leader || g?.director || null;
    let mainLeader: string | null = null;
    if (leader) {
      const first = text(leader.first_name);
      const last = text(leader.last_name);
      const joined = [first, last].filter(Boolean).join(' ');
      const raw = text(leader.full_name) || text(leader.name);
      mainLeader = joined || (raw && !raw.includes('@') ? raw : '') || null;
    }

    const campus = text(g?.campus?.['#text'] ?? g?.campus?.name ?? g?.campus ?? g?.site) || null;
    const groupType =
      text(g?.group_type?.['#text'] ?? g?.group_type?.name ?? g?.group_type) ||
      text(g?.department?.['#text'] ?? g?.department?.name ?? g?.department) ||
      null;

    // With include_participants=false CCB sends no roster and (in practice) no
    // membership count; probe the plausible fields and settle for null.
    const participants = g?.participants?.participant;
    const memberCount =
      intOrNull(g?.member_count) ??
      intOrNull(g?.current_members) ??
      intOrNull(g?.participants?.['@_count']) ??
      (Array.isArray(participants) ? participants.length : participants ? 1 : null);

    rows.push({
      id,
      name,
      campus,
      group_type: groupType,
      main_leader: mainLeader,
      member_count: memberCount,
      inactive: bool(g?.inactive ?? g?.['@_inactive']) === true,
    });
  }
  return rows;
}

/**
 * Run one full sweep: page through group_profiles, upsert every group, and —
 * only if every page was fetched — delete rows the sweep didn't touch and
 * stamp ccb_group_cache_state.last_full_sync_at.
 */
export async function syncCCBGroupCache(
  context?: CCBApiRequestContext,
): Promise<GroupCacheSweepResult> {
  const supabase = createServiceSupabaseClient();
  const ccbClient = createCCBClient(context);
  const sweepStartedAt = new Date().toISOString();

  const seenIds = new Set<string>();
  let pagesFetched = 0;
  let groupsUpserted = 0;
  let complete = false;
  let abortReason: string | undefined;

  const upsertRows = async (rows: Array<Omit<CachedGroupRow, 'synced_at'>>) => {
    for (let i = 0; i < rows.length; i += UPSERT_CHUNK) {
      const chunk: CachedGroupRow[] = rows
        .slice(i, i + UPSERT_CHUNK)
        .map((r) => ({ ...r, synced_at: sweepStartedAt }));
      const { error } = await supabase.from('ccb_group_cache').upsert(chunk, { onConflict: 'id' });
      if (error) throw new Error(`ccb_group_cache upsert failed: ${error.message}`);
      groupsUpserted += chunk.length;
    }
  };

  try {
    for (let page = 1; page <= MAX_PAGES; page++) {
      const xml = await ccbClient.getXml({
        srv: 'group_profiles',
        include_participants: false,
        page,
        per_page: PER_PAGE,
      });
      pagesFetched++;

      const parsed = parseGroupProfilesPage(xml);
      const fresh = parsed.filter((g) => !seenIds.has(g.id));
      fresh.forEach((g) => seenIds.add(g.id));
      await upsertRows(fresh);

      // A short page is the end of the list. A page of only already-seen ids
      // guards against a CCB instance that ignores per_page and answers every
      // page with the full list — without it the loop would never terminate.
      if (parsed.length < PER_PAGE || fresh.length === 0) {
        complete = true;
        break;
      }
    }
    if (!complete) {
      abortReason = `sweep hit the ${MAX_PAGES}-page backstop before reaching the end of group_profiles`;
    }
  } catch (error) {
    if (error instanceof CCBDailyBudgetError || error instanceof CCBCircuitBreakerError) {
      // Budget/limits are tight today — leave yesterday's cache serving.
      abortReason = error.message;
    } else {
      const message = error instanceof Error ? error.message : String(error);
      await recordAttempt(supabase, sweepStartedAt, message || 'sweep failed');
      throw error;
    }
  }

  let staleDeleted = 0;
  if (complete) {
    // Rows the sweep didn't touch are groups CCB no longer returns. Delete
    // them ONLY here — after every page was fetched.
    const { data: deleted, error: deleteError } = await supabase
      .from('ccb_group_cache')
      .delete()
      .lt('synced_at', sweepStartedAt)
      .select('id');
    if (deleteError) throw new Error(`ccb_group_cache stale delete failed: ${deleteError.message}`);
    staleDeleted = deleted?.length ?? 0;

    const { error: stateError } = await supabase
      .from('ccb_group_cache_state')
      .upsert({ id: 1, last_full_sync_at: sweepStartedAt, last_attempt_at: sweepStartedAt, last_error: null });
    if (stateError) throw new Error(`ccb_group_cache_state update failed: ${stateError.message}`);
  } else {
    await recordAttempt(supabase, sweepStartedAt, abortReason || 'sweep incomplete');
  }

  return {
    complete,
    pagesFetched,
    groupsUpserted,
    staleDeleted,
    syncedAt: complete ? sweepStartedAt : null,
    reason: abortReason,
  };
}

async function recordAttempt(
  supabase: ReturnType<typeof createServiceSupabaseClient>,
  attemptAt: string,
  errorMessage: string,
) {
  // Best-effort bookkeeping — never let it mask the sweep's own outcome.
  try {
    await supabase
      .from('ccb_group_cache_state')
      .upsert({ id: 1, last_attempt_at: attemptAt, last_error: errorMessage.slice(0, 2000) });
  } catch (e) {
    console.warn('[group-cache-sync] failed to record attempt state:', e);
  }
}
