import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get('code');
  const error = requestUrl.searchParams.get('error');
  const error_description = requestUrl.searchParams.get('error_description');

  console.log('🔍 Auth callback received:', { code: !!code, error });

  // Handle OAuth errors
  if (error) {
    console.error('❌ OAuth error:', error, error_description);
    return NextResponse.redirect(`${requestUrl.origin}/login?error=${error}`);
  }

  // If we have a code, redirect to dashboard with the code
  // The client-side Supabase will automatically detect and exchange it
  if (code) {
    console.log('✅ Auth code received, redirecting to dashboard');
    return NextResponse.redirect(`${requestUrl.origin}/dashboard?code=${code}`);
  }

  // No code - go back to login
  console.error('❌ No auth code received');
  return NextResponse.redirect(`${requestUrl.origin}/login`);
}
