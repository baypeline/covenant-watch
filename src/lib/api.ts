import type {
  AdvanceResponse,
  ApiError,
  CaseId,
  LedgerState,
  VerifyResponse,
} from '@/types/covenant';

export async function getLedgerState(): Promise<LedgerState> {
  return request<LedgerState>('/api/state');
}

export async function verifyCovenant(caseId: CaseId): Promise<VerifyResponse> {
  return request<VerifyResponse>('/api/verify', {
    method: 'POST',
    body: JSON.stringify({ caseId }),
  });
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
