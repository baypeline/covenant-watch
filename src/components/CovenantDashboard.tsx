'use client';

import styled from '@emotion/styled';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertCircle, Check, ChevronDown, Copy, RefreshCw, RotateCcw } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { advanceSnapshot, getLedgerState, getVerification, getVerificationByRequestId, resetDemo, startVerification, watchVerification } from '@/lib/api';
import { SiteHeader } from '@/components/SiteHeader';
import { useCovenantStore } from '@/stores/useCovenantStore';
import type { CaseId, CovenantErrorCode, LedgerState, OperationPhase, VerificationOperation, ViewMode } from '@/types/covenant';
import { cases } from '@/types/covenant';

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

type RequestStep = 'intro' | 'select' | 'review';

export function CovenantDashboard({ view, requestStep = 'intro' }: { view: ViewMode; requestStep?: RequestStep }) {
  const queryClient = useQueryClient();
  const { selectedCase, setSelectedCase, phase, setPhase } = useCovenantStore();
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
      const saved = { operationId: accepted.operationId, requestId, contractAddress: state.contractAddress };
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
  const periodLabel = state?.currentRound ? `${state.currentRound}기` : '확인 중';
  const statusLabel = stateQuery.isError
    ? '확인 불가'
    : !state
      ? '확인 중'
      : isCurrentApproved
        ? '약정 충족'
        : view === 'company'
          ? '검증 가능'
          : '승인 대기';
  const requestHeading = requestStep === 'intro'
    ? '약속한 현금 기준을 지켰는지 확인합니다'
    : requestStep === 'select'
      ? '확인할 자료를 선택합니다'
      : '요청 내용을 확인합니다';
  const requestDescription = requestStep === 'intro'
    ? '실제 금액은 금융기관에 보여주지 않고, 기준을 지켰는지만 전달합니다.'
    : requestStep === 'select'
      ? `현재 ${periodLabel}에 해당하는 재무 자료를 선택합니다.`
      : '선택한 자료와 공개 범위를 확인한 뒤 검증을 요청합니다.';
  const selectedCaseData = cases[selectedCase];

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
      const recovered = saved.operationId ? await getVerification(saved.operationId) : await getVerificationByRequestId(saved.requestId);
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
      <SiteHeader />
      <Main>
        {view === 'company' && <RequestSteps current={requestStep} />}
        <RecordHeader>
          <RecordHeading>
            <PageTitle>{view === 'company' ? requestHeading : `${periodLabel} 검증 결과`}</PageTitle>
            <PageDescription>{view === 'company' ? requestDescription : '회사가 요청한 약정 검증 결과입니다. 실제 금액은 표시되지 않습니다.'}</PageDescription>
          </RecordHeading>
          {view === 'bank' && <RecordStatus $approved={isCurrentApproved} $error={stateQuery.isError}>{statusLabel}</RecordStatus>}
        </RecordHeader>

        {view === 'bank' && <RecordMeta aria-label="현재 약정 요약">
          <MetaItem><dt>검증 대상</dt><dd>{periodLabel}</dd></MetaItem>
          <MetaItem><dt>기준을 충족한 기간</dt><dd>{state?.approvedRound ? `${state.approvedRound}기` : '없음'}</dd></MetaItem>
          <MetaItem><dt>정보 확인 시각</dt><dd>{state ? formatDateTime(state.updatedAt) : '—'}</dd></MetaItem>
        </RecordMeta>}

        <Content>
          {view === 'company' ? (
            <>
              {requestStep === 'intro' && <>
                <IntroStatement>
                  <strong>금융기관은 결과만 확인합니다.</strong>
                  <span>회사가 선택한 현금과 지급예정액은 외부에 공개되지 않습니다.</span>
                </IntroStatement>
                <ExplanationList aria-label="검증 과정">
                  <ExplanationRow><strong>회사가 재무 자료를 선택합니다</strong><span>현재 기간에 해당하는 내부 자료를 선택합니다.</span></ExplanationRow>
                  <ExplanationRow><strong>시스템이 조건을 확인합니다</strong><span>회사 내부의 금액으로 계산하지만 금액 자체는 저장하지 않습니다.</span></ExplanationRow>
                  <ExplanationRow><strong>금융기관은 결과를 확인합니다</strong><span>금융기관에는 확인한 기간과 충족 여부만 전달됩니다.</span></ExplanationRow>
                </ExplanationList>
                <DisclosureGroup>
                  <NativeDisclosure><summary>어떤 기준으로 확인합니까?</summary><p>사용제한 없는 현금이 향후 30일 지급예정액의 120% 이상인지 확인합니다.</p></NativeDisclosure>
                  <NativeDisclosure><summary>어떤 정보가 공개됩니까?</summary><p>기간, 승인 상태, 자료 커밋먼트만 공개됩니다. 현금, 지급예정액, 비밀값은 공개되지 않습니다.</p></NativeDisclosure>
                </DisclosureGroup>
                <PageActions><PrimaryLink href="/request/select">검증 시작</PrimaryLink></PageActions>
              </>}

              {requestStep === 'select' && <RecordSection>
                  <CaseList role="radiogroup" aria-label="검증할 자료">
                    {(Object.keys(cases) as CaseId[]).map((caseId) => {
                      const item = cases[caseId];
                      const unavailable = !state || item.round > state.currentRound || (caseId === 'round-1-stale' && state.currentRound < 2);
                      const selected = caseId === selectedCase;
                      return (
                        <CaseButton key={caseId} type="button" role="radio" aria-checked={selected} $selected={selected} disabled={busy || unavailable} onClick={() => { setSelectedCase(caseId); setResult(null); setOperation(null); }}>
                          <RadioMark $selected={selected}>{selected && <Check size={13} />}</RadioMark>
                          <CaseCopy><CaseName>{item.label}</CaseName><CaseHint>{unavailable ? '현재 기간에는 선택할 수 없습니다.' : item.helper}</CaseHint></CaseCopy>
                          <PrivateAmounts aria-label="회사 내부 재무 값"><span><small>현금</small>{item.cash}</span><span><small>지급예정</small>{item.payments}</span></PrivateAmounts>
                        </CaseButton>
                      );
                    })}
                  </CaseList>
                  <SelectionNote>금액 단위는 백만원이며, 선택한 값은 금융기관에 공개되지 않습니다.</SelectionNote>
                  <PageActions><BackLink href="/request">이전</BackLink><PrimaryLink href="/request/review">선택 내용 확인</PrimaryLink></PageActions>
                </RecordSection>}

              {requestStep === 'review' && <RecordSection>
                  <SectionTitle>선택한 자료</SectionTitle>
                  <SummaryList>
                    <SummaryRow><dt>검증 기간</dt><dd>{selectedCaseData.round}기</dd></SummaryRow>
                    <SummaryRow><dt>자료 구분</dt><dd>{selectedCaseData.label.replace(/^\d기 · /, '')}</dd></SummaryRow>
                    <SummaryRow><dt>현금</dt><dd>{selectedCaseData.cash}백만원</dd></SummaryRow>
                    <SummaryRow><dt>지급예정액</dt><dd>{selectedCaseData.payments}백만원</dd></SummaryRow>
                  </SummaryList>
                  <PrivacyNotice><strong>금융기관에는 금액이 공개되지 않습니다.</strong><span>검증 결과와 현재 기간만 원장에 기록됩니다.</span></PrivacyNotice>
                  {phase !== 'idle' && <Progress phase={phase} />}
                  {result && <ResultPanel result={result} state={state} />}
                  {requestMessage && !result && <ConnectionNotice $success={false}><AlertCircle size={19} /><div><strong>상태 확인이 필요합니다</strong><span>{requestMessage}</span></div></ConnectionNotice>}
                  {operation && <OperationEvidence operation={operation} />}
                  <RequestFooter>
                    <RequestFootnote>요청 후 증명 생성과 원장 확정까지 시간이 걸릴 수 있습니다.</RequestFootnote>
                    <ActionGroup>
                      {phase === 'unknown' && (operation || savedRequest) ? (
                        <SecondaryButton type="button" onClick={() => void refreshOperation()}><RefreshCw size={16} /> 상태 다시 확인</SecondaryButton>
                      ) : state?.operatorActionsEnabled ? (
                        <SecondaryButton type="button" disabled={busy || state.currentRound !== 1} onClick={() => advanceMutation.mutate()}>2기 자료 등록</SecondaryButton>
                      ) : null}
                      {!busy && phase === 'idle' && <BackLink href="/request/select">자료 다시 선택</BackLink>}
                      <PrimaryButton type="button" disabled={busy || !state} onClick={() => verifyMutation.mutate(selectedCase)}>{verifyMutation.isPending ? phaseLabel(phase) : '검증 요청'}</PrimaryButton>
                    </ActionGroup>
                  </RequestFooter>
                </RecordSection>}
            </>
          ) : (
            <>
              <StatusNotice $approved={isCurrentApproved} $error={stateQuery.isError}>
                <strong>{stateQuery.isError ? '최신 원장 상태를 확인할 수 없습니다' : !state ? '원장 상태를 확인하고 있습니다' : isCurrentApproved ? '현재 기간의 약정을 충족했습니다' : '현재 기간에 확정된 승인이 없습니다'}</strong>
                <span>{stateQuery.isError ? '연결을 복구한 뒤 다시 확인해야 합니다.' : !state ? '원장 응답을 기다리고 있습니다.' : isCurrentApproved ? '약정 충족 증명이 공개 원장에 확정되었습니다.' : '이전 기간의 승인은 현재 기간의 승인으로 인정하지 않습니다.'}</span>
              </StatusNotice>

              <RecordSection>
                <SectionTitle>약정 정보</SectionTitle>
                <SummaryList>
                  <SummaryRow><dt>검증 대상</dt><dd>{periodLabel}</dd></SummaryRow>
                  <SummaryRow><dt>검증 결과</dt><dd>{isCurrentApproved ? '기준 충족' : '아직 승인되지 않음'}</dd></SummaryRow>
                </SummaryList>
              </RecordSection>

              <RecordSection>
                <SectionTitle>최근 기록</SectionTitle>
                <HistoryList>
                  <HistoryRow><time>{state ? formatDateTime(state.updatedAt) : '—'}</time><div><strong>원장 상태 확인</strong><span>현재 기간과 승인 상태를 조회했습니다.</span></div></HistoryRow>
                  {state?.lastTransactionId && <HistoryRow><time>최근 거래</time><div><strong>약정 승인 기록</strong><code>{shorten(state.lastTransactionId)}</code></div></HistoryRow>}
                </HistoryList>
              </RecordSection>
            </>
          )}

          {view === 'bank' && <LedgerDisclosure>
              <DisclosureButton type="button" onClick={() => setShowLedger((value) => !value)} aria-expanded={showLedger}>
                <span><strong>기술 정보</strong><small>계약 주소와 원장 식별자를 확인합니다.</small></span>
                <ChevronDown size={18} aria-hidden="true" style={{ transform: showLedger ? 'rotate(180deg)' : undefined }} />
              </DisclosureButton>
              {showLedger && <LedgerDetail><LedgerDetailItem label="네트워크" value={state ? `${state.mode === 'midnight' ? 'Midnight' : 'Demo'} · ${state.network}` : undefined} /><LedgerDetailItem label="자료 커밋먼트" value={state?.snapshotCommitment} /><LedgerDetailItem label="마지막 거래" value={state?.lastTransactionId ?? undefined} /><LedgerDetailItem label="계약 주소" value={state?.contractAddress} /></LedgerDetail>}
          </LedgerDisclosure>}
        </Content>
        {view === 'company' && state?.operatorActionsEnabled && <PageFooter><span /><ResetButton type="button" disabled={busy} onClick={() => resetMutation.mutate()}><RotateCcw size={14} /> 데모 초기화</ResetButton></PageFooter>}
      </Main>
    </PageShell>
  );
}

function RequestSteps({ current }: { current: RequestStep }) {
  const steps: Array<{ key: RequestStep; label: string; href: string }> = [
    { key: 'intro', label: '안내', href: '/request' },
    { key: 'select', label: '자료 선택', href: '/request/select' },
    { key: 'review', label: '요청 확인', href: '/request/review' },
  ];
  const currentIndex = steps.findIndex((step) => step.key === current);
  return <StepNavigation aria-label="검증 요청 단계"><ol>{steps.map((step, index) => <StepItem key={step.key} $active={step.key === current} $complete={index < currentIndex}><StepLink href={step.href} aria-current={step.key === current ? 'step' : undefined}><span>{index < currentIndex ? <Check size={11} /> : index + 1}</span>{step.label}</StepLink></StepItem>)}</ol></StepNavigation>;
}

function Progress({ phase }: { phase: OperationPhase }) {
  const steps = [{ key: 'proving', label: '증명 생성' }, { key: 'submitting', label: '거래 제출' }, { key: 'confirming', label: '원장 확정' }];
  const effectivePhase = phase === 'confirmed' ? 'confirming' : phase;
  const current = phase === 'rejected' || phase === 'error' || phase === 'unknown' ? 0 : Math.max(0, steps.findIndex((step) => step.key === effectivePhase));
  return <ProgressSection aria-live="polite"><ProgressHeading><span>요청 진행 상태</span><strong>{phaseLabel(phase)}</strong></ProgressHeading><ProgressTrack>{steps.map((step, index) => <ProgressItem key={step.key} $active={index <= current} $current={index === current}><ProgressDot>{index < current ? <Check size={11} /> : index + 1}</ProgressDot><span>{step.label}</span>{index < steps.length - 1 && <ProgressLine $active={index < current} />}</ProgressItem>)}</ProgressTrack></ProgressSection>;
}

function OperationEvidence({ operation }: { operation: VerificationOperation }) {
  return <EvidenceBox><EvidenceTitle>요청 증거</EvidenceTitle><EvidenceGrid><div><span>작업 ID</span><code>{operation.operationId}</code></div><div><span>제출 기간</span><code>{operation.submittedRound}기</code></div><div><span>거래 ID</span><code>{operation.transactionId ?? '거래 생성 전'}</code></div><div><span>마지막 확인</span><code>{formatTime(operation.updatedAt)}</code></div></EvidenceGrid></EvidenceBox>;
}

function LedgerDetailItem({ label, value }: { label: string; value?: string }) {
  return <DetailItem><div><SmallLabel>{label}</SmallLabel><CodeText>{shorten(value)}</CodeText></div>{value && <CopyButton type="button" aria-label={`${label} 복사`} onClick={() => void navigator.clipboard.writeText(value)}><Copy size={14} /></CopyButton>}</DetailItem>;
}

function ResultPanel({ result, state }: { result: { ok: boolean; code?: CovenantErrorCode }; state?: LedgerState }) {
  const copy = result.code ? errorCopy[result.code] : null;
  const approvalLabel = state?.mode === 'midnight' ? '원장 승인 완료' : '데모 승인 완료';
  return <ResultBox $success={result.ok}>{result.ok ? <Check size={19} /> : <AlertCircle size={19} />}<div><strong>{result.ok ? `${state?.currentRound ?? ''}기 ${approvalLabel}` : copy?.title}</strong><span>{result.ok ? '공개 원장 상태에 현재 기간 승인이 반영되었습니다.' : copy?.body}</span></div></ResultBox>;
}

function phaseLabel(phase: string) {
  const labels: Record<string, string> = { idle: '검증 대기', queued: '작업 접수됨', proving: '증명 생성 중', submitting: '거래 제출 중', confirming: '원장 확정 확인 중', confirmed: '원장 확정', rejected: '조건 불충족', error: '제출 전 처리 오류', unknown: '확정 여부 확인 필요' };
  return labels[phase] ?? phase;
}

function shorten(value?: string) { return value ? `${value.slice(0, 12)}…${value.slice(-8)}` : '—'; }
function formatTime(value: string) { return new Date(value).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' }); }
function formatDateTime(value: string) { return new Date(value).toLocaleString('ko-KR', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }); }

const PageShell = styled.div`min-height:100vh;background:var(--color-canvas);`;
const Main = styled.main`width:min(940px,calc(100% - 40px));margin:0 auto;padding:42px 0 28px;@media(max-width:720px){padding-top:30px;}`;
const StepNavigation = styled.nav`width:min(720px,100%);margin-bottom:34px;ol{display:grid;grid-template-columns:repeat(3,1fr);border-bottom:1px solid var(--color-border);}`;
const StepItem = styled.li<{ $active:boolean;$complete:boolean }>`position:relative;padding-bottom:12px;color:${p=>p.$active?'var(--color-text-primary)':p.$complete?'var(--color-action)':'var(--color-text-secondary)'};&::after{content:'';position:absolute;right:0;bottom:-1px;left:0;height:2px;background:${p=>p.$active?'var(--color-action)':'transparent'};}`;
const StepLink = styled(Link)`display:flex;align-items:center;gap:8px;font-size:12px;font-weight:650;span{width:19px;height:19px;display:grid;place-items:center;border:1px solid currentColor;border-radius:50%;font-size:10px;}@media(max-width:460px){gap:5px;font-size:11px;}`;
const RecordHeader = styled.header`display:flex;align-items:flex-start;justify-content:space-between;gap:28px;padding-bottom:26px;@media(max-width:560px){gap:16px;}`;
const RecordHeading = styled.div`min-width:0;`;
const PageTitle = styled.h1`color:var(--color-text-primary);font-size:clamp(27px,4vw,34px);font-weight:720;line-height:1.2;letter-spacing:-.044em;`;
const PageDescription = styled.p`margin-top:8px;color:var(--color-text-secondary);font-size:14px;line-height:1.6;letter-spacing:-.012em;`;
const RecordStatus = styled.span<{ $approved:boolean;$error:boolean }>`flex:0 0 auto;margin-top:4px;padding:5px 8px;border-radius:3px;color:${p=>p.$error?'var(--color-danger)':p.$approved?'var(--color-success)':'var(--color-warning)'};background:${p=>p.$error?'var(--color-danger-bg)':p.$approved?'var(--color-success-bg)':'var(--color-warning-bg)'};font-size:12px;font-weight:720;`;
const RecordMeta = styled.dl`display:grid;grid-template-columns:repeat(3,1fr);border-top:1px solid var(--color-border-strong);border-bottom:1px solid var(--color-border);@media(max-width:600px){grid-template-columns:1fr;}`;
const MetaItem = styled.div`min-height:74px;padding:16px 20px;border-right:1px solid var(--color-border);display:grid;align-content:center;gap:4px;&:first-of-type{padding-left:0;}&:last-of-type{border-right:0;}dt{color:var(--color-text-secondary);font-size:11px;}dd{color:var(--color-text-primary);font-size:14px;font-weight:650;}@media(max-width:600px){min-height:58px;padding:11px 0;border-right:0;border-bottom:1px solid var(--color-border);&:last-of-type{border-bottom:0;}}`;
const Content = styled.div`width:min(720px,100%);display:grid;gap:38px;padding-top:38px;`;
const RecordSection = styled.section`background:transparent;`;
const IntroStatement = styled.section`padding:22px 0;border-top:1px solid var(--color-border-strong);border-bottom:1px solid var(--color-border);display:grid;gap:6px;strong{color:var(--color-text-primary);font-size:20px;font-weight:700;letter-spacing:-.035em;}span{color:var(--color-text-secondary);font-size:13px;line-height:1.6;}`;
const ExplanationList = styled.ol`border-bottom:1px solid var(--color-border);`;
const ExplanationRow = styled.li`display:grid;grid-template-columns:240px minmax(0,1fr);gap:24px;padding:18px 4px;border-bottom:1px solid var(--color-border);&:last-of-type{border-bottom:0;}strong{color:var(--color-text-primary);font-size:13px;font-weight:660;}span{color:var(--color-text-secondary);font-size:12px;line-height:1.55;}@media(max-width:560px){grid-template-columns:1fr;gap:5px;}`;
const DisclosureGroup = styled.div`display:grid;border-top:1px solid var(--color-border);`;
const NativeDisclosure = styled.details`border-bottom:1px solid var(--color-border);summary{padding:15px 4px;color:var(--color-text-primary);font-size:13px;font-weight:650;cursor:pointer;}p{max-width:620px;padding:0 4px 16px;color:var(--color-text-secondary);font-size:12px;line-height:1.65;}`;
const PageActions = styled.div`display:flex;align-items:center;justify-content:flex-end;gap:10px;padding-top:2px;`;
const PrimaryLink = styled(Link)`min-height:44px;padding:0 18px;display:inline-flex;align-items:center;justify-content:center;border-radius:5px;color:var(--color-on-action);background:var(--color-action);font-size:13px;font-weight:720;&:hover{background:var(--color-action-hover);}`;
const BackLink = styled(Link)`min-height:44px;padding:0 10px;display:inline-flex;align-items:center;justify-content:center;color:var(--color-text-secondary);font-size:12px;font-weight:620;&:hover{color:var(--color-text-primary);}`;
const SectionTitle = styled.h2`color:var(--color-text-primary);font-size:18px;font-weight:700;letter-spacing:-.035em;`;
const CaseList = styled.div`border-top:1px solid var(--color-border);`;
const CaseButton = styled.button<{ $selected:boolean }>`width:100%;min-height:76px;padding:13px 10px;display:flex;align-items:center;border:0;border-bottom:1px solid var(--color-border);border-radius:0;color:var(--color-text-primary);background:${p=>p.$selected?'var(--color-action-subtle)':'transparent'};text-align:left;cursor:pointer;transition:background 120ms ease;&:hover:not(:disabled){background:var(--color-action-subtle-hover);}&:disabled{opacity:.46;cursor:not-allowed;}`;
const RadioMark = styled.span<{ $selected:boolean }>`width:21px;height:21px;display:grid;place-items:center;flex:0 0 auto;margin-right:12px;border:1px solid ${p=>p.$selected?'var(--color-action)':'var(--color-border-strong)'};border-radius:50%;color:var(--color-on-action);background:${p=>p.$selected?'var(--color-action)':'transparent'};`;
const CaseCopy = styled.span`min-width:0;display:flex;flex-direction:column;gap:4px;`;
const CaseName = styled.strong`font-size:14px;font-weight:670;`;
const CaseHint = styled.span`color:var(--color-text-secondary);font-size:12px;`;
const PrivateAmounts = styled.span`display:flex;gap:18px;margin-left:auto;padding-left:18px;>span{min-width:44px;display:grid;gap:2px;color:var(--color-text-primary);font:650 12px/1.2 ui-monospace,SFMono-Regular,monospace;}small{color:var(--color-text-secondary);font:500 9px/1.2 var(--font-pretendard);}@media(max-width:520px){display:none;}`;
const SelectionNote = styled.p`margin-top:12px;color:var(--color-text-secondary);font-size:11px;line-height:1.6;`;
const RequestFooter = styled.div`display:flex;align-items:flex-end;justify-content:space-between;gap:20px;margin-top:22px;padding-top:20px;border-top:1px solid var(--color-border);@media(max-width:660px){align-items:stretch;flex-direction:column;}`;
const RequestFootnote = styled.p`max-width:320px;color:var(--color-text-secondary);font-size:11px;line-height:1.55;`;
const ActionGroup = styled.div`display:flex;justify-content:flex-end;gap:8px;@media(max-width:520px){flex-direction:column-reverse;}`;
const PrimaryButton = styled.button`height:44px;padding:0 17px;display:flex;align-items:center;justify-content:center;gap:9px;border:0;border-radius:5px;color:var(--color-on-action);background:var(--color-action);font-size:13px;font-weight:720;cursor:pointer;&:hover:not(:disabled){background:var(--color-action-hover);}&:disabled{opacity:.52;cursor:not-allowed;}`;
const SecondaryButton = styled.button`height:44px;padding:0 14px;display:flex;align-items:center;justify-content:center;gap:7px;border:1px solid var(--color-border-strong);border-radius:5px;color:var(--color-text-secondary);background:transparent;font-size:12px;font-weight:620;cursor:pointer;&:hover:not(:disabled){color:var(--color-text-primary);border-color:var(--color-action);}&:disabled{opacity:.38;cursor:not-allowed;}`;
const ProgressSection = styled.section`margin-top:18px;padding:16px 0;border-bottom:1px solid var(--color-border);`;
const ProgressHeading = styled.div`display:flex;align-items:center;justify-content:space-between;margin-bottom:13px;font-size:12px;span{color:var(--color-text-secondary);}strong{color:var(--color-text-primary);font-weight:650;}`;
const ProgressTrack = styled.div`display:flex;align-items:center;`;
const ProgressItem = styled.div<{ $active:boolean;$current:boolean }>`display:flex;align-items:center;gap:6px;flex:1;color:${p=>p.$active?'var(--color-action)':'var(--color-text-secondary)'};font-size:11px;font-weight:${p=>p.$current?680:520};white-space:nowrap;`;
const ProgressDot = styled.span`width:19px;height:19px;display:grid;place-items:center;flex:0 0 auto;border:1px solid currentColor;border-radius:50%;font-size:9px;`;
const ProgressLine = styled.span<{ $active:boolean }>`height:1px;flex:1;margin:0 7px;background:${p=>p.$active?'var(--color-action)':'var(--color-border)'};`;
const ResultBox = styled.div<{ $success:boolean }>`display:flex;align-items:flex-start;gap:10px;margin-top:14px;padding:14px;border:1px solid ${p=>p.$success?'var(--color-success-border)':'var(--color-danger-border)'};border-radius:4px;color:${p=>p.$success?'var(--color-success)':'var(--color-danger)'};background:${p=>p.$success?'var(--color-success-bg)':'var(--color-danger-bg)'};svg{flex:0 0 auto;}div{display:grid;gap:4px;}strong{font-size:13px;font-weight:680;}span{color:var(--color-text-secondary);font-size:12px;line-height:1.55;}`;
const ConnectionNotice = styled(ResultBox)`border-color:var(--color-warning-border);color:var(--color-warning);background:var(--color-warning-bg);`;
const EvidenceBox = styled.div`margin-top:14px;padding:15px 0;border-top:1px solid var(--color-border);border-bottom:1px solid var(--color-border);`;
const EvidenceTitle = styled.div`margin-bottom:10px;color:var(--color-text-primary);font-size:12px;font-weight:680;`;
const EvidenceGrid = styled.div`display:grid;grid-template-columns:1fr 1fr;gap:10px 16px;div{display:grid;gap:3px;min-width:0;}span{color:var(--color-text-secondary);font-size:10px;}code{overflow:hidden;color:var(--color-text-primary);font:11px ui-monospace,SFMono-Regular,monospace;text-overflow:ellipsis;white-space:nowrap;}@media(max-width:560px){grid-template-columns:1fr;}`;
const SummaryList = styled.dl`margin-top:16px;border-top:1px solid var(--color-border);`;
const SummaryRow = styled.div`display:grid;grid-template-columns:150px minmax(0,1fr);gap:20px;padding:14px 4px;border-bottom:1px solid var(--color-border);dt{color:var(--color-text-secondary);font-size:12px;font-weight:560;}dd{color:var(--color-text-primary);font-size:13px;line-height:1.55;}@media(max-width:520px){grid-template-columns:1fr;gap:4px;padding:12px 2px;}`;
const PrivacyNotice = styled.div`margin-top:16px;padding:14px 16px;border-left:3px solid var(--color-action);background:var(--color-action-subtle);display:grid;gap:3px;strong{color:var(--color-text-primary);font-size:12px;font-weight:680;}span{color:var(--color-text-secondary);font-size:11px;line-height:1.55;}`;
const StatusNotice = styled.section<{ $approved:boolean;$error:boolean }>`padding:17px 18px;border-left:3px solid ${p=>p.$error?'var(--color-danger)':p.$approved?'var(--color-success)':'var(--color-warning)'};background:${p=>p.$error?'var(--color-danger-bg)':p.$approved?'var(--color-success-bg)':'var(--color-warning-bg)'};display:grid;gap:4px;strong{color:var(--color-text-primary);font-size:15px;font-weight:700;}span{color:var(--color-text-secondary);font-size:12px;line-height:1.55;}`;
const HistoryList = styled.ol`margin-top:16px;border-top:1px solid var(--color-border);`;
const HistoryRow = styled.li`display:grid;grid-template-columns:118px minmax(0,1fr);gap:20px;padding:14px 4px;border-bottom:1px solid var(--color-border);time{color:var(--color-text-secondary);font-size:11px;}div{min-width:0;display:grid;gap:3px;}strong{color:var(--color-text-primary);font-size:13px;font-weight:650;}span{color:var(--color-text-secondary);font-size:12px;}code{overflow:hidden;color:var(--color-text-secondary);font:11px ui-monospace,SFMono-Regular,monospace;text-overflow:ellipsis;white-space:nowrap;}@media(max-width:520px){grid-template-columns:1fr;gap:4px;}`;
const LedgerDisclosure = styled.section`border-top:1px solid var(--color-border);border-bottom:1px solid var(--color-border);`;
const DisclosureButton = styled.button`width:100%;min-height:62px;padding:12px 4px;display:flex;align-items:center;justify-content:space-between;gap:16px;border:0;color:var(--color-text-primary);background:transparent;text-align:left;cursor:pointer;>span{display:grid;gap:3px;}strong{font-size:13px;font-weight:660;}small{color:var(--color-text-secondary);font-size:11px;}svg{color:var(--color-text-secondary);transition:transform 160ms ease;}&:hover{background:var(--color-surface-muted);}`;
const LedgerDetail = styled.div`display:grid;gap:7px;padding:0 16px 16px;`;
const DetailItem = styled.div`min-height:54px;padding:10px 0;display:flex;align-items:center;justify-content:space-between;gap:10px;border-top:1px solid var(--color-border);>div{min-width:0;display:grid;gap:5px;}`;
const SmallLabel = styled.span`color:var(--color-text-secondary);font-size:10px;`;
const CodeText = styled.code`color:var(--color-text-primary);font:10px ui-monospace,SFMono-Regular,monospace;word-break:break-all;`;
const CopyButton = styled.button`width:30px;height:30px;display:grid;place-items:center;flex:0 0 auto;border:0;border-radius:4px;color:var(--color-text-secondary);background:var(--color-surface-muted);cursor:pointer;&:hover{color:var(--color-action);}`;
const PageFooter = styled.footer`width:min(720px,100%);min-height:54px;margin-top:10px;display:flex;align-items:center;justify-content:space-between;color:var(--color-text-secondary);font-size:11px;`;
const ResetButton = styled.button`display:flex;align-items:center;gap:6px;border:0;color:var(--color-text-secondary);background:transparent;font-size:11px;cursor:pointer;&:hover:not(:disabled){color:var(--color-action);}&:disabled{opacity:.4;cursor:not-allowed;}`;
