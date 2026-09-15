'use client';

import styled from '@emotion/styled';
import Link from 'next/link';
import { SiteHeader } from '@/components/SiteHeader';

export function HomeHero() {
  return (
    <Page>
      <SiteHeader />

      <Main>
        <Hero>
          <Title>금액을 보여주지 않고,<br />약속을 지켰는지만 증명합니다.</Title>
          <Description>
            회사는 실제 재무 금액을 공개하지 않고 검증을 요청합니다.<br />
            금융기관은 약정 기준을 충족했는지 결과만 확인합니다.
          </Description>
          <Actions>
            <PrimaryAction href="/request">검증 요청 시작</PrimaryAction>
            <SecondaryAction href="/status">검증 결과 확인</SecondaryAction>
          </Actions>
        </Hero>

        <HowItWorks aria-labelledby="how-it-works-title">
          <SectionLabel id="how-it-works-title">작동 방식</SectionLabel>
          <ProofFlow>
            <PrivateRecord>
              <FlowLabel>회사 내부 자료</FlowLabel>
              <PrivateRow><span>보유 현금</span><Redacted aria-label="비공개">██████</Redacted></PrivateRow>
              <PrivateRow><span>지급예정액</span><Redacted aria-label="비공개">██████</Redacted></PrivateRow>
            </PrivateRecord>

            <VerificationStep>
              <RuleLine aria-hidden="true" />
              <div><strong>금액 없이 조건만 확인</strong><span>실제 수치는 회사 밖으로 나가지 않습니다.</span></div>
            </VerificationStep>

            <PublicResult>
              <FlowLabel>금융기관 확인 결과</FlowLabel>
              <ResultPeriod>1기 약정</ResultPeriod>
              <ResultState>기준 충족</ResultState>
            </PublicResult>
          </ProofFlow>
        </HowItWorks>
      </Main>
    </Page>
  );
}

const Page = styled.div`min-height:100vh;background:var(--color-canvas);`;
const Main = styled.main`width:min(1120px,calc(100% - 40px));margin:0 auto;padding:clamp(72px,10vw,124px) 0 48px;`;
const Hero = styled.section`max-width:850px;`;
const Title = styled.h1`color:var(--color-text-primary);font-size:clamp(40px,5.8vw,64px);font-weight:720;line-height:1.12;letter-spacing:-.058em;word-break:keep-all;@media(max-width:540px){font-size:38px;br{display:none;}}`;
const Description = styled.p`margin-top:28px;color:var(--color-text-secondary);font-size:clamp(15px,1.8vw,18px);line-height:1.75;letter-spacing:-.02em;word-break:keep-all;@media(max-width:540px){br{display:none;}}`;
const Actions = styled.div`display:flex;align-items:center;gap:10px;margin-top:34px;@media(max-width:430px){align-items:stretch;flex-direction:column;}`;
const PrimaryAction = styled(Link)`min-height:48px;padding:0 20px;display:inline-flex;align-items:center;justify-content:center;border-radius:5px;color:var(--color-on-action);background:var(--color-action);font-size:14px;font-weight:720;&:hover{background:var(--color-action-hover);}`;
const SecondaryAction = styled(Link)`min-height:48px;padding:0 18px;display:inline-flex;align-items:center;justify-content:center;border:1px solid var(--color-border-strong);border-radius:5px;color:var(--color-text-primary);background:transparent;font-size:14px;font-weight:650;&:hover{border-color:var(--color-action);color:var(--color-action);}`;
const HowItWorks = styled.section`margin-top:clamp(76px,11vw,132px);border-top:1px solid var(--color-border-strong);border-bottom:1px solid var(--color-border);`;
const SectionLabel = styled.h2`padding:14px 0;border-bottom:1px solid var(--color-border);color:var(--color-text-secondary);font-size:11px;font-weight:680;`;
const ProofFlow = styled.div`display:grid;grid-template-columns:minmax(220px,1fr) minmax(280px,1.25fr) minmax(200px,.85fr);min-height:220px;@media(max-width:800px){grid-template-columns:1fr;}`;
const FlowLabel = styled.div`color:var(--color-text-secondary);font-size:11px;font-weight:650;`;
const PrivateRecord = styled.div`padding:28px 28px 26px 0;display:grid;align-content:start;gap:0;@media(max-width:800px){padding:24px 0;border-bottom:1px solid var(--color-border);}`;
const PrivateRow = styled.div`display:flex;align-items:center;justify-content:space-between;gap:20px;padding:13px 0;border-bottom:1px solid var(--color-border);color:var(--color-text-primary);font-size:12px;&:nth-of-type(2){margin-top:12px;}`;
const Redacted = styled.span`overflow:hidden;color:var(--color-text-primary);font:11px/1 ui-monospace,SFMono-Regular,monospace;letter-spacing:1px;opacity:.72;white-space:nowrap;user-select:none;`;
const VerificationStep = styled.div`padding:28px;display:grid;align-content:center;gap:22px;border-right:1px solid var(--color-border);border-left:1px solid var(--color-border);>div:last-child{display:grid;gap:5px;}strong{color:var(--color-text-primary);font-size:13px;font-weight:680;}span{color:var(--color-text-secondary);font-size:11px;line-height:1.55;}@media(max-width:800px){padding:24px 0;border-right:0;border-bottom:1px solid var(--color-border);border-left:0;}`;
const RuleLine = styled.div`position:relative!important;height:1px;background:var(--color-border-strong);&::after{content:'';position:absolute;top:-4px;right:0;width:8px;height:8px;border-top:1px solid var(--color-border-strong);border-right:1px solid var(--color-border-strong);transform:rotate(45deg);}`;
const PublicResult = styled.div`padding:28px 0 26px 28px;display:grid;align-content:start;@media(max-width:800px){padding:24px 0;}`;
const ResultPeriod = styled.div`margin-top:28px;color:var(--color-text-secondary);font-size:12px;`;
const ResultState = styled.strong`margin-top:5px;color:var(--color-success);font-size:28px;font-weight:720;letter-spacing:-.045em;`;
