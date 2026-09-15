'use client';

import styled from '@emotion/styled';
import { keyframes } from '@emotion/react';
import Link from 'next/link';
import { SiteFooter } from '@/components/SiteFooter';
import { SiteHeader } from '@/components/SiteHeader';

export function HomeHero() {
  return (
    <Page>
      <SiteHeader />

      <Main>
        <Hero>
          <Title><TitleContext>기업과 금융기관을 위한</TitleContext><TitlePrimary>금융약정 검증 서비스</TitlePrimary></Title>
          <CorePromise>금액을 보여주지 않고, 약속을 지켰는지만 증명합니다.</CorePromise>
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
      <SiteFooter />
    </Page>
  );
}

const Page = styled.div`min-height:100vh;display:flex;flex-direction:column;background:var(--color-canvas);`;
const Main = styled.main`width:min(1120px,calc(100% - 40px));margin:0 auto;padding:0 0 72px;flex:1;`;
const Hero = styled.section`max-width:850px;min-height:clamp(560px,72vh,720px);display:grid;align-content:center;@media(max-width:540px){min-height:580px;}`;
const heroEntrance = keyframes`
  from { opacity: 0; transform: translateY(16px); }
  to { opacity: 1; transform: translateY(0); }
`;
const Title = styled.h1`display:grid;gap:7px;word-break:keep-all;animation:${heroEntrance} 800ms cubic-bezier(.22,1,.36,1) both;@media(prefers-reduced-motion:reduce){animation:none;}`;
const TitleContext = styled.span`color:var(--color-text-secondary);font-size:clamp(23px,3.2vw,32px);font-weight:620;line-height:1.25;letter-spacing:-.045em;`;
const TitlePrimary = styled.span`color:var(--color-text-primary);font-size:clamp(44px,6.2vw,68px);font-weight:760;line-height:1.08;letter-spacing:-.064em;`;
const CorePromise = styled.p`margin-top:26px;color:var(--color-action);font-size:clamp(18px,2.2vw,22px);font-weight:680;line-height:1.5;letter-spacing:-.03em;word-break:keep-all;animation:${heroEntrance} 800ms 220ms cubic-bezier(.22,1,.36,1) both;@media(prefers-reduced-motion:reduce){animation:none;}`;
const Actions = styled.div`display:flex;align-items:center;gap:10px;margin-top:32px;animation:${heroEntrance} 800ms 440ms cubic-bezier(.22,1,.36,1) both;@media(max-width:430px){align-items:stretch;flex-direction:column;}@media(prefers-reduced-motion:reduce){animation:none;}`;
const PrimaryAction = styled(Link)`min-height:48px;padding:0 20px;display:inline-flex;align-items:center;justify-content:center;border-radius:5px;color:var(--color-on-action);background:var(--color-action);font-size:14px;font-weight:720;&:hover{background:var(--color-action-hover);}`;
const SecondaryAction = styled(Link)`min-height:48px;padding:0 18px;display:inline-flex;align-items:center;justify-content:center;border:1px solid var(--color-border-strong);border-radius:5px;color:var(--color-text-primary);background:transparent;font-size:14px;font-weight:650;&:hover{border-color:var(--color-action);color:var(--color-action);}`;
const sourceSequence = keyframes`
  0%, 8% { opacity: .42; transform: translateY(5px); }
  16%, 84% { opacity: 1; transform: translateY(0); }
  96%, 100% { opacity: .42; transform: translateY(5px); }
`;
const verificationSequence = keyframes`
  0%, 20% { opacity: .36; }
  32%, 86% { opacity: 1; }
  96%, 100% { opacity: .36; }
`;
const lineSequence = keyframes`
  0%, 24% { transform: scaleX(0); }
  46%, 88% { transform: scaleX(1); }
  100% { transform: scaleX(0); }
`;
const lineSequenceVertical = keyframes`
  0%, 24% { transform: scaleY(0); }
  46%, 88% { transform: scaleY(1); }
  100% { transform: scaleY(0); }
`;
const resultSequence = keyframes`
  0%, 48% { opacity: .25; transform: translateX(-8px); }
  62%, 88% { opacity: 1; transform: translateX(0); }
  100% { opacity: .25; transform: translateX(-8px); }
`;
const resultSequenceMobile = keyframes`
  0%, 48% { opacity: .25; transform: translateY(-6px); }
  62%, 88% { opacity: 1; transform: translateY(0); }
  100% { opacity: .25; transform: translateY(-6px); }
`;
const resultStateSequence = keyframes`
  0%, 56% { color: var(--color-text-secondary); }
  68%, 90% { color: var(--color-success); }
  100% { color: var(--color-text-secondary); }
`;
const HowItWorks = styled.section`border-top:1px solid var(--color-border-strong);border-bottom:1px solid var(--color-border);`;
const SectionLabel = styled.h2`padding:14px 0;border-bottom:1px solid var(--color-border);color:var(--color-text-secondary);font-size:11px;font-weight:680;`;
const ProofFlow = styled.div`display:grid;grid-template-columns:minmax(220px,1fr) minmax(280px,1.25fr) minmax(200px,.85fr);min-height:220px;@media(max-width:800px){grid-template-columns:1fr;}`;
const FlowLabel = styled.div`color:var(--color-text-secondary);font-size:11px;font-weight:650;`;
const PrivateRecord = styled.div`padding:28px 28px 26px 0;display:grid;align-content:start;gap:0;animation:${sourceSequence} 7s ease-in-out infinite;@media(max-width:800px){padding:24px 0;border-bottom:1px solid var(--color-border);}@media(prefers-reduced-motion:reduce){animation:none;opacity:1;transform:none;}`;
const PrivateRow = styled.div`display:flex;align-items:center;justify-content:space-between;gap:20px;padding:13px 0;border-bottom:1px solid var(--color-border);color:var(--color-text-primary);font-size:12px;&:nth-of-type(2){margin-top:12px;}`;
const Redacted = styled.span`overflow:hidden;color:var(--color-text-primary);font:11px/1 ui-monospace,SFMono-Regular,monospace;letter-spacing:1px;opacity:.72;white-space:nowrap;user-select:none;`;
const VerificationStep = styled.div`padding:28px;display:grid;align-content:center;gap:22px;border-right:1px solid var(--color-border);border-left:1px solid var(--color-border);>div:last-child{display:grid;gap:5px;animation:${verificationSequence} 7s ease-in-out infinite;}strong{color:var(--color-text-primary);font-size:13px;font-weight:680;}span{color:var(--color-text-secondary);font-size:11px;line-height:1.55;}@media(max-width:800px){padding:24px 0;border-right:0;border-bottom:1px solid var(--color-border);border-left:0;}@media(prefers-reduced-motion:reduce){>div:last-child{animation:none;opacity:1;}}`;
const RuleLine = styled.div`position:relative!important;height:1px;background:var(--color-border);&::before{content:'';position:absolute;inset:0;background:var(--color-action);transform:scaleX(0);transform-origin:left center;animation:${lineSequence} 7s ease-in-out infinite;}&::after{content:'';position:absolute;top:-4px;right:0;width:8px;height:8px;border-top:1px solid var(--color-action);border-right:1px solid var(--color-action);transform:rotate(45deg);}@media(max-width:800px){width:1px;height:40px;justify-self:center;&::before{transform:scaleY(0);transform-origin:center top;animation-name:${lineSequenceVertical};}&::after{top:auto;right:-4px;bottom:0;transform:rotate(135deg);}}@media(prefers-reduced-motion:reduce){&::before{animation:none;transform:none;}}`;
const PublicResult = styled.div`padding:28px 0 26px 28px;display:grid;align-content:start;animation:${resultSequence} 7s ease-in-out infinite;@media(max-width:800px){padding:24px 0;animation-name:${resultSequenceMobile};}@media(prefers-reduced-motion:reduce){animation:none;opacity:1;transform:none;}`;
const ResultPeriod = styled.div`margin-top:28px;color:var(--color-text-secondary);font-size:12px;`;
const ResultState = styled.strong`margin-top:5px;color:var(--color-success);font-size:28px;font-weight:720;letter-spacing:-.045em;animation:${resultStateSequence} 7s ease-in-out infinite;@media(prefers-reduced-motion:reduce){animation:none;color:var(--color-success);}`;
