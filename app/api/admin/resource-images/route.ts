/**
 * POST /api/admin/resource-images
 * Admin-only image upload for toolkit content (Resources pages, Pro Tips).
 * Accepts multipart form data with a `file` field; stores it in the public
 * `resource-images` bucket and returns { url } for embedding in rich text.
 */

import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { verifyAdminAccess } from '../../../../lib/auth-middleware';
import { createServiceSupabaseClient } from '../../../../lib/server-supabase';

export const dynamic = 'force-dynamic';

const MAX_BYTES = 5 * 1024 * 1024; // keep in sync with the bucket's file_size_limit
const EXTENSION_BY_TYPE: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/gif': 'gif',
  'image/webp': 'webp',
};

export async function POST(req: NextRequest) {
  const { isAdmin, error } = await verifyAdminAccess(req);
  if (!isAdmin) return NextResponse.json({ error: error || 'Forbidden' }, { status: 403 });

  let file: File | null = null;
  try {
    const form = await req.formData();
    const entry = form.get('file');
    file = entry instanceof File ? entry : null;
  } catch {
    return NextResponse.json({ error: 'Expected multipart form data.' }, { status: 400 });
  }
  if (!file) return NextResponse.json({ error: 'No file uploaded.' }, { status: 400 });

  const extension = EXTENSION_BY_TYPE[file.type];
  if (!extension) {
    return NextResponse.json(
      { error: 'Only PNG, JPEG, GIF, and WebP images are supported.' },
      { status: 400 }
    );
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: 'Images must be 5 MB or smaller.' }, { status: 400 });
  }

  try {
    const supabase = createServiceSupabaseClient();
    const path = `${new Date().getFullYear()}/${randomUUID()}.${extension}`;
    const buffer = Buffer.from(await file.arrayBuffer());
    const { error: uploadError } = await supabase.storage
      .from('resource-images')
      .upload(path, buffer, { contentType: file.type, upsert: false });
    if (uploadError) throw uploadError;

    const { data } = supabase.storage.from('resource-images').getPublicUrl(path);
    return NextResponse.json({ url: data.publicUrl });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'Upload failed.' }, { status: 500 });
  }
}
