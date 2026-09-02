import { describe, expect, it } from 'vitest';
import type {
    CardBenefitBatchItem,
    CardBenefitBatchResult,
    CardBenefitCollectionRun,
} from '@/types';
import {
    cardBenefitProblemStreaks,
    summarizeCardBenefitCollectionRun,
} from './card-benefit-collection-run';

const item = (
    cardId: string,
    status: CardBenefitBatchItem['status'],
    overrides: Partial<CardBenefitBatchItem> = {},
): CardBenefitBatchItem => ({
    cardId,
    status,
    durationMs: 1,
    aiExtraction: false,
    cacheHit: status === 'unchanged',
    validationErrorCount: 0,
    sourceFailureCount: 0,
    ...overrides,
});

const result = (items: CardBenefitBatchItem[]): CardBenefitBatchResult => ({
    startedAt: '2026-09-02T00:00:00.000Z',
    finishedAt: '2026-09-02T00:00:01.000Z',
    maxAiCards: 2,
    totals: {
        targets: items.length,
        created: items.filter(value => value.status === 'created').length,
        unchanged: items.filter(value => value.status === 'unchanged').length,
        deferred: items.filter(value => value.status === 'deferred').length,
        failed: items.filter(value => value.status === 'failed').length,
        cacheHits: items.filter(value => value.cacheHit).length,
        aiExtractions: items.filter(value => value.aiExtraction).length,
        validationErrors: items.reduce((sum, value) => sum + value.validationErrorCount, 0),
        sourceFailures: items.reduce((sum, value) => sum + value.sourceFailureCount, 0),
    },
    items,
});

const run = (id: string, items: CardBenefitBatchItem[]): CardBenefitCollectionRun => ({
    id,
    status: summarizeCardBenefitCollectionRun(result(items)),
    trigger: 'SCHEDULED',
    ...result(items),
});

describe('card benefit collection run', () => {
    it('distinguishes successful, partial, and fully failed batches', () => {
        expect(summarizeCardBenefitCollectionRun(result([
            item('a', 'unchanged'),
            item('b', 'created'),
        ]))).toBe('SUCCEEDED');
        expect(summarizeCardBenefitCollectionRun(result([
            item('a', 'unchanged'),
            item('b', 'deferred'),
        ]))).toBe('PARTIAL');
        expect(summarizeCardBenefitCollectionRun(result([
            item('a', 'failed'),
            item('b', 'failed'),
        ]))).toBe('FAILED');
        expect(summarizeCardBenefitCollectionRun(result([]))).toBe('FAILED');
    });

    it('treats validation and optional source failures as partial', () => {
        expect(summarizeCardBenefitCollectionRun(result([
            item('a', 'created', { validationErrorCount: 2 }),
        ]))).toBe('PARTIAL');
        expect(summarizeCardBenefitCollectionRun(result([
            item('a', 'unchanged', { sourceFailureCount: 1 }),
        ]))).toBe('PARTIAL');
    });

    it('reports only consecutive card problems that reach the warning threshold', () => {
        const warnings = cardBenefitProblemStreaks([
            run('latest', [
                item('a', 'failed', { error: 'timeout' }),
                item('b', 'unchanged'),
            ]),
            run('previous', [
                item('a', 'deferred'),
                item('b', 'failed'),
            ]),
            run('oldest', [
                item('a', 'unchanged'),
                item('b', 'failed'),
            ]),
        ]);

        expect(warnings).toEqual([{
            cardId: 'a',
            count: 2,
            latestStatus: 'failed',
            latestError: 'timeout',
        }]);
    });
});
