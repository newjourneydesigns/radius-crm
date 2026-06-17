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
}

export function createCCBv2Client(context?: CCBApiRequestContext): CCBv2Client {
  return new CCBv2Client(context);
}
