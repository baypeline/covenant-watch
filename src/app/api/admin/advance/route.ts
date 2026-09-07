import { NextResponse } from 'next/server';
import { advanceDemoSnapshot } from '@/lib/server/demo-ledger';

export function POST() {
  return NextResponse.json({ ok: true, state: advanceDemoSnapshot() });
}
