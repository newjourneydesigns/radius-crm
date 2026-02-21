import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

function getSupabaseServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Missing Supabase credentials');
  return createClient(url, key);
}

/**
 * GET /api/daily-summary/subscribe
 * Returns whether the current user is subscribed to the daily digest.
 * Requires X-User-Id header (set by middleware or client).
 */
export async function GET(request: NextRequest) {
  try {
    const userId = request.headers.get('x-user-id');
    if (!userId) {
      return NextResponse.json({ error: 'Missing user id' }, { status: 400 });
    }

    const supabase = getSupabaseServiceClient();
    const { data, error } = await supabase
      .from('users')
      .select('daily_email_subscribed')
      .eq('id', userId)
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ subscribed: data?.daily_email_subscribed ?? false });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

/**
 * POST /api/daily-summary/subscribe
 * Toggle or explicitly set the daily digest subscription for the current user.
 * Body: { subscribed: boolean }  — or omit to toggle
 * Requires X-User-Id header.
 */
export async function POST(request: NextRequest) {
  try {
    const userId = request.headers.get('x-user-id');
    if (!userId) {
      return NextResponse.json({ error: 'Missing user id' }, { status: 400 });
    }

    const supabase = getSupabaseServiceClient();
    const body = await request.json().catch(() => ({}));

    let newValue: boolean;

    if (typeof body.subscribed === 'boolean') {
      newValue = body.subscribed;
    } else {
      // Toggle current value
      const { data: current } = await supabase
        .from('users')
        .select('daily_email_subscribed')
        .eq('id', userId)
        .single();
      newValue = !(current?.daily_email_subscribed ?? false);
    }

    const { error } = await supabase
      .from('users')
      .update({ daily_email_subscribed: newValue })
      .eq('id', userId);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({
      success: true,
      subscribed: newValue,
      message: newValue ? 'Subscribed to daily digest' : 'Unsubscribed from daily digest',
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
