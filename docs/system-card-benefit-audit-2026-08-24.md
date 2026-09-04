# 시스템 카드 혜택 공식 원문 대조 — 2026-08-24

> 상태: 2026-08-24 시점의 point-in-time 감사 기록입니다. 현재 카드 수, 게시 revision과 지원 상태의 기준으로 사용하지 않습니다. 현재 작업은 `docs/TASKS.md`, 공식 검수 정책은 `docs/card-benefit-source-policy.md`를 따릅니다.

## 범위와 판정 기준

- 대상: 시스템 카드 8장, 현재 게시 규칙 88개
- 목적: 현재 규칙을 공식 원문과 대조해 계산 오류, 누락, 상품 변형 혼동을 찾고 다음 source adapter 순서를 정한다.
- `공식 revision`: 원문 수집, 구조화, 근거 감사, 승인까지 완료한 상태
- `원문 대조`: 사람이 공식 페이지와 현재 규칙을 비교했지만 아직 candidate/revision 게시 계약을 통과하지 않은 상태
- 공식 링크를 찾았다는 사실만으로 카탈로그의 `REVIEWED` 상태를 부여하지 않는다.

## 전체 결과

| 카드 | 현재 규칙 | 공식 근거 상태 | 결과 |
| --- | ---: | --- | --- |
| 신한 Deep Dream 체크 | 8 | 정확한 상품 페이지 | 핵심 수치는 대체로 일치, 1.0% 최다영역·택시 횟수 조건 보완 필요 |
| KB국민 나라사랑 | 10 | 공식 출시 안내 + 현행 약관 개정 공지 | 핵심 혜택 일치, 현재 상품설명서의 구간별 조건 추가 확보 필요 |
| 신한 Hey Young 체크 | 11 | 정확한 상품 페이지 | 국내 규칙 일치, 해외 가맹점·ATM 혜택 2개 누락 |
| 신한 SOL트래블 체크 | 13 | 자동 수집·승인 revision | 공식 source bundle 기반 전체 지원 |
| 신한 나라사랑 체크 | 18 | 정확한 상품 페이지 | 핵심 혜택 일치, PX 구간과 광역교통 대상 계산 오류 |
| KB국민 노리2 학생증 체크 | 10 | 노리2 공통 상품 페이지 + 학생증 약관 공지 | 공통 10개 혜택 일치, 학생증 전용 상품설명서 확인 필요 |
| 하나 나라사랑 | 16 | 정확한 상품 페이지 | PX 구간·한도 불일치, CGV 팝콘 혜택 누락 |
| 하나 트래블로그 학생증 체크 | 2 | 일반 상품 페이지 + 학생증 대상 공식 안내 | 핵심 2개 일치, 학생증 전용 약관과 고정 수수료 계산 보완 필요 |

현재 공식 원문을 정확히 수집·승인한 카드는 SOL트래블 1장이다. 나머지 7장은 출처와 알려진 차이를 카탈로그 지원 정보에 노출하되 `NOT_REVIEWED`를 유지한다.

## 고위험 계산 차이

### `shinhan_deep_dream`

- `dd_dream_*`: 공식 원문은 당월 DREAM 영역 중 이용금액이 가장 큰 1개 영역에 총 1.0%를 적립한다. 현재 계산은 모든 DREAM 영역을 0.6%로 계산하므로 최다 이용 영역을 과소 계산한다.
- `dd_taxi_day`: 공식 조건은 달력의 3·6·9일이 아니라 당월 택시 **3·6·9번째 이용**이다. 현재 상세 문구와 수동 확인 문구는 날짜 조건으로 잘못 적혀 있다.
- 공식 근거: [신한카드 Deep Dream 체크 상품 페이지](https://www.shinhancard.com/pconts/html/card/apply/check/1188313_2206.html)

### `kb_nara`

- `kb_nara_px`: 공식 안내는 군마트 5~20% 구간형 혜택이다. 현재 action은 모든 결제에 20%를 적용하므로 실제 구간에 따라 과대 계산할 수 있다.
- 나머지 Youth 서비스의 할인율·최대 할인액은 공식 출시 안내와 일치한다. 다만 2015년 출시 안내만으로 모든 현재 건별 최소 결제조건을 확정하지 않고, 현행 상품설명서 확보 전까지 전체 검수 완료로 보지 않는다.
- 공식 근거: [KB국민 나라사랑카드 출시 안내](https://otalk.kbstar.com/quics?QSL=F&articleId=8720&bbsMode=view&page=C019391), [KB국민카드 상품설명서 개정 안내](https://card.kbcard.com/CMN/DVIEW/HSEMCXCRSCTC0001?ARTICLE_SERIAL=11440&ROUTE_TYPE=VIEW)

### `shinhan_heyoung`

- 현재 11개 국내 규칙과 통합한도 표는 공식 페이지와 일치한다.
- 공식 혜택인 해외 전 가맹점 1.2% 캐시백과 해외 ATM 인출 건당 US $3 캐시백이 현재 규칙에 없다.
- 공식 근거: [신한카드 Hey Young 체크 상품 페이지](https://www.shinhancard.com/pconts/html/card/apply/check/1233237_2206.html)

### `shinhan_nara`

- `sh_nara_px`: 3만원 이하 결제에는 일 1회·최대 1천원 조건이 있지만 3만원 이상 결제에는 이 건별 한도가 없다. 현재 `max_discount: 1000`은 두 구간 모두에 적용되어 큰 결제를 과소 계산한다.
- `sh_nara_wide_transport`: 공식 대상은 고속버스와 KTX·ITX·새마을·무궁화이며 시외버스와 SRT는 제외된다. 현재 브랜드 `intercity_bus`는 고속/시외버스를 합치고 `rail`은 SRT를 포함해 과대 적용될 수 있다.
- 나머지 16개 핵심 규칙과 Life 통합한도 구간은 공식 페이지와 일치한다.
- 공식 근거: [신한카드 나라사랑카드 체크 상품 페이지](https://www.shinhancard.com/pconts/html/card/apply/check/2013660_2206.html)

### `hana_nara`

- `hana_nara_px`: 공식 기준은 3만원 미만 30%(일 5천원·월 1만원), 3만원 이상 20%(일 2만원·월 10만원)다. 현재 규칙은 10만원을 경계로 삼고 30% 구간 월 한도를 5천원으로 계산해 기준과 한도가 모두 다르다.
- 군 급여이체 조건의 CGV 팝콘 스몰세트 무료 혜택(월 1회·연 6회)이 현재 규칙에 없다.
- Basic 서비스 통합한도와 나머지 쇼핑·교통·외식 규칙의 핵심 수치는 공식 페이지와 일치한다.
- 공식 근거: [하나 나라사랑카드 상품 페이지](https://www.hanacard.co.kr/OPI41000000D.web?CARD_CDOE=15475&CD_PD_SEQ=18813&title=STEP0)

### `hana_travelog_student`

- 국내 0.3% 적립과 해외 국제브랜드 수수료 1% 면제는 일반 트래블로그 공식 페이지와 일치한다.
- 해외 가맹점 수수료 면제에는 1%뿐 아니라 건당 US $0.5가 포함되고 해외 ATM에는 건당 US $3와 1% 면제가 있다. 현재 퍼센트 action 하나로는 고정 수수료와 ATM 혜택을 계산하지 못한다.
- 공식 이벤트는 대학교 학생증·ISIC 학생증 트래블로그를 트래블로그 체크 대상에 포함하지만, 상시 혜택의 완전한 상속 여부는 학생증 상품설명서로 다시 확인한다.
- 공식 근거: [트래블로그 체크카드 상품 페이지](https://www.hanacard.co.kr/OPI41000000D.web?CD_PD_SEQ=15414&mID=PI41015414P&schID=pcd), [학생증 트래블로그 대상 공식 안내](https://m.hanacard.co.kr/MKEVT1010M.web?EVN_SEQ=60371)

## 현재 규칙과 일치한 주요 범위

- `shinhan_sol`: 자동 수집한 13개 규칙, source bundle, revision, rollback 계약으로 관리한다.
- `kb_nori2_student`: 커피·모바일·문화·뷰티·편의점·구독·배달·이동통신·영화·놀이공원의 10개 공통 규칙과 통합한도는 노리2 공식 페이지와 일치한다. [노리2 체크카드 공식 페이지](https://card.kbcard.com/CRD/DVIEW/HCAMCXPRICAC0076?cooperationcode=07964&mainCC=a), [학생증 상품 포함 약관 개정 안내](https://card.kbcard.com/CMN/DVIEW/HSEMCXCRSCTC0001?ARTICLE_SERIAL=12208&ROUTE_TYPE=VIEW)
- `shinhan_deep_dream`, `shinhan_heyoung`, `shinhan_nara`, `hana_nara`는 위에 적은 차이 외의 현재 핵심 할인율·실적 구간·통합한도를 공식 상품 페이지에서 대조했다.

## 구현 우선순위

1. `hana_nara`: 공식 원문이 완전하고 계산 오류가 가장 명확하다. 다음 source adapter로 추가해 PX를 금액구간 규칙으로 분리한다.
2. `shinhan_nara`: PX 구간 분리와 고속버스/철도 브랜드 세분화가 필요하다.
3. `shinhan_deep_dream`: 당월 영역별 누적 이용금액을 계산 입력에 추가한 뒤 1.0% 최다영역 적립을 구현한다.
4. `shinhan_heyoung`: 기존 11개 규칙에 해외 가맹점·ATM 규칙을 추가한다.
5. `kb_nori2_student`, `kb_nara`, `hana_travelog_student`: 정확한 변형 상품 설명서 URL을 확보한 뒤 revision 후보를 만든다.

승인 전에는 기존 게시 규칙을 직접 덮어쓰지 않는다. 각 카드 adapter가 `FULL` 후보, 필드별 공식 근거, diff와 coverage 감사를 통과한 뒤에만 현재 규칙을 교체한다.
