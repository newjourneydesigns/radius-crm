/**
 * Sends the 6-digit OTP code to a leader's email via Resend.
 */

export async function sendOtpEmail(opts: {
  to: string;
  leaderName: string;
  code: string;
}): Promise<{ success: boolean; error?: string }> {
  const { to, leaderName, code } = opts;

  if (!process.env.RESEND_API_KEY) {
    return { success: false, error: 'RESEND_API_KEY not configured' };
  }

  const fromEmail = process.env.EMAIL_FROM || 'onboarding@resend.dev';
  const fromName = process.env.EMAIL_FROM_NAME || 'Radius';

  const subject = `Your Circle Summary code: ${code}`;
  const html = `<!doctype html>
<html><body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#0f172a;color:#e2e8f0;padding:32px;">
  <div style="max-width:480px;margin:0 auto;background:#1e293b;border-radius:12px;padding:32px;">
    <p style="font-size:14px;color:#94a3b8;margin:0 0 8px;">Hi ${escapeHtml(leaderName)},</p>
    <h1 style="font-size:22px;margin:0 0 16px;color:#fff;">Your Circle Summary code</h1>
    <p style="margin:0 0 24px;color:#cbd5e1;line-height:1.5;">Use this code to sign in to submit your Circle event summary.</p>
    <div style="font-size:36px;letter-spacing:8px;font-weight:700;text-align:center;background:#0f172a;border-radius:8px;padding:20px;color:#fff;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;">
      ${code}
    </div>
    <p style="margin:24px 0 0;color:#94a3b8;font-size:13px;line-height:1.5;">This code expires in 10 minutes. If you didn't request it, you can safely ignore this email.</p>
  </div>
</body></html>`;

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: `${fromName} <${fromEmail}>`,
        to: [to],
        subject,
        html,
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

function escapeHtml(s: string): string {
  return (s || '').replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] || c)
  );
}
