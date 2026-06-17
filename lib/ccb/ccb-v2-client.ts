/**
 * CCB API v2 (Pushpay REST/JSON) client — request layer.
 *
 * Field-mapped endpoint methods (getIndividualProfile, getGroupParticipants, …)
 * are added in the per-endpoint cutover once we've confirmed v2's JSON shapes
 * against live data. This layer handles everything that does NOT depend on
 * response field names: OAuth bearer auth (auto-refresh), the required Accept
 * header, telemetry, the daily-budget tripwire, and 429/retry-after handling.
 */

import { getValidAccessToken } from './ccb-v2-auth';
import { CCB_V2_API_BASE_URL, CCB_V2_ACCEPT_HEADER } from './ccb-v2-config';
import {
  recordCCBApiTelemetry,
  reserveCCBDailyBudget,
  type CCBApiRequestContext,
} from './ccb-api-gateway';

export class CCBv2RateLimitError extends Error {
  constructor(message: string, public readonly retryAfterSeconds: number | null) {
    super(message);
    this.name = 'CCBv2RateLimitError';
  }
}

export class CCBv2RequestError extends Error {
  constructor(message: string, public readonly status: number, public readonly body: string) {
    super(message);
    this.name = 'CCBv2RequestError';
  }
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
  query?: Record<string, string | number | boolean | undefined>;
  body?: unknown;
}

export class CCBv2Client {
  constructor(private readonly telemetryContext?: CCBApiRequestContext) {}

  /**
   * Low-level authenticated request. Reused by every endpoint method. Returns
   * parsed JSON (or null on 204). Records telemetry and honors 429/retry-after.
   */
  async request<T = any>(path: string, options: RequestOptions = {}): Promise<T> {
    // Shared daily ceiling across all serverless instances (tripwire, not a CCB
    // cap — v2 has no daily limit). Throws CCBDailyBudgetError once reached.
    await reserveCCBDailyBudget();

    const method = options.method ?? 'GET';
    const url = new URL(`${CCB_V2_API_BASE_URL}${path}`);
    if (options.query) {
      for (const [k, v] of Object.entries(options.query)) {
        if (v !== undefined) url.searchParams.set(k, String(v));
      }
    }

    const token = await getValidAccessToken();
    const startedAt = Date.now();
    // `service` groups telemetry per endpoint family (v2 rate limits are per-endpoint).
    const service = `v2:${method} ${path.replace(/\/\d+/g, '/{id}')}`;

    const res = await fetch(url.toString(), {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: CCB_V2_ACCEPT_HEADER,
        ...(options.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      },
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
    });

    const durationMs = Date.now() - startedAt;
    // recordCCBApiTelemetry reads headers via bracket access, so flatten the
    // fetch Headers object into a plain map first.
    const headers: Record<string, string> = {};
    res.headers.forEach((value, key) => { headers[key.toLowerCase()] = value; });

    const text = await res.text();

    await recordCCBApiTelemetry({
      context: this.telemetryContext,
      service,
      method,
      statusCode: res.status,
      success: res.ok,
      durationMs,
      response: { headers } as any,
      errorMessage: res.ok ? undefined : text.slice(0, 500),
    });

    if (res.status === 429) {
      const retryAfter = headers['retry-after'] ? Number(headers['retry-after']) : null;
      throw new CCBv2RateLimitError(
        `CCB v2 rate limited (429) on ${service}${retryAfter ? `; retry after ${retryAfter}s` : ''}`,
        Number.isFinite(retryAfter as number) ? (retryAfter as number) : null,
      );
    }
    if (!res.ok) {
      throw new CCBv2RequestError(`CCB v2 ${method} ${path} failed: HTTP ${res.status}`, res.status, text.slice(0, 500));
    }

    if (res.status === 204 || text.length === 0) return null as T;
    try {
      return JSON.parse(text) as T;
    } catch {
      throw new CCBv2RequestError(`CCB v2 ${method} ${path} returned non-JSON`, res.status, text.slice(0, 500));
    }
  }

  /** Convenience GET. */
  get<T = any>(path: string, query?: RequestOptions['query']): Promise<T> {
    return this.request<T>(path, { method: 'GET', query });
  }

  // ---- Endpoint methods (mirror v1 CCBClient shapes) ----
  //
  // Field mapping is defensive (snake_case/camelCase/nested variants) because
  // v2's exact JSON field names aren't pinned by static docs yet. Verified and
  // tightened against live data via /api/ccb/v2-verify during cutover.

  /** GET /individuals/{id} → same shape as v1 CCBClient.getIndividualProfile. */
  async getIndividualProfile(individualId: string): Promise<{
    id: string; firstName: string; lastName: string; fullName: string;
    email: string; phone: string; mobilePhone: string; birthday: string;
    status: string; statusId: string; isActive: boolean;
  } | null> {
    if (!individualId) return null;
    const ind = unwrap(await this.get(`/individuals/${encodeURIComponent(individualId)}`));
    if (!ind) return null;
    return mapIndividual(ind, individualId);
  }

  /** GET /groups/{id}/members → same shape as v1 CCBClient.getGroupParticipants. */
  async getGroupParticipants(groupId: string): Promise<Array<{
    id: string; firstName: string; lastName: string; fullName: string;
    email: string; phone: string; mobilePhone: string;
    status: string; statusId: string; isActive: boolean;
  }>> {
    if (!groupId) throw new Error('Group ID is required');
    const raw = await this.get(`/groups/${encodeURIComponent(groupId)}/members`);
    const members = asArray(raw);
    return members.map((m: any) => {
      const nested = m.individual ?? m;
      const id = String(m.individual_id ?? nested.id ?? m.id ?? '').trim();
      return mapIndividual(nested, id, m.status);
    });
  }
}

// ---- shared mapping helpers ----

/** Single-resource responses may be the object itself or wrapped in {data}. */
function unwrap(json: any): any {
  if (!json) return null;
  return json.data ?? json.individual ?? json;
}

/** List responses may be a bare array or wrapped in {items}/{data}/{count,...}. */
function asArray(json: any): any[] {
  if (Array.isArray(json)) return json;
  return json?.items ?? json?.data ?? json?.results ?? [];
}

function firstString(...vals: any[]): string {
  for (const v of vals) {
    if (v === undefined || v === null) continue;
    const s = String(v).trim();
    if (s) return s;
  }
  return '';
}

function resolveEmail(ind: any): string {
  if (ind?.email) return firstString(ind.email);
  const emails = ind?.emails;
  if (Array.isArray(emails) && emails.length) {
    return firstString(emails[0]?.address, emails[0]?.email, emails[0]);
  }
  return '';
}

function resolvePhone(ind: any, types: string[]): string {
  const phones = Array.isArray(ind?.phones) ? ind.phones : [];
  for (const t of types) {
    const entry = phones.find((p: any) => firstString(p?.type, p?.phone_type, p?.['@_type']).toLowerCase() === t);
    const val = firstString(entry?.number, entry?.value, entry?.phone, entry?.['#text']);
    if (val) return val;
  }
  // Fallbacks for flat shapes.
  if (types.includes('mobile')) return firstString(ind?.mobile_phone, ind?.mobilePhone, ind?.cell_phone);
  return firstString(ind?.phone, ind?.home_phone, ind?.homePhone);
}

function resolveActive(ind: any, memberStatus?: string): { status: string; statusId: string; isActive: boolean } {
  const status = firstString(memberStatus, ind?.status, ind?.membership_status);
  const isActive = status ? /active/i.test(status) : ind?.active !== false;
  return { status, statusId: firstString(ind?.status_id), isActive };
}

function mapIndividual(ind: any, fallbackId: string, memberStatus?: string) {
  const firstName = firstString(ind?.first_name, ind?.firstName, ind?.name?.first, ind?.first);
  const lastName = firstString(ind?.last_name, ind?.lastName, ind?.name?.last, ind?.last);
  const fullName = firstString(ind?.full_name, ind?.fullName, ind?.name?.full, `${firstName} ${lastName}`.trim());
  return {
    id: firstString(ind?.id, fallbackId),
    firstName,
    lastName,
    fullName,
    email: resolveEmail(ind),
    phone: resolvePhone(ind, ['home', 'contact', 'work']),
    mobilePhone: resolvePhone(ind, ['mobile', 'cell', 'contact']),
    birthday: firstString(ind?.birthday, ind?.date_of_birth, ind?.birth_date),
    ...resolveActive(ind, memberStatus),
  };
}

export function createCCBv2Client(context?: CCBApiRequestContext): CCBv2Client {
  return new CCBv2Client(context);
}
