// Path + host helpers for the Student Leader Toolkit. Mirrors
// lib/teams-toolkit/paths.ts so all three leader portals share the same
// dedicated-host routing shape, just on their own subdomain.
//
// Unlike the other two, student paths are keyed on the student leader's own id
// rather than a CCB group or category — a student leader doesn't own one.

export const STUDENT_TOOLKIT_PREFIX = '/student-toolkit';
export const DEFAULT_STUDENT_TOOLKIT_HOST = 'studentstoolkit.netlify.app';

export function getConfiguredStudentToolkitHosts(): string[] {
  return Array.from(new Set([
    process.env.NEXT_PUBLIC_STUDENT_TOOLKIT_HOST,
    process.env.STUDENT_TOOLKIT_HOST,
    DEFAULT_STUDENT_TOOLKIT_HOST,
  ].filter((host): host is string => !!host)));
}

export function isStudentToolkitHostName(hostname: string | null | undefined): boolean {
  return !!hostname && getConfiguredStudentToolkitHosts().includes(hostname);
}

export function stripStudentToolkitPrefix(path: string): string {
  if (path === STUDENT_TOOLKIT_PREFIX) return '/';
  if (path.startsWith(`${STUDENT_TOOLKIT_PREFIX}/`)) {
    return path.slice(STUDENT_TOOLKIT_PREFIX.length) || '/';
  }
  return path || '/';
}

export function studentToolkitPath(path: string, options?: { cleanHost?: boolean }): string {
  return options?.cleanHost ? stripStudentToolkitPrefix(path) : path;
}

export function studentToolkitLeaderPath(
  studentLeaderId: string | number,
  segment = '',
  options?: { cleanHost?: boolean }
): string {
  const normalizedSegment = segment.replace(/^\/+/, '');
  const path = `${STUDENT_TOOLKIT_PREFIX}/${encodeURIComponent(String(studentLeaderId))}${
    normalizedSegment ? `/${normalizedSegment}` : ''
  }`;
  return studentToolkitPath(path, options);
}
