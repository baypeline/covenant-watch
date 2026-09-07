import 'server-only';

import { createHash, randomBytes } from 'node:crypto';
import { cases, type CaseId, type LedgerState, type VerifyResponse } from '@/types/covenant';

interface DemoLedger extends LedgerState {
  revision: number;
}

const demoGlobal = globalThis as typeof globalThis & { __covenantWatchLedger?: DemoLedger };

export function readLedger(): LedgerState {
  return toPublicState(getLedger());
}

export function verifyDemoCase(caseId: CaseId): VerifyResponse {
  const ledger = getLedger();
  const sample = cases[caseId];

  if (sample.round !== ledger.currentRound) {
    return rejected('STALE_DATA', '현재 검증 기간과 자료의 기간이 다릅니다.', ledger);
  }
  if (makeCommitment(caseId, sample.round) !== ledger.snapshotCommitment) {
    return rejected('DATA_MISMATCH', '현재 원장에 등록된 자료와 일치하지 않습니다.', ledger);
  }
  if (ledger.approvedRound === ledger.currentRound) {
    return rejected('ALREADY_APPROVED', '이 기간은 이미 승인되었습니다.', ledger);
  }
  if (5 * sample.cash < 6 * sample.payments) {
    return rejected('INSUFFICIENT_CASH', '현금 여유 기준을 충족하지 못했습니다.', ledger);
  }

  ledger.approvedRound = ledger.currentRound;
  ledger.lastTransactionId = transactionId('approve', ledger.revision++);
  ledger.updatedAt = new Date().toISOString();
  return { ok: true, transactionId: ledger.lastTransactionId, state: toPublicState(ledger) };
}

export function advanceDemoSnapshot(): LedgerState {
  const ledger = getLedger();
  if (ledger.currentRound === 1) {
    ledger.currentRound = 2;
    ledger.snapshotCommitment = makeCommitment('round-2-fail', 2);
    ledger.lastTransactionId = transactionId('advance', ledger.revision++);
    ledger.updatedAt = new Date().toISOString();
  }
  return toPublicState(ledger);
}

export function resetDemoLedger(): LedgerState {
  demoGlobal.__covenantWatchLedger = initialState();
  return toPublicState(demoGlobal.__covenantWatchLedger);
}

function getLedger(): DemoLedger {
  demoGlobal.__covenantWatchLedger ??= initialState();
  return demoGlobal.__covenantWatchLedger;
}

function initialState(): DemoLedger {
  return {
    currentRound: 1,
    approvedRound: 0,
    snapshotCommitment: makeCommitment('round-1-pass', 1),
    contractAddress: `mn_contract_${createHash('sha256').update('covenant-watch-v1').digest('hex')}`,
    network: process.env.MIDNIGHT_NETWORK_ID ?? 'undeployed',
    lastTransactionId: null,
    updatedAt: new Date().toISOString(),
    revision: 1,
  };
}

function makeCommitment(caseId: CaseId, round: number) {
  // Demo adapter only. The real adapter derives this with Compact's
  // makeSnapshotCommitment pure circuit and a private random blinding value.
  return createHash('sha256').update(`covenant-watch:${caseId}:${round}:private-blinding`).digest('hex');
}

function transactionId(action: string, revision: number) {
  return createHash('sha256').update(`${action}:${revision}:${Date.now()}:${randomBytes(8).toString('hex')}`).digest('hex');
}

function rejected(code: Extract<VerifyResponse, { ok: false }>['code'], message: string, state: DemoLedger): VerifyResponse {
  return { ok: false, code, message, state: toPublicState(state) };
}

function toPublicState({ revision: _revision, ...state }: DemoLedger): LedgerState {
  return { ...state };
}
