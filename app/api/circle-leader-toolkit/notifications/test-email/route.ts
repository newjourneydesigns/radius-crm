/**
 * POST /api/circle-leader-toolkit/notifications/test-email
 * Sends a test email to the current user's email address.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { sendReminderEmail } from '../../../../../lib/circle-leader-toolkit/email';
import { createSessionToken, RADIUS_LINK_TTL_MS } from '../../../../../lib/leader-tokens';
import { getCircleSummaryBaseUrl } from '../../../../../lib/circle-leader-toolkit/links';

export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get('authorization');
    const token = authHeader?.replace('Bearer ', '');
    if (!token) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const anonClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { auth: { persistSession: false } }
    );
    const { data: { user }, error: authError } = await anonClient.auth.getUser(token);
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!user.email) {
      return NextResponse.json({ error: 'No email address found' }, { status: 400 });
    }

    const serviceClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { persistSession: false } }
    );

    const { data: leader } = await serviceClient
      .from('circle_leaders')
      .select('id, name')
      .eq('email', user.email)
      .single();

    if (!leader) {
      return NextResponse.json(
        { error: 'No circle leader profile found for this email' },
        { status: 404 }
      );
    }

    // Create a magic link
    const magicToken = createSessionToken(leader.id, RADIUS_LINK_TTL_MS);
    const magicUrl = new URL('/api/circle-leader-toolkit/auth/link', getCircleSummaryBaseUrl(req));
    magicUrl.searchParams.set('t', magicToken);
    magicUrl.searchParams.set('next', '/circle-leader-toolkit/events');

    const result = await sendReminderEmail({
      to: user.email,
      leaderName: leader.name || 'Leader',
      kind: 'follow_up',
      meetingDateLabel: 'your next Circle meeting',
      magicLinkUrl: magicUrl.toString(),
    });

    if (!result.success) {
      return NextResponse.json(
        { error: result.error || 'Failed to send email' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      message: 'Test email sent',
      sentTo: user.email,
    });
  } catch (error: any) {
    console.error('Error sending test email:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to send test email' },
      { status: 500 }
    );
  }
}
