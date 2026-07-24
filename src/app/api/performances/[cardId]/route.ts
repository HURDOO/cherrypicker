import { sql } from 'drizzle-orm';
import { db } from '@/db';
import { userCardPerformances } from '@/db/schema';
import { handleRouteError, HttpError, readJsonObject, requireUser } from '@/lib/api-server';
import { requiredInteger, requiredString } from '@/lib/api-validation';
import { assertVisibleCard } from '@/lib/data-access';
import { toPerformance } from '@/lib/db-mappers';
import { getPreviousMonthInKst } from '@/lib/monthly-performance';

export const runtime = 'nodejs';

interface RouteContext {
    params: Promise<{ cardId: string }>;
}

const PERFORMANCE_MONTH_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;

export async function PUT(request: Request, context: RouteContext) {
    try {
        const user = await requireUser(request);
        const { cardId } = await context.params;
        const input = await readJsonObject(request);
        const amount = requiredInteger(input, 'amount', '전월 실적', 0, 1_000_000_000_000);
        const requestedPerformanceMonth = requiredString(
            input,
            'performanceMonth',
            '실적 기준 월',
            7
        );
        const performanceMonth = getPreviousMonthInKst();

        if (!PERFORMANCE_MONTH_PATTERN.test(requestedPerformanceMonth)) {
            throw new HttpError(400, '실적 기준 월 형식이 올바르지 않습니다.');
        }
        if (requestedPerformanceMonth !== performanceMonth) {
            throw new HttpError(409, '월이 변경되었습니다. 새로고침 후 다시 입력해주세요.');
        }

        assertVisibleCard(cardId, user.id);

        const row = db.insert(userCardPerformances)
            .values({
                userId: user.id,
                cardId,
                performanceMonth,
                amount,
                updatedAt: new Date(),
            })
            .onConflictDoUpdate({
                target: [
                    userCardPerformances.userId,
                    userCardPerformances.cardId,
                    userCardPerformances.performanceMonth,
                ],
                set: {
                    amount,
                    updatedAt: sql`(unixepoch() * 1000)`,
                },
            })
            .returning()
            .get();

        return Response.json(toPerformance(row));
    } catch (error) {
        return handleRouteError(error);
    }
}
