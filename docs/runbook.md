# Covenant Watch 운영 런북

## 배포 구성

프로덕션 이미지는 Node 22 Debian에서 Compact 0.31.1 계약을 컴파일한 뒤 Next standalone 서버와 ZK 자산을 묶습니다. 웹 서버는 외부 HTTPS 종단 뒤에 두고, indexer·node·proof server는 사설 네트워크에서만 접근시킵니다. `.covenant-runtime`은 재시작 후 계약·operation 복구에 필요하므로 영속 볼륨으로 마운트합니다.

## 새 환경 배포

### 로컬 undeployed

```bash
git clone git@github.com:baypeline/covenant-watch.git
cd covenant-watch
cp .env.example .env
docker compose build web
COVENANT_ADAPTER=midnight NEXT_PUBLIC_APP_MODE=midnight docker compose up -d
curl http://localhost:9923/api/health
curl http://localhost:9923/api/state
```

첫 `/api/state`는 로컬 지갑 동기화와 계약 배포를 포함해 1~2분 걸릴 수 있습니다. 성공 응답의 `mode`가 `midnight`이고 계약 주소가 64자리인지 확인합니다. 외부 네트워크에서는 다음 값을 배포 플랫폼의 secret으로 주입합니다.

- `MIDNIGHT_WALLET_SEED`
- `MIDNIGHT_PRIVATE_STATE_PASSWORD`
- `MIDNIGHT_INDEXER_URL`, `MIDNIGHT_INDEXER_WS_URL`
- `MIDNIGHT_NODE_URL`, `MIDNIGHT_NODE_WS_URL`
- `MIDNIGHT_PROOF_SERVER_URL`

### Preprod

Preprod에서는 공식 node와 indexer를 사용하고 이 호스트에는 웹과 proof server만 실행합니다. `.env.example`은 로컬 개발용이므로 배포에 재사용하지 않습니다.

```bash
pnpm preprod:wallet:init
pnpm preprod:wallet:address
```

출력된 `mn_addr_preprod` 주소를 Preprod Faucet에서 충전합니다. `.env.preprod`에는 지갑 시드와 private-state 암호가 들어 있으며 권한은 `0600`이어야 합니다. 해당 파일의 내용을 터미널, 이슈, 메신저 또는 로그에 출력하지 않습니다.

충전이 확정되면 로컬 개발 스택을 내리고 Preprod proof server를 시작해 NIGHT를 DUST 생성에 등록합니다.

```bash
pnpm chain:down
pnpm preprod:proof:up
pnpm preprod:wallet:register
```

등록 거래와 양수 DUST 잔액이 출력된 뒤 서비스를 시작합니다.

```bash
pnpm preprod:config
pnpm preprod:up
curl --fail --max-time 900 http://127.0.0.1:9923/api/state
```

`/api/state`의 `network`가 `preprod`이고 계약 주소가 64자리이면 초기 배포가 완료된 것입니다. 계약 주소, 마지막 거래 ID, `covenant-watch-preprod_covenant_preprod_runtime` 볼륨을 함께 기록합니다. 이후 재시작은 기존 볼륨에서 같은 계약과 역할 비밀을 복구해야 합니다.

외부 URL은 HTTPS를 사용해야 하며, 플랫폼의 요청 제한시간은 최초 상태 조회와 proof 제출을 고려해 10분 이상으로 설정합니다. `NEXT_PUBLIC_APP_MODE`와 `COVENANT_ADAPTER`는 모두 `midnight`로 고정합니다.

외부 배포는 URL 전체에 접근제어를 적용해 공개 방문자가 서버 기업 지갑으로 증명을 반복 실행하지 못하게 합니다. 관리자 HTTP 경로는 기본적으로 `404`이며, 운영 CLI가 필요할 때만 아래 비밀값을 주입합니다.

```bash
COVENANT_ENABLE_OPERATOR_HTTP=true
COVENANT_OPERATOR_TOKEN='<secret manager value>'
COVENANT_OPERATOR_URL=https://restricted.example pnpm operator:advance
```

토큰은 브라우저에 전달하지 않습니다. 로컬 전용 UI 제어가 필요하면 운영 HTTP를 활성화하되 토큰을 비워둘 수 있으며, 이 설정을 외부 URL에 사용하지 않습니다.

## 일상 점검

```bash
docker compose ps
curl -fsS http://localhost:9923/api/health
curl -fsS http://localhost:9923/api/state
docker compose logs --tail=100 web indexer proof-server
```

Preprod는 모든 명령에 전용 파일을 사용합니다.

```bash
docker compose --env-file .env.preprod -f compose.preprod.yml ps
curl -fsS http://127.0.0.1:9923/api/health
curl -fsS http://127.0.0.1:9923/api/state
docker compose --env-file .env.preprod -f compose.preprod.yml logs --tail=100 web proof-server
```

`/api/health`는 프로세스 liveness만 확인합니다. `/api/state` 응답의 계약 주소와 `state.currentRound`, `state.approvedRound`가 실제 readiness 기준입니다.

## 백업과 복구

중지 후 `covenant_runtime` 볼륨 전체를 암호화 백업합니다. 여기에는 지갑 seed 자체는 없지만 계약 역할 비밀값, blinding, 암호화된 private state, operation 기록이 있습니다. 일부 파일만 복사하지 않습니다.

복구 후 `/api/state`가 기존 계약 주소를 읽는지 확인합니다. `queued`, `proving`, `submitting`, `confirming` 상태에서 재시작된 작업은 `unknown`으로 바뀌며 자동 재제출되지 않습니다. transaction ID가 저장된 작업은 공개 원장의 같은 기간 승인이 확인되면 자동으로 `confirmed`가 됩니다. 나머지는 operation의 transaction ID와 indexer 기록을 대조하고 `unknown` 상태를 유지한 채 수동 판단합니다.

## 장애 대응

- `CHAIN_NOT_CONFIGURED`: URL·TLS·지갑 secret·ZK 자산 경로와 web 로그를 확인합니다. demo로 전환하지 않습니다.
- `BUSY`: 활성 operation을 조회하고 terminal 또는 `unknown`이 될 때까지 기다립니다.
- `STATE_CHANGED`: 최신 `/api/state`를 읽고 새 requestId로 다시 준비합니다.
- proof server 중단: 복구 후 기존 operation을 재사용하지 말고 `unknown` 여부와 원장 거래 유무를 먼저 확인합니다.
- indexer 지연: node에 직접 재제출하지 말고 indexer가 따라잡을 때까지 transaction ID를 보존합니다.

## 롤백

애플리케이션 이미지만 이전 digest로 되돌리고 runtime 볼륨은 유지합니다. Compact 회로 또는 verifier key가 바뀐 릴리스는 기존 계약과 호환성을 확인하지 않고 롤백·재배포하지 않습니다. 데이터 삭제가 필요한 데모 초기화는 `pnpm operator:reset`으로 새 계약을 배포하며, 운영 데이터 삭제 수단으로 사용하지 않습니다.
