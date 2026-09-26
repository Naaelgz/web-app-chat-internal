import { NextResponse, type NextRequest } from 'next/server';

export function proxy(request: NextRequest) {
  if (request.cookies.has('akselera_session')) return NextResponse.next();

  return NextResponse.redirect(new URL('/login', request.url));
}

export const config = {
  matcher: ['/chat/:path*'],
};