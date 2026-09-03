import { randomUUID } from 'node:crypto';
import { db } from '@/db';
import { cardBenefitCollectionRuns } from '@/db/schema';
import type {
    CardBenefitBatchItem,
    CardBenefitBatchResult,
    CardBenefitCollectionTrigger,
} from '@/types';
import {
    CardBenefitExtractionBudgetError,
    createCardBenefitExtractionProvider,
    type CardBenefitExtractionInput,
    type CardBenefitExtractionProvider,
} from './card-benefit-extraction';
import {
    CardBenefitIngestionError,
    collectSystemCardBenefits,
    type CardBenefitCollectionResult,
} from './card-benefit-ingestion';
import { getManagedSystemCardBenefitSourceInventory } from './system-card-onboarding';
import { summarizeCardBenefitCollectionRun } from './card-benefit-collection-run';

export type { CardBenefitBatchItem, CardBenefitBatchResult } from '@/types';

type CardBenefitCollector = (
    cardId: string,
    options: {
        provider?: CardBenefitExtractionProvider;
        forceExtraction?: boolean;
    },
) => Promise<CardBenefitCollectionResult>;

const DEFAULT_MAX_AI_CARDS = 2;
const MAX_SELECTED_BATCH_SIZE = 5;

export function resolveCardBenefitBatchMaxAiCards(configured?: string) {
    const value = configured?.trim();
    if (!value) return DEFAULT_MAX_AI_CARDS;
    if (!/^\d+$/.test(value)) {
        throw new Error('CARD_BENEFIT_BATCH_MAX_AI_CARDS는 0 이상의 정수여야 합니다.');
    }
    const parsed = Number(value);
    if (!Number.isSafeInteger(parsed) || parsed > 100) {
        throw new Error('CARD_BENEFIT_BATCH_MAX_AI_CARDS는 0 이상 100 이하이어야 합니다.');
    }
    return parsed;
}

const batchErrorMessage = (error: unknown) => error instanceof Error
    ? error.message.replace(/\s+/g, ' ').trim().slice(0, 500)
    : '알 수 없는 카드 혜택 수집 오류';

export async function runCardBenefitCollectionBatch(options: {
    cardIds: string[];
    maxAiCards: number;
    provider?: CardBenefitExtractionProvider;
    forceExtraction?: boolean;
    collect: CardBenefitCollector;
}): Promise<CardBenefitBatchResult> {
    const startedAt = new Date();
    let aiExtractions = 0;
    const baseProvider = options.provider;
    const provider = baseProvider ? {
        id: baseProvider.id,
        ...(baseProvider.model && { model: baseProvider.model }),
        ...(baseProvider.cacheKey && { cacheKey: baseProvider.cacheKey }),
        async extract(input: CardBenefitExtractionInput) {
            if (aiExtractions >= options.maxAiCards) {
                throw new CardBenefitExtractionBudgetError(options.maxAiCards);
            }
            aiExtractions += 1;
            return baseProvider.extract(input);
        },
    } satisfies CardBenefitExtractionProvider : undefined;
    const items: CardBenefitBatchItem[] = [];

    for (const cardId of options.cardIds) {
        const started = Date.now();
        const previousAiExtractions = aiExtractions;
        try {
            const result = await options.collect(cardId, {
                ...(provider && { provider }),
                forceExtraction: options.forceExtraction === true,
            });
            items.push({
                cardId,
                status: result.status,
                durationMs: Date.now() - started,
                aiExtraction: aiExtractions > previousAiExtractions,
                cacheHit: result.cacheHit === true,
                validationErrorCount: result.validationErrors.length,
                sourceFailureCount: result.sourceFailures.length,
                candidateId: result.candidateId,
            });
        } catch (error) {
            const deferred = error instanceof CardBenefitExtractionBudgetError ||
                (error instanceof CardBenefitIngestionError && error.status === 429);
            items.push({
                cardId,
                status: deferred ? 'deferred' : 'failed',
                durationMs: Date.now() - started,
                aiExtraction: aiExtractions > previousAiExtractions,
                cacheHit: false,
                validationErrorCount: 0,
                sourceFailureCount: 0,
                error: batchErrorMessage(error),
            });
        }
    }

    return {
        startedAt: startedAt.toISOString(),
        finishedAt: new Date().toISOString(),
        maxAiCards: options.maxAiCards,
        totals: {
            targets: items.length,
            created: items.filter(item => item.status === 'created').length,
            unchanged: items.filter(item => item.status === 'unchanged').length,
            deferred: items.filter(item => item.status === 'deferred').length,
            failed: items.filter(item => item.status === 'failed').length,
            cacheHits: items.filter(item => item.cacheHit).length,
            aiExtractions,
            validationErrors: items.reduce((sum, item) => sum + item.validationErrorCount, 0),
            sourceFailures: items.reduce((sum, item) => sum + item.sourceFailureCount, 0),
        },
        items,
    };
}

const collectSystemCardBenefitsByIds = async (cardIds: string[], options: {
    forceExtraction?: boolean;
    maxAiCards?: number;
    trigger?: CardBenefitCollectionTrigger;
} = {}) => {
    const result = await runCardBenefitCollectionBatch({
        cardIds,
        maxAiCards: options.maxAiCards ?? resolveCardBenefitBatchMaxAiCards(
            process.env.CARD_BENEFIT_BATCH_MAX_AI_CARDS,
        ),
        provider: createCardBenefitExtractionProvider(),
        forceExtraction: options.forceExtraction,
        collect: collectSystemCardBenefits,
    });
    const runId = randomUUID();
    const runStatus = summarizeCardBenefitCollectionRun(result);
    const trigger = options.trigger ?? 'MANUAL';
    db.insert(cardBenefitCollectionRuns).values({
        id: runId,
        status: runStatus,
        trigger,
        startedAt: new Date(result.startedAt),
        finishedAt: new Date(result.finishedAt),
        maxAiCards: result.maxAiCards,
        targetCount: result.totals.targets,
        createdCount: result.totals.created,
        unchangedCount: result.totals.unchanged,
        deferredCount: result.totals.deferred,
        failedCount: result.totals.failed,
        cacheHitCount: result.totals.cacheHits,
        aiExtractionCount: result.totals.aiExtractions,
        validationErrorCount: result.totals.validationErrors,
        sourceFailureCount: result.totals.sourceFailures,
        items: result.items,
    }).run();
    return {
        ...result,
        runId,
        runStatus,
        trigger,
    };
};

export async function collectSelectedSystemCardBenefits(cardIds: string[], options: {
    forceExtraction?: boolean;
    maxAiCards?: number;
    trigger?: CardBenefitCollectionTrigger;
} = {}) {
    if (cardIds.length < 1 || cardIds.length > MAX_SELECTED_BATCH_SIZE ||
        cardIds.some(cardId => typeof cardId !== 'string' || !cardId.trim()) ||
        new Set(cardIds).size !== cardIds.length) {
        throw new CardBenefitIngestionError(
            400,
            `수집할 카드는 중복 없이 1장 이상 ${MAX_SELECTED_BATCH_SIZE}장 이하로 선택해주세요.`,
        );
    }
    const supportedCardIds = new Set(getManagedSystemCardBenefitSourceInventory()
        .filter(item => item.revisionReviewEnabled)
        .map(item => item.cardId));
    if (cardIds.some(cardId => !supportedCardIds.has(cardId))) {
        throw new CardBenefitIngestionError(400, '공식 출처가 등록되지 않은 카드가 포함되어 있습니다.');
    }
    return collectSystemCardBenefitsByIds(cardIds, options);
}

export async function collectAllSystemCardBenefits(options: {
    forceExtraction?: boolean;
    maxAiCards?: number;
    trigger?: CardBenefitCollectionTrigger;
} = {}) {
    const cardIds = getManagedSystemCardBenefitSourceInventory()
        .filter(item => item.revisionReviewEnabled)
        .map(item => item.cardId);
    return collectSystemCardBenefitsByIds(cardIds, options);
}
