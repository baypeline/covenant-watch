'use client';

import styled from '@emotion/styled';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertCircle, Check, ChevronDown, Copy, RefreshCw, RotateCcw } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { advanceSnapshot, getLedgerState, getVerification, getVerificationByRequestId, resetDemo, startVerification, watchVerification } from '@/lib/api';
import { SiteFooter } from '@/components/SiteFooter';
import { SiteHeader } from '@/components/SiteHeader';
import { useCovenantStore } from '@/stores/useCovenantStore';
import type { CaseId, CovenantErrorCode, LedgerState, OperationPhase, VerificationOperation, ViewMode } from '@/types/covenant';
import { cases } from '@/types/covenant';

const errorCopy: Record<CovenantErrorCode, { title: string; body: string }> = {
  INSUFFICIENT_CASH: { title: '약정 기준을 충족하지 못했습니다', body: '다른 자료를 선택하거나 재무 상태를 확인한 뒤 다시 요청할 수 있습니다.' },
  STALE_DATA: { title: '현재 기간의 자료가 아닙니다', body: '현재 검증 기간에 등록된 자료를 선택한 뒤 다시 요청하십시오.' },
  DATA_MISMATCH: { title: '등록된 자료와 일치하지 않습니다', body: '현재 원장에 등록된 검증 자료를 선택한 뒤 다시 요청하십시오.' },
  UNAUTHORIZED: { title: '요청 권한을 확인할 수 없습니다', body: '담당자 권한을 확인한 뒤 다시 요청하십시오.' },
  ALREADY_APPROVED: { title: '이미 검증이 완료된 기간입니다', body: '결과 확인에서 원장에 확정된 검증 결과를 확인할 수 있습니다.' },
};

interface SavedRequest {
  operationId?: string;
  requestId: string;
  contractAddress: string;
}

type RequestStep = 'intro' | 'select' | 'review';

export function CovenantDashboard({ view, requestStep = 'intro' }: { view: ViewMode; requestStep?: RequestStep }) {
  const router = useRouter();
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
      setRequestMessage(error instanceof Error ? error.message : '연결 오류로 요청 결과를 확인하지 못했습니다.');
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
      sessionStorage.removeItem('covenant-watch:operation');
      queryClient.setQueryData(['ledger-state'], state);
      setSelectedCase('round-1-pass');
      setPhase('idle');
      setResult(null);
      setOperation(null);
      setSavedRequest(null);
      setRequestMessage(null);
      router.push('/request');
    },
  });

  const state = stateQuery.isError ? undefined : stateQuery.data;
  const isCurrentApproved = Boolean(state && state.approvedRound === state.currentRound);
  const hasUncertainRequest = phase === 'unknown' && Boolean(operation || savedRequest);
  const busy = verifyMutation.isPending || advanceMutation.isPending || resetMutation.isPending || hasUncertainRequest;
  const periodLabel = state?.currentRound ? `${state.currentRound}기` : '—';
  const statusLabel = stateQuery.isError
    ? '확인 불가'
    : !state
      ? '확인 중'
      : isCurrentApproved
        ? '약정 충족'
        : view === 'company'
          ? '검증 가능'
          : '검증 결과 없음';
  const selectionPeriod = state ? `현재 검증 기간은 ${periodLabel}입니다.` : '현재 검증 기간을 확인하고 있습니다.';
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
      setRequestMessage('연결 오류로 요청 결과를 확인하지 못했습니다.');
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
      setRequestMessage('접수 또는 거래 결과가 불명확합니다.');
    }
  }

  return (
    <PageShell>
      <SiteHeader />
      <Main>
        {view === 'company' && <RequestSteps current={requestStep} />}
        {view === 'bank' && <RecordHeader>
          <RecordHeading>
            <PageTitle>금융약정 검증 결과</PageTitle>
            <PageDescription>현재 기간에 원장에 확정된 약정 검증 결과를 확인합니다. 실제 금액은 공개되지 않습니다.</PageDescription>
          </RecordHeading>
          <RecordStatus $approved={isCurrentApproved} $error={stateQuery.isError}>{statusLabel}</RecordStatus>
        </RecordHeader>}

        {view === 'bank' && <RecordMeta aria-label="현재 약정 요약">
          <MetaItem><dt>현재 검증 기간</dt><dd>{periodLabel}</dd></MetaItem>
          <MetaItem><dt>최근 약정 충족 기간</dt><dd>{state ? state.approvedRound ? `${state.approvedRound}기` : '없음' : '—'}</dd></MetaItem>
          <MetaItem><dt>마지막 조회</dt><dd>{state ? formatDateTime(state.updatedAt) : '—'}</dd></MetaItem>
        </RecordMeta>}

        <Content $compactTop={view === 'company'}>
          {view === 'company' ? (
            <>
              {requestStep === 'intro' && <>
                <IntroStatement>
                  <IntroTitle>실제 금액은 금융기관에 공개되지 않습니다.</IntroTitle>
                  <IntroDescription>회사는 보유 현금과 향후 30일 지급예정액을 검증에 사용합니다. 금융기관과 공개 원장에는 실제 금액 대신 약정 충족 여부만 표시됩니다.</IntroDescription>
                </IntroStatement>
                <ExplanationList aria-label="검증 진행 안내">
                  <ExplanationRow><strong>현재 기간에 맞는 재무 자료를 선택합니다</strong><span>화면에 표시된 현재 검증 기간과 같은 기간의 자료를 선택합니다. 기간이 다르거나 원장에 등록한 자료와 일치하지 않으면 검증을 진행할 수 없습니다.</span></ExplanationRow>
                  <ExplanationRow><strong>실제 금액으로 약정 기준을 확인합니다</strong><span>선택한 자료의 사용제한 없는 현금과 향후 30일 지급예정액으로 증명을 만듭니다. 실제 금액과 비밀값은 금융기관이나 공개 원장에 표시되지 않습니다.</span></ExplanationRow>
                  <ExplanationRow><strong>충족한 결과만 원장에 확정합니다</strong><span>기준을 충족하면 해당 기간의 약정 충족 기록과 거래 ID가 원장에 남습니다. 충족하지 못하면 기록은 생성되지 않으며, 회사 화면에서 이유와 다음 행동을 확인할 수 있습니다.</span></ExplanationRow>
                </ExplanationList>
                <DisclosureGroup>
                  <NativeDisclosure><summary>어떤 기준으로 확인하나요?</summary><p>사용제한 없는 현금이 향후 30일 지급예정액의 120% 이상인지 확인합니다. 사용제한 없는 현금은 회사가 운영에 바로 사용할 수 있고 담보나 별도 조건으로 사용이 제한되지 않은 금액을 뜻합니다.</p></NativeDisclosure>
                  <NativeDisclosure><summary>어떤 정보가 공개되나요?</summary><p>검증 기간, 약정 충족 여부, 등록 자료 지문이 공개됩니다. 현금, 지급예정액, 회사의 비밀값과 부족한 금액은 공개되지 않습니다.</p></NativeDisclosure>
                  <NativeDisclosure><summary>기준을 충족하지 못하면 어떻게 되나요?</summary><p>약정 충족 기록은 생성되지 않으며 실제 금액이나 부족한 차액도 공개되지 않습니다. 회사는 재무 자료를 확인하거나 다른 자료를 선택한 뒤 다시 요청할 수 있습니다.</p></NativeDisclosure>
                  <NativeDisclosure><summary>검증에는 얼마나 걸리나요?</summary><p>증명 생성과 원장 확정에는 시간이 걸릴 수 있습니다. 처리 중에는 현재 단계를 화면에서 확인할 수 있으며, 연결이 끊기거나 결과가 불명확하면 같은 요청의 상태를 다시 확인할 수 있습니다.</p></NativeDisclosure>
                </DisclosureGroup>
                <PageActions><PrimaryLink href="/request/select">검증할 자료 선택</PrimaryLink></PageActions>
              </>}

              {requestStep === 'select' && <RecordSection>
                  <SelectionPeriod>{selectionPeriod}</SelectionPeriod>
                  <CaseList role="radiogroup" aria-label="검증할 자료">
                    {(Object.keys(cases) as CaseId[]).map((caseId) => {
                      const item = cases[caseId];
                      const unavailable = !state || item.round > state.currentRound || (caseId === 'round-1-stale' && state.currentRound < 2);
                      const selected = caseId === selectedCase;
                      return (
                        <CaseButton key={caseId} type="button" role="radio" aria-checked={selected} $selected={selected} disabled={busy || unavailable} onClick={() => { setSelectedCase(caseId); setResult(null); setOperation(null); }}>
                          <RadioMark $selected={selected}>{selected && <Check size={13} />}</RadioMark>
                          <CaseCopy><CaseName>{item.label}</CaseName><CaseHint>{unavailable ? '현재 기간에는 선택할 수 없습니다.' : item.helper}</CaseHint></CaseCopy>
                          <PrivateAmounts aria-label="회사 내부 재무 값"><span><small>현금</small>{item.cash}</span><span><small>30일 지급예정액</small>{item.payments}</span></PrivateAmounts>
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
                    <SummaryRow><dt>향후 30일 지급예정액</dt><dd>{selectedCaseData.payments}백만원</dd></SummaryRow>
                  </SummaryList>
                  <PrivacyNotice><strong>금융기관에는 금액이 공개되지 않습니다.</strong><span>약정 기준을 충족하면 현재 기간의 약정 충족 기록이 공개 원장에 반영됩니다.</span></PrivacyNotice>
                  {phase !== 'idle' && <Progress phase={phase} code={result?.code} />}
                  {result && <ResultPanel result={result} state={state} />}
                  {requestMessage && !result && <ConnectionNotice $success={false}><AlertCircle size={19} /><div><strong>{phase === 'unknown' ? '요청 결과를 아직 확인하지 못했습니다' : '검증 요청을 처리하지 못했습니다'}</strong><span>{requestMessage} {hasUncertainRequest ? '아래 버튼으로 요청 결과를 다시 확인하십시오.' : '연결 상태를 확인한 뒤 다시 요청하십시오.'}</span></div></ConnectionNotice>}
                  {operation && <OperationEvidence operation={operation} />}
                  <RequestFooter>
                    <RequestFootnote>요청 후 증명 생성과 원장 확정까지 시간이 걸릴 수 있습니다.</RequestFootnote>
                    <ActionGroup>
                      {hasUncertainRequest && (
                        <SecondaryButton type="button" onClick={() => void refreshOperation()}><RefreshCw size={16} /> 상태 다시 확인</SecondaryButton>
                      )}
                      {!busy && (phase === 'idle' || phase === 'rejected' || phase === 'error') && <BackLink href="/request/select">자료 다시 선택</BackLink>}
                      <PrimaryButton type="button" disabled={busy || !state} onClick={() => verifyMutation.mutate(selectedCase)}>{verifyMutation.isPending ? '요청 처리 중' : '검증 요청'}</PrimaryButton>
                    </ActionGroup>
                  </RequestFooter>
                </RecordSection>}
            </>
          ) : (
            <>
              <StatusNotice $approved={isCurrentApproved} $error={stateQuery.isError}>
                <strong>{stateQuery.isError ? '최신 검증 결과를 불러오지 못했습니다' : !state ? '원장에서 현재 결과를 불러오고 있습니다' : isCurrentApproved ? '현재 기간의 약정 기준을 충족했습니다' : '현재 기간의 승인 기록이 없습니다'}</strong>
                <span>{stateQuery.isError ? '잠시 후 자동으로 다시 확인합니다. 그전까지 표시된 결과를 최신 상태로 판단하지 마십시오.' : !state ? '확인이 끝나면 현재 검증 기간과 약정 충족 여부가 표시됩니다.' : isCurrentApproved ? '현재 기간의 검증 결과가 공개 원장에 확정되었습니다.' : '이 상태만으로 검증 전과 기준 미충족을 구분할 수 없습니다. 회사에 현재 기간의 검증 진행 여부를 확인하십시오.'}</span>
              </StatusNotice>

              <RecordSection>
                <SectionTitle>검증 요약</SectionTitle>
                <SummaryList>
                  <SummaryRow><dt>현재 검증 기간</dt><dd>{periodLabel}</dd></SummaryRow>
                  <SummaryRow><dt>검증 결과</dt><dd>{state ? isCurrentApproved ? '약정 기준 충족' : '검증 결과 없음' : '—'}</dd></SummaryRow>
                </SummaryList>
              </RecordSection>

              {state && <RecordSection>
                <SectionTitle>최근 원장 정보</SectionTitle>
                <HistoryList>
                  <HistoryRow><time>{formatDateTime(state.updatedAt)}</time><div><strong>원장 상태 조회</strong><span>현재 검증 기간과 승인 기록을 확인했습니다.</span></div></HistoryRow>
                  {state.lastTransactionId && <HistoryRow><time>최근 거래</time><div><strong>최근 원장 거래</strong><code>{shorten(state.lastTransactionId)}</code></div></HistoryRow>}
                </HistoryList>
              </RecordSection>}
            </>
          )}

          {view === 'bank' && <LedgerDisclosure>
              <DisclosureButton type="button" onClick={() => setShowLedger((value) => !value)} aria-expanded={showLedger}>
                <span><strong>원장 세부 정보</strong><small>계약 주소와 원장 식별자를 확인합니다.</small></span>
                <ChevronDown size={18} aria-hidden="true" style={{ transform: showLedger ? 'rotate(180deg)' : undefined }} />
              </DisclosureButton>
              {showLedger && <LedgerDetail><LedgerDetailItem label="네트워크" value={state ? `${state.mode === 'midnight' ? 'Midnight' : 'Demo'} · ${state.network}` : undefined} /><LedgerDetailItem label="등록 자료 지문" value={state?.snapshotCommitment} /><LedgerDetailItem label="최근 거래 ID" value={state?.lastTransactionId ?? undefined} /><LedgerDetailItem label="약정 계약 주소" value={state?.contractAddress} /></LedgerDetail>}
          </LedgerDisclosure>}

          {view === 'bank' && <DemoRestart>
            <DemoRestartCopy>
              <strong>새로운 검증을 처음부터 진행할 수 있습니다.</strong>
              <span>기존 원장 기록은 그대로 유지되며, 새로운 데모 상태를 준비하는 데 시간이 걸릴 수 있습니다.</span>
              {resetMutation.isError && <ResetError role="alert">{resetMutation.error instanceof Error ? resetMutation.error.message : '새 데모를 준비하지 못했습니다. 잠시 후 다시 시도해 주세요.'}</ResetError>}
            </DemoRestartCopy>
            <RestartButton type="button" disabled={busy || !state} onClick={() => {
              if (window.confirm('새 데모를 시작할까요?\n\n기존 원장 기록은 유지되고 새로운 계약이 배포됩니다.')) resetMutation.mutate();
            }}><RotateCcw size={16} />{resetMutation.isPending ? '새 데모 준비 중' : '새 데모 시작'}</RestartButton>
          </DemoRestart>}
        </Content>
        {view === 'company' && requestStep === 'review' && state?.operatorActionsEnabled && <PageFooter><span /><SecondaryButton type="button" disabled={busy || state.currentRound !== 1} onClick={() => advanceMutation.mutate()}>다음 검증 기간 열기</SecondaryButton></PageFooter>}
      </Main>
      <SiteFooter />
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

function Progress({ phase, code }: { phase: OperationPhase; code?: CovenantErrorCode }) {
  const steps = [{ key: 'proving', label: '증명 생성' }, { key: 'submitting', label: '거래 제출' }, { key: 'confirming', label: '원장 확정' }];
  const completed = phase === 'confirmed';
  const current = phase === 'queued' || phase === 'proving'
    ? 0
    : phase === 'submitting'
      ? 1
      : phase === 'confirming'
        ? 2
        : -1;
  return <ProgressSection aria-live="polite"><ProgressHeading><span>검증 진행 상태</span><strong>{phaseLabel(phase, code)}</strong></ProgressHeading><ProgressTrack>{steps.map((step, index) => <ProgressItem key={step.key} $active={completed || (current >= 0 && index <= current)} $current={!completed && index === current}><ProgressDot>{completed || index < current ? <Check size={11} /> : index + 1}</ProgressDot><span>{step.label}</span>{index < steps.length - 1 && <ProgressLine $active={completed || index < current} />}</ProgressItem>)}</ProgressTrack></ProgressSection>;
}

function OperationEvidence({ operation }: { operation: VerificationOperation }) {
  return <EvidenceBox><EvidenceTitle>검증 요청 기록</EvidenceTitle><EvidenceGrid><div><span>요청 ID</span><code>{operation.operationId}</code></div><div><span>검증 기간</span><code>{operation.submittedRound}기</code></div><div><span>원장 거래 ID</span><code>{operation.transactionId ?? '거래 생성 전'}</code></div><div><span>마지막 상태 변경</span><code>{formatTime(operation.updatedAt)}</code></div></EvidenceGrid></EvidenceBox>;
}

function LedgerDetailItem({ label, value }: { label: string; value?: string }) {
  return <DetailItem><div><SmallLabel>{label}</SmallLabel><CodeText>{shorten(value)}</CodeText></div>{value && <CopyButton type="button" aria-label={`${label} 복사`} onClick={() => void navigator.clipboard.writeText(value)}><Copy size={14} /></CopyButton>}</DetailItem>;
}

function ResultPanel({ result, state }: { result: { ok: boolean; code?: CovenantErrorCode }; state?: LedgerState }) {
  const copy = result.code ? errorCopy[result.code] : null;
  const complete = result.ok || result.code === 'ALREADY_APPROVED';
  return <ResultBox $success={complete}>{complete ? <Check size={19} /> : <AlertCircle size={19} />}<div><strong>{result.ok ? `${state?.currentRound ?? ''}기 약정 검증 완료` : copy?.title}</strong><span>{result.ok ? '약정 충족 결과가 공개 원장에 반영되었습니다.' : copy?.body}</span></div></ResultBox>;
}

function phaseLabel(phase: string, code?: CovenantErrorCode) {
  if (phase === 'rejected') {
    if (code === 'INSUFFICIENT_CASH') return '약정 기준 미충족';
    if (code === 'ALREADY_APPROVED') return '이미 검증 완료';
    return '검증 요청 거절';
  }
  const labels: Record<string, string> = { idle: '검증 요청 전', queued: '검증 요청 접수', proving: '증명 생성 중', submitting: '원장에 결과 제출 중', confirming: '원장 확정 대기 중', confirmed: '원장 확정 완료', error: '검증 요청 처리 실패', unknown: '요청 결과 확인 필요' };
  return labels[phase] ?? phase;
}

function shorten(value?: string) { return value ? `${value.slice(0, 12)}…${value.slice(-8)}` : '—'; }
function formatTime(value: string) { return new Date(value).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' }); }
function formatDateTime(value: string) { return new Date(value).toLocaleString('ko-KR', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }); }

const PageShell = styled.div`min-height:100vh;display:flex;flex-direction:column;background:var(--color-canvas);`;
const Main = styled.main`width:min(1120px,calc(100% - 40px));margin:0 auto;padding:clamp(52px,7vw,82px) 0 88px;flex:1;@media(max-width:720px){padding-top:38px;}`;
const StepNavigation = styled.nav`width:min(820px,100%);margin:0 auto 46px;ol{display:grid;grid-template-columns:repeat(3,1fr);border-bottom:1px solid var(--color-border);}`;
const StepItem = styled.li<{ $active:boolean;$complete:boolean }>`position:relative;padding-bottom:15px;color:${p=>p.$active?'var(--color-text-primary)':p.$complete?'var(--color-action)':'var(--color-text-secondary)'};&::after{content:'';position:absolute;right:0;bottom:-1px;left:0;height:2px;background:${p=>p.$active?'var(--color-action)':'transparent'};}`;
const StepLink = styled(Link)`display:flex;align-items:center;gap:9px;font-size:13px;font-weight:650;span{width:22px;height:22px;display:grid;place-items:center;border:1px solid currentColor;border-radius:50%;font-size:11px;}@media(max-width:460px){gap:6px;font-size:11px;span{width:20px;height:20px;}}`;
const RecordHeader = styled.header`width:min(820px,100%);margin-inline:auto;display:flex;align-items:flex-start;justify-content:space-between;gap:32px;padding-bottom:34px;@media(max-width:560px){gap:18px;}`;
const RecordHeading = styled.div`min-width:0;`;
const PageTitle = styled.h1`color:var(--color-text-primary);font-size:clamp(34px,5vw,46px);font-weight:740;line-height:1.16;letter-spacing:-.052em;word-break:keep-all;`;
const PageDescription = styled.p`max-width:660px;margin-top:13px;color:var(--color-text-secondary);font-size:15px;line-height:1.72;letter-spacing:-.012em;word-break:keep-all;`;
const RecordStatus = styled.span<{ $approved:boolean;$error:boolean }>`flex:0 0 auto;margin-top:6px;padding:7px 10px;border-radius:3px;color:${p=>p.$error?'var(--color-danger)':p.$approved?'var(--color-success)':'var(--color-warning)'};background:${p=>p.$error?'var(--color-danger-bg)':p.$approved?'var(--color-success-bg)':'var(--color-warning-bg)'};font-size:13px;font-weight:720;`;
const RecordMeta = styled.dl`width:min(820px,100%);margin-inline:auto;display:grid;grid-template-columns:repeat(3,1fr);border-top:1px solid var(--color-border-strong);border-bottom:1px solid var(--color-border);@media(max-width:600px){grid-template-columns:1fr;}`;
const MetaItem = styled.div`min-height:86px;padding:18px 24px;border-right:1px solid var(--color-border);display:grid;align-content:center;gap:6px;&:first-of-type{padding-left:0;}&:last-of-type{border-right:0;}dt{color:var(--color-text-secondary);font-size:12px;}dd{color:var(--color-text-primary);font-size:16px;font-weight:680;}@media(max-width:600px){min-height:66px;padding:13px 0;border-right:0;border-bottom:1px solid var(--color-border);&:last-of-type{border-bottom:0;}}`;
const Content = styled.div<{ $compactTop:boolean }>`width:min(820px,100%);margin-inline:auto;display:grid;gap:48px;padding-top:${p=>p.$compactTop?'0':'48px'};`;
const RecordSection = styled.section`background:transparent;`;
const IntroStatement = styled.section`padding:30px 32px;border-top:1px solid var(--color-border-strong);border-bottom:1px solid var(--color-border);background:var(--color-chrome);display:grid;gap:8px;@media(max-width:520px){padding:24px 20px;}`;
const IntroTitle = styled.h1`color:var(--color-text-primary);font-size:24px;font-weight:720;line-height:1.35;letter-spacing:-.04em;word-break:keep-all;`;
const IntroDescription = styled.p`color:var(--color-text-secondary);font-size:14px;line-height:1.7;word-break:keep-all;`;
const ExplanationList = styled.ol`border-top:1px solid var(--color-border);border-bottom:1px solid var(--color-border);`;
const ExplanationRow = styled.li`display:grid;grid-template-columns:270px minmax(0,1fr);gap:28px;padding:24px 4px;border-bottom:1px solid var(--color-border);&:last-of-type{border-bottom:0;}strong{color:var(--color-text-primary);font-size:15px;font-weight:680;}span{color:var(--color-text-secondary);font-size:13px;line-height:1.7;}@media(max-width:620px){grid-template-columns:1fr;gap:6px;padding:20px 2px;}`;
const DisclosureGroup = styled.div`display:grid;border-top:1px solid var(--color-border);`;
const NativeDisclosure = styled.details`border-bottom:1px solid var(--color-border);summary{padding:18px 4px;color:var(--color-text-primary);font-size:14px;font-weight:660;cursor:pointer;}p{max-width:680px;padding:0 4px 19px;color:var(--color-text-secondary);font-size:13px;line-height:1.72;}`;
const PageActions = styled.div`display:flex;align-items:center;justify-content:flex-end;gap:10px;padding-top:6px;`;
const PrimaryLink = styled(Link)`min-height:48px;padding:0 20px;display:inline-flex;align-items:center;justify-content:center;border-radius:5px;color:var(--color-on-action);background:var(--color-action);font-size:14px;font-weight:720;&:hover{background:var(--color-action-hover);}`;
const BackLink = styled(Link)`min-height:48px;padding:0 11px;display:inline-flex;align-items:center;justify-content:center;color:var(--color-text-secondary);font-size:13px;font-weight:620;&:hover{color:var(--color-text-primary);}`;
const SectionTitle = styled.h2`color:var(--color-text-primary);font-size:22px;font-weight:710;letter-spacing:-.04em;`;
const SelectionPeriod = styled.h1`padding-bottom:22px;color:var(--color-text-primary);font-size:clamp(18px,2.2vw,21px);font-weight:680;line-height:1.5;letter-spacing:-.025em;`;
const CaseList = styled.div`border-top:1px solid var(--color-border);`;
const CaseButton = styled.button<{ $selected:boolean }>`width:100%;min-height:92px;padding:17px 12px;display:flex;align-items:center;border:0;border-bottom:1px solid var(--color-border);border-radius:0;color:var(--color-text-primary);background:${p=>p.$selected?'var(--color-action-subtle)':'transparent'};text-align:left;cursor:pointer;transition:background 120ms ease;&:hover:not(:disabled){background:var(--color-action-subtle-hover);}&:disabled{opacity:.46;cursor:not-allowed;}`;
const RadioMark = styled.span<{ $selected:boolean }>`width:24px;height:24px;display:grid;place-items:center;flex:0 0 auto;margin-right:15px;border:1px solid ${p=>p.$selected?'var(--color-action)':'var(--color-border-strong)'};border-radius:50%;color:var(--color-on-action);background:${p=>p.$selected?'var(--color-action)':'transparent'};`;
const CaseCopy = styled.span`min-width:0;display:flex;flex-direction:column;gap:4px;`;
const CaseName = styled.strong`font-size:16px;font-weight:680;`;
const CaseHint = styled.span`color:var(--color-text-secondary);font-size:13px;line-height:1.5;`;
const PrivateAmounts = styled.span`display:flex;gap:24px;margin-left:auto;padding-left:20px;>span{min-width:52px;display:grid;gap:3px;color:var(--color-text-primary);font:650 14px/1.2 ui-monospace,SFMono-Regular,monospace;}small{color:var(--color-text-secondary);font:500 10px/1.2 var(--font-pretendard);}@media(max-width:520px){display:none;}`;
const SelectionNote = styled.p`margin-top:14px;color:var(--color-text-secondary);font-size:12px;line-height:1.65;`;
const RequestFooter = styled.div`display:flex;align-items:flex-end;justify-content:space-between;gap:22px;margin-top:28px;padding-top:24px;border-top:1px solid var(--color-border);@media(max-width:660px){align-items:stretch;flex-direction:column;}`;
const RequestFootnote = styled.p`max-width:350px;color:var(--color-text-secondary);font-size:12px;line-height:1.65;`;
const ActionGroup = styled.div`display:flex;justify-content:flex-end;gap:8px;@media(max-width:520px){flex-direction:column-reverse;}`;
const PrimaryButton = styled.button`height:48px;padding:0 20px;display:flex;align-items:center;justify-content:center;gap:9px;border:0;border-radius:5px;color:var(--color-on-action);background:var(--color-action);font-size:14px;font-weight:720;cursor:pointer;&:hover:not(:disabled){background:var(--color-action-hover);}&:disabled{opacity:.52;cursor:not-allowed;}`;
const SecondaryButton = styled.button`height:48px;padding:0 17px;display:flex;align-items:center;justify-content:center;gap:7px;border:1px solid var(--color-border-strong);border-radius:5px;color:var(--color-text-secondary);background:transparent;font-size:13px;font-weight:620;cursor:pointer;&:hover:not(:disabled){color:var(--color-text-primary);border-color:var(--color-action);}&:disabled{opacity:.38;cursor:not-allowed;}`;
const ProgressSection = styled.section`margin-top:22px;padding:20px 0;border-bottom:1px solid var(--color-border);`;
const ProgressHeading = styled.div`display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;font-size:13px;span{color:var(--color-text-secondary);}strong{color:var(--color-text-primary);font-weight:660;}`;
const ProgressTrack = styled.div`display:flex;align-items:center;`;
const ProgressItem = styled.div<{ $active:boolean;$current:boolean }>`display:flex;align-items:center;gap:7px;flex:1;color:${p=>p.$active?'var(--color-action)':'var(--color-text-secondary)'};font-size:12px;font-weight:${p=>p.$current?680:520};white-space:nowrap;`;
const ProgressDot = styled.span`width:22px;height:22px;display:grid;place-items:center;flex:0 0 auto;border:1px solid currentColor;border-radius:50%;font-size:10px;`;
const ProgressLine = styled.span<{ $active:boolean }>`height:1px;flex:1;margin:0 7px;background:${p=>p.$active?'var(--color-action)':'var(--color-border)'};`;
const ResultBox = styled.div<{ $success:boolean }>`display:flex;align-items:flex-start;gap:12px;margin-top:18px;padding:18px;border:1px solid ${p=>p.$success?'var(--color-success-border)':'var(--color-danger-border)'};border-radius:4px;color:${p=>p.$success?'var(--color-success)':'var(--color-danger)'};background:${p=>p.$success?'var(--color-success-bg)':'var(--color-danger-bg)'};svg{flex:0 0 auto;}div{display:grid;gap:5px;}strong{font-size:15px;font-weight:690;}span{color:var(--color-text-secondary);font-size:13px;line-height:1.65;}`;
const ConnectionNotice = styled(ResultBox)`border-color:var(--color-warning-border);color:var(--color-warning);background:var(--color-warning-bg);`;
const EvidenceBox = styled.div`margin-top:18px;padding:18px 0;border-top:1px solid var(--color-border);border-bottom:1px solid var(--color-border);`;
const EvidenceTitle = styled.div`margin-bottom:13px;color:var(--color-text-primary);font-size:14px;font-weight:680;`;
const EvidenceGrid = styled.div`display:grid;grid-template-columns:1fr 1fr;gap:13px 20px;div{display:grid;gap:4px;min-width:0;}span{color:var(--color-text-secondary);font-size:11px;}code{overflow:hidden;color:var(--color-text-primary);font:12px ui-monospace,SFMono-Regular,monospace;text-overflow:ellipsis;white-space:nowrap;}@media(max-width:560px){grid-template-columns:1fr;}`;
const SummaryList = styled.dl`margin-top:20px;border-top:1px solid var(--color-border);`;
const SummaryRow = styled.div`display:grid;grid-template-columns:180px minmax(0,1fr);gap:24px;padding:18px 4px;border-bottom:1px solid var(--color-border);dt{color:var(--color-text-secondary);font-size:13px;font-weight:560;}dd{color:var(--color-text-primary);font-size:15px;line-height:1.6;}@media(max-width:520px){grid-template-columns:1fr;gap:5px;padding:15px 2px;}`;
const PrivacyNotice = styled.div`margin-top:20px;padding:18px 20px;border-left:3px solid var(--color-action);background:var(--color-action-subtle);display:grid;gap:5px;strong{color:var(--color-text-primary);font-size:14px;font-weight:680;}span{color:var(--color-text-secondary);font-size:12px;line-height:1.65;}`;
const StatusNotice = styled.section<{ $approved:boolean;$error:boolean }>`padding:30px 32px;border:1px solid var(--color-border);border-top:2px solid ${p=>p.$error?'var(--color-danger)':p.$approved?'var(--color-success)':'var(--color-warning)'};background:var(--color-surface);box-shadow:0 16px 40px var(--color-shadow);display:grid;gap:8px;strong{color:${p=>p.$error?'var(--color-danger)':p.$approved?'var(--color-success)':'var(--color-warning)'};font-size:clamp(22px,3vw,28px);font-weight:730;letter-spacing:-.04em;}span{max-width:650px;color:var(--color-text-secondary);font-size:14px;line-height:1.7;}@media(max-width:520px){padding:24px 20px;}`;
const HistoryList = styled.ol`margin-top:20px;border-top:1px solid var(--color-border);`;
const HistoryRow = styled.li`display:grid;grid-template-columns:140px minmax(0,1fr);gap:24px;padding:18px 4px;border-bottom:1px solid var(--color-border);time{color:var(--color-text-secondary);font-size:12px;}div{min-width:0;display:grid;gap:4px;}strong{color:var(--color-text-primary);font-size:14px;font-weight:660;}span{color:var(--color-text-secondary);font-size:13px;}code{overflow:hidden;color:var(--color-text-secondary);font:12px ui-monospace,SFMono-Regular,monospace;text-overflow:ellipsis;white-space:nowrap;}@media(max-width:520px){grid-template-columns:1fr;gap:5px;}`;
const LedgerDisclosure = styled.section`border-top:1px solid var(--color-border);border-bottom:1px solid var(--color-border);`;
const DisclosureButton = styled.button`width:100%;min-height:70px;padding:14px 4px;display:flex;align-items:center;justify-content:space-between;gap:16px;border:0;color:var(--color-text-primary);background:transparent;text-align:left;cursor:pointer;>span{display:grid;gap:4px;}strong{font-size:14px;font-weight:660;}small{color:var(--color-text-secondary);font-size:12px;}svg{color:var(--color-text-secondary);transition:transform 160ms ease;}&:hover{background:var(--color-surface-muted);}`;
const LedgerDetail = styled.div`display:grid;gap:7px;padding:0 18px 18px;`;
const DetailItem = styled.div`min-height:58px;padding:11px 0;display:flex;align-items:center;justify-content:space-between;gap:10px;border-top:1px solid var(--color-border);>div{min-width:0;display:grid;gap:5px;}`;
const SmallLabel = styled.span`color:var(--color-text-secondary);font-size:11px;`;
const CodeText = styled.code`color:var(--color-text-primary);font:11px ui-monospace,SFMono-Regular,monospace;word-break:break-all;`;
const CopyButton = styled.button`width:30px;height:30px;display:grid;place-items:center;flex:0 0 auto;border:0;border-radius:4px;color:var(--color-text-secondary);background:var(--color-surface-muted);cursor:pointer;&:hover{color:var(--color-action);}`;
const DemoRestart = styled.section`display:flex;align-items:center;justify-content:space-between;gap:28px;padding:28px 4px 0;border-top:1px solid var(--color-border);@media(max-width:620px){align-items:stretch;flex-direction:column;gap:18px;}`;
const DemoRestartCopy = styled.div`max-width:570px;display:grid;gap:6px;strong{color:var(--color-text-primary);font-size:15px;font-weight:680;}span{color:var(--color-text-secondary);font-size:13px;line-height:1.7;word-break:keep-all;}`;
const RestartButton = styled.button`min-width:148px;height:48px;padding:0 18px;display:flex;align-items:center;justify-content:center;gap:8px;flex:0 0 auto;border:1px solid var(--color-border-strong);border-radius:5px;color:var(--color-text-primary);background:transparent;font-size:13px;font-weight:660;cursor:pointer;&:hover:not(:disabled){border-color:var(--color-action);color:var(--color-action);}&:disabled{opacity:.48;cursor:not-allowed;}@media(max-width:620px){width:100%;}`;
const ResetError = styled.span`color:var(--color-danger)!important;`;
const PageFooter = styled.footer`width:min(820px,100%);min-height:54px;margin:10px auto 0;display:flex;align-items:center;justify-content:space-between;color:var(--color-text-secondary);font-size:11px;`;
