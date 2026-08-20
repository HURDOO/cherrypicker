import { describe, expect, it } from 'vitest';
import type { BenefitCatalogSource } from './benefit-catalog';
import { buildBenefitCatalogSnapshot } from './benefit-catalog';
import { parseBenefitCatalogSnapshot } from './benefit-catalog-contract';

const GENERATED_AT = '2026-08-18T09:00:00.000Z';

const createSource = (): BenefitCatalogSource => ({
    categories: [
        { id: 'dining', name: '외식', order: 2 },
        { id: 'cafe', name: '카페', order: 1 },
        { id: 'private-category', name: '개인 분류', userId: 'user-1', order: 3 },
    ],
    brands: [
        { id: 'restaurant', name: '식당', categoryId: 'dining', order: 2 },
        { id: 'coffee', name: '커피', categoryId: 'cafe', order: 1 },
        {
            id: 'private-brand',
            name: '개인 매장',
            categoryId: 'private-category',
            userId: 'user-1',
            order: 3,
        },
    ],
    cards: [
        {
            id: 'card-1',
            name: '공용 카드',
            company: '테스트카드',
            color: 'bg-blue-500',
            limitTable: [{ threshold: 300_000, limit: 10_000 }],
        },
        {
            id: 'private-card',
            userId: 'user-1',
            name: '개인 카드',
            company: '개인카드',
            color: 'bg-red-500',
            limitTable: [],
        },
    ],
    rules: [
        {
            id: 'rule-1',
            cardId: 'card-1',
            category: 'cafe',
            includedBrands: ['coffee'],
            excludedBrands: [],
            platformType: 'ALL',
            usesCardLimit: true,
            description: '카페 10% 할인',
            detail: '테스트 규칙',
            condition: { minSpend: 1_000 },
            action: { type: 'PERCENT', value: 10 },
            limitConfig: { monthlyAmount: 10_000 },
        },
        {
            id: 'private-rule',
            userId: 'user-1',
            cardId: 'private-card',
            includedBrands: ['private-brand'],
            excludedBrands: [],
            description: '개인 규칙',
            detail: '',
            condition: {},
            action: { type: 'FLAT', value: 1_000 },
            limitConfig: {},
        },
    ],
    providers: [
        {
            id: 'naverpay',
            name: 'Npay',
            kind: 'PAY',
            sourceUrl: 'https://example.com/provider',
            isActive: true,
            sortOrder: 1,
        },
        {
            id: 'inactive-provider',
            name: '중단 제공자',
            kind: 'PAY',
            isActive: false,
            sortOrder: 2,
        },
    ],
    subscriptionProducts: [
        {
            id: 'product-1',
            providerId: 'naverpay',
            name: '활성 상품',
            aliases: ['상품 별칭'],
            benefitSummary: '상품 설명',
            sourceUrl: 'https://example.com/product',
            isActive: true,
            collectedAt: '2026-08-18T08:00:00.000Z',
        },
        {
            id: 'inactive-product',
            providerId: 'naverpay',
            name: '비활성 상품',
            aliases: [],
            benefitSummary: '',
            sourceUrl: 'https://example.com/inactive-product',
            isActive: false,
        },
    ],
    promotions: [
        {
            id: 'promotion-1',
            providerId: 'naverpay',
            layer: 'PAY',
            title: 'Npay 1천원 할인',
            description: '공개 혜택',
            brandIds: ['coffee'],
            categoryIds: [],
            channels: ['ALL'],
            action: { type: 'FLAT', value: 1_000 },
            condition: { amountBasis: 'REMAINING_AMOUNT' },
            compatibility: { requiredPayProviderIds: ['naverpay'] },
            limitConfig: { monthlyCount: 1 },
            certainty: 'CONFIRMED',
            status: 'PUBLISHED',
            sourceUrl: 'https://example.com/promotion',
            sourceHash: 'internal-source-hash',
            collectedAt: '2026-08-18T07:00:00.000Z',
            reviewedAt: '2026-08-18T07:10:00.000Z',
            publishedAt: '2026-08-18T07:20:00.000Z',
        },
        {
            id: 'draft-promotion',
            providerId: 'naverpay',
            layer: 'PAY',
            title: '검수 중 혜택',
            description: '',
            brandIds: ['coffee'],
            categoryIds: [],
            channels: ['ALL'],
            action: { type: 'FLAT', value: 10_000 },
            condition: {},
            compatibility: {},
            limitConfig: {},
            certainty: 'CONDITIONAL',
            status: 'DRAFT',
            sourceUrl: 'https://example.com/draft',
        },
        {
            id: 'inactive-provider-promotion',
            providerId: 'inactive-provider',
            layer: 'PAY',
            title: '중단된 제공자 혜택',
            description: '',
            brandIds: ['coffee'],
            categoryIds: [],
            channels: ['ALL'],
            action: { type: 'FLAT', value: 10_000 },
            condition: {},
            compatibility: {},
            limitConfig: {},
            certainty: 'CONFIRMED',
            status: 'PUBLISHED',
            sourceUrl: 'https://example.com/inactive',
        },
    ],
    routeVerifications: [
        {
            brandId: 'coffee',
            payProviderId: 'naverpay',
            cardCompany: '테스트카드',
            channel: 'OFFLINE',
            cardBenefitEligible: true,
            certainty: 'CONFIRMED',
            evidenceUrl: 'https://example.com/evidence',
            verifiedAt: '2026-08-18T06:00:00.000Z',
        },
        {
            brandId: 'coffee',
            payProviderId: 'inactive-provider',
            channel: 'ONLINE',
            cardBenefitEligible: false,
            certainty: 'CONFIRMED',
            evidenceUrl: 'https://example.com/inactive-evidence',
            verifiedAt: '2026-08-18T06:00:00.000Z',
        },
    ],
});

describe('benefit catalog builder', () => {
    it('publishes only system and active data without internal review metadata', () => {
        const snapshot = buildBenefitCatalogSnapshot(createSource(), GENERATED_AT);

        expect(snapshot.schemaVersion).toBe(1);
        expect(snapshot.generatedAt).toBe(GENERATED_AT);
        expect(snapshot.catalogVersion).toMatch(/^[a-f0-9]{64}$/);
        expect(snapshot.categories.map(item => item.id)).toEqual(['cafe', 'dining']);
        expect(snapshot.brands.map(item => item.id)).toEqual(['coffee', 'restaurant']);
        expect(snapshot.cards.map(item => item.id)).toEqual(['card-1']);
        expect(snapshot.rules.map(item => item.id)).toEqual(['rule-1']);
        expect(snapshot.providers.map(item => item.id)).toEqual(['naverpay']);
        expect(snapshot.subscriptionProducts.map(item => item.id)).toEqual(['product-1']);
        expect(snapshot.promotions.map(item => item.id)).toEqual(['promotion-1']);
        expect(snapshot.routeVerifications).toHaveLength(1);

        const serialized = JSON.stringify(snapshot);
        expect(serialized).not.toContain('user-1');
        expect(serialized).not.toContain('private-category');
        expect(serialized).not.toContain('internal-source-hash');
        expect(serialized).not.toContain('collectedAt');
        expect(serialized).not.toContain('reviewedAt');
        expect(serialized).not.toContain('publishedAt');
    });

    it('creates a stable content version independent of input order and generation time', () => {
        const source = createSource();
        const reversed: BenefitCatalogSource = {
            categories: [...source.categories].reverse(),
            brands: [...source.brands].reverse(),
            cards: [...source.cards].reverse(),
            rules: [...source.rules].reverse(),
            providers: [...source.providers].reverse(),
            subscriptionProducts: [...source.subscriptionProducts].reverse(),
            promotions: [...source.promotions].reverse(),
            routeVerifications: [...source.routeVerifications].reverse(),
        };

        const first = buildBenefitCatalogSnapshot(source, GENERATED_AT);
        const second = buildBenefitCatalogSnapshot(reversed, '2026-08-19T09:00:00.000Z');

        expect(second.catalogVersion).toBe(first.catalogVersion);
        expect(second.categories).toEqual(first.categories);
        expect(second.promotions).toEqual(first.promotions);
        expect(second.generatedAt).not.toBe(first.generatedAt);
    });

    it('changes the content version when published calculation data changes', () => {
        const source = createSource();
        const first = buildBenefitCatalogSnapshot(source, GENERATED_AT);
        source.promotions[0] = {
            ...source.promotions[0],
            action: { type: 'FLAT', value: 2_000 },
        };

        const second = buildBenefitCatalogSnapshot(source, GENERATED_AT);

        expect(second.catalogVersion).not.toBe(first.catalogVersion);
    });

    it('updates collection freshness without changing the calculation content version', () => {
        const source = createSource();
        source.freshness = {
            collectionStatus: 'SUCCEEDED',
            sourceCount: 7,
            failedSourceCount: 0,
            lastAttemptAt: '2026-08-18T05:00:00.000Z',
            lastSuccessfulAt: '2026-08-18T05:00:00.000Z',
        };
        const first = buildBenefitCatalogSnapshot(source, GENERATED_AT);
        source.freshness = {
            ...source.freshness,
            lastAttemptAt: '2026-08-19T05:00:00.000Z',
            lastSuccessfulAt: '2026-08-19T05:00:00.000Z',
        };

        const second = buildBenefitCatalogSnapshot(source, '2026-08-19T05:00:00.000Z');

        expect(second.catalogVersion).toBe(first.catalogVersion);
        expect(second.freshness).not.toEqual(first.freshness);
    });

    it('rejects published data with a broken public reference', () => {
        const source = createSource();
        source.promotions[0] = {
            ...source.promotions[0],
            brandIds: ['missing-brand'],
        };

        expect(() => buildBenefitCatalogSnapshot(source, GENERATED_AT))
            .toThrow('없는 브랜드 missing-brand');
    });

    it('rejects duplicate public entity IDs', () => {
        const source = createSource();
        source.categories.push({ id: 'cafe', name: '중복 카페', order: 4 });

        expect(() => buildBenefitCatalogSnapshot(source, GENERATED_AT))
            .toThrow('카테고리 ID가 중복되었습니다: cafe');
    });

    it('rejects unsupported or malformed cached snapshots', () => {
        const snapshot = buildBenefitCatalogSnapshot(createSource(), GENERATED_AT);

        expect(parseBenefitCatalogSnapshot(snapshot)).toBe(snapshot);
        expect(() => parseBenefitCatalogSnapshot({
            ...snapshot,
            schemaVersion: 2,
        })).toThrow('지원하지 않는 공개 카탈로그 schema 버전');
        expect(() => parseBenefitCatalogSnapshot({
            ...snapshot,
            promotions: [{ ...snapshot.promotions[0], brandIds: ['missing-brand'] }],
        })).toThrow('없는 브랜드 missing-brand');
        expect(() => parseBenefitCatalogSnapshot({
            ...snapshot,
            freshness: {
                collectionStatus: 'SUCCEEDED',
                sourceCount: 1,
                failedSourceCount: 2,
            },
        })).toThrow('freshness 값이 올바르지 않습니다');
    });
});
