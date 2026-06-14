/**
 * Coaching automation configuration.
 *
 * Org-wide defaults live in the coaching_automation_settings singleton row; a
 * leader can carry a sparse override JSON in circle_leaders.coaching_automation_overrides.
 * The effective config a leader runs under is `resolveLeaderConfig(defaults, override)`.
 */

export type AutomationKind =
  | 'multiplication'
  | 'new_member'
  | 'inactivity'
  | 'birthday'
  | 'did_not_meet'
  | 'first_time';

export interface CoachingConfig {
  /** Master switch — when false, no automations run for the leader. */
  enabled: boolean;
  multiplication: { enabled: boolean; rosterThreshold: number };
  newMember: { enabled: boolean; followUpHours: number };
  inactivity: { enabled: boolean; weeks: number };
  birthday: { enabled: boolean };
  didNotMeet: { enabled: boolean; weeks: number };
  firstTimeAttendee: { enabled: boolean };
}

/** Sensible org-wide defaults, used when no settings row/override is present. */
export const COACHING_DEFAULTS: CoachingConfig = {
  enabled: true,
  multiplication: { enabled: true, rosterThreshold: 12 },
  newMember: { enabled: true, followUpHours: 24 },
  inactivity: { enabled: true, weeks: 4 },
  birthday: { enabled: true },
  didNotMeet: { enabled: true, weeks: 2 },
  firstTimeAttendee: { enabled: true },
};

type DeepPartial<T> = { [K in keyof T]?: T[K] extends object ? DeepPartial<T[K]> : T[K] };

/** A sparse override: any subset of CoachingConfig. */
export type CoachingConfigOverride = DeepPartial<CoachingConfig>;

function clampInt(value: unknown, fallback: number, min: number, max: number): number {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.round(n)));
}

function asBool(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

/**
 * Merge a (possibly null / partial / untrusted) override over a base config and
 * normalize every field so the engine always sees a complete, sane CoachingConfig.
 * Numeric thresholds are clamped to defensive ranges.
 */
export function resolveLeaderConfig(
  base: CoachingConfig,
  override: CoachingConfigOverride | null | undefined
): CoachingConfig {
  const o = override ?? {};
  return {
    enabled: asBool(o.enabled, base.enabled),
    multiplication: {
      enabled: asBool(o.multiplication?.enabled, base.multiplication.enabled),
      rosterThreshold: clampInt(o.multiplication?.rosterThreshold, base.multiplication.rosterThreshold, 2, 100),
    },
    newMember: {
      enabled: asBool(o.newMember?.enabled, base.newMember.enabled),
      followUpHours: clampInt(o.newMember?.followUpHours, base.newMember.followUpHours, 1, 168),
    },
    inactivity: {
      enabled: asBool(o.inactivity?.enabled, base.inactivity.enabled),
      weeks: clampInt(o.inactivity?.weeks, base.inactivity.weeks, 1, 52),
    },
    birthday: {
      enabled: asBool(o.birthday?.enabled, base.birthday.enabled),
    },
    didNotMeet: {
      enabled: asBool(o.didNotMeet?.enabled, base.didNotMeet.enabled),
      weeks: clampInt(o.didNotMeet?.weeks, base.didNotMeet.weeks, 1, 52),
    },
    firstTimeAttendee: {
      enabled: asBool(o.firstTimeAttendee?.enabled, base.firstTimeAttendee.enabled),
    },
  };
}

/**
 * Resolve the org-wide defaults: COACHING_DEFAULTS with the stored settings row
 * merged in. Accepts unknown JSON (from the settings table or a request body)
 * and normalizes it through resolveLeaderConfig.
 */
export function resolveGlobalDefaults(storedConfig: unknown): CoachingConfig {
  return resolveLeaderConfig(COACHING_DEFAULTS, (storedConfig ?? null) as CoachingConfigOverride | null);
}
