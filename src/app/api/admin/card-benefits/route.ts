import {
    handleRouteError,
    HttpError,
    readJsonObject,
    requireAdmin,
} from '@/lib/api-server';
import {
    CardBenefitIngestionError,
    collectShinhanSolTravelBenefits,
    collectSystemCardBenefits,
    getCardBenefitReviewData,
    reviewCardBenefitCandidate,
    rollbackCardBenefitRevision,
} from '@/lib/card-benefit-ingestion';
import {
    collectAllSystemCardBenefits,
    resolveCardBenefitBatchMaxAiCards,
} from '@/lib/card-benefit-batch';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const routeError = (error: unknown) => handleRouteError(
    error instanceof CardBenefitIngestionError
        ? new HttpError(error.status, error.message)
        : error
);

export async function GET(request: Request) {
    try {
        await requireAdmin(request);
        return Response.json({
            ...getCardBenefitReviewData(),
            batchPolicy: {
                maxAiCards: resolveCardBenefitBatchMaxAiCards(
                    process.env.CARD_BENEFIT_BATCH_MAX_AI_CARDS,
                ),
            },
        });
    } catch (error) {
        return routeError(error);
    }
}

export async function POST(request: Request) {
    try {
        await requireAdmin(request);
        const input = await readJsonObject(request);
        if (input.action === 'collect-shinhan-sol') {
            return Response.json(await collectShinhanSolTravelBenefits(), { status: 201 });
        }
        if (input.action === 'collect-card' && typeof input.cardId === 'string') {
            return Response.json(await collectSystemCardBenefits(input.cardId, {
                forceExtraction: input.forceExtraction === true,
            }), { status: 201 });
        }
        if (input.action === 'collect-all-cards') {
            return Response.json(await collectAllSystemCardBenefits());
        }
        throw new HttpError(400, '지원하지 않는 카드 혜택 수집 작업입니다.');
    } catch (error) {
        return routeError(error);
    }
}

export async function PATCH(request: Request) {
    try {
        const user = await requireAdmin(request);
        const input = await readJsonObject(request);
        if (input.action === 'review') {
            if (typeof input.candidateId !== 'string' ||
                (input.status !== 'APPROVED' && input.status !== 'REJECTED')) {
                throw new HttpError(400, '카드 혜택 검수 요청이 올바르지 않습니다.');
            }
            return Response.json(reviewCardBenefitCandidate(
                input.candidateId,
                input.status,
                user.id,
            ));
        }
        if (input.action === 'rollback') {
            if (typeof input.cardId !== 'string' ||
                typeof input.targetRevision !== 'number' ||
                !Number.isSafeInteger(input.targetRevision) ||
                input.targetRevision < 1) {
                throw new HttpError(400, '카드 혜택 롤백 요청이 올바르지 않습니다.');
            }
            return Response.json(rollbackCardBenefitRevision(
                input.cardId,
                input.targetRevision,
                user.id,
            ));
        }
        throw new HttpError(400, '지원하지 않는 카드 혜택 관리 작업입니다.');
    } catch (error) {
        return routeError(error);
    }
}
