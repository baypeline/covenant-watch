import type { CaseId, LedgerState, VerifyResponse } from '@/types/covenant';

export interface CovenantAdapter {
  readonly mode: 'demo' | 'midnight';
  getState(): Promise<LedgerState>;
  verify(caseId: CaseId): Promise<VerifyResponse>;
  advance(): Promise<LedgerState>;
  reset(): Promise<LedgerState>;
}
