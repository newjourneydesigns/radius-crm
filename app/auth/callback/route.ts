import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get('code');
  const error = requestUrl.searchParams.get('error');
  const error_description = requestUrl.searchParams.get('error_description');
  const next = requestUrl.searchParams.get('next') ?? '/dashboard';

  console.log('🔍 Auth callback received:', {
    origin: requestUrl.origin,
    code: code ? 'present' : 'missing',
    error,
    error_description,
    forwardedHost: request.headers.get('x-forwarded-host'),
    host: request.headers.get('host'),
    fullUrl: request.url
  });

  // If there's an OAuth error from the provider
  if (error) {
    console.error('❌ OAuth provider error:', error, error_description);
    return NextResponse.redirect(`${requestUrl.origin}/auth/auth-code-error?error=${error}&description=${encodeURIComponent(error_description || '')}`);
  }

  if (code) {
    // For the OAuth callback, we'll let the client-side handle the session
    // The client-side Supabase will automatically detect the auth code in the URL
    // and handle the PKCE flow properly
    
    console.log('✅ Auth code received, redirecting to client-side handler...');
    
    const forwardedHost = request.headers.get('x-forwarded-host');
    const host = request.headers.get('host');
    const isLocalEnv = process.env.NODE_ENV === 'development';
    
    let redirectUrl;
    if (isLocalEnv) {
      // In development, redirect to localhost
      redirectUrl = `${requestUrl.origin}${next}`;
    } else if (host === 'myradiuscrm.com') {
      // If the request came to our custom domain, stay on it
      redirectUrl = `https://myradiuscrm.com${next}`;
    } else if (forwardedHost === 'myradiuscrm.com') {
      // If forwarded from our custom domain, redirect back to it
      redirectUrl = `https://myradiuscrm.com${next}`;
    } else {
      // Fallback to origin
      redirectUrl = `${requestUrl.origin}${next}`;
    }
    
    // Add the auth parameters to the redirect URL so client can handle them
    const redirectUrlObj = new URL(redirectUrl);
    redirectUrlObj.searchParams.set('code', code);
    if (requestUrl.searchParams.get('state')) {
      redirectUrlObj.searchParams.set('state', requestUrl.searchParams.get('state')!);
    }
    
    console.log('🔍 Auth callback redirecting to:', redirectUrlObj.toString());
    return NextResponse.redirect(redirectUrlObj.toString());
  }

  // No code parameter
  console.error('❌ No auth code received in callback');
  return NextResponse.redirect(`${requestUrl.origin}/auth/auth-code-error?error=missing_code&description=No authentication code received`);
}
