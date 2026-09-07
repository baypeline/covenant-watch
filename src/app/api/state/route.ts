import { NextResponse } from 'next/server';
import { readLedger } from '@/lib/server/demo-ledger';

export const dynamic = 'force-dynamic';

export function GET() {
  return NextResponse.json(readLedger(), {
    headers: { 'cache-control': 'no-store' },
  });
}
