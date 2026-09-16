# Cherrypicker 주소 전환

기준일: 2026-09-16. 사용자가 목표 주소, 협업자 푸시, 새 프로필의 빈 DB 시작을 승인했다. 실제 운영 전환은 아직 완료하지 않았다.

## 대상

| 항목 | 현재 운영 | 전환 목표 |
| --- | --- | --- |
| 개발 브랜치 | `promotion`에서 개발 | `main`으로 통합 |
| 관리형 앱 ID | `cherrypicker-promotion` | `cherrypicker` |
| 주소 | `https://cherrypicker-promotion.app.hurdoo.kr` | `https://cherrypicker.app.hurdoo.kr` |
| 이미지 저장소 | `ghcr.io/hurdoo/cherrypicker` | 동일 |
| 운영 revision | `b2ec3ec` (2026-08-22) | 검증·커밋한 통합 revision |

## 앱 설정 변경만으로 이전할 수 없는 항목

- deployd v0.7.3의 기존 앱 설정은 앱 ID·hostname 변경을 허용하지 않는다. `deploy.json`의 새 ID는 별도 등록 대상을 뜻하며 기존 앱 이름 변경 명령이 아니다.
- 새 앱에는 별도 영속 데이터와 secret 등록 상태가 생긴다. 이번 승인에 따라 기존 DB, 관리자 계정과 검수 revision을 이전하지 않고 새 DB를 구축한다. 기존 앱 자체를 삭제하거나 기존 DB를 덮어쓰지는 않는다. secret 값은 사용자가 새 앱에 직접 등록한다.
- 기존 운영 카탈로그는 조회 시 카드 8장이다. 로컬의 검수 카드 14장과 후보·revision은 이미지 빌드에 포함되지 않으므로 운영 데이터 반영 범위를 별도로 검토한다. 미승인 두산 후보는 계속 미게시로 유지한다.
- 브라우저 IndexedDB와 로그인 쿠키는 origin마다 분리된다. 서버 DB 이전이나 redirect로 개인 workspace가 옮겨지지 않는다.

## 전환 순서

1. 기존 작업과 main 이력을 보존해 통합하고 lint·전체 테스트·production build를 통과한다. `hurdooagent` collaborator로 원격 main에 푸시하고 clean revision의 ARM64 이미지를 게시한다.
2. 최초 계약은 `access=private`, `ADMIN_ACCESS_MODE=FIRST_USER`, `ALLOW_SIGN_UP=true`다. 기존 DB를 복원하지 않고 신규 `/data`에 커밋된 migration 20개와 seed 카드 8장을 적용한다. 로컬 검수 데이터 14장은 자동 반영되지 않는다.
3. 사용자가 private deployd 대시보드의 **새 앱 배포**에 발행된 원본 JSON을 적용하고 **앱 생성 및 첫 배포**를 제출한다. 필수 secret이 아직 없으면 앱 등록 뒤 첫 배포가 secret preflight에서 멈추는 것이 정상이다.
4. 사용자가 새 앱의 **Secrets**에서 `BETTER_AUTH_SECRET`을 입력한다. 값은 채팅·저장소·handoff에 넣지 않는다. `OPENAI_API_KEY`는 선택 사항이며 초기 실행에 필요하지 않다. 읽기 전용 상태 조회로 `secretsReady=true`를 확인한 후 사용자가 **배포**에서 첫 이미지 재시도를 제출한다.
5. private 주소의 health·catalog와 실제 revision·digest를 확인한다. 사용자가 LAN/WireGuard로 `https://cherrypicker.app.hurdoo.kr/signup`에 접속해 의도한 첫 계정을 만든다. 가입이 열린 동안에는 FIRST_USER 관리자 권한도 닫혀 있다.
6. 첫 계정 생성 직후 `deploy.json`의 `ALLOW_SIGN_UP`을 `false`, `access`를 `public`으로 갱신·커밋한다. 설정 전용 원본 handoff를 사용자가 대시보드 **설정**에서 검토·제출한다. 같은 이미지 재시작 뒤 healthy·가입 화면/API 차단·첫 계정 관리자 접근을 검증한다. 별도 이미지 재빌드는 필요하지 않다.
7. 새 주소에서 비로그인 추천→기록→재접속과 실제 휴대폰 접근을 검증한다. 필요한 추가 카드·혜택은 공식 수집·검수로 구축하며 미승인 두산 후보를 자동 게시하지 않는다. 온보딩 완료 전 정상적인 후속 release·rollback도 사용자 승인 아래 확인한다.
8. 이전 브라우저 데이터가 필요하면 사용자가 같은 기기·브라우저의 이전 주소에서 JSON을 내보내고 새 주소에서 가져온다. 새 DB에는 과거 서버 계정이 없으므로 기존 계정 동기화로 복원된다고 안내하지 않는다.
9. 새 주소 실사용 확인 뒤 이전 주소 안내·redirect·기존 앱 종료를 별도로 결정한다. 이 작업에는 자동 redirect나 앱 삭제를 포함하지 않는다.

## 코드의 주소 처리

컨테이너는 명시적인 `BETTER_AUTH_URL`을 우선하고, 없으면 플랫폼의 `APP_BASE_URL`을 사용한다. 둘 다 없을 때만 새 기본 주소를 사용한다. 따라서 같은 이미지도 기존 앱에서 실행하면 기존 주소의 인증과 mutation origin 검사를 유지할 수 있다. 공개 브라우저 번들에 운영 주소나 secret을 주입하지 않는다.

## 상태

- 변경 보존과 이력 통합: `f126ff4`, `45ede8d`, `97e0311`에 기록했다. 로컬 main의 중복 SQLite 패치와 원격 main의 동일한 workflow 이력을 보존하고 병합 전후 코드 tree가 동일함을 확인했다. 보안 패치·검증 커밋 `4fee4c2`까지 로컬 main에 fast-forward 병합했고 두 브랜치의 동일 revision을 확인했다. main 작업 폴더의 기존 미추적 `xcrun_db`도 보존했다.
- 로컬 검증: 보안 패치 후 전체 555개 테스트·lint·production build 통과. 패치 전 Chrome 모바일 390×844에서 설정→추천→조건 확인→기록→재접속을 완주하고 데스크톱 1280×800 내역 상세를 확인했다.
- 배포 보안 패치: [Next.js 공식 공지](https://github.com/vercel/next.js/security/advisories/GHSA-2xp9-vwfh-vxw4)에 따라 Next.js·eslint-config-next 16.3.3과 sharp 0.35.4를 사용한다. js-yaml·browserslist도 허용 범위에서 갱신했다. npm audit의 critical/high는 0건, moderate 7건은 후속 검토 대상으로 남는다.
- ARM64 실행 검증: `cherrypicker:main-integration`을 관리형 배포와 같은 읽기 전용 rootfs·권한 제한·768 MiB 메모리·128 PID 조건으로 실행했다. migration 20개, health/catalog/setup 200, 관리자 307→로그인, 재시작 후 테스트 데이터 보존·무결성·시작 전 백업을 확인했다. 보안 패치 후 모바일 첫 설정 화면과 콘솔 오류 0건도 확인했다. 컨테이너는 종료했고 `/private/tmp/cherrypicker-main-runtime.nZWU42`의 테스트 DB·백업은 보존했다. 이는 신규 임시 DB 검증이며 기존 운영 DB의 이전·migration 리허설을 대신하지 않는다.
- 협업자 푸시·새 프로필·빈 DB 시작: 사용자 승인 완료. 초기 private 프로필을 `09def27`에 기록하고 원격 main에 푸시했으며 원격 revision을 확인했다. 계약 변경 후 lint·전체 555개 테스트·production build·deployctl plan이 통과했다.
- 새 이미지 게시: 공개 GHCR 게시 명령이 자동 승인 검토에서 실행 전에 차단되어 사용자에게 명시적 게시 승인을 요청했다. 이미지를 게시하거나 새 앱을 등록한 상태가 아니다. 새 앱 등록·secret 입력·첫 계정 생성·공개 전환·실기기 검증도 사용자 대시보드 단계가 남아 있다.
- 새 앱 상태 조회 결과: `Unknown app: cherrypicker`. 신규 앱 온보딩 대상이며 기존 운영 DB 이전은 이번 범위에서 제외한다.
- 기존 서비스: 유지. 현재 작업에서 운영 DB·secret·Nginx·DNS는 변경하지 않았다.
