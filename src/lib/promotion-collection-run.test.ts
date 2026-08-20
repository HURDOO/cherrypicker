import { describe, expect, it } from 'vitest';
import { summarizePromotionCollectionRun } from './promotion-collection-run';

const result = (
    status: 'created' | 'unchanged' | 'failed' | 'skipped',
    counts: Partial<{
        discovered: number;
        published: number;
        reviewRequired: number;
        unchanged: number;
        expired: number;
    }> = {}
) => ({
    status,
    discovered: counts.discovered ?? 0,
    published: counts.published ?? 0,
    reviewRequired: counts.reviewRequired ?? 0,
    unchanged: counts.unchanged ?? 0,
    expired: counts.expired ?? 0,
});

describe('promotion collection run summary', () => {
    it('records a complete successful run without counting unsupported sources', () => {
        expect(summarizePromotionCollectionRun([
            result('created', { discovered: 2, published: 1 }),
            result('unchanged', { unchanged: 8 }),
            result('skipped'),
        ])).toEqual({
            status: 'SUCCEEDED',
            sourceCount: 2,
            successfulSourceCount: 2,
            failedSourceCount: 0,
            skippedSourceCount: 1,
            discoveredCount: 2,
            publishedCount: 1,
            reviewRequiredCount: 0,
            unchangedCount: 8,
            expiredCount: 0,
        });
    });

    it('distinguishes partial and total collection failures', () => {
        expect(summarizePromotionCollectionRun([
            result('unchanged'),
            result('failed'),
        ]).status).toBe('PARTIAL');
        expect(summarizePromotionCollectionRun([
            result('failed'),
            result('failed'),
            result('skipped'),
        ]).status).toBe('FAILED');
    });

    it('does not report success when no supported source was attempted', () => {
        const summary = summarizePromotionCollectionRun([
            result('skipped'),
            result('skipped'),
        ]);

        expect(summary).toMatchObject({
            status: 'FAILED',
            sourceCount: 0,
            successfulSourceCount: 0,
            failedSourceCount: 0,
            skippedSourceCount: 2,
        });
    });
});
