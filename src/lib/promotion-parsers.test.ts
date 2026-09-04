import { describe, expect, it } from 'vitest';
import {
    parseLguplusBenefits,
    parseNaverPayPromotions,
    parseParisMembershipHtml,
    parseSktMembershipHtml,
    parseTousLesJoursHtml,
} from './promotion-parsers';
import {
    applyPromotionSemanticAnalysis,
    classifyPromotionWithRules,
} from './promotion-semantic-classifier';

describe('promotion source parsers', () => {
    it('splits an SKT brand into tier-specific structured discounts', () => {
        const html = `
            <a class="benefit-box" data-id="146">
                <span class="brand">CU</span>
                <div class="bnf-info">
                    <dl>
                        <dt>할인형</dt>
                        <dd>
                            <div class="info">
                                <span><i class="badge-circle vip"></i><i class="badge-circle gold"></i></span>
                                1천 원당 100원 할인
                            </div>
                            <div class="info">
                                <span><i class="badge-circle silver"></i></span>
                                1천 원당 50원 할인
                            </div>
                        </dd>
                    </dl>
                    <dl><dt>적립형</dt><dd><div class="info">1천 원당 100P 적립</div></dd></dl>
                </div>
            </a>
        `;

        const offers = parseSktMembershipHtml(html, 'https://example.com/skt');

        expect(offers).toHaveLength(2);
        expect(offers.map(item => item.offer.action.value)).toEqual([10, 5]);
        expect(offers[0].offer.brandIds).toEqual(['cu']);
        expect(offers[0].offer.condition.telecomTiers).toEqual(['VIP', 'GOLD']);
        expect(offers.every(item => item.autoPublish)).toBe(true);
    });

    it('parses SKT daily benefit caps and maximum monthly uses without review', () => {
        const html = `
            <a class="benefit-box">
                <span class="brand">아웃백 스테이크하우스</span>
                <dl>
                    <dt>할인형</dt>
                    <dd>
                        <div class="info">
                            <i class="badge-circle vip"></i><i class="badge-circle gold"></i>
                            15% 할인 (1일 1회, 일 최대 20,000원 / 월 최대 4회 이용 가능)
                        </div>
                        <div class="info">
                            <i class="badge-circle silver"></i>
                            5% 할인 (1일 1회, 일 최대 10,000원 / 월 최대 4회 이용 가능)
                        </div>
                    </dd>
                </dl>
            </a>
        `;

        const offers = parseSktMembershipHtml(html, 'https://example.com/skt');

        expect(offers).toHaveLength(2);
        expect(offers.map(item => item.offer.action.maxBenefit)).toEqual([20_000, 10_000]);
        expect(offers.map(item => item.offer.limitConfig)).toEqual([
            { dailyCount: 1, monthlyCount: 4 },
            { dailyCount: 1, monthlyCount: 4 },
        ]);
        expect(offers.every(item => item.autoPublish)).toBe(true);
    });

    it('parses the Paris Baguette KT membership limits', () => {
        const html = `
            <h1>KT 멤버십</h1>
            <h2>VVIP / VIP / GOLD</h2><h3>1,000원당 100원 할인</h3>
            <h2>SILVER / WHITE 일반</h2><h3>1,000원당 50원 할인</h3>
            <p>1일1회 제한, 이용금액 최대 20만원</p>
        `;

        const offers = parseParisMembershipHtml(html, 'kt', 'https://example.com/paris-kt');

        expect(offers).toHaveLength(2);
        expect(offers[0].offer.action).toMatchObject({
            type: 'PERCENT',
            value: 10,
            maxBenefit: 20_000,
        });
        expect(offers[1].offer.condition.telecomTiers).toEqual(['SILVER', 'WHITE', '일반']);
    });

    it('parses all telecom providers from the Tous Les Jours page', () => {
        const html = `
            <span class="card_name">T 멤버십</span>
            <span class="card_txt">(할인형) VIP/골드 1,000원당 150원 할인<br />실버 1,000원당 50원</span>
            <div class="card_info2">- 1일 1회 사용 가능</div>
            <span class="card_name">KT멤버십</span>
            <span class="card_txt">VIP/골드: 구매금액 1,000원당 150원 할인<br />실버/화이트/일반: 구매금액 1,000원당 100원 할인</span>
            <div class="card_info">- 1일 1회 사용가능</div>
            <span class="card_name">LG U+ 멤버십</span>
            <span class="card_txt">VVIP 1,000원당 150원 할인<br />VIP 1,000원당 100원 할인<br />우수 1,000원당 50원 할인</span>
            <div class="card_info2">- 1일 1회 사용가능</div>
            <!--
                <span class="card_name">KT멤버십</span>
                <span class="card_txt">구매금액 1,000원당 300원 할인</span>
                <div class="card_info">2018년 종료 혜택</div>
            -->
        `;

        const offers = parseTousLesJoursHtml(html, 'https://example.com/tlj');

        expect(offers).toHaveLength(7);
        expect(new Set(offers.map(item => item.offer.providerId)))
            .toEqual(new Set(['skt', 'kt', 'lguplus']));
        expect(offers.every(item => item.offer.brandIds[0] === 'tous_les_jours')).toBe(true);
        expect(offers.every(item => !item.offer.description.includes('2018'))).toBe(true);
        expect(offers.every(item => item.offer.title.length < 80)).toBe(true);
    });

    it('parses deterministic U+ API rows and keeps maximum values informational', () => {
        const offers = parseLguplusBenefits([{
            urcMbspJncoNo: 265,
            urcMbspJncoNm: 'GS25',
            jncoBnftThumCntn: 'VVIP/VIP : 1천원당 100원 할인<BR/>우수 : 1천원당 50원 할인',
            jncoBnftDetlCntn: '일 1회',
            urcBnftTadvMthdCntn: '일부 행사상품 제외',
            jncoTadvGrdDetlDscr: 'VVIP/VIP/우수',
        }, {
            urcMbspJncoNo: 6,
            urcMbspJncoNm: 'CGV',
            jncoBnftThumCntn: '2D영화 최대 5천원 할인',
            jncoBnftDetlCntn: '월 1회',
            jncoTadvGrdDetlDscr: 'VVIP/VIP/우수',
        }], 'https://example.com/uplus');

        expect(offers).toHaveLength(3);
        expect(offers.slice(0, 2).every(item => item.autoPublish)).toBe(true);
        expect(offers[2].autoPublish).toBe(true);
        expect(offers[2].offer.action.valueSemantics).toBe('UP_TO');
    });

    it('parses combined Korean amount units without dropping the ten-thousands digit', () => {
        const offers = parseLguplusBenefits([{
            urcMbspJncoNo: 9100,
            urcMbspJncoNm: '착한의사',
            jncoBnftThumCntn: '건강검진 서비스 1만5천원 할인',
            jncoBnftDetlCntn: '월 1회',
            jncoTadvGrdDetlDscr: 'VVIP/VIP/우수',
        }], 'https://example.com/uplus');

        expect(offers[0].offer.action.value).toBe(15_000);
    });

    it('splits same-line U+ tier rates and parses an exact maximum benefit cap', () => {
        const offers = parseLguplusBenefits([{
            urcMbspJncoNo: 9002,
            urcMbspJncoNm: '매드포갈릭',
            jncoBnftThumCntn: 'VVIP/VIP : 15% 할인 우수 : 5% 할인',
            jncoBnftDetlCntn: '일 1회',
        }, {
            urcMbspJncoNo: 9003,
            urcMbspJncoNm: '브레댄코',
            jncoBnftThumCntn: '10% 할인(최대 2만원 할인)',
            jncoBnftDetlCntn: '일 1회',
            jncoTadvGrdDetlDscr: 'VVIP/VIP/우수',
        }], 'https://example.com/uplus');

        expect(offers).toHaveLength(3);
        expect(offers.slice(0, 2).map(item => item.offer.action.value)).toEqual([15, 5]);
        expect(offers.slice(0, 2).map(item => item.offer.condition.telecomTiers))
            .toEqual([['VVIP', 'VIP'], ['우수']]);
        expect(offers[2].offer.action).toMatchObject({
            type: 'PERCENT',
            value: 10,
            maxBenefit: 20_000,
        });
        expect(offers.every(item => item.autoPublish)).toBe(true);
    });

    it('keeps concrete official partners even when they are not in the seed list', () => {
        const offers = parseLguplusBenefits([{
            urcMbspJncoNo: 9001,
            urcMbspJncoNm: '매드포갈릭',
            urcMbspCatgNm: '외식',
            jncoBnftThumCntn: '20% 할인',
            jncoBnftDetlCntn: '일 1회',
            jncoTadvGrdDetlDscr: 'VVIP/VIP',
        }], 'https://example.com/uplus');

        expect(offers).toHaveLength(1);
        expect(offers[0].offer.brandIds[0]).toMatch(/^official_/);
        expect(offers[0].discoveredBrand).toMatchObject({
            name: '매드포갈릭',
            categoryId: 'food',
        });
    });

    it('splits deterministic U+ service variants into conditional product offers', () => {
        const offers = parseLguplusBenefits([{
            urcMbspJncoNm: '스피드메이트',
            jncoBnftThumCntn: '엔진오일 2만원 할인 외 정비 혜택 4종',
            jncoBnftDetlCntn: '3개월 1회',
            urcBnftTadvMthdCntn: [
                '①엔진오일 2만원 할인',
                '②에어컨필터 10% 할인',
                '③에어컨 가스 완충 10% 할인',
                '④부동액 10% 할인',
                '⑤공임 10% 할인',
            ].join('<br />'),
            jncoTadvGrdDetlDscr: 'VVIP/VIP/우수',
        }, {
            urcMbspJncoNm: '자란다',
            jncoBnftThumCntn: '돌봄, 배움 1회 방문 서비스 할인<br/>(신규회원 5천원, 기존회원 2천원 할인)',
            jncoBnftDetlCntn: '월 1회',
            jncoTadvGrdDetlDscr: 'VVIP/VIP/우수',
        }, {
            urcMbspJncoNm: '아이콘골프',
            jncoBnftThumCntn: '골프백 배송 편도 2천원 / 왕복 1천원 할인',
            jncoBnftDetlCntn: '월 1회',
            jncoTadvGrdDetlDscr: 'VVIP/VIP/우수',
        }], 'https://example.com/uplus');

        const speedmate = offers.filter(item => item.offer.title.startsWith('스피드메이트'));
        const jaranda = offers.filter(item => item.offer.title.startsWith('자란다'));
        const iconGolf = offers.filter(item => item.offer.title.startsWith('아이콘골프'));

        expect(speedmate).toHaveLength(5);
        expect(speedmate.map(item => item.offer.action.value)).toEqual([20_000, 10, 10, 10, 10]);
        expect(jaranda.map(item => item.offer.action.value)).toEqual([2_000, 5_000]);
        expect(iconGolf.map(item => item.offer.action.value)).toEqual([1_000, 2_000]);
        expect(offers.every(item => item.autoPublish)).toBe(true);
        expect(offers.every(item => item.semanticScopeLocked)).toBe(true);
        expect(offers.every(item => (
            item.offer.condition.applicabilityScope === 'PRODUCT_SET' &&
            item.offer.condition.calculationMode === 'CONDITIONAL' &&
            item.offer.condition.manualCheckRequired === false
        ))).toBe(true);
    });

    it('keeps each numbered U+ benefit threshold on its split offer', () => {
        const offers = parseLguplusBenefits([{
            urcMbspJncoNm: '베베쿡',
            jncoBnftThumCntn: '할인 혜택 3종, VIP이상 5천원 할인',
            jncoBnftDetlCntn: '월 1회',
            urcBnftTadvMthdCntn: [
                '①5천원 할인(5만원 이상 구매 시)',
                '②유아식품 5천원 할인(4만원 이상 구매 시)',
                '③이유식/영양식 첫 주문 20% 할인',
            ].join('<br />'),
            jncoTadvGrdDetlDscr: 'VIP',
        }], 'https://example.com/uplus');

        expect(offers.map(item => item.offer.condition.minSpend)).toEqual([
            50_000,
            40_000,
            undefined,
        ]);
        expect(offers.every(item => item.autoPublish)).toBe(true);
    });

    it('keeps a multi-tier U+ numbered benefit informational instead of overcalculating it', () => {
        const parsed = parseLguplusBenefits([{
            urcMbspJncoNm: 'QED',
            jncoBnftThumCntn: '판교 백야드 숏게임 이용권 VIP이상 30%, 우수 20% 할인',
            jncoBnftDetlCntn: '월 1회',
            urcBnftTadvMthdCntn: [
                '①판교 백야드 숏게임 이용권 VIP이상 30%, 우수 20% 할인',
                '②QED골프아카데미 판교 5호점 3만원 할인',
            ].join('<br />'),
            jncoTadvGrdDetlDscr: 'VVIP/VIP/우수',
        }], 'https://example.com/uplus')[0];
        const classified = applyPromotionSemanticAnalysis(
            parsed,
            classifyPromotionWithRules(parsed),
        );

        expect(classified.autoPublish).toBe(true);
        expect(classified.offer.action).toMatchObject({
            type: 'PERCENT',
            value: 30,
            valueSemantics: 'UP_TO',
        });
        expect(classified.offer.condition).toMatchObject({
            applicabilityScope: 'PRODUCT_SET',
            calculationMode: 'INFORMATION_ONLY',
            headlineEligible: false,
        });
        expect(classified.warnings.join(' ')).toContain('복수 요율');
    });

    it('parses exact Npay rewards and marks maximum benefits as informational', () => {
        const offers = parseNaverPayPromotions([{
            promotionSeq: 1,
            promotionName: '투썸플레이스',
            promotionDescription: '포인트·머니 1.5만원 이상 결제 시',
            exposeTitle: '3천원 적립',
            promotionStartDateTime: Date.parse('2026-08-01T00:00:00+09:00'),
            promotionEndDateTime: Date.parse('2026-08-31T23:59:59+09:00'),
            detailUrl: 'https://pay.naver.com/benefit/payment/detail/1',
        }, {
            promotionSeq: 2,
            promotionName: '맥도날드',
            promotionDescription: '포인트·머니 1만원 이상 결제 시',
            exposeTitle: '최대 8천원 적립',
            detailUrl: 'https://pay.naver.com/benefit/payment/detail/2',
        }], 'DOMESTIC_INSTORE', 'https://pay.naver.com/benefit/payment/list');

        expect(offers).toHaveLength(2);
        expect(offers[0].autoPublish).toBe(true);
        expect(offers[0].offer.layer).toBe('POST_REWARD');
        expect(offers[0].offer.action).toEqual({ type: 'FLAT', value: 3_000 });
        expect(offers[0].offer.condition.minSpend).toBe(15_000);
        expect(offers[0].offer.compatibility.allowedFundingTypes).toEqual(['MONEY', 'POINTS']);
        expect(offers[1].autoPublish).toBe(true);
        expect(offers[1].offer.action.valueSemantics).toBe('UP_TO');
    });

    it('adds concrete Npay merchants but ignores generic campaign names', () => {
        const offers = parseNaverPayPromotions([{
            promotionSeq: 10,
            promotionName: '이니스프리',
            exposeTitle: '10% 적립',
            acmRate: 10,
        }, {
            promotionSeq: 11,
            promotionName: '카드 이벤트',
            exposeTitle: '3천원 할인',
        }], 'DOMESTIC_INSTORE', 'https://pay.naver.com/benefit/payment/list');

        expect(offers).toHaveLength(1);
        expect(offers[0].discoveredBrand).toMatchObject({
            name: '이니스프리',
            categoryId: 'life',
        });
    });

    it('separates Npay funding inclusion, exclusion, and actual enrollment actions', () => {
        const offers = parseNaverPayPromotions([{
            promotionSeq: 12,
            promotionName: '갤러리아 식품관',
            promotionDescription: '포인트·머니 2만원 이상 결제 시\n기간 내 1회 참여 가능',
            exposeTitle: '3천원 적립',
            cautionText: '카드 결제 시 혜택 적용 불가',
        }, {
            promotionSeq: 13,
            promotionName: '대구이월드',
            promotionDescription: '포인트·머니·카드 QR 결제 시',
            exposeTitle: '50% 할인',
            acmRate: 50,
        }, {
            promotionSeq: 14,
            promotionName: 'GS칼텍스',
            promotionDescription: '에너지플러스 앱 연동하고 네이버페이 QR 포인트·머니 결제 시',
            exposeTitle: '리터당 100원 혜택',
            acmAmount: 100,
        }, {
            promotionSeq: 18,
            promotionName: 'GS25',
            promotionDescription: '와인/위스키 결제 시',
            exposeTitle: '10% 적립',
            acmRate: 10,
            cautionText: '카드 결제 시 혜택 적용 불가',
        }, {
            promotionSeq: 19,
            promotionName: 'KT',
            promotionDescription: '간편결제 납부는 머니/포인트로만 가능합니다.',
            exposeTitle: '2천원 적립',
            acmAmount: 2_000,
        }], 'DOMESTIC_INSTORE', 'https://pay.naver.com/benefit/payment/list');

        expect(offers[0].offer.compatibility.allowedFundingTypes).toEqual(['MONEY', 'POINTS']);
        expect(offers[0].offer.condition.requiresEnrollment).toBe(false);
        expect(offers[1].offer.compatibility.allowedFundingTypes)
            .toEqual(['MONEY', 'POINTS', 'CARD']);
        expect(offers[2].offer.condition.requiresEnrollment).toBe(true);
        expect(offers[3].offer.compatibility.allowedFundingTypes).toEqual(['MONEY', 'POINTS']);
        expect(offers[4].offer.compatibility.allowedFundingTypes).toEqual(['MONEY', 'POINTS']);
    });

    it('publishes exact Npay rates and informational maxima but reviews conflicting thresholds', () => {
        const offers = parseNaverPayPromotions([{
            promotionSeq: 15,
            promotionName: '네파',
            promotionDescription: '포인트·머니 1만원 이상 결제 시',
            exposeTitle: '10% 적립(최대 5만원)',
            acmRate: 10,
            limitAcmAmount: 50_000,
        }, {
            promotionSeq: 16,
            promotionName: '골프존마켓',
            promotionDescription: '30/50/100만원 이상 결제 시',
            exposeTitle: '최대 7만원 적립',
            acmAmount: 70_000,
        }, {
            promotionSeq: 17,
            promotionName: '오늘의집',
            promotionDescription: '9만원 이상 결제 시',
            exposeTitle: '1,500원 적립',
            acmAmount: 1_500,
            applyBasisAmount: 100_000,
        }], 'DOMESTIC_INSTORE', 'https://pay.naver.com/benefit/payment/list');

        expect(offers[0].autoPublish).toBe(true);
        expect(offers[0].offer.action.maxBenefit).toBe(50_000);
        expect(offers[1].autoPublish).toBe(true);
        expect(offers[1].offer.action.valueSemantics).toBe('UP_TO');
        expect(offers[2].autoPublish).toBe(false);
        expect(offers[2].warnings.join(' ')).toContain('기준금액');
    });

    it('parses comma amounts and routes lottery or cumulative rewards safely', () => {
        const offers = parseNaverPayPromotions([{
            promotionSeq: 20,
            promotionName: '오늘의집',
            promotionDescription: 'Npay로 10만원 이상 결제 시 추첨 1,200명',
            exposeTitle: '12,000원 적립',
        }, {
            promotionSeq: 21,
            promotionName: '코스트코X현대카드',
            promotionDescription: '누적 30만원 이상 결제 시',
            exposeTitle: '10,000원 캐시백',
        }], 'DOMESTIC_INSTORE', 'https://pay.naver.com/benefit/payment/list');

        expect(offers).toHaveLength(2);
        expect(offers.map(item => item.offer.action.value)).toEqual([12_000, 10_000]);
        expect(offers.every(item => item.autoPublish)).toBe(true);
        expect(offers[0].offer.condition.calculationMode).toBe('INFORMATION_ONLY');
        expect(offers[1].offer.condition).toMatchObject({
            calculationMode: 'CONDITIONAL',
            confirmationRequired: true,
        });
    });

    it('resolves corroborated Npay thresholds but preserves unsupported conflicts', () => {
        const resolved = parseNaverPayPromotions([{
            promotionSeq: 31,
            promotionName: '교보문고',
            promotionDescription: '4.5만원 이상 결제 시',
            exposeTitle: '2천원 적립',
            applyBasisAmount: 40_000,
            cautionText: '해당 이벤트는 4.5만원 이상 결제 시 포인트 2천원 적립 행사입니다.',
        }, {
            promotionSeq: 32,
            promotionName: '보리보리',
            promotionDescription: '9만원 이상 결제 시',
            exposeTitle: '3,500원 적립',
            applyBasisAmount: 100_000,
            linkUrl: 'https://m.boribori.co.kr/plan/367012',
        }, {
            promotionSeq: 33,
            promotionName: '삼성전자',
            promotionDescription: '갤럭시 북6 Basic 모델 구매 시',
            exposeTitle: '1.5만원 적립',
            applyBasisAmount: 100_000,
            cautionText: '최종 100만원 이상 결제 시 1.5만P 지급되며 대상 모델에만 적용됩니다.',
        }, {
            promotionSeq: 34,
            promotionName: '카시나',
            promotionDescription: '5만원 이상 결제 시',
            exposeTitle: '최대 5천원 적립',
            applyBasisAmount: 100_000,
            cautionText: 'Npay로 5만원/ 20만원 이상 결제 시 1천원/ 5천원 추가적립 행사입니다.',
        }], 'ONLINE', 'https://pay.naver.com/benefit/payment/list');
        const unresolved = parseNaverPayPromotions([{
            promotionSeq: 41,
            promotionName: 'W컨셉',
            promotionDescription: '12만원 이상 결제 시',
            exposeTitle: '3천원 즉시할인',
            applyBasisAmount: 100_000,
            linkUrl: 'https://display.wconcept.co.kr/',
        }, {
            promotionSeq: 42,
            promotionName: '식봄',
            promotionDescription: '5만원 이상 결제 시 (추첨 3천명)',
            exposeTitle: '5천원 적립',
            applyBasisAmount: 100_000,
            linkUrl: 'https://www.foodspring.co.kr/',
        }, {
            promotionSeq: 43,
            promotionName: '오늘의집',
            promotionDescription: '9만원 이상 결제 시',
            exposeTitle: '1,500원 적립',
            applyBasisAmount: 100_000,
            linkUrl: 'https://store.ohou.se/ranks?type=best',
        }, {
            promotionSeq: 44,
            promotionName: '예스24 티켓',
            promotionDescription: '9만원 이상 결제 시 (선착순 1만 5천명)',
            exposeTitle: '2천원 적립',
            applyBasisAmount: 50_000,
            cautionText: 'Npay로 9만원 이상 결제 시 2천원 적립. 1건의 결제가 7만원 이상이어야 합니다.',
            linkUrl: 'https://m.ticket.yes24.com/event/PromotionInfo.aspx?id=3986',
        }], 'ONLINE', 'https://pay.naver.com/benefit/payment/list');

        expect(resolved.every(item => item.autoPublish)).toBe(true);
        expect(resolved.map(item => item.offer.condition.minSpend)).toEqual([
            45_000,
            90_000,
            1_000_000,
            50_000,
        ]);
        expect(resolved[3].offer.condition.calculationMode).toBe('INFORMATION_ONLY');
        expect(unresolved).toHaveLength(4);
        expect(unresolved.every(item => !item.autoPublish)).toBe(true);
        expect(unresolved.every(item => item.offer.condition.manualCheckRequired)).toBe(true);
    });

    it('publishes composite Npay descriptions as information and keeps a first charge conditional', () => {
        const offers = parseNaverPayPromotions([{
            promotionSeq: 51,
            promotionName: '서울 맛동여지도',
            promotionDescription: 'N예약하고 커넥트로 결제하면',
            exposeTitle: '2천원 + 20% 추가적립',
            cautionText: '서울 맛동여지도 홍대.마포',
        }, {
            promotionSeq: 52,
            promotionName: '쁘렝땅 오스만',
            promotionDescription: '188유로 이상 결제 시',
            exposeTitle: '음료 제공 및 5%할인 & 12%택스리펀',
        }, {
            promotionSeq: 53,
            promotionName: '모바일티머니',
            promotionDescription: 'Npay 머니로 1만원 이상 첫 충전 시',
            exposeTitle: '1천원 충전쿠폰 100% 지급',
            applyBasisAmount: 100_000,
            linkUrl: 'https://mkt.naver.com/event/mo/npay-tmoney_2608',
            cautionText: '모바일티머니 1천원 충전쿠폰은 네이버페이로 첫 충전 다음날 지급됩니다.',
        }, {
            promotionSeq: 54,
            promotionName: '이니스프리',
            promotionDescription: '2만원 이상 결제 시',
            exposeTitle: '5천원 적립',
            cautionText: '기간 내 1회 적립 가능합니다.',
        }], 'DOMESTIC_INSTORE', 'https://pay.naver.com/benefit/payment/list');

        expect(offers.every(item => item.autoPublish)).toBe(true);
        expect(offers.slice(0, 2).every(item => (
            item.offer.condition.calculationMode === 'INFORMATION_ONLY'
        ))).toBe(true);
        expect(offers.slice(0, 2).map(item => (
            applyPromotionSemanticAnalysis(item, classifyPromotionWithRules(item)).autoPublish
        ))).toEqual([true, true]);
        expect(offers[2].offer).toMatchObject({
            action: { type: 'FLAT', value: 1_000 },
            condition: {
                minSpend: 10_000,
                firstPaymentOnly: true,
                calculationMode: 'CONDITIONAL',
            },
        });
        expect(offers[3]).toMatchObject({
            semanticScopeLocked: true,
            offer: {
                condition: {
                    minSpend: 20_000,
                    applicabilityScope: 'STORE_WIDE',
                },
            },
        });
    });

    it('keeps Npay store and category exclusions out of unrestricted calculations', () => {
        const offers = parseNaverPayPromotions([{
            promotionSeq: 61,
            promotionName: '경기광주휴게소',
            promotionDescription: '포인트·머니 1만원 이상 결제 시',
            exposeTitle: '50% 적립',
            acmRate: 50,
            cautionText: '일부 브랜드 매장에서는 혜택 적용 불가\n편의점 내 담배 결제 시 혜택 적용 불가',
        }, {
            promotionSeq: 62,
            promotionName: '찜카',
            promotionDescription: '국내렌트카 5만원 이상 결제 시',
            exposeTitle: '최대 5천원 즉시할인',
        }], 'DOMESTIC_INSTORE', 'https://pay.naver.com/benefit/payment/list');
        const classified = offers.map(item => applyPromotionSemanticAnalysis(
            item,
            classifyPromotionWithRules(item),
        ));

        expect(classified[0].offer.condition).toMatchObject({
            applicabilityScope: 'PRODUCT_SET',
            eligibleItemSummary: '편의점 내 담배 결제 시 혜택 적용 불가',
        });
        expect(classified[0].offer.condition.requiredInputs).toEqual(
            expect.arrayContaining(['ELIGIBLE_ITEM_AMOUNT', 'STORE_ELIGIBILITY']),
        );
        expect(classified[1].offer.condition).toMatchObject({
            applicabilityScope: 'CATEGORY',
            calculationMode: 'INFORMATION_ONLY',
            headlineEligible: false,
        });
        expect(classified.every(item => item.autoPublish)).toBe(true);
    });
});
