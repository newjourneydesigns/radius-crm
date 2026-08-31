/**
 * Feature flag for the Student Leader Toolkit (leader-facing portal + the
 * Radius-side Student Message Center / Leader Messages / Resources / group
 * config / import pages).
 *
 * Off by default. While off:
 *  - the portal (/student-toolkit/*, /api/student-toolkit/*, and the dedicated
 *    Student Toolkit host) returns 404 — so NO CCB calls are made and the
 *    nightly sync has nothing to hit;
 *  - the Radius Student Toolkit nav section, Import Student Leaders, and the
 *    student admin routes are hidden / redirected.
 *
 * Flip the whole feature on by setting NEXT_PUBLIC_STUDENT_TOOLKIT_ENABLED="true"
 * (no code change). NEXT_PUBLIC_ so the one flag is readable on the server
 * (middleware + API) and the client (nav + pages).
 */
export function isStudentToolkitEnabled(): boolean {
  return process.env.NEXT_PUBLIC_STUDENT_TOOLKIT_ENABLED === 'true';
}
