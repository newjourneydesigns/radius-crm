/**
 * Dynamic web app manifest for the Circles Toolkit PWA.
 *
 * This is served instead of a static /public file so two things can be
 * computed per request:
 *
 *  1. `start_url` points at the toolkit — never the site root. On the dedicated
 *     toolkit host the toolkit lives at `/`, but on the main RADIUS domain it
 *     lives under `/circle-leader-toolkit`. A bare `start_url: "/"` made the
 *     iOS home-screen icon launch the RADIUS admin app (and its Supabase login)
 *     on the main domain.
 *
 *  2. When a signed-in leader installs the app, `start_url` carries a signed
 *     session token so the installed icon can sign itself in on first launch.
 *     iOS gives a home-screen web app its own cookie jar, isolated from Safari,
 *     so the magic-link session set in Safari does NOT carry into the installed
 *     PWA. The already-authenticated toolkit page hands us the token via `?s=`
 *     (the manifest fetch can't be relied on to send cookies on iOS), and we
 *     bake it into the auth-link entry point.
 */

import { NextResponse } from 'next/server';
import { verifySessionToken } from '../../lib/leader-tokens';

export const dynamic = 'force-dynamic';

const ICONS = [
  { src: '/circle-summary-icon-192.png?v=2', sizes: '192x192', type: 'image/png', purpose: 'any' },
  { src: '/circle-summary-icon-192-maskable.png?v=2', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
  { src: '/circle-summary-icon-512.png?v=2', sizes: '512x512', type: 'image/png', purpose: 'any' },
  { src: '/circle-summary-icon-512-maskable.png?v=2', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
];

export async function GET(req: Request) {
  const url = new URL(req.url);
  const host = req.headers.get('host') || '';
  const toolkitHost = process.env.LEADER_TOOLKIT_HOST;
  const onDedicatedHost = !!toolkitHost && host === toolkitHost;

  // Where the toolkit's own sign-in router lives on this host.
  const toolkitRoot = onDedicatedHost ? '/' : '/circle-leader-toolkit/';

  // A freshly minted, leader-scoped token may be handed to us by the toolkit
  // layout when the visitor is signed in. If it verifies, route the launch
  // through the auth-link entry point so the installed app establishes its own
  // session; otherwise just open the sign-in router.
  const sessionToken = url.searchParams.get('s');
  const verified = sessionToken ? verifySessionToken(sessionToken) : null;

  let startUrl = toolkitRoot;
  if (verified?.leaderId) {
    const next = encodeURIComponent('/circle-leader-toolkit/events');
    startUrl = `/api/circle-leader-toolkit/auth/link?t=${sessionToken}&next=${next}`;
  }

  const manifest = {
    // Keep `id` stable (independent of start_url) so iOS treats every install
    // as the same app rather than spawning duplicate home-screen entries.
    id: '/circle-leader-toolkit?v=3',
    name: 'Circles Toolkit',
    short_name: 'Circles',
    description: 'Circle leader resources for Valley Creek Circles.',
    start_url: startUrl,
    display: 'standalone',
    display_override: ['standalone'],
    background_color: '#34B233',
    theme_color: '#34B233',
    orientation: 'portrait-primary',
    scope: '/',
    lang: 'en-US',
    icons: ICONS,
  };

  return NextResponse.json(manifest, {
    headers: {
      'content-type': 'application/manifest+json; charset=utf-8',
      'cache-control': 'no-store',
    },
  });
}
