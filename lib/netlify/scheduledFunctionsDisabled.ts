/**
 * Whether the current Netlify deploy must NOT run scheduled (cron) functions.
 *
 * The Circle Leader Toolkit and the Teams Toolkit are each deployed as their own
 * Netlify site from this same repo, so they would otherwise register and run
 * every scheduled function too — double-sending reminder emails/push and
 * double-running CCB syncs. Cron belongs to the main RADIUS site only.
 *
 * Returns true when either:
 *  - DISABLE_SCHEDULED_FUNCTIONS === 'true' (explicit opt-out), or
 *  - this deploy's own URL is a dedicated toolkit host (auto opt-out, so cron
 *    can never run on a toolkit site even if the flag is forgotten).
 *
 * Default (flag unset, main host) is enabled, so the main site is unaffected.
 */
export function scheduledFunctionsDisabled(): boolean {
  if (process.env.DISABLE_SCHEDULED_FUNCTIONS === 'true') return true;

  const selfUrl = process.env.URL || '';
  const toolkitHosts = [
    process.env.LEADER_TOOLKIT_HOST,
    process.env.TEAMS_TOOLKIT_HOST,
  ].filter((host): host is string => !!host);
  return toolkitHosts.some((host) => selfUrl.includes(host));
}
