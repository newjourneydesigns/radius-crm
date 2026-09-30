// Client-side CCB group roster import, with phone numbers, for Bulk Message.
//
// Asking /api/ccb/group-roster for phones makes it read one CCB profile per
// person inside a single request. Past about eighteen people that runs over
// Netlify's 10-second function limit, and the browser gets Netlify's HTML error
// page instead of JSON ("Unexpected token '<'"). So the roster comes back bare
// (`enrichPhones: false`) and the phones are filled in afterwards through
// /api/ccb/individual-phones, which stops at its own deadline and hands back
// whoever it didn't reach. Any group size finishes; a big one takes minutes.

import { apiFetch } from './apiClient';

export interface CcbRosterMember {
  id?: string;
  fullName?: string;
  firstName?: string;
  lastName?: string;
  mobilePhone?: string;
  phone?: string;
  birthday?: string;
  isActive?: boolean;
}

export interface CcbRosterImport {
  /** Active members, with whatever phones and birthdays CCB had. */
  members: CcbRosterMember[];
  groupName: string | null;
  /** Members still waiting on a phone lookup when it had to stop. */
  notLookedUp: number;
  /** Why the lookup stopped early, when `notLookedUp` is non-zero. */
  lookupError?: string;
}

interface ImportOptions {
  /** One extra CCB call, for a label better than the bare group number. */
  includeGroupName?: boolean;
  onLookupProgress?: (done: number, total: number) => void;
}

interface ProfileContact {
  phone: string;
  mobilePhone: string;
  birthday: string;
  isActive: boolean;
}

/** /api/ccb/individual-phones ignores ids past this many in one request. */
const MAX_IDS_PER_LOOKUP = 400;

/**
 * Longest pause for CCB's circuit breaker before giving up. Its per-minute cap
 * clears within a minute; a longer wait means the hourly cap, which isn't
 * worth holding the screen for.
 */
const MAX_BREAKER_WAIT_MS = 65_000;

/** Back-to-back batches that reach nobody before the lookup gives up. */
const MAX_STALLS = 3;

const STOPPED_ANSWERING = 'CCB stopped answering before their phone numbers loaded';

/**
 * Parse a JSON response. A function that runs out of time gets Netlify's HTML
 * error page instead of JSON, and `res.json()` on that throws "Unexpected
 * token '<'", which tells nobody anything.
 */
async function readJson<T>(res: Response): Promise<T> {
  const text = await res.text();
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error(res.status >= 500
      ? `CCB didn't answer in time (HTTP ${res.status}). Try again in a minute.`
      : `Radius got an unexpected reply (HTTP ${res.status}). Try again in a minute.`);
  }
}

async function lookUpContacts(
  ids: string[],
  onProgress?: (done: number, total: number) => void,
): Promise<{ found: Record<string, ProfileContact>; notLookedUp: number; error?: string }> {
  const found: Record<string, ProfileContact> = {};
  let pending = ids;
  let stalls = 0;
  let error: string | undefined;
  if (ids.length > 0) onProgress?.(0, ids.length);

  while (pending.length > 0) {
    const batch = pending.slice(0, MAX_IDS_PER_LOOKUP);
    let remaining: string[];
    let retryAfterMs: number;

    try {
      const res = await apiFetch('/api/ccb/individual-phones', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ individualIds: batch }),
      });
      const json = await readJson<{
        success?: boolean;
        phones?: Record<string, ProfileContact>;
        remaining?: string[];
        retryAfterMs?: number;
        details?: string;
        error?: string;
      }>(res);
      if (!res.ok || !json.success) {
        error = json.details || json.error || STOPPED_ANSWERING;
        break;
      }
      Object.assign(found, json.phones || {});
      remaining = json.remaining || [];
      retryAfterMs = json.retryAfterMs || 0;
    } catch {
      error = STOPPED_ANSWERING;
      break;
    }

    pending = [...remaining, ...pending.slice(batch.length)];
    onProgress?.(ids.length - pending.length, ids.length);
    if (remaining.length === 0) continue;

    if (retryAfterMs > MAX_BREAKER_WAIT_MS) {
      const minutes = Math.ceil(retryAfterMs / 60_000);
      error = `Radius hit its hourly CCB limit before their phone numbers loaded (try again in about ${minutes} minutes)`;
      break;
    }
    // A batch that reached nobody is expected once when the breaker is at its
    // cap. Reaching nobody with no reason to wait, or again and again, means
    // CCB isn't coming back soon — stop rather than spin.
    const reachedNobody = remaining.length >= batch.length;
    stalls = reachedNobody ? stalls + 1 : 0;
    if (stalls > MAX_STALLS || (reachedNobody && retryAfterMs === 0)) {
      error = STOPPED_ANSWERING;
      break;
    }
    if (retryAfterMs > 0) await new Promise(resolve => setTimeout(resolve, retryAfterMs));
  }

  return { found, notLookedUp: pending.length, error };
}

/**
 * Pull a CCB group's roster with phone numbers, looking up whoever the roster
 * came back without. Throws when the roster itself can't be read; a lookup
 * that stops partway returns what it has and says how many it didn't reach.
 */
export async function importCcbGroupRoster(
  groupId: string,
  options: ImportOptions = {},
): Promise<CcbRosterImport> {
  const res = await apiFetch('/api/ccb/group-roster', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      groupId,
      includeGroupName: options.includeGroupName === true,
      enrichPhones: false,
    }),
  });
  const json = await readJson<{
    success?: boolean;
    data?: CcbRosterMember[];
    groupName?: string | null;
    details?: string;
    error?: string;
  }>(res);
  if (!res.ok || !json.success) {
    throw new Error(json.details || json.error || 'Failed to load roster');
  }

  const roster = json.data || [];
  const missing = roster
    .filter(m => m.id && !m.phone && !m.mobilePhone)
    .map(m => m.id as string);
  const lookup = await lookUpContacts(missing, options.onLookupProgress);

  // The profile read is also the only place v1 reports a birthday (for the
  // under-18 gate) and whether CCB has since marked someone inactive.
  const members = roster
    .map((m): CcbRosterMember => {
      const contact = m.id ? lookup.found[m.id] : undefined;
      if (!contact) return m;
      return {
        ...m,
        phone: contact.phone || m.phone,
        mobilePhone: contact.mobilePhone || m.mobilePhone,
        birthday: contact.birthday || m.birthday,
        isActive: contact.isActive,
      };
    })
    .filter(m => m.isActive !== false);

  return {
    members,
    groupName: json.groupName ?? null,
    notLookedUp: lookup.notLookedUp,
    lookupError: lookup.error,
  };
}
