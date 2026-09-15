import type { Metadata } from 'next';
import { CovenantDashboard } from '@/components/CovenantDashboard';

export const metadata: Metadata = {
  title: '약정 확인 요청 · Covenant Watch',
  description: '원금액을 공개하지 않고 현재 기간의 금융약정 충족 여부를 확인합니다.',
};

export default function RequestPage() {
  return <CovenantDashboard view="company" />;
}
