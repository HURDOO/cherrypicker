import type { PromotionCandidateAudit } from '@/types';

export const PROMOTION_CANDIDATE_RESOLUTION = {
    MISSING_FROM_LATEST_SOURCE: 'MISSING_FROM_LATEST_SOURCE',
    REAPPEARED_IN_SOURCE: 'REAPPEARED_IN_SOURCE',
    REMOVAL_CONFIRMED: 'REMOVAL_CONFIRMED',
    REMOVAL_AUTO_CONFIRMED: 'REMOVAL_AUTO_CONFIRMED',
} as const;

export const PROMOTION_REMOVAL_AUTO_POLICY = {
    id: 'CONSECUTIVE_COMPLETE_SOURCE_OBSERVATIONS_V2',
    requiredObservationCount: 2,
    minimumObservationWindowMs: 5 * 60 * 1_000,
} as const;

export const PROMOTION_REMOVAL_AUTO_ACTOR = 'PROMOTION_COLLECTOR';

export type PromotionCandidateResolution = (
    typeof PROMOTION_CANDIDATE_RESOLUTION
)[keyof typeof PROMOTION_CANDIDATE_RESOLUTION];

type CandidateState = {
    status: 'PENDING' | 'APPROVED' | 'REJECTED';
    providerId: string;
    linkedPromotionId?: string | null;
    sourceBundleHash?: string | null;
    diff: Record<string, unknown>;
    audit?: PromotionCandidateAudit | null;
    discoveredAt?: Date | string;
};

export type PromotionRemovalSourceObservation = {
    observedAt: string;
    sourceBundleHash: string;
    coverageSourceBundleHashes: Record<string, string>;
};

export type PromotionRemovalObservation = {
    policy: typeof PROMOTION_REMOVAL_AUTO_POLICY.id;
    count: number;
    firstObservedAt: string;
    lastObservedAt: string;
    observations: PromotionRemovalSourceObservation[];
};

const isRecord = (value: unknown): value is Record<string, unknown> => (
    Boolean(value) && typeof value === 'object' && !Array.isArray(value)
);

const toIsoString = (value: unknown) => {
    const date = value instanceof Date
        ? value
        : typeof value === 'string'
            ? new Date(value)
            : undefined;
    return date && Number.isFinite(date.getTime()) ? date.toISOString() : undefined;
};

const parseCoverageHashes = (value: unknown) => {
    if (!isRecord(value)) return {};
    return Object.fromEntries(Object.entries(value).filter(
        (entry): entry is [string, string] => typeof entry[1] === 'string' && Boolean(entry[1])
    ));
};

export function getPromotionRemovalObservation(
    candidate: Pick<CandidateState, 'diff' | 'sourceBundleHash' | 'discoveredAt'>,
): PromotionRemovalObservation | undefined {
    if (!isPromotionRemovalCandidate(candidate)) return undefined;
    const raw = candidate.diff.removalObservation;
    if (isRecord(raw)) {
        const firstObservedAt = toIsoString(raw.firstObservedAt);
        const lastObservedAt = toIsoString(raw.lastObservedAt);
        const observations = Array.isArray(raw.observations)
            ? raw.observations.flatMap<PromotionRemovalSourceObservation>(item => {
                if (!isRecord(item)) return [];
                const observedAt = toIsoString(item.observedAt);
                const sourceBundleHash = item.sourceBundleHash;
                if (!observedAt || typeof sourceBundleHash !== 'string' || !sourceBundleHash) {
                    return [];
                }
                return [{
                    observedAt,
                    sourceBundleHash,
                    coverageSourceBundleHashes: parseCoverageHashes(
                        item.coverageSourceBundleHashes
                    ),
                }];
            })
            : [];
        if (firstObservedAt && lastObservedAt && observations.length > 0) {
            return {
                policy: PROMOTION_REMOVAL_AUTO_POLICY.id,
                count: Math.max(observations.length, Number(raw.count) || 0),
                firstObservedAt,
                lastObservedAt,
                observations,
            };
        }
    }

    const observedAt = toIsoString(candidate.discoveredAt);
    if (!observedAt || !candidate.sourceBundleHash) return undefined;
    return {
        policy: PROMOTION_REMOVAL_AUTO_POLICY.id,
        count: 1,
        firstObservedAt: observedAt,
        lastObservedAt: observedAt,
        observations: [{
            observedAt,
            sourceBundleHash: candidate.sourceBundleHash,
            coverageSourceBundleHashes: {},
        }],
    };
}

export function createPromotionRemovalObservation(input: {
    observedAt: Date;
    sourceBundleHash: string;
    coverageSourceBundleHashes: Record<string, string>;
}): PromotionRemovalObservation {
    const observedAt = input.observedAt.toISOString();
    return {
        policy: PROMOTION_REMOVAL_AUTO_POLICY.id,
        count: 1,
        firstObservedAt: observedAt,
        lastObservedAt: observedAt,
        observations: [{
            observedAt,
            sourceBundleHash: input.sourceBundleHash,
            coverageSourceBundleHashes: input.coverageSourceBundleHashes,
        }],
    };
}

export function addPromotionRemovalObservation(
    candidate: Pick<CandidateState, 'diff' | 'sourceBundleHash' | 'discoveredAt'>,
    input: {
        observedAt: Date;
        sourceBundleHash: string;
        coverageSourceBundleHashes: Record<string, string>;
    },
): PromotionRemovalObservation {
    const previous = getPromotionRemovalObservation(candidate) ??
        createPromotionRemovalObservation(input);
    const observedAt = input.observedAt.toISOString();
    if (previous.lastObservedAt === observedAt) return previous;
    const observations = [...previous.observations, {
        observedAt,
        sourceBundleHash: input.sourceBundleHash,
        coverageSourceBundleHashes: input.coverageSourceBundleHashes,
    }];
    return {
        policy: PROMOTION_REMOVAL_AUTO_POLICY.id,
        count: previous.count + 1,
        firstObservedAt: previous.firstObservedAt,
        lastObservedAt: observedAt,
        observations,
    };
}

export function canAutomaticallyConfirmPromotionRemoval(
    observation: PromotionRemovalObservation,
) {
    const elapsed = new Date(observation.lastObservedAt).getTime() -
        new Date(observation.firstObservedAt).getTime();
    return observation.policy === PROMOTION_REMOVAL_AUTO_POLICY.id &&
        observation.count >= PROMOTION_REMOVAL_AUTO_POLICY.requiredObservationCount &&
        observation.observations.length >= PROMOTION_REMOVAL_AUTO_POLICY.requiredObservationCount &&
        observation.observations.every(item => Boolean(item.sourceBundleHash)) &&
        elapsed >= PROMOTION_REMOVAL_AUTO_POLICY.minimumObservationWindowMs;
}

export const isPromotionRemovalCandidate = (
    candidate: Pick<CandidateState, 'diff'>,
) => candidate.diff.removedFromSource === true;

export function shouldRejectPendingCandidateMissingFromSource(
    candidate: Pick<CandidateState, 'status' | 'providerId' | 'diff'>,
    observedKeys: Set<string>,
) {
    if (candidate.status !== 'PENDING' || isPromotionRemovalCandidate(candidate)) return false;
    const sourceKey = candidate.diff.sourceKey;
    return typeof sourceKey !== 'string' ||
        !observedKeys.has(`${candidate.providerId}:${sourceKey}`);
}

export function removalCandidateMatchesObservedPromotion(
    candidate: Pick<CandidateState, 'status' | 'providerId' | 'linkedPromotionId' | 'diff'>,
    observed: {
        providerId: string;
        promotionId: string;
        sourceKey: string;
        collectionSourceId: string;
    },
) {
    if (candidate.status !== 'PENDING' || !isPromotionRemovalCandidate(candidate)) return false;
    if (candidate.linkedPromotionId === observed.promotionId) return true;
    return candidate.providerId === observed.providerId &&
        candidate.diff.sourceKey === observed.sourceKey &&
        candidate.diff.collectionSourceId === observed.collectionSourceId;
}

export function promotionRemovalConfirmationError(
    candidate: CandidateState,
) {
    if (candidate.status !== 'PENDING') return '이미 검수가 완료된 삭제 후보입니다.';
    if (!isPromotionRemovalCandidate(candidate)) return '공식 목록 삭제 감지 후보가 아닙니다.';
    if (!candidate.linkedPromotionId) return '삭제 후보와 연결된 게시 혜택이 없습니다.';
    if (!candidate.sourceBundleHash) return '삭제 판단의 공식 source bundle이 없습니다.';
    if (typeof candidate.diff.collectionSourceId !== 'string') {
        return '삭제 판단의 공식 수집 출처가 없습니다.';
    }
    const hasRemovalAudit = candidate.audit?.changes.some(change => (
        change.path === 'promotion' && change.kind === 'REMOVED'
    ));
    if (!hasRemovalAudit) return '혜택 삭제 변경 감사 기록이 없습니다.';
    return undefined;
}

export function withPromotionCandidateResolution(
    diff: Record<string, unknown>,
    resolution: PromotionCandidateResolution,
    options: {
        resolvedAt: Date;
        sourceBundleHash?: string;
    },
) {
    return {
        ...diff,
        resolution,
        resolvedAt: options.resolvedAt.toISOString(),
        ...(options.sourceBundleHash && {
            resolvedSourceBundleHash: options.sourceBundleHash,
        }),
    };
}
