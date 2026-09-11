import { NextResponse } from 'next/server';
import { getCovenantAdapter } from '@/lib/server/adapter-runtime';
import { getVerificationService } from '@/lib/server/verification-runtime';
import { VerificationServiceError } from '@/lib/server/verification-service';
import { checkOperatorAccess } from '@/lib/server/operator-access';

export async function POST(request: Request) {
  const access = checkOperatorAccess(request);
  if (!access.ok) {
    return NextResponse.json({ ok: false, code: access.code, message: '기간 전환은 인증된 운영 CLI에서만 실행할 수 있습니다.' }, { status: access.status });
  }
  try {
    (await getVerificationService()).assertIdle();
    const adapter = await getCovenantAdapter();
    return NextResponse.json({ ok: true, state: await adapter.advance() });
  } catch (error) {
    if (error instanceof VerificationServiceError && error.code === 'BUSY') {
      return NextResponse.json({ ok: false, code: error.code, message: error.message }, { status: 409 });
    }
    return NextResponse.json({ ok: false, code: 'INTERNAL_ERROR', message: '새 기간을 원장에 등록하지 못했습니다.' }, { status: 503 });
  }
}
