import { describe, expect, it } from 'vitest';
import { DEMO_SESSION_VALUE, isDemoCredentials, isDemoSession, safeRedirectPath } from './demo-auth';

describe('demo auth', () => {
  it('accepts only the configured demo credentials', () => {
    expect(isDemoCredentials('midnight', '1234')).toBe(true);
    expect(isDemoCredentials('midnight', 'wrong')).toBe(false);
    expect(isDemoCredentials('other', '1234')).toBe(false);
  });

  it('recognizes only the demo session value', () => {
    expect(isDemoSession(DEMO_SESSION_VALUE)).toBe(true);
    expect(isDemoSession('forged')).toBe(false);
    expect(isDemoSession(undefined)).toBe(false);
  });

  it('allows only local redirect paths', () => {
    expect(safeRedirectPath('/status?round=1')).toBe('/status?round=1');
    expect(safeRedirectPath('https://example.com')).toBe('/request');
    expect(safeRedirectPath('//example.com')).toBe('/request');
  });
});
