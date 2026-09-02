# SQLite 백업·복구 런북

## 보호 범위

Cherrypicker의 운영 DB는 관리형 영속 볼륨의 `/data/cherrypicker.db`에 있다. 컨테이너 시작 전 `/data/backups/pre-start-*.db` snapshot을 만들지만 원본과 같은 호스트·디스크에 있으므로 디스크 장애에 대한 백업은 아니다. deployd의 이미지 롤백도 SQLite 상태를 되돌리지 않는다.

운영 데이터를 보호된 것으로 간주하려면 다음 두 사본이 모두 필요하다.

1. `better-sqlite3` 온라인 backup API로 만든 검증된 snapshot
2. Pi와 별도 장애 영역에 보관한 암호화된 사본

현재 deployd에는 `/srv/homelab/data`의 off-host 자동 백업과 복구 훈련이 포함되어 있지 않다. 이 자동화는 별도 인프라 작업으로 다뤄야 한다.

## migration 전 백업

애플리케이션이 실행 중일 때 `.db` 파일만 복사하지 않는다. WAL에 남은 커밋이 빠질 수 있다. 앱의 온라인 백업 명령을 사용한다.

```bash
npm run db:backup -- /data/backups/cherrypicker-YYYYMMDD-HHMMSS.db
npm run db:verify-backup -- /data/backups/cherrypicker-YYYYMMDD-HHMMSS.db
```

검증은 backup을 읽기 전용으로 열어 다음을 확인한다.

- `quick_check`와 전체 `integrity_check`
- 외래 키 위반 0건
- 인증·카드·실적·결제·프로모션·계정 snapshot 핵심 테이블 존재
- backup에 적용된 migration hash 순서가 현재 코드의 이력과 일치하고 현재 코드보다 앞서지 않았는지
- 핵심 테이블별 레코드 수

출력된 핵심 레코드 수를 변경 전 기록에 남기고, 검증된 snapshot을 별도 장치나 암호화된 원격 저장소에 복제한다. 같은 `/data` 안의 snapshot만으로는 이 단계를 완료한 것으로 보지 않는다.

## 격리된 복구 훈련

실제 운영 DB를 덮어쓰지 않고 검증된 backup의 복사본으로 훈련한다. 복사본 경로는 운영 `DATABASE_PATH` 및 기존 파일과 달라야 한다.

```bash
install -m 0600 /secure-backup/cherrypicker-YYYYMMDD-HHMMSS.db /secure-rehearsal/cherrypicker.db
DATABASE_PATH=/secure-rehearsal/cherrypicker.db npm run db:verify-backup -- /secure-rehearsal/cherrypicker.db
DATABASE_PATH=/secure-rehearsal/cherrypicker.db npm run db:setup
DATABASE_PATH=/secure-rehearsal/cherrypicker.db npm run db:verify-backup -- /secure-rehearsal/cherrypicker.db
```

첫 검증이 `MIGRATION_REQUIRED`를 표시하는 것은 이전 버전 backup에서 정상일 수 있다. 격리 복사본의 `db:setup` 이후에는 `CURRENT`여야 한다. 전후 사용자·결제·실적·계정 snapshot 수가 같고, 시스템 seed 데이터만 멱등 갱신됐는지 확인한다.

## 실제 복구 순서

실제 복구는 별도 승인과 유지보수 시간이 필요한 운영 작업이다. 릴리스 dashboard의 **롤백** 버튼으로 대신할 수 없다.

1. 실행 중인 DB에서 마지막 온라인 backup을 만들고 검증해 별도 장애 영역에도 보존한다.
2. 앱을 중지하고 writer가 없음을 확인한다.
3. 현재 `.db`, `-wal`, `-shm` 파일을 삭제하지 말고 접근 제한된 격리 위치에 함께 보존한다.
4. 선택한 backup을 `/data`의 새 staging 파일로 복사하고 mode `0600`으로 설정한다.
5. staging 파일에 `db:verify-backup`을 실행한다.
6. 같은 파일시스템에서 staging 파일을 `/data/cherrypicker.db`로 전환한다. 기존 경로를 바로 덮어쓰지 않는다.
7. 앱 시작 경로의 `db:setup`으로 검토·커밋된 migration과 멱등 seed를 적용한다.
8. `/api/health`의 HTTP 200, 관리자 로그인, 공개 카탈로그, 핵심 레코드 수를 확인한다.
9. 실패하면 앱을 다시 중지하고 실패한 DB와 sidecar를 격리한 뒤, 1단계의 마지막 정상 snapshot으로 같은 절차를 반복한다.

복구가 확인될 때까지 원본 DB 묶음과 선택한 backup을 삭제하지 않는다. `BETTER_AUTH_SECRET`도 함께 보존해야 기존 인증 세션의 연속성을 유지할 수 있다.

## 2026-09-03 복구 훈련 기록

- 새 임시 DB에 migration 16개와 seed를 적용했다.
- 실행 중 사용 가능한 온라인 backup API로 snapshot을 생성했다.
- snapshot 복사본에 현재 `db:setup`을 다시 적용했다.
- 원본·snapshot·복구 복사본 모두 `integrity_check=ok`, 핵심 테이블 30개, 시스템 카드 8개를 확인했다.
- 운영 앱은 read-only 상태 점검에서 healthy, HTTP 200, 영속 데이터 볼륨 활성 상태였다.
- 실제 Pi 데이터의 off-host 사본과 호스트 장애 복구 훈련은 아직 자동화되지 않았으므로 별도 운영 과제로 남긴다.
