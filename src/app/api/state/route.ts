import { NextResponse } from 'next/server';
import { getCovenantAdapter } from '@/lib/server/adapter-runtime';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const adapter = await getCovenantAdapter();
    const ledger = await adapter.getState();
    return NextResponse.json({
      mode: ledger.mode,
      network: ledger.network,
      contractAddress: ledger.contractAddress,
      state: {
        currentRound: ledger.currentRound,
        approvedRound: ledger.approvedRound,
        snapshotCommitment: ledger.snapshotCommitment,
        lastTransactionId: ledger.lastTransactionId,
      },
      fetchedAt: new Date().toISOString(),
      operatorActionsEnabled:
        process.env.COVENANT_ENABLE_OPERATOR_HTTP === 'true'
        && !process.env.COVENANT_OPERATOR_TOKEN,
    }, {
      headers: { 'cache-control': 'no-store' },
    });
  } catch (error) {
    console.error('[covenant/state] ledger query failed:', safeErrorMessage(error));
    return NextResponse.json({ ok: false, code: 'CHAIN_NOT_CONFIGURED', message: '원장 상태를 읽지 못했습니다.', state: null }, { status: 503 });
  }
}

function safeErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : 'unknown error';
}
