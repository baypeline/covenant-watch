import { NextResponse } from 'next/server';
import { getCovenantAdapter } from '@/lib/server/adapter-runtime';

export async function POST() {
  try {
    const adapter = await getCovenantAdapter();
    return NextResponse.json({ ok: true, state: await adapter.reset() });
  } catch {
    return NextResponse.json({ ok: false, code: 'INTERNAL_ERROR', message: '초기 원장을 배포하지 못했습니다.' }, { status: 503 });
  }
}
