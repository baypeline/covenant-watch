'use client';

import styled from '@emotion/styled';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertCircle, ArrowRight, Check, ChevronDown, Copy, Moon, RefreshCw, RotateCcw, Sun } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { advanceSnapshot, getLedgerState, getVerification, getVerificationByRequestId, resetDemo, startVerification, watchVerification } from '@/lib/api';
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

export function CovenantDashboard({ view }: { view: ViewMode }) {
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
      <AppHeader view={view} state={state} hasError={stateQuery.isError} />
      <Main>
        <PageIntro>
          <IntroCopy>
            <AudienceLabel>{view === 'company' ? '기업 담당자' : '금융기관 담당자'}</AudienceLabel>
            <PageTitle>{view === 'company' ? '현재 기간의 약정 확인을 요청합니다' : '현재 기간의 약정 상태를 확인합니다'}</PageTitle>
            <PageDescription>
              {view === 'company'
                ? '검증할 재무 자료를 선택하면 원금액을 공개하지 않고 충족 여부만 원장에 기록합니다.'
                : '공개 원장에 확정된 기간과 승인 상태를 기준으로 현재 약정의 유효성을 확인합니다.'}
            </PageDescription>
          </IntroCopy>
          <PeriodSummary><span>현재 검증 기간</span><strong>{state?.currentRound ? `${state.currentRound}기` : '확인 중'}</strong></PeriodSummary>
        </PageIntro>

        <Workspace>
          <PrimaryColumn>
            {view === 'company' ? (
              <RequestCard>
                <SectionHeader>
                  <div><SectionTitle>검증 자료 선택</SectionTitle><SectionDescription>현재 기간에 등록된 자료를 선택합니다.</SectionDescription></div>
                  <PrivateBadge>원금액 비공개</PrivateBadge>
                </SectionHeader>
                <CaseList role="radiogroup" aria-label="검증할 자료">
                  {(Object.keys(cases) as CaseId[]).map((caseId) => {
                    const item = cases[caseId];
                    const unavailable = !state || item.round > state.currentRound || (caseId === 'round-1-stale' && state.currentRound < 2);
                    const selected = caseId === selectedCase;
                    return (
                      <CaseButton key={caseId} type="button" role="radio" aria-checked={selected} $selected={selected} disabled={busy || unavailable} onClick={() => { setSelectedCase(caseId); setResult(null); setOperation(null); }}>
                        <RadioMark $selected={selected}>{selected && <Check size={13} />}</RadioMark>
                        <CaseCopy><CaseName>{item.label}</CaseName><CaseHint>{unavailable ? '현재 기간에는 선택할 수 없습니다.' : item.helper}</CaseHint></CaseCopy>
                        <PrivateAmounts aria-label="비공개 재무 값"><span><small>현금</small>{item.cash}</span><span><small>지급예정</small>{item.payments}</span></PrivateAmounts>
                      </CaseButton>
                    );
                  })}
                </CaseList>
                <PrivacyCallout><LockGlyph aria-hidden="true">×</LockGlyph><div><strong>선택한 금액은 외부에 공개되지 않습니다</strong><span>공개 원장에는 원금액 대신 자료 커밋먼트와 충족 결과만 기록됩니다.</span></div></PrivacyCallout>
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
                    <PrimaryButton type="button" disabled={busy || !state} onClick={() => verifyMutation.mutate(selectedCase)}>{verifyMutation.isPending ? phaseLabel(phase) : '약정 확인 요청'}<ArrowRight size={17} /></PrimaryButton>
                  </ActionGroup>
                </RequestFooter>
              </RequestCard>
            ) : (
              <Certificate $approved={isCurrentApproved} $error={stateQuery.isError}>
                <CertificateHeader><div><DocumentLabel>금액 없는 약정 확인서</DocumentLabel><DocumentId>현재 {state?.currentRound ?? '—'}기</DocumentId></div><StatusStamp $approved={isCurrentApproved} $error={stateQuery.isError}>{stateQuery.isError ? '확인 불가' : !state ? '확인 중' : isCurrentApproved ? '충족' : '승인 없음'}</StatusStamp></CertificateHeader>
                <CertificateBody>
                  <CertificateMark $approved={isCurrentApproved} $error={stateQuery.isError}>{!state && !stateQuery.isError ? <RefreshCw size={24} /> : stateQuery.isError || !isCurrentApproved ? <AlertCircle size={26} /> : <Check size={26} />}</CertificateMark>
                  <div><CertificateTitle>{stateQuery.isError ? '최신 원장 상태를 확인할 수 없습니다' : !state ? '원장 상태를 확인하고 있습니다' : isCurrentApproved ? '현재 기간의 약정을 충족했습니다' : '현재 기간에 확정된 승인이 없습니다'}</CertificateTitle><CertificateDescription>{stateQuery.isError ? '원장 연결을 복구한 뒤 다시 확인해야 합니다. 이전 조회 결과는 현재 상태로 사용하지 않습니다.' : !state ? '원장의 현재 기간과 승인 기록을 가져오고 있습니다.' : isCurrentApproved ? '재무 원금액을 공개하지 않고 약정 충족 증명이 원장에 확정되었습니다.' : '이전 기간의 승인은 현재 기간의 승인으로 인정하지 않습니다.'}</CertificateDescription></div>
                </CertificateBody>
                <CertificateRule><span>확인 기준</span></CertificateRule>
                <CertificateFacts>
                  <CertificateFact><dt>현재 기간</dt><dd>{state?.currentRound ? `${state.currentRound}기` : '—'}</dd></CertificateFact>
                  <CertificateFact><dt>승인된 기간</dt><dd>{state?.approvedRound ? `${state.approvedRound}기` : '없음'}</dd></CertificateFact>
                  <CertificateFact><dt>마지막 확인</dt><dd>{state ? formatTime(state.updatedAt) : '—'}</dd></CertificateFact>
                </CertificateFacts>
                <CertificateNote>이 확인서는 현금 잔액이나 지급 예정액을 포함하지 않습니다. 기간, 승인 상태, 자료 커밋먼트만 공개 원장에서 확인합니다.</CertificateNote>
              </Certificate>
            )}

            <LedgerDisclosure>
              <DisclosureButton type="button" onClick={() => setShowLedger((value) => !value)} aria-expanded={showLedger}>
                <span><strong>원장 기록 상세</strong><small>계약 주소와 거래 증거를 확인합니다.</small></span>
                <ChevronDown size={18} aria-hidden="true" style={{ transform: showLedger ? 'rotate(180deg)' : undefined }} />
              </DisclosureButton>
              {showLedger && <LedgerDetail><LedgerDetailItem label="자료 커밋먼트" value={state?.snapshotCommitment} /><LedgerDetailItem label="마지막 거래" value={state?.lastTransactionId ?? undefined} /><LedgerDetailItem label="계약 주소" value={state?.contractAddress} /></LedgerDetail>}
            </LedgerDisclosure>
          </PrimaryColumn>

          <SideColumn>
            <PolicyCard><SideLabel>약정 기준</SideLabel><PolicyTitle>현금 여유 약정</PolicyTitle><Formula aria-label="현금은 지급 예정액의 1.2배 이상"><span>C</span><b>≥</b><span>P × 1.2</span></Formula><PolicyDescription>사용제한 없는 현금이 향후 30일 지급예정액의 120% 이상인지 확인합니다.</PolicyDescription></PolicyCard>
            <ScopeCard><SideLabel>정보 공개 범위</SideLabel><ScopeList><ScopeItem><ScopeMark $private={false}><Check size={13} /></ScopeMark><div><strong>공개되는 정보</strong><span>기간 · 승인 상태 · 커밋먼트</span></div></ScopeItem><ScopeItem><ScopeMark $private>×</ScopeMark><div><strong>공개되지 않는 정보</strong><span>현금 · 지급액 · 비밀값</span></div></ScopeItem></ScopeList></ScopeCard>
            <LedgerSummary><SideLabel>원장 연결</SideLabel><LedgerConnection $error={stateQuery.isError}><LiveDot $error={stateQuery.isError} $pending={!state && !stateQuery.isError} /><div><strong>{stateQuery.isError ? '연결 확인 필요' : state ? '정상 연결' : '연결 확인 중'}</strong><span>{stateQuery.isError ? '최신 상태를 가져오지 못했습니다.' : state ? `${state.mode === 'midnight' ? 'Midnight' : 'Demo'} · ${state.network}` : '원장 응답을 기다리고 있습니다.'}</span></div></LedgerConnection></LedgerSummary>
          </SideColumn>
        </Workspace>
        <PageFooter><span>금액 단위 · 백만원</span>{state?.operatorActionsEnabled && <ResetButton type="button" disabled={busy} onClick={() => resetMutation.mutate()}><RotateCcw size={14} /> 데모 초기화</ResetButton>}</PageFooter>
      </Main>
    </PageShell>
  );
}

function AppHeader({ view, state, hasError }: { view: ViewMode; state?: LedgerState; hasError: boolean }) {
  return <Header><HeaderInner><Brand href="/request" aria-label="Covenant Watch 검증 요청"><BrandMark>CW</BrandMark><BrandName>Covenant Watch</BrandName></Brand><Navigation aria-label="주요 메뉴"><NavigationLink href="/request" aria-current={view === 'company' ? 'page' : undefined}>검증 요청</NavigationLink><NavigationLink href="/status" aria-current={view === 'bank' ? 'page' : undefined}>약정 현황</NavigationLink></Navigation><HeaderActions><NetworkStatus $error={hasError}><LiveDot $error={hasError} $pending={!state && !hasError} /><span>{hasError ? '원장 연결 실패' : state ? state.network : '연결 확인 중'}</span></NetworkStatus><ThemeToggle /></HeaderActions></HeaderInner></Header>;
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

const PageShell = styled.div`min-height:100vh;background:var(--color-canvas);`;
const Header = styled.header`position:sticky;top:0;z-index:10;border-bottom:1px solid var(--color-border);background:var(--color-nav);backdrop-filter:blur(14px);`;
const HeaderInner = styled.div`width:min(1120px,calc(100% - 40px));min-height:68px;margin:0 auto;display:grid;grid-template-columns:1fr auto 1fr;align-items:center;gap:24px;@media(max-width:720px){min-height:auto;padding:12px 0;grid-template-columns:1fr auto;gap:10px;}`;
const Brand = styled(Link)`display:inline-flex;align-items:center;gap:10px;width:fit-content;`;
const BrandMark = styled.span`width:32px;height:32px;display:grid;place-items:center;border:1px solid var(--color-text-primary);border-radius:8px;color:var(--color-text-primary);font:760 10px/1 var(--font-pretendard);letter-spacing:-.02em;`;
const BrandName = styled.span`color:var(--color-text-primary);font-size:15px;font-weight:700;letter-spacing:-.025em;@media(max-width:420px){display:none;}`;
const Navigation = styled.nav`height:68px;display:flex;align-items:stretch;gap:28px;@media(max-width:720px){grid-column:1/-1;grid-row:2;height:38px;justify-content:center;gap:32px;}`;
const NavigationLink = styled(Link)`position:relative;display:flex;align-items:center;color:var(--color-text-secondary);font-size:13px;font-weight:560;&::after{content:'';position:absolute;right:0;bottom:-1px;left:0;height:2px;background:transparent;}&[aria-current='page']{color:var(--color-text-primary);font-weight:680;}&[aria-current='page']::after{background:var(--color-action);}&:hover{color:var(--color-text-primary);}`;
const HeaderActions = styled.div`display:flex;align-items:center;justify-content:flex-end;gap:10px;`;
const NetworkStatus = styled.div<{ $error:boolean }>`display:flex;align-items:center;gap:7px;color:${p=>p.$error?'var(--color-danger)':'var(--color-text-secondary)'};font-size:11px;@media(max-width:520px){span:last-child{display:none;}}`;
const LiveDot = styled.span<{ $error:boolean;$pending?:boolean }>`width:7px;height:7px;flex:0 0 auto;border-radius:50%;background:${p=>p.$error?'var(--color-danger)':p.$pending?'var(--color-border-strong)':'var(--color-success)'};`;
const ThemeButton = styled.button`width:36px;height:36px;display:grid;place-items:center;border:1px solid var(--color-border);border-radius:9px;color:var(--color-text-secondary);background:var(--color-surface);cursor:pointer;&:hover{color:var(--color-text-primary);border-color:var(--color-border-strong);}`;
const Main = styled.main`width:min(1120px,calc(100% - 40px));margin:0 auto;padding:60px 0 30px;@media(max-width:720px){padding-top:36px;}`;
const PageIntro = styled.section`display:flex;align-items:flex-end;justify-content:space-between;gap:32px;margin-bottom:34px;@media(max-width:680px){align-items:flex-start;flex-direction:column;gap:20px;}`;
const IntroCopy = styled.div`max-width:720px;`;
const AudienceLabel = styled.div`margin-bottom:12px;color:var(--color-action);font-size:12px;font-weight:720;`;
const PageTitle = styled.h1`max-width:690px;color:var(--color-text-primary);font-size:clamp(30px,4.5vw,46px);font-weight:720;line-height:1.16;letter-spacing:-.052em;`;
const PageDescription = styled.p`max-width:670px;margin-top:16px;color:var(--color-text-secondary);font-size:15px;line-height:1.7;letter-spacing:-.012em;`;
const PeriodSummary = styled.div`min-width:126px;padding:0 0 6px 18px;border-left:1px solid var(--color-border-strong);display:grid;gap:4px;span{color:var(--color-text-secondary);font-size:11px;}strong{color:var(--color-text-primary);font-size:24px;font-weight:710;letter-spacing:-.04em;}`;
const Workspace = styled.div`display:grid;grid-template-columns:minmax(0,1.75fr) minmax(260px,.75fr);gap:20px;align-items:start;@media(max-width:860px){grid-template-columns:1fr;}`;
const PrimaryColumn = styled.div`display:grid;gap:14px;`;
const RequestCard = styled.section`padding:28px;border:1px solid var(--color-border);border-radius:16px;background:var(--color-surface);box-shadow:0 18px 48px var(--color-shadow);@media(max-width:560px){padding:20px;}`;
const SectionHeader = styled.header`display:flex;align-items:flex-start;justify-content:space-between;gap:18px;margin-bottom:22px;`;
const SectionTitle = styled.h2`color:var(--color-text-primary);font-size:18px;font-weight:700;letter-spacing:-.035em;`;
const SectionDescription = styled.p`margin-top:4px;color:var(--color-text-secondary);font-size:12px;`;
const PrivateBadge = styled.span`padding:6px 9px;border:1px solid var(--color-border);border-radius:7px;color:var(--color-text-secondary);background:var(--color-surface-muted);font-size:10px;font-weight:650;white-space:nowrap;`;
const CaseList = styled.div`display:grid;gap:8px;`;
const CaseButton = styled.button<{ $selected:boolean }>`width:100%;min-height:76px;padding:14px 16px;display:flex;align-items:center;border:1px solid ${p=>p.$selected?'var(--color-action)':'var(--color-border)'};border-radius:11px;color:var(--color-text-primary);background:${p=>p.$selected?'var(--color-action-subtle)':'var(--color-surface)'};text-align:left;cursor:pointer;transition:border-color 160ms ease,background 160ms ease;&:hover:not(:disabled){border-color:var(--color-border-strong);background:var(--color-action-subtle-hover);}&:disabled{opacity:.46;cursor:not-allowed;}`;
const RadioMark = styled.span<{ $selected:boolean }>`width:21px;height:21px;display:grid;place-items:center;flex:0 0 auto;margin-right:12px;border:1px solid ${p=>p.$selected?'var(--color-action)':'var(--color-border-strong)'};border-radius:50%;color:var(--color-on-action);background:${p=>p.$selected?'var(--color-action)':'transparent'};`;
const CaseCopy = styled.span`min-width:0;display:flex;flex-direction:column;gap:4px;`;
const CaseName = styled.strong`font-size:14px;font-weight:670;`;
const CaseHint = styled.span`color:var(--color-text-secondary);font-size:11px;`;
const PrivateAmounts = styled.span`display:flex;gap:18px;margin-left:auto;padding-left:18px;>span{min-width:44px;display:grid;gap:2px;color:var(--color-text-primary);font:650 12px/1.2 ui-monospace,SFMono-Regular,monospace;}small{color:var(--color-text-secondary);font:500 9px/1.2 var(--font-pretendard);}@media(max-width:520px){display:none;}`;
const PrivacyCallout = styled.div`display:flex;gap:11px;align-items:flex-start;margin-top:14px;padding:13px 14px;border-radius:10px;color:var(--color-text-primary);background:var(--color-surface-muted);>div{display:grid;gap:3px;}strong{font-size:12px;font-weight:650;}span{color:var(--color-text-secondary);font-size:11px;line-height:1.5;}`;
const LockGlyph = styled.span`width:20px;height:20px;display:grid;place-items:center;flex:0 0 auto;border:1px solid var(--color-border-strong);border-radius:50%;color:var(--color-text-secondary);font-size:13px!important;line-height:1;`;
const RequestFooter = styled.div`display:flex;align-items:flex-end;justify-content:space-between;gap:20px;margin-top:22px;padding-top:20px;border-top:1px solid var(--color-border);@media(max-width:660px){align-items:stretch;flex-direction:column;}`;
const RequestFootnote = styled.p`max-width:300px;color:var(--color-text-secondary);font-size:10px;line-height:1.55;`;
const ActionGroup = styled.div`display:flex;justify-content:flex-end;gap:8px;@media(max-width:520px){flex-direction:column-reverse;}`;
const PrimaryButton = styled.button`height:44px;padding:0 17px;display:flex;align-items:center;justify-content:center;gap:9px;border:0;border-radius:9px;color:var(--color-on-action);background:var(--color-action);font-size:12px;font-weight:720;cursor:pointer;&:hover:not(:disabled){background:var(--color-action-hover);}&:disabled{opacity:.52;cursor:not-allowed;}`;
const SecondaryButton = styled.button`height:44px;padding:0 14px;display:flex;align-items:center;justify-content:center;gap:7px;border:1px solid var(--color-border-strong);border-radius:9px;color:var(--color-text-secondary);background:transparent;font-size:11px;font-weight:620;cursor:pointer;&:hover:not(:disabled){color:var(--color-text-primary);border-color:var(--color-action);}&:disabled{opacity:.38;cursor:not-allowed;}`;
const ProgressSection = styled.section`margin-top:16px;padding:15px;border:1px solid var(--color-border);border-radius:10px;`;
const ProgressHeading = styled.div`display:flex;align-items:center;justify-content:space-between;margin-bottom:13px;font-size:11px;span{color:var(--color-text-secondary);}strong{color:var(--color-text-primary);font-weight:650;}`;
const ProgressTrack = styled.div`display:flex;align-items:center;`;
const ProgressItem = styled.div<{ $active:boolean;$current:boolean }>`display:flex;align-items:center;gap:6px;flex:1;color:${p=>p.$active?'var(--color-action)':'var(--color-text-secondary)'};font-size:10px;font-weight:${p=>p.$current?680:520};white-space:nowrap;`;
const ProgressDot = styled.span`width:19px;height:19px;display:grid;place-items:center;flex:0 0 auto;border:1px solid currentColor;border-radius:50%;font-size:9px;`;
const ProgressLine = styled.span<{ $active:boolean }>`height:1px;flex:1;margin:0 7px;background:${p=>p.$active?'var(--color-action)':'var(--color-border)'};`;
const ResultBox = styled.div<{ $success:boolean }>`display:flex;align-items:flex-start;gap:10px;margin-top:14px;padding:14px;border:1px solid ${p=>p.$success?'var(--color-success-border)':'var(--color-danger-border)'};border-radius:10px;color:${p=>p.$success?'var(--color-success)':'var(--color-danger)'};background:${p=>p.$success?'var(--color-success-bg)':'var(--color-danger-bg)'};svg{flex:0 0 auto;}div{display:grid;gap:3px;}strong{font-size:12px;font-weight:680;}span{color:var(--color-text-secondary);font-size:11px;line-height:1.5;}`;
const ConnectionNotice = styled(ResultBox)`border-color:var(--color-warning-border);color:var(--color-warning);background:var(--color-warning-bg);`;
const EvidenceBox = styled.div`margin-top:12px;padding:14px;border:1px solid var(--color-border);border-radius:10px;background:var(--color-surface-muted);`;
const EvidenceTitle = styled.div`margin-bottom:10px;color:var(--color-text-primary);font-size:11px;font-weight:680;`;
const EvidenceGrid = styled.div`display:grid;grid-template-columns:1fr 1fr;gap:10px 16px;div{display:grid;gap:3px;min-width:0;}span{color:var(--color-text-secondary);font-size:9px;}code{overflow:hidden;color:var(--color-text-primary);font:10px ui-monospace,SFMono-Regular,monospace;text-overflow:ellipsis;white-space:nowrap;}@media(max-width:560px){grid-template-columns:1fr;}`;
const Certificate = styled.article<{ $approved:boolean;$error:boolean }>`position:relative;overflow:hidden;padding:30px;border:1px solid ${p=>p.$error?'var(--color-warning-border)':p.$approved?'var(--color-success-border)':'var(--color-border)'};border-radius:16px;background:var(--color-surface);box-shadow:0 18px 48px var(--color-shadow);&::before{content:'';position:absolute;top:0;bottom:0;left:0;width:5px;background:${p=>p.$error?'var(--color-warning)':p.$approved?'var(--color-success)':'var(--color-border-strong)'};}@media(max-width:560px){padding:22px;}`;
const CertificateHeader = styled.header`display:flex;align-items:flex-start;justify-content:space-between;gap:18px;`;
const DocumentLabel = styled.div`color:var(--color-text-secondary);font-size:11px;font-weight:650;`;
const DocumentId = styled.div`margin-top:5px;color:var(--color-text-primary);font:600 11px ui-monospace,SFMono-Regular,monospace;`;
const StatusStamp = styled.div<{ $approved:boolean;$error:boolean }>`padding:7px 10px;border:1px solid currentColor;border-radius:6px;color:${p=>p.$error?'var(--color-warning)':p.$approved?'var(--color-success)':'var(--color-text-secondary)'};font-size:11px;font-weight:760;letter-spacing:.04em;`;
const CertificateBody = styled.div`min-height:182px;display:flex;align-items:center;gap:20px;padding:34px 0 30px;@media(max-width:560px){align-items:flex-start;flex-direction:column;gap:15px;}`;
const CertificateMark = styled.div<{ $approved:boolean;$error:boolean }>`width:54px;height:54px;display:grid;place-items:center;flex:0 0 auto;border:1px solid currentColor;border-radius:50%;color:${p=>p.$error?'var(--color-warning)':p.$approved?'var(--color-success)':'var(--color-text-secondary)'};background:${p=>p.$error?'var(--color-warning-bg)':p.$approved?'var(--color-success-bg)':'var(--color-surface-muted)'};`;
const CertificateTitle = styled.h2`color:var(--color-text-primary);font-size:clamp(23px,3.4vw,34px);font-weight:720;line-height:1.25;letter-spacing:-.048em;`;
const CertificateDescription = styled.p`max-width:560px;margin-top:9px;color:var(--color-text-secondary);font-size:13px;line-height:1.65;`;
const CertificateRule = styled.div`display:flex;align-items:center;gap:12px;color:var(--color-text-secondary);font-size:9px;&::before,&::after{content:'';height:1px;flex:1;background-image:linear-gradient(to right,var(--color-border) 55%,transparent 55%);background-size:7px 1px;}`;
const CertificateFacts = styled.dl`display:grid;grid-template-columns:repeat(3,1fr);margin-top:22px;@media(max-width:560px){grid-template-columns:1fr;gap:13px;}`;
const CertificateFact = styled.div`display:grid;gap:5px;padding:0 18px;border-right:1px solid var(--color-border);&:first-of-type{padding-left:0;}&:last-of-type{padding-right:0;border-right:0;}dt{color:var(--color-text-secondary);font-size:10px;}dd{color:var(--color-text-primary);font-size:14px;font-weight:680;}@media(max-width:560px){padding:0;border-right:0;}`;
const CertificateNote = styled.p`margin-top:24px;padding-top:16px;border-top:1px solid var(--color-border);color:var(--color-text-secondary);font-size:10px;line-height:1.6;`;
const LedgerDisclosure = styled.section`overflow:hidden;border:1px solid var(--color-border);border-radius:12px;background:var(--color-surface);`;
const DisclosureButton = styled.button`width:100%;min-height:62px;padding:12px 16px;display:flex;align-items:center;justify-content:space-between;gap:16px;border:0;color:var(--color-text-primary);background:transparent;text-align:left;cursor:pointer;>span{display:grid;gap:3px;}strong{font-size:12px;font-weight:660;}small{color:var(--color-text-secondary);font-size:10px;}svg{color:var(--color-text-secondary);transition:transform 160ms ease;}&:hover{background:var(--color-surface-muted);}`;
const LedgerDetail = styled.div`display:grid;gap:7px;padding:0 16px 16px;`;
const DetailItem = styled.div`min-height:54px;padding:10px 11px;display:flex;align-items:center;justify-content:space-between;gap:10px;border-radius:8px;background:var(--color-surface-muted);>div{min-width:0;display:grid;gap:5px;}`;
const SmallLabel = styled.span`color:var(--color-text-secondary);font-size:9px;`;
const CodeText = styled.code`color:var(--color-text-primary);font:10px ui-monospace,SFMono-Regular,monospace;word-break:break-all;`;
const CopyButton = styled.button`width:30px;height:30px;display:grid;place-items:center;flex:0 0 auto;border:1px solid var(--color-border);border-radius:7px;color:var(--color-text-secondary);background:var(--color-surface);cursor:pointer;&:hover{color:var(--color-action);border-color:var(--color-action);}`;
const SideColumn = styled.aside`display:grid;gap:14px;`;
const PolicyCard = styled.section`padding:21px;border:1px solid var(--color-border);border-radius:14px;background:var(--color-surface);`;
const SideLabel = styled.div`margin-bottom:7px;color:var(--color-text-secondary);font-size:10px;font-weight:650;`;
const PolicyTitle = styled.h2`color:var(--color-text-primary);font-size:16px;font-weight:690;letter-spacing:-.03em;`;
const Formula = styled.div`display:flex;align-items:center;justify-content:center;gap:14px;margin:18px 0 12px;padding:16px;border-radius:9px;color:var(--color-text-primary);background:var(--color-surface-muted);font:650 17px ui-monospace,SFMono-Regular,monospace;span:first-of-type{color:var(--color-action);}b{color:var(--color-text-secondary);font-weight:450;}`;
const PolicyDescription = styled.p`color:var(--color-text-secondary);font-size:11px;line-height:1.65;`;
const ScopeCard = styled.section`padding:21px;border:1px solid var(--color-border);border-radius:14px;background:var(--color-surface);`;
const ScopeList = styled.div`display:grid;gap:16px;margin-top:15px;`;
const ScopeItem = styled.div`display:flex;align-items:flex-start;gap:10px;>div{display:grid;gap:3px;}strong{color:var(--color-text-primary);font-size:11px;font-weight:650;}span{color:var(--color-text-secondary);font-size:10px;line-height:1.5;}`;
const ScopeMark = styled.span<{ $private:boolean }>`width:19px;height:19px;display:grid;place-items:center;flex:0 0 auto;border:1px solid ${p=>p.$private?'var(--color-border-strong)':'var(--color-success-border)'};border-radius:50%;color:${p=>p.$private?'var(--color-text-secondary)':'var(--color-success)'}!important;background:${p=>p.$private?'transparent':'var(--color-success-bg)'};font-size:12px!important;line-height:1;`;
const LedgerSummary = styled.section`padding:21px;border:1px solid var(--color-border);border-radius:14px;background:var(--color-surface);`;
const LedgerConnection = styled.div<{ $error:boolean }>`display:flex;align-items:flex-start;gap:10px;margin-top:14px;${LiveDot}{margin-top:5px;}div{display:grid;gap:3px;}strong{color:${p=>p.$error?'var(--color-danger)':'var(--color-text-primary)'};font-size:11px;font-weight:650;}span{color:var(--color-text-secondary);font-size:10px;line-height:1.5;}`;
const PageFooter = styled.footer`min-height:54px;display:flex;align-items:center;justify-content:space-between;color:var(--color-text-secondary);font-size:10px;`;
const ResetButton = styled.button`display:flex;align-items:center;gap:6px;border:0;color:var(--color-text-secondary);background:transparent;font-size:10px;cursor:pointer;&:hover:not(:disabled){color:var(--color-action);}&:disabled{opacity:.4;cursor:not-allowed;}`;
