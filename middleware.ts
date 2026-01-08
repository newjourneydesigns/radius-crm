import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(_request: NextRequest) {
  // Auth in this app is currently client-side (Supabase session stored in localStorage).
  // That means Edge middleware cannot reliably read the session to protect pages.
  // We intentionally do NOT redirect here, to avoid redirect loops back to /login.
  return NextResponse.next();
}

export const config = {
  // Keep middleware scoped to API routes only.
  matcher: ['/api/:path*'],
};
