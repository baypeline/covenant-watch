export const covenantErrorCodes = [
  'INSUFFICIENT_CASH',
  'STALE_DATA',
  'DATA_MISMATCH',
  'UNAUTHORIZED',
  'ALREADY_APPROVED',
] as const;

export type CovenantErrorCode = (typeof covenantErrorCodes)[number];
export type ViewMode = 'company' | 'bank';
export type CaseId = 'round-1-pass' | 'round-2-fail' | 'round-1-stale';
export type OperationPhase =
  | 'queued'
  | 'proving'
  | 'submitting'
  | 'confirming'
  | 'confirmed'
  | 'rejected'
  | 'unknown';
export type RequestPhase = 'idle' | OperationPhase;

export interface LedgerState {
  mode: 'demo' | 'midnight';
  currentRound: number;
  approvedRound: number;
  snapshotCommitment: string;
  contractAddress: string;
  network: string;
  lastTransactionId: string | null;
  updatedAt: string;
}

export interface VerifyRequest {
  caseId: CaseId;
}

export interface StartVerifyRequest extends VerifyRequest {
  requestId: string;
  expectedRound: number;
}

export interface VerificationOperation {
  operationId: string;
  phase: OperationPhase;
  submittedRound: number;
  transactionId: string | null;
  code: CovenantErrorCode | null;
  message: string | null;
  state: LedgerState | null;
  updatedAt: string;
}

export interface StartVerifyResponse {
  operationId: string;
  phase: OperationPhase;
  submittedRound: number;
}

export type VerifyResponse =
  | {
      ok: true;
      transactionId: string;
      state: LedgerState;
    }
  | {
      ok: false;
      code: CovenantErrorCode;
      message: string;
      state: LedgerState;
    };

export interface AdvanceResponse {
  ok: true;
  state: LedgerState;
}

export interface ApiError {
  ok: false;
  code:
    | 'BAD_REQUEST'
    | 'INTERNAL_ERROR'
    | 'CHAIN_NOT_CONFIGURED'
    | 'STATE_CHANGED'
    | 'BUSY'
    | 'IDEMPOTENCY_CONFLICT'
    | 'OPERATION_NOT_FOUND';
  message: string;
}

export const cases = {
  'round-1-pass': {
    id: 'round-1-pass',
    round: 1,
    label: '1기 · 정상 자료',
    cash: 150,
    payments: 100,
    helper: '요건 충족 · 승인 가능',
  },
  'round-2-fail': {
    id: 'round-2-fail',
    round: 2,
    label: '2기 · 현금 부족',
    cash: 90,
    payments: 100,
    helper: '필요 현금 120 미달',
  },
  'round-1-stale': {
    id: 'round-1-stale',
    round: 1,
    label: '1기 · 이전 자료',
    cash: 150,
    payments: 100,
    helper: '현재 기간과 불일치',
  },
} as const satisfies Record<CaseId, object>;
