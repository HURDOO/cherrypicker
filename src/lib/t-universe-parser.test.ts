import { describe, expect, it } from 'vitest';
import {
    officialTUniverseBigGuideHtmlExcerpt,
    officialTUniverseDailyPassHtmlExcerpt,
    officialTUniverseOliveStarbucksHtmlExcerpt,
    promotionOfficialFixtureMetadata,
} from '@/test/fixtures/promotion-official-sources';
import {
    createTUniverseProductAliases,
    parseTUniverseSources,
} from './t-universe-parser';

const parse = () => parseTUniverseSources({
    bigGuideHtml: officialTUniverseBigGuideHtmlExcerpt,
    bigGuideUrl: promotionOfficialFixtureMetadata.sources.tUniverseBig,
    dailyPassHtml: officialTUniverseDailyPassHtmlExcerpt,
    dailyPassUrl: promotionOfficialFixtureMetadata.sources.tUniverseDaily,
    oliveStarbucksHtml: officialTUniverseOliveStarbucksHtmlExcerpt,
    oliveStarbucksUrl: promotionOfficialFixtureMetadata.sources.tUniverseOliveStarbucks,
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
            bigGuideHtml: officialTUniverseBigGuideHtmlExcerpt,
            bigGuideUrl: promotionOfficialFixtureMetadata.sources.tUniverseBig,
            dailyPassHtml: '<p>페이지 형식 변경</p>',
            dailyPassUrl: promotionOfficialFixtureMetadata.sources.tUniverseDaily,
            oliveStarbucksHtml: officialTUniverseOliveStarbucksHtmlExcerpt,
            oliveStarbucksUrl: promotionOfficialFixtureMetadata.sources.tUniverseOliveStarbucks,
        })).toThrow('상세 한도');
    });
});
