import { describe, expect, it } from 'vitest';
import type { PromotionCandidateAudit } from '@/types';
import {
    canAutomaticallyPublishPromotionCandidate,
    shouldPreserveReviewedPromotionCandidate,
} from './promotion-review-policy';

const audit = (overrides: Partial<PromotionCandidateAudit> = {}): PromotionCandidateAudit => ({
    version: 1,
    summary: {
        changedFields: 0,
        highRiskChanges: 0,
        coveredFields: 10,
        missingFields: 0,
    },
    changes: [],
    coverage: [],
    blockingErrors: [],
    ...overrides,
});

describe('promotion review policy', () => {
    it('auto-publishes only parser-approved candidates with a clean source audit', () => {
        expect(canAutomaticallyPublishPromotionCandidate({
            parserApproved: true,
            audit: audit(),
        })).toBe(true);
        expect(canAutomaticallyPublishPromotionCandidate({
            parserApproved: false,
            audit: audit(),
        })).toBe(false);
        expect(canAutomaticallyPublishPromotionCandidate({
            parserApproved: true,
            audit: audit({ blockingErrors: ['공식 근거 없음'] }),
        })).toBe(false);
    });

    it('keeps a manually reviewed identical candidate approved after an unrelated bundle update', () => {
        expect(shouldPreserveReviewedPromotionCandidate({
            candidateStatus: 'APPROVED',
            reviewerId: 'admin-1',
            audit: audit(),
            linkedOfferStatus: 'PUBLISHED',
            sourceHashMatches: true,
        })).toBe(true);
    });

    it('reopens review when content changed, evidence failed, or the linked offer expired', () => {
        const base = {
            candidateStatus: 'APPROVED' as const,
            reviewerId: 'admin-1',
            sourceHashMatches: true,
        };
        expect(shouldPreserveReviewedPromotionCandidate({
            ...base,
            audit: audit({
                changes: [{
                    path: 'action.value',
                    kind: 'CHANGED',
                    risk: 'HIGH',
                    before: 10,
                    after: 20,
                }],
            }),
            linkedOfferStatus: 'PUBLISHED',
        })).toBe(false);
        expect(shouldPreserveReviewedPromotionCandidate({
            ...base,
            audit: audit({ blockingErrors: ['공식 근거 없음'] }),
            linkedOfferStatus: 'PUBLISHED',
        })).toBe(false);
        expect(shouldPreserveReviewedPromotionCandidate({
            ...base,
            audit: audit(),
            linkedOfferStatus: 'EXPIRED',
        })).toBe(false);
    });
});
