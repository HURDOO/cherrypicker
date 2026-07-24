import { and, eq, isNull, max } from 'drizzle-orm';
import { db } from '@/db';
import { brands } from '@/db/schema';
import { handleRouteError, HttpError, readJsonObject, requireUser } from '@/lib/api-server';
import { optionalString, requiredString, stringArray } from '@/lib/api-validation';
import {
    assertCanCreateBrand,
    assertVisibleCategory,
    visibleToUser,
} from '@/lib/data-access';
import { toBrand } from '@/lib/db-mappers';

export const runtime = 'nodejs';

export async function POST(request: Request) {
    try {
        const user = await requireUser(request);
        const input = await readJsonObject(request);
        const categoryId = requiredString(input, 'categoryId', '카테고리 ID');
        assertCanCreateBrand(user.id);
        assertVisibleCategory(categoryId, user.id);

        const last = db.select({ value: max(brands.sortOrder) })
            .from(brands)
            .where(and(
                eq(brands.categoryId, categoryId),
                visibleToUser(brands.userId, user.id)
            ))
            .get();
        const row = db.insert(brands)
            .values({
                id: crypto.randomUUID(),
                userId: user.id,
                name: requiredString(input, 'name', '브랜드 이름'),
                categoryId,
                iconName: optionalString(input, 'iconName', '아이콘 이름') || 'ShoppingBag',
                sortOrder: (last?.value ?? -1) + 1,
            })
            .returning()
            .get();

        return Response.json(toBrand(row), { status: 201 });
    } catch (error) {
        return handleRouteError(error);
    }
}

export async function PATCH(request: Request) {
    try {
        const user = await requireUser(request);
        const input = await readJsonObject(request);
        const categoryId = requiredString(input, 'categoryId', '카테고리 ID');
        const orderedIds = stringArray(input, 'orderedIds', '브랜드 순서');

        if (orderedIds.length === 0) {
            throw new HttpError(400, '저장할 브랜드 순서가 없습니다.');
        }
        assertVisibleCategory(categoryId, user.id);

        const ownedRows = db.select({ id: brands.id })
            .from(brands)
            .where(and(
                eq(brands.userId, user.id),
                eq(brands.categoryId, categoryId)
            ))
            .all();
        const orderedIdSet = new Set(orderedIds);

        if (
            ownedRows.length !== orderedIds.length
            || ownedRows.some(row => !orderedIdSet.has(row.id))
        ) {
            throw new HttpError(400, '이 카테고리의 개인 브랜드 전체 순서만 변경할 수 있습니다.');
        }

        const systemLast = db.select({ value: max(brands.sortOrder) })
            .from(brands)
            .where(and(
                isNull(brands.userId),
                eq(brands.categoryId, categoryId)
            ))
            .get();
        const firstUserSortOrder = (systemLast?.value ?? -1) + 1;

        db.transaction((tx) => {
            orderedIds.forEach((id, index) => {
                tx.update(brands)
                    .set({ sortOrder: firstUserSortOrder + index })
                    .where(and(
                        eq(brands.id, id),
                        eq(brands.userId, user.id),
                        eq(brands.categoryId, categoryId)
                    ))
                    .run();
            });
        });

        return Response.json({ success: true });
    } catch (error) {
        return handleRouteError(error);
    }
}
