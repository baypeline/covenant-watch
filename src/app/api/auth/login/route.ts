import { NextResponse } from 'next/server';
import {
  DEMO_SESSION_COOKIE,
  DEMO_SESSION_MAX_AGE,
  DEMO_SESSION_VALUE,
  isDemoCredentials,
  safeRedirectPath,
} from '@/lib/server/demo-auth';

interface LoginRequest {
  id?: unknown;
  password?: unknown;
  next?: unknown;
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null) as LoginRequest | null;
  if (!body || !isDemoCredentials(body.id, body.password)) {
    return NextResponse.json(
      { ok: false, message: '아이디 또는 비밀번호가 맞지 않습니다.' },
      { status: 401 },
    );
  }

  const response = NextResponse.json({
    ok: true,
    redirectTo: safeRedirectPath(body.next),
  });
  response.cookies.set({
    name: DEMO_SESSION_COOKIE,
    value: DEMO_SESSION_VALUE,
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: DEMO_SESSION_MAX_AGE,
  });
  return response;
}
