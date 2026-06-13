const DEFAULT_LEADER_TOOLKIT_HOST = 'circlestoolkit.netlify.app';

export function getCircleSummaryBaseUrl(req?: Request): string {
  const toolkitHost = process.env.LEADER_TOOLKIT_HOST || DEFAULT_LEADER_TOOLKIT_HOST;
  const configuredUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.URL;

  // In dev, prefer the actual request origin so magic links match whatever
  // port the admin is currently running on (e.g. :3001 when :3000 is taken),
  // instead of the hardcoded NEXT_PUBLIC_APP_URL=http://localhost:3000.
  // In production, the env var wins so we never leak preview URLs.
  if (process.env.NODE_ENV !== 'production' && req) {
    return new URL(req.url).origin;
  }

  // Once the toolkit has its own dedicated subdomain, leader-facing links
  // (magic links, push deep links) should point there instead of the RADIUS domain.
  if (toolkitHost) return `https://${toolkitHost}`;

  if (configuredUrl) return configuredUrl;
  if (req) return new URL(req.url).origin;
  return 'http://localhost:3000';
}

/**
 * Base URL for admin "Open Toolkit" auto-login links.
 *
 * Unlike leader-facing links (which prefer the clean dedicated toolkit domain),
 * these must resolve to the SAME deployment that signs the token, so the
 * LEADER_SESSION_SECRET is guaranteed to match on verification. Pointing them at
 * the dedicated host risks a secret mismatch between the two Netlify sites that
 * silently bounces the admin to the sign-in screen instead of auto-signing them
 * in. The toolkit's pages render on the main RADIUS origin too, so auto-login
 * works end to end here regardless of how the dedicated host is configured.
 *
 * We derive the origin from the incoming request host so the link lands on the
 * exact origin the admin is browsing — the origin that owns the session cookie.
 */
export function getAdminToolkitBaseUrl(req?: Request): string {
  if (req) {
    const host = req.headers.get('x-forwarded-host') || req.headers.get('host');
    if (host) {
      const proto =
        req.headers.get('x-forwarded-proto') || (host.startsWith('localhost') ? 'http' : 'https');
      return `${proto}://${host}`;
    }
    return new URL(req.url).origin;
  }
  return process.env.NEXT_PUBLIC_APP_URL || process.env.URL || 'http://localhost:3000';
}
