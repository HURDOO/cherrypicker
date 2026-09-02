import type {
    CardBenefitBatchItem,
    CardBenefitBatchResult,
    CardBenefitCollectionRun,
    CardBenefitCollectionRunStatus,
} from '@/types';

export const isCardBenefitBatchItemProblem = (item: CardBenefitBatchItem) => (
    item.status === 'failed' ||
    item.status === 'deferred' ||
    item.validationErrorCount > 0 ||
    item.sourceFailureCount > 0
);

export function summarizeCardBenefitCollectionRun(
    result: Pick<CardBenefitBatchResult, 'items' | 'totals'>,
): CardBenefitCollectionRunStatus {
    if (result.totals.targets === 0) return 'FAILED';
    const problemCount = result.items.filter(isCardBenefitBatchItemProblem).length;
    if (problemCount === 0) return 'SUCCEEDED';
    return problemCount === result.totals.targets && result.totals.failed === problemCount
        ? 'FAILED'
        : 'PARTIAL';
}

export type CardBenefitProblemStreak = {
    cardId: string;
    count: number;
    latestStatus: CardBenefitBatchItem['status'];
    latestError?: string;
};

export function cardBenefitProblemStreaks(
    runs: Pick<CardBenefitCollectionRun, 'items'>[],
    minimumCount = 2,
): CardBenefitProblemStreak[] {
    const cardIds = [...new Set(runs.flatMap(run => run.items.map(item => item.cardId)))];
    return cardIds.flatMap(cardId => {
        let count = 0;
        let latestProblem: CardBenefitBatchItem | undefined;
        for (const run of runs) {
            const item = run.items.find(candidate => candidate.cardId === cardId);
            if (!item) continue;
            if (!isCardBenefitBatchItemProblem(item)) break;
            latestProblem ??= item;
            count += 1;
        }
        if (!latestProblem || count < minimumCount) return [];
        return [{
            cardId,
            count,
            latestStatus: latestProblem.status,
            ...(latestProblem.error && { latestError: latestProblem.error }),
        }];
    });
}
