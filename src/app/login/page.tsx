import type { Metadata } from 'next';
import { DemoLogin } from '@/components/DemoLogin';
import { safeRedirectPath } from '@/lib/server/demo-auth';

export const metadata: Metadata = {
  title: '로그인 · Covenant Watch',
  description: 'Covenant Watch 데모 계정으로 로그인합니다.',
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string | string[] }>;
}) {
  const params = await searchParams;
  const next = Array.isArray(params.next) ? params.next[0] : params.next;
  return <DemoLogin nextPath={safeRedirectPath(next)} />;
}
