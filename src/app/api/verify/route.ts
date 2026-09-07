import { NextResponse } from 'next/server';
import { covenantErrorCodes, cases, type CaseId } from '@/types/covenant';
import { verifyDemoCase } from '@/lib/server/demo-ledger';

export async function POST(request: Request) {
  const body = await request.json().catch(() => null) as { caseId?: string } | null;
  if (!body?.caseId || !(body.caseId in cases)) {
    return NextResponse.json({ ok: false, code: 'BAD_REQUEST', message: '지원하지 않는 데모 자료입니다.' }, { status: 400 });
  }

  const response = verifyDemoCase(body.caseId as CaseId);
  return NextResponse.json(response, {
    // A covenant rejection is a valid domain response, not an HTTP failure.
    status: 200,
    headers: { 'x-covenant-error-codes': covenantErrorCodes.join(',') },
  });
}
