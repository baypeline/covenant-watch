import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { AppProviders } from '@/components/AppProviders';

export const metadata: Metadata = {
  title: 'Covenant Watch · Midnight',
  description: '잔액을 공개하지 않는 금융약정 검증 데모',
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="ko">
      <body>
        <AppProviders>{children}</AppProviders>
      </body>
    </html>
  );
}
