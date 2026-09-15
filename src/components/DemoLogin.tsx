'use client';

import styled from '@emotion/styled';
import type { FormEvent } from 'react';
import { useState } from 'react';
import { SiteFooter } from '@/components/SiteFooter';
import { SiteHeader } from '@/components/SiteHeader';

interface LoginResponse {
  ok: boolean;
  message?: string;
  redirectTo?: string;
}

export function DemoLogin({ nextPath }: { nextPath: string }) {
  const [id, setId] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ id, password, next: nextPath }),
      });
      const payload = await response.json().catch(() => null) as LoginResponse | null;
      if (!response.ok || !payload?.ok || !payload.redirectTo) {
        setError(payload?.message ?? '로그인 요청을 처리하지 못했습니다. 다시 시도하십시오.');
        return;
      }
      window.location.assign(payload.redirectTo);
    } catch {
      setError('서버에 연결하지 못했습니다. 연결 상태를 확인한 뒤 다시 시도하십시오.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Page>
      <SiteHeader />
      <Main>
        <LoginSection aria-labelledby="login-title">
          <LoginHeader>
            <Title id="login-title">Covenant Watch에 로그인</Title>
            <Description>금융약정 검증을 계속하려면 데모 계정 정보를 입력하십시오.</Description>
          </LoginHeader>
          <Form onSubmit={submit}>
            <Field>
              <Label htmlFor="demo-id">아이디</Label>
              <Input
                id="demo-id"
                name="id"
                type="text"
                autoComplete="username"
                autoFocus
                value={id}
                onChange={(event) => setId(event.target.value)}
                disabled={submitting}
                required
              />
            </Field>
            <Field>
              <Label htmlFor="demo-password">비밀번호</Label>
              <Input
                id="demo-password"
                name="password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                disabled={submitting}
                required
              />
            </Field>
            {error && <ErrorMessage role="alert">{error}</ErrorMessage>}
            <SubmitButton type="submit" disabled={submitting || !id || !password}>
              {submitting ? '로그인 중' : '로그인'}
            </SubmitButton>
          </Form>
          <DemoNotice>이 로그인은 데모 환경에서만 사용됩니다.</DemoNotice>
        </LoginSection>
      </Main>
      <SiteFooter />
    </Page>
  );
}

const Page = styled.div`min-height:100vh;display:flex;flex-direction:column;background:var(--color-canvas);`;
const Main = styled.main`width:min(1120px,calc(100% - 40px));margin:0 auto;padding:clamp(64px,10vh,112px) 0;display:grid;place-items:center;flex:1;`;
const LoginSection = styled.section`width:min(440px,100%);padding:34px 0 26px;border-top:1px solid var(--color-border-strong);border-bottom:1px solid var(--color-border);`;
const LoginHeader = styled.header`padding-bottom:30px;`;
const Title = styled.h1`color:var(--color-text-primary);font-size:clamp(30px,5vw,38px);font-weight:740;line-height:1.2;letter-spacing:-.052em;word-break:keep-all;`;
const Description = styled.p`margin-top:12px;color:var(--color-text-secondary);font-size:14px;line-height:1.7;word-break:keep-all;`;
const Form = styled.form`display:grid;gap:20px;`;
const Field = styled.div`display:grid;gap:8px;`;
const Label = styled.label`color:var(--color-text-primary);font-size:13px;font-weight:650;`;
const Input = styled.input`width:100%;height:50px;padding:0 14px;border:1px solid var(--color-border);border-radius:4px;color:var(--color-text-primary);background:var(--color-surface);font-size:15px;transition:border-color 120ms ease,box-shadow 120ms ease;&:hover:not(:disabled){border-color:var(--color-border-strong);}&:focus{border-color:var(--color-focus);box-shadow:0 0 0 3px var(--color-action-subtle);outline:0;}&:disabled{opacity:.55;}`;
const ErrorMessage = styled.p`padding:12px 14px;border-left:3px solid var(--color-danger);color:var(--color-danger);background:var(--color-danger-bg);font-size:13px;line-height:1.6;`;
const SubmitButton = styled.button`height:50px;margin-top:4px;border:0;border-radius:5px;color:var(--color-on-action);background:var(--color-action);font-size:14px;font-weight:720;cursor:pointer;&:hover:not(:disabled){background:var(--color-action-hover);}&:disabled{opacity:.48;cursor:not-allowed;}`;
const DemoNotice = styled.p`margin-top:20px;color:var(--color-text-secondary);font-size:11px;line-height:1.6;`;
