# Repository Guidelines

## 기준 문서와 우선순위

- `PROJECT_BRIEF.md`는 제품 의도와 범위의 원본이다. 임의로 수정하지 않는다.
- `docs/DECISIONS.md`의 최근 승인 결정은 이전 문서를 구체화하거나 대체할 수 있다.
- `docs/SPEC.md`는 현재 제품 요구사항, `docs/ARCHITECTURE.md`는 현재 기술 경계의 기준이다.
- `docs/TASKS.md`는 작업 상태의 유일한 기준이다. 새 작업을 시작하기 전에 다음 항목과 완료 조건을 확인한다.
- 수집·검수 변경은 `docs/card-benefit-source-policy.md`와 `docs/promotion-source-policy.md`도 함께 따른다.

구현 전에 `PROJECT_BRIEF.md`, `docs/TASKS.md`와 작업에 관련된 SPEC·ARCHITECTURE·DECISIONS 및 도메인 정책을 읽는다. 문서와 실제 코드가 다르면 조용히 하나를 정답으로 가정하지 말고, 코드 상태를 확인해 해당 작업 범위에서 문서도 갱신한다.

## 프로젝트 구조

Next.js App Router 기반 카드 혜택 관리 앱이다. 핵심 코드는 `src/`에 있다.

- `src/app/`: route, layout, 글로벌 CSS, page·API handler
- `src/components/`: `layout/`, `settings/`, `admin/`, `ui/` 등 도메인별 UI
- `src/store/`, `src/hooks/`: Zustand 상태와 React hook
- `src/utils/`: 혜택·조합 계산과 seed 도메인 로직
- `src/types/`: 공유 TypeScript 타입
- `src/db/`: SQLite 연결과 Drizzle schema
- `src/lib/`: API, 인증, local workspace, 수집·검수·데이터 접근
- `src/proxy.ts`: 페이지 route 보호
- `drizzle/`: 검토·커밋하는 SQLite migration. 루트의 `schema.sql`과 `migration_*.sql`은 레거시 Supabase 참고이다.

## 개발과 검증 명령

- `npm ci`: `package-lock.json` 기준 의존성 설치
- `npm run dev`: DB migration·seed 후 `http://localhost:3000`에 개발 서버 시작
- `npm run lint`: ESLint 검증
- `npm test`: Vitest 회귀 테스트
- `npm run build`: 프로덕션 빌드와 타입·라우트 통합 검증
- `npm run start`: 빌드 결과 실행
- `npm run db:setup`: migration 적용과 멱등 seed
- `npm run db:generate -- --name=<change>`: schema 변경 후 검토할 migration 생성

## 코딩 스타일과 이름

TypeScript와 React 함수형 component를 사용하고 `strict` 호환성을 유지한다. `src/` import는 `@/` alias를 우선한다. 주변 코드에 맞춰 큰따옴표가 아닌 작은따옴표, 세미콜론과 TS/TSX 4칸 들여쓰기를 사용한다. component·type은 `PascalCase`, hook은 `useSomething`, store는 `useSomethingStore`, utility 함수는 `camelCase`로 이름 짓는다.

## 테스트 기준

로직·route·인증·동기화·수집·DB 작업 중에는 관련 Vitest를 먼저 실행하고 완료 전 `npm test`를 실행한다. 전체 기본 검증은 `npm run lint`와 `npm run build`다. UI 변경은 데스크톱·모바일 viewport의 실제 브라우저 검증을 포함하고, 첫 사용·결제 흐름은 `docs/TASKS.md`의 실기기 조건도 따른다. 실행하지 않은 검증을 보고하고 확인하지 않은 흐름을 완료로 표현하지 않는다.

Before changing Next.js routes, APIs, caching, configuration, or conventions, read the relevant guide under `node_modules/next/dist/docs/` as required by the generated rule at the end of this file.

## 범위와 작업 상태

- 기존 구조, 사용자 변경과 운영 데이터를 보존한다. 관련 없는 dirty worktree 변경을 되돌리지 않는다.
- 요청되지 않은 대규모 추상화, 인프라 교체, 데이터 마이그레이션으로 범위를 넓히지 않는다.
- `docs/TASKS.md`의 `[>]` 항목을 시작할 때 `[-]`, 완료 조건을 모두 검증한 뒤 `[x]`로 바꾸고, 후속 작업이 확정된 경우에만 단 하나의 `[>]`를 지정한다.
- 새로운 제품·보안·비용 결정은 구현 상태로 가장하지 말고 `docs/DECISIONS.md`에 제안 상태로 기록한다.

## Commit과 Pull Request

`feat:`, `fix:`, `refactor:`, `docs:` 등 간결한 Conventional Commit 형식을 사용한다. Pull request에는 변경 요약, 실행한 검증, 관련 issue를 적고 UI 변경에는 screenshot을 포함한다.

## 보안과 설정

Keep deployment settings and secrets in `.env` or the service environment only:

```env
DATABASE_PATH=data/cherrypicker.db
BETTER_AUTH_SECRET=...
BETTER_AUTH_URL=http://localhost:3000
ALLOW_SIGN_UP=true
```

비밀값, `.next/`, SQLite·WAL, 백업은 커밋하지 않는다. SQLite 접근은 서버에 두고 모든 개인 API query에서 소유권을 검증한다. 생성된 Drizzle migration은 적용 전에 검토한다.

공개 catalog 응답에 개인 workspace, 원문 검수 후보, 검수자 정보와 비밀값을 포함하지 않는다. 관리자 화면과 mutation API는 세션·관리자 권한 뒤에 둔다. 명시적 승인 없이 공개 회원가입, 운영 secret 변경, 배포, 운영 데이터 migration·삭제를 실행하지 않는다. 운영에는 검토·커밋된 Drizzle migration만 사용하고 승인된 migration 전에 일관된 백업을 생성한다.

## Git and Handoff

- Before any push, ask whether to push to an `@hurdooagent`-owned repository or to the `@hurdoo` repository after adding `@hurdooagent` as a collaborator. Never record authentication tokens in files or output.
- If push is denied, ask the user to add `@hurdooagent` as a collaborator before retrying.
- Completion reports must name changed files, validations run, unverified items, and the next selected user flow from `docs/TASKS.md`.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
