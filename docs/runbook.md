# Covenant Watch 운영 런북

## 배포 구성

프로덕션 이미지는 Node 22 Debian에서 Compact 0.31.1 계약을 컴파일한 뒤 Next standalone 서버와 ZK 자산을 묶습니다. 웹 서버는 외부 HTTPS 종단 뒤에 두고, indexer·node·proof server는 사설 네트워크에서만 접근시킵니다. `.covenant-runtime`은 재시작 후 계약·operation 복구에 필요하므로 영속 볼륨으로 마운트합니다.

## 새 환경 배포

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

외부 URL은 HTTPS를 사용해야 하며, 플랫폼의 요청 제한시간은 최초 상태 조회와 proof 제출을 고려해 10분 이상으로 설정합니다. `NEXT_PUBLIC_APP_MODE`와 `COVENANT_ADAPTER`는 모두 `midnight`로 고정합니다.

## 일상 점검

```bash
docker compose ps
curl -fsS http://localhost:9923/api/health
curl -fsS http://localhost:9923/api/state
docker compose logs --tail=100 web indexer proof-server
```

`/api/health`는 프로세스 liveness만 확인합니다. `/api/state`의 계약 주소, currentRound, approvedRound가 실제 readiness 기준입니다.

## 백업과 복구

중지 후 `covenant_runtime` 볼륨 전체를 암호화 백업합니다. 여기에는 지갑 seed 자체는 없지만 계약 역할 비밀값, blinding, 암호화된 private state, operation 기록이 있습니다. 일부 파일만 복사하지 않습니다.

복구 후 `/api/state`가 기존 계약 주소를 읽는지 확인합니다. `queued`, `proving`, `submitting`, `confirming` 상태에서 재시작된 작업은 `unknown`으로 바뀌며 자동 재제출되지 않습니다. operation의 transaction ID와 indexer 기록을 대조한 뒤 수동으로 종결합니다.

## 장애 대응

- `CHAIN_NOT_CONFIGURED`: URL·TLS·지갑 secret·ZK 자산 경로와 web 로그를 확인합니다. demo로 전환하지 않습니다.
- `BUSY`: 활성 operation을 조회하고 terminal 또는 `unknown`이 될 때까지 기다립니다.
- `STATE_CHANGED`: 최신 `/api/state`를 읽고 새 requestId로 다시 준비합니다.
- proof server 중단: 복구 후 기존 operation을 재사용하지 말고 `unknown` 여부와 원장 거래 유무를 먼저 확인합니다.
- indexer 지연: node에 직접 재제출하지 말고 indexer가 따라잡을 때까지 transaction ID를 보존합니다.

## 롤백

애플리케이션 이미지만 이전 digest로 되돌리고 runtime 볼륨은 유지합니다. Compact 회로 또는 verifier key가 바뀐 릴리스는 기존 계약과 호환성을 확인하지 않고 롤백·재배포하지 않습니다. 데이터 삭제가 필요한 데모 초기화는 UI의 초기화 동작으로 새 계약을 배포하며, 운영 데이터 삭제 수단으로 사용하지 않습니다.
