'use client';

import styled from '@emotion/styled';
import { keyframes } from '@emotion/react';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { SiteFooter } from '@/components/SiteFooter';
import { SiteHeader } from '@/components/SiteHeader';

const processSteps = [
  {
    label: '자료 등록',
    title: '검증할 기간과 자료의 지문을 등록합니다',
    body: '이번에 확인할 기간을 정하고, 회사 재무자료로 만든 고유한 지문을 원장에 등록합니다. 이 지문만으로는 원래 금액을 알아낼 수 없습니다.',
  },
  {
    label: '회사 요청',
    title: '회사는 실제 금액으로 검증을 요청합니다',
    body: '회사는 보유 현금과 향후 30일 지급예정액을 선택합니다. 실제 수치는 증명을 만드는 동안에만 사용되고 공개 기록에는 포함되지 않습니다.',
  },
  {
    label: '비공개 검증',
    title: '등록된 자료와 약정 조건을 함께 검사합니다',
    body: '회사 권한, 현재 기간, 등록한 자료와의 일치 여부를 먼저 확인합니다. 이후 보유 현금이 지급예정액의 120% 이상인지 금액을 공개하지 않은 채 증명합니다.',
  },
  {
    label: '결과 기록',
    title: '금융기관에는 검증 결과만 전달됩니다',
    body: '조건을 충족하면 승인된 기간과 거래 기록이 원장에 남습니다. 충족하지 못하면 승인은 기록되지 않으며, 두 경우 모두 실제 금액은 공개되지 않습니다.',
  },
] as const;

export function HomeHero() {
  const [activeStep, setActiveStep] = useState(0);
  const stepRefs = useRef<Array<HTMLElement | null>>([]);

  useEffect(() => {
    const observer = new IntersectionObserver((entries) => {
      const visible = entries
        .filter((entry) => entry.isIntersecting)
        .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
      if (visible) setActiveStep(Number((visible.target as HTMLElement).dataset.step));
    }, { rootMargin: '-28% 0px -42%', threshold: [0, 0.25, 0.5, 0.75] });

    stepRefs.current.forEach((step) => step && observer.observe(step));
    return () => observer.disconnect();
  }, []);

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
          <ScrollPrompt href="#how-it-works">작동 방식 살펴보기 <span aria-hidden="true">↓</span></ScrollPrompt>
        </Hero>

        <ProcessSection id="how-it-works" aria-labelledby="how-it-works-title">
          <ProcessHeader>
            <SectionLabel>작동 방식</SectionLabel>
            <ProcessTitle id="how-it-works-title">입력한 금액이 결과로 바뀌기까지</ProcessTitle>
          </ProcessHeader>
          <ProcessGrid>
            <VisualPanel aria-hidden="true"><ProcessVisual step={activeStep} /></VisualPanel>
            <StepList>
              {processSteps.map((step, index) => (
                <ProcessStep
                  key={step.label}
                  ref={(element) => { stepRefs.current[index] = element; }}
                  data-step={index}
                  $active={activeStep === index}
                >
                  <StepIndex>{String(index + 1).padStart(2, '0')}</StepIndex>
                  <div><StepLabel>{step.label}</StepLabel><StepTitle>{step.title}</StepTitle><StepBody>{step.body}</StepBody></div>
                </ProcessStep>
              ))}
            </StepList>
          </ProcessGrid>
        </ProcessSection>
      </Main>
      <SiteFooter />
    </Page>
  );
}

function ProcessVisual({ step }: { step: number }) {
  return <VisualContent key={step}>
    <VisualHeader><span>검증 흐름</span><strong>{String(step + 1).padStart(2, '0')} / 04</strong></VisualHeader>
    {step === 0 && <VisualBody><VisualTitle>1기 자료 등록</VisualTitle><VisualRows><VisualRow><span>검증 기간</span><strong>1기</strong></VisualRow><VisualRow><span>재무자료</span><code>고유 지문으로 변환</code></VisualRow><VisualRow><span>실제 금액</span><em>기록하지 않음</em></VisualRow></VisualRows></VisualBody>}
    {step === 1 && <VisualBody><VisualTitle>회사 내부 입력</VisualTitle><VisualRows><VisualRow><span>보유 현금</span><Redacted aria-label="비공개">██████</Redacted></VisualRow><VisualRow><span>30일 지급예정액</span><Redacted aria-label="비공개">██████</Redacted></VisualRow><VisualRow><span>사용 범위</span><em>증명 생성에만 사용</em></VisualRow></VisualRows></VisualBody>}
    {step === 2 && <VisualBody><VisualTitle>검증 항목</VisualTitle><CheckList><li><i>✓</i>회사 권한</li><li><i>✓</i>현재 기간</li><li><i>✓</i>등록 자료 일치</li><li><i>✓</i>현금 ≥ 지급예정액 × 1.2</li></CheckList></VisualBody>}
    {step === 3 && <VisualBody><VisualTitle>금융기관 확인 결과</VisualTitle><FinalResult>기준 충족</FinalResult><VisualRows><VisualRow><span>승인된 기간</span><strong>1기</strong></VisualRow><VisualRow><span>실제 금액</span><em>공개되지 않음</em></VisualRow></VisualRows></VisualBody>}
  </VisualContent>;
}

const Page = styled.div`min-height:100vh;display:flex;flex-direction:column;background:var(--color-canvas);`;
const Main = styled.main`width:min(1120px,calc(100% - 40px));margin:0 auto;padding:0 0 72px;flex:1;`;
const Hero = styled.section`position:relative;width:100%;max-width:850px;min-height:calc(100dvh - 58px);display:grid;align-content:center;`;
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
const ScrollPrompt = styled.a`position:absolute;bottom:32px;left:0;display:flex;align-items:center;gap:9px;color:var(--color-text-secondary);font-size:11px;font-weight:620;animation:${heroEntrance} 800ms 660ms cubic-bezier(.22,1,.36,1) both;span{color:var(--color-action);font-size:15px;}@media(prefers-reduced-motion:reduce){animation:none;}`;
const ProcessSection = styled.section`padding-top:92px;scroll-margin-top:24px;@media(max-width:800px){padding-top:68px;}`;
const ProcessHeader = styled.header`max-width:720px;padding-bottom:64px;@media(max-width:800px){padding-bottom:36px;}`;
const SectionLabel = styled.p`margin-bottom:12px;color:var(--color-action);font-size:12px;font-weight:700;`;
const ProcessTitle = styled.h2`color:var(--color-text-primary);font-size:clamp(30px,4vw,44px);font-weight:720;line-height:1.2;letter-spacing:-.05em;word-break:keep-all;`;
const ProcessGrid = styled.div`display:grid;grid-template-columns:minmax(340px,420px) minmax(0,1fr);gap:clamp(56px,9vw,112px);align-items:start;@media(max-width:800px){display:block;}`;
const VisualPanel = styled.div`position:sticky;top:28px;height:420px;background:var(--color-surface-muted);border-top:1px solid var(--color-border-strong);border-bottom:1px solid var(--color-border);@media(max-width:800px){top:0;z-index:2;height:300px;}`;
const visualEntrance = keyframes`
  from { opacity: 0; transform: translateY(10px); }
  to { opacity: 1; transform: translateY(0); }
`;
const VisualContent = styled.div`height:100%;padding:30px;display:flex;flex-direction:column;animation:${visualEntrance} 420ms cubic-bezier(.22,1,.36,1) both;@media(max-width:800px){padding:22px;}@media(prefers-reduced-motion:reduce){animation:none;}`;
const VisualHeader = styled.div`display:flex;align-items:center;justify-content:space-between;padding-bottom:16px;border-bottom:1px solid var(--color-border);color:var(--color-text-secondary);font-size:10px;strong{font:650 10px/1 ui-monospace,SFMono-Regular,monospace;}`;
const VisualBody = styled.div`display:flex;flex:1;flex-direction:column;justify-content:center;`;
const VisualTitle = styled.h3`margin-bottom:22px;color:var(--color-text-primary);font-size:20px;font-weight:700;letter-spacing:-.04em;`;
const VisualRows = styled.dl`border-top:1px solid var(--color-border);`;
const VisualRow = styled.div`min-height:50px;padding:12px 2px;display:flex;align-items:center;justify-content:space-between;gap:20px;border-bottom:1px solid var(--color-border);font-size:11px;>span{color:var(--color-text-secondary);}>strong{color:var(--color-text-primary);font-weight:680;}>code{color:var(--color-text-primary);font:600 10px/1.4 ui-monospace,SFMono-Regular,monospace;}>em{color:var(--color-action);font-style:normal;font-weight:650;}`;
const Redacted = styled.span`overflow:hidden;color:var(--color-text-primary)!important;font:11px/1 ui-monospace,SFMono-Regular,monospace;letter-spacing:1px;opacity:.72;white-space:nowrap;user-select:none;`;
const CheckList = styled.ul`display:grid;border-top:1px solid var(--color-border);li{min-height:48px;padding:12px 2px;display:flex;align-items:center;gap:10px;border-bottom:1px solid var(--color-border);color:var(--color-text-primary);font-size:11px;}i{width:17px;height:17px;display:grid;place-items:center;border:1px solid var(--color-success-border);border-radius:50%;color:var(--color-success);font-size:9px;font-style:normal;}`;
const FinalResult = styled.strong`margin:-4px 0 22px;color:var(--color-success);font-size:34px;font-weight:740;letter-spacing:-.05em;`;
const StepList = styled.ol`margin-top:-14vh;@media(max-width:800px){margin-top:0;}`;
const ProcessStep = styled.li<{ $active:boolean }>`min-height:72vh;padding:0 0 0 30px;border-left:2px solid ${p=>p.$active?'var(--color-action)':'var(--color-border)'};display:grid;grid-template-columns:44px minmax(0,1fr);align-content:center;gap:14px;opacity:${p=>p.$active?1:.38};transition:opacity 320ms ease,border-color 320ms ease;@media(max-width:800px){min-height:58vh;padding-left:18px;grid-template-columns:36px minmax(0,1fr);}`;
const StepIndex = styled.span`padding-top:3px;color:var(--color-action);font:650 11px/1 ui-monospace,SFMono-Regular,monospace;`;
const StepLabel = styled.p`margin-bottom:9px;color:var(--color-text-secondary);font-size:11px;font-weight:650;`;
const StepTitle = styled.h3`max-width:470px;color:var(--color-text-primary);font-size:clamp(23px,3vw,32px);font-weight:700;line-height:1.28;letter-spacing:-.045em;word-break:keep-all;`;
const StepBody = styled.p`max-width:500px;margin-top:16px;color:var(--color-text-secondary);font-size:14px;line-height:1.8;letter-spacing:-.012em;word-break:keep-all;`;
