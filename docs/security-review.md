# Covenant Watch 보안 검수

## 보호 대상과 신뢰 경계

- 비공개 대상: 기업 식별값, 현금, 지급예정액, blinding, 기업·관리자 비밀값, 지갑 seed
- 공개 대상: 네트워크, 계약 주소, 현재·승인 기간, snapshot commitment, transaction ID, operation ID
- 브라우저는 준비된 `caseId`만 보내고 원금액이나 비밀값을 전송하지 않습니다.
- 서버는 비공개 입력으로 proof를 만들지만 operation 저장소에는 공개 결과만 기록합니다.
- indexer·node·proof server의 통신 결과가 불명확하면 재제출하지 않고 `unknown`으로 종료합니다.

## 적용한 통제

- `expectedRound`로 화면 조회 이후 기간 전환 경쟁을 차단합니다.
- `requestId`와 요청 fingerprint로 같은 요청의 재시도를 멱등 처리합니다.
- 프로세스당 활성 검증을 하나로 제한해 지갑 nonce·원장 상태 경쟁을 줄입니다.
- operation과 Midnight runtime 파일은 임시 파일 작성 후 rename하며 디렉터리 `0700`, 파일 `0600`을 사용합니다.
- 브라우저 세션에는 operation ID, request ID, 계약 주소만 저장하며 request ID 역조회로 응답 유실을 복구합니다.
- 기간 전환용 관리자 HTTP 경로는 기본 비활성화하며, 활성화 시 운영 토큰을 상수 시간 비교합니다. 새 데모 시작은 데모 로그인 세션 또는 운영 토큰을 확인하고 새 계약을 배포합니다. 외부 데모 URL은 별도의 앞단 접근제어가 필요합니다.
- 실제 어댑터 초기화 실패는 `503`이며 demo 어댑터로 강등하지 않습니다.
- 계약의 범위·권한·커밋먼트·중복 승인 검사는 Compact 회로와 생성 바인딩 테스트에서 함께 검증합니다.
- `pnpm security:check`는 추적된 비밀 파일, 대표 credential signature, 비어 있지 않은 지갑 seed·private-state 비밀번호를 검사합니다.

## 장애 주입 결과

- 거래 제출 이후 어댑터 예외: operation은 `unknown`, 동일 requestId 재시도는 같은 operation, 제출 시도는 1회
- proof·거래 구성 단계 예외: transaction ID 없이 `error`로 종료하며 제출 후 불명 상태와 구분
- 서버 재시작 중 `queued/proving/submitting/confirming`: 로드 시 `unknown`, 자동 재제출 없음
- 동시 요청: 하나만 접수되고 나머지는 `409 BUSY`
- 기간 변경: `409 STATE_CHANGED`
- 잘못된 본문과 없는 operation: 각각 `400 BAD_REQUEST`, `404 OPERATION_NOT_FOUND`

## 운영 전 남은 조치

- 로컬 genesis seed와 기본 private-state 비밀번호는 `undeployed` 네트워크 전용입니다. 외부 네트워크에서는 비밀 저장소 주입을 강제합니다.
- 공개 배포에서는 기간 전환 Route와 새 계약을 배포하는 데모 초기화 Route에 rate limit을 붙여야 합니다. 현재 고정 데모 계정은 공개 운영 서비스의 인증 수단으로 사용하지 않습니다.
- `unknown` 작업의 transaction ID가 확보되고 같은 기간 승인이 공개 원장에서 확인되면 자동으로 확정 복구합니다. 그 외에는 자동 재제출 없이 수동 거래 조회가 필요합니다.
