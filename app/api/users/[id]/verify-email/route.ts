import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { verifyAdminAccessDemo } from '../../../../../lib/auth-middleware';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || 'demo-key',
  { auth: { autoRefreshToken: false, persistSession: false } }
);

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { isAdmin, error: adminAuthError } = await verifyAdminAccessDemo(request);
    if (!isAdmin) {
      return NextResponse.json({ error: adminAuthError || 'Admin access required' }, { status: 403 });
    }

    const userId = params.id;

    if (!process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY === 'demo-key') {
      return NextResponse.json({ message: 'Email verified (Demo Mode)' });
    }

    const { data, error } = await supabaseAdmin.auth.admin.updateUserById(userId, {
      email_confirm: true,
    });

    if (error) {
      console.error('Error verifying email:', error);
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({
      message: 'Email verified successfully',
      user: { id: data.user.id, email: data.user.email },
    });
  } catch (error) {
    console.error('Error in verify-email API:', error);
    return NextResponse.json({ error: `Internal server error: ${error}` }, { status: 500 });
  }
}
