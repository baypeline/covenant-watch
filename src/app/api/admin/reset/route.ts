import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { getCovenantAdapter } from '@/lib/server/adapter-runtime';
import { DEMO_SESSION_COOKIE, isDemoSession } from '@/lib/server/demo-auth';
import { checkOperatorAccess } from '@/lib/server/operator-access';
import { getVerificationService } from '@/lib/server/verification-runtime';
import { VerificationServiceError } from '@/lib/server/verification-service';

export async function POST(request: Request) {
  const cookieStore = await cookies();
  const authenticated = isDemoSession(cookieStore.get(DEMO_SESSION_COOKIE)?.value);
  const operatorAccess = checkOperatorAccess(request);
  if (!authenticated && !operatorAccess.ok) {
    return NextResponse.json({ ok: false, code: 'AUTH_REQUIRED', message: '로그인이 필요합니다.' }, { status: 401 });
  }
  try {
    (await getVerificationService()).assertIdle();
    const adapter = await getCovenantAdapter();
    return NextResponse.json({ ok: true, state: await adapter.reset() });
  } catch (error) {
    if (error instanceof VerificationServiceError && error.code === 'BUSY') {
      return NextResponse.json({ ok: false, code: error.code, message: error.message }, { status: 409 });
    }
    return NextResponse.json({ ok: false, code: 'INTERNAL_ERROR', message: '새 데모를 준비하지 못했습니다.' }, { status: 503 });
  }
}
