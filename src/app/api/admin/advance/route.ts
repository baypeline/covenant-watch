import { NextResponse } from 'next/server';
import { getCovenantAdapter } from '@/lib/server/adapter-runtime';

export async function POST() {
  try {
    const adapter = await getCovenantAdapter();
    return NextResponse.json({ ok: true, state: await adapter.advance() });
  } catch {
    return NextResponse.json({ ok: false, code: 'INTERNAL_ERROR', message: '새 기간을 원장에 등록하지 못했습니다.' }, { status: 503 });
  }
}
