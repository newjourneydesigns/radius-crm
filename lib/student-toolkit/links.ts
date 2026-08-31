import { DEFAULT_STUDENT_TOOLKIT_HOST } from './paths';

/**
 * Base URL for leader-facing Student Toolkit links (magic links, push deep
 * links). Prefers the dedicated subdomain in production; in dev prefers the
 * request origin so links match whatever port the app is running on.
 * Mirrors lib/teams-toolkit/links.ts.
 */
export function getStudentToolkitBaseUrl(req?: Request): string {
  const toolkitHost = process.env.STUDENT_TOOLKIT_HOST || DEFAULT_STUDENT_TOOLKIT_HOST;
  const configuredUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.URL;

  if (process.env.NODE_ENV !== 'production' && req) {
    return new URL(req.url).origin;
  }
  if (toolkitHost) return `https://${toolkitHost}`;
  if (configuredUrl) return configuredUrl;
  if (req) return new URL(req.url).origin;
  return 'http://localhost:3000';
}

/**
 * Where an admin "Open Toolkit" link should point.
 *
 * Deliberately the origin that signed the token, not the dedicated host: the
 * two sites must share LEADER_SESSION_SECRET byte-for-byte, and when they
 * don't, a cross-origin link fails by silently bouncing the admin to sign-in.
 * Same reasoning as getAdminToolkitBaseUrl in the Circle Leader Toolkit.
 */
export function getAdminStudentToolkitBaseUrl(req: Request): string {
  return new URL(req.url).origin;
}
