import type { BenefitCatalogSnapshot } from '@/types';

export const BENEFIT_CATALOG_STALE_AFTER_MS = 36 * 60 * 60 * 1000;

export type BenefitCatalogHealthStatus =
    | 'loading'
    | 'fresh'
    | 'baseline'
    | 'refreshing'
    | 'offline'
    | 'stale'
    | 'degraded'
    | 'unknown'
    | 'unavailable';

export interface BenefitCatalogHealth {
    status: BenefitCatalogHealthStatus;
    isStale: boolean;
    ageMs: number | null;
    collectionStatus?: NonNullable<BenefitCatalogSnapshot['freshness']>['collectionStatus'];
    sourceCount?: number;
    failedSourceCount?: number;
    lastAttemptAt?: string;
    lastSuccessfulAt?: string;
    lastPublishedAt?: string;
}

interface AssessBenefitCatalogHealthInput {
    snapshot: BenefitCatalogSnapshot | null;
    isOnline: boolean;
    isRefreshing: boolean;
    refreshError?: Error | null;
    now?: Date | string;
    staleAfterMs?: number;
}

const toTimestamp = (value: Date | string) => {
    const date = typeof value === 'string' ? new Date(value) : value;
    if (Number.isNaN(date.getTime())) throw new Error('카탈로그 상태 기준 시각이 올바르지 않습니다.');
    return date.getTime();
};

export function assessBenefitCatalogHealth({
    snapshot,
    isOnline,
    isRefreshing,
    refreshError,
    now = new Date(),
    staleAfterMs = BENEFIT_CATALOG_STALE_AFTER_MS,
}: AssessBenefitCatalogHealthInput): BenefitCatalogHealth {
    if (!snapshot) {
        return {
            status: isRefreshing ? 'loading' : 'unavailable',
            isStale: true,
            ageMs: null,
        };
    }

    const freshness = snapshot.freshness;
    const hasCatalogData = [
        snapshot.categories,
        snapshot.brands,
        snapshot.cards,
        snapshot.rules,
        snapshot.providers,
        snapshot.subscriptionProducts,
        snapshot.promotions,
        snapshot.routeVerifications,
    ].some(items => items.length > 0);
    const reference = freshness?.lastSuccessfulAt ?? (
        freshness === undefined ? snapshot.generatedAt : undefined
    );
    const ageMs = reference
        ? Math.max(0, toTimestamp(now) - toTimestamp(reference))
        : null;
    const isStale = ageMs === null || ageMs > staleAfterMs;
    const base = {
        isStale,
        ageMs,
        ...(freshness && { collectionStatus: freshness.collectionStatus }),
        ...(freshness && { sourceCount: freshness.sourceCount }),
        ...(freshness && { failedSourceCount: freshness.failedSourceCount }),
        ...(freshness?.lastAttemptAt && { lastAttemptAt: freshness.lastAttemptAt }),
        ...(freshness?.lastSuccessfulAt && { lastSuccessfulAt: freshness.lastSuccessfulAt }),
        ...(freshness?.lastPublishedAt && { lastPublishedAt: freshness.lastPublishedAt }),
    };

    if (!isOnline) return { ...base, status: 'offline' };
    if (!freshness || freshness.collectionStatus === 'UNKNOWN') {
        return {
            ...base,
            status: isRefreshing
                ? 'refreshing'
                : hasCatalogData ? 'baseline' : 'unknown',
        };
    }
    if (
        refreshError ||
        freshness.collectionStatus === 'PARTIAL' ||
        freshness.collectionStatus === 'FAILED'
    ) {
        return { ...base, status: 'degraded' };
    }
    if (isStale) return { ...base, status: 'stale' };
    if (isRefreshing) return { ...base, status: 'refreshing' };
    return { ...base, status: 'fresh' };
}
