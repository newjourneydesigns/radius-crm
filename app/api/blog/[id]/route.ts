import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

function serviceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );
}

// GET /api/blog/[id] — fetch by id or slug
export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const supabase = serviceClient();
  const { id } = params;

  // Try slug first, fall back to uuid
  const isUuid = /^[0-9a-f-]{36}$/.test(id);
  const { data, error } = await supabase
    .from('blog_articles')
    .select('*')
    .eq(isUuid ? 'id' : 'slug', id)
    .eq('published', true)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json(data);
}

// PUT /api/blog/[id] — update article
export async function PUT(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const supabase = serviceClient();
  const body = await req.json();
  const { title, description, youtube_url, posted_at, published, slug } = body;

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (title !== undefined) updates.title = title.trim();
  if (description !== undefined) updates.description = description;
  if (youtube_url !== undefined) updates.youtube_url = youtube_url || null;
  if (posted_at !== undefined) updates.posted_at = posted_at;
  if (published !== undefined) updates.published = published;
  if (slug !== undefined) updates.slug = slug;

  const { data, error } = await supabase
    .from('blog_articles')
    .update(updates)
    .eq('id', params.id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

// DELETE /api/blog/[id] — delete article
export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const supabase = serviceClient();
  const { error } = await supabase
    .from('blog_articles')
    .delete()
    .eq('id', params.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
