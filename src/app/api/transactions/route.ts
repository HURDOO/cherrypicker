import { and, eq, gte, sql } from 'drizzle-orm';
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
import { cardVisibleToUser } from '@/lib/card-visibility';
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
    getCurrentMonthInKst,
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
        const confirmedConditionIds = Array.isArray(input.confirmedConditionIds)
            ? input.confirmedConditionIds.filter(
                (value): value is string => typeof value === 'string'
            )
            : [];
        const eligibleItemAmount = optionalInteger(
            input,
            'eligibleItemAmount',
            '혜택 대상 상품 금액',
            0,
            amount,
        );

        if (combinationId) {
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
            if (selected.steps.some(step => step.certainty === 'CONDITIONAL')) {
                throw new HttpError(
                    409,
                    '확인하지 않은 혜택 조건이 있습니다. 조건을 확인한 뒤 다시 기록해주세요.'
                );
            }

            assertCanCreateTransaction(user.id);
            const cardSteps = selected.steps.filter(step => step.cardId);
            const cardStep = cardSteps[0];
            const createdAt = new Date();
            const performanceContributionAmount = selected.fundingType === 'CARD' &&
                selected.cardId
                ? Math.max(0, Math.floor(
                    selected.cardChargeAmount ?? cardStep?.amountBefore ?? selected.payableAmount
                ))
                : 0;
            const row = db.transaction(tx => {
                const inserted = tx.insert(transactionHistory)
                    .values({
                        userId: user.id,
                        brandId,
                        cardId: selected.cardId ?? null,
                        ruleId: cardStep?.ruleId ?? null,
                        amount,
                        discountAmount: cardSteps
                            .filter(step => step.certainty === 'CONFIRMED')
                            .reduce((total, step) => total + step.benefitAmount, 0),
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
                if (selected.cardId && performanceContributionAmount > 0) {
                    const performanceMonth = getCurrentMonthInKst(createdAt);
                    tx.insert(userCardPerformances)
                        .values({
                            userId: user.id,
                            cardId: selected.cardId,
                            performanceMonth,
                            amount: performanceContributionAmount,
                            updatedAt: createdAt,
                        })
                        .onConflictDoUpdate({
                            target: [
                                userCardPerformances.userId,
                                userCardPerformances.cardId,
                                userCardPerformances.performanceMonth,
                            ],
                            set: {
                                amount: sql`${userCardPerformances.amount} + ${performanceContributionAmount}`,
                                updatedAt: createdAt,
                            },
                        })
                        .run();
                }
                return inserted;
            });

            return Response.json({
                ...toTransaction(row),
                ...(performanceContributionAmount > 0 && { performanceContributionAmount }),
            }, { status: 201 });
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
                cardVisibleToUser(user.id),
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
            isOnline,
            {
                confirmedConditionIds,
                ...(eligibleItemAmount !== undefined && { eligibleItemAmount }),
            },
        ).find(card => card.id === cardId);

        if (!calculatedCard) {
            throw new HttpError(404, '카드를 찾을 수 없습니다.');
        }
        if (calculatedCard.matchedBenefits.some(
            benefit => benefit.certainty === 'CONDITIONAL'
        )) {
            throw new HttpError(
                409,
                '확인하지 않은 혜택 조건이 있습니다. 조건을 확인한 뒤 다시 기록해주세요.'
            );
        }

        const confirmedBenefits = calculatedCard.matchedBenefits
            .filter(benefit => benefit.certainty === 'CONFIRMED');
        const discountAmount = confirmedBenefits
            .reduce((total, benefit) => total + benefit.discount, 0);
        const conditionalValue = calculatedCard.matchedBenefits
            .filter(benefit => benefit.certainty === 'CONDITIONAL')
            .reduce((total, benefit) => total + benefit.discount, 0);
        let remainingAmount = amount;
        const benefitSteps = calculatedCard.matchedBenefits.map(benefit => {
            const amountBefore = remainingAmount;
            remainingAmount = Math.max(0, remainingAmount - benefit.discount);
            return {
                id: `card:${cardId}:${benefit.rule.id}`,
                layer: 'PAYMENT_METHOD' as const,
                providerName: card.company,
                title: benefit.rule.description,
                certainty: benefit.certainty,
                amountBefore,
                benefitAmount: benefit.discount,
                amountAfter: remainingAmount,
                isImmediate: true,
                cardId,
                ruleId: benefit.rule.id,
                ...(benefit.confirmationId && { confirmationId: benefit.confirmationId }),
                ...(benefit.confirmationId && { requiresConfirmation: true }),
                usesCardLimit: benefit.rule.usesCardLimit !== false,
            };
        });
        const createdAt = new Date();
        const row = db.transaction(tx => {
            const inserted = tx.insert(transactionHistory)
                .values({
                    userId: user.id,
                    brandId,
                    cardId,
                    ruleId: confirmedBenefits[0]?.rule.id ?? null,
                    amount,
                    discountAmount,
                    payableAmount: Math.max(0, amount - discountAmount),
                    confirmedValue: discountAmount,
                    conditionalValue,
                    combinationSnapshot: { steps: benefitSteps },
                    createdAt,
                })
                .returning()
                .get();
            if (benefitSteps.length > 0) {
                tx.insert(transactionBenefits).values(benefitSteps.map(step => ({
                    transactionId: inserted.id,
                    promotionId: null,
                    ruleId: step.ruleId,
                    layer: step.layer,
                    title: step.title,
                    certainty: step.certainty,
                    benefitAmount: step.benefitAmount,
                    isImmediate: step.isImmediate,
                    snapshot: step,
                }))).run();
            }
            tx.insert(userCardPerformances)
                .values({
                    userId: user.id,
                    cardId,
                    performanceMonth: getCurrentMonthInKst(createdAt),
                    amount,
                    updatedAt: createdAt,
                })
                .onConflictDoUpdate({
                    target: [
                        userCardPerformances.userId,
                        userCardPerformances.cardId,
                        userCardPerformances.performanceMonth,
                    ],
                    set: {
                        amount: sql`${userCardPerformances.amount} + ${amount}`,
                        updatedAt: createdAt,
                    },
                })
                .run();
            return inserted;
        });

        return Response.json({
            ...toTransaction(row),
            performanceContributionAmount: amount,
        }, { status: 201 });
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
