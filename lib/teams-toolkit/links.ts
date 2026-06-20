import { DEFAULT_TEAMS_TOOLKIT_HOST } from './paths';

/**
 * Base URL for leader-facing Teams Toolkit links (magic links, push deep links).
 * Prefers the dedicated toolkit subdomain in production; in dev prefers the
 * actual request origin so links match whatever port the app is running on.
 * Mirrors lib/circle-leader-toolkit/links.ts → getCircleSummaryBaseUrl.
 */
export function getTeamsToolkitBaseUrl(req?: Request): string {
  const toolkitHost = process.env.TEAMS_TOOLKIT_HOST || DEFAULT_TEAMS_TOOLKIT_HOST;
  const configuredUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.URL;

  if (process.env.NODE_ENV !== 'production' && req) {
    return new URL(req.url).origin;
  }

  if (toolkitHost) return `https://${toolkitHost}`;

  if (configuredUrl) return configuredUrl;
  if (req) return new URL(req.url).origin;
  return 'http://localhost:3000';
}
