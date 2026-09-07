import { NextResponse } from 'next/server';
import { resetDemoLedger } from '@/lib/server/demo-ledger';

export function POST() {
  return NextResponse.json({ ok: true, state: resetDemoLedger() });
}
