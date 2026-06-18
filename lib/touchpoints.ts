// Shared touchpoint-cadence logic, used by the tracker route and the settings
// API. The cadence is one central, all-campus target: `target_per_period`
// logged interactions per leader within the current period.
//
// Periods are admin-defined date ranges ("terms") saved in advance — e.g.
// Spring / Summer / Fall, or any set of ranges. The current period is whichever
// saved term contains today (America/Chicago). If none is active, we fall back
// to a calendar-semester window so the tracker still works.

import { DateTime } from 'luxon';
import type { TouchpointTerm, TouchpointSettingsConfig } from './supabase';

export type { TouchpointMethod, TouchpointTerm, TouchpointSettingsConfig } from './supabase';

export const APP_TZ = 'America/Chicago';

export const DEFAULT_TOUCHPOINT_CONFIG: TouchpointSettingsConfig = {
  target_per_period: 1,
  terms: [],
};

function newId(): string {
  try {
    return globalThis.crypto?.randomUUID?.() ?? `term-${Math.random().toString(36).slice(2)}-${Date.now()}`;
  } catch {
    return `term-${Math.random().toString(36).slice(2)}-${Date.now()}`;
  }
}

function isoDate(v: unknown): string {
  const m = String(v ?? '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : '';
}

export function normalizeTerms(raw: unknown): TouchpointTerm[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((t) => {
      const obj = (t && typeof t === 'object' ? t : {}) as Record<string, unknown>;
      return {
        id: typeof obj.id === 'string' && obj.id ? obj.id : newId(),
        name: typeof obj.name === 'string' ? obj.name.trim() : '',
        start: isoDate(obj.start),
        end: isoDate(obj.end),
      };
    })
    .filter((t) => t.start && t.end && t.start <= t.end)
    .sort((a, b) => a.start.localeCompare(b.start));
}

/** Coerce a stored JSONB config (possibly partial / legacy) into a full config. */
export function normalizeTouchpointConfig(raw: unknown): TouchpointSettingsConfig {
  const cfg = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const target = Number(cfg.target_per_period);
  return {
    target_per_period: Number.isFinite(target) && target > 0 ? Math.floor(target) : DEFAULT_TOUCHPOINT_CONFIG.target_per_period,
    terms: normalizeTerms(cfg.terms),
  };
}

export interface ResolvedPeriod {
  /** Inclusive YYYY-MM-DD bounds (for date-column filters like connections). */
  startDate: string;
  endDate: string;
  /** Inclusive timestamptz bounds (for occurred_at filters). */
  startISO: string;
  endISO: string;
  label: string;
}

function fmt(date: string): string {
  return DateTime.fromISO(date, { zone: APP_TZ }).toFormat('LLL d, yyyy');
}

/** The active period: the saved term containing today, else a calendar semester. */
export function resolveCurrentPeriod(
  config: TouchpointSettingsConfig,
  now: DateTime = DateTime.now().setZone(APP_TZ),
): ResolvedPeriod {
  const today = now.setZone(APP_TZ).toISODate() || new Date().toISOString().slice(0, 10);

  const term = config.terms.find((t) => t.start <= today && today <= t.end);
  if (term) {
    return {
      startDate: term.start,
      endDate: term.end,
      startISO: DateTime.fromISO(term.start, { zone: APP_TZ }).startOf('day').toISO() || `${term.start}T00:00:00`,
      endISO: DateTime.fromISO(term.end, { zone: APP_TZ }).endOf('day').toISO() || `${term.end}T23:59:59`,
      label: term.name || `${fmt(term.start)} – ${fmt(term.end)}`,
    };
  }

  // Fallback: calendar semester (Spring Jan–Apr, Summer May–Jul, Fall Aug–Dec).
  const ref = now.setZone(APP_TZ);
  const m = ref.month;
  const startMonth = m <= 4 ? 1 : m <= 7 ? 5 : 8;
  const endMonth = startMonth === 1 ? 4 : startMonth === 5 ? 7 : 12;
  const start = ref.set({ month: startMonth }).startOf('month');
  const end = ref.set({ month: endMonth }).endOf('month');
  const name = startMonth === 1 ? 'Spring' : startMonth === 5 ? 'Summer' : 'Fall';
  return {
    startDate: start.toISODate() || '',
    endDate: end.toISODate() || '',
    startISO: start.toISO() || '',
    endISO: end.toISO() || '',
    label: `${name} ${ref.year}`,
  };
}
