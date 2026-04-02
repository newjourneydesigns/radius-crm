import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

function getSupabaseServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Missing Supabase credentials');
  return createClient(url, key);
}

function extractSubFromToken(token: string): string | null {
  try {
    return JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString()).sub ?? null;
  } catch { return null; }
}

async function resolveUser(authHeader: string | null) {
  if (!authHeader) return null;
  const bearerToken = authHeader.replace('Bearer ', '');

  const supabaseUrl     = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  const anonClient      = createClient(supabaseUrl, supabaseAnonKey);
  const service         = getSupabaseServiceClient();

  const optimisticId = extractSubFromToken(bearerToken);
  const [authResult, profileResult] = await Promise.all([
    anonClient.auth.getUser(bearerToken),
    optimisticId
      ? service.from('users').select('id, name, email').eq('id', optimisticId).single()
      : Promise.resolve({ data: null }),
  ]);

  if (!authResult.data.user) return null;
  if (!profileResult.data || profileResult.data.id !== authResult.data.user.id) return null;
  return profileResult.data as { id: string; name: string; email: string };
}

// GET — return current feed config (token + included_board_ids)
export async function GET(request: NextRequest) {
  try {
    const user = await resolveUser(request.headers.get('authorization'));
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const service = getSupabaseServiceClient();
    const { data, error } = await service
      .from('user_calendar_feeds')
      .select('token, included_board_ids')
      .eq('user_id', user.id)
      .single();

    if (error && error.code !== 'PGRST116') {
      // PGRST116 = row not found; anything else is a real error
      return NextResponse.json({ error: 'Database error' }, { status: 500 });
    }

    return NextResponse.json({ feed: data ?? null });
  } catch (err) {
    console.error('Calendar feed GET error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// POST — upsert feed with new included_board_ids
export async function POST(request: NextRequest) {
  try {
    const user = await resolveUser(request.headers.get('authorization'));
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await request.json();
    const included_board_ids: string[] = Array.isArray(body.included_board_ids)
      ? body.included_board_ids
      : [];

    const service = getSupabaseServiceClient();

    // Check if row already exists so we can preserve the existing token
    const { data: existing } = await service
      .from('user_calendar_feeds')
      .select('token')
      .eq('user_id', user.id)
      .single();

    const { data, error } = await service
      .from('user_calendar_feeds')
      .upsert(
        { user_id: user.id, included_board_ids, ...(existing ? {} : {}) },
        { onConflict: 'user_id' }
      )
      .select('token, included_board_ids')
      .single();

    if (error) {
      console.error('Calendar feed POST error:', error);
      return NextResponse.json({ error: 'Database error' }, { status: 500 });
    }

    return NextResponse.json({ feed: data });
  } catch (err) {
    console.error('Calendar feed POST error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// DELETE — regenerate token (invalidates old feed URL)
export async function DELETE(request: NextRequest) {
  try {
    const user = await resolveUser(request.headers.get('authorization'));
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const service = getSupabaseServiceClient();

    // Generate a new token by updating the existing row
    const { data, error } = await service
      .from('user_calendar_feeds')
      .update({ token: crypto.randomUUID() })
      .eq('user_id', user.id)
      .select('token, included_board_ids')
      .single();

    if (error) {
      console.error('Calendar feed DELETE error:', error);
      return NextResponse.json({ error: 'Database error' }, { status: 500 });
    }

    return NextResponse.json({ feed: data });
  } catch (err) {
    console.error('Calendar feed DELETE error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
