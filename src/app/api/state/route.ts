import { NextResponse } from 'next/server';
import { getCovenantAdapter } from '@/lib/server/adapter-runtime';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const adapter = await getCovenantAdapter();
    return NextResponse.json(await adapter.getState(), {
      headers: { 'cache-control': 'no-store' },
    });
  } catch (error) {
    console.error('[covenant/state] ledger query failed:', safeErrorMessage(error));
    return NextResponse.json({ ok: false, code: 'CHAIN_NOT_CONFIGURED', message: '원장 상태를 읽지 못했습니다.' }, { status: 503 });
  }
}

function safeErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : 'unknown error';
}
