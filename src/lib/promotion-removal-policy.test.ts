import { describe, expect, it } from 'vitest';
import type { PromotionCandidateAudit } from '@/types';
import {
    isPromotionRemovalCandidate,
    PROMOTION_CANDIDATE_RESOLUTION,
    promotionRemovalConfirmationError,
    removalCandidateMatchesObservedPromotion,
    shouldRejectPendingCandidateMissingFromSource,
    withPromotionCandidateResolution,
} from './promotion-removal-policy';

const removalAudit: PromotionCandidateAudit = {
    version: 1,
    summary: {
        changedFields: 1,
        highRiskChanges: 1,
        coveredFields: 0,
        missingFields: 0,
    },
    changes: [{
        path: 'promotion',
        kind: 'REMOVED',
        risk: 'HIGH',
    }],
    coverage: [],
    blockingErrors: ['기존 게시 혜택이 최신 공식 source bundle에서 사라졌습니다.'],
};

const removalCandidate = () => ({
    status: 'PENDING' as const,
    providerId: 'naverpay',
    linkedPromotionId: 'promotion-1',
    sourceBundleHash: 'bundle-missing',
    diff: {
        removedFromSource: true,
        collectionSourceId: 'naverpay-benefits',
        sourceKey: 'brand:benefit',
    },
    audit: removalAudit,
});

describe('promotion removal policy', () => {
    it('accepts only a preserved pending removal candidate for confirmation', () => {
        const candidate = removalCandidate();

        expect(isPromotionRemovalCandidate(candidate)).toBe(true);
        expect(promotionRemovalConfirmationError(candidate)).toBeUndefined();
        expect(promotionRemovalConfirmationError({
            ...candidate,
            diff: { ...candidate.diff, removedFromSource: false },
        })).toBe('공식 목록 삭제 감지 후보가 아닙니다.');
        expect(promotionRemovalConfirmationError({
            ...candidate,
            audit: undefined,
        })).toBe('혜택 삭제 변경 감사 기록이 없습니다.');
    });

    it('rejects an unapproved candidate that disappears from a successful source', () => {
        const candidate = {
            status: 'PENDING' as const,
            providerId: 'naverpay',
            diff: { sourceKey: 'new-benefit' },
        };

        expect(shouldRejectPendingCandidateMissingFromSource(
            candidate,
            new Set(['naverpay:another-benefit']),
        )).toBe(true);
        expect(shouldRejectPendingCandidateMissingFromSource(
            candidate,
            new Set(['naverpay:new-benefit']),
        )).toBe(false);
        expect(shouldRejectPendingCandidateMissingFromSource(
            { ...candidate, diff: { ...candidate.diff, removedFromSource: true } },
            new Set(),
        )).toBe(false);
    });

    it('rejects a pending removal candidate when the benefit reappears', () => {
        expect(removalCandidateMatchesObservedPromotion(removalCandidate(), {
            providerId: 'naverpay',
            promotionId: 'promotion-1',
            sourceKey: 'brand:benefit',
            collectionSourceId: 'naverpay-benefits',
        })).toBe(true);
        expect(removalCandidateMatchesObservedPromotion({
            ...removalCandidate(),
            linkedPromotionId: 'another-promotion',
        }, {
            providerId: 'naverpay',
            promotionId: 'promotion-1',
            sourceKey: 'another-benefit',
            collectionSourceId: 'naverpay-benefits',
        })).toBe(false);
    });

    it('preserves the candidate diff while recording its source resolution', () => {
        const resolvedAt = new Date('2026-08-23T05:30:00.000Z');
        expect(withPromotionCandidateResolution(
            { sourceKey: 'brand:benefit' },
            PROMOTION_CANDIDATE_RESOLUTION.REMOVAL_CONFIRMED,
            { resolvedAt, sourceBundleHash: 'bundle-missing' },
        )).toEqual({
            sourceKey: 'brand:benefit',
            resolution: 'REMOVAL_CONFIRMED',
            resolvedAt: resolvedAt.toISOString(),
            resolvedSourceBundleHash: 'bundle-missing',
        });
    });
});
