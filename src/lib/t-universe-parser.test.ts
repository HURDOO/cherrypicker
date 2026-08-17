import { describe, expect, it } from 'vitest';
import {
    createTUniverseProductAliases,
    parseTUniverseSources,
} from './t-universe-parser';

const bigGuideHtml = `
    <table><tbody>
        <tr><td>베스트 Max</td><td>T 우주 Big 6</td><td>무료</td><td>CU 1,000원당 200원 할인, 스타벅스 제조음료 20% 할인, 배스킨라빈스 7천 원 상당 교환권</td></tr>
        <tr><td>베스트 Pro</td><td>T 우주 Big 5</td><td>무료</td><td>CU 1,000원당 200원 할인, 스타벅스 제조음료 20% 할인</td></tr>
        <tr><td>베스트 109</td><td>T 우주 Big 4</td><td>무료</td><td>세븐일레븐 1,000원당 300원 할인, 투썸플레이스 30% 할인, 파리바게뜨 1,000원당 300원 할인</td></tr>
        <tr><td>베스트 99</td><td>T 우주 Big 3</td><td>무료</td><td>세븐일레븐 1,000원당 300원 할인, 투썸플레이스 30% 할인, 파리바게뜨 1,000원당 300원 할인</td></tr>
        <tr><td>베스트 89</td><td>T 우주 Big 3</td><td>50% 할인</td><td>세븐일레븐 1,000원당 300원 할인, 투썸플레이스 30% 할인, 파리바게뜨 1,000원당 300원 할인</td></tr>
    </tbody></table>
`;

const dailyPassHtml = `
    <p>편의점과 카페를 자주 찾는다면 월 9,900원의 ‘T 우주패스 편의점&amp;카페’ 상품을 활용할 수 있다. 세븐일레븐 매장 구매 1천 원당 300원 할인 혜택을 제공하며, 1일 1회 최대 9천 원, 월 최대 3만 원까지 할인받을 수 있다. 투썸플레이스에서는 모든 제품을 매일 30% 할인받을 수 있으며, 1일 1회 최대 9천 원, 월 최대 3만 원까지 적용된다.</p>
    <p>온라인 쇼핑이 많다면 ‘T 우주패스 쇼핑 11번가’를 추천한다. 월 9,900원으로 11번가 5천 원 쿠폰 2매, 11번가 배송비 3천 원 쿠폰 1매, 11pay 3,000 포인트를 제공한다.</p>
    <p>월 구독료 부담을 낮추고 싶다면 월 4,900원의 ‘CU 할인’ 구독을 선택할 수 있다. CU편의점에서 1천 원당 200원을 할인받을 수 있으며, 1일 1회 최대 6천 원, 월 최대 3만 원까지 할인이 적용된다.</p>
`;

const oliveStarbucksHtml = `
    <p>이번에 선보이는 ‘T 우주패스 올리브영&amp;스타벅스&amp;이마트24’ 상품은 월 9,900원의 구독료를 지불하면 세 가지 브랜드의 혜택을 모두 제공한다.</p>
    <p>올리브영은 최대 약 1만 원 상당의 혜택을 매월 제공한다.</p>
    <p>스타벅스는 제조 음료 가격의 20%를 할인해준다. 할인 금액은 일 5,000원, 월 30,000원 한도로 전국 스타벅스 매장에서 모바일 주문인 사이렌오더를 통해 사용 가능하며, 상품 단위로 20% 할인이 적용된다.</p>
    <p>이마트 24는 매장에서 구매 시 최대 20% 할인을 제공한다. 할인 혜택은 일 4,000원, 월 2만원 한도로 구매 금액 1,000원당 200원씩 할인 받을 수 있다.</p>
`;

const parse = () => parseTUniverseSources({
    bigGuideHtml,
    bigGuideUrl: 'https://example.com/big',
    dailyPassHtml,
    dailyPassUrl: 'https://example.com/daily',
    oliveStarbucksHtml,
    oliveStarbucksUrl: 'https://example.com/olive',
});

describe('T Universe source parser', () => {
    it('builds the product catalog from official Big and pass pages', () => {
        const result = parse();

        expect(result.products.map(product => product.name)).toEqual([
            'T 우주 Big 6',
            'T 우주 Big 5',
            'T 우주 Big 4',
            'T 우주 Big 3',
            'T 우주패스 편의점&카페',
            'T 우주패스 쇼핑 11번가',
            'CU 할인',
            'T 우주패스 올리브영&스타벅스&이마트24',
        ]);
        expect(createTUniverseProductAliases('CU 할인')).toContain('CU 할인 멤버십');
        expect(createTUniverseProductAliases('T 우주 Big 6')).toContain('T우주 Big6');
    });

    it('parses transaction, daily, and monthly caps into calculable offers', () => {
        const offers = parse().promotions;
        const cu = offers.find(item => item.offer.brandIds.includes('cu'))?.offer;
        const sevenEleven = offers.find(item =>
            item.offer.brandIds.includes('seveneleven')
        )?.offer;
        const starbucks = offers.find(item =>
            item.offer.brandIds.includes('starbucks')
        )?.offer;
        const emart24 = offers.find(item =>
            item.offer.brandIds.includes('emart24')
        )?.offer;

        expect(cu?.action).toMatchObject({ value: 20, maxBenefit: 6_000 });
        expect(cu?.limitConfig).toEqual({ dailyCount: 1, monthlyAmount: 30_000 });
        expect(sevenEleven?.action.maxBenefit).toBe(9_000);
        expect(starbucks?.limitConfig).toEqual({
            dailyAmount: 5_000,
            monthlyAmount: 30_000,
        });
        expect(starbucks?.channels).toEqual(['ONLINE']);
        expect(emart24?.limitConfig).toEqual({
            dailyAmount: 4_000,
            monthlyAmount: 20_000,
        });
    });

    it('links aliases for every eligible product and avoids calculating missing caps', () => {
        const offers = parse().promotions;
        const cu = offers.find(item => item.offer.brandIds.includes('cu'))?.offer;
        const paris = offers.find(item =>
            item.offer.brandIds.includes('paris_baguette')
        )?.offer;

        expect(cu?.condition.requiredInputs).toContain('SUBSCRIPTION_PRODUCT');
        expect(cu?.condition.requiredSubscriptionProducts).toEqual(expect.arrayContaining([
            'T 우주 Big 6',
            'T 우주 Big 5',
            'CU 할인',
            'CU 할인 멤버십',
        ]));
        expect(paris?.condition.calculationMode).toBe('INFORMATION_ONLY');
        expect(paris?.condition.requiredNote).toContain('한도');
    });

    it('fails the collection when a mandatory detail page becomes unparsable', () => {
        expect(() => parseTUniverseSources({
            bigGuideHtml,
            bigGuideUrl: 'https://example.com/big',
            dailyPassHtml: '<p>페이지 형식 변경</p>',
            dailyPassUrl: 'https://example.com/daily',
            oliveStarbucksHtml,
            oliveStarbucksUrl: 'https://example.com/olive',
        })).toThrow('상세 한도');
    });
});
