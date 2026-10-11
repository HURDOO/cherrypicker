import { describe, expect, it } from 'vitest';
import type { BenefitRule, PromotionOffer } from '@/types';
import { autoBrowsableBrandIds } from './brand-discovery-visibility';
import { toBrand } from './db-mappers';

const rule = (id: string, brandId: string, value: number, cardId = 'card_a'): BenefitRule => ({
    id,
    cardId,
    includedBrands: [brandId],
    description: id,
    detail: '',
    condition: {},
    action: { type: 'PERCENT', value },
    limitConfig: {},
});

const offer = (
    id: string,
    brandId: string,
    period: Pick<PromotionOffer, 'startsAt' | 'endsAt'> = {},
): PromotionOffer => ({
    id,
    providerId: 'provider_a',
    layer: 'DISCOUNT',
    title: id,
    description: id,
    brandIds: [brandId],
    categoryIds: [],
    channels: [],
    ...period,
    action: { type: 'PERCENT', value: 10 },
    condition: {},
    compatibility: {},
    limitConfig: {},
    certainty: 'CONFIRMED',
    status: 'PUBLISHED',
    sourceUrl: 'https://promotion.example.com',
});

const brands = [
    { id: 'cafe_card', categoryId: 'cafe' },
    { id: 'travel_info', categoryId: 'transport' },
    { id: 'cafe_live', categoryId: 'cafe' },
    { id: 'cafe_expired', categoryId: 'cafe' },
    { id: 'leisure_live', categoryId: 'movie' },
    { id: 'hidden_card', categoryId: 'cafe' },
];

describe('autoBrowsableBrandIds', () => {
    it('shows auto brands only while they carry a computed card benefit or a live everyday promotion', () => {
        const browsable = autoBrowsableBrandIds({
            brands,
            publishedCardIds: new Set(['card_a']),
            rules: [
                rule('computed', 'cafe_card', 30),
                rule('information', 'travel_info', 0),
                rule('unpublished', 'hidden_card', 10, 'card_draft'),
            ],
            promotions: [
                offer('live', 'cafe_live', { startsAt: '2026-10-01', endsAt: '2026-10-31' }),
                offer('expired', 'cafe_expired', { endsAt: '2026-10-10' }),
                offer('leisure', 'leisure_live'),
            ],
            today: '2026-10-11',
        });

        expect([...browsable].sort()).toEqual(['cafe_card', 'cafe_live']);
    });

    it('keeps an auto brand search-only in the public mapping until the catalog resolves it', () => {
        const row = {
            id: 'auto',
            name: '자동 브랜드',
            categoryId: 'cafe',
            iconName: null,
            userId: null,
            sortOrder: 0,
            discoveryVisibility: 'AUTO' as const,
        };

        expect(toBrand(row).discoveryVisibility).toBe('SEARCH_ONLY');
        expect(toBrand({ ...row, discoveryVisibility: 'BROWSE' }).discoveryVisibility).toBeUndefined();
    });
});
