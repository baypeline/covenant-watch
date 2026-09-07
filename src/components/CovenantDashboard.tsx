'use client';

import styled from '@emotion/styled';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { CaseId, CovenantErrorCode, LedgerState } from '@/types/covenant';
import { cases } from '@/types/covenant';
import {
  ArrowRight,
  Building2,
  Check,
  ChevronDown,
  CircleDot,
  Database,
  EyeOff,
  Landmark,
  LockKeyhole,
  RefreshCw,
  RotateCcw,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';
import { useState } from 'react';
import { advanceSnapshot, getLedgerState, resetDemo, verifyCovenant } from '@/lib/api';
import { useCovenantStore } from '@/stores/useCovenantStore';

const errorCopy: Record<CovenantErrorCode, { title: string; body: string }> = {
  INSUFFICIENT_CASH: { title: '현금 여유가 부족합니다', body: '필요 현금 기준을 충족하지 못해 승인이 생성되지 않았습니다.' },
  STALE_DATA: { title: '이전 기간 자료입니다', body: '현재 검증 기간과 자료의 기간이 달라 승인이 생성되지 않았습니다.' },
  DATA_MISMATCH: { title: '등록 자료와 일치하지 않습니다', body: '커밋먼트가 현재 원장에 등록된 자료와 다릅니다.' },
  UNAUTHORIZED: { title: '권한을 확인할 수 없습니다', body: '등록된 기업 또는 관리자 인증값과 일치하지 않습니다.' },
  ALREADY_APPROVED: { title: '이미 승인된 기간입니다', body: '같은 기간에는 승인을 한 번만 기록할 수 있습니다.' },
};

export function CovenantDashboard() {
  const queryClient = useQueryClient();
  const { view, setView, selectedCase, setSelectedCase, phase, setPhase } = useCovenantStore();
  const [showLedger, setShowLedger] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; code?: CovenantErrorCode } | null>(null);
  const stateQuery = useQuery({ queryKey: ['ledger-state'], queryFn: getLedgerState, refetchInterval: 8_000 });

  const verifyMutation = useMutation({
    mutationFn: async (caseId: CaseId) => {
      setResult(null);
      setPhase('proving');
      await wait(650);
      setPhase('submitting');
      const response = await verifyCovenant(caseId);
      await wait(450);
      setPhase(response.ok ? 'confirmed' : 'rejected');
      setResult({ ok: response.ok, code: response.ok ? undefined : response.code });
      return response;
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['ledger-state'] }),
    onError: () => setPhase('rejected'),
  });

  const advanceMutation = useMutation({
    mutationFn: advanceSnapshot,
    onSuccess: ({ state }) => {
      queryClient.setQueryData(['ledger-state'], state);
      setSelectedCase('round-2-fail');
      setResult(null);
    },
  });

  const resetMutation = useMutation({
    mutationFn: resetDemo,
    onSuccess: ({ state }) => {
      queryClient.setQueryData(['ledger-state'], state);
      setSelectedCase('round-1-pass');
      setResult(null);
    },
  });

  const state = stateQuery.data;
  const isCurrentApproved = Boolean(state && state.approvedRound === state.currentRound);
  const busy = verifyMutation.isPending || advanceMutation.isPending || resetMutation.isPending;

  return (
    <PageShell>
      <AmbientGlow />
      <Nav>
        <Brand><BrandMark><ShieldCheck size={20} /></BrandMark><span>Covenant Watch</span></Brand>
        <NetworkPill><PulseDot /> Midnight Local Devnet</NetworkPill>
      </Nav>

      <Main>
        <Hero>
          <Eyebrow><Sparkles size={14} /> Privacy-preserving covenant monitoring</Eyebrow>
          <Headline>숫자는 감추고,<br /><Accent>약속의 충족만 증명합니다.</Accent></Headline>
          <Subcopy>기업의 민감한 현금 잔액을 공개하지 않은 채, 현재 기간의 금융약정 준수 여부를 Midnight 영지식 증명으로 확인합니다.</Subcopy>
        </Hero>

        <ViewSwitch aria-label="사용자 화면 전환">
          <SwitchButton $active={view === 'company'} onClick={() => setView('company')}><Building2 size={17} /> 기업 보기</SwitchButton>
          <SwitchButton $active={view === 'bank'} onClick={() => setView('bank')}><Landmark size={17} /> 은행 보기</SwitchButton>
        </ViewSwitch>

        <ContentGrid>
          <PrimaryCard>
            <CardTop>
              <div><CardKicker>{view === 'company' ? 'COVENANT REQUEST' : 'MONITORING STATUS'}</CardKicker><CardTitle>{view === 'company' ? '약정 검증 및 모의 승인' : '약정 모니터링'}</CardTitle></div>
              <RoundBadge>{state?.currentRound ?? '—'}기</RoundBadge>
            </CardTop>

            {view === 'company' ? (
              <CompanyPanel>
                <SectionLabel>검증할 자료</SectionLabel>
                <CaseList>
                  {(Object.keys(cases) as CaseId[]).map((caseId) => {
                    const item = cases[caseId];
                    return (
                      <CaseButton key={caseId} $selected={caseId === selectedCase} onClick={() => { setSelectedCase(caseId); setResult(null); }}>
                        <Radio $selected={caseId === selectedCase}>{caseId === selectedCase && <CircleDot size={14} />}</Radio>
                        <CaseBody><CaseName>{item.label}</CaseName><CaseHint>{item.helper}</CaseHint></CaseBody>
                        <PrivateValues><span>C {item.cash}</span><span>P {item.payments}</span></PrivateValues>
                      </CaseButton>
                    );
                  })}
                </CaseList>

                <PrivacyNote><EyeOff size={18} /><div><strong>이 숫자는 비공개 입력입니다</strong><span>원장에는 원금액 대신 자료 커밋먼트만 기록됩니다.</span></div></PrivacyNote>

                {phase !== 'idle' && <Progress phase={phase} />}
                {result && <ResultPanel result={result} state={state} />}

                <ActionRow>
                  <PrimaryButton disabled={busy} onClick={() => verifyMutation.mutate(selectedCase)}>
                    <LockKeyhole size={18} />{verifyMutation.isPending ? '검증 진행 중…' : '검증 및 모의 승인'}<ArrowRight size={18} />
                  </PrimaryButton>
                  <SecondaryButton disabled={busy || state?.currentRound !== 1} onClick={() => advanceMutation.mutate()}><RefreshCw size={17} /> 2기 자료 등록</SecondaryButton>
                </ActionRow>
              </CompanyPanel>
            ) : (
              <BankPanel>
                <ApprovalVisual $approved={isCurrentApproved}>
                  <ApprovalIcon $approved={isCurrentApproved}>{isCurrentApproved ? <Check size={28} /> : <ShieldCheck size={28} />}</ApprovalIcon>
                  <div><StatusOverline>현재 {state?.currentRound ?? '—'}기</StatusOverline><ApprovalTitle>{isCurrentApproved ? '승인 완료' : '승인 없음'}</ApprovalTitle><ApprovalCopy>{isCurrentApproved ? '현재 기간의 약정 충족 증명이 원장에 확정되었습니다.' : '과거 승인은 현재 기간의 승인으로 표시하지 않습니다.'}</ApprovalCopy></div>
                </ApprovalVisual>
                <PublicFacts>
                  <Fact><span>공개되는 정보</span><strong>기간 · 승인 상태 · 커밋먼트</strong></Fact>
                  <Fact><span>공개되지 않는 정보</span><strong>현금 · 지급액 · 비밀값</strong></Fact>
                </PublicFacts>
                <PrivacyNote><EyeOff size={18} /><div><strong>은행 화면에는 원금액이 없습니다</strong><span>조건의 충족과 최신성만 독립적으로 확인합니다.</span></div></PrivacyNote>
              </BankPanel>
            )}
          </PrimaryCard>

          <SideColumn>
            <StatusCard>
              <CardKicker>PUBLIC LEDGER</CardKicker>
              <StatusHeader><div><StatusLabel>현재 원장 상태</StatusLabel><StatusValue><LiveDot /> 동기화됨</StatusValue></div><Database size={20} /></StatusHeader>
              <LedgerRows>
                <LedgerRow><span>현재 기간</span><strong>{state?.currentRound ?? '—'}기</strong></LedgerRow>
                <LedgerRow><span>승인된 기간</span><strong>{state?.approvedRound ? `${state.approvedRound}기` : '없음'}</strong></LedgerRow>
                <LedgerRow><span>현재 승인</span><StateTag $approved={isCurrentApproved}>{isCurrentApproved ? 'APPROVED' : 'NOT APPROVED'}</StateTag></LedgerRow>
              </LedgerRows>
              <DisclosureButton onClick={() => setShowLedger((value) => !value)}>원장 상세 {showLedger ? '접기' : '펼치기'}<ChevronDown size={16} style={{ transform: showLedger ? 'rotate(180deg)' : undefined }} /></DisclosureButton>
              {showLedger && <LedgerDetail><SmallLabel>Snapshot commitment</SmallLabel><CodeText>{shorten(state?.snapshotCommitment)}</CodeText><SmallLabel>Last transaction</SmallLabel><CodeText>{shorten(state?.lastTransactionId ?? undefined)}</CodeText><SmallLabel>Contract</SmallLabel><CodeText>{shorten(state?.contractAddress)}</CodeText></LedgerDetail>}
            </StatusCard>

            <PolicyCard>
              <PolicyIcon><ShieldCheck size={20} /></PolicyIcon>
              <div><CardKicker>COVENANT RULE</CardKicker><PolicyTitle>현금 여유 약정</PolicyTitle></div>
              <Formula><span>C</span><b>≥</b><span>P × 1.2</span></Formula>
              <FormulaNote>사용제한 없는 현금이 향후 30일 지급예정액의 120% 이상인지 검증합니다.</FormulaNote>
            </PolicyCard>
          </SideColumn>
        </ContentGrid>

        <FooterBar>
          <span>Demo controls</span><FooterRule />
          <FooterButton disabled={busy} onClick={() => resetMutation.mutate()}><RotateCcw size={15} /> 초기 상태로 복구</FooterButton>
          <FooterMeta>금액 단위 · 백만원</FooterMeta>
        </FooterBar>
      </Main>
    </PageShell>
  );
}

function Progress({ phase }: { phase: string }) {
  const steps = [
    { key: 'proving', label: '증명 생성' },
    { key: 'submitting', label: '거래 제출' },
    { key: 'confirmed', label: '원장 확정' },
  ];
  const current = phase === 'rejected' ? 0 : Math.max(0, steps.findIndex((step) => step.key === phase));
  return <ProgressWrap>{steps.map((step, index) => <ProgressItem key={step.key} $active={index <= current} $current={index === current}><ProgressDot>{index < current ? <Check size={12} /> : index + 1}</ProgressDot><span>{step.label}</span>{index < steps.length - 1 && <ProgressLine $active={index < current} />}</ProgressItem>)}</ProgressWrap>;
}

function ResultPanel({ result, state }: { result: { ok: boolean; code?: CovenantErrorCode }; state?: LedgerState }) {
  const copy = result.code ? errorCopy[result.code] : null;
  return <ResultBox $success={result.ok}>{result.ok ? <Check size={20} /> : <EyeOff size={20} />}<div><strong>{result.ok ? `${state?.currentRound ?? ''}기 모의 승인 완료` : copy?.title}</strong><span>{result.ok ? '실제 원장 상태에 현재 기간 승인이 반영되었습니다.' : copy?.body}</span></div></ResultBox>;
}

function wait(milliseconds: number) { return new Promise((resolve) => setTimeout(resolve, milliseconds)); }
function shorten(value?: string) { return value ? `${value.slice(0, 12)}…${value.slice(-8)}` : '—'; }

const PageShell = styled.div`min-height:100vh;background:radial-gradient(circle at 72% 18%,rgba(32,105,71,.15),transparent 27%),linear-gradient(150deg,#0b1311 0%,#09100e 58%,#0d1512 100%);position:relative;overflow:hidden;`;
const AmbientGlow = styled.div`position:absolute;width:520px;height:520px;border:1px solid rgba(142,240,176,.07);border-radius:50%;right:-190px;top:130px;box-shadow:0 0 120px rgba(53,217,120,.05);pointer-events:none;&:after{content:'';position:absolute;inset:75px;border:1px solid rgba(142,240,176,.05);border-radius:50%;}`;
const Nav = styled.nav`height:74px;border-bottom:1px solid var(--line);display:flex;align-items:center;justify-content:space-between;padding:0 max(24px,calc((100vw - 1180px)/2));position:relative;z-index:1;backdrop-filter:blur(16px);`;
const Brand = styled.div`display:flex;align-items:center;gap:11px;font-size:16px;font-weight:700;letter-spacing:-.02em;`;
const BrandMark = styled.span`width:34px;height:34px;display:grid;place-items:center;border:1px solid rgba(142,240,176,.34);border-radius:10px;color:var(--green);background:rgba(142,240,176,.07);`;
const NetworkPill = styled.div`display:flex;align-items:center;gap:8px;border:1px solid var(--line);background:rgba(255,255,255,.025);border-radius:100px;padding:8px 12px;font-size:12px;color:#bac3bf;`;
const PulseDot = styled.span`width:7px;height:7px;border-radius:50%;background:var(--green-strong);box-shadow:0 0 0 4px rgba(53,217,120,.12);`;
const Main = styled.main`width:min(1180px,calc(100% - 40px));margin:0 auto;padding:74px 0 36px;position:relative;z-index:1;`;
const Hero = styled.section`max-width:760px;`;
const Eyebrow = styled.div`display:flex;align-items:center;gap:7px;color:var(--green);font-size:12px;font-weight:650;letter-spacing:.11em;text-transform:uppercase;`;
const Headline = styled.h1`margin:22px 0 18px;font-size:clamp(42px,6vw,72px);line-height:1.07;letter-spacing:-.055em;font-weight:720;`;
const Accent = styled.span`color:#9de6b7;`;
const Subcopy = styled.p`max-width:650px;margin:0;color:var(--muted);font-size:17px;line-height:1.75;letter-spacing:-.015em;`;
const ViewSwitch = styled.div`display:inline-flex;margin:42px 0 22px;padding:4px;border:1px solid var(--line);background:rgba(0,0,0,.18);border-radius:12px;`;
const SwitchButton = styled.button<{ $active:boolean }>`border:0;border-radius:8px;padding:9px 16px;display:flex;align-items:center;gap:8px;cursor:pointer;background:${p=>p.$active?'rgba(255,255,255,.09)':'transparent'};color:${p=>p.$active?'#fff':'var(--muted)'};font-weight:600;font-size:13px;box-shadow:${p=>p.$active?'0 3px 14px rgba(0,0,0,.18)':'none'};transition:.2s;`;
const ContentGrid = styled.div`display:grid;grid-template-columns:minmax(0,1.62fr) minmax(310px,.82fr);gap:18px;@media(max-width:850px){grid-template-columns:1fr;}`;
const PrimaryCard = styled.section`border:1px solid var(--line);background:linear-gradient(145deg,rgba(23,31,28,.95),rgba(14,21,19,.95));border-radius:20px;padding:28px;box-shadow:0 25px 80px rgba(0,0,0,.24);`;
const CardTop = styled.div`display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:26px;`;
const CardKicker = styled.div`font-size:10px;letter-spacing:.16em;color:#75817c;font-weight:750;margin-bottom:8px;`;
const CardTitle = styled.h2`font-size:22px;letter-spacing:-.035em;margin:0;`;
const RoundBadge = styled.div`padding:8px 12px;border:1px solid rgba(142,240,176,.2);border-radius:9px;color:var(--green);background:rgba(142,240,176,.05);font-size:13px;font-weight:700;`;
const CompanyPanel = styled.div``;
const SectionLabel = styled.div`font-size:12px;color:#abb4b0;margin-bottom:10px;`;
const CaseList = styled.div`display:grid;gap:8px;`;
const CaseButton = styled.button<{ $selected:boolean }>`width:100%;min-height:68px;border:1px solid ${p=>p.$selected?'rgba(142,240,176,.36)':'var(--line)'};background:${p=>p.$selected?'rgba(142,240,176,.055)':'rgba(255,255,255,.018)'};border-radius:12px;display:flex;align-items:center;padding:13px 14px;text-align:left;cursor:pointer;transition:.18s;&:hover{border-color:rgba(142,240,176,.25);transform:translateY(-1px);}`;
const Radio = styled.span<{ $selected:boolean }>`width:20px;height:20px;flex:0 0 auto;display:grid;place-items:center;border-radius:50%;border:1px solid ${p=>p.$selected?'var(--green)':'#59635f'};color:var(--green);margin-right:12px;`;
const CaseBody = styled.span`display:flex;min-width:0;flex-direction:column;gap:4px;`;
const CaseName = styled.strong`font-size:14px;font-weight:650;`;
const CaseHint = styled.span`font-size:12px;color:#7f8b86;`;
const PrivateValues = styled.span`display:flex;gap:6px;margin-left:auto;padding-left:12px;span{font:600 11px ui-monospace,SFMono-Regular,monospace;color:#aeb8b3;background:rgba(255,255,255,.05);padding:5px 7px;border-radius:6px;}@media(max-width:520px){display:none;}`;
const PrivacyNote = styled.div`display:flex;gap:11px;align-items:flex-start;margin-top:16px;padding:14px;border:1px solid rgba(114,162,255,.13);border-radius:11px;background:rgba(71,106,177,.065);color:#91aee7;svg{flex:0 0 auto;}div{display:flex;flex-direction:column;gap:4px;}strong{font-size:12px;}span{font-size:11px;color:#7e8fae;line-height:1.5;}`;
const ActionRow = styled.div`display:flex;gap:9px;margin-top:20px;@media(max-width:520px){flex-direction:column;}`;
const PrimaryButton = styled.button`border:0;border-radius:10px;background:#8eeead;color:#0c2616;height:46px;padding:0 18px;display:flex;align-items:center;justify-content:center;gap:9px;font-size:13px;font-weight:760;cursor:pointer;transition:.18s;box-shadow:0 8px 25px rgba(53,217,120,.13);&:hover:not(:disabled){background:#a4f3be;transform:translateY(-1px);}&:disabled{opacity:.55;cursor:not-allowed;}`;
const SecondaryButton = styled.button`border:1px solid var(--line);border-radius:10px;background:rgba(255,255,255,.03);height:46px;padding:0 15px;display:flex;align-items:center;justify-content:center;gap:8px;font-size:12px;color:#b3bdb8;cursor:pointer;&:disabled{opacity:.35;cursor:not-allowed;}`;
const ProgressWrap = styled.div`display:flex;align-items:center;margin:18px 4px 0;`;
const ProgressItem = styled.div<{ $active:boolean;$current:boolean }>`display:flex;align-items:center;gap:6px;color:${p=>p.$active?'#c3ddd0':'#59635f'};font-size:10px;white-space:nowrap;flex:1;`;
const ProgressDot = styled.span`width:20px;height:20px;display:grid;place-items:center;border:1px solid currentColor;border-radius:50%;font-size:9px;`;
const ProgressLine = styled.span<{ $active:boolean }>`height:1px;flex:1;background:${p=>p.$active?'var(--green)':'var(--line)'};margin:0 7px;`;
const ResultBox = styled.div<{ $success:boolean }>`display:flex;gap:10px;margin-top:16px;border:1px solid ${p=>p.$success?'rgba(142,240,176,.24)':'rgba(255,124,114,.24)'};background:${p=>p.$success?'rgba(53,217,120,.07)':'rgba(255,124,114,.07)'};color:${p=>p.$success?'var(--green)':'var(--red)'};padding:14px;border-radius:11px;svg{flex:0 0 auto;}div{display:flex;flex-direction:column;gap:3px;}strong{font-size:13px;}span{font-size:11px;color:${p=>p.$success?'#84a590':'#bd8883'};line-height:1.5;}`;
const BankPanel = styled.div``;
const ApprovalVisual = styled.div<{ $approved:boolean }>`min-height:184px;border:1px solid ${p=>p.$approved?'rgba(142,240,176,.22)':'var(--line)'};border-radius:15px;background:radial-gradient(circle at 10% 10%,${p=>p.$approved?'rgba(53,217,120,.11)':'rgba(255,255,255,.04)'},transparent 48%);display:flex;align-items:center;gap:20px;padding:26px;`;
const ApprovalIcon = styled.div<{ $approved:boolean }>`width:58px;height:58px;flex:0 0 auto;display:grid;place-items:center;border-radius:50%;color:${p=>p.$approved?'var(--green)':'#7d8984'};background:${p=>p.$approved?'rgba(53,217,120,.1)':'rgba(255,255,255,.04)'};border:1px solid currentColor;`;
const StatusOverline = styled.div`color:#81908a;font-size:11px;margin-bottom:5px;`;
const ApprovalTitle = styled.div`font-size:28px;font-weight:720;letter-spacing:-.04em;`;
const ApprovalCopy = styled.p`color:#85918c;font-size:12px;line-height:1.55;margin:8px 0 0;`;
const PublicFacts = styled.div`display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:10px;@media(max-width:520px){grid-template-columns:1fr;}`;
const Fact = styled.div`padding:14px;border:1px solid var(--line);border-radius:10px;display:flex;flex-direction:column;gap:5px;span{font-size:10px;color:#737f7a;}strong{font-size:12px;color:#b8c2bd;}`;
const SideColumn = styled.aside`display:grid;gap:18px;align-content:start;`;
const StatusCard = styled.section`border:1px solid var(--line);background:var(--surface);border-radius:20px;padding:22px;`;
const StatusHeader = styled.div`display:flex;align-items:center;justify-content:space-between;margin:3px 0 19px;color:#718078;`;
const StatusLabel = styled.div`font-size:16px;font-weight:680;color:#edf2ef;letter-spacing:-.025em;`;
const StatusValue = styled.div`display:flex;align-items:center;gap:6px;color:#87938d;font-size:10px;margin-top:5px;`;
const LiveDot = styled.span`width:6px;height:6px;border-radius:50%;background:var(--green-strong);`;
const LedgerRows = styled.div`border-top:1px solid var(--line);`;
const LedgerRow = styled.div`min-height:46px;display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid var(--line);font-size:12px;span{color:#7e8984;}strong{font-size:12px;}`;
const StateTag = styled.b<{ $approved:boolean }>`font-size:9px!important;letter-spacing:.08em;color:${p=>p.$approved?'var(--green)':'#929c97'};background:${p=>p.$approved?'rgba(53,217,120,.09)':'rgba(255,255,255,.05)'};padding:5px 7px;border-radius:6px;`;
const DisclosureButton = styled.button`width:100%;border:0;background:transparent;color:#86918c;font-size:11px;display:flex;align-items:center;justify-content:center;gap:5px;padding:15px 0 0;cursor:pointer;svg{transition:.2s;}`;
const LedgerDetail = styled.div`margin-top:13px;padding:12px;border-radius:9px;background:rgba(0,0,0,.18);display:grid;gap:5px;`;
const SmallLabel = styled.span`font-size:9px;color:#647069;text-transform:uppercase;letter-spacing:.08em;margin-top:4px;`;
const CodeText = styled.code`font:10px ui-monospace,SFMono-Regular,monospace;color:#a1ada7;word-break:break-all;`;
const PolicyCard = styled.section`border:1px solid rgba(142,240,176,.11);background:linear-gradient(145deg,rgba(27,39,33,.8),rgba(17,25,22,.85));border-radius:20px;padding:22px;`;
const PolicyIcon = styled.div`width:38px;height:38px;display:grid;place-items:center;color:var(--green);border:1px solid rgba(142,240,176,.19);border-radius:10px;float:right;`;
const PolicyTitle = styled.h3`font-size:16px;margin:0;`;
const Formula = styled.div`display:flex;align-items:center;justify-content:center;gap:15px;margin:20px 0 13px;padding:17px;border-radius:11px;background:rgba(0,0,0,.17);font:650 18px ui-monospace,SFMono-Regular,monospace;span:first-of-type{color:var(--green);}b{font-weight:400;color:#69766f;}`;
const FormulaNote = styled.p`font-size:11px;line-height:1.65;color:#7e8a84;margin:0;`;
const FooterBar = styled.footer`display:flex;align-items:center;gap:12px;margin-top:18px;color:#66726c;font-size:10px;text-transform:uppercase;letter-spacing:.1em;`;
const FooterRule = styled.span`height:1px;background:var(--line);flex:1;`;
const FooterButton = styled.button`border:0;background:transparent;color:#84918b;display:flex;align-items:center;gap:6px;font-size:10px;cursor:pointer;text-transform:uppercase;letter-spacing:.05em;&:disabled{opacity:.4;}`;
const FooterMeta = styled.span`@media(max-width:560px){display:none;}`;
