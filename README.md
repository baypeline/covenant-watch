# Covenant Watch

> 잔액을 공개하지 않고, 약속한 현금 여유가 있는지만 증명합니다.

Covenant Watch는 기업의 비공개 재무 스냅샷으로 `5 × C ≥ 6 × P`를 증명하고, 공개 원장에는 현재 기간·승인 기간·자료 커밋먼트만 남기는 Midnight 해커톤 데모입니다.

## 프로젝트 구조

Next.js가 저장소의 루트입니다. 앱 코드를 찾기 위해 별도 워크스페이스를 따라갈 필요가 없습니다.

```text
.
├─ src/
│  ├─ app/                    # App Router 페이지 + Route Handler
│  │  └─ api/
│  │     ├─ state/            # 공개 원장 상태 조회
│  │     ├─ verify/           # 약정 검증 요청
│  │     └─ admin/            # 기간 전환 / 데모 초기화
│  ├─ components/             # Emotion styled component UI
│  ├─ lib/                    # 브라우저 API + 서버 원장 어댑터
│  ├─ stores/                 # Zustand UI 상태
│  ├─ styles/                 # Emotion 전역 reset + 폰트
│  └─ types/                  # 화면/Route Handler 공용 계약
├─ contract/
│  └─ src/
│     ├─ covenant-watch.compact
│     ├─ model.ts
│     └─ model.test.ts
├─ Dockerfile
├─ compose.yml                # 웹 + Midnight node/indexer/proof server
└─ compose.dev.yml            # Next.js HMR 개발 환경
```

CSS 파일은 사용하지 않습니다. Pretendard `@font-face`와 브라우저 리셋은 `styles/GlobalStyles.tsx`의 Emotion `Global`, 나머지 스타일은 각 컴포넌트 선언 아래의 Emotion styled component로 구성했습니다.

## 빠른 시작

필수 환경은 Node.js 22.15 이상, pnpm 10, Docker Compose v2입니다.

```bash
corepack enable
pnpm install
pnpm dev
```

브라우저에서 <http://localhost:3000>으로 접속합니다. 기본값은 발표 흐름을 즉시 점검할 수 있는 `demo` 어댑터입니다.

Docker 개발 환경은 다음처럼 실행합니다. 이 명령은 Next.js만 올려 빠른 HMR을 제공합니다.

```bash
docker compose -f compose.yml -f compose.dev.yml up --build
```

Midnight 로컬 체인까지 함께 올리려면 `chain` 프로필을 추가합니다.

```bash
docker compose -f compose.yml -f compose.dev.yml --profile chain up --build
```

운영 이미지와 전체 로컬 체인은 다음 명령으로 실행합니다.

```bash
docker compose up --build -d
```

## Compact 계약

Windows의 `compact.exe`는 NTFS 압축 명령과 이름이 겹칩니다. Compact 도구는 WSL2 또는 Linux 셸에서 설치하는 편이 안전합니다.

```bash
curl --proto '=https' --tlsv1.2 -LsSf \
  https://github.com/midnightntwrk/compact/releases/latest/download/compact-installer.sh | sh
source "$HOME/.local/bin/env"
compact update 0.31.1
pnpm contract:compile
pnpm contract:test
```

계약의 공개 상태는 다음 세 값이 핵심입니다.

- `currentRound`: 현재 검증 기간
- `approvedRound`: 마지막 승인 기간
- `snapshotCommitment`: 현재 자료 커밋먼트

`advanceSnapshot`은 관리자 비밀값 소유와 새 커밋먼트를 검증하고 기간을 전환합니다. `verifyAndApprove`는 기업 권한, 기간, 커밋먼트, 금액 범위, 중복 승인과 현금 조건을 검사합니다. 현금 `C`, 지급예정액 `P`, 블라인딩 값, 역할 비밀값은 circuit의 비공개 인자로 유지됩니다.

## 3분 데모 순서

1. `1기 · 정상 자료`를 검증해 1기 승인을 만듭니다.
2. `2기 자료 등록`으로 현재 기간을 전환합니다.
3. `2기 · 현금 부족`을 신청해 `INSUFFICIENT_CASH`와 승인 미생성을 확인합니다.
4. `1기 · 이전 자료`를 신청해 `STALE_DATA`를 확인합니다.
5. `은행 보기`에서 원금액 없이 현재 기간, 승인 여부와 커밋먼트만 확인합니다.
6. 필요하면 하단 `초기 상태로 복구`로 처음부터 다시 시작합니다.

## 연결 경계

현재 웹 Route Handler는 UI와 발표 동선을 독립적으로 개발할 수 있도록 인메모리 데모 원장 어댑터를 사용합니다. Compact 계약은 실제 Midnight용 소스이며, 컴파일 시 생성되는 `contract/src/managed` 바인딩과 배포 주소를 Route Handler의 서버 어댑터에 연결하는 단계는 별도로 남겨 두었습니다. 즉, 화면의 `demo` 트랜잭션 식별자는 실제 체인 거래라고 표시해서는 안 됩니다.

실제 연결 시에도 응답 형태는 유지합니다.

```ts
getState(): LedgerState
verifyAndApprove(caseId):
  | { ok: true; transactionId: string; state: LedgerState }
  | { ok: false; code: CovenantErrorCode; state: LedgerState }
```

이 경계를 유지하면 프런트엔드 코드를 바꾸지 않고 `demo-ledger.ts`만 Midnight.js 기반 구현으로 교체할 수 있습니다.

## 검증

```bash
pnpm typecheck
pnpm build
pnpm contract:test
```

공개 상태나 로그에 `cash`, `payments`, `blinding`, `adminSecret`, `companySecret`이 들어가지 않는지 반드시 함께 확인하세요.
