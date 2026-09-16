# Cherrypicker 주소 전환

기준일: 2026-09-16. 목표 주소는 사용자가 승인했으며 실제 운영 전환은 아직 완료하지 않았다.

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
- 새 앱에는 별도 영속 데이터와 secret 등록 상태가 생긴다. 기존 DB, 관리자 계정, 검수 revision과 secret 값은 자동으로 따라오지 않는다. 기존 앱을 삭제하거나 빈 DB로 대체하지 않는다.
- 기존 운영 카탈로그는 조회 시 카드 8장이다. 로컬의 검수 카드 14장과 후보·revision은 이미지 빌드에 포함되지 않으므로 운영 데이터 반영 범위를 별도로 검토한다. 미승인 두산 후보는 계속 미게시로 유지한다.
- 브라우저 IndexedDB와 로그인 쿠키는 origin마다 분리된다. 서버 DB 이전이나 redirect로 개인 workspace가 옮겨지지 않는다.

## 전환 순서

1. 기존 작업과 main 이력을 보존해 통합하고 lint·전체 테스트·production build를 통과한다. 신규 migration 0018·0019는 nullable 필드 추가이며 기존 운영 버전에 따라 0014 이후 migration도 필요하다. 실제 적용 목록은 운영 백업의 migration 이력으로 확정한다.
2. 운영 백업·복구 런북에 따라 기존 서버 DB의 일관된 백업과 무결성을 확인한다. 격리 복사본에 migration·seed를 리허설하고 계정·거래·카드·규칙·게시 revision 보존을 확인한다. 운영 데이터 이전·migration은 별도 승인 후 플랫폼 운영 절차로 실행한다.
3. 새 앱 등록과 데이터 복원 순서를 플랫폼 운영 작업에서 확정한다. 기존 서비스 DB를 사용 중인 두 프로세스에 동시에 연결하지 않는다. 데이터 복원 전 빈 앱의 첫 사용자 관리자 모드나 공개 회원가입을 열지 않는다.
4. 필요한 secret은 사용자가 대시보드의 Secrets 화면에서 관리한다. 값은 채팅·저장소·handoff에 넣지 않는다. 새 앱의 필수 secret 준비 상태와 기존 계정 보존을 확인한 뒤 새 이미지를 적용한다.
5. 새 주소에서 health, 비로그인 catalog, 관리자 인증 경계, 추천→기록→재접속을 검증한다. 상태 API에서 실제 revision과 digest를 확인하기 전에는 배포 완료로 표시하지 않는다.
6. 사용자는 이전 주소를 사용하던 같은 기기·브라우저의 설정에서 JSON을 내보내고 새 주소에서 가져온다. 카드·실적·기록을 확인하고 기존 JSON과 기존 주소를 보존한다. 계정 복원을 선택하면 서버 계정 이전과 동기화 상태를 먼저 확인한다.
7. 데이터 보존과 새 주소 실사용을 확인한 뒤에만 이전 주소 안내·redirect·기존 앱 종료를 별도로 결정한다. 이 작업에는 자동 redirect나 앱 삭제를 포함하지 않는다.

## 코드의 주소 처리

컨테이너는 명시적인 `BETTER_AUTH_URL`을 우선하고, 없으면 플랫폼의 `APP_BASE_URL`을 사용한다. 둘 다 없을 때만 새 기본 주소를 사용한다. 따라서 같은 이미지도 기존 앱에서 실행하면 기존 주소의 인증과 mutation origin 검사를 유지할 수 있다. 공개 브라우저 번들에 운영 주소나 secret을 주입하지 않는다.

## 상태

- 변경 보존과 이력 통합: `f126ff4`, `45ede8d`, `97e0311`에 기록했다. 로컬 main의 중복 SQLite 패치와 원격 main의 동일한 workflow 이력을 보존하고 병합 전후 코드 tree가 동일함을 확인했다. 최종 main 반영·검증 결과는 TASK-11에 기록한다.
- 로컬 검증: 보안 패치 후 전체 555개 테스트·lint·production build 통과. 패치 전 Chrome 모바일 390×844에서 설정→추천→조건 확인→기록→재접속을 완주하고 데스크톱 1280×800 내역 상세를 확인했다.
- 배포 보안 패치: [Next.js 공식 공지](https://github.com/vercel/next.js/security/advisories/GHSA-2xp9-vwfh-vxw4)에 따라 Next.js·eslint-config-next 16.3.3과 sharp 0.35.4를 사용한다. js-yaml·browserslist도 허용 범위에서 갱신했다. npm audit의 critical/high는 0건, moderate 7건은 후속 검토 대상으로 남는다.
- ARM64 실행 검증: `cherrypicker:main-integration`을 관리형 배포와 같은 읽기 전용 rootfs·권한 제한·768 MiB 메모리·128 PID 조건으로 실행했다. migration 20개, health/catalog/setup 200, 관리자 307→로그인, 재시작 후 테스트 데이터 보존·무결성·시작 전 백업을 확인했다. 보안 패치 후 모바일 첫 설정 화면과 콘솔 오류 0건도 확인했다. 컨테이너는 종료했고 `/private/tmp/cherrypicker-main-runtime.nZWU42`의 테스트 DB·백업은 보존했다. 이는 신규 임시 DB 검증이며 기존 운영 DB의 이전·migration 리허설을 대신하지 않는다.
- 원격 푸시·이미지 게시·새 앱 등록·운영 데이터 이전·새 주소 실기기 검증: 미완료.
- 새 앱 상태 조회 결과: `Unknown app: cherrypicker`. 기존 앱 도메인 변경으로 간주해 빈 신규 DB를 활성화하지 않는다.
- 기존 서비스: 유지. 현재 작업에서 운영 DB·secret·Nginx·DNS는 변경하지 않았다.
