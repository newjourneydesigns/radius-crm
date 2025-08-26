import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '../../../lib/supabase';

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  const next = searchParams.get('next') ?? '/dashboard';

  if (code) {
    try {
      const { error } = await supabase.auth.exchangeCodeForSession(code);
      if (!error) {
        const forwardedHost = request.headers.get('x-forwarded-host'); // original origin before load balancer
        const isLocalEnv = process.env.NODE_ENV === 'development';
        
        if (isLocalEnv) {
          // In development, redirect to localhost
          return NextResponse.redirect(`${origin}${next}`);
        } else if (forwardedHost) {
          // In production, use the forwarded host (Netlify)
          return NextResponse.redirect(`https://${forwardedHost}${next}`);
        } else {
          // Fallback to origin
          return NextResponse.redirect(`${origin}${next}`);
        }
      }
    } catch (error) {
      console.error('Auth callback error:', error);
    }
  }

  // Return the user to an error page with instructions
  return NextResponse.redirect(`${origin}/auth/auth-code-error`);
}
