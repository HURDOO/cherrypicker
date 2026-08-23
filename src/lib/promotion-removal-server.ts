import { and, eq } from 'drizzle-orm';
import { db } from '@/db';
import {
    promotionCandidates,
    promotionOffers,
    promotionSourceBundles,
} from '@/db/schema';
import { HttpError } from './http-error';
import {
    PROMOTION_CANDIDATE_RESOLUTION,
    promotionRemovalConfirmationError,
    withPromotionCandidateResolution,
} from './promotion-removal-policy';

export function confirmPromotionRemoval(candidateId: string, reviewerId: string) {
    const candidate = db.select().from(promotionCandidates)
        .where(eq(promotionCandidates.id, candidateId))
        .get();
    if (!candidate) throw new HttpError(404, '삭제 감지 후보를 찾을 수 없습니다.');

    const validationError = promotionRemovalConfirmationError(candidate);
    if (validationError) throw new HttpError(400, validationError);
    const promotionId = candidate.linkedPromotionId!;
    const collectionSourceId = candidate.diff.collectionSourceId as string;
    const sourceBundle = db.select({ id: promotionSourceBundles.id })
        .from(promotionSourceBundles)
        .where(and(
            eq(promotionSourceBundles.collectionSourceId, collectionSourceId),
            eq(promotionSourceBundles.sourceBundleHash, candidate.sourceBundleHash),
        ))
        .get();
    if (!sourceBundle) {
        throw new HttpError(409, '삭제 판단에 사용한 공식 source bundle을 찾을 수 없습니다. 다시 수집해주세요.');
    }
    const promotion = db.select().from(promotionOffers)
        .where(eq(promotionOffers.id, promotionId))
        .get();
    if (!promotion) throw new HttpError(409, '삭제할 게시 혜택이 더 이상 존재하지 않습니다.');

    const now = new Date();
    db.transaction(tx => {
        tx.update(promotionOffers)
            .set({
                status: 'EXPIRED',
                reviewedAt: now,
                updatedAt: now,
            })
            .where(eq(promotionOffers.id, promotion.id))
            .run();
        tx.update(promotionCandidates)
            .set({
                status: 'APPROVED',
                diff: withPromotionCandidateResolution(
                    candidate.diff,
                    PROMOTION_CANDIDATE_RESOLUTION.REMOVAL_CONFIRMED,
                    {
                        resolvedAt: now,
                        sourceBundleHash: candidate.sourceBundleHash,
                    },
                ),
                reviewerId,
                reviewedAt: now,
            })
            .where(eq(promotionCandidates.id, candidate.id))
            .run();
    });

    const reviewedCandidate = db.select().from(promotionCandidates)
        .where(eq(promotionCandidates.id, candidate.id))
        .get();
    const expiredPromotion = db.select().from(promotionOffers)
        .where(eq(promotionOffers.id, promotion.id))
        .get();
    if (!reviewedCandidate || !expiredPromotion) {
        throw new HttpError(500, '사라진 혜택을 만료 처리하지 못했습니다.');
    }
    return { candidate: reviewedCandidate, promotion: expiredPromotion };
}
