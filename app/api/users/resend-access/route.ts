import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { verifyAdminAccessDemo } from '../../../../lib/auth-middleware';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || 'demo-key',
  { auth: { autoRefreshToken: false, persistSession: false } }
);

export async function POST(request: NextRequest) {
  try {
    const { isAdmin, error: adminAuthError } = await verifyAdminAccessDemo(request);
    if (!isAdmin) {
      return NextResponse.json({ error: adminAuthError || 'Admin access required' }, { status: 403 });
    }

    const { email } = await request.json();
    if (!email) {
      return NextResponse.json({ error: 'Email is required' }, { status: 400 });
    }

    const normalizedEmail = email.trim().toLowerCase();

    if (!process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY === 'demo-key') {
      return NextResponse.json({ message: 'Access link sent (Demo Mode)' });
    }

    // Find the user in auth
    const { data: authList } = await supabaseAdmin.auth.admin.listUsers();
    const authUser = authList?.users?.find((u: any) => u.email === normalizedEmail);

    if (!authUser) {
      return NextResponse.json({ error: 'User not found in auth. Use Invite to add them first.' }, { status: 404 });
    }

    // Confirm email if not already confirmed
    if (!authUser.email_confirmed_at) {
      await supabaseAdmin.auth.admin.updateUserById(authUser.id, { email_confirm: true });
    }

    // Generate a magic link
    const { data: linkData, error: linkError } = await supabaseAdmin.auth.admin.generateLink({
      type: 'magiclink',
      email: normalizedEmail,
      options: {
        redirectTo: `${process.env.NEXT_PUBLIC_APP_URL || 'https://myradiuscrm.com'}/boards`,
      },
    });

    if (linkError || !linkData?.properties?.action_link) {
      console.error('Error generating magic link:', linkError);
      return NextResponse.json({ error: 'Failed to generate access link' }, { status: 500 });
    }

    const magicLink = linkData.properties.action_link;

    // Send via Resend
    const fromEmail = process.env.EMAIL_FROM || 'onboarding@resend.dev';
    const fromName = process.env.EMAIL_FROM_NAME || 'RADIUS';

    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: `${fromName} <${fromEmail}>`,
        to: [normalizedEmail],
        subject: 'Your RADIUS access link',
        html: `
          <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto; padding: 32px;">
            <h2 style="margin-bottom: 8px;">Sign in to RADIUS</h2>
            <p style="color: #555; margin-bottom: 24px;">
              Click the button below to sign in. This link expires in 1 hour.
            </p>
            <a href="${magicLink}"
              style="display: inline-block; padding: 12px 24px; background: #2563eb; color: white;
                     text-decoration: none; border-radius: 8px; font-weight: 600;">
              Sign in to RADIUS
            </a>
            <p style="color: #999; font-size: 12px; margin-top: 24px;">
              If you didn't request this, you can safely ignore this email.
            </p>
          </div>
        `,
      }),
    });

    if (!response.ok) {
      const err = await response.json();
      console.error('Resend error:', err);
      return NextResponse.json({ error: 'Failed to send email' }, { status: 500 });
    }

    return NextResponse.json({ message: `Access link sent to ${normalizedEmail}` });
  } catch (error) {
    console.error('Error in resend-access API:', error);
    return NextResponse.json({ error: `Internal server error: ${error}` }, { status: 500 });
  }
}
