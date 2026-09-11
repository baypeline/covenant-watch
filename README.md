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
pnpm install --frozen-lockfile
pnpm dev
```

브라우저에서 <http://localhost:3000>으로 접속합니다. 기본값은 발표 흐름을 즉시 점검할 수 있는 `demo` 어댑터입니다.

Docker 개발 환경은 다음처럼 실행합니다. 이 명령은 Next.js만 올려 빠른 HMR을 제공합니다.

```bash
docker compose -f compose.yml -f compose.dev.yml up --build
```

Docker 웹은 <http://localhost:9923>으로 접속합니다. 호스트에 공개하는 기본 포트는 웹 `9923`, proof server `16300`, indexer `18088`, node `19944`이며 `.env`의 `COVENANT_*_PORT` 값으로 변경할 수 있습니다. 컨테이너 사이의 내부 포트는 변경하지 않습니다.

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

기업 식별값은 원장 필드로 공개하지 않습니다. 배포 시 기업 식별값과 기업 비밀값을 함께 해시한 인증 공개키로 기업을 고정하고, 각 기간의 자료 커밋먼트에도 동일한 식별값을 비공개 입력으로 결합합니다.

`advanceSnapshot`은 관리자 비밀값 소유와 새 커밋먼트를 검증하고 기간을 전환합니다. `verifyAndApprove`는 기업 권한, 기간, 커밋먼트, 금액 범위, 중복 승인과 현금 조건을 검사합니다. 현금 `C`, 지급예정액 `P`, 블라인딩 값, 역할 비밀값은 circuit의 비공개 인자로 유지됩니다.

## 로컬 Midnight 수직 슬라이스

실제 로컬 node, indexer, proof server에서 계약 배포와 1기 정상 승인을 한 번에 검증할 수 있습니다. 먼저 위 Compact toolchain을 설치하고 새 셸에서 경로를 활성화합니다.

```bash
source "$HOME/.local/bin/env"
pnpm install --frozen-lockfile
pnpm phase0:verify
```

`phase0:verify`는 다음 작업을 순서대로 수행합니다.

1. `undeployed` 로컬 네트워크의 node, indexer, proof server를 기동하고 health check를 기다립니다.
2. Compact 계약을 컴파일해 `contract/src/managed/covenant-watch`를 생성합니다.
3. 로컬 genesis 지갑으로 새 계약을 배포합니다.
4. 무작위 역할 비밀값과 blinding으로 자료 A(`C=150`, `P=100`)를 실제 증명·제출합니다.
5. indexer에서 원장을 다시 읽어 `currentRound=1`, `approvedRound=1`을 검증합니다.

성공하면 계약 주소, 배포·승인 거래 ID, 승인 블록, 공개 원장 상태가 출력됩니다. 동일한 비공개 입력은 출력하거나 저장하지 않으며, 비밀값을 제외한 마지막 실행 영수증만 `.covenant-runtime/phase0-smoke.json`에 기록합니다.

```bash
pnpm chain:down
```

생성된 계약 바인딩과 로컬 실행 기록은 빌드 산출물이므로 Git에 커밋하지 않습니다. 이 smoke 명령은 매 실행마다 새 계약을 배포합니다.

전체 발표 흐름은 하나의 운영 CLI로 재현할 수 있습니다.

```bash
pnpm phase2:verify
```

이 명령은 새 계약 배포, 1기 정상 승인, 2기 자료 전환, 2기 현금 부족 거절, 1기 자료 재사용 거절을 실제 회로와 로컬 체인에서 순서대로 실행합니다. 거절된 두 장면에는 거래 ID가 생성되지 않고, 최종 원장은 `currentRound=2`, `approvedRound=1`을 유지해야 성공합니다. 공개 결과는 `.covenant-runtime/phase2-demo.json`에 기록됩니다.

## 비동기 검증 API

검증은 장시간 걸리는 증명 생성을 HTTP 요청 수명과 분리합니다. `POST /api/verify`에 `caseId`, 클라이언트가 생성한 `requestId`, 화면이 읽은 `expectedRound`를 보내면 `202 Accepted`와 `operationId`를 반환합니다. 이후 `GET /api/verify/{operationId}`를 폴링해 다음 상태를 추적합니다.

```text
queued → proving → submitting → confirming → confirmed
                                └──────────→ rejected
                     통신 결과 불명 ──────→ unknown
```

같은 본문의 `requestId` 재시도는 최초 작업을 반환하고, 다른 본문으로 재사용하면 `IDEMPOTENCY_CONFLICT`입니다. 동시에 하나의 작업만 허용하며, 요청 준비 후 기간이 바뀌면 각각 `BUSY`, `STATE_CHANGED`로 거절합니다. 작업 기록은 기본적으로 `.covenant-runtime/operations.json`에 원자적으로 저장하고 비공개 금액이나 비밀값을 포함하지 않습니다. 서버가 미완료 작업을 읽으면 자동 재제출하지 않고 `unknown`으로 복구합니다.

```bash
pnpm phase3:verify
```

이 게이트는 타입 검사, idempotency·동시성·재시작·오류 매핑 테스트, 프로덕션 빌드를 실행합니다.

## 웹의 실제 Midnight 연결

웹은 `COVENANT_ADAPTER`로 실행 모드를 명시합니다. `demo`는 UI 개발용 메모리 원장이고, `midnight`는 wallet·indexer·proof server와 Compact 생성 바인딩을 직접 사용합니다. 실제 모드 초기화나 조회가 실패하면 `503 CHAIN_NOT_CONFIGURED`를 반환하며 데모로 자동 전환하지 않습니다.

```bash
pnpm chain:up
pnpm contract:compile
COVENANT_ADAPTER=midnight NEXT_PUBLIC_APP_MODE=midnight pnpm dev
```

`undeployed` 네트워크에서는 로컬 genesis 지갑만 사용합니다. 다른 네트워크에서는 `MIDNIGHT_WALLET_SEED`와 `MIDNIGHT_PRIVATE_STATE_PASSWORD`를 반드시 별도 비밀 저장소로 주입해야 합니다. 계약 역할 비밀값과 각 기간의 blinding은 권한 `0600`의 `.covenant-runtime/midnight-runtime.json`에 저장되며 API 응답이나 작업 파일에는 기록하지 않습니다.

브라우저는 검증을 접수한 뒤 작업 API를 750ms 간격으로 폴링합니다. 임의의 진행 연출 타이머는 없으며 서버가 보고한 단계만 표시합니다. 완료 화면에서는 operation ID, 제출 기간, 실제 transaction ID, 마지막 확인 시각을 공개 증거로 보여줍니다. 상단 증거 흐름선은 비공개 입력이 증명을 거쳐 공개 원장 사실로 바뀌는 경계를 시각화합니다.

## 배포와 인계

프로덕션 Docker 빌드는 생성 파일이 없는 새 checkout에서도 Compact 0.31.1을 설치해 계약을 컴파일합니다. 실제 모드의 계약·private state·operation은 `covenant_runtime` 볼륨에 유지되고 `/api/health`로 프로세스 상태를 확인할 수 있습니다.

```bash
pnpm phase6:verify
COVENANT_ADAPTER=midnight NEXT_PUBLIC_APP_MODE=midnight docker compose up -d
```

- [운영 런북](docs/runbook.md): 새 환경 배포, readiness, 백업·복구, 장애 대응, 롤백
- [3분 영상 대본](docs/demo-video-script.md): 제출 영상 장면과 발화 순서
- [단계별 인수 결과](docs/acceptance.md): 실제 계약·거래 증거와 완료 게이트

계정 없는 임시 외부 미리보기는 `cloudflared tunnel --url http://127.0.0.1:9923`으로 열 수 있습니다. 이 URL은 uptime 보장이 없으므로 해커톤 제출 URL은 Cloudflare named tunnel이나 동일한 장기 실행 플랫폼에 Docker 이미지를 배포해 고정해야 합니다.

## 3분 데모 순서

1. `1기 · 정상 자료`를 검증해 1기 승인을 만듭니다.
2. `2기 자료 등록`으로 현재 기간을 전환합니다.
3. `2기 · 현금 부족`을 신청해 `INSUFFICIENT_CASH`와 승인 미생성을 확인합니다.
4. `1기 · 이전 자료`를 신청해 `STALE_DATA`를 확인합니다.
5. `은행 보기`에서 원금액 없이 현재 기간, 승인 여부와 커밋먼트만 확인합니다.
6. 필요하면 하단 `초기 상태로 복구`로 처음부터 다시 시작합니다.

## 연결 경계

현재 웹 Route Handler는 UI와 발표 동선을 독립적으로 개발할 수 있도록 인메모리 데모 원장 어댑터를 사용합니다. Compact 계약은 실제 Midnight용 소스이며, 컴파일 시 생성되는 `contract/src/managed` 바인딩과 배포 주소를 Route Handler의 서버 어댑터에 연결하는 단계는 별도로 남겨 두었습니다. 즉, 화면의 `demo` 트랜잭션 식별자는 실제 체인 거래라고 표시해서는 안 됩니다. 실제 모드가 실패할 때 데모 모드로 자동 전환해서도 안 됩니다.

실제 연결 시에도 비동기 작업 경계는 유지합니다.

```ts
startVerification(caseId, requestId, expectedRound): StartVerifyResponse
getVerification(operationId): VerificationOperation
```

이 경계를 유지하면 프런트엔드 상태 추적을 바꾸지 않고 실행 어댑터만 Midnight.js 기반 구현으로 교체할 수 있습니다.

## 검증

```bash
pnpm phase5:verify
pnpm typecheck
pnpm build
pnpm test:api
pnpm contract:test
```

`phase5:verify`는 회로 30건, API 상태 머신 10건, 프로덕션 빌드, HTTP 3장면 E2E, 추적 파일 비밀정보 검사를 순서대로 수행합니다. 상세 신뢰 경계와 잔여 위험은 [보안 검수](docs/security-review.md)에 기록했습니다.
