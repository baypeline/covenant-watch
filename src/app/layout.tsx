import type { Metadata } from 'next';
import Script from 'next/script';
import type { ReactNode } from 'react';
import { AppProviders } from '@/components/AppProviders';

export const metadata: Metadata = {
  title: 'Covenant Watch',
  description: '잔액을 공개하지 않는 금융약정 검증 데모',
};

const themeScript = `try{const t=localStorage.getItem('covenant-watch:theme');if(t==='light'||t==='dark')document.documentElement.dataset.theme=t}catch{}`;

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="ko" suppressHydrationWarning>
      <body>
        <Script id="theme-initializer" strategy="beforeInteractive">{themeScript}</Script>
        <AppProviders>{children}</AppProviders>
      </body>
    </html>
  );
}
