export const TOOLKIT_PREFIX = '/circle-leader-toolkit';
export const DEFAULT_LEADER_TOOLKIT_HOST = 'circlestoolkit.netlify.app';

export function getConfiguredToolkitHosts(): string[] {
  return Array.from(new Set([
    process.env.NEXT_PUBLIC_LEADER_TOOLKIT_HOST,
    process.env.LEADER_TOOLKIT_HOST,
    DEFAULT_LEADER_TOOLKIT_HOST,
  ].filter((host): host is string => !!host)));
}

export function isToolkitHostName(hostname: string | null | undefined): boolean {
  return !!hostname && getConfiguredToolkitHosts().includes(hostname);
}

export function stripToolkitPrefix(path: string): string {
  if (path === TOOLKIT_PREFIX) return '/';
  if (path.startsWith(`${TOOLKIT_PREFIX}/`)) {
    return path.slice(TOOLKIT_PREFIX.length) || '/';
  }
  return path || '/';
}

export function toolkitPath(path: string, options?: { cleanHost?: boolean }): string {
  return options?.cleanHost ? stripToolkitPrefix(path) : path;
}

export function toolkitGroupPath(
  groupId: string | number,
  segment = '',
  options?: { cleanHost?: boolean }
): string {
  const normalizedSegment = segment.replace(/^\/+/, '');
  const path = `${TOOLKIT_PREFIX}/${encodeURIComponent(String(groupId))}${
    normalizedSegment ? `/${normalizedSegment}` : ''
  }`;
  return toolkitPath(path, options);
}
