# 비공개 베타 카드 지원 현황과 추가 절차

> 기준 시각: 2026-09-07 KST
>
> 범위: 기존 테스트 카드 14장과 추가 요청 검증용 `두산베어스 KB카드`

## 판정 원칙

- 베타 시작 전에는 현재 테스트 카드 14장을 계산 기준선으로 사용한다.
- 참여자의 실제 카드는 참여 시작 직전에 정확한 상품을 확인하고 아래 체크리스트로 동적으로 추가한다.
- `issueStatus`는 수집·관리 이력에만 남긴다. 발급 중단 여부로 이미 보유한 카드의 선택을 막거나, 추천 순위를 바꾸거나, 사용자 경고를 만들지 않는다.
- 공식 원문을 수집했다는 사실만으로 게시하지 않는다. 구조화 후보의 필드 근거, validation, audit, 의미 diff를 사람이 검수한 뒤 revision으로 게시한다.
- 신규·변경 원문에 유료 AI 구조화가 필요하면 카드와 이유를 먼저 특정하고 사용자 승인을 받는다.
- 현재 게시 테스트 카드 14장은 별도 실적 제외 정책이 등록되지 않아 새 결제의 승인금액을 기본적으로 예상 실적에 자동 반영한다. 카드사 수치의 수동 입력은 선택적 보정 기능이다. 각 카드에서 명시된 제외 조건이 확인되면 해당 카드의 정책으로 추가한다.

## 지원 표

| 카드 ID | 카드 | 공식 출처 | 현재 판정 | 계산 규칙 |
| --- | --- | --- | --- | ---: |
| `hana_nara` | 하나 나라사랑카드(체크) | [상품 페이지](https://www.hanacard.co.kr/OPI41000000D.web?CARD_CDOE=15475&CD_PD_SEQ=18813&title=STEP0) | 게시 revision 2 | 23 |
| `hana_travelog_student` | 하나 트래블로그 학생증 체크카드 | [상품 페이지](https://www.hanacard.co.kr/OPI41000000D.web?CD_PD_SEQ=15414&mID=PI41015414P&schID=pcd), [학생증 대상 안내](https://m.hanacard.co.kr/MKEVT1010M.web?EVN_SEQ=60371) | 게시 revision 3 | 3 |
| `hyundai_zero_edition3_discount` | 현대카드ZERO Edition3(할인형) | [상품 가이드북 PDF](https://www.hyundaicard.com/upload/card/%EA%B0%80%EC%9D%B4%EB%93%9C%EB%B6%81_ZERO%20Ed3_%ED%95%A0%EC%9D%B8_260330.pdf) | 게시 revision 2 | 2 |
| `kb_nara` | KB국민 나라사랑카드 | [상품 페이지](https://card.kbcard.com/CRD/DVIEW/HCAMCXPRICAC0076?mainCC=a&cooperationcode=04120), [출시 안내](https://otalk.kbstar.com/quics?QSL=F&articleId=8720&bbsMode=view&page=C019391), [대중교통 약관 개정](https://card.kbcard.com/CMN/DVIEW/HSEMCXCRSCTC0001?ARTICLE_SERIAL=11274&ROUTE_TYPE=VIEW) | 게시 revision 2 | 23 |
| `kb_nori2_student` | KB국민 노리2 학생증체크카드 | [상품 페이지](https://card.kbcard.com/CRD/DVIEW/HCAMCXPRICAC0076?cooperationcode=07998&mainCC=a) | 게시 revision 2 | 14 |
| `lotte_loca_likit_12` | LOCA LIKIT 1.2 | [상품 페이지](https://www.lottecard.co.kr/app/LPCDADB_V100.lc?vtCdKndC=P13937-A13937) | 게시 revision 2 | 2 |
| `nh_zgm_the_pay` | zgm.the pay카드 | [상품 페이지](https://card.nonghyup.com/servlet/IpCc2021R.act?CD_WRS_SQNO=90010178) | 게시 revision 2 | 3 |
| `samsung_id_on` | 삼성 iD ON 카드 | [많이 쓰는 영역](https://static11.samsungcard.com/wcms/svc/1347284_38558.html), [교통·통신·스트리밍](https://static11.samsungcard.com/wcms/svc/1347289_38558.html), [온라인 간편결제·해외](https://static11.samsungcard.com/wcms/svc/1347508_38558.html) | 게시 revision 2 | 12 |
| `shinhan_deep_dream` | 신한 Deep Dream 체크카드 | [상품 페이지](https://www.shinhancard.com/pconts/html/card/apply/check/1188313_2206.html) | 게시 revision 2 | 13 |
| `shinhan_heyoung` | 신한 Hey Young 체크카드 | [상품 페이지](https://www.shinhancard.com/pconts/html/card/apply/check/1233237_2206.html) | 게시 revision 2 | 41 |
| `shinhan_hi_point` | 신한카드 Hi-Point | [상품 페이지](https://www.shinhancard.com/pconts/html/card/apply/credit/1187943_2207.html) | 게시 revision 2 | 32 |
| `shinhan_mr_life` | 신한카드 Mr.Life | [상품 페이지](https://www.shinhancard.com/pconts/html/card/apply/credit/1187937_2207.html) | 게시 revision 2 | 10 |
| `shinhan_nara` | 신한카드 나라사랑카드 체크 | [상품 페이지](https://www.shinhancard.com/pconts/html/card/apply/check/2013660_2206.html) | 게시 revision 2 | 29 |
| `shinhan_sol` | 신한카드 SOL트래블 체크 | [상품 페이지](https://www.shinhancard.com/pconts/html/card/apply/check/1225714_2206.html), [이용 가이드](https://www.shinhancard.com/pconts/html/card/travel/travel_supersol.html), [약관 변경](https://www.shinhancard.com/pconts/html/helpdesk/dataRoom/MOBFM164N/1227673_1119.html) | 게시 revision 3 | 13 |
| `kb_doosan_bears` | 두산베어스 KB카드 | [상품 페이지](https://card.kbcard.com/CRD/DVIEW/HCAMCXPRICAC0076?cooperationcode=02219&mainCC=a) | `DRAFT` 보류, 최초 후보 반려 | 0 |

기존 테스트 카드 14장은 모두 공식 검수 revision으로 게시되어 있다. `hana_travelog_student` revision 3은 종료된 돈키호테 기간형 행사를 제거하고 현재 상시 혜택 3개만 유지한다. 두산 카드는 근거·계산 안전 조건을 통과하지 못해 공개 카탈로그에 포함하지 않는다.

## 2026-09-07 수집·검수 기록

### 무비용 사전 수집

- `maxAiCards=0`으로 기존 14장을 확인했다.
- 13장은 의미 hash cache에 적중해 AI 호출 없이 `unchanged`였다.
- `hana_travelog_student` 1장은 공식 원문 의미 변경이 감지되어 `deferred`가 됐다.
- 추가 요청 카드 `kb_doosan_bears`는 정확한 신용카드 상품 코드 `02219`로 등록하고 공식 상품 페이지를 수집했다. 별도 상품인 `두산베어스 KB체크카드` 코드 `02212`와 합치지 않았다.
- 두산 카드 역시 최초 구조화가 필요하므로 `maxAiCards=0` 실행은 기존 게시 데이터에 영향을 주지 않고 `deferred`로 끝났다.

### 승인된 AI 구조화 2장

- 사용자 승인 후 `maxAiCards=2`로 `hana_travelog_student`와 `kb_doosan_bears`만 실행했다. 두 카드 모두 공식 원문 수집 실패 없이 후보가 생성됐고 추가 카드는 호출하지 않았다.
- 트래블로그 후보는 validation·audit 차단 0건이었다. 2026-08-31에 끝난 돈키호테 지원금 규칙 2개를 제거하고 국내 0.3% 적립과 해외 가맹점·ATM 수수료 면제 정보 규칙을 유지해 revision 3으로 승인했다.
- 두산 후보는 `최대 3만원 할인` 요약 문장 2개가 혜택 인벤토리에서 누락돼 validation을 통과하지 못했다.
- 사람 검수에서는 자동 오류 외에도 두산 홈경기 티켓·굿즈 양수 혜택이 결제처 범위 없이 전역 규칙으로 생성된 점과, 신규회원에게 적용되는 `월 할인한도 50%`를 기존 규칙이 전체 한도로 계산하는 점을 확인했다. 다른 결제에 과대 적용될 수 있으므로 후보를 반려하고 카드는 `DRAFT`로 보류했다.
- 같은 오류의 재발을 막기 위해 결제처 범위 없는 특정 상품 양수 혜택과 비율로 축소되는 신규카드 월 한도를 validation 차단 조건으로 추가했다.

### 기존 대기 후보 5장 검수

| 카드 | 후보 규칙 | 근거 필드 | 누락 | 차단 | 검수 결론 |
| --- | ---: | ---: | ---: | ---: | --- |
| 현대카드ZERO Edition3(할인형) | 2 | 2 | 0 | 0 | 0.8% 일반 할인만 계산하고 긴급할인 캐시는 0원 정보로 유지해 승인 |
| LOCA LIKIT 1.2 | 2 | 4 | 0 | 0 | 1.2% 일반과 1.5% 온라인 중 최적 단일 규칙을 적용하도록 승인 |
| zgm.the pay카드 | 3 | 10 | 0 | 0 | 1.0% 일반, NH페이 1.7%, 기타 대상 페이 1.2%와 공유 월 한도를 조건부로 승인 |
| 삼성 iD ON 카드 | 12 | 58 | 0 | 0 | 최다 이용 영역·정기결제·매장 분류는 사용자 확인, 미매핑 대상은 0원 정보로 보수화해 승인 |
| 신한카드 Hi-Point | 32 | 132 | 0 | 0 | 실적 구간별 적립과 영화 횟수 한도를 계산하고 리터당·포인트 사용 혜택은 0원 정보로 유지해 승인 |

다섯 후보는 승인 과정에서 각각 baseline revision 1과 활성 revision 2를 만들었고, 원문에서 자동 판단할 수 없는 조건은 확정 총액에 바로 포함하지 않는다.

## Golden 계산 기준선

`src/test/fixtures/beta-card-golden.ts`에 테스트 카드 14장당 대표 거래를 하나씩 고정한다. 각 대표값은 현재 게시 revision의 규칙 ID와 공식 출처를 직접 연결한다.

- 기본 혜택 금액과 `확정`/`조건 충족 시` 분리
- 전월 실적 조건이 있는 카드의 기준 직전과 기준 도달
- 최소 결제금액과 배타적 최대 결제금액이 있는 규칙의 양쪽 경계
- 온라인·오프라인·공식 홈페이지/앱 결제 채널 경계
- 월 금액 한도의 직전 잔여 적용과 소진 후 0원
- 일 횟수 한도의 직전 적용과 소진 후 0원

모든 카드에 존재하지 않는 조건을 억지로 만들지 않고, 실제 대표 규칙에 선언된 경계만 반복 검증한다.

## 참여자 카드 동적 추가 체크리스트

1. 참여 시작 직전에 카드 앞면 명칭, 카드사, 신용/체크 구분, 상품 코드를 확인한다. 카드번호·계좌번호 같은 개인정보는 받지 않는다.
2. 기존 시스템 카드와 정확히 같은 상품인지 확인한다. 이름이 비슷한 신용/체크, 에디션, 제휴형은 합치지 않는다.
3. 공식 카드사 공개 상품 페이지·상품설명서·약관 공지만 출처로 등록한다. 검색 요약, 블로그, 카드 비교 사이트는 계산 근거로 사용하지 않는다.
4. 시스템 카드를 `DRAFT`로 등록하고 필수 원문을 먼저 수집한다. 이 단계에서는 공개 카탈로그에 노출하지 않는다.
5. `maxAiCards=0` 사전 실행으로 기존 의미 hash cache 사용 여부, 원문 실패, 실제 AI 필요 대상을 확인한다.
6. 유료 구조화가 필요하면 카드명, 신규/변경 이유, 호출 수 상한을 사용자에게 알리고 승인받은 뒤 실행한다.
7. 전체 혜택 인벤토리, 필드별 근거, validation, audit, 기존 revision diff를 검수한다. 자동 판단이 불가능한 조건은 사용자 확인 또는 0원 정보로 낮춘다.
8. 일반 결제와 그 카드에 실제로 존재하는 실적·건별·일·월·연 한도 경계를 golden fixture로 추가한다. 실적 제외 조건은 다른 카드에서 복사하지 않고 해당 상품의 공식 원문과 대조한다. 일반 결제의 승인금액 반영, 명시적 제외 거래, 할인 적용·미적용과 기록 후 다음 추천을 검증한다. 거래 종류를 앱이 식별할 수 없는 예외는 자동 제외가 완성됐다고 간주하지 않는다.
9. 관련 회귀 테스트를 통과한 후보만 승인해 revision으로 게시한다. 오류·근거 누락은 사유를 남기고 `DRAFT` 또는 기존 게시 revision을 유지한다.
10. 공개 카탈로그에 승인 카드만 보이고 후보 원문·검수자·개인 workspace가 섞이지 않는지 확인한 뒤 참여자의 첫 설정을 시작한다.

## 두산베어스 KB카드 요청 시나리오

검증된 최종 흐름은 다음과 같다.

`사용자 요청` → `02219 신용카드로 상품 식별` → `DRAFT 등록` → `KB국민카드 공식 상품 페이지 수집` → `무비용 사전 실행에서 최초 AI 구조화 필요 확인` → `대상 2장·상한 2장 비용 승인` → `후보 10개 규칙 생성` → `validation 오류 2건 및 사람 검수 위험 2종 확인` → `후보 반려` → `DRAFT·공개 제외 유지`

이 결과는 카드 추가 요청이 곧바로 공개 게시로 이어지지 않고, 근거와 계산 안전성이 부족하면 기존 사용자 카탈로그를 바꾸지 않은 채 보류되는 경로를 입증한다. 향후 게시하려면 실제 판매처와 구매 상황을 분리하고 신규회원 50% 월 한도 및 공식 조건을 검증한 뒤 새 후보를 다시 검수해야 한다.

### 2026-09-08 DSL 재검증

`TASK-10`에서 실제 DB를 검증된 온라인 백업과 격리 migration 리허설 후 catalog v3/DSL migration 0018까지 올렸다. 사용자 승인 범위대로 두산 카드 한 장만 OpenAI Responses API 2회(인벤토리·DSL 구조화 각 1회) 호출했고, 추가 호출은 하지 않았다.

첫 DSL 후보의 62개 오류를 분석해 카드별 분기를 추가하지 않고 다음 범용 경계를 보완했다.

- 기존 target·condition·limitConfig를 legacy DSL 기본값으로 만들고 AI extension과 합성
- 개별 서비스 월 한도를 `limits.monthlyBenefitAmount`, 카드 전체 통합 월 한도만 `cardMonthlyLimit`으로 분리
- 신규회원 한도 축소는 실제 실적 미달일 때만 적용하고 실적 도달 시 정상 구간 한도 사용
- 공식 coverage에서 최종 AST의 모든 노드 경로를 결정론적으로 연결하되 숫자 literal이 인용에 없으면 계속 차단
- 특정 결제처 혜택을 카테고리 전체로 확대하지 못하게 하고, 새 공식 결제처는 관리자 create-only registry 데이터로 등록

실제 DB 후보는 공개 결제처 데이터 변경을 하지 않아 `야구 홈경기 티켓/굿즈&용품`, `홈구장 내 F&B` 두 항목이 미등록이라는 오류 2건으로 안전하게 `PENDING` 상태다. 실제 후보가 든 격리 DB에 두 결제처를 등록한 최종 리허설은 AI 재호출 없이 validation·audit·근거 누락이 모두 0건이 됐다. 계산기는 두산 티켓 신규회원 5천원, 실적 30만원 1만원, 실적 80만원 2만원, 한도 잔여 100원, 홈구장 F&B 신규회원 2,500원, OTT 신규회원 2,500원과 다른 영화 결제 0원을 반환했다.

이 시점에는 `사용자 요청 → 정확한 상품 초안 → 공식 원문 → 승인된 AI 2회 → DSL 안전 합성 → 카테고리 전체로 넓어진 상황 혜택 차단`까지 진행했다. 격리 DB의 가상 결제처 등록 리허설은 형식 검증 결과일 뿐 실제 적용 범위가 맞다는 증거가 아니므로 게시 경로로 채택하지 않는다. 실제 공개 결제처 등록과 후보 게시는 실행하지 않아 공개 카탈로그가 변경되지 않았다.

### 2026-09-12 결제 상황 분리

`TASK-10`의 공통 DSL target에 브랜드가 아닌 `purchaseScenario`와 사용자 확인 질문을 추가했다. 상황 검색은 보유 카드의 게시 규칙에서만 생성되고, 선택 전에는 적용하지 않으며 질문 확인 전에는 조건부 혜택으로 계산한다. 시나리오 ID는 결제처 registry에 추가하지 않고 로컬 기록 snapshot에 별도로 남긴다. 선택한 상황의 결제금액은 상품 한정 규칙의 대상 금액으로 쓰되 별도 대상 금액 입력이 있으면 그 값을 우선한다. 합성 두산형 규칙의 상황 선택·조건부→확정·일반 결제 분리, 추출 후보의 상황 target·채널 보존은 무비용 테스트로 검증했다. 격리 Chrome에서 검색→선택→금액 입력→조건 확인→로컬 기록을 완주하고 데스크톱·모바일 화면을 확인했다. 이 시점의 실제 두산 후보는 재구조화하지 않아 기존 `PENDING`·오류 2건과 카드 `DRAFT`를 유지했다.

### 2026-09-12 실제 후보의 격리 재구성

공식 상품 페이지를 재확인하고 저장된 `PENDING` 후보를 읽기 전용으로 복사해 티켓·굿즈·F&B의 3개 상황으로 나눴다. 티켓에만 정규시즌 홈경기 조건을 두고 티켓·굿즈의 월 한도를 공유했다. 범위·근거 검증과 9개 계산 경계는 통과했지만 할인 적용 거래가 전월 실적에서 제외되는 공식 조건을 현재 기록 경로가 반영하지 못해 금액 영향 미지원 문구로 게시를 막았다. 실제 DB 후보·카드와 공개 카탈로그는 그대로다. 세부 근거, 제안 파일과 남은 게이트는 [두산 결제 상황 검토](./doosan-scenario-review-2026-09-12.md)에 기록했다.

## 최종 검증

- Vitest 전체 61개 파일, 491개 테스트 통과
- ESLint 통과
- Next.js production build와 TypeScript 검사 통과
- DB migration 18개 적용 후 `quick_check=ok`, foreign key 위반 0건
- migration 전 백업의 `quick_check=ok`, `integrity_check=ok`, foreign key 위반 0건 확인
- production `/api/health` 정상
- production `/api/catalog` 카드 14장, `kb_doosan_bears` 비노출, 후보·검수자·원문 내부 필드 비노출 확인
