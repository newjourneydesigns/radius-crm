/**
 * Sends the 6-digit OTP code to a leader's email via Resend.
 */

const VCC_GREEN = '#34B233';
const VCC_GREEN_DARK = '#2a9329';
const VCC_INK = '#3E3E3E';

const FONT_STACK =
  "'Open Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";

function emailShell(opts: {
  preheader: string;
  heroTitle: string;
  heroSubtitle?: string;
  bodyHtml: string;
  ctaUrl?: string;
  ctaLabel?: string;
  footer?: string;
}): string {
  const { preheader, heroTitle, heroSubtitle, bodyHtml, ctaUrl, ctaLabel, footer } = opts;
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
  <!-- preheader (hidden in clients, used for inbox preview) -->
  <div style="display:none;max-height:0;overflow:hidden;mso-hide:all;font-size:1px;line-height:1px;color:#f5f5f3;">${escapeHtml(preheader)}</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f5f5f3;">
    <tr>
      <td align="center" style="padding:24px 12px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 1px 2px rgba(0,0,0,0.05);">
          <!-- HERO -->
          <tr>
            <td style="background:${VCC_GREEN};padding:36px 28px;text-align:center;">
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

          <!-- BODY -->
          <tr>
            <td style="padding:28px 28px 20px 28px;color:${VCC_INK};font-size:16px;line-height:1.55;">
              ${bodyHtml}
            </td>
          </tr>

          ${
            ctaUrl && ctaLabel
              ? `<tr>
                <td align="center" style="padding:8px 28px 32px 28px;">
                  <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                    <tr>
                      <td style="border-radius:4px;background:${VCC_GREEN};">
                        <a href="${ctaUrl}" target="_blank" rel="noopener"
                          style="display:inline-block;padding:15px 30px;border:3px solid ${VCC_GREEN};border-radius:4px;background:${VCC_GREEN};color:#ffffff;text-decoration:none;font-family:${FONT_STACK};font-weight:600;font-size:16px;line-height:1;">
                          ${escapeHtml(ctaLabel)}
                        </a>
                      </td>
                    </tr>
                  </table>
                  <div style="margin-top:14px;font-size:12px;color:#7A7A7A;line-height:1.5;word-break:break-all;">
                    Or copy this link: <a href="${ctaUrl}" style="color:${VCC_GREEN_DARK};">${ctaUrl}</a>
                  </div>
                </td>
              </tr>`
              : ''
          }

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
          Valley Creek Church · Circle Summary
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
  if (!process.env.RESEND_API_KEY) {
    return { success: false, error: 'RESEND_API_KEY not configured' };
  }
  const fromEmail = process.env.EMAIL_FROM || 'onboarding@resend.dev';
  const fromName = process.env.EMAIL_FROM_NAME || 'Valley Creek Circles';
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
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

export async function sendReminderEmail(opts: {
  to: string;
  leaderName: string;
  kind: 'pre_meeting' | 'follow_up';
  meetingDateLabel: string;
  magicLinkUrl: string;
}): Promise<{ success: boolean; error?: string }> {
  const { to, leaderName, kind, meetingDateLabel, magicLinkUrl } = opts;

  const heroTitle = 'Circle Summary';
  const heroSubtitle =
    kind === 'pre_meeting'
      ? `Coming up: ${meetingDateLabel}`
      : `How did your Circle go on ${meetingDateLabel}?`;
  const subject =
    kind === 'pre_meeting'
      ? `Your Circle meets soon — submit your summary here`
      : `We'd love to hear about your Circle — ${meetingDateLabel}`;
  const preheader =
    kind === 'pre_meeting'
      ? `One tap to submit your Circle summary.`
      : `Tell us how your Circle gathering went.`;

  const greeting = `<p style="margin:0 0 12px 0;">Hi ${escapeHtml(leaderName.split(' ')[0] || 'there')},</p>`;
  const lead =
    kind === 'pre_meeting'
      ? `<p style="margin:0 0 12px 0;">Your Circle is meeting <strong>${escapeHtml(meetingDateLabel)}</strong>. After you gather, tap below to send your summary in under a minute — attendance and what stood out.</p>`
      : `<p style="margin:0 0 12px 0;">We'd love to hear about your Circle from <strong>${escapeHtml(meetingDateLabel)}</strong>. It only takes a minute — tap below to share what God did in your gathering.</p>`;
  const note = `<p style="margin:12px 0 0 0;color:#7A7A7A;font-size:14px;">Tapping the button signs you in automatically — no password needed.</p>`;

  const html = emailShell({
    preheader,
    heroTitle,
    heroSubtitle,
    bodyHtml: `${greeting}${lead}${note}`,
    ctaUrl: magicLinkUrl,
    ctaLabel: 'Submit my Circle Summary',
    footer: `To stop the reminders, please contact your Valley Creek staff contact or email <a href="mailto:nextsteps@valleycreek.org" style="color:${VCC_GREEN_DARK};">nextsteps@valleycreek.org</a>.`,
  });

  return sendBrandedEmail({ to, subject, html });
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
    preheader: `Your 6-digit Circle Summary sign-in code: ${code}`,
    heroTitle: 'Circle Summary',
    heroSubtitle: 'Your sign-in code',
    bodyHtml:
      `<p style="margin:0 0 12px 0;">Hi ${escapeHtml(leaderName.split(' ')[0] || 'there')},</p>` +
      `<p style="margin:0 0 8px 0;">Enter this code to sign in to Circle Summary:</p>` +
      codeBlock +
      `<p style="margin:18px 0 0 0;color:#7A7A7A;font-size:13px;">This code expires in 10 minutes. If you didn't request it, you can safely ignore this email.</p>`,
  });

  return sendBrandedEmail({
    to,
    subject: `Your Circle Summary code: ${code}`,
    html,
  });
}

function escapeHtml(s: string): string {
  return (s || '').replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] || c)
  );
}
