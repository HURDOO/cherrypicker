import { describe, expect, it } from 'vitest';
import {
    parseLguplusBenefits,
    parseNaverPayPromotions,
    parseParisMembershipHtml,
    parseSktMembershipHtml,
    parseTousLesJoursHtml,
} from './promotion-parsers';

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
});
