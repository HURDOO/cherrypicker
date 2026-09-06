import { describe, expect, it } from 'vitest';
import type { TransactionHistory } from '@/types';
import { buildPromotionUsage } from './promotionUsage';

const transaction = (
    id: number,
    date: string,
    promotionId: string,
    benefitAmount: number,
    certainty: 'CONFIRMED' | 'CONDITIONAL' | 'ESTIMATED' | null = 'CONFIRMED',
    promotionUsageGroupId?: string,
): TransactionHistory => ({
    id,
    date,
    brandId: 'brand-1',
    amount: 10_000,
    discountAmount: 0,
    combinationSnapshot: {
        steps: [{
            promotionId,
            ...(promotionUsageGroupId && { promotionUsageGroupId }),
            benefitAmount,
            ...(certainty !== null && { certainty }),
        }],
    },
});

describe('browser promotion usage aggregation', () => {
    it('matches daily, monthly, and yearly KST usage buckets', () => {
        const usage = buildPromotionUsage([
            transaction(1, '2026-08-18T01:00:00.000Z', 'promotion-1', 1_000),
            transaction(2, '2026-08-17T01:00:00.000Z', 'promotion-1', 2_000),
            transaction(3, '2026-07-18T01:00:00.000Z', 'promotion-1', 3_000),
            transaction(4, '2025-12-31T01:00:00.000Z', 'promotion-1', 4_000),
        ], new Date('2026-08-18T03:00:00.000Z'));

        expect(usage['promotion-1']).toEqual({
            dailyCount: 1,
            dailyAmount: 1_000,
            monthlyCount: 2,
            monthlyAmount: 3_000,
            yearlyCount: 3,
        });
    });

    it('ignores malformed legacy snapshots and invalid dates', () => {
        const usage = buildPromotionUsage([
            {
                id: 1,
                date: 'invalid',
                brandId: 'brand-1',
                amount: 10_000,
                discountAmount: 0,
                combinationSnapshot: { steps: [] },
            },
            {
                id: 2,
                date: '2026-08-18T01:00:00.000Z',
                brandId: 'brand-1',
                amount: 10_000,
                discountAmount: 0,
                combinationSnapshot: { steps: [{ promotionId: 123 }] },
            },
        ], new Date('2026-08-18T03:00:00.000Z'));

        expect(usage).toEqual({});
    });

    it('counts only confirmed promotion steps while keeping legacy snapshots compatible', () => {
        const usage = buildPromotionUsage([
            transaction(1, '2026-08-18T01:00:00.000Z', 'promotion-1', 1_000),
            transaction(
                2,
                '2026-08-18T02:00:00.000Z',
                'promotion-1',
                2_000,
                'CONDITIONAL',
            ),
            transaction(
                3,
                '2026-08-18T03:00:00.000Z',
                'promotion-1',
                3_000,
                'ESTIMATED',
            ),
            transaction(4, '2026-08-18T04:00:00.000Z', 'promotion-1', 500, null),
        ], new Date('2026-08-18T05:00:00.000Z'));

        expect(usage['promotion-1']).toEqual({
            dailyCount: 2,
            dailyAmount: 1_500,
            monthlyCount: 2,
            monthlyAmount: 1_500,
            yearlyCount: 2,
        });
    });

    it('aggregates immutable history into both the variant and shared usage group', () => {
        const usageGroupId = 'telecom:skt:brand:cu';
        const usage = buildPromotionUsage([
            transaction(
                1,
                '2026-08-18T01:00:00.000Z',
                'cu-points-vip',
                1_000,
                'CONFIRMED',
                usageGroupId,
            ),
        ], new Date('2026-08-18T03:00:00.000Z'));

        expect(usage['cu-points-vip']).toEqual(usage[usageGroupId]);
        expect(usage[usageGroupId]).toEqual({
            dailyCount: 1,
            dailyAmount: 1_000,
            monthlyCount: 1,
            monthlyAmount: 1_000,
            yearlyCount: 1,
        });
    });
});
