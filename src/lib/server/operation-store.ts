import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import type { CaseId, OperationPhase, VerificationOperation } from '@/types/covenant';

export interface StoredOperation extends VerificationOperation {
  requestId: string;
  caseId: CaseId;
  fingerprint: string;
}

interface PersistedOperations {
  version: 1;
  operations: StoredOperation[];
}

const activePhases = new Set<OperationPhase>(['queued', 'proving', 'submitting', 'confirming']);

export class OperationStore {
  private readonly operations = new Map<string, StoredOperation>();

  constructor(private readonly filePath: string | null) {
    this.load();
  }

  get(operationId: string) {
    return this.operations.get(operationId) ?? null;
  }

  findByRequestId(requestId: string) {
    return [...this.operations.values()].find((operation) => operation.requestId === requestId) ?? null;
  }

  findActive() {
    return [...this.operations.values()].find((operation) => activePhases.has(operation.phase)) ?? null;
  }

  findRecoverable() {
    return [...this.operations.values()].filter(
      (operation) => operation.phase === 'unknown' && operation.transactionId !== null,
    );
  }

  create(operation: StoredOperation) {
    this.operations.set(operation.operationId, operation);
    this.persist();
    return operation;
  }

  update(operationId: string, changes: Partial<StoredOperation>) {
    const current = this.operations.get(operationId);
    if (!current) throw new Error(`Operation ${operationId} does not exist.`);
    const updated = { ...current, ...changes, updatedAt: new Date().toISOString() };
    this.operations.set(operationId, updated);
    this.persist();
    return updated;
  }

  private load() {
    if (!this.filePath) return;
    let persisted: PersistedOperations;
    try {
      persisted = JSON.parse(readFileSync(this.filePath, 'utf8')) as PersistedOperations;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return;
      throw error;
    }
    if (persisted.version !== 1 || !Array.isArray(persisted.operations)) {
      throw new Error('Unsupported operation store format.');
    }
    let recovered = false;
    for (const operation of persisted.operations) {
      if (activePhases.has(operation.phase)) {
        operation.phase = 'unknown';
        operation.message = '서버 재시작 전에 완료 여부가 확정되지 않았습니다.';
        operation.updatedAt = new Date().toISOString();
        recovered = true;
      }
      this.operations.set(operation.operationId, operation);
    }
    if (recovered) this.persist();
  }

  private persist() {
    if (!this.filePath) return;
    mkdirSync(dirname(this.filePath), { recursive: true, mode: 0o700 });
    const temporaryPath = `${this.filePath}.${process.pid}.tmp`;
    const payload: PersistedOperations = { version: 1, operations: [...this.operations.values()] };
    writeFileSync(temporaryPath, `${JSON.stringify(payload, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });
    renameSync(temporaryPath, this.filePath);
  }
}

export function toPublicOperation(operation: StoredOperation): VerificationOperation {
  const { requestId: _requestId, caseId: _caseId, fingerprint: _fingerprint, ...publicOperation } = operation;
  return publicOperation;
}
