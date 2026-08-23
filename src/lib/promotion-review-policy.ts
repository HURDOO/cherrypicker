import type { PromotionCandidateAudit } from '@/types';

export function canAutomaticallyPublishPromotionCandidate(options: {
    parserApproved: boolean;
    audit: PromotionCandidateAudit;
}) {
    return options.parserApproved && options.audit.blockingErrors.length === 0;
}

export function shouldPreserveReviewedPromotionCandidate(options: {
    candidateStatus: 'PENDING' | 'APPROVED' | 'REJECTED';
    reviewerId?: string | null;
    audit: PromotionCandidateAudit;
    linkedOfferStatus?: 'DRAFT' | 'PUBLISHED' | 'PAUSED' | 'EXPIRED';
    sourceHashMatches: boolean;
}) {
    return options.candidateStatus === 'APPROVED' &&
        Boolean(options.reviewerId) &&
        options.sourceHashMatches &&
        (options.linkedOfferStatus === 'PUBLISHED' || options.linkedOfferStatus === 'PAUSED') &&
        options.audit.blockingErrors.length === 0 &&
        options.audit.changes.length === 0;
}
