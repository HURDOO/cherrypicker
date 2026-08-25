import { describe, expect, it, vi } from 'vitest';
import type {
    CardBenefitExtractionInput,
    CardBenefitExtractionProvider,
    CardBenefitExtractionResult,
} from './card-benefit-extraction';
import type { CardBenefitCollectionResult } from './card-benefit-ingestion';
import {
    resolveCardBenefitBatchMaxAiCards,
    runCardBenefitCollectionBatch,
} from './card-benefit-batch';

const collectionResult = (
    cardId: string,
    status: CardBenefitCollectionResult['status'],
    cacheHit = false,
): CardBenefitCollectionResult => ({
    status,
    documentId: `${cardId}-document`,
    candidateId: `${cardId}-candidate`,
    cardId,
    sourceUrl: `https://card.example/${cardId}`,
    version: 1,
    extractor: 'openai:test',
    model: 'test-model',
    confidence: 1,
    validationErrors: [],
    ...(cacheHit && { cacheHit: true }),
    sources: [],
    sourceFailures: [],
});

const extractionResult = {} as CardBenefitExtractionResult;

describe('card benefit collection batch', () => {
    it('checks every card sequentially, reuses cache, and defers AI work over budget', async () => {
        const extraction = vi.fn(async () => extractionResult);
        const provider: CardBenefitExtractionProvider = {
            id: 'test',
            model: 'test-model',
            cacheKey: 'test:test-model',
            extract: extraction,
        };
        const collect = vi.fn(async (
            cardId: string,
            options: { provider?: CardBenefitExtractionProvider },
        ) => {
            if (cardId === 'cached') return collectionResult(cardId, 'unchanged', true);
            await options.provider!.extract({} as CardBenefitExtractionInput);
            return collectionResult(cardId, 'created');
        });

        const result = await runCardBenefitCollectionBatch({
            cardIds: ['cached', 'changed', 'over-budget'],
            maxAiCards: 1,
            provider,
            collect,
        });

        expect(collect.mock.calls.map(call => call[0])).toEqual([
            'cached',
            'changed',
            'over-budget',
        ]);
        expect(extraction).toHaveBeenCalledOnce();
        expect(result.items.map(item => item.status)).toEqual([
            'unchanged',
            'created',
            'deferred',
        ]);
        expect(result.totals).toMatchObject({
            targets: 3,
            created: 1,
            unchanged: 1,
            deferred: 1,
            failed: 0,
            cacheHits: 1,
            aiExtractions: 1,
        });
    });

    it('keeps checking later cards after an isolated collection failure', async () => {
        const collect = vi.fn(async (cardId: string) => {
            if (cardId === 'failed') throw new Error('official source unavailable');
            return collectionResult(cardId, 'unchanged', true);
        });

        const result = await runCardBenefitCollectionBatch({
            cardIds: ['failed', 'healthy'],
            maxAiCards: 0,
            collect,
        });

        expect(result.items[0]).toMatchObject({
            cardId: 'failed',
            status: 'failed',
            error: 'official source unavailable',
        });
        expect(result.items[1]).toMatchObject({ cardId: 'healthy', status: 'unchanged' });
        expect(result.totals.failed).toBe(1);
    });

    it('uses a conservative default and rejects invalid AI card budgets', () => {
        expect(resolveCardBenefitBatchMaxAiCards()).toBe(2);
        expect(resolveCardBenefitBatchMaxAiCards('0')).toBe(0);
        expect(resolveCardBenefitBatchMaxAiCards('3')).toBe(3);
        expect(() => resolveCardBenefitBatchMaxAiCards('-1')).toThrow(/0 이상의 정수/);
        expect(() => resolveCardBenefitBatchMaxAiCards('101')).toThrow(/100 이하/);
    });
});
