import { and, eq, gte } from 'drizzle-orm';
import { db } from '@/db';
import {
    benefitRules,
    brands,
    cards,
    transactionHistory,
    userCardPerformances,
} from '@/db/schema';
import { handleRouteError, HttpError, readJsonObject, requireUser } from '@/lib/api-server';
import { booleanValue, requiredInteger, requiredString } from '@/lib/api-validation';
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

export const runtime = 'nodejs';

export async function POST(request: Request) {
    try {
        const user = await requireUser(request);
        const input = await readJsonObject(request);
        const brandId = requiredString(input, 'brandId', '브랜드 ID');
        const cardId = requiredString(input, 'cardId', '카드 ID');
        const amount = requiredInteger(input, 'amount', '결제 금액', 1, 1_000_000_000_000);
        const isOnline = booleanValue(input, 'isOnline', false);

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
