/**
 * POST /api/circle-leader-toolkit/notifications/test
 * Sends a test push notification to the current user's subscriptions.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { deliverLeaderPush } from '../../../../../lib/circle-leader-toolkit/push';

export async function POST(req: NextRequest) {
  try {
    // Authenticate via Bearer token
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

    // Get the leader record for this user (leader_id is the circle leader's ID, not the user)
    const serviceClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { persistSession: false } }
    );

    const { data: profile } = await serviceClient
      .from('circle_leaders')
      .select('id')
      .eq('email', user.email)
      .single();

    if (!profile) {
      return NextResponse.json(
        { error: 'No circle leader profile found for this email' },
        { status: 404 }
      );
    }

    const leaderId = profile.id;

    // Send test push
    const result = await deliverLeaderPush(
      {
        notification_type: 'inbox_message',
        leader_id: leaderId,
      },
      {
        title: 'Test Notification',
        body: 'This is a test notification from Circle Leader Toolkit.',
        url: '/circle-leader-toolkit',
        tag: 'test-notification',
      }
    );

    return NextResponse.json({
      ok: true,
      message: 'Test push sent',
      result,
    });
  } catch (error: any) {
    console.error('Error sending test push:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to send test push' },
      { status: 500 }
    );
  }
}
