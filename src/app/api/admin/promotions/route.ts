import { randomUUID } from 'node:crypto';
import { asc, desc, eq } from 'drizzle-orm';
import { db } from '@/db';
import {
    brands,
    categories,
    merchantRouteVerifications,
    promotionCandidates,
    promotionOffers,
    promotionProviders,
} from '@/db/schema';
import {
    handleRouteError,
    HttpError,
    readJsonObject,
    requireAdmin,
} from '@/lib/api-server';
import { collectPromotionCandidates } from '@/lib/promotion-collector';
import { normalizePromotionDraft } from '@/lib/promotion-input';
import { toPromotionOffer, toPromotionProvider } from '@/lib/db-mappers';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const toCandidate = (row: typeof promotionCandidates.$inferSelect) => ({
    ...row,
    rawContent: row.rawContent.slice(0, 8_000),
    discoveredAt: row.discoveredAt.toISOString(),
    reviewedAt: row.reviewedAt?.toISOString(),
});

type CandidateReviewStatus = 'APPROVED' | 'REJECTED';

function reviewCandidate(
    candidateId: string,
    status: CandidateReviewStatus,
    reviewerId: string,
    parsedOfferOverride?: unknown,
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
    const promotionId = candidate.linkedPromotionId || `promotion-${randomUUID()}`;
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

export async function GET(request: Request) {
    try {
        await requireAdmin(request);
        return Response.json({
            providers: db.select().from(promotionProviders)
                .orderBy(asc(promotionProviders.sortOrder))
                .all()
                .map(toPromotionProvider),
            promotions: db.select().from(promotionOffers)
                .orderBy(desc(promotionOffers.updatedAt))
                .all()
                .map(toPromotionOffer),
            candidates: db.select().from(promotionCandidates)
                .orderBy(desc(promotionCandidates.discoveredAt))
                .all()
                .map(toCandidate),
            brands: db.select({ id: brands.id, name: brands.name })
                .from(brands)
                .orderBy(asc(brands.name))
                .all(),
            categories: db.select({ id: categories.id, name: categories.name })
                .from(categories)
                .orderBy(asc(categories.name))
                .all(),
            routeVerifications: db.select().from(merchantRouteVerifications)
                .orderBy(desc(merchantRouteVerifications.verifiedAt))
                .all()
                .map(row => ({
                    ...row,
                    verifiedAt: row.verifiedAt.toISOString(),
                })),
        });
    } catch (error) {
        return handleRouteError(error);
    }
}

export async function POST(request: Request) {
    try {
        await requireAdmin(request);
        const input = await readJsonObject(request);
        const action = input.action;

        if (action === 'collect') {
            const results = await collectPromotionCandidates();
            return Response.json({ results });
        }

        if (action === 'manual') {
            const offer = normalizePromotionDraft(input.offer);
            const sourceHash = offer.sourceHash || randomUUID().replaceAll('-', '');
            const row = db.insert(promotionCandidates).values({
                id: randomUUID(),
                providerId: offer.providerId,
                sourceUrl: offer.sourceUrl,
                sourceHash,
                sourceTitle: offer.title,
                rawContent: typeof input.rawContent === 'string'
                    ? input.rawContent.slice(0, 120_000)
                    : '관리자가 직접 등록한 프로모션 후보',
                parsedOffer: input.offer as Record<string, unknown>,
                diff: { manual: true },
                status: 'PENDING',
                discoveredAt: new Date(),
            }).returning().get();
            return Response.json(toCandidate(row), { status: 201 });
        }

        if (action === 'verification') {
            const row = input.verification;
            if (!row || typeof row !== 'object' || Array.isArray(row)) {
                throw new HttpError(400, '결제 경로 검증 형식이 올바르지 않습니다.');
            }
            const value = row as Record<string, unknown>;
            if (
                typeof value.brandId !== 'string' ||
                typeof value.channel !== 'string' ||
                typeof value.evidenceUrl !== 'string' ||
                !['ALL', 'ONLINE', 'OFFLINE', 'OFFICIAL_SITE'].includes(value.channel) ||
                !['CONFIRMED', 'CONDITIONAL', 'ESTIMATED'].includes(String(value.certainty))
            ) {
                throw new HttpError(400, '결제 경로 검증 필수값을 확인해주세요.');
            }
            const inserted = db.insert(merchantRouteVerifications).values({
                brandId: value.brandId,
                payProviderId: typeof value.payProviderId === 'string' && value.payProviderId
                    ? value.payProviderId
                    : null,
                cardCompany: typeof value.cardCompany === 'string' && value.cardCompany
                    ? value.cardCompany.slice(0, 200)
                    : null,
                channel: value.channel as 'ALL' | 'ONLINE' | 'OFFLINE' | 'OFFICIAL_SITE',
                cardBenefitEligible: value.cardBenefitEligible === true,
                certainty: value.certainty as 'CONFIRMED' | 'CONDITIONAL' | 'ESTIMATED',
                evidenceUrl: value.evidenceUrl.slice(0, 2000),
                verifiedAt: new Date(),
            }).returning().get();
            return Response.json({
                ...inserted,
                verifiedAt: inserted.verifiedAt.toISOString(),
            }, { status: 201 });
        }

        throw new HttpError(400, '지원하지 않는 관리자 작업입니다.');
    } catch (error) {
        return handleRouteError(error);
    }
}

export async function PATCH(request: Request) {
    try {
        const user = await requireAdmin(request);
        const input = await readJsonObject(request);

        if (Array.isArray(input.candidateIds)) {
            const candidateIds = [...new Set(input.candidateIds)]
                .filter((id): id is string => typeof id === 'string' && Boolean(id));
            if (candidateIds.length === 0 || candidateIds.length > 100) {
                throw new HttpError(400, '일괄 검수는 1건 이상 100건 이하로 선택해주세요.');
            }
            if (input.status !== 'APPROVED' && input.status !== 'REJECTED') {
                throw new HttpError(400, '검수 상태가 올바르지 않습니다.');
            }

            const reviewed: string[] = [];
            const failed: Array<{ id: string; message: string }> = [];
            candidateIds.forEach(candidateId => {
                try {
                    reviewCandidate(candidateId, input.status as CandidateReviewStatus, user.id);
                    reviewed.push(candidateId);
                } catch (error) {
                    failed.push({
                        id: candidateId,
                        message: error instanceof Error ? error.message : '검수 실패',
                    });
                }
            });
            return Response.json({ reviewed, failed });
        }

        if (typeof input.candidateId === 'string') {
            if (input.status === 'REJECTED' || input.status === 'APPROVED') {
                return Response.json(reviewCandidate(
                    input.candidateId,
                    input.status,
                    user.id,
                    input.parsedOffer,
                ));
            }
        }

        if (typeof input.promotionId === 'string') {
            const status = input.status;
            if (!['PUBLISHED', 'PAUSED', 'EXPIRED'].includes(String(status))) {
                throw new HttpError(400, '프로모션 상태가 올바르지 않습니다.');
            }
            const existing = db.select().from(promotionOffers)
                .where(eq(promotionOffers.id, input.promotionId))
                .get();
            if (!existing) throw new HttpError(404, '프로모션을 찾을 수 없습니다.');
            if (
                status === 'PUBLISHED' &&
                (!existing.condition.applicabilityScope ||
                    existing.condition.applicabilityScope === 'UNKNOWN')
            ) {
                throw new HttpError(400, '적용 범위가 확정되지 않은 기존 혜택은 새 수집 후보에서 검수해주세요.');
            }
            const row = db.update(promotionOffers)
                .set({
                    status: status as 'PUBLISHED' | 'PAUSED' | 'EXPIRED',
                    updatedAt: new Date(),
                })
                .where(eq(promotionOffers.id, input.promotionId))
                .returning()
                .get();
            if (!row) throw new HttpError(404, '프로모션을 찾을 수 없습니다.');
            return Response.json(toPromotionOffer(row));
        }

        throw new HttpError(400, '지원하지 않는 관리자 작업입니다.');
    } catch (error) {
        return handleRouteError(error);
    }
}
