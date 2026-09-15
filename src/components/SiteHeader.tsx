'use client';

import styled from '@emotion/styled';
import { Moon, Sun } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';

export function SiteHeader() {
  const pathname = usePathname();
  const requestActive = pathname.startsWith('/request');
  const statusActive = pathname.startsWith('/status');
  const loginActive = pathname.startsWith('/login');
  const [authenticated, setAuthenticated] = useState<boolean | null>(requestActive || statusActive ? true : null);

  useEffect(() => {
    let active = true;
    void fetch('/api/auth/session', { cache: 'no-store' })
      .then((response) => response.json())
      .then((payload: { authenticated?: boolean }) => {
        if (active) setAuthenticated(payload.authenticated === true);
      })
      .catch(() => {
        if (active) setAuthenticated(false);
      });
    return () => { active = false; };
  }, [pathname]);

  return (
    <Header>
      <HeaderInner>
        <Brand href="/" aria-label="Covenant Watch 홈">Covenant Watch</Brand>
        <Navigation aria-label="주요 메뉴">
          <NavigationLink href="/request" aria-current={requestActive ? 'page' : undefined}>검증 요청</NavigationLink>
          <NavigationLink href="/status" aria-current={statusActive ? 'page' : undefined}>결과 확인</NavigationLink>
        </Navigation>
        <HeaderActions>
          <SessionSlot>
            {authenticated === true ? (
              <LogoutForm action="/api/auth/logout" method="post"><SessionButton type="submit">로그아웃</SessionButton></LogoutForm>
            ) : authenticated === false && !loginActive ? (
              <SessionLink href="/login">로그인</SessionLink>
            ) : null}
          </SessionSlot>
          <ThemeToggle />
        </HeaderActions>
      </HeaderInner>
    </Header>
  );
}

function ThemeToggle() {
  const [theme, setTheme] = useState<'light' | 'dark' | null>(null);

  useEffect(() => {
    const explicit = document.documentElement.dataset.theme;
    setTheme(explicit === 'light' || explicit === 'dark' ? explicit : window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
  }, []);

  function toggleTheme() {
    const next = theme === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = next;
    localStorage.setItem('covenant-watch:theme', next);
    setTheme(next);
  }

  return <ThemeButton type="button" onClick={toggleTheme} aria-label={theme === 'dark' ? '라이트 모드로 전환' : '다크 모드로 전환'} title={theme === 'dark' ? '라이트 모드' : '다크 모드'}>{theme === 'dark' ? <Sun size={17} /> : <Moon size={17} />}</ThemeButton>;
}

const Header = styled.header`background:var(--color-chrome);`;
const HeaderInner = styled.div`width:min(1120px,calc(100% - 40px));min-height:58px;margin:0 auto;display:grid;grid-template-columns:1fr auto 1fr;align-items:center;gap:24px;@media(max-width:680px){grid-template-columns:1fr auto;}`;
const Brand = styled(Link)`width:fit-content;color:var(--color-text-primary);font-size:14px;font-weight:720;letter-spacing:-.025em;`;
const Navigation = styled.nav`height:58px;display:flex;align-items:stretch;gap:26px;@media(max-width:680px){display:none;}`;
const NavigationLink = styled(Link)`position:relative;display:flex;align-items:center;color:var(--color-text-secondary);font-size:13px;font-weight:560;&::after{content:'';position:absolute;right:0;bottom:-1px;left:0;height:2px;background:transparent;}&[aria-current='page']{color:var(--color-text-primary);font-weight:680;}&[aria-current='page']::after{background:var(--color-action);}&:hover{color:var(--color-text-primary);}`;
const HeaderActions = styled.div`display:flex;align-items:center;justify-self:end;gap:10px;`;
const SessionSlot = styled.div`min-width:46px;display:flex;justify-content:flex-end;`;
const LogoutForm = styled.form`display:flex;`;
const SessionLink = styled(Link)`padding:7px 2px;color:var(--color-text-secondary);font-size:12px;font-weight:620;&:hover{color:var(--color-text-primary);}`;
const SessionButton = styled.button`padding:7px 2px;border:0;color:var(--color-text-secondary);background:transparent;font-size:12px;font-weight:620;cursor:pointer;&:hover{color:var(--color-text-primary);}`;
const ThemeButton = styled.button`width:34px;height:34px;display:grid;place-items:center;border:0;border-radius:4px;color:var(--color-text-secondary);background:transparent;cursor:pointer;&:hover{color:var(--color-text-primary);background:var(--color-surface-muted);}`;
