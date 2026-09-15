export const DEMO_SESSION_COOKIE = 'covenant-watch-demo-session';
export const DEMO_SESSION_VALUE = 'midnight-demo-authenticated-v1';
export const DEMO_SESSION_MAX_AGE = 60 * 60 * 24;

const DEMO_ID = 'midnight';
const DEMO_PASSWORD = '1234';

export function isDemoCredentials(id: unknown, password: unknown) {
  return id === DEMO_ID && password === DEMO_PASSWORD;
}

export function isDemoSession(value: string | undefined) {
  return value === DEMO_SESSION_VALUE;
}

export function safeRedirectPath(value: unknown, fallback = '/request') {
  if (typeof value !== 'string' || !value.startsWith('/') || value.startsWith('//')) return fallback;
  return value;
}
