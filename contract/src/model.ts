export type ModelError =
  | 'INSUFFICIENT_CASH'
  | 'STALE_DATA'
  | 'DATA_MISMATCH'
  | 'UNAUTHORIZED'
  | 'ALREADY_APPROVED'
  | 'INVALID_PAYMENT_AMOUNT'
  | 'AMOUNT_OUT_OF_RANGE';

export type AdvanceModelError = 'UNAUTHORIZED' | 'ROUND_LIMIT_REACHED';

export const MAX_AMOUNT = 1_000_000n;
export const MAX_ROUND = 65_535n;

export interface ModelInput {
  authorized: boolean;
  currentRound: bigint;
  approvedRound: bigint;
  submittedRound: bigint;
  commitmentMatches: boolean;
  cash: bigint;
  payments: bigint;
}

export function evaluateCovenant(input: ModelInput): ModelError | null {
  if (!input.authorized) return 'UNAUTHORIZED';
  if (input.submittedRound !== input.currentRound) return 'STALE_DATA';
  if (!input.commitmentMatches) return 'DATA_MISMATCH';
  if (input.payments <= 0n) return 'INVALID_PAYMENT_AMOUNT';
  if (input.cash < 0n || input.cash > MAX_AMOUNT || input.payments > MAX_AMOUNT) return 'AMOUNT_OUT_OF_RANGE';
  if (input.approvedRound === input.currentRound) return 'ALREADY_APPROVED';
  if (input.cash * 5n < input.payments * 6n) return 'INSUFFICIENT_CASH';
  return null;
}

export function evaluateAdvance(authorized: boolean, currentRound: bigint): AdvanceModelError | null {
  if (!authorized) return 'UNAUTHORIZED';
  if (currentRound >= MAX_ROUND) return 'ROUND_LIMIT_REACHED';
  return null;
}
