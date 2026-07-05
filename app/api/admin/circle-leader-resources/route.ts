/**
 * Admin CRUD for Circle Leader Toolkit Resources pages.
 *
 * Resources are an ordered set of titled pages per audience ('circle' |
 * 'host_team'), stored in circle_leader_resource_pages. GET lazily seeds the
 * first page from the legacy single-doc table (circle_leader_resources) so
 * pre-existing content carries over even if the SQL migration's seed didn't run.
 *
 *   GET    ?audience=          → { pages: [...] } ordered by sort_order
 *   POST   { audience, title } → create page (slug generated, appended last)
 *   PUT    { id, title?, body_html? } → update page
 *   PATCH  { audience, order: [id, ...] } → persist nav order
 *   DELETE ?id=                → delete page
 */

import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminAccess } from '../../../../lib/auth-middleware';
import { createServiceSupabaseClient } from '../../../../lib/server-supabase';
import type { ResourcePageAudience } from '../../../../lib/supabase';

export const dynamic = 'force-dynamic';

function parseAudience(value: unknown): ResourcePageAudience {
  return value === 'host_team' ? 'host_team' : 'circle';
}

function slugify(title: string): string {
  return (
    title
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '') // strip combining accents left by NFKD
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60) || 'page'
  );
}

async function gate(req: NextRequest) {
  const { isAdmin, error } = await verifyAdminAccess(req);
  if (!isAdmin) {
    return NextResponse.json({ error: error || 'Forbidden' }, { status: 403 });
  }
  return null;
}

type ServiceClient = ReturnType<typeof createServiceSupabaseClient>;

async function listPages(supabase: ServiceClient, audience: ResourcePageAudience) {
  const { data, error } = await supabase
    .from('circle_leader_resource_pages')
    .select('*')
    .eq('audience', audience)
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true });
  if (error) throw error;
  return data || [];
}

/** One-time lazy carry-over of the legacy single Resources doc into page #1. */
async function seedFromLegacyDoc(supabase: ServiceClient, audience: ResourcePageAudience) {
  const { data: legacy } = await supabase
    .from('circle_leader_resources')
    .select('body_html, updated_at, updated_by')
    .eq('audience', audience)
    .maybeSingle();
  if (!legacy?.body_html || !legacy.body_html.trim()) return;

  await supabase.from('circle_leader_resource_pages').insert({
    audience,
    title: 'Resources',
    slug: 'resources',
    body_html: legacy.body_html,
    sort_order: 0,
    updated_at: legacy.updated_at || new Date().toISOString(),
    updated_by: legacy.updated_by || null,
  });
}

async function uniqueSlug(
  supabase: ServiceClient,
  audience: ResourcePageAudience,
  title: string
): Promise<string> {
  const base = slugify(title);
  const { data, error } = await supabase
    .from('circle_leader_resource_pages')
    .select('slug')
    .eq('audience', audience);
  if (error) throw error;
  const taken = new Set((data || []).map((row) => row.slug));
  // Reserved for the virtual Pro Tips catalog tab on the leader side.
  taken.add('pro-tips');
  if (!taken.has(base)) return base;
  for (let n = 2; ; n++) {
    const candidate = `${base}-${n}`;
    if (!taken.has(candidate)) return candidate;
  }
}

export async function GET(req: NextRequest) {
  const block = await gate(req);
  if (block) return block;

  try {
    const audience = parseAudience(new URL(req.url).searchParams.get('audience'));
    const supabase = createServiceSupabaseClient();
    let pages = await listPages(supabase, audience);
    if (pages.length === 0) {
      await seedFromLegacyDoc(supabase, audience);
      pages = await listPages(supabase, audience);
    }
    return NextResponse.json(
      { pages },
      { headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' } }
    );
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'Failed to load.' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const { isAdmin, user, error } = await verifyAdminAccess(req);
  if (!isAdmin) return NextResponse.json({ error: error || 'Forbidden' }, { status: 403 });

  let body: any = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const title = typeof body.title === 'string' ? body.title.trim() : '';
  if (!title) return NextResponse.json({ error: 'A page title is required.' }, { status: 400 });
  const audience = parseAudience(body.audience);
  const body_html = typeof body.body_html === 'string' ? body.body_html : '';

  try {
    const supabase = createServiceSupabaseClient();
    const existing = await listPages(supabase, audience);
    const slug = await uniqueSlug(supabase, audience, title);
    const sort_order = existing.length
      ? Math.max(...existing.map((p) => p.sort_order ?? 0)) + 1
      : 0;
    const { data, error: insertError } = await supabase
      .from('circle_leader_resource_pages')
      .insert({ audience, title, slug, body_html, sort_order, updated_by: user?.id || null })
      .select()
      .single();
    if (insertError) throw insertError;
    return NextResponse.json({ page: data });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'Create failed.' }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  const { isAdmin, user, error } = await verifyAdminAccess(req);
  if (!isAdmin) return NextResponse.json({ error: error || 'Forbidden' }, { status: 403 });

  let body: any = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  if (typeof body.id !== 'string' || !body.id) {
    return NextResponse.json({ error: 'id is required.' }, { status: 400 });
  }

  const patch: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
    updated_by: user?.id || null,
  };
  if (typeof body.title === 'string') {
    const title = body.title.trim();
    if (!title) return NextResponse.json({ error: 'Title cannot be empty.' }, { status: 400 });
    patch.title = title;
  }
  if (typeof body.body_html === 'string') patch.body_html = body.body_html;

  try {
    const supabase = createServiceSupabaseClient();
    const { data, error: updateError } = await supabase
      .from('circle_leader_resource_pages')
      .update(patch)
      .eq('id', body.id)
      .select()
      .single();
    if (updateError) throw updateError;
    return NextResponse.json({ page: data });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'Save failed.' }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  const block = await gate(req);
  if (block) return block;

  let body: any = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  const audience = parseAudience(body.audience);
  const order: unknown[] = Array.isArray(body.order) ? body.order : [];
  if (!order.length || !order.every((id) => typeof id === 'string')) {
    return NextResponse.json({ error: 'order must be a list of page ids.' }, { status: 400 });
  }

  try {
    const supabase = createServiceSupabaseClient();
    for (let i = 0; i < order.length; i++) {
      const { error: updateError } = await supabase
        .from('circle_leader_resource_pages')
        .update({ sort_order: i })
        .eq('id', order[i] as string)
        .eq('audience', audience);
      if (updateError) throw updateError;
    }
    const pages = await listPages(supabase, audience);
    return NextResponse.json({ pages });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'Reorder failed.' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const block = await gate(req);
  if (block) return block;

  const id = new URL(req.url).searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id is required.' }, { status: 400 });

  try {
    const supabase = createServiceSupabaseClient();
    const { error: deleteError } = await supabase
      .from('circle_leader_resource_pages')
      .delete()
      .eq('id', id);
    if (deleteError) throw deleteError;
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'Delete failed.' }, { status: 500 });
  }
}
