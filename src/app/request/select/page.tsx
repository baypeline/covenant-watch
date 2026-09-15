import type { Metadata } from 'next';
import { CovenantDashboard } from '@/components/CovenantDashboard';

export const metadata: Metadata = {
  title: '검증 자료 선택 · Covenant Watch',
  description: '현재 기간의 약정 검증에 사용할 재무 자료를 선택합니다.',
};

export default function RequestSelectPage() {
  return <CovenantDashboard view="company" requestStep="select" />;
}
