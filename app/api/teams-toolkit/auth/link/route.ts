/**
 * GET /api/teams-toolkit/auth/link?t=TOKEN
 *
 * Sign-in via HMAC-signed magic link for team leaders. Responds with a 200 HTML
 * page that sets the session cookie via Set-Cookie and then navigates
 * client-side (some edge setups drop Set-Cookie on a redirect). Mirrors the
 * Circle Leader Toolkit link route.
 */

import { NextResponse } from 'next/server';
import { verifySessionToken } from '../../../../../lib/leader-tokens';
import {
  attachSessionCookie,
  getSessionLeaderId,
  isTeamsToolkitAccessEnabled,
} from '../../../../../lib/teams-toolkit/session';
import { createServiceSupabaseClient } from '../../../../../lib/server-supabase';
import {
  isTeamsToolkitHostName,
  stripTeamsToolkitPrefix,
} from '../../../../../lib/teams-toolkit/paths';

export const dynamic = 'force-dynamic';

const TOOLKIT_SHARE_TITLE = 'Teams Toolkit';
const TOOLKIT_SHARE_DESCRIPTION = 'Team leader resources for Valley Creek Teams.';

function getRequestHostName(req: Request): string | null {
  const host = req.headers.get('x-forwarded-host') || req.headers.get('host');
  return host?.split(':')[0] ?? null;
}

function safeToolkitPath(path: string | null): string {
  if (!path || !path.startsWith('/') || path.startsWith('//')) return '/teams-toolkit/roster';
  if (path === '/teams-toolkit' || path.startsWith('/teams-toolkit/')) return path;
  return '/teams-toolkit/roster';
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
  const next = safeToolkitPath(url.searchParams.get('next'));
  const cleanToolkitHost = isTeamsToolkitHostName(getRequestHostName(req));

  const supabase = createServiceSupabaseClient();
  const verified = verifySessionToken(token);

  // Token expired/invalid: fall back to an existing session cookie if present.
  if (!verified?.leaderId) {
    const existingLeaderId = await getSessionLeaderId();
    if (existingLeaderId) {
      const { data: existingLeader } = await supabase
        .from('circle_leaders')
        .select('ccb_category_id, status, leader_type, circle_summary_access_enabled')
        .eq('id', existingLeaderId)
        .maybeSingle();
      if (isTeamsToolkitAccessEnabled(existingLeader)) {
        let dest = next;
        if (
          (next === '/teams-toolkit/roster' || next === '/teams-toolkit/roster/') &&
          existingLeader?.ccb_category_id
        ) {
          dest = `/teams-toolkit/${existingLeader.ccb_category_id}/roster`;
        }
        return NextResponse.redirect(new URL(dest, req.url));
      }
    }

    const signIn = new URL('/teams-toolkit', req.url);
    signIn.searchParams.set('reason', 'link_expired');
    return NextResponse.redirect(signIn);
  }

  const { data: leader } = await supabase
    .from('circle_leaders')
    .select('ccb_category_id, status, leader_type, circle_summary_access_enabled')
    .eq('id', verified.leaderId)
    .maybeSingle();

  if (!isTeamsToolkitAccessEnabled(leader)) {
    const signIn = new URL('/teams-toolkit', req.url);
    signIn.searchParams.set('reason', 'not_available');
    return NextResponse.redirect(signIn);
  }

  let resolvedNext = next;
  if (next === '/teams-toolkit/roster' || next === '/teams-toolkit/roster/') {
    if (leader?.ccb_category_id) {
      resolvedNext = `/teams-toolkit/${leader.ccb_category_id}/roster`;
    }
  }
  resolvedNext = cleanToolkitHost ? stripTeamsToolkitPrefix(resolvedNext) : resolvedNext;

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="theme-color" content="#3955A8" />
  <title>${escapeHtml(TOOLKIT_SHARE_TITLE)}</title>
  <meta name="description" content="${escapeHtml(TOOLKIT_SHARE_DESCRIPTION)}" />
  <meta http-equiv="refresh" content="0;url=${escapeHtml(resolvedNext)}" />
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; background: #fff; color: #3E3E3E; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; }
    .box { text-align: center; padding: 2rem; }
    .spinner { width: 32px; height: 32px; border: 3px solid #e5e7eb; border-top-color: #3955A8; border-radius: 50%; animation: spin 0.8s linear infinite; margin: 0 auto 1rem; }
    @keyframes spin { to { transform: rotate(360deg); } }
  </style>
</head>
<body>
  <div class="box">
    <div class="spinner"></div>
    <p>Signing you in…</p>
    <p style="margin-top:1rem;font-size:0.9rem;"><a href="${escapeHtml(resolvedNext)}" style="color:#3955A8;">Continue</a></p>
  </div>
  <script>window.location.replace(${JSON.stringify(resolvedNext)});</script>
</body>
</html>`;

  const res = new NextResponse(html, {
    status: 200,
    headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' },
  });

  // The installed home-screen PWA re-runs its start_url on every cold launch. If
  // a valid session for this same leader already exists, just navigate.
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
