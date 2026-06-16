/**
 * Feature flag for the Circle Leader coaching automations.
 *
 * Off by default: the daily nudge triggers, the Coaching Automations admin page
 * (and its nav link), and the per-leader coaching Timeline all stay hidden until
 * NEXT_PUBLIC_COACHING_AUTOMATIONS_ENABLED is explicitly set to "true". One env
 * var flips the whole feature on; no code change or redeploy of logic needed.
 *
 * NEXT_PUBLIC_ so the same flag is readable on both the server (cron + API) and
 * the client (nav + pages).
 */
export function isCoachingAutomationsEnabled(): boolean {
  return process.env.NEXT_PUBLIC_COACHING_AUTOMATIONS_ENABLED === 'true';
}
