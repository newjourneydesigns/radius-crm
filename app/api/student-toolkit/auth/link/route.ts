/**
 * GET /api/student-toolkit/auth/link?t=TOKEN
 *
 * Sign-in via HMAC-signed magic link for student leaders. Used by the admin
 * "Open Toolkit" / texted sign-in links and by the installed PWA's start_url.
 *
 * Implementation note (carried over from the Circle Leader Toolkit): this used
 * to be a `NextResponse.redirect(...)` with the session cookie attached to the
 * same response. Some Netlify / edge setups dropped the Set-Cookie on the
 * redirect and dumped the leader back at the sign-in screen. It now responds
 * with a 200 HTML page that sets the cookie and navigates client-side, so the
 * cookie is committed before the next request fires.
 */

import { NextResponse } from 'next/server';
import { verifySessionToken } from '../../../../../lib/leader-tokens';
import {
  attachSessionCookie,
  getSessionStudentLeaderId,
  isStudentToolkitAccessEnabled,
} from '../../../../../lib/student-toolkit/session';
import { createServiceSupabaseClient } from '../../../../../lib/server-supabase';
import {
  STUDENT_TOOLKIT_PREFIX,
  isStudentToolkitHostName,
  stripStudentToolkitPrefix,
  studentToolkitLeaderPath,
  studentToolkitPath,
} from '../../../../../lib/student-toolkit/paths';

export const dynamic = 'force-dynamic';

const TOOLKIT_SHARE_TITLE = 'Student Toolkit';
const TOOLKIT_SHARE_DESCRIPTION = 'Student leader resources for Valley Creek Students.';

/**
 * The leader-agnostic destination. Every real path is keyed on the student
 * leader's own id, so this is only ever a placeholder that gets resolved once
 * the token names a leader.
 */
const GENERIC_HOME = `${STUDENT_TOOLKIT_PREFIX}/home/`;

function getRequestHostName(req: Request): string | null {
  const host = req.headers.get('x-forwarded-host') || req.headers.get('host');
  return host?.split(':')[0] ?? null;
}

function safeStudentToolkitPath(path: string | null): string {
  if (!path || !path.startsWith('/') || path.startsWith('//')) return GENERIC_HOME;
  if (path === STUDENT_TOOLKIT_PREFIX || path.startsWith(`${STUDENT_TOOLKIT_PREFIX}/`)) return path;
  return GENERIC_HOME;
}

/** Swap the placeholder destination for this leader's own home page. */
function resolveForLeader(path: string, studentLeaderId: string | number): string {
  const generic = [STUDENT_TOOLKIT_PREFIX, `${STUDENT_TOOLKIT_PREFIX}/`, GENERIC_HOME, GENERIC_HOME.slice(0, -1)];
  return generic.includes(path) ? studentToolkitLeaderPath(studentLeaderId, 'home/') : path;
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
  const next = safeStudentToolkitPath(url.searchParams.get('next'));
  const cleanToolkitHost = isStudentToolkitHostName(getRequestHostName(req));
  // Trailing slash, and prefix-free on the dedicated host, so a bounce back to
  // sign-in lands on the final URL instead of taking a 308 on the way.
  const signInPath = studentToolkitPath(`${STUDENT_TOOLKIT_PREFIX}/`, { cleanHost: cleanToolkitHost });

  const supabase = createServiceSupabaseClient();
  const verified = verifySessionToken(token);

  // Token expired/invalid: fall back to an existing session cookie if present.
  if (!verified?.leaderId) {
    const existingLeaderId = await getSessionStudentLeaderId();
    if (existingLeaderId) {
      const { data: existingLeader } = await supabase
        .from('student_leaders')
        .select('id, status, toolkit_access_enabled')
        .eq('id', existingLeaderId)
        .maybeSingle();
      if (isStudentToolkitAccessEnabled(existingLeader)) {
        const dest = resolveForLeader(next, existingLeaderId);
        return NextResponse.redirect(
          new URL(cleanToolkitHost ? stripStudentToolkitPrefix(dest) : dest, req.url)
        );
      }
    }

    const signIn = new URL(signInPath, req.url);
    signIn.searchParams.set('reason', 'link_expired');
    return NextResponse.redirect(signIn);
  }

  const { data: leader } = await supabase
    .from('student_leaders')
    .select('id, status, toolkit_access_enabled')
    .eq('id', verified.leaderId)
    .maybeSingle();

  if (!isStudentToolkitAccessEnabled(leader)) {
    const signIn = new URL(signInPath, req.url);
    signIn.searchParams.set('reason', 'not_available');
    return NextResponse.redirect(signIn);
  }

  let resolvedNext = resolveForLeader(next, verified.leaderId);
  resolvedNext = cleanToolkitHost ? stripStudentToolkitPrefix(resolvedNext) : resolvedNext;

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="theme-color" content="#34B233" />
  <title>${escapeHtml(TOOLKIT_SHARE_TITLE)}</title>
  <meta name="description" content="${escapeHtml(TOOLKIT_SHARE_DESCRIPTION)}" />
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

  // The installed home-screen PWA re-runs its start_url on every cold launch. If
  // a valid session for this same leader already exists, just navigate.
  if (!verified.sessionMaxAgeSeconds) {
    const existingLeaderId = await getSessionStudentLeaderId();
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
