import { db } from '@/db';
import { cards } from '@/db/schema';
import { handleRouteError, readJsonObject, requireUser } from '@/lib/api-server';
import { limitTableValue, requiredString } from '@/lib/api-validation';
import { toCard } from '@/lib/db-mappers';
import { assertCanCreateCard } from '@/lib/data-access';

export const runtime = 'nodejs';

export async function POST(request: Request) {
    try {
        const user = await requireUser(request);
        const input = await readJsonObject(request);
        assertCanCreateCard(user.id);
        const row = db.insert(cards)
            .values({
                id: crypto.randomUUID(),
                userId: user.id,
                name: requiredString(input, 'name', '카드 이름'),
                company: requiredString(input, 'company', '카드사'),
                color: requiredString(input, 'color', '카드 색상', 300),
                limitTable: limitTableValue(input),
            })
            .returning()
            .get();

        return Response.json(toCard(row), { status: 201 });
    } catch (error) {
        return handleRouteError(error);
    }
}
