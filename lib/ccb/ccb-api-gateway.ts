import type { AxiosResponse } from 'axios';
import { createServiceSupabaseClient } from '../server-supabase';

export type CCBApiDirection = 'pull' | 'push';

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
