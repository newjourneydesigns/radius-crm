/**
 * GET /api/circle-leader-toolkit/auth/link?t=TOKEN
 *
 * Sign-in via HMAC-signed magic link. Used by reminder emails, admin
 * "Text Circle Summary link" links, and leader-generated temporary share links.
 * Radius-issued links are long-lived; temporary share links carry a 7-day TTL
 * plus a matching temporary session max-age.
 *
 * Implementation note: we used to do `NextResponse.redirect(...)` while
 * attaching the session cookie in the same response. Some Netlify / edge
 * setups dropped the Set-Cookie on the redirect, dumping the leader back at
 * the sign-in screen. We now respond with a 200 HTML page that sets the
 * cookie via Set-Cookie and then does the navigation client-side. Cookie is
 * reliably committed before the next request fires.
 */

import { NextResponse } from 'next/server';
import { verifySessionToken } from '../../../../../lib/leader-tokens';
import {
  attachSessionCookie,
  getSessionLeaderId,
  isCircleSummaryAccessEnabled,
} from '../../../../../lib/circle-leader-toolkit/session';
import { createServiceSupabaseClient } from '../../../../../lib/server-supabase';

export const dynamic = 'force-dynamic';

const TOOLKIT_SHARE_TITLE = 'Circles Toolkit';
const TOOLKIT_SHARE_DESCRIPTION = 'Circle leader resources for Valley Creek Circles.';

function getRequestOrigin(req: Request): string {
  const forwardedHost = req.headers.get('x-forwarded-host');
  const host = forwardedHost || req.headers.get('host');
  if (host) {
    const forwardedProto = req.headers.get('x-forwarded-proto');
    const proto =
      forwardedProto ||
      (host.startsWith('localhost') || host.startsWith('127.0.0.1') ? 'http' : 'https');
    return `${proto}://${host}`;
  }
  return new URL(req.url).origin;
}

function safeCircleSummaryPath(path: string | null): string {
  if (!path || !path.startsWith('/') || path.startsWith('//')) return '/circle-leader-toolkit/events';
  if (path === '/circle-leader-toolkit' || path.startsWith('/circle-leader-toolkit/')) return path;
  return '/circle-leader-toolkit/events';
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const token = url.searchParams.get('t') || '';
  const next = safeCircleSummaryPath(url.searchParams.get('next'));

  const supabase = createServiceSupabaseClient();
  const verified = verifySessionToken(token);

  // Token expired/invalid: fall back to the existing leader session cookie
  // if one is present. This covers bookmark cases where a leader already has
  // a valid Circle Summary session on this browser.
  if (!verified?.leaderId) {
    const existingLeaderId = await getSessionLeaderId();
    if (existingLeaderId) {
      const { data: existingLeader } = await supabase
        .from('circle_leaders')
        .select('ccb_group_id, status, circle_summary_access_enabled')
        .eq('id', existingLeaderId)
        .maybeSingle();
      if (isCircleSummaryAccessEnabled(existingLeader)) {
        let dest = next;
        if (
          (next === '/circle-leader-toolkit/events' || next === '/circle-leader-toolkit/events/') &&
          existingLeader?.ccb_group_id
        ) {
          dest = `/circle-leader-toolkit/${existingLeader.ccb_group_id}/events`;
        }
        return NextResponse.redirect(new URL(dest, req.url));
      }
    }

    const signIn = new URL('/circle-leader-toolkit', req.url);
    signIn.searchParams.set('reason', 'link_expired');
    return NextResponse.redirect(signIn);
  }

  const { data: leader } = await supabase
    .from('circle_leaders')
    .select('ccb_group_id, status, circle_summary_access_enabled')
    .eq('id', verified.leaderId)
    .maybeSingle();

  if (!isCircleSummaryAccessEnabled(leader)) {
    const signIn = new URL('/circle-leader-toolkit', req.url);
    signIn.searchParams.set('reason', 'not_available');
    return NextResponse.redirect(signIn);
  }

  // Resolve ccb_group_id so we can skip the /events redirector and land
  // directly on the canonical /circle-leader-toolkit/[groupId]/events page.
  let resolvedNext = next;
  if (next === '/circle-leader-toolkit/events' || next === '/circle-leader-toolkit/events/') {
    if (leader?.ccb_group_id) {
      resolvedNext = `/circle-leader-toolkit/${leader.ccb_group_id}/events`;
    }
  }

  const previewOrigin = getRequestOrigin(req);
  const previewUrl = `${previewOrigin}/`;
  const previewImage = `${previewOrigin}/circles-toolkit-og.png?v=1`;
  const previewIcon = `${previewOrigin}/circle-summary-icon-192.png?v=2`;

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="theme-color" content="#34B233" />
  <title>${escapeHtml(TOOLKIT_SHARE_TITLE)}</title>
  <meta name="description" content="${escapeHtml(TOOLKIT_SHARE_DESCRIPTION)}" />
  <meta property="og:type" content="website" />
  <meta property="og:url" content="${escapeHtml(previewUrl)}" />
  <meta property="og:site_name" content="${escapeHtml(TOOLKIT_SHARE_TITLE)}" />
  <meta property="og:title" content="${escapeHtml(TOOLKIT_SHARE_TITLE)}" />
  <meta property="og:description" content="${escapeHtml(TOOLKIT_SHARE_DESCRIPTION)}" />
  <meta property="og:image" content="${escapeHtml(previewImage)}" />
  <meta property="og:image:secure_url" content="${escapeHtml(previewImage)}" />
  <meta property="og:image:type" content="image/png" />
  <meta property="og:image:width" content="1200" />
  <meta property="og:image:height" content="630" />
  <meta property="og:image:alt" content="${escapeHtml(TOOLKIT_SHARE_TITLE)}" />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="${escapeHtml(TOOLKIT_SHARE_TITLE)}" />
  <meta name="twitter:description" content="${escapeHtml(TOOLKIT_SHARE_DESCRIPTION)}" />
  <meta name="twitter:image" content="${escapeHtml(previewImage)}" />
  <link rel="icon" type="image/png" href="${escapeHtml(previewIcon)}" />
  <link rel="apple-touch-icon" href="${escapeHtml(previewIcon)}" />
  <meta http-equiv="refresh" content="0;url=${escapeHtml(resolvedNext)}" />
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; background: #fff; color: #3E3E3E; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; }
    .box { text-align: center; padding: 2rem; }
    .spinner { width: 32px; height: 32px; border: 3px solid #e5e7eb; border-top-color: #34B233; border-radius: 50%; animation: spin 0.8s linear infinite; margin: 0 auto 1rem; }
    @keyframes spin { to { transform: rotate(360deg); } }
  </style>
</head>
<body>
  <div class="box">
    <div class="spinner"></div>
    <p>Signing you in…</p>
    <p style="margin-top:1rem;font-size:0.9rem;"><a href="${escapeHtml(resolvedNext)}" style="color:#34B233;">Continue</a></p>
  </div>
  <script>window.location.replace(${JSON.stringify(resolvedNext)});</script>
</body>
</html>`;

  const res = new NextResponse(html, {
    status: 200,
    headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' },
  });

  // The installed home-screen PWA re-runs its start_url (this route) on every
  // cold launch. If a valid session for this same leader already exists, just
  // navigate — re-issuing would spawn a fresh leader_sessions row each launch.
  // Only short-circuit long-lived links; temporary share links keep their own
  // max-age handling below.
  if (!verified.sessionMaxAgeSeconds) {
    const existingLeaderId = await getSessionLeaderId();
    if (existingLeaderId && String(existingLeaderId) === String(verified.leaderId)) {
      return res;
    }
  }

  const remainingTokenSeconds = Math.max(1, Math.floor((verified.expiresMs - Date.now()) / 1000));
  const maxAgeSeconds = verified.sessionMaxAgeSeconds
    ? Math.min(verified.sessionMaxAgeSeconds, remainingTokenSeconds)
    : undefined;
  return await attachSessionCookie(res, verified.leaderId, req, { maxAgeSeconds });
}
