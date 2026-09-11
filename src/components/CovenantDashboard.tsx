'use client';

import styled from '@emotion/styled';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { CaseId, CovenantErrorCode, LedgerState, OperationPhase, VerificationOperation } from '@/types/covenant';
import { cases } from '@/types/covenant';
import {
  ArrowRight,
  Building2,
  Check,
  ChevronDown,
  CircleDot,
  Copy,
  Database,
  EyeOff,
  Fingerprint,
  Landmark,
  LockKeyhole,
  RefreshCw,
  RotateCcw,
  ShieldCheck,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { advanceSnapshot, getLedgerState, getVerification, getVerificationByRequestId, resetDemo, startVerification, watchVerification } from '@/lib/api';
import { useCovenantStore } from '@/stores/useCovenantStore';

const errorCopy: Record<CovenantErrorCode, { title: string; body: string }> = {
  INSUFFICIENT_CASH: { title: '현금 여유가 부족합니다', body: '필요 현금 기준을 충족하지 못해 승인이 생성되지 않았습니다.' },
  STALE_DATA: { title: '이전 기간 자료입니다', body: '현재 검증 기간과 자료의 기간이 달라 승인이 생성되지 않았습니다.' },
  DATA_MISMATCH: { title: '등록 자료와 일치하지 않습니다', body: '커밋먼트가 현재 원장에 등록된 자료와 다릅니다.' },
  UNAUTHORIZED: { title: '권한을 확인할 수 없습니다', body: '등록된 기업 또는 관리자 인증값과 일치하지 않습니다.' },
  ALREADY_APPROVED: { title: '이미 승인된 기간입니다', body: '같은 기간에는 승인을 한 번만 기록할 수 있습니다.' },
};

interface SavedRequest {
  operationId?: string;
  requestId: string;
  contractAddress: string;
}

export function CovenantDashboard() {
  const queryClient = useQueryClient();
  const { view, setView, selectedCase, setSelectedCase, phase, setPhase } = useCovenantStore();
  const [showLedger, setShowLedger] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; code?: CovenantErrorCode } | null>(null);
  const [operation, setOperation] = useState<VerificationOperation | null>(null);
  const [requestMessage, setRequestMessage] = useState<string | null>(null);
  const [savedRequest, setSavedRequest] = useState<SavedRequest | null>(null);
  const recoveryStarted = useRef(false);
  const stateQuery = useQuery({ queryKey: ['ledger-state'], queryFn: getLedgerState, refetchInterval: 8_000 });

  useEffect(() => {
    const raw = sessionStorage.getItem('covenant-watch:operation');
    if (!raw || !stateQuery.data || recoveryStarted.current) return;
    recoveryStarted.current = true;
    try {
      const saved = JSON.parse(raw) as SavedRequest;
      if (saved.contractAddress !== stateQuery.data.contractAddress) {
        sessionStorage.removeItem('covenant-watch:operation');
        return;
      }
      setSavedRequest(saved);
      void recoverRequest(saved);
    } catch {
      sessionStorage.removeItem('covenant-watch:operation');
    }
  }, [setPhase, stateQuery.data]);

  const verifyMutation = useMutation({
    mutationFn: async (caseId: CaseId) => {
      const state = await queryClient.fetchQuery({ queryKey: ['ledger-state'], queryFn: getLedgerState });
      setResult(null);
      setRequestMessage(null);
      setOperation(null);
      setPhase('queued');
      const requestId = crypto.randomUUID();
      const pending = { requestId, contractAddress: state.contractAddress };
      setSavedRequest(pending);
      sessionStorage.setItem('covenant-watch:operation', JSON.stringify(pending));
      const accepted = await startVerification(caseId, state.currentRound, requestId);
      const saved = {
        operationId: accepted.operationId,
        requestId,
        contractAddress: state.contractAddress,
      };
      setSavedRequest(saved);
      sessionStorage.setItem('covenant-watch:operation', JSON.stringify(saved));
      const response = await watchVerification(accepted.operationId, (next) => {
        setOperation(next);
        setPhase(next.phase);
        if (next.state) queryClient.setQueryData(['ledger-state'], next.state);
      });
      if (response.phase === 'unknown') throw new Error(response.message ?? '원장 확정 여부를 확인할 수 없습니다.');
      sessionStorage.removeItem('covenant-watch:operation');
      if (response.phase === 'error') {
        setRequestMessage(response.message ?? '거래 제출 전 처리 오류가 발생했습니다.');
        return response;
      }
      setResult({ ok: response.phase === 'confirmed', code: response.code ?? undefined });
      return response;
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['ledger-state'] }),
    onError: (error) => {
      setPhase('unknown');
      setRequestMessage(error instanceof Error ? error.message : '연결 오류 · 상태 확인이 필요합니다.');
    },
  });

  const advanceMutation = useMutation({
    mutationFn: advanceSnapshot,
    onSuccess: ({ state }) => {
      queryClient.setQueryData(['ledger-state'], state);
      setSelectedCase('round-2-fail');
      setResult(null);
      setOperation(null);
    },
  });

  const resetMutation = useMutation({
    mutationFn: resetDemo,
    onSuccess: ({ state }) => {
      queryClient.setQueryData(['ledger-state'], state);
      setSelectedCase('round-1-pass');
      setResult(null);
      setOperation(null);
    },
  });

  const state = stateQuery.isError ? undefined : stateQuery.data;
  const isCurrentApproved = Boolean(state && state.approvedRound === state.currentRound);
  const busy = verifyMutation.isPending || advanceMutation.isPending || resetMutation.isPending || phase === 'unknown';

  async function refreshOperation() {
    if (!operation) {
      if (savedRequest) await recoverRequest(savedRequest);
      return;
    }
    try {
      const refreshed = await getVerification(operation.operationId);
      setOperation(refreshed);
      setPhase(refreshed.phase);
      setRequestMessage(refreshed.message);
      if (refreshed.phase === 'confirmed' || refreshed.phase === 'rejected') {
        setResult({ ok: refreshed.phase === 'confirmed', code: refreshed.code ?? undefined });
        sessionStorage.removeItem('covenant-watch:operation');
        await stateQuery.refetch();
      } else if (refreshed.phase === 'error') {
        sessionStorage.removeItem('covenant-watch:operation');
      }
    } catch {
      setRequestMessage('연결 오류 · 기존 결과를 최신 상태로 간주하지 않습니다.');
    }
  }

  async function recoverRequest(saved: SavedRequest) {
    try {
      const recovered = saved.operationId
        ? await getVerification(saved.operationId)
        : await getVerificationByRequestId(saved.requestId);
      const nextSaved = { ...saved, operationId: recovered.operationId };
      setSavedRequest(nextSaved);
      sessionStorage.setItem('covenant-watch:operation', JSON.stringify(nextSaved));
      setOperation(recovered);
      setPhase(recovered.phase);
      setRequestMessage(recovered.message);
      if (recovered.phase === 'confirmed' || recovered.phase === 'rejected') {
        setResult({ ok: recovered.phase === 'confirmed', code: recovered.code ?? undefined });
        sessionStorage.removeItem('covenant-watch:operation');
      } else if (recovered.phase === 'error') {
        setRequestMessage(recovered.message ?? '거래 제출 전 처리 오류가 발생했습니다.');
        sessionStorage.removeItem('covenant-watch:operation');
      }
    } catch {
      setPhase('unknown');
      setRequestMessage('접수 또는 거래 결과가 불명확합니다. 같은 요청 키로 상태를 다시 확인해 주세요.');
    }
  }

  return (
    <PageShell>
      <Nav>
        <Brand><BrandMark><ShieldCheck size={20} /></BrandMark><span>Covenant Watch</span></Brand>
        <NetworkPill><PulseDot $error={stateQuery.isError} /> {stateQuery.isError ? '원장 연결 실패' : state ? `${state.mode === 'midnight' ? 'Midnight 원장' : 'Demo 원장'} · ${state.network}` : '원장 연결 확인 중'}</NetworkPill>
      </Nav>

      <Main>
        <Hero>
          <Eyebrow>Midnight · Private covenant</Eyebrow>
          <Headline>숫자는 감추고,<br /><Accent>약속의 충족만 증명합니다.</Accent></Headline>
          <Subcopy>기업의 민감한 현금 잔액을 공개하지 않은 채, 현재 기간의 금융약정 준수 여부를 Midnight 영지식 증명으로 확인합니다.</Subcopy>
        </Hero>

        <ViewSwitch aria-label="사용자 화면 전환">
          <SwitchButton $active={view === 'company'} onClick={() => setView('company')}><Building2 size={17} /> 기업 보기</SwitchButton>
          <SwitchButton $active={view === 'bank'} onClick={() => setView('bank')}><Landmark size={17} /> 은행 보기</SwitchButton>
        </ViewSwitch>

        <ProofRail aria-label="검증 증거 흐름">
          <RailNode><RailIcon><EyeOff size={16} /></RailIcon><span>기업 안에서</span><strong>금액 비공개</strong></RailNode>
          <RailLink $active={phase !== 'idle'} />
          <RailNode><RailIcon><Fingerprint size={16} /></RailIcon><span>증명 작업</span><strong>{phaseLabel(phase)}</strong></RailNode>
          <RailLink $active={phase === 'confirming' || phase === 'confirmed'} />
          <RailNode><RailIcon><Database size={16} /></RailIcon><span>공개 원장</span><strong>{state?.lastTransactionId ? '거래 증거 있음' : '승인 대기'}</strong></RailNode>
        </ProofRail>

        <ContentGrid>
          <PrimaryCard>
            <CardTop>
              <div><CardKicker>{view === 'company' ? 'COVENANT REQUEST' : 'MONITORING STATUS'}</CardKicker><CardTitle>{view === 'company' ? `약정 검증 및 ${state?.mode === 'midnight' ? '원장 승인' : '데모 승인'}` : '약정 모니터링'}</CardTitle></div>
              <RoundBadge>{state?.currentRound ?? '—'}기</RoundBadge>
            </CardTop>

            {view === 'company' ? (
              <CompanyPanel>
                <SectionLabel>검증할 자료</SectionLabel>
                <CaseList>
                  {(Object.keys(cases) as CaseId[]).map((caseId) => {
                    const item = cases[caseId];
                    const unavailable = !state || item.round > state.currentRound || (caseId === 'round-1-stale' && state.currentRound < 2);
                    return (
                      <CaseButton key={caseId} $selected={caseId === selectedCase} disabled={busy || unavailable} onClick={() => { setSelectedCase(caseId); setResult(null); setOperation(null); }}>
                        <Radio $selected={caseId === selectedCase}>{caseId === selectedCase && <CircleDot size={14} />}</Radio>
                        <CaseBody><CaseName>{item.label}</CaseName><CaseHint>{unavailable ? '현재 기간에 등록되지 않은 자료' : item.helper}</CaseHint></CaseBody>
                        <PrivateValues><span>C {item.cash}</span><span>P {item.payments}</span></PrivateValues>
                      </CaseButton>
                    );
                  })}
                </CaseList>

                <PrivacyNote><EyeOff size={18} /><div><strong>이 숫자는 비공개 입력입니다</strong><span>원장에는 원금액 대신 자료 커밋먼트만 기록됩니다.</span></div></PrivacyNote>

                {phase !== 'idle' && <Progress phase={phase} />}
                {result && <ResultPanel result={result} state={state} />}
                {requestMessage && !result && <ConnectionNotice $success={false}><RefreshCw size={18} /><div><strong>상태 확인이 필요합니다</strong><span>{requestMessage}</span></div></ConnectionNotice>}
                {operation && <OperationEvidence operation={operation} />}

                <ActionRow>
                  <PrimaryButton disabled={busy || !state} onClick={() => verifyMutation.mutate(selectedCase)}>
                    <LockKeyhole size={18} />{verifyMutation.isPending ? phaseLabel(phase) : '검증하고 원장에 기록'}<ArrowRight size={18} />
                  </PrimaryButton>
                  {phase === 'unknown' && (operation || savedRequest) ? (
                    <SecondaryButton onClick={() => void refreshOperation()}><RefreshCw size={17} /> 작업 상태 다시 확인</SecondaryButton>
                  ) : state?.operatorActionsEnabled ? (
                    <SecondaryButton disabled={busy || state.currentRound !== 1} onClick={() => advanceMutation.mutate()}><RefreshCw size={17} /> 2기 자료 등록</SecondaryButton>
                  ) : null}
                </ActionRow>
              </CompanyPanel>
            ) : (
              <BankPanel>
                <ApprovalVisual $approved={isCurrentApproved}>
                  <ApprovalIcon $approved={isCurrentApproved}>{isCurrentApproved ? <Check size={28} /> : <ShieldCheck size={28} />}</ApprovalIcon>
                  <div><StatusOverline>현재 {state?.currentRound ?? '—'}기</StatusOverline><ApprovalTitle>{stateQuery.isError ? '최신 상태 확인 불가' : isCurrentApproved ? '승인 완료' : '승인 없음'}</ApprovalTitle><ApprovalCopy>{stateQuery.isError ? '원장 연결을 복구한 뒤 상태를 다시 확인해 주세요. 이전 조회값은 현재 상태로 표시하지 않습니다.' : isCurrentApproved ? '현재 기간의 약정 충족 증명이 원장에 확정되었습니다.' : '과거 승인은 현재 기간의 승인으로 표시하지 않습니다.'}</ApprovalCopy></div>
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
              <StatusHeader><div><StatusLabel>현재 원장 상태</StatusLabel><StatusValue $error={stateQuery.isError}><LiveDot $error={stateQuery.isError} /> {stateQuery.isError ? '최신 상태 확인 불가' : state ? `${new Date(state.updatedAt).toLocaleTimeString('ko-KR')} 조회` : '조회 중'}</StatusValue></div><Database size={20} /></StatusHeader>
              <LedgerRows>
                <LedgerRow><span>현재 기간</span><strong>{state?.currentRound ?? '—'}기</strong></LedgerRow>
                <LedgerRow><span>승인된 기간</span><strong>{state?.approvedRound ? `${state.approvedRound}기` : '없음'}</strong></LedgerRow>
                <LedgerRow><span>현재 승인</span><StateTag $approved={isCurrentApproved}>{isCurrentApproved ? 'APPROVED' : 'NOT APPROVED'}</StateTag></LedgerRow>
              </LedgerRows>
              <DisclosureButton onClick={() => setShowLedger((value) => !value)}>원장 상세 {showLedger ? '접기' : '펼치기'}<ChevronDown size={16} style={{ transform: showLedger ? 'rotate(180deg)' : undefined }} /></DisclosureButton>
              {showLedger && <LedgerDetail><LedgerDetailItem label="Snapshot commitment" value={state?.snapshotCommitment} /><LedgerDetailItem label="Last transaction" value={state?.lastTransactionId ?? undefined} /><LedgerDetailItem label="Contract" value={state?.contractAddress} /></LedgerDetail>}
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
          {state?.operatorActionsEnabled && <FooterButton disabled={busy} onClick={() => resetMutation.mutate()}><RotateCcw size={15} /> 초기 상태로 복구</FooterButton>}
          <FooterMeta>금액 단위 · 백만원</FooterMeta>
        </FooterBar>
      </Main>
    </PageShell>
  );
}

function Progress({ phase }: { phase: OperationPhase }) {
  const steps = [
    { key: 'proving', label: '증명 생성' },
    { key: 'submitting', label: '거래 제출' },
    { key: 'confirming', label: '원장 확정' },
  ];
  const effectivePhase = phase === 'confirmed' ? 'confirming' : phase;
  const current = phase === 'rejected' || phase === 'error' || phase === 'unknown' ? 0 : Math.max(0, steps.findIndex((step) => step.key === effectivePhase));
  return <ProgressWrap>{steps.map((step, index) => <ProgressItem key={step.key} $active={index <= current} $current={index === current}><ProgressDot>{index < current ? <Check size={12} /> : index + 1}</ProgressDot><span>{step.label}</span>{index < steps.length - 1 && <ProgressLine $active={index < current} />}</ProgressItem>)}</ProgressWrap>;
}

function OperationEvidence({ operation }: { operation: VerificationOperation }) {
  return <EvidenceBox><EvidenceTitle><Database size={15} /> 공개 검증 증거</EvidenceTitle><EvidenceGrid><div><span>작업 ID</span><code>{operation.operationId}</code></div><div><span>제출 기간</span><code>{operation.submittedRound}기</code></div><div><span>거래 ID</span><code>{operation.transactionId ?? '거래 생성 전'}</code></div><div><span>마지막 확인</span><code>{new Date(operation.updatedAt).toLocaleTimeString('ko-KR')}</code></div></EvidenceGrid></EvidenceBox>;
}

function LedgerDetailItem({ label, value }: { label: string; value?: string }) {
  return <DetailItem><div><SmallLabel>{label}</SmallLabel><CodeText>{shorten(value)}</CodeText></div>{value && <CopyButton type="button" aria-label={`${label} 복사`} onClick={() => void navigator.clipboard.writeText(value)}><Copy size={13} /></CopyButton>}</DetailItem>;
}

function ResultPanel({ result, state }: { result: { ok: boolean; code?: CovenantErrorCode }; state?: LedgerState }) {
  const copy = result.code ? errorCopy[result.code] : null;
  const approvalLabel = state?.mode === 'midnight' ? '원장 승인 완료' : '데모 승인 완료';
  return <ResultBox $success={result.ok}>{result.ok ? <Check size={20} /> : <EyeOff size={20} />}<div><strong>{result.ok ? `${state?.currentRound ?? ''}기 ${approvalLabel}` : copy?.title}</strong><span>{result.ok ? '공개 원장 상태에 현재 기간 승인이 반영되었습니다.' : copy?.body}</span></div></ResultBox>;
}

function phaseLabel(phase: string) {
  const labels: Record<string, string> = { idle: '검증 대기', queued: '작업 접수됨', proving: '증명 생성 중', submitting: '거래 제출 중', confirming: '원장 확정 확인 중', confirmed: '원장 확정', rejected: '조건 불충족', error: '제출 전 처리 오류', unknown: '확정 여부 확인 필요' };
  return labels[phase] ?? phase;
}
function shorten(value?: string) { return value ? `${value.slice(0, 12)}…${value.slice(-8)}` : '—'; }

const PageShell = styled.div`min-height:100vh;background:var(--canvas);position:relative;overflow:hidden;`;
const Nav = styled.nav`height:74px;border-bottom:1px solid var(--line);display:flex;align-items:center;justify-content:space-between;padding:0 max(24px,calc((100vw - 1180px)/2));position:relative;z-index:1;background:rgba(11,15,24,.9);`;
const Brand = styled.div`display:flex;align-items:center;gap:11px;font-size:16px;font-weight:700;letter-spacing:-.02em;`;
const BrandMark = styled.span`width:34px;height:34px;display:grid;place-items:center;border:1px solid rgba(155,174,255,.55);border-radius:10px;color:var(--proof);background:rgba(155,174,255,.08);`;
const NetworkPill = styled.div`display:flex;align-items:center;gap:8px;border:1px solid var(--line);background:var(--surface);border-radius:100px;padding:8px 12px;font-size:12px;color:var(--text-secondary);`;
const PulseDot = styled.span<{ $error:boolean }>`width:7px;height:7px;border-radius:50%;background:${p=>p.$error?'var(--danger)':'var(--success)'};`;
const Main = styled.main`width:min(1180px,calc(100% - 40px));margin:0 auto;padding:52px 0 36px;position:relative;z-index:1;`;
const Hero = styled.section`max-width:760px;`;
const Eyebrow = styled.div`color:var(--proof);font-size:12px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;`;
const Headline = styled.h1`margin:22px 0 18px;font-size:clamp(42px,6vw,72px);line-height:1.07;letter-spacing:-.055em;font-weight:720;`;
const Accent = styled.span`color:var(--proof);`;
const Subcopy = styled.p`max-width:650px;margin:0;color:var(--text-secondary);font-size:17px;line-height:1.75;letter-spacing:-.015em;`;
const ViewSwitch = styled.div`display:inline-flex;margin:34px 0 18px;padding:4px;border:1px solid var(--line);background:var(--surface);border-radius:12px;`;
const SwitchButton = styled.button<{ $active:boolean }>`border:1px solid ${p=>p.$active?'rgba(155,174,255,.55)':'transparent'};border-radius:8px;padding:8px 15px;display:flex;align-items:center;gap:8px;cursor:pointer;background:${p=>p.$active?'rgba(155,174,255,.1)':'transparent'};color:${p=>p.$active?'var(--text-primary)':'var(--text-secondary)'};font-weight:600;font-size:13px;transition:background .18s,border-color .18s,color .18s;&:hover{color:var(--text-primary);}`;
const ProofRail = styled.section`display:grid;grid-template-columns:auto 1fr auto 1fr auto;align-items:center;margin:0 0 18px;padding:15px 18px;border:1px solid var(--line);border-radius:14px;background:rgba(17,23,36,.72);@media(max-width:680px){grid-template-columns:1fr;gap:10px;}`;
const RailNode = styled.div`display:grid;grid-template-columns:30px auto;column-gap:9px;align-items:center;min-width:150px;span{grid-column:2;font-size:10px;color:var(--text-secondary);letter-spacing:.04em;}strong{grid-column:2;font-size:12px;font-weight:650;}`;
const RailIcon = styled.div`grid-row:1/3;width:30px;height:30px;display:grid;place-items:center;border:1px solid rgba(155,174,255,.4);border-radius:50%;color:var(--proof);background:var(--canvas);`;
const RailLink = styled.span<{ $active:boolean }>`height:1px;margin:0 15px;background:${p=>p.$active?'var(--proof)':'var(--line)'};box-shadow:${p=>p.$active?'0 0 12px rgba(155,174,255,.45)':'none'};@media(max-width:680px){width:1px;height:12px;margin:0 0 0 14px;}`;
const ContentGrid = styled.div`display:grid;grid-template-columns:minmax(0,1.62fr) minmax(310px,.82fr);gap:18px;@media(max-width:850px){grid-template-columns:1fr;}`;
const PrimaryCard = styled.section`border:1px solid var(--line);background:var(--surface);border-radius:20px;padding:28px;box-shadow:0 24px 72px rgba(0,0,0,.2);`;
const CardTop = styled.div`display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:26px;`;
const CardKicker = styled.div`font-size:11px;letter-spacing:.14em;color:var(--text-secondary);font-weight:750;margin-bottom:8px;`;
const CardTitle = styled.h2`font-size:22px;letter-spacing:-.035em;margin:0;`;
const RoundBadge = styled.div`padding:8px 12px;border:1px solid rgba(155,174,255,.55);border-radius:9px;color:var(--proof);background:rgba(155,174,255,.08);font-size:13px;font-weight:700;`;
const CompanyPanel = styled.div``;
const SectionLabel = styled.div`font-size:12px;color:var(--text-secondary);margin-bottom:10px;`;
const CaseList = styled.div`display:grid;gap:8px;`;
const CaseButton = styled.button<{ $selected:boolean }>`width:100%;min-height:68px;border:1px solid ${p=>p.$selected?'var(--proof)':'var(--boundary)'};background:${p=>p.$selected?'rgba(155,174,255,.08)':'rgba(11,15,24,.28)'};border-radius:12px;display:flex;align-items:center;padding:13px 14px;text-align:left;cursor:pointer;transition:background .18s,border-color .18s;&:hover:not(:disabled){border-color:${p=>p.$selected?'var(--proof)':'var(--boundary)'};background:rgba(155,174,255,.05);}&:disabled{opacity:.48;cursor:not-allowed;}`;
const Radio = styled.span<{ $selected:boolean }>`width:20px;height:20px;flex:0 0 auto;display:grid;place-items:center;border-radius:50%;border:1px solid ${p=>p.$selected?'var(--proof)':'var(--boundary)'};color:var(--proof);margin-right:12px;`;
const CaseBody = styled.span`display:flex;min-width:0;flex-direction:column;gap:4px;`;
const CaseName = styled.strong`font-size:14px;font-weight:650;`;
const CaseHint = styled.span`font-size:12px;color:var(--text-secondary);`;
const PrivateValues = styled.span`display:flex;gap:6px;margin-left:auto;padding-left:12px;span{font:600 11px ui-monospace,SFMono-Regular,monospace;color:var(--text-secondary);background:var(--canvas);padding:5px 7px;border-radius:6px;}@media(max-width:520px){display:none;}`;
const PrivacyNote = styled.div`display:flex;gap:11px;align-items:flex-start;margin-top:16px;padding:14px;border:1px solid var(--line);border-radius:11px;background:rgba(11,15,24,.42);color:var(--text-primary);svg{flex:0 0 auto;color:var(--text-secondary);}div{display:flex;flex-direction:column;gap:4px;}strong{font-size:12px;}span{font-size:11px;color:var(--text-secondary);line-height:1.55;}`;
const ActionRow = styled.div`display:flex;gap:9px;margin-top:20px;@media(max-width:520px){flex-direction:column;}`;
const PrimaryButton = styled.button`border:0;border-radius:10px;background:var(--proof);color:var(--canvas);height:46px;padding:0 18px;display:flex;align-items:center;justify-content:center;gap:9px;font-size:13px;font-weight:760;cursor:pointer;transition:background .18s,color .18s;&:hover:not(:disabled){background:var(--proof-hover);}&:disabled{opacity:.55;cursor:not-allowed;}`;
const SecondaryButton = styled.button`border:1px solid var(--boundary);border-radius:10px;background:transparent;height:46px;padding:0 15px;display:flex;align-items:center;justify-content:center;gap:8px;font-size:12px;color:var(--text-secondary);cursor:pointer;&:hover:not(:disabled){color:var(--text-primary);border-color:var(--proof);}&:disabled{opacity:.35;cursor:not-allowed;}`;
const ProgressWrap = styled.div`display:flex;align-items:center;margin:18px 4px 0;`;
const ProgressItem = styled.div<{ $active:boolean;$current:boolean }>`display:flex;align-items:center;gap:6px;color:${p=>p.$active?'var(--proof)':'var(--text-secondary)'};font-size:11px;white-space:nowrap;flex:1;`;
const ProgressDot = styled.span`width:20px;height:20px;display:grid;place-items:center;border:1px solid currentColor;border-radius:50%;font-size:9px;`;
const ProgressLine = styled.span<{ $active:boolean }>`height:1px;flex:1;background:${p=>p.$active?'var(--proof)':'var(--line)'};margin:0 7px;`;
const ResultBox = styled.div<{ $success:boolean }>`display:flex;gap:10px;margin-top:16px;border:1px solid ${p=>p.$success?'rgba(103,215,176,.55)':'rgba(255,143,146,.55)'};background:${p=>p.$success?'rgba(103,215,176,.08)':'rgba(255,143,146,.08)'};color:${p=>p.$success?'var(--success)':'var(--danger)'};padding:14px;border-radius:11px;svg{flex:0 0 auto;}div{display:flex;flex-direction:column;gap:3px;}strong{font-size:13px;}span{font-size:11px;color:var(--text-secondary);line-height:1.55;}`;
const ConnectionNotice = styled(ResultBox)`border-color:rgba(255,196,112,.5);background:rgba(255,196,112,.07);color:var(--warning);`;
const EvidenceBox = styled.div`margin-top:10px;padding:14px;border:1px solid rgba(155,174,255,.28);border-radius:11px;background:var(--canvas);`;
const EvidenceTitle = styled.div`display:flex;align-items:center;gap:7px;margin-bottom:11px;color:var(--proof);font-size:11px;font-weight:700;letter-spacing:.05em;`;
const EvidenceGrid = styled.div`display:grid;grid-template-columns:1fr 1fr;gap:10px 16px;div{display:grid;gap:3px;min-width:0;}span{font-size:10px;color:var(--text-secondary);}code{overflow:hidden;text-overflow:ellipsis;font:10px ui-monospace,SFMono-Regular,monospace;color:var(--text-primary);white-space:nowrap;}@media(max-width:560px){grid-template-columns:1fr;}`;
const BankPanel = styled.div``;
const ApprovalVisual = styled.div<{ $approved:boolean }>`min-height:184px;border:1px solid ${p=>p.$approved?'rgba(103,215,176,.55)':'var(--line)'};border-radius:15px;background:${p=>p.$approved?'rgba(103,215,176,.06)':'rgba(11,15,24,.3)'};display:flex;align-items:center;gap:20px;padding:26px;`;
const ApprovalIcon = styled.div<{ $approved:boolean }>`width:58px;height:58px;flex:0 0 auto;display:grid;place-items:center;border-radius:50%;color:${p=>p.$approved?'var(--success)':'var(--text-secondary)'};background:${p=>p.$approved?'rgba(103,215,176,.09)':'transparent'};border:1px solid currentColor;`;
const StatusOverline = styled.div`color:var(--text-secondary);font-size:11px;margin-bottom:5px;`;
const ApprovalTitle = styled.div`font-size:28px;font-weight:720;letter-spacing:-.04em;`;
const ApprovalCopy = styled.p`color:var(--text-secondary);font-size:12px;line-height:1.6;margin:8px 0 0;`;
const PublicFacts = styled.div`display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:10px;@media(max-width:520px){grid-template-columns:1fr;}`;
const Fact = styled.div`padding:14px;border:1px solid var(--line);border-radius:10px;display:flex;flex-direction:column;gap:5px;span{font-size:11px;color:var(--text-secondary);}strong{font-size:12px;color:var(--text-primary);}`;
const SideColumn = styled.aside`display:grid;gap:18px;align-content:start;`;
const StatusCard = styled.section`border:1px solid var(--line);background:var(--surface);border-radius:20px;padding:22px;`;
const StatusHeader = styled.div`display:flex;align-items:center;justify-content:space-between;margin:3px 0 19px;color:var(--text-secondary);`;
const StatusLabel = styled.div`font-size:16px;font-weight:680;color:var(--text-primary);letter-spacing:-.025em;`;
const StatusValue = styled.div<{ $error:boolean }>`display:flex;align-items:center;gap:6px;color:${p=>p.$error?'var(--danger)':'var(--text-secondary)'};font-size:11px;margin-top:5px;`;
const LiveDot = styled.span<{ $error:boolean }>`width:6px;height:6px;border-radius:50%;background:${p=>p.$error?'var(--danger)':'var(--success)'};`;
const LedgerRows = styled.div`border-top:1px solid var(--line);`;
const LedgerRow = styled.div`min-height:46px;display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid var(--line);font-size:12px;span{color:var(--text-secondary);}strong{font-size:12px;}`;
const StateTag = styled.b<{ $approved:boolean }>`font-size:10px!important;letter-spacing:.07em;color:${p=>p.$approved?'var(--success)':'var(--text-secondary)'};background:${p=>p.$approved?'rgba(103,215,176,.09)':'rgba(169,180,198,.08)'};padding:5px 7px;border-radius:6px;`;
const DisclosureButton = styled.button`width:100%;border:0;background:transparent;color:var(--text-secondary);font-size:11px;display:flex;align-items:center;justify-content:center;gap:5px;padding:15px 0 0;cursor:pointer;&:hover{color:var(--proof);}svg{transition:.2s;}`;
const LedgerDetail = styled.div`margin-top:13px;padding:12px;border-radius:9px;background:var(--canvas);display:grid;gap:5px;`;
const DetailItem = styled.div`display:flex;align-items:end;justify-content:space-between;gap:8px;div{display:grid;gap:5px;min-width:0;}`;
const CopyButton = styled.button`width:28px;height:28px;flex:0 0 auto;display:grid;place-items:center;border:1px solid var(--line);border-radius:7px;background:transparent;color:var(--text-secondary);cursor:pointer;&:hover,&:focus-visible{color:var(--proof);border-color:var(--proof);outline:none;}`;
const SmallLabel = styled.span`font-size:10px;color:var(--text-secondary);text-transform:uppercase;letter-spacing:.08em;margin-top:4px;`;
const CodeText = styled.code`font:10px ui-monospace,SFMono-Regular,monospace;color:var(--text-secondary);word-break:break-all;`;
const PolicyCard = styled.section`border:1px solid var(--line);background:var(--surface);border-radius:20px;padding:22px;`;
const PolicyIcon = styled.div`width:38px;height:38px;display:grid;place-items:center;color:var(--proof);border:1px solid rgba(155,174,255,.55);border-radius:10px;float:right;`;
const PolicyTitle = styled.h3`font-size:16px;margin:0;`;
const Formula = styled.div`display:flex;align-items:center;justify-content:center;gap:15px;margin:20px 0 13px;padding:17px;border-radius:11px;background:var(--canvas);font:650 18px ui-monospace,SFMono-Regular,monospace;span:first-of-type{color:var(--proof);}b{font-weight:400;color:var(--text-secondary);}`;
const FormulaNote = styled.p`font-size:11px;line-height:1.65;color:var(--text-secondary);margin:0;`;
const FooterBar = styled.footer`display:flex;align-items:center;gap:12px;margin-top:18px;color:var(--text-secondary);font-size:11px;text-transform:uppercase;letter-spacing:.08em;`;
const FooterRule = styled.span`height:1px;background:var(--line);flex:1;`;
const FooterButton = styled.button`border:0;background:transparent;color:var(--text-secondary);display:flex;align-items:center;gap:6px;font-size:11px;cursor:pointer;text-transform:uppercase;letter-spacing:.05em;&:hover:not(:disabled){color:var(--proof);}&:disabled{opacity:.4;}`;
const FooterMeta = styled.span`@media(max-width:560px){display:none;}`;
