# 카드 혜택 DSL 확장 계획

- 상태: 진행 중
- 대상 작업: `TASK-10`
- 기준일: 2026-09-07
- 구현 상태: DSL v1 evaluator, legacy 합성, catalog v3, AI 후보 계약, 노드별 근거, 검수 UI와 실제 결제처 registry 경로를 구현했다. 검증된 백업과 격리 리허설 후 로컬 DB에 migration 0018을 적용했고, 승인된 실 OpenAI 2회로 두산 후보를 만들었다. 2026-09-12에는 가상 결제처 대신 상황 ID·확인 질문을 가진 DSL `purchaseScenario`와 로컬 검색·조건부 추천·기록 경로를 추가했다. 이어 카드별 실적 제외 정책의 공통 계산기, AI 후보 공식 인용 검증, 추천·로컬·계정 0원 snapshot, migration 0019를 구현·로컬 적용했다. 실제 두산 후보는 아직 정책을 포함해 재구성·저장·사람 검수하지 않았고 기존 카테고리 전체 범위 오류 2건으로 `PENDING`이다. 실제 후보의 금액 영향 미지원 문구 제거·게시는 하지 않았다.

## 1. 목표와 경계

목표는 AI가 카드별 코드를 만드는 것이 아니라, 검증된 작은 연산자를 조합해 이전에 보지 못한 혜택 규칙을 데이터로 표현하게 하는 것이다. 같은 프로그램은 공개 카탈로그를 통해 브라우저로 전달되고 서버와 브라우저의 순수 TypeScript evaluator가 동일하게 해석한다.

다음 둘을 구분한다.

- 새 값, 결제처 집합 또는 이미 허용된 연산자의 새로운 조합: 코드 변경 없이 DSL 후보로 처리한다.
- DSL에 없는 진짜 새 의미, 앱이 갖고 있지 않은 입력 또는 외부 판정: AI가 연산자를 발명하지 못하게 하고 `unsupportedClauses`로 차단한 뒤, 범용성이 확인될 때만 엔진을 한 번 확장한다.

AI가 만든 JavaScript·SQL·정규식·URL을 실행하거나 계산 중 네트워크를 호출하는 기능, 카드 ID별 예외 분기, 기존 전체 revision의 일괄 재작성은 범위에 포함하지 않는다. 사용자가 직접 만드는 커스텀 카드 UI도 이번 작업에서는 기존 규칙 편집 기능을 유지한다.

## 2. 목표 구조

```text
공식 원문
  -> AI compiler: DSL AST + 노드별 evidence + unsupportedClauses
  -> schema/type/reference/capability audit
  -> 대표 입력 simulator + 사람 검수
  -> revision/canonical catalog
  -> 동일한 pure evaluator
       -> 브라우저 local-first 추천·기록
       -> 서버 추천·기록 검증

기존 BenefitRule/catalog v2/과거 snapshot
  -> legacy adapter
  -> AI DSL extension과 안전하게 합성
  -> 같은 evaluator 입력
```

DSL은 JSON으로만 직렬화하며 `languageVersion`을 가진다. v1의 정확한 노드 이름은 1단계 설계에서 확정하되 다음 의미군을 최소 범위로 삼는다.

| 의미군 | v1에서 필요한 표현 |
| --- | --- |
| 입력·참조 | 결제금액, 결제처·브랜드·카테고리·채널, 승인 시각, 카드 실적, 카드 등록 후 경과일, 사용자가 확인한 조건 |
| 논리·비교 | `all`, `any`, `not`, 같음·집합 포함·대소 비교·범위 |
| 금액 계산 | 정액·정률·고정가, 사칙연산, `min`·`max`, 명시적 절사·반올림, 조건별 `case` |
| 이력 집계 | 조건으로 거른 거래의 일·월·연 `sum`·`count`, n번째 거래, 가장 많이 쓴 그룹 선택 |
| 한도 | 건별·일·월·연 금액·횟수, 실적 구간별 한도, 규칙·공유 그룹·카드 범위 |
| 범위 데이터 | 공식 결제처 집합, 제외 집합, 상품·채널 범위와 안정적인 registry 참조 |
| 결과 상태 | 확정·사용자 확인 필요·정보 제공, 적용 이유와 사용된 한도 |

금액은 정수 원 단위, 달력 집계는 `Asia/Seoul`, 경계 포함 여부와 절사 순서를 AST에 명시한다. evaluator는 노드 깊이·총 노드 수·집계 조회량과 산술 범위를 제한하고 알 수 없는 version·operator·reference, `NaN`·무한대·순환 참조를 거부한다.

## 3. 전환 원칙

1. 기존 `BenefitRule`을 즉시 삭제하지 않는다. legacy adapter가 기존 조건·action·limit를 DSL 의미로 변환하고, 먼저 shadow mode에서 현재 계산기와 결과를 비교한다.
2. 새 DSL 규칙은 additive payload와 program version으로 저장한다. 기존 필수 열은 안전한 0원 fallback을 유지하고 새 앱은 program을 우선 해석한다.
3. 새 공개 계약은 catalog v3로 올리되, 앱은 IndexedDB에 남은 정상 catalog v2를 adapter로 읽을 수 있어야 한다. 유효한 기존 캐시를 schema 변경만으로 버리지 않는다.
4. 기존 transaction의 catalog·조합 snapshot은 재계산하거나 일괄 변환하지 않는다. 표시와 이용량 집계에 필요한 기존 rule ID와 snapshot 의미를 보존한다.
5. 새 후보부터 DSL을 사용한다. AI program은 기존 target·condition·limitConfig를 legacy compiler가 만든 안전한 기본 프로그램과 합성한 뒤 전체 AST로 저장하며, 기존 게시 revision의 물리적 변환은 shadow 동등성이 증명된 뒤에도 필수가 아닌 별도 작업으로 둔다.
6. 미지원 문구를 무시하거나 0원 규칙으로 숨기지 않는다. 혜택 금액·조건·한도에 영향을 주는 `unsupportedClauses`가 하나라도 있으면 승인 API가 게시를 거부한다.

## 4. 구현 단계와 검증 게이트

### 1단계 — 의미 인벤토리와 DSL v1 동결

- 현재 게시 카드 14장, 두산 카드의 반려 후보와 공식 근거, 계산·수집·검수 테스트에서 사용하는 모든 조건과 한도를 capability matrix로 분류한다.
- 각 의미를 입력, predicate, expression, aggregate, scope, result status로 분해하고 DSL JSON Schema·TypeScript type·평가 순서를 결정 기록으로 확정한다.
- 동일 결제에서 규칙 결합 순서, 공유 한도 차감, 절사, 시간대, 누락 입력과 사용자 확인 상태를 예제로 고정한다.
- 현재 `npm run benchmark:recommendations` 기준선을 기록하고 evaluator의 성능 허용치를 측정값에 근거해 확정한다.

게이트: 카드명이나 상품 코드가 grammar 또는 evaluator 분기에 없고, 현재 규칙과 두산의 신규회원 한도 의미를 모두 표현할 수 있다는 설계 검토를 통과해야 2단계로 간다.

### 2단계 — 안전한 evaluator와 legacy parity

- schema parser, 정적 type/reference checker, canonical serializer와 resource budget을 구현한다.
- evaluator를 시간·DB·네트워크에 직접 접근하지 않는 순수 함수로 만들고 필요한 거래 이력은 제한된 evaluation context로만 전달한다.
- 기존 `BenefitRule` adapter와 현재 계산기 대비 shadow comparator를 만든다.
- 현재 14장 golden fixture에서 혜택 상태·금액·한도 사용량·선택 이유·순위를 비교하고 차이는 원인과 의도 여부를 기록한다.
- 생성 기반 테스트로 잘못된 AST, 과도한 중첩, 산술 overflow, 경계 포함, 절사, 동일 입력 결정성을 검증한다.

게이트: 의도하지 않은 parity 차이 0건, 기존 전체 테스트 통과, 성능 허용치 충족 전에는 저장·catalog 경로를 전환하지 않는다.

### 3단계 — revision·catalog·local-first 호환

- 검토한 Drizzle migration으로 DSL payload와 version을 저장하고 candidate·revision snapshot·rollback에 포함한다.
- catalog v3 직렬화·검증과 catalog v2 캐시 adapter를 추가한다. 브라우저와 서버가 같은 evaluator와 program hash를 사용하는지 계약 테스트로 고정한다.
- 커스텀 카드와 과거 결제 snapshot은 legacy 경로를 유지하고, 새 DSL 기록도 이용량과 카드별 실적 기여를 원자 갱신한다. 카드 승인금액을 기본 예상 실적에 반영하고 명시적으로 판정된 카드별 제외만 차감한다.
- migration 직전에 DB backup·quick check·foreign key·복원 가능성을 검증한다.

게이트: v2 캐시에서 오프라인 시작, v3 갱신, 새로고침, 기록 후 재계산, rollback을 모두 통과해야 수집 경로를 연결한다.

### 4단계 — AI compiler와 사람 검수

- OpenAI structured output을 DSL AST, 노드별 source evidence, completeness와 `unsupportedClauses` 계약으로 교체한다.
- AI는 registry에 존재하는 operator와 참조만 출력할 수 있고, 서버가 schema 외에도 타입·근거·숫자·참조·capability를 다시 검사한다.
- 관리자 검수에 자연어 렌더링, 노드별 근거, 미지원 문구, 대표 입력 simulator와 legacy↔DSL diff를 제공한다. 수정은 JSON 자유 입력이 아니라 schema가 허용한 구조를 재검증하는 방식으로 한정한다.
- source semantic hash뿐 아니라 DSL language version, compiler prompt version과 evaluator semantics version을 cache key에 넣는다.

게이트: 근거 없는 수치, 허용되지 않은 operator, 존재하지 않는 결제처 집합, 금액 영향 미지원 문구가 모두 승인 전에 차단되어야 한다. 실 OpenAI 호출은 대상·예상 호출 수·목적을 알리고 별도 사용자 승인을 받은 뒤에만 실행한다.

### 5단계 — 미지 조합과 두산 카드 최종 검증

- 애플리케이션 코드를 바꾸지 않고 fixture의 DSL 데이터만으로 다음 네 의미 조합을 추가한다: 조건부 비율 한도, 필터된 n번째 거래, 이용액이 가장 큰 범주 선택, 여러 규칙이 공유하는 기간 한도.
- 두산 카드의 실제 판매처와 홈경기 티켓·굿즈·구장 F&B 구매 상황을 분리하고, 상황 질문을 확인하기 전에는 조건부로 둔다. 신규회원 기간 동안 월 통합한도가 일반 한도의 50%가 되는 식은 DSL로 표현한다.
- 두산 후보를 수집→AI compile→audit→simulation→사람 검수→revision 경로로 처리한다. 공식 근거 또는 결제처 식별이 불충분하면 기존 게시본을 건드리지 않고 그 사유로 계속 보류한다.
- 0원·실적 경계, 신규회원 기간 직전·경계·직후, 일반·신규 월 한도 직전·교차·소진 후, 공식 결제처와 다른 결제처를 golden test로 고정한다.

게이트: 두산의 의미를 카드 ID·상품 코드별 evaluator 분기나 가상 결제처 없이 표현하고 모든 값 영향 문구와 상황 질문에 근거가 있을 때만 게시한다.

### 6단계 — 전체 검증과 문서화

- 관련 단위·property·통합 테스트 후 `npm test`, `npm run lint`, `npm run build`, recommendation benchmark를 실행한다.
- 데스크톱·모바일에서 관리자 후보 검수와 실제 추천·조건 확인·기록을 확인한다.
- `docs/SPEC.md`, `docs/ARCHITECTURE.md`, 수집 정책, 운영 체크리스트와 `docs/TASKS.md` 진행 기록을 실제 구현에 맞춰 갱신한다.
- 완료 조건을 모두 확인한 뒤에만 `TASK-10`을 `[x]`로 바꾸고 `TASK-05`를 다음 작업 `[>]`로 선택한다.

## 5. 계획 승인 시 착수 순서

승인 후 먼저 `TASK-10`을 `[-]`로 바꾸고 1단계의 capability matrix와 DSL v1 계약을 작성한다. 이 설계 게이트를 코드보다 먼저 검토해 범위가 지나치게 작은 카드 전용 DSL이나 제한 없는 실행 언어로 흐르지 않게 한다. 이후 2→3→4→5→6단계를 순서대로 진행하되, 유료 AI 호출·DB migration 적용·배포는 기존 승인 경계를 유지한다.
