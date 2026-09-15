import type { Metadata } from 'next';
import { HomeHero } from '@/components/HomeHero';

export const metadata: Metadata = {
  title: 'Covenant Watch · 금액 없는 약정 검증',
  description: '실제 금액을 공개하지 않고 금융약정 충족 여부만 확인합니다.',
};

export default function HomePage() {
  return <HomeHero />;
}
