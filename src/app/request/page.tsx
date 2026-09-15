import type { Metadata } from 'next';
import { CovenantDashboard } from '@/components/CovenantDashboard';

export const metadata: Metadata = {
  title: '약정 검증 안내 · Covenant Watch',
  description: '약정 검증 과정과 공개되는 정보를 확인합니다.',
};

export default function RequestPage() {
  return <CovenantDashboard view="company" requestStep="intro" />;
}
