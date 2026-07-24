import { and, eq, gte } from 'drizzle-orm';
import { db } from '@/db';
import {
    benefitRules,
    brands,
    cards,
    transactionBenefits,
    transactionHistory,
    userCardPerformances,
} from '@/db/schema';
import { handleRouteError, HttpError, readJsonObject, requireUser } from '@/lib/api-server';
import {
    booleanValue,
    optionalInteger,
    optionalString,
    requiredInteger,
    requiredString,
} from '@/lib/api-validation';
import {
    assertCanCreateTransaction,
    visibleToUser,
} from '@/lib/data-access';
import {
    toBrand,
    toCard,
    toPerformance,
    toRule,
    toTransaction,
} from '@/lib/db-mappers';
import {
    getPreviousMonthInKst,
    getStartOfCurrentYearInKst,
} from '@/lib/monthly-performance';
import { calculateBestCards } from '@/utils/calculation';
import { calculateRecommendationForUser } from '@/lib/recommendation-server';

export const runtime = 'nodejs';

export async function POST(request: Request) {
    try {
        const user = await requireUser(request);
        const input = await readJsonObject(request);
        const brandId = requiredString(input, 'brandId', '브랜드 ID');
        const amount = requiredInteger(input, 'amount', '결제 금액', 1, 1_000_000_000_000);
        const isOnline = booleanValue(input, 'isOnline', false);
        const combinationId = optionalString(input, 'combinationId', '추천 조합 ID', 100);

        if (combinationId) {
            const eligibleItemAmount = optionalInteger(
                input,
                'eligibleItemAmount',
                '혜택 대상 상품 금액',
                0,
                amount,
            );
            const confirmedConditionIds = Array.isArray(input.confirmedConditionIds)
                ? input.confirmedConditionIds.filter(
                    (value): value is string => typeof value === 'string'
                )
                : [];
            const recommendation = calculateRecommendationForUser(user.id, {
                brandId,
                amount,
                ...(eligibleItemAmount !== undefined && { eligibleItemAmount }),
                isOnline,
                confirmedConditionIds,
            });
            const selected = recommendation.combinations.find(
                combination => combination.id === combinationId
            );
            if (!selected) {
                throw new HttpError(
                    409,
                    '혜택 조건이 변경되었습니다. 추천 결과를 새로 확인해주세요.'
                );
            }

            assertCanCreateTransaction(user.id);
            const cardStep = selected.steps.find(step => step.cardId);
            const createdAt = new Date();
            const row = db.transaction(tx => {
                const inserted = tx.insert(transactionHistory)
                    .values({
                        userId: user.id,
                        brandId,
                        cardId: selected.cardId ?? null,
                        ruleId: cardStep?.ruleId ?? null,
                        amount,
                        discountAmount: cardStep?.certainty === 'CONFIRMED'
                            ? cardStep.benefitAmount
                            : 0,
                        eligibleItemAmount: eligibleItemAmount ?? null,
                        payProviderId: selected.payProviderId ?? null,
                        fundingType: selected.fundingType,
                        combinationId: selected.id,
                        confirmedValue: selected.confirmedValue,
                        conditionalValue: selected.conditionalValue,
                        estimatedValue: selected.estimatedValue,
                        payableAmount: selected.payableAmount,
                        laterReward: selected.laterReward,
                        combinationSnapshot: selected as unknown as Record<string, unknown>,
                        createdAt,
                    })
                    .returning()
                    .get();
                if (selected.steps.length > 0) {
                    tx.insert(transactionBenefits)
                        .values(selected.steps.map(step => ({
                            transactionId: inserted.id,
                            promotionId: step.promotionId ?? null,
                            ruleId: step.ruleId ?? null,
                            layer: step.layer,
                            title: step.title,
                            certainty: step.certainty,
                            benefitAmount: step.benefitAmount,
                            isImmediate: step.isImmediate,
                            snapshot: step as unknown as Record<string, unknown>,
                        })))
                        .run();
                }
                return inserted;
            });

            return Response.json(toTransaction(row), { status: 201 });
        }

        const cardId = requiredString(input, 'cardId', '카드 ID');

        assertCanCreateTransaction(user.id);
        const brand = db.select().from(brands)
            .where(and(
                eq(brands.id, brandId),
                visibleToUser(brands.userId, user.id)
            ))
            .get();
        const card = db.select().from(cards)
            .where(and(
                eq(cards.id, cardId),
                visibleToUser(cards.userId, user.id)
            ))
            .get();
        const ruleRows = db.select().from(benefitRules)
            .where(and(
                eq(benefitRules.cardId, cardId),
                visibleToUser(benefitRules.userId, user.id)
            ))
            .all();
        const performanceRows = db.select().from(userCardPerformances)
            .where(and(
                eq(userCardPerformances.userId, user.id),
                eq(userCardPerformances.cardId, cardId),
                eq(userCardPerformances.performanceMonth, getPreviousMonthInKst())
            ))
            .all();
        const historyRows = db.select().from(transactionHistory)
            .where(and(
                eq(transactionHistory.userId, user.id),
                eq(transactionHistory.cardId, cardId),
                gte(transactionHistory.createdAt, getStartOfCurrentYearInKst())
            ))
            .all();

        if (!brand) throw new HttpError(404, '브랜드를 찾을 수 없습니다.');
        if (!card) throw new HttpError(404, '카드를 찾을 수 없습니다.');

        const calculatedCard = calculateBestCards(
            amount,
            toBrand(brand),
            [toCard(card)],
            ruleRows.map(toRule),
            historyRows.map(toTransaction),
            performanceRows.map(toPerformance),
            isOnline
        ).find(card => card.id === cardId);

        if (!calculatedCard) {
            throw new HttpError(404, '카드를 찾을 수 없습니다.');
        }

        const discountAmount = calculatedCard.calculatedDiscount;
        const ruleId = discountAmount > 0 ? calculatedCard.matchedRule?.id : undefined;

        const row = db.insert(transactionHistory)
            .values({
                userId: user.id,
                brandId,
                cardId,
                ruleId: ruleId ?? null,
                amount,
                discountAmount,
                payableAmount: Math.max(0, amount - discountAmount),
                confirmedValue: discountAmount,
                combinationSnapshot: {},
                createdAt: new Date(),
            })
            .returning()
            .get();

        return Response.json(toTransaction(row), { status: 201 });
    } catch (error) {
        return handleRouteError(error);
    }
}

export async function DELETE(request: Request) {
    try {
        const user = await requireUser(request);
        db.delete(transactionHistory)
            .where(eq(transactionHistory.userId, user.id))
            .run();

        return Response.json({ success: true });
    } catch (error) {
        return handleRouteError(error);
    }
}
