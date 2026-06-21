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
 * The toolkit hosts fall back to their built-in defaults, so a toolkit Netlify
 * site auto-disables cron even when LEADER_TOOLKIT_HOST / TEAMS_TOOLKIT_HOST
 * aren't set on it (the middleware already serves those hosts via the same
 * defaults). The main site's URL matches neither default, so it's unaffected.
 *
 * Default (flag unset, main host) is enabled, so the main site is unaffected.
 */
// Kept as local literals (not imported from the toolkit `paths` modules) so the
// Netlify function bundle stays free of any Next.js-side imports.
const DEFAULT_LEADER_TOOLKIT_HOST = 'circlestoolkit.netlify.app';
const DEFAULT_TEAMS_TOOLKIT_HOST = 'teamstoolkit.netlify.app';

export function scheduledFunctionsDisabled(): boolean {
  if (process.env.DISABLE_SCHEDULED_FUNCTIONS === 'true') return true;

  const selfUrl = process.env.URL || '';
  const toolkitHosts = [
    process.env.LEADER_TOOLKIT_HOST || DEFAULT_LEADER_TOOLKIT_HOST,
    process.env.TEAMS_TOOLKIT_HOST || DEFAULT_TEAMS_TOOLKIT_HOST,
  ];
  return toolkitHosts.some((host) => selfUrl.includes(host));
}
