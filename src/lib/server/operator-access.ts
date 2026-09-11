import { timingSafeEqual } from 'node:crypto';

export type OperatorAccessResult =
  | { ok: true }
  | { ok: false; status: 401 | 404; code: 'OPERATOR_HTTP_DISABLED' | 'UNAUTHORIZED' };

export function checkOperatorAccess(request: Request): OperatorAccessResult {
  if (process.env.COVENANT_ENABLE_OPERATOR_HTTP !== 'true') {
    return { ok: false, status: 404, code: 'OPERATOR_HTTP_DISABLED' };
  }
  const expected = process.env.COVENANT_OPERATOR_TOKEN;
  if (!expected) return { ok: true };
  const supplied = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ?? '';
  const expectedBytes = Buffer.from(expected);
  const suppliedBytes = Buffer.from(supplied);
  if (expectedBytes.length !== suppliedBytes.length || !timingSafeEqual(expectedBytes, suppliedBytes)) {
    return { ok: false, status: 401, code: 'UNAUTHORIZED' };
  }
  return { ok: true };
}
