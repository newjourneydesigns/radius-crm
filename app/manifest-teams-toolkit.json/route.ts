/**
 * Dynamic web app manifest for the Teams Toolkit PWA. Mirrors
 * manifest-circle-leader-toolkit.json/route.ts:
 *
 *  1. `start_url` points at the toolkit — on the dedicated teams host it lives
 *     at `/`, on the main RADIUS domain under `/teams-toolkit`.
 *  2. When a signed-in leader installs the app, `start_url` carries a signed
 *     session token (handed to us via `?s=`) so the installed icon signs itself
 *     in on first launch (iOS isolates a PWA's cookies from Safari).
 *
 * NOTE: icons currently reuse the generic RADIUS app icons. Teams-branded PWA
 * icons are a follow-up asset task.
 */

import { NextResponse } from 'next/server';
import { verifySessionToken } from '../../lib/leader-tokens';

export const dynamic = 'force-dynamic';

const ICONS = [
  { src: '/icon-192x192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
  { src: '/icon-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
];

export async function GET(req: Request) {
  const url = new URL(req.url);
  const host = req.headers.get('host') || '';
  const toolkitHost = process.env.TEAMS_TOOLKIT_HOST;
  const onDedicatedHost = !!toolkitHost && host === toolkitHost;

  const toolkitRoot = onDedicatedHost ? '/' : '/teams-toolkit/';

  const sessionToken = url.searchParams.get('s');
  const verified = sessionToken ? verifySessionToken(sessionToken) : null;

  let startUrl = toolkitRoot;
  if (verified?.leaderId) {
    const next = encodeURIComponent('/teams-toolkit/roster');
    startUrl = `/api/teams-toolkit/auth/link?t=${sessionToken}&next=${next}`;
  }

  const manifest = {
    id: '/teams-toolkit?v=1',
    name: 'Teams Toolkit',
    short_name: 'Teams',
    description: 'Team leader resources for Valley Creek Teams.',
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
