export type ModelError =
  | 'INSUFFICIENT_CASH'
  | 'STALE_DATA'
  | 'DATA_MISMATCH'
  | 'UNAUTHORIZED'
  | 'ALREADY_APPROVED';

export interface ModelInput {
  authorized: boolean;
  currentRound: number;
  approvedRound: number;
  submittedRound: number;
  commitmentMatches: boolean;
  cash: number;
  payments: number;
}

export function evaluateCovenant(input: ModelInput): ModelError | null {
  if (!input.authorized) return 'UNAUTHORIZED';
  if (input.submittedRound !== input.currentRound) return 'STALE_DATA';
  if (!input.commitmentMatches) return 'DATA_MISMATCH';
  if (input.approvedRound === input.currentRound) return 'ALREADY_APPROVED';
  if (input.payments <= 0 || input.cash * 5 < input.payments * 6) return 'INSUFFICIENT_CASH';
  return null;
}
