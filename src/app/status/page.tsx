import type { Metadata } from 'next';
import { CovenantDashboard } from '@/components/CovenantDashboard';

export const metadata: Metadata = {
  title: '약정 현황 · Covenant Watch',
  description: '공개 원장에 확정된 현재 기간의 금융약정 상태를 확인합니다.',
};

export default function StatusPage() {
  return <CovenantDashboard view="bank" />;
}
