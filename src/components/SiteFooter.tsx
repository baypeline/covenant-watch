'use client';

import styled from '@emotion/styled';
import Link from 'next/link';

export function SiteFooter() {
  return (
    <Footer>
      <FooterInner>
        <Identity>
          <Brand href="/">Covenant Watch</Brand>
          <Tagline>금액은 숨기고, 결과만 확인합니다.</Tagline>
          <Copyright>© 2026 MvM. All rights reserved.</Copyright>
        </Identity>
        <FooterNavigation aria-label="하단 메뉴">
          <FooterLink href="/request">검증 요청</FooterLink>
          <FooterLink href="/status">결과 확인</FooterLink>
        </FooterNavigation>
      </FooterInner>
    </Footer>
  );
}

const Footer = styled.footer`background:var(--color-chrome);`;
const FooterInner = styled.div`width:min(1120px,calc(100% - 40px));min-height:104px;margin:0 auto;display:flex;align-items:center;justify-content:space-between;gap:32px;@media(max-width:560px){min-height:auto;padding:24px 0;align-items:flex-start;flex-direction:column;gap:18px;}`;
const Identity = styled.div`display:grid;gap:5px;`;
const Brand = styled(Link)`width:fit-content;color:var(--color-text-primary);font-size:13px;font-weight:720;letter-spacing:-.02em;`;
const Tagline = styled.p`color:var(--color-text-secondary);font-size:11px;`;
const Copyright = styled.p`margin-top:3px;color:var(--color-text-secondary);font-size:10px;opacity:.78;`;
const FooterNavigation = styled.nav`display:flex;align-items:center;gap:22px;`;
const FooterLink = styled(Link)`color:var(--color-text-secondary);font-size:12px;font-weight:560;&:hover{color:var(--color-text-primary);}`;
