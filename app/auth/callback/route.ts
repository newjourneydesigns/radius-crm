import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get('code');
  const next = requestUrl.searchParams.get('next') || '/dashboard';
  const error = requestUrl.searchParams.get('error');
  const error_description = requestUrl.searchParams.get('error_description');

  console.log('🔍 Auth callback received:', { code: !!code, error });

  // Handle OAuth errors
  if (error) {
    console.error('❌ OAuth error:', error, error_description);
    return NextResponse.redirect(`${requestUrl.origin}/login?error=${encodeURIComponent(error)}`);
  }

  // If we have a code, send it to the verify page.
  // The verify page exchanges the code client-side and enforces the @valleycreek.org domain.
  if (code) {
    console.log('✅ Auth code received, redirecting to verify');
    const verifyUrl = new URL('/auth/verify', requestUrl.origin);
    verifyUrl.searchParams.set('code', code);
    verifyUrl.searchParams.set('next', next);
    return NextResponse.redirect(verifyUrl.toString());
  }

  // No code - go back to login
  console.error('❌ No auth code received');
  return NextResponse.redirect(`${requestUrl.origin}/login`);
}
