/**
 * Sends the 6-digit OTP code to a team leader's email via Resend.
 * Mirrors lib/circle-leader-toolkit/email.ts with Teams Toolkit branding.
 */

const TEAMS_BLUE = '#3955A8';
const TEAMS_BLUE_DARK = '#2F4790';
const VCC_INK = '#3E3E3E';

const FONT_STACK =
  "'Open Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";

function emailShell(opts: {
  preheader: string;
  heroTitle: string;
  heroSubtitle?: string;
  bodyHtml: string;
  footer?: string;
}): string {
  const { preheader, heroTitle, heroSubtitle, bodyHtml, footer } = opts;
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="color-scheme" content="light only" />
<meta name="supported-color-schemes" content="light only" />
<title>${escapeHtml(heroTitle)}</title>
</head>
<body style="margin:0;padding:0;background:#f5f5f3;font-family:${FONT_STACK};color:${VCC_INK};">
  <div style="display:none;max-height:0;overflow:hidden;mso-hide:all;font-size:1px;line-height:1px;color:#f5f5f3;">${escapeHtml(preheader)}</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f5f5f3;">
    <tr>
      <td align="center" style="padding:24px 12px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 1px 2px rgba(0,0,0,0.05);">
          <tr>
            <td style="background:${TEAMS_BLUE};padding:36px 28px;text-align:center;">
              <div style="font-family:${FONT_STACK};font-weight:800;font-style:italic;text-transform:uppercase;color:#ffffff;font-size:34px;line-height:1.05;letter-spacing:0.5px;">
                ${escapeHtml(heroTitle)}
              </div>
              ${
                heroSubtitle
                  ? `<div style="margin-top:10px;color:rgba(255,255,255,0.92);font-size:15px;font-weight:500;line-height:1.4;">${escapeHtml(heroSubtitle)}</div>`
                  : ''
              }
            </td>
          </tr>
          <tr>
            <td style="padding:28px 28px 20px 28px;color:${VCC_INK};font-size:16px;line-height:1.55;">
              ${bodyHtml}
            </td>
          </tr>
          ${
            footer
              ? `<tr>
                <td style="padding:18px 28px 28px 28px;border-top:1px solid #eeeeee;color:#7A7A7A;font-size:12px;line-height:1.5;text-align:center;">
                  ${footer}
                </td>
              </tr>`
              : ''
          }
        </table>
        <div style="margin-top:14px;color:#9ca3af;font-size:11px;font-family:${FONT_STACK};">
          Valley Creek Church · Teams Toolkit
        </div>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

async function sendBrandedEmail(opts: {
  to: string;
  subject: string;
  html: string;
}): Promise<{ success: boolean; error?: string }> {
  // Leader-facing toolkit emails use a dedicated Resend account. Falls back to
  // the Circle Leader Toolkit key, then RADIUS's internal key.
  const resendApiKey =
    process.env.TEAMS_TOOLKIT_RESEND_API_KEY ||
    process.env.LEADER_TOOLKIT_RESEND_API_KEY ||
    process.env.RESEND_API_KEY;
  if (!resendApiKey) {
    return { success: false, error: 'RESEND_API_KEY not configured' };
  }
  const fromEmail =
    process.env.TEAMS_TOOLKIT_EMAIL_FROM ||
    process.env.LEADER_TOOLKIT_EMAIL_FROM ||
    process.env.EMAIL_FROM ||
    'onboarding@resend.dev';
  const fromName =
    process.env.TEAMS_TOOLKIT_EMAIL_FROM_NAME ||
    process.env.LEADER_TOOLKIT_EMAIL_FROM_NAME ||
    process.env.EMAIL_FROM_NAME ||
    'Valley Creek Teams';
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${resendApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: `${fromName} <${fromEmail}>`,
        to: [opts.to],
        subject: opts.subject,
        html: opts.html,
      }),
    });
    const result = await res.json();
    if (!res.ok) {
      return { success: false, error: result?.message || result?.name || 'Resend error' };
    }
    return { success: true };
  } catch (e: any) {
    return { success: false, error: e?.message || 'Send failed' };
  }
}

export async function sendOtpEmail(opts: {
  to: string;
  leaderName: string;
  code: string;
}): Promise<{ success: boolean; error?: string }> {
  const { to, leaderName, code } = opts;

  const codeBlock = `
    <div style="margin-top:18px;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:36px;letter-spacing:0.4em;font-weight:700;text-align:center;background:#f5f5f3;border:1px solid #e5e7eb;border-radius:8px;padding:20px;color:${VCC_INK};">
      ${escapeHtml(code)}
    </div>`;

  const html = emailShell({
    preheader: `Your 6-digit Teams Toolkit sign-in code: ${code}`,
    heroTitle: 'Teams Toolkit',
    heroSubtitle: 'Your sign-in code',
    bodyHtml:
      `<p style="margin:0 0 12px 0;">Hi ${escapeHtml(leaderName.split(' ')[0] || 'there')},</p>` +
      `<p style="margin:0 0 8px 0;">Enter this code to sign in to the Teams Toolkit:</p>` +
      codeBlock +
      `<p style="margin:18px 0 0 0;color:#7A7A7A;font-size:13px;">This code expires in 10 minutes. If you didn't request it, you can safely ignore this email.</p>`,
  });

  return sendBrandedEmail({
    to,
    subject: `Your Teams Toolkit code: ${code}`,
    html,
  });
}

function escapeHtml(s: string): string {
  return (s || '').replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] || c)
  );
}
