import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { DEMO_SESSION_COOKIE, isDemoSession } from '@/lib/server/demo-auth';

export const dynamic = 'force-dynamic';

export async function GET() {
  const cookieStore = await cookies();
  return NextResponse.json(
    { authenticated: isDemoSession(cookieStore.get(DEMO_SESSION_COOKIE)?.value) },
    { headers: { 'cache-control': 'no-store' } },
  );
}
