import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { DEFAULT_LEADER_TOOLKIT_HOST, TOOLKIT_PREFIX } from './lib/circle-leader-toolkit/paths';
import { DEFAULT_TEAMS_TOOLKIT_HOST, TEAMS_TOOLKIT_PREFIX } from './lib/teams-toolkit/paths';

// Matches any path with a file extension (icons, manifest, css, etc.) so
// static assets are served as-is without rewriting.
const STATIC_FILE_RE = /\.[^/]+\/?$/;

// Serves a leader portal at its own clean subdomain while it continues to live
// under `prefix` internally. On the dedicated host, only that portal's own API
// is reachable — every other (admin/internal) API route returns 404. The two
// portals (Circle Leader Toolkit, Teams Toolkit) each own a distinct host, so
// neither host can reach the other's pages or API.
function rewriteToolkitHost(request: NextRequest, prefix: string, apiPrefix: string) {
  const { pathname } = request.nextUrl;

  // _next assets and static files (icons, manifest, sw.js, …) always pass through.
  if (pathname.startsWith('/_next/') || STATIC_FILE_RE.test(pathname)) {
    return NextResponse.next();
  }

  if (pathname.startsWith('/api/')) {
    if (pathname.startsWith(apiPrefix)) {
      return NextResponse.next();
    }
    return new NextResponse('Not found', { status: 404 });
  }

  // Visible URLs on the toolkit domain never show the internal prefix. If a
  // request arrives with it (an old link or magic-link redirect target), strip
  // it via redirect so the address bar stays clean.
  if (pathname === prefix || pathname.startsWith(`${prefix}/`)) {
    const url = request.nextUrl.clone();
    url.pathname = pathname.slice(prefix.length) || '/';
    return NextResponse.redirect(url, 308);
  }

  // Internally serve the toolkit's pages for every other path.
  const url = request.nextUrl.clone();
  url.pathname = `${prefix}${pathname}`;
  return NextResponse.rewrite(url);
}

export function middleware(request: NextRequest) {
  const toolkitHost = process.env.LEADER_TOOLKIT_HOST || DEFAULT_LEADER_TOOLKIT_HOST;
  const teamsToolkitHost = process.env.TEAMS_TOOLKIT_HOST || DEFAULT_TEAMS_TOOLKIT_HOST;
  const hostname = request.headers.get('host') || '';

  // Circle Leader Toolkit on its dedicated subdomain.
  if (toolkitHost && hostname === toolkitHost) {
    return rewriteToolkitHost(request, TOOLKIT_PREFIX, '/api/circle-leader-toolkit/');
  }

  // Teams Toolkit on its dedicated subdomain.
  if (teamsToolkitHost && hostname === teamsToolkitHost) {
    return rewriteToolkitHost(request, TEAMS_TOOLKIT_PREFIX, '/api/teams-toolkit/');
  }

  // Auth in this app is currently client-side (Supabase session stored in localStorage).
  // That means Edge middleware cannot reliably read the session to protect pages.
  // We intentionally do NOT redirect here, to avoid redirect loops back to /login.
  // For API routes, we're also allowing them through here.
  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
