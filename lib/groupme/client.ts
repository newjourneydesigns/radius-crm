/**
 * GroupMe API v3 client — request layer + group/member helpers.
 *
 * Auth model: a single service account (the token owner) is added to every
 * student leader's GroupMe group. `GET /groups` only returns groups the token
 * owner is a member of, so the service account must be in each group we want to
 * import. The token is a personal access token (no OAuth refresh) read from
 * `GROUPME_ACCESS_TOKEN`. Server-side only — never expose to the client.
 *
 * GroupMe member objects expose only `{ user_id, nickname, image_url, roles }`
 * — no phone or email — so a GroupMe member cannot be auto-joined to a CCB
 * individual on a reliable key. Callers do a one-time human-confirmed match and
 * persist the chosen `ccb_individual_id`.
 */

const GROUPME_API_BASE_URL = 'https://api.groupme.com/v3';

export class GroupMeRequestError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly errors: string[],
  ) {
    super(message);
    this.name = 'GroupMeRequestError';
  }
}

export interface GroupMeMember {
  /** Membership id — distinct from user_id; needed for remove/update calls. */
  id?: string;
  user_id: string;
  nickname: string;
  muted?: boolean;
  image_url: string | null;
  roles?: string[];
}

export interface GroupMeGroup {
  id: string;
  name: string;
  type: string;
  description: string | null;
  image_url: string | null;
  creator_user_id: string;
  created_at: number;
  updated_at: number;
  /** null when the request used omit=memberships. */
  members: GroupMeMember[] | null;
  share_url: string | null;
}

interface RequestOptions {
  method?: 'GET' | 'POST';
  query?: Record<string, string | number | boolean | undefined>;
  body?: unknown;
}

function getAccessToken(): string {
  const token = process.env.GROUPME_ACCESS_TOKEN;
  if (!token) {
    throw new Error(
      'GROUPME_ACCESS_TOKEN is not set. Add the GroupMe personal access token to .env.local.',
    );
  }
  return token;
}

/**
 * Low-level authenticated request. The token always travels as a `token` query
 * param (GroupMe's required auth). Returns the unwrapped `response` payload, or
 * null on an empty body. Throws GroupMeRequestError on non-2xx.
 */
export async function groupMeRequest<T = unknown>(
  path: string,
  options: RequestOptions = {},
): Promise<T> {
  const url = new URL(`${GROUPME_API_BASE_URL}${path}`);
  url.searchParams.set('token', getAccessToken());
  for (const [key, value] of Object.entries(options.query ?? {})) {
    if (value !== undefined) url.searchParams.set(key, String(value));
  }

  const res = await fetch(url.toString(), {
    method: options.method ?? 'GET',
    headers: options.body ? { 'Content-Type': 'application/json' } : undefined,
    body: options.body ? JSON.stringify(options.body) : undefined,
    cache: 'no-store',
  });

  const text = await res.text();
  const json = text ? JSON.parse(text) : null;

  if (!res.ok) {
    const errors: string[] = json?.meta?.errors ?? [];
    throw new GroupMeRequestError(
      `GroupMe ${options.method ?? 'GET'} ${path} failed (${res.status})${
        errors.length ? `: ${errors.join(', ')}` : ''
      }`,
      res.status,
      errors,
    );
  }

  return (json?.response ?? null) as T;
}

/**
 * List every active group the service account belongs to, paging until the API
 * returns a short page. Pass `includeMembers: true` only when you actually need
 * rosters — omitting memberships is much faster for accounts in large groups.
 */
export async function listGroups(
  { includeMembers = false, perPage = 100 }: { includeMembers?: boolean; perPage?: number } = {},
): Promise<GroupMeGroup[]> {
  const groups: GroupMeGroup[] = [];
  let page = 1;

  for (;;) {
    const batch = await groupMeRequest<GroupMeGroup[] | null>('/groups', {
      query: {
        page,
        per_page: perPage,
        omit: includeMembers ? undefined : 'memberships',
      },
    });

    if (!batch || batch.length === 0) break;
    groups.push(...batch);
    if (batch.length < perPage) break;
    page += 1;
  }

  return groups;
}

/** Load a single group with its full member list. */
export async function getGroup(groupId: string): Promise<GroupMeGroup> {
  const group = await groupMeRequest<GroupMeGroup>(`/groups/${groupId}`);
  if (!group) {
    throw new GroupMeRequestError(`GroupMe group ${groupId} not found`, 404, []);
  }
  return group;
}

/** Convenience: just the members of a group (the import's primary input). */
export async function getGroupMembers(groupId: string): Promise<GroupMeMember[]> {
  const group = await getGroup(groupId);
  return group.members ?? [];
}
