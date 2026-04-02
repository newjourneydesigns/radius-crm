import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || 'demo-key',
  { auth: { autoRefreshToken: false, persistSession: false } }
);

async function getAuthUser(request: NextRequest) {
  const token = request.headers.get('authorization')?.replace('Bearer ', '');
  if (!token) return null;
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false } }
  );
  const { data: { user }, error } = await supabase.auth.getUser(token);
  if (error || !user) return null;
  return user;
}

/**
 * GET /api/reminder-templates
 * Returns the authenticated user's saved reminder templates (null = use default).
 */
export async function GET(request: NextRequest) {
  const user = await getAuthUser(request);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data, error } = await supabaseAdmin
    .from('users')
    .select('reminder_template_1, reminder_template_2, reminder_template_3')
    .eq('id', user.id)
    .maybeSingle();

  if (error) return NextResponse.json({ error: 'Failed to fetch templates' }, { status: 500 });

  return NextResponse.json({
    templates: {
      1: data?.reminder_template_1 ?? null,
      2: data?.reminder_template_2 ?? null,
      3: data?.reminder_template_3 ?? null,
    }
  });
}

/**
 * PUT /api/reminder-templates
 * Body: { messageNumber: 1|2|3, text: string }
 * Saves one reminder template for the authenticated user.
 */
export async function PUT(request: NextRequest) {
  const user = await getAuthUser(request);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json();
  const { messageNumber, text } = body;

  if (![1, 2, 3].includes(messageNumber)) {
    return NextResponse.json({ error: 'messageNumber must be 1, 2, or 3' }, { status: 400 });
  }

  const column = `reminder_template_${messageNumber}` as
    | 'reminder_template_1'
    | 'reminder_template_2'
    | 'reminder_template_3';

  const { error } = await supabaseAdmin
    .from('users')
    .update({ [column]: text || null })
    .eq('id', user.id);

  if (error) return NextResponse.json({ error: 'Failed to save template' }, { status: 500 });

  return NextResponse.json({ message: 'Template saved' });
}
