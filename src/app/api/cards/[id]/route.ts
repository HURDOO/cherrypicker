import { and, eq } from 'drizzle-orm';
import { db } from '@/db';
import { cards } from '@/db/schema';
import { handleRouteError, HttpError, readJsonObject, requireUser } from '@/lib/api-server';
import { cardNetworkValue, limitTableValue, requiredString } from '@/lib/api-validation';
import { assertOwnedCard } from '@/lib/data-access';
import { toCard } from '@/lib/db-mappers';

export const runtime = 'nodejs';

interface RouteContext {
    params: Promise<{ id: string }>;
}

export async function PATCH(request: Request, context: RouteContext) {
    try {
        const user = await requireUser(request);
        const { id } = await context.params;
        const input = await readJsonObject(request);

        assertOwnedCard(id, user.id);

        const row = db.update(cards)
            .set({
                name: requiredString(input, 'name', '카드 이름'),
                company: requiredString(input, 'company', '카드사'),
                color: requiredString(input, 'color', '카드 색상', 300),
                limitTable: limitTableValue(input),
                network: cardNetworkValue(input) ?? null,
            })
            .where(and(eq(cards.id, id), eq(cards.userId, user.id)))
            .returning()
            .get();

        if (!row) throw new HttpError(404, '카드를 찾을 수 없습니다.');
        return Response.json(toCard(row));
    } catch (error) {
        return handleRouteError(error);
    }
}
