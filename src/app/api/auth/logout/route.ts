import { NextResponse } from 'next/server';
import { DEMO_SESSION_COOKIE } from '@/lib/server/demo-auth';

export function POST(request: Request) {
  const response = NextResponse.redirect(new URL('/login', request.url), 303);
  response.cookies.set({
    name: DEMO_SESSION_COOKIE,
    value: '',
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 0,
  });
  return response;
}
