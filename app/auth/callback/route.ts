import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const error = requestUrl.searchParams.get('error');
  const error_description = requestUrl.searchParams.get('error_description');
  const next = requestUrl.searchParams.get('next') || '/dashboard';

  console.log('🔍 Auth callback received:', { error });

  // Handle OAuth errors
  if (error) {
    console.error('❌ OAuth error:', error, error_description);
    return NextResponse.redirect(`${requestUrl.origin}/login?error=${encodeURIComponent(error)}`);
  }

  // For implicit flow (magic links), the session is in the URL hash
  // and will be handled client-side by the Supabase client.
  // Just redirect to the verify page which will check the session.
  console.log('✅ Redirecting to verify page for session validation');
  const verifyUrl = new URL('/auth/verify', requestUrl.origin);
  verifyUrl.searchParams.set('next', next);
  return NextResponse.redirect(verifyUrl.toString());
}
