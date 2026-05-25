/**
 * GET /api/circle-summary/auth/link?t=TOKEN
 *
 * Sign-in via HMAC-signed magic link. Used by reminder emails and the admin
 * "Text Circle Summary link" button. The token has a 7-day TTL embedded.
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
} from '../../../../../lib/circle-summary/session';
import { createServiceSupabaseClient } from '../../../../../lib/server-supabase';

export const dynamic = 'force-dynamic';

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
  const rawNext = url.searchParams.get('next') || '/circle-summary/events';
  // Only allow same-origin paths
  const next =
    rawNext.startsWith('/') && !rawNext.startsWith('//') ? rawNext : '/circle-summary/events';

  const supabase = createServiceSupabaseClient();
  const verified = verifySessionToken(token);

  // Token expired/invalid: fall back to the existing leader session cookie
  // if one is present. This covers the bookmark case — the magic-link token
  // is only valid 7 days, but the session cookie persists much longer, so
  // bookmarking the link URL shouldn't force a re-auth.
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
          (next === '/circle-summary/events' || next === '/circle-summary/events/') &&
          existingLeader?.ccb_group_id
        ) {
          dest = `/circle-summary/${existingLeader.ccb_group_id}/events`;
        }
        return NextResponse.redirect(new URL(dest, req.url));
      }
    }

    const signIn = new URL('/circle-summary', req.url);
    signIn.searchParams.set('reason', 'link_expired');
    return NextResponse.redirect(signIn);
  }

  const { data: leader } = await supabase
    .from('circle_leaders')
    .select('ccb_group_id, status, circle_summary_access_enabled')
    .eq('id', verified.leaderId)
    .maybeSingle();

  if (!isCircleSummaryAccessEnabled(leader)) {
    const signIn = new URL('/circle-summary', req.url);
    signIn.searchParams.set('reason', 'not_available');
    return NextResponse.redirect(signIn);
  }

  // Resolve ccb_group_id so we can skip the /events redirector and land
  // directly on the canonical /circle-summary/[groupId]/events page.
  let resolvedNext = next;
  if (next === '/circle-summary/events' || next === '/circle-summary/events/') {
    if (leader?.ccb_group_id) {
      resolvedNext = `/circle-summary/${leader.ccb_group_id}/events`;
    }
  }

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Circle Summary</title>
  <meta property="og:title" content="Circle Summary" />
  <meta name="twitter:title" content="Circle Summary" />
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
  return await attachSessionCookie(res, verified.leaderId, req);
}
