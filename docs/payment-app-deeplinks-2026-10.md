# 결제·멤버십 앱 딥링크 조사 보고서

- 조사일: 2026-10-28
- 기기: Galaxy Z Fold7 (SM-F966N), Android 17, 사용자 0
- 방법: `dumpsys package`의 intent filter 추출(폰 안에서 필터링) → base APK에서 `scheme://` 문자열 검색(디컴파일 없음) → 승인받은 주소만 `am start`로 하나씩 실행 → ResumedActivity 확인, 화면은 사용자가 직접 확인
- 개인정보: 화면 캡처·덤프 안 함, 입력 안 함, 카드사·잔액 등 기록 안 함. query 값은 APK에 고정된 상수만 표기하고, 토큰일 수 있는 값은 `***`로 가림
- 임시 파일: 폰 `/data/local/tmp` 스크립트와 PC에 받은 APK 모두 삭제함

---

## 1. 카카오페이 (카카오톡 경유 + 카카오페이 앱)

### 패키지
| 앱 | 패키지 | versionName |
|---|---|---|
| 카카오톡 | `com.kakao.talk` | 26.9.1 |
| 카카오페이 | `com.kakaopay.app` | 26.9.0 |

### 등록된 scheme / host / path (BROWSABLE만, 결제 관련)
- 카카오페이 앱 `com.kakaopay.app/.scheme.PayCustomSchemeActivity`
  - `kakaopay://` (host 제한 없음)
  - `https://link.kakaopay.com` path prefix `/_/`, `/p`, `/u`
  - `https://pay-home.kakao.com` path prefix `/pay/scheme`
  - Airbridge 도메인 `kakaopay.abr.ge`, `kakaopay.airbridge.io` 등
- 카카오톡 `com.kakao.talk/.kakaopay.PayEntryActivity`
  - `kakaotalk://kakaopay` (모든 path)
  - `https://pay-home.kakao.com`, `https://link.kakaopay.com` path prefix `/talk/scheme`, `/t`
  - 참고: `kakaotalk://kakaopay/offline/dqr`는 BROWSABLE이 아님 → 웹에서 못 엶

### 시험 결과
| # | 주소 | ResumedActivity | 사용자가 본 화면 | 인증 |
|---|---|---|---|---|
| 1 | `kakaotalk://kakaopay/home` | `com.kakao.talk/.kakaopay.home.ui.PayHomeActivity` | 카카오페이 홈 | 없음 |
| 2 | `kakaotalk://kakaopay/offline` | `com.kakao.talk/.kakaopay.home.ui.PayHomeActivity` | 페이머니 현장결제 바코드 | 없음 |
| 3 | `kakaotalk://kakaopay/payment/offline` | `com.kakao.talk/.kakaopay.home.ui.PayHomeActivity` | 페이머니 현장결제 바코드 | 없음 |
| 4 | `kakaotalk://kakaopay/payment/internal/domestic/barcode` | `com.kakao.talk/com.kakaopay.android.payment.bridge.PayPaymentBridgeBottomSheetActivity` | 페이머니 현장결제 바코드 | 없음 |
| A6 | `kakaotalk://kakaopay/offline?screen=spay` | `com.kakao.talk/.kakaopay.home.ui.PayHomeActivity` | 페이머니로 삼성페이 활성화 | 없음 |
| A7 | `kakaotalk://kakaopay/membership` | `com.kakao.talk/.kakaopay.KakaoPayActivity` | "잘못된 링크" 팝업 | - |
| 5 | `kakaopay://home` | `com.kakaopay.app/.main.PayMainActivity` | 카카오페이 홈 | 없음 |
| 6 | `kakaopay://payment/offline` | `com.kakaopay.app/.main.PayMainActivity` | 등록 카드 현장결제 바코드 | 없음 |
| 7 | `kakaopay://payment/spay` | `com.kakaopay.app/.main.PayMainActivity` | 등록 카드로 삼성페이 활성화 (바코드 아님) | 없음 |
| A8 | `kakaopay://payment/offline?base=payment&method_type=card` | `com.kakaopay.app/.main.PayMainActivity` | 결제 탭 홈 (결제수단 활성화 안 됨) | 없음 |
| A9 | `kakaopay://payment/offline?base=payment&method_type=membership` | `com.kakaopay.app/.main.PayMainActivity` | 멤버십 바코드 화면으로 이동. 등록된 멤버십이 없어 등록 화면 표시 | 없음 |

### 바코드 직행 / 카드 지정
- **바코드 직행: 가능**
  - 카카오톡 경유(2–4번): 기본 결제수단이 **페이머니**
  - 카카오페이 앱(6번): 기본 결제수단이 **등록 카드**
- **삼성페이 직행: 가능**
  - `kakaopay://payment/spay` → 등록 카드
  - `kakaotalk://kakaopay/offline?screen=spay` → 페이머니
- **멤버십 직행: 가능할 것으로 보임** (A9. 등록된 멤버십이 없어 바코드 표시는 확인 못 함)
- **카드 지정: 파라미터는 있지만 웹앱에서 쓸 수 없음**
  - APK 안에 `kakaopay://payment/offline?base=payment&method_type=card&kard_key=***` 문자열이 있음
  - `kard_key`는 사용자별 카드 식별값으로 보이며, 앱 밖에서 이 값을 얻는 방법은 찾지 못함
  - 규칙에 따라 값을 추측해서 시험하지 않음
  - `kard_key` 없이 `method_type=card`만 주면 바코드가 아니라 결제 탭 홈이 열림(A8) → 쓰지 말 것
  - intent extra로 카드를 고르는 키는 확인하지 못함 (디컴파일 없이는 확인 불가)

### 권장 intent:// 문자열
```
# 카드 바코드 (카카오페이 앱)
intent://payment/offline#Intent;scheme=kakaopay;package=com.kakaopay.app;S.browser_fallback_url=https%3A%2F%2Fplay.google.com%2Fstore%2Fapps%2Fdetails%3Fid%3Dcom.kakaopay.app;end

# 카드 삼성페이 (카카오페이 앱)
intent://payment/spay#Intent;scheme=kakaopay;package=com.kakaopay.app;S.browser_fallback_url=https%3A%2F%2Fplay.google.com%2Fstore%2Fapps%2Fdetails%3Fid%3Dcom.kakaopay.app;end

# 멤버십 바코드 (카카오페이 앱)
intent://payment/offline?base=payment&method_type=membership#Intent;scheme=kakaopay;package=com.kakaopay.app;S.browser_fallback_url=https%3A%2F%2Fplay.google.com%2Fstore%2Fapps%2Fdetails%3Fid%3Dcom.kakaopay.app;end

# 카카오페이 앱 홈
intent://home#Intent;scheme=kakaopay;package=com.kakaopay.app;S.browser_fallback_url=https%3A%2F%2Fplay.google.com%2Fstore%2Fapps%2Fdetails%3Fid%3Dcom.kakaopay.app;end

# 페이머니 바코드 (카카오톡 경유)
intent://kakaopay/offline#Intent;scheme=kakaotalk;package=com.kakao.talk;S.browser_fallback_url=https%3A%2F%2Fplay.google.com%2Fstore%2Fapps%2Fdetails%3Fid%3Dcom.kakao.talk;end

# 페이머니 삼성페이 (카카오톡 경유)
intent://kakaopay/offline?screen=spay#Intent;scheme=kakaotalk;package=com.kakao.talk;S.browser_fallback_url=https%3A%2F%2Fplay.google.com%2Fstore%2Fapps%2Fdetails%3Fid%3Dcom.kakao.talk;end

# 카카오페이 홈 (카카오톡 경유)
intent://kakaopay/home#Intent;scheme=kakaotalk;package=com.kakao.talk;S.browser_fallback_url=https%3A%2F%2Fplay.google.com%2Fstore%2Fapps%2Fdetails%3Fid%3Dcom.kakao.talk;end
```

### 불확실한 점
- 2번과 3번은 activity가 1번과 같음(`PayHomeActivity`). 같은 activity 안에서 화면만 바뀌는 구조로 보임
- A7(`membership`)이 실패한 이유는 확인 못 함. APK의 원래 문자열에 붙어 있던 추적 파라미터(`t_src`/`t_ch`/`t_obj`)가 필요한 것일 수 있지만, 값을 추측하지 않아 시험하지 않음
- 기본 결제수단(페이머니 / 등록 카드)은 계정 설정에 따라 달라질 수 있음
- https 앱링크(`link.kakaopay.com/...`, `pay-home.kakao.com/pay/scheme...`)는 path와 파라미터 형식을 몰라 시험하지 않음

---

## 2. 네이버페이

### 패키지
| 앱 | 패키지 | versionName |
|---|---|---|
| 네이버페이 | `com.naverfin.payapp` | 3.10.0 (Play 스토어에 업데이트 없음) |
| 네이버 | `com.nhn.android.search` | 12.24.5 (참고만, 시험 안 함) |

### 등록된 scheme / host / path (BROWSABLE, `com.naverfin.payapp/.SchemeActivity`)
- `naverpayapp://` host: `showservicemenu`, `inappbrowser`, `qrpay`, `mydataauth`, `payments`
- `https://applink.pay.naver.com`, `https://npay.onelink.me`
- (test-app / beta2-app 도메인은 내부 테스트용)

### APK의 `showservicemenu` 고정 상수
- `menuName`: `payment`, `remit`, `order`, `transport`, `notiList`, `appSettings`
- `menuName=payment`일 때 `subMenuName`: `pay`, `qr`, `mst`, `membership`, `coupon`, `nearbyMerchant`
- `action`: `activateSpay`, `updateSpay`, `showAddingCard`, `showManagingCard`, `showPaymentDetail`, `showPointDetails`
- `payType`: `npay`, `defaultPay`
- `modelId=***`: 사용자별 값으로 보임

### 시험 결과
| # | 주소 | ResumedActivity | 사용자가 본 화면 | 인증 |
|---|---|---|---|---|
| 8 | `naverpayapp://` | `com.naverfin.payapp/.MainActivity` | 앱 열림 + **"앱 업데이트 필요" 팝업** (재시도해도 뜸). 최근 사용 카드로 삼성페이 활성화 | 없음 |
| A1 | `naverpayapp://showservicemenu?menuName=payment&subMenuName=pay` | `com.naverfin.payapp/.MainActivity` | 팝업 없음, 마지막 사용 카드로 삼성페이 활성화 | 없음 |
| A2 | `naverpayapp://showservicemenu?menuName=payment&subMenuName=qr` | `com.naverfin.payapp/.MainActivity` | 마지막 사용 카드의 현장결제 QR | 없음 |
| A3 | `naverpayapp://showservicemenu?menuName=payment&subMenuName=mst` | `com.naverfin.payapp/.MainActivity` | 마지막 사용 카드로 삼성페이 활성화. 재시험에서 **실제 활성화 확인 (활성화 햅틱 옴)** | 없음 |
| A4 | `...subMenuName=mst&action=activateSpay` | `com.naverfin.payapp/.MainActivity` | A3과 같음 | 없음 |
| A5 | `naverpayapp://showservicemenu?menuName=payment&subMenuName=membership` | `com.naverfin.payapp/.MainActivity` | 네이버페이에 등록한 멤버십 화면 | 없음 |

### 바코드 직행 / 카드 지정
- **QR 직행: 가능** (A2). 네이버페이 현장결제는 바코드가 아니라 QR 화면이 열림
- **삼성페이 직행: 가능** (A3. 실제 활성화 확인)
- **멤버십 직행: 가능** (A5)
- **카드 지정: 웹앱에서는 불가**
  - `payType`(`npay` / `defaultPay`)은 결제 방식 구분 값으로 보이며, 특정 카드를 고르는 값은 아님
  - APK 문자열에 `modelId=***`가 있지만 사용자별 값으로 보여 얻을 방법이 없음. 시험하지 않음
  - 결제수단은 앱에 마지막으로 쓴 카드가 자동으로 선택됨

### 권장 intent:// 문자열
```
# 현장결제 QR
intent://showservicemenu?menuName=payment&subMenuName=qr#Intent;scheme=naverpayapp;package=com.naverfin.payapp;S.browser_fallback_url=https%3A%2F%2Fplay.google.com%2Fstore%2Fapps%2Fdetails%3Fid%3Dcom.naverfin.payapp;end

# 삼성페이
intent://showservicemenu?menuName=payment&subMenuName=mst#Intent;scheme=naverpayapp;package=com.naverfin.payapp;S.browser_fallback_url=https%3A%2F%2Fplay.google.com%2Fstore%2Fapps%2Fdetails%3Fid%3Dcom.naverfin.payapp;end

# 멤버십
intent://showservicemenu?menuName=payment&subMenuName=membership#Intent;scheme=naverpayapp;package=com.naverfin.payapp;S.browser_fallback_url=https%3A%2F%2Fplay.google.com%2Fstore%2Fapps%2Fdetails%3Fid%3Dcom.naverfin.payapp;end
```
- `naverpayapp://`(host 없음)은 업데이트 팝업이 떠서 **권장하지 않음**
- HTML `href`에 넣을 때는 `&`를 `&amp;`로 써도 됨 (브라우저가 해석함)

### 불확실한 점
- 8번의 업데이트 팝업은 host가 없는 주소를 앱이 "모르는 기능"으로 처리해서 뜨는 것으로 추정함 (확인 안 됨)
- A1(`pay`)은 이 계정에서는 삼성페이 화면이 열렸음. 이게 `pay`의 고정 동작인지, 마지막으로 쓴 결제 방식을 따라가는 것인지는 구분하지 못함
- "앱 홈만 여는" 주소는 시험하지 않음 (`menuName=remit`, `order` 등은 미시험)
- 네이버 앱(`naversearchapp://payments`, `mininpay`)은 APK에 완성된 주소 문자열이 없어 시험하지 않음

---

## 3. T멤버십

### 패키지
| 앱 | 패키지 | versionName |
|---|---|---|
| T멤버십 | `com.tms` | 20.6.3 (사용자가 앱을 연 뒤 ResumedActivity로 확인) |

### 등록된 scheme / host / path (BROWSABLE)
- `com.tms/.activity.MPOnePassActivity`: scheme `mponepass`, `pocOnePass`, `poconepass` / host 없음 또는 `goOnePassMenu`
- `com.tms/.activity.MPOneLinkActivity`: `https://sktmembership.onelink.me` path prefix `/T18s`
- APK 문자열: `mponepass://native/{barcode, subscriptionbarcode, main, login, joinmembership, myarea, movemaintab?tabIndex=***, ...}`, `mponepass://openurl?url=***`

### 시험 결과
| # | 주소 | LaunchState | ResumedActivity | 사용자가 본 화면 | 인증 |
|---|---|---|---|---|---|
| 9 (1차) | `mponepass://` | - | `com.tms/.activity.home.MPHomeActivity` | 결제 바코드. 단, 앱에서 바코드를 미리 켜 둔 상태였을 수 있음 | 없음 |
| 9 (2차) | `mponepass://` | COLD | `com.tms/.activity.home.MPHomeActivity` | 홈 + 혜택 팝업 2개. 바코드 없음 | 없음 |
| A10 | `mponepass://goOnePassMenu` | WARM | `com.tms/.activity.home.MPHomeActivity` | 메인 화면, 바코드 없음 | 없음 |
| A11 (1차) | `mponepass://native/barcode` | WARM | `com.tms/.activity.barcode.full.MPFullBarcodeActivity` | 큰 바코드 화면 | 없음 |
| A11 (2차) | `mponepass://native/barcode` | **COLD** | `com.tms/.activity.barcode.full.MPFullBarcodeActivity` | **팝업 없이 바로 바코드**. 바코드를 끄면 홈으로 가면서 혜택 팝업이 뜸 | 없음 |
| A12 | `mponepass://native/subscriptionbarcode` | WARM | `com.tms/.activity.home.MPHomeActivity` | 홈 + 팝업 2개 | 없음 |

### 바코드 직행 / 카드 지정
- **멤버십 바코드 직행: 가능** (`mponepass://native/barcode`. 앱이 꺼진 상태에서도 확인)
- **카드 지정: 없음.** T멤버십은 결제 카드 개념이 없는 멤버십 바코드이며, 결제수단을 고르는 파라미터나 extra를 찾지 못함

### 권장 intent:// 문자열
```
# 멤버십 바코드
intent://native/barcode#Intent;scheme=mponepass;package=com.tms;S.browser_fallback_url=https%3A%2F%2Fplay.google.com%2Fstore%2Fapps%2Fdetails%3Fid%3Dcom.tms;end

# 앱 홈
intent://goOnePassMenu#Intent;scheme=mponepass;package=com.tms;S.browser_fallback_url=https%3A%2F%2Fplay.google.com%2Fstore%2Fapps%2Fdetails%3Fid%3Dcom.tms;end
```

### 불확실한 점
- **A12 `subscriptionbarcode`는 T우주 구독 바코드일 수 있음.** 이건 사용자가 주소 이름만 보고 한 **추측**이며 확인되지 않음. 이 계정에는 구독 상품이 없어서, 그 때문에 바코드 없이 홈으로 간 것일 수 있음
- 9번 1차에서 바코드가 보인 것은 앱 상태(미리 켜 둔 바코드) 때문으로 보임. `mponepass://`는 홈 열기용으로만 쓸 것

---

## 4. 앱이 없을 때 동작 (모든 앱 공통)
- 위의 `intent://` 문자열은 모두 `package=`와 `S.browser_fallback_url=`(Play 스토어 상세 페이지, URL 인코딩)을 포함함
- 앱이 없으면 Chrome이 fallback URL로 이동함. fallback을 빼도 `package=`가 있으면 Chrome은 보통 Play 스토어로 이동함
- 실제로 앱을 지우거나 설치하는 시험은 하지 않음 (규칙)

---

## 5. 규칙 때문에 확인하지 못한 것
| 한계 | 원인이 된 규칙 | 영향 |
|---|---|---|
| `intent://` 문자열 자체를 Chrome에서 실행해 보지 못함. 시험은 `am start`로 원래 scheme URL만 실행함 | 탭·입력 금지 (Chrome에서 링크를 누를 수 없음) | 문법은 표준대로 만들었지만, 웹에서 실제로 동작하는지는 웹앱에서 한 번 확인 필요. Chrome은 사용자 동작(클릭)으로만 intent를 실행함 |
| 화면 내용을 직접 확인하지 못함 | 화면 캡처·덤프 금지 | 화면 설명은 모두 사용자의 답을 그대로 적음 |
| 카드 지정 값(`kard_key`, `modelId`)을 시험하지 못함 | 추측 값 시험 금지, 계정·결제 데이터 조회 금지 | 카드 지정 가능 여부는 "파라미터는 있으나 값을 얻을 방법 없음"으로 결론 |
| intent extra 확인 불가 | 디컴파일 금지 | 앱 코드가 읽는 extra 키는 확인하지 못함. dex에서 완성된 URL 문자열만 찾았기 때문에, 코드에서 조립하는 주소는 놓쳤을 수 있음 |
| 앱이 없을 때의 fallback 동작 | 설치·삭제 시험 금지 | 표준 Chrome 동작에 기대고 있음 |
| `am force-stop` 미사용 | 허용 명령 범위 | 앱 종료는 사용자가 직접 함 (A11 2차, 9번 2차) |

## 6. 그 밖의 참고
- 화면 결과는 한 기기·한 계정 기준임. 기본 결제수단, 마지막 사용 카드, 멤버십·구독 등록 여부에 따라 달라질 수 있음
- 시험한 모든 주소에서 인증 요구는 없었음. 단, 실제 결제 승인 단계(지문·PIN)는 진행하지 않음
