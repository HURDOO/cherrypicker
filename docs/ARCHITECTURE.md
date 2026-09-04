# Cherrypicker 아키텍처

## 1. 상태

- 상태: 현재 구현 기준, 비공개 베타 보완 예정 항목 포함
- 기준일: 2026-09-04
- 제품 요구사항: `docs/SPEC.md`
- 수집 정책: `docs/card-benefit-source-policy.md`, `docs/promotion-source-policy.md`

표시가 없는 내용은 현재 구현이다. `예정`으로 표시한 내용은 `docs/TASKS.md`의 해당 작업이 완료되기 전까지 구현된 기능으로 간주하지 않는다.

## 2. 선택한 기술 스택과 이유

| 영역 | 기술 | 선택 이유 |
| --- | --- | --- |
| 웹 앱 | Next.js 16 App Router, React 19, TypeScript | 사용자 UI, 공개·인증 API와 관리자 도구를 하나의 배포 단위로 유지한다. |
| UI | Tailwind CSS 4, lucide-react, dnd-kit | 모바일 우선 화면, 반응형 스타일과 정렬 UI를 현재 패턴으로 유지한다. |
| 클라이언트 상태 | Zustand | 카탈로그와 개인 workspace를 결합한 현재 화면 상태를 간결하게 공유한다. |
| 로컬 저장 | IndexedDB | 로그인 없는 개인 workspace, 카탈로그 캐시와 동기화 outbox를 origin별로 보존한다. |
| 서버 데이터 | SQLite, better-sqlite3, Drizzle ORM | 단일 앱 프로세스의 공용 카탈로그·관리 데이터와 선택적 계정 데이터를 단순하게 운영한다. |
| 인증 | Better Auth | 일반 사용을 강제하지 않으면서 계정 백업·동기화와 관리자 경계를 제공한다. |
| AI 구조화 | OpenAI Responses API, Zod·JSON Schema | 공개 공식 문서를 혜택 인벤토리와 정형 후보로 변환하되, schema·근거·검수 게이트와 분리한다. |
| 검증 | ESLint, Vitest, Next production build | 정적 문제, 도메인 회귀와 프로덕션 통합 문제를 단계별로 확인한다. |
| 배포 | OCI 이미지, GHCR, deployd 관리형 Raspberry Pi | 읽기 전용 루트 파일시스템, 영속 `/data`, health check와 immutable image 롤백을 사용한다. |

Node.js 22 이상과 npm lockfile이 로컬 기준이며, 현재 운영 이미지는 Node.js 24를 사용한다. `better-sqlite3`는 네이티브 모듈이므로 타겟 OS·CPU에서 의존성을 설치한다.

## 3. 시스템 구성과 데이터 흐름

```text
공식 HTML·JSON·PDF                         OpenAI Responses API
          |                                           ^
          v                                           |
  외부 스케줄러/CLI ----> 수집·원문 보존 ----> AI 후보 구조화
                                  |                    |
                                  v                    v
                         audit·diff·검증·검수
                                  |
                      관리자 승인/rollback
                                  |
                                  v
                         SQLite 게시 카탈로그
                                  |
                        GET /api/catalog + ETag
                                  |
                                  v
+------------------------------- 브라우저 --------------------------------+
| IndexedDB 카탈로그 캐시 + 개인 workspace                     |
|       |                                                                    |
|       +--> Zustand 화면 상태 --> 로컬 조합 계산 --> 결제 기록 |
|       |                                                                    |
|       +--> (선택) Better Auth 세션 --> snapshot/operation 동기화     |
+----------------------------------------------------------------------------+
```

### 3.1 공용 카탈로그 흐름

1. 서버가 게시 상태인 시스템 카드·규칙·브랜드·프로모션·지원 정보로 versioned snapshot을 만든다.
2. `GET /api/catalog`이 ETag와 캐시 가능한 snapshot을 로그인 없이 제공한다.
3. 브라우저는 IndexedDB의 마지막 정상본을 먼저 사용하고, 앱 시작·포커스 복귀·온라인 복귀·사용자 재확인 시 재검증한다.
4. 신규 snapshot 검증 또는 저장이 실패해도 기존 정상 저장본을 유지한다.

### 3.2 추천과 기록 흐름

1. `useAppData`가 공용 카탈로그와 로컬 workspace를 로드해 Zustand에 결합한다.
2. 신규 workspace는 `/setup` 소개에서 시작하고 `/setup/cards`, `/setup/benefits`, `/setup/performance`, `/setup/favorites`, `/setup/recommendation` 순서로 App Router client navigation을 사용한다. URL로 이동한 단계와 선택한 시스템 카드 ID를 IndexedDB에 동기화하므로 브라우저 뒤로가기·새로고침 뒤에도 같은 지점에서 이어갈 수 있다.
3. 완료 전 마지막 경로는 브랜드 선택·금액 입력·결과 공개를 3단계로 안내한다. 브랜드 선택 전에는 `calculateBestCombinations`로 멤버십·구독·페이·카드의 현재 실적·남은 한도·기간·요일·시간·온오프라인 조건을 함께 시뮬레이션한다. 즐겨찾기·사용 이력·인기 브랜드를 우선으로, 확정 혜택을 받을 수 있는 브랜드 수와 예시 결제 금액·혜택 금액을 제안한다. 추천 응답을 확인한 뒤 완료 시각을 저장하며, 조합이 없는 정상 응답도 사용자를 설정 흐름에 가두지 않는다.
4. 홈 화면이 브랜드, 금액, 온라인 여부와 사용자가 확인한 조건을 조합 계산기에 전달한다.
5. `src/utils/combination.ts`와 `src/utils/calculation.ts`가 선택한 시스템 카드와 개인 카드를 대상으로 프로모션 계층, 카드 규칙, 한도, 이용 이력과 실적 목표를 비교한다.
6. 현재 추천은 로컬에서 계산하며, 기존 서버 계정 데이터 경로의 `/api/recommendations`도 같은 도메인 계산기를 공유한다.
7. 확정한 결제는 조합·카탈로그 snapshot과 함께 로컬 workspace에 원자적으로 추가되고 현재 실적을 갱신한다.

### 3.3 선택적 계정 동기화

1. 로그인은 로컬 workspace를 바꾸지 않으며 사용자가 최초 백업, 빈 기기 복원 또는 명시적 병합을 선택한다.
2. 연결 후 로컬 변경은 device ID, base revision과 UUID operation ID를 가진 IndexedDB outbox에 함께 저장된다.
3. 서버는 계정별 operation ID·request hash로 재전송을 멱등 처리하고, stale revision은 항목별 수정 시각·tombstone 정책으로 병합한다.
4. 브라우저는 revision cursor 이후 변경을 pull하며, 실패한 outbox는 backoff 후 온라인 복귀·화면 복귀·30초 주기·수동 실행에서 재시도한다.

### 3.4 수집·게시 흐름

1. 카드별 출처 registry 또는 DB 출처 설정으로 허용 host·HTML·PDF를 수집한다.
2. 원문, extracted text, response metadata, content hash와 source bundle을 보존한다.
3. 카드 혜택은 AI 인벤토리→BenefitRule 후보와 근거 연결 단계를 거친다. 지원되는 일부 adapter는 AI 실패 시 보수적 규칙 추출로 대체한다.
4. schema, 근거 인용, 참조 무결성, 숫자·한도, 필드 제거·변경 위험을 audit한다.
5. 승인 가능 후보만 사람 관리자가 게시하고, revision snapshot을 활성화한다. 프로모션도 공식 근거·diff·검수 정책을 거친다.

## 4. 주요 모듈과 책임

| 모듈 | 책임 |
| --- | --- |
| `src/app/` | 홈·설정·히스토리·단계별 `/setup/*`·인증·관리자 화면과 App Router API |
| `src/components/onboarding/` | 첫 소개, URL-진행 상태 동기화, 카드·혜택·실적·즐겨찾기 설정 화면 |
| `src/components/brand/` | 즐겨찾기·최근·주변·카테고리·검색 기반 브랜드 탐색 |
| `src/components/settings/`, `performance/` | 카드·혜택 프로필·실적·소액 기준·싱크·JSON 관리 |
| `src/components/admin/` | 카드 등록, 수집 실행, 후보·diff·근거·오류 검수와 revision 관리 |
| `src/utils/calculation.ts`, `combination.ts` | 규칙별 혜택 계산, 계층별 조합, 한도·사용량·순위 결정 |
| `src/utils/performanceGoals.ts` | 카드 규칙·사용자 덮어쓰기에서 실적 추천 목표 파생 |
| `src/utils/benefitBrandSuggestions.ts` | 멤버십·구독·페이·카드 실적·한도와 시점 조건을 금액별로 조합해 첫 추천용 확정 혜택 브랜드 선정 |
| `src/utils/firstSetupRoutes.ts` | 저장된 첫 설정 단계와 App Router URL의 고정 매핑 |
| `src/lib/benefit-catalog-*` | 공용 snapshot 생성, ETag HTTP 계약, IndexedDB 캐시와 freshness |
| `src/lib/local-workspace*` | 로컬 workspace schema·검증·mutation·IndexedDB 저장·outbox |
| `src/lib/account-workspace-*` | snapshot 백업·복원·병합, operation 동기화와 revision 계약 |
| `src/lib/card-benefit-*` | 카드 원문 수집, AI 구조화, 근거 audit, 후보·revision·batch 상태 |
| `src/lib/promotion-*` | 프로모션 source bundle, parser·AI 분류, 검수·삭제 감지·수집 이력 |
| `src/db/schema/`, `drizzle/` | SQLite 스키마와 검토된 migration |
| `scripts/` | seed, 수집, 카드 전체 검증, 백업·무결성 검증, 추천 benchmark |

## 5. 데이터 모델

### 5.1 공용 도메인과 사용자 도메인

- `categories`, `brands`, `cards`, `benefit_rules`는 `user_id IS NULL`인 시스템 항목과 사용자 소유 커스텀 항목을 모두 표현한다.
- 시스템 카드는 `catalog_status`, `issue_status`, 상품 코드와 공개 caveat로 게시·발급 상태를 구분한다.
- 로컬 workspace는 공용 카탈로그와 서로 다른 저장소에 있으며, 선택한 시스템 카드 ID·첫 설정 진행 상태·실적·프로필·기록과 커스텀 항목을 보존한다. 기존 workspace에 명시적 카드 선택이 없으면 과거 실적·기록·개인 카드에서 관리 카드를 추론해 호환하고, 신규 workspace는 명시적 선택만 추천에 사용한다.

### 5.2 카드 혜택 수집

- 출처: `card_benefit_source_configs`
- 원문: `card_benefit_documents`
- 후보·근거: `card_benefit_candidates`, `card_benefit_candidate_documents`
- 게시 이력: `card_benefit_revisions`
- 전체 확인 이력: `card_benefit_collection_runs`

### 5.3 프로모션 수집

- 제공자·구독: `promotion_providers`, `subscription_products`
- 게시 혜택: `promotion_offers`
- 원문 bundle: `promotion_source_documents`, `promotion_source_bundles`, 연결 테이블
- 후보·실행: `promotion_candidates`, `promotion_collection_runs`

### 5.4 계정·거래

- Better Auth: `user`, `session`, `account`, `verification`
- 선택적 싱크: `account_workspace_snapshots`, `account_workspace_operations`
- 기존 서버 계정 경로: `user_benefit_profiles`, `user_card_performances`, `transaction_history`, `transaction_benefits`
- 승인 가맹점 근거: `merchant_route_verifications`

## 6. API 및 외부 연동 계약

### 6.1 공개 API

- `GET /api/catalog`: 로그인 없는 공용 snapshot. `ETag`/`If-None-Match`로 304를 지원하고 개인·내부 검수 데이터를 제외한다.
- `GET /api/health`: SQLite 연결을 확인하고 `ok` 또는 503 `unavailable`을 `no-store`로 반환한다.

### 6.2 인증 API

- `/api/auth/*`: Better Auth 세션·이메일/비밀번호. `ALLOW_SIGN_UP=true`인 기간에만 가입한다.
- `/api/account/data`: 사용자별 snapshot 생성·조회·갱신·명시적 병합·삭제. 5 MiB 입력 상한과 expected revision을 검증한다.
- `/api/account/sync`: 멱등 operation push와 revision cursor pull. 사용자 세션에서 소유권을 결정한다.
- `/api/cards`, `/api/brands`, `/api/categories`, `/api/rules`, `/api/performances`, `/api/transactions`, `/api/recommendations`, `/api/app-data`: 기존 서버 계정 데이터 경로. local-first 전환 안전성이 유지되는 동안 보존한다.

### 6.3 관리자 API

- `/api/admin/system-cards`: 시스템 카드와 공식 출처 등록·상태 관리
- `/api/admin/card-benefits`: 카드 수집, 후보 승인·반려, revision rollback과 실행 이력
- `/api/admin/promotions`: 프로모션 수집, 후보 검수·수정·승인·반려·삭제 감지 처리

모든 관리자 API는 `requireAdmin`으로 세션과 관리자 권한을 검증한다. mutation은 설정된 서비스 origin과 `Origin`, `Sec-Fetch-Site`를 비교한다.

### 6.4 외부 계약

- 공식 원문 수집은 출처별 허용 host, 크기·timeout·content type 제한과 원문 hash를 적용한다.
- OpenAI에는 공개 원문만 보내며 Responses API structured output을 schema로 재검증한다. API key·model·최대 문자수·배치 호출 상한은 서버 환경 설정으로 관리한다.
- Discord webhook은 예정 연동이며 현재 실행 계약은 없다.

## 7. 인증과 권한

- `/`, `/settings`, `/history`는 공개 화면이며 개인 데이터는 로컬에 저장한다.
- `/admin/*`와 `/design-lab`은 `src/proxy.ts`에서 세션을 요구한다. 페이지 보호에 더해 mutation API에서 다시 권한을 검증한다.
- `ADMIN_EMAILS`가 설정되면 해당 목록이 관리자 기준이다.
- 단일 소유자 배포의 `ADMIN_ACCESS_MODE=FIRST_USER`는 `ADMIN_EMAILS`가 비어 있고 가입이 닫힌 경우에만 최초 계정을 관리자로 인정한다.
- 공개 배포의 가입은 평소 `ALLOW_SIGN_UP=false`를 유지한다.

## 8. 오류 처리와 관측성

### 현재

- API는 입력·인증·권한·충돌·서버 오류를 HTTP 상태와 사용자용 메시지로 구분한다.
- 로컬 workspace·카탈로그 실패는 toast와 freshness 상태로 안내하고 사용 가능한 마지막 정상본을 유지한다.
- 카드·프로모션 수집 실행은 DB에 상태, 항목별 성공·실패·미룸, AI·cache 사용과 검증 오류를 남긴다.
- 카드 전체 확인 CLI는 일부 실패·미룸·검증 오류가 있으면 운영 경고용 exit code 2를 반환한다.

### 예정

- 외부 스케줄러가 연속 실패, 카탈로그 갱신 지연과 health 이상을 Discord webhook으로 알린다. URL·메시지 범위는 연동 직전 승인받는다.
- 비공개 베타에는 행동 분석 SDK나 별도 사용자 테레메트리를 추가하지 않는다.

## 9. 테스트 전략

- 도메인 단위 테스트: 혜택 계산, 조합 순위, 실적, 한도, 승인 경로, source audit, diff·삭제 감지
- 계약·통합 테스트: 공용 카탈로그, ETag·freshness, local workspace, snapshot·operation 동기화, 관리자 API, 공식 fixture parser
- 회귀 테스트: 대표 결제 fixture와 snapshot, 실적 경계, 한도 직전·교차·소진 후
- 정적·빌드: `npm run lint`, `npm test`, `npm run build`
- 성능: `npm run benchmark:recommendations`로 실제 카탈로그의 로컬 조합 계산을 반복 측정
- 브라우저: 핵심 흐름을 데스크톱·모바일 viewport에서 확인하고 콘솔 오류, 빈 상태, 포커스, 터치 타겟과 텍스트 잘림을 검사
- 실기기: 온보딩과 10초 추천 흐름을 베타 참여자의 브라우저에서 수동 계측. 현재 미완료이며 `TASK-05`에서 검증한다.

## 10. 로컬 개발 환경

```bash
npm ci
cp .env.example .env
npm run dev
```

`npm run dev`는 migration과 멱등 seed 후 Next.js webpack 개발 서버를 기본 `http://localhost:3000`에 시작한다. `DATABASE_PATH`의 상대 경로는 명령을 실행한 현재 디렉터리 기준이다.

필수·선택 환경 변수와 로컬 가입 여부는 `.env.example`과 `README.md`를 따른다. 비밀값은 저장소에 커밋하지 않는다.

스키마 변경 순서는 다음과 같다.

```bash
npm run db:generate -- --name=<change-name>
npm run db:migrate
npm run db:seed
```

`src/db/schema/`와 검토·커밋된 `drizzle/` migration이 SQLite 기준이다. 루트의 Supabase SQL은 레거시 참고이며 SQLite에 실행하지 않는다.

## 11. 배포와 롤백

- `deploy.json`은 public 접근, `/api/health`, `/data` 영속 볼륨, 필수 `BETTER_AUTH_SECRET`과 선택 `OPENAI_API_KEY`의 names-only 계약을 선언한다.
- Docker entrypoint는 기존 DB가 있으면 시작 전 snapshot을 만들고 migration·seed를 적용한 뒤 단일 Next.js 프로세스를 실행한다.
- 이미지 롤백은 `/data` SQLite 상태를 되돌리지 않는다. schema 변경 전에는 일관된 백업과 복구 가능성을 확인한다.
- 비공개 베타 전에 새 상시 외부 백업 계층은 추가하지 않지만, 이미 구현된 온라인 backup·verify·restore 런북을 1회 검증한다.
- 관리형 deployd는 저장소의 `deploy/systemd/` timer를 자동 설치하지 않는다. 카드 주 1회·프로모션 매일 실행은 별도 외부 스케줄러에서 확인해야 한다.

실제 배포·rollback·secret 변경은 사용자의 명시적 요청과 해당 배포 절차를 따른다.

## 12. 알려진 위험과 대안

| 위험 | 현재 대응 | 남은 작업·대안 |
| --- | --- | --- |
| 공식 문서 표현의 모호함과 AI 누락 | 원문·bundle 보존, 근거 audit, 검수 차단, revision | 베타 카드별 대표 거래 golden test를 완성한다. |
| 혜택 과대 계산 | 확정·조건부·정보 구분, 한도·사용량 회귀 테스트 | 실사용 결제 상황의 경계 케이스를 추가한다. |
| 브라우저 삭제·origin 변경으로 개인 데이터 유실 | JSON export·import, 선택적 계정 동기화 | 온보딩·설정에서 일반 용어로 안내한다. |
| SQLite 다중 writer·디스크 장애 | 단일 앱 프로세스, WAL 포함 online backup | 오픈 베타 전 외부 복제·보존 정책을 결정한다. |
| 수집 실패나 삭제 오탐 | 미승인 후보가 게시본을 변경하지 않음, 삭제 의심 검수 | 주기 실행·연속 실패 알림을 배포 환경에 연결한다. |
| AI 비용 소진 | 의미 hash cache, 배치 상한, 무비용 변경 감지 | 남은 credit 초과 지출은 명시적 승인받는다. |
| 비공개 베타 지표 부족 | 소유자의 직접 피드백 | 베타 후 필요성이 확인되면 opt-in 지표를 별도 승인한다. |
| 관리자 `FIRST_USER` 오설정 | 가입이 닫힌 단일 소유자 배포에서만 활성 | 공개 확대 전 `ADMIN_EMAILS` 등 명시적 권한 구성을 재검토한다. |
