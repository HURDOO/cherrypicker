import { and, eq, isNull, max } from 'drizzle-orm';
import { db } from '@/db';
import { categories } from '@/db/schema';
import { handleRouteError, HttpError, readJsonObject, requireUser } from '@/lib/api-server';
import { requiredString, stringArray } from '@/lib/api-validation';
import { assertCanCreateCategory, visibleToUser } from '@/lib/data-access';
import { toCategory } from '@/lib/db-mappers';

export const runtime = 'nodejs';

export async function POST(request: Request) {
    try {
        const user = await requireUser(request);
        const input = await readJsonObject(request);
        assertCanCreateCategory(user.id);
        const last = db.select({ value: max(categories.sortOrder) })
            .from(categories)
            .where(visibleToUser(categories.userId, user.id))
            .get();
        const row = db.insert(categories)
            .values({
                id: crypto.randomUUID(),
                userId: user.id,
                name: requiredString(input, 'name', '카테고리 이름'),
                sortOrder: (last?.value ?? -1) + 1,
            })
            .returning()
            .get();

        return Response.json(toCategory(row), { status: 201 });
    } catch (error) {
        return handleRouteError(error);
    }
}

export async function PATCH(request: Request) {
    try {
        const user = await requireUser(request);
        const input = await readJsonObject(request);
        const orderedIds = stringArray(input, 'orderedIds', '카테고리 순서');

        if (orderedIds.length === 0) {
            throw new HttpError(400, '저장할 카테고리 순서가 없습니다.');
        }

        const ownedRows = db.select({ id: categories.id })
            .from(categories)
            .where(eq(categories.userId, user.id))
            .all();
        const orderedIdSet = new Set(orderedIds);

        if (
            ownedRows.length !== orderedIds.length
            || ownedRows.some(row => !orderedIdSet.has(row.id))
        ) {
            throw new HttpError(400, '개인 카테고리 전체 순서만 변경할 수 있습니다.');
        }

        const systemLast = db.select({ value: max(categories.sortOrder) })
            .from(categories)
            .where(isNull(categories.userId))
            .get();
        const firstUserSortOrder = (systemLast?.value ?? -1) + 1;

        db.transaction((tx) => {
            orderedIds.forEach((id, index) => {
                tx.update(categories)
                    .set({ sortOrder: firstUserSortOrder + index })
                    .where(and(eq(categories.id, id), eq(categories.userId, user.id)))
                    .run();
            });
        });

        return Response.json({ success: true });
    } catch (error) {
        return handleRouteError(error);
    }
}
