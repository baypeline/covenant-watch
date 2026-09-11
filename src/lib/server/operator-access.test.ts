import { afterEach, describe, expect, it } from 'vitest';
import { checkOperatorAccess } from './operator-access';

const previousEnabled = process.env.COVENANT_ENABLE_OPERATOR_HTTP;
const previousToken = process.env.COVENANT_OPERATOR_TOKEN;

afterEach(() => {
  restore('COVENANT_ENABLE_OPERATOR_HTTP', previousEnabled);
  restore('COVENANT_OPERATOR_TOKEN', previousToken);
});

describe('operator access', () => {
  it('hides operator routes by default', () => {
    delete process.env.COVENANT_ENABLE_OPERATOR_HTTP;
    expect(checkOperatorAccess(request())).toEqual({ ok: false, status: 404, code: 'OPERATOR_HTTP_DISABLED' });
  });

  it('requires the configured bearer token', () => {
    process.env.COVENANT_ENABLE_OPERATOR_HTTP = 'true';
    process.env.COVENANT_OPERATOR_TOKEN = 'operator-secret';
    expect(checkOperatorAccess(request())).toMatchObject({ ok: false, status: 401 });
    expect(checkOperatorAccess(request('operator-secret'))).toEqual({ ok: true });
  });
});

function request(token?: string) {
  return new Request('http://localhost/api/admin/reset', {
    headers: token ? { authorization: `Bearer ${token}` } : undefined,
  });
}

function restore(name: string, value: string | undefined) {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}
