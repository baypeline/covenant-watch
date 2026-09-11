import type {
  AdvanceResponse,
  ApiError,
  CaseId,
  LedgerState,
  StartVerifyResponse,
  VerificationOperation,
  VerifyResponse,
} from '@/types/covenant';

export async function getLedgerState(): Promise<LedgerState> {
  return request<LedgerState>('/api/state');
}

export async function verifyCovenant(caseId: CaseId): Promise<VerifyResponse> {
  const state = await getLedgerState();
  const operation = await startVerification(caseId, state.currentRound);
  return waitForVerification(operation.operationId);
}

export async function startVerification(caseId: CaseId, expectedRound: number): Promise<StartVerifyResponse> {
  return request<StartVerifyResponse>('/api/verify', {
    method: 'POST',
    body: JSON.stringify({ caseId, expectedRound, requestId: crypto.randomUUID() }),
  });
}

export async function getVerification(operationId: string): Promise<VerificationOperation> {
  return request<VerificationOperation>(`/api/verify/${encodeURIComponent(operationId)}`);
}

export async function advanceSnapshot(): Promise<AdvanceResponse> {
  return request<AdvanceResponse>('/api/admin/advance', { method: 'POST' });
}

export async function resetDemo(): Promise<AdvanceResponse> {
  return request<AdvanceResponse>('/api/admin/reset', { method: 'POST' });
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: { 'content-type': 'application/json', ...init?.headers },
  });
  const payload = (await response.json()) as T | ApiError;
  if (!response.ok) {
    const error = payload as ApiError;
    throw new Error(error.message ?? '요청을 처리하지 못했습니다.');
  }
  return payload as T;
}

async function waitForVerification(operationId: string): Promise<VerifyResponse> {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    const operation = await getVerification(operationId);
    if (operation.phase === 'confirmed' && operation.transactionId && operation.state) {
      return { ok: true, transactionId: operation.transactionId, state: operation.state };
    }
    if (operation.phase === 'rejected' && operation.code && operation.state) {
      return { ok: false, code: operation.code, message: operation.message ?? '검증이 거절되었습니다.', state: operation.state };
    }
    if (operation.phase === 'unknown') {
      throw new Error(operation.message ?? '거래의 확정 여부를 확인할 수 없습니다.');
    }
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  throw new Error('검증 작업 확인 시간이 초과되었습니다.');
}
