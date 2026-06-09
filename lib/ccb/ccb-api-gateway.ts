import type { AxiosResponse } from 'axios';
import { DateTime } from 'luxon';
import { createServiceSupabaseClient } from '../server-supabase';

export type CCBApiDirection = 'pull' | 'push';

// ---- Daily budget guard ----
//
// Shared, atomic daily call ceiling enforced across every serverless instance
// (the in-process circuit breaker can't see the daily total). Default leaves
// headroom under CCB's hard 10,000/day cap so manual/critical calls still work
// even after automated jobs hit the ceiling. Set CCB_DAILY_BUDGET=0 to disable.
const DEFAULT_CCB_DAILY_BUDGET = 9500;
// CCB resets its daily counter on church-local midnight.
const CCB_RESET_TZ = 'America/Chicago';
// Once we learn the budget is spent, short-circuit further calls within this
// instance (until the next reset) without re-hitting the database.
let budgetExhaustedUntilMs = 0;

export class CCBDailyBudgetError extends Error {
  constructor(message: string, public readonly count: number, public readonly limit: number) {
    super(message);
    this.name = 'CCBDailyBudgetError';
  }
}

function ccbDailyBudgetLimit(): number {
  const raw = process.env.CCB_DAILY_BUDGET;
  if (raw === undefined || raw === '') return DEFAULT_CCB_DAILY_BUDGET;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : DEFAULT_CCB_DAILY_BUDGET;
}

/**
 * Reserve one unit of today's CCB call budget. Throws CCBDailyBudgetError when
 * the daily ceiling is reached so the caller skips the outbound CCB request.
 *
 * Fails OPEN: if the budget RPC is unavailable (e.g. migration not yet applied,
 * transient DB error) we allow the call rather than block all CCB traffic. The
 * per-instance circuit breaker still provides a floor of protection.
 */
export async function reserveCCBDailyBudget(): Promise<void> {
  const limit = ccbDailyBudgetLimit();
  if (limit <= 0) return; // disabled

  const now = Date.now();
  if (budgetExhaustedUntilMs && now < budgetExhaustedUntilMs) {
    throw new CCBDailyBudgetError(
      `CCB daily budget of ${limit} already reached; skipping until reset.`,
      limit,
      limit
    );
  }

  const nowCt = DateTime.now().setZone(CCB_RESET_TZ);
  const usageDate = nowCt.toISODate();
  if (!usageDate) return;

  try {
    const supabase = createServiceSupabaseClient();
    const { data, error } = await supabase.rpc('ccb_budget_consume', {
      p_date: usageDate,
      p_limit: limit,
    });
    if (error) {
      // Fail open — never let budget bookkeeping take down CCB entirely.
      console.warn('[ccb-budget] consume RPC failed (allowing call):', error.message);
      return;
    }
    const row = Array.isArray(data) ? data[0] : data;
    const count = Number(row?.call_count ?? 0);
    const allowed = row?.allowed !== false;
    if (!allowed) {
      budgetExhaustedUntilMs = nowCt.plus({ days: 1 }).startOf('day').toMillis();
      void createOpenAlert({
        severity: 'critical',
        title: 'CCB daily budget reached',
        message: `Reached the configured daily budget of ${limit} CCB calls (count=${count}). Outbound CCB calls are paused until ${CCB_RESET_TZ} midnight.`,
        service: 'budget_guard',
      });
      throw new CCBDailyBudgetError(
        `CCB daily budget of ${limit} reached (count=${count}).`,
        count,
        limit
      );
    }
  } catch (e) {
    if (e instanceof CCBDailyBudgetError) throw e;
    console.warn('[ccb-budget] consume failed (allowing call):', e instanceof Error ? e.message : e);
  }
}

export interface CCBApiRequestContext {
  userId?: string | null;
  module?: string;
  action?: string;
  direction?: CCBApiDirection;
}

export async function getCCBRequestContext(
  request: Request,
  defaults: Omit<CCBApiRequestContext, 'userId'>,
): Promise<CCBApiRequestContext> {
  const authHeader = request.headers.get('authorization');
  const token = authHeader?.replace(/^Bearer\s+/i, '');

  if (!token) return defaults;

  try {
    const { createAnonSupabaseClient } = await import('../server-supabase');
    const supabase = createAnonSupabaseClient();
    const { data } = await supabase.auth.getUser(token);
    return { ...defaults, userId: data.user?.id || null };
  } catch {
    return defaults;
  }
}

export interface CCBApiTelemetryInput {
  context?: CCBApiRequestContext;
  service: string;
  method: string;
  statusCode?: number;
  success: boolean;
  durationMs: number;
  response?: AxiosResponse;
  errorMessage?: string;
}

function parseNumber(value: unknown): number | null {
  if (value === undefined || value === null || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseReset(value: unknown): string | null {
  if (value === undefined || value === null || value === '') return null;

  const asNumber = Number(value);
  if (Number.isFinite(asNumber)) {
    const millis = asNumber > 10_000_000_000 ? asNumber : asNumber * 1000;
    return new Date(millis).toISOString();
  }

  const date = new Date(String(value));
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function statusFor(remaining: number | null, limit: number | null, statusCode?: number) {
  if (statusCode === 429) return 'rate_limited';
  if (remaining === null || limit === null || limit <= 0) return 'unknown';

  const ratio = remaining / limit;
  if (ratio <= 0.05) return 'at_risk';
  if (ratio <= 0.2) return 'getting_close';
  return 'healthy';
}

async function createOpenAlert(input: {
  severity: 'info' | 'warning' | 'critical';
  title: string;
  message: string;
  service?: string;
}) {
  try {
    const supabase = createServiceSupabaseClient();
    await supabase.from('ccb_api_alerts').insert({
      severity: input.severity,
      title: input.title,
      message: input.message,
      ccb_service: input.service || null,
    });
  } catch (error) {
    console.error('Failed to create CCB API alert:', error);
  }
}

export async function recordCCBApiTelemetry(input: CCBApiTelemetryInput) {
  const headers = input.response?.headers || {};
  const rateLimitLimit = parseNumber(headers['x-ratelimit-limit']);
  const rateLimitRemaining = parseNumber(headers['x-ratelimit-remaining']);
  const rateLimitReset = parseReset(headers['x-ratelimit-reset']);
  const retryAfter = parseNumber(headers['retry-after']);
  const status = statusFor(rateLimitRemaining, rateLimitLimit, input.statusCode);

  try {
    const supabase = createServiceSupabaseClient();

    await supabase.from('ccb_api_requests').insert({
      user_id: input.context?.userId || null,
      module: input.context?.module || 'Unknown',
      action: input.context?.action || 'Unknown',
      direction: input.context?.direction || 'pull',
      ccb_service: input.service,
      request_method: input.method,
      status_code: input.statusCode || null,
      success: input.success,
      duration_ms: Math.max(0, Math.round(input.durationMs)),
      rate_limit_limit: rateLimitLimit,
      rate_limit_remaining: rateLimitRemaining,
      rate_limit_reset: rateLimitReset,
      retry_after: retryAfter,
      error_message: input.errorMessage?.slice(0, 2000) || null,
    });

    if (
      rateLimitLimit !== null ||
      rateLimitRemaining !== null ||
      rateLimitReset !== null ||
      retryAfter !== null ||
      input.statusCode === 429
    ) {
      await supabase.from('ccb_api_rate_limits').upsert({
        ccb_service: input.service,
        updated_at: new Date().toISOString(),
        rate_limit_limit: rateLimitLimit,
        rate_limit_remaining: rateLimitRemaining,
        rate_limit_reset: rateLimitReset,
        retry_after: retryAfter,
        status,
        last_status_code: input.statusCode || null,
        last_error_message: input.errorMessage?.slice(0, 1000) || null,
      }, { onConflict: 'ccb_service' });
    }
  } catch (error) {
    console.error('Failed to record CCB API telemetry:', error);
  }

  if (input.statusCode === 429) {
    await createOpenAlert({
      severity: 'critical',
      title: 'CCB rate limit reached',
      message: `CCB returned 429 for ${input.service}${retryAfter ? `; retry after ${retryAfter}s` : ''}.`,
      service: input.service,
    });
  } else if (rateLimitLimit && rateLimitRemaining !== null && rateLimitRemaining / rateLimitLimit <= 0.2) {
    await createOpenAlert({
      severity: rateLimitRemaining / rateLimitLimit <= 0.05 ? 'critical' : 'warning',
      title: 'CCB rate limit is low',
      message: `${input.service} has ${rateLimitRemaining} of ${rateLimitLimit} requests remaining.`,
      service: input.service,
    });
  }
}

export async function recordCCBDailyStatus(status: {
  dailyLimit?: number | null;
  counter?: number | null;
  lastRunDate?: string | null;
}) {
  const dailyLimit = status.dailyLimit ?? null;
  const counter = status.counter ?? null;
  const percentUsed = dailyLimit && counter !== null ? Number(((counter / dailyLimit) * 100).toFixed(2)) : null;

  try {
    const supabase = createServiceSupabaseClient();
    await supabase.from('ccb_api_daily_status').insert({
      daily_limit: dailyLimit,
      counter,
      last_run_date: status.lastRunDate || null,
      percent_used: percentUsed,
    });
  } catch (error) {
    console.error('Failed to record CCB daily status:', error);
  }

  if (percentUsed !== null && percentUsed >= 80) {
    await createOpenAlert({
      severity: percentUsed >= 95 ? 'critical' : 'warning',
      title: 'CCB daily usage is high',
      message: `Daily API usage is at ${percentUsed}% (${counter} of ${dailyLimit}).`,
      service: 'api_status',
    });
  }
}
