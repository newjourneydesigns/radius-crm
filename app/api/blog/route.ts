import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

function serviceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

// GET /api/blog — list all articles (published only for non-admins)
export async function GET(req: NextRequest) {
  const supabase = serviceClient();
  const adminParam = req.nextUrl.searchParams.get('admin');

  let query = supabase
    .from('blog_articles')
    .select('*')
    .order('posted_at', { ascending: false })
    .order('created_at', { ascending: false });

  if (adminParam !== 'true') {
    query = query.eq('published', true);
  }

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

// POST /api/blog — create article (admin only)
export async function POST(req: NextRequest) {
  const supabase = serviceClient();
  const body = await req.json();
  const { title, description, youtube_url, posted_at, published } = body;

  if (!title?.trim()) {
    return NextResponse.json({ error: 'Title is required' }, { status: 400 });
  }

  // Generate a unique slug
  const baseSlug = slugify(title);
  let slug = baseSlug;
  let attempt = 0;
  while (true) {
    const { data: existing } = await supabase
      .from('blog_articles')
      .select('id')
      .eq('slug', slug)
      .maybeSingle();
    if (!existing) break;
    attempt++;
    slug = `${baseSlug}-${attempt}`;
  }

  const { data, error } = await supabase
    .from('blog_articles')
    .insert({
      title: title.trim(),
      description: description || '',
      youtube_url: youtube_url || null,
      slug,
      published: published ?? true,
      posted_at: posted_at || new Date().toISOString().split('T')[0],
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
}
