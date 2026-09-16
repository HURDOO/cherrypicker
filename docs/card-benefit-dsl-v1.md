# 카드 혜택 DSL v1 계약

## 목적과 적용 범위

카드 혜택 DSL은 카드명을 조건문에 추가하지 않고, 공식 문서에서 확인한 값을 허용된 연산자와 입력의 JSON 조합으로 표현한다. AI 출력은 실행 코드가 아니라 검수 대기 데이터이며 schema, 타입, 참조, 근거와 실행량 검사를 통과한 뒤 사람의 승인으로만 게시된다.

이 계약의 구현 기준은 `src/types/benefit-dsl.ts`와 `src/utils/benefit-dsl.ts`다. `languageVersion`은 `1`, 현재 evaluator 의미 version은 `benefit-dsl-v1.1.0`이다. 새 값·브랜드·카테고리·구매 상황과 아래 연산자의 새로운 조합은 애플리케이션 코드 변경 없이 처리한다. 새 외부 정보나 아래에 없는 의미는 AI가 연산자를 발명하지 않고 `unsupportedClauses`로 보고한다.

## 프로그램 구조와 평가 순서

`BenefitRule.program`은 다음 필드를 가진다.

| 필드 | 의미 |
| --- | --- |
| `target` | 실제 포함·제외 브랜드, 카테고리, 채널 또는 구매 상황 `purchaseScenario` 범위 |
| `eligibility` | 혜택 적용 여부를 반환하는 불리언 식 |
| `benefit` | 현재 결제에서 얻는 원 단위 금액 식 |
| `limits` | 일·월·연 횟수와 일·월 혜택 금액 한도 식 |
| `usageGroupId` | 여러 규칙이 같이 차감하는 안정적인 그룹 ID |
| `usesCardLimit` | 카드 통합 월 한도를 차감하는지 여부 |
| `cardMonthlyLimit` | 실적·신규회원 상태 등에 따라 달라지는 카드 통합 월 한도 식 |
| `confirmations` | 조건이 참일 때 사용자 확인이 필요한 문구 |
| `reason` | 계산 결과에 표시할 짧은 이유 |

계산은 `target → eligibility → 기간 한도 → benefit → 카드 통합 한도 → 남은 결제액 → confirmation` 순서다. 금액과 한도는 음수가 될 수 없고 최종 값은 원 단위 정수로 내림한다. 명시적 절사·올림·반올림은 `round` 노드와 단위를 사용한다. 일·월·연 경계는 `Asia/Seoul`을 기준으로 한다.

AI가 출력한 program은 기존 필드를 무시하는 임의의 대체물이 아니다. 서버는 rule의 target·condition·limitConfig를 legacy compiler로 먼저 변환하고 AI가 추가한 eligibility·benefit·동적 한도를 제한적으로 합성한다. 합성된 전체 AST만 candidate와 revision에 저장하고 legacy action은 0원 fallback으로 낮춘다. 개별 서비스 월 한도는 `limits.monthlyBenefitAmount`, 카드 전체 통합 월 한도만 `cardMonthlyLimit`을 사용한다. 신규회원 한도 분기는 신규회원 확인 상태와 최소 실적 미달을 함께 검사하며, 실제 실적이 기준에 도달하면 정상 실적 구간 한도를 사용한다.

## 허용 입력

| 입력 | 값 |
| --- | --- |
| 결제 | `PAYMENT_AMOUNT`, `REMAINING_PAYMENT_AMOUNT`, `ELIGIBLE_ITEM_AMOUNT`, `ELIGIBLE_ITEM_AMOUNT_PROVIDED` |
| 카드 | `CARD_PERFORMANCE`, `CARD_BASE_MONTHLY_LIMIT`, `CARD_FIRST_BENEFIT_TIER_LIMIT`, `CARD_NETWORK` |
| 결제처 | `BRAND_ID`, `CATEGORY_ID`, `CHANNEL` |
| 시각 | `CURRENT_DATE`, `CURRENT_WEEKDAY`, `CURRENT_MINUTE` |
| 사용자 확인 상태 | `NEW_CARD_WINDOW_AVAILABLE` |
| 규칙·공유 그룹 사용량 | `USAGE_DAILY_COUNT`, `USAGE_DAILY_BENEFIT_AMOUNT`, `USAGE_MONTHLY_COUNT`, `USAGE_MONTHLY_BENEFIT_AMOUNT`, `USAGE_YEARLY_COUNT` |

`NEW_CARD_WINDOW_AVAILABLE`은 카드 등록일을 추정한 값이 아니다. 현재 제품이 등록일을 보관하지 않으므로 신규회원 기간 적용 여부를 사용자가 확인한 상태로만 전달한다. 거래 이력 집계는 평가 중인 카드의 확정 카드 혜택 snapshot만 사용하며 다른 카드, 조건부 혜택과 프로모션 금액은 포함하지 않는다.

`purchaseScenario`는 결제처가 아니라 사용자가 명시적으로 고르는 구매 의도다. 카드 접두사를 포함한 안정 ID, 표시명, 최대 8개 검색 별칭과 반드시 확인할 질문 1~8개를 가진다. 브랜드·카테고리 범위와 동시에 지정할 수 없고, 같은 상황 ID를 쓰는 규칙의 표시명·질문은 같아야 한다. 일반 결제나 실제 브랜드 선택만으로 상황 ID를 추정하지 않는다. 상황에서 입력한 결제금액은 상품 한정 규칙의 대상 금액으로 취급하며, 별도 대상 금액이 제공되면 그 값을 우선한다. 상황 선택 후 질문을 확인하기 전에는 계산 가능 금액도 `조건 충족 시`로만 표시하며 기본 확정 순위에 반영하지 않는다. 사용자 답변이 실제 카드사 승인 결과를 보증하지는 않는다.

## 허용 연산자

| 연산자 | 의미와 제약 |
| --- | --- |
| `literal`, `input` | 상수와 위 입력 참조 |
| `arithmetic` | `ADD`, `SUBTRACT`, `MULTIPLY`, `DIVIDE`, `MIN`, `MAX`; 0 나눗셈과 비정상 숫자는 실패 |
| `round` | `FLOOR`, `CEIL`, `NEAREST`와 양수 단위 |
| `compare` | `EQ`, `NE`, `GT`, `GTE`, `LT`, `LTE` |
| `logic`, `not`, `in` | `ALL`, `ANY`, 부정, 허용 값 집합 포함 여부 |
| `case` | 순서대로 첫 참 분기를 선택하고 `otherwise` 사용 |
| `aggregate` | 현재 카드 거래의 일·월·연 `SUM` 또는 `COUNT`; 결제액·확정 카드 혜택액을 선택하고 필터와 현재 결제 포함 여부 지정 |
| `isTopGroup` | 일·월·연 브랜드 또는 카테고리별 결제액·거래 횟수 중 현재 그룹이 공동 최댓값인지 판정 |

집계의 `where`는 각 이력 행의 브랜드·카테고리·채널·금액·시각을 입력으로 평가한다. 집계 안에 다른 `aggregate`나 `isTopGroup`을 중첩하지 않는다. 동률인 최다 그룹은 모두 참으로 판정한다.

## 안전·실패 계약

- 프로그램은 최대 256개 AST 노드와 깊이 16, 거래 이력 5,000건으로 제한한다.
- 알 수 없는 language version, operator, input, 필드, 타입, 브랜드·카테고리 참조, 잘못된 구매 상황 ID·질문과 안전하지 않은 숫자는 승인 전에 거부한다.
- evaluator는 DB, 파일, 네트워크, 현재 시스템 시각에 직접 접근하지 않는다. 모든 값은 호출자가 제공한 context만 사용한다.
- JavaScript, SQL, 정규식, URL 호출과 임의 함수 이름은 문법에 없으며 실행하지 않는다.
- 같은 `usageGroupId`의 규칙은 동일한 한도 식을 가져야 한다. 같은 카드의 `cardMonthlyLimit` 식이 충돌하면 게시를 차단한다.
- 평가 오류는 혜택 0원·적용 불가로 닫히며 오류 목록을 반환한다. 미지원 문구가 금액·조건·한도에 영향을 주면 후보 승인을 차단한다.
- DSL 규칙의 공식 인용 evidence에는 `program` 필드와 `programPaths`를 연결한다. 루트와 모든 AST 노드 경로가 하나 이상의 공식 인용에 연결되어야 하며, 숫자 literal은 연결된 인용에서 그 값을 확인할 수 없으면 승인 전에 거부한다. 인벤토리 coverage의 DSL 근거는 같은 coverage의 rule ID만 가리킬 수 있다. 관리자 화면은 노드 경로, 검증 결과, 자연어 요약, 일반·신규회원 대표 금액별 시뮬레이션과 미지원 문구를 승인 전에 보여준다.
- AI가 일부 구조 노드 경로를 빠뜨려도 서버는 해당 rule에 이미 연결된 공식 coverage 중 의미 필드가 맞고 숫자 literal까지 확인되는 인용만 사용해 경로를 결정론적으로 보완한다. 적합한 인용이 없으면 보완하지 않고 후보를 차단한다.

## 호환과 저장

- 기존 `BenefitRule`은 삭제하지 않는다. `compileLegacyBenefitRule`이 기존 target, 조건, action, 한도, 공유 그룹과 확인 조건을 DSL v1로 변환할 수 있으며 14개 베타 golden 시나리오에서 기존 계산값과 동등성을 검사한다.
- 신규 DSL 규칙은 기존 필수 action에 `FLAT 0` 안전 fallback을 두고 `program_version=1`, `program` JSON을 추가 저장한다. 후보 snapshot, revision, rollback도 같은 payload를 보존한다.
- 새 공개 snapshot은 catalog schema v3로 program을 전달한다. parser는 정상 catalog v2도 계속 읽어 기존 IndexedDB 캐시와 커스텀 카드·과거 결제 snapshot을 유지한다.
- 의미 hash cache key에는 DSL language version과 evaluator 의미 version을 포함한다. 의미가 바뀌면 과거 AI 구조화 결과를 그대로 재사용하지 않는다.
- 새 카드에만 있는 실제 공식 결제처는 `/api/admin/system-brands`의 관리자 전용 create-only 경로로 공개 registry 데이터에 등록한다. 경기·상품·장소처럼 결제처가 아닌 범위는 가상 브랜드로 등록하지 않고 근거가 연결된 `purchaseScenario` 후보로 둔다. 미등록 결제처나 특정 구매 상황을 카테고리 전체 혜택으로 넓히면 승인을 차단한다.

## Capability matrix

| 의미 | v1 표현 | 검증 |
| --- | --- | --- |
| 정액·정률, 건별 최대, 고정가 | 산술·`MIN`·`case`·절사 | legacy adapter golden |
| 최소·최대 결제액, 실적, 날짜·요일·시간, 카드망 | 입력+비교·논리 | legacy adapter golden |
| 브랜드·카테고리·채널·제외 범위 | `target`과 registry 참조 검사 | extraction·catalog 계약 테스트 |
| 경기·상품·장소의 구매 상황 | `target.purchaseScenario`와 사용자 질문 | 상황·일반·브랜드 분리 및 조건부→확정 테스트 |
| 일·월·연 횟수·금액, 규칙 공유 한도 | `limits`, `usageGroupId` | 계산·공유 한도 테스트 |
| 실적 구간별·신규회원 비율 카드 한도 | `case`+카드 한도 입력 | 두산형 동적 한도 테스트 |
| 필터된 n번째 거래 | `aggregate COUNT`+`where`+`includeCurrent` | 합성 golden |
| 가장 많이 쓴 브랜드·카테고리 | `isTopGroup` | 합성 golden |
| 여러 규칙이 공유하는 동적 기간 한도 | 같은 `usageGroupId`와 동일 `limits` 식 | 합성 golden·program set 검사 |
| 사용자만 아는 조건 | `confirmations`와 제한된 확인 입력 | 조건부 결과 테스트 |

현재 14개 대표 카드는 `hana_nara`, `hana_travelog_student`, `kb_nara`, `kb_nori2_student`, `shinhan_deep_dream`, `shinhan_heyoung`, `shinhan_mr_life`, `shinhan_nara`, `shinhan_sol`, `hyundai_zero_edition3_discount`, `lotte_loca_likit_12`, `nh_zgm_the_pay`, `samsung_id_on`, `shinhan_hi_point`다. 각각 정률·정액, 최소·배타적 최대 결제액, 실적, 채널, 일·월·연 한도, 공유 한도와 사용자 확인 의미를 포함한 대표 거래를 legacy adapter로 비교한다.

## 성능 기준

- 기존 계산기 기준선(2026-08-18)은 실제 카탈로그 200회 실행에서 평균 약 1.6ms, p95 약 1.9ms였다.
- DSL 통합 후 임시 catalog v3의 카드 8장·규칙 81개를 같은 200회 benchmark로 실행한 2026-09-08 측정값은 평균 0.801ms, p95 1.226ms, 최대 1.710ms였다. 측정 대상 결제처는 투썸플레이스이며 네트워크 호출은 포함하지 않았다.
- 현재 개발 환경의 회귀 허용치는 p95 5ms 이하로 둔다. 실제 저사양 모바일 체감 성능은 `TASK-05`에서 별도로 측정하며, 카탈로그 규모나 benchmark 환경이 달라지면 수치와 조건을 함께 다시 기록한다.

## v1에서 의도적으로 지원하지 않는 의미

- 카드 등록일을 서버가 자동 판정하는 규칙: 등록일 데이터가 없으므로 사용자 확인 입력으로만 처리한다.
- 환율, 리터당 유가, 항공 마일 가치처럼 계산 시점 외부 데이터가 필요한 규칙
- 카드사 승인 업종 코드, 간편결제 내부 승인 경로 등 현재 앱이 관측하지 않는 값의 자동 확정
- 라운지 잔여 횟수, 보험 자격과 제휴사 실시간 상태처럼 외부 계정 조회가 필요한 규칙
- 원문만으로 계산 순서나 혜택 범위가 모호한 규칙

이 항목은 정보 제공 또는 `unsupportedClauses`로 남긴다. 여러 카드에서 반복되고 안전한 입력 출처와 결정론적 의미를 정의할 수 있을 때만 별도 결정과 회귀 테스트를 거쳐 범용 입력·연산자를 추가한다.
