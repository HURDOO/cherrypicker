import type { PromotionCandidateAudit } from '@/types';

export const PROMOTION_CANDIDATE_RESOLUTION = {
    MISSING_FROM_LATEST_SOURCE: 'MISSING_FROM_LATEST_SOURCE',
    REAPPEARED_IN_SOURCE: 'REAPPEARED_IN_SOURCE',
    REMOVAL_CONFIRMED: 'REMOVAL_CONFIRMED',
} as const;

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
};

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
