import { NextResponse, type NextRequest } from 'next/server';
import {
  DEMO_SESSION_COOKIE,
  isDemoSession,
  safeRedirectPath,
} from '@/lib/server/demo-auth';

export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const authenticated = isDemoSession(request.cookies.get(DEMO_SESSION_COOKIE)?.value);

  if (pathname === '/login') {
    if (!authenticated) return NextResponse.next();
    return NextResponse.redirect(new URL(safeRedirectPath(request.nextUrl.searchParams.get('next')), request.url));
  }

  if (authenticated) return NextResponse.next();

  if (pathname.startsWith('/api/')) {
    return NextResponse.json(
      { ok: false, code: 'AUTH_REQUIRED', message: '로그인이 필요합니다.' },
      { status: 401 },
    );
  }

  const loginUrl = new URL('/login', request.url);
  loginUrl.searchParams.set('next', `${pathname}${search}`);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: [
    '/login',
    '/request/:path*',
    '/status/:path*',
    '/api/verify/:path*',
  ],
};
