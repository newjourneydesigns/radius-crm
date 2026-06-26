import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

function serviceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return createClient(url, key);
}

// GET /api/blog/[id] — fetch by slug or uuid
export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const supabase = serviceClient();
  const { id } = params;

  // Try slug first, then uuid
  const { data: bySlug } = await supabase
    .from('blog_articles')
    .select('*')
    .eq('slug', id)
    .maybeSingle();

  if (bySlug) return NextResponse.json(bySlug);

  const { data: byId, error } = await supabase
    .from('blog_articles')
    .select('*')
    .eq('id', id)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!byId) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json(byId);
}

// PUT /api/blog/[id] — update article (admin only, by uuid)
export async function PUT(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const supabase = serviceClient();
  const body = await req.json();
  const { id } = params;

  const { title, description, youtube_url, posted_at, published, slug } = body;

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (title !== undefined) updates.title = title.trim();
  if (description !== undefined) updates.description = description;
  if (youtube_url !== undefined) updates.youtube_url = youtube_url?.trim() || null;
  if (posted_at !== undefined) updates.posted_at = posted_at;
  if (published !== undefined) updates.published = published;
  if (slug !== undefined) updates.slug = slug;

  const { data, error } = await supabase
    .from('blog_articles')
    .update(updates)
    .eq('id', id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

// DELETE /api/blog/[id] — delete article (admin only, by uuid)
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
