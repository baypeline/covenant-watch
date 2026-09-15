import type { Metadata } from 'next';
import { CovenantDashboard } from '@/components/CovenantDashboard';

export const metadata: Metadata = {
  title: '약정 검증 요청 확인 · Covenant Watch',
  description: '선택한 자료와 공개 범위를 확인하고 약정 검증을 요청합니다.',
};

export default function RequestReviewPage() {
  return <CovenantDashboard view="company" requestStep="review" />;
}
