import { NextResponse } from 'next/server';
import { VerificationServiceError } from '@/lib/server/verification-service';
import { getVerificationService } from '@/lib/server/verification-runtime';

export const dynamic = 'force-dynamic';

export function GET(_request: Request, context: { params: Promise<{ operationId: string }> }) {
  return handleGet(context);
}

async function handleGet(context: { params: Promise<{ operationId: string }> }) {
  const { operationId } = await context.params;
  try {
    return NextResponse.json(getVerificationService().get(operationId), {
      headers: { 'cache-control': 'no-store' },
    });
  } catch (error) {
    if (error instanceof VerificationServiceError && error.code === 'OPERATION_NOT_FOUND') {
      return NextResponse.json({ ok: false, code: error.code, message: error.message }, { status: 404 });
    }
    return NextResponse.json({ ok: false, code: 'INTERNAL_ERROR', message: '검증 작업을 조회하지 못했습니다.' }, { status: 503 });
  }
}
