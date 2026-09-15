import type { Metadata } from 'next';
import { HomeHero } from '@/components/HomeHero';

export const metadata: Metadata = {
  title: 'Covenant Watch · 금융약정 검증 서비스',
  description: '기업과 금융기관이 실제 금액을 공개하지 않고 금융약정 충족 여부를 확인하는 서비스입니다.',
};

export default function HomePage() {
  return <HomeHero />;
}
