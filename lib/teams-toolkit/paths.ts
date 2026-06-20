// Path + host helpers for the Teams Toolkit. Mirrors
// lib/circle-leader-toolkit/paths.ts so the two leader portals share the same
// dedicated-host routing shape, just on their own subdomain.

export const TEAMS_TOOLKIT_PREFIX = '/teams-toolkit';
export const DEFAULT_TEAMS_TOOLKIT_HOST = 'teamstoolkit.netlify.app';

export function getConfiguredTeamsToolkitHosts(): string[] {
  return Array.from(new Set([
    process.env.NEXT_PUBLIC_TEAMS_TOOLKIT_HOST,
    process.env.TEAMS_TOOLKIT_HOST,
    DEFAULT_TEAMS_TOOLKIT_HOST,
  ].filter((host): host is string => !!host)));
}

export function isTeamsToolkitHostName(hostname: string | null | undefined): boolean {
  return !!hostname && getConfiguredTeamsToolkitHosts().includes(hostname);
}

export function stripTeamsToolkitPrefix(path: string): string {
  if (path === TEAMS_TOOLKIT_PREFIX) return '/';
  if (path.startsWith(`${TEAMS_TOOLKIT_PREFIX}/`)) {
    return path.slice(TEAMS_TOOLKIT_PREFIX.length) || '/';
  }
  return path || '/';
}

export function teamsToolkitPath(path: string, options?: { cleanHost?: boolean }): string {
  return options?.cleanHost ? stripTeamsToolkitPrefix(path) : path;
}

export function teamsToolkitGroupPath(
  categoryId: string | number,
  segment = '',
  options?: { cleanHost?: boolean }
): string {
  const normalizedSegment = segment.replace(/^\/+/, '');
  const path = `${TEAMS_TOOLKIT_PREFIX}/${encodeURIComponent(String(categoryId))}${
    normalizedSegment ? `/${normalizedSegment}` : ''
  }`;
  return teamsToolkitPath(path, options);
}
