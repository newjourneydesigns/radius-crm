/**
 * Whether the current Netlify deploy must NOT run scheduled (cron) functions.
 *
 * The Circle Leader Toolkit is deployed as a second Netlify site from this same
 * repo, so it would otherwise register and run every scheduled function too —
 * double-sending reminder emails/push and double-running CCB syncs. Cron belongs
 * to the main RADIUS site only.
 *
 * Returns true when either:
 *  - DISABLE_SCHEDULED_FUNCTIONS === 'true' (explicit opt-out), or
 *  - this deploy's own URL is the dedicated toolkit host (auto opt-out, so cron
 *    can never run on the toolkit site even if the flag is forgotten).
 *
 * Default (flag unset, main host) is enabled, so the main site is unaffected.
 */
export function scheduledFunctionsDisabled(): boolean {
  if (process.env.DISABLE_SCHEDULED_FUNCTIONS === 'true') return true;

  const selfUrl = process.env.URL || '';
  const toolkitHost = process.env.LEADER_TOOLKIT_HOST || '';
  return Boolean(toolkitHost && selfUrl.includes(toolkitHost));
}
