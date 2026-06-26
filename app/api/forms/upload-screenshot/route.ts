import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

// 10 uploads per IP per 5 minutes
const _rateMap = new Map<string, { count: number; resetAt: number }>();
function checkRate(ip: string): boolean {
  const now = Date.now();
  const entry = _rateMap.get(ip);
  if (!entry || now > entry.resetAt) { _rateMap.set(ip, { count: 1, resetAt: now + 5 * 60_000 }); return true; }
  if (entry.count >= 10) return false;
  entry.count++;
  return true;
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS });
}

export async function POST(request: NextRequest) {
  try {
    const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
    if (!checkRate(ip)) {
      return NextResponse.json({ error: 'Too many uploads. Please wait a few minutes.' }, { status: 429, headers: CORS });
    }

    const formData = await request.formData();
    const imageFile = formData.get('image') as File | null;

    if (!imageFile) {
      return NextResponse.json({ error: 'No image provided' }, { status: 400, headers: CORS });
    }
    if (!imageFile.type.startsWith('image/')) {
      return NextResponse.json({ error: 'Invalid file type — images only' }, { status: 400, headers: CORS });
    }
    if (imageFile.size > 5 * 1024 * 1024) {
      return NextResponse.json({ error: 'File too large (max 5 MB)' }, { status: 400, headers: CORS });
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const id = crypto.randomUUID();
    const path = `forms/${id}.jpg`;
    const bytes = await imageFile.arrayBuffer();

    const { error: uploadErr } = await supabase.storage
      .from('card-screenshots')
      .upload(path, bytes, { contentType: 'image/jpeg' });

    if (uploadErr) throw uploadErr;

    const { data: urlData } = supabase.storage.from('card-screenshots').getPublicUrl(path);

    return NextResponse.json({ url: urlData.publicUrl }, { headers: CORS });
  } catch (err) {
    console.error('[form-upload-screenshot]', err);
    return NextResponse.json({ error: 'Upload failed' }, { status: 500, headers: CORS });
  }
}
