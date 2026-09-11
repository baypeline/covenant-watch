# 단계별 인수 결과

검증일: 2026-09-11 (Asia/Seoul)

| 단계 | 완료 게이트 | 결과 |
| --- | --- | --- |
| 0 기술 스파이크 | 실제 계약 주소·거래 ID·원장 조회 | 통과 |
| 1 계약 확정 | 경계·변조·권한 회로 테스트 | 30/30 통과 |
| 2 실제 어댑터·CLI | 실제 체인 3장면 | 통과 |
| 3 비동기 API | confirmed/rejected/error/unknown, 멱등·복구 | 14/14 통과 |
| 4 UI 실제 연결 | 실제 원장 폴링·거래 증거 화면 | 통과 |
| 5 E2E·보안 | 장애 주입·동시 요청·비밀 검사 | 통과 |
| 6 배포·인계 | 새 Docker 빌드·외부 HTTPS·문서 | 임시 HTTPS 통과, 고정 URL 전환 필요 |

## 실제 체인 증거

- 0단계 계약: `bd5bcbbff0a982416fbaeb9dbeeee6c3f25e6b741f7529df77c0f900827a382c`
- 0단계 승인 거래: `00814c994c283ff8a393d0eed40c74ae6ef84631f7ecb4a2dcc1b16d1ae2670b58`
- 2단계 계약: `4212787135b15dd5490c53fb408efd47a528b417cf5adee8af308b54d2be4ee7`
- 2단계 1기 승인 거래: `008d6d5456e2736a5d984fcd3f6bcab70f6cec238d6b1711973b165ec03cbd1e1e`
- 2단계 2기 전환 거래: `0066d3cc782e65805ce47b2a0ee0c961d4eb6b6894ee57dd8297c900db0acbabc1`
- 4단계 웹 계약: `58a8975a8211605f369ba23065d2c361967436b3826d3617f481e759d0590b6c`
- 4단계 웹 1기 승인 거래: `00030902e602d40ae8f882b8338185f3e2fa7b52d3a75bfd2fe5ba1f1df7fc6ad0`
- 4단계 웹 2기 전환 거래: `00c7ca1cd13dd421c56dc6fc6649a9ed24a4671f0b4a4b0cb930ff8c99f6634f4a`
- 6단계 새 Docker 계약: `02e46abfa5a7b9c4c23175f5be85b4e871ceaa63baecc5789496cf5f82a031f2`
- 6단계 Docker 배포 거래: `00a0b90ee3892a2f26d4c3992b20481398b8c26d921ffb6232273b60f7d432fb15`
- 단계 추적 검수 operation: `a0e6d02a-cefa-4bba-9250-f980f89178a9`
- 단계 추적 검수 승인 거래: `0047ec9bd810975f108024e8af40e0b65053a1496787c5244ae99a86fa347b20a1`

단계 추적 검수에서는 실제 `proving`이 약 18.8초 지속됐고 승인 거래가 확정됐습니다. 로컬 Devnet의 지갑 제출부터 확정까지는 200ms 폴링보다 짧아 클라이언트 표본에서는 중간 상태가 생략됐지만, 서버는 지갑 `submitTx` 직전 `submitting`, transaction ID 수신 직후 `confirming`을 영속 기록합니다. 표시를 위한 인위적 지연은 사용하지 않습니다.

## 외부 HTTPS 확인

2026-09-11 17:08 KST에 Cloudflare Quick Tunnel을 통해 `/api/state`의 `mode=midnight`, `currentRound=1`, 위 Docker 계약 주소를 외부에서 확인했습니다. 무인증 쓰기 지갑 노출을 막기 위해 확인 직후 터널을 종료했습니다. Quick Tunnel 주소는 만료됐으며 제출 URL로 사용하지 않습니다.
