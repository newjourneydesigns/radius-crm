/**
 * Feature flag for the Teams Toolkit (leader-facing portal + the Radius-side
 * Team Message Center / Leader Messages / Resources admin pages).
 *
 * Off by default. While off:
 *  - the leader portal (/teams-toolkit/*, /api/teams-toolkit/*, and the dedicated
 *    Teams Toolkit host) returns 404 — so NO CCB calls are made;
 *  - the Radius Teams Toolkit nav section, Import Host Team, and the team admin
 *    routes are hidden / redirected.
 *
 * Flip the whole feature on by setting NEXT_PUBLIC_TEAMS_TOOLKIT_ENABLED="true"
 * (no code change). NEXT_PUBLIC_ so the one flag is readable on the server
 * (middleware + API) and the client (nav + pages).
 */
export function isTeamsToolkitEnabled(): boolean {
  return process.env.NEXT_PUBLIC_TEAMS_TOOLKIT_ENABLED === 'true';
}
