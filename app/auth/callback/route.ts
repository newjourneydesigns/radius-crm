import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '../../../lib/supabase';

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  const error = searchParams.get('error');
  const error_description = searchParams.get('error_description');
  const next = searchParams.get('next') ?? '/dashboard';

  console.log('🔍 Auth callback received:', {
    origin,
    code: code ? 'present' : 'missing',
    error,
    error_description,
    forwardedHost: request.headers.get('x-forwarded-host'),
    host: request.headers.get('host')
  });

  // If there's an OAuth error from the provider
  if (error) {
    console.error('❌ OAuth provider error:', error, error_description);
    return NextResponse.redirect(`${origin}/auth/auth-code-error?error=${error}&description=${encodeURIComponent(error_description || '')}`);
  }

  if (code) {
    try {
      const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
      if (!exchangeError) {
        console.log('✅ Auth callback successful, redirecting...');
        
        const forwardedHost = request.headers.get('x-forwarded-host');
        const host = request.headers.get('host');
        const isLocalEnv = process.env.NODE_ENV === 'development';
        
        let redirectUrl;
        if (isLocalEnv) {
          // In development, redirect to localhost
          redirectUrl = `${origin}${next}`;
        } else if (host === 'myradiuscrm.com') {
          // If the request came to our custom domain, stay on it
          redirectUrl = `https://myradiuscrm.com${next}`;
        } else if (forwardedHost === 'myradiuscrm.com') {
          // If forwarded from our custom domain, redirect back to it
          redirectUrl = `https://myradiuscrm.com${next}`;
        } else {
          // Fallback to origin
          redirectUrl = `${origin}${next}`;
        }
        
        console.log('🔍 Auth callback redirecting to:', redirectUrl);
        return NextResponse.redirect(redirectUrl);
      } else {
        console.error('❌ Session exchange error:', exchangeError);
        return NextResponse.redirect(`${origin}/auth/auth-code-error?error=session_exchange&description=${encodeURIComponent(exchangeError.message)}`);
      }
    } catch (error) {
      console.error('❌ Auth callback exception:', error);
      return NextResponse.redirect(`${origin}/auth/auth-code-error?error=callback_exception&description=${encodeURIComponent(String(error))}`);
    }
  }

  // No code parameter
  console.error('❌ No auth code received in callback');
  return NextResponse.redirect(`${origin}/auth/auth-code-error?error=missing_code&description=No authentication code received`);
}
