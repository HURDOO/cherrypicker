# 카드 혜택 원문 수집·구조화 정책

## 첫 지원 범위

Phase 7의 첫 수직 흐름은 시스템 카드 `shinhan_sol`(신한 SOL트래블 체크카드) 한 장만 지원한다. 공식 상품 상세 페이지를 HTML source adapter로 수집하고, 검증·검수·revision 게시·rollback이 안정화된 뒤 같은 카드사의 다른 상품과 상품설명서 PDF로 범위를 넓힌다.

- 공식 출처: `https://www.shinhancard.com/pconts/html/card/apply/check/1225714_2206.html`
- 출처 종류: 공개 상품 상세 페이지
- 수집 제한: 로그인, 앱 세션, CAPTCHA 또는 접근 제한 우회 금지
- 전송 데이터: 공개된 카드 상품 원문만 사용하며 사용자·결제·계정 데이터는 AI API로 보내지 않는다.

## 원문 보존

`card_benefit_documents`는 응답 원문, 사람이 읽을 수 있게 정리한 텍스트, URL, media type, SHA-256 content hash, 응답 ETag/Last-Modified, 수집 시각과 출처별 단조 증가 version을 보존한다. 같은 URL과 hash는 새 문서 version을 만들지 않는다. 공개 카탈로그 API에는 원문과 내부 후보를 포함하지 않는다.

원문은 현재 SQLite에 저장한다. 단일 공개 HTML 문서는 2 MiB로 제한한다. PDF adapter와 별도 object storage는 첫 HTML 수직 흐름의 운영 크기와 백업 영향을 확인한 뒤 결정한다.

## 구조화와 검증

`GEMINI_API_KEY`가 있으면 `CARD_BENEFIT_AI_MODEL`의 구조화 출력으로 전체 카드 혜택 후보를 생성한다. Gemini 전송 schema는 `confidence`와 JSON 문자열인 `extractionJson`만 고정하고, 문자열 내부의 중첩 `CardBenefitExtraction`은 애플리케이션 validator가 엄격하게 검증한다. 이는 복잡한 중첩 `BenefitRule[]` schema를 Gemini API가 `INVALID_ARGUMENT`로 거부하는 문제를 피하면서 동일한 내부 계약을 유지하기 위한 경계다. 키가 없거나 호출·파싱이 실패하면 대표 카드 전용 보수적 규칙 추출기를 사용한다.

- 카드 ID 고정 및 전체 교체 후보(`completeness: FULL`)
- 규칙 ID 중복, 숫자 범위, 할인율, 실적·건별·일·월·연 한도 검증
- 존재하는 카테고리와 브랜드만 참조
- 각 규칙의 혜택, 계산값, 적용 조건, 한도를 공식 원문 인용과 연결
- 인용 문장이 저장한 원문에 실제로 포함되는지 검증
- 대표 카드의 공식 상시 혜택과 현재 프로모션 13개가 모두 존재하는지 검증
- 대표 카드별 canonical 계산 조건·한도·적용 채널과 정확히 일치하는지 검증
- 기간형 규칙의 `startsAt`·`endsAt` 형식과 순서 검증

검증 오류가 있는 후보는 저장하되 게시를 차단한다. 관리자 화면 `/admin/card-benefits`에서 원문, 구조화 규칙, 필드별 근거와 오류를 함께 검수한다.
공식 상품 페이지에 포함된 해외 가맹점 프로모션 종료일은 `endsAt`으로 저장하고 계산 시 한국 날짜 기준으로 만료를 차단한다. 별도 기간형 공지 adapter를 추가할 때 문서 공시일과 공지 효력 기간의 교차 검증을 추가한다.

## 게시와 rollback

승인 전에는 라이브 `cards`와 `benefit_rules`를 변경하지 않는다. 최초 승인 시 기존 시스템 카드와 규칙을 기준 revision으로 먼저 저장하고, 승인 후보를 다음 revision으로 게시한다. 이후 seed 실행은 활성 revision이 있는 카드를 덮어쓰지 않는다.

Rollback은 과거 revision을 활성 상태로 직접 되돌리는 대신, 해당 snapshot을 내용으로 하는 새 revision을 만든다. 따라서 revision 번호는 항상 증가하고 어떤 과거 상태로 되돌렸는지 `rollback_of_revision`으로 추적할 수 있다. 사용자 커스텀 규칙은 게시와 rollback 대상에서 제외한다.
