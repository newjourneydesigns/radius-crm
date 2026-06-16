import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

const TOOLKIT_PREFIX = '/circle-leader-toolkit';
const DEFAULT_LEADER_TOOLKIT_HOST = 'circlestoolkit.netlify.app';

// Matches any path with a file extension (icons, manifest, css, etc.) so
// static assets are served as-is without rewriting.
const STATIC_FILE_RE = /\.[^/]+$/;

export function middleware(request: NextRequest) {
  const toolkitHost = process.env.LEADER_TOOLKIT_HOST || DEFAULT_LEADER_TOOLKIT_HOST;
  const hostname = request.headers.get('host') || '';

  // Give the Circle Leader Toolkit its own clean URL on a dedicated subdomain
  // (e.g. leaders.example.org) while it continues to live at /circle-leader-toolkit
  // internally. The RADIUS admin app and its routes are untouched on its own domain.
  if (toolkitHost && hostname === toolkitHost) {
    const { pathname } = request.nextUrl;

    // _next assets and static files (icons, manifest, sw.js, …) always pass through.
    if (pathname.startsWith('/_next/') || STATIC_FILE_RE.test(pathname)) {
      return NextResponse.next();
    }

    // On the toolkit host, only the toolkit's own API is reachable. Every other
    // API route in this repo is admin/internal and must not be exposed on the
    // public leader domain (and any new route added later stays hidden too).
    if (pathname.startsWith('/api/')) {
      if (pathname.startsWith('/api/circle-leader-toolkit/')) {
        return NextResponse.next();
      }
      return new NextResponse('Not found', { status: 404 });
    }

    // Visible URLs on the toolkit domain never show the /circle-leader-toolkit
    // prefix. If a request arrives with it (e.g. an old link or magic-link
    // redirect target), strip it via redirect so the address bar stays clean.
    if (pathname === TOOLKIT_PREFIX || pathname.startsWith(`${TOOLKIT_PREFIX}/`)) {
      const url = request.nextUrl.clone();
      url.pathname = pathname.slice(TOOLKIT_PREFIX.length) || '/';
      return NextResponse.redirect(url, 308);
    }

    // Internally serve the toolkit's pages for every other path.
    const url = request.nextUrl.clone();
    url.pathname = `${TOOLKIT_PREFIX}${pathname}`;
    return NextResponse.rewrite(url);
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
