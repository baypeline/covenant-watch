# Synology NAS 배포

이 구성은 Mac을 개발 환경으로만 사용하고 Synology DS723+에서 Covenant Watch Preprod 서비스를 지속 실행한다. NAS는 Midnight node나 indexer를 실행하지 않는다. 공식 Preprod endpoint를 사용하며 `web`, `proof-server`, 선택적인 `cloudflared`만 실행한다.

## 배포 경계

```text
Mac / GitHub                 Synology NAS                    Midnight
개발 → main push → GHCR  →  web + proof-server  ─────────→  Preprod
                                  ↑
                         Cloudflare Tunnel
```

- GitHub Actions는 `linux/amd64` 프로덕션 이미지를 GHCR에 `sha-<commit>` 태그로 발행한다.
- NAS는 소스를 빌드하지 않고 불변 SHA 태그 이미지를 내려받는다.
- 런타임과 지갑 체크포인트는 `/volume1/docker/covenant-watch/runtime`에 bind mount한다.
- proof server는 호스트 포트를 열지 않고 Docker 내부 backend 네트워크에서만 접근한다.
- Cloudflare Tunnel은 outbound 연결만 사용하며 공유기 포트 포워딩을 요구하지 않는다.

## 1. GitHub 이미지 준비

`main`에 push하거나 GitHub의 `Publish NAS image` workflow를 수동 실행한다. 완료 후 workflow가 만든 다음 형태의 태그를 사용한다.

```text
ghcr.io/baypeline/covenant-watch:sha-0123456
```

GHCR package를 공개로 설정하면 NAS 로그인 없이 pull할 수 있다. 비공개 package로 유지할 경우 NAS에서 `read:packages` 권한만 가진 GitHub token으로 `docker login ghcr.io`를 수행한다. `main` 태그는 확인용이며 실제 배포와 롤백에는 `sha-*` 태그를 사용한다.

## 2. NAS 디렉터리와 설정 준비

NAS에 SSH로 접속해 배포 디렉터리를 만들고 이 저장소의 `compose.nas.yml`과 `.env.nas.example`을 복사한다.

```bash
sudo mkdir -p /volume1/docker/covenant-watch/runtime
sudo chown -R 1001:1001 /volume1/docker/covenant-watch/runtime
sudo chmod 700 /volume1/docker/covenant-watch/runtime
cp .env.nas.example .env.nas
chmod 600 .env.nas
```

`.env.nas`에는 다음 값을 반드시 채운다.

- `COVENANT_IMAGE`: workflow가 발행한 `sha-*` 이미지
- `COVENANT_DATA_DIR`: 기본값 `/volume1/docker/covenant-watch`
- `MIDNIGHT_WALLET_SEED`: Mac의 `.env.preprod`와 동일한 값
- `MIDNIGHT_PRIVATE_STATE_PASSWORD`: Mac의 `.env.preprod`와 동일한 값
- `CLOUDFLARE_TUNNEL_TOKEN`: Tunnel을 함께 실행할 때만 설정

환경 파일을 터미널에 출력하거나 Git에 추가하지 않는다.

## 3. 지갑 체크포인트 이전

Mac에서 완료된 최초 동기화를 재사용하려면 `.covenant-runtime`의 `preprod-*.state` 파일을 NAS runtime 디렉터리로 안전하게 전송한다. 전송 전에 Mac의 Preprod 웹과 지갑 프로세스를 종료해 마지막 체크포인트가 기록되도록 한다.

```bash
rsync -a --include='preprod-*.state' --exclude='*' \
  .covenant-runtime/ <nas-user>@<nas-host>:/volume1/docker/covenant-watch/runtime/
```

NAS에서 소유권과 권한을 다시 고정한다.

```bash
sudo chown 1001:1001 /volume1/docker/covenant-watch/runtime/preprod-*.state
sudo chmod 600 /volume1/docker/covenant-watch/runtime/preprod-*.state
```

`midnight-runtime.json`, `midnight-level-db`, `operations.json`이 이미 생성된 운영 환경을 이전한다면 일부 파일만 고르지 말고 runtime 디렉터리 전체를 서비스 중지 상태에서 복사한다. 이 데이터와 지갑 시드는 한 세트로 백업한다.

## 4. Compose 검증과 최초 기동

다음 명령은 NAS에 Node.js나 pnpm이 없어도 Docker Compose만으로 실행할 수 있다.

```bash
docker compose --env-file .env.nas -f compose.nas.yml config --quiet
docker compose --env-file .env.nas -f compose.nas.yml pull web proof-server
docker compose --env-file .env.nas -f compose.nas.yml up -d --wait web proof-server
curl -fsS http://127.0.0.1:9923/api/health
curl --fail --max-time 900 http://127.0.0.1:9923/api/state
```

`/api/state`가 `network: preprod`와 64자리 계약 주소를 반환해야 한다. 체크포인트가 정상 이전되었다면 web 로그에 `Restored wallet checkpoints`가 출력되고 저장 지점 이후만 따라잡는다.

## 5. Cloudflare Tunnel 연결

Cloudflare dashboard에서 remotely-managed Tunnel과 공개 hostname을 만든다. hostname의 origin service는 다음과 같이 지정한다.

```text
http://web:3000
```

Tunnel token을 `.env.nas`의 `CLOUDFLARE_TUNNEL_TOKEN`에 저장한 뒤 선택 프로필을 시작한다.

```bash
docker compose --env-file .env.nas -f compose.nas.yml --profile tunnel up -d --wait
docker compose --env-file .env.nas -f compose.nas.yml --profile tunnel logs --tail=100 cloudflared
```

Tunnel token은 Tunnel을 실행할 수 있는 비밀정보다. Cloudflare Access를 hostname 앞에 적용해 공개 방문자가 서버 지갑으로 검증 요청을 반복하지 못하게 한다. 공유기의 9923·6300 포트는 개방하지 않는다.

## 업데이트와 롤백

새 커밋의 image workflow가 완료되면 `.env.nas`의 `COVENANT_IMAGE`만 새 `sha-*` 태그로 바꾼다.

```bash
docker compose --env-file .env.nas -f compose.nas.yml pull web
docker compose --env-file .env.nas -f compose.nas.yml up -d --wait web
```

실패하면 `COVENANT_IMAGE`를 직전 SHA 태그로 되돌려 같은 명령을 실행한다. runtime 디렉터리는 이미지 업데이트나 롤백 시 삭제하지 않는다.

## 운영 주의사항

- 같은 지갑과 runtime을 사용하는 Mac 웹과 NAS 웹을 동시에 운영하지 않는다. 동시 거래 제출과 서로 다른 체크포인트 기록을 피해야 한다.
- NAS 재부팅 후 컨테이너는 `restart: unless-stopped` 정책으로 다시 시작한다.
- `docker compose ps`, `/api/health`, `/api/state`를 readiness 점검에 사용한다.
- `.env.nas`와 runtime 전체를 정기적으로 암호화 백업한다.
- runtime 복사와 복구는 web 컨테이너를 중지한 상태에서 수행한다.
- proof server와 cloudflared 이미지는 digest로 고정되어 있다. 업그레이드는 호환성을 확인한 별도 커밋으로 수행한다.
