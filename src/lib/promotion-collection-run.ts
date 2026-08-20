import type { PromotionCollectionRunStatus } from '@/types';

type CollectionResult = {
    status: 'created' | 'unchanged' | 'failed' | 'skipped';
    discovered: number;
    published: number;
    reviewRequired: number;
    unchanged: number;
    expired: number;
};

export interface PromotionCollectionRunSummary {
    status: PromotionCollectionRunStatus;
    sourceCount: number;
    successfulSourceCount: number;
    failedSourceCount: number;
    skippedSourceCount: number;
    discoveredCount: number;
    publishedCount: number;
    reviewRequiredCount: number;
    unchangedCount: number;
    expiredCount: number;
}

export function summarizePromotionCollectionRun(
    results: CollectionResult[]
): PromotionCollectionRunSummary {
    const supported = results.filter(result => result.status !== 'skipped');
    const failedSourceCount = supported.filter(result => result.status === 'failed').length;
    const successfulSourceCount = supported.length - failedSourceCount;
    const status: PromotionCollectionRunStatus = supported.length === 0
        ? 'FAILED'
        : failedSourceCount === 0
            ? 'SUCCEEDED'
            : successfulSourceCount === 0
                ? 'FAILED'
                : 'PARTIAL';

    return {
        status,
        sourceCount: supported.length,
        successfulSourceCount,
        failedSourceCount,
        skippedSourceCount: results.length - supported.length,
        discoveredCount: results.reduce((sum, result) => sum + result.discovered, 0),
        publishedCount: results.reduce((sum, result) => sum + result.published, 0),
        reviewRequiredCount: results.reduce((sum, result) => sum + result.reviewRequired, 0),
        unchangedCount: results.reduce((sum, result) => sum + result.unchanged, 0),
        expiredCount: results.reduce((sum, result) => sum + result.expired, 0),
    };
}
