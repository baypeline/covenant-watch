import type { CaseId, LedgerState, VerifyResponse } from '@/types/covenant';

export interface VerificationLifecycle {
  onSubmitting(): void;
  onSubmitted(transactionId: string): void;
}

export interface CovenantAdapter {
  readonly mode: 'demo' | 'midnight';
  getState(): Promise<LedgerState>;
  verify(caseId: CaseId, lifecycle?: VerificationLifecycle): Promise<VerifyResponse>;
  advance(): Promise<LedgerState>;
  reset(): Promise<LedgerState>;
}
