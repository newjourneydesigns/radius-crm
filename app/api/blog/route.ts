import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { slugify } from '../../../lib/youtube';

function serviceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return createClient(url, key);
}

// GET /api/blog — list articles (published only for non-admins, all for service)
export async function GET(req: NextRequest) {
  const supabase = serviceClient();
  const { searchParams } = new URL(req.url);
  const all = searchParams.get('all') === 'true';

  let query = supabase
    .from('blog_articles')
    .select('*')
    .order('posted_at', { ascending: false })
    .order('created_at', { ascending: false });

  if (!all) {
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

  const { title, description, youtube_url, posted_at, published, created_by } = body;
  if (!title?.trim()) {
    return NextResponse.json({ error: 'Title is required' }, { status: 400 });
  }

  // Generate unique slug from title
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
      description: description ?? '',
      youtube_url: youtube_url?.trim() || null,
      slug,
      published: published ?? true,
      posted_at: posted_at ?? new Date().toISOString().slice(0, 10),
      created_by: created_by ?? null,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
}
