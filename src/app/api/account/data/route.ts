import { eq } from 'drizzle-orm';
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

export const runtime = 'nodejs';

export async function DELETE(request: Request) {
    try {
        const user = await requireUser(request);

        db.transaction((tx) => {
            tx.delete(transactionHistory)
                .where(eq(transactionHistory.userId, user.id))
                .run();
            tx.delete(userCardPerformances)
                .where(eq(userCardPerformances.userId, user.id))
                .run();
            tx.delete(benefitRules)
                .where(eq(benefitRules.userId, user.id))
                .run();
            tx.delete(cards)
                .where(eq(cards.userId, user.id))
                .run();
            tx.delete(brands)
                .where(eq(brands.userId, user.id))
                .run();
            tx.delete(categories)
                .where(eq(categories.userId, user.id))
                .run();
        });

        return Response.json({ success: true });
    } catch (error) {
        return handleRouteError(error);
    }
}

