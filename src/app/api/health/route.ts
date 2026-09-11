import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export function GET() {
  const mode = process.env.COVENANT_ADAPTER ?? process.env.NEXT_PUBLIC_APP_MODE ?? 'demo';
  return NextResponse.json({
    ok: true,
    service: 'covenant-watch',
    mode,
    checkedAt: new Date().toISOString(),
  }, { headers: { 'cache-control': 'no-store' } });
}
