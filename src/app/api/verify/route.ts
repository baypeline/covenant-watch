import { NextResponse } from 'next/server';
import { covenantErrorCodes, type StartVerifyRequest } from '@/types/covenant';
import {
  isCaseId,
  VerificationServiceError,
} from '@/lib/server/verification-service';
import { getVerificationService } from '@/lib/server/verification-runtime';

export function POST(request: Request) {
  return handlePost(request);
}

export async function GET(request: Request) {
  const requestId = new URL(request.url).searchParams.get('requestId');
  if (!requestId || requestId.length < 8 || requestId.length > 128) {
    return NextResponse.json({ ok: false, code: 'INVALID_REQUEST', message: 'requestId를 확인해 주세요.' }, { status: 400 });
  }
  try {
    return NextResponse.json((await getVerificationService()).getByRequestId(requestId), {
      headers: { 'cache-control': 'no-store' },
    });
  } catch (error) {
    if (error instanceof VerificationServiceError && error.code === 'OPERATION_NOT_FOUND') {
      return NextResponse.json({ ok: false, code: error.code, message: error.message }, { status: 404 });
    }
    return NextResponse.json({ ok: false, code: 'INTERNAL_ERROR', message: '검증 작업을 조회하지 못했습니다.' }, { status: 503 });
  }
}

async function handlePost(request: Request) {
  const body = await request.json().catch(() => null) as Partial<StartVerifyRequest> | null;
  if (
    !body
    || !isCaseId(body.caseId)
    || typeof body.requestId !== 'string'
    || body.requestId.length < 8
    || body.requestId.length > 128
    || !Number.isSafeInteger(body.expectedRound)
    || (body.expectedRound ?? 0) < 1
  ) {
    return NextResponse.json({ ok: false, code: 'INVALID_REQUEST', message: 'caseId, requestId, expectedRound를 확인해 주세요.' }, { status: 400 });
  }

  try {
    const service = await getVerificationService();
    const response = await service.start(body as StartVerifyRequest);
    return NextResponse.json(response, {
      status: 202,
      headers: { 'x-covenant-error-codes': covenantErrorCodes.join(',') },
    });
  } catch (error) {
    if (error instanceof VerificationServiceError) {
      const status = error.code === 'OPERATION_NOT_FOUND' ? 404 : 409;
      return NextResponse.json({ ok: false, code: error.code, message: error.message }, { status });
    }
    return NextResponse.json({ ok: false, code: 'INTERNAL_ERROR', message: '검증 작업을 접수하지 못했습니다.' }, { status: 503 });
  }
}
