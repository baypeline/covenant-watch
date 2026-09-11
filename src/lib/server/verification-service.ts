import { createHash, randomUUID } from 'node:crypto';
import type {
  CaseId,
  LedgerState,
  StartVerifyRequest,
  StartVerifyResponse,
  VerificationOperation,
  VerifyResponse,
} from '@/types/covenant';
import { cases } from '@/types/covenant';
import { OperationStore, toPublicOperation, type StoredOperation } from './operation-store';

export type VerificationExecutor = (caseId: CaseId) => Promise<VerifyResponse>;

export class VerificationServiceError extends Error {
  constructor(
    readonly code: 'STATE_CHANGED' | 'BUSY' | 'IDEMPOTENCY_CONFLICT' | 'OPERATION_NOT_FOUND',
    message: string,
  ) {
    super(message);
  }
}

export class VerificationService {
  constructor(
    private readonly store: OperationStore,
    private readonly getState: () => LedgerState | Promise<LedgerState>,
    private readonly executeVerification: VerificationExecutor,
    private readonly schedule: (task: () => void) => void = queueMicrotask,
  ) {}

  async start(request: StartVerifyRequest): Promise<StartVerifyResponse> {
    const fingerprint = makeFingerprint(request);
    const previous = this.store.findByRequestId(request.requestId);
    if (previous) {
      if (previous.fingerprint !== fingerprint) {
        throw new VerificationServiceError('IDEMPOTENCY_CONFLICT', '같은 requestId에 다른 요청 본문을 사용할 수 없습니다.');
      }
      return startResponse(previous);
    }

    const state = await this.getState();
    if (request.expectedRound !== state.currentRound) {
      throw new VerificationServiceError('STATE_CHANGED', '원장의 현재 기간이 요청을 준비한 시점과 달라졌습니다.');
    }
    if (this.store.findActive()) {
      throw new VerificationServiceError('BUSY', '이미 진행 중인 검증 작업이 있습니다.');
    }

    const now = new Date().toISOString();
    const operation = this.store.create({
      operationId: randomUUID(),
      requestId: request.requestId,
      caseId: request.caseId,
      fingerprint,
      phase: 'queued',
      submittedRound: request.expectedRound,
      transactionId: null,
      code: null,
      message: null,
      state: null,
      updatedAt: now,
    });
    this.schedule(() => void this.run(operation.operationId));
    return startResponse(operation);
  }

  get(operationId: string): VerificationOperation {
    const operation = this.store.get(operationId);
    if (!operation) throw new VerificationServiceError('OPERATION_NOT_FOUND', '검증 작업을 찾을 수 없습니다.');
    return toPublicOperation(operation);
  }

  private async run(operationId: string) {
    const operation = this.store.get(operationId);
    if (!operation) return;
    try {
      this.store.update(operationId, { phase: 'proving' });
      // Persist submitting before invoking an adapter that may broadcast a transaction.
      this.store.update(operationId, { phase: 'submitting' });
      const result = await this.executeVerification(operation.caseId);
      if (!result.ok) {
        this.store.update(operationId, {
          phase: 'rejected',
          code: result.code,
          message: result.message,
          state: result.state,
        });
        return;
      }
      this.store.update(operationId, {
        phase: 'confirming',
        transactionId: result.transactionId,
      });
      this.store.update(operationId, {
        phase: 'confirmed',
        transactionId: result.transactionId,
        state: result.state,
      });
    } catch {
      this.store.update(operationId, {
        phase: 'unknown',
        message: '제출 결과를 확정할 수 없습니다. 자동으로 재제출하지 않습니다.',
      });
    }
  }
}

function makeFingerprint(request: StartVerifyRequest) {
  return createHash('sha256')
    .update(JSON.stringify({ caseId: request.caseId, expectedRound: request.expectedRound }))
    .digest('hex');
}

function startResponse(operation: StoredOperation): StartVerifyResponse {
  return {
    operationId: operation.operationId,
    phase: operation.phase,
    submittedRound: operation.submittedRound,
  };
}

export function isCaseId(value: unknown): value is CaseId {
  return typeof value === 'string' && value in cases;
}
