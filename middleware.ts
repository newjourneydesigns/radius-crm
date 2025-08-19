import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export async function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname;

  // Public paths that don't require authentication
  const publicPaths = [
    '/login',
    '/logout',
    '/',
    '/search',
    '/api',
    '/_next',
    '/favicon.ico',
    '/manifest.json',
    '/robots.txt',
    '/sw.js',
    '/icon-',
    '/apple-touch-icon'
  ];

  // Check if the current path is public
  const isPublicPath = publicPaths.some(path => 
    pathname.startsWith(path) || pathname === path
  );

  // If it's a public path, allow access
  if (isPublicPath) {
    return NextResponse.next();
  }

  try {
    // Create Supabase client
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseAnonKey) {
      console.error('Missing Supabase environment variables');
      return NextResponse.redirect(new URL('/login', request.url));
    }

    const supabase = createClient(supabaseUrl, supabaseAnonKey);

    // Get auth token from cookies
    const authToken = request.cookies.get('sb-access-token')?.value || 
                     request.cookies.get('supabase.auth.token')?.value ||
                     request.headers.get('authorization')?.replace('Bearer ', '');

    if (!authToken) {
      console.log('No auth token found, redirecting to login');
      const redirectUrl = new URL('/login', request.url);
      redirectUrl.searchParams.set('redirectTo', pathname);
      return NextResponse.redirect(redirectUrl);
    }

    // Verify the token with Supabase
    const { data: { user }, error } = await supabase.auth.getUser(authToken);

    if (error || !user) {
      console.error('Invalid auth token:', error);
      const redirectUrl = new URL('/login', request.url);
      redirectUrl.searchParams.set('redirectTo', pathname);
      return NextResponse.redirect(redirectUrl);
    }

    // User is authenticated, allow access
    return NextResponse.next();

  } catch (error) {
    console.error('Error in middleware:', error);
    // On error, redirect to login
    const redirectUrl = new URL('/login', request.url);
    redirectUrl.searchParams.set('error', 'Authentication error');
    return NextResponse.redirect(redirectUrl);
  }
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     */
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ],
};
