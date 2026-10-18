import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { db } from '@/db';
import { brands, promotionCandidates, promotionOffers } from '@/db/schema';
import { HttpError } from '@/lib/http-error';
import { autoPromotionId } from '@/lib/promotion-collector';
import { normalizePromotionDraft } from '@/lib/promotion-input';
import {
    canAcknowledgePromotionAuditErrors,
    unresolvedPromotionAuditErrors,
} from '@/lib/promotion-candidate-audit';
import { toPromotionOffer } from '@/lib/db-mappers';

/**
 * Approves or rejects one collected promotion candidate, the same path as the admin review screen.
 * `sessionApprovalNote` marks an approval made by an AI session under a user-granted temporary
 * approval rule (TASK-14/15), so it stays distinguishable from a person's approval.
 */
export const toCandidate = (row: typeof promotionCandidates.$inferSelect) => ({
    ...row,
    rawContent: row.rawContent.slice(0, 8_000),
    discoveredAt: row.discoveredAt.toISOString(),
    reviewedAt: row.reviewedAt?.toISOString(),
});

export type CandidateReviewStatus = 'APPROVED' | 'REJECTED';

const needsSourceAudit = (candidate: typeof promotionCandidates.$inferSelect) => (
    candidate.diff.structured === true &&
    candidate.diff.manual !== true &&
    !candidate.audit
);

export function reviewPromotionCandidate(
    candidateId: string,
    status: CandidateReviewStatus,
    reviewerId: string,
    parsedOfferOverride?: unknown,
    acknowledgeHighRiskChanges = false,
    sessionApprovalNote?: string,
) {
    const candidate = db.select().from(promotionCandidates)
        .where(eq(promotionCandidates.id, candidateId))
        .get();
    if (!candidate) throw new HttpError(404, '수집 후보를 찾을 수 없습니다.');
    if (candidate.status !== 'PENDING') {
        throw new HttpError(409, '이미 검수가 완료된 후보입니다.');
    }

    const now = new Date();
    if (status === 'REJECTED') {
        const row = db.update(promotionCandidates)
            .set({
                status: 'REJECTED',
                reviewerId,
                reviewedAt: now,
            })
            .where(eq(promotionCandidates.id, candidate.id))
            .returning()
            .get();
        return { candidate: toCandidate(row) };
    }

    if (needsSourceAudit(candidate)) {
        throw new HttpError(
            400,
            '원문 source bundle 검증이 없는 기존 후보입니다. 공식 페이지를 다시 수집해주세요.'
        );
    }

    const parsedOffer = parsedOfferOverride ?? candidate.parsedOffer;
    const offer = normalizePromotionDraft(parsedOffer);
    if (offer.providerId !== candidate.providerId) {
        throw new HttpError(400, '수집 후보의 제공자는 변경할 수 없습니다.');
    }
    if (offer.condition.applicabilityScope === 'UNKNOWN') {
        throw new HttpError(400, '게시 전에 매장 전체·카테고리·상품·고객 한정 중 적용 범위를 선택해주세요.');
    }
    if (
        (offer.condition.applicabilityScope === 'CATEGORY' ||
            offer.condition.applicabilityScope === 'PRODUCT_SET') &&
        !offer.condition.eligibleItemSummary &&
        !offer.condition.requiredNote
    ) {
        throw new HttpError(400, '상품 한정 혜택은 대상 상품 설명을 입력해주세요.');
    }
    const reviewedParsedOffer = {
        ...(parsedOffer as Record<string, unknown>),
        condition: offer.condition,
    };
    const blockingErrors = unresolvedPromotionAuditErrors(
        candidate.audit?.blockingErrors ?? [],
        reviewedParsedOffer,
    );
    const acknowledgedReviewableErrors = acknowledgeHighRiskChanges &&
        canAcknowledgePromotionAuditErrors(blockingErrors);
    if (blockingErrors.length > 0 && !acknowledgedReviewableErrors) {
        throw new HttpError(
            400,
            `공식 근거 또는 고위험 변경을 먼저 확인해야 합니다: ${blockingErrors[0]}`
        );
    }
    const sourceKey = candidate.diff.sourceKey;
    const promotionId = candidate.linkedPromotionId || (
        candidate.diff.structured === true && typeof sourceKey === 'string'
            ? autoPromotionId(candidate.providerId, sourceKey)
            : `promotion-${randomUUID()}`
    );
    const values = {
        ...offer,
        sourceHash: candidate.sourceHash,
        collectedAt: candidate.discoveredAt,
        reviewedAt: now,
        publishedAt: now,
        updatedAt: now,
        status: 'PUBLISHED' as const,
    };

    db.transaction(tx => {
        const discoveredBrand = candidate.diff.discoveredBrand;
        if (discoveredBrand && typeof discoveredBrand === 'object' &&
            !Array.isArray(discoveredBrand)) {
            const row = discoveredBrand as Record<string, unknown>;
            if (
                typeof row.id === 'string' && row.id &&
                typeof row.name === 'string' && row.name &&
                typeof row.categoryId === 'string' && row.categoryId &&
                typeof row.iconName === 'string' && row.iconName
            ) {
                tx.insert(brands).values({
                    id: row.id,
                    name: row.name,
                    categoryId: row.categoryId,
                    iconName: row.iconName,
                    discoveryVisibility: 'AUTO',
                }).onConflictDoNothing().run();
            }
        }
        tx.insert(promotionOffers)
            .values({ id: promotionId, ...values })
            .onConflictDoUpdate({
                target: promotionOffers.id,
                set: values,
            })
            .run();
        tx.update(promotionCandidates)
            .set({
                parsedOffer: reviewedParsedOffer,
                diff: {
                    ...candidate.diff,
                    ...(acknowledgedReviewableErrors && {
                        auditOverride: {
                            type: 'HIGH_RISK_CHANGE_ACKNOWLEDGED',
                            reviewerId,
                            reviewedAt: now.toISOString(),
                            errors: blockingErrors,
                        },
                    }),
                    ...(sessionApprovalNote && {
                        sessionApproval: { note: sessionApprovalNote, reviewedAt: now.toISOString() },
                    }),
                },
                status: 'APPROVED',
                linkedPromotionId: promotionId,
                reviewerId,
                reviewedAt: now,
            })
            .where(eq(promotionCandidates.id, candidate.id))
            .run();
    });

    const promotion = db.select().from(promotionOffers)
        .where(eq(promotionOffers.id, promotionId))
        .get();
    const reviewedCandidate = db.select().from(promotionCandidates)
        .where(eq(promotionCandidates.id, candidate.id))
        .get();
    if (!promotion || !reviewedCandidate) {
        throw new HttpError(500, '프로모션을 게시하지 못했습니다.');
    }
    return {
        candidate: toCandidate(reviewedCandidate),
        promotion: toPromotionOffer(promotion),
    };
}
