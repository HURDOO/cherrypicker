# Cherrypicker 🍒

Cherrypicker는 결제처와 금액에 맞는 신용카드 혜택을 비교하고, 카드 실적과 결제 기록을 관리하는 Next.js 애플리케이션입니다. 공용 혜택 정보는 서버의 SQLite에서 관리하고 개인 데이터는 기본적으로 브라우저의 IndexedDB에 저장합니다.

추천기는 통신사·매장 할인, Npay·카카오페이·굿딜, 카드·머니·포인트를 독립된 단계로 계산합니다. 확정 혜택으로 기본 순위를 정하고 쿠폰·응모 같은 조건부 혜택과 승인 가맹점이 검증되지 않은 예상 카드 혜택을 별도로 표시합니다.

홈·설정·히스토리는 로그인 없이 사용할 수 있습니다. 브라우저는 공용 카탈로그와 개인 workspace를 서로 분리해 저장하고 추천을 기기에서 계산합니다. 로그인해도 현재 로컬 workspace를 계속 사용하며, 설정에서 빈 계정으로 snapshot을 백업하거나 빈 기기로 계정 snapshot을 복원할 수 있습니다. 같은 원본 기기는 revision을 확인한 뒤 수동으로 백업을 갱신할 수 있고, 서로 다른 데이터가 양쪽에 있으면 항목별 병합 화면에서 원본을 선택할 수 있습니다. 자동 양방향 동기화는 아직 구현 전입니다. 세부 진행 상황은 [Local-first 추천 및 선택적 계정 동기화 전환 계획](docs/local-first-optional-sync-plan.md)에 정리되어 있습니다.

## 기술 구성

- Next.js 16 App Router, React 19, TypeScript
- Tailwind CSS 4, Zustand, dnd-kit
- SQLite, Drizzle ORM, better-sqlite3
- Better Auth 선택적 계정 및 관리자 인증

브라우저는 SQLite 파일에 직접 접근하지 않습니다. 서버는 수집·검수한 공개 카탈로그를 제공하고, 브라우저는 카탈로그와 개인 workspace를 IndexedDB에 저장해 추천을 기기에서 계산합니다. 로그인한 기존 계정의 데이터 API와 관리자 기능은 Next.js의 Node.js 서버가 계속 처리합니다.

## 로그인 없이 사용하는 데이터

- 사용자가 추가한 카드·혜택 규칙·브랜드·카테고리
- 보유 통신사·구독·페이 프로필과 카드 실적
- 결제 기록과 당시 추천 조합·카탈로그 버전

이 데이터는 브라우저 origin별 IndexedDB에 저장됩니다. 설정에서 JSON 파일로 내보내거나 가져올 수 있으며, 브라우저 데이터 삭제 또는 서비스 주소 변경 시 자동으로 복구되지 않으므로 중요한 데이터는 직접 내보내 두세요. 로그인해도 현재 기기 workspace는 삭제되거나 서버 모드로 전환되지 않습니다. 계정 snapshot 백업을 사용하면 새 기기의 빈 workspace로 복원할 수 있고, 양쪽에 데이터가 있으면 계정에만 있거나 기기에만 있는 항목은 보존하면서 같은 항목의 수정본·삭제본을 사용자가 선택해 병합할 수 있습니다.

공모전 데모 기간에는 저장 데이터가 전혀 없는 첫 방문 브라우저에만 임시 프로필을
만듭니다. GS25·CU·세븐일레븐·다이소·올리브영·투썸플레이스·스타벅스를 즐겨찾기로
보여주고, KB국민 나라사랑카드 10만원·신한 나라사랑카드 10만원·신한 Hey Young
체크카드 20만원의 직전 달 실적과 T멤버십 VIP·Npay·T 우주패스 편의점&카페를
설정합니다. 이미 만들어진 workspace는 빈 상태여도 덮어쓰지 않습니다.

계정 snapshot은 `account_workspace_snapshots`에 사용자별로 저장하며 content hash와 단조 증가 revision을 함께 기록합니다. 최초 백업은 계정에 개인 데이터가 없을 때만 허용하고, 갱신은 최초 snapshot을 만든 같은 로컬 workspace와 최신 revision이 모두 일치할 때만 허용합니다. 명시적 병합은 결과를 먼저 IndexedDB에 보존한 다음 서버가 최신 revision과 계정 전용 레코드 보존을 다시 검증하며, 클라이언트는 저장 직후 snapshot을 다시 내려받아 로컬 원본과 일치하는지 확인합니다.

## 로컬에서 시작하기

### 요구 사항

- 현재 지원 중인 Node.js LTS 버전(Node.js 22 이상 권장)
- npm

`better-sqlite3`는 네이티브 모듈입니다. 다른 운영체제나 CPU에서 만든 `node_modules`를 복사하지 말고 실행할 장치에서 의존성을 설치하세요.

### 설치

```bash
npm ci
cp .env.example .env
mkdir -p data backups
```

`npx auth@latest secret`을 실행해 나온 값을 `.env`의 `BETTER_AUTH_SECRET`에 넣습니다. 비밀키는 최소 32자의 고엔트로피 값이어야 하며 저장소에 커밋하면 안 됩니다.

기본 환경 변수는 다음과 같습니다.

```env
DATABASE_PATH=data/cherrypicker.db
BETTER_AUTH_SECRET=<generated-secret>
BETTER_AUTH_URL=http://localhost:3000
ALLOW_SIGN_UP=true
ADMIN_EMAILS=admin@example.com
ADMIN_ACCESS_MODE=
GEMINI_API_KEY=
GEMINI_MODEL=gemini-3.6-flash
CARD_BENEFIT_AI_MODEL=gemini-3.6-flash
SHINHAN_SOL_TRAVEL_GUIDE_PDF_URL=
PROMOTION_AI_MAX_CALLS=25
```

`DATABASE_PATH`의 상대 경로는 명령을 실행한 현재 디렉터리를 기준으로 합니다. 운영 환경에서는 절대 경로를 권장합니다. `BETTER_AUTH_URL`은 사용자가 실제로 접속하는 origin과 정확히 같아야 하며 운영 환경에서는 공개 HTTPS 주소를 사용합니다.
`ALLOW_SIGN_UP`은 정확히 `true`일 때만 가입을 엽니다. 공개 서버에서는 필요한 계정을 만든 뒤 `false`로 바꾸고 서버를 재시작해 신규 가입 API와 가입 화면을 닫으세요.
`ADMIN_EMAILS`는 `/admin/promotions`에 접근할 관리자 이메일을 쉼표로 구분합니다. 프로모션 수집, 원문 검수, 승인과 카드 승인 경로 검증은 이 계정만 수행할 수 있습니다.
`ADMIN_ACCESS_MODE=FIRST_USER`는 단일 소유자 설치를 위한 명시적 대체 방식입니다. `ADMIN_EMAILS`가 비어 있고 회원가입이 닫힌 경우에만 가장 먼저 생성된 계정을 관리자로 인정합니다. 이메일 목록을 설정하면 목록이 항상 우선하며 첫 계정 대체 방식은 비활성화됩니다.
`GEMINI_API_KEY`는 선택 사항입니다. 값이 없거나 호출이 실패하면 공식 문구를 보수적으로 판정하는 규칙 분류기로 계속 수집합니다. `GEMINI_MODEL`을 바꾸면 Gemini 모델을 교체할 수 있고, `PROMOTION_AI_MAX_CALLS`는 한 번의 수집에서 AI로 재확인할 모호한 혜택 수를 제한합니다. AI에는 공개된 혜택 문구만 보내며 사용자 카드·결제·계정 데이터는 보내지 않습니다.
`CARD_BENEFIT_AI_MODEL`은 카드 상품 원문을 고정 JSON schema로 구조화할 때 사용할 모델입니다. 비어 있으면 `GEMINI_MODEL`을 사용하며, 키가 없거나 호출에 실패하면 현재 대표 카드 전용 규칙 추출기로 검수 후보를 만듭니다.
`SHINHAN_SOL_TRAVEL_GUIDE_PDF_URL`은 신한카드가 공개한 SOL트래블 체크 상품안내 PDF 주소를 확인했을 때만 설정하는 선택 값입니다. 수집기는 `shinhancard.com`의 HTTPS 문서만 허용하며 상품 페이지에서 같은 소유자의 PDF 링크가 발견되면 별도 설정 없이도 보조 출처로 수집합니다.

### 데이터베이스 준비와 실행

```bash
npm run dev
```

개발 서버는 시작 전에 migration과 seed를 자동 적용합니다. 현재 개발 명령은 macOS 파일 감시 한도에서 라우트가 누락되는 문제를 피하도록 Next.js의 webpack 개발 서버를 사용합니다. 별도로 데이터베이스만 준비하려면 `npm run db:setup`을 실행하세요. 브라우저에서 [http://localhost:3000](http://localhost:3000)을 엽니다. seed 명령은 기본 카테고리, 브랜드, 카드와 혜택 규칙을 멱등적으로 추가·갱신하므로 초기 설치와 기본 데이터 변경 후 다시 실행할 수 있습니다. 안전을 위해 seed 원본에서 제거된 기존 시스템 행을 자동 삭제하지 않으며, 사용자 계정이나 결제 기록도 초기화하지 않습니다.

검증과 프로덕션 실행은 다음 명령을 사용합니다.

```bash
npm run lint
npm run build
npm run start
```

실행 중인 서버의 실제 카탈로그로 추천 엔진 성능을 반복 측정할 수 있습니다.

```bash
npm run benchmark:recommendations
# 다른 주소나 반복 횟수 사용
CATALOG_URL=http://localhost:3010/api/catalog BENCHMARK_RUNS=200 npm run benchmark:recommendations
```

## 스키마 변경

Drizzle 스키마의 기준 파일은 `src/db/schema/`입니다. 스키마를 바꾼 뒤 SQL migration을 생성하고 로컬 DB에 적용합니다.

```bash
npm run db:generate -- --name=<change-name>
npm run db:migrate
```

생성된 `drizzle/` 디렉터리를 코드와 함께 커밋하세요. 운영 DB에는 `drizzle-kit push`를 사용하지 말고, 검토·커밋된 migration만 서버 시작 전에 적용합니다. Supabase의 기존 계정, 비밀번호, 결제 기록은 이 과정에서 자동으로 SQLite로 복사되지 않습니다. 필요한 경우 별도의 검증된 export/import 절차가 필요합니다.

## 프로모션 운영

설정 화면의 `보유 혜택 프로필`에서 사용자의 통신사·등급과 사용 가능한 페이·머니·포인트를 저장합니다. 홈 화면은 해당 프로필에 맞는 조합만 계산합니다. 특정 상품 행사는 기본 추천을 방해하지 않으며, 사용자가 해당 행사를 펼쳐 대상 상품 합계를 입력했을 때만 계산에 들어갑니다.

관리자는 `/admin/promotions`에서 다음 작업을 수행합니다.

- SKT·U+·Npay·T우주 공식 페이지/API와 주요 프랜차이즈의 공개 혜택 수집
- T우주 구독 상품명·별칭·제휴처와 건별·일·월 한도를 구조화해 상품 카탈로그와 추천에 동기화
- 공식 출처의 구체적인 제휴사는 브랜드로 자동 등록하고 범용 이벤트명은 제외
- 브랜드·등급·할인율·기간·한도를 구조화하고 개별 혜택 단위로 변경 감지
- 매장 전체·카테고리·상품·고객 한정·미확정 범위를 분류하고 근거 문장과 신뢰도 표시
- 명확한 정형 조건은 자동 게시하고, 최대·선착순·복합 조건만 검수 후 게시 또는 반려
- 검수 큐의 검색·제공자·위험·적용 범위 필터와 최대 100건 일괄 승인/반려
- 카카오페이·굿딜 앱 전용 행사 수동 후보 등록
- 브랜드·페이·카드사별 승인 가맹점/MCC 근거 등록

`/admin/card-benefits`에서는 신한 SOL트래블 체크카드의 공식 상품 페이지·이용가이드·공지와 발견된 상품안내 PDF를 하나의 source bundle로 수집합니다. HTML 원문과 PDF 원본 bytes, hash, 출처별 version, PDF 페이지를 보존하고, AI 또는 규칙 추출 결과의 필드별 출처·페이지 근거와 검증 오류를 확인한 뒤 카드 혜택 revision을 게시하거나 과거 revision으로 rollback할 수 있습니다. 보조 출처 수집 실패도 검증 오류로 남아 불완전한 후보의 게시를 차단합니다. 세부 출처·검증·보존 정책은 [카드 혜택 원문 수집·구조화 정책](docs/card-benefit-source-policy.md)을 따릅니다.

카카오페이 앱처럼 로그인이나 앱 내부에서만 제공되는 목록은 자동 수집하지 않습니다. 공식 출처에서 계산 조건이 명확한 혜택만 자동 게시하며, 상품·카테고리 한정 혜택은 대표 최대 혜택에서 분리하고 대상 상품 금액을 입력했을 때만 계산합니다. 범위 미확정 혜택은 관리자가 범위를 선택하기 전에는 게시할 수 없습니다. 사용자가 일시 정지한 자동 혜택은 다음 수집에서도 일시 정지 상태를 유지합니다. 수동 실행 명령은 다음과 같습니다.

```bash
npm run promotions:collect
npm run cards:collect
```

출처별 신규·자동 게시·검수·실패 건수는 명령 출력과 관리자 수집 결과에서 확인할 수 있습니다. 각 실행 결과는 `promotion_collection_runs`에도 저장되어 공개 카탈로그의 마지막 전체 수집 성공 시각과 실패 출처 수를 계산합니다. 수집 대상 페이지의 정책과 제휴 조건을 운영 전에 확인하고, 선착순·개인별 대상 여부는 조건부 정보로 유지하세요.

게시된 공용 데이터는 로그인 없이 `GET /api/catalog`에서 versioned snapshot으로 조회할 수 있습니다. 응답의 `ETag`를 다음 요청의 `If-None-Match`에 보내면 내용과 수집 상태가 바뀌지 않았을 때 `304 Not Modified`를 반환합니다. 계산 데이터가 같으면 `catalogVersion`은 유지되고, 새 수집 실행의 성공·실패 시각만 바뀌어도 새 ETag와 snapshot을 반환합니다. snapshot은 시스템 카테고리·브랜드·카드·규칙, 활성 제공자·구독 상품, 게시 프로모션과 승인 경로만 포함하며 사용자 데이터와 내부 검수 metadata는 포함하지 않습니다.

브라우저는 snapshot을 IndexedDB에 마지막 정상본으로 보관하고 앱 시작, 포커스 복귀, 네트워크 재연결, 사용자의 `다시 확인` 동작 때 재검증합니다. 홈의 상태 카드는 실제 네트워크 연결 여부, 기기의 마지막 확인 시각, 서버의 마지막 전체 수집 성공 시각을 구분해 표시합니다. 전체 수집 성공 후 36시간이 지나면 오래된 정보로 경고하지만 저장본이 있으면 오프라인 추천 계산과 기록은 계속할 수 있습니다.

저장소 루트의 `schema.sql`과 `migration_*.sql`은 전환 전 Supabase/PostgreSQL 구조를 보존한 레거시 참고 파일입니다. SQLite 운영에는 실행하지 않으며, 현재 기준 스키마와 migration은 각각 `src/db/schema/`와 `drizzle/`입니다.

## 안전한 온라인 백업

서버가 실행 중이어도 다음 명령으로 일관된 SQLite snapshot을 만들 수 있습니다.

```bash
# backups/cherrypicker-<timestamp>.db
npm run db:backup

# 원하는 파일 경로
npm run db:backup -- /mnt/external-backup/cherrypicker.db
```

스크립트는 `better-sqlite3`의 온라인 backup API를 사용하고, 임시 snapshot의 `PRAGMA quick_check`가 성공한 뒤 최종 파일명으로 옮깁니다. DB와 백업 파일은 mode `0600`으로 보호하며 기존 대상 파일은 덮어쓰지 않습니다. 실행 중인 WAL 데이터가 누락될 수 있으므로 애플리케이션이 켜진 상태에서 `.db` 파일만 `cp`하지 마세요.

`backups/`는 Git에서 제외됩니다. 같은 라즈베리파이의 같은 디스크만 백업 대상으로 삼지 말고, 별도 장치나 원격 저장소로 복제하고 정기적으로 복구를 시험하세요. 유지보수 명령이 `drizzle-kit`과 `tsx`를 사용하므로 서버에서 `devDependencies`를 제거하지 마세요.

## 라즈베리파이 배포

### deployd 관리형 배포

이 worktree의 관리형 앱 ID는 `cherrypicker-promotion`이며 기본 주소는
`https://cherrypicker-promotion.app.hurdoo.kr`입니다. 일반 사용자 화면은
로그인 없이 팀에 공유할 수 있도록 `public` 모드로 운영하고, 관리자·디자인 화면과
관리자 API는 인증 경계를 유지합니다. SQLite와 WAL 파일은 영속 볼륨의
`/data/cherrypicker.db`에 저장합니다. 컨테이너 시작 시 기존 DB가 있으면 먼저
`/data/backups/pre-start-*.db` 온라인 snapshot을 만들고, 커밋된 migration과
멱등 seed를 적용한 뒤 Next.js 서버를 실행합니다.

배포 계약은 `deploy.json`, 이미지 구성은 `Dockerfile`과 `.dockerignore`에 있습니다.
이미지는 읽기 전용 루트 파일시스템과 `/tmp` tmpfs에서 실행되며, health check는
`/api/health`를 사용합니다. 최초 GHCR 패키지는 저장소 Actions의
`Bootstrap GHCR package` 워크플로를 사용자가 수동 실행해 저장소와 연결합니다.
그 뒤의 immutable 이미지 발행과 dashboard handoff는 `deploy-project` 절차를
사용합니다.

관리형 배포 계약은 필수 secret 이름으로 `BETTER_AUTH_SECRET`, 선택 secret
이름으로 `GEMINI_API_KEY`만 선언합니다. 실제 값이나 Pi의 파일 경로는 저장소,
이미지, 배포 JSON에 넣지 않습니다. 등록된 앱의 **설정** 화면에서 names-only
계약을 먼저 적용한 뒤, private dashboard의 **Secrets** 화면에서 필요한 값을
사용자가 직접 설정합니다. 필수 값이 준비되어 `secretsReady=true`로 확인된
뒤에만 **배포** 화면에서 이미지를 실행하거나 재시도합니다. 선택 값인
`GEMINI_API_KEY`가 없으면 보수적인 규칙 분류기로 계속 동작합니다.

관리형 배포는 비민감 설정 `ADMIN_ACCESS_MODE=FIRST_USER`를 공개된 배포 계약으로
관리합니다. `ALLOW_SIGN_UP`, `ADMIN_EMAILS`, `GEMINI_MODEL`,
`CARD_BENEFIT_AI_MODEL`, `PROMOTION_AI_MAX_CALLS`를 **Secrets**에 넣지 않습니다. 새 데이터베이스의 최초
온보딩에는 `ALLOW_SIGN_UP=true`인 임시 bootstrap 이미지를 private 접근으로만
배포합니다. 의도한 첫 계정을 만든 직후 `ALLOW_SIGN_UP=false`로 되돌린 후속
이미지를 발행하고, 그 이미지가 healthy 상태가 된 것을 확인해야 가입 종료와
관리형 배포 온보딩이 완료됩니다. bootstrap 이미지가 실행 중인 동안에는 필요한
계정만 만든 뒤 지체 없이 가입을 닫습니다. 이 배포에서는 회원가입이 닫혀 있고
`ADMIN_EMAILS`가 비어 있으므로 가장 먼저 생성된 기존 계정이 관리자가 됩니다.
`ADMIN_EMAILS`를 설정하는 환경에서는 해당 목록이 항상 우선합니다. `GEMINI_MODEL`,
`CARD_BENEFIT_AI_MODEL`, `PROMOTION_AI_MAX_CALLS`는 별도의 애플리케이션 설정
경로가 생기기 전까지 이미지의 기본 동작을 사용하며, 이를 secret으로 숨기지
않습니다.

인증 기준 URL은 로컬·수동 환경에서 `BETTER_AUTH_URL`을 우선 사용하고, 관리형
배포에서는 deployd가 제공하는 `APP_BASE_URL`을 사용합니다. `APP_BASE_URL`은 플랫폼
예약 값이므로 `deploy.json`에 다시 선언하지 않습니다. 공개 배포의 쓰기 API는 이
origin과 브라우저의 `Origin`/`Sec-Fetch-Site`를 함께 검사합니다.

이미지 롤백은 `/data`의 SQLite 상태를 되돌리지 않습니다. 컨테이너 시작 전
snapshot은 schema migration 복구 지점을 제공하지만 같은 디스크 장애까지 보호하지
않으므로 별도 장치나 원격 백업도 유지해야 합니다. 운영 DB migration은 별도 승인과
사전 백업이 필요합니다. 아래 `deploy/systemd/` 타이머는 기존 수동
설치용 예시이며 deployd가 자동 설치하지 않으므로, 관리형 배포만으로 정기
프로모션 수집이 활성화되지는 않습니다.

### 수동 설치 참고

64비트 Raspberry Pi OS와 USB SSD를 권장합니다. 데이터베이스는 네트워크 파일시스템이나 microSD가 아니라 Pi에 직접 연결된 영속 디스크에 두세요. 64비트 OS와 지원 중인 Node.js LTS 조합에는 보통 사전 빌드된 `better-sqlite3` 바이너리가 설치됩니다. `npm ci`가 `node-gyp` 단계에서 실패한다면 Pi에 Python, `make`, C/C++ 컴파일러가 설치되어 있는지 확인하세요. 예:

```env
DATABASE_PATH=/srv/cherrypicker-data/cherrypicker.db
BETTER_AUTH_SECRET=<generated-secret>
BETTER_AUTH_URL=https://cards.example.com
ALLOW_SIGN_UP=false
```

최초 계정을 만들어야 한다면 reverse proxy로 공개하기 전에 LAN 또는 SSH 터널에서만 잠시 `ALLOW_SIGN_UP=true`로 실행하세요. 계정을 만든 즉시 `false`로 되돌리고 서버를 재시작한 뒤 공개하세요.

전용 서비스 계정이 DB와 backup 디렉터리를 소유해야 합니다. 아래는 애플리케이션 코드가 `/opt/cherrypicker`에 배치되어 있다고 가정한 최초 설정 예시입니다.

```bash
sudo useradd --system --home /opt/cherrypicker --shell /usr/sbin/nologin cherrypicker
sudo install -d -m 0750 -o cherrypicker -g cherrypicker /opt/cherrypicker
sudo install -d -m 0700 -o cherrypicker -g cherrypicker /srv/cherrypicker-data
sudo install -d -m 0700 -o cherrypicker -g cherrypicker /srv/cherrypicker-backups
sudo chown -R cherrypicker:cherrypicker /opt/cherrypicker

cd /opt/cherrypicker
sudo -u cherrypicker npm ci
sudo -u cherrypicker cp .env.example .env
sudo chmod 600 .env
# .env 값을 설정한 뒤 계속합니다.
sudo -u cherrypicker npm run db:setup
sudo -u cherrypicker npm run build
```

공개 서비스는 Next.js를 인터넷에 직접 노출하지 말고 Caddy나 nginx 같은 reverse proxy 뒤에 두어 HTTPS, 요청 크기 제한과 rate limiting을 처리하세요. 한 Pi에서는 앱 프로세스 하나만 실행하는 구성이 적합하며 PM2 cluster처럼 여러 인스턴스가 같은 SQLite 파일에 쓰는 구성은 피합니다.

systemd를 사용할 때의 기본 형태는 다음과 같습니다. 실제 저장소 경로와 `npm` 경로는 `pwd`, `command -v npm` 결과에 맞게 바꾸세요.

```ini
[Unit]
Description=Cherrypicker
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=cherrypicker
Group=cherrypicker
WorkingDirectory=/opt/cherrypicker
Environment=NODE_ENV=production
EnvironmentFile=/opt/cherrypicker/.env
UMask=0077
ExecStart=/usr/bin/npm run start -- --hostname 127.0.0.1 --port 3000
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
```

프로모션 자동 수집용 service/timer 예시는 `deploy/systemd/`에 있습니다. 위 예시처럼 앱이 `/opt/cherrypicker`에 설치되고 `npm`이 `/usr/bin/npm`에 있을 때 다음과 같이 설치합니다. 다른 경로라면 두 파일의 `WorkingDirectory`, `EnvironmentFile`, `ExecStart`를 먼저 수정하세요.

```bash
sudo install -m 0644 deploy/systemd/cherrypicker-promotions.service /etc/systemd/system/
sudo install -m 0644 deploy/systemd/cherrypicker-promotions.timer /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now cherrypicker-promotions.timer
sudo systemctl start cherrypicker-promotions.service
systemctl list-timers cherrypicker-promotions.timer
journalctl -u cherrypicker-promotions.service -n 100 --no-pager
```

타이머는 서울 시간 기준 매일 05:15와 17:15에 실행하며, 서버가 꺼져 실행을 놓친 경우 부팅 후 한 번 실행합니다.

같은 배포 디렉터리를 갱신할 때는 먼저 온라인 백업을 만든 뒤 서비스를 멈추고, 정지 상태에서 의존성 설치·빌드·migration·seed를 수행하세요. 실행 중인 `.next`나 `node_modules`를 교체하면 일시적인 500 또는 누락된 chunk가 발생할 수 있습니다. 무중단 배포가 필요해지면 별도 release 디렉터리에서 빌드한 뒤 symlink를 전환하는 방식을 사용하세요.

```bash
sudo -u cherrypicker npm run db:backup -- /srv/cherrypicker-backups/cherrypicker-YYYYMMDD-HHMMSS.db
sudo systemctl stop cherrypicker
sudo -u cherrypicker npm ci
sudo -u cherrypicker npm run lint
sudo -u cherrypicker npm run build
sudo -u cherrypicker npm run db:migrate
sudo -u cherrypicker npm run db:seed
sudo systemctl start cherrypicker
```

`.env`와 `BETTER_AUTH_SECRET`을 유지하세요. 비밀키를 임의로 교체하면 기존 로그인 세션에 영향을 줍니다.
