import { asc, desc, eq, isNull, or } from 'drizzle-orm';
import { db } from '@/db';
import {
    benefitRules,
    brands,
    cards,
    categories,
    transactionHistory,
    userCardPerformances,
} from '@/db/schema';
import { handleRouteError, requireUser } from '@/lib/api-server';
import {
    toBrand,
    toCard,
    toCategory,
    toPerformance,
    toRule,
    toTransaction,
} from '@/lib/db-mappers';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
    try {
        const user = await requireUser(request);

        const categoryRows = db.select().from(categories)
            .where(or(isNull(categories.userId), eq(categories.userId, user.id)))
            .orderBy(asc(categories.sortOrder), asc(categories.name))
            .all();
        const brandRows = db.select().from(brands)
            .where(or(isNull(brands.userId), eq(brands.userId, user.id)))
            .orderBy(asc(brands.sortOrder), asc(brands.name))
            .all();
        const cardRows = db.select().from(cards)
            .where(or(isNull(cards.userId), eq(cards.userId, user.id)))
            .orderBy(asc(cards.name))
            .all();
        const ruleRows = db.select().from(benefitRules)
            .where(or(isNull(benefitRules.userId), eq(benefitRules.userId, user.id)))
            .orderBy(asc(benefitRules.cardId), asc(benefitRules.description))
            .all();
        const performanceRows = db.select().from(userCardPerformances)
            .where(eq(userCardPerformances.userId, user.id))
            .orderBy(desc(userCardPerformances.performanceMonth))
            .all();
        const historyRows = db.select().from(transactionHistory)
            .where(eq(transactionHistory.userId, user.id))
            .orderBy(desc(transactionHistory.createdAt))
            .all();

        return Response.json({
            userId: user.id,
            categories: categoryRows.map(toCategory),
            brands: brandRows.map(toBrand),
            cards: cardRows.map(toCard),
            rules: ruleRows.map(toRule),
            performances: performanceRows.map(toPerformance),
            history: historyRows.map(toTransaction),
        });
    } catch (error) {
        return handleRouteError(error);
    }
}
