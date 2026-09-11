import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, describe, expect, it } from 'vitest';
import type { LedgerState, VerifyResponse } from '@/types/covenant';
import { OperationStore } from './operation-store';
import { VerificationService, VerificationServiceError, type VerificationExecutor } from './verification-service';

const temporaryDirectories: string[] = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe('VerificationService', () => {
  it('tracks an accepted request through confirmation and stores no private amounts', async () => {
    const { service, runNext, storeFile } = fixture(async () => approved());
    const accepted = await service.start(request('request-confirmed'));

    expect(accepted.phase).toBe('queued');
    await runNext();
    expect(service.get(accepted.operationId)).toMatchObject({
      phase: 'confirmed',
      transactionId: 'tx-approved',
      submittedRound: 1,
    });
    const persisted = readFileSync(storeFile, 'utf8');
    expect(persisted).not.toContain('cash');
    expect(persisted).not.toContain('payments');
    expect(persisted).not.toContain('private-blinding');
  });

  it('returns the same operation for an identical requestId', async () => {
    const { service } = fixture(async () => approved());
    const first = await service.start(request('request-retry'));
    const retry = await service.start(request('request-retry'));
    expect(retry.operationId).toBe(first.operationId);
  });

  it('rejects requestId reuse with a different body', async () => {
    const { service } = fixture(async () => approved());
    await service.start(request('request-conflict'));
    await expect(service.start({ ...request('request-conflict'), caseId: 'round-1-stale' }))
      .rejects.toThrowError(expect.objectContaining({ code: 'IDEMPOTENCY_CONFLICT' }));
  });

  it('allows only one active operation', async () => {
    const { service } = fixture(async () => approved());
    await service.start(request('request-active-a'));
    await expect(service.start(request('request-active-b')))
      .rejects.toThrowError(expect.objectContaining({ code: 'BUSY' }));
    expect(() => service.assertIdle()).toThrowError(expect.objectContaining({ code: 'BUSY' }));
  });

  it('admits only one request when two starts race', async () => {
    const { service } = fixture(async () => approved());
    const results = await Promise.allSettled([
      service.start(request('request-race-a')),
      service.start(request('request-race-b')),
    ]);
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    const rejected = results.find((result) => result.status === 'rejected');
    expect(rejected).toMatchObject({ reason: expect.objectContaining({ code: 'BUSY' }) });
  });

  it('rejects a request prepared for an old round', async () => {
    const { service } = fixture(async () => approved(), { currentRound: 2 });
    await expect(service.start(request('request-stale-state')))
      .rejects.toThrowError(expect.objectContaining({ code: 'STATE_CHANGED' }));
  });

  it('tracks a covenant rejection as a terminal operation', async () => {
    const { service, runNext } = fixture(async () => ({
      ok: false,
      code: 'INSUFFICIENT_CASH',
      message: '현금 부족',
      state: ledger(),
    }));
    const accepted = await service.start(request('request-rejected'));
    await runNext();
    expect(service.get(accepted.operationId)).toMatchObject({
      phase: 'rejected',
      code: 'INSUFFICIENT_CASH',
      transactionId: null,
    });
  });

  it('marks an adapter failure unknown without resubmitting', async () => {
    let attempts = 0;
    const { service, runNext } = fixture(async (_caseId, lifecycle) => {
      attempts += 1;
      lifecycle.onSubmitting();
      lifecycle.onSubmitted('tx-uncertain');
      throw new Error('connection lost after submit');
    });
    const accepted = await service.start(request('request-unknown'));
    await runNext();
    expect(service.get(accepted.operationId).phase).toBe('unknown');
    expect((await service.start(request('request-unknown'))).operationId).toBe(accepted.operationId);
    expect(attempts).toBe(1);
  });

  it('marks a proof failure as an unsubmitted error', async () => {
    const { service, runNext } = fixture(async () => {
      throw new Error('proof server unavailable');
    });
    const accepted = await service.start(request('request-proof-error'));
    await runNext();
    expect(service.get(accepted.operationId)).toMatchObject({
      phase: 'error',
      transactionId: null,
    });
  });

  it('recovers an interrupted operation as unknown on restart', () => {
    const directory = makeTemporaryDirectory();
    const storeFile = join(directory, 'operations.json');
    const store = new OperationStore(storeFile);
    store.create({
      operationId: 'interrupted-operation',
      requestId: 'request-interrupted',
      caseId: 'round-1-pass',
      fingerprint: 'fingerprint',
      phase: 'submitting',
      submittedRound: 1,
      transactionId: null,
      code: null,
      message: null,
      state: null,
      updatedAt: new Date().toISOString(),
    });

    const recovered = new OperationStore(storeFile).get('interrupted-operation');
    expect(recovered?.phase).toBe('unknown');
  });

  it('resolves an unknown submitted transaction from the public ledger without resubmitting', async () => {
    const directory = makeTemporaryDirectory();
    const storeFile = join(directory, 'operations.json');
    const original = new OperationStore(storeFile);
    original.create({
      operationId: 'submitted-operation',
      requestId: 'request-submitted',
      caseId: 'round-1-pass',
      fingerprint: 'fingerprint',
      phase: 'confirming',
      submittedRound: 1,
      transactionId: 'tx-submitted',
      code: null,
      message: null,
      state: null,
      updatedAt: new Date().toISOString(),
    });
    let executions = 0;
    const recovered = new VerificationService(
      new OperationStore(storeFile),
      () => ledger(),
      async () => {
        executions += 1;
        return approved();
      },
    );

    expect(await recovered.recoverUnknown()).toBe(1);
    expect(recovered.get('submitted-operation')).toMatchObject({
      phase: 'confirmed',
      transactionId: 'tx-submitted',
      state: { approvedRound: 1 },
    });
    expect(executions).toBe(0);
  });

  it('returns a typed error for a missing operation', () => {
    const { service } = fixture(async () => approved());
    expect(() => service.get('missing')).toThrowError(VerificationServiceError);
  });
});

function fixture(executor: VerificationExecutor, state: Partial<LedgerState> = {}) {
  const directory = makeTemporaryDirectory();
  const storeFile = join(directory, 'operations.json');
  const scheduled: Array<() => void> = [];
  const service = new VerificationService(
    new OperationStore(storeFile),
    () => ({ ...ledger(), ...state }),
    executor,
    (task) => scheduled.push(task),
  );
  return {
    service,
    storeFile,
    runNext: async () => {
      const task = scheduled.shift();
      if (!task) throw new Error('No scheduled operation.');
      task();
      await new Promise((resolve) => setTimeout(resolve, 0));
    },
  };
}

function makeTemporaryDirectory() {
  const directory = mkdtempSync(join(tmpdir(), 'covenant-operations-'));
  temporaryDirectories.push(directory);
  return directory;
}

function request(requestId: string) {
  return { requestId, caseId: 'round-1-pass' as const, expectedRound: 1 };
}

function approved(): VerifyResponse {
  return { ok: true, transactionId: 'tx-approved', state: ledger() };
}

function ledger(): LedgerState {
  return {
    mode: 'demo',
    currentRound: 1,
    approvedRound: 1,
    snapshotCommitment: 'public-commitment',
    contractAddress: 'contract-address',
    network: 'local',
    lastTransactionId: 'tx-approved',
    updatedAt: new Date().toISOString(),
  };
}
