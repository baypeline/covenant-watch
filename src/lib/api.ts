import type {
  AdvanceResponse,
  ApiError,
  CaseId,
  LedgerState,
  PublicStateResponse,
  StartVerifyResponse,
  VerificationOperation,
} from '@/types/covenant';

export async function getLedgerState(): Promise<LedgerState & { operatorActionsEnabled: boolean }> {
  const response = await request<PublicStateResponse>('/api/state');
  return {
    ...response.state,
    mode: response.mode,
    network: response.network,
    contractAddress: response.contractAddress,
    updatedAt: response.fetchedAt,
    operatorActionsEnabled: response.operatorActionsEnabled,
  };
}

export async function startVerification(
  caseId: CaseId,
  expectedRound: number,
  requestId = crypto.randomUUID(),
): Promise<StartVerifyResponse> {
  return request<StartVerifyResponse>('/api/verify', {
    method: 'POST',
    body: JSON.stringify({ caseId, expectedRound, requestId }),
  });
}

export async function watchVerification(
  operationId: string,
  onUpdate?: (operation: VerificationOperation) => void,
): Promise<VerificationOperation> {
  const deadline = Date.now() + 10 * 60_000;
  while (Date.now() < deadline) {
    const operation = await getVerification(operationId);
    onUpdate?.(operation);
    if (['confirmed', 'rejected', 'unknown'].includes(operation.phase)) return operation;
    await new Promise((resolve) => setTimeout(resolve, 750));
  }
  throw new Error('검증 작업 확인 시간이 초과되었습니다. operationId로 다시 조회해 주세요.');
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
